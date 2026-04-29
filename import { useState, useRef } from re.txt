import { useState, useRef } from "react";

const API = "https://educlass-backend-production-92e6.up.railway.app";
const F_TITULO = "Georgia, 'Times New Roman', serif";
const F_CUERPO = "'Segoe UI', Arial, sans-serif";

const TIPOS_ACTIVIDAD = [
  { id:"taller",         label:"📝 Taller",               desc:"Preguntas abiertas de desarrollo" },
  { id:"evaluacion",     label:"📊 Evaluación",            desc:"Mixta: selección, completar y abierta" },
  { id:"quiz",           label:"⚡ Quiz",                  desc:"Selección múltiple con respuesta correcta" },
  { id:"completar",      label:"✏️ Completar la oración",  desc:"Espacios en blanco para llenar" },
  { id:"verdadero_falso",label:"✅ Verdadero / Falso",     desc:"Afirmaciones para clasificar" },
  { id:"relacionar",     label:"🔗 Relacionar conceptos",  desc:"Unir columna A con columna B" },
];

const OPT_P_APERTURA=[{id:"cuento_p",label:"📚 Cuento pedagógico",desc:"Historia creativa"},{id:"cancion",label:"🎵 Canción / rima",desc:"Rima para motivar"},{id:"pregunta",label:"❓ Pregunta impactante",desc:"Generan asombro"},{id:"video",label:"🎬 Video sugerido",desc:"YouTube"},{id:"imagen",label:"🖼️ Imagen contextual",desc:"Imagen ideal"},{id:"juego_i",label:"🎮 Juego de inicio",desc:"Dinámica lúdica"}];
const OPT_P_DESARROLLO=[{id:"juego_s",label:"🎯 Sopa de letras",desc:"Vocabulario"},{id:"bingo",label:"🎰 Bingo educativo",desc:"Conceptos"},{id:"memoria",label:"🧠 Memoria conceptual",desc:"Pares"},{id:"manualidad",label:"✂️ Manualidad",desc:"Maqueta o cartel"},{id:"descubr",label:"🔍 Por descubrimiento",desc:"Experimento"},{id:"rincones",label:"🏫 Rincones",desc:"Estaciones"},{id:"roles_p",label:"🎭 Juego de roles",desc:"Personajes"},{id:"lluvia_p",label:"💭 Lluvia de ideas",desc:"Aportes libres"}];
const OPT_P_RETRO=[{id:"vf",label:"✅ Verdadero / Falso",desc:"Afirmaciones"},{id:"completar",label:"📝 Completar",desc:"Párrafo con espacios"},{id:"dibujo_r",label:"🎨 Dibujo evaluativo",desc:"Dibujar"},{id:"preguntas",label:"❓ Preguntas rápidas",desc:"5 directas"},{id:"relacionar",label:"🔗 Relacionar",desc:"Dos columnas"},{id:"ruleta",label:"🎡 Ruleta",desc:"Al azar"}];
const OPT_B_APERTURA=[{id:"problema",label:"🧩 Situación problema",desc:"Caso real"},{id:"dato",label:"🔢 Dato curioso",desc:"Sorprendente"},{id:"pregunta",label:"❓ Pregunta impactante",desc:"Crítico"},{id:"video",label:"🎬 Video sugerido",desc:"YouTube"},{id:"noticia",label:"📰 Noticia actual",desc:"Reciente"},{id:"debate_i",label:"⚖️ Debate inicial",desc:"Postura"}];
const OPT_B_DESARROLLO=[{id:"magistral",label:"🎓 Clase magistral",desc:"Explicación"},{id:"abp",label:"🧩 ABP",desc:"Problemas"},{id:"debate_b",label:"⚖️ Debate",desc:"Posturas"},{id:"caso_b",label:"🔬 Estudio de caso",desc:"Analizar"},{id:"proyecto_b",label:"📁 Proyecto",desc:"Interdisciplinar"},{id:"invertida",label:"🔄 Clase invertida",desc:"Teoría en casa"},{id:"simulacion",label:"🎮 Simulación",desc:"Lab/juicio"},{id:"mapa_av",label:"🗺️ Mapa conceptual",desc:"Síntesis"}];
const OPT_B_RETRO=[{id:"caso",label:"🔍 Caso práctico",desc:"Análisis"},{id:"ensayo_c",label:"✍️ Ensayo corto",desc:"Argumentativo"},{id:"preguntas",label:"❓ Preguntas análisis",desc:"Crítico"},{id:"relacionar",label:"🔗 Relacionar",desc:"Columnas"},{id:"vf",label:"✅ V/F",desc:"Afirmaciones"},{id:"debate_r",label:"💬 Debate corto",desc:"Posiciones"}];
const OPT_CIERRE=[{id:"resumen",label:"📋 Resumen colectivo",desc:"Entre todos"},{id:"metacog",label:"💭 Metacognición",desc:"¿Qué aprendí?"},{id:"mapa_c",label:"🗺️ Mapa mental",desc:"Organizan"},{id:"compromiso",label:"🤝 Compromiso",desc:"¿Cómo aplicaré?"},{id:"ticket",label:"🎫 Ticket de salida",desc:"1 aprendizaje"}];
const OPT_TAREA=[{id:"investiga",label:"🔎 Investigación",desc:"Consultar fuentes"},{id:"entrevista",label:"🎤 Entrevista",desc:"Preguntar en casa"},{id:"dibujo",label:"🎨 Dibujo",desc:"Visual"},{id:"redaccion",label:"✏️ Redacción",desc:"Párrafo"},{id:"video_c",label:"📱 Video",desc:"Grabar"}];
const OPT_DURACION=[{val:"55",label:"1 hora (55 min)"},{val:"110",label:"2 horas (110 min)"},{val:"165",label:"3 horas (165 min)"},{val:"220",label:"4 horas (220 min)"}];

const C={fondo:"#0e1420",panel:"#0a1128",tarjeta:"#111827",borde:"#1e2d45",azul:"#2563EB",azulC:"#60A5FA",verde:"#059669",verdeC:"#34D399",texto:"#F1F5F9",textoS:"#64748B",err:"#F87171",ok:"#4ADE80",naranja:"#F59E0B",morado:"#7C3AED",rojo:"#DC2626",dorado:"#D97706"};
const S={
  pantalla:{minHeight:"100vh",background:C.fondo,display:"flex",justifyContent:"center",alignItems:"center",fontFamily:F_CUERPO},
  fondo:{minHeight:"100vh",background:C.fondo,fontFamily:F_CUERPO,color:C.texto},
  header:{background:C.panel,padding:"0 28px",height:60,display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`2px solid ${C.azul}`,position:"sticky",top:0,zIndex:100},
  logo:{color:C.azulC,fontSize:19,fontWeight:"bold",fontFamily:F_TITULO},
  contenedor:{maxWidth:980,margin:"0 auto",padding:"28px 16px"},
  card:{background:C.tarjeta,padding:"36px 32px",borderRadius:16,width:"100%",maxWidth:520,display:"flex",flexDirection:"column",gap:16,boxShadow:"0 12px 40px rgba(0,0,0,0.6)",border:`1px solid ${C.borde}`},
  titulo:{color:C.azulC,fontSize:24,fontWeight:"bold",margin:0,textAlign:"center",fontFamily:F_TITULO},
  sub:{color:C.textoS,textAlign:"center",margin:"0 0 8px",fontSize:14},
  label:{color:C.textoS,fontSize:13,marginBottom:5,fontWeight:"500"},
  input:{padding:"11px 14px",borderRadius:8,border:`1px solid ${C.borde}`,background:"#0a1128",color:C.texto,fontSize:14,width:"100%",boxSizing:"border-box",fontFamily:F_CUERPO,outline:"none"},
  textarea:{padding:"11px 14px",borderRadius:8,border:`1px solid ${C.borde}`,background:"#0a1128",color:C.texto,fontSize:14,width:"100%",boxSizing:"border-box",fontFamily:F_CUERPO,outline:"none",resize:"vertical",minHeight:90},
  select:{padding:"11px 14px",borderRadius:8,border:`1px solid ${C.borde}`,background:"#0a1128",color:C.texto,fontSize:14,flex:1,fontFamily:F_CUERPO,outline:"none"},
  btnAzul:{padding:"12px 20px",borderRadius:9,border:"none",background:`linear-gradient(135deg,${C.azul},#1d4ed8)`,color:"#fff",fontWeight:"700",fontSize:14,cursor:"pointer",width:"100%",fontFamily:F_TITULO},
  btnGris:{padding:"11px 20px",borderRadius:9,border:`1px solid ${C.borde}`,background:"transparent",color:C.textoS,fontSize:14,cursor:"pointer",width:"100%",fontFamily:F_CUERPO},
  btnVerde:{padding:"12px 20px",borderRadius:9,border:"none",background:`linear-gradient(135deg,${C.verde},#047857)`,color:"#fff",fontWeight:"700",fontSize:14,cursor:"pointer",width:"100%",fontFamily:F_TITULO},
  btnNaranja:{padding:"12px 20px",borderRadius:9,border:"none",background:`linear-gradient(135deg,${C.naranja},#b45309)`,color:"#fff",fontWeight:"700",fontSize:14,cursor:"pointer",fontFamily:F_TITULO},
  btnMorado:{padding:"12px 20px",borderRadius:9,border:"none",background:`linear-gradient(135deg,${C.morado},#5b21b6)`,color:"#fff",fontWeight:"700",fontSize:14,cursor:"pointer",width:"100%",fontFamily:F_TITULO},
  btnSm:{padding:"6px 13px",borderRadius:7,border:`1px solid ${C.borde}`,background:"transparent",color:C.textoS,cursor:"pointer",fontSize:12},
  fila:{display:"flex",gap:12},
  bloque:{background:C.tarjeta,padding:24,borderRadius:14,marginBottom:16,border:`1px solid ${C.borde}`},
  tBloque:{color:C.azulC,fontSize:19,marginBottom:8,marginTop:0,fontFamily:F_TITULO,fontWeight:"bold"},
  desc:{color:C.textoS,fontSize:13,marginBottom:16,lineHeight:1.6},
  grid:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10},
  opcion:(sel)=>({padding:12,borderRadius:10,border:sel?`2px solid ${C.azulC}`:`1px solid ${C.borde}`,background:sel?"#0f2a47":"#0a1128",cursor:"pointer",transition:"all 0.2s"}),
  oLbl:{color:C.texto,fontWeight:"700",fontSize:13,margin:0},
  oDesc:{color:C.textoS,fontSize:11,margin:"3px 0 0"},
  pasos:{display:"flex",gap:5,marginBottom:24,justifyContent:"center",flexWrap:"wrap"},
  pasoBola:(a,c2)=>({width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:"bold",background:c2?C.verde:a?C.azul:"#111827",color:(c2||a)?"white":"#4a5a70",border:a?`2px solid ${C.azulC}`:c2?`2px solid ${C.verde}`:`1px solid ${C.borde}`}),
  resultado:{background:C.tarjeta,padding:24,borderRadius:14,border:`1px solid ${C.borde}`},
  pre:{whiteSpace:"pre-wrap",color:"#CBD5E1",fontSize:13,lineHeight:2,margin:0,fontFamily:"'Courier New', monospace"},
  sep:{borderTop:`1px solid ${C.borde}`,margin:"16px 0"},
  chip:{display:"inline-block",background:"#0f2a47",border:`1px solid ${C.azul}`,color:C.azulC,padding:"3px 10px",borderRadius:20,fontSize:11,margin:2},
  err:{color:C.err,textAlign:"center",margin:0,fontSize:13},
  ok_msg:{color:C.ok,textAlign:"center",margin:0,fontSize:13},
  badge:(col)=>({background:col,color:"#fff",fontSize:10,fontWeight:"bold",padding:"2px 7px",borderRadius:20,marginLeft:5}),
};

