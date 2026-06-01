require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const crypto = require('crypto');

// ── Database (sql.js wrapper) ──────────────────────────────────────────
const initSqlJs = require('sql.js');
const DB_PATH = path.join(__dirname, 'data.db');

let db;

function saveDb() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function dbRun(sql, params = []) {
  try {
    db.run(sql, params);
    const r = db.exec("SELECT last_insert_rowid() as id, changes() as changes");
    const info = r.length && r[0].values.length ? { lastInsertRowid: r[0].values[0][0], changes: r[0].values[0][1] } : { lastInsertRowid: 0, changes: 0 };
    return { ...info, run: () => ({ changes: info.changes }) };
  } catch (e) { throw new Error(e.message); }
}

function dbGet(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) row = stmt.getAsObject();
  stmt.free();
  return row;
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// ── Auth Helpers ────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── PayPal ─────────────────────────────────────────────────────────────
const PP_BASE = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

async function ppToken() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PP_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth: ${res.status}`);
  return (await res.json()).access_token;
}

// ── Express ────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Auth Routes ────────────────────────────────────────────────────────

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required' });

    const existing = dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 10);
    const result = dbRun('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hash]);

    const defaultCats = [
      ['Salary', '💼', '#059669', 'income'], ['Freelance', '💻', '#3B82F6', 'income'],
      ['Investments', '📈', '#8B5CF6', 'income'], ['Food', '🍔', '#EF4444', 'expense'],
      ['Transport', '🚗', '#F59E0B', 'expense'], ['Housing', '🏠', '#6366F1', 'expense'],
      ['Entertainment', '🎬', '#EC4899', 'expense'], ['Health', '💊', '#14B8A6', 'expense'],
      ['Shopping', '🛍️', '#F97316', 'expense'], ['Bills', '📄', '#6B7280', 'expense'],
      ['Education', '📚', '#8B5CF6', 'expense'], ['Other', '📦', '#6B7280', 'expense'],
    ];
    for (const [n, i, c, t] of defaultCats) {
      dbRun('INSERT INTO categories (user_id, name, icon, color, type) VALUES (?, ?, ?, ?, ?)',
        [result.lastInsertRowid, n, i, c, t]);
    }

    // Free trial for all new users (except owner)
    if (result.lastInsertRowid !== 1) {
      const trialDays = parseInt(dbGet("SELECT value FROM app_settings WHERE key = 'trial_days'")?.value || '7');
      const exp = new Date();
      exp.setDate(exp.getDate() + trialDays);
      dbRun(`INSERT INTO subscriptions (user_id, order_id, amount, currency, status, expires_at) VALUES (?, NULL, 0, 'TRIAL', 'active', ?)`,
        [result.lastInsertRowid, exp.toISOString()]);
    }
    saveDb();

    const token = jwt.sign({ id: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: result.lastInsertRowid, name, email } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = dbGet('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, paypal_email: user.paypal_email, currency: user.currency, theme: user.theme }
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = dbGet('SELECT id, name, email, paypal_email, currency, theme FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

// ── User Settings ──────────────────────────────────────────────────────

app.put('/api/user/profile', auth, (req, res) => {
  const { name, currency, theme } = req.body;
  dbRun(`UPDATE users SET name = COALESCE(?, name), currency = COALESCE(?, currency), theme = COALESCE(?, theme) WHERE id = ?`,
    [name || null, currency || null, theme || null, req.user.id]);
  saveDb();
  res.json({ ok: true });
});

app.put('/api/user/paypal', auth, (req, res) => {
  const { paypal_email } = req.body;
  dbRun('UPDATE users SET paypal_email = ? WHERE id = ?', [paypal_email || '', req.user.id]);
  saveDb();
  res.json({ ok: true });
});

// ── Categories ─────────────────────────────────────────────────────────

app.get('/api/categories', auth, (req, res) => {
  const cats = dbAll('SELECT * FROM categories WHERE user_id = ? ORDER BY type, name', [req.user.id]);
  res.json(cats);
});

app.post('/api/categories', auth, (req, res) => {
  const { name, icon, color, type, budget } = req.body;
  const r = dbRun('INSERT INTO categories (user_id, name, icon, color, type, budget) VALUES (?, ?, ?, ?, ?, ?)',
    [req.user.id, name, icon || '📦', color || '#6B7280', type || 'expense', budget || 0]);
  saveDb();
  const cat = dbGet('SELECT * FROM categories WHERE id = ?', [r.lastInsertRowid]);
  res.json(cat);
});

app.put('/api/categories/:id', auth, (req, res) => {
  const { name, icon, color, budget } = req.body;
  dbRun(`UPDATE categories SET name = COALESCE(?, name), icon = COALESCE(?, icon), color = COALESCE(?, color), budget = COALESCE(?, budget) WHERE id = ? AND user_id = ?`,
    [name || null, icon || null, color || null, budget ?? null, req.params.id, req.user.id]);
  saveDb();
  res.json({ ok: true });
});

app.delete('/api/categories/:id', auth, (req, res) => {
  dbRun('DELETE FROM categories WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  saveDb();
  res.json({ ok: true });
});

// ── Transactions ───────────────────────────────────────────────────────

app.get('/api/transactions', auth, (req, res) => {
  const { type, category_id, month, year, search, limit = 100, offset = 0 } = req.query;
  let sql = 'SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = ?';
  const params = [req.user.id];

  if (type) { sql += ' AND t.type = ?'; params.push(type); }
  if (category_id) { sql += ' AND t.category_id = ?'; params.push(parseInt(category_id)); }
  if (search) { sql += ' AND t.description LIKE ?'; params.push(`%${search}%`); }
  if (month && year) { sql += " AND strftime('%m', t.date) = ? AND strftime('%Y', t.date) = ?"; params.push(month.padStart(2,'0'), year); }

  sql += ' ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const txs = dbAll(sql, params);
  res.json(txs);
});

app.post('/api/transactions', auth, (req, res) => {
  const { amount, type, category_id, description, date, note } = req.body;
  if (!amount || !description || !date) return res.status(400).json({ error: 'Amount, description, and date required' });
  const r = dbRun('INSERT INTO transactions (user_id, amount, type, category_id, description, date, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.user.id, amount, type || 'expense', category_id || null, description, date, note || '']);
  saveDb();
  const tx = dbGet('SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = ?', [r.lastInsertRowid]);
  res.json(tx);
});

app.put('/api/transactions/:id', auth, (req, res) => {
  const { amount, type, category_id, description, date, note } = req.body;
  dbRun(`UPDATE transactions SET amount=COALESCE(?,amount), type=COALESCE(?,type), category_id=?, description=COALESCE(?,description), date=COALESCE(?,date), note=COALESCE(?,note) WHERE id=? AND user_id=?`,
    [amount ?? null, type || null, category_id ?? null, description || null, date || null, note || null, req.params.id, req.user.id]);
  saveDb();
  const tx = dbGet('SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.id = ?', [req.params.id]);
  res.json(tx);
});

app.delete('/api/transactions/:id', auth, (req, res) => {
  dbRun('DELETE FROM transactions WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
  saveDb();
  res.json({ ok: true });
});

// ── Dashboard ──────────────────────────────────────────────────────────

app.get('/api/dashboard', auth, (req, res) => {
  const { month, year } = req.query;
  const m = month || String(new Date().getMonth() + 1).padStart(2, '0');
  const y = year || String(new Date().getFullYear());

  const summary = dbGet(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount END), 0) as income, COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) as expenses FROM transactions WHERE user_id = ? AND strftime('%m', date) = ? AND strftime('%Y', date) = ?`,
    [req.user.id, m, y]);

  const byCategory = dbAll(`SELECT c.id, c.name, c.icon, c.color, c.budget, COALESCE(SUM(t.amount),0) as spent FROM categories c LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = c.user_id AND t.type = 'expense' AND strftime('%m', t.date) = ? AND strftime('%Y', t.date) = ? WHERE c.user_id = ? AND c.type = 'expense' GROUP BY c.id ORDER BY spent DESC`,
    [m, y, req.user.id]);

  const recent = dbAll(`SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = ? ORDER BY t.date DESC, t.id DESC LIMIT 5`, [req.user.id]);

  const monthly = dbAll(`SELECT strftime('%m', date) as m, strftime('%Y', date) as y, COALESCE(SUM(CASE WHEN type='income' THEN amount END), 0) as income, COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) as expenses FROM transactions WHERE user_id = ? GROUP BY y, m ORDER BY y, m LIMIT 12`, [req.user.id]);

  res.json({
    income: summary.income,
    expenses: summary.expenses,
    balance: summary.income - summary.expenses,
    by_category: byCategory,
    recent,
    monthly,
  });
});

