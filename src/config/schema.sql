-- ─────────────────────────────────────────────────────────────
--  SICABER - Esquema PostgreSQL
--  Ejecutar una sola vez en pgAdmin > sicaber > Query Tool
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS roles (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  permisos    JSONB DEFAULT '[]',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(150) NOT NULL,
  username      VARCHAR(100) NOT NULL UNIQUE,
  password      VARCHAR(255) NOT NULL,
  rol           VARCHAR(100) NOT NULL DEFAULT 'Administrador',
  estado        VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  es_superadmin BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT NOW()
);
-- Migración segura para bases de datos ya existentes en las que la tabla
-- "usuarios" fue creada antes de que existiera la columna es_superadmin.
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS es_superadmin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS clientes (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  correo      VARCHAR(150) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  telefono    VARCHAR(30),
  tipo_doc    VARCHAR(60),
  numero_doc  VARCHAR(30),
  departamento VARCHAR(80),
  municipio   VARCHAR(80),
  comuna      VARCHAR(80),
  direccion   VARCHAR(200),
  estado      VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS empleados (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  cargo       VARCHAR(100),
  telefono    VARCHAR(30),
  correo      VARCHAR(150),
  estado      VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categorias (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  estado      VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
  id               SERIAL PRIMARY KEY,
  nombre           VARCHAR(150) NOT NULL UNIQUE,
  categoria        VARCHAR(100),
  precio           NUMERIC(10,2) NOT NULL,
  descuento        NUMERIC(5,2)  DEFAULT 0,
  fecha_inicio_desc DATE,
  fecha_fin_desc    DATE,
  descripcion      TEXT,
  imagen           TEXT,
  estado           VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  created_at       TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS toppings (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  productos_ids JSONB      DEFAULT '[]',
  estado      VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  created_at  TIMESTAMP DEFAULT NOW()
);
-- Migración segura: los toppings nunca tienen costo (se eliminó la
-- columna precio) y ahora se pueden asociar a productos específicos.
-- productos_ids = '[]' significa "aplica a todos los productos".
ALTER TABLE toppings DROP COLUMN IF EXISTS precio;
ALTER TABLE toppings ADD COLUMN IF NOT EXISTS productos_ids JSONB DEFAULT '[]';

CREATE TABLE IF NOT EXISTS adiciones (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  precio      NUMERIC(10,2) DEFAULT 0,
  estado      VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS combos (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL UNIQUE,
  descripcion TEXT,
  precio      NUMERIC(10,2) NOT NULL,
  imagen      TEXT,
  items       JSONB DEFAULT '[]',
  estado      VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proveedores (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(150) NOT NULL,
  nit         VARCHAR(50),
  telefono    VARCHAR(30),
  correo      VARCHAR(150),
  direccion   TEXT,
  estado      VARCHAR(20)  NOT NULL DEFAULT 'Activo',
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS insumos (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(150) NOT NULL,
  unidad          VARCHAR(50),
  stock           NUMERIC(10,2) DEFAULT 0,
  stock_minimo    NUMERIC(10,2) DEFAULT 0,
  precio_unitario NUMERIC(10,2) DEFAULT 0,
  proveedor_id    INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  estado          VARCHAR(20) NOT NULL DEFAULT 'Activo',
  created_at      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS compras (
  id           SERIAL PRIMARY KEY,
  proveedor_id INTEGER REFERENCES proveedores(id) ON DELETE SET NULL,
  fecha        DATE NOT NULL DEFAULT CURRENT_DATE,
  total        NUMERIC(12,2) DEFAULT 0,
  estado       VARCHAR(20) NOT NULL DEFAULT 'Activa',
  motivo_anulacion TEXT,
  items        JSONB DEFAULT '[]',
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pedidos (
  id                   SERIAL PRIMARY KEY,
  cliente_id           INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  numero               VARCHAR(30),
  cliente              VARCHAR(150),
  tipo                 VARCHAR(30),
  pago                 VARCHAR(30),
  mesa                 VARCHAR(100),
  estado               VARCHAR(40) NOT NULL DEFAULT 'pendiente',
  total                NUMERIC(12,2) DEFAULT 0,
  items                JSONB DEFAULT '[]',
  comprobante          TEXT,
  comprobante_img      TEXT,
  origen               VARCHAR(30) DEFAULT 'admin',
  direccion_alternativa TEXT,
  hora                 VARCHAR(10),
  barista              VARCHAR(150),
  domiciliario         VARCHAR(150),
  created_at           TIMESTAMP DEFAULT NOW()
);
-- Migración segura: estas dos columnas se agregaron después de que el
-- módulo de Pedidos ya guardaba "atendido por" y "domiciliario" en el
-- formulario, pero nunca se persistían porque no existían en la tabla.
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS barista      VARCHAR(150);
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS domiciliario VARCHAR(150);

CREATE TABLE IF NOT EXISTS ventas (
  id           SERIAL PRIMARY KEY,
  pedido_id    INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  total        NUMERIC(12,2) DEFAULT 0,
  estado       VARCHAR(30) NOT NULL DEFAULT 'vendido', -- 'vendido' | 'devuelto'
  created_at   TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devoluciones (
  id        SERIAL PRIMARY KEY,
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  motivo    TEXT,
  tipo      VARCHAR(20) DEFAULT 'total', -- 'total' | 'parcial'
  monto     NUMERIC(12,2) DEFAULT 0,
  estado    VARCHAR(30) NOT NULL DEFAULT 'pendiente', -- 'pendiente' | 'aprobada' | 'rechazada'
  items     JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fichas_tecnicas (
  id          SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id) ON DELETE CASCADE,
  ingredientes JSONB DEFAULT '[]',
  descripcion TEXT,
  created_at  TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS resenas (
  id           SERIAL PRIMARY KEY,
  cliente_id   INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
  texto        TEXT NOT NULL,
  calificacion INTEGER DEFAULT 5,
  aprobada     BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMP DEFAULT NOW()
);

-- Usuario admin por defecto / Superadministrador (password: admin2024#)
INSERT INTO usuarios (nombre, username, password, rol, es_superadmin)
VALUES ('Admin Sicaber', 'Admin_Sicaber',
  '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrador', TRUE)
ON CONFLICT (username) DO NOTHING;

-- Si la base de datos ya existía de antes (con el admin ya creado pero sin
-- la columna es_superadmin), marcamos aquí ese mismo usuario como
-- Superadministrador. No crea un usuario nuevo, solo actualiza el flag.
UPDATE usuarios SET es_superadmin = TRUE WHERE username = 'Admin_Sicaber';