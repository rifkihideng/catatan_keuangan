import express from 'express';
import cors from 'cors';
import { existsSync, mkdirSync, copyFileSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, dbPath } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
app.use(cors());
app.use(express.json());

// Helper pengaturan (settings)
function getSetting(key, fallback = '0') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

function getTransaction(id) {
  return db
    .prepare(
      `SELECT t.*, a.name AS account_name
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.id = ?`
    )
    .get(id);
}

function accountBalance(accountId) {
  const row = db
    .prepare(
      `SELECT
        COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = ? AND type = 'income' AND deleted_at IS NULL), 0) AS income,
        COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = ? AND type = 'expense' AND deleted_at IS NULL), 0) AS expense,
        COALESCE((SELECT SUM(amount) FROM transfers WHERE from_account_id = ? AND deleted_at IS NULL), 0) AS out_amt,
        COALESCE((SELECT SUM(amount) FROM transfers WHERE to_account_id = ? AND deleted_at IS NULL), 0) AS in_amt`
    )
    .get(accountId, accountId, accountId, accountId);
  return row.income - row.expense + row.in_amt - row.out_amt;
}

// Buat transaksi dari transaksi berulang yang sudah jatuh tempo
function processRecurring() {
  const advance = { daily: '+1 day', weekly: '+7 days', monthly: '+1 month' };
  const insert = db.prepare(
    'INSERT INTO transactions (type, amount, category, description, date, account_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  let guard = 0;
  while (guard < 100) {
    const due = db
      .prepare(
        "SELECT * FROM recurring WHERE active = 1 AND deleted_at IS NULL AND next_date <= date('now','localtime') ORDER BY id LIMIT 1"
      )
      .get();
    if (!due) break;
    insert.run(
      due.type,
      due.amount,
      due.category || '',
      due.description || '',
      due.next_date,
      due.account_id ?? null
    );
    db.prepare('UPDATE recurring SET next_date = date(next_date, ?) WHERE id = ?').run(
      advance[due.frequency] || '+1 month',
      due.id
    );
    guard++;
  }
}

// Ambil semua transaksi (bisa filter per bulan: ?month=YYYY-MM, atau rentang tanggal: ?from=&to=)
app.get('/api/transactions', (req, res) => {
  const { month, from, to } = req.query;
  const base =
    'SELECT t.*, a.name AS account_name FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id WHERE t.deleted_at IS NULL';
  if (month) {
    const rows = db
      .prepare(`${base} AND strftime('%Y-%m', t.date) = ? ORDER BY t.date DESC, t.id DESC`)
      .all(month);
    return res.json(rows);
  }
  if (from || to) {
    const clauses = [];
    const params = [];
    if (from) {
      clauses.push('t.date >= ?');
      params.push(String(from));
    }
    if (to) {
      clauses.push('t.date <= ?');
      params.push(String(to));
    }
    const rows = db
      .prepare(`${base} AND ${clauses.join(' AND ')} ORDER BY t.date DESC, t.id DESC`)
      .all(...params);
    return res.json(rows);
  }
  const rows = db.prepare(`${base} ORDER BY t.date DESC, t.id DESC`).all();
  res.json(rows);
});

// Tambah transaksi baru
app.post('/api/transactions', (req, res) => {
  const { type, amount, category, description, date, accountId } = req.body ?? {};
  if (!type || !amount || !date) {
    return res.status(400).json({ error: 'type, amount, dan date wajib diisi' });
  }
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: 'type harus income atau expense' });
  }

  const result = db
    .prepare(
      'INSERT INTO transactions (type, amount, category, description, date, account_id) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(type, amount, category || '', description || '', date, accountId || null);

  res.status(201).json(getTransaction(Number(result.lastInsertRowid)));
});

// Import banyak transaksi (dari CSV)
app.post('/api/transactions/import', (req, res) => {
  const items = req.body?.transactions;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'Data transaksi tidak valid' });
  }
  const insert = db.prepare(
    'INSERT INTO transactions (type, amount, category, description, date, account_id) VALUES (?, ?, ?, ?, ?, ?)'
  );
  let count = 0;
  try {
    db.exec('BEGIN');
    for (const t of items) {
      const { type, amount, category, description, date, accountId } = t ?? {};
      const value = Number(amount);
      if (!type || !['income', 'expense'].includes(type)) continue;
      if (!date || Number.isNaN(value) || value <= 0) continue;
      insert.run(type, value, category || '', description || '', date, accountId || null);
      count++;
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    return res.status(500).json({ error: `Gagal import: ${err.message}` });
  }
  res.json({ imported: count });
});

