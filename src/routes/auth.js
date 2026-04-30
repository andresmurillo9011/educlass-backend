// src/routes/auth.js
const express = require("express");
const bcrypt  = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const { generarToken, slugify } = require("../middleware/auth");

const router = express.Router();
const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

// ======================================================
//  REGISTRO DOCENTE
//  POST /auth/registro
// ======================================================
router.post("/registro", async (req, res) => {
  try {
    const { nombre, email, password, institucion, cargo, ciudad } = req.body;

    if (!nombre || !email || !password || !institucion)
      return res.status(400).json({ mensaje: "Completa nombre, correo, contraseña e institución" });

    // Verificar si el email ya existe
    const existe = await prisma.user.findUnique({ where: { email } });
    if (existe)
      return res.status(400).json({ mensaje: "Este correo ya está registrado" });

    // Buscar o crear institución automáticamente
    const slug = slugify(institucion);
    let inst = await prisma.institution.findUnique({ where: { slug } });
    if (!inst) {
      inst = await prisma.institution.create({
        data: { name: institucion, slug, city: ciudad || "" }
      });
    }

    // Crear docente
    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        name: nombre, email, password: hash,
        role: "TEACHER",
        cargo: cargo || "Docente",
        institutionId: inst.id
      },
      include: { institution: true }
    });

    const { password: _, ...pub } = user;
    const token = generarToken({ id: user.id, role: "TEACHER", institutionId: inst.id });

    res.json({ mensaje: "Registro exitoso ✅", usuario: pub, token });
  } catch (e) {
    console.error(e);
    res.status(500).json({ mensaje: "Error en el servidor: " + e.message });
  }
});

// ======================================================
//  LOGIN DOCENTE
//  POST /auth/login
// ======================================================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ mensaje: "Ingresa tu correo" });

    const user = await prisma.user.findUnique({
      where: { email },
      include: { institution: true }
    });

    if (!user) return res.status(401).json({ mensaje: "Correo no registrado" });
    if (!await bcrypt.compare(password || "", user.password))
      return res.status(401).json({ mensaje: "Contraseña incorrecta" });

    const { password: _, ...pub } = user;
    const token = generarToken({ id: user.id, role: user.role, institutionId: user.institutionId });

    res.json({ usuario: pub, token });
  } catch (e) {
    res.status(500).json({ mensaje: "Error: " + e.message });
  }
});

// ======================================================
//  REGISTRO ESTUDIANTE
//  POST /auth/registro-estudiante
// ======================================================
router.post("/registro-estudiante", async (req, res) => {
  try {
    const { nombre, usuario, password, grado, institucion } = req.body;

    if (!nombre || !usuario || !password || !institucion)
      return res.status(400).json({ mensaje: "Completa todos los campos incluyendo institución" });

    // Verificar usuario único
    const existe = await prisma.student.findUnique({ where: { username: usuario } });
    if (existe) return res.status(400).json({ mensaje: "Ese usuario ya existe" });

    // Buscar o crear institución
    const slug = slugify(institucion);
    let inst = await prisma.institution.findUnique({ where: { slug } });
    if (!inst) {
      inst = await prisma.institution.create({
        data: { name: institucion, slug }
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const student = await prisma.student.create({
      data: {
        name: nombre, username: usuario, password: hash,
        grade: grado || "",
        institutionId: inst.id
      },
      include: { institution: true }
    });

    const { password: _, ...pub } = student;
    const token = generarToken({ id: student.id, role: "STUDENT", institutionId: inst.id });

    res.json({ mensaje: "Cuenta creada ✅", estudiante: pub, token });
  } catch (e) {
    res.status(500).json({ mensaje: "Error: " + e.message });
  }
});

// ======================================================
//  LOGIN ESTUDIANTE
//  POST /auth/login-estudiante
// ======================================================
router.post("/login-estudiante", async (req, res) => {
  try {
    const { usuario, password } = req.body;
    if (!usuario || !password)
      return res.status(400).json({ mensaje: "Completa usuario y contraseña" });

    const student = await prisma.student.findUnique({
      where: { username: usuario },
      include: { institution: true }
    });

    if (!student) return res.status(401).json({ mensaje: "Usuario no encontrado" });
    if (!await bcrypt.compare(password, student.password))
      return res.status(401).json({ mensaje: "Contraseña incorrecta" });

    const { password: _, ...pub } = student;
    const token = generarToken({ id: student.id, role: "STUDENT", institutionId: student.institutionId });

    res.json({ ok: true, estudiante: pub, token });
  } catch (e) {
    res.status(500).json({ mensaje: "Error: " + e.message });
  }
});

module.exports = router;
