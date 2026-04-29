// ======================================================
//  EduClass Premium — server.js  v3
//  Incluye: Auth docentes, Clases, Word/PDF institucional,
//           Sistema de tareas para estudiantes
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

// ── Directorios ───────────────────────────────────────
// ── DB — Sistema híbrido: archivo local + memoria para Railway ──────
const DB_PATH  = path.join(__dirname, "data", "db.json");
const UPLOAD_DIR   = path.join(__dirname, "uploads");
const ENTREGAS_DIR = path.join(__dirname, "uploads", "entregas");
[path.join(__dirname,"data"), UPLOAD_DIR, ENTREGAS_DIR].forEach(d => {
  if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true});
});

// Cache en memoria — sobrevive reinicios del proceso pero NO redeploys
// Para Railway usamos el db.json del repo como semilla + guardamos en memoria
let _dbCache = null;

const leerDB = () => {
  if (_dbCache) return JSON.parse(JSON.stringify(_dbCache)); // copia del cache
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
      usuarios:[], clases:[], tareas:[], estudiantes:[],
      entregas:[], estudiantesReg:[], notas:[]
    }));
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH,"utf8"));
  if (!db.tareas)         db.tareas         = [];
  if (!db.estudiantes)    db.estudiantes    = [];
  if (!db.entregas)       db.entregas       = [];
  if (!db.estudiantesReg) db.estudiantesReg = [];
  if (!db.notas)          db.notas          = [];
  _dbCache = JSON.parse(JSON.stringify(db));
  return db;
};

const guardarDB = (db) => {
  _dbCache = JSON.parse(JSON.stringify(db)); // actualiza cache
  try { fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2)); } catch(_) {}
};

// ── Multer ────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => cb(null, `logo_${uuidv4()}${path.extname(file.originalname)}`)
});
const uploadFields = multer({ storage, limits:{ fileSize:5*1024*1024 } })
  .fields([{ name:"logo",maxCount:1 },{ name:"bandera",maxCount:1 }]);

const storageEntrega = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ENTREGAS_DIR),
  filename:    (_req, file, cb) => cb(null, `entrega_${uuidv4()}${path.extname(file.originalname)}`)
});
const uploadEntrega = multer({ storage:storageEntrega, limits:{ fileSize:20*1024*1024 } });

// ── Groq ──────────────────────────────────────────────
const Groq = require("groq-sdk");

// ── Pool de API Keys — rota automáticamente cuando una se agota ──
const GROQ_KEYS = [
  process.env.GROQ_API_KEY_1 || process.env.GROQ_API_KEY || "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",
  process.env.GROQ_API_KEY_2 || "",
  process.env.GROQ_API_KEY_3 || "",
  process.env.GROQ_API_KEY_4 || "",
].filter(k => k && k.startsWith("gsk_"));

let groqKeyIndex = 0;
const getGroq = () => new Groq({ apiKey: GROQ_KEYS[groqKeyIndex % GROQ_KEYS.length] });

const groqCompletion = async (params) => {
  let intentos = 0;
  while (intentos < GROQ_KEYS.length) {
    try {
      const groq = getGroq();
      const resp = await groqCompletion(params);
      return resp;
    } catch(e) {
      const msg = e.message || "";
      // Si es rate limit, cambia a la siguiente key
      if (msg.includes("rate_limit") || msg.includes("429") || msg.includes("Rate limit")) {
        groqKeyIndex++;
        intentos++;
        console.log('⚠️ Rate limit key '+(groqKeyIndex-1)+', cambiando a key '+(groqKeyIndex % GROQ_KEYS.length)+'...');
        if (intentos >= GROQ_KEYS.length) throw new Error("Todas las API keys agotadas. Intenta más tarde.");
      } else {
        throw e;
      }
    }
  }
};

console.log('🔑 '+GROQ_KEYS.length+' API key(s) de Groq cargadas');

// ======================================================
//  AUTH DOCENTES
// ======================================================
app.get("/", (_req, res) => res.json({ ok:true, msg:"EduClass Premium IA v3 ✅" }));

