// src/index.js — EduClass Premium v5 con PostgreSQL
require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const path     = require("path");
const fs       = require("fs");
const multer   = require("multer");
const { v4: uuidv4 } = require("uuid");
const bcrypt   = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { authDocente, authEstudiante, generarToken, slugify } = require("./middleware/auth");

const app    = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ── Directorios uploads ───────────────────────────────
const UPLOAD_DIR   = path.join(__dirname, "..", "uploads");
const ENTREGAS_DIR = path.join(UPLOAD_DIR, "entregas");
[UPLOAD_DIR, ENTREGAS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive:true }); });
app.use("/uploads", express.static(UPLOAD_DIR));

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
//  SISTEMA DE ROTACIÓN DE IAs
// ======================================================
const AI_PROVIDERS = [
  { nombre:"Groq",       apiKey:process.env.GROQ_KEY,       tipo:"groq",       activa:true, errores:0 },
  { nombre:"Together",   apiKey:process.env.TOGETHER_KEY,   tipo:"together",   activa:true, errores:0 },
  { nombre:"OpenRouter", apiKey:process.env.OPENROUTER_KEY, tipo:"openrouter", activa:true, errores:0 },
  { nombre:"Gemini",     apiKey:process.env.GEMINI_KEY,     tipo:"gemini",     activa:true, errores:0 },
].filter(p => p.apiKey); // Solo usar las que tienen key configurada

let proveedorActual = 0;

const getSiguienteProveedor = () => {
  for (let i = 0; i < AI_PROVIDERS.length; i++) {
    const idx = (proveedorActual + i) % AI_PROVIDERS.length;
    if (AI_PROVIDERS[idx].activa) { proveedorActual = idx; return AI_PROVIDERS[idx]; }
  }
  AI_PROVIDERS.forEach(p => { p.activa = true; p.errores = 0; });
  proveedorActual = 0;
  return AI_PROVIDERS[0];
};

const marcarError = (p) => {
  p.errores++;
  if (p.errores >= 2) {
    p.activa = false;
    setTimeout(() => { p.activa = true; p.errores = 0; }, 10 * 60 * 1000);
  }
  proveedorActual = (proveedorActual + 1) % AI_PROVIDERS.length;
};