function Opciones({lista,val,set}){return(<div style={S.grid}>{lista.map(op=>(<div key={op.id} style={S.opcion(val===op.id)} onClick={()=>set(op.id)}><p style={S.oLbl}>{op.label}</p><p style={S.oDesc}>{op.desc}</p></div>))}</div>);}
function SubirImagen({label,preview,inputRef,onChange}){return(<div style={{textAlign:"center"}}><p style={{...S.label,textAlign:"center"}}>{label}</p><div style={{width:80,height:80,borderRadius:10,border:`2px dashed ${C.borde}`,background:"#0a1128",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",cursor:"pointer",margin:"0 auto"}} onClick={()=>inputRef.current.click()}>{preview?<img src={preview} alt={label} style={{width:"100%",height:"100%",objectFit:"contain"}}/>:<span style={{fontSize:26,color:C.textoS}}>📷</span>}</div><p style={{color:C.textoS,fontSize:10,margin:"4px 0 0"}}>Click para subir</p><input ref={inputRef} type="file" accept="image/*" style={{display:"none"}} onChange={onChange}/></div>);}
function DashCard({icon,titulo,desc,color,onClick,badge,disabled}){const [hover,setHover]=useState(false);return(<div onClick={disabled?null:onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)} style={{background:hover&&!disabled?"#131f35":"#0f1a2e",border:`1.5px solid ${hover&&!disabled?color:C.borde}`,borderRadius:14,padding:"20px 16px",cursor:disabled?"not-allowed":"pointer",transition:"all 0.2s",position:"relative",opacity:disabled?0.5:1,boxShadow:hover&&!disabled?`0 4px 20px ${color}33`:"none"}}>{badge&&<span style={{position:"absolute",top:10,right:10,background:color,color:"#fff",fontSize:10,fontWeight:"bold",padding:"2px 7px",borderRadius:20}}>{badge}</span>}<div style={{fontSize:32,marginBottom:8}}>{icon}</div><p style={{color:C.texto,fontWeight:"bold",fontSize:14,margin:"0 0 4px",fontFamily:F_TITULO}}>{titulo}</p><p style={{color:C.textoS,fontSize:12,margin:"0 0 10px",lineHeight:1.4}}>{desc}</p><div style={{display:"inline-block",background:disabled?C.borde:color,color:disabled?C.textoS:"#fff",padding:"4px 10px",borderRadius:7,fontSize:11,fontWeight:"bold"}}>{disabled?"Próximamente":"Abrir →"}</div></div>);}
function TarjetaClase({clase,onVer,onEliminar}){const fecha=new Date(clase.creadaEn).toLocaleDateString("es-CO",{day:"2-digit",month:"short",year:"numeric"});return(<div style={{background:"#0a1128",border:`1px solid ${C.borde}`,borderRadius:10,padding:"12px 16px",marginBottom:8}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}><div style={{flex:1}}><p style={{color:C.azulC,fontWeight:"bold",margin:"0 0 3px",fontSize:14}}>{clase.datos?.tema||"Sin título"}</p><p style={{color:C.textoS,fontSize:12,margin:0}}>{clase.datos?.area} · Grado {clase.datos?.grado} · {fecha}</p></div><div style={{display:"flex",gap:6,marginLeft:10}}><button style={{...S.btnSm,color:C.azulC,borderColor:C.azul}} onClick={()=>onVer(clase)}>👁 Ver</button><button style={{...S.btnSm,color:C.err,borderColor:C.rojo}} onClick={()=>onEliminar(clase.id)}>🗑</button></div></div></div>);}

function ResolverActividad({actividad,tipo,onRespuestas}){
  const [respuestas,setRespuestas]=useState({});
  const preguntas=actividad?.preguntas||actividad?.pares||[];
  const setResp=(i,val)=>{const nuevo={...respuestas,[i]:val};setRespuestas(nuevo);onRespuestas(nuevo);};
  if(tipo==="relacionar"&&actividad?.pares){const pares=actividad.pares;const ops=pares.map(p=>p.columnaB);return(<div><p style={{color:C.textoS,fontSize:13,marginBottom:12}}>Une cada concepto con su definición:</p>{pares.map((par,i)=>(<div key={i} style={{display:"flex",gap:10,marginBottom:10,alignItems:"center"}}><div style={{flex:1,background:"#0a1128",padding:"8px 12px",borderRadius:8,border:`1px solid ${C.borde}`,color:C.texto,fontSize:13}}>{par.columnaA}</div><span style={{color:C.textoS}}>→</span><select style={{...S.select,flex:1}} value={respuestas[i]||""} onChange={e=>setResp(i,e.target.value)}><option value="">Seleccionar...</option>{ops.map((op,j)=><option key={j} value={op}>{op}</option>)}</select></div>))}</div>);}
  return(<div>{preguntas.map((p,i)=>(<div key={i} style={{marginBottom:16,background:"#0a1128",padding:14,borderRadius:10,border:`1px solid ${C.borde}`}}><p style={{color:C.azulC,fontWeight:"bold",fontSize:13,margin:"0 0 8px"}}>{i+1}. {p.pregunta||p.enunciado||p.afirmacion}</p>{(tipo==="quiz"||p.tipo==="seleccion")&&p.opciones&&(<div style={{display:"flex",flexDirection:"column",gap:6}}>{p.opciones.map((op,j)=>(<div key={j} style={{...S.opcion(respuestas[i]===op),padding:"8px 12px"}} onClick={()=>setResp(i,op)}><p style={{...S.oLbl,fontSize:12}}>{op}</p></div>))}</div>)}{tipo==="completar"&&(<input style={S.input} placeholder="Escribe la respuesta..." value={respuestas[i]||""} onChange={e=>setResp(i,e.target.value)}/>)}{tipo==="verdadero_falso"&&(<div style={S.fila}><div style={{...S.opcion(respuestas[i]==="Verdadero"),flex:1,padding:"8px 12px"}} onClick={()=>setResp(i,"Verdadero")}><p style={{...S.oLbl,fontSize:13,textAlign:"center"}}>✅ Verdadero</p></div><div style={{...S.opcion(respuestas[i]==="Falso"),flex:1,padding:"8px 12px"}} onClick={()=>setResp(i,"Falso")}><p style={{...S.oLbl,fontSize:13,textAlign:"center"}}>❌ Falso</p></div></div>)}{(tipo==="taller"||tipo==="evaluacion"||p.tipo==="abierta")&&(<textarea style={{...S.textarea,minHeight:70}} placeholder="Escribe tu respuesta aquí..." value={respuestas[i]||""} onChange={e=>setResp(i,e.target.value)}/>)}</div>))}</div>);
}

export default function App() {
  const urlParams=new URLSearchParams(window.location.search);
  const codigoUrl=urlParams.get("codigo");

  const [vista,setVista]=useState(codigoUrl?"portal_estudiante":"login");
  const [usuario,setUsuario]=useState(null);
  const [nombre,setNombre]=useState("");const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [msgAuth,setMsgAuth]=useState("");
  const [regInst,setRegInst]=useState("");const [regCargo,setRegCargo]=useState("Docente");const [regCiudad,setRegCiudad]=useState("");
  const [logoPreview,setLogoPreview]=useState("");const [banderaPreview,setBanderaPreview]=useState("");const [logoFile,setLogoFile]=useState(null);const [banderaFile,setBanderaFile]=useState(null);
  const logoRef=useRef(),banderaRef=useRef();
  const [misClases,setMisClases]=useState([]);const [misTareas,setMisTareas]=useState([]);const [claseActiva,setClaseActiva]=useState(null);const [tareaActiva,setTareaActiva]=useState(null);
  
  // ── NUEVO: listado completo de entregas ───────────────
  const [listadoCompleto,setListadoCompleto]=useState([]);
  const [calNota,setCalNota]=useState("");const [calComentario,setCalComentario]=useState("");const [calEntregaId,setCalEntregaId]=useState(null);
  
  const [paso,setPaso]=useState(1);const [institucion,setInstitucion]=useState("");const [docente,setDocente]=useState("");const [area,setArea]=useState("");const [grado,setGrado]=useState("");const [periodo,setPeriodo]=useState("1");const [fecha,setFecha]=useState("");const [tema,setTema]=useState("");const [duracion,setDuracion]=useState("55");const [nivelEdu,setNivelEdu]=useState("");const [apertura,setApertura]=useState("");const [desarrollo,setDesarrollo]=useState("");const [retro,setRetro]=useState("");const [cierre,setCierre]=useState("");const [dejaTarea,setDejaTarea]=useState(null);const [tarea,setTarea]=useState("");
  const [contenido,setContenido]=useState("");const [cargando,setCargando]=useState(false);const [descargando,setDescargando]=useState(false);const [descPdf,setDescPdf]=useState(false);const [guardando,setGuardando]=useState(false);const [guardadoOk,setGuardadoOk]=useState(false);
  const [ntTitulo,setNtTitulo]=useState("");const [ntDesc,setNtDesc]=useState("");const [ntFecha,setNtFecha]=useState("");const [ntTipo,setNtTipo]=useState("taller");const [ntArea,setNtArea]=useState("");const [ntGrado,setNtGrado]=useState("");
  const [ntAsignacion,setNtAsignacion]=useState("individual");
  const [ntGradoSel,setNtGradoSel]=useState("");
  const [ntActividad,setNtActividad]=useState(null);const [generandoAct,setGenerandoAct]=useState(false);const [tareaCreada,setTareaCreada]=useState(null);const [creandoTarea,setCreandoTarea]=useState(false);
  const [gradosDisp,setGradosDisp]=useState([]);
  
  // ── NUEVO: todos los estudiantes registrados ──────────
  const [todosEstudiantes,setTodosEstudiantes]=useState([]);
  const [estudiantesFiltrados,setEstudiantesFiltrados]=useState([]);
  const [busquedaEst,setBusquedaEst]=useState("");
  const [estSelIds,setEstSelIds]=useState([]);
  const [cargandoEsts,setCargandoEsts]=useState(false);

  // Portal estudiante
  const [estVista,setEstVista]=useState("login");const [estSesion,setEstSesion]=useState(null);const [estMsg,setEstMsg]=useState("");const [estNombre,setEstNombre]=useState("");const [estUsuario,setEstUsuario]=useState("");const [estPassword,setEstPassword]=useState("");const [estGrado,setEstGrado]=useState("");const [estInstitucion,setEstInstitucion]=useState("");const [estCodigo,setEstCodigo]=useState(codigoUrl||"");const [estTareasAsignadas,setEstTareasAsignadas]=useState([]);const [estTareaActiva,setEstTareaActiva]=useState(null);const [estRespuestas,setEstRespuestas]=useState({});const [estRespuestaTexto,setEstRespuestaTexto]=useState("");const [estArchivo,setEstArchivo]=useState(null);const [estEnviando,setEstEnviando]=useState(false);const [estYaEntrego,setEstYaEntrego]=useState(false);const [estEntregaData,setEstEntregaData]=useState(null);
  const archivoRef=useRef();

  const esBach=nivelEdu==="bachillerato"||nivelEdu==="media_tecnica";
  const optApertura=esBach?OPT_B_APERTURA:OPT_P_APERTURA;
  const optDesarrollo=esBach?OPT_B_DESARROLLO:OPT_P_DESARROLLO;
  const optRetro=esBach?OPT_B_RETRO:OPT_P_RETRO;

  const cargarPerfil=(u)=>{setInstitucion(u.institucion||"");setDocente(u.nombre||"");if(u.logoPath)setLogoPreview(`${API}/${u.logoPath}`);if(u.banderaPath)setBanderaPreview(`${API}/${u.banderaPath}`);};
  const cargarClases=async(uid)=>{try{const r=await fetch(`${API}/mis-clases/${uid}`);const d=await r.json();setMisClases(d.clases||[]);}catch(_){}};
  const cargarTareas=async(uid)=>{try{const r=await fetch(`${API}/mis-tareas/${uid}`);const d=await r.json();setMisTareas(d.tareas||[]);}catch(_){}};
  const cargarTareasEst=async(uid)=>{try{const r=await fetch(`${API}/mis-tareas-estudiante/${uid}`);const d=await r.json();setEstTareasAsignadas(d.tareas||[]);}catch(_){}};
  const reset=()=>{setPaso(1);setArea("");setGrado("");setPeriodo("1");setFecha("");setTema("");setDuracion("55");setNivelEdu("");setApertura("");setDesarrollo("");setRetro("");setCierre("");setDejaTarea(null);setTarea("");setContenido("");setGuardadoOk(false);setClaseActiva(null);if(usuario)cargarPerfil(usuario);};

  // ── NUEVO: cargar todos los estudiantes registrados ───
  const cargarTodosEstudiantes=async()=>{
    setCargandoEsts(true);
    try{const r=await fetch(`${API}/todos-estudiantes`);const d=await r.json();setTodosEstudiantes(d.estudiantes||[]);setEstudiantesFiltrados(d.estudiantes||[]);}catch(_){}
    setCargandoEsts(false);
  };
  const filtrarEstudiantes=(texto)=>{
    setBusquedaEst(texto);
    const q=texto.toLowerCase();
    setEstudiantesFiltrados(todosEstudiantes.filter(e=>e.nombre.toLowerCase().includes(q)||e.grado?.toLowerCase().includes(q)||(e.usuario||"").toLowerCase().includes(q)));
  };
  const toggleEstudiante=(id)=>setEstSelIds(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const seleccionarGrado=(g)=>{
    const ids=todosEstudiantes.filter(e=>e.grado===g).map(e=>e.id);
    setEstSelIds(prev=>{const nuevos=ids.filter(id=>!prev.includes(id));return[...prev,...nuevos];});
  };

  const login=async()=>{if(!email){setMsgAuth("Ingresa tu correo");return;}try{const r=await fetch(`${API}/login`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});const d=await r.json();if(r.ok){setUsuario(d.usuario);cargarPerfil(d.usuario);setVista("dashboard");setMsgAuth("");cargarClases(d.usuario.id);cargarTareas(d.usuario.id);}else setMsgAuth(d.mensaje||"Error");}catch{setMsgAuth("No se pudo conectar al servidor");}};
  const registrar=async()=>{if(!nombre||!email||!password){setMsgAuth("Completa nombre, correo y contraseña");return;}try{const r=await fetch(`${API}/registro`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nombre,email,password,institucion:regInst,cargo:regCargo,ciudad:regCiudad})});const d=await r.json();setMsgAuth(d.mensaje);if(r.ok)setTimeout(()=>{setVista("login");setMsgAuth("");},1600);}catch{setMsgAuth("Error en el registro");}};
  const salir=()=>{setVista("login");setUsuario(null);reset();setEmail("");setPassword("");setMsgAuth("");setMisClases([]);setMisTareas([]);setLogoPreview("");setBanderaPreview("");};
  const subirPerfil=async()=>{if(!usuario)return;const form=new FormData();form.append("userId",usuario.id);form.append("nombre",usuario.nombre);form.append("institucion",institucion);form.append("cargo",usuario.cargo||"Docente");form.append("ciudad",usuario.ciudad||"");if(logoFile)form.append("logo",logoFile);if(banderaFile)form.append("bandera",banderaFile);try{const r=await fetch(`${API}/actualizar-perfil`,{method:"POST",body:form});const d=await r.json();if(r.ok){setUsuario(d.usuario);setLogoFile(null);setBanderaFile(null);alert("Perfil guardado ✅");}else alert(d.mensaje);}catch{alert("Error guardando perfil");}};

  const loginEstudianteReg=async()=>{if(!estUsuario||!estPassword){setEstMsg("Completa usuario y contraseña");return;}try{const r=await fetch(`${API}/login-estudiante-reg`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({usuario:estUsuario,password:estPassword})});const d=await r.json();if(r.ok){setEstSesion(d.estudiante);setEstMsg("");setEstVista("dashboard");cargarTareasEst(d.estudiante.id);if(codigoUrl)unirseATarea(d.estudiante.id,codigoUrl);}else setEstMsg(d.mensaje||"Error");}catch{setEstMsg("No se pudo conectar al servidor");}};
  const registrarEstudiante=async()=>{if(!estNombre||!estUsuario||!estPassword){setEstMsg("Completa nombre, usuario y contraseña");return;}try{const r=await fetch(`${API}/registro-estudiante`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nombre:estNombre,usuario:estUsuario,password:estPassword,grado:estGrado,institucion:estInstitucion})});const d=await r.json();if(r.ok){setEstMsg("✅ Registro exitoso. Ahora inicia sesión.");setEstVista("login");}else setEstMsg(d.mensaje||"Error");}catch{setEstMsg("Error en el registro");}};
  const unirseATarea=async(estudianteId,cod)=>{if(!cod)return;try{await fetch(`${API}/unirse-tarea`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({codigo:cod.toUpperCase(),estudianteId})});cargarTareasEst(estudianteId);}catch(_){}};
  const resolverTarea=async(t)=>{setEstTareaActiva(t);setEstYaEntrego(t.entregada||false);setEstEntregaData(null);setEstRespuestas({});setEstRespuestaTexto("");setEstArchivo(null);setEstVista("resolver");};
  const entregarTarea=async()=>{if(!estTareaActiva||!estSesion)return;const tieneRespuestas=Object.keys(estRespuestas).length>0||estRespuestaTexto||estArchivo;if(!tieneRespuestas){alert("Debes responder o subir un archivo");return;}if(estTareaActiva.fechaEntrega){const deadline=new Date(estTareaActiva.fechaEntrega+"T23:59:59");if(new Date()>deadline){alert("⏰ La fecha de entrega ya venció.");return;}}setEstEnviando(true);try{const form=new FormData();form.append("tareaId",estTareaActiva.id);form.append("estudianteRegId",estSesion.id);form.append("respuesta",estRespuestaTexto);form.append("respuestasActividad",JSON.stringify(estRespuestas));if(estArchivo)form.append("archivo",estArchivo);const r=await fetch(`${API}/entregar-tarea`,{method:"POST",body:form});const d=await r.json();if(r.ok){setEstYaEntrego(true);setEstEntregaData(d.entrega);if(d.autoCalificada){alert(`✅ Calificado automáticamente.\nNota: ${d.notaAuto}\n${d.resultadoDetalle?.correctas||0}/${d.resultadoDetalle?.total||0} correctas`);}else{alert("¡Tarea entregada! ✅");}cargarTareasEst(estSesion.id);}else alert(d.mensaje);}catch{alert("Error enviando tarea");}setEstEnviando(false);};

  const generarActividad=async()=>{if(!ntTipo||!ntArea||!ntGrado){alert("Selecciona tipo, área y grado primero");return;}setGenerandoAct(true);try{const r=await fetch(`${API}/generar-actividad`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tipo:ntTipo,tema:ntTitulo||"Tema general",area:ntArea,grado:ntGrado,cantidad:5})});const d=await r.json();if(d.ok)setNtActividad(d.actividad);else alert("Error generando actividad");}catch{alert("Error");}setGenerandoAct(false);};

  const crearTarea=async()=>{
    if(!ntTitulo){alert("Completa el título");return;}
    if(estSelIds.length===0&&ntAsignacion==="individual"){alert("Selecciona al menos un estudiante");return;}
    if(ntAsignacion==="grado"&&!ntGradoSel){alert("Selecciona el grado");return;}
    setCreandoTarea(true);
    try{
      const body={docenteId:usuario.id,titulo:ntTitulo,descripcion:ntDesc,tipo:ntTipo,actividad:ntActividad,area:ntArea,grado:ntGradoSel||ntGrado,fechaEntrega:ntFecha,estudiantesLista:[],
        asignarGrado:ntAsignacion==="grado"?ntGradoSel:"manual",
        estudiantesRegIds:ntAsignacion==="individual"?estSelIds:[]};
      const r=await fetch(`${API}/crear-tarea`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const d=await r.json();
      if(r.ok){setTareaCreada(d);cargarTareas(usuario.id);}else alert(d.mensaje);
    }catch{alert("Error creando tarea");}
    setCreandoTarea(false);
  };

  const cargarGrados=async()=>{try{const r=await fetch(`${API}/grados-disponibles`);const d=await r.json();setGradosDisp(d.grados||[]);}catch(_){}};

  // ── NUEVO: ver entregas con listado completo ──────────
  const verEntregas=async(t)=>{
    setTareaActiva(t);
    try{
      const r=await fetch(`${API}/entregas-tarea/${t.id}`);
      const d=await r.json();
      setListadoCompleto(d.listadoCompleto||[]);
    }catch{alert("Error cargando entregas");}
    setVista("ver_entregas");
  };

  const calificar=async()=>{if(!calNota){alert("Ingresa una calificación");return;}try{const r=await fetch(`${API}/calificar-entrega`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({entregaId:calEntregaId,calificacion:calNota,comentario:calComentario})});const d=await r.json();if(r.ok){alert("Calificación guardada ✅");setCalEntregaId(null);setCalNota("");setCalComentario("");verEntregas(tareaActiva);}else alert(d.mensaje);}catch{alert("Error calificando");}};
  const eliminarTarea=async(id)=>{if(!window.confirm("¿Eliminar esta tarea?"))return;try{await fetch(`${API}/tarea/${id}`,{method:"DELETE"});cargarTareas(usuario.id);}catch{alert("Error");}};
  const eliminarClase=async(id)=>{if(!window.confirm("¿Eliminar?"))return;try{await fetch(`${API}/clase/${id}`,{method:"DELETE"});cargarClases(usuario.id);}catch{alert("Error");}};
  const generarGuia=async()=>{setCargando(true);setContenido("");setPaso(7);setGuardadoOk(false);const getLbl=(l,id)=>l.find(x=>x.id===id)?.label||id;try{const r=await fetch(`${API}/generar-guia`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({institucion,docente,area,grado,periodo,fecha,tema,duracion,cargo:usuario?.cargo||"Docente",ciudad:usuario?.ciudad||"",nivelEducativo:nivelEdu,tipoApertura:getLbl(optApertura,apertura),estratDesarrollo:getLbl(optDesarrollo,desarrollo),retroalimentacion:getLbl(optRetro,retro),tipoCierre:getLbl(OPT_CIERRE,cierre),dejaTarea,estratTarea:getLbl(OPT_TAREA,tarea)})});const d=await r.json();setContenido(d.contenido||d.mensaje||"Sin contenido.");}catch{setContenido("❌ Error de conexión.");}setCargando(false);};
  const guardarClase=async()=>{if(!contenido||!usuario)return;setGuardando(true);try{const r=await fetch(`${API}/guardar-clase`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({userId:usuario.id,contenido,datos:{institucion,docente,area,grado,periodo,fecha,tema,duracion}})});const d=await r.json();if(r.ok){setGuardadoOk(true);cargarClases(usuario.id);}else alert(d.mensaje);}catch{alert("Error guardando");}setGuardando(false);};
  const exportar=async(tipo)=>{if(!contenido||contenido.startsWith("❌")){alert("Genera una guía primero");return;}tipo==="word"?setDescargando(true):setDescPdf(true);try{const r=await fetch(`${API}/exportar-${tipo}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contenido,institucion,docente,area,grado,periodo,fecha,tema,duracion,logoPath:usuario?.logoPath||"",banderaPath:usuario?.banderaPath||"",cargo:usuario?.cargo||"Docente",ciudad:usuario?.ciudad||"",nivelEducativo:nivelEdu})});if(!r.ok){alert(`Error generando ${tipo}`);tipo==="word"?setDescargando(false):setDescPdf(false);return;}const blob=await r.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`PlanAula_${area}_Grado${grado}.${tipo==="word"?"docx":"pdf"}`;a.click();URL.revokeObjectURL(url);}catch{alert(`Error exportando ${tipo}`);}tipo==="word"?setDescargando(false):setDescPdf(false);};

  const Header=({showNav=true})=>(<div style={S.header}><div style={{display:"flex",alignItems:"center",gap:12}}><span style={S.logo}>🎓 EduClass Premium</span>{showNav&&(<div style={{display:"flex",gap:3}}><button style={{...S.btnSm,color:vista==="dashboard"?C.azulC:C.textoS,borderColor:vista==="dashboard"?C.azul:C.borde}} onClick={()=>setVista("dashboard")}>🏠</button><button style={{...S.btnSm,color:vista==="ia"?C.azulC:C.textoS,borderColor:vista==="ia"?C.azul:C.borde}} onClick={()=>{reset();setVista("ia");}}>📝 Nueva clase</button><button style={{...S.btnSm,color:vista==="tareas"?C.naranja:C.textoS,borderColor:vista==="tareas"?C.naranja:C.borde}} onClick={()=>setVista("tareas")}>📋 Tareas{misTareas.length>0&&<span style={S.badge(C.naranja)}>{misTareas.length}</span>}</button><button style={{...S.btnSm,color:vista==="historial"?C.verdeC:C.textoS,borderColor:vista==="historial"?C.verde:C.borde}} onClick={()=>setVista("historial")}>📂 Clases</button></div>)}</div>{showNav&&(<div style={{display:"flex",gap:7,alignItems:"center"}}>{logoPreview&&<img src={logoPreview} alt="L" style={{width:28,height:28,borderRadius:5,objectFit:"contain",border:`1px solid ${C.borde}`}}/>}{banderaPreview&&<img src={banderaPreview} alt="B" style={{width:28,height:28,borderRadius:5,objectFit:"contain",border:`1px solid ${C.borde}`}}/>}<span style={{color:C.textoS,fontSize:12}}>👤 {usuario?.nombre}</span><button style={{...S.btnSm,color:C.azulC,borderColor:C.azul}} onClick={()=>setVista("perfil")}>⚙️</button><button style={{...S.btnSm,color:C.err,borderColor:C.rojo}} onClick={salir}>Salir</button></div>)}</div>);

  // ══════════════════════════════════════════════════════
  //  PORTAL ESTUDIANTE
  // ══════════════════════════════════════════════════════
  if(vista==="portal_estudiante") return(
    <div style={S.fondo}>
      <div style={S.header}><span style={S.logo}>📚 Portal Estudiantil — EduClass</span><button style={{...S.btnSm,color:C.textoS}} onClick={()=>setVista("login")}>← Soy docente</button></div>

      {estVista==="login"&&(<div style={{...S.pantalla,paddingTop:20}}><div style={{...S.card,maxWidth:460}}>
        <div style={{textAlign:"center"}}><span style={{fontSize:44}}>📚</span><h1 style={{...S.titulo,fontSize:20,marginTop:8}}>Portal del Estudiante</h1><p style={S.sub}>Ingresa con tu cuenta para ver tus tareas</p></div>
        <div><p style={S.label}>Usuario</p><input style={S.input} placeholder="Tu nombre de usuario" value={estUsuario} onChange={e=>setEstUsuario(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginEstudianteReg()}/></div>
        <div><p style={S.label}>Contraseña</p><input type="password" style={S.input} placeholder="••••••••" value={estPassword} onChange={e=>setEstPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&loginEstudianteReg()}/></div>
        {codigoUrl&&<div style={{background:"#0f2a47",borderRadius:8,padding:"10px 14px",border:`1px solid ${C.azul}`}}><p style={{color:C.azulC,margin:0,fontSize:13}}>🔗 Código detectado: <strong>{codigoUrl}</strong></p></div>}
        <button style={S.btnAzul} onClick={loginEstudianteReg}>Ingresar</button>
        <button style={{...S.btnGris,borderColor:C.verde,color:C.verdeC}} onClick={()=>setEstVista("registro")}>¿No tienes cuenta? Regístrate aquí</button>
        {estMsg&&<p style={estMsg.includes("✅")?S.ok_msg:S.err}>{estMsg}</p>}
      </div></div>)}

      {estVista==="registro"&&(<div style={{...S.pantalla,paddingTop:20}}><div style={{...S.card,maxWidth:460}}>
        <h1 style={{...S.titulo,color:C.ok,fontSize:20}}>Crear mi cuenta de estudiante</h1>
        <p style={S.sub}>Crea tu cuenta y accede a tus tareas cuando quieras</p>
        <div><p style={S.label}>Nombre completo *</p><input style={S.input} placeholder="Ej: Juan Pérez" value={estNombre} onChange={e=>setEstNombre(e.target.value)}/></div>
        <div><p style={S.label}>Usuario * (sin espacios ni tildes)</p><input style={S.input} placeholder="Ej: juanperez2024" value={estUsuario} onChange={e=>setEstUsuario(e.target.value.toLowerCase().replace(/\s+/g,"").replace(/[áàä]/g,"a").replace(/[éèë]/g,"e").replace(/[íìï]/g,"i").replace(/[óòö]/g,"o").replace(/[úùü]/g,"u"))}/></div>
        <div><p style={S.label}>Contraseña *</p><input type="password" style={S.input} placeholder="Mínimo 6 caracteres" value={estPassword} onChange={e=>setEstPassword(e.target.value)}/></div>
        <div style={S.fila}>
          <div style={{flex:1}}><p style={S.label}>Grado</p><select style={S.select} value={estGrado} onChange={e=>setEstGrado(e.target.value)}><option value="">Seleccionar</option>{["Transición","1°","2°","3°","4°","5°","6°","7°","8°","9°","10°","11°"].map(g=><option key={g}>{g}</option>)}</select></div>
          <div style={{flex:1}}><p style={S.label}>Institución</p><input style={S.input} placeholder="Nombre del colegio" value={estInstitucion} onChange={e=>setEstInstitucion(e.target.value)}/></div>
        </div>
        <button style={S.btnVerde} onClick={registrarEstudiante}>Crear mi cuenta</button>
        <button style={S.btnGris} onClick={()=>setEstVista("login")}>← Ya tengo cuenta</button>
        {estMsg&&<p style={estMsg.includes("✅")?S.ok_msg:S.err}>{estMsg}</p>}
      </div></div>)}

      {estVista==="dashboard"&&estSesion&&(<div style={S.contenedor}>
        <div style={{background:`linear-gradient(135deg,#0f2a47,#0a1a35)`,borderRadius:14,padding:"20px 24px",marginBottom:20,border:`1px solid ${C.azul}`}}>
          <h2 style={{color:C.texto,fontSize:18,margin:"0 0 4px",fontFamily:F_TITULO}}>¡Hola, {estSesion.nombre}! 👋</h2>
          <p style={{color:C.textoS,margin:"0 0 12px",fontSize:13}}>Grado {estSesion.grado||""} · {estSesion.institucion||""}</p>
          <div style={S.fila}>
            <input style={{...S.input,width:160,padding:"8px 12px",fontSize:13}} placeholder="Código de tarea" value={estCodigo} onChange={e=>setEstCodigo(e.target.value.toUpperCase())}/>
            <button style={{...S.btnAzul,width:"auto",padding:"8px 16px",fontSize:13}} onClick={()=>{if(estCodigo)unirseATarea(estSesion.id,estCodigo).then(()=>setEstCodigo(""));}}>🔗 Unirme</button>
          </div>
        </div>
        <h3 style={{color:C.textoS,fontSize:12,fontWeight:"600",letterSpacing:1,textTransform:"uppercase",margin:"0 0 12px"}}>Mis tareas asignadas</h3>
        {estTareasAsignadas.length===0?(<div style={{...S.bloque,textAlign:"center",padding:40}}><p style={{fontSize:40,margin:"0 0 12px"}}>📋</p><p style={{color:C.textoS,fontSize:14}}>No tienes tareas asignadas aún.</p><p style={{color:"#374151",fontSize:13}}>Pide el código a tu docente y pégalo arriba.</p></div>):(
          estTareasAsignadas.map(t=>(<div key={t.id} style={{background:"#0a1128",border:`1px solid ${t.entregada?C.verde:C.borde}`,borderRadius:10,padding:"14px 16px",marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:8}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                  <p style={{color:C.azulC,fontWeight:"bold",margin:0,fontSize:14}}>{t.titulo}</p>
                  <span style={{background:C.morado,color:"#fff",fontSize:10,padding:"2px 8px",borderRadius:20}}>{TIPOS_ACTIVIDAD.find(x=>x.id===t.tipo)?.label||t.tipo}</span>
                </div>
                <p style={{color:C.textoS,fontSize:12,margin:"0 0 4px"}}>{t.area} · Grado {t.grado}{t.fechaEntrega&&` · 📅 ${t.fechaEntrega}`}</p>
                {t.vencida&&!t.entregada&&<p style={{color:C.err,fontSize:12,margin:0,fontWeight:"bold"}}>⏰ Fecha vencida</p>}
                {t.entregada&&<p style={{color:t.calificacion!=null?C.naranja:C.ok,fontSize:12,margin:0,fontWeight:"bold"}}>{t.calificacion!=null?`✅ Nota: ${t.calificacion}${t.comentario?` — ${t.comentario}`:""}` :"✅ Entregado — Pendiente de calificación"}</p>}
                {!t.entregada&&!t.vencida&&t.fechaEntrega&&<p style={{color:C.naranja,fontSize:11,margin:0}}>📅 Entregar antes del: {t.fechaEntrega}</p>}
              </div>
              <button style={{...S.btnSm,color:(t.entregada||t.vencida)?C.textoS:C.azulC,borderColor:(t.entregada||t.vencida)?C.borde:C.azul}} onClick={()=>resolverTarea(t)}>{t.entregada?"👁 Ver":t.vencida?"⏰ Vencida":"📝 Resolver"}</button>
            </div>
          </div>))
        )}
        <button style={{...S.btnGris,marginTop:16}} onClick={()=>{setEstSesion(null);setEstVista("login");setEstTareasAsignadas([]);}}>Cerrar sesión</button>
      </div>)}

      {estVista==="resolver"&&estTareaActiva&&(<div style={S.contenedor}>
        <button style={{...S.btnSm,marginBottom:16}} onClick={()=>setEstVista("dashboard")}>← Mis tareas</button>
        <div style={S.bloque}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
            <h2 style={{...S.tBloque,margin:0,fontSize:17}}>{estTareaActiva.titulo}</h2>
            <span style={{background:C.morado,color:"#fff",fontSize:11,padding:"3px 10px",borderRadius:20}}>{TIPOS_ACTIVIDAD.find(x=>x.id===estTareaActiva.tipo)?.label||estTareaActiva.tipo}</span>
          </div>
          <p style={{color:C.textoS,fontSize:13,margin:"0 0 12px"}}>{estTareaActiva.area} · Grado {estTareaActiva.grado}</p>
          {estTareaActiva.descripcion&&(<div style={{background:"#0f2a47",borderRadius:8,padding:"12px 14px",border:`1px solid ${C.azul}`,marginBottom:16}}><p style={{color:C.azulC,fontWeight:"bold",margin:"0 0 4px",fontSize:12}}>📋 Instrucciones:</p><p style={{color:C.texto,fontSize:13,margin:0,lineHeight:1.6}}>{estTareaActiva.descripcion}</p></div>)}
          {estYaEntrego?(<div style={{background:"#052e16",border:`1px solid ${C.ok}`,borderRadius:10,padding:16}}>
            <p style={{color:C.ok,fontWeight:"bold",fontSize:15,margin:"0 0 10px"}}>✅ Tarea entregada</p>
            {estEntregaData?.calificacion!=null?(<><p style={{color:C.texto,fontSize:13,margin:"0 0 4px"}}>Tu calificación:</p><p style={{color:C.naranja,fontSize:30,fontWeight:"bold",margin:"0 0 4px",fontFamily:F_TITULO}}>{estEntregaData.calificacion}</p><p style={{color:C.textoS,fontSize:12,margin:"0 0 8px"}}>{estEntregaData.comentario}</p>{estEntregaData.resultadoDetalle&&(<div style={{marginTop:12}}><p style={{color:C.texto,fontWeight:"bold",fontSize:13,margin:"0 0 8px"}}>Detalle:</p>{estEntregaData.resultadoDetalle.detalle?.map((d,i)=>(<div key={i} style={{background:d.esCorrecta?"#052e16":"#2d0a0a",borderRadius:7,padding:"7px 10px",marginBottom:6,border:`1px solid ${d.esCorrecta?C.ok:C.err}`}}><p style={{color:C.texto,fontSize:12,margin:"0 0 3px"}}>{i+1}. {d.pregunta}</p><p style={{color:d.esCorrecta?C.ok:C.err,fontSize:12,margin:"0 0 2px"}}>{d.esCorrecta?"✅":"❌"} Tu respuesta: <strong>{d.respEst||"Sin respuesta"}</strong></p>{!d.esCorrecta&&<p style={{color:C.textoS,fontSize:11,margin:0}}>Correcta: {d.respCorrecta}</p>}</div>))}</div>)}</>):(<p style={{color:C.textoS,fontSize:13,margin:0}}>Tu docente revisará tu trabajo pronto.</p>)}
          </div>):(
            <>{estTareaActiva.actividad&&(<div style={{marginBottom:16}}><p style={{color:C.texto,fontWeight:"bold",margin:"0 0 12px",fontFamily:F_TITULO}}>Resuelve la actividad:</p><ResolverActividad actividad={estTareaActiva.actividad} tipo={estTareaActiva.tipo} onRespuestas={setEstRespuestas}/></div>)}
            <div style={{marginBottom:12}}><p style={S.label}>✏️ {estTareaActiva.actividad?"Comentarios adicionales:":"Tu respuesta:"}</p><textarea style={{...S.textarea,minHeight:100}} placeholder="Escribe aquí..." value={estRespuestaTexto} onChange={e=>setEstRespuestaTexto(e.target.value)}/></div>
            <div style={{marginBottom:16}}><p style={S.label}>📎 Adjuntar archivo</p><div style={{display:"flex",gap:10,alignItems:"center"}}><button style={{...S.btnGris,width:"auto",padding:"8px 14px"}} onClick={()=>archivoRef.current.click()}>📁 Seleccionar</button>{estArchivo&&<span style={{color:C.ok,fontSize:12}}>✅ {estArchivo.name}</span>}</div><input ref={archivoRef} type="file" accept=".pdf,.docx,.doc,.jpg,.jpeg,.png" style={{display:"none"}} onChange={e=>setEstArchivo(e.target.files[0])}/></div>
            <button style={{...S.btnVerde,opacity:estEnviando?0.7:1}} disabled={estEnviando} onClick={entregarTarea}>{estEnviando?"⏳ Enviando...":"📤 Entregar tarea"}</button></>
          )}
        </div>
      </div>)}
    </div>
  );

  if(vista==="login") return(<div style={S.pantalla}><div style={S.card}><div style={{textAlign:"center"}}><span style={{fontSize:48}}>🎓</span><h1 style={S.titulo}>EduClass Premium</h1><p style={S.sub}>Plataforma pedagógica con IA</p></div><div><p style={S.label}>Correo electrónico</p><input style={S.input} placeholder="docente@colegio.edu.co" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}/></div><div><p style={S.label}>Contraseña</p><input type="password" style={S.input} placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&login()}/></div><button style={S.btnAzul} onClick={login}>Ingresar como docente</button><button style={S.btnGris} onClick={()=>{setVista("registro");setMsgAuth("");}}>Crear cuenta docente</button><div style={S.sep}/><button style={{...S.btnMorado}} onClick={()=>setVista("portal_estudiante")}>📚 Soy estudiante — Ver mis tareas</button>{msgAuth&&<p style={S.err}>{msgAuth}</p>}</div></div>);

  if(vista==="registro") return(<div style={S.pantalla}><div style={{...S.card,maxWidth:520}}><h1 style={{...S.titulo,color:C.ok,fontSize:20}}>Registro de Docente 🧑‍🏫</h1><div><p style={S.label}>Nombre completo *</p><input style={S.input} placeholder="Ej: María González" value={nombre} onChange={e=>setNombre(e.target.value)}/></div><div><p style={S.label}>Correo electrónico *</p><input style={S.input} placeholder="docente@colegio.edu.co" value={email} onChange={e=>setEmail(e.target.value)}/></div><div><p style={S.label}>Contraseña *</p><input type="password" style={S.input} placeholder="Mínimo 6 caracteres" value={password} onChange={e=>setPassword(e.target.value)}/></div><div style={S.sep}/><div><p style={S.label}>Institución</p><input style={S.input} placeholder="I.E. Rural La Esperanza" value={regInst} onChange={e=>setRegInst(e.target.value)}/></div><div style={S.fila}><div style={{flex:1}}><p style={S.label}>Cargo</p><select style={S.select} value={regCargo} onChange={e=>setRegCargo(e.target.value)}>{["Docente","Coordinador/a","Rector/a","Orientador/a"].map(c=><option key={c}>{c}</option>)}</select></div><div style={{flex:1}}><p style={S.label}>Ciudad</p><input style={S.input} placeholder="Bogotá" value={regCiudad} onChange={e=>setRegCiudad(e.target.value)}/></div></div><button style={S.btnVerde} onClick={registrar}>Registrarme</button><button style={S.btnGris} onClick={()=>{setVista("login");setMsgAuth("");}}>← Volver</button>{msgAuth&&<p style={msgAuth.includes("exitoso")?S.ok_msg:S.err}>{msgAuth}</p>}</div></div>);

  if(vista==="dashboard") return(<div style={S.fondo}><Header/><div style={S.contenedor}><div style={{background:`linear-gradient(135deg,#0f2a47,#0a1a35)`,borderRadius:14,padding:"22px 26px",marginBottom:22,border:`1px solid ${C.azul}`,display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}><div><h2 style={{color:C.texto,fontSize:19,margin:"0 0 3px",fontFamily:F_TITULO}}>¡Bienvenido/a, {usuario?.nombre?.split(" ")[0]}! 👋</h2><p style={{color:C.textoS,margin:0,fontSize:13}}>{usuario?.cargo||"Docente"} · {usuario?.institucion||"Sin institución"} · {usuario?.ciudad||""}</p></div><div style={{display:"flex",gap:8}}><div style={{background:"#0a1128",border:`1px solid ${C.borde}`,borderRadius:10,padding:"10px 16px",textAlign:"center"}}><p style={{color:C.azulC,fontSize:20,fontWeight:"bold",margin:0}}>{misClases.length}</p><p style={{color:C.textoS,fontSize:10,margin:0}}>Clases</p></div><div style={{background:"#0a1128",border:`1px solid ${C.borde}`,borderRadius:10,padding:"10px 16px",textAlign:"center"}}><p style={{color:C.naranja,fontSize:20,fontWeight:"bold",margin:0}}>{misTareas.length}</p><p style={{color:C.textoS,fontSize:10,margin:0}}>Tareas</p></div></div></div><p style={{color:C.textoS,fontSize:11,fontWeight:"600",letterSpacing:1,textTransform:"uppercase",margin:"0 0 12px"}}>Módulos principales</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginBottom:20}}><DashCard icon="📝" titulo="Nueva clase" desc="Genera guía pedagógica con IA" color={C.azul} onClick={()=>{reset();setVista("ia");}}/><DashCard icon="📋" titulo="Tareas" desc="Crea y revisa entregas" color={C.naranja} onClick={()=>setVista("tareas")} badge={misTareas.filter(t=>t.totalEntregas>0).length||null}/><DashCard icon="📂" titulo="Mis clases" desc="Historial de guías guardadas" color={C.verdeC} onClick={()=>setVista("historial")} badge={misClases.length||null}/><DashCard icon="⚙️" titulo="Mi perfil" desc="Escudo, bandera y datos" color={C.morado} onClick={()=>setVista("perfil")}/></div><p style={{color:C.textoS,fontSize:11,fontWeight:"600",letterSpacing:1,textTransform:"uppercase",margin:"0 0 12px"}}>Próximamente</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,marginBottom:20}}><DashCard icon="📊" titulo="Evaluaciones" desc="Rúbricas" color={C.rojo} disabled/><DashCard icon="📅" titulo="Planeador anual" desc="Año escolar" color={C.dorado} disabled/><DashCard icon="👥" titulo="Mis estudiantes" desc="Gestionar grupos" color={C.verdeC} disabled/><DashCard icon="📈" titulo="Reportes" desc="Estadísticas" color={C.azulC} disabled/></div>{misClases.length>0&&(<><p style={{color:C.textoS,fontSize:11,fontWeight:"600",letterSpacing:1,textTransform:"uppercase",margin:"0 0 12px"}}>Clases recientes</p><div style={S.bloque}>{misClases.slice(0,3).map(c=>(<TarjetaClase key={c.id} clase={c} onVer={async(clase)=>{const r=await fetch(`${API}/clase/${clase.id}`);const d=await r.json();setClaseActiva(d.clase);setVista("verClase");}} onEliminar={eliminarClase}/>))}{misClases.length>3&&<button style={{...S.btnGris,marginTop:8}} onClick={()=>setVista("historial")}>Ver todas ({misClases.length}) →</button>}</div></>)}</div></div>);

  if(vista==="tareas") return(<div style={S.fondo}><Header/><div style={S.contenedor}><div style={S.bloque}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h2 style={S.tBloque}>📋 Gestión de Tareas</h2><button style={{...S.btnAzul,width:"auto",padding:"9px 16px"}} onClick={()=>{setTareaCreada(null);setNtTitulo("");setNtDesc("");setNtFecha("");setNtActividad(null);setEstSelIds([]);cargarTodosEstudiantes();cargarGrados();setVista("crear_tarea");}}>+ Nueva tarea</button></div>{misTareas.length===0?(<div style={{textAlign:"center",padding:"36px 20px"}}><p style={{fontSize:44,margin:"0 0 12px"}}>📋</p><p style={{color:C.textoS,fontSize:14}}>No tienes tareas creadas aún.</p><button style={{...S.btnVerde,width:"auto",padding:"10px 20px",marginTop:14}} onClick={()=>setVista("crear_tarea")}>Crear primera tarea</button></div>):(misTareas.map(t=>(<div key={t.id} style={{background:"#0a1128",border:`1px solid ${C.borde}`,borderRadius:10,padding:"14px 16px",marginBottom:9}}><div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:8}}><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}><p style={{color:C.azulC,fontWeight:"bold",margin:0,fontSize:14}}>{t.titulo}</p><span style={{background:C.morado,color:"#fff",fontSize:10,padding:"2px 8px",borderRadius:20}}>{TIPOS_ACTIVIDAD.find(x=>x.id===t.tipo)?.label||t.tipo}</span></div><p style={{color:C.textoS,fontSize:12,margin:"0 0 5px"}}>{t.area} · Grado {t.grado} · Código: <span style={{color:C.naranja,fontWeight:"bold"}}>{t.codigo}</span></p><div style={{display:"flex",gap:6,flexWrap:"wrap"}}><span style={{...S.badge(C.azul),fontSize:11,padding:"3px 9px"}}>👥 {t.totalEstudiantes}</span><span style={{...S.badge(t.totalEntregas>0?C.verde:C.textoS),fontSize:11,padding:"3px 9px"}}>📤 {t.totalEntregas} entregas</span><span style={{...S.badge(C.err),fontSize:11,padding:"3px 9px"}}>⏳ {t.pendientes||0} pendientes</span>{t.fechaEntrega&&<span style={{...S.badge(C.naranja),fontSize:11,padding:"3px 9px"}}>📅 {t.fechaEntrega}</span>}</div></div><div style={{display:"flex",gap:6,flexShrink:0}}><button style={{...S.btnSm,color:C.azulC,borderColor:C.azul}} onClick={()=>verEntregas(t)}>📊 Ver listado</button><button style={{...S.btnSm,color:C.ok,borderColor:C.verde}} onClick={()=>{navigator.clipboard.writeText(`https://educlass-frontend.vercel.app?codigo=${t.codigo}`);alert("Link copiado ✅");}}>🔗 Link</button><button style={{...S.btnSm,color:C.err,borderColor:C.rojo}} onClick={()=>eliminarTarea(t.id)}>🗑</button></div></div></div>)))}</div></div></div>);

  // ══════════════════════════════════════════════════════
  //  CREAR TAREA — con listado de estudiantes y checkboxes
  // ══════════════════════════════════════════════════════
  if(vista==="crear_tarea") return(<div style={S.fondo}><Header/><div style={S.contenedor}>{!tareaCreada?(
    <div style={S.bloque}>
      <button style={{...S.btnSm,marginBottom:16}} onClick={()=>setVista("tareas")}>← Volver</button>
      <h2 style={S.tBloque}>+ Nueva tarea para estudiantes</h2>

      <p style={{color:C.texto,fontWeight:"bold",marginBottom:10,fontFamily:F_TITULO}}>1. Tipo de actividad</p>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:8,marginBottom:18}}>{TIPOS_ACTIVIDAD.map(t=>(<div key={t.id} style={S.opcion(ntTipo===t.id)} onClick={()=>setNtTipo(t.id)}><p style={S.oLbl}>{t.label}</p><p style={S.oDesc}>{t.desc}</p></div>))}</div>

      <p style={{color:C.texto,fontWeight:"bold",marginBottom:10,fontFamily:F_TITULO}}>2. Información de la tarea</p>
      <div style={{marginBottom:12}}><p style={S.label}>Título *</p><input style={S.input} placeholder="Ej: Quiz sobre el verbo to be" value={ntTitulo} onChange={e=>setNtTitulo(e.target.value)}/></div>
      <div style={{marginBottom:12}}><p style={S.label}>Instrucciones para el estudiante</p><textarea style={S.textarea} placeholder="Escribe las instrucciones..." value={ntDesc} onChange={e=>setNtDesc(e.target.value)}/></div>
      <div style={{...S.fila,marginBottom:16}}>
        <div style={{flex:1}}><p style={S.label}>Área</p><select style={S.select} value={ntArea} onChange={e=>setNtArea(e.target.value)}><option value="">Seleccionar</option>{["Ciencias Naturales","Ciencias Sociales","Matemáticas","Lengua Castellana","Inglés","Educación Física","Artística","Ética","Tecnología","Filosofía","Química","Física","Biología"].map(m=><option key={m}>{m}</option>)}</select></div>
        <div style={{flex:1}}><p style={S.label}>Grado referencia</p><select style={S.select} value={ntGrado} onChange={e=>setNtGrado(e.target.value)}><option value="">Seleccionar</option>{["Transición","1°","2°","3°","4°","5°","6°","7°","8°","9°","10°","11°"].map(g=><option key={g}>{g}</option>)}</select></div>
        <div style={{flex:1}}><p style={S.label}>Fecha de entrega</p><input type="date" style={S.input} value={ntFecha} onChange={e=>setNtFecha(e.target.value)}/></div>
      </div>

      {/* Generar actividad con IA */}
      <div style={{background:"#0f2a47",border:`1px solid ${C.azul}`,borderRadius:10,padding:16,marginBottom:18}}>
        <p style={{color:C.azulC,fontWeight:"bold",margin:"0 0 8px",fontSize:14}}>🤖 Generar actividad con IA</p>
        <button style={{...S.btnAzul,opacity:generandoAct?0.7:1}} disabled={generandoAct} onClick={generarActividad}>{generandoAct?"⏳ Generando preguntas...":"✨ Generar actividad con IA"}</button>
        {ntActividad&&(<div style={{marginTop:12,background:"#0a1128",borderRadius:8,padding:12}}><p style={{color:C.ok,fontWeight:"bold",margin:"0 0 8px",fontSize:13}}>✅ Vista previa ({(ntActividad.preguntas||ntActividad.pares||[]).length} preguntas):</p>{(ntActividad.preguntas||ntActividad.pares||[]).slice(0,3).map((p,i)=>(<p key={i} style={{color:C.textoS,fontSize:12,margin:"0 0 4px"}}>{i+1}. {p.pregunta||p.enunciado||p.afirmacion||p.columnaA}</p>))}{(ntActividad.preguntas||ntActividad.pares||[]).length>3&&<p style={{color:C.textoS,fontSize:12,margin:0}}>... y {(ntActividad.preguntas||ntActividad.pares||[]).length-3} más</p>}</div>)}
      </div>

      {/* ── NUEVO: Selección de estudiantes con checkboxes ── */}
      <p style={{color:C.texto,fontWeight:"bold",marginBottom:10,fontFamily:F_TITULO}}>3. ¿A quién asignar?</p>
      <div style={{...S.fila,marginBottom:14}}>
        <div style={{...S.opcion(ntAsignacion==="individual"),flex:1}} onClick={()=>setNtAsignacion("individual")}><p style={S.oLbl}>👤 Selección individual</p><p style={S.oDesc}>Elige estudiante por estudiante</p></div>
        <div style={{...S.opcion(ntAsignacion==="grado"),flex:1}} onClick={()=>{setNtAsignacion("grado");cargarGrados();}}><p style={S.oLbl}>🎓 Por grado completo</p><p style={S.oDesc}>Todos los del grado automáticamente</p></div>
      </div>

      {ntAsignacion==="grado"&&(
        <div style={{marginBottom:18}}>
          <p style={S.label}>Selecciona el grado</p>
          <select style={S.select} value={ntGradoSel} onChange={e=>setNtGradoSel(e.target.value)}>
            <option value="">Seleccionar grado...</option>
            {gradosDisp.map(g=><option key={g} value={g}>Grado {g}</option>)}
          </select>
          {ntGradoSel&&<p style={{color:C.ok,fontSize:12,marginTop:6}}>✅ Se asignará a todos los estudiantes del grado {ntGradoSel}</p>}
        </div>
      )}

      {ntAsignacion==="individual"&&(
        <div style={{marginBottom:18}}>
          {/* Buscador */}
          <div style={{...S.fila,marginBottom:10}}>
            <input style={{...S.input,flex:2}} placeholder="🔍 Buscar por nombre, grado o usuario..." value={busquedaEst} onChange={e=>filtrarEstudiantes(e.target.value)}/>
          </div>

          {/* Botones de selección rápida por grado */}
          {gradosDisp.length>0&&(
            <div style={{marginBottom:10}}>
              <p style={{color:C.textoS,fontSize:12,margin:"0 0 6px"}}>Seleccionar grado completo:</p>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {gradosDisp.map(g=>(
                  <button key={g} style={{...S.btnSm,color:C.azulC,borderColor:C.azul,fontSize:11}} onClick={()=>seleccionarGrado(g)}>
                    Grado {g}
                  </button>
                ))}
                <button style={{...S.btnSm,color:C.err,borderColor:C.rojo,fontSize:11}} onClick={()=>setEstSelIds([])}>Limpiar todo</button>
              </div>
            </div>
          )}

          {/* Contador */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <p style={{color:C.textoS,fontSize:12,margin:0}}>
              {cargandoEsts?"Cargando...":
               todosEstudiantes.length===0?"No hay estudiantes registrados aún":
               `${estudiantesFiltrados.length} estudiantes · ${estSelIds.length} seleccionados`}
            </p>
            {estudiantesFiltrados.length>0&&<button style={{...S.btnSm,fontSize:11}} onClick={()=>setEstSelIds(estudiantesFiltrados.map(e=>e.id))}>Seleccionar todos</button>}
          </div>

          {/* Lista con checkboxes */}
          {todosEstudiantes.length===0?(
            <div style={{background:"#0a1128",borderRadius:8,padding:20,textAlign:"center",border:`1px solid ${C.borde}`}}>
              <p style={{color:C.textoS,fontSize:13,margin:"0 0 8px"}}>No hay estudiantes registrados aún.</p>
              <p style={{color:"#374151",fontSize:12,margin:0}}>Los estudiantes deben crear su cuenta en el Portal Estudiantil primero.</p>
            </div>
          ):(
            <div style={{maxHeight:280,overflowY:"auto",background:"#0a1128",borderRadius:8,border:`1px solid ${C.borde}`,padding:8}}>
              {estudiantesFiltrados.map(e=>(
                <div key={e.id}
                  style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,marginBottom:4,
                    background:estSelIds.includes(e.id)?"#0f2a47":"transparent",
                    border:estSelIds.includes(e.id)?`1px solid ${C.azul}`:"1px solid transparent",
                    cursor:"pointer",transition:"all 0.15s"}}
                  onClick={()=>toggleEstudiante(e.id)}>
                  {/* Checkbox visual */}
                  <div style={{width:20,height:20,borderRadius:5,border:estSelIds.includes(e.id)?`2px solid ${C.azulC}`:`2px solid ${C.borde}`,background:estSelIds.includes(e.id)?C.azul:"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {estSelIds.includes(e.id)&&<span style={{color:"white",fontSize:12,fontWeight:"bold"}}>✓</span>}
                  </div>
                  <div style={{flex:1}}>
                    <p style={{color:estSelIds.includes(e.id)?C.azulC:C.texto,fontWeight:estSelIds.includes(e.id)?"bold":"normal",margin:0,fontSize:13}}>{e.nombre}</p>
                    <p style={{color:C.textoS,fontSize:11,margin:0}}>Grado {e.grado||"—"} · @{e.usuario}</p>
                  </div>
                  {e.institucion&&<span style={{color:C.textoS,fontSize:11}}>{e.institucion}</span>}
                </div>
              ))}
              {estudiantesFiltrados.length===0&&<p style={{color:C.textoS,fontSize:13,textAlign:"center",padding:16}}>No hay resultados para "{busquedaEst}"</p>}
            </div>
          )}

          {estSelIds.length>0&&(
            <div style={{marginTop:8,background:"#052e16",border:`1px solid ${C.ok}`,borderRadius:8,padding:"8px 12px"}}>
              <p style={{color:C.ok,fontSize:12,margin:0}}>✅ {estSelIds.length} estudiante{estSelIds.length!==1?"s":""} seleccionado{estSelIds.length!==1?"s":""}</p>
            </div>
          )}
        </div>
      )}

      <button style={{...S.btnVerde,opacity:creandoTarea?0.7:1}} disabled={creandoTarea} onClick={crearTarea}>
        {creandoTarea?"⏳ Creando...":"✅ Crear tarea"}
      </button>
    </div>
  ):(
    <div style={S.bloque}>
      <div style={{background:"#052e16",border:`1px solid ${C.ok}`,borderRadius:12,padding:18,marginBottom:18}}>
        <p style={{color:C.ok,fontWeight:"bold",fontSize:17,margin:"0 0 8px"}}>✅ Tarea creada exitosamente</p>
        <p style={{color:C.texto,margin:"0 0 4px"}}><strong>Título:</strong> {tareaCreada.tarea?.titulo}</p>
        <p style={{color:C.texto,margin:"0 0 4px"}}><strong>Tipo:</strong> {TIPOS_ACTIVIDAD.find(x=>x.id===tareaCreada.tarea?.tipo)?.label}</p>
        <p style={{color:C.texto,margin:"0 0 4px"}}><strong>Código:</strong> <span style={{color:C.naranja,fontSize:22,fontWeight:"bold"}}>{tareaCreada.tarea?.codigo}</span></p>
        <p style={{color:C.texto,margin:"0 0 12px"}}><strong>Link:</strong> <span style={{color:C.azulC,fontSize:12}}>https://educlass-frontend.vercel.app?codigo={tareaCreada.tarea?.codigo}</span></p>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
          <button style={{...S.btnAzul,width:"auto",padding:"9px 16px"}} onClick={()=>{navigator.clipboard.writeText(`https://educlass-frontend.vercel.app?codigo=${tareaCreada.tarea?.codigo}`);alert("Link copiado ✅");}}>🔗 Copiar link</button>
        </div>
      </div>
      <div style={S.fila}>
        <button style={S.btnVerde} onClick={()=>{setTareaCreada(null);setNtTitulo("");setNtDesc("");setNtFecha("");setNtActividad(null);setEstSelIds([]);setVista("tareas");}}>Ir a mis tareas</button>
        <button style={S.btnGris} onClick={()=>{setTareaCreada(null);setNtTitulo("");setNtDesc("");setNtFecha("");setNtActividad(null);setEstSelIds([]);}}>+ Otra tarea</button>
      </div>
    </div>
  )}</div></div>);

  // ══════════════════════════════════════════════════════
  //  VER ENTREGAS — Tabla completa con estado por estudiante
  // ══════════════════════════════════════════════════════
  if(vista==="ver_entregas"&&tareaActiva) return(<div style={S.fondo}><Header/><div style={S.contenedor}>
    <button style={{...S.btnSm,marginBottom:16}} onClick={()=>setVista("tareas")}>← Tareas</button>
    <div style={S.bloque}>
      <h2 style={S.tBloque}>📊 {tareaActiva.titulo}</h2>
      <div style={{display:"flex",gap:8,marginBottom:18,flexWrap:"wrap"}}>
        <span style={S.chip}>{TIPOS_ACTIVIDAD.find(x=>x.id===tareaActiva.tipo)?.label}</span>
        <span style={S.chip}>📚 {tareaActiva.area} · Grado {tareaActiva.grado}</span>
        <span style={{...S.chip,borderColor:C.ok,color:C.ok}}>✅ {listadoCompleto.filter(e=>e.entregada).length} entregaron</span>
        <span style={{...S.chip,borderColor:C.err,color:C.err}}>⏳ {listadoCompleto.filter(e=>!e.entregada).length} pendientes</span>
        <span style={{...S.chip,borderColor:C.naranja,color:C.naranja}}>👥 {listadoCompleto.length} total</span>
      </div>

      {/* Calificador */}
      {calEntregaId&&(<div style={{background:"#0f2a47",border:`1px solid ${C.azul}`,borderRadius:10,padding:16,marginBottom:18}}>
        <h3 style={{color:C.azulC,margin:"0 0 12px"}}>✏️ Calificar entrega</h3>
        <div style={S.fila}><div style={{flex:1}}><p style={S.label}>Calificación</p><input style={S.input} placeholder="Ej: 4.5 / Excelente / 85%" value={calNota} onChange={e=>setCalNota(e.target.value)}/></div></div>
        <div style={{marginTop:10}}><p style={S.label}>Comentario</p><textarea style={S.textarea} placeholder="Observaciones..." value={calComentario} onChange={e=>setCalComentario(e.target.value)}/></div>
        <div style={{...S.fila,marginTop:12}}><button style={{...S.btnVerde,width:"auto",padding:"9px 18px"}} onClick={calificar}>💾 Guardar</button><button style={{...S.btnGris,width:"auto"}} onClick={()=>{setCalEntregaId(null);setCalNota("");setCalComentario("");}}>Cancelar</button></div>
      </div>)}

      {/* ── TABLA COMPLETA DE ESTUDIANTES ── */}
      {listadoCompleto.length===0?(
        <p style={{color:C.textoS,textAlign:"center",padding:20}}>No hay estudiantes asignados a esta tarea.</p>
      ):(
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr style={{background:"#0a1128"}}>
                {["Estado","Estudiante","Entregado","Respuesta","Nota","Acciones"].map(h=>(
                  <th key={h} style={{padding:"10px 12px",textAlign:"left",color:C.azulC,borderBottom:`1px solid ${C.borde}`,fontWeight:"bold",whiteSpace:"nowrap"}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {listadoCompleto.map((e,i)=>(
                <tr key={e.estudianteId} style={{background:i%2===0?"#0a1128":"#0d1528",borderBottom:`1px solid ${C.borde}`}}>
                  {/* Estado */}
                  <td style={{padding:"10px 12px",whiteSpace:"nowrap"}}>
                    {e.estado==="calificado"&&<span style={{color:C.naranja,fontWeight:"bold",fontSize:11}}>⭐ Calificado</span>}
                    {e.estado==="entregado"&&<span style={{color:C.ok,fontWeight:"bold",fontSize:11}}>✅ Entregado</span>}
                    {e.estado==="pendiente"&&<span style={{color:C.err,fontWeight:"bold",fontSize:11}}>⏳ Pendiente</span>}
                  </td>
                  {/* Nombre */}
                  <td style={{padding:"10px 12px"}}>
                    <p style={{color:C.texto,margin:0,fontWeight:"bold"}}>{e.nombreEstudiante}</p>
                  </td>
                  {/* Fecha entrega */}
                  <td style={{padding:"10px 12px",color:C.textoS,fontSize:11,whiteSpace:"nowrap"}}>
                    {e.entregadoEn?new Date(e.entregadoEn).toLocaleString("es-CO",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—"}
                  </td>
                  {/* Respuesta resumida */}
                  <td style={{padding:"10px 12px",maxWidth:200}}>
                    {e.respuesta&&<p style={{color:"#CBD5E1",fontSize:11,margin:0,fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:180}}>"{e.respuesta.substring(0,60)}{e.respuesta.length>60?"...":""}"</p>}
                    {e.resultadoDetalle&&<p style={{color:C.textoS,fontSize:11,margin:"2px 0 0"}}>📊 {e.resultadoDetalle.correctas}/{e.resultadoDetalle.total} correctas ({e.resultadoDetalle.porcentaje}%)</p>}
                    {e.archivoNombre&&<p style={{color:C.azulC,fontSize:11,margin:"2px 0 0"}}>📎 {e.archivoNombre}</p>}
                    {!e.entregada&&<span style={{color:C.textoS,fontSize:11}}>Sin entregar</span>}
                  </td>
                  {/* Nota */}
                  <td style={{padding:"10px 12px",whiteSpace:"nowrap"}}>
                    {e.calificacion!=null?(
                      <span style={{color:C.naranja,fontWeight:"bold",fontSize:14}}>{e.calificacion}</span>
                    ):(
                      <span style={{color:C.textoS,fontSize:11}}>—</span>
                    )}
                    {e.comentario&&<p style={{color:C.textoS,fontSize:10,margin:"2px 0 0"}}>{e.comentario}</p>}
                  </td>
                  {/* Acciones */}
                  <td style={{padding:"10px 12px",whiteSpace:"nowrap"}}>
                    <div style={{display:"flex",gap:5}}>
                      {e.archivoNombre&&<a href={`${API}/descargar-entrega/${tareaActiva.id}/${e.estudianteId}`} style={{...S.btnSm,color:C.azulC,borderColor:C.azul,textDecoration:"none",padding:"5px 8px",borderRadius:7,fontSize:11}}>⬇️</a>}
                      {e.entregada&&<button style={{...S.btnSm,color:C.naranja,borderColor:C.naranja,fontSize:11}} onClick={()=>{setCalEntregaId(e.entregaId);setCalNota(e.calificacion||"");setCalComentario(e.comentario||"");}}>
                        {e.calificacion!=null?"✏️ Editar":"📝 Calificar"}
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  </div></div>);

  if(vista==="perfil") return(<div style={S.fondo}><Header/><div style={S.contenedor}><div style={S.bloque}><button style={{...S.btnSm,marginBottom:16}} onClick={()=>setVista("dashboard")}>← Volver</button><h2 style={S.tBloque}>⚙️ Mi perfil institucional</h2><div style={{display:"flex",gap:36,justifyContent:"center",marginBottom:22}}><SubirImagen label="🏫 Escudo" preview={logoPreview} inputRef={logoRef} onChange={e=>{const f=e.target.files[0];if(f){setLogoFile(f);setLogoPreview(URL.createObjectURL(f));}}}/><SubirImagen label="🚩 Bandera" preview={banderaPreview} inputRef={banderaRef} onChange={e=>{const f=e.target.files[0];if(f){setBanderaFile(f);setBanderaPreview(URL.createObjectURL(f));}}}/></div><div style={S.sep}/><div style={{...S.fila,marginBottom:12}}><div style={{flex:2}}><p style={S.label}>Institución</p><input style={S.input} value={institucion} onChange={e=>setInstitucion(e.target.value)}/></div><div style={{flex:1}}><p style={S.label}>Cargo</p><select style={S.select} value={usuario?.cargo||"Docente"} onChange={e=>setUsuario({...usuario,cargo:e.target.value})}>{["Docente","Coordinador/a","Rector/a","Orientador/a"].map(c=><option key={c}>{c}</option>)}</select></div></div><div style={{...S.fila,marginBottom:20}}><div style={{flex:1}}><p style={S.label}>Ciudad</p><input style={S.input} value={usuario?.ciudad||""} onChange={e=>setUsuario({...usuario,ciudad:e.target.value})}/></div><div style={{flex:1}}><p style={S.label}>Municipio</p><input style={S.input} value={usuario?.municipio||""} onChange={e=>setUsuario({...usuario,municipio:e.target.value})}/></div></div><button style={{...S.btnVerde,width:"auto",padding:"11px 24px"}} onClick={subirPerfil}>💾 Guardar perfil y logos</button></div></div></div>);

  if(vista==="historial") return(<div style={S.fondo}><Header/><div style={S.contenedor}><div style={S.bloque}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}><h2 style={S.tBloque}>📂 Mis clases guardadas</h2><button style={{...S.btnVerde,width:"auto",padding:"9px 16px"}} onClick={()=>{reset();setVista("ia");}}>+ Nueva</button></div>{misClases.length===0?<p style={{color:C.textoS,textAlign:"center",padding:28}}>Aún no tienes clases guardadas.</p>:misClases.map(c=>(<TarjetaClase key={c.id} clase={c} onVer={async(clase)=>{const r=await fetch(`${API}/clase/${clase.id}`);const d=await r.json();setClaseActiva(d.clase);setVista("verClase");}} onEliminar={eliminarClase}/>))}</div></div></div>);

  if(vista==="verClase"&&claseActiva) return(<div style={S.fondo}><Header/><div style={S.contenedor}><button style={{...S.btnSm,marginBottom:14}} onClick={()=>setVista("historial")}>← Volver</button><div style={S.resultado}><h2 style={{color:C.azulC,fontSize:19,marginBottom:4,marginTop:0,fontFamily:F_TITULO}}>{claseActiva.datos?.tema}</h2><p style={{color:C.textoS,fontSize:13,marginBottom:18}}>{claseActiva.datos?.area} · Grado {claseActiva.datos?.grado}</p><div style={S.sep}/><pre style={S.pre}>{claseActiva.contenido}</pre></div></div></div>);

  const PASOS=["Nivel","Datos","Apertura","Desarrollo","Retroalim.","Cierre","Resultado"];
  return(<div style={S.fondo}><Header/><div style={S.contenedor}>
    {paso<7&&(<div style={S.pasos}>{PASOS.map((p,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:4}}><div style={S.pasoBola(paso===i+1,paso>i+1)}>{paso>i+1?"✓":i+1}</div><span style={{color:paso===i+1?C.azulC:"#4a5a70",fontSize:11}}>{p}</span>{i<PASOS.length-1&&<span style={{color:C.borde,margin:"0 2px",fontSize:13}}>›</span>}</div>))}</div>)}
    {paso===1&&(<div style={S.bloque}><button style={{...S.btnSm,marginBottom:12}} onClick={()=>setVista("dashboard")}>← Inicio</button><h2 style={S.tBloque}>🎓 ¿Para qué nivel es la clase?</h2><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{[{id:"preescolar",label:"🌱 Preescolar",desc:"Transición · Juego libre"},{id:"primaria",label:"🏫 Primaria",desc:"Grados 1° a 5°"},{id:"bachillerato",label:"📚 Bachillerato",desc:"Grados 6° a 11°"},{id:"media_tecnica",label:"🔧 Media Técnica",desc:"Grados 10° y 11°"}].map(n=>(<div key={n.id} style={S.opcion(nivelEdu===n.id)} onClick={()=>setNivelEdu(n.id)}><p style={S.oLbl}>{n.label}</p><p style={S.oDesc}>{n.desc}</p></div>))}</div><button style={{...S.btnVerde,marginTop:18}} onClick={()=>{if(!nivelEdu){alert("Selecciona el nivel");return;}setPaso(2);}}>Continuar →</button></div>)}
    {paso===2&&(<div style={S.bloque}><button style={{...S.btnSm,marginBottom:12}} onClick={()=>setPaso(1)}>← Volver</button><h2 style={S.tBloque}>📋 Información de la clase</h2><div style={{...S.fila,marginBottom:10}}><div style={{flex:2}}><p style={S.label}>Institución</p><input style={S.input} value={institucion} onChange={e=>setInstitucion(e.target.value)}/></div></div><div style={{...S.fila,marginBottom:10}}><div style={{flex:2}}><p style={S.label}>Docente</p><input style={S.input} value={docente} onChange={e=>setDocente(e.target.value)}/></div><div style={{flex:1}}><p style={S.label}>Periodo</p><select style={S.select} value={periodo} onChange={e=>setPeriodo(e.target.value)}>{["1","2","3","4"].map(p=><option key={p}>Periodo {p}</option>)}</select></div></div><div style={{...S.fila,marginBottom:10}}><div style={{flex:1}}><p style={S.label}>Área</p><select style={S.select} value={area} onChange={e=>setArea(e.target.value)}><option value="">Seleccionar</option>{["Ciencias Naturales","Ciencias Sociales","Matemáticas","Lengua Castellana","Inglés","Educación Física","Artística","Ética y Valores","Tecnología e Informática","Filosofía","Química","Física","Biología"].map(m=><option key={m}>{m}</option>)}</select></div><div style={{flex:1}}><p style={S.label}>Grado</p><select style={S.select} value={grado} onChange={e=>setGrado(e.target.value)}><option value="">Seleccionar</option>{(nivelEdu==="preescolar"?["Transición"]:nivelEdu==="primaria"?["1°","2°","3°","4°","5°"]:nivelEdu==="media_tecnica"?["10°","11°"]:["6°","7°","8°","9°","10°","11°"]).map(g=><option key={g}>{g}</option>)}</select></div></div><div style={{...S.fila,marginBottom:10}}><div style={{flex:2}}><p style={S.label}>Tema</p><input style={S.input} placeholder="Ej: El verbo to be" value={tema} onChange={e=>setTema(e.target.value)}/></div><div style={{flex:1}}><p style={S.label}>Duración</p><select style={S.select} value={duracion} onChange={e=>setDuracion(e.target.value)}>{OPT_DURACION.map(d=><option key={d.val} value={d.val}>{d.label}</option>)}</select></div></div><div style={{marginBottom:18}}><p style={S.label}>Fecha</p><input type="date" style={{...S.input,width:"auto"}} value={fecha} onChange={e=>setFecha(e.target.value)}/></div><button style={S.btnVerde} onClick={()=>{if(!area||!grado||!tema){alert("Completa área, grado y tema");return;}setPaso(3);}}>Continuar →</button></div>)}
    {paso===3&&(<div style={S.bloque}><button style={{...S.btnSm,marginBottom:12}} onClick={()=>setPaso(2)}>← Volver</button><h2 style={S.tBloque}>🚀 ¿Cómo iniciar la clase?</h2><Opciones lista={optApertura} val={apertura} set={setApertura}/><button style={{...S.btnVerde,marginTop:18}} onClick={()=>{if(!apertura){alert("Selecciona apertura");return;}setPaso(4);}}>Continuar →</button></div>)}
    {paso===4&&(<div style={S.bloque}><button style={{...S.btnSm,marginBottom:12}} onClick={()=>setPaso(3)}>← Volver</button><h2 style={S.tBloque}>⚙️ ¿Cómo desarrollar el contenido?</h2><Opciones lista={optDesarrollo} val={desarrollo} set={setDesarrollo}/><button style={{...S.btnVerde,marginTop:18}} onClick={()=>{if(!desarrollo){alert("Selecciona estrategia");return;}setPaso(5);}}>Continuar →</button></div>)}
    {paso===5&&(<div style={S.bloque}><button style={{...S.btnSm,marginBottom:12}} onClick={()=>setPaso(4)}>← Volver</button><h2 style={S.tBloque}>🔄 ¿Cómo verificar el aprendizaje?</h2><Opciones lista={optRetro} val={retro} set={setRetro}/><button style={{...S.btnVerde,marginTop:18}} onClick={()=>{if(!retro){alert("Selecciona estrategia");return;}setPaso(6);}}>Continuar →</button></div>)}
    {paso===6&&(<div style={S.bloque}><button style={{...S.btnSm,marginBottom:12}} onClick={()=>setPaso(5)}>← Volver</button><h2 style={S.tBloque}>🏁 Cierre y tarea</h2><p style={{color:C.texto,fontWeight:"bold",marginBottom:10,fontFamily:F_TITULO}}>Estrategia de cierre</p><Opciones lista={OPT_CIERRE} val={cierre} set={setCierre}/><div style={S.sep}/><p style={{color:C.texto,fontWeight:"bold",marginBottom:10,fontFamily:F_TITULO}}>¿Dejar tarea?</p><div style={{...S.fila,marginBottom:14}}><div style={{...S.opcion(dejaTarea===true),flex:1}} onClick={()=>setDejaTarea(true)}><p style={S.oLbl}>✅ Sí</p></div><div style={{...S.opcion(dejaTarea===false),flex:1}} onClick={()=>{setDejaTarea(false);setTarea("");}}><p style={S.oLbl}>❌ No</p></div></div>{dejaTarea===true&&<Opciones lista={OPT_TAREA} val={tarea} set={setTarea}/>}<button style={{...S.btnVerde,marginTop:18,opacity:cargando?0.7:1}} disabled={cargando} onClick={()=>{if(!cierre){alert("Selecciona cierre");return;}if(dejaTarea===null){alert("Indica si hay tarea");return;}if(dejaTarea&&!tarea){alert("Selecciona estrategia de tarea");return;}generarGuia();}}>{cargando?"⏳ Generando guía...":"✨ Generar guía completa"}</button></div>)}
    {paso===7&&(<div>{!cargando&&contenido&&!contenido.startsWith("❌")&&(<><div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}}><span style={S.chip}>📚 {area}</span><span style={S.chip}>🎓 {grado}</span><span style={S.chip}>⏱️ {OPT_DURACION.find(d=>d.val===duracion)?.label}</span><span style={S.chip}>{nivelEdu==="bachillerato"?"📗 Bach":nivelEdu==="preescolar"?"🌱 Preescolar":nivelEdu==="media_tecnica"?"🔧 Media":"📘 Primaria"}</span></div><div style={{...S.fila,marginBottom:18,flexWrap:"wrap",gap:7}}><button style={{...S.btnAzul,width:"auto",padding:"10px 16px"}} onClick={()=>exportar("word")} disabled={descargando}>{descargando?"⏳...":"📥 Word"}</button><button style={{...S.btnNaranja,width:"auto",padding:"10px 16px"}} onClick={()=>exportar("pdf")} disabled={descPdf}>{descPdf?"⏳...":"📄 PDF"}</button>{!guardadoOk?<button style={{...S.btnVerde,width:"auto",padding:"10px 16px",opacity:guardando?0.7:1}} onClick={guardarClase} disabled={guardando}>{guardando?"💾...":"💾 Guardar"}</button>:<span style={{...S.chip,background:"#052e16",borderColor:C.ok,color:C.ok,padding:"10px 14px"}}>✅ Guardada</span>}<button style={{...S.btnGris,width:"auto"}} onClick={()=>setVista("dashboard")}>🏠</button><button style={{...S.btnGris,width:"auto"}} onClick={reset}>+ Nueva</button></div></>)}{cargando&&(<div style={{...S.resultado,textAlign:"center",padding:52}}><p style={{fontSize:40,margin:"0 0 12px"}}>✨</p><p style={{color:C.azulC,fontSize:17,fontFamily:F_TITULO}}>Generando tu guía...</p></div>)}{!cargando&&contenido&&(<div style={S.resultado}><h2 style={{color:C.azulC,fontSize:18,marginBottom:4,marginTop:0,fontFamily:F_TITULO}}>📄 {tema}</h2><p style={{color:C.textoS,fontSize:12,marginBottom:18}}>{area} · {grado} · {OPT_DURACION.find(d=>d.val===duracion)?.label}</p><div style={S.sep}/><pre style={S.pre}>{contenido}</pre></div>)}</div>)}
  </div></div>);
}