// Perbarui transaksi
app.put('/api/transactions/:id', (req, res) => {
  const { type, amount, category, description, date, accountId } = req.body ?? {};
  if (!type || !amount || !date) {
    return res.status(400).json({ error: 'type, amount, dan date wajib diisi' });
  }
  if (!['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: 'type harus income atau expense' });
  }

  const result = db
    .prepare(
      'UPDATE transactions SET type = ?, amount = ?, category = ?, description = ?, date = ?, account_id = ? WHERE id = ?'
    )
    .run(type, amount, category || '', description || '', date, accountId || null, req.params.id);

  if (Number(result.changes) === 0) {
    return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
  }

  res.json(getTransaction(req.params.id));
});

// Daftar kategori (custom)
app.get('/api/categories', (req, res) => {
  const rows = db.prepare('SELECT * FROM categories ORDER BY type, id').all();
  res.json({
    income: rows.filter((r) => r.type === 'income').map((r) => r.name),
    expense: rows.filter((r) => r.type === 'expense').map((r) => r.name),
  });
});

// Tambah kategori baru
app.post('/api/categories', (req, res) => {
  const { type, name } = req.body ?? {};
  if (!type || !['income', 'expense'].includes(type) || !name || !String(name).trim()) {
    return res.status(400).json({ error: 'type dan name wajib diisi' });
  }
  const trimmed = String(name).trim();
  try {
    const result = db
      .prepare('INSERT INTO categories (type, name) VALUES (?, ?)')
      .run(type, trimmed);
    res.status(201).json({ id: Number(result.lastInsertRowid), type, name: trimmed });
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Kategori sudah ada' });
    }
    throw err;
  }
});

// Ganti nama kategori (termasuk semua transaksi yang memakainya)
app.put('/api/categories/:id', (req, res) => {
  const { name } = req.body ?? {};
  const trimmed = String(name ?? '').trim();
  if (!trimmed) {
    return res.status(400).json({ error: 'Nama kategori wajib diisi' });
  }
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) {
    return res.status(404).json({ error: 'Kategori tidak ditemukan' });
  }
  if (cat.name === trimmed) {
    return res.json({ id: cat.id, type: cat.type, name: trimmed });
  }
  try {
    db.exec('BEGIN');
    db.prepare('UPDATE categories SET name = ? WHERE id = ?').run(trimmed, cat.id);
    db.prepare('UPDATE transactions SET category = ? WHERE category = ?').run(trimmed, cat.name);
    db.prepare('UPDATE recurring SET category = ? WHERE category = ?').run(trimmed, cat.name);
    db.prepare('UPDATE category_budgets SET category = ? WHERE category = ?').run(trimmed, cat.name);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'Kategori sudah ada' });
    }
    throw err;
  }
  res.json({ id: cat.id, type: cat.type, name: trimmed });
});

// Daftar kategori lengkap dengan id (untuk kelola kategori)
app.get('/api/categories/detail', (req, res) => {
  const rows = db.prepare('SELECT id, type, name FROM categories ORDER BY type, id').all();
  res.json({
    income: rows.filter((r) => r.type === 'income'),
    expense: rows.filter((r) => r.type === 'expense'),
  });
});

// Hapus kategori
app.delete('/api/categories/:id', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) {
    return res.status(404).json({ error: 'Kategori tidak ditemukan' });
  }
  db.exec('BEGIN');
  db.prepare('DELETE FROM category_budgets WHERE category = ?').run(cat.name);
  db.prepare('DELETE FROM categories WHERE id = ?').run(cat.id);
  db.exec('COMMIT');
  res.json({ ok: true });
});

// Ambil anggaran bulanan
app.get('/api/budget', (req, res) => {
  res.json({ amount: Number(getSetting('monthly_budget', '0')) || 0 });
});

// Simpan anggaran bulanan
app.put('/api/budget', (req, res) => {
  const value = Number(req.body?.amount);
  if (Number.isNaN(value) || value < 0) {
    return res.status(400).json({ error: 'Anggaran harus angka >= 0' });
  }
  setSetting('monthly_budget', value);
  res.json({ amount: value });
});

