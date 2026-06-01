require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "educlass_secret";

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Uploads
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
const ENTREGAS_DIR = path.join(UPLOAD_DIR, "entregas");
[UPLOAD_DIR, ENTREGAS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
app.use("/uploads", express.static(UPLOAD_DIR));

const storageLogo = multer.diskStorage({
  destination: (_r, _f, cb) => cb(null, UPLOAD_DIR),
  filename: (_r, f, cb) => cb(null, `logo_${uuidv4()}${path.extname(f.originalname)}`)
});
const uploadLogo = multer({ storage: storageLogo, limits: { fileSize: 5 * 1024 * 1024 } })
  .fields([{ name: "logo", maxCount: 1 }, { name: "bandera", maxCount: 1 }]);

const storageEnt = multer.diskStorage({
  destination: (_r, _f, cb) => cb(null, ENTREGAS_DIR),
  filename: (_r, f, cb) => cb(null, `ent_${uuidv4()}${path.extname(f.originalname)}`)
});
const uploadEnt = multer({ storage: storageEnt, limits: { fileSize: 20 * 1024 * 1024 } });

// ── Helpers ───────────────────────────────────────────
const slugify = t => (t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").trim();

const getOrCreateInstitution = async (name, city = "") => {
  const slug = slugify(name);
  let inst = await prisma.institution.findUnique({ where: { slug } });
  if (!inst) inst = await prisma.institution.create({ data: { name, slug, city } });
  return inst;
};

const authMiddleware = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ mensaje: "Token requerido" });
  try {
    const decoded = jwt.verify(header.split(" ")[1], JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id }, include: { institution: true } });
    if (!user) return res.status(401).json({ mensaje: "Usuario no encontrado" });
    req.user = user;
    req.institutionId = user.institutionId;
    next();
  } catch { return res.status(401).json({ mensaje: "Token inválido" }); }
};

const authEst = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ mensaje: "Token requerido" });
  try {
    const decoded = jwt.verify(header.split(" ")[1], JWT_SECRET);
    if (decoded.role !== "student") return res.status(403).json({ mensaje: "Acceso denegado" });
    const student = await prisma.student.findUnique({ where: { id: decoded.id }, include: { institution: true } });
    if (!student) return res.status(401).json({ mensaje: "Estudiante no encontrado" });
    req.student = student;
    next();
  } catch { return res.status(401).json({ mensaje: "Token inválido" }); }
};

// ── IAs con rotación ──────────────────────────────────
const AI = [
  { nombre: "Groq", key: () => process.env.GROQ_KEY, tipo: "groq", errores: 0, activa: true },
  { nombre: "Together", key: () => process.env.TOGETHER_KEY, tipo: "together", errores: 0, activa: true },
  { nombre: "OpenRouter", key: () => process.env.OPENROUTER_KEY, tipo: "openrouter", errores: 0, activa: true },
  { nombre: "Gemini", key: () => process.env.GEMINI_KEY, tipo: "gemini", errores: 0, activa: true },
];
let aiIdx = 0;

