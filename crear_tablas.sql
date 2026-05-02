-- EduClass v6 — Crear tablas desde cero
-- Ejecuta esto en Neon SQL Editor

CREATE TABLE IF NOT EXISTS institutions (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT NOT NULL UNIQUE,
  slug        TEXT NOT NULL UNIQUE,
  city        TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password        TEXT NOT NULL,
  cargo           TEXT NOT NULL DEFAULT 'Docente',
  "logoPath"      TEXT,
  "banderaPath"   TEXT,
  "institutionId" TEXT NOT NULL REFERENCES institutions(id),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name            TEXT NOT NULL,
  username        TEXT NOT NULL UNIQUE,
  password        TEXT NOT NULL,
  grade           TEXT NOT NULL DEFAULT '',
  "institutionId" TEXT NOT NULL REFERENCES institutions(id),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classes (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  content     TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}',
  "userId"    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  title           TEXT NOT NULL,
  description     TEXT,
  type            TEXT NOT NULL DEFAULT 'taller',
  area            TEXT,
  grade           TEXT,
  "dueDate"       TIMESTAMPTZ,
  activity        JSONB,
  code            TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  "userId"        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "institutionId" TEXT NOT NULL REFERENCES institutions(id),
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assignments (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  status        TEXT NOT NULL DEFAULT 'pending',
  grade         FLOAT,
  comment       TEXT,
  response      TEXT,
  responses     JSONB,
  "fileName"    TEXT,
  "autoGraded"  BOOLEAN NOT NULL DEFAULT FALSE,
  detail        JSONB,
  "submittedAt" TIMESTAMPTZ,
  "gradedAt"    TIMESTAMPTZ,
  "taskId"      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  "studentId"   TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("taskId", "studentId")
);

CREATE INDEX IF NOT EXISTS idx_users_inst ON users("institutionId");
CREATE INDEX IF NOT EXISTS idx_students_inst ON students("institutionId");
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks("userId");
CREATE INDEX IF NOT EXISTS idx_assign_student ON assignments("studentId");
CREATE INDEX IF NOT EXISTS idx_assign_task ON assignments("taskId");

SELECT 'EduClass v6 — Tablas creadas ✅' as resultado;
