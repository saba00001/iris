/**
 * IRIS online store — backend API
 * -------------------------------
 * This is the part that makes the store actually secure: prices, stock and order
 * totals are ALWAYS computed here from the database, never taken from the browser.
 * The frontend (iris-online-store.html) is just a display — it cannot be trusted
 * with anything that touches money or inventory, so it isn't.
 *
 * Setup:
 *   1) mysql -u root -p < schema.sql
 *   2) cp .env.example .env   and fill in your real values
 *   3) npm install
 *   4) npm start
 *
 * The frontend talks to this server at API_BASE + '/api/...'. Set API_BASE in the
 * <script> section of iris-online-store.html to wherever you deploy this server.
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'iris_store',
  waitForConnections: true,
  connectionLimit: 10,
});

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // bcrypt hash, generate with hash-password.js
if (!JWT_SECRET || !ADMIN_PASSWORD_HASH) {
  console.error('Missing JWT_SECRET or ADMIN_PASSWORD_HASH in .env — see .env.example. Refusing to start.');
  process.exit(1);
}

/* ---------- helpers ---------- */
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'ავტორიზაცია საჭიროა' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'სესია ვადაგასულია, გაიარეთ ხელახლა ავტორიზაცია' });
  }
}
const parseProduct = (row) => ({
  ...row,
  price: Number(row.price),
  sizes: typeof row.sizes === 'string' ? JSON.parse(row.sizes) : row.sizes,
  colors: typeof row.colors === 'string' ? JSON.parse(row.colors) : row.colors,
});

/* ================= PUBLIC ================= */
app.get('/api/products', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
  res.json(rows.map(parseProduct));
});

app.get('/api/categories', async (req, res) => {
  const [rows] = await pool.query('SELECT name FROM categories ORDER BY name');
  res.json(rows.map(r => r.name));
});

// Place an order. This is the security-critical endpoint: it re-reads price & stock
// from the database for every line item and rejects anything that doesn't add up —
// the client cannot supply its own price or fake a discount.
app.post('/api/orders', async (req, res) => {
  const { name, phone, delivery, address, payment, items } = req.body || {};
  if (!name || !phone || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'შეავსეთ სახელი, ტელეფონი და დაამატეთ ნივთები' });
  }
  if (delivery === 'delivery' && !address) {
    return res.status(400).json({ error: 'მიუთითეთ მისამართი' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let subtotal = 0;
    const lineItems = [];

    for (const it of items) {
      const [[product]] = await conn.query('SELECT * FROM products WHERE id=? FOR UPDATE', [it.productId]);
      if (!product) throw { status: 400, message: `პროდუქტი ვერ მოიძებნა: ${it.productId}` };
      const qty = Math.max(1, parseInt(it.qty, 10) || 1);
      if (product.stock < qty) throw { status: 409, message: `${product.name} — საკმარისი მარაგი არ არის` };
      subtotal += Number(product.price) * qty;
      lineItems.push({ productId: product.id, name: product.name, size: it.size || '', color: it.color || '', price: Number(product.price), qty });
      await conn.query('UPDATE products SET stock = stock - ? WHERE id=?', [qty, product.id]);
    }

    const shipping = delivery === 'delivery' ? 8 : 0;
    const total = subtotal + shipping;
    const orderId = 'IRS-' + Math.floor(1000 + Math.random() * 9000) + '-' + Date.now().toString().slice(-4);

    await conn.query(
      'INSERT INTO orders (id,name,phone,delivery,address,payment,total,status) VALUES (?,?,?,?,?,?,?,?)',
      [orderId, name, phone, delivery, address || '', payment || '', total, 'მოლოდინში']
    );
    for (const li of lineItems) {
      await conn.query(
        'INSERT INTO order_items (order_id,product_id,name,size,color,price,qty) VALUES (?,?,?,?,?,?,?)',
        [orderId, li.productId, li.name, li.size, li.color, li.price, li.qty]
      );
    }

    await conn.commit();
    res.json({ id: orderId, total, status: 'მოლოდინში', items: lineItems });
  } catch (err) {
    await conn.rollback();
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'შეკვეთის გაფორმება ვერ მოხერხდა' });
  } finally {
    conn.release();
  }
});

/* ================= ADMIN AUTH ================= */
app.post('/api/admin/login', async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'პაროლი აუცილებელია' });
  const ok = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);
  if (!ok) return res.status(401).json({ error: 'არასწორი პაროლი' });
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

/* ================= ADMIN: PRODUCTS / CATEGORIES / ORDERS ================= */
// Bulk-replace is intentionally simple: the admin panel always sends the full
// current list after an add/edit/delete, and only a valid admin JWT can call this.
app.put('/api/admin/products', requireAdmin, async (req, res) => {
  const products = req.body.products || [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ids = products.map(p => p.id);
    for (const p of products) {
      await conn.query(
        `INSERT INTO products (id,name,category,price,stock,sizes,colors,icon,image,badge)
         VALUES (?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name),category=VALUES(category),price=VALUES(price),
           stock=VALUES(stock),sizes=VALUES(sizes),colors=VALUES(colors),icon=VALUES(icon),
           image=VALUES(image),badge=VALUES(badge)`,
        [p.id, p.name, p.category, p.price, p.stock, JSON.stringify(p.sizes || []), JSON.stringify(p.colors || []), p.icon || 'ic-dress', p.image || '', p.badge || '']
      );
    }
    if (ids.length) {
      await conn.query(`DELETE FROM products WHERE id NOT IN (${ids.map(() => '?').join(',')})`, ids);
    } else {
      await conn.query('DELETE FROM products');
    }
    await conn.commit();
    const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json(rows.map(parseProduct));
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'პროდუქტების შენახვა ვერ მოხერხდა' });
  } finally {
    conn.release();
  }
});

app.put('/api/admin/categories', requireAdmin, async (req, res) => {
  const categories = req.body.categories || [];
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM categories');
    for (const name of categories) {
      await conn.query('INSERT IGNORE INTO categories (name) VALUES (?)', [name]);
    }
    await conn.commit();
    res.json(categories);
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: 'კატეგორიების შენახვა ვერ მოხერხდა' });
  } finally {
    conn.release();
  }
});

app.get('/api/admin/orders', requireAdmin, async (req, res) => {
  const [orders] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  const [items] = await pool.query('SELECT * FROM order_items');
  const byOrder = {};
  items.forEach(it => { (byOrder[it.order_id] ||= []).push(it); });
  res.json(orders.map(o => ({
    ...o,
    total: Number(o.total),
    date: o.created_at.toISOString().slice(0, 10),
    items: (byOrder[o.id] || []).map(it => ({ ...it, price: Number(it.price) })),
  })));
});

app.patch('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: 'სტატუსი აუცილებელია' });
  await pool.query('UPDATE orders SET status=? WHERE id=?', [status, req.params.id]);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`IRIS API running on port ${PORT}`));