app.post("/registro", async (req,res) => {
  try {
    const { nombre,email,password,institucion,cargo,ciudad,municipio } = req.body;
    if (!nombre||!email||!password) return res.status(400).json({ mensaje:"Completa nombre, correo y contraseña" });
    const db = leerDB();
    if (db.usuarios.find(u=>u.email===email)) return res.status(400).json({ mensaje:"Este correo ya está registrado" });
    const hash = await bcrypt.hash(password,10);
    db.usuarios.push({ id:uuidv4(),nombre,email,password:hash,institucion:institucion||"",cargo:cargo||"Docente",ciudad:ciudad||"",municipio:municipio||"",logoPath:"",banderaPath:"",creadoEn:new Date().toISOString() });
    guardarDB(db);
    res.json({ mensaje:"Registro exitoso ✅ Ya puedes iniciar sesión" });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

app.post("/login", async (req,res) => {
  try {
    const { email,password } = req.body;
    if (!email) return res.status(400).json({ mensaje:"Ingresa tu correo" });
    const db = leerDB();
    const u  = db.usuarios.find(u=>u.email===email);
    if (!u) return res.status(401).json({ mensaje:"Correo no registrado" });
    const ok = await bcrypt.compare(password||"", u.password);
    if (!ok) return res.status(401).json({ mensaje:"Contraseña incorrecta" });
    const { password:_, ...pub } = u;
    res.json({ usuario:pub });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

app.post("/actualizar-perfil", uploadFields, async (req,res) => {
  try {
    const { userId,nombre,institucion,cargo,ciudad,municipio } = req.body;
    const db  = leerDB();
    const idx = db.usuarios.findIndex(u=>u.id===userId);
    if (idx===-1) return res.status(404).json({ mensaje:"Usuario no encontrado" });
    if (nombre)      db.usuarios[idx].nombre      = nombre;
    if (institucion) db.usuarios[idx].institucion  = institucion;
    if (cargo)       db.usuarios[idx].cargo        = cargo;
    if (ciudad)      db.usuarios[idx].ciudad       = ciudad;
    if (municipio)   db.usuarios[idx].municipio    = municipio;
    if (req.files?.logo?.[0])    db.usuarios[idx].logoPath    = `uploads/${req.files.logo[0].filename}`;
    if (req.files?.bandera?.[0]) db.usuarios[idx].banderaPath = `uploads/${req.files.bandera[0].filename}`;
    guardarDB(db);
    const { password:_, ...pub } = db.usuarios[idx];
    res.json({ usuario:pub, mensaje:"Perfil actualizado ✅" });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// ======================================================
//  CLASES
// ======================================================
app.post("/guardar-clase", (req,res) => {
  try {
    const { userId,contenido,datos } = req.body;
    const db = leerDB();
    db.clases.push({ id:uuidv4(),userId,contenido,datos,creadaEn:new Date().toISOString() });
    guardarDB(db);
    res.json({ ok:true, mensaje:"Clase guardada ✅" });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

app.get("/mis-clases/:userId", (req,res) => {
  try {
    const db = leerDB();
    const clases = db.clases.filter(c=>c.userId===req.params.userId)
      .sort((a,b)=>new Date(b.creadaEn)-new Date(a.creadaEn))
      .map(c=>({ id:c.id,creadaEn:c.creadaEn,datos:c.datos,resumen:c.contenido?.substring(0,200) }));
    res.json({ clases });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

app.get("/clase/:id", (req,res) => {
  try {
    const db = leerDB();
    const clase = db.clases.find(c=>c.id===req.params.id);
    if (!clase) return res.status(404).json({ mensaje:"No encontrada" });
    res.json({ clase });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

app.delete("/clase/:id", (req,res) => {
  try {
    const db = leerDB();
    db.clases = db.clases.filter(c=>c.id!==req.params.id);
    guardarDB(db);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// ======================================================
//  SISTEMA DE TAREAS
// ======================================================

// Crear tarea con lista de estudiantes
// ======================================================
//  SISTEMA DE ESTUDIANTES Y TAREAS
// ======================================================

// Registro de estudiante (cuenta propia o vincular con pre-registrado)
app.post("/registro-estudiante", async (req,res) => {
  try {
    const { nombre, usuario, password, grado, institucion, documento } = req.body;
    if (!usuario||!password) return res.status(400).json({ mensaje:"Completa usuario y contraseña" });
    const db = leerDB();
    if (!db.estudiantesReg) db.estudiantesReg = [];
    
    // Check if usuario already exists as a NEW account (not pre-registered)
    const existente = db.estudiantesReg.find(e=>e.usuario===usuario && !e.preRegistrado);
    if (existente) return res.status(400).json({ mensaje:"Ese usuario ya existe. Elige otro." });
    
    // Check if there is a pre-registered student with same documento or usuario
    const preReg = db.estudiantesReg.find(e=>
      (documento && e.documento===documento) ||
      (e.usuario===usuario && e.preRegistrado)
    );
    
    if (preReg) {
      // Activate pre-registered account with new password
      const idx = db.estudiantesReg.findIndex(e=>e.id===preReg.id);
      const hash = await bcrypt.hash(password,10);
      db.estudiantesReg[idx].password = hash;
      db.estudiantesReg[idx].passwordPlain = null;
      db.estudiantesReg[idx].preRegistrado = false;
      if (usuario !== preReg.usuario) db.estudiantesReg[idx].usuario = usuario;
      guardarDB(db);
      const { password:_, passwordPlain:__, ...pub } = db.estudiantesReg[idx];
      return res.json({ mensaje:"Cuenta activada exitosamente ✅", estudiante:pub });
    }
    
    // New student account
    const hash = await bcrypt.hash(password,10);
    const nuevo = {
      id:uuidv4(), nombre:nombre||usuario, usuario, password:hash,
      documento:documento||"", grado:grado||"", grupo:"",
      institucion:institucion||"I.E.R. SANTIAGO DE LA SELVA",
      creadoEn:new Date().toISOString(), preRegistrado:false
    };
    db.estudiantesReg.push(nuevo);
    guardarDB(db);
    const { password:_, ...pub } = nuevo;
    res.json({ mensaje:"Registro exitoso ✅", estudiante:pub });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Login estudiante con cuenta propia o pre-registrada
app.post("/login-estudiante-reg", async (req,res) => {
  try {
    const { usuario, password } = req.body;
    const db = leerDB();
    if (!db.estudiantesReg) db.estudiantesReg = [];
    
    // Buscar por usuario o documento
    const est = db.estudiantesReg.find(e=>e.usuario===usuario || e.documento===usuario);
    if (!est) return res.status(401).json({ mensaje:"Usuario no encontrado. Verifica con tu docente." });
    
    let ok = false;
    if (est.preRegistrado && !est.password) {
      // Pre-registrado: usar contraseña plana (6 últimos dígitos del documento)
      ok = (password === est.passwordPlain);
      if (ok) {
        // Hash the password for future logins
        const idx = db.estudiantesReg.findIndex(e=>e.id===est.id);
        db.estudiantesReg[idx].password = await bcrypt.hash(password, 10);
        db.estudiantesReg[idx].preRegistrado = false;
        guardarDB(db);
      }
    } else if (est.password) {
      ok = await bcrypt.compare(password||"", est.password);
    }
    
    if (!ok) return res.status(401).json({ mensaje:"Contraseña incorrecta. Tu contraseña son los últimos 6 dígitos de tu documento." });
    
    const { password:_, passwordPlain:__, ...pub } = est;
    res.json({ ok:true, estudiante:pub });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Obtener lista de estudiantes por grado (para docente)
app.get("/estudiantes-grado/:grado", (req,res) => {
  try {
    const db = leerDB();
    const gParam = req.params.grado;
    let lista;
    if (gParam === "todos") {
      lista = (db.estudiantesReg||[]);
    } else {
      const gradoNorm = gParam.replace("°","").padStart(2,"0");
      lista = (db.estudiantesReg||[]).filter(e=>{
        const eg = (e.grado||"").replace("°","").padStart(2,"0");
        return eg===gradoNorm || e.grado===gParam;
      });
    }
    lista = lista.map(e=>({
      id:e.id, nombre:e.nombre, usuario:e.usuario,
      documento:e.documento, grado:e.grado, grupo:e.grupo||"",
      activo:!e.preRegistrado
    })).sort((a,b)=>a.nombre.localeCompare(b.nombre));
    res.json({ estudiantes:lista });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Buscar estudiante por nombre o documento
app.get("/buscar-estudiante", (req,res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ estudiantes:[] });
    const db = leerDB();
    const q2 = q.toLowerCase();
    const lista = (db.estudiantesReg||[])
      .filter(e=>e.nombre?.toLowerCase().includes(q2)||e.documento?.includes(q)||e.usuario?.toLowerCase().includes(q2))
      .map(e=>({ id:e.id, nombre:e.nombre, usuario:e.usuario, documento:e.documento, grado:e.grado, activo:!e.preRegistrado }))
      .slice(0,20);
    res.json({ estudiantes:lista });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Obtener todos los grados disponibles
app.get("/grados-disponibles", (req,res) => {
  try {
    const db = leerDB();
    const grados = [...new Set((db.estudiantesReg||[]).map(e=>e.grado))].sort();
    res.json({ grados });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Guardar nota de estudiante
app.post("/guardar-nota", (req,res) => {
  try {
    const { estudianteId, tareaId, nota, comentario, docenteId } = req.body;
    const db = leerDB();
    if (!db.notas) db.notas = [];
    const idx = db.notas.findIndex(n=>n.estudianteId===estudianteId && n.tareaId===tareaId);
    const notaObj = { id:idx>=0?db.notas[idx].id:uuidv4(), estudianteId, tareaId, docenteId, nota, comentario:comentario||"", fecha:new Date().toISOString() };
    if(idx>=0) db.notas[idx]=notaObj; else db.notas.push(notaObj);
    // Also update entrega
    const eIdx = db.entregas.findIndex(e=>e.tareaId===tareaId&&(e.estudianteId===estudianteId||e.estudianteRegId===estudianteId));
    if(eIdx>=0){ db.entregas[eIdx].calificacion=nota; db.entregas[eIdx].comentario=comentario||""; }
    guardarDB(db);
    res.json({ ok:true, nota:notaObj });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Libro de notas del docente
app.get("/libro-notas/:docenteId", (req,res) => {
  try {
    const db = leerDB();
    const tareas = (db.tareas||[]).filter(t=>t.docenteId===req.params.docenteId);
    const resultado = tareas.map(t=>{
      const asignados = [...(t.estudiantesAsignados||[]), ...(t.estudiantesReg||[]).map(id=>{
        const e=(db.estudiantesReg||[]).find(x=>x.id===id);
        return e?{id:e.id,nombre:e.nombre}:null;
      }).filter(Boolean)];
      const entregas = (db.entregas||[]).filter(e=>e.tareaId===t.id);
      return { tarea:{ id:t.id, titulo:t.titulo, tipo:t.tipo, area:t.area, grado:t.grado, fechaEntrega:t.fechaEntrega },
               estudiantes: asignados.map(a=>{
                 const ent = entregas.find(e=>e.estudianteId===a.id||e.estudianteRegId===a.id);
                 return { id:a.id, nombre:a.nombre, entregada:!!ent, calificacion:ent?.calificacion||null, comentario:ent?.comentario||"", respuestasActividad:ent?.respuestasActividad||null };
               })};
    });
    res.json({ resultado });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Obtener tareas del estudiante registrado
app.get("/mis-tareas-estudiante/:estudianteId", (req,res) => {
  try {
    const db = leerDB();
    const estudianteId = req.params.estudianteId;
    const est = (db.estudiantesReg||[]).find(e=>e.id===estudianteId);
    const gradoEst = est?.grado||"";
    
    const ahora = new Date();
    const tareasAsignadas = (db.tareas||[]).filter(t=>{
      // Por id directo
      if ((t.estudiantesReg||[]).includes(estudianteId)) return true;
      // Por grado asignado
      if (t.asignarGrado && t.asignarGrado!=="manual") {
        const gT = t.asignarGrado.replace("°","").padStart(2,"0");
        const gE = gradoEst.replace("°","").padStart(2,"0");
        if (gT===gE || t.asignarGrado===gradoEst || t.grado===gradoEst || t.grado===gE) return true;
      }
      return false;
    }).map(t=>{
      const entrega = (db.entregas||[]).find(e=>e.tareaId===t.id && (e.estudianteRegId===estudianteId||e.estudianteId===estudianteId));
      // Check if deadline passed
      let vencida = false;
      if (t.fechaEntrega) {
        const deadline = new Date(t.fechaEntrega + "T23:59:59");
        vencida = ahora > deadline && !entrega;
      }
      return { id:t.id, titulo:t.titulo, descripcion:t.descripcion, tipo:t.tipo, area:t.area, grado:t.grado,
               fechaEntrega:t.fechaEntrega, codigo:t.codigo, estado:t.estado,
               entregada:!!entrega, vencida,
               calificacion:entrega?.calificacion||null,
               comentario:entrega?.comentario||"",
               actividad:t.actividad,
               autoCalificada:entrega?.autoCalificada||false };
    });
    res.json({ tareas:tareasAsignadas });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Crear tarea con tipo de actividad
app.post("/crear-tarea", (req,res) => {
  try {
    const { docenteId, titulo, descripcion, tipo, actividad, area, grado, fechaEntrega, estudiantesLista, estudiantesRegIds } = req.body;
    const db = leerDB();
    if (!db.estudiantesReg) db.estudiantesReg = [];

    const codigo  = Math.random().toString(36).substring(2,8).toUpperCase();
    const tareaId = uuidv4();

    // Crear cuentas temporales para estudiantes sin cuenta propia
    const estudiantesTemp = (estudiantesLista||[]).map(nombre => {
      const user = nombre.toLowerCase().replace(/\s+/g,"").replace(/[^a-z0-9]/g,"").substring(0,10);
      const pass = Math.random().toString(36).substring(2,8);
      const est  = { id:uuidv4(), tareaId, nombre, usuario:user, passwordPlain:pass };
      db.estudiantes.push(est);
      return { id:est.id, nombre, usuario:user, password:pass };
    });

    // Asignar estudiantes registrados por IDs seleccionados
    const estudiantesRegAsignados = [];
    if (estudiantesRegIds && Array.isArray(estudiantesRegIds)) {
      estudiantesRegIds.forEach(id=>{ if(!estudiantesRegAsignados.includes(id)) estudiantesRegAsignados.push(id); });
    }

    const tarea = {
      id:          tareaId,
      docenteId,
      titulo,
      descripcion,
      tipo:        tipo||"taller",
      actividad:   actividad||null,
      area,
      grado,

      fechaEntrega: fechaEntrega||"",
      codigo,
      estudiantesAsignados: estudiantesTemp.map(e=>({id:e.id,nombre:e.nombre,usuario:e.usuario})),
      estudiantesReg: estudiantesRegAsignados,
      creadaEn:    new Date().toISOString(),
      estado:      "activa"
    };

    db.tareas.push(tarea);
    guardarDB(db);
    res.json({ ok:true, tarea, estudiantes:estudiantesTemp, mensaje:"Tarea creada ✅" });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Asignar estudiante registrado a una tarea por código
app.post("/unirse-tarea", async (req,res) => {
  try {
    const { codigo, estudianteId } = req.body;
    const db = leerDB();
    const tarea = db.tareas.find(t=>t.codigo===codigo?.toUpperCase());
    if (!tarea) return res.status(404).json({ mensaje:"Código incorrecto. Verifica con tu docente." });
    if (!tarea.estudiantesReg) tarea.estudiantesReg = [];
    if (!tarea.estudiantesReg.includes(estudianteId)) {
      tarea.estudiantesReg.push(estudianteId);
      guardarDB(db);
    }
    res.json({ ok:true, tarea:{ id:tarea.id, titulo:tarea.titulo, tipo:tarea.tipo, area:tarea.area, grado:tarea.grado, fechaEntrega:tarea.fechaEntrega, descripcion:tarea.descripcion, actividad:tarea.actividad }, mensaje:"Te uniste a la tarea ✅" });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Listar tareas del docente
app.get("/mis-tareas/:docenteId", (req,res) => {
  try {
    const db = leerDB();
    const tareas = (db.tareas||[])
      .filter(t=>t.docenteId===req.params.docenteId)
      .sort((a,b)=>new Date(b.creadaEn)-new Date(a.creadaEn))
      .map(t => {
        const entregas = (db.entregas||[]).filter(e=>e.tareaId===t.id);
        const total    = (t.estudiantesAsignados?.length||0)+(t.estudiantesReg?.length||0);
        return { ...t, totalEntregas:entregas.length, totalEstudiantes:total };
      });
    res.json({ tareas });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Ver tarea por código
app.get("/tarea-publica/:codigo", (req,res) => {
  try {
    const db = leerDB();
    const tarea = db.tareas.find(t=>t.codigo===req.params.codigo.toUpperCase());
    if (!tarea) return res.status(404).json({ mensaje:"Tarea no encontrada." });
    res.json({ tarea });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Login estudiante temporal (con credenciales de lista)
app.post("/login-estudiante", async (req,res) => {
  try {
    const { codigo, usuario, password } = req.body;
    const db = leerDB();
    const tarea = db.tareas.find(t=>t.codigo===codigo?.toUpperCase());
    if (!tarea) return res.status(404).json({ mensaje:"Código de tarea incorrecto" });
    const est = (db.estudiantes||[]).find(e=>e.tareaId===tarea.id && e.usuario===usuario);
    if (!est) return res.status(401).json({ mensaje:"Usuario no encontrado en esta tarea" });
    if (est.passwordPlain !== password) return res.status(401).json({ mensaje:"Contraseña incorrecta" });
    const entrega = (db.entregas||[]).find(e=>e.tareaId===tarea.id && e.estudianteId===est.id);
    res.json({ ok:true, estudiante:{ id:est.id, nombre:est.nombre, usuario:est.usuario }, tarea, yaEntrego:!!entrega, entrega:entrega||null });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Entregar tarea
app.post("/entregar-tarea", uploadEntrega.single("archivo"), async (req,res) => {
  try {
    const { tareaId, estudianteId, estudianteRegId, respuesta, respuestasActividad } = req.body;
    const db = leerDB();
    const estId = estudianteId||estudianteRegId;
    const est   = (db.estudiantes||[]).find(e=>e.id===estId) ||
                  (db.estudiantesReg||[]).find(e=>e.id===estId);
    if (!est) return res.status(404).json({ mensaje:"Estudiante no encontrado" });

    const idx = (db.entregas||[]).findIndex(e=>e.tareaId===tareaId &&
      (e.estudianteId===estId||e.estudianteRegId===estId));

    const entrega = {
      id:               idx>=0 ? db.entregas[idx].id : uuidv4(),
      tareaId,
      estudianteId:     estudianteId||null,
      estudianteRegId:  estudianteRegId||null,
      nombreEstudiante: est.nombre,
      respuesta:        respuesta||"",
      respuestasActividad: respuestasActividad ? JSON.parse(respuestasActividad) : null,
      archivoPath:      req.file ? `uploads/entregas/${req.file.filename}` : (idx>=0 ? db.entregas[idx].archivoPath : ""),
      archivoNombre:    req.file ? req.file.originalname : (idx>=0 ? db.entregas[idx].archivoNombre : ""),
      entregadoEn:      new Date().toISOString(),
      calificacion:     idx>=0 ? db.entregas[idx].calificacion : null,
      comentario:       idx>=0 ? db.entregas[idx].comentario : "",
      estado:           "entregado"
    };

    // Auto-grade quiz, completar, verdadero_falso
    const tarea = (db.tareas||[]).find(t=>t.id===tareaId);
    let autoCalificada = false;
    let notaAuto = null;
    let resultadoDetalle = null;
    
    if (tarea && entrega.respuestasActividad && tarea.actividad?.preguntas) {
      const preguntas = tarea.actividad.preguntas;
      const respuestas = entrega.respuestasActividad;
      let correctas = 0, total = 0;
      const detalle = [];
      
      if (["quiz","completar","verdadero_falso","evaluacion"].includes(tarea.tipo)) {
        preguntas.forEach((p,i) => {
          const respEst = (respuestas[i]||"").toString().trim().toLowerCase();
          const respCorr = (p.correcta||p.respuesta||"").toString().trim().toLowerCase();
          const esCorrecta = respEst === respCorr || 
            (["completar","evaluacion"].includes(tarea.tipo) && respCorr && respEst.includes(respCorr)) ||
            (["completar","evaluacion"].includes(tarea.tipo) && respCorr && respCorr.includes(respEst) && respEst.length>2);
          if (respCorr) {
            total++;
            if (esCorrecta) correctas++;
            detalle.push({ pregunta:p.pregunta||p.enunciado||p.afirmacion, respEst:respuestas[i]||"", respCorrecta:p.correcta||p.respuesta, esCorrecta });
          }
        });
        if (total > 0) {
          const pct = (correctas/total)*100;
          // Scale to 0-5 (Colombian grading)
          notaAuto = (correctas/total * 5).toFixed(1);
          autoCalificada = true;
          resultadoDetalle = { correctas, total, porcentaje:Math.round(pct), nota:notaAuto, detalle };
          entrega.calificacion = notaAuto;
          entrega.comentario = `Calificación automática: ${correctas}/${total} respuestas correctas (${Math.round(pct)}%)`;
          entrega.autoCalificada = true;
          entrega.resultadoDetalle = resultadoDetalle;
        }
      }
    }
    
    if (idx>=0) db.entregas[idx] = entrega;
    else db.entregas.push(entrega);
    guardarDB(db);
    res.json({ ok:true, entrega, mensaje:"Tarea entregada ✅", autoCalificada, notaAuto, resultadoDetalle });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Ver entregas de una tarea con listado completo
app.get("/entregas-tarea/:tareaId", (req,res) => {
  try {
    const db = leerDB();
    const tarea = db.tareas.find(t=>t.id===req.params.tareaId);
    if (!tarea) return res.status(404).json({ mensaje:"No encontrada" });
    const entregas = (db.entregas||[]).filter(e=>e.tareaId===req.params.tareaId);
    
    // Todos los asignados (temp + registrados)
    const asignados = tarea.estudiantesAsignados||[];
    const regAsignados = (tarea.estudiantesReg||[]).map(id=>{
      const est = (db.estudiantesReg||[]).find(e=>e.id===id);
      return est ? { id:est.id, nombre:est.nombre, grado:est.grado||tarea.grado } : null;
    }).filter(Boolean);
    
    const todosAsignados = [...asignados, ...regAsignados];
    
    // Build full list: entregaron + pendientes
    const listadoCompleto = todosAsignados.map(est=>{
      const ent = entregas.find(e=>e.estudianteId===est.id||e.estudianteRegId===est.id);
      return {
        estudianteId:   est.id,
        nombreEstudiante: est.nombre,
        grado:          est.grado||"",
        entregada:      !!ent,
        entregadoEn:    ent?.entregadoEn||null,
        calificacion:   ent?.calificacion||null,
        comentario:     ent?.comentario||"",
        respuesta:      ent?.respuesta||"",
        respuestasActividad: ent?.respuestasActividad||null,
        resultadoDetalle: ent?.resultadoDetalle||null,
        archivoNombre:  ent?.archivoNombre||"",
        entregaId:      ent?.id||null,
        autoCalificada: ent?.autoCalificada||false,
        estado:         ent ? (ent.calificacion!=null?"calificado":"entregado") : "pendiente"
      };
    }).sort((a,b)=>a.nombreEstudiante.localeCompare(b.nombreEstudiante));
    
    const sinEntregar = listadoCompleto.filter(e=>!e.entregada);
    const conEntrega  = listadoCompleto.filter(e=>e.entregada);
    
    res.json({ 
      entregas: conEntrega,
      sinEntregar,
      listadoCompleto,
      total: todosAsignados.length,
      totalEntregas: conEntrega.length,
      totalPendientes: sinEntregar.length
    });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Calificar entrega
app.post("/calificar-entrega", (req,res) => {
  try {
    const { entregaId, calificacion, comentario } = req.body;
    const db  = leerDB();
    const idx = (db.entregas||[]).findIndex(e=>e.id===entregaId);
    if (idx===-1) return res.status(404).json({ mensaje:"No encontrada" });
    db.entregas[idx].calificacion = calificacion;
    db.entregas[idx].comentario   = comentario||"";
    db.entregas[idx].calificadoEn = new Date().toISOString();
    db.entregas[idx].estado       = "calificado";
    guardarDB(db);
    res.json({ ok:true, entrega:db.entregas[idx] });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Descargar archivo entrega
app.get("/descargar-entrega/:tareaId/:estudianteId", (req,res) => {
  try {
    const db = leerDB();
    const entrega = (db.entregas||[]).find(e=>e.tareaId===req.params.tareaId &&
      (e.estudianteId===req.params.estudianteId||e.estudianteRegId===req.params.estudianteId));
    if (!entrega?.archivoPath) return res.status(404).json({ mensaje:"Archivo no encontrado" });
    const abs = path.join(__dirname, entrega.archivoPath);
    if (!fs.existsSync(abs)) return res.status(404).json({ mensaje:"Archivo no existe" });
    res.download(abs, entrega.archivoNombre||"entrega.pdf");
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Eliminar tarea
app.delete("/tarea/:id", (req,res) => {
  try {
    const db = leerDB();
    db.tareas      = (db.tareas||[]).filter(t=>t.id!==req.params.id);
    db.estudiantes = (db.estudiantes||[]).filter(e=>e.tareaId!==req.params.id);
    db.entregas    = (db.entregas||[]).filter(e=>e.tareaId!==req.params.id);
    guardarDB(db);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Generar actividad con IA según tipo
app.post("/generar-actividad", async (req,res) => {
  try {
    const { tipo, tema, area, grado, cantidad } = req.body;
    const n = cantidad||5;

    const prompts = {
      quiz:       `Genera un quiz de ${n} preguntas de selección múltiple sobre "${tema}" para ${area} grado ${grado}° en Colombia. Cada pregunta debe tener 4 opciones (A,B,C,D) y la respuesta correcta indicada. Formato JSON estricto: {"preguntas":[{"pregunta":"texto","opciones":["A. texto","B. texto","C. texto","D. texto"],"correcta":"A"}]}. Solo JSON, sin texto adicional.`,
      completar:  `Genera ${n} oraciones para completar el espacio en blanco sobre "${tema}" para ${area} grado ${grado}°. Formato JSON: {"preguntas":[{"enunciado":"La fotosíntesis ocurre en ___","respuesta":"las hojas"}]}. Solo JSON.`,
      verdadero_falso: `Genera ${n} afirmaciones de Verdadero o Falso sobre "${tema}" para ${area} grado ${grado}°. Formato JSON: {"preguntas":[{"afirmacion":"texto","respuesta":"Verdadero"}]}. Solo JSON.`,
      relacionar: `Genera ${n} pares para relacionar conceptos sobre "${tema}" para ${area} grado ${grado}°. Formato JSON: {"pares":[{"columnaA":"concepto","columnaB":"definicion"}]}. Solo JSON.`,
      taller:     `Genera un taller con ${n} preguntas abiertas sobre "${tema}" para ${area} grado ${grado}°. Formato JSON: {"preguntas":[{"numero":1,"pregunta":"texto","tipo":"abierta"}]}. Solo JSON.`,
      evaluacion: `Genera una evaluación mixta sobre "${tema}" para ${area} grado ${grado}°. Incluye: 3 preguntas de selección múltiple, 2 de completar, 2 verdadero/falso y 1 pregunta abierta. Formato JSON: {"preguntas":[{"numero":1,"tipo":"seleccion","pregunta":"texto","opciones":["A. x","B. y","C. z","D. w"],"correcta":"A"},...]}. Solo JSON.`,
    };

    const prompt = prompts[tipo] || prompts.taller;
    const resp = await groqCompletion({
      model:"llama-3.3-70b-versatile", max_tokens:2000, temperature:0.5,
      messages:[
        { role:"system", content:"Eres un experto en evaluación educativa colombiana. Responde SOLO con JSON válido, sin markdown, sin texto adicional." },
        { role:"user", content:prompt }
      ]
    });

    let texto = resp.choices[0].message.content.trim();
    texto = texto.replace(/```json|```/g,"").trim();
    try {
      const actividad = JSON.parse(texto);
      res.json({ ok:true, actividad, tipo });
    } catch(e) {
      res.json({ ok:true, actividad:{ preguntas:[] }, tipo, raw:texto });
    }
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});


// ======================================================
//  GENERAR GUÍA
// ======================================================
app.post("/generar-guia", async (req,res) => {
  try {
    const { institucion,docente,area,grado,periodo,fecha,tema,
            tipoApertura,estratDesarrollo,retroalimentacion,
            tipoCierre,dejaTarea,estratTarea,duracion,cargo,ciudad,nivelEducativo } = req.body;

    const gradoNum  = parseInt(grado)||6;
    const edadAprox = gradoNum+5;
    const nivel     = gradoNum<=5?"primaria":gradoNum<=9?"secundaria":"media académica";
    const durMin    = parseInt(duracion)||55;
    const numHoras  = Math.round(durMin/55);
    const durTexto  = numHoras===1?"1 hora de clase (55 minutos)":`${numHoras} horas de clase (${durMin} minutos)`;

    const prompt = `Eres un pedagogo colombiano experto con 20 años de experiencia. Crea una guía PREMIUM, EXTENSA y DETALLADA para nivel ${nivelEducativo||nivel}. El texto debe ser 15% más extenso, con datos verificables e indicando fuentes.

DATOS:
- Institución: ${institucion||"I.E."} | Docente: ${docente||"Docente"} (${cargo||"Docente"})
- Ciudad: ${ciudad||"Colombia"} | Área: ${area} | Grado: ${grado}° | Periodo: ${periodo||"1"}
- Fecha: ${fecha||new Date().toLocaleDateString("es-CO")} | Tema: ${tema} | Duración: ${durTexto}
- Nivel: ${nivelEducativo||nivel}

NIVEL EDUCATIVO SELECCIONADO: ${nivelEducativo||nivel} — USA ESTE NIVEL EN TODO EL DOCUMENTO
ESTRATEGIAS ELEGIDAS: Apertura: ${tipoApertura} | Desarrollo: ${estratDesarrollo} | Retro: ${retroalimentacion} | Cierre: ${tipoCierre} | Tarea: ${dejaTarea?estratTarea:"Sin tarea"}

BANCO DE ESTRATEGIAS DISPONIBLES (úsalas en el contenido):
Saberes previos: Preguntas exploratorias, Discusión guiada, SQA, Lluvia de ideas, Actividad focal introductoria, Preguntas guía, Preguntas literales.
Comprensión: Cuadro comparativo, Resumen, Parafraseo, Diagrama de árbol, Matriz de inducción, Analogía, Esquema, Cuadro sinóptico, Ishikawa, Síntesis, Diagrama de flujo, Mapa mental, Mapa conceptual.
Grupales: Panel, Foro, Entrevista, Debate, Simposio, Taller, Juego de roles, Seminario, Mesa redonda, Coloquio.
Aprendizaje activo: Aprendizaje cooperativo, Simulación, Estudio de caso, ABP, ABPR, Aula invertida, Contrato de aprendizaje.

===APERTURA===
TIPO: ${tipoApertura}
Redacta el contenido completo de la apertura contextualizado en Colombia para nivel ${nivelEducativo||nivel}, grado ${grado}°. Mínimo 8 líneas. NO uses corchetes. Escribe el texto directamente.

===SABERES_PREVIOS===
Escribe EXACTAMENTE 4 preguntas diagnósticas sobre "${tema}" para nivel ${nivelEducativo||nivel}, grado ${grado}°.
Para CADA pregunta usa este formato EXACTO (cada pregunta+respuesta en líneas separadas):
1. [pregunta diagnóstica]
   Respuesta esperada: [respuesta breve de lo que el estudiante debería responder]
2. [pregunta diagnóstica]
   Respuesta esperada: [respuesta breve]
3. [pregunta diagnóstica]
   Respuesta esperada: [respuesta breve]
4. [pregunta diagnóstica]
   Respuesta esperada: [respuesta breve]

===DESARROLLO===
ESTRATEGIA: ${estratDesarrollo}
Redacta el contenido temático EXTENSO Y COMPLETO sobre "${tema}" para nivel ${nivelEducativo||nivel}, grado ${grado}°.
REQUISITOS OBLIGATORIOS:
- Mínimo 6 subtemas, cada uno con título ## en mayúsculas
- Cada subtema desarrollado en mínimo 4-6 líneas de contenido pedagógico
- Incluir definiciones precisas, conceptos clave en **negrita**
- Ejemplos concretos y reales del contexto colombiano y latinoamericano
- Datos, cifras o hechos verificables con su fuente entre paréntesis: (Fuente: Nombre, año)
- Al final de cada subtema: una actividad o pregunta reflexiva marcada como → REFLEXIONA:
- Conectar el contenido con la estrategia pedagógica: ${estratDesarrollo}
- Vocabulario apropiado para ${nivelEducativo||nivel}, grado ${grado}°
- Mínimo 600 palabras en total para esta sección
NO uses corchetes. Escribe el contenido directamente como texto pedagógico.

===RETROALIMENTACION===
ESTRATEGIA: ${retroalimentacion}
Redacta una actividad COMPLETA Y DETALLADA de retroalimentación sobre "${tema}" aplicando la estrategia ${retroalimentacion}.
La actividad debe:
- Tener un título claro
- Incluir objetivo de la actividad
- Tener instrucciones paso a paso (mínimo 4 pasos)
- Incluir material o recursos necesarios
- Duración estimada
- Criterios de verificación del aprendizaje
Mínimo 200 palabras. Escribe directamente sin corchetes.

===TALLER===
Escribe el taller con EXACTAMENTE estas 5 secciones numeradas, cada una en su propia línea:
1. COMPRENSIÓN: Escribe 2 preguntas sobre el contenido de "${tema}"
2. APLICACIÓN PRÁCTICA: Describe 1 actividad concreta donde el estudiante aplique lo aprendido
3. PENSAMIENTO CRÍTICO: Escribe 1 pregunta que exija análisis profundo sobre "${tema}"
4. CREATIVIDAD: Describe 1 actividad creativa relacionada con "${tema}"
5. INVESTIGACIÓN: Indica 1 consulta breve con una fuente sugerida específica

===CIERRE===
ESTRATEGIA: ${tipoCierre}
Redacta un cierre COMPLETO aplicando la estrategia ${tipoCierre}. Incluye:
PASO 1 - SÍNTESIS: Resume los conceptos más importantes de "${tema}" en forma de texto, lista o mapa (según la estrategia)
PASO 2 - METACOGNICIÓN: 3 preguntas de reflexión personal: ¿Qué aprendí hoy? ¿Cómo lo aprendí? ¿Para qué me sirve?
PASO 3 - CONEXIÓN COTIDIANA: Explica cómo aplica "${tema}" en la vida diaria del estudiante en Colombia
PASO 4 - COMPROMISOS: 2 compromisos concretos que el estudiante puede tomar
Mínimo 200 palabras. Escribe directamente sin corchetes.

===TAREA===
${dejaTarea?`ESTRATEGIA: ${estratTarea}\n[Tarea con instrucciones claras]`:"Sin tarea."}

===EXTRAS===
OBJETIVO: Redacta el objetivo de aprendizaje COMPLETO con verbo en infinitivo, específico para "${tema}" en nivel ${nivelEducativo||nivel}, grado ${grado}°. Mínimo 2 líneas. NO uses corchetes.
COMPETENCIA: Redacta la competencia específica del área ${area} para grado ${grado}° en Colombia. Mínimo 1 línea completa.
DBA: Redacta el Derecho Básico de Aprendizaje COMPLETO Y LITERAL del área ${area} para grado ${grado}° según el MEN Colombia. ESCRÍBELO COMPLETO, no lo cites con decreto ni URL. Ejemplo de formato correcto: "DBA #3: Comprende que los seres vivos...". NUNCA escribas "Decreto" ni URL.
ESTANDAR: Redacta el Estándar Básico de Competencia COMPLETO del área ${area} para grado ${grado}° según el MEN. ESCRÍBELO COMPLETO en texto. Ejemplo: "Identifico y describo características de los seres vivos...". NUNCA escribas URL ni número de resolución.
INDICADOR1: Redacta los indicadores de competencia para la dimensión SABER sobre "${tema}". Usa este formato EXACTO:
🟢 Nivel Básico: (escribe 2 indicadores de nivel básico numerados)
🟡 Nivel Intermedio: (escribe 2 indicadores de nivel intermedio numerados)
🔵 Nivel Avanzado: (escribe 2 indicadores de nivel avanzado numerados)
INDICADOR2: Redacta los indicadores de competencia para la dimensión HACER sobre "${tema}". Mismo formato con 🟢🟡🔵 y niveles.
INDICADOR3: Redacta los indicadores de competencia para la dimensión SER sobre "${tema}". Mismo formato con 🟢🟡🔵 y niveles.
EVIDENCIA: Redacta la evidencia de aprendizaje observable y concreta para "${tema}". Texto completo.
CRITERIO: Redacta la escala de valoración: Bajo (descripción) / Básico (descripción) / Alto (descripción) / Superior (descripción). Todo en texto.
EVALUACION: Redacta una evaluación completa sobre "${tema}" con: 3 preguntas abiertas numeradas, 2 preguntas de selección múltiple con opciones A/B/C/D, y 1 actividad práctica evaluativa. Todo numerado y en formato de lista.
RECURSOS: Escribe 5 recursos específicos numerados (1. 2. 3. 4. 5.) apropiados para las estrategias ${estratDesarrollo} y ${tipoApertura} en nivel ${nivelEducativo||nivel}.
WEBGRAFIA: Escribe 3 fuentes reales consultadas para esta guía en formato APA: Apellido, N. (año). Título del recurso. URL real.

Redacta en español impecable. Todo contextualizado en Colombia. Nunca seas genérico.`;

    const resp = await groqCompletion({
      model:"llama-3.3-70b-versatile", max_tokens:8192, temperature:0.7,
      messages:[
        { role:"system", content:"Eres el mejor pedagogo de Colombia. Guías de altísima calidad. NUNCA genérico. Respeta ===SECCION===." },
        { role:"user", content:prompt }
      ]
    });
    res.json({ contenido:resp.choices[0].message.content, ok:true });
  } catch(e) { console.error("❌ Groq:",e.message); res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// ======================================================
//  EXPORTAR WORD (formato institucional)
// ======================================================
app.post("/exportar-word", async (req,res) => {
  try {
    const { contenido,institucion,docente,area,grado,periodo,fecha,tema,duracion,logoPath,banderaPath,cargo,ciudad,nivelEducativo } = req.body;
    const gradoN = parseInt(grado)||0;
    const nivelLabel = nivelEducativo==="preescolar"?"Preescolar":
                       nivelEducativo==="primaria"?"Primaria":
                       nivelEducativo==="media_tecnica"?"Media Técnica":
                       nivelEducativo==="bachillerato"?"Bachillerato":
                       gradoN===0?"Preescolar":gradoN<=5?"Primaria":
                       gradoN<=9?"Bachillerato":"Media/Bachillerato";
    const { Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,
            AlignmentType,BorderStyle,WidthType,ShadingType,VerticalAlign,ImageRun } = require("docx");

    const bloques = {};
    let secActual = null;
    for (const linea of contenido.split("\n")) {
      // Match ===SECCION=== or === SECCION === or ##SECCION## 
      const m = linea.match(/^===\s*(\w+)\s*===/) || linea.match(/^##\s*(\w+)\s*##/);
      if (m) { secActual=m[1].toUpperCase(); bloques[secActual]=[]; continue; }
      // Also match lines like "APERTURA:" or "DESARROLLO:" at start
      const m2 = linea.match(/^(APERTURA|SABERES_PREVIOS|SABERES|DESARROLLO|RETROALIMENTACION|TALLER|CIERRE|TAREA|EXTRAS)\s*:/i);
      if (m2) { secActual=m2[1].toUpperCase(); bloques[secActual]=[]; continue; }
      if (secActual) bloques[secActual].push(linea);
    }
    // Aliases
    if (!bloques["SABERES_PREVIOS"] && bloques["SABERES"]) bloques["SABERES_PREVIOS"] = bloques["SABERES"];
    
    const getBloque = (k) => {
      const lines = (bloques[k]||bloques[k.toUpperCase()]||[]);
      if(!lines.length) return "";
      return lines
        .filter(l => !l.match(/^===.*===/) && !l.match(/^TIPO:/i) && !l.match(/^ESTRATEGIA:/i))
        .join("\n")
        .replace(/\*\*/g,"")
        .replace(/^[\s\n]+|[\s\n]+$/g,"")
        .trim();
    };

    const durMin   = parseInt(duracion)||55;
    const numHoras = Math.round(durMin/55);
    const durTexto = numHoras===1?"1 hora (55 min)":`${numHoras} horas (${durMin} min)`;

    const AZUL="1B4F8A", AZUL_CL="D6E4F7", NEGRO="000000", GRIS="F2F2F2", BLANCO="FFFFFF";
    const bN  = { style:BorderStyle.SINGLE, size:6, color:NEGRO };
    const bA  = { style:BorderStyle.SINGLE, size:8, color:AZUL  };
    const bAll= { top:bN,bottom:bN,left:bN,right:bN };
    const bAllA={ top:bA,bottom:bA,left:bA,right:bA };
    // Ancho total: 12240 - 567*2 = 11106 DXA (márgenes 1cm)
    const TW = 11106;

    const txt = (text,opts={}) => new TextRun({ text,font:"Times New Roman",size:opts.size||24,bold:opts.bold||false,italics:opts.italic||false,color:opts.color||NEGRO,...opts });
    const par = (children,opts={}) => new Paragraph({ children,alignment:opts.align||AlignmentType.BOTH,spacing:opts.spacing||{before:40,after:40},...opts });
    const cel = (children,opts={}) => new TableCell({
      width:{ size:opts.w||1000,type:WidthType.DXA },
      margins:{ top:80,bottom:80,left:100,right:100 },
      shading:{ fill:opts.fill||BLANCO,type:ShadingType.CLEAR },
      verticalAlign:opts.va||VerticalAlign.CENTER,
      borders:opts.borders||bAll, children
    });

    const makeLogoCell = (imgPath,w) => {
      const abs = imgPath ? path.join(__dirname,imgPath) : null;
      if (abs&&fs.existsSync(abs)) {
        try {
          const buf=fs.readFileSync(abs);
          return cel([par([new ImageRun({data:buf,transformation:{width:80,height:80},type:"png"})],{align:AlignmentType.CENTER})],{w,fill:BLANCO,borders:bAllA});
        } catch(_) {}
      }
      return cel([par([txt("",{size:20})])],{w,fill:AZUL_CL,borders:bAllA});
    };

    const children = [];

    // ENCABEZADO
    const LC=1300, RC=1300, CC=TW-LC-RC;
    children.push(new Table({
      width:{size:TW,type:WidthType.DXA}, columnWidths:[LC,CC,RC],
      borders:{top:bA,bottom:bA,left:bA,right:bA,insideH:bA,insideV:bA},
      rows:[new TableRow({ children:[
        makeLogoCell(logoPath,LC),
        cel([
          par([txt((institucion||"INSTITUCIÓN EDUCATIVA").toUpperCase(),{bold:true,size:24,color:AZUL})],{align:AlignmentType.CENTER,spacing:{before:60,after:20}}),
          par([txt("Aprobado según Decreto No. 0001295 del 04 Noviembre de 2009",{size:16})],{align:AlignmentType.CENTER,spacing:{before:0,after:0}}),
          par([txt("De la Secretaría de Educación del Caquetá",{size:16})],{align:AlignmentType.CENTER,spacing:{before:0,after:0}}),
          par([txt(`${ciudad||"Valparaíso"} - Caquetá`,{size:18,bold:true})],{align:AlignmentType.CENTER,spacing:{before:20,after:40}}),
        ],{w:CC,borders:bAllA}),
        makeLogoCell(banderaPath,RC),
      ]})]
    }));

    children.push(par([txt("")]));

    // PLAN DE AULA
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[TW],
      rows:[new TableRow({ children:[cel([par([txt("PLAN DE AULA",{bold:true,size:30,color:AZUL})],{align:AlignmentType.CENTER,spacing:{before:80,after:80}})],{w:TW,fill:AZUL_CL,borders:bAllA})]})]
    }));

    // DOCENTE / SEDE
    const H=TW/2;
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[H,H],
      rows:[new TableRow({ children:[
        cel([par([txt("Nombre del Docente: ",{bold:true}),txt(docente||"_______________________")])],{w:H,borders:bAll}),
        cel([par([txt("Sede Educativa: ",{bold:true}),txt(institucion||"_______________________")])],{w:H,borders:bAll}),
      ]})]
    }));

    // INFO GENERAL
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[TW],
      rows:[new TableRow({ children:[cel([par([txt("INFORMACIÓN GENERAL",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]
    }));

    // Fila nivel/grado/periodo/area/semana
    const [c1,c2,c3,c4,c5,c6,c7,c8,c9,c10]=[Math.round(TW*0.07),Math.round(TW*0.12),Math.round(TW*0.07),Math.round(TW*0.07),Math.round(TW*0.08),Math.round(TW*0.07),Math.round(TW*0.07),Math.round(TW*0.28),Math.round(TW*0.06),0];
    const c10v = TW-c1-c2-c3-c4-c5-c6-c7-c8-c9;
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[c1,c2,c3,c4,c5,c6,c7,c8,c9,c10v],
      rows:[new TableRow({ children:[
        cel([par([txt("NIVEL",{bold:true,size:18})])],{w:c1,fill:GRIS,borders:bAll}),
        cel([par([txt(nivelLabel,{size:18})])],{w:c2,borders:bAll}),
        cel([par([txt("GRADO",{bold:true,size:18})])],{w:c3,fill:GRIS,borders:bAll}),
        cel([par([txt(grado||"0°",{size:18})])],{w:c4,borders:bAll}),
        cel([par([txt("PERÍODO",{bold:true,size:18})])],{w:c5,fill:GRIS,borders:bAll}),
        cel([par([txt(periodo||"I",{size:18})])],{w:c6,borders:bAll}),
        cel([par([txt("ÁREA",{bold:true,size:18})])],{w:c7,fill:GRIS,borders:bAll}),
        cel([par([txt(area||"",{size:18})])],{w:c8,borders:bAll}),
        cel([par([txt("SEM",{bold:true,size:18})])],{w:c9,fill:GRIS,borders:bAll}),
        cel([par([txt("1",{size:18})])],{w:c10v,borders:bAll}),
      ]})]
    }));

    const LBL=Math.round(TW*0.13), VAL=TW-Math.round(TW*0.13);
    const fila2=(label,value)=>new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[LBL,VAL],
      rows:[new TableRow({ children:[cel([par([txt(label,{bold:true})])],{w:LBL,fill:GRIS,borders:bAll}),cel([par([txt(value)])],{w:VAL,borders:bAll})] })]
    });

    const extrasRaw  = getBloque("EXTRAS");
    const objetivos  = extrasRaw.match(/OBJETIVO[:\s\n]+(Desarrollar|Identificar|Comprender|Analizar|Aplicar|Producir|Utilizar|Reconocer|Construir|Explorar|Crear|Demostrar|Evaluar|Fomentar)[\s\S]*?(?=\nCOMPETENCIA:|\nESTANDAR:|\nDBA:|\nINDICADOR|$)/i)?.[0]?.replace(/^OBJETIVO[:\s]*/i,"")?. trim()||
                      extrasRaw.match(/OBJETIVO[:\s]+([^\n]{20,})/i)?.[1]?.trim()||
                      "Desarrollar en los estudiantes habilidades comunicativas, cognitivas y socioafectivas a través del estudio del tema propuesto, aplicando estrategias pedagógicas activas y contextualizadas.";
    const recursos   = extrasRaw.match(/RECURSOS[:\s]+([\s\S]*?)(?=WEBGRAFIA:|$)/i)?.[1]?.trim()||"Talento humano, cuaderno, lápiz, colores, material del entorno.";
    const webgrafia  = extrasRaw.match(/WEBGRAFIA[:\s]+([\s\S]*?)$/i)?.[1]?.trim()||"MEN - lineamientos curriculares, DBA oficiales, textos escolares.";
    const evaluacion = extrasRaw.match(/EVALUACION[:\s]+([\s\S]*?)(?=RECURSOS:|WEBGRAFIA:|$)/i)?.[1]?.trim()||"Evaluación oral y escrita sobre el tema trabajado.";
    const ind1 = extrasRaw.match(/INDICADOR1[:\s]+([\s\S]*?)(?=INDICADOR2:|$)/i)?.[1]?.trim()||"";
    const ind2 = extrasRaw.match(/INDICADOR2[:\s]+([\s\S]*?)(?=INDICADOR3:|$)/i)?.[1]?.trim()||"";
    const ind3 = extrasRaw.match(/INDICADOR3[:\s]+([\s\S]*?)(?=EVIDENCIA:|$)/i)?.[1]?.trim()||"";

    children.push(fila2("TEMA",tema||""));
    children.push(fila2("OBJETIVO",objetivos.substring(0,400)));
    children.push(fila2("RECURSOS",recursos.substring(0,400)));
    children.push(fila2("WEBGRAFÍA",webgrafia.substring(0,400)));

    // REFERENTES
    children.push(par([txt("")]));
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[TW],
      rows:[new TableRow({ children:[cel([par([txt("REFERENTES NACIONALES DE CALIDAD",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]
    }));

    const extrasTexto = getBloque("EXTRAS");
    const dba2 = extrasTexto.match(/DBA[:\s\n]+([\s\S]*?)(?=ESTANDAR:|INDICADOR|EVIDENCIA:|CRITERIO:|RECURSOS:|WEBGRAFIA:|$)/i)?.[1]?.trim()||
               extrasTexto.match(/DBA[:\s]+([^\n]+)/i)?.[1]?.trim()||"Ver DBA oficial MEN para este grado y área.";
    const comp2= extrasTexto.match(/ESTANDAR[:\s\n]+([\s\S]*?)(?=DBA:|INDICADOR|EVIDENCIA:|CRITERIO:|$)/i)?.[1]?.trim()||
               extrasTexto.match(/ESTANDAR[:\s]+([^\n]+)/i)?.[1]?.trim()||
                  extrasTexto.match(/COMPETENCIA[:\s]+([\s\S]*?)(?=DBA:|EVIDENCIA:|$)/i)?.[1]?.trim()||"Desarrolla competencias disciplinares.";
    const evid = extrasTexto.match(/EVIDENCIA[:\s]+([\s\S]*?)(?=CRITERIO:|RECURSOS:|$)/i)?.[1]?.trim()||"Demuestra comprensión de los conceptos.";
    const LR=Math.round(TW*0.28), VR=TW-Math.round(TW*0.28);

    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[LR,VR],
      rows:[
        new TableRow({ children:[cel([par([txt("ESTÁNDAR BÁSICO DE COMPETENCIA (MEN)",{bold:true})])],{w:LR,fill:GRIS,borders:bAll}),cel([par([txt(comp2.substring(0,400))])],{w:VR,borders:bAll})] }),
        new TableRow({ children:[cel([par([txt("DBA — DERECHO BÁSICO DE APRENDIZAJE",{bold:true})])],{w:LR,fill:GRIS,borders:bAll}),cel([par([txt((dba2||dba||"Ver DBA oficial MEN").substring(0,400))])],{w:VR,borders:bAll})] }),
      ]
    }));

    // Indicadores de competencia (Saber/Hacer/Ser)
    const S1=Math.round(TW*0.18), S2=Math.round((TW-Math.round(TW*0.18))/3), S3=S2, S4=TW-S1-S2-S3;
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[S1,S2,S3,S4],
      rows:[
        new TableRow({ children:[
          cel([par([txt("INDICADORES DE COMPETENCIA",{bold:true})])],{w:S1,fill:GRIS,borders:bAll}),
          cel([par([txt("SABER",{bold:true})],{align:AlignmentType.CENTER})],{w:S2,fill:GRIS,borders:bAll}),
          cel([par([txt("HACER",{bold:true})],{align:AlignmentType.CENTER})],{w:S3,fill:GRIS,borders:bAll}),
          cel([par([txt("SER",{bold:true})],{align:AlignmentType.CENTER})],{w:S4,fill:GRIS,borders:bAll}),
        ]}),
        new TableRow({ children:[
          cel([par([txt("Indicadores por dimensión")])],{w:S1,borders:bAll}),
          cel([par([txt((ind1||"Comprende los conceptos fundamentales del tema.").substring(0,600))])],{w:S2,borders:bAll}),
          cel([par([txt((ind2||"Aplica lo aprendido en situaciones prácticas.").substring(0,600))])],{w:S3,borders:bAll}),
          cel([par([txt((ind3||"Demuestra actitudes de respeto y colaboración.").substring(0,400))])],{w:S4,borders:bAll}),
        ]}),
      ]
    }));

    // METODOLOGÍA
    children.push(par([txt("")]));
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[TW],
      rows:[new TableRow({ children:[cel([par([txt("METODOLOGÍA EN SECUENCIA DIDÁCTICA",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]
    }));

    const secciones=[
      {t:"INICIO DE LA CLASE (APERTURA Y MOTIVACIÓN)", c:getBloque("APERTURA").substring(0,1500)},
      {t:"EXPLORACIÓN (SABERES PREVIOS)",    c:getBloque("SABERES_PREVIOS").split("\n").filter(l=>l.trim()).map((l,i)=>(i+1)+". "+l.replace(/^\d+\.\s*/,"")).join("\n").substring(0,1500)},
      {t:"ESTRUCTURACIÓN (PRÁCTICA Y DESARROLLO)", c:(getBloque("DESARROLLO")+" "+getBloque("TALLER")).substring(0,1200)},
      {t:"TRANSFERENCIA (VALORACIÓN)",       c:getBloque("RETROALIMENTACION").substring(0,1000)},
      {t:"REFUERZO (INTEGRACIÓN A CONTEXTOS COTIDIANOS)", c:(getBloque("CIERRE")+"\n"+getBloque("TAREA")).substring(0,1000)},
    ];
    for (const s of secciones) {
      children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[TW],
        rows:[
          new TableRow({ children:[cel([par([txt(s.t,{bold:true})])],{w:TW,fill:GRIS,borders:bAll})] }),
          new TableRow({ children:[cel([par([txt(s.c||"Ver contenido generado.")])],{w:TW,borders:bAll})] }),
        ]
      }));
    }

    // EVALUACIÓN
    children.push(par([txt("")]));
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[TW],
      rows:[new TableRow({ children:[cel([par([txt("EVALUACIÓN",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]
    }));
    const EV=Math.round(TW*0.6), ET=TW-Math.round(TW*0.6);
    const evalText = evaluacion.substring(0,600)||"Evaluación oral y escrita pertinente al tema.";
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[EV,ET],
      rows:[
        new TableRow({ children:[cel([par([txt("DESEMPEÑOS ESPERADOS",{bold:true})],{align:AlignmentType.CENTER})],{w:EV,fill:GRIS,borders:bAll}),cel([par([txt("EVALUACIÓN PERTINENTE",{bold:true})],{align:AlignmentType.CENTER})],{w:ET,fill:GRIS,borders:bAll})] }),
        new TableRow({ children:[cel([par([txt(evid.substring(0,300))])],{w:EV,borders:bAll}),cel([par([txt(evalText)])],{w:ET,borders:bAll})] }),
      ]
    }));

    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[TW],
      rows:[
        new TableRow({ children:[cel([par([txt("REFERENCIAS BIBLIOGRÁFICAS Y WEBGRAFÍA",{bold:true})],{align:AlignmentType.CENTER})],{w:TW,fill:GRIS,borders:bAll})] }),
        new TableRow({ children:[cel([par([txt((webgrafia||"MEN - Lineamientos Curriculares, DBA oficiales, Mallas de Aprendizaje, internet, textos escolares.").substring(0,500))])],{w:TW,borders:bAll})] }),
      ]
    }));

    // FIRMAS
    children.push(par([txt("")]));
    children.push(par([txt("")]));
    const FW=Math.round(TW/2), FW2=TW-Math.round(TW/2);
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[FW,FW2],
      rows:[new TableRow({ children:[
        cel([par([txt("_______________________________")],{align:AlignmentType.CENTER}),par([txt(docente||"Nombre del Docente",{bold:true})],{align:AlignmentType.CENTER}),par([txt(cargo||"Docente",{size:20})],{align:AlignmentType.CENTER})],
          {w:FW,borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}}}),
        cel([par([txt("_______________________________")],{align:AlignmentType.CENTER}),par([txt("Coordinador / Rector",{bold:true})],{align:AlignmentType.CENTER}),par([txt("Vo. Bo.",{size:20})],{align:AlignmentType.CENTER})],
          {w:FW2,borders:{top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}}}),
      ]})]
    }));

    const doc = new Document({
      styles:{ default:{ document:{ run:{ font:"Times New Roman",size:24 } } } },
      sections:[{ properties:{ page:{ size:{width:12240,height:15840}, margin:{top:567,right:567,bottom:567,left:567} } }, children }]
    });
    const buffer = await Packer.toBuffer(doc);
    const nombre = `PlanAula_${area}_Grado${grado}_${tema.substring(0,20).replace(/\s+/g,"_")}.docx`;
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition",`attachment; filename="${nombre}"`);
    res.send(buffer);
  } catch(e) { console.error("❌ Word:",e.message); res.status(500).json({ mensaje:"Error Word: "+e.message }); }
});

// ======================================================
//  EXPORTAR PDF (formato institucional)
// ======================================================
app.post("/exportar-pdf", async (req,res) => {
  try {
    const { contenido,institucion,docente,area,grado,periodo,fecha,tema,duracion,logoPath,banderaPath,cargo,ciudad,nivelEducativo } = req.body;
    const gradoN = parseInt(grado)||0;
    const nivelLabel = nivelEducativo==="preescolar"?"Preescolar":
                       nivelEducativo==="primaria"?"Primaria":
                       nivelEducativo==="media_tecnica"?"Media Técnica":
                       nivelEducativo==="bachillerato"?"Bachillerato":
                       gradoN===0?"Preescolar":gradoN<=5?"Primaria":
                       gradoN<=9?"Bachillerato":"Media/Bachillerato";
    const PDFDocument = require("pdfkit");

    const bloques = {};
    let secActual = null;
    for (const linea of contenido.split("\n")) {
      // Match ===SECCION=== or === SECCION === or ##SECCION## 
      const m = linea.match(/^===\s*(\w+)\s*===/) || linea.match(/^##\s*(\w+)\s*##/);
      if (m) { secActual=m[1].toUpperCase(); bloques[secActual]=[]; continue; }
      // Also match lines like "APERTURA:" or "DESARROLLO:" at start
      const m2 = linea.match(/^(APERTURA|SABERES_PREVIOS|SABERES|DESARROLLO|RETROALIMENTACION|TALLER|CIERRE|TAREA|EXTRAS)\s*:/i);
      if (m2) { secActual=m2[1].toUpperCase(); bloques[secActual]=[]; continue; }
      if (secActual) bloques[secActual].push(linea);
    }
    // Aliases
    if (!bloques["SABERES_PREVIOS"] && bloques["SABERES"]) bloques["SABERES_PREVIOS"] = bloques["SABERES"];
    
    const getBloque = (k) => {
      const lines = (bloques[k]||bloques[k.toUpperCase()]||[]);
      if(!lines.length) return "";
      return lines
        .filter(l => !l.match(/^===.*===/) && !l.match(/^TIPO:/i) && !l.match(/^ESTRATEGIA:/i))
        .join("\n")
        .replace(/\*\*/g,"")
        .replace(/^[\s\n]+|[\s\n]+$/g,"")
        .trim();
    };

    const AZUL="#1B4F8A", AZUL_CL="#D6E4F7", NEGRO="#000000", GRIS="#F2F2F2", BLANCO="#FFFFFF", GRIS_B="#CCCCCC";
    const doc = new PDFDocument({ margin:30, size:"LETTER", bufferPages:true });
    const buffers=[];
    doc.on("data",d=>buffers.push(d));
    const fin = new Promise(resolve=>doc.on("end",resolve));
    const FB="Helvetica-Bold", FN="Helvetica", FI="Helvetica-Oblique";
    const ML=30, PW=doc.page.width-60;

    const dibujarBorde=()=>{
      doc.rect(4,4,doc.page.width-8,doc.page.height-8).lineWidth(2).strokeColor(AZUL).stroke();
      doc.rect(7,7,doc.page.width-14,doc.page.height-14).lineWidth(0.5).strokeColor(AZUL_CL).stroke();
    };
    dibujarBorde();

    // Encabezado
    const HY=16, HH=88;
    doc.rect(ML,HY,PW,HH).fill(BLANCO);
    doc.rect(ML,HY,PW,HH).lineWidth(1).strokeColor(AZUL).stroke();

    const logoAbs=logoPath?path.join(__dirname,logoPath):null;
    if (logoAbs&&fs.existsSync(logoAbs)) { try{ doc.image(logoAbs,ML+3,HY+4,{width:78,height:78,fit:[78,78]}); }catch(_){doc.rect(ML+3,HY+4,78,78).fill(AZUL_CL);} }
    else { doc.rect(ML+3,HY+4,78,78).fill(AZUL_CL); doc.font(FB).fontSize(7).fillColor(AZUL).text("ESCUDO",ML+3,HY+37,{width:78,align:"center"}); }

    const banAbs=banderaPath?path.join(__dirname,banderaPath):null;
    if (banAbs&&fs.existsSync(banAbs)) { try{ doc.image(banAbs,ML+PW-81,HY+4,{width:78,height:78,fit:[78,78]}); }catch(_){doc.rect(ML+PW-81,HY+4,78,78).fill(AZUL_CL);} }
    else { doc.rect(ML+PW-81,HY+4,78,78).fill(AZUL_CL); doc.font(FB).fontSize(7).fillColor(AZUL).text("BANDERA",ML+PW-81,HY+37,{width:78,align:"center"}); }

    doc.moveTo(ML+84,HY+6).lineTo(ML+84,HY+HH-6).strokeColor(AZUL).lineWidth(0.5).stroke();
    doc.moveTo(ML+PW-84,HY+6).lineTo(ML+PW-84,HY+HH-6).strokeColor(AZUL).lineWidth(0.5).stroke();

    const CX=ML+88, CW=PW-176;
    doc.font(FB).fontSize(12).fillColor(AZUL).text((institucion||"INSTITUCIÓN EDUCATIVA").toUpperCase(),CX,HY+10,{width:CW,align:"center"});
    doc.font(FN).fontSize(7).fillColor("#444")
       .text("Aprobado según Decreto No. 0001295 del 04 Noviembre de 2009",CX,HY+30,{width:CW,align:"center"})
       .text("De la Secretaría de Educación del Caquetá",CX,HY+41,{width:CW,align:"center"});
    doc.font(FB).fontSize(8).fillColor(AZUL).text(`${ciudad||"Valparaíso"} - Caquetá`,CX,HY+55,{width:CW,align:"center"});
    doc.font(FB).fontSize(10).fillColor(AZUL).text("PLAN DE AULA",CX,HY+70,{width:CW,align:"center"});
    doc.y=HY+HH+10;

    // Helper tabla PDF
    const tabla=(filas,colWidths)=>{
      if (doc.y>doc.page.height-80){ doc.addPage(); dibujarBorde(); doc.y=30; }
      let rowY=doc.y;
      for (const fila of filas){
        let maxH=18;
        fila.forEach((cel,i)=>{
          const t=cel.texto||""; const fs=cel.fs||9;
          doc.font(cel.bold?FB:FN).fontSize(fs);
          const h=Math.max(18, doc.heightOfString(t,{width:colWidths[i]-8})+10);
          if(h>maxH) maxH=h;
        });
        if(rowY+maxH>doc.page.height-40){ doc.addPage(); dibujarBorde(); rowY=30; }
        let colX=ML;
        fila.forEach((cel,i)=>{
          const w=colWidths[i];
          doc.rect(colX,rowY,w,maxH).fill(cel.fill||BLANCO);
          doc.rect(colX,rowY,w,maxH).lineWidth(0.4).strokeColor(GRIS_B).stroke();
          doc.font(cel.bold?FB:FN).fontSize(cel.fs||10).fillColor(cel.color||NEGRO)
             .text(cel.texto||"",colX+4,rowY+4,{width:w-8,align:cel.align||(cel.bold?"left":"justify")});
          colX+=w;
        });
        rowY+=maxH;
      }
      doc.y=rowY+3;
    };

    const az =(t,o={})=>({texto:t,fill:AZUL, color:BLANCO,bold:true, fs:9,align:"center",...o});
    const gr =(t,o={})=>({texto:t,fill:GRIS, color:NEGRO, bold:true, fs:9,...o});
    const nm =(t,o={})=>({texto:t,fill:BLANCO,color:NEGRO, bold:false,fs:10,...o});

    // Docente/sede
    tabla([[gr("Nombre del Docente:",{fs:8}),nm(docente||"_____",{fs:8}),gr("Sede:",{fs:8}),nm(institucion||"_____",{fs:8})]], [PW*0.15,PW*0.35,PW*0.1,PW*0.4]);
    tabla([[az("INFORMACIÓN GENERAL",{fs:10})]], [PW]);
    tabla([[gr("NIVEL",{fs:8}),nm(nivelLabel,{fs:8}),gr("GRADO",{fs:8}),nm(grado||"",{fs:8}),gr("PERÍODO",{fs:8}),nm(periodo||"",{fs:8}),gr("ÁREA",{fs:8}),nm(area||"",{fs:8}),gr("SEM",{fs:8}),nm("1",{fs:8})]], [PW*0.07,PW*0.12,PW*0.07,PW*0.07,PW*0.08,PW*0.07,PW*0.07,PW*0.28,PW*0.06,PW*0.11]);
    tabla([[gr("TEMA",{fs:8}),nm(tema,{fs:8})]],[PW*0.12,PW*0.88]);

    const extP   = getBloque("EXTRAS");
    const obj    = extP.match(/OBJETIVO[:\s\n]+(Desarrollar|Identificar|Comprender|Analizar|Aplicar|Producir|Utilizar|Reconocer|Construir|Explorar|Crear|Demostrar|Evaluar|Fomentar)[\s\S]*?(?=\nCOMPETENCIA:|\nESTANDAR:|\nDBA:|\nINDICADOR|$)/i)?.[0]?.replace(/^OBJETIVO[:\s]*/i,"")?. trim()||
                  extP.match(/OBJETIVO[:\s]+([^\n]{20,})/i)?.[1]?.trim()||
                  "Desarrollar en los estudiantes habilidades comunicativas, cognitivas y socioafectivas a través del estudio del tema propuesto.";
    const rec    = extP.match(/RECURSOS[:\s]+([\s\S]*?)(?=WEBGRAFIA:|$)/i)?.[1]?.trim()||"Talento humano, cuaderno, lápiz, colores.";
    const webg   = extP.match(/WEBGRAFIA[:\s]+([\s\S]*?)$/i)?.[1]?.trim()||"MEN - lineamientos curriculares, DBA oficiales, textos escolares.";
    const evalP  = extP.match(/EVALUACION[:\s]+([\s\S]*?)(?=RECURSOS:|WEBGRAFIA:|$)/i)?.[1]?.trim()||"Evaluación oral y escrita sobre el tema trabajado.";
    const pind1  = extP.match(/INDICADOR1[:\s]+([\s\S]*?)(?=INDICADOR2:|$)/i)?.[1]?.trim()||"Comprende conceptos fundamentales.";
    const pind2  = extP.match(/INDICADOR2[:\s]+([\s\S]*?)(?=INDICADOR3:|$)/i)?.[1]?.trim()||"Aplica lo aprendido en situaciones prácticas.";
    const pind3  = extP.match(/INDICADOR3[:\s]+([\s\S]*?)(?=EVIDENCIA:|$)/i)?.[1]?.trim()||"Demuestra actitudes de respeto y colaboración.";
    tabla([[gr("OBJETIVO",{fs:8}),nm(obj.substring(0,300),{fs:8})]],[PW*0.14,PW*0.86]);
    tabla([[gr("RECURSOS",{fs:8}),nm(rec.substring(0,300),{fs:8})]],[PW*0.14,PW*0.86]);

    doc.moveDown(0.3);
    tabla([[az("REFERENTES NACIONALES DE CALIDAD",{fs:10})]], [PW]);
    const et=getBloque("EXTRAS");
    const dba=et.match(/DBA[:\s\n]+([\s\S]*?)(?=ESTANDAR:|INDICADOR|EVIDENCIA:|CRITERIO:|RECURSOS:|WEBGRAFIA:|$)/i)?.[1]?.trim()||
             et.match(/DBA[:\s]+([^\n]+)/i)?.[1]?.trim()||"";
    const comp=et.match(/ESTANDAR[:\s\n]+([\s\S]*?)(?=DBA:|INDICADOR|EVIDENCIA:|CRITERIO:|$)/i)?.[1]?.trim()||
               et.match(/COMPETENCIA[:\s]+([\s\S]*?)(?=DBA:|EVIDENCIA:|$)/i)?.[1]?.trim()||"";
    const evid=et.match(/EVIDENCIA[:\s]+([\s\S]*?)(?=CRITERIO:|RECURSOS:|$)/i)?.[1]?.trim()||"";
    tabla([[gr("ESTÁNDARES BÁSICOS",{fs:8}),nm(comp.substring(0,300),{fs:8})],[gr("DBA",{fs:8}),nm(dba.substring(0,300),{fs:8})]],[PW*0.22,PW*0.78]);
    tabla([[gr("INDICADORES DE COMPETENCIA",{fs:8}),gr("SABER",{align:"center",fs:8}),gr("HACER",{align:"center",fs:8}),gr("SER",{align:"center",fs:8})],[nm("Por dimensión",{fs:8}),nm(pind1.substring(0,500),{fs:8}),nm(pind2.substring(0,500),{fs:8}),nm(pind3.substring(0,350),{fs:8})]],[PW*0.14,PW*0.29,PW*0.29,PW*0.28]);

    doc.moveDown(0.3);
    tabla([[az("METODOLOGÍA EN SECUENCIA DIDÁCTICA",{fs:10})]], [PW]);
    const secs=[
      {t:"INICIO DE LA CLASE (APERTURA Y MOTIVACIÓN)", c:getBloque("APERTURA").substring(0,1500)},
      {t:"EXPLORACIÓN (SABERES PREVIOS)",    c:getBloque("SABERES_PREVIOS").split("\n").filter(l=>l.trim()).map((l,i)=>(i+1)+". "+l.replace(/^\d+\.\s*/,"")).join("\n").substring(0,1500)},
      {t:"ESTRUCTURACIÓN (PRÁCTICA Y DESARROLLO)", c:(getBloque("DESARROLLO")+" "+getBloque("TALLER")).substring(0,1200)},
      {t:"TRANSFERENCIA (VALORACIÓN)",       c:getBloque("RETROALIMENTACION").substring(0,1000)},
      {t:"REFUERZO (INTEGRACIÓN A CONTEXTOS COTIDIANOS)",c:(getBloque("CIERRE")+"\n"+getBloque("TAREA")).substring(0,1000)},
    ];
    for (const s of secs) tabla([[gr(s.t,{fs:8,align:"left"})],[nm(s.c||".",{fs:8})]],[PW]);

    doc.moveDown(0.3);
    tabla([[az("EVALUACIÓN",{fs:10})]], [PW]);
    tabla([[gr("DESEMPEÑOS ESPERADOS",{align:"center",fs:8}),gr("EVALUACIÓN PERTINENTE",{align:"center",fs:8})],[nm(evid.substring(0,250),{fs:8}),nm((evalP||"Evaluación oral y escrita pertinente al tema.").substring(0,400),{fs:8})]],[PW*0.4,PW*0.6]);
    tabla([[gr("REFERENCIAS BIBLIOGRÁFICAS Y WEBGRAFÍA",{align:"center",fs:8})],[nm((webg||"MEN, DBA, Lineamientos Curriculares, internet, textos escolares.").substring(0,400),{fs:8})]],[PW]);

    // Firmas
    doc.moveDown(0.8);
    const fY=doc.y;
    doc.font(FN).fontSize(9).fillColor(NEGRO)
       .text("_______________________________",ML+20,fY,{width:PW/2-40,align:"center"})
       .text("_______________________________",ML+PW/2+20,fY,{width:PW/2-40,align:"center"});
    doc.font(FB).fontSize(9)
       .text(docente||"Nombre del Docente",ML+20,fY+14,{width:PW/2-40,align:"center"})
       .text("Coordinador / Rector",ML+PW/2+20,fY+14,{width:PW/2-40,align:"center"});
    doc.font(FI).fontSize(8).fillColor("#555")
       .text(cargo||"Docente",ML+20,fY+26,{width:PW/2-40,align:"center"})
       .text("Vo. Bo.",ML+PW/2+20,fY+26,{width:PW/2-40,align:"center"});

    // Pie
    const totalPags=doc.bufferedPageRange().count;
    for(let i=0;i<totalPags;i++){
      doc.switchToPage(i);
      const py=doc.page.height-20;
      doc.rect(ML,py-2,PW,14).fill(AZUL);
      doc.font(FI).fontSize(7).fillColor(BLANCO)
         .text(`${institucion||"I.E."}  ·  ${area} Grado ${grado}°  ·  ${tema}  ·  Pág. ${i+1}/${totalPags}`,ML,py+1,{width:PW,align:"center"});
    }

    doc.end(); await fin;
    const pdfBuffer=Buffer.concat(buffers);
    const nombre=`PlanAula_${area}_Grado${grado}_${tema.substring(0,20).replace(/\s+/g,"_")}.pdf`;
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`attachment; filename="${encodeURIComponent(nombre)}"`);
    res.send(pdfBuffer);
  } catch(e){ console.error("❌ PDF:",e.message); res.status(500).json({ mensaje:"Error PDF: "+e.message }); }
});

// ======================================================
//  INICIAR SERVIDOR
// ======================================================
app.listen(5000, () => {
  console.log("✅ EduClass Premium IA v3 — Puerto 5000 activo");
  console.log("🌐 Frontend: http://localhost:3000");
});