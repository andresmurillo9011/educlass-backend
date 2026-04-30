# 🚀 GUÍA COMPLETA DE DESPLIEGUE — EduClass v5 PostgreSQL

## Por qué PostgreSQL y no JSON local

El problema actual es que Railway NO tiene sistema de archivos persistente.
Cada deploy borra el db.json. Con PostgreSQL en Railway:
- La base de datos es un SERVICIO SEPARADO del código
- El código puede cambiar 100 veces y los datos nunca se pierden
- Es la solución correcta para producción

---

## PASO 1 — Crear base de datos PostgreSQL en Railway

1. Ve a https://railway.app
2. En tu proyecto, clic en **"+ New"**
3. Selecciona **"Database" → "PostgreSQL"**
4. Railway crea la DB automáticamente
5. Clic en la DB → pestaña **"Variables"**
6. Copia el valor de **DATABASE_URL**
   Ejemplo: `postgresql://postgres:abc123@containers-us-west.railway.app:5432/railway`

---

## PASO 2 — Configurar variables de entorno en Railway (backend)

En tu servicio de backend (Node.js):
1. Clic en el servicio → pestaña **"Variables"**
2. Agrega estas variables:

```
DATABASE_URL    = (el que copiaste del paso 1)
JWT_SECRET      = educlass_jwt_2024_secreto_largo
GROQ_KEY        = gsk_...
TOGETHER_KEY    = key_...
OPENROUTER_KEY  = sk-or-v1-...
GEMINI_KEY      = AIza...
```

⚠️ NUNCA pongas estas variables en el código ni en GitHub.

---

## PASO 3 — Actualizar el código y subir a GitHub

```bash
# En tu computador
cd ~/Desktop/plataforma-clases/backend

# Copia los archivos nuevos de esta guía
# Luego:
git add .
git commit -m "v5 PostgreSQL Prisma multi-tenant"
git push
```

Railway detecta el push y hace deploy automático.

---

## PASO 4 — Ejecutar migraciones (SOLO LA PRIMERA VEZ)

Después del primer deploy, en Railway:
1. Ve a tu servicio backend
2. Clic en **"Deploy"** → **"View Logs"**
3. O en la terminal de Railway ejecuta:

```bash
npx prisma migrate deploy
```

Esto crea las tablas en PostgreSQL. Solo se hace UNA VEZ.
Los siguientes deploys NO tocan la base de datos.

---

## PASO 5 — Actualizar el frontend (App.js)

El frontend necesita usar JWT en cada petición.
Los endpoints cambian:

| Antes (JSON) | Ahora (PostgreSQL) |
|---|---|
| POST /registro | POST /auth/registro |
| POST /login | POST /auth/login |
| POST /registro-estudiante | POST /auth/registro-estudiante |
| POST /login-estudiante-reg | POST /auth/login-estudiante |
| GET /todos-estudiantes | GET /students |
| GET /estudiantes-grado/:g | GET /students/grado/:g |
| GET /grados-disponibles | GET /students/grados |
| POST /crear-tarea | POST /tasks |
| GET /mis-tareas/:id | GET /tasks/mis-tareas |
| GET /entregas-tarea/:id | GET /tasks/:id/entregas |
| POST /calificar-entrega | POST /tasks/calificar |
| GET /mis-tareas-estudiante/:id | GET /tasks/mis-tareas-estudiante |
| POST /entregar-tarea | POST /tasks/entregar |
| POST /guardar-clase | POST /guardar-clase |
| GET /mis-clases/:id | GET /mis-clases |
| POST /generar-guia | POST /generar-guia |
| POST /generar-actividad | POST /generar-actividad |

---

## Cómo el código cambia pero los datos NO se pierden

```
GitHub (código)  →  Railway Deploy (servidor)
                         ↕ DATABASE_URL
                    Railway PostgreSQL (datos permanentes)
```

- El código en GitHub puede cambiar infinitas veces
- La base de datos es un servicio independiente
- Los usuarios, estudiantes, tareas → NUNCA se borran
- Solo se pierden si tú manualmente borras la DB

---

## Esquema multi-tenant implementado

```
Institution (colegio)
    │
    ├── User[] (docentes de ESE colegio)
    ├── Student[] (estudiantes de ESE colegio)
    └── Task[] (tareas creadas en ESE colegio)

Student
    └── Assignment[] (tareas asignadas a ESE estudiante)
```

**Regla de aislamiento:** Cada query filtra por `institutionId`.
Un docente del Colegio A NUNCA puede ver estudiantes del Colegio B.

---

## Seguridad implementada

- ✅ Contraseñas con bcrypt (hash irreversible)
- ✅ JWT con expiración de 30 días
- ✅ Cada endpoint valida el token
- ✅ Filtro multi-tenant en cada query
- ✅ Variables secretas en Railway (no en código)
- ✅ .gitignore protege .env y uploads