// Simpan anggaran per kategori (upsert)
app.put('/api/category-budgets', (req, res) => {
  const { category, amount } = req.body ?? {};
  const value = Number(amount);
  if (!category || !String(category).trim()) {
    return res.status(400).json({ error: 'Kategori wajib diisi' });
  }
  if (Number.isNaN(value) || value <= 0) {
    return res.status(400).json({ error: 'Anggaran harus angka lebih dari 0' });
  }
  const cat = String(category).trim();
  db.prepare(
    'INSERT INTO category_budgets (category, amount) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET amount = excluded.amount'
  ).run(cat, value);
  res.json({ category: cat, amount: value });
});

// Hapus anggaran per kategori
app.delete('/api/category-budgets/:category', (req, res) => {
  const result = db.prepare('DELETE FROM category_budgets WHERE category = ?').run(req.params.category);
  if (Number(result.changes) === 0) {
    return res.status(404).json({ error: 'Anggaran kategori tidak ditemukan' });
  }
  res.json({ ok: true });
});

// Ambil target tabungan
app.get('/api/savings-goal', (req, res) => {
  res.json({ amount: Number(getSetting('savings_goal', '0')) || 0 });
});

// Simpan target tabungan
app.put('/api/savings-goal', (req, res) => {
  const value = Number(req.body?.amount);
  if (Number.isNaN(value) || value < 0) {
    return res.status(400).json({ error: 'Target harus angka >= 0' });
  }
  setSetting('savings_goal', value);
  res.json({ amount: value });
});

// Daftar rekening
app.get('/api/accounts', (req, res) => {
  const accounts = db.prepare('SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY id').all();
  res.json(
    accounts.map((a) => ({
      ...a,
      balance: Number(a.initial_balance) + accountBalance(a.id),
    }))
  );
});

// Tambah rekening
app.post('/api/accounts', (req, res) => {
  const { name, initialBalance, kind } = req.body ?? {};
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Nama rekening wajib diisi' });
  }
  const init = Number(initialBalance) || 0;
  const k = ['cash', 'bank', 'ewallet'].includes(kind) ? kind : 'bank';
  const result = db
    .prepare('INSERT INTO accounts (name, initial_balance, kind) VALUES (?, ?, ?)')
    .run(String(name).trim(), init, k);
  const a = db.prepare('SELECT * FROM accounts WHERE id = ?').get(Number(result.lastInsertRowid));
  res.status(201).json({ ...a, balance: init });
});

// Hapus rekening (soft delete → recycle bin; transaksi tetap tertaut untuk pemulihan)
app.delete('/api/accounts/:id', (req, res) => {
  const id = req.params.id;
  const now = "datetime('now', 'localtime')";
  const result = db
    .prepare(`UPDATE accounts SET deleted_at = ${now} WHERE id = ? AND deleted_at IS NULL`)
    .run(id);
  if (Number(result.changes) === 0) {
    return res.status(404).json({ error: 'Rekening tidak ditemukan' });
  }
  db.prepare(
    `UPDATE transfers SET deleted_at = ${now} WHERE (from_account_id = ? OR to_account_id = ?) AND deleted_at IS NULL`
  ).run(id, id);
  res.json({ ok: true });
});

