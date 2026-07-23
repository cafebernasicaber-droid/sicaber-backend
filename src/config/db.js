require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});


const migrar = async () => {
  const alters = [
    // usuarios (login con correo o usuario)
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo VARCHAR(150)`,
    // usuarios: marca del Superadministrador único e inmodificable
    // (rol/estado). No crea un usuario nuevo: solo agrega la columna y,
    // más abajo, marca el admin por defecto ya existente.
    `ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_superadmin BOOLEAN NOT NULL DEFAULT FALSE`,
    `UPDATE usuarios SET es_superadmin = TRUE WHERE username = 'Admin_Sicaber' AND es_superadmin IS NOT TRUE`,
    // pedidos
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS numero VARCHAR(30)`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS cliente VARCHAR(150)`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS tipo VARCHAR(30)`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS pago VARCHAR(30)`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS mesa VARCHAR(100)`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comprobante TEXT`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS comprobante_img TEXT`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS origen VARCHAR(30) DEFAULT 'admin'`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS direccion_alternativa TEXT`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS hora VARCHAR(10)`,
    // pedidos: "atendido por" y "domiciliario" se seleccionaban en el
    // formulario pero nunca se guardaban porque la columna no existía.
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS barista VARCHAR(150)`,
    `ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS domiciliario VARCHAR(150)`,
    // devoluciones: faltaba la columna `tipo` (total/parcial) que el
    // frontend siempre intentó leer.
    `ALTER TABLE devoluciones ADD COLUMN IF NOT EXISTS tipo VARCHAR(20) DEFAULT 'total'`,
    // El default de `estado` quedó como 'Pendiente' (con mayúscula) pero
    // todo el frontend compara en minúscula ('pendiente'/'aprobada'/
    // 'rechazada'). Esto hacía que ninguna devolución nueva mostrara los
    // botones de aprobar/rechazar ni contara en las estadísticas.
    `ALTER TABLE devoluciones ALTER COLUMN estado SET DEFAULT 'pendiente'`,
    `UPDATE devoluciones SET estado='pendiente' WHERE estado='Pendiente'`,
    `UPDATE devoluciones SET estado='aprobada'  WHERE estado='Aprobada'`,
    `UPDATE devoluciones SET estado='rechazada' WHERE estado='Rechazada'`,
    // Mismo problema en ventas: el default era 'Activa', pero el frontend
    // solo reconoce 'vendido' / 'devuelto'.
    `ALTER TABLE ventas ALTER COLUMN estado SET DEFAULT 'vendido'`,
    `UPDATE ventas SET estado='vendido'  WHERE estado='Activa'`,
    `UPDATE ventas SET estado='devuelto' WHERE estado IN ('Anulada','Inactiva')`,
  ];
  for (const sql of alters) {
    try { await pool.query(sql); }
    catch (e) { console.error('⚠️  Migración falló para:', sql, '→', e.message); }
  }
};

pool.connect()
  .then(async () => {
    console.log('✅ Conectado a PostgreSQL - sicaber');
    await migrar();
    console.log('✅ Migraciones verificadas');
  })
  .catch(err => console.error('❌ Error de conexión:', err.message));

module.exports = pool;