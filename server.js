// ======================================================
//  EduClass Premium — server.js v4 MULTI-API
//  Rotación automática entre 4 IAs gratuitas
// ======================================================
const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const fs       = require("fs");
const multer   = require("multer");
const { v4: uuidv4 } = require("uuid");
const bcrypt   = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

const DB_PATH      = path.join(__dirname, "data", "db.json");
const UPLOAD_DIR   = path.join(__dirname, "uploads");
const ENTREGAS_DIR = path.join(__dirname, "uploads", "entregas");
[path.join(__dirname,"data"), UPLOAD_DIR, ENTREGAS_DIR]
  .forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive:true }); });

// ── DB ────────────────────────────────────────────────
const leerDB = () => {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
      usuarios:[], estudiantesReg:[], clases:[], tareas:[], estudiantes:[], entregas:[]
    }, null, 2));
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
  if (!db.usuarios)       db.usuarios       = [];
  if (!db.estudiantesReg) db.estudiantesReg = [];
  if (!db.clases)         db.clases         = [];
  if (!db.tareas)         db.tareas         = [];
  if (!db.estudiantes)    db.estudiantes    = [];
  if (!db.entregas)       db.entregas       = [];
  const normId = s => (s||"").toLowerCase().trim().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
  db.usuarios.forEach(u => { if (!u.institucionId) u.institucionId = normId(u.institucion); });
  db.estudiantesReg.forEach(e => { if (!e.institucionId) e.institucionId = normId(e.institucion); });
  return db;
};
const guardarDB = db => fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

// ── Multer logos ──────────────────────────────────────
const storageLogo = multer.diskStorage({
  destination: (_r, _f, cb) => cb(null, UPLOAD_DIR),
  filename:    (_r, f,  cb) => cb(null, `logo_${uuidv4()}${path.extname(f.originalname)}`)
});
const uploadFields = multer({ storage:storageLogo, limits:{ fileSize:5*1024*1024 } })
  .fields([{ name:"logo", maxCount:1 }, { name:"bandera", maxCount:1 }]);

const storageEnt = multer.diskStorage({
  destination: (_r, _f, cb) => cb(null, ENTREGAS_DIR),
  filename:    (_r, f,  cb) => cb(null, `ent_${uuidv4()}${path.extname(f.originalname)}`)
});
const uploadEnt = multer({ storage:storageEnt, limits:{ fileSize:20*1024*1024 } });

// ======================================================
//  SISTEMA DE ROTACION AUTOMATICA DE APIs
// ======================================================

// ⚠️ REEMPLAZA ESTAS KEYS CON TUS KEYS NUEVAS
const AI_PROVIDERS = [
  {
    nombre: "Groq",
    apiKey: "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",
    tipo: "groq",
    activa: true,
    errores: 0
  },
  {
    nombre: "Together AI",
    apiKey: "key_CaZ5Mu31v1iosxCHfAMBV",
    tipo: "together",
    activa: true,
    errores: 0
  },
  {
    nombre: "OpenRouter",
    apiKey: "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",
    tipo: "openrouter",
    activa: true,
    errores: 0
  },
  {
    nombre: "Gemini",
    apiKey: "AIzaSyDp6YzpF_cd0d5VqcZ9IUAYTo0QoTsx9LQ",
    tipo: "gemini",
    activa: true,
    errores: 0
  }
];

let proveedorActual = 0;

// Obtener siguiente proveedor disponible
const getSiguienteProveedor = () => {
  for (let i = 0; i < AI_PROVIDERS.length; i++) {
    const idx = (proveedorActual + i) % AI_PROVIDERS.length;
    if (AI_PROVIDERS[idx].activa) {
      proveedorActual = idx;
      return AI_PROVIDERS[idx];
    }
  }
  // Si todas fallaron, resetear y volver a intentar
  AI_PROVIDERS.forEach(p => { p.activa = true; p.errores = 0; });
  proveedorActual = 0;
  return AI_PROVIDERS[0];
};

const marcarError = (proveedor) => {
  proveedor.errores++;
  if (proveedor.errores >= 2) {
    proveedor.activa = false;
    console.log(`⚠️ ${proveedor.nombre} desactivado temporalmente`);
    // Reactivar después de 10 minutos
    setTimeout(() => {
      proveedor.activa = true;
      proveedor.errores = 0;
      console.log(`✅ ${proveedor.nombre} reactivado`);
    }, 10 * 60 * 1000);
  }
  // Pasar al siguiente
  proveedorActual = (proveedorActual + 1) % AI_PROVIDERS.length;
};

