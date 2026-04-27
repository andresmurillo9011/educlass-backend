const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rutasIA = require('./rutas/ia'); // Asegúrate que el archivo de la IA esté en una carpeta llamada 'rutas'

// Cargar variables de entorno (como la API KEY)
dotenv.config();

const app = express();
const PORT = 5000;

// Configuración de Middlewares
app.use(cors()); // Permite que tu React se conecte
app.use(express.json()); // Permite leer el cuerpo de los mensajes JSON

// --- RUTAS TEMPORALES PARA LOGIN Y REGISTRO ---
// (Como borraste el backend, estas rutas te permitirán entrar mientras reconstruyes la base de datos)
app.post('/login', (req, res) => {
  const { email } = req.body;
  res.json({ 
    usuario: { 
      nombre: email.split('@')[0], 
      institucion: "INSTITUCIÓN EDUCATIVA RURAL", 
      ciudad: "Caquetá, Colombia" 
    } 
  });
});

app.post('/registro', (req, res) => {
  res.json({ mensaje: "Usuario registrado con éxito (Simulado)" });
});

// --- RUTA PARA GENERAR EL WORD (.docx) ---
// Aquí podrías usar librerías como 'docx' o 'redocx'
app.post('/descargar-guia', (req, res) => {
  const { presentacion } = req.body;
  // Por ahora, este es un marcador de posición
  res.status(501).json({ mensaje: "La función de descarga de Word se está reconstruyendo." });
});

// --- USAR LAS RUTAS DE IA QUE YA TIENES ---
app.use('/api', rutasIA);

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`-----------------------------------------`);
  console.log(` Servidor EduClass corriendo en el puerto ${PORT}`);
  console.log(` Listo para procesar guías pedagógicas`);
  console.log(`-----------------------------------------`);
});