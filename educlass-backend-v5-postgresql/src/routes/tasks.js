// src/routes/tasks.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authDocente, authEstudiante } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient();

// ======================================================
//  CREAR TAREA Y ASIGNAR A ESTUDIANTES
//  POST /tasks
// ======================================================
router.post("/", authDocente, async (req, res) => {
  try {
    const {
      titulo, descripcion, tipo, actividad,
      area, grado, fechaEntrega,
      estudiantesIds,  // array de IDs seleccionados
      asignarGrado     // opcional: asignar a todo el grado
    } = req.body;

    if (!titulo) return res.status(400).json({ mensaje: "El título es requerido" });

    // Determinar qué estudiantes asignar
    let idsFinales = estudiantesIds || [];

    if (asignarGrado && asignarGrado !== "manual") {
      // Asignar a todo el grado de la institución
      const estGrado = await prisma.student.findMany({
        where: {
          institutionId: req.institutionId, // ← SOLO MI INSTITUCIÓN
          grade: { in: [asignarGrado, asignarGrado.replace("°",""), asignarGrado + "°"] }
        },
        select: { id: true }
      });
      const idsGrado = estGrado.map(e => e.id);
      // Combinar sin duplicados
      idsFinales = [...new Set([...idsFinales, ...idsGrado])];
    }

    // Crear tarea
    const tarea = await prisma.task.create({
      data: {
        title: titulo,
        description: descripcion || "",
        type: tipo?.toUpperCase() || "TALLER",
        area: area || "",
        grade: grado || asignarGrado || "",
        dueDate: fechaEntrega ? new Date(fechaEntrega) : null,
        activity: actividad || null,
        userId: req.user.id,
        institutionId: req.institutionId,
        // Crear asignaciones para cada estudiante
        assignments: {
          create: idsFinales.map(studentId => ({ studentId, status: "PENDING" }))
        }
      },
      include: {
        assignments: {
          include: { student: { select: { id: true, name: true, grade: true } } }
        }
      }
    });

    res.json({ ok: true, tarea, mensaje: "Tarea creada ✅" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: e.message });
  }
});

// ======================================================
//  MIS TAREAS (DOCENTE)
//  GET /tasks/mis-tareas
// ======================================================
router.get("/mis-tareas", authDocente, async (req, res) => {
  try {
    const tareas = await prisma.task.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { assignments: true }
        },
        assignments: {
          select: { status: true }
        }
      }
    });

    const resultado = tareas.map(t => ({
      ...t,
      totalEstudiantes: t._count.assignments,
      totalEntregas:    t.assignments.filter(a => a.status !== "PENDING").length,
      pendientes:       t.assignments.filter(a => a.status === "PENDING").length,
      calificados:      t.assignments.filter(a => a.status === "GRADED").length,
      assignments: undefined,
      _count: undefined
    }));

    res.json({ tareas: resultado });
  } catch (e) {
    res.status(500).json({ mensaje: e.message });
  }
});