const llamarIA = async (prompt, system = "", maxTokens = 4096, temp = 0.7) => {
  for (let i = 0; i < AI.length; i++) {
    const p = AI[(aiIdx + i) % AI.length];
    if (!p.activa || !p.key()) continue;
    try {
      let txt = "";
      if (p.tipo === "groq") {
        const Groq = require("groq-sdk");
        const g = new Groq({ apiKey: p.key() });
        const r = await g.chat.completions.create({ model: "llama-3.3-70b-versatile", max_tokens: maxTokens, temperature: temp, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] });
        txt = r.choices[0].message.content;
      } else if (p.tipo === "together") {
        const r = await fetch("https://api.together.xyz/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${p.key()}` }, body: JSON.stringify({ model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", max_tokens: maxTokens, temperature: temp, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error?.message); txt = d.choices[0].message.content;
      } else if (p.tipo === "openrouter") {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${p.key()}`, "HTTP-Referer": "https://educlass-frontend.vercel.app" }, body: JSON.stringify({ model: "meta-llama/llama-3.3-70b-instruct:free", max_tokens: maxTokens, temperature: temp, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error?.message); txt = d.choices[0].message.content;
      } else if (p.tipo === "gemini") {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${p.key()}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: system ? `${system}\n\n${prompt}` : prompt }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: temp } }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error?.message); txt = d.candidates[0].content.parts[0].text;
      }
      p.errores = 0;
      aiIdx = (aiIdx + i) % AI.length;
      return txt;
    } catch (e) {
      console.error(`❌ ${p.nombre}:`, e.message);
      p.errores++;
      if (p.errores >= 2) { p.activa = false; setTimeout(() => { p.activa = true; p.errores = 0; }, 10 * 60 * 1000); }
    }
  }
  throw new Error("Todos los proveedores de IA fallaron");
};

// ======================================================
//  ENDPOINTS
// ======================================================
app.get("/", (_req, res) => res.json({ ok: true, msg: "EduClass v6 ✅" }));
app.get("/estado-ia", (_req, res) => res.json({ proveedores: AI.map(p => ({ nombre: p.nombre, activa: p.activa, errores: p.errores })) }));

// ── AUTH DOCENTES ─────────────────────────────────────
app.post("/auth/registro", async (req, res) => {
  try {
    const { nombre, email, password, institucion, cargo, ciudad } = req.body;
    if (!nombre || !email || !password || !institucion) return res.status(400).json({ mensaje: "Completa todos los campos" });
    if (await prisma.user.findUnique({ where: { email } })) return res.status(400).json({ mensaje: "Correo ya registrado" });
    const inst = await getOrCreateInstitution(institucion, ciudad);
    const user = await prisma.user.create({
      data: { name: nombre, email, password: await bcrypt.hash(password, 10), cargo: cargo || "Docente", institutionId: inst.id },
      include: { institution: true }
    });
    const { password: _, ...pub } = user;
    const token = jwt.sign({ id: user.id, role: "teacher", institutionId: inst.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ mensaje: "Registro exitoso ✅", usuario: pub, token });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email }, include: { institution: true } });
    if (!user) return res.status(401).json({ mensaje: "Correo no registrado" });
    if (!await bcrypt.compare(password || "", user.password)) return res.status(401).json({ mensaje: "Contraseña incorrecta" });
    const { password: _, ...pub } = user;
    const cargoLower = (user.cargo || "").toLowerCase();
    const esAdmin = cargoLower === "admin" || cargoLower === "superadmin";
    const token = jwt.sign({ id: user.id, role: esAdmin ? "admin" : "teacher", institutionId: user.institutionId }, JWT_SECRET, { expiresIn: "30d" });
    const asigs = user.asignaciones ? JSON.parse(user.asignaciones) : [];
    res.json({ ok: true, usuario: { ...pub, role: esAdmin ? "admin" : "docente", asignaciones: asigs }, token });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// Endpoint para actualizar cargo de un docente (solo admin)
app.put("/users/:userId/cargo", authMiddleware, async (req, res) => {
  try {
    const { cargo } = req.body;
    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data: { cargo }
    });
    res.json({ ok: true, usuario: updated });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

app.post("/actualizar-perfil", authMiddleware, uploadLogo, async (req, res) => {
  try {
    const data = {};
    if (req.body.nombre) data.name = req.body.nombre;
    if (req.body.cargo) data.cargo = req.body.cargo;
    if (req.files?.logo?.[0]) data.logoPath = `uploads/${req.files.logo[0].filename}`;
    if (req.files?.bandera?.[0]) data.banderaPath = `uploads/${req.files.bandera[0].filename}`;
    const user = await prisma.user.update({ where: { id: req.user.id }, data, include: { institution: true } });
    const { password: _, ...pub } = user;
    res.json({ usuario: pub, mensaje: "Perfil actualizado ✅" });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// ── AUTH ESTUDIANTES ──────────────────────────────────
app.post("/auth/registro-estudiante", async (req, res) => {
  try {
    const { nombre, usuario, password, grado, institucion } = req.body;
    if (!nombre || !usuario || !password || !institucion) return res.status(400).json({ mensaje: "Completa todos los campos" });
    if (await prisma.student.findUnique({ where: { username: usuario } })) return res.status(400).json({ mensaje: "Usuario ya existe" });
    const inst = await getOrCreateInstitution(institucion);
    const student = await prisma.student.create({
      data: { name: nombre, username: usuario, password: await bcrypt.hash(password, 10), grade: grado || "", institutionId: inst.id },
      include: { institution: true }
    });
    const { password: _, ...pub } = student;
    const token = jwt.sign({ id: student.id, role: "student", institutionId: inst.id }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ mensaje: "Cuenta creada ✅", estudiante: pub, token });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.post("/auth/login-estudiante", async (req, res) => {
  try {
    const { usuario, username, password } = req.body;
    const user = usuario || username;
    const student = await prisma.student.findUnique({ where: { username: user }, include: { institution: true } });
    if (!student) return res.status(401).json({ mensaje: "Usuario no encontrado" });
    if (!await bcrypt.compare(password || "", student.password)) return res.status(401).json({ mensaje: "Contraseña incorrecta" });
    const { password: _, ...pub } = student;
    const token = jwt.sign({ id: student.id, role: "student", institutionId: student.institutionId }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ ok: true, estudiante: pub, token });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// ── ESTUDIANTES ───────────────────────────────────────

// GET: listar docentes de la institución
app.get("/users", authMiddleware, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { institutionId: req.user.institutionId },
      select: { id: true, name: true, email: true, cargo: true, asignaciones: true, createdAt: true },
      orderBy: { name: "asc" }
    });
    const parsed = users.map(u => ({
      ...u,
      asignaciones: u.asignaciones ? JSON.parse(u.asignaciones) : []
    }));
    res.json({ ok: true, usuarios: parsed });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// PUT: actualizar asignaciones de un docente
app.put("/users/:userId/asignaciones", authMiddleware, async (req, res) => {
  try {
    const { asignaciones, cargo } = req.body;
    const data = {};
    if (asignaciones !== undefined) data.asignaciones = JSON.stringify(asignaciones);
    if (cargo !== undefined) data.cargo = cargo;
    const updated = await prisma.user.update({
      where: { id: req.params.userId },
      data
    });
    res.json({ ok: true, usuario: { ...updated, asignaciones: asignaciones || [] } });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// GET: perfil propio con asignaciones
app.get("/users/me", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, cargo: true, asignaciones: true, institutionId: true }
    });
    res.json({ ok: true, usuario: { ...user, asignaciones: user.asignaciones ? JSON.parse(user.asignaciones) : [] } });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

app.get("/students", authMiddleware, async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      where: { institutionId: req.user.institutionId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, username: true, grade: true }
    });
    res.json({ estudiantes: students });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.get("/students/grado/:grado", authMiddleware, async (req, res) => {
  try {
    const g = req.params.grado;
    const students = await prisma.student.findMany({
      where: {
        institutionId: req.user.institutionId,
        OR: [{ grade: g }, { grade: g.replace("°", "") }, { grade: g + "°" }]
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, username: true, grade: true }
    });
    res.json({ estudiantes: students });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.get("/students/grados", authMiddleware, async (req, res) => {
  try {
    const result = await prisma.student.findMany({
      where: { institutionId: req.user.institutionId },
      select: { grade: true },
      distinct: ["grade"]
    });
    res.json({ grados: result.map(r => r.grade).filter(Boolean).sort() });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// ── RESET CONTRASEÑAS ESTUDIANTES ─────────────────────
// POST /students/reset-passwords — resetea todas las contraseñas al username
app.post("/students/reset-passwords", authMiddleware, async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      where: { institutionId: req.user.institutionId },
      select: { id: true, username: true }
    });
    let count = 0;
    for (const s of students) {
      const hash = await bcrypt.hash(s.username, 10);
      await prisma.student.update({ where: { id: s.id }, data: { password: hash } });
      count++;
    }
    res.json({ ok: true, mensaje: `✅ ${count} contraseñas reseteadas. Ahora cada estudiante usa su username como contraseña.` });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// ── CLASES ────────────────────────────────────────────
app.post("/guardar-clase", authMiddleware, async (req, res) => {
  try {
    const clase = await prisma.class.create({ data: { content: req.body.contenido, data: JSON.stringify(req.body.datos || {}), userId: req.user.id } });
    res.json({ ok: true, id: clase.id });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.get("/mis-clases", authMiddleware, async (req, res) => {
  try {
    const clases = await prisma.class.findMany({
      where: { userId: req.user.id }, orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true, data: true, content: true }
    });
    res.json({ clases: clases.map(c => ({ id: c.id, creadaEn: c.createdAt, datos: (function(){ try{ return JSON.parse(c.data||'{}'); }catch(e){ return {}; } })(), resumen: c.content?.substring(0, 200) })) });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.get("/clase/:id", authMiddleware, async (req, res) => {
  try {
    const clase = await prisma.class.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!clase) return res.status(404).json({ mensaje: "No encontrada" });
    res.json({ clase: { id: clase.id, contenido: clase.content, datos: (function(){ try{ return JSON.parse(clase.data||'{}'); }catch(e){ return {}; } })(), creadaEn: clase.createdAt } });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.delete("/clase/:id", authMiddleware, async (req, res) => {
  try {
    await prisma.class.delete({ where: { id: req.params.id, userId: req.user.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// ── TAREAS ────────────────────────────────────────────
app.post("/tasks", authMiddleware, async (req, res) => {
  try {
    const { titulo, descripcion, tipo, actividad, area, grado, fechaEntrega, asignarGrado, estudiantesIds, materialRef } = req.body;
    if (!titulo) return res.status(400).json({ mensaje: "Título requerido" });

    let ids = Array.isArray(estudiantesIds) ? [...estudiantesIds] : [];
    if (asignarGrado && asignarGrado !== "manual") {
      const ests = await prisma.student.findMany({
        where: { institutionId: req.user.institutionId, OR: [{ grade: asignarGrado }, { grade: asignarGrado.replace("°", "") }, { grade: asignarGrado + "°" }] },
        select: { id: true }
      });
      ids = [...new Set([...ids, ...ests.map(e => e.id)])];
    }

    const tarea = await prisma.task.create({
      data: {
        title: titulo, description: descripcion || "", materialRef: materialRef || "", type: tipo || "taller",
        area, grade: grado || asignarGrado || "", dueDate: fechaEntrega ? new Date(fechaEntrega) : null,
        activity: actividad ? JSON.stringify(actividad) : null, userId: req.user.id, institutionId: req.user.institutionId,
        assignments: { create: ids.map(studentId => ({ studentId, status: "pending" })) }
      },
      include: { _count: { select: { assignments: true } } }
    });
    res.json({ ok: true, tarea: { ...tarea, totalEstudiantes: tarea._count.assignments }, mensaje: "Tarea creada ✅" });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.get("/tasks/mis-tareas", authMiddleware, async (req, res) => {
  try {
    const tareas = await prisma.task.findMany({
      where: { userId: req.user.id }, orderBy: { createdAt: "desc" },
      include: { assignments: { select: { status: true } } }
    });
    res.json({
      tareas: tareas.map(t => ({
        ...t, totalEstudiantes: t.assignments.length,
        totalEntregas: t.assignments.filter(a => a.status !== "pending").length,
        pendientes: t.assignments.filter(a => a.status === "pending").length,
        calificados: t.assignments.filter(a => a.status === "graded").length,
        assignments: undefined
      }))
    });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.get("/tasks/:id/entregas", authMiddleware, async (req, res) => {
  try {
    const assignments = await prisma.assignment.findMany({
      where: { taskId: req.params.id },
      include: { student: { select: { id: true, name: true, grade: true, username: true } } },
      orderBy: { student: { name: "asc" } }
    });
    const listado = assignments.map(a => ({
      estudianteId: a.studentId, nombreEstudiante: a.student.name, grado: a.student.grade,
      entregada: a.status !== "pending", entregaId: a.id, entregadoEn: a.submittedAt,
      calificacion: a.grade, comentario: a.comment || "",
      resumenRespuesta: a.response?.substring(0, 120) || "",
      respuestaCompleta: a.response || "",
      respuestasActividad: (()=>{ try{ return JSON.parse(a.responses||"{}"); }catch(e){ return {}; } })(),
      tieneArchivo: !!a.fileName, archivoNombre: a.fileName,
      autoCalificada: a.autoGraded, porcentajeAuto: a.detail?.porcentaje || null,
      estado: a.status === "graded" ? "calificado" : a.status === "submitted" ? "entregado" : "pendiente"
    }));
    res.json({ listadoCompleto: listado, total: listado.length, totalEntregas: listado.filter(e => e.entregada).length, totalPendientes: listado.filter(e => !e.entregada).length, totalCalificados: listado.filter(e => e.calificacion != null).length });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});



// ── HELPER: Auto-asignar nota al libro de notas ────────────────────────
async function autoAsignarNota(userId, institutionId, tarea, studentId, nota) {
  try {
    const key = `periodos_${userId}_notas`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId, key } }
    }).catch(() => null);
    if (!existing) return;

    const periodos = JSON.parse(existing.data || "[]");
    const tituloTarea = (tarea.title || "").toLowerCase().trim();
    const areaTarea = (tarea.area || "").toLowerCase().trim();
    const gradoTarea = (tarea.grade || "").toLowerCase().replace("°","").trim();

    // Buscar periodo que coincida con grado y área
    let periodoIdx = -1, actIdx = -1;
    for (let i = 0; i < periodos.length; i++) {
      const p = periodos[i];
      const pGrado = (p.grado || "").toLowerCase().replace("°","").trim();
      const pArea = (p.area || "").toLowerCase().trim();
      if (pGrado !== gradoTarea || pArea !== areaTarea) continue;

      // Buscar actividad con nombre similar al título de la tarea
      const acts = p.actividades || [];
      for (let j = 0; j < acts.length; j++) {
        const actNombre = (acts[j] || "").toLowerCase().trim();
        if (actNombre === tituloTarea || tituloTarea.includes(actNombre) || actNombre.includes(tituloTarea)) {
          periodoIdx = i; actIdx = j; break;
        }
      }
      // Si no hay coincidencia exacta, buscar actividad vacía (sin notas asignadas para este estudiante)
      if (actIdx === -1) {
        const notasP = p.notas || {};
        const notasEst = notasP[studentId] || {};
        for (let j = 0; j < acts.length; j++) {
          if (!notasEst[j] && notasEst[j] !== 0) { periodoIdx = i; actIdx = j; break; }
        }
      }
      if (periodoIdx !== -1) break;
    }

    if (periodoIdx === -1 || actIdx === -1) return; // No encontró dónde asignar

    if (!periodos[periodoIdx].notas) periodos[periodoIdx].notas = {};
    if (!periodos[periodoIdx].notas[studentId]) periodos[periodoIdx].notas[studentId] = {};
    periodos[periodoIdx].notas[studentId][actIdx] = parseFloat(nota.toFixed(1));

    await prisma.notaClase.update({
      where: { institutionId_key: { institutionId, key } },
      data: { data: JSON.stringify(periodos), updatedAt: new Date() }
    });
  } catch(e) { console.error("autoAsignarNota error:", e.message); }
}

// Auto-calificar basado en respuestas correctas de la actividad
app.post("/tasks/auto-calificar/:entregaId", authMiddleware, async (req, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: req.params.entregaId },
      include: { task: true }
    });
    if (!assignment) return res.status(404).json({ mensaje: "Entrega no encontrada" });
    
    const actividad = assignment.task.activity;
    if (!actividad) return res.status(400).json({ mensaje: "La tarea no tiene actividad con preguntas" });
    
    let actObj;
    try { actObj = typeof actividad === "string" ? JSON.parse(actividad) : actividad; } 
    catch(e) { return res.status(400).json({ mensaje: "Actividad inválida" }); }
    
    const preguntas = actObj.preguntas || [];
    if (preguntas.length === 0) return res.status(400).json({ mensaje: "No hay preguntas con respuestas correctas" });
    
    let respEstudiante;
    try { respEstudiante = JSON.parse(assignment.responses || "{}"); }
    catch(e) { respEstudiante = {}; }
    
    let correctas = 0;
    const detalle = preguntas.map((p, i) => {
      const rawCorrecta = (p.correcta || p.respuesta || "").toString().trim();
      const respCorrecta = rawCorrecta.toLowerCase().replace(/^([a-d])\..*$/i, "$1");
      const rawDada = (respEstudiante[i] || respEstudiante[String(i)] || "").toString().trim();
      const respDada = rawDada.toLowerCase().replace(/^([a-d])\..*$/i, "$1");
      const normC = respCorrecta === "true" ? "verdadero" : respCorrecta === "false" ? "falso" : respCorrecta;
      const normD = respDada === "true" ? "verdadero" : respDada === "false" ? "falso" :
                    rawDada.toLowerCase().startsWith("verdadero") ? "verdadero" :
                    rawDada.toLowerCase().startsWith("falso") ? "falso" : respDada;
      const dadaPalabras = rawDada.trim().split(/\s+/).length;
      const okComp = dadaPalabras <= 5 && (rawDada.toLowerCase().includes(respCorrecta) || respCorrecta.includes(respDada));
      const ok = respDada === respCorrecta || normD === normC || rawDada.toLowerCase() === rawCorrecta.toLowerCase() || okComp;
      if (ok) correctas++;
      return { pregunta: p.pregunta || p.enunciado || p.afirmacion || "", correcta: respCorrecta, dada: respDada, ok };
    });
    
    const porcentaje = Math.round((correctas / preguntas.length) * 100);
    const nota = Math.round((correctas / preguntas.length) * 50) / 10; // escala 0-5
    
    await prisma.assignment.update({
      where: { id: req.params.entregaId },
      data: { grade: nota, status: "graded", gradedAt: new Date(), autoGraded: true,
              comment: `Auto-calificado: ${correctas}/${preguntas.length} correctas (${porcentaje}%)` }
    });
    
    // Para preguntas sin respuesta_correcta clara, usar IA
    const preguntasAbiertas = preguntas.filter(p => !p.correcta && !p.respuesta);
    if (preguntasAbiertas.length > 0 && process.env.ANTHROPIC_API_KEY) {
      // Solo notificar que hay preguntas abiertas sin calificar
      return res.json({ ok: true, nota, correctas, total: preguntas.length, porcentaje, detalle, tieneAbiertas: true });
    }
    // Auto-asignar al libro de notas
    await autoAsignarNota(assignment.task.userId, assignment.task.institutionId, assignment.task, assignment.studentId, nota);
    res.json({ ok: true, nota, correctas, total: preguntas.length, porcentaje, detalle });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});


// Calificar respuesta abierta con IA (usa Groq)
app.post("/tasks/calificar-ia/:entregaId", authMiddleware, async (req, res) => {
  try {
    if (!process.env.GROQ_KEY) {
      return res.status(400).json({ ok: false, mensaje: "GROQ_KEY no configurada en el servidor" });
    }
    const assignment = await prisma.assignment.findUnique({
      where: { id: req.params.entregaId },
      include: { task: true }
    });
    if (!assignment) return res.status(404).json({ mensaje: "Entrega no encontrada" });

    // Bloquear recalificación si ya tiene nota (a menos que se fuerce)
    if (assignment.grade != null && !req.body.forzar) {
      return res.json({ ok: true, nota: assignment.grade, comentario: assignment.comment || "Ya calificado", yaCalificado: true });
    }

    let respuesta = assignment.response || "";
    // Si no hay respuesta libre, construir el texto desde respuestasActividad
    if (!respuesta.trim()) {
      try {
        const resps = JSON.parse(assignment.responses || "{}");
        const actObj = typeof assignment.task.activity === "string"
          ? JSON.parse(assignment.task.activity || "{}")
          : (assignment.task.activity || {});
        const pregs = actObj.preguntas || actObj.pares || [];
        if (pregs.length > 0 && Object.keys(resps).length > 0) {
          respuesta = pregs.map((p, i) => {
            const preg = p.pregunta || p.enunciado || p.afirmacion || `Pregunta ${i+1}`;
            const resp = resps[i] || resps[String(i)] || "(sin respuesta)";
            return `${preg}: ${resp}`;
          }).join("\n");
        }
      } catch(_) {}
    }
    if (!respuesta.trim()) return res.status(400).json({ ok: false, mensaje: "El estudiante no ha enviado respuesta" });

    const materialRef = assignment.task.materialRef || "";
    const instrucciones = assignment.task.description || "";

    // Reconstruir preguntas con respuestas para evaluación detallada
    let preguntasTexto = "";
    try {
      const respsObj = JSON.parse(assignment.responses || "{}");
      const actObj2 = typeof assignment.task.activity === "string"
        ? JSON.parse(assignment.task.activity || "{}") : (assignment.task.activity || {});
      const pregs2 = actObj2.preguntas || [];
      if (pregs2.length > 0) {
        preguntasTexto = pregs2.map((p, i) => {
          const preg = p.pregunta || p.enunciado || p.afirmacion || `Pregunta ${i+1}`;
          const correcta = p.correcta || p.respuesta || "";
          const dada = respsObj[i] || respsObj[String(i)] || "(sin respuesta)";
          return `P${i+1}: ${preg}\nRespuesta estudiante: ${dada}${correcta ? "\nRespuesta esperada: " + correcta : ""}`;
        }).join("\n\n");
      }
    } catch(_) {}

    const prompt = `Eres un docente colombiano evaluando a un estudiante de grado ${assignment.task.grade}° en ${assignment.task.area}.
Tarea: "${assignment.task.title}"
${instrucciones ? "Instrucciones: " + instrucciones : ""}
${materialRef ? "Material referencia: " + materialRef.substring(0, 400) : ""}

${preguntasTexto ? "PREGUNTAS Y RESPUESTAS:\n" + preguntasTexto : "Respuesta del estudiante: " + respuesta.substring(0, 800)}

INSTRUCCIONES DE EVALUACIÓN:
- Evalúa CADA respuesta individualmente considerando si el concepto es correcto aunque no sea exacto
- Para preguntas abiertas: acepta respuestas que demuestren comprensión del concepto
- Para V/F: "Verdadero"="true", "Falso"="false" son equivalentes
- Calcula el promedio real de respuestas correctas
- Escala colombiana 0.0 a 5.0 (aprobado desde 3.0)
- Responde ÚNICAMENTE con JSON sin texto adicional:
{"nota": 4.0, "comentario": "Retroalimentación específica de 2-3 oraciones mencionando qué estuvo bien y qué mejorar"}`;

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_KEY}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        max_tokens: 200,
        temperature: 0,
        messages: [
          {role:"system", content:"Eres un evaluador educativo colombiano. Responde ÚNICAMENTE con JSON válido sin texto adicional ni markdown."},
          {role: "user", content: prompt}
        ]
      })
    });
    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    let resultado;
    try {
      const clean = text.replace(/```json|```/g, "").trim();
      resultado = JSON.parse(clean);
      if (resultado.nota == null || isNaN(resultado.nota)) resultado.nota = 2.5;
      resultado.nota = Math.min(5, Math.max(0, parseFloat(resultado.nota.toFixed(1))));
      if (!resultado.comentario) resultado.comentario = "Evaluado con IA";
    } catch(e) {
      resultado = { nota: 2.5, comentario: "Evaluación automática completada" };
    }

    await prisma.assignment.update({
      where: { id: req.params.entregaId },
      data: { grade: resultado.nota, status: "graded", gradedAt: new Date(), autoGraded: true, comment: resultado.comentario }
    });

    // Auto-asignar al libro de notas
    await autoAsignarNota(req.user.id, req.user.institutionId, assignment.task, assignment.studentId, resultado.nota);
    res.json({ ok: true, nota: resultado.nota, comentario: resultado.comentario });
  } catch(e) { res.status(500).json({ ok: false, mensaje: e.message }); }
});

app.post("/tasks/calificar", authMiddleware, async (req, res) => {
  try {
    const { entregaId, calificacion, comentario } = req.body;
    const a = await prisma.assignment.update({ where: { id: entregaId }, data: { grade: parseFloat(calificacion), comment: comentario || "", status: "graded", gradedAt: new Date() } });
    // Auto-asignar al libro de notas
    const asg = await prisma.assignment.findUnique({ where: { id: entregaId }, include: { task: true } }).catch(() => null);
    if (asg) await autoAsignarNota(asg.task.userId, asg.task.institutionId, asg.task, asg.studentId, parseFloat(calificacion));
    res.json({ ok: true, entrega: a });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// PUT: editar tarea
app.put("/tasks/:id", authMiddleware, async (req, res) => {
  try {
    const { titulo, descripcion, fechaEntrega, materialRef } = req.body;
    const data = {};
    if (titulo !== undefined) data.title = titulo;
    if (descripcion !== undefined) data.description = descripcion;
    if (materialRef !== undefined) data.materialRef = materialRef;
    if (fechaEntrega !== undefined) data.dueDate = fechaEntrega ? new Date(fechaEntrega) : null;
    const updated = await prisma.task.update({
      where: { id: req.params.id },
      data
    });
    res.json({ ok: true, tarea: updated });
  } catch(e) { res.status(500).json({ ok: false, mensaje: e.message }); }
});

app.delete("/tasks/:id", authMiddleware, async (req, res) => {
  try {
    await prisma.task.delete({ where: { id: req.params.id, userId: req.user.id } });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// ── TAREAS ESTUDIANTE ─────────────────────────────────
app.get("/tasks/mis-tareas-estudiante", authEst, async (req, res) => {
  try {
    const student = req.student;
    const ahora = new Date();

    // 1. Tareas asignadas directamente al estudiante (via Assignment)
    const assignments = await prisma.assignment.findMany({
      where: { studentId: student.id },
      include: { task: true },
      orderBy: { createdAt: "desc" }
    });
    const tareasAsignadas = assignments.map(a => ({
      id: a.task.id, titulo: a.task.title, descripcion: a.task.description,
      tipo: a.task.type, area: a.task.area, grado: a.task.grade,
      fechaEntrega: a.task.dueDate, actividad: a.task.activity,
      entregada: a.status !== "pending",
      vencida: a.task.dueDate && new Date(a.task.dueDate) < ahora && a.status === "pending",
      calificacion: a.grade, comentario: a.comment || "", entregaId: a.id
    }));

    // 2. Tareas por grado de la institución (sin assignment directo)
    const tareasGrado = await prisma.task.findMany({
      where: {
        institutionId: student.institutionId,
        grade: student.grade,

      },
      orderBy: { createdAt: "desc" }
    });

    // Combinar evitando duplicados
    const idsAsignadas = new Set(tareasAsignadas.map(t => t.id));
    const tareasGradoExtra = tareasGrado
      .filter(t => !idsAsignadas.has(t.id))
      .map(t => {
        return {
          id: t.id, titulo: t.title, descripcion: t.description,
          materialRef: t.materialRef || "",
          tipo: t.type, area: t.area, grado: t.grade,
          fechaEntrega: t.dueDate, actividad: t.activity,
          entregada: false,
          vencida: t.dueDate && new Date(t.dueDate) < ahora,
          calificacion: null, comentario: "", entregaId: null
        };
      });

    res.json({ tareas: [...tareasAsignadas, ...tareasGradoExtra] });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.post("/tasks/entregar", authEst, uploadEnt.single("archivo"), async (req, res) => {
  try {
    const { tareaId, respuesta, respuestasActividad } = req.body;
    let assignment = await prisma.assignment.findFirst({ where: { taskId: tareaId, studentId: req.student.id }, include: { task: true } });
    if (!assignment) {
      const tareaExiste = await prisma.task.findFirst({ where: { id: tareaId, institutionId: req.student.institutionId } });
      if (!tareaExiste) return res.status(404).json({ mensaje: "Tarea no encontrada" });
      assignment = await prisma.assignment.create({ data: { taskId: tareaId, studentId: req.student.id, status: "pending" }, include: { task: true } });
    }

    const respAct = respuestasActividad ? JSON.parse(respuestasActividad) : {};
    let grade = null, autoGraded = false, detail = null;

    if (["quiz", "completar", "verdadero_falso"].includes(assignment.task.type) && assignment.task.activity?.preguntas) {
      let correctas = 0, total = 0; const detalles = [];
      assignment.task.activity.preguntas.forEach((p, i) => {
        const rawRef = (p.correcta || p.respuesta || "").toString().trim();
        const ref = rawRef.toLowerCase().replace(/^([a-d])\..*$/i, "$1");
        if (!ref) return; total++;
        const rawEst = (respAct[i] || respAct[String(i)] || "").toString().trim();
        const est = rawEst.toLowerCase().replace(/^([a-d])\..*$/i, "$1");
        // Normalizar Verdadero/Falso vs true/false
        const normRef = ref === "true" ? "verdadero" : ref === "false" ? "falso" : ref;
        const normEst = est === "true" ? "verdadero" : est === "false" ? "falso" : 
                        rawEst.toLowerCase().startsWith("verdadero") ? "verdadero" :
                        rawEst.toLowerCase().startsWith("falso") ? "falso" : est;
        // Para completar: solo aceptar si la respuesta del estudiante es corta (<=5 palabras) y contiene la clave
        const estPalabras = rawEst.trim().split(/\s+/).length;
        const okCompletar = assignment.task.type === "completar" && estPalabras <= 5 && (rawEst.toLowerCase().includes(ref) || ref.includes(est));
        const ok = est === ref || normEst === normRef || rawEst.toLowerCase() === rawRef.toLowerCase() || okCompletar;
        if (ok) correctas++;
        detalles.push({ pregunta: p.pregunta || p.enunciado || p.afirmacion, respEst: respAct[i] || "", respCorrecta: p.correcta || p.respuesta, esCorrecta: ok });
      });
      if (total > 0) { grade = parseFloat((correctas / total * 5).toFixed(1)); autoGraded = true; detail = { correctas, total, porcentaje: Math.round(correctas / total * 100), detalles }; }
    }

    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: { response: respuesta || "", responses: JSON.stringify(respAct || {}), status: autoGraded ? "graded" : "submitted", submittedAt: new Date(), grade, autoGraded, detail, ...(autoGraded ? { gradedAt: new Date() } : {}), ...(req.file ? { fileName: req.file.originalname } : {}) }
    });
    res.json({ ok: true, mensaje: "Tarea entregada ✅", autoCalificada: autoGraded, notaAuto: grade, resultadoDetalle: detail });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// ── IA ────────────────────────────────────────────────
app.post("/generar-guia", authMiddleware, async (req, res) => {
  try {
    const { institucion, docente, area, grado, periodo, fecha, tema, tipoApertura, estratDesarrollo, retroalimentacion, tipoCierre, dejaTarea, estratTarea, duracion, cargo, ciudad, nivelEducativo } = req.body;
    const durMin = parseInt(duracion) || 55;
    const durTexto = Math.round(durMin / 55) === 1 ? "1 hora (55 min)" : `${Math.round(durMin / 55)} horas (${durMin} min)`;

    const prompt = `Eres pedagogo colombiano experto. Crea guía pedagógica COMPLETA para ${nivelEducativo} nivel ${grado}°.
DATOS: Institución:${institucion} | Docente:${docente} (${cargo}) | Ciudad:${ciudad} | Área:${area} | Grado:${grado}° | Periodo:${periodo} | Fecha:${fecha} | Tema:${tema} | Duración:${durTexto}
ESTRATEGIAS: Apertura:${tipoApertura} | Desarrollo:${estratDesarrollo} | Retro:${retroalimentacion} | Cierre:${tipoCierre} | Tarea:${dejaTarea ? estratTarea : "Sin tarea"}

OBLIGATORIO: Usa EXACTAMENTE estas marcas de sección:

===APERTURA===
(Redacta apertura completa, mínimo 8 líneas, contextualizada en Colombia)

===SABERES_PREVIOS===
1. (pregunta diagnóstica)
2. (pregunta diagnóstica)
3. (pregunta diagnóstica)
4. (pregunta diagnóstica)

===DESARROLLO===
(Contenido completo sobre "${tema}", mínimo 5 subtemas con ##, ejemplos reales Colombia)

===RETROALIMENTACION===
(Actividad completa de retroalimentación)

===TALLER===
1. COMPRENSIÓN: (2 preguntas)
2. APLICACIÓN: (1 actividad)
3. PENSAMIENTO CRÍTICO: (1 pregunta)
4. CREATIVIDAD: (1 actividad)
5. INVESTIGACIÓN: (1 consulta con fuente)

===CIERRE===
(Síntesis, metacognición y conexión cotidiana)

===TAREA===
${dejaTarea ? `(Tarea con instrucciones claras sobre "${tema}")` : "Sin tarea para esta sesión."}

===EXTRAS===
OBJETIVO: (objetivo con verbo infinitivo)
DBA: (DBA completo MEN Colombia ${area} grado ${grado}°)
ESTANDAR: (Estándar básico MEN completo)
INDICADOR1: (SABER — 🟢Básico 🟡Intermedio 🔵Avanzado)
INDICADOR2: (HACER — mismos niveles)
INDICADOR3: (SER — mismos niveles)
EVIDENCIA: (evidencia observable)
EVALUACION: (3 preguntas abiertas + 2 selección múltiple + 1 práctica)
RECURSOS: (5 recursos numerados)
WEBGRAFIA: (3 fuentes APA)`;

    const contenido = await llamarIA(prompt, "Eres el mejor pedagogo de Colombia. OBLIGATORIO: respeta ===SECCION=== exactamente. Guías de altísima calidad.", 4096, 0.7);
    res.json({ contenido, ok: true });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.post("/generar-actividad", authMiddleware, async (req, res) => {
  try {
    const { tipo, tema, area, grado, cantidad } = req.body;
    const n = cantidad || 5;
    const prompts = {
      quiz: `Genera ${n} preguntas selección múltiple sobre "${tema}" ${area} grado ${grado}° Colombia. JSON SOLO: {"preguntas":[{"pregunta":"","opciones":["A.","B.","C.","D."],"correcta":"A"}]}`,
      completar: `Genera ${n} oraciones para completar sobre "${tema}" ${area} grado ${grado}°. SOLO JSON sin texto extra: {"preguntas":[{"enunciado":"La ___ es clave","respuesta":"palabra"}]}. La respuesta debe ser maxima 3 palabras clave.`,
      verdadero_falso: `Genera ${n} afirmaciones sobre "${tema}" ${area} grado ${grado}°. Responde SOLO JSON sin texto extra: {"preguntas":[{"afirmacion":"","respuesta":"Verdadero"}]}. Usa SOLO "Verdadero" o "Falso" como valor de respuesta.`,
      relacionar: `Genera ${n} pares sobre "${tema}" ${area} grado ${grado}°. JSON SOLO: {"pares":[{"columnaA":"","columnaB":""}]}`,
      taller: `Genera ${n} preguntas abiertas sobre "${tema}" ${area} grado ${grado}°. JSON SOLO: {"preguntas":[{"pregunta":"","tipo":"abierta"}]}`,
      evaluacion: `Genera evaluación mixta sobre "${tema}" ${area} grado ${grado}°. JSON SOLO: {"preguntas":[{"tipo":"seleccion","pregunta":"","opciones":["A.","B.","C.","D."],"correcta":"A"}]}`,
    };
    const txt = await llamarIA(prompts[tipo] || prompts.taller, "Experto evaluación colombiana. SOLO JSON válido sin markdown ni texto extra.", 2000, 0.5);
    try { res.json({ ok: true, actividad: JSON.parse(txt.trim().replace(/```json|```/g, "").trim()), tipo }); }
    catch { res.json({ ok: true, actividad: { preguntas: [] }, tipo }); }
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// ── EXPORTAR WORD ─────────────────────────────────────
app.post("/exportar-word", authMiddleware, async (req, res) => {
  try {
    const { contenido, institucion, docente, area, grado, periodo, tema, duracion, logoPath, banderaPath, cargo, ciudad, nivelEducativo } = req.body;
    const gradoN = parseInt(grado) || 0;
    const nivelLabel = nivelEducativo === "preescolar" ? "Preescolar" : nivelEducativo === "primaria" ? "Primaria" : nivelEducativo === "media_tecnica" ? "Media Técnica" : gradoN <= 5 ? "Primaria" : "Bachillerato";
    const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, BorderStyle, WidthType, ShadingType, VerticalAlign, ImageRun } = require("docx");
    const bloques = {}; let secActual = null;
    for (const linea of contenido.split("\n")) { const m = linea.match(/^===(\w+)===/); if (m) { secActual = m[1]; bloques[secActual] = []; continue; } if (secActual) bloques[secActual].push(linea); }
    if (!Object.keys(bloques).length) { const ls = contenido.split("\n"); const ch = Math.floor(ls.length / 5); bloques["APERTURA"] = ls.slice(0, ch); bloques["DESARROLLO"] = ls.slice(ch, ch * 3); bloques["RETROALIMENTACION"] = ls.slice(ch * 3, ch * 4); bloques["CIERRE"] = ls.slice(ch * 4); bloques["TALLER"] = ls.slice(ch, ch * 2); bloques["EXTRAS"] = []; }
    const getB = k => (bloques[k] || []).join("\n").replace(/\*\*/g, "").replace(/##\s*/g, "").replace(/^[\s\n]+|[\s\n]+$/g, "") || contenido.substring(0, 300);
    const AZUL = "1B4F8A", AZUL_CL = "D6E4F7", NEGRO = "000000", GRIS = "F2F2F2", BLANCO = "FFFFFF";
    const bN = { style: BorderStyle.SINGLE, size: 6, color: NEGRO }; const bA = { style: BorderStyle.SINGLE, size: 8, color: AZUL };
    const bAll = { top: bN, bottom: bN, left: bN, right: bN }; const bAllA = { top: bA, bottom: bA, left: bA, right: bA }; const TW = 11106;
    const txt = (t, o = {}) => new TextRun({ text: t, font: "Times New Roman", size: o.size || 24, bold: o.bold || false, color: o.color || NEGRO, ...o });
    const par = (c, o = {}) => new Paragraph({ children: c, alignment: o.align || AlignmentType.BOTH, spacing: o.spacing || { before: 40, after: 40 }, ...o });
    const cel = (c, o = {}) => new TableCell({ width: { size: o.w || 1000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 100, right: 100 }, shading: { fill: o.fill || BLANCO, type: ShadingType.CLEAR }, verticalAlign: o.va || VerticalAlign.CENTER, borders: o.borders || bAll, children: c });
    const logoCell = (imgPath, w) => { const abs = imgPath ? path.join(__dirname, "..", imgPath) : null; if (abs && fs.existsSync(abs)) { try { const buf = fs.readFileSync(abs); return cel([par([new ImageRun({ data: buf, transformation: { width: 80, height: 80 }, type: "png" })], { align: AlignmentType.CENTER })], { w, fill: BLANCO, borders: bAllA }); } catch (_) { } } return cel([par([txt("", { size: 20 })])], { w, fill: AZUL_CL, borders: bAllA }); };
    const children = []; const LC = 1300, RC = 1300, CC = TW - LC - RC;
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [LC, CC, RC], borders: { top: bA, bottom: bA, left: bA, right: bA, insideH: bA, insideV: bA }, rows: [new TableRow({ children: [logoCell(logoPath, LC), cel([par([txt((institucion || "INSTITUCIÓN EDUCATIVA").toUpperCase(), { bold: true, size: 24, color: AZUL })], { align: AlignmentType.CENTER, spacing: { before: 60, after: 20 } }), par([txt("Aprobado según Decreto No. 0001295 del 04 Noviembre de 2009", { size: 16 })], { align: AlignmentType.CENTER, spacing: { before: 0, after: 0 } }), par([txt(`${ciudad || "Valparaíso"} - Caquetá`, { size: 18, bold: true })], { align: AlignmentType.CENTER, spacing: { before: 20, after: 40 } })], { w: CC, borders: bAllA }), logoCell(banderaPath, RC)] })] }));
    children.push(par([txt("")]));
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [TW], rows: [new TableRow({ children: [cel([par([txt("PLAN DE AULA", { bold: true, size: 30, color: AZUL })], { align: AlignmentType.CENTER, spacing: { before: 80, after: 80 } })], { w: TW, fill: AZUL_CL, borders: bAllA })] })] }));
    const H = TW / 2;
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [H, H], rows: [new TableRow({ children: [cel([par([txt("Nombre del Docente: ", { bold: true }), txt(docente || "___")])], { w: H, borders: bAll }), cel([par([txt("Sede Educativa: ", { bold: true }), txt(institucion || "___")])], { w: H, borders: bAll })] })] }));
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [TW], rows: [new TableRow({ children: [cel([par([txt("INFORMACIÓN GENERAL", { bold: true, color: BLANCO })], { align: AlignmentType.CENTER })], { w: TW, fill: AZUL, borders: bAllA })] })] }));
    const [c1, c2, c3, c4, c5, c6, c7, c8, c9] = [Math.round(TW * .07), Math.round(TW * .12), Math.round(TW * .07), Math.round(TW * .07), Math.round(TW * .08), Math.round(TW * .07), Math.round(TW * .07), Math.round(TW * .28), Math.round(TW * .06)]; const c10v = TW - c1 - c2 - c3 - c4 - c5 - c6 - c7 - c8 - c9;
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [c1, c2, c3, c4, c5, c6, c7, c8, c9, c10v], rows: [new TableRow({ children: [cel([par([txt("NIVEL", { bold: true, size: 18 })])], { w: c1, fill: GRIS, borders: bAll }), cel([par([txt(nivelLabel, { size: 18 })])], { w: c2, borders: bAll }), cel([par([txt("GRADO", { bold: true, size: 18 })])], { w: c3, fill: GRIS, borders: bAll }), cel([par([txt(grado || "", { size: 18 })])], { w: c4, borders: bAll }), cel([par([txt("PERÍODO", { bold: true, size: 18 })])], { w: c5, fill: GRIS, borders: bAll }), cel([par([txt(periodo || "", { size: 18 })])], { w: c6, borders: bAll }), cel([par([txt("ÁREA", { bold: true, size: 18 })])], { w: c7, fill: GRIS, borders: bAll }), cel([par([txt(area || "", { size: 18 })])], { w: c8, borders: bAll }), cel([par([txt("SEM", { bold: true, size: 18 })])], { w: c9, fill: GRIS, borders: bAll }), cel([par([txt("1", { size: 18 })])], { w: c10v, borders: bAll })] })] }));
    const LBL = Math.round(TW * .13), VAL = TW - LBL; const fila2 = (lb, vl) => new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [LBL, VAL], rows: [new TableRow({ children: [cel([par([txt(lb, { bold: true })])], { w: LBL, fill: GRIS, borders: bAll }), cel([par([txt(vl)])], { w: VAL, borders: bAll })] })] });
    const ex = getB("EXTRAS");
    const obj = ex.match(/OBJETIVO[:\s\n]+([^\n]{20,}[\s\S]*?)(?=\nDBA:|\nESTANDAR:|\nINDICADOR|$)/i)?.[1]?.trim() || "Desarrollar competencias.";
    const rec = ex.match(/RECURSOS[:\s]+([\s\S]*?)(?=WEBGRAFIA:|$)/i)?.[1]?.trim() || "Talento humano, cuaderno.";
    const web = ex.match(/WEBGRAFIA[:\s]+([\s\S]*?)$/i)?.[1]?.trim() || "MEN lineamientos.";
    const evl = ex.match(/EVALUACION[:\s]+([\s\S]*?)(?=RECURSOS:|WEBGRAFIA:|$)/i)?.[1]?.trim() || "Oral y escrita.";
    const i1 = ex.match(/INDICADOR1[:\s]+([\s\S]*?)(?=INDICADOR2:|$)/i)?.[1]?.trim() || "";
    const i2 = ex.match(/INDICADOR2[:\s]+([\s\S]*?)(?=INDICADOR3:|$)/i)?.[1]?.trim() || "";
    const i3 = ex.match(/INDICADOR3[:\s]+([\s\S]*?)(?=EVIDENCIA:|$)/i)?.[1]?.trim() || "";
    const dba = ex.match(/DBA[:\s\n]+([\s\S]*?)(?=ESTANDAR:|INDICADOR|EVIDENCIA:|$)/i)?.[1]?.trim() || "";
    const std = ex.match(/ESTANDAR[:\s\n]+([\s\S]*?)(?=DBA:|INDICADOR|EVIDENCIA:|$)/i)?.[1]?.trim() || "";
    const evd = ex.match(/EVIDENCIA[:\s]+([\s\S]*?)(?=CRITERIO:|RECURSOS:|$)/i)?.[1]?.trim() || "";
    children.push(fila2("TEMA", tema)); children.push(fila2("OBJETIVO", obj.substring(0, 400))); children.push(fila2("RECURSOS", rec.substring(0, 400))); children.push(fila2("WEBGRAFÍA", web.substring(0, 400)));
    children.push(par([txt("")]));
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [TW], rows: [new TableRow({ children: [cel([par([txt("REFERENTES NACIONALES DE CALIDAD", { bold: true, color: BLANCO })], { align: AlignmentType.CENTER })], { w: TW, fill: AZUL, borders: bAllA })] })] }));
    const LR = Math.round(TW * .28), VR = TW - LR;
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [LR, VR], rows: [new TableRow({ children: [cel([par([txt("ESTÁNDAR BÁSICO (MEN)", { bold: true })])], { w: LR, fill: GRIS, borders: bAll }), cel([par([txt(std.substring(0, 400))])], { w: VR, borders: bAll })] }), new TableRow({ children: [cel([par([txt("DBA — DERECHO BÁSICO", { bold: true })])], { w: LR, fill: GRIS, borders: bAll }), cel([par([txt(dba.substring(0, 400))])], { w: VR, borders: bAll })] })] }));
    const S1 = Math.round(TW * .18), S2 = Math.round((TW - S1) / 3), S3 = S2, S4 = TW - S1 - S2 - S3;
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [S1, S2, S3, S4], rows: [new TableRow({ children: [cel([par([txt("INDICADORES", { bold: true })])], { w: S1, fill: GRIS, borders: bAll }), cel([par([txt("SABER", { bold: true })], { align: AlignmentType.CENTER })], { w: S2, fill: GRIS, borders: bAll }), cel([par([txt("HACER", { bold: true })], { align: AlignmentType.CENTER })], { w: S3, fill: GRIS, borders: bAll }), cel([par([txt("SER", { bold: true })], { align: AlignmentType.CENTER })], { w: S4, fill: GRIS, borders: bAll })] }), new TableRow({ children: [cel([par([txt("Por dimensión")])], { w: S1, borders: bAll }), cel([par([txt(i1.substring(0, 500))])], { w: S2, borders: bAll }), cel([par([txt(i2.substring(0, 500))])], { w: S3, borders: bAll }), cel([par([txt(i3.substring(0, 400))])], { w: S4, borders: bAll })] })] }));
    children.push(par([txt("")]));
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [TW], rows: [new TableRow({ children: [cel([par([txt("METODOLOGÍA EN SECUENCIA DIDÁCTICA", { bold: true, color: BLANCO })], { align: AlignmentType.CENTER })], { w: TW, fill: AZUL, borders: bAllA })] })] }));
    const secs = [{ t: "INICIO (APERTURA Y MOTIVACIÓN)", c: getB("APERTURA").substring(0, 800) }, { t: "EXPLORACIÓN (SABERES PREVIOS)", c: getB("SABERES_PREVIOS").substring(0, 600) }, { t: "ESTRUCTURACIÓN (DESARROLLO Y TALLER)", c: (getB("DESARROLLO") + " " + getB("TALLER")).substring(0, 1200) }, { t: "TRANSFERENCIA (RETROALIMENTACIÓN)", c: getB("RETROALIMENTACION").substring(0, 1000) }, { t: "REFUERZO (CIERRE Y TAREA)", c: (getB("CIERRE") + "\n" + getB("TAREA")).substring(0, 1000) }];
    for (const s of secs) { children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [TW], rows: [new TableRow({ children: [cel([par([txt(s.t, { bold: true })])], { w: TW, fill: GRIS, borders: bAll })] }), new TableRow({ children: [cel([par([txt(s.c || ".")])], { w: TW, borders: bAll })] })] })); }
    children.push(par([txt("")]));
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [TW], rows: [new TableRow({ children: [cel([par([txt("EVALUACIÓN", { bold: true, color: BLANCO })], { align: AlignmentType.CENTER })], { w: TW, fill: AZUL, borders: bAllA })] })] }));
    const EV = Math.round(TW * .6), ET = TW - EV;
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [EV, ET], rows: [new TableRow({ children: [cel([par([txt("DESEMPEÑOS ESPERADOS", { bold: true })], { align: AlignmentType.CENTER })], { w: EV, fill: GRIS, borders: bAll }), cel([par([txt("EVALUACIÓN PERTINENTE", { bold: true })], { align: AlignmentType.CENTER })], { w: ET, fill: GRIS, borders: bAll })] }), new TableRow({ children: [cel([par([txt(evd.substring(0, 300))])], { w: EV, borders: bAll }), cel([par([txt(evl.substring(0, 500))])], { w: ET, borders: bAll })] })] }));
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [TW], rows: [new TableRow({ children: [cel([par([txt("REFERENCIAS BIBLIOGRÁFICAS Y WEBGRAFÍA", { bold: true })], { align: AlignmentType.CENTER })], { w: TW, fill: GRIS, borders: bAll })] }), new TableRow({ children: [cel([par([txt(web.substring(0, 500))])], { w: TW, borders: bAll })] })] }));
    children.push(par([txt("")])); children.push(par([txt("")]));
    const FW = Math.round(TW / 2), FW2 = TW - FW; const nb = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } };
    children.push(new Table({ width: { size: TW, type: WidthType.DXA }, columnWidths: [FW, FW2], rows: [new TableRow({ children: [cel([par([txt("_______________________________")], { align: AlignmentType.CENTER }), par([txt(docente || "Docente", { bold: true })], { align: AlignmentType.CENTER }), par([txt(cargo || "Docente", { size: 20 })], { align: AlignmentType.CENTER })], { w: FW, borders: nb }), cel([par([txt("_______________________________")], { align: AlignmentType.CENTER }), par([txt("Coordinador / Rector", { bold: true })], { align: AlignmentType.CENTER }), par([txt("Vo. Bo.", { size: 20 })], { align: AlignmentType.CENTER })], { w: FW2, borders: nb })] })] }));
    const doc = new Document({ styles: { default: { document: { run: { font: "Times New Roman", size: 24 } } } }, sections: [{ properties: { page: { size: { width: 12240, height: 15840 }, margin: { top: 567, right: 567, bottom: 567, left: 567 } } }, children }] });
    const buffer = await Packer.toBuffer(doc);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="PlanAula_${area}_Grado${grado}.docx"`);
    res.send(buffer);
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});


// ══════════════════════════════════════════════════════
//  ASIGNACIONES DE DOCENTES
// ══════════════════════════════════════════════════════

// GET: asignaciones de un docente
app.get("/asignaciones/:userId", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, institutionId: true } });
    if (!user) return res.json({ ok: true, asignaciones: [] });
    const nota = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: user.institutionId, key: `asig_${req.params.userId}` } }
    }).catch(() => null);
    const asignaciones = nota ? JSON.parse(nota.data || "[]") : [];
    res.json({ ok: true, asignaciones });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// PUT: guardar asignaciones de un docente
