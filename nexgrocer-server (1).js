/* ═══════════════════════════════════════════════════════════════════════════
   NEXGROCER — ALL-IN-ONE SERVER (Database + Backend + Frontend)
   ═══════════════════════════════════════════════════════════════════════════

   Ye ek SINGLE FILE hai. Kuch aur file ki zaroorat nahi.
   - Database : SQLite (auto file `nexgrocer.db` banegi)
   - Backend  : Express APIs
   - Frontend : HTML embedded (neeche SECTION 18 me)

   ── CHALANE KA TARIKA ──────────────────────────────────────────────
   1) npm init -y
   2) npm install express better-sqlite3 bcryptjs jsonwebtoken cors
   3) node server.js
   4) Browser: http://localhost:3000

   Admin account seed hota hai env se (ADMIN_EMAIL / ADMIN_PASS).
   Credentials login page pe nahi dikhte.

   ═══ KAHAN KYA ADD KARNA HAI (AI GUIDE) ═══

   [A] NAYA DATABASE TABLE
       → SECTION 2 (DB_SCHEMA) me jao, CREATE TABLE statement add karo.
       → File restart karne pe auto-create ho jayega.

   [B] NAYA API ENDPOINT
       → SECTION 4-17 me relevant section dhundho.
       → Pattern same hai: app.get/post/patch/delete + auth middleware.

   [C] NAYA FRONTEND PAGE
       → SECTION 18 (FRONTEND_HTML) me jao.
       → Marker dhundo: <!-- PAGE_TEMPLATE -->
       → Uske pattern se <section class="page" id="page-YOURNAME"> banao.
       → Sidebar nav me <a data-page="YOURNAME"> add karo.

   [D] EXISTING TABLE ME NAYA COLUMN
       → SECTION 2 me table dhundo.
       → ALTER TABLE ... ADD COLUMN likho, ya existing CREATE me add karo.
       → SQLite purane DB me auto-add nahi karta, migration manually.

   [E] TELEGRAM BOT CONNECT
       → SECTION 17 (BOT API) me endpoint ready hai: POST /api/bot/order
       → Header: X-Bot-Secret
       → Body: { email, tracking_link }  ya  { telegram_id, tracking_link }

   [F] FRONTEND KE STYLES
       → SECTION 18 me <style> tag me :root variables hain.

   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

/* [SECTION 1] ─── IMPORTS ────────────────────────────────────────────────── */
const express    = require('express');
const Database   = require('better-sqlite3');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const path       = require('path');
const crypto     = require('crypto');
const fs         = require('fs');
const os         = require('os');
const http       = require('http');
const { spawn }  = require('child_process');

/* [SECTION 2] ─── CONFIG ─────────────────────────────────────────────────── */
const CONFIG = {
  PORT:        process.env.PORT        || 3000,
  JWT_SECRET:  process.env.JWT_SECRET  || 'nexgrocer_jwt_change_me_in_production',
  BOT_SECRET:  process.env.BOT_SECRET  || 'nexgrocer_bot_change_me_in_production',
  DB_FILE:     process.env.DB_FILE     || path.join(__dirname, 'nexgrocer.db'),
  ADMIN_EMAIL: process.env.ADMIN_EMAIL || 'userlinkbot@gmail.com',
  ADMIN_PASS:  process.env.ADMIN_PASS  || 'anshgarg90',
  PYAPI_PORT:  Number(process.env.PYAPI_PORT || 8001),
  OWNER_TG_ID: String(process.env.OWNER_TG_ID || '2091533034'),
  BOOT_BOT_TOKEN: process.env.BOT_TOKEN || '8933676587:AAHnSaNlxWX_WjoA7awsuvFLY7V_fS4kTNk',
  ALLOWED_BOT_USERNAMES: ['userxlinks_bot'],
  BLOCKED_BOT_USERNAMES: ['userxadmiin_bot', 'userxadmin_bot'],
  APP_URL: String(process.env.APP_URL || process.env.HOST_URL || process.env.GITHUB_PAGES_URL || 'https://userxlinks.github.io/nexgrocer/').replace(/\/?$/, '/'),
  GITHUB_PAGES_URL: String(process.env.APP_URL || process.env.HOST_URL || process.env.GITHUB_PAGES_URL || 'https://userxlinks.github.io/nexgrocer/').replace(/\/?$/, '/')
};

