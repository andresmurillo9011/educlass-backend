// src/routes/students.js
const express = require("express");
const { PrismaClient } = require("@prisma/client");
const { authDocente } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

// ======================================================
//  OBTENER TODOS LOS ESTUDIANTES DE MI INSTITUCIÓN
//  GET /students
//  Solo ve los de su misma institución — multi-tenant
// ======================================================
router.get("/", authDocente, async (req, res) => {
  try {
    const students = await prisma.student.findMany({
      where: { institutionId: req.institutionId }, // ← FILTRO MULTI-TENANT
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, username: true,
        grade: true, createdAt: true,
        institution: { select: { name: true } }
      }
    });
    res.json({ estudiantes: students });
  } catch (e) {
    res.status(500).json({ mensaje: e.message });
  }
});

// ======================================================
//  OBTENER ESTUDIANTES POR GRADO
//  GET /students/grado/:grado
// ======================================================
router.get("/grado/:grado", authDocente, async (req, res) => {
  try {
    const grado = req.params.grado;
    const students = await prisma.student.findMany({
      where: {
        institutionId: req.institutionId, // ← FILTRO MULTI-TENANT
        grade: { in: [grado, grado.replace("°",""), grado + "°"] }
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, username: true, grade: true }
    });
    res.json({ estudiantes: students });
  } catch (e) {
    res.status(500).json({ mensaje: e.message });
  }
});

// ======================================================
//  OBTENER GRADOS DISPONIBLES EN MI INSTITUCIÓN
//  GET /students/grados
// ======================================================
router.get("/grados", authDocente, async (req, res) => {
  try {
    const result = await prisma.student.findMany({
      where: { institutionId: req.institutionId },
      select: { grade: true },
      distinct: ["grade"]
    });
    const grados = result.map(r => r.grade).filter(Boolean).sort();
    res.json({ grados });
  } catch (e) {
    res.status(500).json({ mensaje: e.message });
  }
});

module.exports = router;