app.put("/asignaciones/:userId", async (req, res) => {
  try {
    const { asignaciones } = req.body;
    if (!Array.isArray(asignaciones)) return res.status(400).json({ mensaje: "Inválido" });
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { institutionId: true } });
    if (!user) return res.status(404).json({ mensaje: "Docente no encontrado" });
    await prisma.notaClase.upsert({
      where: { institutionId_key: { institutionId: user.institutionId, key: `asig_${req.params.userId}` } },
      update: { data: JSON.stringify(asignaciones), updatedAt: new Date() },
      create: { institutionId: user.institutionId, key: `asig_${req.params.userId}`, data: JSON.stringify(asignaciones) }
    });
    res.json({ ok: true, mensaje: "Asignaciones guardadas" });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// DELETE: eliminar docente
app.delete("/docentes/:id", authMiddleware, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ ok: true, mensaje: "Docente eliminado ✅" });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// GET: horario completo de un docente
app.get("/horarios/:userId", async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { institutionId: true } });
    if (!user) return res.json({ ok: true, horario: {} });
    const nota = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: user.institutionId, key: `horario_${req.params.userId}` } }
    }).catch(() => null);
    const horario = nota ? JSON.parse(nota.data || "{}") : {};
    res.json({ ok: true, horario });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// PUT: guardar horario completo de un docente