// ── PayPal Payouts ─────────────────────────────────────────────────────

app.post('/api/paypal/payout', auth, async (req, res) => {
  try {
    const { amount, currency = 'ZAR', note } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const user = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
    const email = user.paypal_email;
    if (!email) return res.status(400).json({ error: 'No PayPal email linked' });

    const summary = dbGet(`SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount END), 0) as income, COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) as expenses FROM transactions WHERE user_id = ?`, [req.user.id]);
    const balance = summary.income - summary.expenses;
    if (amount > balance) return res.status(400).json({ error: 'Insufficient funds' });

    const noCreds = !process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID === 'your_client_id_here';

    let batchId, status;
    if (noCreds) {
      batchId = `demo_${Date.now()}`;
      status = 'SUCCESS';
    } else {
      const token = await ppToken();
      batchId = `bt_${crypto.randomBytes(8).toString('hex')}`;
      const body = {
        sender_batch_header: { sender_batch_id: batchId, email_subject: 'Budget Tracker Payout', email_message: `You received ${currency}${parseFloat(amount).toFixed(2)}` },
        items: [{ recipient_type: 'EMAIL', amount: { value: parseFloat(amount).toFixed(2), currency }, receiver: email, note: note || 'Budget withdrawal', sender_item_id: `item_${Date.now()}` }],
      };
      const ppRes = await fetch(`${PP_BASE}/v1/payments/payouts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
      });
      const data = await ppRes.json();
      if (!ppRes.ok) return res.status(ppRes.status).json({ error: 'PayPal payout failed', details: data });
      batchId = data.batch_header?.payout_batch_id;
      status = data.batch_header?.batch_status || 'PENDING';
    }

    const r = dbRun('INSERT INTO payouts (user_id, amount, currency, paypal_email, batch_id, status, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, amount, currency, email, batchId, status, note || 'Budget withdrawal']);
    dbRun('INSERT INTO transactions (user_id, amount, type, description, date, note) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, amount, 'expense', `PayPal withdrawal (${email})`, new Date().toISOString().slice(0, 10), note || '']);
    saveDb();

    const payout = dbGet('SELECT * FROM payouts WHERE id = ?', [r.lastInsertRowid]);
    res.json({ success: true, demo: noCreds, payout });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/paypal/payouts', auth, (req, res) => {
  const payouts = dbAll('SELECT * FROM payouts WHERE user_id = ? ORDER BY created_at DESC LIMIT 50', [req.user.id]);
  res.json(payouts);
});

app.get('/api/paypal/config', auth, (req, res) => {
  const user = dbGet('SELECT paypal_email FROM users WHERE id = ?', [req.user.id]);
  const hasCredentials = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_ID !== 'your_client_id_here');
  res.json({ paypal_email: user.paypal_email, mode: process.env.PAYPAL_MODE || 'sandbox', has_credentials: hasCredentials, demo_mode: !hasCredentials });
});

// ── Subscription / Paywall ────────────────────────────────────────────

app.get('/api/subscription/status', auth, (req, res) => {
  if (req.user.id === 1) {
    return res.json({ active: true, is_owner: true, expires_at: null, trial: false });
  }
  const sub = dbGet("SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now')", [req.user.id]);
  res.json({
    active: !!sub,
    is_owner: false,
    expires_at: sub?.expires_at || null,
    trial: sub?.currency === 'TRIAL',
    amount: sub?.amount || 0,
  });
});

app.post('/api/payments/create-order', auth, async (req, res) => {
  try {
    if (req.user.id === 1) return res.status(400).json({ error: 'Owner does not need to pay' });
    const settings = dbAll('SELECT key, value FROM app_settings');
    const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
    const price = map.sub_price || '2.50';
    const currency = map.sub_currency || 'USD';

    const token = await ppToken();
    const orderRes = await fetch(`${PP_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [{
          amount: { currency_code: currency, value: price },
          description: `Budget Tracker - ${map.sub_label || 'Monthly'} Subscription`,
        }]
      }),
    });
    const order = await orderRes.json();
    if (!orderRes.ok) return res.status(400).json({ error: 'Failed to create order', details: order });
    res.json({ id: order.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/payments/capture-order', auth, async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) return res.status(400).json({ error: 'Missing order_id' });

    const token = await ppToken();
    const capRes = await fetch(`${PP_BASE}/v2/checkout/orders/${order_id}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await capRes.json();

    if (!capRes.ok) return res.status(400).json({ error: 'Capture failed', details: data });
    if (data.status !== 'COMPLETED') return res.status(400).json({ error: 'Payment not completed' });

    const amount = data.purchase_units[0]?.payments?.captures[0]?.amount?.value || '5';
    const currency = data.purchase_units[0]?.payments?.captures[0]?.amount?.currency_code || 'USD';

    const exp = new Date();
    exp.setDate(exp.getDate() + 30);
    dbRun(`INSERT INTO subscriptions (user_id, order_id, amount, currency, status, expires_at) VALUES (?, ?, ?, ?, 'active', ?)
      ON CONFLICT(user_id) DO UPDATE SET order_id=excluded.order_id, amount=excluded.amount, currency=excluded.currency, status='active', expires_at=excluded.expires_at`,
      [req.user.id, order_id, amount, currency, exp.toISOString()]);
    saveDb();

    res.json({ success: true, expires_at: exp.toISOString() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/payments/config', auth, (req, res) => {
  const settings = dbAll('SELECT key, value FROM app_settings');
  const map = Object.fromEntries(settings.map(s => [s.key, s.value]));
  res.json({
    client_id: process.env.PAYPAL_CLIENT_ID,
    price: map.sub_price || '2.50',
    currency: map.sub_currency || 'USD',
    label: map.sub_label || 'Monthly',
    trial_days: map.trial_days || '7',
    is_owner: req.user.id === 1,
  });
});

app.put('/api/admin/settings', auth, (req, res) => {
  if (req.user.id !== 1) return res.status(403).json({ error: 'Only app owner can change settings' });
  const { price, currency, label, trial_days } = req.body;
  if (price) dbRun("UPDATE app_settings SET value = ? WHERE key = 'sub_price'", [String(price)]);
  if (currency) dbRun("UPDATE app_settings SET value = ? WHERE key = 'sub_currency'", [currency]);
  if (label) dbRun("UPDATE app_settings SET value = ? WHERE key = 'sub_label'", [label]);
  if (trial_days) dbRun("UPDATE app_settings SET value = ? WHERE key = 'trial_days'", [String(trial_days)]);
  saveDb();
  res.json({ ok: true });
});

// ── Export ─────────────────────────────────────────────────────────────

app.get('/api/export', auth, (req, res) => {
  const { format = 'json' } = req.query;
  const user = dbGet('SELECT * FROM users WHERE id = ?', [req.user.id]);
  const txs = dbAll('SELECT t.*, c.name as category_name FROM transactions t LEFT JOIN categories c ON t.category_id = c.id WHERE t.user_id = ? ORDER BY t.date', [req.user.id]);
  const cats = dbAll('SELECT * FROM categories WHERE user_id = ?', [req.user.id]);

  if (format === 'csv') {
    let csv = 'Date,Description,Category,Type,Amount,Note\n';
    for (const t of txs) csv += `${t.date},"${t.description}",${t.category_name || ''},${t.type},${t.amount},"${t.note}"\n`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=budget_export.csv');
    return res.send(csv);
  }
  res.json({ user: { name: user.name, email: user.email }, categories: cats, transactions: txs });
});

// ── Serve SPA ──────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ──────────────────────────────────────────────────────────────

async function start() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, paypal_email TEXT DEFAULT '', currency TEXT DEFAULT 'ZAR', theme TEXT DEFAULT 'auto', created_at TEXT DEFAULT (datetime('now')))`);
  db.run(`CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, name TEXT NOT NULL, icon TEXT DEFAULT '📦', color TEXT DEFAULT '#6B7280', budget REAL DEFAULT 0, type TEXT DEFAULT 'expense', FOREIGN KEY (user_id) REFERENCES users(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount REAL NOT NULL, type TEXT NOT NULL CHECK(type IN ('income','expense')), category_id INTEGER, description TEXT NOT NULL, date TEXT NOT NULL, note TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id), FOREIGN KEY (category_id) REFERENCES categories(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS payouts (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, amount REAL NOT NULL, currency TEXT DEFAULT 'ZAR', paypal_email TEXT NOT NULL, batch_id TEXT, status TEXT DEFAULT 'PENDING', note TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, order_id TEXT, amount REAL, currency TEXT DEFAULT 'USD', status TEXT DEFAULT 'active', expires_at TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (user_id) REFERENCES users(id))`);
  db.run(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`);
  db.run(`INSERT OR IGNORE INTO app_settings (key, value)     VALUES ('sub_price', '2.50')`);
  db.run(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('sub_currency', 'USD')`);
  db.run(`INSERT OR IGNORE INTO app_settings (key, value) VALUES ('trial_days', '7')`);
  saveDb();

  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Budget Tracker running → http://localhost:${PORT}`);
    const hasCreds = !!(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_ID !== 'your_client_id_here');
    console.log(`PayPal: ${process.env.PAYPAL_MODE || 'sandbox'} | Credentials: ${hasCreds ? '✓' : '✗ (demo)'}`);
  });
}

start().catch(err => { console.error('Startup error:', err); process.exit(1); });
