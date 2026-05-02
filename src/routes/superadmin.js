// src/routes/superadmin.js
// ======================================================
//  Super Admin — CRUD completo de estudiantes y docentes
// ======================================================
const express = require("express");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const jwt = require("jsonwebtoken");

const router = express.Router();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "educlass_secret";

// ── Middleware super admin ────────────────────────────
const authSuperAdmin = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ mensaje: "Token requerido" });
  try {
    const decoded = jwt.verify(header.split(" ")[1], JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { institution: true }
    });
    if (!user) return res.status(401).json({ mensaje: "Usuario no encontrado" });
    if (!user.isSuperAdmin)
      return res.status(403).json({ mensaje: "Acceso denegado. Se requiere Super Admin." });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ mensaje: "Token inválido" });
  }
};

// ======================================================
//  INSTITUCIONES
// ======================================================

// GET /superadmin/institutions
router.get("/institutions", authSuperAdmin, async (req, res) => {
  try {
    const institutions = await prisma.institution.findMany({
      include: {
        _count: { select: { users: true, students: true } }
      },
      orderBy: { name: "asc" }
    });
    res.json({ instituciones: institutions.map(i => ({
      id: i.id, name: i.name, slug: i.slug, city: i.city,
      totalDocentes: i._count.users,
      totalEstudiantes: i._count.students
    }))});
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// ======================================================
//  DOCENTES
// ======================================================

// GET /superadmin/teachers?institutionId=xxx
router.get("/teachers", authSuperAdmin, async (req, res) => {
  try {
    const { institutionId } = req.query;
    const where = institutionId ? { institutionId } : {};
    const teachers = await prisma.user.findMany({
      where,
      include: {
        institution: { select: { name: true } },
        _count: { select: { tasks: true } }
      },
      orderBy: { name: "asc" }
    });
    res.json({ docentes: teachers.map(t => {
      const { password: _, ...pub } = t;
      return { ...pub, institucion: t.institution?.name, totalTareas: t._count.tasks };
    })});
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// ======================================================
//  ESTUDIANTES — CRUD COMPLETO
// ======================================================

// GET /superadmin/students?institutionId=&grade=&teacherId=
router.get("/students", authSuperAdmin, async (req, res) => {
  try {
    const { institutionId, grade, teacherId, search } = req.query;
    const where = {};
    if (institutionId) where.institutionId = institutionId;
    if (grade) where.grade = { in: [grade, grade.replace("°",""), grade+"°"] };
    if (search) where.name = { contains: search, mode: "insensitive" };

    const students = await prisma.student.findMany({
      where,
      include: {
        institution: { select: { name: true } },
        studentTeachers: {
          include: { teacher: { select: { id: true, name: true, cargo: true } } }
        }
      },
      orderBy: [{ grade: "asc" }, { name: "asc" }]
    });

    // Filtrar por docente si se especifica
    let result = students;
    if (teacherId) {
      result = students.filter(s =>
        s.studentTeachers.some(st => st.teacherId === teacherId)
      );
    }

    res.json({ estudiantes: result.map(s => ({
      id: s.id, name: s.name, username: s.username,
      grade: s.grade, institucion: s.institution?.name,
      institutionId: s.institutionId,
      docentes: s.studentTeachers.map(st => ({
        id: st.teacher.id, name: st.teacher.name, cargo: st.teacher.cargo
      }))
    }))});
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// POST /superadmin/students — Crear estudiante
router.post("/students", authSuperAdmin, async (req, res) => {
  try {
    const { nombre, usuario, password, grado, institutionId, teacherIds } = req.body;
    if (!nombre || !usuario || !password || !institutionId)
      return res.status(400).json({ mensaje: "Nombre, usuario, contraseña e institución son requeridos" });

    // Verificar usuario único
    const existe = await prisma.student.findUnique({ where: { username: usuario } });
    if (existe) return res.status(400).json({ mensaje: "Ese usuario ya existe" });

    // Verificar institución
    const inst = await prisma.institution.findUnique({ where: { id: institutionId } });
    if (!inst) return res.status(404).json({ mensaje: "Institución no encontrada" });

    const hash = await bcrypt.hash(password, 10);
    const student = await prisma.student.create({
      data: {
        name: nombre, username: usuario, password: hash,
        grade: grado || "", institutionId,
        // Asignar docentes si se proporcionan
        ...(teacherIds?.length ? {
          studentTeachers: { create: teacherIds.map(tid => ({ teacherId: tid })) }
        } : {})
      },
      include: {
        institution: { select: { name: true } },
        studentTeachers: { include: { teacher: { select: { id: true, name: true } } } }
      }
    });

    const { password: _, ...pub } = student;
    res.json({ ok: true, estudiante: { ...pub, institucion: student.institution?.name }, mensaje: "Estudiante creado ✅" });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// PUT /superadmin/students/:id — Editar estudiante
router.put("/students/:id", authSuperAdmin, async (req, res) => {
  try {
    const { nombre, usuario, password, grado, institutionId } = req.body;
    const data = {};
    if (nombre) data.name = nombre;
    if (usuario) {
      const existe = await prisma.student.findFirst({
        where: { username: usuario, NOT: { id: req.params.id } }
      });
      if (existe) return res.status(400).json({ mensaje: "Ese usuario ya está en uso" });
      data.username = usuario;
    }
    if (password) data.password = await bcrypt.hash(password, 10);
    if (grado) data.grade = grado;
    if (institutionId) data.institutionId = institutionId;

    const student = await prisma.student.update({
      where: { id: req.params.id },
      data,
      include: {
        institution: { select: { name: true } },
        studentTeachers: { include: { teacher: { select: { id: true, name: true } } } }
      }
    });
    const { password: _, ...pub } = student;
    res.json({ ok: true, estudiante: { ...pub, institucion: student.institution?.name }, mensaje: "Estudiante actualizado ✅" });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// DELETE /superadmin/students/:id
router.delete("/students/:id", authSuperAdmin, async (req, res) => {
  try {
    await prisma.student.delete({ where: { id: req.params.id } });
    res.json({ ok: true, mensaje: "Estudiante eliminado ✅" });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// ======================================================
//  ASIGNACIONES ESTUDIANTE-DOCENTE
// ======================================================

// POST /superadmin/assign/teacher — Asignar docente(s) a estudiante
router.post("/assign/teacher", authSuperAdmin, async (req, res) => {
  try {
    const { studentId, teacherIds } = req.body;
    if (!studentId || !teacherIds?.length)
      return res.status(400).json({ mensaje: "studentId y teacherIds son requeridos" });

    // Crear asignaciones (ignorar duplicados)
    const results = await Promise.allSettled(
      teacherIds.map(tid =>
        prisma.studentTeacher.upsert({
          where: { studentId_teacherId: { studentId, teacherId: tid } },
          create: { studentId, teacherId: tid },
          update: {}
        })
      )
    );

    const exitosos = results.filter(r => r.status === "fulfilled").length;
    res.json({ ok: true, mensaje: `${exitosos} docente(s) asignado(s) ✅` });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// DELETE /superadmin/assign/teacher — Remover docente de estudiante
router.delete("/assign/teacher", authSuperAdmin, async (req, res) => {
  try {
    const { studentId, teacherId } = req.body;
    await prisma.studentTeacher.delete({
      where: { studentId_teacherId: { studentId, teacherId } }
    });
    res.json({ ok: true, mensaje: "Docente removido ✅" });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// POST /superadmin/assign/grade — Cambiar grado a estudiante(s)
router.post("/assign/grade", authSuperAdmin, async (req, res) => {
  try {
    const { studentIds, grade } = req.body;
    if (!studentIds?.length || !grade)
      return res.status(400).json({ mensaje: "studentIds y grade son requeridos" });

    await prisma.student.updateMany({
      where: { id: { in: studentIds } },
      data: { grade }
    });
    res.json({ ok: true, mensaje: `${studentIds.length} estudiante(s) movidos a grado ${grade} ✅` });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// POST /superadmin/assign/teacher-batch — Asignar docente a todos los de un grado
router.post("/assign/teacher-batch", authSuperAdmin, async (req, res) => {
  try {
    const { teacherId, institutionId, grade } = req.body;
    if (!teacherId || !institutionId || !grade)
      return res.status(400).json({ mensaje: "teacherId, institutionId y grade son requeridos" });

    // Obtener estudiantes del grado
    const students = await prisma.student.findMany({
      where: {
        institutionId,
        grade: { in: [grade, grade.replace("°",""), grade+"°"] }
      },
      select: { id: true }
    });

    const results = await Promise.allSettled(
      students.map(s =>
        prisma.studentTeacher.upsert({
          where: { studentId_teacherId: { studentId: s.id, teacherId } },
          create: { studentId: s.id, teacherId },
          update: {}
        })
      )
    );

    const exitosos = results.filter(r => r.status === "fulfilled").length;
    res.json({ ok: true, mensaje: `Docente asignado a ${exitosos} estudiantes de ${grade} ✅` });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

// GET /superadmin/stats — Estadísticas generales
router.get("/stats", authSuperAdmin, async (req, res) => {
  try {
    const [instituciones, docentes, estudiantes, tareas] = await Promise.all([
      prisma.institution.count(),
      prisma.user.count(),
      prisma.student.count(),
      prisma.task.count()
    ]);
    res.json({ instituciones, docentes, estudiantes, tareas });
  } catch(e) { res.status(500).json({ mensaje: e.message }); }
});

module.exports = router;
module.exports.authSuperAdmin = authSuperAdmin;