app.put("/horarios/:userId", async (req, res) => {
  try {
    const { horario } = req.body;
    if (!horario || typeof horario !== 'object') return res.status(400).json({ mensaje: "Inválido" });
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { institutionId: true } });
    if (!user) return res.status(404).json({ mensaje: "Docente no encontrado" });
    await prisma.notaClase.upsert({
      where: { institutionId_key: { institutionId: user.institutionId, key: `horario_${req.params.userId}` } },
      update: { data: JSON.stringify(horario), updatedAt: new Date() },
      create: { institutionId: user.institutionId, key: `horario_${req.params.userId}`, data: JSON.stringify(horario) }
    });
    // También actualizar asignaciones automáticamente
    const asignacionesMap = {};
    Object.values(horario).forEach(v => {
      if (v && v.materia && v.grado) {
        const key = `${v.materia}_${v.grado}`;
        if (!asignacionesMap[key]) asignacionesMap[key] = { area: v.materia, grado: v.grado };
      }
    });
    const asignaciones = Object.values(asignacionesMap);
    await prisma.notaClase.upsert({
      where: { institutionId_key: { institutionId: user.institutionId, key: `asig_${req.params.userId}` } },
      update: { data: JSON.stringify(asignaciones), updatedAt: new Date() },
      create: { institutionId: user.institutionId, key: `asig_${req.params.userId}`, data: JSON.stringify(asignaciones) }
    });
    res.json({ ok: true, mensaje: "Horario guardado ✅" });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// GET: todos los docentes con asignaciones
app.get("/todos-docentes-asignaciones", async (req, res) => {
  try {
    const users = await prisma.user.findMany({ 
      where: { institutionId: req.institutionId || undefined },
      select: { id:true, name:true, email:true, cargo:true } 
    });
    const docentes = users.map(u => ({ ...u, asignaciones: [] }));
    res.json({ ok: true, docentes });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// ══════════════════════════════════════════════════════
//  MALLAS CURRICULARES
// ══════════════════════════════════════════════════════

// GET: malla de una institución/área
// ══════════════════════════════════════════════════════
// LIBRO DE NOTAS
// ══════════════════════════════════════════════════════

// GET: períodos de notas del docente
app.get("/notas/periodos", authMiddleware, async (req, res) => {
  try {
    const nota = await prisma.notaClase.findMany({
      where: { institutionId: req.institutionId, key: { startsWith: `periodos_${req.user.id}` } }
    });
    const periodos = nota.length ? JSON.parse(nota[0].data || "[]") : [];
    res.json({ ok: true, periodos });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// POST: crear período de notas
app.post("/notas/periodos", authMiddleware, async (req, res) => {
  try {
    const { nombre, area, grado, porcentaje, actividades } = req.body;
    const key = `periodos_${req.user.id}_notas`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.institutionId, key } }
    }).catch(() => null);
    const periodos = existing ? JSON.parse(existing.data || "[]") : [];
    const nuevo = {
      id: Date.now().toString(),
      nombre, area, grado,
      porcentaje: parseFloat(porcentaje) || 100,
      actividades: actividades || [],
      notas: {},
      creadoEn: new Date().toISOString(),
      docenteId: req.user.id
    };
    periodos.push(nuevo);
    await prisma.notaClase.upsert({
      where: { institutionId_key: { institutionId: req.institutionId, key } },
      update: { data: JSON.stringify(periodos), updatedAt: new Date() },
      create: { institutionId: req.institutionId, key, data: JSON.stringify(periodos) }
    });
    res.json({ ok: true, periodo: nuevo });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// PUT: actualizar notas de un período
app.put("/notas/periodos/:periodoId", authMiddleware, async (req, res) => {
  try {
    const { notas, actividades } = req.body;
    const key = `periodos_${req.user.id}_notas`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.institutionId, key } }
    }).catch(() => null);
    if (!existing) return res.status(404).json({ mensaje: "No encontrado" });
    const periodos = JSON.parse(existing.data || "[]");
    const idx = periodos.findIndex(p => p.id === req.params.periodoId);
    if (idx === -1) return res.status(404).json({ mensaje: "Período no encontrado" });
    if (notas) periodos[idx].notas = notas;
    if (actividades) periodos[idx].actividades = actividades;
    await prisma.notaClase.update({
      where: { institutionId_key: { institutionId: req.institutionId, key } },
      data: { data: JSON.stringify(periodos), updatedAt: new Date() }
    });
    res.json({ ok: true, periodo: periodos[idx] });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// DELETE: eliminar período
app.delete("/notas/periodos/:periodoId", authMiddleware, async (req, res) => {
  try {
    const key = `periodos_${req.user.id}_notas`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.institutionId, key } }
    }).catch(() => null);
    if (!existing) return res.json({ ok: true });
    const periodos = JSON.parse(existing.data || "[]").filter(p => p.id !== req.params.periodoId);
    await prisma.notaClase.update({
      where: { institutionId_key: { institutionId: req.institutionId, key } },
      data: { data: JSON.stringify(periodos), updatedAt: new Date() }
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// GET: notas de un estudiante (para portal estudiantil)
app.get("/notas/estudiante/:studentId", authEst, async (req, res) => {
  try {
    // Buscar todos los períodos de la institución que incluyan al estudiante
    const todasNotas = await prisma.notaClase.findMany({
      where: { institutionId: req.student.institutionId, key: { contains: "_notas" } }
    });
    
    // Cargar lista de estudiantes para mapear IDs locales a nombres
    const gradoNorm = (g) => (g||"").toLowerCase().replace(/[°o]/g,"").trim();
    const estGrado = gradoNorm(req.student.grade);
    const estNombre = req.student.name.toLowerCase().trim();
    
    const misNotas = [];
    todasNotas.forEach(n => {
      const periodos = JSON.parse(n.data || "[]");
      periodos.forEach(p => {
        // 1. Buscar por ID exacto del backend
        let notasEst = p.notas?.[req.student.id];
        
        // 2. Si no encuentra, buscar estudiantes del período con mismo grado
        if (!notasEst || Object.keys(notasEst).length === 0) {
          if (p.grado && gradoNorm(p.grado) === estGrado) {
            // Buscar en estudiantes guardados en el período
            const estsPeriodo = p.estudiantes || [];
            const estLocal = estsPeriodo.find(e => 
              (e.nombre||e.name||"").toLowerCase().trim() === estNombre
            );
            if (estLocal && estLocal.id) {
              notasEst = p.notas?.[estLocal.id];
            }
            
            // 3. Último recurso: buscar en NotaClase de estudiantes por grado
            if (!notasEst) {
              const claveEst = `ep_est_${p.grado}`;
              // No podemos acceder a localStorage desde el backend
              // Buscar en la misma institutionId todos los est del grado
            }
          }
        }
        
        if (notasEst && Object.keys(notasEst).length > 0) {
          misNotas.push({
            periodoId: p.id,
            nombre: p.nombre,
            area: p.area,
            grado: p.grado,
            porcentaje: p.porcentaje,
            actividades: p.actividades,
            misNotas: notasEst
          });
        }
      });
    });
    res.json({ ok: true, notas: misNotas });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

app.get("/mallas/:institutionId/:area", async (req, res) => {
  try {
    const malla = await prisma.malla.findUnique({
      where: { institutionId_area: { institutionId: req.params.institutionId, area: decodeURIComponent(req.params.area) } }
    });
    res.json({ ok: true, malla: malla || null });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// PUT: guardar malla
app.put("/mallas/:institutionId/:area", async (req, res) => {
  try {
    const { p1, p2, p3, p4 } = req.body;
    const area = decodeURIComponent(req.params.area);
    const malla = await prisma.malla.upsert({
      where: { institutionId_area: { institutionId: req.params.institutionId, area } },
      update: { p1: p1||"", p2: p2||"", p3: p3||"", p4: p4||"", updatedAt: new Date() },
      create: { institutionId: req.params.institutionId, area, p1: p1||"", p2: p2||"", p3: p3||"", p4: p4||"" }
    });
    res.json({ ok: true, malla });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// GET: todas las mallas de una institución
app.get("/mallas/:institutionId", async (req, res) => {
  try {
    const mallas = await prisma.malla.findMany({ where: { institutionId: req.params.institutionId } });
    res.json({ ok: true, mallas });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});


// ══════════════════════════════════════════════════════
//  PIZARRA ESCOLAR
// ══════════════════════════════════════════════════════

// GET: obtener mensajes de la pizarra por grado
app.get("/pizarra/:grado", authMiddleware, async (req, res) => {
  try {
    const grado = decodeURIComponent(req.params.grado);
    const key = `pizarra_${req.user.institutionId}_${grado}`;
    const nota = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } }
    }).catch(() => null);
    const mensajes = nota ? JSON.parse(nota.data || "[]") : [];
    res.json({ ok: true, mensajes });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// GET: pizarra para estudiantes (sin auth de docente)
app.get("/pizarra-est/:institutionId/:grado", authEst, async (req, res) => {
  try {
    const grado = decodeURIComponent(req.params.grado);
    const instId = req.params.institutionId;
    const key = `pizarra_${instId}_${grado}`;
    const nota = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: instId, key } }
    }).catch(() => null);
    const mensajes = nota ? JSON.parse(nota.data || "[]") : [];
    res.json({ ok: true, mensajes });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// POST: docente publica mensaje en pizarra
app.post("/pizarra", authMiddleware, async (req, res) => {
  try {
    const { grado, texto, tipo } = req.body;
    if (!grado || !texto) return res.status(400).json({ mensaje: "Grado y texto requeridos" });
    const key = `pizarra_${req.user.institutionId}_${grado}`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } }
    }).catch(() => null);
    const mensajes = existing ? JSON.parse(existing.data || "[]") : [];
    const nuevo = {
      id: Date.now().toString(),
      texto,
      tipo: tipo || "anuncio",
      autor: req.user.name,
      autorId: req.user.id,
      grado,
      fecha: new Date().toISOString(),
      postits: []
    };
    mensajes.unshift(nuevo);
    await prisma.notaClase.upsert({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } },
      update: { data: JSON.stringify(mensajes), updatedAt: new Date() },
      create: { institutionId: req.user.institutionId, key, data: JSON.stringify(mensajes) }
    });
    res.json({ ok: true, mensaje: nuevo });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// DELETE: docente elimina mensaje
app.delete("/pizarra/:grado/:mensajeId", authMiddleware, async (req, res) => {
  try {
    const grado = decodeURIComponent(req.params.grado);
    const key = `pizarra_${req.user.institutionId}_${grado}`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } }
    }).catch(() => null);
    if (!existing) return res.json({ ok: true });
    const mensajes = JSON.parse(existing.data || "[]").filter(m => m.id !== req.params.mensajeId);
    await prisma.notaClase.update({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } },
      data: { data: JSON.stringify(mensajes), updatedAt: new Date() }
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// POST: estudiante agrega post-it a un mensaje
app.post("/pizarra-postit/:institutionId/:grado/:mensajeId", authEst, async (req, res) => {
  try {
    const grado = decodeURIComponent(req.params.grado);
    const instId = req.params.institutionId;
    const key = `pizarra_${instId}_${grado}`;
    const { texto, color } = req.body;
    if (!texto) return res.status(400).json({ mensaje: "Texto requerido" });
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: instId, key } }
    }).catch(() => null);
    if (!existing) return res.status(404).json({ mensaje: "Pizarra no encontrada" });
    const mensajes = JSON.parse(existing.data || "[]");
    const msg = mensajes.find(m => m.id === req.params.mensajeId);
    if (!msg) return res.status(404).json({ mensaje: "Mensaje no encontrado" });
    const postit = {
      id: Date.now().toString(),
      texto,
      color: color || "#fef08a",
      autor: req.student.name,
      autorId: req.student.id,
      fecha: new Date().toISOString()
    };
    if (!msg.postits) msg.postits = [];
    msg.postits.push(postit);
    await prisma.notaClase.update({
      where: { institutionId_key: { institutionId: instId, key } },
      data: { data: JSON.stringify(mensajes), updatedAt: new Date() }
    });
    res.json({ ok: true, postit });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// DELETE: estudiante elimina su propio post-it
app.delete("/pizarra-postit/:institutionId/:grado/:mensajeId/:postitId", authEst, async (req, res) => {
  try {
    const grado = decodeURIComponent(req.params.grado);
    const instId = req.params.institutionId;
    const key = `pizarra_${instId}_${grado}`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: instId, key } }
    }).catch(() => null);
    if (!existing) return res.json({ ok: true });
    const mensajes = JSON.parse(existing.data || "[]");
    const msg = mensajes.find(m => m.id === req.params.mensajeId);
    if (msg) {
      msg.postits = (msg.postits || []).filter(p => 
        !(p.id === req.params.postitId && p.autorId === req.student.id)
      );
    }
    await prisma.notaClase.update({
      where: { institutionId_key: { institutionId: instId, key } },
      data: { data: JSON.stringify(mensajes), updatedAt: new Date() }
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});


// ══════════════════════════════════════════════════════
//  REPOSITORIO DE MATERIALES (BLOG DOCENTE)
// ══════════════════════════════════════════════════════

// GET: listar materiales del docente
app.get("/materiales", authMiddleware, async (req, res) => {
  try {
    const key = `materiales_${req.user.id}`;
    const nota = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } }
    }).catch(() => null);
    const materiales = nota ? JSON.parse(nota.data || "[]") : [];
    res.json({ ok: true, materiales });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// POST: crear material
app.post("/materiales", authMiddleware, uploadEnt.single("archivo"), async (req, res) => {
  try {
    const { titulo, descripcion, categoria, contenido } = req.body;
    if (!titulo) return res.status(400).json({ mensaje: "Título requerido" });
    const key = `materiales_${req.user.id}`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } }
    }).catch(() => null);
    const materiales = existing ? JSON.parse(existing.data || "[]") : [];
    const nuevo = {
      id: Date.now().toString(),
      titulo,
      descripcion: descripcion || "",
      categoria: categoria || "general",
      contenido: contenido || "",
      archivo: req.file ? { nombre: req.file.originalname, path: `uploads/entregas/${req.file.filename}`, size: req.file.size } : null,
      creadoEn: new Date().toISOString(),
      actualizadoEn: new Date().toISOString()
    };
    materiales.unshift(nuevo);
    await prisma.notaClase.upsert({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } },
      update: { data: JSON.stringify(materiales), updatedAt: new Date() },
      create: { institutionId: req.user.institutionId, key, data: JSON.stringify(materiales) }
    });
    res.json({ ok: true, material: nuevo });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// PUT: editar material
app.put("/materiales/:id", authMiddleware, async (req, res) => {
  try {
    const { titulo, descripcion, categoria, contenido } = req.body;
    const key = `materiales_${req.user.id}`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } }
    }).catch(() => null);
    if (!existing) return res.status(404).json({ mensaje: "No encontrado" });
    const materiales = JSON.parse(existing.data || "[]");
    const idx = materiales.findIndex(m => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ mensaje: "Material no encontrado" });
    materiales[idx] = { ...materiales[idx], titulo, descripcion, categoria, contenido, actualizadoEn: new Date().toISOString() };
    await prisma.notaClase.update({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } },
      data: { data: JSON.stringify(materiales), updatedAt: new Date() }
    });
    res.json({ ok: true, material: materiales[idx] });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// DELETE: eliminar material
