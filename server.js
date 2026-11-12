'use strict';

require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');

const requiredEnv = ['DATABASE_URL', 'SESSION_SECRET'];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

if (process.env.SESSION_SECRET.length < 32) {
  console.error('SESSION_SECRET must be at least 32 characters long.');
  process.exit(1);
}

const app = express();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: true },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '30kb' }));
app.use(session({
  store: new PgSession({
    pool,
    tableName: 'user_sessions',
    createTableIfMissing: true
  }),
  name: 'devstack.sid',
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (role IN ('customer','admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      price NUMERIC(12,2) NOT NULL CHECK (price > 0),
      category VARCHAR(80) NOT NULL,
      image_url TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id),
      total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
      status VARCHAR(30) NOT NULL DEFAULT 'Pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id BIGINT REFERENCES products(id),
      product_title VARCHAR(160) NOT NULL,
      unit_price NUMERIC(12,2) NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0)
    );
    CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders(user_id);
  `);

  const seedProducts = [
    ['Modern Web Development', 19.99, 'Book', 'https://placehold.co/600x400?text=Web+Development'],
    ['UX Design Essentials', 14.99, 'Book', 'https://placehold.co/600x400?text=UX+Design'],
    ['Developer UI Kit', 29.99, 'UI Kit', 'https://placehold.co/600x400?text=Developer+UI+Kit']
  ];
  const count = await pool.query('SELECT COUNT(*)::int AS count FROM products');
  if (count.rows[0].count === 0) {
    for (const product of seedProducts) {
      await pool.query(
        'INSERT INTO products (title, price, category, image_url) VALUES ($1,$2,$3,$4)',
        product
      );
    }
  }

  // Optional first administrator. Set both variables before starting the server.
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    if (!emailPattern.test(email) || process.env.ADMIN_PASSWORD.length < 12) {
      throw new Error('ADMIN_EMAIL must be valid and ADMIN_PASSWORD must be at least 12 characters.');
    }
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await pool.query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('Administrator', $1, $2, 'admin')
      ON CONFLICT (email) DO UPDATE SET role = 'admin'
    `, [email, hash]);
  }
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in first.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }
  next();
}

app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || name.length > 120 || !emailPattern.test(email) || password.length < 10 || password.length > 200) {
      return res.status(400).json({ error: 'Enter a valid name, email, and password of at least 10 characters.' });
    }
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO users (name,email,password_hash) VALUES ($1,$2,$3)
       RETURNING id,name,email,role`, [name, email, hash]
    );
    req.session.user = result.rows[0];
    res.status(201).json({ user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    next(error);
  }
});

app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT id,name,email,password_hash,role FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      req.session.save(saveError => {
        if (saveError) return next(saveError);
        res.json({ user: req.session.user });
      });
    });
  } catch (error) { next(error); }
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not signed in.' });
  res.json({ user: req.session.user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Could not sign out.' });
    res.clearCookie('devstack.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.json({ ok: true });
  });
});

app.get('/api/products', async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT id,title,price,category,image_url FROM products WHERE active=TRUE ORDER BY created_at DESC,id DESC'
    );
    res.json({ products: result.rows });
  } catch (error) { next(error); }
});

app.post('/api/admin/products', requireAdmin, async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const category = String(req.body.category || '').trim();
    const image = String(req.body.image || '').trim();
    const price = Number(req.body.price);
    let parsedUrl;
    try { parsedUrl = new URL(image); } catch { parsedUrl = null; }
    if (title.length < 2 || title.length > 160 || category.length < 1 || category.length > 80 ||
        !Number.isFinite(price) || price <= 0 || !parsedUrl || parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Enter a valid title, positive price, category and HTTPS image URL.' });
    }
    const result = await pool.query(
      `INSERT INTO products (title,price,category,image_url)
       VALUES ($1,$2,$3,$4) RETURNING id,title,price,category,image_url`,
      [title, price, category, image]
    );
    res.status(201).json({ product: result.rows[0] });
  } catch (error) { next(error); }
});

app.post('/api/orders', requireAuth, async (req, res, next) => {
  const items = req.body.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return res.status(400).json({ error: 'Your cart is empty or contains too many different products.' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const normalized = new Map();
    for (const item of items) {
      const id = Number(item.product_id);
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 99) {
        throw Object.assign(new Error('Invalid cart item.'), { status: 400 });
      }
      normalized.set(id, (normalized.get(id) || 0) + quantity);
    }
    const ids = [...normalized.keys()];
    const result = await client.query(
      'SELECT id,title,price FROM products WHERE active=TRUE AND id = ANY($1::bigint[]) FOR SHARE',
      [ids]
    );
    if (result.rows.length !== ids.length) throw Object.assign(new Error('A product is no longer available.'), { status: 400 });

    let total = 0;
    const orderItems = result.rows.map(product => {
      const quantity = normalized.get(Number(product.id));
      const unitPrice = Number(product.price);
      total += unitPrice * quantity;
      return { product, quantity, unitPrice };
    });
    const orderResult = await client.query(
      'INSERT INTO orders (user_id,total) VALUES ($1,$2) RETURNING id,total,status,created_at',
      [req.session.user.id, total.toFixed(2)]
    );
    const order = orderResult.rows[0];
    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id,product_id,product_title,unit_price,quantity)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, item.product.id, item.product.title, item.unitPrice, item.quantity]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ order: { ...order, total: Number(order.total) } });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally { client.release(); }
});

app.get('/api/admin/orders', requireAdmin, async (req, res, next) => {
  try {
    const result = await pool.query(`
      SELECT o.id, o.total, o.status, o.created_at,
             u.name AS customer_name, u.email,
             COALESCE(json_agg(json_build_object(
               'title', oi.product_title, 'price', oi.unit_price, 'quantity', oi.quantity
             )) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
      FROM orders o
      JOIN users u ON u.id=o.user_id
      LEFT JOIN order_items oi ON oi.order_id=o.id
      GROUP BY o.id,u.name,u.email
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
    res.json({ orders: result.rows });
  } catch (error) { next(error); }
});

app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
// Serve only the public website files; never expose server.js, package.json or .env.
app.get(['/', '/index.html'], (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.use('/css', express.static(path.join(__dirname, 'css'), { dotfiles: 'deny' }));
app.use('/js', express.static(path.join(__dirname, 'js'), { dotfiles: 'deny' }));

app.use((error, req, res, next) => {
  console.error(error);
  const status = Number(error.status) || 500;
  res.status(status).json({ error: status === 500 ? 'A server error occurred. Please try again.' : error.message });
});

const port = Number(process.env.PORT || 3000);
initializeDatabase()
  .then(() => app.listen(port, () => console.log(`DevStackReads running at http://localhost:${port}`)))
  .catch(error => { console.error('Database initialization failed:', error); process.exit(1); });

process.on('SIGTERM', async () => { await pool.end(); process.exit(0); });