// ======================================================
//  ENTREGAS DE UNA TAREA (DOCENTE)
//  GET /tasks/:id/entregas
// ======================================================
router.get("/:id/entregas", authDocente, async (req, res) => {
  try {
    const tarea = await prisma.task.findFirst({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!tarea) return res.status(404).json({ mensaje: "Tarea no encontrada" });

    const assignments = await prisma.assignment.findMany({
      where: { taskId: req.params.id },
      include: {
        student: { select: { id: true, name: true, grade: true, username: true } }
      },
      orderBy: { student: { name: "asc" } }
    });

    const listado = assignments.map(a => ({
      estudianteId:     a.studentId,
      nombreEstudiante: a.student.name,
      grado:            a.student.grade,
      entregada:        a.status !== "PENDING",
      entregaId:        a.id,
      entregadoEn:      a.submittedAt,
      calificacion:     a.grade,
      comentario:       a.comment,
      resumenRespuesta: a.response?.substring(0, 120) || "",
      tieneArchivo:     !!a.fileName,
      archivoNombre:    a.fileName,
      autoCalificada:   a.autoGraded,
      porcentajeAuto:   a.detail?.porcentaje || null,
      estado:           a.status === "GRADED" ? "calificado" :
                        a.status === "SUBMITTED" ? "entregado" : "pendiente"
    }));

    res.json({
      listadoCompleto:  listado,
      total:            listado.length,
      totalEntregas:    listado.filter(e => e.entregada).length,
      totalPendientes:  listado.filter(e => !e.entregada).length,
      totalCalificados: listado.filter(e => e.calificacion != null).length
    });
  } catch (e) {
    res.status(500).json({ mensaje: e.message });
  }
});

// ======================================================
//  CALIFICAR ENTREGA (DOCENTE)
//  POST /tasks/calificar
// ======================================================
router.post("/calificar", authDocente, async (req, res) => {
  try {
    const { entregaId, calificacion, comentario } = req.body;

    const assignment = await prisma.assignment.update({
      where: { id: entregaId },
      data: {
        grade:    parseFloat(calificacion),
        comment:  comentario || "",
        status:   "GRADED",
        gradedAt: new Date()
      }
    });

    res.json({ ok: true, entrega: assignment });
  } catch (e) {
    res.status(500).json({ mensaje: e.message });
  }
});

// ======================================================
//  MIS TAREAS (ESTUDIANTE) — sin código, solo con JWT
//  GET /tasks/mis-tareas-estudiante
// ======================================================
router.get("/mis-tareas-estudiante", authEstudiante, async (req, res) => {
  try {
    const assignments = await prisma.assignment.findMany({
      where: { studentId: req.student.id },
      include: {
        task: {
          select: {
            id: true, title: true, description: true, type: true,
            area: true, grade: true, dueDate: true, code: true, activity: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const ahora = new Date();
    const tareas = assignments.map(a => ({
      id:           a.task.id,
      titulo:       a.task.title,
      descripcion:  a.task.description,
      tipo:         a.task.type.toLowerCase(),
      area:         a.task.area,
      grado:        a.task.grade,
      fechaEntrega: a.task.dueDate,
      actividad:    a.task.activity,
      entregada:    a.status !== "PENDING",
      vencida:      a.task.dueDate && new Date(a.task.dueDate) < ahora && a.status === "PENDING",
      calificacion: a.grade,
      comentario:   a.comment || "",
      entregaId:    a.id
    }));

    res.json({ tareas });
  } catch (e) {
    res.status(500).json({ mensaje: e.message });
  }
});

// ======================================================
//  ENTREGAR TAREA (ESTUDIANTE)
//  POST /tasks/entregar
// ======================================================
router.post("/entregar", authEstudiante, async (req, res) => {
  try {
    const { tareaId, respuesta, respuestasActividad } = req.body;

    // Verificar que tiene asignación
    const assignment = await prisma.assignment.findFirst({
      where: { taskId: tareaId, studentId: req.student.id },
      include: { task: true }
    });

    if (!assignment) return res.status(404).json({ mensaje: "No tienes esta tarea asignada" });
    if (assignment.status !== "PENDING" && assignment.status !== "SUBMITTED")
      return res.status(400).json({ mensaje: "Esta tarea ya fue entregada" });

    // Verificar fecha
    if (assignment.task.dueDate && new Date(assignment.task.dueDate) < new Date())
      return res.status(400).json({ mensaje: "⏰ La fecha de entrega ya venció" });

    // Auto-calificación para quiz, completar, verdadero_falso
    let grade = null, autoGraded = false, detail = null;
    const respAct = respuestasActividad || {};
    const tipo = assignment.task.type;

    if (["QUIZ","COMPLETAR","VERDADERO_FALSO"].includes(tipo) &&
        assignment.task.activity?.preguntas) {
      const preguntas = assignment.task.activity.preguntas;
      let correctas = 0, total = 0;
      const detalles = [];
      preguntas.forEach((p, i) => {
        const corrRef = (p.correcta || p.respuesta || "").toString().trim().toLowerCase();
        if (!corrRef) return;
        total++;
        const respEst = (respAct[i] || "").toString().trim().toLowerCase();
        const ok = respEst === corrRef || (tipo === "COMPLETAR" && respEst.includes(corrRef));
        if (ok) correctas++;
        detalles.push({ pregunta: p.pregunta||p.enunciado||p.afirmacion,
          respEst: respAct[i]||"", respCorrecta: p.correcta||p.respuesta, esCorrecta: ok });
      });
      if (total > 0) {
        grade = parseFloat((correctas / total * 5).toFixed(1));
        autoGraded = true;
        detail = { correctas, total, porcentaje: Math.round(correctas/total*100), detalles };
      }
    }

    const updated = await prisma.assignment.update({
      where: { id: assignment.id },
      data: {
        response:    respuesta || "",
        responses:   respAct,
        status:      "SUBMITTED",
        submittedAt: new Date(),
        grade:       grade,
        autoGraded:  autoGraded,
        detail:      detail,
        ...(autoGraded ? { status: "GRADED", gradedAt: new Date() } : {})
      }
    });

    res.json({ ok: true, mensaje: "Tarea entregada ✅",
      autoCalificada: autoGraded, notaAuto: grade, resultadoDetalle: detail });
  } catch (e) {
    res.status(500).json({ mensaje: e.message });
  }
});

// ======================================================
//  ELIMINAR TAREA (DOCENTE)
//  DELETE /tasks/:id
// ======================================================
router.delete("/:id", authDocente, async (req, res) => {
  try {
    await prisma.task.delete({
      where: { id: req.params.id, userId: req.user.id }
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ mensaje: e.message });
  }
});

module.exports = router;