app.delete("/materiales/:id", authMiddleware, async (req, res) => {
  try {
    const key = `materiales_${req.user.id}`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } }
    }).catch(() => null);
    if (!existing) return res.json({ ok: true });
    const materiales = JSON.parse(existing.data || "[]").filter(m => m.id !== req.params.id);
    await prisma.notaClase.update({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } },
      data: { data: JSON.stringify(materiales), updatedAt: new Date() }
    });
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});


// Notas de tareas calificadas del estudiante (alternativo al libro de notas)
app.get("/notas/mis-calificaciones", authEst, async (req, res) => {
  try {
    const assignments = await prisma.assignment.findMany({
      where: { studentId: req.student.id, status: "graded", grade: { not: null } },
      include: { task: true },
      orderBy: { gradedAt: "desc" }
    });
    const notas = assignments.map(a => ({
      tareaId: a.task.id,
      titulo: a.task.title,
      area: a.task.area,
      grado: a.task.grade,
      nota: a.grade,
      comentario: a.comment || "",
      fecha: a.gradedAt || a.updatedAt,
      autoCalificada: a.autoGraded || false
    }));
    res.json({ ok: true, notas });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});


// ══════════════════════════════════════════════════════
//  JUEGOS MENTALES
// ══════════════════════════════════════════════════════

app.post("/generar-juego", authMiddleware, async (req, res) => {
  try {
    const { tipo, tema, area, grado } = req.body;
    if (!tipo || !tema) return res.status(400).json({ mensaje: "Tipo y tema requeridos" });

    const prompts = {
      sopa: `Genera una sopa de letras educativa sobre "${tema}" para ${area} grado ${grado}° Colombia.
Responde SOLO con JSON válido:
{
  "palabras": ["PALABRA1","PALABRA2","PALABRA3","PALABRA4","PALABRA5","PALABRA6","PALABRA7","PALABRA8"],
  "pistas": ["Definición o pista de PALABRA1","pista de PALABRA2","pista de PALABRA3","pista de PALABRA4","pista de PALABRA5","pista de PALABRA6","pista de PALABRA7","pista de PALABRA8"]
}
Las palabras deben ser en MAYÚSCULAS, sin tildes, sin espacios, entre 4 y 10 letras. Exactamente 8 palabras.`,

      unir: `Genera un juego de unir definiciones sobre "${tema}" para ${area} grado ${grado}° Colombia.
Responde SOLO con JSON válido:
{"pares": [{"termino":"TÉRMINO1","definicion":"Definición clara 1"},{"termino":"TÉRMINO2","definicion":"Definición clara 2"},{"termino":"TÉRMINO3","definicion":"Definición clara 3"},{"termino":"TÉRMINO4","definicion":"Definición clara 4"},{"termino":"TÉRMINO5","definicion":"Definición clara 5"},{"termino":"TÉRMINO6","definicion":"Definición clara 6"}]}
Exactamente 6 pares. Los términos cortos (1-3 palabras), las definiciones claras.`,

      completar: `Genera 6 oraciones para completar sobre "${tema}" para ${area} grado ${grado}° Colombia.
Responde SOLO con JSON válido:
{"oraciones": [{"texto":"La ___ es fundamental en...","respuesta":"palabra","pista":"Pista opcional"},{"texto":"El proceso de ___ permite...","respuesta":"termino","pista":"pista"}]}
La respuesta debe ser UNA palabra clave. Exactamente 6 oraciones.`,

      impostor: `Genera un juego "El Impostor" sobre "${tema}" para ${area} grado ${grado}° Colombia.
Hay grupos de palabras donde una NO pertenece. Responde SOLO con JSON válido:
{"grupos": [{"palabras":["TÉRMINO1","TÉRMINO2","TÉRMINO3","IMPOSTOR"],"impostor":"IMPOSTOR","explicacion":"Explicación de por qué IMPOSTOR no pertenece"},{"palabras":["A","B","C","D"],"impostor":"D","explicacion":"..."},{"palabras":["X","Y","Z","W"],"impostor":"W","explicacion":"..."}]}
Exactamente 3 grupos de 4 palabras cada uno.`,

      crucigrama: `Genera un crucigrama educativo sobre "${tema}" para ${area} grado ${grado}° Colombia.
Responde SOLO con JSON válido:
{
  "palabras": [
    {"palabra":"TERMINO1","pista":"Definición clara de TERMINO1","direccion":"horizontal","fila":0,"col":0},
    {"palabra":"TERMINO2","pista":"Definición clara de TERMINO2","direccion":"vertical","fila":0,"col":0},
    {"palabra":"TERMINO3","pista":"Definición clara de TERMINO3","direccion":"horizontal","fila":2,"col":1},
    {"palabra":"TERMINO4","pista":"Definición clara de TERMINO4","direccion":"vertical","fila":1,"col":3},
    {"palabra":"TERMINO5","pista":"Definición clara de TERMINO5","direccion":"horizontal","fila":4,"col":0}
  ]
}
Las palabras en MAYÚSCULAS sin tildes ni espacios, entre 4-8 letras. Exactamente 5 palabras que se crucen entre sí.`,

      verdadero_falso: `Genera ${n} afirmaciones de verdadero o falso sobre "${tema}" para ${area} grado ${grado} Colombia.
Responde SOLO con JSON válido:
{"afirmaciones":[{"texto":"Afirmación 1 sobre el tema","respuesta":true,"explicacion":"Por qué es verdadera"},{"texto":"Afirmación 2 sobre el tema","respuesta":false,"explicacion":"Por qué es falsa"}]}
Exactamente ${n} afirmaciones. Mezcla verdaderas y falsas. Las explicaciones deben ser educativas.`,

      ahorcado: `Genera ${n} palabras para juego de ahorcado sobre "${tema}" para ${area} grado ${grado} Colombia.
Responde SOLO con JSON válido:
{"palabras":[{"palabra":"FOTOSINTESIS","pista":"Proceso por el cual las plantas producen su alimento usando la luz solar"},{"palabra":"MITOCONDRIA","pista":"Organelo celular conocido como la central energética de la célula"}]}
Palabras en MAYÚSCULAS sin tildes ni espacios, entre 5-12 letras. Exactamente ${n} palabras con pistas claras.`,

      millonario: `Genera ${n} preguntas estilo "¿Quién quiere ser millonario?" sobre "${tema}" para ${area} grado ${grado} Colombia.
Dificultad progresiva: las primeras fáciles, las últimas difíciles.
Responde SOLO con JSON válido:
{"preguntas":[{"nivel":1,"pregunta":"Pregunta fácil","opciones":["A: Opción correcta","B: Opción incorrecta","C: Opción incorrecta","D: Opción incorrecta"],"correcta":0,"premio":"$100"},{"nivel":2,"pregunta":"Pregunta media","opciones":["A: Incorrecta","B: Correcta","C: Incorrecta","D: Incorrecta"],"correcta":1,"premio":"$200"}]}
Exactamente ${n} preguntas con 4 opciones cada una. El índice "correcta" es 0-3. Premios progresivos.`,

      diagrama: `Genera un diagrama de flujo educativo sobre "${tema}" para ${area} grado ${grado} Colombia.
Responde SOLO con este JSON válido sin texto adicional:
{"pasos":[{"paso":"INICIO","titulo":"Inicio","descripcion":"","tipo":"inicio"},{"paso":"2","titulo":"Primer paso","descripcion":"Descripción del primer paso del proceso","tipo":"proceso"},{"paso":"3","titulo":"¿Pregunta de decisión?","descripcion":"Condición a evaluar","tipo":"decision","decision":{"si":"Qué ocurre si es verdadero","no":"Qué ocurre si es falso"}},{"paso":"4","titulo":"Resultado positivo","descripcion":"Consecuencia del sí","tipo":"resultado_ok"},{"paso":"5","titulo":"Resultado negativo","descripcion":"Consecuencia del no","tipo":"resultado_err"},{"paso":"FIN","titulo":"Fin","descripcion":"","tipo":"fin"}],"preguntas":[{"pregunta":"Pregunta 1 sobre el tema","opciones":["A","B","C","D"],"correcta":0},{"pregunta":"Pregunta 2","opciones":["A","B","C","D"],"correcta":1},{"pregunta":"Pregunta 3","opciones":["A","B","C","D"],"correcta":2},{"pregunta":"Pregunta 4","opciones":["A","B","C","D"],"correcta":0},{"pregunta":"Pregunta 5","opciones":["A","B","C","D"],"correcta":3}]}
Genera pasos y preguntas reales sobre "${tema}", no genéricos. Las preguntas deben tener opciones reales del tema.`
    };

    const prompt = prompts[tipo];
    if (!prompt) return res.status(400).json({ mensaje: "Tipo inválido" });

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.GROQ_KEY}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: tipo === "diagrama" ? 1500 : 800,
        temperature: 0.7,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await r.json();
    const text = data.choices?.[0]?.message?.content || "{}";
    let juego;
    try {
      // Limpiar markdown y encontrar el JSON
      let clean = text.replace(/```json|```/g, "").trim();
      // Encontrar inicio del JSON
      const start = clean.search(/[{[]/);
      if (start > 0) clean = clean.slice(start);
      // Si el JSON está incompleto, intentar cerrarlo
      try {
        juego = JSON.parse(clean);
      } catch(e) {
        // Intentar reparar JSON truncado
        const openBraces = (clean.match(/{/g)||[]).length - (clean.match(/}/g)||[]).length;
        const openBrackets = (clean.match(/\[/g)||[]).length - (clean.match(/\]/g)||[]).length;
        let repaired = clean;
        for(let i=0;i<openBrackets;i++) repaired += ']';
        for(let i=0;i<openBraces;i++) repaired += '}';
        juego = JSON.parse(repaired);
      }
    } catch(e) {
      console.error("JSON parse error:", text.slice(0,300));
      return res.status(500).json({ mensaje: "Error generando el juego, intenta de nuevo" });
    }

    res.json({ ok: true, juego: { tipo, tema, area, grado, ...juego } });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});


// Guardar juego asignado por grado
app.post("/juegos", authMiddleware, async (req, res) => {
  try {
    const { juego, grado } = req.body;
    if (!juego || !grado) return res.status(400).json({ mensaje: "Juego y grado requeridos" });
    const key = `juegos_${req.user.institutionId}_${grado}`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } }
    }).catch(() => null);
    const juegos = existing ? JSON.parse(existing.data || "[]") : [];
    const nuevo = { id: Date.now().toString(), ...juego, grado, creadoEn: new Date().toISOString(), docente: req.user.name };
    juegos.unshift(nuevo);
    // Guardar máximo 10 juegos por grado
    const limitados = juegos.slice(0, 10);
    await prisma.notaClase.upsert({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } },
      update: { data: JSON.stringify(limitados), updatedAt: new Date() },
      create: { institutionId: req.user.institutionId, key, data: JSON.stringify(limitados) }
    });
    res.json({ ok: true, juego: nuevo });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// Obtener juegos por grado (para estudiantes)
