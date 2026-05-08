// patch-backend.js — VERSIÓN CORREGIDA
// Ejecutar desde la carpeta educlass-backend:
//   node patch-backend.js

const fs   = require("fs");
const path = require("path");

const indexPath = path.join(__dirname, "src", "index.js");

if (!fs.existsSync(indexPath)) {
  console.error("❌ No se encontró src/index.js");
  console.error("   Asegúrate de ejecutar desde la carpeta educlass-backend/");
  process.exit(1);
}

let code = fs.readFileSync(indexPath, "utf8");
const original = code;

// ── Patch 1: guardar-clase — data como JSON string ──────
code = code.replace(
  /data:\s*req\.body\.datos/g,
  "data: JSON.stringify(req.body.datos || {})"
);

// ── Patch 2: mis-clases — parsear data al leer ──────────
code = code.replace(
  /datos:\s*c\.data,/g,
  "datos: (function(){ try{ return JSON.parse(c.data||'{}'); }catch(e){ return {}; } })(),"
);

// ── Patch 3: clase individual — parsear data ────────────
code = code.replace(
  /datos:\s*clase\.data,/g,
  "datos: (function(){ try{ return JSON.parse(clase.data||'{}'); }catch(e){ return {}; } })(),"
);

// ── Patch 4: tasks — guardar activity como string ───────
code = code.replace(
  /activity:\s*actividad\s*\|\|\s*null/g,
  "activity: actividad ? JSON.stringify(actividad) : null"
);

// ── Patch 5: tareas al leer — parsear activity ──────────
code = code.replace(
  /actividad:\s*t\.activity,/g,
  "actividad: (function(){ try{ return JSON.parse(t.activity||'null'); }catch(e){ return null; } })(),"
);

// ── Patch 6: responses al guardar ───────────────────────
code = code.replace(
  /responses:\s*respAct,/g,
  "responses: JSON.stringify(respAct || {}),"
);

// ── Patch 7: responses al leer ──────────────────────────
code = code.replace(
  /respuestas:\s*a\.responses,/g,
  "respuestas: (function(){ try{ return JSON.parse(a.responses||'{}'); }catch(e){ return {}; } })(),"
);

// ── Verificar si hubo cambios ────────────────────────────
if (code === original) {
  console.log("ℹ️  No se encontraron patrones para parchear.");
  console.log("   Puede que el backend ya esté actualizado o use una estructura diferente.");
  console.log("   Continuando de todas formas...");
} else {
  fs.writeFileSync(indexPath, code);
  console.log("✅ Parche aplicado correctamente.");
}

console.log("\nSiguientes pasos:");
console.log("  npx prisma db push");
console.log("  npm start");
