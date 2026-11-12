import { sql, json, method, ensureAdmin } from "./_db.js";

const statements = [
`CREATE TABLE IF NOT EXISTS users (
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'customer'
 CHECK (role IN ('customer','editor','admin')),
 status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS sessions (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS books (
 id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, price NUMERIC(12,2) NOT NULL CHECK(price >= 0),
 image_url TEXT, description TEXT DEFAULT '', stock INTEGER DEFAULT 0, active BOOLEAN DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS articles (
 id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, author TEXT NOT NULL,
 category TEXT NOT NULL DEFAULT 'General', excerpt TEXT DEFAULT '', content TEXT NOT NULL,
 image_url TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS orders (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
 customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, items JSONB NOT NULL,
 total NUMERIC(12,2) NOT NULL, status TEXT NOT NULL DEFAULT 'pending'
 CHECK(status IN ('pending','paid','processing','completed','cancelled')),
 payment_reference TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
 id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS site_settings (
 key TEXT PRIMARY KEY, value JSONB NOT NULL DEFAULT '{}'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS events (
 id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', event_date TIMESTAMPTZ,
 location TEXT DEFAULT '', image_url TEXT, status TEXT NOT NULL DEFAULT 'published'
 CHECK(status IN ('draft','published')), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS memberships (
 id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '', price NUMERIC(12,2) DEFAULT 0,
 duration TEXT DEFAULT '', active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE TABLE IF NOT EXISTS audit_logs (
 id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
 action TEXT NOT NULL, target_type TEXT, target_id TEXT, details JSONB DEFAULT '{}'::jsonb,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`,
`CREATE INDEX IF NOT EXISTS idx_articles_status_date ON articles(status, published_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC)`,
`CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at)`
];

export default async function handler(req, res) {
  if (!method(req, res, ["POST"])) return;
  if (!process.env.DATABASE_URL) return json(res, 500, { success:false, message:"DATABASE_URL is not configured." });
  try {
    for (const statement of statements) await sql.query(statement);
    await ensureAdmin();
    json(res, 200, { success:true, message:"Database tables are ready. Remove or protect this setup endpoint after initialization." });
  } catch (error) {
    console.error(error);
    json(res, 500, { success:false, message:"Database setup failed. Check Vercel logs." });
  }
}