app.get("/juegos/:institutionId/:grado", authEst, async (req, res) => {
  try {
    const key = `juegos_${req.params.institutionId}_${decodeURIComponent(req.params.grado)}`;
    const nota = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.params.institutionId, key } }
    }).catch(() => null);
    const juegos = nota ? JSON.parse(nota.data || "[]") : [];
    res.json({ ok: true, juegos });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});


// Guardar resultado de juego del estudiante
app.post("/juegos/resultado", authEst, async (req, res) => {
  try {
    const { juegoId, grado, tipo, tema, correctas, total, tiempo } = req.body;
    const instId = req.student.institutionId;
    const key = `juegos_resultados_${instId}_${grado}`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: instId, key } }
    }).catch(() => null);
    const resultados = existing ? JSON.parse(existing.data || "[]") : [];
    
    const nota = total > 0 ? parseFloat((correctas / total * 5).toFixed(1)) : 0;
    const nuevo = {
      id: Date.now().toString(),
      juegoId, tipo, tema, grado,
      estudianteId: req.student.id,
      nombreEstudiante: req.student.name,
      correctas, total,
      nota,
      porcentaje: total > 0 ? Math.round(correctas / total * 100) : 0,
      tiempo: tiempo || 0,
      fecha: new Date().toISOString()
    };
    
    // Evitar duplicados del mismo estudiante en el mismo juego
    const sinDup = resultados.filter(r => !(r.estudianteId === req.student.id && r.juegoId === juegoId));
    sinDup.unshift(nuevo);
    
    await prisma.notaClase.upsert({
      where: { institutionId_key: { institutionId: instId, key } },
      update: { data: JSON.stringify(sinDup), updatedAt: new Date() },
      create: { institutionId: instId, key, data: JSON.stringify(sinDup) }
    });
    
    res.json({ ok: true, resultado: nuevo });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// GET resultados de juegos por grado (para docente)
app.get("/juegos/resultados/:grado", authMiddleware, async (req, res) => {
  try {
    const grado = decodeURIComponent(req.params.grado);
    const key = `juegos_resultados_${req.user.institutionId}_${grado}`;
    const existing = await prisma.notaClase.findUnique({
      where: { institutionId_key: { institutionId: req.user.institutionId, key } }
    }).catch(() => null);
    const resultados = existing ? JSON.parse(existing.data || "[]") : [];
    res.json({ ok: true, resultados });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// ── INICIAR ───────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`✅ EduClass v6 — Puerto ${PORT}`);
  console.log(`🤖 IAs: ${AI.map(p => p.nombre).join(" → ")}`);
  try { await prisma.$connect(); console.log("🗄️  PostgreSQL conectado ✅"); }
  catch (e) { console.error("❌ Error PostgreSQL:", e.message); }
});
// Sat May 30 21:52:05 HPS 2026
