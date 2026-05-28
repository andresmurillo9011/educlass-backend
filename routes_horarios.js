// ======================================================
//  RUTAS DE HORARIOS — Pegar antes de "INICIAR SERVIDOR"
//  Adaptado al sistema de db.json local del server.js
// ======================================================

// GET: obtener horario de un docente
app.get("/horario-docente/:userId", (req, res) => {
  try {
    const db = leerDB();
    if (!db.horarios) db.horarios = {};
    const horario = db.horarios[req.params.userId] || {};
    res.json({ ok: true, horario, userId: req.params.userId });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// PUT: guardar horario de un docente (solo admin)
app.put("/horario-docente/:userId", (req, res) => {
  try {
    const { horario } = req.body;
    if (!horario || typeof horario !== "object")
      return res.status(400).json({ mensaje: "Horario inválido" });
    const db = leerDB();
    if (!db.horarios) db.horarios = {};
    db.horarios[req.params.userId] = horario;
    guardarDB(db);
    res.json({ ok: true, mensaje: "Horario guardado ✅" });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// GET: listar todos los docentes con sus horarios (para el panel admin)
app.get("/todos-docentes-horarios", (req, res) => {
  try {
    const db = leerDB();
    if (!db.horarios) db.horarios = {};
    const docentes = (db.usuarios || []).map(u => {
      const { password: _, ...pub } = u;
      return { ...pub, horario: db.horarios[u.id] || {} };
    });
    res.json({ ok: true, docentes });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});
