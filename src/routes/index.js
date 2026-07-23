const express = require('express');
const pool    = require('../config/db');
const { auth } = require('../middleware/auth');
const bcrypt  = require('bcryptjs');
const crud    = require('./crud');

const r = express.Router();

// ── ROLES ──────────────────────────────────────────────────
r.use('/roles', crud('roles', ['nombre', 'descripcion', 'permisos']));

// ── USUARIOS ───────────────────────────────────────────────
const usrRouter = require('express').Router();

usrRouter.get('/', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT id,nombre,username,correo,rol,estado,es_superadmin,created_at FROM usuarios ORDER BY id DESC');
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
usrRouter.get('/:id', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT id,nombre,username,correo,rol,estado,es_superadmin FROM usuarios WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
usrRouter.post('/', auth, async (req, res) => {
  const { nombre, username, correo, password, rol } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    // es_superadmin nunca se recibe del cliente: todo usuario nuevo se
    // crea con es_superadmin=false por el DEFAULT de la columna, así el
    // Superadministrador sigue siendo único y no se puede crear otro
    // desde este formulario.
    const { rows } = await pool.query(
      'INSERT INTO usuarios(nombre,username,correo,password,rol) VALUES($1,$2,$3,$4,$5) RETURNING id,nombre,username,correo,rol,es_superadmin',
      [nombre, username, correo || null, hash, rol]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Username ya existe' });
    res.status(500).json({ error: e.message });
  }
});
usrRouter.put('/:id', auth, async (req, res) => {
  const { nombre, username, correo, password, rol } = req.body;
  try {
    const { rows: actual } = await pool.query('SELECT rol, es_superadmin FROM usuarios WHERE id=$1', [req.params.id]);
    if (!actual[0]) return res.status(404).json({ error: 'Usuario no encontrado' });

    // El rol del Superadministrador es inmodificable: sin importar lo que
    // llegue en el body, conservamos su rol actual. El resto de sus datos
    // (nombre, usuario, correo, contraseña) sí se pueden actualizar.
    const rolFinal = actual[0].es_superadmin ? actual[0].rol : rol;

    let q, vals;
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      q = 'UPDATE usuarios SET nombre=$1,username=$2,correo=$3,password=$4,rol=$5 WHERE id=$6 RETURNING id,nombre,username,correo,rol,es_superadmin';
      vals = [nombre, username, correo || null, hash, rolFinal, req.params.id];
    } else {
      q = 'UPDATE usuarios SET nombre=$1,username=$2,correo=$3,rol=$4 WHERE id=$5 RETURNING id,nombre,username,correo,rol,es_superadmin';
      vals = [nombre, username, correo || null, rolFinal, req.params.id];
    }
    const { rows } = await pool.query(q, vals);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
usrRouter.patch('/:id/estado', auth, async (req, res) => {
  try {
  const { rows: actual } = await pool.query('SELECT es_superadmin FROM usuarios WHERE id=$1', [req.params.id]);
  if (!actual[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (actual[0].es_superadmin) {
    return res.status(403).json({ error: 'El estado del Superadministrador no se puede modificar.' });
  }
  const { rows } = await pool.query(
    `UPDATE usuarios SET estado=CASE WHEN estado='Activo' THEN 'Inactivo' ELSE 'Activo' END WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
usrRouter.delete('/:id', auth, async (req, res) => {
  try {
  const { rows: actual } = await pool.query('SELECT es_superadmin FROM usuarios WHERE id=$1', [req.params.id]);
  if (!actual[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  if (actual[0].es_superadmin) {
    return res.status(403).json({ error: 'El Superadministrador no se puede eliminar.' });
  }
  await pool.query('DELETE FROM usuarios WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/usuarios', usrRouter);

// ── CLIENTES ───────────────────────────────────────────────
const cliRouter = require('express').Router();

// Columnas públicas de un cliente, con alias camelCase para que coincidan
// con lo que el frontend (perfil del cliente y módulo admin de Clientes)
// ya esperaba leer. Antes esta lista solo traía id/nombre/correo/telefono,
// así que campos como dirección, comuna, tipo/número de documento,
// departamento, municipio y fecha de registro nunca llegaban al frontend
// aunque sí existieran en la base de datos — por eso "desaparecían" al
// volver a iniciar sesión o al abrir "Editar cliente".
const CLIENTE_COLS = `id, nombre, correo, telefono,
  tipo_doc AS "tipoDoc", numero_doc AS "numeroDoc",
  departamento, municipio, comuna, direccion, estado,
  created_at AS "fechaRegistro"`;

cliRouter.get('/', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`SELECT ${CLIENTE_COLS} FROM clientes ORDER BY id DESC`);
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
cliRouter.get('/mi-perfil', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`SELECT ${CLIENTE_COLS} FROM clientes WHERE id=$1`, [req.user.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
cliRouter.get('/:id', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`SELECT ${CLIENTE_COLS} FROM clientes WHERE id=$1`, [req.params.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// El cliente edita su propio perfil ("Editar mis datos" en la landing).
// Nota: `correo` nunca se lee de req.body ni se incluye en el UPDATE, así
// que aunque alguien intente enviarlo manualmente, jamás se modifica.
cliRouter.put('/mi-perfil', auth, async (req, res) => {
  try {
  const { nombre, telefono, comuna, direccion } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const { rows } = await pool.query(
    `UPDATE clientes SET nombre=$1, telefono=$2, comuna=$3, direccion=$4
     WHERE id=$5 RETURNING ${CLIENTE_COLS}`,
    [nombre, telefono || null, comuna || null, direccion || null, req.user.id]
  );
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Edición de un cliente desde el panel admin. Igual que arriba, `correo`
// nunca se toca aquí a propósito.
cliRouter.put('/:id', auth, async (req, res) => {
  try {
  const { nombre, telefono, tipoDoc, numeroDoc, departamento, municipio, direccion } = req.body;
  if (!nombre || !nombre.trim()) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  if (tipoDoc === 'Otros') return res.status(400).json({ error: 'Debes especificar el tipo de documento.' });
  const { rows } = await pool.query(
    `UPDATE clientes SET nombre=$1, telefono=$2, tipo_doc=$3, numero_doc=$4,
       departamento=$5, municipio=$6, direccion=$7
     WHERE id=$8 RETURNING ${CLIENTE_COLS}`,
    [nombre, telefono || null, tipoDoc || null, numeroDoc || null, departamento || null, municipio || null, direccion || null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Cliente no encontrado' });
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
cliRouter.patch('/:id/estado', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`UPDATE clientes SET estado=CASE WHEN estado='Activo' THEN 'Inactivo' ELSE 'Activo' END WHERE id=$1 RETURNING *`, [req.params.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
cliRouter.delete('/:id', auth, async (req, res) => {
  try {
  await pool.query('DELETE FROM clientes WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/clientes', cliRouter);

// ── EMPLEADOS ──────────────────────────────────────────────
r.use('/empleados', crud('empleados', ['nombre', 'cargo', 'telefono', 'correo', 'estado']));

// ── CATEGORÍAS ─────────────────────────────────────────────
r.use('/categorias', crud('categorias', ['nombre', 'descripcion', 'estado']));

// ── PRODUCTOS ──────────────────────────────────────────────
const prodRouter = require('express').Router();
prodRouter.get('/', async (req, res) => {
  try {
  const { rows } = await pool.query(`SELECT * FROM productos WHERE estado='Activo' ORDER BY id`);
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
prodRouter.get('/todos', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT * FROM productos ORDER BY id DESC');
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
prodRouter.get('/:id', async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT * FROM productos WHERE id=$1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrado' });
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
prodRouter.post('/', auth, async (req, res) => {
  const { nombre, categoria, precio, descuento, fecha_inicio_desc, fecha_fin_desc, descripcion, imagen, estado } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO productos(nombre,categoria,precio,descuento,fecha_inicio_desc,fecha_fin_desc,descripcion,imagen,estado)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [nombre, categoria, precio, descuento || 0, fecha_inicio_desc || null, fecha_fin_desc || null, descripcion, imagen, estado || 'Activo']
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Producto ya existe' });
    res.status(500).json({ error: e.message });
  }
});
prodRouter.put('/:id', auth, async (req, res) => {
  try {
  const { nombre, categoria, precio, descuento, fecha_inicio_desc, fecha_fin_desc, descripcion, imagen, estado } = req.body;
  const { rows } = await pool.query(
    `UPDATE productos SET nombre=$1,categoria=$2,precio=$3,descuento=$4,fecha_inicio_desc=$5,fecha_fin_desc=$6,descripcion=$7,imagen=$8,estado=$9 WHERE id=$10 RETURNING *`,
    [nombre, categoria, precio, descuento || 0, fecha_inicio_desc || null, fecha_fin_desc || null, descripcion, imagen, estado, req.params.id]
  );
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
prodRouter.delete('/:id', auth, async (req, res) => {
  try {
  await pool.query('DELETE FROM productos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/productos', prodRouter);

// ── TOPPINGS ───────────────────────────────────────────────
r.use('/toppings',  crud('toppings',  ['nombre', 'precio', 'estado']));

// ── ADICIONES ──────────────────────────────────────────────
r.use('/adiciones', crud('adiciones', ['nombre', 'precio', 'estado']));

// ── COMBOS ─────────────────────────────────────────────────
const comboRouter = require('express').Router();
comboRouter.get('/', async (req, res) => {
  try {
  const { rows } = await pool.query(`SELECT * FROM combos WHERE estado='Activo' ORDER BY id`);
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
comboRouter.get('/todos', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT * FROM combos ORDER BY id DESC');
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
comboRouter.post('/', auth, async (req, res) => {
  try {
  const { nombre, descripcion, precio, imagen, items } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO combos(nombre,descripcion,precio,imagen,items) VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [nombre, descripcion, precio, imagen, JSON.stringify(items || [])]
  );
  res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
comboRouter.put('/:id', auth, async (req, res) => {
  try {
  const { nombre, descripcion, precio, imagen, items } = req.body;
  const { rows } = await pool.query(
    `UPDATE combos SET nombre=$1,descripcion=$2,precio=$3,imagen=$4,items=$5 WHERE id=$6 RETURNING *`,
    [nombre, descripcion, precio, imagen, JSON.stringify(items || []), req.params.id]
  );
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
comboRouter.patch('/:id/estado', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`UPDATE combos SET estado=CASE WHEN estado='Activo' THEN 'Inactivo' ELSE 'Activo' END WHERE id=$1 RETURNING *`, [req.params.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
comboRouter.delete('/:id', auth, async (req, res) => {
  try {
  await pool.query('DELETE FROM combos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/combos', comboRouter);

// ── PROVEEDORES ────────────────────────────────────────────
r.use('/proveedores', crud('proveedores', ['nombre', 'nit', 'telefono', 'correo', 'direccion', 'estado']));

// ── INSUMOS ────────────────────────────────────────────────
const insRouter = require('express').Router();
insRouter.get('/', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`SELECT i.*, p.nombre as proveedor_nombre FROM insumos i LEFT JOIN proveedores p ON i.proveedor_id=p.id ORDER BY i.id DESC`);
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
insRouter.get('/:id', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT * FROM insumos WHERE id=$1', [req.params.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
insRouter.post('/', auth, async (req, res) => {
  try {
  const { nombre, unidad, stock, stock_minimo, precio_unitario, proveedor_id, estado } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO insumos(nombre,unidad,stock,stock_minimo,precio_unitario,proveedor_id,estado) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [nombre, unidad, stock || 0, stock_minimo || 0, precio_unitario || 0, proveedor_id || null, estado || 'Activo']
  );
  res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
insRouter.put('/:id', auth, async (req, res) => {
  try {
  const { nombre, unidad, stock, stock_minimo, precio_unitario, proveedor_id, estado } = req.body;
  const { rows } = await pool.query(
    `UPDATE insumos SET nombre=$1,unidad=$2,stock=$3,stock_minimo=$4,precio_unitario=$5,proveedor_id=$6,estado=$7 WHERE id=$8 RETURNING *`,
    [nombre, unidad, stock, stock_minimo, precio_unitario, proveedor_id || null, estado, req.params.id]
  );
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
insRouter.delete('/:id', auth, async (req, res) => {
  try {
  await pool.query('DELETE FROM insumos WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/insumos', insRouter);

// ── COMPRAS ────────────────────────────────────────────────
const compRouter = require('express').Router();
compRouter.get('/', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`SELECT c.*, p.nombre as proveedor_nombre FROM compras c LEFT JOIN proveedores p ON c.proveedor_id=p.id WHERE c.estado='Activa' ORDER BY c.id DESC`);
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
compRouter.get('/historial', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`SELECT c.*, p.nombre as proveedor_nombre FROM compras c LEFT JOIN proveedores p ON c.proveedor_id=p.id ORDER BY c.id DESC`);
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
compRouter.get('/:id', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT * FROM compras WHERE id=$1', [req.params.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
compRouter.post('/', auth, async (req, res) => {
  try {
  const { proveedor_id, fecha, total, items } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO compras(proveedor_id,fecha,total,items) VALUES($1,$2,$3,$4) RETURNING *`,
    [proveedor_id, fecha || new Date(), total || 0, JSON.stringify(items || [])]
  );
  res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
compRouter.patch('/:id/anular', auth, async (req, res) => {
  try {
  const { motivo } = req.body;
  const { rows } = await pool.query(`UPDATE compras SET estado='Anulada', motivo_anulacion=$1 WHERE id=$2 RETURNING *`, [motivo, req.params.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/compras', compRouter);

// ── PEDIDOS ────────────────────────────────────────────────
const pedRouter = require('express').Router();
pedRouter.get('/', auth, async (req, res) => {
  try {
  // El frontend espera "productos" y "comprobanteImg"; la tabla real usa
  // "items" y "comprobante_img". Antes esto solo se resolvía a medias en
  // la tabla (con un fallback manual) y nunca en el modal de detalle, así
  // que el detalle de un pedido siempre mostraba "Sin productos
  // registrados" y jamás el comprobante subido.
  const { rows } = await pool.query('SELECT *, items AS productos, comprobante_img AS "comprobanteImg" FROM pedidos ORDER BY id DESC');
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
pedRouter.get('/stats', auth, async (req, res) => {
  try {
  // El frontend (PedidosPage y Dashboard) espera { total, pendiente,
  // porVerificar, proceso, listo, ventas }. Antes esta consulta devolvía
  // { total, ingresos } — un objeto que no coincidía con ningún campo
  // usado en pantalla, así que las tarjetas de estadísticas de Pedidos
  // (Pendientes, Por verificar, En proceso, Ventas del día) siempre
  // quedaban en 0/undefined sin importar los pedidos reales.
  const { rows } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE estado <> 'anulado')                AS total,
      COUNT(*) FILTER (WHERE estado = 'pendiente')                AS pendiente,
      COUNT(*) FILTER (WHERE estado = 'pendiente_verificacion')   AS "porVerificar",
      COUNT(*) FILTER (WHERE estado = 'en_proceso')                AS proceso,
      COUNT(*) FILTER (WHERE estado = 'listo')                     AS listo,
      COALESCE(SUM(total) FILTER (
        WHERE created_at::date = CURRENT_DATE
          AND estado NOT IN ('cancelado','anulado')
      ), 0)                                                        AS ventas
    FROM pedidos
  `);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
pedRouter.get('/:id', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT *, items AS productos, comprobante_img AS "comprobanteImg" FROM pedidos WHERE id=$1', [req.params.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
pedRouter.post('/', async (req, res) => {
  const { cliente_id, numero, cliente, tipo, pago, mesa, total, items, comprobante, comprobante_img, origen, direccion_alternativa, hora, estado, barista, domiciliario, _meta } = req.body;
  // Compatibilidad: si vienen en _meta los usamos también
  const meta = _meta || {};
  try {
    const { rows } = await pool.query(
      `INSERT INTO pedidos(cliente_id,numero,cliente,tipo,pago,mesa,total,items,comprobante,comprobante_img,origen,direccion_alternativa,hora,estado,barista,domiciliario)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [
        cliente_id || null,
        numero || meta.numero || null,
        cliente || meta.cliente || null,
        tipo || meta.tipo || null,
        pago || meta.pago || null,
        mesa || null,
        total || 0,
        JSON.stringify(items || []),
        comprobante || meta.comprobante || null,
        comprobante_img || meta.comprobanteImg || null,
        origen || meta.origen || 'landing',
        direccion_alternativa || meta.direccionAlternativa || null,
        hora || meta.hora || null,
        estado || meta.estado || 'pendiente',
        // "Atendido por" y "domiciliario" — antes se descartaban porque no
        // existía la columna ni se leían del body en absoluto, así que se
        // perdían aunque el formulario del admin los pidiera y validara.
        barista || meta.barista || null,
        domiciliario || meta.domiciliario || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Edición de un pedido existente (cliente, tipo de entrega, método de pago,
// productos/total, personal asignado, dirección). Antes este endpoint no
// existía: el módulo permitía crear, cambiar estado y "detener" un pedido,
// pero no corregir un pedido ya creado.
pedRouter.put('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de pedido inválido' });
  const { cliente, tipo, pago, total, items, barista, domiciliario, direccion_alternativa } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE pedidos SET
         cliente = COALESCE($1, cliente),
         tipo    = COALESCE($2, tipo),
         pago    = COALESCE($3, pago),
         total   = COALESCE($4, total),
         items   = COALESCE($5, items),
         barista = COALESCE($6, barista),
         domiciliario = COALESCE($7, domiciliario),
         direccion_alternativa = COALESCE($8, direccion_alternativa)
       WHERE id=$9 RETURNING *`,
      [
        cliente ?? null,
        tipo ?? null,
        pago ?? null,
        total ?? null,
        items ? JSON.stringify(items) : null,
        barista ?? null,
        domiciliario ?? null,
        direccion_alternativa ?? null,
        id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
pedRouter.patch('/:id/estado', auth, async (req, res) => {
  const { estado } = req.body;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de pedido inválido' });
  try {
    const { rows } = await pool.query('UPDATE pedidos SET estado=$1 WHERE id=$2 RETURNING *', [estado, id]);
    if (!rows[0]) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
pedRouter.delete('/:id', auth, async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID de pedido inválido' });
  try {
    await pool.query('DELETE FROM pedidos WHERE id=$1', [id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/pedidos', pedRouter);

// ── VENTAS ─────────────────────────────────────────────────
const ventRouter = require('express').Router();
// El frontend (Ventas, Devoluciones, Dashboard, Cajero, Landing) espera que
// cada venta traiga: id_venta, id_pedido, cliente, fecha, metodo_pago,
// tipo_venta, productos y estado en minúscula ('vendido' / 'devuelto').
// Esos datos no vivían todos en la tabla `ventas`: cliente/método de
// pago/tipo/productos se derivan del pedido asociado mediante el JOIN.
const VENTA_SELECT = `
  SELECT
    v.id,
    v.id                              AS id_venta,
    v.pedido_id,
    v.pedido_id                       AS id_pedido,
    p.cliente,
    v.created_at                      AS fecha,
    v.total,
    p.pago                            AS metodo_pago,
    p.tipo                            AS tipo_venta,
    v.estado,
    p.mesa,
    COALESCE(p.items, '[]'::jsonb)    AS productos
  FROM ventas v
  LEFT JOIN pedidos p ON v.pedido_id = p.id
`;
ventRouter.get('/', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`${VENTA_SELECT} ORDER BY v.id DESC`);
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
ventRouter.get('/stats', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(
    `SELECT COUNT(*) as total,
            COUNT(*) FILTER (WHERE estado='vendido')  as vendido,
            COUNT(*) FILTER (WHERE estado='devuelto') as devuelto,
            COALESCE(SUM(total) FILTER (WHERE estado='vendido'),0) as ingresos
     FROM ventas`
  );
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
ventRouter.get('/:id', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`${VENTA_SELECT} WHERE v.id=$1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
ventRouter.post('/desde-pedido', auth, async (req, res) => {
  try {
    // Accept either id_pedido number or full pedido object
    let id_pedido = req.body.id_pedido;
    if (typeof id_pedido === 'object' && id_pedido !== null) id_pedido = id_pedido.id;
    id_pedido = parseInt(id_pedido);
    if (isNaN(id_pedido)) return res.status(400).json({ error: 'ID de pedido inválido' });

    const { rows: ped } = await pool.query('SELECT * FROM pedidos WHERE id=$1', [id_pedido]);
    if (!ped[0]) return res.status(404).json({ error: 'Pedido no encontrado' });

    // Mark pedido as delivered
    await pool.query("UPDATE pedidos SET estado='entregado' WHERE id=$1", [id_pedido]);

    const { rows } = await pool.query(
      // Antes no se pasaba `estado`, así que la venta quedaba con el
      // default de la columna ('Activa'), un valor que ninguna pantalla
      // del frontend reconoce (todas comparan contra 'vendido'/'devuelto').
      // Eso hacía que la venta recién creada apareciera sin badge de estado
      // y el botón "Registrar devolución" nunca se mostrara.
      `INSERT INTO ventas(pedido_id, total, estado) VALUES($1,$2,'vendido') RETURNING *`,
      [id_pedido, ped[0].total]
    );
    const { rows: full } = await pool.query(`${VENTA_SELECT} WHERE v.id=$1`, [rows[0].id]);
    res.status(201).json(full[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
ventRouter.patch('/:id/estado', auth, async (req, res) => {
  try {
  const { estado } = req.body;
  const { rows } = await pool.query('UPDATE ventas SET estado=$1 WHERE id=$2 RETURNING *', [estado, req.params.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/ventas', ventRouter);

// ── DEVOLUCIONES ───────────────────────────────────────────
const devRouter = require('express').Router();
// El listado de Devoluciones (admin) necesita el nombre del cliente y el
// número de venta asociada, que solo se pueden sacar uniendo con pedidos/
// ventas. Antes se hacía un SELECT * plano y el frontend nunca podía
// mostrar el cliente ni cruzar la devolución con su venta.
const DEV_SELECT = `
  SELECT
    d.id,
    d.id                       AS id_dev,
    d.pedido_id,
    p.cliente,
    v.id                       AS id_venta,
    d.motivo,
    d.tipo,
    d.monto,
    d.estado,
    d.items                    AS productos_devueltos,
    d.created_at                AS fecha
  FROM devoluciones d
  LEFT JOIN pedidos p ON d.pedido_id = p.id
  LEFT JOIN ventas  v ON v.pedido_id = d.pedido_id
`;
devRouter.get('/', auth, async (req, res) => {
  try {
  const { rows } = await pool.query(`${DEV_SELECT} ORDER BY d.id DESC`);
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
devRouter.post('/', auth, async (req, res) => {
  try {
  // Antes no se leía `tipo` (total/parcial) del body ni existía la columna
  // en la tabla, así que toda devolución se mostraba como "Parcial" sin
  // importar lo que el usuario hubiera elegido.
  const { pedido_id, motivo, monto, items, tipo } = req.body;
  if (!pedido_id) return res.status(400).json({ error: 'pedido_id es requerido' });
  const { rows } = await pool.query(
    // El default de la columna quedó en 'Pendiente' (con mayúscula) pero
    // todo el frontend compara contra 'pendiente' en minúscula; sin este
    // INSERT explícito la devolución recién creada no coincidía con
    // ningún filtro ni mostraba los botones de aprobar/rechazar.
    `INSERT INTO devoluciones(pedido_id,motivo,monto,items,tipo,estado)
     VALUES($1,$2,$3,$4,$5,'pendiente') RETURNING id`,
    [pedido_id, motivo, monto || 0, JSON.stringify(items || []), tipo || 'total']
  );
  const { rows: full } = await pool.query(`${DEV_SELECT} WHERE d.id=$1`, [rows[0].id]);
  res.status(201).json(full[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
devRouter.patch('/:id/estado', auth, async (req, res) => {
  try {
  const estado = (req.body.estado || '').toLowerCase();
  if (!['pendiente','aprobada','rechazada'].includes(estado)) {
    return res.status(400).json({ error: 'Estado inválido' });
  }
  const { rows } = await pool.query('UPDATE devoluciones SET estado=$1 WHERE id=$2 RETURNING *', [estado, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Devolución no encontrada' });

  // La UI le informa al usuario que aprobar/rechazar una devolución
  // actualiza automáticamente el estado de la venta. Antes esto nunca
  // pasaba: solo se tocaba la fila de `devoluciones`, así que la venta
  // se quedaba "vendida" para siempre aunque la devolución estuviera
  // aprobada.
  if (rows[0].pedido_id) {
    const nuevoEstadoVenta = estado === 'aprobada' ? 'devuelto' : 'vendido';
    await pool.query('UPDATE ventas SET estado=$1 WHERE pedido_id=$2', [nuevoEstadoVenta, rows[0].pedido_id]);
  }

  const { rows: full } = await pool.query(`${DEV_SELECT} WHERE d.id=$1`, [rows[0].id]);
  res.json(full[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/devoluciones', devRouter);

// ── FICHAS TÉCNICAS ────────────────────────────────────────
const fichaRouter = require('express').Router();
fichaRouter.get('/', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT f.*, p.nombre as producto_nombre FROM fichas_tecnicas f LEFT JOIN productos p ON f.producto_id=p.id ORDER BY f.id DESC');
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
fichaRouter.get('/:id', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT * FROM fichas_tecnicas WHERE id=$1', [req.params.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
fichaRouter.post('/', auth, async (req, res) => {
  try {
  const { producto_id, ingredientes, descripcion } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO fichas_tecnicas(producto_id,ingredientes,descripcion) VALUES($1,$2,$3) RETURNING *`,
    [producto_id, JSON.stringify(ingredientes || []), descripcion]
  );
  res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
fichaRouter.put('/:id', auth, async (req, res) => {
  try {
  const { producto_id, ingredientes, descripcion } = req.body;
  const { rows } = await pool.query(
    `UPDATE fichas_tecnicas SET producto_id=$1,ingredientes=$2,descripcion=$3 WHERE id=$4 RETURNING *`,
    [producto_id, JSON.stringify(ingredientes || []), descripcion, req.params.id]
  );
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
fichaRouter.delete('/:id', auth, async (req, res) => {
  try {
  await pool.query('DELETE FROM fichas_tecnicas WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/fichas-tecnicas', fichaRouter);

// ── RESEÑAS ────────────────────────────────────────────────
const resenasRouter = require('express').Router();
resenasRouter.get('/', async (req, res) => {
  try {
  const { rows } = await pool.query(`SELECT r.*, c.nombre as cliente_nombre FROM resenas r LEFT JOIN clientes c ON r.cliente_id=c.id WHERE r.aprobada=true ORDER BY r.id DESC`);
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
resenasRouter.get('/todas', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('SELECT r.*, c.nombre as cliente_nombre FROM resenas r LEFT JOIN clientes c ON r.cliente_id=c.id ORDER BY r.id DESC');
  res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
resenasRouter.post('/', async (req, res) => {
  try {
  const { cliente_id, texto, calificacion } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO resenas(cliente_id,texto,calificacion) VALUES($1,$2,$3) RETURNING *`,
    [cliente_id || null, texto, calificacion || 5]
  );
  res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
resenasRouter.patch('/:id/aprobar', auth, async (req, res) => {
  try {
  const { rows } = await pool.query('UPDATE resenas SET aprobada=true WHERE id=$1 RETURNING *', [req.params.id]);
  res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
resenasRouter.delete('/:id', auth, async (req, res) => {
  try {
  await pool.query('DELETE FROM resenas WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
r.use('/resenas', resenasRouter);

module.exports = r;