// Riwayat transfer
app.get('/api/transfers', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, fa.name AS from_name, ta.name AS to_name
       FROM transfers t
       LEFT JOIN accounts fa ON fa.id = t.from_account_id
       LEFT JOIN accounts ta ON ta.id = t.to_account_id
       WHERE t.deleted_at IS NULL
       ORDER BY t.date DESC, t.id DESC`
    )
    .all();
  res.json(rows);
});

// Transfer antar rekening
app.post('/api/transfers', (req, res) => {
  const { fromId, toId, amount, note, date } = req.body ?? {};
  const value = Number(amount);
  if (!fromId || !toId) {
    return res.status(400).json({ error: 'Rekening asal dan tujuan wajib diisi' });
  }
  if (String(fromId) === String(toId)) {
    return res.status(400).json({ error: 'Rekening asal dan tujuan tidak boleh sama' });
  }
  if (Number.isNaN(value) || value <= 0) {
    return res.status(400).json({ error: 'Nominal harus lebih dari 0' });
  }
  const result = db
    .prepare(
      'INSERT INTO transfers (from_account_id, to_account_id, amount, note, date) VALUES (?, ?, ?, ?, ?)'
    )
    .run(fromId, toId, value, note || '', date || new Date().toISOString().slice(0, 10));
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

// Perbarui transfer
app.put('/api/transfers/:id', (req, res) => {
  const { fromId, toId, amount, note, date } = req.body ?? {};
  const value = Number(amount);
  if (!fromId || !toId) {
    return res.status(400).json({ error: 'Rekening asal dan tujuan wajib diisi' });
  }
  if (String(fromId) === String(toId)) {
    return res.status(400).json({ error: 'Rekening asal dan tujuan tidak boleh sama' });
  }
  if (Number.isNaN(value) || value <= 0) {
    return res.status(400).json({ error: 'Nominal harus lebih dari 0' });
  }
  const result = db
    .prepare(
      'UPDATE transfers SET from_account_id = ?, to_account_id = ?, amount = ?, note = ?, date = ? WHERE id = ? AND deleted_at IS NULL'
    )
    .run(fromId, toId, value, note || '', date || new Date().toISOString().slice(0, 10), req.params.id);
  if (Number(result.changes) === 0) {
    return res.status(404).json({ error: 'Transfer tidak ditemukan' });
  }
  res.json({ id: Number(req.params.id) });
});

// Hapus transfer (soft delete → recycle bin)
app.delete('/api/transfers/:id', (req, res) => {
  const result = db
    .prepare("UPDATE transfers SET deleted_at = datetime('now', 'localtime') WHERE id = ? AND deleted_at IS NULL")
    .run(req.params.id);
  if (Number(result.changes) === 0) {
    return res.status(404).json({ error: 'Transfer tidak ditemukan' });
  }
  res.json({ ok: true });
});

// Daftar transaksi berulang (sekaligus proses yang jatuh tempo)
app.get('/api/recurring', (req, res) => {
  processRecurring();
  const rows = db
    .prepare(
      `SELECT r.*, a.name AS account_name
       FROM recurring r
       LEFT JOIN accounts a ON a.id = r.account_id
       WHERE r.deleted_at IS NULL
       ORDER BY r.active DESC, r.next_date`
    )
    .all();
  res.json(rows);
});

// Tambah transaksi berulang
app.post('/api/recurring', (req, res) => {
  const { type, amount, category, description, accountId, frequency, nextDate } = req.body ?? {};
  const value = Number(amount);
  if (!type || !['income', 'expense'].includes(type)) {
    return res.status(400).json({ error: 'type harus income atau expense' });
  }
  if (!nextDate || Number.isNaN(value) || value <= 0) {
    return res.status(400).json({ error: 'Nominal dan tanggal berikutnya wajib diisi' });
  }
  const freq = ['daily', 'weekly', 'monthly'].includes(frequency) ? frequency : 'monthly';
  const result = db
    .prepare(
      'INSERT INTO recurring (type, amount, category, description, account_id, frequency, next_date) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(type, value, category || '', description || '', accountId || null, freq, nextDate);
  res.status(201).json({ id: Number(result.lastInsertRowid) });
});

// Aktifkan / nonaktifkan transaksi berulang
app.put('/api/recurring/:id', (req, res) => {
  const { active } = req.body ?? {};
  const result = db
    .prepare('UPDATE recurring SET active = ? WHERE id = ? AND deleted_at IS NULL')
    .run(active ? 1 : 0, req.params.id);
  if (Number(result.changes) === 0) {
    return res.status(404).json({ error: 'Transaksi berulang tidak ditemukan' });
  }
  res.json({ ok: true });
});

// Hapus transaksi berulang (soft delete → recycle bin)
app.delete('/api/recurring/:id', (req, res) => {
  const result = db
    .prepare("UPDATE recurring SET deleted_at = datetime('now', 'localtime') WHERE id = ? AND deleted_at IS NULL")
    .run(req.params.id);
  if (Number(result.changes) === 0) {
    return res.status(404).json({ error: 'Transaksi berulang tidak ditemukan' });
  }
  res.json({ ok: true });
});

// Hapus transaksi (soft delete → masuk recycle bin)
app.delete('/api/transactions/:id', (req, res) => {
  const result = db
    .prepare("UPDATE transactions SET deleted_at = datetime('now', 'localtime') WHERE id = ? AND deleted_at IS NULL")
    .run(req.params.id);
  if (Number(result.changes) === 0) {
    return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
  }
  res.json({ ok: true });
});

// Hapus permanen rekening beserta transfer terkaitnya
function hardDeleteAccount(id) {
  db.prepare('UPDATE transactions SET account_id = NULL WHERE account_id = ?').run(id);
  db.prepare('DELETE FROM transfers WHERE from_account_id = ? OR to_account_id = ?').run(id, id);
  db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
}

// Bersihkan item recycle bin yang sudah lebih dari 30 hari
function purgeExpiredTrash() {
  const cutoff = "datetime('now', 'localtime', '-30 days')";
  db.prepare(`DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`).run();
  db.prepare(`DELETE FROM recurring WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`).run();
  db.prepare(`DELETE FROM transfers WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`).run();
  const accounts = db
    .prepare(`SELECT id FROM accounts WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`)
    .all();
  for (const a of accounts) hardDeleteAccount(a.id);
}

// Recycle bin: daftar semua item terhapus (transaksi, berulang, transfer, rekening)
app.get('/api/trash', (req, res) => {
  purgeExpiredTrash();
  const transactions = db
    .prepare(
      `SELECT t.id, 'transaction' AS entity, t.type, t.amount, t.category, t.description, t.date,
              t.deleted_at, a.name AS account_name
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.deleted_at IS NOT NULL`
    )
    .all();
  const recurring = db
    .prepare(
      `SELECT r.id, 'recurring' AS entity, r.type, r.amount, r.category, r.description,
              r.frequency, r.next_date AS date, r.deleted_at
       FROM recurring r
       WHERE r.deleted_at IS NOT NULL`
    )
    .all();
  const transfers = db
    .prepare(
      `SELECT t.id, 'transfer' AS entity, t.amount, t.note AS description, t.date, t.deleted_at,
              fa.name AS from_name, ta.name AS to_name
       FROM transfers t
       LEFT JOIN accounts fa ON fa.id = t.from_account_id
       LEFT JOIN accounts ta ON ta.id = t.to_account_id
       WHERE t.deleted_at IS NOT NULL`
    )
    .all();
  const accounts = db
    .prepare(
      `SELECT a.id, 'account' AS entity, a.name, a.kind, a.initial_balance, a.deleted_at
       FROM accounts a
       WHERE a.deleted_at IS NOT NULL`
    )
    .all();
  const items = [...transactions, ...recurring, ...transfers, ...accounts].sort((a, b) =>
    String(b.deleted_at).localeCompare(String(a.deleted_at))
  );
  res.json(items);
});

// Pulihkan item dari recycle bin
app.post('/api/trash/:entity/:id/restore', (req, res) => {
  const { entity, id } = req.params;
  if (entity === 'account') {
    const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
    if (!account) {
      return res.status(404).json({ error: 'Item tidak ditemukan di recycle bin' });
    }
    const deletedAt = account.deleted_at;
    db.prepare('UPDATE accounts SET deleted_at = NULL WHERE id = ?').run(id);
    if (deletedAt) {
      db.prepare(
        'UPDATE transfers SET deleted_at = NULL WHERE (from_account_id = ? OR to_account_id = ?) AND deleted_at = ?'
      ).run(id, id, deletedAt);
    }
    return res.json({ ok: true });
  }
  const table =
    entity === 'transaction' ? 'transactions' : entity === 'recurring' ? 'recurring' : entity === 'transfer' ? 'transfers' : null;
  if (!table) {
    return res.status(400).json({ error: 'Entitas tidak dikenal' });
  }
  const result = db.prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).run(id);
  if (Number(result.changes) === 0) {
    return res.status(404).json({ error: 'Item tidak ditemukan di recycle bin' });
  }
  res.json({ ok: true });
});

// Hapus permanen satu item dari recycle bin
app.delete('/api/trash/:entity/:id', (req, res) => {
  const { entity, id } = req.params;
  if (entity === 'account') {
    const account = db
      .prepare('SELECT id FROM accounts WHERE id = ? AND deleted_at IS NOT NULL')
      .get(id);
    if (!account) {
      return res.status(404).json({ error: 'Item tidak ditemukan di recycle bin' });
    }
    hardDeleteAccount(account.id);
    return res.json({ ok: true });
  }
  const table =
    entity === 'transaction' ? 'transactions' : entity === 'recurring' ? 'recurring' : entity === 'transfer' ? 'transfers' : null;
  if (!table) {
    return res.status(400).json({ error: 'Entitas tidak dikenal' });
  }
  const result = db.prepare(`DELETE FROM ${table} WHERE id = ? AND deleted_at IS NOT NULL`).run(id);
  if (Number(result.changes) === 0) {
    return res.status(404).json({ error: 'Item tidak ditemukan di recycle bin' });
  }
  res.json({ ok: true });
});

// Kosongkan recycle bin (hapus permanen semua)
app.delete('/api/trash', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE deleted_at IS NOT NULL').run();
  db.prepare('DELETE FROM recurring WHERE deleted_at IS NOT NULL').run();
  db.prepare('DELETE FROM transfers WHERE deleted_at IS NOT NULL').run();
  const accounts = db.prepare('SELECT id FROM accounts WHERE deleted_at IS NOT NULL').all();
  for (const a of accounts) hardDeleteAccount(a.id);
  res.json({ ok: true });
});

// Backup: export seluruh data sebagai JSON
app.get('/api/backup', (req, res) => {
  res.json({
    app: 'finance-tracker',
    exportedAt: new Date().toISOString(),
    transactions: db.prepare('SELECT * FROM transactions WHERE deleted_at IS NULL ORDER BY id').all(),
    categories: db.prepare('SELECT * FROM categories ORDER BY id').all(),
    settings: db.prepare('SELECT * FROM settings').all(),
    categoryBudgets: db.prepare('SELECT * FROM category_budgets ORDER BY category').all(),
    accounts: db.prepare('SELECT * FROM accounts WHERE deleted_at IS NULL ORDER BY id').all(),
    transfers: db.prepare('SELECT * FROM transfers WHERE deleted_at IS NULL ORDER BY id').all(),
    recurring: db.prepare('SELECT * FROM recurring WHERE deleted_at IS NULL ORDER BY id').all(),
  });
});

// Restore: impor seluruh data dari file backup JSON
app.post('/api/restore', (req, res) => {
  const d = req.body ?? {};
  const required = ['transactions', 'categories', 'settings', 'categoryBudgets', 'accounts', 'transfers'];
  if (!required.every((t) => Array.isArray(d[t]))) {
    return res.status(400).json({ error: 'Format file backup tidak valid' });
  }
  const recurring = Array.isArray(d.recurring) ? d.recurring : [];
  try {
    db.exec('BEGIN');
    for (const t of ['transfers', 'transactions', 'recurring', 'category_budgets', 'categories', 'accounts', 'settings']) {
      db.prepare(`DELETE FROM ${t}`).run();
    }
    const insAccount = db.prepare('INSERT INTO accounts (id, name, initial_balance, kind) VALUES (?, ?, ?, ?)');
    for (const a of d.accounts) insAccount.run(a.id, a.name, Number(a.initial_balance) || 0, a.kind || 'bank');
    const insTx = db.prepare(
      'INSERT INTO transactions (id, type, amount, category, description, date, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const t of d.transactions) {
      insTx.run(t.id, t.type, Number(t.amount) || 0, t.category || '', t.description || '', t.date, t.account_id ?? null);
    }
    const insTransfer = db.prepare(
      'INSERT INTO transfers (id, from_account_id, to_account_id, amount, note, date) VALUES (?, ?, ?, ?, ?, ?)'
    );
    for (const t of d.transfers) {
      insTransfer.run(t.id, t.from_account_id, t.to_account_id, Number(t.amount) || 0, t.note || '', t.date);
    }
    const insRecurring = db.prepare(
      'INSERT INTO recurring (id, type, amount, category, description, account_id, frequency, next_date, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    for (const r of recurring) {
      insRecurring.run(
        r.id,
        r.type,
        Number(r.amount) || 0,
        r.category || '',
        r.description || '',
        r.account_id ?? null,
        r.frequency || 'monthly',
        r.next_date,
        r.active ? 1 : 0
      );
    }
    const insCat = db.prepare('INSERT INTO categories (id, type, name) VALUES (?, ?, ?)');
    for (const c of d.categories) insCat.run(c.id, c.type, c.name);
    const insCb = db.prepare('INSERT INTO category_budgets (category, amount) VALUES (?, ?)');
    for (const b of d.categoryBudgets) insCb.run(b.category, Number(b.amount) || 0);
    const insSet = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    for (const s of d.settings) insSet.run(s.key, String(s.value));
    db.exec('COMMIT');
    res.json({ ok: true });
  } catch (err) {
    db.exec('ROLLBACK');
    res.status(500).json({ error: `Gagal restore: ${err.message}` });
  }
});

// Laporan pengeluaran per kategori per bulan
app.get('/api/reports/category-monthly', (req, res) => {
  const rows = db
    .prepare(
      `SELECT
        strftime('%Y-%m', date) AS month,
        COALESCE(NULLIF(category, ''), 'Tanpa kategori') AS category,
        SUM(amount) AS total
       FROM transactions
       WHERE type = 'expense' AND deleted_at IS NULL
       GROUP BY month, category
       ORDER BY month, category`
    )
    .all();
  res.json(rows);
});

// Ringkasan: total pemasukan, pengeluaran, saldo, dan rincian per bulan
app.get('/api/summary', (req, res) => {
  const totals = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
      FROM transactions
      WHERE deleted_at IS NULL`
    )
    .get();

  const monthly = db
    .prepare(
      `SELECT
        strftime('%Y-%m', date) AS month,
        SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
        SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
      FROM transactions
      WHERE deleted_at IS NULL
      GROUP BY month
      ORDER BY month`
    )
    .all();

  const monthExpense = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM transactions
       WHERE type = 'expense' AND deleted_at IS NULL AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')`
    )
    .get().total;

  const budget = Number(getSetting('monthly_budget', '0')) || 0;

  const categoryBudgets = db
    .prepare('SELECT category, amount FROM category_budgets ORDER BY category')
    .all();

  const categoryExpenses = db
    .prepare(
      `SELECT COALESCE(NULLIF(category, ''), 'Tanpa kategori') AS category, SUM(amount) AS total
       FROM transactions
       WHERE type = 'expense' AND deleted_at IS NULL AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')
       GROUP BY category`
    )
    .all();

  // Statistik tambahan
  const daysElapsed =
    Number(db.prepare("SELECT CAST(strftime('%d', 'now', 'localtime') AS INTEGER) AS d").get().d) || 1;
  const avgDailyExpense = monthExpense / daysElapsed;

  const largestTransaction =
    db
      .prepare(
        `SELECT amount, category, description, date, type
         FROM transactions
         WHERE deleted_at IS NULL AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')
         ORDER BY amount DESC
         LIMIT 1`
      )
      .get() || null;

  const trend = db
    .prepare(
      `SELECT
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime') AND type = 'expense' THEN amount ELSE 0 END), 0) AS current,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime', '-1 month') AND type = 'expense' THEN amount ELSE 0 END), 0) AS last
      FROM transactions
      WHERE deleted_at IS NULL`
    )
    .get();

  // Tren saldo kumulatif dari waktu ke waktu (harian)
  const dailyDelta = db
    .prepare(
      `SELECT date, SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS delta
       FROM transactions
       WHERE deleted_at IS NULL
       GROUP BY date
       ORDER BY date`
    )
    .all();
  let runningBalance = 0;
  const balanceTrend = dailyDelta.map((r) => {
    runningBalance += Number(r.delta);
    return { date: r.date, balance: runningBalance };
  });

  const savingsGoal = Number(getSetting('savings_goal', '0')) || 0;

  res.json({
    income: totals.income,
    expense: totals.expense,
    balance: totals.income - totals.expense,
    monthExpense,
    budget,
    savingsGoal,
    categoryBudgets,
    categoryExpenses,
    monthly,
    balanceTrend,
    stats: {
      avgDailyExpense,
      daysElapsed,
      largestTransaction,
      trend: { current: trend.current, last: trend.last },
    },
  });
});

// Backup otomatis file database secara berkala (keamanan data lokal)
const BACKUP_DIR = join(__dirname, 'backups');
const MAX_BACKUPS = 14;

function backupTimestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function backupDatabaseFile() {
  try {
    db.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
    if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
    const dest = join(BACKUP_DIR, `finance-${backupTimestamp()}.db`);
    copyFileSync(dbPath, dest);
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith('.db'))
      .map((f) => ({ name: f, mtime: statSync(join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const extra of files.slice(MAX_BACKUPS)) {
      try {
        unlinkSync(join(BACKUP_DIR, extra.name));
      } catch {}
    }
  } catch (err) {
    console.error('⚠️ Gagal membuat backup otomatis:', err.message);
  }
}

const PORT = process.env.PORT || 3001;
processRecurring();
backupDatabaseFile();
setInterval(backupDatabaseFile, 6 * 60 * 60 * 1000);
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
