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
const DB_PATH        = path.join(__dirname, "data", "db.json");
const UPLOAD_DIR     = path.join(__dirname, "uploads");
const ENTREGAS_DIR   = path.join(__dirname, "uploads", "entregas");
[path.join(__dirname,"data"), UPLOAD_DIR, ENTREGAS_DIR].forEach(d => { if(!fs.existsSync(d)) fs.mkdirSync(d,{recursive:true}); });

// ── DB helpers ────────────────────────────────────────
const leerDB = () => {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ usuarios:[], clases:[], tareas:[], estudiantes:[], entregas:[] }));
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH,"utf8"));
  if (!db.tareas)      db.tareas      = [];
  if (!db.estudiantes) db.estudiantes = [];
  if (!db.entregas)    db.entregas    = [];
  return db;
};
const guardarDB = (db) => fs.writeFileSync(DB_PATH, JSON.stringify(db,null,2));

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
const GROQ_API_KEY = "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";
const Groq = require("groq-sdk");
const groq = new Groq({ apiKey: GROQ_API_KEY });

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
app.post("/crear-tarea", (req,res) => {
  try {
    const { docenteId,claseId,titulo,descripcion,area,grado,fecha,fechaEntrega,estudiantesLista } = req.body;
    const db = leerDB();

    // Generar código único de acceso para la tarea
    const codigo = Math.random().toString(36).substring(2,8).toUpperCase();
    const tareaId = uuidv4();

    // Crear estudiantes con credenciales
    const estudiantes = (estudiantesLista||[]).map(nombre => {
      const user = nombre.toLowerCase().replace(/\s+/g,"").substring(0,10);
      const pass = Math.random().toString(36).substring(2,8);
      const est = { id:uuidv4(), tareaId, nombre, usuario:user, password:pass, passwordPlain:pass };
      db.estudiantes.push(est);
      return { id:est.id, nombre, usuario:user, password:pass };
    });

    const tarea = {
      id:           tareaId,
      docenteId,
      claseId:      claseId||null,
      titulo,
      descripcion,
      area,
      grado,
      fecha:        fecha||new Date().toLocaleDateString("es-CO"),
      fechaEntrega: fechaEntrega||"",
      codigo,
      linkAcceso:   `http://localhost:3000/tarea/${codigo}`,
      estudiantes:  estudiantes.map(e=>({id:e.id,nombre:e.nombre,usuario:e.usuario})),
      creadaEn:     new Date().toISOString(),
      estado:       "activa"
    };

    db.tareas.push(tarea);
    guardarDB(db);
    res.json({ ok:true, tarea, estudiantes, mensaje:"Tarea creada ✅" });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Listar tareas del docente
app.get("/mis-tareas/:docenteId", (req,res) => {
  try {
    const db = leerDB();
    const tareas = db.tareas
      .filter(t=>t.docenteId===req.params.docenteId)
      .sort((a,b)=>new Date(b.creadaEn)-new Date(a.creadaEn))
      .map(t => {
        const entregas = db.entregas.filter(e=>e.tareaId===t.id);
        return { ...t, totalEntregas:entregas.length, totalEstudiantes:t.estudiantes?.length||0 };
      });
    res.json({ tareas });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Ver tarea por código (para estudiantes)
app.get("/tarea-publica/:codigo", (req,res) => {
  try {
    const db = leerDB();
    const tarea = db.tareas.find(t=>t.codigo===req.params.codigo.toUpperCase());
    if (!tarea) return res.status(404).json({ mensaje:"Tarea no encontrada. Verifica el código." });
    res.json({ tarea:{ id:tarea.id, titulo:tarea.titulo, descripcion:tarea.descripcion, area:tarea.area, grado:tarea.grado, fechaEntrega:tarea.fechaEntrega, codigo:tarea.codigo } });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Login estudiante
app.post("/login-estudiante", async (req,res) => {
  try {
    const { codigo, usuario, password } = req.body;
    const db = leerDB();
    const tarea = db.tareas.find(t=>t.codigo===codigo?.toUpperCase());
    if (!tarea) return res.status(404).json({ mensaje:"Código de tarea incorrecto" });
    const est = db.estudiantes.find(e=>e.tareaId===tarea.id && e.usuario===usuario);
    if (!est) return res.status(401).json({ mensaje:"Usuario no encontrado en esta tarea" });
    if (est.passwordPlain !== password) return res.status(401).json({ mensaje:"Contraseña incorrecta" });
    // Ver si ya entregó
    const entrega = db.entregas.find(e=>e.tareaId===tarea.id && e.estudianteId===est.id);
    res.json({ ok:true, estudiante:{ id:est.id, nombre:est.nombre, usuario:est.usuario }, tarea, yaEntrego:!!entrega, entrega:entrega||null });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Entregar tarea (estudiante)
app.post("/entregar-tarea", uploadEntrega.single("archivo"), async (req,res) => {
  try {
    const { tareaId, estudianteId, respuesta } = req.body;
    const db = leerDB();
    const est = db.estudiantes.find(e=>e.id===estudianteId);
    if (!est) return res.status(404).json({ mensaje:"Estudiante no encontrado" });
    // Actualizar o crear entrega
    const idx = db.entregas.findIndex(e=>e.tareaId===tareaId && e.estudianteId===estudianteId);
    const entrega = {
      id:           idx>=0 ? db.entregas[idx].id : uuidv4(),
      tareaId,
      estudianteId,
      nombreEstudiante: est.nombre,
      respuesta:    respuesta||"",
      archivoPath:  req.file ? `uploads/entregas/${req.file.filename}` : (idx>=0 ? db.entregas[idx].archivoPath : ""),
      archivoNombre:req.file ? req.file.originalname : (idx>=0 ? db.entregas[idx].archivoNombre : ""),
      entregadoEn:  new Date().toISOString(),
      calificacion: idx>=0 ? db.entregas[idx].calificacion : null,
      comentario:   idx>=0 ? db.entregas[idx].comentario   : "",
      estado:       "entregado"
    };
    if (idx>=0) db.entregas[idx] = entrega;
    else db.entregas.push(entrega);
    guardarDB(db);
    res.json({ ok:true, entrega, mensaje:"Tarea entregada ✅" });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Ver entregas de una tarea (docente)
app.get("/entregas-tarea/:tareaId", (req,res) => {
  try {
    const db = leerDB();
    const tarea = db.tareas.find(t=>t.id===req.params.tareaId);
    if (!tarea) return res.status(404).json({ mensaje:"Tarea no encontrada" });
    const entregas = db.entregas.filter(e=>e.tareaId===req.params.tareaId);
    // Agregar estudiantes que NO han entregado
    const sinEntregar = (tarea.estudiantes||[])
      .filter(e=>!entregas.find(en=>en.estudianteId===e.id))
      .map(e=>({ estudianteId:e.id, nombreEstudiante:e.nombre, estado:"pendiente" }));
    res.json({ entregas, sinEntregar, total:tarea.estudiantes?.length||0 });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Calificar entrega (docente)
app.post("/calificar-entrega", (req,res) => {
  try {
    const { entregaId, calificacion, comentario } = req.body;
    const db  = leerDB();
    const idx = db.entregas.findIndex(e=>e.id===entregaId);
    if (idx===-1) return res.status(404).json({ mensaje:"Entrega no encontrada" });
    db.entregas[idx].calificacion   = calificacion;
    db.entregas[idx].comentario     = comentario||"";
    db.entregas[idx].calificadoEn   = new Date().toISOString();
    db.entregas[idx].estado         = "calificado";
    guardarDB(db);
    res.json({ ok:true, entrega:db.entregas[idx], mensaje:"Calificación guardada ✅" });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Ver calificación (estudiante)
app.get("/mi-calificacion/:tareaId/:estudianteId", (req,res) => {
  try {
    const db = leerDB();
    const entrega = db.entregas.find(e=>e.tareaId===req.params.tareaId && e.estudianteId===req.params.estudianteId);
    if (!entrega) return res.json({ calificacion:null, mensaje:"Aún no has entregado esta tarea" });
    res.json({ entrega });
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Descargar archivo entregado
app.get("/descargar-entrega/:tareaId/:estudianteId", (req,res) => {
  try {
    const db = leerDB();
    const entrega = db.entregas.find(e=>e.tareaId===req.params.tareaId && e.estudianteId===req.params.estudianteId);
    if (!entrega||!entrega.archivoPath) return res.status(404).json({ mensaje:"Archivo no encontrado" });
    const abs = path.join(__dirname, entrega.archivoPath);
    if (!fs.existsSync(abs)) return res.status(404).json({ mensaje:"Archivo no existe" });
    res.download(abs, entrega.archivoNombre||"entrega.pdf");
  } catch(e) { res.status(500).json({ mensaje:"Error: "+e.message }); }
});

// Eliminar tarea
app.delete("/tarea/:id", (req,res) => {
  try {
    const db = leerDB();
    db.tareas      = db.tareas.filter(t=>t.id!==req.params.id);
    db.estudiantes = db.estudiantes.filter(e=>e.tareaId!==req.params.id);
    db.entregas    = db.entregas.filter(e=>e.tareaId!==req.params.id);
    guardarDB(db);
    res.json({ ok:true });
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

    const prompt = `Eres un pedagogo colombiano experto. Crea una guía PREMIUM para nivel ${nivelEducativo||nivel}.

DATOS:
- Institución: ${institucion||"I.E."} | Docente: ${docente||"Docente"} (${cargo||"Docente"})
- Ciudad: ${ciudad||"Colombia"} | Área: ${area} | Grado: ${grado}° | Periodo: ${periodo||"1"}
- Fecha: ${fecha||new Date().toLocaleDateString("es-CO")} | Tema: ${tema} | Duración: ${durTexto}

ESTRATEGIAS:
- Apertura: ${tipoApertura} | Desarrollo: ${estratDesarrollo}
- Retroalimentación: ${retroalimentacion} | Cierre: ${tipoCierre}
- Tarea: ${dejaTarea?estratTarea:"Sin tarea"}

Estructura EXACTA:
===APERTURA===
TIPO: ${tipoApertura}
[Contenido creativo contextualizado en Colombia]

===SABERES_PREVIOS===
[4 preguntas diagnósticas para ${edadAprox} años]

===DESARROLLO===
ESTRATEGIA: ${estratDesarrollo}
[Contenido temático COMPLETO. Mínimo 4 subtemas. Ejemplos colombianos. Preguntas intermedias en **negrita**]

===RETROALIMENTACION===
ESTRATEGIA: ${retroalimentacion}
[Actividad completa]

===TALLER===
[5 secciones: COMPRENSIÓN, APLICACIÓN, PENSAMIENTO CRÍTICO, CREATIVIDAD, INVESTIGACIÓN]

===CIERRE===
ESTRATEGIA: ${tipoCierre}
[Síntesis, metacognición, conexión cotidiana]

===TAREA===
${dejaTarea?`ESTRATEGIA: ${estratTarea}\n[Tarea concreta para ${nivel}]`:"Sin tarea para esta sesión."}

===EXTRAS===
COMPETENCIA: [competencia específica]
DBA: [DBA oficial colombiano]
EVIDENCIA: [evidencia observable]
CRITERIO: [criterio de evaluación]
RECURSOS: [5 recursos específicos]

Redacta en español impecable. Todo contextualizado en Colombia.`;

    const resp = await groq.chat.completions.create({
      model:"llama-3.3-70b-versatile", max_tokens:4096, temperature:0.7,
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
    const { contenido,institucion,docente,area,grado,periodo,fecha,tema,duracion,logoPath,banderaPath,cargo,ciudad } = req.body;
    const { Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,
            AlignmentType,BorderStyle,WidthType,ShadingType,VerticalAlign,ImageRun } = require("docx");

    const bloques = {};
    let secActual = null;
    for (const linea of contenido.split("\n")) {
      const m = linea.match(/^===(\w+)===/);
      if (m) { secActual=m[1]; bloques[secActual]=[]; continue; }
      if (secActual) bloques[secActual].push(linea);
    }
    const getBloque = (k) => (bloques[k]||[]).filter(l=>l.trim()).join(" ").replace(/\*\*/g,"").trim();

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

    const txt = (text,opts={}) => new TextRun({ text,font:"Times New Roman",size:opts.size||22,bold:opts.bold||false,italics:opts.italic||false,color:opts.color||NEGRO,...opts });
    const par = (children,opts={}) => new Paragraph({ children,alignment:opts.align||AlignmentType.LEFT,spacing:opts.spacing||{before:40,after:40},...opts });
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
      rows:[new TableRow({ children:[cel([par([txt("PLAN DE AULA",{bold:true,size:28,color:AZUL})],{align:AlignmentType.CENTER,spacing:{before:80,after:80}})],{w:TW,fill:AZUL_CL,borders:bAllA})]})]
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
        cel([par([txt("PREESCOLAR",{size:18})])],{w:c2,borders:bAll}),
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

    const objetivos = getBloque("EXTRAS").replace(/COMPETENCIA:.*/ms,"").replace(/DBA:.*/ms,"").trim()||"Desarrollar habilidades cognitivas, comunicativas y socioafectivas.";
    const recursos  = getBloque("EXTRAS").match(/RECURSOS[:\s]+(.*)/i)?.[1]?.trim()||"Talento humano, cuaderno, lápiz, colores, material del entorno.";

    children.push(fila2("TEMA",tema||""));
    children.push(fila2("OBJETIVO",objetivos.substring(0,300)));
    children.push(fila2("RECURSOS",recursos.substring(0,300)));

    // REFERENTES
    children.push(par([txt("")]));
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[TW],
      rows:[new TableRow({ children:[cel([par([txt("REFERENTES NACIONALES DE CALIDAD",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]
    }));

    const extrasTexto = getBloque("EXTRAS");
    const dba  = extrasTexto.match(/DBA[:\s]+([\s\S]*?)(?=EVIDENCIA:|CRITERIO:|RECURSOS:|$)/i)?.[1]?.trim()||"Comprende y aplica los conceptos trabajados.";
    const comp = extrasTexto.match(/COMPETENCIA[:\s]+([\s\S]*?)(?=DBA:|EVIDENCIA:|$)/i)?.[1]?.trim()||"Desarrolla competencias disciplinares.";
    const evid = extrasTexto.match(/EVIDENCIA[:\s]+([\s\S]*?)(?=CRITERIO:|RECURSOS:|$)/i)?.[1]?.trim()||"Demuestra comprensión de los conceptos.";
    const LR=Math.round(TW*0.22), VR=TW-Math.round(TW*0.22);

    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[LR,VR],
      rows:[
        new TableRow({ children:[cel([par([txt("ESTÁNDARES BÁSICOS",{bold:true})])],{w:LR,fill:GRIS,borders:bAll}),cel([par([txt(comp.substring(0,400))])],{w:VR,borders:bAll})] }),
        new TableRow({ children:[cel([par([txt("DBA",{bold:true})])],{w:LR,fill:GRIS,borders:bAll}),cel([par([txt(dba.substring(0,400))])],{w:VR,borders:bAll})] }),
      ]
    }));

    const S1=Math.round(TW*0.12), S2=Math.round((TW-Math.round(TW*0.12))/3), S3=S2, S4=TW-S1-S2-S3;
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[S1,S2,S3,S4],
      rows:[
        new TableRow({ children:[
          cel([par([txt("COMPETENCIAS",{bold:true})])],{w:S1,fill:GRIS,borders:bAll}),
          cel([par([txt("SABER",{bold:true})],{align:AlignmentType.CENTER})],{w:S2,fill:GRIS,borders:bAll}),
          cel([par([txt("HACER",{bold:true})],{align:AlignmentType.CENTER})],{w:S3,fill:GRIS,borders:bAll}),
          cel([par([txt("SER",{bold:true})],{align:AlignmentType.CENTER})],{w:S4,fill:GRIS,borders:bAll}),
        ]}),
        new TableRow({ children:[
          cel([par([txt("")])],{w:S1,borders:bAll}),
          cel([par([txt(getBloque("DESARROLLO").substring(0,200)||"Comprende los conceptos.")])],{w:S2,borders:bAll}),
          cel([par([txt(getBloque("TALLER").substring(0,200)||"Aplica lo aprendido.")])],{w:S3,borders:bAll}),
          cel([par([txt(getBloque("CIERRE").substring(0,150)||"Actúa con respeto.")])],{w:S4,borders:bAll}),
        ]}),
      ]
    }));

    // METODOLOGÍA
    children.push(par([txt("")]));
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[TW],
      rows:[new TableRow({ children:[cel([par([txt("METODOLOGÍA EN SECUENCIA DIDÁCTICA",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]
    }));

    const secciones=[
      {t:"EXPLORACIÓN (SABERES PREVIOS)",    c:(getBloque("SABERES_PREVIOS")||getBloque("APERTURA")).substring(0,500)},
      {t:"ESTRUCTURACIÓN (PRÁCTICA)",        c:(getBloque("DESARROLLO")+" "+getBloque("TALLER")).substring(0,600)},
      {t:"TRANSFERENCIA (VALORACIÓN)",       c:getBloque("RETROALIMENTACION").substring(0,400)},
      {t:"REFUERZO (INTEGRACIÓN A CONTEXTOS COTIDIANOS)", c:(getBloque("CIERRE")+" "+getBloque("TAREA")).substring(0,400)},
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
    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[EV,ET],
      rows:[
        new TableRow({ children:[cel([par([txt("DESEMPEÑOS ESPERADOS",{bold:true})],{align:AlignmentType.CENTER})],{w:EV,fill:GRIS,borders:bAll}),cel([par([txt("TIPO DE EVALUACIÓN",{bold:true})],{align:AlignmentType.CENTER})],{w:ET,fill:GRIS,borders:bAll})] }),
        new TableRow({ children:[cel([par([txt(evid.substring(0,300))])],{w:EV,borders:bAll}),cel([par([txt("Valoración de actividades. Oral y escrita.")])],{w:ET,borders:bAll})] }),
      ]
    }));

    children.push(new Table({ width:{size:TW,type:WidthType.DXA}, columnWidths:[TW],
      rows:[
        new TableRow({ children:[cel([par([txt("REFERENCIAS BIBLIOGRÁFICAS",{bold:true})],{align:AlignmentType.CENTER})],{w:TW,fill:GRIS,borders:bAll})] }),
        new TableRow({ children:[cel([par([txt("MEN - Lineamientos Curriculares, DBA oficiales, Mallas de Aprendizaje, internet, textos escolares.")])],{w:TW,borders:bAll})] }),
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
      styles:{ default:{ document:{ run:{ font:"Times New Roman",size:22 } } } },
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
    const { contenido,institucion,docente,area,grado,periodo,fecha,tema,duracion,logoPath,banderaPath,cargo,ciudad } = req.body;
    const PDFDocument = require("pdfkit");

    const bloques = {};
    let secActual = null;
    for (const linea of contenido.split("\n")) {
      const m = linea.match(/^===(\w+)===/);
      if (m) { secActual=m[1]; bloques[secActual]=[]; continue; }
      if (secActual) bloques[secActual].push(linea);
    }
    const getBloque = (k) => (bloques[k]||[]).filter(l=>l.trim()).join(" ").replace(/\*\*/g,"").trim();

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
          doc.font(cel.bold?FB:FN).fontSize(cel.fs||9).fillColor(cel.color||NEGRO)
             .text(cel.texto||"",colX+4,rowY+4,{width:w-8,align:cel.align||"left"});
          colX+=w;
        });
        rowY+=maxH;
      }
      doc.y=rowY+3;
    };

    const az =(t,o={})=>({texto:t,fill:AZUL, color:BLANCO,bold:true, fs:9,align:"center",...o});
    const gr =(t,o={})=>({texto:t,fill:GRIS, color:NEGRO, bold:true, fs:9,...o});
    const nm =(t,o={})=>({texto:t,fill:BLANCO,color:NEGRO, bold:false,fs:9,...o});

    // Docente/sede
    tabla([[gr("Nombre del Docente:",{fs:8}),nm(docente||"_____",{fs:8}),gr("Sede:",{fs:8}),nm(institucion||"_____",{fs:8})]], [PW*0.15,PW*0.35,PW*0.1,PW*0.4]);
    tabla([[az("INFORMACIÓN GENERAL",{fs:10})]], [PW]);
    tabla([[gr("NIVEL",{fs:8}),nm("PREESCOLAR",{fs:8}),gr("GRADO",{fs:8}),nm(grado||"",{fs:8}),gr("PERÍODO",{fs:8}),nm(periodo||"",{fs:8}),gr("ÁREA",{fs:8}),nm(area||"",{fs:8}),gr("SEM",{fs:8}),nm("1",{fs:8})]], [PW*0.07,PW*0.12,PW*0.07,PW*0.07,PW*0.08,PW*0.07,PW*0.07,PW*0.28,PW*0.06,PW*0.11]);
    tabla([[gr("TEMA",{fs:8}),nm(tema,{fs:8})]],[PW*0.12,PW*0.88]);

    const obj=getBloque("EXTRAS").replace(/COMPETENCIA:.*/,"").replace(/DBA:.*/,"").trim()||"Desarrollar habilidades cognitivas, comunicativas y socioafectivas.";
    const rec=getBloque("EXTRAS").match(/RECURSOS[:\s]+(.*)/i)?.[1]?.trim()||"Talento humano, cuaderno, lápiz, colores.";
    tabla([[gr("OBJETIVO",{fs:8}),nm(obj.substring(0,250),{fs:8})]],[PW*0.12,PW*0.88]);
    tabla([[gr("RECURSOS",{fs:8}),nm(rec.substring(0,250),{fs:8})]],[PW*0.12,PW*0.88]);

    doc.moveDown(0.3);
    tabla([[az("REFERENTES NACIONALES DE CALIDAD",{fs:10})]], [PW]);
    const et=getBloque("EXTRAS");
    const dba=et.match(/DBA[:\s]+([\s\S]*?)(?=EVIDENCIA:|CRITERIO:|RECURSOS:|$)/i)?.[1]?.trim()||"";
    const comp=et.match(/COMPETENCIA[:\s]+([\s\S]*?)(?=DBA:|EVIDENCIA:|$)/i)?.[1]?.trim()||"";
    const evid=et.match(/EVIDENCIA[:\s]+([\s\S]*?)(?=CRITERIO:|RECURSOS:|$)/i)?.[1]?.trim()||"";
    tabla([[gr("ESTÁNDARES",{fs:8}),nm(comp.substring(0,300),{fs:8})],[gr("DBA",{fs:8}),nm(dba.substring(0,300),{fs:8})]],[PW*0.18,PW*0.82]);
    tabla([[gr("COMP.",{fs:8}),gr("SABER",{align:"center",fs:8}),gr("HACER",{align:"center",fs:8}),gr("SER",{align:"center",fs:8})],[nm("",{fs:8}),nm(getBloque("DESARROLLO").substring(0,180),{fs:8}),nm(getBloque("TALLER").substring(0,180),{fs:8}),nm(getBloque("CIERRE").substring(0,130),{fs:8})]],[PW*0.1,PW*0.3,PW*0.3,PW*0.3]);

    doc.moveDown(0.3);
    tabla([[az("METODOLOGÍA EN SECUENCIA DIDÁCTICA",{fs:10})]], [PW]);
    const secs=[
      {t:"EXPLORACIÓN (SABERES PREVIOS)",    c:(getBloque("SABERES_PREVIOS")||getBloque("APERTURA")).substring(0,400)},
      {t:"ESTRUCTURACIÓN (PRÁCTICA)",        c:(getBloque("DESARROLLO")+" "+getBloque("TALLER")).substring(0,500)},
      {t:"TRANSFERENCIA (VALORACIÓN)",       c:getBloque("RETROALIMENTACION").substring(0,350)},
      {t:"REFUERZO (INTEGRACIÓN A CONTEXTOS COTIDIANOS)",c:(getBloque("CIERRE")+" "+getBloque("TAREA")).substring(0,350)},
    ];
    for (const s of secs) tabla([[gr(s.t,{fs:8,align:"left"})],[nm(s.c||".",{fs:8})]],[PW]);

    doc.moveDown(0.3);
    tabla([[az("EVALUACIÓN",{fs:10})]], [PW]);
    tabla([[gr("DESEMPEÑOS ESPERADOS",{align:"center",fs:8}),gr("TIPO DE EVALUACIÓN",{align:"center",fs:8})],[nm(evid.substring(0,250),{fs:8}),nm("Valoración de actividades. Oral y escrita.",{fs:8})]],[PW*0.6,PW*0.4]);
    tabla([[gr("REFERENCIAS BIBLIOGRÁFICAS",{align:"center",fs:8})],[nm("MEN, DBA, Lineamientos Curriculares, internet, textos escolares.",{fs:8})]],[PW]);

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