// Llamada universal a la IA con rotación automática
const llamarIA = async (prompt, systemPrompt = "", maxTokens = 4096, temperatura = 0.7) => {
  let intentos = 0;
  const maxIntentos = AI_PROVIDERS.length;

  while (intentos < maxIntentos) {
    const proveedor = getSiguienteProveedor();
    console.log(`🤖 Intentando con: ${proveedor.nombre}`);

    try {
      let respuesta = "";

      if (proveedor.tipo === "groq") {
        const Groq = require("groq-sdk");
        const groq = new Groq({ apiKey: proveedor.apiKey });
        const resp = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          max_tokens: maxTokens,
          temperature: temperatura,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user",   content: prompt }
          ]
        });
        respuesta = resp.choices[0].message.content;

      } else if (proveedor.tipo === "together") {
        const resp = await fetch("https://api.together.xyz/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${proveedor.apiKey}`
          },
          body: JSON.stringify({
            model: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            max_tokens: maxTokens,
            temperature: temperatura,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user",   content: prompt }
            ]
          })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message || "Error Together AI");
        respuesta = data.choices[0].message.content;

      } else if (proveedor.tipo === "openrouter") {
        const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${proveedor.apiKey}`,
            "HTTP-Referer": "https://educlass-frontend.vercel.app",
            "X-Title": "EduClass Premium"
          },
          body: JSON.stringify({
            model: "meta-llama/llama-3.3-70b-instruct:free",
            max_tokens: maxTokens,
            temperature: temperatura,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user",   content: prompt }
            ]
          })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message || "Error OpenRouter");
        respuesta = data.choices[0].message.content;

      } else if (proveedor.tipo === "gemini") {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${proveedor.apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [{ text: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt }]
              }],
              generationConfig: {
                maxOutputTokens: maxTokens,
                temperature: temperatura
              }
            })
          }
        );
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error?.message || "Error Gemini");
        respuesta = data.candidates[0].content.parts[0].text;
      }

      console.log(`✅ Respuesta exitosa de: ${proveedor.nombre}`);
      proveedor.errores = 0; // Reset errores si funcionó
      return respuesta;

    } catch (error) {
      console.error(`❌ Error con ${proveedor.nombre}:`, error.message);
      marcarError(proveedor);
      intentos++;
    }
  }

  throw new Error("Todos los proveedores de IA fallaron. Intenta más tarde.");
};

// Estado de los proveedores (para monitoreo)
app.get("/estado-ia", (_req, res) => {
  res.json({
    proveedores: AI_PROVIDERS.map(p => ({
      nombre: p.nombre,
      activa: p.activa,
      errores: p.errores,
      actual: AI_PROVIDERS.indexOf(p) === proveedorActual
    }))
  });
});

// ======================================================
//  SALUD
// ======================================================
app.get("/", (_req, res) => res.json({ ok:true, msg:"EduClass v4 Multi-IA ✅" }));

// ======================================================
//  AUTH DOCENTES
// ======================================================
app.post("/registro", async (req, res) => {
  try {
    const { nombre, email, password, institucion, cargo, ciudad } = req.body;
    if (!nombre||!email||!password) return res.status(400).json({ mensaje:"Completa nombre, correo y contraseña" });
    const db = leerDB();
    if (db.usuarios.find(u => u.email === email))
      return res.status(400).json({ mensaje:"Correo ya registrado" });
    const hash = await bcrypt.hash(password, 10);
    const instId = (institucion||"sin_institucion").toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
    db.usuarios.push({ id:uuidv4(), nombre, email, password:hash,
      institucion:institucion||"", institucionId:instId, cargo:cargo||"Docente", ciudad:ciudad||"",
      logoPath:"", banderaPath:"", creadoEn:new Date().toISOString() });
    guardarDB(db);
    res.json({ mensaje:"Registro exitoso ✅" });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const db = leerDB();
    const u  = db.usuarios.find(u => u.email === email);
    if (!u) return res.status(401).json({ mensaje:"Correo no registrado" });
    if (!await bcrypt.compare(password||"", u.password))
      return res.status(401).json({ mensaje:"Contraseña incorrecta" });
    const { password:_, ...pub } = u;
    res.json({ usuario:pub });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.post("/actualizar-perfil", uploadFields, async (req, res) => {
  try {
    const { userId, nombre, institucion, cargo, ciudad } = req.body;
    const db  = leerDB();
    const idx = db.usuarios.findIndex(u => u.id === userId);
    if (idx===-1) return res.status(404).json({ mensaje:"No encontrado" });
    if (nombre)      db.usuarios[idx].nombre      = nombre;
    if (institucion) {
      db.usuarios[idx].institucion  = institucion;
      db.usuarios[idx].institucionId = institucion.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
    }
    if (cargo)       db.usuarios[idx].cargo        = cargo;
    if (ciudad)      db.usuarios[idx].ciudad       = ciudad;
    if (req.files?.logo?.[0])    db.usuarios[idx].logoPath    = `uploads/${req.files.logo[0].filename}`;
    if (req.files?.bandera?.[0]) db.usuarios[idx].banderaPath = `uploads/${req.files.bandera[0].filename}`;
    guardarDB(db);
    const { password:_, ...pub } = db.usuarios[idx];
    res.json({ usuario:pub, mensaje:"Perfil actualizado ✅" });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

// ======================================================
//  ESTUDIANTES
// ======================================================
app.post("/registro-estudiante", async (req, res) => {
  try {
    const { nombre, usuario, password, grado, institucion } = req.body;
    if (!nombre||!usuario||!password)
      return res.status(400).json({ mensaje:"Completa nombre, usuario y contraseña" });
    const db = leerDB();
    if (db.estudiantesReg.find(e => e.usuario === usuario))
      return res.status(400).json({ mensaje:"Ese usuario ya existe" });
    const hash = await bcrypt.hash(password, 10);
    const instIdEst = (institucion||"sin_institucion").toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
    db.estudiantesReg.push({ id:uuidv4(), nombre, usuario, password:hash,
      grado:grado||"", institucion:institucion||"", institucionId:instIdEst, creadoEn:new Date().toISOString() });
    guardarDB(db);
    res.json({ mensaje:"Cuenta creada ✅" });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.post("/login-estudiante-reg", async (req, res) => {
  try {
    const { usuario, password } = req.body;
    const db  = leerDB();
    const est = db.estudiantesReg.find(e => e.usuario === usuario);
    if (!est) return res.status(401).json({ mensaje:"Usuario no encontrado" });
    let ok = false;
    if (est.preRegistrado && est.passwordPlain) {
      ok = (password === est.passwordPlain);
      if (ok) {
        const idx = db.estudiantesReg.findIndex(e => e.id === est.id);
        db.estudiantesReg[idx].password = await bcrypt.hash(password, 10);
        db.estudiantesReg[idx].preRegistrado = false;
        guardarDB(db);
      }
    } else if (est.password) {
      ok = await bcrypt.compare(password||"", est.password);
    }
    if (!ok) return res.status(401).json({ mensaje:"Contraseña incorrecta" });
    const { password:_, passwordPlain:__, ...pub } = est;
    res.json({ ok:true, estudiante:pub });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/todos-estudiantes", (req, res) => {
  try {
    const db = leerDB();
    const docenteId = req.query.docenteId;
    const docente = docenteId ? db.usuarios.find(u => u.id === docenteId) : null;
    const instNorm = docente?.institucion ? docente.institucion.toLowerCase().trim() : null;
    const lista = db.estudiantesReg
      .filter(e => {
        if (!instNorm) return true; // si no hay docente, mostrar todos
        const eInstNorm = (e.institucion||"").toLowerCase().trim();
        return eInstNorm === instNorm || eInstNorm === "" || !e.institucion;
      })
      .map(e => ({ id:e.id, nombre:e.nombre, usuario:e.usuario, grado:e.grado, institucion:e.institucion }))
      .sort((a,b) => a.nombre.localeCompare(b.nombre));
    res.json({ estudiantes:lista });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/estudiantes-grado/:grado", (req, res) => {
  try {
    const db    = leerDB();
    const grado = req.params.grado;
    const docenteId = req.query.docenteId;
    const docente = docenteId ? db.usuarios.find(u => u.id === docenteId) : null;
    const instId = docente?.institucionId || null;
    const instNorm2 = docente?.institucion ? docente.institucion.toLowerCase().trim() : null;
    const lista = db.estudiantesReg
      .filter(e => {
        const gradoOk = e.grado===grado || e.grado===grado.replace("°","") || (e.grado+"°")===grado;
        if (!instNorm2) return gradoOk;
        const eInstNorm = (e.institucion||"").toLowerCase().trim();
        const instOk = eInstNorm === instNorm2 || eInstNorm === "" || !e.institucion;
        return gradoOk && instOk;
      })
      .map(e => ({ id:e.id, nombre:e.nombre, usuario:e.usuario, grado:e.grado }))
      .sort((a,b) => a.nombre.localeCompare(b.nombre));
    res.json({ estudiantes:lista });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/grados-disponibles", (req, res) => {
  try {
    const db = leerDB();
    const docenteId = req.query.docenteId;
    const docente = docenteId ? db.usuarios.find(u => u.id === docenteId) : null;
    const instId = docente?.institucionId || null;
    const instNorm3 = docente?.institucion ? docente.institucion.toLowerCase().trim() : null;
    const estudiantes = db.estudiantesReg.filter(e => {
      if (!instNorm3) return true;
      const eInstNorm = (e.institucion||"").toLowerCase().trim();
      return eInstNorm === instNorm3 || eInstNorm === "" || !e.institucion;
    });
    const grados = [...new Set(estudiantes.map(e => e.grado).filter(Boolean))].sort();
    res.json({ grados });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/mis-tareas-estudiante/:estudianteId", (req, res) => {
  try {
    const db          = leerDB();
    const estudianteId = req.params.estudianteId;
    const est         = db.estudiantesReg.find(e => e.id === estudianteId);
    const gradoEst    = est?.grado || "";
    const ahora       = new Date();
    const tareasAsignadas = db.tareas.filter(t => {
      if ((t.estudiantesReg||[]).includes(estudianteId)) return true;
      if (t.asignarGrado && t.asignarGrado !== "manual") {
        const gT = t.asignarGrado.replace("°","");
        const gE = gradoEst.replace("°","");
        if (gT===gE || t.asignarGrado===gradoEst || t.grado===gradoEst || t.grado===gE) return true;
      }
      return false;
    }).map(t => {
      const entrega = db.entregas.find(e => e.tareaId===t.id &&
        (e.estudianteRegId===estudianteId || e.estudianteId===estudianteId));
      let vencida = false;
      if (t.fechaEntrega) {
        const dl = new Date(t.fechaEntrega + "T23:59:59");
        vencida = ahora > dl && !entrega;
      }
      return { id:t.id, titulo:t.titulo, descripcion:t.descripcion, tipo:t.tipo,
        area:t.area, grado:t.grado, fechaEntrega:t.fechaEntrega,
        codigo:t.codigo, actividad:t.actividad, entregada:!!entrega, vencida,
        calificacion:entrega?.calificacion||null, comentario:entrega?.comentario||"",
        autoCalificada:entrega?.autoCalificada||false };
    });
    res.json({ tareas:tareasAsignadas });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.post("/unirse-tarea", (req, res) => {
  try {
    const { codigo, estudianteId } = req.body;
    const db    = leerDB();
    const tarea = db.tareas.find(t => t.codigo === (codigo||"").toUpperCase());
    if (!tarea) return res.status(404).json({ mensaje:"Código incorrecto" });
    if (!tarea.estudiantesReg) tarea.estudiantesReg = [];
    if (!tarea.estudiantesReg.includes(estudianteId)) {
      tarea.estudiantesReg.push(estudianteId);
      guardarDB(db);
    }
    res.json({ ok:true, mensaje:"Te uniste ✅" });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

// ======================================================
//  TAREAS
// ======================================================
app.post("/crear-tarea", (req, res) => {
  try {
    const { docenteId, titulo, descripcion, tipo, actividad, area, grado,
            fechaEntrega, asignarGrado, estudiantesRegIds } = req.body;
    const db     = leerDB();
    const codigo = Math.random().toString(36).substring(2,8).toUpperCase();
    const tareaId = uuidv4();
    const estudiantesRegAsignados = [];
    if (asignarGrado && asignarGrado !== "manual") {
      const gradoBase = asignarGrado.replace("°","");
      db.estudiantesReg
        .filter(e => e.grado===gradoBase || e.grado===asignarGrado || (e.grado+"°")===asignarGrado)
        .forEach(e => { if(!estudiantesRegAsignados.includes(e.id)) estudiantesRegAsignados.push(e.id); });
    }
    if (Array.isArray(estudiantesRegIds)) {
      estudiantesRegIds.forEach(id => {
        if(!estudiantesRegAsignados.includes(id)) estudiantesRegAsignados.push(id);
      });
    }
    const tarea = { id:tareaId, docenteId, titulo, descripcion,
      tipo:tipo||"taller", actividad:actividad||null, area, grado,
      asignarGrado:asignarGrado||"manual", fechaEntrega:fechaEntrega||"", codigo,
      estudiantesAsignados:[], estudiantesReg:estudiantesRegAsignados,
      creadaEn:new Date().toISOString(), estado:"activa" };
    db.tareas.push(tarea);
    guardarDB(db);
    res.json({ ok:true, tarea, mensaje:"Tarea creada ✅" });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/mis-tareas/:docenteId", (req, res) => {
  try {
    const db = leerDB();
    const tareas = db.tareas
      .filter(t => t.docenteId === req.params.docenteId)
      .sort((a,b) => new Date(b.creadaEn) - new Date(a.creadaEn))
      .map(t => {
        const entregas = db.entregas.filter(e => e.tareaId === t.id);
        const total    = (t.estudiantesAsignados?.length||0) + (t.estudiantesReg?.length||0);
        return { ...t, totalEntregas:entregas.length, totalEstudiantes:total,
                 pendientes:Math.max(0,total-entregas.length) };
      });
    res.json({ tareas });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/entregas-tarea/:tareaId", (req, res) => {
  try {
    const db    = leerDB();
    const tarea = db.tareas.find(t => t.id === req.params.tareaId);
    if (!tarea) return res.status(404).json({ mensaje:"No encontrada" });
    const entregas = db.entregas.filter(e => e.tareaId === req.params.tareaId);
    const regAsignados = (tarea.estudiantesReg||[]).map(id => {
      const est = db.estudiantesReg.find(e => e.id === id);
      return est ? { id:est.id, nombre:est.nombre, grado:est.grado } : null;
    }).filter(Boolean);
    const tempAsignados = (tarea.estudiantesAsignados||[]).map(e => ({ id:e.id, nombre:e.nombre, grado:tarea.grado }));
    const todosAsignados = [...regAsignados, ...tempAsignados];
    const listadoCompleto = todosAsignados.map(est => {
      const entrega = entregas.find(en => en.estudianteRegId===est.id || en.estudianteId===est.id);
      return { estudianteId:est.id, nombreEstudiante:est.nombre, grado:est.grado||tarea.grado,
        entregada:!!entrega, entregaId:entrega?.id||null, entregadoEn:entrega?.entregadoEn||null,
        resumenRespuesta:entrega?.respuesta?entrega.respuesta.substring(0,120):"",
        tieneArchivo:!!(entrega?.archivoNombre), archivoNombre:entrega?.archivoNombre||"",
        calificacion:entrega?.calificacion||null, comentario:entrega?.comentario||"",
        autoCalificada:entrega?.autoCalificada||false,
        porcentajeAuto:entrega?.resultadoDetalle?.porcentaje||null,
        estado:entrega?(entrega.calificacion?"calificado":"entregado"):"pendiente" };
    });
    res.json({ listadoCompleto, entregas,
      sinEntregar:listadoCompleto.filter(e=>!e.entregada),
      total:todosAsignados.length,
      totalEntregas:listadoCompleto.filter(e=>e.entregada).length,
      totalPendientes:listadoCompleto.filter(e=>!e.entregada).length,
      totalCalificados:listadoCompleto.filter(e=>e.calificacion!=null).length });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.post("/calificar-entrega", (req, res) => {
  try {
    const { entregaId, calificacion, comentario } = req.body;
    const db  = leerDB();
    const idx = db.entregas.findIndex(e => e.id === entregaId);
    if (idx===-1) return res.status(404).json({ mensaje:"No encontrada" });
    db.entregas[idx].calificacion = calificacion;
    db.entregas[idx].comentario   = comentario||"";
    db.entregas[idx].calificadoEn = new Date().toISOString();
    db.entregas[idx].estado       = "calificado";
    guardarDB(db);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.delete("/tarea/:id", (req, res) => {
  try {
    const db = leerDB();
    db.tareas      = db.tareas.filter(t => t.id !== req.params.id);
    db.estudiantes = db.estudiantes.filter(e => e.tareaId !== req.params.id);
    db.entregas    = db.entregas.filter(e => e.tareaId !== req.params.id);
    guardarDB(db);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.post("/entregar-tarea", uploadEnt.single("archivo"), (req, res) => {
  try {
    const { tareaId, estudianteId, estudianteRegId, respuesta, respuestasActividad } = req.body;
    const db    = leerDB();
    const estId = estudianteId || estudianteRegId;
    const est   = db.estudiantes.find(e=>e.id===estId) || db.estudiantesReg.find(e=>e.id===estId);
    if (!est) return res.status(404).json({ mensaje:"Estudiante no encontrado" });
    const idx     = db.entregas.findIndex(e => e.tareaId===tareaId &&
      (e.estudianteId===estId||e.estudianteRegId===estId));
    const respAct = respuestasActividad ? JSON.parse(respuestasActividad) : null;
    const tarea   = db.tareas.find(t => t.id === tareaId);
    let autoCalificada=false, notaAuto=null, resultadoDetalle=null;
    if (tarea && respAct && tarea.actividad?.preguntas && ["quiz","completar","verdadero_falso"].includes(tarea.tipo)) {
      let correctas=0, total=0; const detalle=[];
      tarea.actividad.preguntas.forEach((p,i)=>{
        const corrRef=(p.correcta||p.respuesta||"").toString().trim().toLowerCase();
        if(!corrRef) return; total++;
        const respEst=(respAct[i]||"").toString().trim().toLowerCase();
        const ok=respEst===corrRef||(tarea.tipo==="completar"&&respEst.includes(corrRef));
        if(ok) correctas++;
        detalle.push({ pregunta:p.pregunta||p.enunciado||p.afirmacion,
          respEst:respAct[i]||"", respCorrecta:p.correcta||p.respuesta, esCorrecta:ok });
      });
      if(total>0){ notaAuto=(correctas/total*5).toFixed(1); autoCalificada=true;
        resultadoDetalle={ correctas,total,porcentaje:Math.round(correctas/total*100),nota:notaAuto,detalle }; }
    }
    const entrega = { id:idx>=0?db.entregas[idx].id:uuidv4(), tareaId,
      estudianteId:estudianteId||null, estudianteRegId:estudianteRegId||null,
      nombreEstudiante:est.nombre, respuesta:respuesta||"", respuestasActividad:respAct,
      archivoPath:req.file?`uploads/entregas/${req.file.filename}`:(idx>=0?db.entregas[idx].archivoPath:""),
      archivoNombre:req.file?req.file.originalname:(idx>=0?db.entregas[idx].archivoNombre:""),
      entregadoEn:new Date().toISOString(),
      calificacion:autoCalificada?notaAuto:(idx>=0?db.entregas[idx].calificacion:null),
      comentario:idx>=0?db.entregas[idx].comentario:"",
      autoCalificada, resultadoDetalle, estado:"entregado" };
    if(idx>=0) db.entregas[idx]=entrega; else db.entregas.push(entrega);
    guardarDB(db);
    res.json({ ok:true, entrega, mensaje:"Tarea entregada ✅", autoCalificada, notaAuto, resultadoDetalle });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/descargar-entrega/:tareaId/:estudianteId", (req, res) => {
  try {
    const db = leerDB();
    const ent = db.entregas.find(e =>
      e.tareaId===req.params.tareaId &&
      (e.estudianteId===req.params.estudianteId||e.estudianteRegId===req.params.estudianteId));
    if (!ent?.archivoPath) return res.status(404).json({ mensaje:"Sin archivo" });
    const abs = path.join(__dirname, ent.archivoPath);
    if (!fs.existsSync(abs)) return res.status(404).json({ mensaje:"Archivo no existe" });
    res.download(abs, ent.archivoNombre||"entrega.pdf");
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

// ======================================================
//  GENERAR ACTIVIDAD IA (con rotación)
// ======================================================
app.post("/generar-actividad", async (req, res) => {
  try {
    const { tipo, tema, area, grado, cantidad } = req.body;
    const n = cantidad||5;
    const prompts = {
      quiz:            `Genera ${n} preguntas selección múltiple sobre "${tema}" para ${area} grado ${grado}° Colombia. JSON: {"preguntas":[{"pregunta":"","opciones":["A.","B.","C.","D."],"correcta":"A"}]}. Solo JSON.`,
      completar:       `Genera ${n} oraciones completar sobre "${tema}" ${area} grado ${grado}°. JSON: {"preguntas":[{"enunciado":"___","respuesta":""}]}. Solo JSON.`,
      verdadero_falso: `Genera ${n} afirmaciones V/F sobre "${tema}" ${area} grado ${grado}°. JSON: {"preguntas":[{"afirmacion":"","respuesta":"Verdadero"}]}. Solo JSON.`,
      relacionar:      `Genera ${n} pares relacionar sobre "${tema}" ${area} grado ${grado}°. JSON: {"pares":[{"columnaA":"","columnaB":""}]}. Solo JSON.`,
      taller:          `Genera ${n} preguntas abiertas sobre "${tema}" ${area} grado ${grado}°. JSON: {"preguntas":[{"pregunta":"","tipo":"abierta"}]}. Solo JSON.`,
      evaluacion:      `Genera evaluación mixta sobre "${tema}" ${area} grado ${grado}°. JSON: {"preguntas":[{"tipo":"seleccion","pregunta":"","opciones":["A.","B.","C.","D."],"correcta":"A"}]}. Solo JSON.`,
    };
    const systemPrompt = "Experto evaluación educativa colombiana. Responde SOLO JSON válido sin markdown.";
    const txt = await llamarIA(prompts[tipo]||prompts.taller, systemPrompt, 2000, 0.5);
    const limpio = txt.trim().replace(/```json|```/g,"").trim();
    try { res.json({ ok:true, actividad:JSON.parse(limpio), tipo }); }
    catch { res.json({ ok:true, actividad:{ preguntas:[] }, tipo }); }
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

// ======================================================
//  CLASES
// ======================================================
app.post("/guardar-clase", (req, res) => {
  try {
    const { userId, contenido, datos } = req.body;
    const db = leerDB();
    db.clases.push({ id:uuidv4(), userId, contenido, datos, creadaEn:new Date().toISOString() });
    guardarDB(db);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/mis-clases/:userId", (req, res) => {
  try {
    const db = leerDB();
    const clases = db.clases
      .filter(c => c.userId === req.params.userId)
      .sort((a,b) => new Date(b.creadaEn) - new Date(a.creadaEn))
      .map(c => ({ id:c.id, creadaEn:c.creadaEn, datos:c.datos, resumen:c.contenido?.substring(0,200) }));
    res.json({ clases });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/clase/:id", (req, res) => {
  try {
    const db    = leerDB();
    const clase = db.clases.find(c => c.id === req.params.id);
    if (!clase) return res.status(404).json({ mensaje:"No encontrada" });
    res.json({ clase });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.delete("/clase/:id", (req, res) => {
  try {
    const db = leerDB();
    db.clases = db.clases.filter(c => c.id !== req.params.id);
    guardarDB(db);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

// ======================================================
//  GENERAR GUÍA (con rotación automática de IA)
// ======================================================
app.post("/generar-guia", async (req, res) => {
  try {
    const { institucion,docente,area,grado,periodo,fecha,tema,
            tipoApertura,estratDesarrollo,retroalimentacion,
            tipoCierre,dejaTarea,estratTarea,duracion,cargo,ciudad,nivelEducativo } = req.body;
    const gradoNum=parseInt(grado)||6;
    const nivel=gradoNum<=5?"primaria":gradoNum<=9?"secundaria":"media académica";
    const durMin=parseInt(duracion)||55;
    const numHoras=Math.round(durMin/55);
    const durTexto=numHoras===1?"1 hora de clase (55 minutos)":`${numHoras} horas de clase (${durMin} minutos)`;

    const prompt = `Eres un pedagogo colombiano experto con 20 años de experiencia. Crea una guía PREMIUM para nivel ${nivelEducativo||nivel}.

DATOS:
Institución: ${institucion||"I.E."} | Docente: ${docente||"Docente"} (${cargo||"Docente"})
Ciudad: ${ciudad||"Colombia"} | Área: ${area} | Grado: ${grado}° | Periodo: ${periodo||"1"}
Fecha: ${fecha||new Date().toLocaleDateString("es-CO")} | Tema: ${tema} | Duración: ${durTexto}

ESTRATEGIAS: Apertura: ${tipoApertura} | Desarrollo: ${estratDesarrollo} | Retro: ${retroalimentacion} | Cierre: ${tipoCierre} | Tarea: ${dejaTarea?estratTarea:"Sin tarea"}

===APERTURA===
Redacta la apertura completa contextualizada en Colombia. Mínimo 8 líneas.

===SABERES_PREVIOS===
1. (pregunta diagnóstica sobre "${tema}")
2. (pregunta diagnóstica sobre "${tema}")
3. (pregunta diagnóstica sobre "${tema}")
4. (pregunta diagnóstica sobre "${tema}")

===DESARROLLO===
Contenido MUY COMPLETO sobre "${tema}" para ${nivelEducativo||nivel} grado ${grado}°.
Mínimo 5 subtemas con ## cada uno. Ejemplos reales Colombia.

===RETROALIMENTACION===
Actividad completa de retroalimentación sobre "${tema}".

===TALLER===
1. COMPRENSIÓN: 2 preguntas sobre "${tema}"
2. APLICACIÓN PRÁCTICA: 1 actividad concreta
3. PENSAMIENTO CRÍTICO: 1 pregunta analítica
4. CREATIVIDAD: 1 actividad creativa
5. INVESTIGACIÓN: 1 consulta con fuente

===CIERRE===
Cierre con síntesis, metacognición y conexión cotidiana.

===TAREA===
${dejaTarea?`Tarea con instrucciones claras sobre "${tema}".`:"Sin tarea para esta sesión."}

===EXTRAS===
OBJETIVO: (objetivo completo con verbo infinitivo para "${tema}")
COMPETENCIA: (competencia específica ${area} grado ${grado}°)
DBA: (DBA completo MEN Colombia ${area} grado ${grado}°)
ESTANDAR: (Estándar básico competencia MEN completo)
INDICADOR1: (indicadores SABER — 🟢Básico 🟡Intermedio 🔵Avanzado)
INDICADOR2: (indicadores HACER — mismos niveles)
INDICADOR3: (indicadores SER — mismos niveles)
EVIDENCIA: (evidencia aprendizaje observable)
EVALUACION: (3 preguntas abiertas + 2 selección múltiple + 1 actividad práctica)
RECURSOS: (5 recursos específicos numerados)
WEBGRAFIA: (3 fuentes APA reales)

Redacta en español impecable. Todo contextualizado Colombia.`;

    const systemPrompt = "Eres el mejor pedagogo de Colombia. OBLIGATORIO: usa EXACTAMENTE el formato ===NOMBRE_SECCION=== para cada sección. NUNCA omitas estas marcas. Ejemplo: ===APERTURA=== seguido del contenido. Guías de altísima calidad contextualizadas en Colombia.";
    const contenido = await llamarIA(prompt, systemPrompt, 4096, 0.7);
    res.json({ contenido, ok:true });
  } catch(e) {
    console.error("❌ Error generando guía:", e.message);
    res.status(500).json({ mensaje:e.message });
  }
});

// ======================================================
//  EXPORTAR WORD
// ======================================================
app.post("/exportar-word", async (req, res) => {
  try {
    const { contenido,institucion,docente,area,grado,periodo,tema,duracion,logoPath,banderaPath,cargo,ciudad,nivelEducativo } = req.body;
    const gradoN=parseInt(grado)||0;
    const nivelLabel=nivelEducativo==="preescolar"?"Preescolar":nivelEducativo==="primaria"?"Primaria":nivelEducativo==="media_tecnica"?"Media Técnica":nivelEducativo==="bachillerato"?"Bachillerato":gradoN<=5?"Primaria":gradoN<=9?"Bachillerato":"Media/Bachillerato";
    const { Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,AlignmentType,BorderStyle,WidthType,ShadingType,VerticalAlign,ImageRun } = require("docx");
    const bloques={};let secActual=null;
    for(const linea of contenido.split("\n")){const m=linea.match(/^===(\w+)===/);if(m){secActual=m[1];bloques[secActual]=[];continue;}if(secActual)bloques[secActual].push(linea);}
    // Si no hay secciones, distribuir el contenido completo en las secciones principales
    const tieneSecciones = Object.keys(bloques).length > 0;
    if (!tieneSecciones) {
      const lineas = contenido.split("\n");
      const total = lineas.length;
      const chunk = Math.floor(total / 5);
      bloques["APERTURA"]         = lineas.slice(0, chunk);
      bloques["SABERES_PREVIOS"]  = lineas.slice(chunk, chunk*2);
      bloques["DESARROLLO"]       = lineas.slice(chunk*2, chunk*3);
      bloques["RETROALIMENTACION"]= lineas.slice(chunk*3, chunk*4);
      bloques["CIERRE"]           = lineas.slice(chunk*4);
      bloques["TALLER"]           = lineas.slice(chunk, chunk*2);
      bloques["EXTRAS"]           = [];
    }
    const getB=k=>(bloques[k]||[]).join("\n").replace(/\*\*/g,"").replace(/##\s*/g,"").replace(/^[\s\n]+|[\s\n]+$/g,"") || contenido.substring(0,500);
    const AZUL="1B4F8A",AZUL_CL="D6E4F7",NEGRO="000000",GRIS="F2F2F2",BLANCO="FFFFFF";
    const bN={style:BorderStyle.SINGLE,size:6,color:NEGRO};const bA={style:BorderStyle.SINGLE,size:8,color:AZUL};
    const bAll={top:bN,bottom:bN,left:bN,right:bN};const bAllA={top:bA,bottom:bA,left:bA,right:bA};const TW=11106;
    const txt=(t,o={})=>new TextRun({text:t,font:"Times New Roman",size:o.size||24,bold:o.bold||false,italics:o.italic||false,color:o.color||NEGRO,...o});
    const par=(c,o={})=>new Paragraph({children:c,alignment:o.align||AlignmentType.BOTH,spacing:o.spacing||{before:40,after:40},...o});
    const cel=(c,o={})=>new TableCell({width:{size:o.w||1000,type:WidthType.DXA},margins:{top:80,bottom:80,left:100,right:100},shading:{fill:o.fill||BLANCO,type:ShadingType.CLEAR},verticalAlign:o.va||VerticalAlign.CENTER,borders:o.borders||bAll,children:c});
    const logoCell=(imgPath,w)=>{const abs=imgPath?path.join(__dirname,imgPath):null;if(abs&&fs.existsSync(abs)){try{const buf=fs.readFileSync(abs);return cel([par([new ImageRun({data:buf,transformation:{width:80,height:80},type:"png"})],{align:AlignmentType.CENTER})],{w,fill:BLANCO,borders:bAllA});}catch(_){}}return cel([par([txt("",{size:20})])],{w,fill:AZUL_CL,borders:bAllA});};
    const children=[];const LC=1300,RC=1300,CC=TW-LC-RC;
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[LC,CC,RC],borders:{top:bA,bottom:bA,left:bA,right:bA,insideH:bA,insideV:bA},rows:[new TableRow({children:[logoCell(logoPath,LC),cel([par([txt((institucion||"INSTITUCIÓN EDUCATIVA").toUpperCase(),{bold:true,size:24,color:AZUL})],{align:AlignmentType.CENTER,spacing:{before:60,after:20}}),par([txt("Aprobado según Decreto No. 0001295 del 04 Noviembre de 2009",{size:16})],{align:AlignmentType.CENTER,spacing:{before:0,after:0}}),par([txt("De la Secretaría de Educación del Caquetá",{size:16})],{align:AlignmentType.CENTER,spacing:{before:0,after:0}}),par([txt(`${ciudad||"Valparaíso"} - Caquetá`,{size:18,bold:true})],{align:AlignmentType.CENTER,spacing:{before:20,after:40}})],{w:CC,borders:bAllA}),logoCell(banderaPath,RC)]})]})  );
    children.push(par([txt("")]));
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("PLAN DE AULA",{bold:true,size:30,color:AZUL})],{align:AlignmentType.CENTER,spacing:{before:80,after:80}})],{w:TW,fill:AZUL_CL,borders:bAllA})]})]})  );
    const H=TW/2;children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[H,H],rows:[new TableRow({children:[cel([par([txt("Nombre del Docente: ",{bold:true}),txt(docente||"___")])],{w:H,borders:bAll}),cel([par([txt("Sede Educativa: ",{bold:true}),txt(institucion||"___")])],{w:H,borders:bAll})]})]})  );
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("INFORMACIÓN GENERAL",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]})  );
    const[c1,c2,c3,c4,c5,c6,c7,c8,c9]=[Math.round(TW*.07),Math.round(TW*.12),Math.round(TW*.07),Math.round(TW*.07),Math.round(TW*.08),Math.round(TW*.07),Math.round(TW*.07),Math.round(TW*.28),Math.round(TW*.06)];const c10v=TW-c1-c2-c3-c4-c5-c6-c7-c8-c9;
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[c1,c2,c3,c4,c5,c6,c7,c8,c9,c10v],rows:[new TableRow({children:[cel([par([txt("NIVEL",{bold:true,size:18})])],{w:c1,fill:GRIS,borders:bAll}),cel([par([txt(nivelLabel,{size:18})])],{w:c2,borders:bAll}),cel([par([txt("GRADO",{bold:true,size:18})])],{w:c3,fill:GRIS,borders:bAll}),cel([par([txt(grado||"",{size:18})])],{w:c4,borders:bAll}),cel([par([txt("PERÍODO",{bold:true,size:18})])],{w:c5,fill:GRIS,borders:bAll}),cel([par([txt("")])],{w:c6,borders:bAll}),cel([par([txt("ÁREA",{bold:true,size:18})])],{w:c7,fill:GRIS,borders:bAll}),cel([par([txt(area||"",{size:18})])],{w:c8,borders:bAll}),cel([par([txt("SEM",{bold:true,size:18})])],{w:c9,fill:GRIS,borders:bAll}),cel([par([txt("1",{size:18})])],{w:c10v,borders:bAll})]})]})  );
    const LBL=Math.round(TW*.13),VAL=TW-LBL;const fila2=(lb,vl)=>new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[LBL,VAL],rows:[new TableRow({children:[cel([par([txt(lb,{bold:true})])],{w:LBL,fill:GRIS,borders:bAll}),cel([par([txt(vl)])],{w:VAL,borders:bAll})]})]});
    const ex=getB("EXTRAS");
    const obj=ex.match(/OBJETIVO[:\s\n]+([^\n]{20,}[\s\S]*?)(?=\nCOMPETENCIA:|\nESTANDAR:|\nDBA:|\nINDICADOR|$)/i)?.[1]?.trim()||"Desarrollar competencias.";
    const rec=ex.match(/RECURSOS[:\s]+([\s\S]*?)(?=WEBGRAFIA:|$)/i)?.[1]?.trim()||"Talento humano, cuaderno.";
    const web=ex.match(/WEBGRAFIA[:\s]+([\s\S]*?)$/i)?.[1]?.trim()||"MEN lineamientos.";
    const evl=ex.match(/EVALUACION[:\s]+([\s\S]*?)(?=RECURSOS:|WEBGRAFIA:|$)/i)?.[1]?.trim()||"Oral y escrita.";
    const i1=ex.match(/INDICADOR1[:\s]+([\s\S]*?)(?=INDICADOR2:|$)/i)?.[1]?.trim()||"";
    const i2=ex.match(/INDICADOR2[:\s]+([\s\S]*?)(?=INDICADOR3:|$)/i)?.[1]?.trim()||"";
    const i3=ex.match(/INDICADOR3[:\s]+([\s\S]*?)(?=EVIDENCIA:|$)/i)?.[1]?.trim()||"";
    const dba=ex.match(/DBA[:\s\n]+([\s\S]*?)(?=ESTANDAR:|INDICADOR|EVIDENCIA:|CRITERIO:|RECURSOS:|WEBGRAFIA:|$)/i)?.[1]?.trim()||"";
    const std=ex.match(/ESTANDAR[:\s\n]+([\s\S]*?)(?=DBA:|INDICADOR|EVIDENCIA:|CRITERIO:|$)/i)?.[1]?.trim()||"";
    const evd=ex.match(/EVIDENCIA[:\s]+([\s\S]*?)(?=CRITERIO:|RECURSOS:|$)/i)?.[1]?.trim()||"";
    children.push(fila2("TEMA",tema));children.push(fila2("OBJETIVO",obj.substring(0,400)));children.push(fila2("RECURSOS",rec.substring(0,400)));children.push(fila2("WEBGRAFÍA",web.substring(0,400)));
    children.push(par([txt("")]));children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("REFERENTES NACIONALES DE CALIDAD",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]})  );
    const LR=Math.round(TW*.28),VR=TW-LR;
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[LR,VR],rows:[new TableRow({children:[cel([par([txt("ESTÁNDAR BÁSICO (MEN)",{bold:true})])],{w:LR,fill:GRIS,borders:bAll}),cel([par([txt(std.substring(0,400))])],{w:VR,borders:bAll})]}),new TableRow({children:[cel([par([txt("DBA — DERECHO BÁSICO",{bold:true})])],{w:LR,fill:GRIS,borders:bAll}),cel([par([txt(dba.substring(0,400))])],{w:VR,borders:bAll})]})]}));
    const S1=Math.round(TW*.18),S2=Math.round((TW-S1)/3),S3=S2,S4=TW-S1-S2-S3;
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[S1,S2,S3,S4],rows:[new TableRow({children:[cel([par([txt("INDICADORES",{bold:true})])],{w:S1,fill:GRIS,borders:bAll}),cel([par([txt("SABER",{bold:true})],{align:AlignmentType.CENTER})],{w:S2,fill:GRIS,borders:bAll}),cel([par([txt("HACER",{bold:true})],{align:AlignmentType.CENTER})],{w:S3,fill:GRIS,borders:bAll}),cel([par([txt("SER",{bold:true})],{align:AlignmentType.CENTER})],{w:S4,fill:GRIS,borders:bAll})]}),new TableRow({children:[cel([par([txt("Por dimensión")])],{w:S1,borders:bAll}),cel([par([txt(i1.substring(0,600))])],{w:S2,borders:bAll}),cel([par([txt(i2.substring(0,600))])],{w:S3,borders:bAll}),cel([par([txt(i3.substring(0,400))])],{w:S4,borders:bAll})]})]}));
    children.push(par([txt("")]));children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("METODOLOGÍA EN SECUENCIA DIDÁCTICA",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]})  );
    const secs=[{t:"INICIO DE LA CLASE (APERTURA Y MOTIVACIÓN)",c:getB("APERTURA").substring(0,800)},{t:"EXPLORACIÓN (SABERES PREVIOS)",c:getB("SABERES_PREVIOS").split("\n").filter(l=>l.trim()).map((l,i)=>(i+1)+". "+l.replace(/^\d+\.\s*/,"")).join("\n").substring(0,800)},{t:"ESTRUCTURACIÓN (PRÁCTICA Y DESARROLLO)",c:(getB("DESARROLLO")+" "+getB("TALLER")).substring(0,1200)},{t:"TRANSFERENCIA (VALORACIÓN)",c:getB("RETROALIMENTACION").substring(0,1000)},{t:"REFUERZO (INTEGRACIÓN A CONTEXTOS COTIDIANOS)",c:(getB("CIERRE")+"\n"+getB("TAREA")).substring(0,1000)}];
    for(const s of secs){children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt(s.t,{bold:true})])],{w:TW,fill:GRIS,borders:bAll})]}),new TableRow({children:[cel([par([txt(s.c||".")])],{w:TW,borders:bAll})]})]}));}
    children.push(par([txt("")]));children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("EVALUACIÓN",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]})  );
    const EV=Math.round(TW*.6),ET=TW-EV;
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[EV,ET],rows:[new TableRow({children:[cel([par([txt("DESEMPEÑOS ESPERADOS",{bold:true})],{align:AlignmentType.CENTER})],{w:EV,fill:GRIS,borders:bAll}),cel([par([txt("EVALUACIÓN PERTINENTE",{bold:true})],{align:AlignmentType.CENTER})],{w:ET,fill:GRIS,borders:bAll})]}),new TableRow({children:[cel([par([txt(evd.substring(0,300))])],{w:EV,borders:bAll}),cel([par([txt(evl.substring(0,600))])],{w:ET,borders:bAll})]})]}));
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("REFERENCIAS BIBLIOGRÁFICAS Y WEBGRAFÍA",{bold:true})],{align:AlignmentType.CENTER})],{w:TW,fill:GRIS,borders:bAll})]}),new TableRow({children:[cel([par([txt(web.substring(0,500))])],{w:TW,borders:bAll})]})]}));
    children.push(par([txt("")]));children.push(par([txt("")]));
    const FW=Math.round(TW/2),FW2=TW-FW;const nb={top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}};
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[FW,FW2],rows:[new TableRow({children:[cel([par([txt("_______________________________")],{align:AlignmentType.CENTER}),par([txt(docente||"Docente",{bold:true})],{align:AlignmentType.CENTER}),par([txt(cargo||"Docente",{size:20})],{align:AlignmentType.CENTER})],{w:FW,borders:nb}),cel([par([txt("_______________________________")],{align:AlignmentType.CENTER}),par([txt("Coordinador / Rector",{bold:true})],{align:AlignmentType.CENTER}),par([txt("Vo. Bo.",{size:20})],{align:AlignmentType.CENTER})],{w:FW2,borders:nb})]})]})  );
    const doc=new Document({styles:{default:{document:{run:{font:"Times New Roman",size:24}}}},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:567,right:567,bottom:567,left:567}}},children}]});
    const buffer=await Packer.toBuffer(doc);
    const nombre=`PlanAula_${area}_Grado${grado}_${tema.substring(0,20).replace(/\s+/g,"_")}.docx`;
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition",`attachment; filename="${nombre}"`);
    res.send(buffer);
  } catch(e){console.error("❌ Word:",e.message);res.status(500).json({mensaje:e.message});}
});

// ======================================================
//  EXPORTAR PDF
// ======================================================
app.post("/exportar-pdf", async (req, res) => {
  try {
    const { contenido,institucion,docente,area,grado,tema,duracion,logoPath,banderaPath,cargo,ciudad,nivelEducativo } = req.body;
    const gradoN=parseInt(grado)||0;const nivelLabel=nivelEducativo==="preescolar"?"Preescolar":nivelEducativo==="primaria"?"Primaria":nivelEducativo==="media_tecnica"?"Media Técnica":nivelEducativo==="bachillerato"?"Bachillerato":gradoN<=5?"Primaria":gradoN<=9?"Bachillerato":"Media/Bachillerato";
    const PDFDocument=require("pdfkit");const bloques={};let secActual=null;
    for(const linea of contenido.split("\n")){const m=linea.match(/^===(\w+)===/);if(m){secActual=m[1];bloques[secActual]=[];continue;}if(secActual)bloques[secActual].push(linea);}
    const tieneSecciones2 = Object.keys(bloques).length > 0;
    if (!tieneSecciones2) {
      const lineas = contenido.split("\n");
      const total = lineas.length;
      const chunk = Math.floor(total / 5);
      bloques["APERTURA"]         = lineas.slice(0, chunk);
      bloques["SABERES_PREVIOS"]  = lineas.slice(chunk, chunk*2);
      bloques["DESARROLLO"]       = lineas.slice(chunk*2, chunk*3);
      bloques["RETROALIMENTACION"]= lineas.slice(chunk*3, chunk*4);
      bloques["CIERRE"]           = lineas.slice(chunk*4);
      bloques["TALLER"]           = lineas.slice(chunk, chunk*2);
      bloques["EXTRAS"]           = [];
    }
    const getB=k=>(bloques[k]||[]).join("\n").replace(/\*\*/g,"").replace(/##\s*/g,"").replace(/^[\s\n]+|[\s\n]+$/g,"") || contenido.substring(0,500);
    const AZUL="#1B4F8A",AZUL_CL="#D6E4F7",NEGRO="#000000",GRIS="#F2F2F2",BLANCO="#FFFFFF",GRIS_B="#CCCCCC";
    const doc=new PDFDocument({margin:30,size:"LETTER",bufferPages:true});const buffers=[];doc.on("data",d=>buffers.push(d));const fin=new Promise(r=>doc.on("end",r));
    const FB="Helvetica-Bold",FN="Helvetica",FI="Helvetica-Oblique";const ML=30,PW=doc.page.width-60;
    const border=()=>{doc.rect(4,4,doc.page.width-8,doc.page.height-8).lineWidth(2).strokeColor(AZUL).stroke();doc.rect(7,7,doc.page.width-14,doc.page.height-14).lineWidth(0.5).strokeColor(AZUL_CL).stroke();};border();
    const HY=16,HH=88;doc.rect(ML,HY,PW,HH).fill(BLANCO);doc.rect(ML,HY,PW,HH).lineWidth(1).strokeColor(AZUL).stroke();
    const la=logoPath?path.join(__dirname,logoPath):null;if(la&&fs.existsSync(la)){try{doc.image(la,ML+3,HY+4,{width:78,height:78,fit:[78,78]});}catch(_){doc.rect(ML+3,HY+4,78,78).fill(AZUL_CL);}}else{doc.rect(ML+3,HY+4,78,78).fill(AZUL_CL);doc.font(FB).fontSize(7).fillColor(AZUL).text("ESCUDO",ML+3,HY+37,{width:78,align:"center"});}
    const ba=banderaPath?path.join(__dirname,banderaPath):null;if(ba&&fs.existsSync(ba)){try{doc.image(ba,ML+PW-81,HY+4,{width:78,height:78,fit:[78,78]});}catch(_){doc.rect(ML+PW-81,HY+4,78,78).fill(AZUL_CL);}}else{doc.rect(ML+PW-81,HY+4,78,78).fill(AZUL_CL);doc.font(FB).fontSize(7).fillColor(AZUL).text("BANDERA",ML+PW-81,HY+37,{width:78,align:"center"});}
    doc.moveTo(ML+84,HY+6).lineTo(ML+84,HY+HH-6).strokeColor(AZUL).lineWidth(0.5).stroke();doc.moveTo(ML+PW-84,HY+6).lineTo(ML+PW-84,HY+HH-6).strokeColor(AZUL).lineWidth(0.5).stroke();
    const CX=ML+88,CW=PW-176;doc.font(FB).fontSize(12).fillColor(AZUL).text((institucion||"INSTITUCIÓN EDUCATIVA").toUpperCase(),CX,HY+10,{width:CW,align:"center"});doc.font(FN).fontSize(7).fillColor("#444").text("Aprobado según Decreto No. 0001295 del 04 Noviembre de 2009",CX,HY+30,{width:CW,align:"center"}).text("De la Secretaría de Educación del Caquetá",CX,HY+41,{width:CW,align:"center"});doc.font(FB).fontSize(8).fillColor(AZUL).text(`${ciudad||"Valparaíso"} - Caquetá`,CX,HY+55,{width:CW,align:"center"});doc.font(FB).fontSize(10).fillColor(AZUL).text("PLAN DE AULA",CX,HY+70,{width:CW,align:"center"});doc.y=HY+HH+10;
    const tabla=(filas,colWidths)=>{if(doc.y>doc.page.height-80){doc.addPage();border();doc.y=30;}let rowY=doc.y;for(const fila of filas){let maxH=18;fila.forEach((c,i)=>{doc.font(c.bold?FB:FN).fontSize(c.fs||9);const h=Math.max(18,doc.heightOfString(c.texto||"",{width:colWidths[i]-8})+10);if(h>maxH)maxH=h;});if(rowY+maxH>doc.page.height-40){doc.addPage();border();rowY=30;}let colX=ML;fila.forEach((c,i)=>{const w=colWidths[i];doc.rect(colX,rowY,w,maxH).fill(c.fill||BLANCO);doc.rect(colX,rowY,w,maxH).lineWidth(0.4).strokeColor(GRIS_B).stroke();doc.font(c.bold?FB:FN).fontSize(c.fs||9).fillColor(c.color||NEGRO).text(c.texto||"",colX+4,rowY+4,{width:w-8,align:c.align||(c.bold?"center":"justify")});colX+=w;});rowY+=maxH;}doc.y=rowY+3;};
    const az=(t,o={})=>({texto:t,fill:AZUL,color:BLANCO,bold:true,fs:10,align:"center",...o});const gr=(t,o={})=>({texto:t,fill:GRIS,color:NEGRO,bold:true,fs:9,...o});const nm=(t,o={})=>({texto:t,fill:BLANCO,color:NEGRO,bold:false,fs:9,...o});
    const ex=getB("EXTRAS");
    const obj=ex.match(/OBJETIVO[:\s\n]+([^\n]{20,}[\s\S]*?)(?=\nCOMPETENCIA:|\nESTANDAR:|\nDBA:|\nINDICADOR|$)/i)?.[1]?.trim()||"Desarrollar competencias.";
    const rec=ex.match(/RECURSOS[:\s]+([\s\S]*?)(?=WEBGRAFIA:|$)/i)?.[1]?.trim()||"Talento humano.";
    const web=ex.match(/WEBGRAFIA[:\s]+([\s\S]*?)$/i)?.[1]?.trim()||"MEN lineamientos.";
    const evl=ex.match(/EVALUACION[:\s]+([\s\S]*?)(?=RECURSOS:|WEBGRAFIA:|$)/i)?.[1]?.trim()||"Oral y escrita.";
    const i1=ex.match(/INDICADOR1[:\s]+([\s\S]*?)(?=INDICADOR2:|$)/i)?.[1]?.trim()||"";
    const i2=ex.match(/INDICADOR2[:\s]+([\s\S]*?)(?=INDICADOR3:|$)/i)?.[1]?.trim()||"";
    const i3=ex.match(/INDICADOR3[:\s]+([\s\S]*?)(?=EVIDENCIA:|$)/i)?.[1]?.trim()||"";
    const dba=ex.match(/DBA[:\s\n]+([\s\S]*?)(?=ESTANDAR:|INDICADOR|EVIDENCIA:|CRITERIO:|RECURSOS:|WEBGRAFIA:|$)/i)?.[1]?.trim()||"";
    const std=ex.match(/ESTANDAR[:\s\n]+([\s\S]*?)(?=DBA:|INDICADOR|EVIDENCIA:|CRITERIO:|$)/i)?.[1]?.trim()||"";
    const evd=ex.match(/EVIDENCIA[:\s]+([\s\S]*?)(?=CRITERIO:|RECURSOS:|$)/i)?.[1]?.trim()||"";
    tabla([[gr("Docente:",{fs:8}),nm(docente||"",{fs:8}),gr("Sede:",{fs:8}),nm(institucion||"",{fs:8})]],[PW*.15,PW*.35,PW*.1,PW*.4]);
    tabla([[az("INFORMACIÓN GENERAL")]],[PW]);
    tabla([[gr("NIVEL",{fs:8}),nm(nivelLabel,{fs:8}),gr("GRADO",{fs:8}),nm(grado||"",{fs:8}),gr("ÁREA",{fs:8}),nm(area||"",{fs:8}),gr("SEM",{fs:8}),nm("1",{fs:8})]],[PW*.08,PW*.14,PW*.08,PW*.1,PW*.08,PW*.4,PW*.06,PW*.06]);
    tabla([[gr("TEMA",{fs:8}),nm(tema,{fs:8})]],[PW*.12,PW*.88]);
    tabla([[gr("OBJETIVO",{fs:8}),nm(obj.substring(0,300),{fs:8})]],[PW*.14,PW*.86]);
    tabla([[gr("RECURSOS",{fs:8}),nm(rec.substring(0,200),{fs:8})]],[PW*.14,PW*.86]);
    doc.moveDown(0.3);tabla([[az("REFERENTES NACIONALES DE CALIDAD")]],[PW]);
    tabla([[gr("ESTÁNDARES",{fs:8}),nm(std.substring(0,250),{fs:8})],[gr("DBA",{fs:8}),nm(dba.substring(0,250),{fs:8})]],[PW*.22,PW*.78]);
    tabla([[gr("INDICADORES",{fs:8}),gr("SABER",{fs:8,align:"center"}),gr("HACER",{fs:8,align:"center"}),gr("SER",{fs:8,align:"center"})],[nm("Por dimensión",{fs:8}),nm(i1.substring(0,400),{fs:8}),nm(i2.substring(0,400),{fs:8}),nm(i3.substring(0,300),{fs:8})]],[PW*.14,PW*.29,PW*.29,PW*.28]);
    doc.moveDown(0.3);tabla([[az("METODOLOGÍA EN SECUENCIA DIDÁCTICA")]],[PW]);
    const ps=[{t:"INICIO (APERTURA Y MOTIVACIÓN)",c:getB("APERTURA").substring(0,600)},{t:"EXPLORACIÓN (SABERES PREVIOS)",c:getB("SABERES_PREVIOS").substring(0,400)},{t:"ESTRUCTURACIÓN (DESARROLLO Y TALLER)",c:(getB("DESARROLLO")+" "+getB("TALLER")).substring(0,1000)},{t:"TRANSFERENCIA (RETROALIMENTACIÓN)",c:getB("RETROALIMENTACION").substring(0,800)},{t:"REFUERZO (CIERRE Y TAREA)",c:(getB("CIERRE")+"\n"+getB("TAREA")).substring(0,800)}];
    for(const s of ps)tabla([[gr(s.t,{fs:8,align:"left"})],[nm(s.c||".",{fs:8})]],[PW]);
    doc.moveDown(0.3);tabla([[az("EVALUACIÓN")]],[PW]);
    tabla([[gr("DESEMPEÑOS",{fs:8,align:"center"}),gr("EVALUACIÓN",{fs:8,align:"center"})],[nm(evd.substring(0,200),{fs:8}),nm(evl.substring(0,350),{fs:8})]],[PW*.4,PW*.6]);
    tabla([[gr("WEBGRAFÍA",{fs:8,align:"center"})],[nm(web.substring(0,350),{fs:8})]],[PW]);
    doc.moveDown(0.8);const fY=doc.y;
    doc.font(FN).fontSize(9).fillColor(NEGRO).text("_______________________________",ML+20,fY,{width:PW/2-40,align:"center"}).text("_______________________________",ML+PW/2+20,fY,{width:PW/2-40,align:"center"});
    doc.font(FB).fontSize(9).text(docente||"Docente",ML+20,fY+14,{width:PW/2-40,align:"center"}).text("Coordinador / Rector",ML+PW/2+20,fY+14,{width:PW/2-40,align:"center"});
    doc.font(FI).fontSize(8).fillColor("#555").text(cargo||"Docente",ML+20,fY+26,{width:PW/2-40,align:"center"}).text("Vo. Bo.",ML+PW/2+20,fY+26,{width:PW/2-40,align:"center"});
    const totalPags=doc.bufferedPageRange().count;for(let i=0;i<totalPags;i++){doc.switchToPage(i);const py=doc.page.height-20;doc.rect(ML,py-2,PW,14).fill(AZUL);doc.font(FI).fontSize(7).fillColor(BLANCO).text(`${institucion||"I.E."}  ·  ${area} Grado ${grado}°  ·  ${tema}  ·  Pág. ${i+1}/${totalPags}`,ML,py+1,{width:PW,align:"center"});}
    doc.end();await fin;const pdfBuffer=Buffer.concat(buffers);
    const nombre=`PlanAula_${area}_Grado${grado}_${tema.substring(0,20).replace(/\s+/g,"_")}.pdf`;
    res.setHeader("Content-Type","application/pdf");res.setHeader("Content-Disposition",`attachment; filename="${encodeURIComponent(nombre)}"`);res.send(pdfBuffer);
  } catch(e){console.error("❌ PDF:",e.message);res.status(500).json({mensaje:e.message});}
});

// ======================================================
//  INICIAR SERVIDOR
// ======================================================
app.listen(5000, () => {
  console.log("✅ EduClass v4 Multi-IA — Puerto 5000");
  console.log("🤖 Proveedores:", AI_PROVIDERS.map(p=>p.nombre).join(" → "));
});