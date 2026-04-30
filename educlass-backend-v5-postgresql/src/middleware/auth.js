// src/middleware/auth.js
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || "educlass_secret_2024";

// ── Generar token JWT ─────────────────────────────────
const generarToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
};

// ── Middleware: verificar token docente ───────────────
const authDocente = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer "))
      return res.status(401).json({ mensaje: "Token requerido" });

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { institution: true }
    });

    if (!user) return res.status(401).json({ mensaje: "Usuario no encontrado" });

    req.user = user;
    req.institutionId = user.institutionId;
    next();
  } catch (e) {
    return res.status(401).json({ mensaje: "Token inválido o expirado" });
  }
};

// ── Middleware: verificar token estudiante ────────────
const authEstudiante = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer "))
      return res.status(401).json({ mensaje: "Token requerido" });

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "STUDENT")
      return res.status(403).json({ mensaje: "Acceso denegado" });

    const student = await prisma.student.findUnique({
      where: { id: decoded.id },
      include: { institution: true }
    });

    if (!student) return res.status(401).json({ mensaje: "Estudiante no encontrado" });

    req.student = student;
    req.institutionId = student.institutionId;
    next();
  } catch (e) {
    return res.status(401).json({ mensaje: "Token inválido o expirado" });
  }
};

// ── Helper: normalizar nombre institución → slug ──────
const slugify = (text) => {
  return (text || "sin-institucion")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .trim();
};

module.exports = { generarToken, authDocente, authEstudiante, slugify };
