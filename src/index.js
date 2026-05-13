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
    const token = jwt.sign({ id: user.id, role: "teacher", institutionId: user.institutionId }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ usuario: pub, token });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
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
    const { usuario, password } = req.body;
    const student = await prisma.student.findUnique({ where: { username: usuario }, include: { institution: true } });
    if (!student) return res.status(401).json({ mensaje: "Usuario no encontrado" });
    if (!await bcrypt.compare(password || "", student.password)) return res.status(401).json({ mensaje: "Contraseña incorrecta" });
    const { password: _, ...pub } = student;
    const token = jwt.sign({ id: student.id, role: "student", institutionId: student.institutionId }, JWT_SECRET, { expiresIn: "30d" });
    res.json({ ok: true, estudiante: pub, token });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

// ── ESTUDIANTES ───────────────────────────────────────
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
    const { titulo, descripcion, tipo, actividad, area, grado, fechaEntrega, asignarGrado, estudiantesIds } = req.body;
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
        title: titulo, description: descripcion || "", type: tipo || "taller",
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
      tieneArchivo: !!a.fileName, archivoNombre: a.fileName,
      autoCalificada: a.autoGraded, porcentajeAuto: a.detail?.porcentaje || null,
      estado: a.status === "graded" ? "calificado" : a.status === "submitted" ? "entregado" : "pendiente"
    }));
    res.json({ listadoCompleto: listado, total: listado.length, totalEntregas: listado.filter(e => e.entregada).length, totalPendientes: listado.filter(e => !e.entregada).length, totalCalificados: listado.filter(e => e.calificacion != null).length });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.post("/tasks/calificar", authMiddleware, async (req, res) => {
  try {
    const { entregaId, calificacion, comentario } = req.body;
    const a = await prisma.assignment.update({ where: { id: entregaId }, data: { grade: parseFloat(calificacion), comment: comentario || "", status: "graded", gradedAt: new Date() } });
    res.json({ ok: true, entrega: a });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
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
    const assignments = await prisma.assignment.findMany({
      where: { studentId: req.student.id },
      include: { task: true },
      orderBy: { createdAt: "desc" }
    });
    const ahora = new Date();
    res.json({
      tareas: assignments.map(a => ({
        id: a.task.id, titulo: a.task.title, descripcion: a.task.description,
        tipo: a.task.type, area: a.task.area, grado: a.task.grade,
        fechaEntrega: a.task.dueDate, actividad: a.task.activity,
        entregada: a.status !== "pending",
        vencida: a.task.dueDate && new Date(a.task.dueDate) < ahora && a.status === "pending",
        calificacion: a.grade, comentario: a.comment || "", entregaId: a.id
      }))
    });
  } catch (e) { res.status(500).json({ mensaje: e.message }); }
});

app.post("/tasks/entregar", authEst, uploadEnt.single("archivo"), async (req, res) => {
  try {
    const { tareaId, respuesta, respuestasActividad } = req.body;
    const assignment = await prisma.assignment.findFirst({ where: { taskId: tareaId, studentId: req.student.id }, include: { task: true } });
    if (!assignment) return res.status(404).json({ mensaje: "No tienes esta tarea asignada" });

    const respAct = respuestasActividad ? JSON.parse(respuestasActividad) : {};
    let grade = null, autoGraded = false, detail = null;

    if (["quiz", "completar", "verdadero_falso"].includes(assignment.task.type) && assignment.task.activity?.preguntas) {
      let correctas = 0, total = 0; const detalles = [];
      assignment.task.activity.preguntas.forEach((p, i) => {
        const ref = (p.correcta || p.respuesta || "").toString().trim().toLowerCase();
        if (!ref) return; total++;
        const est = (respAct[i] || "").toString().trim().toLowerCase();
        const ok = est === ref || (assignment.task.type === "completar" && est.includes(ref));
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
      completar: `Genera ${n} oraciones completar sobre "${tema}" ${area} grado ${grado}°. JSON SOLO: {"preguntas":[{"enunciado":"___","respuesta":""}]}`,
      verdadero_falso: `Genera ${n} afirmaciones V/F sobre "${tema}" ${area} grado ${grado}°. JSON SOLO: {"preguntas":[{"afirmacion":"","respuesta":"Verdadero"}]}`,
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
    const user = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!user) return res.json({ ok: true, asignaciones: [] });
    const asignaciones = user.asignaciones ? JSON.parse(user.asignaciones) : [];
    res.json({ ok: true, asignaciones });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// PUT: guardar asignaciones de un docente
app.put("/asignaciones/:userId", async (req, res) => {
  try {
    const { asignaciones } = req.body;
    if (!Array.isArray(asignaciones)) return res.status(400).json({ mensaje: "Inválido" });
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { asignaciones: JSON.stringify(asignaciones) }
    });
    res.json({ ok: true, mensaje: "Asignaciones guardadas" });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// GET: todos los docentes con asignaciones
app.get("/todos-docentes-asignaciones", async (req, res) => {
  try {
    const users = await prisma.user.findMany({ select: { id:true, name:true, email:true, cargo:true, asignaciones:true } });
    const docentes = users.map(u => ({
      ...u,
      asignaciones: u.asignaciones ? JSON.parse(u.asignaciones) : []
    }));
    res.json({ ok: true, docentes });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// ══════════════════════════════════════════════════════
//  MALLAS CURRICULARES
// ══════════════════════════════════════════════════════

// GET: malla de una institución/área
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

// ── INICIAR ───────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`✅ EduClass v6 — Puerto ${PORT}`);
  console.log(`🤖 IAs: ${AI.map(p => p.nombre).join(" → ")}`);
  try { await prisma.$connect(); console.log("🗄️  PostgreSQL conectado ✅"); }
  catch (e) { console.error("❌ Error PostgreSQL:", e.message); }
});