const llamarIA = async (prompt, systemPrompt = "", maxTokens = 4096, temp = 0.7) => {
  let intentos = 0;
  while (intentos < AI_PROVIDERS.length) {
    const p = getSiguienteProveedor();
    try {
      let respuesta = "";
      if (p.tipo === "groq") {
        const Groq = require("groq-sdk");
        const groq = new Groq({ apiKey: p.apiKey });
        const r = await groq.chat.completions.create({
          model:"llama-3.3-70b-versatile", max_tokens:maxTokens, temperature:temp,
          messages:[{ role:"system",content:systemPrompt },{ role:"user",content:prompt }]
        });
        respuesta = r.choices[0].message.content;
      } else if (p.tipo === "together") {
        const r = await fetch("https://api.together.xyz/v1/chat/completions", {
          method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${p.apiKey}`},
          body:JSON.stringify({ model:"meta-llama/Llama-3.3-70B-Instruct-Turbo", max_tokens:maxTokens, temperature:temp,
            messages:[{ role:"system",content:systemPrompt },{ role:"user",content:prompt }] })
        });
        const d = await r.json(); if (!r.ok) throw new Error(d.error?.message);
        respuesta = d.choices[0].message.content;
      } else if (p.tipo === "openrouter") {
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method:"POST", headers:{"Content-Type":"application/json","Authorization":`Bearer ${p.apiKey}`,"HTTP-Referer":"https://educlass-frontend.vercel.app"},
          body:JSON.stringify({ model:"meta-llama/llama-3.3-70b-instruct:free", max_tokens:maxTokens, temperature:temp,
            messages:[{ role:"system",content:systemPrompt },{ role:"user",content:prompt }] })
        });
        const d = await r.json(); if (!r.ok) throw new Error(d.error?.message);
        respuesta = d.choices[0].message.content;
      } else if (p.tipo === "gemini") {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${p.apiKey}`,{
          method:"POST", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({ contents:[{ parts:[{ text:`${systemPrompt}\n\n${prompt}` }] }],
            generationConfig:{ maxOutputTokens:maxTokens, temperature:temp } })
        });
        const d = await r.json(); if (!r.ok) throw new Error(d.error?.message);
        respuesta = d.candidates[0].content.parts[0].text;
      }
      p.errores = 0;
      return respuesta;
    } catch(e) { console.error(`❌ ${p.nombre}:`, e.message); marcarError(p); intentos++; }
  }
  throw new Error("Todos los proveedores de IA fallaron");
};

// ======================================================
//  RUTAS
// ======================================================
app.use("/auth",     require("./routes/auth"));
app.use("/students", require("./routes/students"));
app.use("/tasks",    require("./routes/tasks"));

app.get("/", (_req, res) => res.json({ ok:true, msg:"EduClass v5 PostgreSQL ✅" }));
app.get("/estado-ia", (_req, res) => res.json({ proveedores: AI_PROVIDERS.map(p => ({ nombre:p.nombre, activa:p.activa, errores:p.errores })) }));

// ======================================================
//  PERFIL DOCENTE
// ======================================================
app.post("/actualizar-perfil", authDocente, uploadFields, async (req, res) => {
  try {
    const { nombre, cargo } = req.body;
    const data = {};
    if (nombre) data.name = nombre;
    if (cargo)  data.cargo = cargo;
    if (req.files?.logo?.[0])    data.logoPath    = `uploads/${req.files.logo[0].filename}`;
    if (req.files?.bandera?.[0]) data.banderaPath = `uploads/${req.files.bandera[0].filename}`;
    const user = await prisma.user.update({ where:{ id:req.user.id }, data, include:{ institution:true } });
    const { password:_, ...pub } = user;
    res.json({ usuario:pub, mensaje:"Perfil actualizado ✅" });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

// ======================================================
//  CLASES
// ======================================================
app.post("/guardar-clase", authDocente, async (req, res) => {
  try {
    const { contenido, datos } = req.body;
    const clase = await prisma.class.create({ data:{ content:contenido, data:datos, userId:req.user.id } });
    res.json({ ok:true, id:clase.id });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/mis-clases", authDocente, async (req, res) => {
  try {
    const clases = await prisma.class.findMany({
      where:{ userId:req.user.id }, orderBy:{ createdAt:"desc" },
      select:{ id:true, createdAt:true, data:true, content:true }
    });
    res.json({ clases: clases.map(c=>({ id:c.id, creadaEn:c.createdAt, datos:c.data, resumen:c.content?.substring(0,200) })) });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.get("/clase/:id", authDocente, async (req, res) => {
  try {
    const clase = await prisma.class.findFirst({ where:{ id:req.params.id, userId:req.user.id } });
    if (!clase) return res.status(404).json({ mensaje:"No encontrada" });
    res.json({ clase:{ id:clase.id, contenido:clase.content, datos:clase.data, creadaEn:clase.createdAt } });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

app.delete("/clase/:id", authDocente, async (req, res) => {
  try {
    await prisma.class.delete({ where:{ id:req.params.id, userId:req.user.id } });
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

// ======================================================
//  GENERAR GUÍA CON IA
// ======================================================
app.post("/generar-guia", authDocente, async (req, res) => {
  try {
    const { institucion,docente,area,grado,periodo,fecha,tema,
            tipoApertura,estratDesarrollo,retroalimentacion,
            tipoCierre,dejaTarea,estratTarea,duracion,cargo,ciudad,nivelEducativo } = req.body;
    const gradoNum=parseInt(grado)||6;
    const nivel=gradoNum<=5?"primaria":gradoNum<=9?"secundaria":"media académica";
    const durMin=parseInt(duracion)||55;
    const numHoras=Math.round(durMin/55);
    const durTexto=numHoras===1?"1 hora (55 minutos)":`${numHoras} horas (${durMin} minutos)`;

    const prompt=`Eres un pedagogo colombiano experto. Crea guía PREMIUM para nivel ${nivelEducativo||nivel}.
DATOS: Institución:${institucion} | Docente:${docente} (${cargo}) | Ciudad:${ciudad} | Área:${area} | Grado:${grado}° | Periodo:${periodo} | Fecha:${fecha} | Tema:${tema} | Duración:${durTexto}
ESTRATEGIAS: Apertura:${tipoApertura} | Desarrollo:${estratDesarrollo} | Retro:${retroalimentacion} | Cierre:${tipoCierre} | Tarea:${dejaTarea?estratTarea:"Sin tarea"}

===APERTURA===
Redacta apertura completa contextualizada en Colombia, nivel ${nivelEducativo||nivel}, grado ${grado}°. Mínimo 8 líneas.

===SABERES_PREVIOS===
1. (pregunta diagnóstica sobre "${tema}")
2. (pregunta diagnóstica sobre "${tema}")
3. (pregunta diagnóstica sobre "${tema}")
4. (pregunta diagnóstica sobre "${tema}")

===DESARROLLO===
Contenido MUY COMPLETO sobre "${tema}" para ${nivelEducativo||nivel} grado ${grado}°. Mínimo 5 subtemas con ## cada uno. Ejemplos reales de Colombia.

===RETROALIMENTACION===
Actividad completa de retroalimentación sobre "${tema}".

===TALLER===
1. COMPRENSIÓN: 2 preguntas sobre "${tema}"
2. APLICACIÓN PRÁCTICA: 1 actividad concreta
3. PENSAMIENTO CRÍTICO: 1 pregunta analítica
4. CREATIVIDAD: 1 actividad creativa
5. INVESTIGACIÓN: 1 consulta con fuente sugerida

===CIERRE===
Cierre con síntesis, metacognición y conexión cotidiana.

===TAREA===
${dejaTarea?`Tarea clara sobre "${tema}".`:"Sin tarea para esta sesión."}

===EXTRAS===
OBJETIVO: (objetivo con verbo infinitivo para "${tema}")
DBA: (DBA completo MEN Colombia ${area} grado ${grado}°)
ESTANDAR: (Estándar básico MEN completo)
INDICADOR1: (indicadores SABER — 🟢Básico 🟡Intermedio 🔵Avanzado)
INDICADOR2: (indicadores HACER — mismos niveles)
INDICADOR3: (indicadores SER — mismos niveles)
EVIDENCIA: (evidencia aprendizaje observable)
EVALUACION: (3 preguntas abiertas + 2 selección múltiple + 1 práctica)
RECURSOS: (5 recursos numerados)
WEBGRAFIA: (3 fuentes APA reales)

Redacta en español impecable. Todo contextualizado Colombia. OBLIGATORIO: usa EXACTAMENTE ===NOMBRE_SECCION=== para cada sección.`;

    const systemPrompt="Eres el mejor pedagogo de Colombia. Guías de altísima calidad. OBLIGATORIO: respeta ===SECCION=== exactamente.";
    const contenido = await llamarIA(prompt, systemPrompt, 4096, 0.7);
    res.json({ contenido, ok:true });
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

// ======================================================
//  GENERAR ACTIVIDAD IA
// ======================================================
app.post("/generar-actividad", authDocente, async (req, res) => {
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
    const txt = await llamarIA(prompts[tipo]||prompts.taller, "Experto evaluación colombiana. SOLO JSON válido sin markdown.", 2000, 0.5);
    const limpio = txt.trim().replace(/```json|```/g,"").trim();
    try { res.json({ ok:true, actividad:JSON.parse(limpio), tipo }); }
    catch { res.json({ ok:true, actividad:{ preguntas:[] }, tipo }); }
  } catch(e) { res.status(500).json({ mensaje:e.message }); }
});

// ======================================================
//  EXPORTAR WORD Y PDF (mismo código existente)
// ======================================================
app.post("/exportar-word", authDocente, async (req, res) => {
  try {
    const { contenido,institucion,docente,area,grado,tema,duracion,logoPath,banderaPath,cargo,ciudad,nivelEducativo,periodo } = req.body;
    const gradoN=parseInt(grado)||0;
    const nivelLabel=nivelEducativo==="preescolar"?"Preescolar":nivelEducativo==="primaria"?"Primaria":nivelEducativo==="media_tecnica"?"Media Técnica":nivelEducativo==="bachillerato"?"Bachillerato":gradoN<=5?"Primaria":gradoN<=9?"Bachillerato":"Media/Bachillerato";
    const { Document,Packer,Paragraph,TextRun,Table,TableRow,TableCell,AlignmentType,BorderStyle,WidthType,ShadingType,VerticalAlign,ImageRun } = require("docx");
    const bloques={};let secActual=null;
    for(const linea of contenido.split("\n")){const m=linea.match(/^===(\w+)===/);if(m){secActual=m[1];bloques[secActual]=[];continue;}if(secActual)bloques[secActual].push(linea);}
    const tieneSec=Object.keys(bloques).length>0;
    if(!tieneSec){const ls=contenido.split("\n");const ch=Math.floor(ls.length/5);bloques["APERTURA"]=ls.slice(0,ch);bloques["DESARROLLO"]=ls.slice(ch,ch*3);bloques["RETROALIMENTACION"]=ls.slice(ch*3,ch*4);bloques["CIERRE"]=ls.slice(ch*4);bloques["TALLER"]=ls.slice(ch,ch*2);bloques["EXTRAS"]=[];}
    const getB=k=>(bloques[k]||[]).join("\n").replace(/\*\*/g,"").replace(/##\s*/g,"").replace(/^[\s\n]+|[\s\n]+$/g,"")||contenido.substring(0,400);
    const AZUL="1B4F8A",AZUL_CL="D6E4F7",NEGRO="000000",GRIS="F2F2F2",BLANCO="FFFFFF";
    const bN={style:BorderStyle.SINGLE,size:6,color:NEGRO};const bA={style:BorderStyle.SINGLE,size:8,color:AZUL};
    const bAll={top:bN,bottom:bN,left:bN,right:bN};const bAllA={top:bA,bottom:bA,left:bA,right:bA};const TW=11106;
    const txt=(t,o={})=>new TextRun({text:t,font:"Times New Roman",size:o.size||24,bold:o.bold||false,color:o.color||NEGRO,...o});
    const par=(c,o={})=>new Paragraph({children:c,alignment:o.align||AlignmentType.BOTH,spacing:o.spacing||{before:40,after:40},...o});
    const cel=(c,o={})=>new TableCell({width:{size:o.w||1000,type:WidthType.DXA},margins:{top:80,bottom:80,left:100,right:100},shading:{fill:o.fill||BLANCO,type:ShadingType.CLEAR},verticalAlign:o.va||VerticalAlign.CENTER,borders:o.borders||bAll,children:c});
    const logoCell=(imgPath,w)=>{const abs=imgPath?path.join(__dirname,"..",imgPath):null;if(abs&&fs.existsSync(abs)){try{const buf=fs.readFileSync(abs);return cel([par([new ImageRun({data:buf,transformation:{width:80,height:80},type:"png"})],{align:AlignmentType.CENTER})],{w,fill:BLANCO,borders:bAllA});}catch(_){}}return cel([par([txt("",{size:20})])],{w,fill:AZUL_CL,borders:bAllA});};
    const children=[];const LC=1300,RC=1300,CC=TW-LC-RC;
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[LC,CC,RC],borders:{top:bA,bottom:bA,left:bA,right:bA,insideH:bA,insideV:bA},rows:[new TableRow({children:[logoCell(logoPath,LC),cel([par([txt((institucion||"INSTITUCIÓN EDUCATIVA").toUpperCase(),{bold:true,size:24,color:AZUL})],{align:AlignmentType.CENTER,spacing:{before:60,after:20}}),par([txt("Aprobado según Decreto No. 0001295 del 04 Noviembre de 2009",{size:16})],{align:AlignmentType.CENTER,spacing:{before:0,after:0}}),par([txt("De la Secretaría de Educación del Caquetá",{size:16})],{align:AlignmentType.CENTER,spacing:{before:0,after:0}}),par([txt(`${ciudad||"Valparaíso"} - Caquetá`,{size:18,bold:true})],{align:AlignmentType.CENTER,spacing:{before:20,after:40}})],{w:CC,borders:bAllA}),logoCell(banderaPath,RC)]})]})  );
    children.push(par([txt("")]));children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("PLAN DE AULA",{bold:true,size:30,color:AZUL})],{align:AlignmentType.CENTER,spacing:{before:80,after:80}})],{w:TW,fill:AZUL_CL,borders:bAllA})]})]}));
    const H=TW/2;children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[H,H],rows:[new TableRow({children:[cel([par([txt("Nombre del Docente: ",{bold:true}),txt(docente||"___")])],{w:H,borders:bAll}),cel([par([txt("Sede Educativa: ",{bold:true}),txt(institucion||"___")])],{w:H,borders:bAll})]})]}));
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("INFORMACIÓN GENERAL",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]}));
    const[c1,c2,c3,c4,c5,c6,c7,c8,c9]=[Math.round(TW*.07),Math.round(TW*.12),Math.round(TW*.07),Math.round(TW*.07),Math.round(TW*.08),Math.round(TW*.07),Math.round(TW*.07),Math.round(TW*.28),Math.round(TW*.06)];const c10v=TW-c1-c2-c3-c4-c5-c6-c7-c8-c9;
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[c1,c2,c3,c4,c5,c6,c7,c8,c9,c10v],rows:[new TableRow({children:[cel([par([txt("NIVEL",{bold:true,size:18})])],{w:c1,fill:GRIS,borders:bAll}),cel([par([txt(nivelLabel,{size:18})])],{w:c2,borders:bAll}),cel([par([txt("GRADO",{bold:true,size:18})])],{w:c3,fill:GRIS,borders:bAll}),cel([par([txt(grado||"",{size:18})])],{w:c4,borders:bAll}),cel([par([txt("PERÍODO",{bold:true,size:18})])],{w:c5,fill:GRIS,borders:bAll}),cel([par([txt(periodo||"",{size:18})])],{w:c6,borders:bAll}),cel([par([txt("ÁREA",{bold:true,size:18})])],{w:c7,fill:GRIS,borders:bAll}),cel([par([txt(area||"",{size:18})])],{w:c8,borders:bAll}),cel([par([txt("SEM",{bold:true,size:18})])],{w:c9,fill:GRIS,borders:bAll}),cel([par([txt("1",{size:18})])],{w:c10v,borders:bAll})]})]}));
    const LBL=Math.round(TW*.13),VAL=TW-LBL;const fila2=(lb,vl)=>new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[LBL,VAL],rows:[new TableRow({children:[cel([par([txt(lb,{bold:true})])],{w:LBL,fill:GRIS,borders:bAll}),cel([par([txt(vl)])],{w:VAL,borders:bAll})]})]});
    const ex=getB("EXTRAS");
    const obj=ex.match(/OBJETIVO[:\s\n]+([^\n]{20,}[\s\S]*?)(?=\nDBA:|\nESTANDAR:|\nINDICADOR|$)/i)?.[1]?.trim()||"Desarrollar competencias.";
    const rec=ex.match(/RECURSOS[:\s]+([\s\S]*?)(?=WEBGRAFIA:|$)/i)?.[1]?.trim()||"Talento humano, cuaderno.";
    const web=ex.match(/WEBGRAFIA[:\s]+([\s\S]*?)$/i)?.[1]?.trim()||"MEN lineamientos.";
    const evl=ex.match(/EVALUACION[:\s]+([\s\S]*?)(?=RECURSOS:|WEBGRAFIA:|$)/i)?.[1]?.trim()||"Oral y escrita.";
    const i1=ex.match(/INDICADOR1[:\s]+([\s\S]*?)(?=INDICADOR2:|$)/i)?.[1]?.trim()||"";
    const i2=ex.match(/INDICADOR2[:\s]+([\s\S]*?)(?=INDICADOR3:|$)/i)?.[1]?.trim()||"";
    const i3=ex.match(/INDICADOR3[:\s]+([\s\S]*?)(?=EVIDENCIA:|$)/i)?.[1]?.trim()||"";
    const dba=ex.match(/DBA[:\s\n]+([\s\S]*?)(?=ESTANDAR:|INDICADOR|EVIDENCIA:|$)/i)?.[1]?.trim()||"";
    const std=ex.match(/ESTANDAR[:\s\n]+([\s\S]*?)(?=DBA:|INDICADOR|EVIDENCIA:|$)/i)?.[1]?.trim()||"";
    const evd=ex.match(/EVIDENCIA[:\s]+([\s\S]*?)(?=CRITERIO:|RECURSOS:|$)/i)?.[1]?.trim()||"";
    children.push(fila2("TEMA",tema));children.push(fila2("OBJETIVO",obj.substring(0,400)));children.push(fila2("RECURSOS",rec.substring(0,400)));children.push(fila2("WEBGRAFÍA",web.substring(0,400)));
    children.push(par([txt("")]));children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("REFERENTES NACIONALES DE CALIDAD",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]}));
    const LR=Math.round(TW*.28),VR=TW-LR;
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[LR,VR],rows:[new TableRow({children:[cel([par([txt("ESTÁNDAR BÁSICO (MEN)",{bold:true})])],{w:LR,fill:GRIS,borders:bAll}),cel([par([txt(std.substring(0,400))])],{w:VR,borders:bAll})]}),new TableRow({children:[cel([par([txt("DBA — DERECHO BÁSICO",{bold:true})])],{w:LR,fill:GRIS,borders:bAll}),cel([par([txt(dba.substring(0,400))])],{w:VR,borders:bAll})]})]}));
    const S1=Math.round(TW*.18),S2=Math.round((TW-S1)/3),S3=S2,S4=TW-S1-S2-S3;
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[S1,S2,S3,S4],rows:[new TableRow({children:[cel([par([txt("INDICADORES",{bold:true})])],{w:S1,fill:GRIS,borders:bAll}),cel([par([txt("SABER",{bold:true})],{align:AlignmentType.CENTER})],{w:S2,fill:GRIS,borders:bAll}),cel([par([txt("HACER",{bold:true})],{align:AlignmentType.CENTER})],{w:S3,fill:GRIS,borders:bAll}),cel([par([txt("SER",{bold:true})],{align:AlignmentType.CENTER})],{w:S4,fill:GRIS,borders:bAll})]}),new TableRow({children:[cel([par([txt("Por dimensión")])],{w:S1,borders:bAll}),cel([par([txt(i1.substring(0,600))])],{w:S2,borders:bAll}),cel([par([txt(i2.substring(0,600))])],{w:S3,borders:bAll}),cel([par([txt(i3.substring(0,400))])],{w:S4,borders:bAll})]})]}));
    children.push(par([txt("")]));children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("METODOLOGÍA EN SECUENCIA DIDÁCTICA",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]}));
    const secs=[{t:"INICIO DE LA CLASE (APERTURA Y MOTIVACIÓN)",c:getB("APERTURA").substring(0,800)},{t:"EXPLORACIÓN (SABERES PREVIOS)",c:getB("SABERES_PREVIOS").split("\n").filter(l=>l.trim()).map((l,i)=>(i+1)+". "+l.replace(/^\d+\.\s*/,"")).join("\n").substring(0,800)},{t:"ESTRUCTURACIÓN (PRÁCTICA Y DESARROLLO)",c:(getB("DESARROLLO")+" "+getB("TALLER")).substring(0,1200)},{t:"TRANSFERENCIA (VALORACIÓN)",c:getB("RETROALIMENTACION").substring(0,1000)},{t:"REFUERZO (INTEGRACIÓN A CONTEXTOS COTIDIANOS)",c:(getB("CIERRE")+"\n"+getB("TAREA")).substring(0,1000)}];
    for(const s of secs){children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt(s.t,{bold:true})])],{w:TW,fill:GRIS,borders:bAll})]}),new TableRow({children:[cel([par([txt(s.c||".")])],{w:TW,borders:bAll})]})]}));}
    children.push(par([txt("")]));children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("EVALUACIÓN",{bold:true,color:BLANCO})],{align:AlignmentType.CENTER})],{w:TW,fill:AZUL,borders:bAllA})]})]}));
    const EV=Math.round(TW*.6),ET=TW-EV;
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[EV,ET],rows:[new TableRow({children:[cel([par([txt("DESEMPEÑOS ESPERADOS",{bold:true})],{align:AlignmentType.CENTER})],{w:EV,fill:GRIS,borders:bAll}),cel([par([txt("EVALUACIÓN PERTINENTE",{bold:true})],{align:AlignmentType.CENTER})],{w:ET,fill:GRIS,borders:bAll})]}),new TableRow({children:[cel([par([txt(evd.substring(0,300))])],{w:EV,borders:bAll}),cel([par([txt(evl.substring(0,600))])],{w:ET,borders:bAll})]})]}));
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[TW],rows:[new TableRow({children:[cel([par([txt("REFERENCIAS BIBLIOGRÁFICAS Y WEBGRAFÍA",{bold:true})],{align:AlignmentType.CENTER})],{w:TW,fill:GRIS,borders:bAll})]}),new TableRow({children:[cel([par([txt(web.substring(0,500))])],{w:TW,borders:bAll})]})]}));
    children.push(par([txt("")]));children.push(par([txt("")]));
    const FW=Math.round(TW/2),FW2=TW-FW;const nb={top:{style:BorderStyle.NONE},bottom:{style:BorderStyle.NONE},left:{style:BorderStyle.NONE},right:{style:BorderStyle.NONE}};
    children.push(new Table({width:{size:TW,type:WidthType.DXA},columnWidths:[FW,FW2],rows:[new TableRow({children:[cel([par([txt("_______________________________")],{align:AlignmentType.CENTER}),par([txt(docente||"Docente",{bold:true})],{align:AlignmentType.CENTER}),par([txt(cargo||"Docente",{size:20})],{align:AlignmentType.CENTER})],{w:FW,borders:nb}),cel([par([txt("_______________________________")],{align:AlignmentType.CENTER}),par([txt("Coordinador / Rector",{bold:true})],{align:AlignmentType.CENTER}),par([txt("Vo. Bo.",{size:20})],{align:AlignmentType.CENTER})],{w:FW2,borders:nb})]})]})  );
    const doc=new Document({styles:{default:{document:{run:{font:"Times New Roman",size:24}}}},sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:567,right:567,bottom:567,left:567}}},children}]});
    const buffer=await Packer.toBuffer(doc);
    res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition",`attachment; filename="PlanAula_${area}_Grado${grado}.docx"`);
    res.send(buffer);
  } catch(e){ res.status(500).json({mensaje:e.message}); }
});

// ======================================================
//  INICIAR SERVIDOR
// ======================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`✅ EduClass v5 PostgreSQL — Puerto ${PORT}`);
  console.log(`🤖 IAs: ${AI_PROVIDERS.map(p=>p.nombre).join(" → ")}`);
  try {
    await prisma.$connect();
    console.log("🗄️  PostgreSQL conectado ✅");
  } catch(e) {
    console.error("❌ Error conectando a PostgreSQL:", e.message);
  }
});
