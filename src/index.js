require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',   // web
    'http://localhost:5000',   // flutter web (puerto por defecto en algunos setups)
    /^http:\/\/localhost:\d+$/ // cualquier puerto localhost (dev)
  ],
  credentials: true
}));
app.use(express.json());

// Rutas
app.use('/api/auth', require('./routes/auth'));
app.use('/api',      require('./routes/index'));

// Health check
app.get('/api/health', (_, res) => res.json({ ok: true, message: 'SICABER API corriendo ✅' }));

// Manejador global de errores: cualquier excepción que llegue hasta aquí
// responde con 500 en vez de tumbar el servidor.
app.use((err, req, res, next) => {
  console.error('💥 Error no manejado en', req.method, req.originalUrl, '→', err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || 'Error interno del servidor' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 API corriendo en http://localhost:${PORT}`));

// Red de seguridad: si una ruta sin try/catch lanza un error async no
// capturado, esto evita que Node mate el proceso completo (lo cual tumbaba
// la API entera y hacía fallar incluso rutas que no tenían nada que ver).
process.on('unhandledRejection', (reason) => {
  console.error('⚠️  Promesa rechazada sin manejar:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️  Excepción no capturada:', err);
});