/* [SECTION 3] ─── DATABASE (SQLite) ──────────────────────────────────────── */
const db = new Database(CONFIG.DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 8000');
db.pragma('foreign_keys = ON');

/* [SECTION 3.1] ── Schema (saari tables) ─────────────────────────────────── */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    phone         TEXT,
    telegram_id   TEXT UNIQUE,
    role          TEXT NOT NULL DEFAULT 'user',    -- 'user' | 'admin'
    status        TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'inactive'
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    sku            TEXT UNIQUE NOT NULL,
    name           TEXT NOT NULL,
    emoji          TEXT DEFAULT '📦',
    category       TEXT,
    purchase_price REAL NOT NULL DEFAULT 0,
    selling_price  REAL NOT NULL DEFAULT 0,
    current_stock  REAL NOT NULL DEFAULT 0,
    minimum_stock  REAL NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'active',
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_carts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity   REAL NOT NULL CHECK (quantity > 0),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id),
    FOREIGN KEY(user_id)    REFERENCES users(id)    ON DELETE CASCADE,
    FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS customers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    phone      TEXT,
    address    TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS orders (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id      TEXT NOT NULL,
    user_id       INTEGER NOT NULL,
    tracking_link TEXT,
    source        TEXT NOT NULL DEFAULT 'bot',   -- 'bot' | 'manual'
    status        TEXT NOT NULL DEFAULT 'new',   -- new|pending|processing|ready|delivered|cancelled|failed
    sale_value    REAL NOT NULL DEFAULT 0,
    purchase_cost REAL NOT NULL DEFAULT 0,
    profit        REAL NOT NULL DEFAULT 0,
    remarks       TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    delivered_at  DATETIME,
    UNIQUE(user_id, order_id),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id      INTEGER NOT NULL,
    product_id    INTEGER NOT NULL,
    product_name  TEXT NOT NULL,
    quantity      REAL NOT NULL,
    purchase_price REAL NOT NULL,
    selling_price REAL NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sales (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    bill_number   TEXT UNIQUE NOT NULL,
    order_id      INTEGER,
    customer_id   INTEGER,
    customer_name TEXT,
    items_json    TEXT NOT NULL,
    total_amount  REAL NOT NULL,
    purchase_cost REAL NOT NULL DEFAULT 0,
    profit        REAL NOT NULL DEFAULT 0,
    reversed_at   DATETIME,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(order_id)    REFERENCES orders(id),
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT NOT NULL,
    description TEXT,
    amount      REAL NOT NULL CHECK (amount >= 0),
    expense_date DATE DEFAULT CURRENT_DATE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS inventory_transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id    INTEGER NOT NULL,
    type          TEXT NOT NULL,   -- purchase|order|sale|adjustment|return|damaged|cancel_reversal
    quantity      REAL NOT NULL,   -- signed (+/-)
    balance_after REAL NOT NULL,
    reference     TEXT,
    note          TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS activity_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    icon       TEXT,
    color      TEXT DEFAULT 'cyan',
    text       TEXT NOT NULL,
    actor      TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    key        TEXT PRIMARY KEY,
    value      TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_credentials (
    user_id        INTEGER PRIMARY KEY,
    password_plain TEXT NOT NULL,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS bots (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    token      TEXT UNIQUE NOT NULL,
    username   TEXT,
    tg_bot_id  TEXT UNIQUE,
    enabled    INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_orders_user    ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_user_oid ON orders(user_id, order_id);
  CREATE INDEX IF NOT EXISTS idx_sales_created  ON sales(created_at);
  CREATE INDEX IF NOT EXISTS idx_ledger_product ON inventory_transactions(product_id);
`);

try {
  const info = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'").get();
  if (info && info.sql && /order_id\s+TEXT UNIQUE/i.test(info.sql) && !/UNIQUE\(user_id,\s*order_id\)/i.test(info.sql)) {
    db.pragma('foreign_keys = OFF');
    db.exec(`
      CREATE TABLE IF NOT EXISTS orders_iso (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id      TEXT NOT NULL,
        user_id       INTEGER NOT NULL,
        tracking_link TEXT,
        source        TEXT NOT NULL DEFAULT 'bot',
        status        TEXT NOT NULL DEFAULT 'new',
        sale_value    REAL NOT NULL DEFAULT 0,
        purchase_cost REAL NOT NULL DEFAULT 0,
        profit        REAL NOT NULL DEFAULT 0,
        remarks       TEXT,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered_at  DATETIME,
        UNIQUE(user_id, order_id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
      INSERT OR IGNORE INTO orders_iso
        (id,order_id,user_id,tracking_link,source,status,sale_value,purchase_cost,profit,remarks,created_at,delivered_at)
        SELECT id,order_id,user_id,tracking_link,source,status,sale_value,purchase_cost,profit,remarks,created_at,delivered_at FROM orders;
      DROP TABLE orders;
      ALTER TABLE orders_iso RENAME TO orders;
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_user_oid ON orders(user_id, order_id);
    `);
    db.pragma('foreign_keys = ON');
  }
} catch (e) {
  try { db.pragma('foreign_keys = ON'); } catch (_) {}
  console.error('[orders isolate]', e.message);
}

function addCol(table, col, defSql) {
  try {
    const cols = db.prepare('PRAGMA table_info(' + table + ')').all().map(c => c.name);
    if (!cols.includes(col)) db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + defSql);
  } catch (e) { console.error('[migrate]', table, col, e.message); }
}
addCol('users', 'bot_id', 'bot_id INTEGER');
addCol('orders', 'bot_id', 'bot_id INTEGER');
addCol('products', 'bot_id', 'bot_id INTEGER');
addCol('user_carts', 'bot_id', 'bot_id INTEGER');
addCol('sales', 'bot_id', 'bot_id INTEGER');
addCol('customers', 'bot_id', 'bot_id INTEGER');
addCol('expenses', 'bot_id', 'bot_id INTEGER');
try { db.exec('CREATE INDEX IF NOT EXISTS idx_users_bot ON users(bot_id)'); } catch (_) {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_orders_bot ON orders(bot_id)'); } catch (_) {}
try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_bot_tg ON users(bot_id, telegram_id)'); } catch (_) {}

function saveUserCredential(userId, passwordPlain) {
  if (!userId || passwordPlain == null || passwordPlain === '') return;
  db.prepare(`INSERT INTO user_credentials (user_id,password_plain,updated_at)
              VALUES (?,?,CURRENT_TIMESTAMP)
              ON CONFLICT(user_id) DO UPDATE SET password_plain=excluded.password_plain, updated_at=CURRENT_TIMESTAMP`)
    .run(userId, String(passwordPlain));
}

/* [SECTION 3.2] ── Seed default admin ────────────────────────────────────── */
(function seed(){
  const hash = bcrypt.hashSync(CONFIG.ADMIN_PASS, 10);
  const byNew = db.prepare('SELECT * FROM users WHERE email=?').get(CONFIG.ADMIN_EMAIL);
  const oldAdmin = db.prepare("SELECT * FROM users WHERE role='admin' AND email!=? ORDER BY id").get(CONFIG.ADMIN_EMAIL);
  if (byNew) {
    db.prepare('UPDATE users SET password_hash=?, role=?, status=? WHERE id=?')
      .run(hash, 'admin', 'active', byNew.id);
    saveUserCredential(byNew.id, CONFIG.ADMIN_PASS);
  } else if (oldAdmin) {
    db.prepare('UPDATE users SET telegram_id=NULL WHERE telegram_id=? AND id!=?').run(oldAdmin.telegram_id, oldAdmin.id);
    db.prepare('UPDATE users SET email=?, password_hash=?, role=?, status=? WHERE id=?')
      .run(CONFIG.ADMIN_EMAIL, hash, 'admin', 'active', oldAdmin.id);
    saveUserCredential(oldAdmin.id, CONFIG.ADMIN_PASS);
  } else {
    const info = db.prepare(`INSERT INTO users (email,password_hash,name,role,status) VALUES (?,?,?,?,?)`)
      .run(CONFIG.ADMIN_EMAIL, hash, 'Admin', 'admin', 'active');
    saveUserCredential(info.lastInsertRowid, CONFIG.ADMIN_PASS);
  }
  console.log('\n  ✓ Admin ready (password not printed)\n');
})();

(function seedCatalog(){
  const n = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (n > 0) return;
  const items = [
    ['MILK','Milk','🥛','Dairy',42,55,30,5],
    ['BREAD','Bread','🍞','Bakery',28,40,40,8],
    ['EGGS','Eggs (12)','🥚','Dairy',70,95,20,4],
    ['RICE','Rice 1kg','🍚','Grocery',55,72,50,10],
    ['ATTA','Atta 5kg','🌾','Grocery',210,260,20,4],
    ['OIL','Oil 1L','🛢️','Grocery',130,165,25,5],
    ['SUGAR','Sugar 1kg','🍬','Grocery',42,55,30,6],
    ['TEA','Tea 250g','🍵','Grocery',95,130,20,4],
    ['COFFEE','Coffee 100g','☕','Grocery',140,190,15,3],
    ['ONION','Onion 1kg','🧅','Veg',28,40,40,8],
    ['POTATO','Potato 1kg','🥔','Veg',22,32,50,10],
    ['TOMATO','Tomato 1kg','🍅','Veg',30,45,30,6],
    ['DAL','Toor Dal 1kg','🫘','Grocery',130,165,20,4],
    ['MAGGI','Maggi Pack','🍜','Packed',14,20,80,12],
    ['BISCUIT','Biscuit Pack','🍪','Packed',20,30,60,10],
    ['BUTTER','Butter 100g','🧈','Dairy',55,72,18,4],
    ['CURD','Curd 400g','🥣','Dairy',28,40,25,5],
    ['PANEER','Paneer 200g','🧀','Dairy',80,110,12,3],
    ['SALT','Salt 1kg','🧂','Grocery',18,25,40,8],
    ['WATER','Water 1L','💧','Packed',16,22,50,10]
  ];
  const ins = db.prepare(`INSERT INTO products (sku,name,emoji,category,purchase_price,selling_price,current_stock,minimum_stock,status)
    VALUES (?,?,?,?,?,?,?,?, 'active')`);
  const led = db.prepare(`INSERT INTO inventory_transactions (product_id,type,quantity,balance_after,note) VALUES (?,?,?,?,?)`);
  const tx = db.transaction(() => {
    for (const it of items) {
      const info = ins.run(...it);
      if (it[6] > 0) led.run(info.lastInsertRowid, 'purchase', it[6], it[6], 'Catalog seed');
    }
  });
  tx();
})();

/* [SECTION 3.3] ── Helpers ──────────────────────────────────────────────── */
const now = () => new Date().toISOString();
const logActivity = (icon, color, text, actor) => {
  try {
    db.prepare('INSERT INTO activity_logs (icon,color,text,actor) VALUES (?,?,?,?)')
      .run(icon || '•', color || 'cyan', text, actor || null);
    // Keep only latest 100
    db.prepare('DELETE FROM activity_logs WHERE id NOT IN (SELECT id FROM activity_logs ORDER BY id DESC LIMIT 100)').run();
  } catch (_) {}
};

/* [SECTION 4] ─── EXPRESS SETUP ──────────────────────────────────────────── */
const app = express();
app.use(cors());
app.use(express.json({ limit: '80mb' }));
app.use((req, res, next) => {
  try {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (host && /monkeycode-ai\.(live|online)/i.test(host)) return next();
    if (host && !/^127\.|localhost/i.test(host)) {
      const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
      const url = proto + '://' + host;
      // Auto-set hosting_url only if not yet set by admin
      if (!getSetting('hosting_url') && !getSetting('github_pages_url')) {
        setSetting('hosting_url', url.replace(/\/?$/, '/'));
        setSetting('github_pages_url', url.replace(/\/?$/, '/'));
      }
    }
  } catch (_) {}
  next();
});

/* [SECTION 5] ─── AUTH MIDDLEWARE ────────────────────────────────────────── */
const signToken = (u) =>
  jwt.sign({ id: u.id, email: u.email, role: u.role }, CONFIG.JWT_SECRET, { expiresIn: '7d' });

function auth(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    const payload = jwt.verify(token, CONFIG.JWT_SECRET);
    const user = db.prepare(
      'SELECT id,email,name,phone,telegram_id,role,status FROM users WHERE id=?'
    ).get(payload.id);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'INVALID_SESSION' });
    req.user = user;
    next();
  } catch { res.status(401).json({ error: 'AUTH_REQUIRED' }); }
}
function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'ADMIN_ONLY' });
  next();
}
function botOnly(req, res, next) {
  if ((req.headers['x-bot-secret'] || '') !== CONFIG.BOT_SECRET)
    return res.status(401).json({ error: 'BOT_UNAUTHORIZED' });
  next();
}
const isEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').toLowerCase());
function getAllBotAdminTgIds() {
  const set = new Set();
  if (CONFIG.OWNER_TG_ID) set.add(String(CONFIG.OWNER_TG_ID).trim());
  try {
    const adminUsers = db.prepare("SELECT telegram_id FROM users WHERE role='admin' AND telegram_id IS NOT NULL AND status='active'").all();
    for (const u of adminUsers) {
      if (u.telegram_id) set.add(String(u.telegram_id).trim());
    }
    const raw = getSetting('telegram_bot_admins');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const item of list) {
          const id = typeof item === 'object' ? item.tg_id : item;
          if (id) set.add(String(id).trim());
        }
      }
    }
  } catch (_) {}
  return Array.from(set);
}

const isOwnerTg = (id) => {
  if (!id) return false;
  const s = String(id).trim();
  return getAllBotAdminTgIds().includes(s);
};

function promoteOwner(tgId, displayName) {
  const sId = String(tgId);
  if (CONFIG.OWNER_TG_ID && sId === String(CONFIG.OWNER_TG_ID).trim()) {
    const admin = db.prepare('SELECT * FROM users WHERE email=?').get(CONFIG.ADMIN_EMAIL);
    if (!admin) return null;
    db.prepare('UPDATE users SET telegram_id=NULL WHERE telegram_id=? AND id!=?').run(sId, admin.id);
    db.prepare('UPDATE users SET telegram_id=?, role=?, status=?, name=? WHERE id=?')
      .run(sId, 'admin', 'active', displayName || admin.name || 'Owner', admin.id);
    return db.prepare('SELECT * FROM users WHERE id=?').get(admin.id);
  }
  const existing = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(sId);
  if (existing) {
    if (existing.role !== 'admin' || existing.status !== 'active') {
      db.prepare("UPDATE users SET role='admin', status='active' WHERE id=?").run(existing.id);
    }
    return db.prepare('SELECT * FROM users WHERE id=?').get(existing.id);
  }
  return ensureTgUser(sId, displayName, 'active', null);
}

function ensureTgUser(tgId, displayName, statusIfNew, botId) {
  const tid = String(tgId);
  const bid = botId || null;
  let user = bid
    ? db.prepare('SELECT * FROM users WHERE telegram_id=? AND bot_id=?').get(tid, bid)
    : null;
  if (!user) user = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(tid);
  if (user) {
    if (bid && user.bot_id !== bid) db.prepare('UPDATE users SET bot_id=? WHERE id=?').run(bid, user.id);
    return db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
  }
  const email = bid ? ('tg' + tid + '.b' + bid + '@telegram.local') : ('tg' + tid + '@telegram.local');
  const existing = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (existing) {
    db.prepare('UPDATE users SET telegram_id=?, bot_id=? WHERE id=?').run(tid, bid, existing.id);
    return db.prepare('SELECT * FROM users WHERE id=?').get(existing.id);
  }
  const plain = crypto.randomBytes(5).toString('hex');
  const hash = bcrypt.hashSync(plain, 10);
  const info = db.prepare(`INSERT INTO users (email,password_hash,name,telegram_id,role,status,bot_id)
                           VALUES (?,?,?,?,?,?,?)`)
    .run(email, hash, displayName || ('User ' + tid), tid, 'user', statusIfNew || 'pending', bid);
  saveUserCredential(info.lastInsertRowid, plain);
  logActivity('👤', 'yellow', `Pending Telegram user: <b>${displayName || tid}</b>`, email);
  return db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
}

async function notifyOwner(token, text) {
  const ids = getAllBotAdminTgIds();
  for (const id of ids) {
    try { await tgSend(token, id, text); } catch (_) {}
  }
}

/* [SECTION 6] ─── API: AUTH ──────────────────────────────────────────────── */

// POST /api/auth/register
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name, phone } = req.body || {};
    if (!isEmail(email))                     return res.status(400).json({ error: 'INVALID_EMAIL' });
    if (!password || password.length < 6)   return res.status(400).json({ error: 'WEAK_PASSWORD' });
    if (!name || !name.trim())              return res.status(400).json({ error: 'NAME_REQUIRED' });
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase()))
      return res.status(409).json({ error: 'EMAIL_EXISTS' });

    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(`INSERT INTO users (email,password_hash,name,phone,role,status)
                             VALUES (?,?,?,?,?,?)`)
      .run(email.toLowerCase(), hash, name.trim(), phone || null, 'user', 'active');
    saveUserCredential(info.lastInsertRowid, password);

    const user = db.prepare('SELECT id,email,name,phone,role,status FROM users WHERE id=?')
      .get(info.lastInsertRowid);
    logActivity('👤', 'green', `New user: <b>${user.name}</b>`, user.email);
    res.status(201).json({ token: signToken(user), user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'CREDENTIALS_REQUIRED' });
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email).toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    if (user.status !== 'active') return res.status(403).json({ error: 'ACCOUNT_INACTIVE' });
    logActivity('🔓', 'cyan', `<b>${user.name}</b> logged in`, user.email);
    res.json({
      token: signToken(user),
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, status: user.status }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

// GET /api/auth/me
app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

/* [SECTION 7] ─── API: PRODUCTS ──────────────────────────────────────────── */

// GET /api/products
app.get('/api/products', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
  res.json({ products: rows });
});

// POST /api/products
app.post('/api/products', auth, adminOnly, (req, res) => {
  try {
    const { sku, name, emoji, category, purchase_price, selling_price, current_stock, minimum_stock } = req.body || {};
    if (!sku || !name) return res.status(400).json({ error: 'SKU_AND_NAME_REQUIRED' });

    const info = db.prepare(`INSERT INTO products
      (sku,name,emoji,category,purchase_price,selling_price,current_stock,minimum_stock)
      VALUES (?,?,?,?,?,?,?,?)`)
      .run(sku, name, emoji || '📦', category || null,
           Number(purchase_price) || 0, Number(selling_price) || 0,
           Number(current_stock) || 0, Number(minimum_stock) || 0);

    const product = db.prepare('SELECT * FROM products WHERE id=?').get(info.lastInsertRowid);

    if (product.current_stock > 0) {
      db.prepare(`INSERT INTO inventory_transactions (product_id,type,quantity,balance_after,note)
                  VALUES (?,?,?,?,?)`)
        .run(product.id, 'purchase', product.current_stock, product.current_stock, 'Initial stock');
    }
    logActivity('📦', 'cyan', `Product <b>${name}</b> added`, req.user.email);
    res.status(201).json({ product });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ error: 'SKU_EXISTS' });
    console.error(e); res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// PATCH /api/products/:id
app.patch('/api/products/:id', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!p) return res.status(404).json({ error: 'NOT_FOUND' });

  const allowed = ['name','emoji','category','purchase_price','selling_price','minimum_stock','status'];
  const updates = [], values = [];
  for (const f of allowed) if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); }
  if (!updates.length) return res.json({ product: p });

  values.push(id);
  db.prepare(`UPDATE products SET ${updates.join(',')} WHERE id=?`).run(...values);
  logActivity('✏️', 'cyan', `Product <b>${p.name}</b> updated`, req.user.email);
  res.json({ product: db.prepare('SELECT * FROM products WHERE id=?').get(id) });
});

// DELETE /api/products/:id  ?hard=1 for real delete
app.delete('/api/products/:id', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!p) return res.status(404).json({ error: 'NOT_FOUND' });
  const hard = String(req.query.hard || '') === '1' || !!(req.body && req.body.hard);
  if (!hard) {
    db.prepare('UPDATE products SET status=? WHERE id=?').run('inactive', id);
    logActivity('🗑️', 'red', `Product #${id} deactivated`, req.user.email);
    return res.json({ ok: true, mode: 'deactivated' });
  }
  try {
    db.prepare('DELETE FROM user_carts WHERE product_id=?').run(id);
    db.prepare('DELETE FROM inventory_transactions WHERE product_id=?').run(id);
    db.prepare('DELETE FROM products WHERE id=?').run(id);
    logActivity('🗑️', 'red', `Product <b>${p.name}</b> deleted`, req.user.email);
    res.json({ ok: true, mode: 'deleted' });
  } catch (e) {
    db.prepare('UPDATE products SET status=?, current_stock=0 WHERE id=?').run('inactive', id);
    res.json({ ok: true, mode: 'deactivated', message: 'Used in orders — deactivated instead' });
  }
});

app.post('/api/products/purge-all', auth, adminOnly, (req, res) => {
  try {
    db.prepare('DELETE FROM user_carts').run();
    db.prepare('DELETE FROM inventory_transactions').run();
    const info = db.prepare('DELETE FROM products').run();
    logActivity('🗑️', 'red', 'All products deleted', req.user.email);
    res.json({ ok: true, deleted: info.changes });
  } catch (e) {
    db.prepare("UPDATE products SET status='inactive', current_stock=0").run();
    res.json({ ok: true, mode: 'deactivated' });
  }
});

app.post('/api/inventory/clear-all', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT id, current_stock FROM products').all();
  const tx = db.transaction(() => {
    const upd = db.prepare('UPDATE products SET current_stock=0 WHERE id=?');
    const led = db.prepare(`INSERT INTO inventory_transactions (product_id,type,quantity,balance_after,note) VALUES (?,?,?,?,?)`);
    for (const p of rows) {
      if (p.current_stock === 0) continue;
      upd.run(p.id);
      led.run(p.id, 'adjustment', -p.current_stock, 0, 'Clear all stock');
    }
  });
  tx();
  logActivity('🧊', 'yellow', 'All stock cleared', req.user.email);
  res.json({ ok: true });
});

/* [SECTION 8] ─── API: INVENTORY (Stock movements + Ledger) ──────────────── */

// POST /api/products/:id/stock  →  add/remove/adjust stock
app.post('/api/products/:id/stock', auth, adminOnly, (req, res) => {
  try {
    const id = Number(req.params.id);
    const { type, quantity, note } = req.body || {};
    const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
    if (!p) return res.status(404).json({ error: 'NOT_FOUND' });

    const qty = Number(quantity);
    if (!qty || qty <= 0) return res.status(400).json({ error: 'INVALID_QUANTITY' });

    const delta = ['purchase','return'].includes(type) ? qty : -qty;
    const newBal = p.current_stock + delta;
    if (newBal < 0) return res.status(409).json({ error: 'INSUFFICIENT_STOCK' });

    const tx = db.transaction(() => {
      db.prepare('UPDATE products SET current_stock=? WHERE id=?').run(newBal, id);
      db.prepare(`INSERT INTO inventory_transactions (product_id,type,quantity,balance_after,note)
                  VALUES (?,?,?,?,?)`)
        .run(id, type || 'adjustment', delta, newBal, note || null);
    });
    tx();
    logActivity(delta > 0 ? '📥' : '📤', delta > 0 ? 'green' : 'yellow',
      `Stock ${delta > 0 ? 'added' : 'removed'}: <b>${p.name}</b> (${delta > 0 ? '+' : ''}${delta})`,
      req.user.email);
    res.json({ product: db.prepare('SELECT * FROM products WHERE id=?').get(id) });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

// GET /api/inventory/ledger
app.get('/api/inventory/ledger', auth, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT t.*, p.name AS product_name, p.emoji AS product_emoji
    FROM inventory_transactions t
    JOIN products p ON p.id=t.product_id
    ORDER BY t.id DESC LIMIT 200
  `).all();
  res.json({ ledger: rows });
});

/* [SECTION 9] ─── API: USERS ─────────────────────────────────────────────── */

// GET /api/users (admin)
app.get('/api/users', auth, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id,u.email,u.name,u.phone,u.telegram_id,u.status,u.role,u.created_at,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS order_count,
      (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id AND o.tracking_link IS NOT NULL AND o.tracking_link!='') AS link_count,
      (SELECT IFNULL(SUM(CASE WHEN o.status='delivered' THEN o.sale_value ELSE 0 END),0) FROM orders o WHERE o.user_id=u.id) AS revenue,
      (SELECT COUNT(*) FROM user_carts c WHERE c.user_id=u.id) AS cart_count
    FROM users u WHERE u.email!=? ORDER BY u.id DESC
  `).all(CONFIG.ADMIN_EMAIL);
  res.json({ users: rows });
});

// GET /api/admin/bot-admins
app.get('/api/admin/bot-admins', auth, adminOnly, (req, res) => {
  try {
    const list = [];
    const seenTg = new Set();
    if (CONFIG.OWNER_TG_ID) {
      seenTg.add(String(CONFIG.OWNER_TG_ID).trim());
      list.push({
        id: 'root',
        name: 'Master Owner',
        telegram_id: String(CONFIG.OWNER_TG_ID).trim(),
        email: CONFIG.ADMIN_EMAIL,
        role: 'owner',
        is_owner: true,
        source: 'config'
      });
    }
    const adminUsers = db.prepare("SELECT id, name, email, telegram_id, role, status FROM users WHERE role='admin'").all();
    for (const u of adminUsers) {
      if (CONFIG.ADMIN_EMAIL && u.email === CONFIG.ADMIN_EMAIL) continue;
      if (u.telegram_id) seenTg.add(String(u.telegram_id).trim());
      list.push({
        id: u.id,
        name: u.name || 'Admin',
        telegram_id: u.telegram_id || null,
        email: u.email,
        role: 'admin',
        is_owner: false,
        source: 'user_account'
      });
    }
    const raw = getSetting('telegram_bot_admins');
    if (raw) {
      try {
        const extra = JSON.parse(raw);
        if (Array.isArray(extra)) {
          for (const item of extra) {
            const tg_id = String(typeof item === 'object' ? item.tg_id : item).trim();
            if (seenTg.has(tg_id)) continue;
            seenTg.add(tg_id);
            list.push({
              id: 'tg_' + tg_id,
              name: (typeof item === 'object' && item.name) ? item.name : ('Telegram Admin (' + tg_id + ')'),
              telegram_id: tg_id,
              email: null,
              role: 'bot_admin',
              is_owner: false,
              source: 'telegram_id',
              added_at: (typeof item === 'object' && item.added_at) ? item.added_at : null
            });
          }
        }
      } catch (_) {}
    }
    res.json({ ok: true, bot_admins: list });
  } catch (e) { res.status(500).json({ error: 'FAILED', message: e.message }); }
});

// POST /api/admin/bot-admins
app.post('/api/admin/bot-admins', auth, adminOnly, (req, res) => {
  try {
    const { user_id, telegram_id, name } = req.body || {};
    if (user_id) {
      const u = db.prepare('SELECT id, name, email FROM users WHERE id=?').get(Number(user_id));
      if (!u) return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User nahi mila' });
      db.prepare("UPDATE users SET role='admin', status='active' WHERE id=?").run(u.id);
      logActivity('👑', 'yellow', `Promoted ${u.name || u.email} to Bot Admin`, req.user.email);
      return res.json({ ok: true, message: `${u.name || u.email} ko Bot Admin bana diya gaya.` });
    }
    const cleanTg = String(telegram_id || '').trim().replace(/[^0-9]/g, '');
    if (!cleanTg) {
      return res.status(400).json({ error: 'INVALID_TG_ID', message: 'Valid Telegram ID chahiye (numbers)' });
    }
    const existing = db.prepare('SELECT id, name, email FROM users WHERE telegram_id=?').get(cleanTg);
    if (existing) {
      db.prepare("UPDATE users SET role='admin', status='active' WHERE id=?").run(existing.id);
      logActivity('👑', 'yellow', `Promoted ${existing.name || cleanTg} to Bot Admin`, req.user.email);
      return res.json({ ok: true, message: `Telegram ID ${cleanTg} (${existing.name}) ko Bot Admin bana diya gaya.` });
    }
    let list = [];
    const raw = getSetting('telegram_bot_admins');
    if (raw) {
      try { list = JSON.parse(raw); if (!Array.isArray(list)) list = []; } catch (_) { list = []; }
    }
    if (!list.some(it => (typeof it === 'object' ? it.tg_id : it) === cleanTg)) {
      list.push({ tg_id: cleanTg, name: (name || '').trim() || ('Admin ' + cleanTg), added_at: new Date().toISOString() });
      setSetting('telegram_bot_admins', JSON.stringify(list));
    }
    logActivity('👑', 'yellow', `Added Telegram ID ${cleanTg} as Bot Admin`, req.user.email);
    res.json({ ok: true, message: `Telegram ID ${cleanTg} ko Bot Admin bana diya gaya.` });
  } catch (e) { res.status(500).json({ error: 'FAILED', message: e.message }); }
});

// DELETE /api/admin/bot-admins
app.delete('/api/admin/bot-admins', auth, adminOnly, (req, res) => {
  try {
    const user_id = req.body?.user_id || req.query.user_id;
    const telegram_id = req.body?.telegram_id || req.query.telegram_id;
    if (user_id) {
      const u = db.prepare('SELECT id, email, name FROM users WHERE id=?').get(Number(user_id));
      if (u && u.email === CONFIG.ADMIN_EMAIL) {
        return res.status(400).json({ error: 'CANNOT_REMOVE_OWNER', message: 'Master Owner ko remove nahi kar sakte' });
      }
      db.prepare("UPDATE users SET role='user' WHERE id=?").run(Number(user_id));
      logActivity('👤', 'gray', `Demoted ${u?.name || u?.email} to normal user`, req.user.email);
      return res.json({ ok: true, message: 'Admin role remove kar diya gaya.' });
    }
    const cleanTg = String(telegram_id || '').trim();
    if (CONFIG.OWNER_TG_ID && cleanTg === String(CONFIG.OWNER_TG_ID).trim()) {
      return res.status(400).json({ error: 'CANNOT_REMOVE_OWNER', message: 'Master Owner TG ID ko remove nahi kar sakte' });
    }
    db.prepare("UPDATE users SET role='user' WHERE telegram_id=? AND email!=?").run(cleanTg, CONFIG.ADMIN_EMAIL);
    const raw = getSetting('telegram_bot_admins');
    if (raw) {
      try {
        let list = JSON.parse(raw);
        if (Array.isArray(list)) {
          list = list.filter(it => (typeof it === 'object' ? it.tg_id : it) !== cleanTg);
          setSetting('telegram_bot_admins', JSON.stringify(list));
        }
      } catch (_) {}
    }
    logActivity('👤', 'gray', `Removed Telegram ID ${cleanTg} from Bot Admins`, req.user.email);
    res.json({ ok: true, message: `Telegram ID ${cleanTg} ko Bot Admin se remove kar diya gaya.` });
  } catch (e) { res.status(500).json({ error: 'FAILED', message: e.message }); }
});

app.get('/api/users/:id/detail', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT id,email,name,phone,telegram_id,status,role,created_at FROM users WHERE id=?').get(id);
  if (!u) return res.status(404).json({ error: 'NOT_FOUND' });
  const cred = db.prepare('SELECT password_plain FROM user_credentials WHERE user_id=?').get(id);
  const orders = db.prepare('SELECT id,order_id,tracking_link,status,sale_value,profit,created_at,delivered_at FROM orders WHERE user_id=? ORDER BY id DESC').all(id);
  const cart = db.prepare(`
    SELECT c.product_id, c.quantity, p.name, p.emoji, p.selling_price
    FROM user_carts c JOIN products p ON p.id=c.product_id WHERE c.user_id=?`).all(id);
  const stats = {
    orders: orders.length,
    links: orders.filter(o => o.tracking_link).length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    pending: orders.filter(o => ['new','pending','processing','ready'].includes(o.status)).length,
    revenue: orders.filter(o => o.status === 'delivered').reduce((a, b) => a + (b.sale_value || 0), 0),
    pending_value: orders.filter(o => ['new','pending','processing','ready'].includes(o.status)).reduce((a, b) => a + (b.sale_value || 0), 0)
  };
  res.json({ user: Object.assign({}, u, { password_plain: cred ? cred.password_plain : null }), stats, orders, cart });
});

// POST /api/users (admin creates user)
app.post('/api/users', auth, adminOnly, (req, res) => {
  try {
    const { email, password, name, phone, telegram_id } = req.body || {};
    if (!isEmail(email))                   return res.status(400).json({ error: 'INVALID_EMAIL' });
    if (!password || password.length < 6) return res.status(400).json({ error: 'WEAK_PASSWORD' });
    if (!name)                            return res.status(400).json({ error: 'NAME_REQUIRED' });
    if (db.prepare('SELECT id FROM users WHERE email=?').get(email.toLowerCase()))
      return res.status(409).json({ error: 'EMAIL_EXISTS' });

    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare(`INSERT INTO users (email,password_hash,name,phone,telegram_id,role,status)
                             VALUES (?,?,?,?,?,?,?)`)
      .run(email.toLowerCase(), hash, name, phone || null, telegram_id || null, 'user', 'active');
    saveUserCredential(info.lastInsertRowid, password);
    logActivity('👤', 'green', `User <b>${name}</b> created`, req.user.email);
    res.status(201).json({ ok: true, id: info.lastInsertRowid });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

// PATCH /api/users/:id
app.patch('/api/users/:id', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const allowed = ['name','phone','telegram_id','status'];
  const updates = [], values = [];
  for (const f of allowed) if (req.body[f] !== undefined) { updates.push(`${f}=?`); values.push(req.body[f]); }
  if (req.body.password) { updates.push('password_hash=?'); values.push(bcrypt.hashSync(req.body.password, 10)); }
  if (!updates.length) return res.json({ ok: true });
  values.push(id);
  db.prepare(`UPDATE users SET ${updates.join(',')} WHERE id=?`).run(...values);
  if (req.body.password) saveUserCredential(id, req.body.password);
  logActivity('✏️', 'cyan', `User #${id} updated`, req.user.email);
  res.json({ ok: true });
});

// DELETE /api/users/:id  ?hard=1 for real delete
app.delete('/api/users/:id', auth, adminOnly, (req, res) => {
  const id = Number(req.params.id);
  const hard = String(req.query.hard || '') === '1' || !!(req.body && req.body.hard);
  if (!hard) {
    db.prepare('UPDATE users SET status=? WHERE id=?').run('inactive', id);
    logActivity('🚫', 'red', `User #${id} deactivated`, req.user.email);
    return res.json({ ok: true, mode: 'deactivated' });
  }
  try {
    db.prepare('DELETE FROM user_carts WHERE user_id=?').run(id);
    db.prepare('DELETE FROM user_credentials WHERE user_id=?').run(id);
    const oids = db.prepare('SELECT id FROM orders WHERE user_id=?').all(id).map(r => r.id);
    for (const oid of oids) db.prepare('DELETE FROM order_items WHERE order_id=?').run(oid);
    db.prepare('DELETE FROM orders WHERE user_id=?').run(id);
    db.prepare("DELETE FROM users WHERE id=? AND role!='admin'").run(id);
    logActivity('🗑️', 'red', `User #${id} deleted`, req.user.email);
    res.json({ ok: true, mode: 'deleted' });
  } catch (e) {
    db.prepare('UPDATE users SET status=? WHERE id=?').run('inactive', id);
    res.json({ ok: true, mode: 'deactivated' });
  }
});

/* [SECTION 10] ─── API: USER CARTS ──────────────────────────────────────── */

// GET /api/users/:id/cart
app.get('/api/users/:id/cart', auth, adminOnly, (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.product_id, c.quantity, p.name, p.emoji, p.selling_price, p.purchase_price
    FROM user_carts c JOIN products p ON p.id=c.product_id
    WHERE c.user_id=? ORDER BY c.id
  `).all(Number(req.params.id));
  res.json({ cart: rows });
});

// PUT /api/users/:id/cart  (replace entire cart)
app.put('/api/users/:id/cart', auth, adminOnly, (req, res) => {
  try {
    const id = Number(req.params.id);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM user_carts WHERE user_id=?').run(id);
      const ins = db.prepare('INSERT INTO user_carts (user_id,product_id,quantity) VALUES (?,?,?)');
      for (const it of items) {
        if (!it.product_id || !it.quantity) continue;
        ins.run(id, Number(it.product_id), Number(it.quantity));
      }
    });
    tx();
    logActivity('🛒', 'purple', `Cart assigned to user #${id} (${items.length} items)`, req.user.email);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

/* [SECTION 11] ─── API: CUSTOMERS ───────────────────────────────────────── */

app.get('/api/customers', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM customers ORDER BY id DESC').all();
  res.json({ customers: rows });
});

app.post('/api/customers', auth, adminOnly, (req, res) => {
  const { name, phone, address } = req.body || {};
  if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });
  const info = db.prepare('INSERT INTO customers (name,phone,address) VALUES (?,?,?)')
    .run(name, phone || null, address || null);
  logActivity('👥', 'cyan', `Customer <b>${name}</b> added`, req.user.email);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.delete('/api/customers/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM customers WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

/* [SECTION 12] ─── API: ORDERS ──────────────────────────────────────────── */

function isInternalOrderCode(id) {
  return /^IM[-_]/i.test(String(id || '').replace(/^#/, ''));
}
function extractShareId(text) {
  const s = String(text || '').trim();
  if (/^[A-Za-z0-9_-]{5,}$/.test(s) && /[A-Za-z]/.test(s)) return s;
  const m = s.match(/(?:ofo|toing)\/track\/([A-Za-z0-9_-]+)/i)
    || s.match(/track\/v4\/([A-Za-z0-9_-]+)/i)
    || s.match(/[?&]orderId=([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}
function extractSwiggyUrls(text) {
  return (String(text || '').match(/https?:\/\/[^\s<>"'\]\)]+/gi) || [])
    .map(u => u.replace(/[),.;]+$/, ''))
    .filter(u => /swiggy\.com/i.test(u) || /ofo\/track|toing\/track/i.test(u));
}
function extractOrderId(text) {
  const s = String(text || '');
  const swiggy = s.match(/Swiggy\s*Order\s*ID[:#\s]+#?([0-9]{10,20})/i);
  if (swiggy) return swiggy[1];
  const labeled = [];
  const re = /(?:📦\s*)?(?:Order\s*ID|Swiggy\s*Order\s*ID|order[\s_-]?id|oid)[:#\s]+#?([0-9A-Za-z\-]{4,40})/gi;
  let m;
  while ((m = re.exec(s))) labeled.push(m[1].replace(/^#/, '').trim());
  const numeric = labeled.filter(x => /^[0-9]{10,20}$/.test(x) && !isInternalOrderCode(x));
  if (numeric.length) return numeric[0];
  const usable = labeled.filter(x => !isInternalOrderCode(x));
  if (usable.length) return usable[0];
  const longNum = s.match(/\b([0-9]{12,20})\b/);
  if (longNum) return longNum[1];
  const patterns = [
    /[?&]orderID=([0-9]{3}-[0-9]{7}-[0-9]{7})/i,
    /[?&](?:order_?id|oid|order_?no|tracking_?id|shipment_?id)=([A-Za-z0-9\-_]{5,40})/i,
    /\/(?:orders?|track|tracking|shipment|awb|consignment)\/([A-Za-z0-9\-_]{5,40})/i
  ];
  for (const p of patterns) {
    const hit = s.match(p);
    if (hit && hit[1] && !isInternalOrderCode(hit[1])) return hit[1].trim();
  }
  const tokens = (s.match(/[A-Za-z0-9\-_]{8,40}/g) || [])
    .filter(t => /\d/.test(t) && !/^https?$/i.test(t) && !isInternalOrderCode(t) && !/^[A-Za-z]{2,4}-?\d{3,6}$/i.test(t));
  return tokens.length ? tokens[0] : null;
}

function parseTrackingPayload(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const urls = extractSwiggyUrls(raw);
  const allUrls = urls.length ? urls : (raw.match(/https?:\/\/[^\s<>"'\]\)]+/gi) || []).map(u => u.replace(/[),.;]+$/, ''));
  const oids = [];
  const re = /(?:📦\s*)?(?:Swiggy\s*Order\s*ID|Order\s*ID|order[\s_-]?id|oid)[:#\s]+#?([0-9A-Za-z\-]{4,40})/gi;
  let m;
  while ((m = re.exec(raw))) {
    const id = m[1].replace(/^#/, '').trim();
    if (!isInternalOrderCode(id)) oids.push(id);
  }
  const preferred = oids.filter(x => /^[0-9]{10,20}$/.test(x));
  const oidList = preferred.length ? preferred : oids;
  const pairs = [];
  if (allUrls.length) {
    allUrls.forEach((url, i) => {
      const oid = oidList[i] || oidList[0] || extractOrderId(raw);
      if (oid) pairs.push({ tracking_link: url, order_id: oid, share_id: extractShareId(url) });
    });
  } else if (oidList.length) {
    oidList.forEach(oid => pairs.push({ tracking_link: oid, order_id: oid, share_id: extractShareId(raw) }));
  } else {
    const oid = extractOrderId(raw);
    if (oid) pairs.push({ tracking_link: raw, order_id: oid, share_id: extractShareId(raw) });
  }
  const seen = new Set();
  return pairs.filter(p => {
    const k = p.order_id + '|' + p.tracking_link;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// POST /api/orders  →  admin manually creates order for a user with tracking link
app.post('/api/orders', auth, adminOnly, (req, res) => {
  try {
    const { user_id, tracking_link } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(Number(user_id));
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    if (user.status !== 'active') return res.status(403).json({ error: 'USER_INACTIVE' });

    const pair = parseTrackingPayload(tracking_link)[0];
    const orderId = pair && pair.order_id;
    const link = pair && pair.tracking_link;
    if (!orderId) return res.status(422).json({ error: 'INVALID_LINK', message: 'Order ID extract nahi hua' });
    if (db.prepare('SELECT id FROM orders WHERE user_id=? AND (order_id=? OR tracking_link=?)').get(user.id, orderId, link))
      return res.status(409).json({ error: 'DUPLICATE', message: `Order ${orderId} already exists for this user` });

    const cart = db.prepare(`
      SELECT c.product_id, c.quantity, p.name, p.purchase_price, p.selling_price
      FROM user_carts c JOIN products p ON p.id=c.product_id
      WHERE c.user_id=? AND p.status='active'
    `).all(user.id);
    if (!cart.length) return res.status(422).json({ error: 'NO_CART', message: 'User ka cart khali hai' });

    let sale = 0, cost = 0;
    for (const it of cart) { sale += it.quantity * it.selling_price; cost += it.quantity * it.purchase_price; }

    const tx = db.transaction(() => {
      const info = db.prepare(`INSERT INTO orders
        (order_id,user_id,tracking_link,source,status,sale_value,purchase_cost,profit)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(orderId, user.id, link, 'manual', 'new', sale, cost, sale - cost);
      const dbId = info.lastInsertRowid;
      const ins = db.prepare(`INSERT INTO order_items
        (order_id,product_id,product_name,quantity,purchase_price,selling_price)
        VALUES (?,?,?,?,?,?)`);
      for (const it of cart) ins.run(dbId, it.product_id, it.name, it.quantity, it.purchase_price, it.selling_price);
      return dbId;
    });
    const dbId = tx();
    logActivity('🛒', 'cyan', `Order <b>#${orderId}</b> created for ${user.name}`, req.user.email);
    res.status(201).json({ ok: true, id: dbId, order_id: orderId, sale_value: sale });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

// GET /api/orders  (admin — filter + search)
app.get('/api/orders', auth, adminOnly, (req, res) => {
  const { status, q } = req.query;
  let sql = `SELECT o.*, u.email, u.name AS user_name
             FROM orders o JOIN users u ON u.id=o.user_id WHERE 1=1`;
  const params = [];
  if (status && status !== 'all') { sql += ' AND o.status=?'; params.push(status); }
  if (q) {
    const like = `%${q}%`;
    sql += ` AND (o.order_id LIKE ? OR u.email LIKE ? OR u.name LIKE ? OR o.tracking_link LIKE ?)`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY o.id DESC LIMIT 300';
  const rows = db.prepare(sql).all(...params);
  const getItems = db.prepare('SELECT product_name, quantity FROM order_items WHERE order_id=?');
  for (const o of rows) o.items = getItems.all(o.id);
  res.json({ orders: rows });
});

// GET /api/my/orders  (user's own orders)
app.get('/api/my/orders', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  const getItems = db.prepare('SELECT product_name, quantity FROM order_items WHERE order_id=?');
  for (const o of rows) o.items = getItems.all(o.id);
  res.json({ orders: rows });
});

function markOrderDelivered(id) {
  return db.transaction(() => {
    const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
    if (!o) throw new Error('NOT_FOUND');
    if (o.status === 'delivered') return { already: true, order_id: o.order_id };
    if (o.status === 'cancelled') throw new Error('ORDER_CANCELLED');
    const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id);
    for (const it of items) {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
      if (!p) throw new Error('PRODUCT_MISSING:' + it.product_name);
      if (p.current_stock < it.quantity) throw new Error('STOCK_LOW:' + p.name);
    }
    for (const it of items) {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
      const newBal = p.current_stock - it.quantity;
      db.prepare('UPDATE products SET current_stock=? WHERE id=?').run(newBal, p.id);
      db.prepare(`INSERT INTO inventory_transactions
        (product_id,type,quantity,balance_after,reference,note)
        VALUES (?,?,?,?,?,?)`)
        .run(p.id, 'order', -it.quantity, newBal, 'order:' + o.id, 'Order #' + o.order_id);
    }
    db.prepare(`UPDATE orders SET status='delivered', delivered_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    const bill = 'ORD-' + o.order_id;
    const exists = db.prepare('SELECT id FROM sales WHERE bill_number=?').get(bill);
    if (!exists) {
      const itemsJson = JSON.stringify(items.map(i => ({
        product_id: i.product_id, name: i.product_name,
        quantity: i.quantity, rate: i.selling_price,
        lineTotal: i.quantity * i.selling_price
      })));
      db.prepare(`INSERT INTO sales
        (bill_number,order_id,customer_name,items_json,total_amount,purchase_cost,profit)
        VALUES (?,?,?,?,?,?,?)`)
        .run(bill, o.id, null, itemsJson, o.sale_value, o.purchase_cost, o.profit);
    }
    return { ok: true, order_id: o.order_id };
  })();
}

app.patch('/api/orders/:id/deliver', auth, adminOnly, (req, res) => {
  try {
    const result = markOrderDelivered(Number(req.params.id));
    logActivity('✅', 'green', `Order delivered (stock auto-deducted)`, req.user.email);
    res.json(result);
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.startsWith('STOCK_LOW'))   return res.status(409).json({ error: 'INSUFFICIENT_STOCK', product: msg.split(':')[1] });
    if (msg.startsWith('PRODUCT_MISSING')) return res.status(409).json({ error: 'PRODUCT_MISSING', product: msg.split(':')[1] });
    if (msg === 'ORDER_CANCELLED')     return res.status(409).json({ error: 'ORDER_CANCELLED' });
    if (msg === 'NOT_FOUND')           return res.status(404).json({ error: 'NOT_FOUND' });
    console.error(e); res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// PATCH /api/orders/:id/cancel
app.patch('/api/orders/:id/cancel', auth, adminOnly, (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = db.transaction(() => {
      const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      if (!o) throw new Error('NOT_FOUND');
      if (o.status === 'cancelled') return { already: true };

      // Agar pehle delivered hua tha, stock restore
      if (o.status === 'delivered') {
        const items = db.prepare('SELECT * FROM order_items WHERE order_id=?').all(id);
        for (const it of items) {
          const p = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
          if (!p) continue;
          const newBal = p.current_stock + it.quantity;
          db.prepare('UPDATE products SET current_stock=? WHERE id=?').run(newBal, p.id);
          db.prepare(`INSERT INTO inventory_transactions
            (product_id,type,quantity,balance_after,reference,note)
            VALUES (?,?,?,?,?,?)`)
            .run(p.id, 'cancel_reversal', it.quantity, newBal, 'order:' + o.id, 'Cancel reversal');
        }
        db.prepare('UPDATE sales SET reversed_at=CURRENT_TIMESTAMP WHERE order_id=?').run(id);
      }

      db.prepare(`UPDATE orders SET status='cancelled', remarks=COALESCE(?,remarks) WHERE id=?`)
        .run(req.body?.reason || null, id);
      return { ok: true };
    })();
    logActivity('❌', 'red', `Order #${id} cancelled`, req.user.email);
    res.json(result);
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

/* [SECTION 13] ─── API: SALES (manual) ──────────────────────────────────── */

app.get('/api/sales', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM sales WHERE reversed_at IS NULL ORDER BY id DESC LIMIT 300').all();
  res.json({ sales: rows });
});

// POST /api/sales  →  manual sale with items, auto stock deduct
app.post('/api/sales', auth, adminOnly, (req, res) => {
  try {
    const { customer_id, customer_name, items } = req.body || {};
    if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'ITEMS_REQUIRED' });

    const result = db.transaction(() => {
      let total = 0, cost = 0;
      const enriched = [];

      // Stock check
      for (const it of items) {
        const p = db.prepare('SELECT * FROM products WHERE id=?').get(Number(it.product_id));
        if (!p) throw new Error('PRODUCT_MISSING');
        if (p.current_stock < it.quantity) throw new Error('STOCK_LOW:' + p.name);
        const rate = Number(it.rate || p.selling_price);
        const lineTotal = it.quantity * rate;
        const lineCost = it.quantity * p.purchase_price;
        total += lineTotal; cost += lineCost;
        enriched.push({ product_id: p.id, name: p.name, quantity: it.quantity, rate, lineTotal });
      }

      const bill = 'SALE-' + Date.now();
      const info = db.prepare(`INSERT INTO sales
        (bill_number,customer_id,customer_name,items_json,total_amount,purchase_cost,profit)
        VALUES (?,?,?,?,?,?,?)`)
        .run(bill, customer_id || null, customer_name || null,
             JSON.stringify(enriched), total, cost, total - cost);

      // Deduct stock + ledger
      for (const it of enriched) {
        const p = db.prepare('SELECT * FROM products WHERE id=?').get(it.product_id);
        const newBal = p.current_stock - it.quantity;
        db.prepare('UPDATE products SET current_stock=? WHERE id=?').run(newBal, p.id);
        db.prepare(`INSERT INTO inventory_transactions
          (product_id,type,quantity,balance_after,reference,note)
          VALUES (?,?,?,?,?,?)`)
          .run(p.id, 'sale', -it.quantity, newBal, 'sale:' + info.lastInsertRowid, 'Manual sale ' + bill);
      }
      return { id: info.lastInsertRowid, bill, total, profit: total - cost };
    })();

    logActivity('💰', 'purple', `Sale <b>₹${result.total}</b> recorded`, req.user.email);
    res.status(201).json(result);
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.startsWith('STOCK_LOW')) return res.status(409).json({ error: 'INSUFFICIENT_STOCK', product: msg.split(':')[1] });
    if (msg === 'PRODUCT_MISSING')   return res.status(409).json({ error: 'PRODUCT_MISSING' });
    console.error(e); res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/* [SECTION 14] ─── API: EXPENSES ────────────────────────────────────────── */

app.get('/api/expenses', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM expenses ORDER BY id DESC LIMIT 300').all();
  res.json({ expenses: rows });
});

app.post('/api/expenses', auth, adminOnly, (req, res) => {
  const { category, description, amount } = req.body || {};
  if (!category || !amount) return res.status(400).json({ error: 'CATEGORY_AND_AMOUNT_REQUIRED' });
  const info = db.prepare('INSERT INTO expenses (category,description,amount) VALUES (?,?,?)')
    .run(category, description || null, Number(amount));
  logActivity('💸', 'red', `Expense <b>₹${amount}</b> (${category})`, req.user.email);
  res.status(201).json({ id: info.lastInsertRowid });
});

app.delete('/api/expenses/:id', auth, adminOnly, (req, res) => {
  db.prepare('DELETE FROM expenses WHERE id=?').run(Number(req.params.id));
  res.json({ ok: true });
});

/* [SECTION 15] ─── API: DASHBOARD ───────────────────────────────────────── */

app.get('/api/dashboard', auth, adminOnly, (req, res) => {
  const today = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM orders WHERE date(created_at)=date('now')) AS orders_today,
      (SELECT COUNT(*) FROM orders WHERE date(created_at)=date('now') AND status='delivered') AS delivered_today,
      (SELECT COUNT(*) FROM orders WHERE status IN ('new','pending','processing')) AS pending,
      (SELECT COUNT(*) FROM orders WHERE status='cancelled') AS cancelled,
      (SELECT IFNULL(SUM(total_amount),0) FROM sales WHERE reversed_at IS NULL AND date(created_at)=date('now')) AS sales_today,
      (SELECT IFNULL(SUM(profit),0) FROM sales WHERE reversed_at IS NULL AND date(created_at)=date('now')) AS profit_today,
      (SELECT IFNULL(SUM(amount),0) FROM expenses WHERE date(expense_date)=date('now')) AS expenses_today
  `).get();

  const overall = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM orders) AS total_orders,
      (SELECT IFNULL(SUM(total_amount),0) FROM sales WHERE reversed_at IS NULL) AS total_sales,
      (SELECT IFNULL(SUM(profit),0) FROM sales WHERE reversed_at IS NULL) AS total_profit,
      (SELECT IFNULL(SUM(amount),0) FROM expenses) AS total_expenses,
      (SELECT COUNT(*) FROM users WHERE role='user' AND status='active') AS active_users,
      (SELECT IFNULL(SUM(current_stock*purchase_price),0) FROM products WHERE status='active') AS inventory_value,
      (SELECT COUNT(*) FROM products WHERE status='active' AND current_stock<=minimum_stock) AS low_stock,
      (SELECT IFNULL(SUM(sale_value),0) FROM orders WHERE status='delivered') AS overall_revenue,
      (SELECT IFNULL(SUM(sale_value),0) FROM orders WHERE status='delivered' AND date(COALESCE(delivered_at,created_at))=date('now')) AS daily_revenue,
      (SELECT IFNULL(SUM(sale_value),0) FROM orders WHERE date(created_at)=date('now')) AS daily_order_value
  `).get();

  const lowStockProducts = db.prepare(`
    SELECT id,name,emoji,current_stock,minimum_stock FROM products
    WHERE status='active' AND current_stock<=minimum_stock ORDER BY current_stock ASC LIMIT 10
  `).all();

  const recentOrders = db.prepare(`
    SELECT o.id,o.order_id,o.status,o.sale_value,o.created_at,u.name AS user_name
    FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.id DESC LIMIT 10
  `).all();

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const s = db.prepare(`SELECT IFNULL(SUM(total_amount),0) AS sales, IFNULL(SUM(profit),0) AS profit
                          FROM sales WHERE reversed_at IS NULL AND date(created_at)=?`).get(key);
    const o = db.prepare(`SELECT COUNT(*) AS c FROM orders WHERE date(created_at)=?`).get(key);
    last7.push({ date: key, sales: s.sales, profit: s.profit, orders: o.c });
  }

  res.json({
    today: { ...today, net_profit: today.profit_today - today.expenses_today },
    overall: { ...overall, total_net_profit: overall.total_profit - overall.total_expenses },
    lowStockProducts, recentOrders, last7
  });
});

/* [SECTION 16] ─── API: ACTIVITY LOG ────────────────────────────────────── */

app.get('/api/activity', auth, adminOnly, (req, res) => {
  const rows = db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 20').all();
  res.json({ activity: rows });
});

/* [SECTION 17] ─── API: TELEGRAM BOT (external webhook) ─────────────────── */

// POST /api/bot/order
// Body: { email OR telegram_id, tracking_link }
// Header: X-Bot-Secret
app.post('/api/bot/order', botOnly, (req, res) => {
  try {
    const { email, telegram_id, tracking_link } = req.body || {};
    let user = null;
    if (email) user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email).toLowerCase());
    else if (telegram_id) user = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(String(telegram_id));
    if (!user) return res.status(404).json({ result: 'USER_NOT_FOUND' });
    if (user.status !== 'active') return res.status(403).json({ result: 'USER_INACTIVE' });

    const pair = parseTrackingPayload(tracking_link)[0];
    const orderId = pair && pair.order_id;
    const link = pair && pair.tracking_link;
    if (!orderId) return res.status(422).json({ result: 'INVALID', message: 'Order ID extract nahi hua' });
    if (db.prepare('SELECT id FROM orders WHERE user_id=? AND (order_id=? OR tracking_link=?)').get(user.id, orderId, link))
      return res.json({ result: 'DUPLICATE', message: `Order ${orderId} already exists for this user` });

    const cart = db.prepare(`
      SELECT c.product_id, c.quantity, p.name, p.purchase_price, p.selling_price
      FROM user_carts c JOIN products p ON p.id=c.product_id
      WHERE c.user_id=? AND p.status='active'
    `).all(user.id);
    if (!cart.length) return res.status(422).json({ result: 'NO_CART' });

    let sale = 0, cost = 0;
    for (const it of cart) { sale += it.quantity * it.selling_price; cost += it.quantity * it.purchase_price; }

    const tx = db.transaction(() => {
      const info = db.prepare(`INSERT INTO orders
        (order_id,user_id,tracking_link,source,status,sale_value,purchase_cost,profit)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(orderId, user.id, link || null, 'bot', 'new', sale, cost, sale - cost);
      const dbId = info.lastInsertRowid;
      const ins = db.prepare(`INSERT INTO order_items
        (order_id,product_id,product_name,quantity,purchase_price,selling_price)
        VALUES (?,?,?,?,?,?)`);
      for (const it of cart) ins.run(dbId, it.product_id, it.name, it.quantity, it.purchase_price, it.selling_price);
      return dbId;
    });
    const dbId = tx();
    logActivity('🤖', 'cyan', `Bot order <b>#${orderId}</b> received (${user.name})`, 'telegram-bot');
    res.status(201).json({
      result: 'SUCCESS',
      order: { id: dbId, order_id: orderId, sale_value: sale },
      user: { name: user.name, email: user.email }
    });
  } catch (e) { console.error(e); res.status(500).json({ result: 'ERROR' }); }
});

function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  return row ? row.value : null;
}
function setSetting(key, value) {
  db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`)
    .run(key, value == null ? null : String(value));
}
function maskToken(token) {
  if (!token || token.length < 10) return '****';
  return token.slice(0, 6) + '••••' + token.slice(-4);
}
function getAppUrl() {
  const stored = String(getSetting('hosting_url') || getSetting('github_pages_url') || '').trim();
  const u = stored || process.env.APP_URL || process.env.HOST_URL || CONFIG.APP_URL || CONFIG.GITHUB_PAGES_URL;
  return String(u || 'https://userxlinks.github.io/nexgrocer/').replace(/\/?$/, '/');
}
function githubHostUrl() {
  return getAppUrl();
}
function getPublicUrl() {
  return getAppUrl();
}
function liveMark() {
  return '🟢 <b>LIVE</b>';
}
function premiumCard(title, body, badge) {
  const icon = badge || '💎';
  return icon + ' <b>' + title + '</b>  ·  ' + liveMark() + '\n'
    + '━━━━━━━━━━━━━━━━━━━━\n'
    + body;
}
function hostBlock() {
  const u = getAppUrl();
  const isLovable = /lovable\.(app|dev)/i.test(u);
  const isGithub = /github\.io/i.test(u);
  const badge = isLovable ? '⚡ <b>Lovable Live App</b>' : (isGithub ? '🐙 <b>GitHub Host</b>' : '🌐 <b>Web App Portal</b>');
  return badge + '\n🔗 <a href="' + escHtml(u) + '">' + escHtml(u) + '</a>';
}
function tokenHash(token) {
  return crypto.createHash('sha1').update(String(token || '')).digest('hex').slice(0, 12);
}
function listBots() {
  return db.prepare('SELECT * FROM bots ORDER BY id').all();
}
function publicBots() {
  return listBots().map(b => ({
    id: b.id,
    username: b.username || null,
    token_masked: maskToken(b.token),
    enabled: !!b.enabled,
    running: botLoops.has(b.token)
  }));
}
function botByToken(token) {
  return db.prepare('SELECT * FROM bots WHERE token=?').get(token);
}
function saveBots(bots) {
  const keep = new Set((bots || []).filter(b => b && b.token).map(b => b.token));
  for (const row of listBots()) {
    if (!keep.has(row.token)) db.prepare('DELETE FROM bots WHERE id=?').run(row.id);
  }
  for (const b of (bots || [])) {
    if (!b || !b.token) continue;
    const existing = botByToken(b.token);
    if (existing) {
      db.prepare('UPDATE bots SET username=?, tg_bot_id=?, enabled=? WHERE id=?')
        .run(b.username || existing.username, b.tg_bot_id || existing.tg_bot_id, b.enabled == null ? existing.enabled : (b.enabled ? 1 : 0), existing.id);
    } else {
      db.prepare('INSERT INTO bots (token,username,tg_bot_id,enabled) VALUES (?,?,?,?)')
        .run(b.token, b.username || '', b.tg_bot_id || null, b.enabled === 0 ? 0 : 1);
    }
  }
  db.prepare("DELETE FROM settings WHERE key IN ('telegram_bots','telegram_bot_token','telegram_bot_username')").run();
}

function createOrderFromCart(user, tracking_link, source) {
  if (!user) return { ok: false, status: 404, result: 'USER_NOT_FOUND' };
  if (user.status !== 'active') return { ok: false, status: 403, result: 'USER_INACTIVE' };
  const pairs = parseTrackingPayload(tracking_link);
  if (!pairs.length) return { ok: false, status: 422, result: 'INVALID', message: 'Order ID / tracking link nahi mila' };
  const cart = db.prepare(`
    SELECT c.product_id, c.quantity, p.name, p.purchase_price, p.selling_price
    FROM user_carts c JOIN products p ON p.id=c.product_id
    WHERE c.user_id=? AND p.status='active'
  `).all(user.id);
  if (!cart.length) return { ok: false, status: 422, result: 'NO_CART', message: 'Cart khali hai. Admin se product assign karwao (per-link charge = sell price).' };
  let sale = 0, cost = 0;
  for (const it of cart) { sale += it.quantity * it.selling_price; cost += it.quantity * it.purchase_price; }
  let added = 0, dup = 0, lastOrder = null;
  for (const pair of pairs) {
    const exists = db.prepare('SELECT id FROM orders WHERE user_id=? AND (order_id=? OR tracking_link=?)')
      .get(user.id, pair.order_id, pair.tracking_link);
    if (exists) { dup++; continue; }
    const dbId = db.transaction(() => {
      const info = db.prepare(`INSERT INTO orders
        (order_id,user_id,tracking_link,source,status,sale_value,purchase_cost,profit)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(pair.order_id, user.id, pair.tracking_link || null, source || 'bot', 'new', sale, cost, sale - cost);
      const id = info.lastInsertRowid;
      const ins = db.prepare(`INSERT INTO order_items
        (order_id,product_id,product_name,quantity,purchase_price,selling_price)
        VALUES (?,?,?,?,?,?)`);
      for (const it of cart) ins.run(id, it.product_id, it.name, it.quantity, it.purchase_price, it.selling_price);
      return id;
    })();
    added++;
    lastOrder = { id: dbId, order_id: pair.order_id, tracking_link: pair.tracking_link, sale_value: sale };
  }
  if (!added && dup) return { ok: false, status: 200, result: 'DUPLICATE', message: 'Duplicate skipped: ' + dup, added: 0, duplicates: dup };
  if (!added) return { ok: false, status: 422, result: 'INVALID', message: 'Kuch save nahi hua' };
  logActivity('🤖', 'cyan', `Saved ${added} link(s) (${user.name})`, source || 'telegram-bot');
  return {
    ok: true, status: 201, result: 'SUCCESS',
    message: 'Added ' + added + (dup ? ', duplicates skipped ' + dup : ''),
    added, duplicates: dup,
    order: lastOrder,
    user: { name: user.name, email: user.email }
  };
}

async function tgApi(token, method, payload, signal) {
  const res = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload || {}),
    signal
  });
  return res.json();
}

function hostInline(extra) {
  const u = getAppUrl();
  const isLovable = /lovable\.(app|dev)/i.test(u);
  const btnLabel = isLovable ? '⚡ Open Lovable App  ➔' : '🌐 Open Web Portal  ➔';
  const rows = [[{ text: btnLabel, url: u }]];
  if (extra && extra.length) for (const r of extra) rows.push(r);
  return { inline_keyboard: rows };
}
function miniAppInline() {
  return hostInline();
}
function userReplyKb() {
  return {
    keyboard: [
      [{ text: '🌐 Open App' }],
      [{ text: '📝 Submit Link' }, { text: '📦 My Orders' }],
      [{ text: '🛵 Track Order' }, { text: '📊 My Stats' }],
      [{ text: '👤 Profile' }]
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Paste Swiggy Order ID + tracking URL'
  };
}
function adminReplyKb() {
  return {
    keyboard: [
      [{ text: '🌐 Open App' }],
      [{ text: '👥 Manage Users' }, { text: '📥 Export Pending' }],
      [{ text: '🚚 Mark Delivered' }, { text: '🔍 Search Link' }],
      [{ text: '📊 All Stats' }, { text: '📜 User History' }],
      [{ text: '🧹 Clear Data' }, { text: '📈 My Stats' }]
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: 'Owner command · LIVE'
  };
}
function cancelKb() {
  return {
    keyboard: [[{ text: '↩ Back to Suite' }]],
    resize_keyboard: true,
    input_field_placeholder: 'Cancel · back to suite'
  };
}
function menuFor(tgId) {
  return isOwnerTg(tgId) ? adminReplyKb() : userReplyKb();
}
function hasCmd(text, name) {
  return String(text || '').indexOf(name) !== -1;
}
function formatOrderBlock(o) {
  const id = escHtml(o.order_id || '-');
  const raw = String(o.tracking_link || '').trim();
  const link = !raw ? '—'
    : (raw.indexOf('http') === 0
      ? '<a href="' + escHtml(raw) + '">Track Package ➔</a>'
      : '<code>' + escHtml(raw) + '</code>');
  return '📦 Order ID: <code>' + id + '</code>\n🔗 Track: ' + link;
}
function statusChip(st) {
  const s = String(st || 'new');
  if (s === 'delivered') return '🟢 Delivered';
  if (s === 'cancelled') return '🔴 Cancelled';
  if (s === 'pending' || s === 'processing' || s === 'ready') return '🟡 In Transit';
  return '🔵 New';
}

async function tgSend(token, chatId, text, extra) {
  if (!token) return;
  try {
    await tgApi(token, 'sendMessage', Object.assign({
      chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true
    }, extra || {}));
  } catch (e) { console.error('[TG send]', e.message); }
}

const adminStates = new Map();
function escHtml(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function progressBar(done, total) {
  if (!total) return '[░░░░░░░░░░] 0%';
  const filled = Math.min(10, Math.round((done / total) * 10));
  return '[' + '█'.repeat(filled) + '░'.repeat(10 - filled) + '] ' + Math.round((done / total) * 100) + '%';
}
function findOrderKeys(key) {
  const k = String(key || '').trim();
  if (!k) return [];
  const last4 = k.slice(-4);
  return db.prepare(`SELECT o.*, u.name AS user_name, u.email AS user_email, u.telegram_id
    FROM orders o JOIN users u ON u.id=o.user_id
    WHERE o.order_id=? OR o.tracking_link=?
       OR substr(o.order_id,-4)=? OR substr(REPLACE(IFNULL(o.tracking_link,''),'/',''),-4)=?
       OR o.order_id LIKE ? OR IFNULL(o.tracking_link,'') LIKE ?`).all(k, k, last4, last4, '%' + k + '%', '%' + k + '%');
}

async function sendUserStats(token, chatId, user) {
  const total = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE user_id=?').get(user.id).c;
  const delivered = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id=? AND status='delivered'").get(user.id).c;
  const pending = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id=? AND status IN ('new','pending','processing','ready')").get(user.id).c;
  const revenue = db.prepare("SELECT COALESCE(SUM(sale_value),0) AS s FROM orders WHERE user_id=? AND status='delivered'").get(user.id).s;
  await tgSend(token, chatId,
    premiumCard('YOUR SUITE STATS',
      '👤 Member: <b>' + escHtml(user.name) + '</b>\n\n'
      + '📦 Total Uploads:  <code>' + total + '</code>\n'
      + '✅ Delivered:      <code>' + delivered + '</code>\n'
      + '⏳ Pending:        <code>' + pending + '</code>\n'
      + '💵 Revenue:        <code>₹' + Number(revenue || 0).toLocaleString('en-IN') + '</code>\n\n'
      + '📈 Completion: <code>' + progressBar(delivered, total) + '</code>\n\n'
      + hostBlock(), '📊'),
    { reply_markup: menuFor(user.telegram_id) });
}

function userStatusMark(status) {
  if (status === 'active') return '🟢';
  if (status === 'pending') return '⏳';
  return '🔴';
}
async function sendManageUsers(token, chatId, page, editMsg) {
  const users = db.prepare("SELECT id,name,email,status,telegram_id FROM users WHERE role='user' ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'active' THEN 1 ELSE 2 END, id DESC").all();
  if (!users.length) { await tgSend(token, chatId, premiumCard('MEMBERS', 'No members yet.'), { reply_markup: adminReplyKb() }); return; }
  const size = 5;
  const pages = Math.max(1, Math.ceil(users.length / size));
  page = Math.max(0, Math.min(page || 0, pages - 1));
  const slice = users.slice(page * size, (page + 1) * size);
  let text = premiumCard('MEMBER SUITE', 'Page <code>' + (page + 1) + '/' + pages + '</code>  ·  Total <code>' + users.length + '</code>\n');
  const rows = [];
  for (const u of slice) {
    text += '\n' + userStatusMark(u.status) + '  <b>' + escHtml(u.name) + '</b>   <code>#' + u.id + '</code>\n'
      + '     ' + escHtml(u.email) + '\n'
      + (u.telegram_id ? '     TG <code>' + escHtml(u.telegram_id) + '</code>\n' : '')
      + '     ' + statusChip(u.status) + '\n';
    const key = u.id;
    if (u.status === 'active')
      rows.push([
        { text: 'Revoke  #' + u.id, callback_data: 'usr_rev_' + key + '_' + page }
      ]);
    else
      rows.push([
        { text: 'Approve  #' + u.id, callback_data: 'usr_app_' + key + '_' + page }
      ]);
  }
  const nav = [];
  if (page > 0) nav.push({ text: '‹  Prev', callback_data: 'usr_page_' + (page - 1) });
  if (page < pages - 1) nav.push({ text: 'Next  ›', callback_data: 'usr_page_' + (page + 1) });
  if (nav.length) rows.push(nav);
  const markup = { inline_keyboard: rows };
  if (editMsg && editMsg.message_id) {
    try {
      await tgApi(token, 'editMessageText', {
        chat_id: chatId, message_id: editMsg.message_id, text, parse_mode: 'HTML',
        disable_web_page_preview: true, reply_markup: markup
      });
      return;
    } catch (_) {}
  }
  await tgSend(token, chatId, text, { reply_markup: markup });
}

async function sendAllStats(token, chatId, page) {
  const users = db.prepare("SELECT id,name,email FROM users WHERE role='user' ORDER BY id DESC").all();
  if (!users.length) { await tgSend(token, chatId, premiumCard('NETWORK STATS', 'No members yet.'), { reply_markup: adminReplyKb() }); return; }
  const size = 5;
  const pages = Math.max(1, Math.ceil(users.length / size));
  page = Math.max(0, Math.min(page || 0, pages - 1));
  const slice = users.slice(page * size, (page + 1) * size);
  let text = premiumCard('NETWORK STATS', 'Page <code>' + (page + 1) + '/' + pages + '</code>\n');
  const rows = [];
  for (const u of slice) {
    const total = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE user_id=?').get(u.id).c;
    const delivered = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id=? AND status='delivered'").get(u.id).c;
    const pending = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id=? AND status IN ('new','pending','processing','ready')").get(u.id).c;
    text += '\n<b>' + escHtml(u.name) + '</b>\n     Uploads ' + total + '  ·  Del ' + delivered + '  ·  Pen ' + pending + '\n     <code>' + progressBar(delivered, total) + '</code>\n';
    rows.push([{ text: 'Clear  #' + u.id, callback_data: 'clr_ask_' + u.id + '_' + page }]);
  }
  const nav = [];
  if (page > 0) nav.push({ text: '‹  Prev', callback_data: 'all_page_' + (page - 1) });
  if (page < pages - 1) nav.push({ text: 'Next  ›', callback_data: 'all_page_' + (page + 1) });
  if (nav.length) rows.push(nav);
  await tgSend(token, chatId, text, { reply_markup: { inline_keyboard: rows } });
}

async function exportPending(token, chatId) {
  const rows = db.prepare(`SELECT o.order_id,o.tracking_link,o.created_at,u.name FROM orders o JOIN users u ON u.id=o.user_id
    WHERE o.status IN ('new','pending','processing','ready') ORDER BY o.id`).all();
  if (!rows.length) { await tgSend(token, chatId, premiumCard('PENDING QUEUE', 'Queue is empty — all clear.'), { reply_markup: adminReplyKb() }); return; }
  let text = premiumCard('PENDING QUEUE', 'Open  <code>' + rows.length + '</code>\n\n');
  rows.slice(0, 20).forEach((r, i) => {
    text += (i + 1) + '.  ' + formatOrderBlock(r) + '\n     Member  <b>' + escHtml(r.name) + '</b>\n\n';
  });
  if (rows.length > 20) text += '… +' + (rows.length - 20) + ' more on Web Portal';
  await tgSend(token, chatId, text, { reply_markup: adminReplyKb() });
}

async function handleTelegramCallback(token, call) {
  if (!call || !call.from) return;
  const tgId = String(call.from.id);
  const chatId = call.message && call.message.chat ? call.message.chat.id : call.from.id;
  const data = String(call.data || '');
  const answer = async (t) => { try { await tgApi(token, 'answerCallbackQuery', { callback_query_id: call.id, text: t || '' }); } catch (_) {} };
  if (!isOwnerTg(tgId)) { await answer('Admin only'); return; }
  const parts = data.split('_');
  const findUserByKey = (key) => {
    const n = Number(key);
    return db.prepare('SELECT * FROM users WHERE id=? OR telegram_id=?').get(n, String(key));
  };
  if (data.startsWith('usr_page_')) { await answer(); await sendManageUsers(token, chatId, Number(parts[2]), call.message); return; }
  if (data.startsWith('usr_app_')) {
    const u = findUserByKey(parts[2]);
    if (!u) { await answer('User not found'); return; }
    db.prepare("UPDATE users SET status='active' WHERE id=?").run(u.id);
    await answer('Approved #' + u.id);
    if (u.telegram_id) {
      await tgSend(token, u.telegram_id,
        premiumCard('ACCESS GRANTED',
          'Welcome  <b>' + escHtml(u.name) + '</b>\nYour suite is now live.\n\n'
          + hostBlock() + '\n\n'
          + 'Use  <b>✦ Submit Link</b>  or paste Order ID + URL.'),
        { reply_markup: userReplyKb() });
    }
    await sendManageUsers(token, chatId, Number(parts[3]), call.message);
    return;
  }
  if (data.startsWith('usr_rev_')) {
    const u = findUserByKey(parts[2]);
    if (!u) { await answer('User not found'); return; }
    db.prepare("UPDATE users SET status='inactive' WHERE id=?").run(u.id);
    await answer('Revoked #' + u.id);
    if (u.telegram_id) {
      await tgSend(token, u.telegram_id, premiumCard('ACCESS LOCKED', 'Your suite has been paused.\nPlease contact the owner.'));
    }
    await sendManageUsers(token, chatId, Number(parts[3]), call.message);
    return;
  }
  if (data.startsWith('all_page_')) { await answer(); await sendAllStats(token, chatId, Number(parts[2])); return; }
  if (data.startsWith('clr_ask_')) {
    await answer();
    await tgSend(token, chatId, premiumCard('CONFIRM CLEAR', 'Wipe every order for member  <code>#' + parts[2] + '</code> ?'), {
      reply_markup: { inline_keyboard: [[
        { text: 'Yes · Wipe', callback_data: 'clr_yes_' + parts[2] + '_' + parts[3] },
        { text: 'Keep', callback_data: 'all_page_' + parts[3] }
      ]] }
    });
    return;
  }
  if (data.startsWith('clr_yes_')) {
    db.prepare('DELETE FROM orders WHERE user_id=?').run(Number(parts[2]));
    await answer('Cleared'); await sendAllStats(token, chatId, Number(parts[3])); return;
  }
  if (data === 'del_1by1') {
    adminStates.set(tgId, 'deliver_1');
    await answer();
    await tgSend(token, chatId, premiumCard('DELIVER  ·  ONE', 'Send Order ID or last 4 digits.\nStock deducts automatically.'), { reply_markup: cancelKb() });
    return;
  }
  if (data === 'del_all') {
    adminStates.set(tgId, 'deliver_all');
    await answer();
    await tgSend(token, chatId, premiumCard('DELIVER  ·  BULK', 'Paste IDs line by line,\nor send  <code>ALL</code>  for the full queue.'), { reply_markup: cancelKb() });
    return;
  }
  await answer();
}

async function handleTelegramMessage(token, msg) {
  if (!msg || !msg.chat) return;
  const botRow = botByToken(token);
  const botId = botRow ? botRow.id : null;
  const chatId = msg.chat.id;
  const text = String(msg.text || '').trim();
  const tgId = String(msg.from && msg.from.id);
  const owner = isOwnerTg(tgId);
  let linked = botId
    ? db.prepare('SELECT * FROM users WHERE telegram_id=? AND bot_id=?').get(tgId, botId)
    : null;
  if (!linked) linked = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(tgId);
  if (!text) return;

  if (hasCmd(text, 'Cancel / Back') || hasCmd(text, 'Back to Suite') || text.startsWith('/start')) {
    adminStates.delete(tgId);
    const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(' ').trim() || 'there';
    if (owner) {
      promoteOwner(tgId, name);
      await tgSend(token, chatId,
        premiumCard('NEXGROCER MASTER SUITE',
          '👑 Welcome back, <b>' + escHtml(name) + '</b>\n<i>Owner & Admin Control Hub</i>\n\n'
          + hostBlock() + '\n\n'
          + '📧 <code>' + CONFIG.ADMIN_EMAIL + '</code>\n'
          + '🔑 <code>' + CONFIG.ADMIN_PASS + '</code>\n\n'
          + '⚡ <b>Command Hub:</b>\n'
          + '👥 Members · 📥 Export · 🚚 Deliver\n'
          + '🔍 Search · 📊 Stats · 📜 History · 🧹 Clear\n\n'
          + '<i>✨ High-performance engine connected & LIVE.</i>', '👑'),
        { reply_markup: adminReplyKb() });
      return;
    }
    const wasNew = !linked;
    linked = ensureTgUser(tgId, name, 'pending', botId);
    if (linked.status === 'inactive') {
      await tgSend(token, chatId, premiumCard('ACCESS LOCKED', 'Your suite has been paused.\nPlease contact the owner.'));
      return;
    }
    if (linked.status !== 'active') {
      if (wasNew) {
        await notifyOwner(token,
          premiumCard('NEW MEMBER REQUEST',
            '👤 Name: <b>' + escHtml(name) + '</b>\n🆔 Telegram ID: <code>' + tgId + '</code>\n🔢 User ID: <code>#' + linked.id + '</code>\n\n👉 Approve via <b>👥 Manage Users</b> below.', '🔔'));
      }
      await tgSend(token, chatId,
        premiumCard('NEXGROCER PORTAL',
          '👋 Welcome, <b>' + escHtml(name) + '</b>!\n\n'
          + '⏳ Status: <code>Awaiting Owner Approval</code>\n\n'
          + hostBlock() + '\n\n'
          + '💡 <i>The owner has been notified and will activate your suite shortly.</i>', '⏳'),
        { reply_markup: userReplyKb() });
      return;
    }
    await tgSend(token, chatId,
      premiumCard('NEXGROCER SUITE',
        '👋 Welcome back, <b>' + escHtml(linked.name) + '</b>!\n\n'
        + hostBlock() + '\n\n'
        + '🔐 Sign in to your dashboard anytime.\n\n'
        + '<b>📝 How to submit an order:</b>\n'
        + '📦 Order ID: <code>250072216984219</code>\n'
        + '🔗 https://www.swiggy.com/ofo/track/jQPNNXD1727J', '🛍️'),
      { reply_markup: userReplyKb() });
    return;
  }

  const state = adminStates.get(tgId);
  const adminBtns = ['Manage Users','Export Pending','Mark Delivered','Search Link','All Stats','User History','Clear Data','My Stats','My Uploads Stats','All Users Stats','Lookup User History','Clear User Data','Export Pending Orders','Mark Delivered (Bulk/ID)','Search Link (ID / 4 chars)'];
  if (adminBtns.includes(text)) adminStates.delete(tgId);

  if (owner) {
    if (state === 'deliver_1') {
      const hits = findOrderKeys(text);
      const pending = hits.filter(h => ['new','pending','processing','ready'].includes(h.status));
      if (!pending.length) { await tgSend(token, chatId, premiumCard('NO MATCH', 'Nothing pending for  <code>' + escHtml(text) + '</code>'), { reply_markup: cancelKb() }); return; }
      const done = [];
      for (const h of pending) { try { markOrderDelivered(h.id); done.push(h.order_id); } catch (_) {} }
      await tgSend(token, chatId, premiumCard('DELIVERED', 'Stock deducted.\n\n<code>' + done.join(', ') + '</code>'), { reply_markup: cancelKb() });
      return;
    }
    if (state === 'deliver_all') {
      if (text.toUpperCase() === 'ALL') {
        const rows = db.prepare("SELECT id FROM orders WHERE status IN ('new','pending','processing','ready')").all();
        let n = 0;
        for (const h of rows) { try { markOrderDelivered(h.id); n++; } catch (_) {} }
        await tgSend(token, chatId, premiumCard('DELIVERED', 'Stock deducted on  <code>' + n + '</code>  orders.'), { reply_markup: cancelKb() });
      } else {
        let n = 0;
        for (const line of text.split('\n').map(s => s.trim()).filter(Boolean)) {
          const hits = findOrderKeys(line).filter(h => ['new','pending','processing','ready'].includes(h.status));
          for (const h of hits) { try { markOrderDelivered(h.id); n++; } catch (_) {} }
        }
        await tgSend(token, chatId, premiumCard('DELIVERED', 'Stock deducted on  <code>' + n + '</code>  orders.'), { reply_markup: cancelKb() });
      }
      return;
    }
    if (state === 'search') {
      const hits = findOrderKeys(text);
      if (!hits.length) { await tgSend(token, chatId, premiumCard('SEARCH', 'No record for  <code>' + escHtml(text) + '</code>'), { reply_markup: cancelKb() }); return; }
      let out = premiumCard('SEARCH', 'Query  <code>' + escHtml(text) + '</code>\n\n');
      hits.slice(0, 10).forEach((h, i) => {
        out += (i + 1) + '.  ' + formatOrderBlock(h) + '\n'
          + '     Member  <b>' + escHtml(h.user_name) + '</b>\n'
          + '     ' + statusChip(h.status) + '\n\n';
      });
      await tgSend(token, chatId, out, { reply_markup: cancelKb() });
      return;
    }
    if (state === 'lookup') {
      const q = text.trim();
      let u = q.match(/^\d+$/) ? db.prepare('SELECT * FROM users WHERE id=? OR telegram_id=?').get(Number(q), q) : db.prepare('SELECT * FROM users WHERE email=? OR name LIKE ?').get(q.toLowerCase(), '%' + q + '%');
      if (!u) { await tgSend(token, chatId, premiumCard('HISTORY', 'Member not found.'), { reply_markup: cancelKb() }); return; }
      const total = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE user_id=?').get(u.id).c;
      const delivered = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id=? AND status='delivered'").get(u.id).c;
      const pending = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id=? AND status IN ('new','pending','processing','ready')").get(u.id).c;
      await tgSend(token, chatId, premiumCard('MEMBER HISTORY',
        '<b>' + escHtml(u.name) + '</b>\n' + escHtml(u.email) + '\n'
        + statusChip(u.status) + '\n\n'
        + '◇  Uploads     <code>' + total + '</code>\n'
        + '◇  Delivered   <code>' + delivered + '</code>\n'
        + '◇  Pending     <code>' + pending + '</code>\n'
        + '<code>' + progressBar(delivered, total) + '</code>'), { reply_markup: cancelKb() });
      return;
    }
    if (state === 'clear') {
      const q = text.trim();
      const u = q.match(/^\d+$/) ? db.prepare('SELECT * FROM users WHERE id=? OR telegram_id=?').get(Number(q), q) : db.prepare('SELECT * FROM users WHERE email=? OR name LIKE ?').get(q.toLowerCase(), '%' + q + '%');
      if (!u) { await tgSend(token, chatId, premiumCard('CLEAR', 'Member not found.'), { reply_markup: cancelKb() }); return; }
      const info = db.prepare('DELETE FROM orders WHERE user_id=?').run(u.id);
      adminStates.delete(tgId);
      await tgSend(token, chatId, premiumCard('CLEARED', 'Wiped  <code>' + info.changes + '</code>  orders for  <b>' + escHtml(u.name) + '</b>'), { reply_markup: adminReplyKb() });
      return;
    }
    if (hasCmd(text, 'Manage Users')) { await sendManageUsers(token, chatId, 0); return; }
    if (hasCmd(text, 'Export Pending')) { await exportPending(token, chatId); return; }
    if (hasCmd(text, 'Mark Delivered')) {
      await tgSend(token, chatId, premiumCard('MARK DELIVERED', 'Choose a mode. Stock deducts on confirm.'), { reply_markup: { inline_keyboard: [[
        { text: 'One by one', callback_data: 'del_1by1' },
        { text: 'Bulk  /  ALL', callback_data: 'del_all' }
      ]] } });
      return;
    }
    if (hasCmd(text, 'Search Link')) {
      adminStates.set(tgId, 'search');
      await tgSend(token, chatId, premiumCard('SEARCH', 'Send Order ID or last 4 digits.'), { reply_markup: cancelKb() });
      return;
    }
    if (hasCmd(text, 'All Stats') || hasCmd(text, 'All Users Stats')) { await sendAllStats(token, chatId, 0); return; }
    if (hasCmd(text, 'User History') || hasCmd(text, 'Lookup User History')) {
      adminStates.set(tgId, 'lookup');
      await tgSend(token, chatId, premiumCard('MEMBER HISTORY', 'Send user ID, email, or name.'), { reply_markup: cancelKb() });
      return;
    }
    if (hasCmd(text, 'Clear Data') || hasCmd(text, 'Clear User Data')) {
      adminStates.set(tgId, 'clear');
      await tgSend(token, chatId, premiumCard('CLEAR DATA', 'Send user ID, email, or name to wipe orders.'), { reply_markup: cancelKb() });
      return;
    }
  }

  if (linked && linked.status !== 'active' && !owner) {
    await tgSend(token, chatId, premiumCard('AWAITING APPROVAL', 'Your suite unlocks after the owner approves.\n\n' + hostBlock()), { reply_markup: userReplyKb() });
    return;
  }

  async function needLinked() {
    if (linked) return true;
    await tgSend(token, chatId, premiumCard('LINK ACCOUNT', 'Send your registered email, or tap  <b>✦ Open App</b>.\n\n' + hostBlock()), { reply_markup: menuFor(tgId) });
    return false;
  }
  async function replyOrder(out) {
    if (out.result === 'SUCCESS')
      await tgSend(token, chatId, premiumCard('ORDER CAPTURED', '✅ <b>Order Successfully Captured!</b>\n\n' + formatOrderBlock(out.order) + '\n\n💰 Charge: <code>₹' + out.order.sale_value + '</code>\n🛒 Stock ledger updated.', '🛍️'), { reply_markup: menuFor(tgId) });
    else if (out.result === 'DUPLICATE')
      await tgSend(token, chatId, premiumCard('DUPLICATE ORDER', '⚠️ ' + (out.message || 'Already stored — duplicate skipped.'), '⚠️'), { reply_markup: menuFor(tgId) });
    else if (out.result === 'NO_CART')
      await tgSend(token, chatId, premiumCard('CART EMPTY', '⚠️ Cart is empty. Please contact admin to assign a product/SKU.', '🛒'), { reply_markup: menuFor(tgId) });
    else if (out.result === 'INVALID')
      await tgSend(token, chatId, premiumCard('INVALID FORMAT', '⚠️ Could not read Order ID or tracking link.\n\n<b>Format:</b>\n📦 Order ID: <code>250072216984219</code>\n🔗 https://www.swiggy.com/ofo/track/jQPNNXD1727J', '⚠️'), { reply_markup: menuFor(tgId) });
    else
      await tgSend(token, chatId, premiumCard('NOT SAVED', '❌ ' + (out.message || out.result || 'Please try again.'), '❌'), { reply_markup: menuFor(tgId) });
  }

  if (hasCmd(text, 'Open Mini App') || hasCmd(text, 'Open App')) {
    await tgSend(token, chatId, premiumCard('WEB APP PORTAL', 'Tap below to launch your Web App:\n\n' + hostBlock(), '🌐'), { reply_markup: hostInline() });
    return;
  }
  if (hasCmd(text, 'My Uploads Stats') || hasCmd(text, 'My Stats')) {
    if (!await needLinked()) return;
    await sendUserStats(token, chatId, linked);
    return;
  }
  if (hasCmd(text, 'Submit Link')) {
    adminStates.set(tgId, 'submit_link');
    await tgSend(token, chatId, premiumCard('SUBMIT ORDER LINK',
      '📥 <b>Send Swiggy Order details below:</b>\n\n'
      + '📦 Order ID: <code>250072216984219</code>\n'
      + '🔗 https://www.swiggy.com/ofo/track/jQPNNXD1727J\n\n'
      + '<i>Tip: You can send both in a single message!</i>', '📝'), { reply_markup: cancelKb() });
    return;
  }
  if (hasCmd(text, 'Track Order')) {
    adminStates.set(tgId, 'track_order');
    await tgSend(token, chatId, premiumCard('LIVE SWIGGY TRACK', '🛵 <b>Paste Swiggy tracking link or last 4 digits:</b>\n\nRider details & OTP will be highlighted automatically.', '🛵'), { reply_markup: cancelKb() });
    return;
  }
  if (hasCmd(text, 'My Orders')) {
    if (!await needLinked()) return;
    const rows = db.prepare('SELECT order_id,tracking_link,status,sale_value,created_at FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 10').all(linked.id);
    if (!rows.length) { await tgSend(token, chatId, premiumCard('MY ORDERS', 'No orders yet. Use  <b>✦ Submit Link</b>.'), { reply_markup: menuFor(tgId) }); return; }
    let out = premiumCard('MY RECENT ORDERS', '📋 Last 10 Orders · ' + liveMark() + '\n\n', '📦');
    rows.forEach((o, i) => {
      out += (i + 1) + '. ' + formatOrderBlock(o) + '\n   ' + statusChip(o.status) + ' · <code>₹' + o.sale_value + '</code>\n\n';
    });
    await tgSend(token, chatId, out, { reply_markup: menuFor(tgId) });
    return;
  }
  if (hasCmd(text, 'Profile')) {
    if (!await needLinked()) return;
    await tgSend(token, chatId,
      premiumCard('YOUR PROFILE',
        '👤 Name:   <b>' + escHtml(linked.name) + '</b>\n'
        + '📧 Email:  <code>' + escHtml(linked.email) + '</code>\n'
        + '📱 Phone:  ' + escHtml(linked.phone || '—') + '\n'
        + '⚡ Status: ' + statusChip(linked.status) + '\n'
        + '🛡️ Role:   <code>' + escHtml(linked.role) + '</code>\n\n'
        + hostBlock(), '👤'),
      { reply_markup: hostInline() });
    return;
  }
  if (adminStates.get(tgId) === 'track_order') {
    adminStates.delete(tgId);
    try {
      const q = text;
      let share = extractShareId(q);
      if (!share) {
        const last4 = q.replace(/\D/g, '').slice(-4);
        const row = last4.length === 4
          ? db.prepare(`SELECT * FROM orders WHERE substr(order_id,-4)=? OR order_id=? OR tracking_link LIKE ? ORDER BY id DESC LIMIT 1`).get(last4, q, '%' + q + '%')
          : db.prepare(`SELECT * FROM orders WHERE order_id=? OR tracking_link=? OR tracking_link LIKE ? ORDER BY id DESC LIMIT 1`).get(q, q, '%' + q + '%');
        if (row) share = extractShareId(row.tracking_link || '') || extractShareId(row.order_id || '');
      }
      if (!share) {
        await tgSend(token, chatId, premiumCard('TRACK', 'Share id nahi mila. Paste ofo/track URL or last 4.'), { reply_markup: menuFor(tgId) });
        return;
      }
      const info = summarizeSwiggy(share, await fetchSwiggyTrack(share));
      if (!info.ok) {
        await tgSend(token, chatId, premiumCard('TRACK', info.error || info.message || 'Failed'), { reply_markup: menuFor(tgId) });
        return;
      }
      await tgSend(token, chatId, premiumCard('LIVE SWIGGY TRACK',
        '🛵 Rider:  <b>' + escHtml(info.rider || 'Not Assigned Yet') + '</b>\n'
        + '🔐 OTP:    <code>' + escHtml(info.otp || '—') + '</code>\n\n'
        + '📍 Status: ' + escHtml(info.status_message || '—') + '\n'
        + '📦 Order:  <code>' + escHtml(info.order_id || share) + '</code>\n'
        + '🏪 Outlet: ' + escHtml(info.outlet || '—'), '🛵'), { reply_markup: menuFor(tgId) });
    } catch (e) {
      await tgSend(token, chatId, premiumCard('TRACK', e.message || 'Failed'), { reply_markup: menuFor(tgId) });
    }
    return;
  }
  if (adminStates.get(tgId) === 'submit_link') {
    adminStates.delete(tgId);
    if (!linked && owner) linked = db.prepare('SELECT * FROM users WHERE email=?').get(CONFIG.ADMIN_EMAIL);
    if (!await needLinked()) return;
    await replyOrder(createOrderFromCart(linked, text, 'bot'));
    return;
  }
  if (text.startsWith('/help')) {
    await tgSend(token, chatId, premiumCard('HELP & GUIDE', 'Use the menu buttons below, paste an Order ID & tracking link, or open your web portal.\n\n' + hostBlock(), 'ℹ️'), { reply_markup: menuFor(tgId) });
    return;
  }
  if (text.startsWith('/status')) {
    if (!linked) await tgSend(token, chatId, premiumCard('STATUS', 'Not linked. Send email or tap  <b>✦ Open App</b>.'), { reply_markup: menuFor(tgId) });
    else await tgSend(token, chatId, premiumCard('STATUS', '<b>' + escHtml(linked.name) + '</b>\n' + escHtml(linked.email) + '\n' + statusChip(linked.status)), { reply_markup: menuFor(tgId) });
    return;
  }
  if (isEmail(text)) {
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(text.toLowerCase());
    if (!user) { await tgSend(token, chatId, premiumCard('NOT REGISTERED', 'This email is not registered yet. Please sign up on the web portal.\n\n' + hostBlock(), '⚠️'), { reply_markup: menuFor(tgId) }); return; }
    if (user.status !== 'active') { await tgSend(token, chatId, premiumCard('ACCOUNT', 'This account is not active yet.'), { reply_markup: menuFor(tgId) }); return; }
    db.prepare('UPDATE users SET telegram_id=NULL WHERE telegram_id=?').run(tgId);
    db.prepare('UPDATE users SET telegram_id=? WHERE id=?').run(tgId, user.id);
    await tgSend(token, chatId, premiumCard('LINKED', '<b>' + escHtml(user.name) + '</b>\nPaste a tracking link, or tap  <b>✦ Open App</b>.\n\n' + hostBlock()), { reply_markup: menuFor(tgId) });
    return;
  }
  if (!linked && !owner) {
    await tgSend(token, chatId, premiumCard('WELCOME TO NEXGROCER', 'Send your registered email to link your account, or open the web portal.\n\n' + hostBlock(), '👋'), { reply_markup: userReplyKb() });
    return;
  }
  if (!linked && owner) linked = db.prepare('SELECT * FROM users WHERE email=?').get(CONFIG.ADMIN_EMAIL);
  await replyOrder(createOrderFromCart(linked, text, 'bot'));
}

const botLoops = new Map();

function stopBotPolling() {
  for (const ac of botLoops.values()) { try { ac.abort(); } catch (_) {} }
  botLoops.clear();
}

function botUsernameBlocked(username) {
  const u = String(username || '').replace(/^@/, '').toLowerCase();
  if (!u) return false;
  if (CONFIG.BLOCKED_BOT_USERNAMES.includes(u)) return true;
  if (CONFIG.ALLOWED_BOT_USERNAMES.length && !CONFIG.ALLOWED_BOT_USERNAMES.includes(u)) return false;
  return false;
}

async function killForeignBot(token) {
  stopOneBot(token);
  try { await tgApi(token, 'deleteWebhook', { drop_pending_updates: true }, AbortSignal.timeout(2500)); } catch (_) {}
}

function startOneBot(token) {
  if (!token || botLoops.has(token)) return;
  const row = botByToken(token);
  if (row && (!row.enabled || botUsernameBlocked(row.username))) return;
  const ac = new AbortController();
  botLoops.set(token, ac);
  const offsetKey = 'telegram_offset_' + tokenHash(token);
  let offset = Number(getSetting(offsetKey) || 0);
  (async function loop() {
    try { await tgApi(token, 'deleteWebhook', { drop_pending_updates: true }); } catch (_) {}
    while (!ac.signal.aborted) {
      try {
        const data = await tgApi(token, 'getUpdates', { timeout: 25, offset, allowed_updates: ['message','callback_query'] }, ac.signal);
        if (!data || !data.ok) {
          if (data && /Unauthorized|invalid token/i.test(String(data.description || ''))) {
            console.error('[TG] unauthorized token, stopping');
            break;
          }
          await new Promise(r => setTimeout(r, 4000));
          continue;
        }
        for (const upd of data.result || []) {
          offset = upd.update_id + 1;
          try {
            if (upd.callback_query) await handleTelegramCallback(token, upd.callback_query);
            else if (upd.message) await handleTelegramMessage(token, upd.message);
          } catch (e) { console.error('[TG msg]', e); }
        }
        if ((data.result || []).length) setSetting(offsetKey, String(offset));
      } catch (e) {
        if (ac.signal.aborted) break;
        await new Promise(r => setTimeout(r, 4000));
      }
    }
    botLoops.delete(token);
  })();
}

function stopOneBot(token) {
  const ac = botLoops.get(token);
  if (ac) { try { ac.abort(); } catch (_) {} }
  botLoops.delete(token);
}

function startBotPolling() {
  const wanted = new Set(
    listBots()
      .filter(b => b.enabled && !botUsernameBlocked(b.username))
      .map(b => b.token)
  );
  for (const token of [...botLoops.keys()]) {
    if (!wanted.has(token)) stopOneBot(token);
  }
  for (const token of wanted) startOneBot(token);
}

async function upsertBotToken(token, opts) {
  const replaceAll = !!(opts && opts.replaceAll);
  const me = await tgApi(token, 'getMe', {}, AbortSignal.timeout(20000));
  if (!me || !me.ok || !me.result) {
    const err = new Error(me && me.description ? me.description : 'INVALID_TOKEN');
    err.code = 'INVALID_TOKEN';
    throw err;
  }
  if (botUsernameBlocked(me.result.username)) {
    await killForeignBot(token);
    db.prepare('DELETE FROM bots WHERE token=?').run(token);
    const err = new Error('This bot is blocked (@' + (me.result.username || '') + '). Only @Userxlinks_bot is allowed.');
    err.code = 'BOT_BLOCKED';
    throw err;
  }
  if (replaceAll) {
    for (const b of listBots()) {
      if (b.token === token) continue;
      stopOneBot(b.token);
      try { await unlinkMiniApp(b.token); } catch (_) {}
    }
    db.prepare('DELETE FROM bots WHERE token!=?').run(token);
  }
  const existing = botByToken(token);
  if (existing) {
    db.prepare('UPDATE bots SET username=?, tg_bot_id=?, enabled=1 WHERE id=?')
      .run(me.result.username || '', String(me.result.id), existing.id);
  } else {
    db.prepare('INSERT INTO bots (token,username,tg_bot_id,enabled) VALUES (?,?,?,1)')
      .run(token, me.result.username || '', String(me.result.id));
  }
  db.prepare("DELETE FROM settings WHERE key IN ('telegram_bots','telegram_bot_token','telegram_bot_username')").run();
  try {
    await tgApi(token, 'setChatMenuButton', { menu_button: { type: 'commands' } }, AbortSignal.timeout(8000));
  } catch (_) {}
  try {
    await tgApi(token, 'setMyCommands', {
      commands: [
        { command: 'start', description: 'Open NexGrocer suite' },
        { command: 'help', description: 'How to use' },
        { command: 'status', description: 'Account status' }
      ]
    }, AbortSignal.timeout(8000));
  } catch (_) {}
  startBotPolling();
  return botByToken(token);
}

function verifyTelegramInitData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const dataCheck = [...params.entries()].map(([k, v]) => k + '=' + v).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
  if (calc !== hash) return null;
  const authDate = Number(params.get('auth_date') || 0);
  if (authDate && (Date.now() / 1000 - authDate > 86400)) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch (_) { return null; }
}

app.post('/api/bot/hosting', auth, adminOnly, (req, res) => {
  try {
    let { url } = req.body || {};
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ ok: false, message: 'Valid URL daalein' });
    }
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    url = url.replace(/\/?$/, '/');
    setSetting('hosting_url', url);
    setSetting('github_pages_url', url);
    logActivity('🌐', 'purple', `Hosting URL updated: <b>${escHtml(url)}</b>`, req.user.email);
    res.json({ ok: true, hosting_url: url });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message });
  }
});

app.get('/api/bot/status', auth, adminOnly, (req, res) => {
  const bots = publicBots();
  res.json({
    connected: bots.some(b => b.enabled && b.running),
    bots,
    username: bots[0] ? bots[0].username : null,
    token_masked: bots[0] ? bots[0].token_masked : null,
    mini_app_url: getPublicUrl(),
    hosting_url: getPublicUrl()
  });
});

app.post('/api/bot/connect', auth, adminOnly, async (req, res) => {
  try {
    const token = String((req.body || {}).token || '').trim();
    const replaceAll = !!(req.body && req.body.replace_all);
    if (!token || token.length < 20) return res.status(400).json({ error: 'TOKEN_REQUIRED', message: 'Valid bot token daalein' });
    let row;
    try {
      row = await upsertBotToken(token, { replaceAll });
    } catch (e) {
    if (e.code === 'BOT_BLOCKED')
      return res.status(400).json({ error: 'BOT_BLOCKED', message: e.message });
    if (e.code === 'INVALID_TOKEN' || String(e.message).includes('Unauthorized'))
      return res.status(400).json({ error: 'INVALID_TOKEN', message: 'Token galat hai (BotFather se copy karo)' });
    return res.status(400).json({ error: 'TG_UNREACHABLE', message: e.message || 'Telegram API tak pahunch nahi paye' });
    }
    logActivity('🤖', 'green', `Telegram bot connected: <b>@${row.username}</b>`, req.user.email);
    res.json({ ok: true, connected: true, username: row.username, token_masked: maskToken(token), bots: publicBots() });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

async function unlinkMiniApp(token) {
  try { await tgApi(token, 'setChatMenuButton', { menu_button: { type: 'commands' } }); } catch (_) {}
  try { await tgApi(token, 'deleteWebhook', { drop_pending_updates: true }); } catch (_) {}
}

app.post('/api/bot/disconnect', auth, adminOnly, async (req, res) => {
  const uname = String((req.body || {}).username || '').trim().replace(/^@/, '');
  const id = Number((req.body || {}).id || 0);
  const targets = listBots().filter(b => (id && b.id === id) || (uname && String(b.username || '') === uname) || (!id && !uname));
  for (const b of targets) {
    stopOneBot(b.token);
    await unlinkMiniApp(b.token);
    db.prepare('DELETE FROM bots WHERE id=?').run(b.id);
  }
  startBotPolling();
  logActivity('🤖', 'yellow', 'Telegram bot disconnected' + (uname ? ' @' + uname : ''), req.user.email);
  res.json({ ok: true, connected: publicBots().some(b => b.running), bots: publicBots() });
});

app.post('/api/bot/toggle', auth, adminOnly, async (req, res) => {
  const id = Number((req.body || {}).id);
  const row = db.prepare('SELECT * FROM bots WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'BOT_NOT_FOUND' });
  const next = row.enabled ? 0 : 1;
  db.prepare('UPDATE bots SET enabled=? WHERE id=?').run(next, id);
  if (!next) {
    stopOneBot(row.token);
    await unlinkMiniApp(row.token);
  }
  startBotPolling();
  res.json({ ok: true, bots: publicBots() });
});

function stockSnapshot() {
  return {
    kind: 'nexgrocer-stock',
    version: 1,
    saved_at: new Date().toISOString(),
    products: db.prepare('SELECT sku,name,emoji,category,purchase_price,selling_price,current_stock,minimum_stock,status FROM products ORDER BY id').all(),
    ledger: db.prepare(`SELECT p.sku, t.type, t.quantity, t.balance_after, t.note, t.created_at
      FROM inventory_transactions t JOIN products p ON p.id=t.product_id ORDER BY t.id`).all()
  };
}

app.get('/api/admin/backup', auth, adminOnly, (req, res) => {
  try {
    const snap = stockSnapshot();
    const buf = Buffer.from(JSON.stringify(snap, null, 2));
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="nexgrocer-stock.json"');
    res.send(buf);
  } catch (e) { res.status(500).json({ error: 'BACKUP_FAILED', message: e.message }); }
});

app.post('/api/admin/restore', auth, adminOnly, (req, res) => {
  try {
    let snap = req.body;
    if (snap && snap.data) {
      const raw = String(snap.data).replace(/^data:[^;]+;base64,/, '');
      snap = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    }
    const productsList = Array.isArray(snap) ? snap : (snap && Array.isArray(snap.products) ? snap.products : null);
    const ledgerList = snap && !Array.isArray(snap) && Array.isArray(snap.ledger) ? snap.ledger : [];
    if (!productsList || productsList.length === 0 || productsList.some(p => !p || (!p.sku && !p.name))) {
      return res.status(400).json({ error: 'INVALID_BACKUP', message: 'Valid Stock JSON file chahiye jisme products list ho' });
    }
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM user_carts').run();
      db.prepare('DELETE FROM inventory_transactions').run();
      db.prepare('DELETE FROM products').run();
      const ins = db.prepare(`INSERT INTO products (sku,name,emoji,category,purchase_price,selling_price,current_stock,minimum_stock,status)
        VALUES (?,?,?,?,?,?,?,?,?)`);
      const map = {};
      for (const p of productsList) {
        const sku = p.sku || ('SKU-' + Math.random().toString(36).substring(2, 7).toUpperCase());
        const info = ins.run(sku, p.name || 'Unnamed Product', p.emoji || '📦', p.category || null,
          Number(p.purchase_price) || 0, Number(p.selling_price) || 0,
          Number(p.current_stock) || 0, Number(p.minimum_stock) || 0, p.status || 'active');
        map[sku] = info.lastInsertRowid;
      }
      const led = db.prepare(`INSERT INTO inventory_transactions (product_id,type,quantity,balance_after,note,created_at) VALUES (?,?,?,?,?,?)`);
      for (const t of ledgerList) {
        const pid = map[t.sku];
        if (!pid) continue;
        led.run(pid, t.type || 'adjustment', Number(t.quantity) || 0, Number(t.balance_after) || 0, t.note || null, t.created_at || null);
      }
    });
    tx();
    logActivity('💾', 'green', 'Stock backup restored (' + productsList.length + ' products)', req.user.email);
    res.json({ ok: true, message: 'Stock restored — ' + productsList.length + ' products.', products: productsList.length });
  } catch (e) { res.status(500).json({ error: 'RESTORE_FAILED', message: e.message }); }
});

app.post('/api/auth/telegram', (req, res) => {
  try {
    const initData = String((req.body || {}).initData || '');
    let tgUser = null;
    let matchedBot = null;
    for (const b of listBots().filter(x => x.enabled)) {
      tgUser = verifyTelegramInitData(initData, b.token);
      if (tgUser) { matchedBot = b; break; }
    }
    if (!tgUser || !tgUser.id) return res.status(401).json({ error: 'INVALID_TELEGRAM' });
    const tgId = String(tgUser.id);
    const name = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim() || ('tg_' + tgId);
    let user;
    if (isOwnerTg(tgId)) {
      user = promoteOwner(tgId, name);
    } else {
      user = ensureTgUser(tgId, name, 'pending', matchedBot ? matchedBot.id : null);
    }
    if (!user) return res.status(500).json({ error: 'SERVER_ERROR' });
    if (user.status !== 'active') return res.status(403).json({ error: 'ACCOUNT_INACTIVE', message: 'Awaiting admin approval' });
    res.json({
      token: signToken(user),
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone, role: user.role, status: user.status, telegram_id: user.telegram_id }
    });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

app.post('/api/my/order', auth, (req, res) => {
  try {
    const tracking_link = String((req.body || {}).tracking_link || '').trim();
    if (!tracking_link) return res.status(400).json({ result: 'INVALID', message: 'Tracking link required' });
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
    const out = createOrderFromCart(user, tracking_link, 'web');
    res.json(out);
  } catch (e) { console.error(e); res.status(500).json({ result: 'ERROR' }); }
});

app.patch('/api/my/profile', auth, (req, res) => {
  try {
    const { name, phone } = req.body || {};
    const updates = [], values = [];
    if (name && String(name).trim()) { updates.push('name=?'); values.push(String(name).trim()); }
    if (phone !== undefined) { updates.push('phone=?'); values.push(String(phone).trim() || null); }
    if (!updates.length) return res.json({ user: req.user });
    values.push(req.user.id);
    db.prepare('UPDATE users SET ' + updates.join(',') + ' WHERE id=?').run(...values);
    const user = db.prepare('SELECT id,email,name,phone,telegram_id,role,status FROM users WHERE id=?').get(req.user.id);
    res.json({ user });
  } catch (e) { console.error(e); res.status(500).json({ error: 'SERVER_ERROR' }); }
});

app.post('/api/bot/simulate', auth, adminOnly, (req, res) => {
  try {
    const { email, tracking_link } = req.body || {};
    if (!email || !tracking_link) return res.status(400).json({ result: 'INVALID', message: 'Email aur tracking link required' });
    const user = db.prepare('SELECT * FROM users WHERE email=?').get(String(email).toLowerCase());
    const out = createOrderFromCart(user, tracking_link, 'bot');
    res.json(out);
  } catch (e) { console.error(e); res.status(500).json({ result: 'ERROR' }); }
});

function pickPath(data, path, fallback) {
  let node = data;
  for (const key of String(path).split('.')) {
    if (node == null) return fallback;
    if (Array.isArray(node) && /^\d+$/.test(key)) node = node[Number(key)];
    else if (typeof node === 'object') node = node[key];
    else return fallback;
  }
  return node == null ? fallback : node;
}
function stripHtml(s) {
  return String(s || '').replace(/<\/?b>/gi, '').replace(/<[^>]+>/g, '').trim();
}
function parseRiderName(body) {
  const clean = stripHtml(body);
  const m = clean.match(/by your (?:hunger saviour|captain|delivery partner|rider)\s+(.+)$/i);
  if (m) return m[1].trim();
  return '';
}
async function fetchSwiggyTrack(share) {
  const url = 'https://www.swiggy.com/dapi/social/track/v4/' + encodeURIComponent(share);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      'Accept': 'application/json',
      'Referer': 'https://www.swiggy.com/ofo/track/' + encodeURIComponent(share)
    },
    signal: AbortSignal.timeout(20000)
  });
  if (!res.ok) throw new Error('SWIGGY_' + res.status);
  return res.json();
}
function summarizeSwiggy(share, resp) {
  const status = pickPath(resp, 'statusCode', pickPath(resp, 'data.statusCode', 0));
  if (status != null && Number(status) !== 0) {
    return { ok: false, error: pickPath(resp, 'data.statusMessage', pickPath(resp, 'statusMessage', String(status))) };
  }
  const data = pickPath(resp, 'data', {}) || {};
  const messages = pickPath(data, 'order_status_details.messages', []) || [];
  const body = messages.length ? stripHtml(pickPath(messages[0], 'body', '')) : '';
  const rider = parseRiderName(body) || '';
  const products = (pickPath(data, 'product_otp_details', []) || []).map((p, i) => ({
    n: i + 1, otp: pickPath(p, 'otp', null), item_id: pickPath(p, 'item_id', null)
  }));
  return {
    ok: true,
    share,
    rider: rider || null,
    otp: pickPath(data, 'otp_details.otp', null),
    status_message: pickPath(data, 'order_status_details.status_message', '') || '',
    details: body || '',
    order_id: pickPath(data, 'toolbar_details.order_id', null),
    order_type: pickPath(data, 'toolbar_details.order_type', null),
    outlet: pickPath(data, 'order_details.action_items.0.text', '') || '',
    outlet_sub: pickPath(data, 'order_details.action_items.0.sub_text', '') || '',
    header: pickPath(data, 'toolbar_details.title', '') || '',
    header_sub: pickPath(data, 'toolbar_details.subtitle', '') || '',
    call_de: pickPath(data, 'order_status_details.call_de_details', null),
    fyi: (pickPath(data, 'fyi_messages', []) || []).map(f => ({
      title: pickPath(f, 'title', ''), subtitle: pickPath(f, 'subtitle', '')
    })),
    products
  };
}

app.post('/api/swiggy/track', auth, async (req, res) => {
  try {
    const q = String((req.body || {}).q || (req.body || {}).link || '').trim();
    if (!q) return res.status(400).json({ ok: false, error: 'QUERY_REQUIRED' });
    let share = extractShareId(q);
    let stored = null;
    if (!share) {
      const last4 = q.replace(/\D/g, '').slice(-4);
      if (last4.length === 4) {
        const row = db.prepare(`SELECT * FROM orders WHERE substr(order_id,-4)=? OR order_id=? OR tracking_link LIKE ? ORDER BY id DESC LIMIT 1`)
          .get(last4, q, '%' + q + '%');
        if (row) {
          stored = row;
          share = extractShareId(row.tracking_link || '') || extractShareId(row.order_id || '');
        }
      } else {
        const row = db.prepare(`SELECT * FROM orders WHERE order_id=? OR tracking_link=? OR tracking_link LIKE ? ORDER BY id DESC LIMIT 1`)
          .get(q, q, '%' + q + '%');
        if (row) {
          stored = row;
          share = extractShareId(row.tracking_link || '');
        }
      }
    }
    if (!share) return res.status(422).json({ ok: false, error: 'NO_SHARE', message: 'Swiggy tracking link / last 4 digits se share id nahi mila' });
    const raw = await fetchSwiggyTrack(share);
    const info = summarizeSwiggy(share, raw);
    if (stored) info.stored = { order_id: stored.order_id, tracking_link: stored.tracking_link, status: stored.status, user_id: stored.user_id };
    res.json(info);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'TRACK_FAILED', message: e.message });
  }
});

/* [SECTION 18] ─── FRONTEND (embedded HTML) ─────────────────────────────── */
/* Below HTML is served to the browser. It talks to the APIs above.          */

const FRONTEND_HTML = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>NexGrocer • All-in-One</title>
<meta name="telegram-web-app" content="true"/>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#05060d;--glass:rgba(255,255,255,.045);--glass2:rgba(255,255,255,.08);
  --border:rgba(255,255,255,.08);--glow:rgba(0,240,255,.35);
  --cyan:#00f0ff;--purple:#a855f7;--pink:#ff2fb9;--green:#00ff9d;--yellow:#ffd60a;--red:#ff3860;--orange:#ff8b3d;
  --text:#e8ecf5;--muted:#7b87a4;--fd:'Orbitron',sans-serif;--fb:'Inter',sans-serif;
  --card:#0b101e;--dlg:#141b32;
}
html.light{
  --bg:#f4f6fb;--glass:rgba(15,23,42,.04);--glass2:rgba(15,23,42,.08);
  --border:rgba(15,23,42,.12);--glow:rgba(14,165,233,.35);
  --cyan:#0284c7;--purple:#7c3aed;--pink:#db2777;--green:#059669;--yellow:#d97706;--red:#dc2626;--orange:#ea580c;
  --text:#0f172a;--muted:#64748b;--card:#ffffff;--dlg:#ffffff;
}
html,body{height:100%}
body{font-family:var(--fb);background:radial-gradient(ellipse at top left,rgba(0,240,255,.08),transparent 40%),radial-gradient(ellipse at bottom right,rgba(168,85,247,.1),transparent 45%),var(--bg);color:var(--text);overflow-x:hidden;min-height:100vh}
.grad{background:linear-gradient(90deg,#00f0ff,#a855f7,#ff2fb9);-webkit-background-clip:text;background-clip:text;color:transparent}
.c-cyan{color:var(--cyan)}.c-purple{color:var(--purple)}.c-pink{color:var(--pink)}.c-green{color:var(--green)}.c-yellow{color:var(--yellow)}.c-orange{color:var(--orange)}
.quick-btns{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:12px 0 18px}
.qbtn{padding:16px 12px;border-radius:16px;border:1px solid rgba(255,255,255,.12);cursor:pointer;text-align:center;font-weight:700;font-size:12px;color:#fff;transition:transform .18s,box-shadow .18s;letter-spacing:.2px;box-shadow:0 10px 24px rgba(0,0,0,.28)}
.qbtn:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(0,0,0,.38)}
.qbtn:active{transform:scale(.97)}
.qbtn.a{background:linear-gradient(135deg,#00c2d6,#00f0ff);color:#042026}
.qbtn.b{background:linear-gradient(135deg,#7c3aed,#a855f7)}
.qbtn.c{background:linear-gradient(135deg,#db2777,#ff2fb9)}
.qbtn.d{background:linear-gradient(135deg,#059669,#00ff9d);color:#052016}
.qbtn.e{background:linear-gradient(135deg,#d97706,#ffd60a);color:#2a2100}
.qbtn.f{background:linear-gradient(135deg,#ea580c,#ff8b3d)}

#errBanner{position:fixed;top:0;left:0;right:0;z-index:9999;
  background:linear-gradient(90deg,var(--red),var(--pink));color:#fff;padding:10px 20px;
  font-size:12px;font-weight:600;text-align:center;transform:translateY(-100%);
  transition:transform .3s;display:flex;align-items:center;justify-content:center;gap:10px}
#errBanner.show{transform:translateY(0)}
#errBanner button{background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.3);color:#fff;
  padding:4px 12px;border-radius:6px;cursor:pointer;font-size:11px}

/* AUTH */
#login{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:20px;overflow-y:auto;
  background:radial-gradient(ellipse at top,rgba(0,240,255,.08),transparent 60%),
    radial-gradient(ellipse at bottom,rgba(168,85,247,.08),transparent 60%),var(--bg)}
#login.hide{opacity:0;visibility:hidden;pointer-events:none;transition:all .5s}
.login-box{width:min(440px,100%);padding:34px 30px;
  background:linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.02));
  border:1px solid var(--border);border-radius:24px;
  box-shadow:0 30px 80px rgba(0,0,0,.5),0 0 60px rgba(0,240,255,.12);animation:scaleIn .6s ease}
@keyframes scaleIn{from{opacity:0;transform:scale(.92) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}
.login-logo{width:66px;height:66px;margin:0 auto 16px;border-radius:20px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));display:grid;place-items:center;
  font-size:30px;box-shadow:0 0 30px rgba(0,240,255,.5);animation:pulse 3s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 30px rgba(0,240,255,.5)}
  50%{box-shadow:0 0 45px rgba(0,240,255,.9),0 0 90px rgba(168,85,247,.5)}}
.login-box h1{font-family:var(--fd);font-size:22px;text-align:center;letter-spacing:2px;margin-bottom:4px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;
  background-clip:text;color:transparent}
.login-box .sub{text-align:center;color:var(--muted);font-size:12px;margin-bottom:18px}
.tabs-auth{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px;padding:5px;
  background:var(--glass);border-radius:14px;border:1px solid var(--border)}
.tab-auth{padding:10px;text-align:center;border-radius:10px;cursor:pointer;font-size:12px;
  font-weight:600;color:var(--muted);transition:all .3s;user-select:none}
.tab-auth.active{color:#fff;background:linear-gradient(135deg,var(--cyan),var(--purple));
  box-shadow:0 8px 24px rgba(0,240,255,.35)}
.field{position:relative;margin-bottom:10px}
.field input,.field select{width:100%;padding:12px 16px 12px 44px;background:var(--glass);
  border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:13px;
  outline:none;font-family:var(--fb);transition:all .25s}
.field input:focus,.field select:focus{border-color:var(--glow);background:var(--glass2);box-shadow:0 0 0 3px rgba(0,240,255,.1)}
.field .ico{position:absolute;left:15px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:14px;pointer-events:none}
.login-btn{width:100%;padding:13px;margin-top:6px;border:none;border-radius:12px;cursor:pointer;
  background:linear-gradient(135deg,var(--cyan),var(--purple));color:#fff;
  font-family:var(--fd);font-weight:700;font-size:12px;letter-spacing:2px;
  box-shadow:0 10px 30px rgba(0,240,255,.3);transition:all .3s}
.login-btn:hover{transform:translateY(-2px);box-shadow:0 15px 40px rgba(0,240,255,.5)}
.login-btn:disabled{opacity:.6;cursor:not-allowed;transform:none}
.auth-msg{margin-top:10px;padding:10px 12px;border-radius:10px;font-size:11px;text-align:center;display:none}
.auth-msg.show{display:block}
.auth-msg.error{background:rgba(255,56,96,.1);border:1px solid rgba(255,56,96,.3);color:var(--red)}
.auth-msg.success{background:rgba(0,255,157,.1);border:1px solid rgba(0,255,157,.3);color:var(--green)}
.auth-hint{margin-top:12px;padding:10px;border-radius:10px;background:rgba(0,240,255,.06);
  border:1px dashed rgba(0,240,255,.3);font-size:11px;color:var(--muted);text-align:center;line-height:1.6}
.auth-hint b{color:var(--cyan)}

/* APP */
#app{display:none;grid-template-columns:250px 1fr;min-height:100vh}
#app.show{display:grid}
.sidebar{background:linear-gradient(180deg,rgba(10,13,26,.9),rgba(5,6,13,.95));
  border-right:1px solid var(--border);padding:20px 14px;
  position:sticky;top:0;height:100vh;display:flex;flex-direction:column;z-index:10;overflow-y:auto}
.logo{display:flex;align-items:center;gap:10px;padding:6px 8px 18px;border-bottom:1px solid var(--border);margin-bottom:16px}
.logo-icon{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,var(--cyan),var(--purple));
  display:grid;place-items:center;font-size:20px;box-shadow:0 0 20px rgba(0,240,255,.5);animation:pulse 3s ease-in-out infinite}
.logo-text{font-family:var(--fd);font-weight:800;font-size:15px;letter-spacing:1px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;
  background-clip:text;color:transparent}
.logo-sub{font-size:9px;color:var(--muted);letter-spacing:2px;margin-top:2px}
.nav-t{font-size:10px;letter-spacing:2px;color:var(--muted);text-transform:uppercase;padding:13px 12px 6px;font-weight:600}
.nav{display:flex;flex-direction:column;gap:3px}
.nav a{display:flex;align-items:center;gap:11px;padding:10px 13px;border-radius:10px;color:var(--muted);
  text-decoration:none;font-size:12.5px;font-weight:500;transition:all .25s;border:1px solid transparent;cursor:pointer}
.nav a:hover{color:var(--text);background:var(--glass);border-color:var(--border)}
.nav a.active{color:var(--text);background:linear-gradient(90deg,rgba(0,240,255,.15),rgba(168,85,247,.08));
  border-color:var(--glow);position:relative}
.nav a.active::before{content:'';position:absolute;left:-14px;top:50%;transform:translateY(-50%);
  width:3px;height:18px;border-radius:2px;background:var(--cyan);box-shadow:0 0 10px var(--cyan)}
.nav a .ic{font-size:15px;width:20px;text-align:center}
.nav a .badge{margin-left:auto;font-size:9px;padding:2px 7px;background:var(--pink);color:#fff;border-radius:20px;font-weight:700}
.sb-foot{margin-top:auto;padding:13px;border-radius:14px;
  background:linear-gradient(135deg,rgba(0,240,255,.08),rgba(168,85,247,.08));
  border:1px solid var(--border);text-align:center;margin-top:18px}
.sb-foot .st{display:flex;align-items:center;justify-content:center;gap:7px;font-size:11px;color:var(--green);margin-bottom:4px;font-weight:600}
.dot{width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green);animation:blink 1.5s infinite}
@keyframes blink{50%{opacity:.3}}
.live-blink{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:1px;color:var(--green)}
.live-blink .dot{width:8px;height:8px}
.pill.live{display:inline-flex;align-items:center;gap:6px}
.swipe{position:relative;width:132px;height:36px;border-radius:18px;background:rgba(0,255,157,.12);border:1px solid rgba(0,255,157,.35);overflow:hidden;user-select:none;touch-action:pan-y;cursor:grab}
.swipe .track{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--green);letter-spacing:.4px;pointer-events:none}
.swipe .knob{position:absolute;left:2px;top:2px;width:32px;height:32px;border-radius:16px;background:linear-gradient(135deg,var(--green),#00c977);display:grid;place-items:center;font-size:14px;color:#031a12;z-index:2}
.swipe.done{background:rgba(0,255,157,.35)}
.toast.big{padding:14px 18px;font-size:14px;animation:popIn .35s ease}
@keyframes popIn{from{transform:translateY(16px) scale(.92);opacity:0}to{transform:none;opacity:1}}
.sb-foot .info{font-size:10px;color:var(--muted)}

.main{padding:20px 26px 40px;overflow-x:hidden;min-width:0}
.topbar{display:flex;align-items:center;gap:14px;margin-bottom:22px;flex-wrap:wrap}
.search{flex:1;min-width:200px;max-width:500px;position:relative}
.search input{width:100%;padding:11px 16px 11px 42px;background:var(--glass);border:1px solid var(--border);
  border-radius:12px;color:var(--text);font-size:13px;outline:none;font-family:var(--fb)}
.search input:focus{border-color:var(--glow);background:var(--glass2)}
.search .ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--muted);font-size:15px}
.top-actions{display:flex;gap:9px;align-items:center;margin-left:auto}
.user-chip{display:flex;align-items:center;gap:10px;padding:5px 14px 5px 5px;background:var(--glass);
  border:1px solid var(--border);border-radius:12px;cursor:pointer;transition:all .25s;position:relative}
.user-chip:hover{border-color:var(--glow)}
.user-menu{position:relative}
.user-menu .drop{display:none;position:absolute;right:0;top:calc(100% + 8px);min-width:160px;z-index:50;
  background:#0f1424;border:1px solid var(--border);border-radius:12px;padding:6px;box-shadow:0 16px 40px rgba(0,0,0,.45)}
.user-menu.open .drop{display:block}
.user-menu .drop button{width:100%;text-align:left;background:transparent;border:none;color:var(--text);
  padding:10px 12px;border-radius:8px;cursor:pointer;font-size:12px;font-family:var(--fb)}
.user-menu .drop button:hover{background:var(--glass2)}
.avatar{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--cyan),var(--purple));
  display:grid;place-items:center;font-weight:700;font-size:12px;color:#fff}
.user-chip .nm{font-size:12px;font-weight:600;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.user-chip .rl{font-size:10px;color:var(--muted)}

.page{display:none;animation:fadeUp .4s ease}
.page.active{display:block}
@keyframes fadeUp{from{opacity:0;transform:translateY(15px)}to{opacity:1;transform:translateY(0)}}
.ph{margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
.ph h1{font-family:var(--fd);font-size:23px;font-weight:800;letter-spacing:.5px;margin-bottom:5px;
  background:linear-gradient(135deg,#fff,#a8b3d6);-webkit-background-clip:text;background-clip:text;color:transparent}
.ph p{color:var(--muted);font-size:12px}
.grad{background:linear-gradient(135deg,var(--cyan),var(--purple),var(--pink));
  -webkit-background-clip:text;background-clip:text;color:transparent}

.oid-card{display:flex;flex-direction:column;gap:4px;min-width:180px}
.oid-line{font-size:12px;font-weight:700;color:var(--text);letter-spacing:.2px}
.oid-line .k{color:var(--muted);font-weight:600;margin-right:4px}
.oid-link{font-size:11px;color:var(--cyan);word-break:break-all;line-height:1.45}
.oid-link a{color:var(--cyan);text-decoration:none}
.oid-link a:hover{text-decoration:underline}
.btn{padding:10px 18px;border-radius:11px;border:none;cursor:pointer;font-family:var(--fb);
  font-weight:600;font-size:12px;display:inline-flex;align-items:center;gap:7px;transition:all .25s}
.btn-p{background:linear-gradient(135deg,var(--cyan),var(--purple));color:#fff;box-shadow:0 8px 24px rgba(0,240,255,.3)}
.btn-p:hover{transform:translateY(-2px);box-shadow:0 12px 32px rgba(0,240,255,.5)}
.btn-g{background:var(--glass);color:var(--text);border:1px solid var(--border)}
.btn-g:hover{border-color:var(--glow);background:var(--glass2)}
.btn-green{background:linear-gradient(135deg,var(--green),#00c977);color:#031a12;font-weight:700}
.btn-red{background:linear-gradient(135deg,var(--red),#d42044);color:#fff}
.btn-sm{padding:6px 11px;font-size:10px;border-radius:8px}

.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-bottom:20px}
.stat{padding:17px;border-radius:16px;transition:all .3s;
  background:linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.02));
  border:1px solid var(--border)}
.stat:hover{transform:translateY(-3px);border-color:var(--glow)}
.stat .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:11px}
.stat .lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:600}
.stat .ib{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-size:16px}
.stat .val{font-family:var(--fd);font-size:22px;font-weight:800;letter-spacing:.5px;margin-bottom:5px}
.v-c{color:var(--cyan);text-shadow:0 0 20px rgba(0,240,255,.5)}
.v-g{color:var(--green);text-shadow:0 0 20px rgba(0,255,157,.5)}
.v-p{color:var(--purple);text-shadow:0 0 20px rgba(168,85,247,.5)}
.v-pk{color:var(--pink);text-shadow:0 0 20px rgba(255,47,185,.5)}
.v-y{color:var(--yellow);text-shadow:0 0 20px rgba(255,214,10,.5)}
.v-r{color:var(--red);text-shadow:0 0 20px rgba(255,56,96,.5)}

.row{display:grid;grid-template-columns:2fr 1fr;gap:14px;margin-bottom:20px}
.row.eq{grid-template-columns:1fr 1fr}
@media(max-width:1100px){.row,.row.eq{grid-template-columns:1fr}}
.card{padding:18px;border-radius:16px;transition:all .3s;
  background:linear-gradient(135deg,rgba(255,255,255,.05),rgba(255,255,255,.02));
  border:1px solid var(--border)}
.card:hover{border-color:rgba(0,240,255,.2)}
.ch{display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;gap:10px;flex-wrap:wrap}
.ch h3{font-family:var(--fd);font-size:14px;font-weight:700;letter-spacing:.5px}
.pill{font-size:9px;padding:4px 10px;border-radius:20px;background:rgba(0,240,255,.1);
  border:1px solid rgba(0,240,255,.3);color:var(--cyan);font-weight:600;letter-spacing:1px}
.chart{position:relative;height:260px}

.table-w{overflow-x:auto;border-radius:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
thead tr{border-bottom:1px solid var(--border)}
th{text-align:left;padding:11px 13px;font-size:9px;text-transform:uppercase;letter-spacing:1.5px;
  color:var(--muted);font-weight:600;white-space:nowrap}
tbody tr{border-bottom:1px solid rgba(255,255,255,.04);transition:background .2s}
tbody tr:hover{background:rgba(0,240,255,.04)}
td{padding:12px 13px;color:var(--text);vertical-align:middle}
.id{font-family:var(--fd);font-size:11px;color:var(--cyan);letter-spacing:.5px}
.sts{font-size:9px;padding:3px 9px;border-radius:20px;font-weight:700;letter-spacing:1px;
  text-transform:uppercase;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}
.sts::before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor;box-shadow:0 0 6px currentColor}
.sts.delivered,.sts.active{color:var(--green);background:rgba(0,255,157,.1);border:1px solid rgba(0,255,157,.3)}
.sts.pending,.sts.new{color:var(--yellow);background:rgba(255,214,10,.1);border:1px solid rgba(255,214,10,.3)}
.sts.cancelled,.sts.inactive{color:var(--red);background:rgba(255,56,96,.1);border:1px solid rgba(255,56,96,.3)}
.sts.processing{color:var(--cyan);background:rgba(0,240,255,.1);border:1px solid rgba(0,240,255,.3)}
.sts.low{color:var(--orange);background:rgba(255,139,61,.1);border:1px solid rgba(255,139,61,.3)}
.amt{font-family:var(--fd);font-weight:700;font-size:12px}

.low-item{display:flex;gap:11px;padding:11px;border-radius:11px;background:var(--glass);
  border:1px solid var(--border);margin-bottom:8px;align-items:center;transition:all .25s}
.low-item:hover{border-color:rgba(255,56,96,.4)}
.low-item .pi{width:36px;height:36px;border-radius:10px;display:grid;place-items:center;
  font-size:15px;background:rgba(0,240,255,.15);border:1px solid rgba(0,240,255,.3);flex-shrink:0}
.low-item .pinfo{flex:1;min-width:0}
.low-item .pn{font-size:12px;font-weight:600;margin-bottom:2px}
.low-item .ps{font-size:10px;color:var(--muted)}
.low-item .pc{font-family:var(--fd);font-size:15px;font-weight:800;color:var(--red)}

.feed{display:flex;flex-direction:column}
.feed-item{display:flex;gap:11px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.04);align-items:flex-start}
.feed-item:last-child{border-bottom:none}
.feed-item .fi{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
  font-size:13px;background:var(--glass);border:1px solid var(--border);flex-shrink:0}
.feed-item .fb{flex:1;min-width:0}
.feed-item .ft{font-size:12px;margin-bottom:2px}
.feed-item .ft b{color:var(--cyan);font-weight:600}
.feed-item .ftm{font-size:10px;color:var(--muted)}

.ugrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:11px}
.ucard{padding:14px;border-radius:13px;background:var(--glass);border:1px solid var(--border);
  text-align:center;transition:all .3s}
.ucard:hover{transform:translateY(-3px);border-color:var(--glow)}
.ucard .uav{width:46px;height:46px;border-radius:13px;margin:0 auto 9px;
  background:linear-gradient(135deg,var(--cyan),var(--purple));
  display:grid;place-items:center;font-family:var(--fd);font-weight:800;font-size:15px;color:#fff}
.ucard .un{font-size:12px;font-weight:600;margin-bottom:2px}
.ucard .ur{font-size:10px;color:var(--muted);margin-bottom:8px}
.ucard .us{font-size:9px;padding:3px 9px;border-radius:20px;
  background:rgba(0,255,157,.1);color:var(--green);border:1px solid rgba(0,255,157,.3);
  display:inline-block;font-weight:600}

.empty{text-align:center;padding:36px 20px;color:var(--muted);font-size:12px}
.empty .ic{font-size:34px;margin-bottom:10px;opacity:.5}

.modal-bg{position:fixed;inset:0;background:rgba(5,6,13,.85);z-index:500;
  display:none;align-items:center;justify-content:center;padding:20px;overflow-y:auto}
.modal-bg.show{display:flex}
.modal{width:min(560px,100%);max-height:90vh;overflow-y:auto;
  background:linear-gradient(135deg,rgba(15,20,36,.98),rgba(10,13,26,.98));
  border:1px solid var(--glow);border-radius:20px;padding:24px;
  box-shadow:0 30px 80px rgba(0,0,0,.6)}
.mh{display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
.mh h3{font-family:var(--fd);font-size:16px;font-weight:700}
.mc{width:32px;height:32px;border-radius:9px;background:var(--glass);border:1px solid var(--border);
  color:var(--text);cursor:pointer;font-size:14px;display:grid;place-items:center}
.mc:hover{border-color:var(--red);color:var(--red);transform:rotate(90deg)}
.fg{margin-bottom:13px}
.fg label{display:block;font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);
  font-weight:600;margin-bottom:6px}
.fg input,.fg select,.fg textarea{width:100%;padding:10px 13px;background:var(--glass);
  border:1px solid var(--border);border-radius:10px;color:var(--text);font-size:12px;
  outline:none;font-family:var(--fb)}
.fg input:focus,.fg select:focus,.fg textarea:focus{border-color:var(--glow);background:var(--glass2)}
.fg select option{background:#0a0d1a;color:#fff}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.ma{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}

.sale-items{border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:11px}
.sir{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center}
.sir input,.sir select{padding:8px 11px;font-size:11px}
.sir .rm{width:32px;height:32px;border-radius:9px;background:rgba(255,56,96,.1);
  border:1px solid rgba(255,56,96,.3);color:var(--red);cursor:pointer;font-size:13px}
.bill{background:linear-gradient(135deg,rgba(0,240,255,.08),rgba(168,85,247,.08));
  border:1px solid var(--glow);border-radius:12px;padding:14px;margin-top:12px}
.br{display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px;color:var(--muted)}
.br.tot{font-family:var(--fd);font-size:16px;color:var(--text);font-weight:800;
  border-top:1px solid var(--border);padding-top:11px;margin-top:11px}
.br.tot .v{color:var(--green);text-shadow:0 0 15px rgba(0,255,157,.5)}

.tabs{display:flex;gap:7px;margin-bottom:14px;flex-wrap:wrap}
.tab{padding:8px 14px;border-radius:10px;background:var(--glass);border:1px solid var(--border);
  color:var(--muted);cursor:pointer;font-size:11px;font-weight:600;transition:all .25s}
.tab:hover{color:var(--text);border-color:var(--glow)}
.tab.active{background:linear-gradient(135deg,rgba(0,240,255,.15),rgba(168,85,247,.15));
  color:var(--text);border-color:var(--glow)}

#toast{position:fixed;bottom:22px;right:22px;z-index:2000;display:flex;flex-direction:column;gap:9px;pointer-events:none}
.toast{padding:13px 18px;border-radius:12px;background:rgba(15,20,36,.98);
  border:1px solid var(--glow);color:var(--text);font-size:12px;font-weight:500;
  box-shadow:0 20px 50px rgba(0,0,0,.5);animation:slideIn .4s ease;
  display:flex;align-items:center;gap:10px;min-width:250px;pointer-events:auto}
.toast.success{border-color:rgba(0,255,157,.5)}
.toast.error{border-color:rgba(255,56,96,.5)}
.toast.info{border-color:rgba(0,240,255,.5)}
@keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}
.toast.out{animation:slideOut .3s ease forwards}
@keyframes slideOut{to{transform:translateX(120%);opacity:0}}

.menu-t{display:none;background:none;border:none;color:var(--text);font-size:22px;cursor:pointer}
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:9}
.overlay.show{display:block}
@media(max-width:900px){
  #app{grid-template-columns:1fr}
  .sidebar{position:fixed;left:-280px;top:0;width:250px;height:100vh;transition:left .3s;z-index:100}
  .sidebar.open{left:0}
  .main{padding:16px}
  .menu-t{display:block}
  .ph h1{font-size:20px}
  .fr{grid-template-columns:1fr}
  .sir{grid-template-columns:1fr 1fr}
  .user-chip .nm,.user-chip .rl{display:none}
  .user-chip{padding:5px}
}
::-webkit-scrollbar{width:7px;height:7px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(0,240,255,.2);border-radius:10px}
.dlg-bg{position:fixed;inset:0;z-index:4000;background:rgba(5,6,13,.78);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);display:none;align-items:center;justify-content:center;padding:22px}
.dlg-bg.show{display:flex}
.dlg{width:min(420px,100%);background:linear-gradient(180deg,#141b32,#0b101e);border:1px solid rgba(0,240,255,.22);border-radius:22px;overflow:hidden;box-shadow:0 32px 90px rgba(0,0,0,.7),0 0 40px rgba(0,240,255,.08);animation:dlgIn .28s ease}
@keyframes dlgIn{from{opacity:0;transform:translateY(16px) scale(.96)}to{opacity:1;transform:none}}
.dlg-top{padding:22px 22px 0}
.dlg-ico{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;font-size:20px;margin-bottom:14px}
.dlg-ico.warn{background:rgba(255,214,10,.12);border:1px solid rgba(255,214,10,.32)}
.dlg-ico.danger{background:rgba(255,56,96,.12);border:1px solid rgba(255,56,96,.35)}
.dlg-ico.info{background:rgba(0,240,255,.12);border:1px solid rgba(0,240,255,.3)}
.dlg h4{font-family:var(--fd);font-size:16px;font-weight:800;letter-spacing:.3px;margin-bottom:8px}
.dlg p{font-size:13px;color:var(--muted);line-height:1.6}
.dlg-body{padding:4px 22px 8px}
.dlg-body input{width:100%;margin-top:12px;padding:12px 13px;background:var(--glass);border:1px solid var(--border);border-radius:12px;color:var(--text);font-size:13px;outline:none;font-family:var(--fb)}
.dlg-body input:focus{border-color:var(--glow);box-shadow:0 0 0 3px rgba(0,240,255,.12)}
.dlg-actions{display:flex;gap:10px;justify-content:flex-end;padding:16px 22px;border-top:1px solid var(--border);background:rgba(255,255,255,.02)}
.theme-btn{width:38px;height:38px;border-radius:12px;background:var(--glass);border:1px solid var(--border);color:var(--text);cursor:pointer;font-size:16px;display:grid;place-items:center}
.theme-btn:hover{border-color:var(--glow)}
html.light body{background:radial-gradient(ellipse at top left,rgba(2,132,199,.08),transparent 40%),radial-gradient(ellipse at bottom right,rgba(124,58,237,.08),transparent 45%),var(--bg);color:var(--text)}
html.light .sidebar{background:linear-gradient(180deg,#fff,#f8fafc);border-right:1px solid var(--border)}
html.light .card,html.light .stat,html.light .login-box,html.light .modal,html.light .dlg{background:var(--card);color:var(--text)}
html.light .user-menu .drop{background:#fff}
html.light .toast{background:#fff;color:var(--text)}
html.light .login-box h1,.logo-text,.ph h1{background:linear-gradient(135deg,var(--cyan),var(--purple));-webkit-background-clip:text;background-clip:text;color:transparent}
.hl-rider,.hl-otp{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px 18px;border-radius:16px;margin-bottom:12px}
.hl-rider{background:linear-gradient(135deg,rgba(168,85,247,.18),rgba(0,240,255,.1));border:1px solid rgba(168,85,247,.45)}
.hl-otp{background:linear-gradient(135deg,rgba(255,214,10,.2),rgba(255,139,61,.12));border:1px solid rgba(255,214,10,.5)}
.hl-k{font-size:10px;letter-spacing:1.6px;text-transform:uppercase;color:var(--muted);font-weight:700}
.hl-v{font-family:var(--fd);font-size:22px;font-weight:800;letter-spacing:.6px}
.hl-rider .hl-v{color:var(--purple)}
.hl-otp .hl-v{color:var(--yellow);text-shadow:0 0 18px rgba(255,214,10,.45)}
.track-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
@media(max-width:700px){.track-grid{grid-template-columns:1fr}}
.kv{padding:12px 14px;border-radius:12px;background:var(--glass);border:1px solid var(--border)}
.kv .k{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:4px}
.kv .v{font-size:13px;font-weight:600;word-break:break-word}
</style>
</head>
<body>
<div id="errBanner"><span>!</span><span id="errText">Error</span>
  <button onclick="document.getElementById('errBanner').classList.remove('show')">Dismiss</button></div>

<!-- ═══════════ LOGIN SCREEN ═══════════ -->
<div id="login">
  <div class="login-box">
    <div class="login-logo">🛒</div>
    <h1>NEXGROCER</h1>
    <div class="sub"><span class="c-cyan">Premium</span> · <span class="c-purple">Tracking</span> · <span class="c-pink">Orders</span> · <span class="c-green">Live</span></div>
    <div class="tabs-auth">
      <div class="tab-auth active" id="tabLogin" onclick="switchAuth('login')">🔐 Login</div>
      <div class="tab-auth" id="tabSignup" onclick="switchAuth('signup')">✨ Sign Up</div>
    </div>
    <div id="formLogin">
      <div class="field"><span class="ico">📧</span><input type="email" id="loginEmail" placeholder="your@gmail.com"/></div>
      <div class="field"><span class="ico">🔒</span><input type="password" id="loginPass" placeholder="Password"/></div>
      <button class="login-btn" id="loginBtn" onclick="doLogin()">⚡ SIGN IN</button>
    </div>
    <div id="formSignup" style="display:none">
      <div class="field"><span class="ico">👤</span><input type="text" id="signupName" placeholder="Full Name"/></div>
      <div class="field"><span class="ico">📧</span><input type="email" id="signupEmail" placeholder="your@gmail.com"/></div>
      <div class="field"><span class="ico">📱</span><input type="tel" id="signupPhone" placeholder="Phone (optional)"/></div>
      <div class="field"><span class="ico">🔒</span><input type="password" id="signupPass" placeholder="Password (min 6)"/></div>
      <button class="login-btn" id="signupBtn" onclick="doSignup()">✨ CREATE ACCOUNT</button>
    </div>
    <div class="auth-msg" id="authMsg"></div>
    <div class="auth-hint">Create an account to start. Website access is open — Sign Up, then Sign In with your email and password.</div>
  </div>
</div>

<!-- ═══════════ MAIN APP ═══════════ -->
<div id="app">
  <aside class="sidebar" id="sidebar">
    <div class="logo"><div class="logo-icon">🛒</div>
      <div><div class="logo-text">NEXGROCER</div><div class="logo-sub" id="roleLabel">PANEL</div></div></div>

    <div id="adminNav" style="display:none">
      <div class="nav-t">Main</div>
      <nav class="nav">
        <a data-page="dashboard" class="active"><span class="ic">⚡</span>Dashboard</a>
        <a data-page="orders"><span class="ic">📦</span>Orders <span class="badge" id="orderBadge" style="display:none">0</span></a>
        <a data-page="sales"><span class="ic">💰</span>Sales</a>
        <a data-page="customers"><span class="ic">👥</span>Customers</a>
      </nav>
      <div class="nav-t">Management</div>
      <nav class="nav">
        <a data-page="inventory"><span class="ic">🧊</span>Inventory</a>
        <a data-page="expenses"><span class="ic">💸</span>Expenses</a>
        <a data-page="reports"><span class="ic">📊</span>Reports</a>
        <a data-page="users"><span class="ic">👤</span>Users</a>
        <a data-page="vault"><span class="ic">🔑</span>IDs & Passwords</a>
      </nav>
      <div class="nav-t">System</div>
      <nav class="nav">
        <a data-page="track"><span class="ic">🛵</span>Swiggy Track</a>
        <a data-page="bot"><span class="ic">🤖</span>Bot</a>
        <a data-page="backup"><span class="ic">💾</span>Backup</a>
      </nav>
    </div>

    <div id="userNav" style="display:none">
      <div class="nav-t">My Space</div>
      <nav class="nav">
        <a data-page="udash" class="active"><span class="ic">⚡</span>Dashboard</a>
        <a data-page="mysubmit"><span class="ic">🔗</span>Submit Link</a>
        <a data-page="utrack"><span class="ic">🛵</span>Track Order</a>
        <a data-page="myorders"><span class="ic">📦</span>My Orders</a>
        <a data-page="mycart"><span class="ic">🛒</span>My Cart</a>
        <a data-page="mystats"><span class="ic">📊</span>My Stats</a>
        <a data-page="mylinks"><span class="ic">🔗</span>My Links</a>
        <a data-page="myrevenue"><span class="ic">💰</span>My Revenue</a>
        <a data-page="myprofile"><span class="ic">👤</span>Profile</a>
      </nav>
    </div>

    <div class="sb-foot">
      <div class="st live-blink"><span class="dot"></span>LIVE • System Online</div>
      <div class="info">v1.0 • Single File</div>
    </div>
  </aside>

  <main class="main">
    <div class="topbar">
      <button class="menu-t" onclick="toggleMenu()">☰</button>
      <div class="search"><span class="ic">🔍</span><input id="globalSearch" placeholder="Search..."/></div>
      <div class="top-actions">
        <button class="theme-btn" id="themeBtn" title="Toggle theme" onclick="toggleTheme()">🌙</button>
        <div class="user-menu" id="userMenu">
          <div class="user-chip" onclick="toggleUserMenu(event)">
            <div class="avatar" id="avatarTxt">?</div>
            <div><div class="nm" id="userName">User</div><div class="rl" id="userRole">Role</div></div>
          </div>
          <div class="drop">
            <button type="button" onclick="event.stopPropagation(); toggleUserMenu(); navigate(S.user&&S.user.role==='admin'?'dashboard':'udash')">🏠 Dashboard</button>
            <button type="button" onclick="event.stopPropagation(); confirmLogout()">🚪 Sign out</button>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══ ADMIN PAGES ═══ -->
    <div id="adminPages" style="display:none">
      <!-- PAGE_TEMPLATE: dashboard (iske pattern se naye page banao) -->
      <section class="page active" id="page-dashboard">
        <div class="ph">
          <div><h1>Welcome, <span class="grad" id="welcomeName">Admin</span></h1>
            <p><span class="live-blink"><span class="dot"></span>LIVE</span> · <span class="c-cyan">Orders</span> · <span class="c-purple">Sales</span> · <span class="c-green">Inventory</span> · <span class="c-pink">Users</span> · <span class="c-yellow">Bot</span></p></div>
          <button class="btn btn-p" onclick="openNewSale()">➕ New Sale</button>
        </div>
        <div class="stats" id="dashStats"></div>
        <div class="row">
          <div class="card"><div class="ch"><h3>📊 Revenue & Profit</h3><span class="pill">LAST 7 DAYS</span></div>
            <div class="chart"><canvas id="revChart"></canvas></div></div>
          <div class="card"><div class="ch"><h3>🔔 Live Activity</h3><span class="pill live"><span class="dot"></span>LIVE</span></div>
            <div class="feed" id="activityFeed"></div></div>
        </div>
        <div class="row">
          <div class="card"><div class="ch"><h3>📋 Recent Orders</h3><span class="pill">LATEST</span></div>
            <div class="table-w"><table><thead><tr><th>Order ID</th><th>User</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody id="recentOrders"></tbody></table></div></div>
          <div class="card"><div class="ch"><h3>⚠️ Low Stock</h3><span class="pill">ALERT</span></div>
            <div id="lowStockList"></div></div>
        </div>
      </section>

      <section class="page" id="page-orders">
        <div class="ph"><div><h1>📦 Orders</h1><p><span class="live-blink"><span class="dot"></span>LIVE</span> · Swipe right to deliver · last 4 digits search</p></div></div>
        <div class="stats" id="orderStats"></div>
        <div class="card">
          <div class="ch"><h3>All Orders</h3>
            <div class="tabs" style="margin:0">
              <div class="tab active" onclick="filterOrders(this,'all')">All</div>
              <div class="tab" onclick="filterOrders(this,'new')">New</div>
              <div class="tab" onclick="filterOrders(this,'delivered')">Delivered</div>
              <div class="tab" onclick="filterOrders(this,'cancelled')">Cancelled</div>
            </div></div>
          <div class="fg" style="margin:0 0 12px"><input id="orderSearch" placeholder="🔍 Search Order ID / last 4 / tracking link"/></div>
          <div class="table-w"><table><thead><tr><th>Order</th><th>User</th><th>Sale</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="ordersTable"></tbody></table></div>
        </div>
      </section>

      <section class="page" id="page-sales">
        <div class="ph"><div><h1>💰 Sales</h1><p>Manual sales & billing</p></div>
          <button class="btn btn-p" onclick="openNewSale()">➕ New Sale</button></div>
        <div class="stats" id="saleStats"></div>
        <div class="card"><div class="ch"><h3>All Sales</h3><span class="pill">LATEST</span></div>
          <div class="table-w"><table><thead><tr><th>Bill #</th><th>Customer</th><th>Items</th><th>Amount</th><th>Profit</th><th>Date</th></tr></thead>
            <tbody id="salesTable"></tbody></table></div></div>
      </section>

      <section class="page" id="page-customers">
        <div class="ph"><div><h1>👥 Customers</h1><p>Customer directory</p></div>
          <button class="btn btn-p" onclick="openModal('customerModal')">➕ Add Customer</button></div>
        <div class="card"><div class="ch"><h3>All Customers</h3><span class="pill">TOTAL</span></div>
          <div class="ugrid" id="custGrid"></div></div>
      </section>

      <section class="page" id="page-inventory">
        <div class="ph"><div><h1>🧊 Inventory & Stock</h1><p><span class="live-blink"><span class="dot"></span>LIVE</span> · Sell price = per-link charge</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-p" onclick="openModal('productModal')">➕ Add Product</button>
            <button class="btn btn-green" onclick="downloadBackup()">💾 Download Stock Backup</button>
            <button class="btn btn-p" onclick="document.getElementById('inventoryStockFileInput').click()">📤 Restore Stock</button>
            <input type="file" id="inventoryStockFileInput" accept=".json,application/json" style="display:none" onchange="uploadBackup(this)"/>
            <button class="btn btn-g" onclick="clearAllStock()">🧊 Clear All Stock</button>
            <button class="btn btn-red" onclick="purgeAllProducts()">🗑️ Delete All Products</button>
          </div></div>
        <div class="card" style="margin-bottom:16px;background:rgba(20,184,166,0.06);border:1px solid rgba(20,184,166,0.25);padding:14px 18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div><div style="font-weight:700;font-size:13px;color:var(--text)">🛡️ Stock Data Safety & Offline Backup</div>
            <div style="font-size:12px;color:var(--muted);margin-top:4px">Agar website ya server band ho jaye, stock backup download karke rakhein. Nayi hosting par JSON upload karke restore ho jayega.</div></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-sm btn-green" onclick="downloadBackup()">⬇️ Download Backup</button>
            <button class="btn btn-sm btn-p" onclick="document.getElementById('inventoryStockFileInput').click()">⬆️ Upload & Restore</button>
          </div>
        </div>
        <div class="stats" id="invStats"></div>
        <div class="row eq">
          <div class="card"><div class="ch"><h3>📦 Products</h3><span class="pill live"><span class="dot"></span>LIVE</span></div>
            <div class="table-w"><table><thead><tr><th>Product</th><th>Stock</th><th>Buy</th><th>Sell</th><th>Status</th><th>Action</th></tr></thead>
              <tbody id="invTable"></tbody></table></div></div>
          <div class="card"><div class="ch"><h3>📒 Stock Ledger</h3><span class="pill">RECENT</span></div>
            <div class="table-w"><table><thead><tr><th>Date</th><th>Product</th><th>Type</th><th>Qty</th><th>Bal</th></tr></thead>
              <tbody id="ledgerTable"></tbody></table></div></div>
        </div>
      </section>

      <section class="page" id="page-expenses">
        <div class="ph"><div><h1>💸 Expenses</h1><p>Business expenses</p></div>
          <button class="btn btn-p" onclick="openModal('expenseModal')">➕ Add Expense</button></div>
        <div class="stats" id="expStats"></div>
        <div class="card"><div class="ch"><h3>All Expenses</h3><span class="pill">RECENT</span></div>
          <div class="table-w"><table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Action</th></tr></thead>
            <tbody id="expTable"></tbody></table></div></div>
      </section>

      <section class="page" id="page-reports">
        <div class="ph"><div><h1>📊 Reports</h1><p>Analytics</p></div></div>
        <div class="row eq">
          <div class="card"><div class="ch"><h3>📈 Sales Trend (7 days)</h3></div>
            <div class="chart"><canvas id="trendChart"></canvas></div></div>
          <div class="card"><div class="ch"><h3>🥧 Product Mix</h3></div>
            <div class="chart"><canvas id="pieChart"></canvas></div></div>
        </div>
      </section>

      <section class="page" id="page-users">
        <div class="ph"><div><h1>👤 Users</h1><p><span class="live-blink"><span class="dot"></span>LIVE</span> · Click user for links/revenue · Deactivate or Delete</p></div>
          <button class="btn btn-p" onclick="openModal('userModal')">➕ Add User</button></div>
        <div class="stats" id="userStats"></div>
        <div class="card"><div class="ch"><h3>All Users</h3><span class="pill live"><span class="dot"></span>LIVE</span></div>
          <div class="table-w"><table><thead><tr><th>User</th><th>Email</th><th>Cart</th><th>Links</th><th>Revenue</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="usersTable"></tbody></table></div></div>
      </section>

      <section class="page" id="page-vault">
        <div class="ph"><div><h1 class="c-yellow">User IDs & Passwords</h1><p>Har user ka login alag store — merge nahi hota</p></div></div>
        <div class="card"><div class="ch"><h3>Credential Vault</h3><span class="pill live"><span class="dot"></span>LIVE</span></div>
          <div class="table-w"><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Password</th><th>Phone</th><th>Telegram</th><th>Orders</th><th>Status</th><th>Action</th></tr></thead>
            <tbody id="vaultTable"></tbody></table></div></div>
      </section>

      <section class="page" id="page-bot">
        <div class="ph"><div><h1>🤖 Telegram Bot & Web Hosting</h1><p>Bot configuration, dynamic hosting link (Lovable / GitHub), and order simulator</p></div></div>
        
        <div class="card" style="margin-bottom:14px">
          <div class="ch"><h3>👑 Telegram Bot Admins</h3><span class="pill" id="botAdminsCountPill">0 ADMINS</span></div>
          <p style="color:var(--muted);font-size:12px;margin-bottom:14px;line-height:1.6">
            Yahan se aap kisi ko bhi Telegram Bot ka Admin bana sakte hain. Admin banne par unhe bot me <b>Manage Users, Export Pending, Mark Delivered, Stats</b> jaise sabhi control buttons mil jayenge.
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">
            <input type="text" id="newBotAdminTgId" placeholder="Telegram ID (e.g. 583920194)" style="flex:1;min-width:180px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:8px 12px;color:#fff" />
            <input type="text" id="newBotAdminName" placeholder="Admin Name / Note (optional)" style="flex:1;min-width:160px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:6px;padding:8px 12px;color:#fff" />
            <button class="btn btn-p" onclick="addBotAdminFromInput()">➕ Make Bot Admin</button>
          </div>
          <div class="table-w">
            <table>
              <thead><tr><th>Admin Name</th><th>Telegram ID</th><th>Source / Account</th><th>Role</th><th>Action</th></tr></thead>
              <tbody id="botAdminsTable"><tr><td colspan="5" class="empty">Loading admins...</td></tr></tbody>
            </table>
          </div>
        </div>

        <div class="card" style="margin-bottom:14px">
          <div class="ch"><h3>🌐 Web App & Hosting Destination</h3><span class="pill" id="hostingPill">LIVE LINK</span></div>
          <p style="color:var(--muted);font-size:12px;margin-bottom:12px;line-height:1.6">
            Telegram bot ke har message aur <b>Open App</b> button me yahi URL open hoga. Chahe <b>Lovable Live link</b> ho ya <b>GitHub Pages link</b>, yahan enter karke Save karein:
          </p>
          <div class="fr" style="margin-bottom:12px">
            <div class="fg" style="flex:1">
              <label>Web Portal URL (Lovable / GitHub / Custom)</label>
              <input id="hostingUrlInput" placeholder="e.g. https://your-project.lovable.app/ or https://userxlinks.github.io/nexgrocer/"/>
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-p" onclick="saveHostingUrl()">💾 Save & Apply URL</button>
            <button class="btn btn-g" onclick="resetToCurrentHost()">📍 Use Current Host</button>
          </div>
          <div id="hostingStatusBox" style="margin-top:12px;padding:10px 12px;border-radius:8px;background:rgba(255,255,255,.03);font-size:12px;color:var(--muted)">Checking active host...</div>
        </div>
        <div class="card" style="margin-bottom:14px">
          <div class="ch"><h3>Connected Bots</h3><span class="pill" id="botPill">OFFLINE</span></div>
          <div id="botStatusBox" style="margin-bottom:14px;font-size:13px;color:var(--muted)">Checking...</div>
          <div id="botList" style="margin-bottom:14px"></div>
          <div class="fr">
            <div class="fg"><label>BotFather Token</label><input id="botToken" type="password" placeholder="123456:AAF... (sirf admin ko dikhega)"/></div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-p" onclick="connectBot(false)">➕ Add Bot (keep others)</button>
            <button class="btn btn-green" onclick="connectBot(true)">🔁 Replace All (stop old)</button>
            <button class="btn btn-red" onclick="disconnectBot()">🔌 Stop & Remove All</button>
          </div>
          <div style="margin-top:16px;padding:14px;border:1px dashed rgba(0,240,255,.3);border-radius:12px;background:rgba(0,240,255,.04);font-size:12px;color:var(--muted);line-height:1.6">
            Add = naya bot saath chalega, data alag rahega.<br/>
            Replace All = purane bots stop + Mini App unlink, sirf naya token chalega.<br/>
            Stop = polling band + Open App button hatao. Data delete nahi hota.
          </div>
        </div>
        <div class="card">
          <div class="ch"><h3>Test Order (without Telegram)</h3><span class="pill">SIMULATOR</span></div>
          <div class="fr">
            <div class="fg"><label>User Email</label><input id="simEmail" placeholder="user@gmail.com"/></div>
            <div class="fg"><label>Tracking Link</label><input id="simLink" placeholder="📦 Order ID: 250072216984219  🔗 https://www.swiggy.com/ofo/track/jQPNNXD1727J"/></div>
          </div>
          <button class="btn btn-p" onclick="simulateBot()">🧪 Send Test Order</button>
          <div id="simResult" style="margin-top:14px"></div>
        </div>
      </section>

      <section class="page" id="page-backup">
        <div class="ph"><div><h1>💾 Stock Backup & Recovery</h1><p><span class="live-blink"><span class="dot"></span>LIVE</span> · Stock JSON backup & restore</p></div></div>
        <div class="card">
          <div class="ch"><h3>📦 Stock Snapshot</h3><span class="pill">JSON BACKUP</span></div>
          <p style="color:var(--muted);font-size:13px;margin-bottom:16px;line-height:1.6">Download products, prices, current/minimum stock aur inventory ledger ka backup. Hosting/server change hone par JSON file ko nayi hosting par upload karke stock restore karein. Users aur past orders safe rahenge.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <button class="btn btn-green" onclick="downloadBackup()">⬇️ Download Stock JSON</button>
            <button class="btn btn-p" onclick="document.getElementById('backupFile').click()">⬆️ Upload & Restore Stock JSON</button>
            <input type="file" id="backupFile" accept=".json,application/json" style="display:none" onchange="uploadBackup(this)"/>
          </div>
          <div id="backupResult" style="margin-top:14px;font-size:13px;color:var(--muted)"></div>
        </div>
      </section>

      <section class="page" id="page-track">
        <div class="ph"><div><h1>🛵 Swiggy Track</h1><p><span class="live-blink"><span class="dot"></span>LIVE</span> · Last 4 digits of stored Order ID, or paste tracking link</p></div></div>
        <div class="card">
          <div class="ch"><h3>Lookup rider + OTP</h3><span class="pill live"><span class="dot"></span>LIVE</span></div>
          <div class="fg"><label>Last 4 / Order ID / Tracking link</label>
            <input id="adminTrackQ" placeholder="e.g. 4727  or  https://www.swiggy.com/ofo/track/jQPNNXD1727J"/></div>
          <button class="btn btn-p" onclick="runSwiggyTrack('adminTrackQ','adminTrackOut')">🔍 Track</button>
          <div id="adminTrackOut" style="margin-top:16px"></div>
        </div>
      </section>
    </div>

    <!-- ═══ USER PAGES ═══ -->
    <div id="userPages" style="display:none">
      <section class="page active" id="page-udash">
        <div class="ph"><div><h1>Welcome, <span class="grad" id="welcomeUserName">User</span></h1>
          <p><span class="live-blink"><span class="dot"></span>LIVE</span> · <span class="c-cyan">Submit</span> · <span class="c-purple">Orders</span> · <span class="c-pink">Cart</span> · <span class="c-green">Stats</span> · <span class="c-yellow">Profile</span></p></div></div>
        <div class="quick-btns">
          <div class="qbtn a" onclick="navigate('mysubmit')">🔗 Submit Link</div>
          <div class="qbtn f" onclick="navigate('utrack')">🛵 Track Order</div>
          <div class="qbtn b" onclick="navigate('myorders')">📦 My Orders</div>
          <div class="qbtn c" onclick="navigate('mycart')">🛒 My Cart</div>
          <div class="qbtn d" onclick="navigate('mystats')">📊 My Stats</div>
          <div class="qbtn f" onclick="navigate('mylinks')">🔗 My Links</div>
          <div class="qbtn e" onclick="navigate('myrevenue')">💰 Revenue</div>
          <div class="qbtn b" onclick="navigate('myprofile')">👤 Profile</div>
        </div>
        <div class="stats" id="userDashStats"></div>
        <div class="card" style="margin-top:6px">
          <div class="ch"><h3 class="c-cyan">Quick Submit Tracking Link</h3><span class="pill">NEW</span></div>
          <div class="fg"><label>Tracking / Order Link</label><input id="dashTrackLink" placeholder="📦 Order ID: 250072216984219  🔗 https://www.swiggy.com/ofo/track/jQPNNXD1727J"/></div>
          <button class="btn btn-p" onclick="submitMyLink('dashTrackLink')">🔗 Submit Link</button>
          <div id="dashSubmitResult" style="margin-top:12px"></div>
        </div>
        <div class="card" style="margin-top:14px">
          <div class="ch"><h3 class="c-purple">My Assigned Cart</h3><span class="pill">LIVE</span></div>
          <div id="userCartPreview"></div>
        </div>
      </section>

      <section class="page" id="page-mysubmit">
        <div class="ph"><div><h1 class="c-cyan">Submit Link</h1><p>Tracking link ya Order ID paste karo — order auto create</p></div></div>
        <div class="card">
          <div class="fg"><label>Tracking Link / Order ID</label>
            <textarea id="userTrackLink" rows="4" placeholder="📦 Order ID: 250072216984219&#10;🔗 https://www.swiggy.com/ofo/track/jQPNNXD1727J"></textarea></div>
          <button class="btn btn-p" onclick="submitMyLink('userTrackLink')">💾 Save Order</button>
          <div id="userSubmitResult" style="margin-top:14px"></div>
        </div>
      </section>

      <section class="page" id="page-utrack">
        <div class="ph"><div><h1 class="c-cyan">Track Order</h1><p>Paste Swiggy tracking link — stock me hona zaroori nahi</p></div></div>
        <div class="card">
          <div class="fg"><label>Tracking link / last 4</label>
            <textarea id="userTrackQ" rows="3" placeholder="https://www.swiggy.com/ofo/track/aEI14vuZPmxv"></textarea></div>
          <button class="btn btn-p" onclick="runSwiggyTrack('userTrackQ','userTrackOut')">🛵 Get rider + OTP</button>
          <div id="userTrackOut" style="margin-top:16px"></div>
        </div>
      </section>

      <section class="page" id="page-myorders">
        <div class="ph"><div><h1 class="c-purple">My Orders</h1><p>Complete history</p></div></div>
        <div class="card"><div class="ch"><h3>All My Orders</h3></div>
          <div class="table-w"><table><thead><tr><th>Order</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody id="myOrdersTable"></tbody></table></div></div>
      </section>

      <section class="page" id="page-mycart">
        <div class="ph"><div><h1 class="c-pink">My Cart</h1><p>Admin assigned products</p></div></div>
        <div class="card"><div class="ch"><h3>Cart Items</h3><span class="pill">ACTIVE</span></div>
          <div class="table-w"><table><thead><tr><th>Product</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
            <tbody id="myCartTable"></tbody></table></div>
          <div class="bill" style="margin-top:16px">
            <div class="br"><span>Total Items</span><span id="cartTotalItems">0</span></div>
            <div class="br tot"><span>CART VALUE</span><span class="v" id="cartTotalValue">₹0</span></div></div></div>
      </section>

      <section class="page" id="page-mystats">
        <div class="ph"><div><h1 class="c-green">My Stats</h1><p>Sirf aapka data — kisi aur se mix nahi</p></div></div>
        <div class="stats" id="userStatsCards"></div>
        <div class="card"><div class="ch"><h3>Progress</h3></div>
          <div id="userProgressBox" style="font-size:13px;color:var(--muted)"></div></div>
      </section>

      <section class="page" id="page-mylinks">
        <div class="ph"><div><h1 class="c-cyan">My Links</h1><p>Aapke stored tracking links</p></div></div>
        <div class="card"><div class="ch"><h3>Link Store</h3><span class="pill">PRIVATE</span></div>
          <div class="table-w"><table><thead><tr><th>Order</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
            <tbody id="myLinksTable"></tbody></table></div></div>
      </section>

      <section class="page" id="page-myrevenue">
        <div class="ph"><div><h1 class="c-orange">My Revenue</h1><p>Delivered sales + pending value</p></div></div>
        <div class="stats" id="userRevenueCards"></div>
        <div class="card"><div class="ch"><h3>Daily</h3><span class="pill">LAST 30</span></div>
          <div class="table-w"><table><thead><tr><th>Day</th><th>Orders</th><th>Revenue</th><th>Profit</th></tr></thead>
            <tbody id="myRevenueTable"></tbody></table></div></div>
      </section>

      <section class="page" id="page-myprofile">
        <div class="ph"><div><h1 class="c-yellow">My Profile</h1><p>Account info</p></div></div>
        <div class="card"><div class="ch"><h3>Details</h3></div>
          <div class="fr"><div class="fg"><label>Name</label><input id="profName"/></div>
            <div class="fg"><label>Email</label><input id="profEmail" readonly/></div></div>
          <div class="fr"><div class="fg"><label>Phone</label><input id="profPhone"/></div>
            <div class="fg"><label>Status</label><input id="profStatus" readonly/></div></div>
          <button class="btn btn-p" onclick="saveMyProfile()">Save Profile</button></div>
      </section>
    </div>
  </main>
</div>

<!-- ═══ MODALS ═══ -->
<div class="modal-bg" id="saleModal"><div class="modal">
  <div class="mh"><h3>🛒 New Sale</h3><button class="mc" onclick="closeModal('saleModal')">✕</button></div>
  <div class="fr"><div class="fg"><label>Customer</label><select id="saleCustomer"><option value="">-- Walk-in --</option></select></div>
    <div class="fg"><label>Bill #</label><input id="saleBill" readonly style="opacity:.7"/></div></div>
  <div class="fg"><label>Items</label><div class="sale-items" id="saleItems"></div>
    <button class="btn btn-g btn-sm" onclick="addSaleItem()">➕ Add Item</button></div>
  <div class="fg"><label>Discount (₹)</label><input type="number" id="saleDiscount" value="0" oninput="recalcSale()"/></div>
  <div class="bill"><div class="br"><span>Subtotal</span><span id="subtotal">₹0</span></div>
    <div class="br"><span>Discount</span><span id="discountVal">-₹0</span></div>
    <div class="br tot"><span>FINAL BILL</span><span class="v" id="finalAmt">₹0</span></div></div>
  <div class="ma"><button class="btn btn-g" onclick="closeModal('saleModal')">Cancel</button>
    <button class="btn btn-green" onclick="saveSale()">✅ Save Sale</button></div>
</div></div>

<div class="modal-bg" id="customerModal"><div class="modal">
  <div class="mh"><h3>👥 Add Customer</h3><button class="mc" onclick="closeModal('customerModal')">✕</button></div>
  <div class="fg"><label>Full Name</label><input id="cName"/></div>
  <div class="fg"><label>Phone</label><input id="cPhone"/></div>
  <div class="ma"><button class="btn btn-g" onclick="closeModal('customerModal')">Cancel</button>
    <button class="btn btn-p" onclick="saveCustomer()">➕ Add</button></div>
</div></div>

<div class="modal-bg" id="productModal"><div class="modal">
  <div class="mh"><h3>📦 Add Product</h3><button class="mc" onclick="closeModal('productModal')">✕</button></div>
  <div class="fr"><div class="fg"><label>Name</label><input id="pName"/></div>
    <div class="fg"><label>SKU</label><input id="pSKU"/></div></div>
  <div class="fr"><div class="fg"><label>Buy Price</label><input type="number" id="pBuy" value="0"/></div>
    <div class="fg"><label>Sell Price</label><input type="number" id="pSell" value="0"/></div></div>
  <div class="fr"><div class="fg"><label>Stock</label><input type="number" id="pStock" value="0"/></div>
    <div class="fg"><label>Min Stock</label><input type="number" id="pMin" value="0"/></div></div>
  <div class="fg"><label>Emoji</label><input id="pEmoji" value="📦" maxlength="2"/></div>
  <div class="ma"><button class="btn btn-g" onclick="closeModal('productModal')">Cancel</button>
    <button class="btn btn-p" onclick="saveProduct()">➕ Add</button></div>
</div></div>

<div class="modal-bg" id="expenseModal"><div class="modal">
  <div class="mh"><h3>💸 Add Expense</h3><button class="mc" onclick="closeModal('expenseModal')">✕</button></div>
  <div class="fg"><label>Category</label><select id="eCat">
    <option>Delivery</option><option>Transport</option><option>Packaging</option>
    <option>Labour</option><option>Electricity</option><option>Rent</option><option>Misc</option></select></div>
  <div class="fg"><label>Amount (₹)</label><input type="number" id="eAmt"/></div>
  <div class="fg"><label>Description</label><textarea id="eDesc" rows="2"></textarea></div>
  <div class="ma"><button class="btn btn-g" onclick="closeModal('expenseModal')">Cancel</button>
    <button class="btn btn-p" onclick="saveExpense()">➕ Add</button></div>
</div></div>

<div class="modal-bg" id="userModal"><div class="modal">
  <div class="mh"><h3>👤 Add User</h3><button class="mc" onclick="closeModal('userModal')">✕</button></div>
  <div class="fr"><div class="fg"><label>Name</label><input id="uName"/></div>
    <div class="fg"><label>Phone</label><input id="uPhone"/></div></div>
  <div class="fg"><label>Email</label><input type="email" id="uEmail"/></div>
  <div class="fg"><label>Password (min 6)</label><input type="password" id="uPass"/></div>
  <div class="ma"><button class="btn btn-g" onclick="closeModal('userModal')">Cancel</button>
    <button class="btn btn-p" onclick="saveUser()">➕ Add</button></div>
</div></div>

<div class="modal-bg" id="cartModal"><div class="modal">
  <div class="mh"><h3>🛒 Assign Cart</h3><button class="mc" onclick="closeModal('cartModal')">✕</button></div>
  <div class="fg"><label>User</label><input id="cartUser" readonly/></div>
  <div class="fg"><label>Cart Items</label><div class="sale-items" id="cartItems"></div>
    <button class="btn btn-g btn-sm" onclick="addCartItem()">➕ Add Product</button></div>
  <div class="ma"><button class="btn btn-g" onclick="closeModal('cartModal')">Cancel</button>
    <button class="btn btn-green" onclick="saveCart()">✅ Save Cart</button></div>
</div></div>

<div class="modal-bg" id="orderModal"><div class="modal">
  <div class="mh"><h3>📦 Order Details</h3><button class="mc" onclick="closeModal('orderModal')">✕</button></div>
  <div id="orderDetailBody"></div>
</div></div>

<div class="modal-bg" id="userDetailModal"><div class="modal" style="max-width:720px">
  <div class="mh"><h3 id="userDetailTitle">👤 User</h3><button class="mc" onclick="closeModal('userDetailModal')">✕</button></div>
  <div id="userDetailBody"></div>
</div></div>

<div class="dlg-bg" id="confirmDlg">
  <div class="dlg" onclick="event.stopPropagation()">
    <div class="dlg-top"><div class="dlg-ico danger" id="dlgIco">!</div>
      <h4 id="dlgTitle">Confirm</h4></div>
    <div class="dlg-body"><p id="dlgMsg"></p><input id="dlgInput" style="display:none" autocomplete="off"/></div>
    <div class="dlg-actions">
      <button type="button" class="btn btn-g" id="dlgCancel">Cancel</button>
      <button type="button" class="btn btn-red" id="dlgOk">Confirm</button>
    </div>
  </div>
</div>
<div id="toast"></div>
<div class="overlay" id="overlay" onclick="toggleMenu()"></div>

<script>
'use strict';
/* ═══ Anti-Crash ═══ */
window.addEventListener('error', e => showErr(e.error?.message || 'Error'));
window.addEventListener('unhandledrejection', e => showErr(e.reason?.message || 'Promise error'));
function showErr(msg){ try{ document.getElementById('errText').textContent = msg;
  document.getElementById('errBanner').classList.add('show');
  setTimeout(()=>document.getElementById('errBanner').classList.remove('show'), 4000); }catch(_){}}



/* ═══ State + API helper ═══ */
const S = { user:null, token:null, products:[], orders:[], users:[], customers:[], sales:[], expenses:[], ledger:[], charts:{}, timers:[] };
const fmtINR = n => '₹' + Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2});
const initials = n => (n||'?').split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
function oidHtml(o){
  const id = o.order_id || '-';
  const link = o.tracking_link || '';
  const href = link.indexOf('http')===0 ? '<a href="'+link+'" target="_blank" rel="noopener">'+link+'</a>' : (link||'—');
  return '<div class="oid-card"><div class="oid-line">📦 <span class="k">Order ID:</span> <span class="id">'+id+'</span></div>'
    + '<div class="oid-link">🔗 '+href+'</div></div>';
}

async function api(method, url, body){
  const opts = { method, headers: { 'Content-Type':'application/json' } };
  if (S.token) opts.headers['Authorization'] = 'Bearer ' + S.token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  let data = null;
  try { data = await res.json(); } catch(_) {}
  if (!res.ok) throw Object.assign(new Error(data?.error || 'HTTP_' + res.status), { data, status: res.status });
  return data;
}

function showToast(msg, type, big){
  try{
    const wrap = document.getElementById('toast');
    const t = document.createElement('div');
    t.className = 'toast ' + (type||'success') + (big?' big':'');
    const icons = { success:'✅', error:'⚠️', info:'ℹ️' };
    t.innerHTML = '<span>' + (icons[type]||'•') + '</span><span>' + msg + '</span>';
    wrap.appendChild(t);
    setTimeout(()=>{ t.classList.add('out'); setTimeout(()=>t.remove(),300); }, big?4500:3000);
  }catch(_){}
}
function applyTheme(mode){
  const light = mode === 'light';
  document.documentElement.classList.toggle('light', light);
  const btn = document.getElementById('themeBtn');
  if(btn) btn.textContent = light ? '☀️' : '🌙';
  try{ localStorage.setItem('ng_theme', light ? 'light' : 'dark'); }catch(_){}
}
function toggleTheme(){
  applyTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light');
}
function escHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function renderTrackResult(info){
  if(!info || info.ok === false){
    return '<div class="low-item" style="border-color:rgba(255,56,96,.45)"><div class="pi">!</div><div class="pinfo"><div class="pn">'+(info && (info.error||info.message) || 'Track failed')+'</div><div class="ps">'+(info && info.message && info.error ? escHtml(info.message) : 'Link / last-4 check karo')+'</div></div></div>';
  }
  const rider = info.rider || '(not assigned / hidden)';
  const otp = info.otp || '(not available)';
  const stored = info.stored ? '<div class="kv"><div class="k">Stored Order</div><div class="v">'+escHtml(info.stored.order_id||'')+' · '+escHtml(info.stored.status||'')+'</div></div>' : '';
  const prods = (info.products||[]).filter(p=>p.otp).map(p=>'<div class="kv"><div class="k">Product '+p.n+' OTP</div><div class="v">'+escHtml(p.otp)+'</div></div>').join('');
  return ''
    + '<div class="hl-rider"><div><div class="hl-k">Rider</div><div class="hl-v">'+escHtml(rider)+'</div></div><span class="pill live"><span class="dot"></span>LIVE</span></div>'
    + '<div class="hl-otp"><div><div class="hl-k">Delivery OTP</div><div class="hl-v">'+escHtml(otp)+'</div></div></div>'
    + '<div class="track-grid">'
    + '<div class="kv"><div class="k">Status</div><div class="v">'+escHtml(info.status_message||'-')+'</div></div>'
    + '<div class="kv"><div class="k">Order ID</div><div class="v">'+escHtml(info.order_id||'-')+'</div></div>'
    + '<div class="kv"><div class="k">Outlet</div><div class="v">'+escHtml(info.outlet||'-')+'<div style="font-size:11px;color:var(--muted);margin-top:4px">'+escHtml(info.outlet_sub||'')+'</div></div></div>'
    + '<div class="kv"><div class="k">Header</div><div class="v">'+escHtml(info.header||'-')+'<div style="font-size:11px;color:var(--muted);margin-top:4px">'+escHtml(info.header_sub||'')+'</div></div></div>'
    + '</div>'
    + (info.details ? '<div class="kv" style="margin-top:10px"><div class="k">Details</div><div class="v">'+escHtml(info.details)+'</div></div>' : '')
    + (stored ? '<div style="margin-top:10px">'+stored+'</div>' : '')
    + (prods ? '<div class="track-grid" style="margin-top:10px">'+prods+'</div>' : '');
}
async function runSwiggyTrack(inputId, outId){
  const el = document.getElementById(inputId);
  const out = document.getElementById(outId);
  const q = (el && (el.value || el.textContent) || '').trim();
  if(!q){ showToast('Last 4 / tracking link daalein','error'); return; }
  if(out) out.innerHTML = '<div class="low-item"><div class="pi">…</div><div class="pinfo"><div class="pn">Tracking…</div><div class="ps">Swiggy live lookup</div></div></div>';
  try{
    const info = await api('POST','/api/swiggy/track',{ q });
    if(out) out.innerHTML = renderTrackResult(info);
    if(info && info.ok) showToast('Rider + OTP updated','success');
    else showToast((info && (info.message||info.error)) || 'Track failed','error');
  }catch(e){
    const info = e.data || { ok:false, error:e.message, message:e.data && e.data.message };
    if(out) out.innerHTML = renderTrackResult(info);
    showToast(info.message || info.error || e.message,'error');
  }
}
function openModal(id){ document.getElementById(id).classList.add('show'); }
function closeModal(id){ document.getElementById(id).classList.remove('show'); }
function uiDialog(opts){
  return new Promise(resolve=>{
    const bg = document.getElementById('confirmDlg');
    const ico = document.getElementById('dlgIco');
    const title = document.getElementById('dlgTitle');
    const msg = document.getElementById('dlgMsg');
    const inp = document.getElementById('dlgInput');
    const ok = document.getElementById('dlgOk');
    const cancel = document.getElementById('dlgCancel');
    const kind = opts.kind || 'warn';
    ico.className = 'dlg-ico ' + (kind==='danger'?'danger': kind==='info'?'info':'warn');
    ico.textContent = opts.icon || (kind==='danger'?'!': kind==='info'?'i':'?');
    title.textContent = opts.title || 'Please confirm';
    msg.textContent = opts.message || '';
    ok.textContent = opts.okText || 'Confirm';
    cancel.textContent = opts.cancelText || 'Cancel';
    ok.className = 'btn ' + (kind==='danger'?'btn-red': kind==='info'?'btn-p':'btn-green');
    if(opts.prompt){ inp.style.display=''; inp.value = opts.value || ''; inp.placeholder = opts.placeholder || ''; }
    else { inp.style.display='none'; inp.value=''; }
    const finish = (v)=>{ bg.classList.remove('show'); ok.onclick=null; cancel.onclick=null; bg.onclick=null; resolve(v); };
    ok.onclick = ()=> finish(opts.prompt ? inp.value : true);
    cancel.onclick = ()=> finish(opts.prompt ? null : false);
    bg.onclick = ()=> finish(opts.prompt ? null : false);
    bg.classList.add('show');
    if(opts.prompt) setTimeout(()=>inp.focus(), 80);
  });
}
function askConfirm(message, title, kind){
  return uiDialog({ title: title||'Confirm', message, kind: kind||'warn', okText:'Confirm', cancelText:'Cancel' });
}
function askDanger(message, title){
  return uiDialog({ title: title||'Delete permanently', message, kind:'danger', icon:'!', okText:'Delete', cancelText:'Cancel' });
}
function askPrompt(message, title, value){
  return uiDialog({ title: title||'Input', message, kind:'info', icon:'✎', prompt:true, value:value||'', okText:'Save', cancelText:'Cancel' });
}

/* ═══ Auth ═══ */
function switchAuth(tab){
  document.querySelectorAll('.tab-auth').forEach(t=>t.classList.remove('active'));
  document.getElementById(tab==='login'?'tabLogin':'tabSignup').classList.add('active');
  document.getElementById('formLogin').style.display = tab==='login' ? '' : 'none';
  document.getElementById('formSignup').style.display = tab==='signup' ? '' : 'none';
  document.getElementById('authMsg').className = 'auth-msg';
}
function authMsg(text, type){
  const el = document.getElementById('authMsg');
  el.className = 'auth-msg show ' + type;
  el.textContent = text;
}

async function doLogin(){
  const btn = document.getElementById('loginBtn');
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  if(!email || !pass) return authMsg('Email & password required','error');
  btn.disabled = true; btn.textContent = 'Loading...';
  try{
    const r = await api('POST','/api/auth/login',{ email, password: pass });
    S.token = r.token; S.user = r.user;
    try{ localStorage.setItem('ng_token', S.token); localStorage.setItem('ng_user', JSON.stringify(S.user)); }catch(_){}
    enterApp();
  }catch(e){
    authMsg(e.data?.error === 'INVALID_CREDENTIALS' ? 'Galat email/password' : (e.message),'error');
  }finally{ btn.disabled = false; btn.textContent = '⚡ SIGN IN'; }
}

async function doSignup(){
  const btn = document.getElementById('signupBtn');
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const phone = document.getElementById('signupPhone').value.trim();
  const pass = document.getElementById('signupPass').value;
  if(!name || !email || !pass) return authMsg('Name, email, password required','error');
  btn.disabled = true; btn.textContent = 'Creating...';
  try{
    const r = await api('POST','/api/auth/register',{ name, email, password: pass, phone });
    S.token = r.token; S.user = r.user;
    try{ localStorage.setItem('ng_token', S.token); localStorage.setItem('ng_user', JSON.stringify(S.user)); }catch(_){}
    enterApp();
  }catch(e){
    const map = { EMAIL_EXISTS:'Ye email already registered hai', WEAK_PASSWORD:'Password min 6 chars', INVALID_EMAIL:'Valid Gmail daalein', NAME_REQUIRED:'Naam daalein' };
    authMsg(map[e.data?.error] || e.message,'error');
  }finally{ btn.disabled = false; btn.textContent = '✨ CREATE ACCOUNT'; }
}

function toggleUserMenu(e){
  if(e) e.stopPropagation();
  const m = document.getElementById('userMenu');
  if(m) m.classList.toggle('open');
}
document.addEventListener('click', ()=>{
  const m = document.getElementById('userMenu');
  if(m) m.classList.remove('open');
});
async function confirmLogout(){
  const m = document.getElementById('userMenu');
  if(m) m.classList.remove('open');
  if(!await askConfirm('Sign out of NexGrocer?', 'Sign out', 'info')) return;
  logout();
}
function logout(){
  S.token = null; S.user = null;
  try{ localStorage.removeItem('ng_token'); localStorage.removeItem('ng_user'); }catch(_){}
  S.timers.forEach(t=>clearInterval(t)); S.timers = [];
  Object.values(S.charts).forEach(c=>{ try{c.destroy();}catch(_){} });
  S.charts = {};
  document.getElementById('app').classList.remove('show');
  document.getElementById('login').classList.remove('hide');
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPass').value = '';
}

/* ═══ Enter App ═══ */
async function enterApp(){
  document.getElementById('login').classList.add('hide');
  document.getElementById('app').classList.add('show');
  const isAdmin = S.user.role === 'admin';
  document.getElementById('roleLabel').textContent = isAdmin ? 'ADMIN PANEL' : 'USER PANEL';
  document.getElementById('avatarTxt').textContent = initials(S.user.name);
  document.getElementById('userName').textContent = S.user.name;
  document.getElementById('userRole').textContent = isAdmin ? 'Administrator' : 'User';
  document.getElementById('adminNav').style.display = isAdmin ? '' : 'none';
  document.getElementById('userNav').style.display = isAdmin ? 'none' : '';
  document.getElementById('adminPages').style.display = isAdmin ? '' : 'none';
  document.getElementById('userPages').style.display = isAdmin ? 'none' : '';
  const w = document.getElementById('welcomeName'); if(w) w.textContent = S.user.name;
  const w2 = document.getElementById('welcomeUserName'); if(w2) w2.textContent = S.user.name.split(' ')[0];
  try{
    if(isAdmin) await loadAdminData();
    else await loadUserData();
    showToast('Welcome ' + S.user.name.split(' ')[0] + ' — LIVE','success', true);
  }catch(e){ console.error(e); showToast('Data load issue: ' + e.message,'error'); }
}

/* ═══ Nav ═══ */
function navigate(page){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav a').forEach(a=>a.classList.remove('active'));
  const t = document.getElementById('page-'+page); if(t) t.classList.add('active');
  document.querySelectorAll('.nav a[data-page="' + page + '"]').forEach(a=>a.classList.add('active'));
  window.scrollTo({top:0,behavior:'smooth'});
  closeSidebar();
  if(S.user && S.user.role === 'admin'){
    if(page === 'reports') setTimeout(initReportCharts, 100);
    if(page === 'dashboard') setTimeout(initCharts, 80);
  }
}
document.addEventListener('click', e=>{
  const a = e.target.closest('.nav a[data-page]'); if(!a) return;
  e.preventDefault(); navigate(a.dataset.page);
});
function toggleMenu(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
}

/* ═══ Load Data ═══ */
async function loadBotAdmins(){
  try{
    const res = await api('GET','/api/admin/bot-admins');
    S.botAdmins = res.bot_admins || [];
    renderBotAdminsTable();
  }catch(_){}
}
function renderBotAdminsTable(){
  const tbody = document.getElementById('botAdminsTable');
  const pill = document.getElementById('botAdminsCountPill');
  if(!tbody) return;
  const list = S.botAdmins || [];
  if(pill) pill.textContent = list.length + ' ADMIN' + (list.length === 1 ? '' : 'S');
  if(!list.length){
    tbody.innerHTML = '<tr><td colspan="5" class="empty"><div class="ic">👑</div>Koi bot admin nahi mila</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(a=>{
    const isOwner = a.is_owner || a.role === 'owner';
    const roleBadge = isOwner 
      ? '<span class="pill" style="background:rgba(234,179,8,0.2);color:#eab308;font-weight:700">👑 Master Owner</span>'
      : '<span class="pill live"><span class="dot"></span>Bot Admin</span>';
    const sourceLabel = a.source === 'config' ? 'System Config' : (a.email ? escHtml(a.email) : 'Direct Telegram ID');
    const deleteBtn = isOwner 
      ? '<span style="font-size:11px;color:var(--muted)">Protected</span>'
      : '<button class="btn btn-red btn-sm" onclick="removeBotAdmin(''+a.id+'',''+(a.telegram_id||'')+'')">🗑️ Remove</button>';
    return '<tr>'
      + '<td><b>'+escHtml(a.name||'Admin')+'</b></td>'
      + '<td><code>'+escHtml(a.telegram_id||'(No TG Linked)')+'</code></td>'
      + '<td style="font-size:11px;color:var(--muted)">'+sourceLabel+'</td>'
      + '<td>'+roleBadge+'</td>'
      + '<td>'+deleteBtn+'</td>'
      + '</tr>';
  }).join('');
}
async function addBotAdminFromInput(){
  const tgInput = document.getElementById('newBotAdminTgId');
  const nameInput = document.getElementById('newBotAdminName');
  const tg_id = (tgInput?.value || '').trim();
  const name = (nameInput?.value || '').trim();
  if(!tg_id){ showToast('Kripya Telegram ID enter karein (numbers)','warn'); return; }
  try{
    const out = await api('POST','/api/admin/bot-admins', { telegram_id: tg_id, name });
    showToast(out.message || 'Bot Admin banaya gaya!','success', true);
    if(tgInput) tgInput.value = '';
    if(nameInput) nameInput.value = '';
    await loadBotAdmins();
    await loadAdminData();
  }catch(e){ showToast(e.data?.message || e.message,'error', true); }
}
async function removeBotAdmin(id, tg_id){
  const confirmed = await askConfirm('Kya aap is admin se Bot Admin rights revoke karna chahte hain?', 'Revoke Bot Admin', 'warn');
  if(!confirmed) return;
  try{
    const payload = {};
    if(String(id).startsWith('tg_')) payload.telegram_id = tg_id || id.replace('tg_','');
    else if(!isNaN(Number(id))) payload.user_id = Number(id);
    else payload.telegram_id = tg_id;
    const out = await api('DELETE','/api/admin/bot-admins', payload);
    showToast(out.message || 'Admin role removed','success', true);
    await loadBotAdmins();
    await loadAdminData();
  }catch(e){ showToast(e.data?.message || e.message,'error', true); }
}
async function toggleBotAdminUser(userId, makeAdmin){
  const msg = makeAdmin 
    ? 'Kya aap is user ko Telegram Bot Admin banana chahte hain? Unhe Bot ke sabhi admin controls mil jayenge.' 
    : 'Kya aap is user se Bot Admin access hatana chahte hain?';
  const confirmed = await askConfirm(msg, makeAdmin ? 'Promote to Bot Admin' : 'Demote User', makeAdmin ? 'warn' : 'warn');
  if(!confirmed) return;
  try{
    if(makeAdmin){
      await api('POST','/api/admin/bot-admins', { user_id: userId });
      showToast('User ko Bot Admin bana diya gaya!','success', true);
    }else{
      await api('DELETE','/api/admin/bot-admins', { user_id: userId });
      showToast('Admin role remove kar diya gaya.','success', true);
    }
    await loadAdminData();
    await loadBotAdmins();
  }catch(e){ showToast(e.data?.message || e.message,'error', true); }
}

async function loadAdminData(){
  const [dash, ordersR, productsR, usersR, customersR, salesR, expensesR, ledgerR, actR, credR] = await Promise.all([
    api('GET','/api/dashboard'),
    api('GET','/api/orders'),
    api('GET','/api/products'),
    api('GET','/api/users'),
    api('GET','/api/customers'),
    api('GET','/api/sales'),
    api('GET','/api/expenses'),
    api('GET','/api/inventory/ledger'),
    api('GET','/api/activity'),
    api('GET','/api/admin/credentials').catch(()=>({users:[]}))
  ]);
  S.dashboard = dash; S.orders = ordersR.orders || [];
  S.products = productsR.products || []; S.users = usersR.users || [];
  S.customers = customersR.customers || []; S.sales = salesR.sales || [];
  S.expenses = expensesR.expenses || []; S.ledger = ledgerR.ledger || [];
  S.activity = actR.activity || [];
  S.vault = credR.users || [];
  renderAdminAll();
  loadBotAdmins();
}

async function loadUserData(){
  const [ordersR, statsR, linksR, revR] = await Promise.all([
    api('GET','/api/my/orders'),
    api('GET','/api/my/stats').catch(()=>({})),
    api('GET','/api/my/links').catch(()=>({links:[]})),
    api('GET','/api/my/revenue').catch(()=>({daily:[]}))
  ]);
  S.myOrders = ordersR.orders || [];
  S.myStats = statsR || {};
  S.myLinks = linksR.links || [];
  S.myRevenue = revR || {};
  try { const me = await api('GET','/api/auth/me'); S.user = me.user; } catch(_){}
  renderUserAll();
}

/* ═══ Render: Admin ═══ */
function renderAdminAll(){
  renderDashStats();
  renderActivity();
  renderRecentOrders();
  renderLowStock();
  renderOrderStats();
  renderOrdersTable();
  renderSaleStats();
  renderSalesTable();
  renderCustGrid();
  renderInvStats();
  renderInvTable();
  renderLedger();
  renderExpStats();
  renderExpTable();
  renderUserStats();
  renderUsersTable();
  renderVaultTable();
  updateOrderBadge();
  loadBotStatus();
  setTimeout(initCharts, 80);
}

function renderVaultTable(){
  const el = document.getElementById('vaultTable'); if(!el) return;
  const rows = S.vault || [];
  if(!rows.length){ el.innerHTML = '<tr><td colspan="9" class="empty"><div class="ic">🔑</div>Koi user password stored nahi</td></tr>'; return; }
  el.innerHTML = rows.map(u=>'<tr onclick="openUserDetail('+u.id+')" style="cursor:pointer">'
    + '<td><span class="id">#'+u.id+'</span></td>'
    + '<td>'+(u.name||'-')+'</td>'
    + '<td style="font-size:11px">'+u.email+'</td>'
    + '<td><code>'+(u.password_plain || '(unknown — signup se pehle)')+'</code></td>'
    + '<td>'+(u.phone||'-')+'</td>'
    + '<td style="font-size:11px">'+(u.telegram_id||'-')+'</td>'
    + '<td><b>'+(u.order_count||0)+'</b></td>'
    + '<td><span class="sts '+u.status+'">'+u.status+'</span></td>'
    + '<td onclick="event.stopPropagation()"><div style="display:flex;gap:6px">'
    + '<button class="btn btn-g btn-sm" onclick="deactivateUser('+u.id+')">⏸</button>'
    + '<button class="btn btn-red btn-sm" onclick="hardDeleteUser('+u.id+')">🗑️</button>'
    + '</div></td></tr>').join('');
}

function statCard(l, v, c, ic, ib, ibd){
  return '<div class="stat"><div class="top"><div class="lbl">'+l+'</div>'
    + '<div class="ib" style="background:'+ib+';border:1px solid '+ibd+'">'+ic+'</div></div>'
    + '<div class="val v-'+c+'">'+v+'</div></div>';
}

function renderDashStats(){
  const el = document.getElementById('dashStats'); if(!el || !S.dashboard) return;
  const t = S.dashboard.today, o = S.dashboard.overall;
  el.innerHTML = ''
    + statCard("Today's Orders", t.orders_today, 'c','📦','rgba(0,240,255,.15)','rgba(0,240,255,.3)')
    + statCard("Today's Sales", fmtINR(t.sales_today), 'g','💰','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
    + statCard('Daily Revenue', fmtINR(o.daily_revenue), 'g','💵','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
    + statCard('Overall Revenue', fmtINR(o.overall_revenue), 'p','💎','rgba(168,85,247,.15)','rgba(168,85,247,.3)')
    + statCard('Net Profit (today)', fmtINR(t.net_profit), t.net_profit>=0?'p':'r','📈','rgba(168,85,247,.15)','rgba(168,85,247,.3)')
    + statCard('Pending Orders', t.pending, 'pk','⏳','rgba(255,47,185,.15)','rgba(255,47,185,.3)')
    + statCard('Inventory Value', fmtINR(o.inventory_value), 'c','🧊','rgba(0,240,255,.15)','rgba(0,240,255,.3)')
    + statCard('Active Users', o.active_users, 'p','👥','rgba(168,85,247,.15)','rgba(168,85,247,.3)');
}

function renderActivity(){
  const el = document.getElementById('activityFeed'); if(!el) return;
  if(!S.activity || !S.activity.length){
    el.innerHTML = '<div class="empty"><div class="ic">💤</div>Abhi koi activity nahi</div>';
    return;
  }
  el.innerHTML = S.activity.slice(0,8).map(a=>{
    const bg = a.color === 'green' ? 'rgba(0,255,157,.15)' : a.color === 'red' ? 'rgba(255,56,96,.15)' : a.color === 'purple' ? 'rgba(168,85,247,.15)' : 'rgba(0,240,255,.15)';
    return '<div class="feed-item"><div class="fi" style="background:'+bg+';border-color:'+bg.replace('.15','.3')+'">'+(a.icon||'•')+'</div>'
      + '<div class="fb"><div class="ft">'+a.text+'</div><div class="ftm">'+(a.actor||'system')+'</div></div></div>';
  }).join('');
}

function renderRecentOrders(){
  const el = document.getElementById('recentOrders'); if(!el) return;
  const recent = (S.dashboard?.recentOrders||[]).slice(0,5);
  if(!recent.length){ el.innerHTML = '<tr><td colspan="4" class="empty"><div class="ic">📭</div>Koi order nahi</td></tr>'; return; }
  el.innerHTML = recent.map(o=>'<tr>'
    + '<td>'+oidHtml(o)+'</td>'
    + '<td>'+o.user_name+'</td>'
    + '<td><span class="amt" style="color:var(--green)">'+fmtINR(o.sale_value)+'</span></td>'
    + '<td><span class="sts '+o.status+'">'+o.status+'</span></td></tr>').join('');
}

function renderLowStock(){
  const el = document.getElementById('lowStockList'); if(!el) return;
  const low = S.dashboard?.lowStockProducts || [];
  if(!low.length){ el.innerHTML = '<div class="empty"><div class="ic">✅</div>Stock healthy</div>'; return; }
  el.innerHTML = low.map(p=>'<div class="low-item"><div class="pi">'+(p.emoji||'📦')+'</div>'
    + '<div class="pinfo"><div class="pn">'+p.name+'</div><div class="ps">Min: '+p.minimum_stock+' • Current</div></div>'
    + '<div class="pc">'+p.current_stock+'</div></div>').join('');
}

function renderOrderStats(){
  const el = document.getElementById('orderStats'); if(!el) return;
  const total = S.orders.length;
  const del = S.orders.filter(o=>o.status==='delivered').length;
  const pen = S.orders.filter(o=>['new','pending','processing'].includes(o.status)).length;
  const can = S.orders.filter(o=>o.status==='cancelled').length;
  el.innerHTML = ''
    + statCard('Total Orders', total, 'p','📦','rgba(168,85,247,.15)','rgba(168,85,247,.3)')
    + statCard('Delivered', del, 'g','✅','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
    + statCard('Pending', pen, 'y','⏳','rgba(255,214,10,.15)','rgba(255,214,10,.3)')
    + statCard('Cancelled', can, 'r','❌','rgba(255,56,96,.15)','rgba(255,56,96,.3)');
}

function orderMatchesQuery(o, q){
  if(!q) return true;
  const oid = String(o.order_id||'');
  const link = String(o.tracking_link||'');
  const name = String(o.user_name||'').toLowerCase();
  return oid.toLowerCase()===q || oid.slice(-4).toLowerCase()===q || link.toLowerCase().includes(q) || name.includes(q) || oid.toLowerCase().includes(q);
}
function renderOrdersTable(){
  const el = document.getElementById('ordersTable'); if(!el) return;
  const q = (document.getElementById('orderSearch')?.value || '').trim().toLowerCase();
  const rows = (S.orders||[]).filter(o=>orderMatchesQuery(o,q));
  if(!rows.length){
    el.innerHTML = '<tr><td colspan="5" class="empty"><div class="ic">📭</div>Koi order nahi</td></tr>';
    return;
  }
  el.innerHTML = rows.map(o=>{
    const canSwipe = o.status!=='delivered' && o.status!=='cancelled';
    return '<tr data-status="'+o.status+'">'
      + '<td>'+oidHtml(o)+'</td>'
      + '<td>'+o.user_name+'</td>'
      + '<td><span class="amt" style="color:var(--green)">'+fmtINR(o.sale_value)+'</span></td>'
      + '<td><span class="sts '+o.status+'">'+o.status+'</span></td>'
      + '<td><div style="display:flex;gap:6px;align-items:center">'
      + (canSwipe ? swipeHtml(o.id) : '<span class="sts delivered">done</span>')
      + (canSwipe ? '<button class="btn btn-red btn-sm" onclick="cancelOrder('+o.id+')">✕</button>' : '')
      + '</div></td></tr>';
  }).join('');
  bindSwipeWidgets();
}
function swipeHtml(id){
  return '<div class="swipe" data-oid="'+id+'"><div class="track">SWIPE → DELIVER</div><div class="knob">➜</div></div>';
}
function bindSwipeWidgets(){
  document.querySelectorAll('.swipe:not(.bound)').forEach(el=>{
    el.classList.add('bound');
    const knob = el.querySelector('.knob');
    let startX=0, dx=0, dragging=false;
    const max = ()=> el.offsetWidth - 36;
    const setX = (x)=>{ knob.style.transform = 'translateX('+Math.max(0,Math.min(max(),x))+'px)'; };
    const end = async ()=>{
      dragging=false;
      if(dx > max()*0.72){
        el.classList.add('done');
        setX(max());
        el.querySelector('.track').textContent = 'DELIVERING…';
        await deliverOrder(Number(el.dataset.oid), true);
      } else { setX(0); dx=0; }
    };
    el.addEventListener('pointerdown', e=>{ dragging=true; startX=e.clientX; dx=0; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e=>{ if(!dragging) return; dx=e.clientX-startX; setX(dx); });
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', ()=>{ dragging=false; setX(0); dx=0; });
  });
}

function updateOrderBadge(){
  const el = document.getElementById('orderBadge'); if(!el) return;
  const p = S.orders.filter(o=>['new','pending'].includes(o.status)).length;
  el.textContent = p;
  el.style.display = p ? '' : 'none';
}

function renderSaleStats(){
  const el = document.getElementById('saleStats'); if(!el) return;
  const total = S.sales.reduce((a,b)=>a+b.total_amount,0);
  const profit = S.sales.reduce((a,b)=>a+b.profit,0);
  const exp = S.expenses.reduce((a,b)=>a+b.amount,0);
  el.innerHTML = ''
    + statCard('Total Sales', fmtINR(total), 'g','💰','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
    + statCard('Gross Profit', fmtINR(profit), 'p','📈','rgba(168,85,247,.15)','rgba(168,85,247,.3)')
    + statCard('Expenses', fmtINR(exp), 'r','💸','rgba(255,56,96,.15)','rgba(255,56,96,.3)')
    + statCard('Net Profit', fmtINR(profit-exp), (profit-exp)>=0?'c':'r','💎','rgba(0,240,255,.15)','rgba(0,240,255,.3)');
}

function renderSalesTable(){
  const el = document.getElementById('salesTable'); if(!el) return;
  if(!S.sales.length){ el.innerHTML = '<tr><td colspan="6" class="empty"><div class="ic">💤</div>Koi sale nahi</td></tr>'; return; }
  el.innerHTML = S.sales.slice(0,100).map(s=>{
    let items = []; try{ items = JSON.parse(s.items_json||'[]'); }catch(_){}
    return '<tr>'
      + '<td><span class="id">'+s.bill_number+'</span></td>'
      + '<td>'+(s.customer_name||'Walk-in')+'</td>'
      + '<td>'+items.length+' items</td>'
      + '<td><span class="amt" style="color:var(--green)">'+fmtINR(s.total_amount)+'</span></td>'
      + '<td><span class="amt" style="color:var(--purple)">'+fmtINR(s.profit)+'</span></td>'
      + '<td style="font-size:11px;color:var(--muted)">'+new Date(s.created_at).toLocaleString('en-IN',{dateStyle:'short',timeStyle:'short'})+'</td></tr>';
  }).join('');
}

function renderCustGrid(){
  const el = document.getElementById('custGrid'); if(!el) return;
  if(!S.customers.length){ el.innerHTML = '<div class="empty"><div class="ic">👥</div>Koi customer nahi</div>'; return; }
  const colors = ['linear-gradient(135deg,var(--cyan),var(--purple))','linear-gradient(135deg,var(--cyan),var(--green))',
    'linear-gradient(135deg,var(--pink),var(--purple))','linear-gradient(135deg,var(--green),var(--cyan))',
    'linear-gradient(135deg,var(--yellow),var(--pink))','linear-gradient(135deg,var(--purple),var(--cyan))'];
  el.innerHTML = S.customers.map((c,i)=>{
    const spent = S.sales.filter(s=>s.customer_id===c.id).reduce((a,b)=>a+b.total_amount,0);
    return '<div class="ucard"><div class="uav" style="background:'+colors[i%6]+'">'+initials(c.name)+'</div>'
      + '<div class="un">'+c.name+'</div><div class="ur">'+(c.phone||'-')+'</div>'
      + '<div class="us">'+fmtINR(spent)+'</div></div>';
  }).join('');
}

function renderInvStats(){
  const el = document.getElementById('invStats'); if(!el) return;
  const val = S.products.reduce((a,b)=>a+b.current_stock*b.purchase_price,0);
  const low = S.products.filter(p=>p.current_stock<=p.minimum_stock && p.current_stock>0).length;
  const out = S.products.filter(p=>p.current_stock<=0).length;
  el.innerHTML = ''
    + statCard('Products', S.products.length, 'c','📦','rgba(0,240,255,.15)','rgba(0,240,255,.3)')
    + statCard('Stock Value', fmtINR(val), 'g','💎','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
    + statCard('Low Stock', low, 'y','⚠️','rgba(255,214,10,.15)','rgba(255,214,10,.3)')
    + statCard('Out of Stock', out, 'r','❌','rgba(255,56,96,.15)','rgba(255,56,96,.3)');
}

function renderInvTable(){
  const el = document.getElementById('invTable'); if(!el) return;
  if(!S.products.length){ el.innerHTML = '<tr><td colspan="6" class="empty"><div class="ic">📦</div>Koi product nahi</td></tr>'; return; }
  el.innerHTML = S.products.map(p=>{
    const st = p.current_stock <= 0 ? 'cancelled' : (p.current_stock <= p.minimum_stock ? 'low' : 'delivered');
    const lbl = p.current_stock <= 0 ? 'Out' : (p.current_stock <= p.minimum_stock ? 'Low' : 'OK');
    return '<tr><td>'+(p.emoji||'📦')+' '+p.name+'</td>'
      + '<td><b>'+p.current_stock+'</b></td>'
      + '<td>'+fmtINR(p.purchase_price)+'</td>'
      + '<td>'+fmtINR(p.selling_price)+'</td>'
      + '<td><span class="sts '+st+'">'+lbl+(p.status!=='active'?' · off':'')+'</span></td>'
      + '<td><div style="display:flex;gap:6px">'
      + '<button class="btn btn-g btn-sm" onclick="adjustStock('+p.id+')">📥</button>'
      + '<button class="btn btn-g btn-sm" onclick="deactivateProduct('+p.id+')">⏸</button>'
      + '<button class="btn btn-red btn-sm" onclick="hardDeleteProduct('+p.id+')">🗑️</button>'
      + '</div></td></tr>';
  }).join('');
}

function renderLedger(){
  const el = document.getElementById('ledgerTable'); if(!el) return;
  if(!S.ledger.length){ el.innerHTML = '<tr><td colspan="5" class="empty"><div class="ic">📒</div>Ledger khali</td></tr>'; return; }
  el.innerHTML = S.ledger.slice(0,30).map(l=>'<tr>'
    + '<td style="font-size:10px;color:var(--muted)">'+new Date(l.created_at).toLocaleDateString()+'</td>'
    + '<td>'+l.product_name+'</td>'
    + '<td><span class="sts '+(l.quantity>0?'delivered':'processing')+'">'+l.type+'</span></td>'
    + '<td><span class="amt" style="color:'+(l.quantity>0?'var(--green)':'var(--red)')+'">'+(l.quantity>0?'+':'')+l.quantity+'</span></td>'
    + '<td><b>'+l.balance_after+'</b></td></tr>').join('');
}

function renderExpStats(){
  const el = document.getElementById('expStats'); if(!el) return;
  const total = S.expenses.reduce((a,b)=>a+b.amount,0);
  const today = new Date().toISOString().slice(0,10);
  const t = S.expenses.filter(e=>e.expense_date===today).reduce((a,b)=>a+b.amount,0);
  const m = S.expenses.filter(e=>e.expense_date?.slice(0,7)===today.slice(0,7)).reduce((a,b)=>a+b.amount,0);
  el.innerHTML = ''
    + statCard('Today', fmtINR(t), 'r','📅','rgba(255,56,96,.15)','rgba(255,56,96,.3)')
    + statCard('This Month', fmtINR(m), 'y','📆','rgba(255,214,10,.15)','rgba(255,214,10,.3)')
    + statCard('All Time', fmtINR(total), 'r','💸','rgba(255,139,61,.15)','rgba(255,139,61,.3)');
}

function renderExpTable(){
  const el = document.getElementById('expTable'); if(!el) return;
  if(!S.expenses.length){ el.innerHTML = '<tr><td colspan="5" class="empty"><div class="ic">💸</div>Koi expense nahi</td></tr>'; return; }
  el.innerHTML = S.expenses.slice(0,100).map(e=>'<tr>'
    + '<td style="font-size:11px">'+e.expense_date+'</td>'
    + '<td><span class="sts processing">'+e.category+'</span></td>'
    + '<td>'+(e.description||'-')+'</td>'
    + '<td><span class="amt" style="color:var(--red)">'+fmtINR(e.amount)+'</span></td>'
    + '<td><button class="btn btn-g btn-sm" onclick="deleteExpense('+e.id+')">🗑️</button></td></tr>').join('');
}

function renderUserStats(){
  const el = document.getElementById('userStats'); if(!el) return;
  const links = S.users.reduce((a,u)=>a+(u.link_count||0),0);
  const rev = S.users.reduce((a,u)=>a+(u.revenue||0),0);
  el.innerHTML = ''
    + statCard('Total Users', S.users.length, 'c','👥','rgba(0,240,255,.15)','rgba(0,240,255,.3)')
    + statCard('Active', S.users.filter(u=>u.status==='active').length, 'g','✅','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
    + statCard('Links', links, 'p','🔗','rgba(168,85,247,.15)','rgba(168,85,247,.3)')
    + statCard('User Revenue', fmtINR(rev), 'g','💰','rgba(0,255,157,.15)','rgba(0,255,157,.3)');
}

function renderUsersTable(){
  const el = document.getElementById('usersTable'); if(!el) return;
  if(!S.users.length){ el.innerHTML = '<tr><td colspan="7" class="empty"><div class="ic">👤</div>Koi user nahi</td></tr>'; return; }
  el.innerHTML = S.users.map(u=>{
    const isAdmin = u.role === 'admin';
    const roleTag = isAdmin ? ' <span class="pill" style="background:rgba(234,179,8,0.2);color:#eab308;font-size:9px;font-weight:700">👑 BOT ADMIN</span>' : '';
    const adminBtn = isAdmin
      ? '<button class="btn btn-g btn-sm" title="Remove Bot Admin" onclick="toggleBotAdminUser('+u.id+',false)">👤 Demote</button>'
      : '<button class="btn btn-p btn-sm" title="Make Bot Admin" onclick="toggleBotAdminUser('+u.id+',true)">👑 Make Admin</button>';
    return '<tr onclick="openUserDetail('+u.id+')" style="cursor:pointer">'
      + '<td><b>'+escHtml(u.name)+'</b>'+roleTag+'</td>'
      + '<td style="font-size:11px;color:var(--muted)">'+escHtml(u.email)+'<br><span style="color:var(--cyan)">TG: '+(u.telegram_id||'-')+'</span></td>'
      + '<td><span class="sts processing">'+(u.cart_count||0)+' items</span></td>'
      + '<td><b>'+(u.link_count||0)+'</b></td>'
      + '<td><span class="amt" style="color:var(--green)">'+fmtINR(u.revenue||0)+'</span></td>'
      + '<td><span class="sts '+u.status+'">'+u.status+'</span></td>'
      + '<td onclick="event.stopPropagation()"><div style="display:flex;gap:4px;flex-wrap:wrap">'
      + adminBtn
      + (u.status!=='active' ? '<button class="btn btn-green btn-sm" onclick="approveUser('+u.id+')" title="Approve">✅</button>' : '')
      + '<button class="btn btn-g btn-sm" onclick="openCartModal('+u.id+',\''+String(u.name||'').replace(/'/g,'')+'\')" title="Cart">🛒</button>'
      + '<button class="btn btn-g btn-sm" onclick="deactivateUser('+u.id+')" title="Deactivate">⏸</button>'
      + '<button class="btn btn-red btn-sm" onclick="hardDeleteUser('+u.id+')" title="Delete">🗑️</button>'
      + '</div></td></tr>';
  }).join('');
}
/* ═══ Render: User ═══ */
function renderUserAll(){
  const el = document.getElementById('userDashStats'); if(!el) return;
  const my = S.myOrders || [];
  el.innerHTML = ''
    + statCard('My Orders', my.length, 'c','📦','rgba(0,240,255,.15)','rgba(0,240,255,.3)')
    + statCard('Delivered', my.filter(o=>o.status==='delivered').length, 'g','✅','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
    + statCard('Pending', my.filter(o=>['new','pending','processing'].includes(o.status)).length, 'y','⏳','rgba(255,214,10,.15)','rgba(255,214,10,.3)')
    + statCard('Total Value', fmtINR(my.filter(o=>o.status==='delivered').reduce((a,b)=>a+b.sale_value,0)), 'p','💰','rgba(168,85,247,.15)','rgba(168,85,247,.3)');

  // Recent orders
  const recent = document.getElementById('myOrdersTable');
  if(recent){
    if(!my.length) recent.innerHTML = '<tr><td colspan="4" class="empty"><div class="ic">📭</div>Koi order nahi</td></tr>';
    else recent.innerHTML = my.slice(0,20).map(o=>{
      return '<tr><td>'+oidHtml(o)+'</td>'
        + '<td style="font-size:11px;color:var(--muted)">'+new Date(o.created_at).toLocaleDateString()+'</td>'
        + '<td><span class="amt" style="color:var(--green)">'+fmtINR(o.sale_value)+'</span></td>'
        + '<td><span class="sts '+o.status+'">'+o.status+'</span></td></tr>';
    }).join('');
  }

  // Cart preview on dashboard
  const prev = document.getElementById('userCartPreview');
  const myCart = (S.products||[]).filter(p=>true); // placeholder
  // Fetch cart via /api/auth/me later? Load from stored value
  if(prev){
    prev.innerHTML = '<div class="empty" style="padding:20px"><div class="ic">🛒</div>Cart dekhne ke liye "My Cart" pe jao</div>';
  }

  renderMyCartTable();

  // Profile
  const u = S.user;
  if(u){
    const set = (id,v)=>{ const e=document.getElementById(id); if(e) e.value = v || '-'; };
    set('profName', u.name); set('profEmail', u.email); set('profPhone', u.phone); set('profStatus', u.status);
  }
  const st = S.myStats || {};
  const delivered = st.delivered != null ? st.delivered : my.filter(o=>o.status==='delivered').length;
  const pending = st.pending != null ? st.pending : my.filter(o=>['new','pending','processing','ready'].includes(o.status)).length;
  const sc = document.getElementById('userStatsCards');
  if(sc) sc.innerHTML = ''
    + statCard('Total', st.total_orders != null ? st.total_orders : my.length, 'c','📦','rgba(0,240,255,.15)','rgba(0,240,255,.3)')
    + statCard('Delivered', delivered, 'g','✅','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
    + statCard('Pending', pending, 'y','⏳','rgba(255,214,10,.15)','rgba(255,214,10,.3)')
    + statCard('Revenue', fmtINR(st.revenue||0), 'p','💰','rgba(168,85,247,.15)','rgba(168,85,247,.3)')
    + statCard('Links Stored', st.links_stored||0, 'pk','🔗','rgba(255,47,185,.15)','rgba(255,47,185,.3)');
  const pb = document.getElementById('userProgressBox');
  if(pb){
    const tot = st.total_orders != null ? st.total_orders : my.length;
    const pct = st.progress_pct != null ? st.progress_pct : (tot ? Math.round(delivered/tot*100) : 0);
    pb.innerHTML = '<span class="c-green">Delivered '+delivered+'</span> / <span class="c-cyan">'+tot+'</span> ('+pct+'%) — data aapka hi hai';
  }
  const lt = document.getElementById('myLinksTable');
  if(lt){
    const links = S.myLinks || [];
    if(!links.length) lt.innerHTML = '<tr><td colspan="4" class="empty"><div class="ic">🔗</div>Koi link stored nahi</td></tr>';
    else lt.innerHTML = links.map(o=>'<tr>'
      + '<td>'+oidHtml(o)+'</td>'
      + '<td><span class="amt" style="color:var(--green)">'+fmtINR(o.sale_value)+'</span></td>'
      + '<td><span class="sts '+o.status+'">'+o.status+'</span></td>'
      + '<td style="font-size:11px;color:var(--muted)">'+new Date(o.created_at).toLocaleDateString()+'</td></tr>').join('');
  }
  const rc = document.getElementById('userRevenueCards');
  if(rc){
    rc.innerHTML = ''
      + statCard('Delivered Revenue', fmtINR(st.revenue||0), 'g','💰','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
      + statCard('Pending Value', fmtINR(st.pending_value||0), 'y','⏳','rgba(255,214,10,.15)','rgba(255,214,10,.3)')
      + statCard('Profit', fmtINR(st.profit||0), 'p','📈','rgba(168,85,247,.15)','rgba(168,85,247,.3)');
  }
  const rt = document.getElementById('myRevenueTable');
  if(rt){
    const days = (S.myRevenue && S.myRevenue.daily) || [];
    if(!days.length) rt.innerHTML = '<tr><td colspan="4" class="empty"><div class="ic">💰</div>Abhi revenue nahi</td></tr>';
    else rt.innerHTML = days.map(d=>'<tr>'
      + '<td>'+d.day+'</td><td><b>'+d.orders+'</b></td>'
      + '<td><span class="amt" style="color:var(--green)">'+fmtINR(d.revenue)+'</span></td>'
      + '<td><span class="amt" style="color:var(--purple)">'+fmtINR(d.profit)+'</span></td></tr>').join('');
  }
}

async function submitMyLink(inputId){
  const el = document.getElementById(inputId);
  const link = (el && el.value || '').trim();
  if(!link) return showToast('Tracking link daalein','error');
  const outEl = document.getElementById(inputId==='dashTrackLink'?'dashSubmitResult':'userSubmitResult');
  try{
    const data = await api('POST','/api/my/order', { tracking_link: link });
    const ok = data.result === 'SUCCESS';
    if(outEl) outEl.innerHTML = '<div class="low-item" style="border-color:'+(ok?'rgba(0,255,157,.4)':'rgba(255,56,96,.4)')+'"><div class="pi">'+(ok?'OK':'!')+'</div><div class="pinfo"><div class="pn">'+data.result+'</div><div class="ps">'+(data.message || (data.order ? 'Order #'+data.order.order_id : ''))+'</div></div></div>';
    if(ok){ if(el) el.value=''; showToast('Order saved · ₹'+(data.order && data.order.sale_value != null ? data.order.sale_value : ''),'success'); await loadUserData(); }
    else showToast(data.message || data.result || 'Duplicate / invalid — skipped','error');
  }catch(e){
    const code = e.data && e.data.result || e.data && e.data.error;
    const msg = e.data && e.data.message || e.message;
    if(outEl) outEl.innerHTML = '<div class="low-item" style="border-color:rgba(255,56,96,.4)"><div class="pi">!</div><div class="pinfo"><div class="pn">'+(code||'ERROR')+'</div><div class="ps">'+msg+'</div></div></div>';
    showToast(code==='NO_CART' ? 'Cart khali — admin se SKU assign karwao' : msg,'error');
  }
}

async function saveMyProfile(){
  try{
    const r = await api('PATCH','/api/my/profile', {
      name: document.getElementById('profName').value.trim(),
      phone: document.getElementById('profPhone').value.trim()
    });
    S.user = r.user;
    try{ localStorage.setItem('ng_user', JSON.stringify(S.user)); }catch(_){}
    showToast('Profile saved','success');
  }catch(e){ showToast(e.message,'error'); }
}

async function renderMyCartTable(){
  // Fetch user's cart — but our /api/users/:id/cart is admin-only.
  // So for user we need /api/my/cart. Let's add it inline via /api/my/cart (below we'll implement).
  try {
    const r = await api('GET','/api/my/cart');
    const cart = r.cart || [];
    const tbody = document.getElementById('myCartTable');
    let totalItems = 0, totalVal = 0;
    if(tbody){
      if(!cart.length) tbody.innerHTML = '<tr><td colspan="4" class="empty"><div class="ic">🛒</div>Cart assign nahi hua</td></tr>';
      else tbody.innerHTML = cart.map(c=>{
        totalItems += c.quantity;
        totalVal += c.quantity * c.selling_price;
        return '<tr><td>'+(c.emoji||'📦')+' '+c.name+'</td>'
          + '<td><b>'+c.quantity+'</b></td>'
          + '<td>'+fmtINR(c.selling_price)+'</td>'
          + '<td><span class="amt" style="color:var(--green)">'+fmtINR(c.quantity*c.selling_price)+'</span></td></tr>';
      }).join('');
    }
    const ti = document.getElementById('cartTotalItems'); if(ti) ti.textContent = totalItems;
    const tv = document.getElementById('cartTotalValue'); if(tv) tv.textContent = fmtINR(totalVal);
  } catch(e){ /* cart not assigned */ }
}

/* ═══ Charts ═══ */
function initCharts(){
  try{
    Chart.defaults.color = '#7b87a4';
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 10;

    const last7 = S.dashboard?.last7 || [];
    const labels = last7.map(d => new Date(d.date).toLocaleDateString('en-IN',{weekday:'short'}));
    const sales = last7.map(d => d.sales);
    const profit = last7.map(d => d.profit);

    const rEl = document.getElementById('revChart');
    if(rEl){
      if(S.charts.rev) S.charts.rev.destroy();
      const ctx = rEl.getContext('2d');
      const g1 = ctx.createLinearGradient(0,0,0,300);
      g1.addColorStop(0,'rgba(0,240,255,.5)'); g1.addColorStop(1,'rgba(0,240,255,0)');
      const g2 = ctx.createLinearGradient(0,0,0,300);
      g2.addColorStop(0,'rgba(168,85,247,.5)'); g2.addColorStop(1,'rgba(168,85,247,0)');
      S.charts.rev = new Chart(rEl,{
        type:'line',
        data:{labels, datasets:[
          {label:'Sales', data:sales, borderColor:'#00f0ff', backgroundColor:g1, borderWidth:2, fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#00f0ff'},
          {label:'Profit', data:profit, borderColor:'#a855f7', backgroundColor:g2, borderWidth:2, fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#a855f7'}
        ]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{position:'top',align:'end',labels:{boxWidth:8,boxHeight:8,usePointStyle:true,pointStyle:'circle',padding:12}},
            tooltip:{backgroundColor:'rgba(10,13,26,.95)',borderColor:'rgba(0,240,255,.3)',borderWidth:1,padding:10,cornerRadius:10,
              callbacks:{label:c=>c.dataset.label+': '+fmtINR(c.parsed.y)}}},
          scales:{x:{grid:{color:'rgba(255,255,255,.04)'}},y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{callback:v=>'₹'+v/1000+'K'}}}}
      });
    }
  }catch(e){ console.error('[Charts]',e); }
}

function initReportCharts(){
  try{
    const tEl = document.getElementById('trendChart');
    if(tEl && S.dashboard){
      if(S.charts.trend) S.charts.trend.destroy();
      const last7 = S.dashboard.last7;
      const labels = last7.map(d => new Date(d.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}));
      const sales = last7.map(d => d.sales);
      const ctx = tEl.getContext('2d');
      const g = ctx.createLinearGradient(0,0,0,300);
      g.addColorStop(0,'rgba(0,255,157,.5)'); g.addColorStop(1,'rgba(0,255,157,0)');
      S.charts.trend = new Chart(tEl,{
        type:'bar',
        data:{labels, datasets:[{label:'Sales', data:sales, backgroundColor:g, borderColor:'#00ff9d', borderWidth:2, borderRadius:8}]},
        options:{responsive:true,maintainAspectRatio:false,
          plugins:{legend:{display:false},
            tooltip:{backgroundColor:'rgba(10,13,26,.95)',borderColor:'rgba(0,255,157,.3)',borderWidth:1,padding:10,cornerRadius:10,
              callbacks:{label:c=>fmtINR(c.parsed.y)}}},
          scales:{x:{grid:{display:false}},y:{grid:{color:'rgba(255,255,255,.04)'},ticks:{callback:v=>'₹'+v/1000+'K'}}}}
      });
    }
    const pEl = document.getElementById('pieChart');
    if(pEl){
      if(S.charts.pie) S.charts.pie.destroy();
      const counts = {};
      S.sales.forEach(s=>{
        try{ const items = JSON.parse(s.items_json||'[]');
          items.forEach(it=>{ counts[it.name] = (counts[it.name]||0) + it.quantity; });
        }catch(_){}
      });
      const entries = Object.entries(counts).slice(0,5);
      const labels = entries.length ? entries.map(e=>e[0]) : ['No Data'];
      const data = entries.length ? entries.map(e=>e[1]) : [1];
      const colors = ['#00f0ff','#a855f7','#00ff9d','#ff2fb9','#ffd60a'];
      S.charts.pie = new Chart(pEl,{
        type:'doughnut',
        data:{labels, datasets:[{data, backgroundColor:colors, borderColor:'#05060d', borderWidth:3, hoverOffset:8}]},
        options:{responsive:true,maintainAspectRatio:false,cutout:'65%',
          plugins:{legend:{position:'bottom',labels:{boxWidth:8,boxHeight:8,usePointStyle:true,pointStyle:'circle',padding:10}},
            tooltip:{backgroundColor:'rgba(10,13,26,.95)',borderColor:'rgba(168,85,247,.3)',borderWidth:1,padding:10,cornerRadius:10}}}
      });
    }
  }catch(e){ console.error('[Report charts]',e); }
}

/* ═══ Actions ═══ */
function filterOrders(tab, status){
  tab.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  tab.classList.add('active');
  document.querySelectorAll('#ordersTable tr').forEach(tr=>{
    tr.style.display = status==='all' ? '' : (tr.dataset.status===status ? '' : 'none');
  });
}

async function deliverOrder(id, fromSwipe){
  if(!fromSwipe && !await askConfirm('Mark this order delivered? Stock will be deducted automatically.', 'Deliver order', 'info')) return;
  try{
    await api('PATCH','/api/orders/'+id+'/deliver');
    showToast('Order delivered — stock deducted','success', true);
    await loadAdminData();
  }catch(e){
    const m = e.data;
    if(m?.error === 'INSUFFICIENT_STOCK') showToast('Stock kam hai: '+m.product,'error', true);
    else showToast(e.message,'error', true);
    renderOrdersTable();
  }
}

async function cancelOrder(id){
  if(!await askConfirm('Cancel this order? It will stay in history as cancelled.', 'Cancel order', 'warn')) return;
  try{
    await api('PATCH','/api/orders/'+id+'/cancel', { reason: 'Admin cancelled' });
    showToast('Order cancelled','info');
    await loadAdminData();
  }catch(e){ showToast(e.message,'error'); }
}

/* ═══ Sale Modal ═══ */
function openNewSale(){
  const sel = document.getElementById('saleCustomer');
  sel.innerHTML = '<option value="">-- Walk-in --</option>' +
    S.customers.map(c=>'<option value="'+c.id+'">'+c.name+'</option>').join('');
  document.getElementById('saleBill').value = 'SALE-' + Date.now().toString().slice(-8);
  document.getElementById('saleItems').innerHTML = '';
  document.getElementById('saleDiscount').value = '0';
  if(!S.products.length){ showToast('Pehle products add karein','error'); return; }
  addSaleItem();
  recalcSale();
  openModal('saleModal');
}

function addSaleItem(){
  const wrap = document.getElementById('saleItems');
  const opts = S.products.map(p=>'<option value="'+p.id+'" data-price="'+p.selling_price+'">'+(p.emoji||'📦')+' '+p.name+' ('+fmtINR(p.selling_price)+')</option>').join('');
  const row = document.createElement('div');
  row.className = 'sir';
  row.innerHTML = '<select onchange="syncRate(this)">'+opts+'</select>'
    + '<input type="number" placeholder="Rate" value="0" oninput="recalcSale()" class="sale-rate"/>'
    + '<input type="number" placeholder="Qty" value="1" oninput="recalcSale()" class="sale-qty"/>'
    + '<button class="rm" onclick="this.parentElement.remove();recalcSale()">✕</button>';
  wrap.appendChild(row);
  syncRate(row.querySelector('select'));
}

function syncRate(sel){
  const row = sel.closest('.sir');
  row.querySelector('.sale-rate').value = sel.selectedOptions[0]?.dataset.price || 0;
  recalcSale();
}

function recalcSale(){
  let sub = 0;
  document.querySelectorAll('#saleItems .sir').forEach(row=>{
    const r = Number(row.querySelector('.sale-rate')?.value || 0);
    const q = Number(row.querySelector('.sale-qty')?.value || 0);
    sub += r*q;
  });
  const disc = Number(document.getElementById('saleDiscount')?.value || 0);
  const fin = Math.max(0, sub - disc);
  document.getElementById('subtotal').textContent = fmtINR(sub);
  document.getElementById('discountVal').textContent = '-' + fmtINR(disc);
  document.getElementById('finalAmt').textContent = fmtINR(fin);
}

async function saveSale(){
  try{
    const customerId = Number(document.getElementById('saleCustomer').value) || null;
    const customer = customerId ? S.customers.find(c=>c.id === customerId) : null;
    const rows = [...document.querySelectorAll('#saleItems .sir')];
    const items = [];
    for(const row of rows){
      const pid = Number(row.querySelector('select').value);
      const rate = Number(row.querySelector('.sale-rate').value);
      const qty = Number(row.querySelector('.sale-qty').value);
      if(!pid || !qty) continue;
      items.push({ product_id: pid, quantity: qty, rate });
    }
    if(!items.length) return showToast('Add at least one item','error');
    const disc = Number(document.getElementById('saleDiscount').value || 0);
    const r = await api('POST','/api/sales', { customer_id: customerId, customer_name: customer?.name, items, discount: disc });
    closeModal('saleModal');
    showToast('Sale saved! Stock deducted ✅','success');
    await loadAdminData();
  }catch(e){
    if(e.data?.error === 'INSUFFICIENT_STOCK') showToast('Stock kam: '+e.data.product,'error');
    else showToast(e.message,'error');
  }
}

/* ═══ CRUD ═══ */
async function saveProduct(){
  const name = document.getElementById('pName').value.trim();
  const sku = document.getElementById('pSKU').value.trim() || 'SKU-' + Date.now();
  if(!name) return showToast('Name required','error');
  try{
    await api('POST','/api/products', {
      sku, name, emoji: document.getElementById('pEmoji').value.trim() || '📦',
      purchase_price: Number(document.getElementById('pBuy').value) || 0,
      selling_price: Number(document.getElementById('pSell').value) || 0,
      current_stock: Number(document.getElementById('pStock').value) || 0,
      minimum_stock: Number(document.getElementById('pMin').value) || 0
    });
    closeModal('productModal');
    ['pName','pSKU'].forEach(id=>document.getElementById(id).value='');
    ['pBuy','pSell','pStock','pMin'].forEach(id=>document.getElementById(id).value=0);
    document.getElementById('pEmoji').value = '📦';
    showToast('Product added ✅','success');
    await loadAdminData();
  }catch(e){ showToast(e.data?.error === 'SKU_EXISTS' ? 'SKU already exists' : e.message,'error'); }
}

async function deactivateProduct(id){
  if(!await askConfirm('Deactivate this product? Stock stays, it will be hidden from the live list.', 'Deactivate product')) return;
  try{ await api('DELETE','/api/products/'+id); showToast('Product deactivated','info'); await loadAdminData(); }
  catch(e){ showToast(e.message,'error'); }
}
async function hardDeleteProduct(id){
  if(!await askDanger('This permanently deletes the product, including cart rows and stock ledger.', 'Delete product')) return;
  try{ await api('DELETE','/api/products/'+id+'?hard=1'); showToast('Product deleted','success', true); await loadAdminData(); }
  catch(e){ showToast(e.message,'error'); }
}
async function clearAllStock(){
  if(!await askConfirm('Set every product quantity to 0? Product names stay in the catalog.', 'Clear all stock', 'warn')) return;
  try{ await api('POST','/api/inventory/clear-all'); showToast('All stock cleared','success', true); await loadAdminData(); }
  catch(e){ showToast(e.message,'error'); }
}
async function purgeAllProducts(){
  if(!await askDanger('This permanently deletes every product, cart item, and stock ledger row.', 'Delete all products')) return;
  try{ await api('POST','/api/products/purge-all'); showToast('All products deleted','success', true); await loadAdminData(); }
  catch(e){ showToast(e.message,'error'); }
}

async function adjustStock(id){
  const p = S.products.find(x=>x.id === id); if(!p) return;
  const input = await askPrompt('Current stock: '+p.current_stock+' · Use +50 to add or -5 to remove.', 'Adjust stock · '+p.name, '');
  if(input === null || input === '') return;
  const n = Number(input);
  if(!n) return;
  const type = n > 0 ? 'purchase' : 'adjustment';
  try{
    await api('POST','/api/products/'+id+'/stock', { type, quantity: Math.abs(n) });
    showToast('Stock updated','success');
    await loadAdminData();
  }catch(e){ showToast(e.message,'error'); }
}

async function saveCustomer(){
  const name = document.getElementById('cName').value.trim();
  if(!name) return showToast('Name required','error');
  try{
    await api('POST','/api/customers', { name, phone: document.getElementById('cPhone').value.trim() });
    closeModal('customerModal');
    document.getElementById('cName').value=''; document.getElementById('cPhone').value='';
    showToast('Customer added ✅','success');
    await loadAdminData();
  }catch(e){ showToast(e.message,'error'); }
}

async function saveExpense(){
  const amt = Number(document.getElementById('eAmt').value);
  if(!amt) return showToast('Amount required','error');
  try{
    await api('POST','/api/expenses', {
      category: document.getElementById('eCat').value,
      description: document.getElementById('eDesc').value.trim(),
      amount: amt
    });
    closeModal('expenseModal');
    document.getElementById('eAmt').value=''; document.getElementById('eDesc').value='';
    showToast('Expense added ✅','success');
    await loadAdminData();
  }catch(e){ showToast(e.message,'error'); }
}

async function deleteExpense(id){
  if(!await askDanger('Remove this expense from the ledger?', 'Delete expense')) return;
  try{ await api('DELETE','/api/expenses/'+id); showToast('Deleted','info'); await loadAdminData(); }
  catch(e){ showToast(e.message,'error'); }
}

async function saveUser(){
  const name = document.getElementById('uName').value.trim();
  const email = document.getElementById('uEmail').value.trim();
  const pass = document.getElementById('uPass').value;
  if(!name || !email || !pass) return showToast('All fields required','error');
  try{
    await api('POST','/api/users', { name, email, password: pass, phone: document.getElementById('uPhone').value.trim() });
    closeModal('userModal');
    ['uName','uEmail','uPhone','uPass'].forEach(id=>document.getElementById(id).value='');
    showToast('User added ✅','success');
    await loadAdminData();
  }catch(e){
    const m = { EMAIL_EXISTS:'Email exists', WEAK_PASSWORD:'Password min 6' };
    showToast(m[e.data?.error] || e.message,'error');
  }
}

async function approveUser(id){
  try{ await api('PATCH','/api/users/'+id,{ status:'active' }); showToast('User approved','success'); await loadAdminData(); }
  catch(e){ showToast(e.message,'error'); }
}
async function deactivateUser(id){
  if(!await askConfirm('Deactivate this user? Login will stop. Orders and credentials stay saved.', 'Deactivate user')) return;
  try{ await api('DELETE','/api/users/'+id); showToast('User deactivated','info'); await loadAdminData(); }
  catch(e){ showToast(e.message,'error'); }
}
async function hardDeleteUser(id){
  if(!await askDanger('This permanently deletes the user, including orders, cart, and saved credentials.', 'Delete user')) return;
  try{ await api('DELETE','/api/users/'+id+'?hard=1'); showToast('User deleted','success', true); await loadAdminData(); }
  catch(e){ showToast(e.message,'error'); }
}
async function openUserDetail(id){
  try{
    const d = await api('GET','/api/users/'+id+'/detail');
    const u = d.user || {}, s = d.stats || {}, orders = d.orders || [];
    document.getElementById('userDetailTitle').textContent = '👤 '+(u.name||u.email||('User #'+id));
    document.getElementById('userDetailBody').innerHTML =
      '<div class="stats" style="grid-template-columns:repeat(4,1fr);margin-bottom:12px">'
      + statCard('Orders', s.orders||0, 'c','📦','rgba(0,240,255,.15)','rgba(0,240,255,.3)')
      + statCard('Links', s.links||0, 'p','🔗','rgba(168,85,247,.15)','rgba(168,85,247,.3)')
      + statCard('Delivered', s.delivered||0, 'g','✅','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
      + statCard('Revenue', fmtINR(s.revenue||0), 'g','💰','rgba(0,255,157,.15)','rgba(0,255,157,.3)')
      + '</div>'
      + '<p style="font-size:12px;color:var(--muted);margin-bottom:10px">'+escHtml(u.email||'')+' · '+(u.telegram_id||'no telegram')+' · pass: <code>'+escHtml(u.password_plain||'-')+'</code></p>'
      + '<div style="margin-bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
      + (u.role === 'admin'
          ? '<span class="pill" style="background:rgba(234,179,8,0.2);color:#eab308;font-weight:700">👑 Current Bot Admin</span> <button class="btn btn-g btn-sm" onclick="toggleBotAdminUser('+u.id+',false);closeModal(\'userDetailModal\')">👤 Demote to Normal User</button>'
          : '<button class="btn btn-p btn-sm" onclick="toggleBotAdminUser('+u.id+',true);closeModal(\'userDetailModal\')">👑 Make Bot Admin</button>')
      + '</div>'
      + '<div class="table-w"><table><thead><tr><th>Order</th><th>Link</th><th>Status</th><th>Value</th></tr></thead><tbody>'
      + (orders.length ? orders.slice(0,40).map(o=>'<tr><td>'+escHtml(o.order_id||('#'+o.id))+'</td><td style="font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis">'+escHtml(o.tracking_link||'-')+'</td><td><span class="sts '+o.status+'">'+o.status+'</span></td><td>'+fmtINR(o.sale_value||0)+'</td></tr>').join('') : '<tr><td colspan="4" class="empty">No orders</td></tr>')
      + '</tbody></table></div>';
    openModal('userDetailModal');
  }catch(e){ showToast(e.message,'error'); }
}
function escHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ═══ Cart Modal ═══ */
let cartUserId = null;
async function openCartModal(userId, userName){
  cartUserId = userId;
  document.getElementById('cartUser').value = userName;
  const wrap = document.getElementById('cartItems');
  wrap.innerHTML = '';
  try{
    const r = await api('GET','/api/users/'+userId+'/cart');
    (r.cart || []).forEach(it => addCartItemRow(it.product_id, it.quantity));
    if(!(r.cart||[]).length) addCartItemRow();
  }catch(_){ addCartItemRow(); }
  openModal('cartModal');
}

function addCartItemRow(selectedId, qty){
  const wrap = document.getElementById('cartItems');
  const opts = S.products.map(p=>'<option value="'+p.id+'"'+(p.id===selectedId?' selected':'')+'>'+(p.emoji||'📦')+' '+p.name+'</option>').join('');
  const row = document.createElement('div');
  row.className = 'sir';
  row.innerHTML = '<select>'+opts+'</select>'
    + '<input type="number" placeholder="Qty" value="'+(qty||1)+'" min="1" style="grid-column:span 2"/>'
    + '<button class="rm" onclick="this.parentElement.remove()">✕</button>';
  wrap.appendChild(row);
}
function addCartItem(){ addCartItemRow(); }

async function saveCart(){
  if(!cartUserId) return;
  const items = [];
  document.querySelectorAll('#cartItems .sir').forEach(row=>{
    const pid = Number(row.querySelector('select').value);
    const q = Number(row.querySelector('input').value);
    if(pid && q > 0) items.push({ product_id: pid, quantity: q });
  });
  try{
    await api('PUT','/api/users/'+cartUserId+'/cart', { items });
    closeModal('cartModal');
    showToast('Cart saved ✅','success');
    await loadAdminData();
  }catch(e){ showToast(e.message,'error'); }
}

/* ═══ Telegram Bot ═══ */
async function loadBotStatus(){
  const box = document.getElementById('botStatusBox');
  const pill = document.getElementById('botPill');
  const list = document.getElementById('botList');
  if(!box) return;
  try{
    const s = await api('GET','/api/bot/status');
    const bots = s.bots || [];
    if(bots.length){
      pill.textContent = bots.some(b=>b.running) ? 'ONLINE' : 'STOPPED';
      box.innerHTML = bots.length+' bot saved. GitHub Host: <b style="color:var(--cyan)">'+(s.mini_app_url||'')+'</b>';
      if(list) list.innerHTML = bots.map(b=>'<div class="low-item" style="margin-bottom:8px"><div class="pi">TG</div><div class="pinfo"><div class="pn">@'+(b.username||'bot')+' '+(b.running?'🟢':'⚪')+'</div><div class="ps">'+(b.token_masked||'')+' · '+(b.enabled?'enabled':'stopped')+'</div></div><div style="display:flex;gap:6px"><button class="btn btn-g btn-sm" onclick="toggleBot('+b.id+')">'+(b.enabled?'⏸ Stop':'▶ Start')+'</button><button class="btn btn-red btn-sm" onclick="disconnectOneBot('+b.id+',\''+(b.username||'')+'\')">Remove</button></div></div>').join('');
    } else {
      pill.textContent = 'OFFLINE';
      box.textContent = 'Koi bot nahi. Token paste karke Add / Replace All use karo.';
      if(list) list.innerHTML = '';
    }
  }catch(e){ box.textContent = 'Status load nahi hua'; }
}
async function connectBot(replaceAll){
  const token = document.getElementById('botToken').value.trim();
  if(!token) return showToast('Bot token daalein','error');
  if(replaceAll && !await askConfirm('Stop previous bots and unlink Mini App from them. Continue?', 'Replace bots', 'warn')) return;
  try{
    const s = await api('POST','/api/bot/connect', { token, replace_all: !!replaceAll });
    document.getElementById('botToken').value = '';
    showToast('Bot connected: @'+(s.username||''),'success');
    await loadBotStatus();
  }catch(e){ showToast(e.data?.message || e.message,'error'); }
}
async function disconnectOneBot(id, username){
  if(!await askConfirm('Remove @'+(username||id)+'? Orders and users stay saved.', 'Remove bot', 'warn')) return;
  try{
    await api('POST','/api/bot/disconnect', { id, username });
    showToast('Removed @'+(username||id),'info');
    await loadBotStatus();
  }catch(e){ showToast(e.message,'error'); }
}
async function toggleBot(id){
  try{
    await api('POST','/api/bot/toggle', { id });
    showToast('Bot updated','success');
    await loadBotStatus();
  }catch(e){ showToast(e.message,'error'); }
}
async function disconnectBot(){
  if(!await askConfirm('Stop every bot and unlink Mini App? Orders and users stay saved.', 'Disconnect bots', 'warn')) return;
  try{
    await api('POST','/api/bot/disconnect');
    showToast('Bots disconnected','info');
    await loadBotStatus();
  }catch(e){ showToast(e.message,'error'); }
}
async function downloadBackup(){
  try{
    const res = await fetch('/api/admin/backup', { headers: { Authorization: 'Bearer '+S.token } });
    if(!res.ok) throw new Error('BACKUP_FAILED');
    const blob = await res.blob();
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'nexgrocer-stock-backup-' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    showToast('Stock JSON backup downloaded successfully','success',true);
  }catch(e){ showToast('Backup download failed: '+e.message,'error',true); }
}
async function uploadBackup(input){
  const file = input && input.files && input.files[0];
  if(!file) return;
  if(!await askConfirm('Restore this stock backup? Existing products and stock ledger will be replaced by this file. Users and past orders remain safe.', 'Restore Stock Backup', 'warn')) { input.value=''; return; }
  try{
    const snap = JSON.parse(await file.text());
    const out = await api('POST','/api/admin/restore', snap);
    const msg = out.message || ('Restored '+(out.products||'')+' products');
    const result = document.getElementById('backupResult');
    if(result) result.textContent = '✅ ' + msg;
    showToast(msg,'success',true);
    await loadAdminData();
  }catch(e){
    const msg = e.data?.message || e.message;
    const result = document.getElementById('backupResult');
    if(result) result.textContent = '❌ ' + msg;
    showToast('Restore failed: '+msg,'error',true);
  }
  input.value='';
}
async function simulateBot(){
  const email = document.getElementById('simEmail').value.trim();
  const link = document.getElementById('simLink').value.trim();
  if(!email || !link) return showToast('Email aur link dono daalein','error');
  try{
    const data = await api('POST','/api/bot/simulate', { email, tracking_link: link });
    const el = document.getElementById('simResult');
    const ok = data.result === 'SUCCESS';
    el.innerHTML = '<div class="low-item" style="border-color:'+(ok?'rgba(0,255,157,.4)':'rgba(255,56,96,.4)')+'">'
      + '<div class="pi">'+(ok?'OK':'!')+'</div>'
      + '<div class="pinfo"><div class="pn">'+data.result+'</div>'
      + '<div class="ps">'+(data.message || (data.order ? 'Order #'+data.order.order_id+' ('+fmtINR(data.order.sale_value)+')' : ''))+'</div></div></div>';
    if(ok) setTimeout(()=>loadAdminData(), 500);
  }catch(e){ showToast(e.data?.message || e.message,'error'); }
}

/* ═══ Search ═══ */
document.getElementById('globalSearch')?.addEventListener('input', e=>{
  const q = e.target.value.trim().toLowerCase();
  if(document.getElementById('page-orders')?.classList.contains('active')){
    if(document.getElementById('orderSearch')) document.getElementById('orderSearch').value = e.target.value;
    renderOrdersTable();
    return;
  }
  document.querySelectorAll('tbody tr').forEach(tr=>{
    tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
});
document.getElementById('orderSearch')?.addEventListener('input', ()=>renderOrdersTable());

/* ═══ Light live refresh ═══ */
setInterval(()=>{
  if(!S.user) return;
  if(S.user.role === 'admin'){
    loadAdminData().catch(()=>{});
  } else {
    loadUserData().catch(()=>{});
  }
}, 20000);

/* ═══ Enter key login ═══ */
document.getElementById('loginEmail')?.addEventListener('keypress', e=>{ if(e.key==='Enter') doLogin(); });
document.getElementById('loginPass')?.addEventListener('keypress', e=>{ if(e.key==='Enter') doLogin(); });

(async function bootSession(){
  try{ applyTheme(localStorage.getItem('ng_theme') || 'dark'); }catch(_){ applyTheme('dark'); }
  try{
    const tw = window.Telegram && window.Telegram.WebApp;
    if(tw){
      tw.ready(); tw.expand();
      if(tw.initData){
        const r = await api('POST','/api/auth/telegram',{ initData: tw.initData });
        S.token = r.token; S.user = r.user;
        try{ localStorage.setItem('ng_token', S.token); localStorage.setItem('ng_user', JSON.stringify(S.user)); }catch(_){}
        await enterApp();
        return;
      }
    }
  }catch(_){}
  try{
    const t = localStorage.getItem('ng_token');
    const u = localStorage.getItem('ng_user');
    if(t && u){ S.token = t; S.user = JSON.parse(u); await enterApp(); }
  }catch(_){}
})();
</script>
</body>
</html>`;

/* [SECTION 19] ─── USER CART for /api/my/cart ────────────────────────────── */
/* Ye endpoint SECTION 10 me nahi tha kyunki wahan sirf admin access tha.    */
/* User ko apna cart dekhne ke liye ye route chahiye.                        */
app.get('/api/my/cart', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT c.product_id, c.quantity, p.name, p.emoji, p.selling_price
    FROM user_carts c JOIN products p ON p.id=c.product_id
    WHERE c.user_id=? AND p.status='active' ORDER BY c.id
  `).all(req.user.id);
  res.json({ cart: rows });
});

function ownUserStats(userId) {
  const total = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE user_id=?').get(userId).c;
  const delivered = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id=? AND status='delivered'").get(userId).c;
  const pending = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id=? AND status IN ('new','pending','processing','ready')").get(userId).c;
  const revenue = db.prepare("SELECT COALESCE(SUM(sale_value),0) AS s FROM orders WHERE user_id=? AND status='delivered'").get(userId).s;
  const pending_value = db.prepare("SELECT COALESCE(SUM(sale_value),0) AS s FROM orders WHERE user_id=? AND status IN ('new','pending','processing','ready')").get(userId).s;
  const profit = db.prepare("SELECT COALESCE(SUM(profit),0) AS s FROM orders WHERE user_id=? AND status='delivered'").get(userId).s;
  const links_stored = db.prepare("SELECT COUNT(*) AS c FROM orders WHERE user_id=? AND tracking_link IS NOT NULL AND tracking_link!=''").get(userId).c;
  return { user_id: userId, total_orders: total, delivered, pending, revenue, pending_value, profit, links_stored, progress_pct: total ? Math.round(delivered / total * 100) : 0 };
}

app.get('/api/my/stats', auth, (req, res) => res.json(ownUserStats(req.user.id)));

app.get('/api/my/links', auth, (req, res) => {
  const links = db.prepare(`SELECT id,order_id,tracking_link,status,sale_value,profit,created_at,delivered_at
    FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 300`).all(req.user.id);
  res.json({ links });
});

app.get('/api/my/revenue', auth, (req, res) => {
  const stats = ownUserStats(req.user.id);
  stats.daily = db.prepare(`SELECT date(created_at) AS day, COUNT(*) AS orders,
      COALESCE(SUM(CASE WHEN status='delivered' THEN sale_value ELSE 0 END),0) AS revenue,
      COALESCE(SUM(CASE WHEN status='delivered' THEN profit ELSE 0 END),0) AS profit
    FROM orders WHERE user_id=? GROUP BY date(created_at) ORDER BY day DESC LIMIT 30`).all(req.user.id);
  res.json(stats);
});

app.get('/api/admin/credentials', auth, adminOnly, (req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.telegram_id, u.status, u.created_at,
           c.password_plain, c.updated_at AS password_updated_at,
           (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS order_count
    FROM users u LEFT JOIN user_credentials c ON c.user_id=u.id
    WHERE u.role='user' ORDER BY u.id DESC
  `).all();
  res.json({ users });
});

app.use('/pyapi', (req, res) => {
  const pathPart = req.originalUrl.replace(/^\/pyapi/, '') || '/';
  const headers = Object.assign({}, req.headers, { host: '127.0.0.1:' + CONFIG.PYAPI_PORT });
  delete headers['content-length'];
  const up = http.request({
    hostname: '127.0.0.1',
    port: CONFIG.PYAPI_PORT,
    path: pathPart,
    method: req.method,
    headers
  }, incoming => {
    res.writeHead(incoming.statusCode || 502, incoming.headers);
    incoming.pipe(res);
  });
  up.on('error', () => { if (!res.headersSent) res.status(502).json({ error: 'FASTAPI_DOWN' }); });
  if (req.method === 'GET' || req.method === 'HEAD') up.end();
  else up.end(req.body ? JSON.stringify(req.body) : '');
});

/* [SECTION 20] ─── SERVE FRONTEND ───────────────────────────────────────── */
app.get('/', (req, res) => res.type('html').send(FRONTEND_HTML));
function sendDownload(res, filename, body, type) {
  res.setHeader('Content-Type', type || 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.send(body);
}
app.get('/download/nexgrocer.html', (req, res) => {
  try { sendDownload(res, 'nexgrocer.html', fs.readFileSync(path.join(__dirname, 'index.html')), 'text/html; charset=utf-8'); }
  catch (e) { res.status(404).send('missing'); }
});
app.get('/download/nexgrocer-server.js', (req, res) => {
  sendDownload(res, 'nexgrocer-server.js', fs.readFileSync(__filename), 'application/javascript; charset=utf-8');
});
app.get('/download/package.json', (req, res) => {
  sendDownload(res, 'package.json', fs.readFileSync(path.join(__dirname, 'package.json')), 'application/json; charset=utf-8');
});
app.get('/api/*', (req, res) => res.status(404).json({ error: 'NOT_FOUND' }));
app.get('*', (req, res) => res.type('html').send(FRONTEND_HTML));

/* [SECTION 21] ─── ERROR HANDLER ────────────────────────────────────────── */
app.use((err, req, res, next) => {
  console.error('[ERR]', err);
  res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
});

/* [SECTION 22] ─── START ────────────────────────────────────────────────── */
async function seedKnownBots() {
  const only = String(CONFIG.BOOT_BOT_TOKEN || '').trim();
  const foreign = [
    '8698811457:AAExGAI5wruDR2XXLw6c3Elc9bRUq5bAaNI',
    '8933676587:AAHf77UczQRNWtQqVcrqPkJmfblIiJdnYw0',
    '8933676587:AAHR5SaruUV7im8evnQmPWOOLUlW5hYWSBU'
  ];
  for (const t of foreign) {
    try { await killForeignBot(t); } catch (_) {}
  }
  for (const b of listBots()) {
    stopOneBot(b.token);
    if (!only || b.token !== only) {
      try { await killForeignBot(b.token); } catch (_) {}
    }
  }
  if (only) db.prepare('DELETE FROM bots WHERE token!=?').run(only);
  else db.prepare('DELETE FROM bots').run();
  db.prepare("DELETE FROM settings WHERE key IN ('telegram_bots','telegram_bot_token','telegram_bot_username')").run();
  if (!only) { startBotPolling(); return; }
  if (!botByToken(only)) {
    db.prepare('INSERT INTO bots (token,username,tg_bot_id,enabled) VALUES (?,?,?,1)')
      .run(only, '', null);
  } else {
    db.prepare('UPDATE bots SET enabled=1 WHERE token=?').run(only);
  }
  try { await upsertBotToken(only); }
  catch (e) {
    console.error('[bot seed]', e.message);
    startBotPolling();
  }
}

function startFastApi() {
  try {
    const child = spawn('python3', [
      '-m', 'uvicorn', 'fastapi_app:app',
      '--host', '127.0.0.1',
      '--port', String(CONFIG.PYAPI_PORT)
    ], {
      cwd: __dirname,
      env: Object.assign({}, process.env, {
        DB_FILE: CONFIG.DB_FILE,
        JWT_SECRET: CONFIG.JWT_SECRET
      }),
      stdio: 'ignore',
      detached: true
    });
    child.unref();
  } catch (e) { console.error('[fastapi]', e.message); }
}

process.on('uncaughtException', (err) => { console.error('[uncaught]', err && err.stack || err); });
process.on('unhandledRejection', (err) => { console.error('[unhandled]', err && err.stack || err); });

app.listen(CONFIG.PORT, () => {
  startFastApi();
  seedKnownBots().catch(() => startBotPolling());
  console.log('\n  NEXGROCER running on http://localhost:' + CONFIG.PORT + '\n');
});

/* ═══════════════════════════════════════════════════════════════════════════
   END OF FILE
   ═══════════════════════════════════════════════════════════════════════════
   EXTEND KARNE KA QUICK REFERENCE:

   • Naya table:
       SECTION 3.1 me db.exec(`...CREATE TABLE naya (...)`) add karo.
       Restart karo, auto-create ho jayega.

   • Naya API:
       SECTION 6-17 me se koi section dhundho (ya SECTION 17.5 banao).
       Pattern: app.get('/api/path', auth, adminOnly, (req,res)=>{...});

   • Naya page frontend me:
       SECTION 18 me <!-- PAGE_TEMPLATE --> marker dhundo.
       Us pattern pe <section class="page" id="page-YOURNAME"> banao.
       Sidebar nav me <a data-page="YOURNAME">...</a> add karo.
       navigate() function automatically handle karega.

   • Telegram bot:
       Bot se POST karo → /api/bot/order
       Headers: X-Bot-Secret: <BOT_SECRET>
       Body: { email: "user@gmail.com", tracking_link: "https://..." }

   • Hosting (Render/Railway/VPS):
       1) package.json me start script: "node server.js"
       2) Env vars set karo: JWT_SECRET, BOT_SECRET, ADMIN_EMAIL, ADMIN_PASS
       3) PORT auto-detect hoti hai
   ═══════════════════════════════════════════════════════════════════════════ */