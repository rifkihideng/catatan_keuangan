import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Lokasi database bisa diatur lewat FINANCE_DB_PATH (mis. volume persisten di
// hosting, atau database terpisah saat pengujian).
const dbPath = process.env.FINANCE_DB_PATH
  ? resolve(process.env.FINANCE_DB_PATH)
  : join(__dirname, 'finance.db');
// Pastikan folder database ada (mis. /var/data pada disk persisten Render).
mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Tabel akun pengguna & sesi login (multi-user).
// Password disimpan sebagai hash scrypt (lihat auth.js), token sesi disimpan dalam bentuk hash.
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    expires_at TEXT NOT NULL,
    user_agent TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount REAL NOT NULL,
    category TEXT,
    description TEXT,
    date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    name TEXT NOT NULL,
    UNIQUE (type, name)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS category_budgets (
    category TEXT PRIMARY KEY,
    amount REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    initial_balance REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_account_id INTEGER NOT NULL,
    to_account_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    note TEXT,
    date TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS recurring (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount REAL NOT NULL,
    category TEXT,
    description TEXT,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    next_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1
  );
`);

// Tambah kolom account_id pada transaksi jika belum ada
const txColumns = db.prepare('PRAGMA table_info(transactions)').all();
if (!txColumns.some((c) => c.name === 'account_id')) {
  db.exec('ALTER TABLE transactions ADD COLUMN account_id INTEGER');
}

// Tambah kolom kind pada rekening jika belum ada (cash/bank/ewallet)
const accColumns = db.prepare('PRAGMA table_info(accounts)').all();
if (!accColumns.some((c) => c.name === 'kind')) {
  db.exec('ALTER TABLE accounts ADD COLUMN kind TEXT');
  db.prepare("UPDATE accounts SET kind = 'cash' WHERE name = 'Tunai'").run();
  db.prepare("UPDATE accounts SET kind = 'ewallet' WHERE name = 'E-Wallet'").run();
  db.prepare("UPDATE accounts SET kind = 'bank' WHERE kind IS NULL").run();
}

// Tambahkan foreign key pada transactions.account_id (jika belum ada)
const txFks = db.prepare('PRAGMA foreign_key_list(transactions)').all();
if (txFks.length === 0) {
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec(`
    BEGIN;
    CREATE TABLE transactions_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      amount REAL NOT NULL,
      category TEXT,
      description TEXT,
      date TEXT NOT NULL,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL
    );
    INSERT INTO transactions_new (id, type, amount, category, description, date, account_id)
      SELECT id, type, amount, category, description, date, account_id FROM transactions;
    DROP TABLE transactions;
    ALTER TABLE transactions_new RENAME TO transactions;
    COMMIT;
  `);
  db.exec('PRAGMA foreign_keys = ON;');
}

// Tambahkan foreign key pada transfers (jika belum ada)
const trfFks = db.prepare('PRAGMA foreign_key_list(transfers)').all();
if (trfFks.length === 0) {
  db.exec('PRAGMA foreign_keys = OFF;');
  db.exec(`
    BEGIN;
    CREATE TABLE transfers_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      to_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      amount REAL NOT NULL,
      note TEXT,
      date TEXT NOT NULL
    );
    INSERT INTO transfers_new (id, from_account_id, to_account_id, amount, note, date)
      SELECT id, from_account_id, to_account_id, amount, note, date FROM transfers;
    DROP TABLE transfers;
    ALTER TABLE transfers_new RENAME TO transfers;
    COMMIT;
  `);
  db.exec('PRAGMA foreign_keys = ON;');
}

// Index untuk mempercepat query
const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all();
const indexNames = new Set(indexes.map((i) => i.name));
if (!indexNames.has('idx_tx_date')) {
  db.exec('CREATE INDEX idx_tx_date ON transactions(date)');
}
if (!indexNames.has('idx_tx_account')) {
  db.exec('CREATE INDEX idx_tx_account ON transactions(account_id)');
}
if (!indexNames.has('idx_trf_from')) {
  db.exec('CREATE INDEX idx_trf_from ON transfers(from_account_id)');
}
if (!indexNames.has('idx_trf_to')) {
  db.exec('CREATE INDEX idx_trf_to ON transfers(to_account_id)');
}

// Isi kategori default jika masih kosong
const categoryCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
if (categoryCount === 0) {
  const insert = db.prepare('INSERT INTO categories (type, name) VALUES (?, ?)');
  for (const name of ['Gaji', 'Bonus', 'Investasi', 'Lainnya']) insert.run('income', name);
  for (const name of ['Makanan', 'Transport', 'Tagihan', 'Belanja', 'Hiburan', 'Lainnya']) {
    insert.run('expense', name);
  }
}

// Isi rekening default jika masih kosong
const accountCount = db.prepare('SELECT COUNT(*) AS c FROM accounts').get().c;
if (accountCount === 0) {
  const insertAccount = db.prepare(
    'INSERT INTO accounts (name, initial_balance, kind) VALUES (?, 0, ?)'
  );
  insertAccount.run('Tunai', 'cash');
  insertAccount.run('Bank', 'bank');
  insertAccount.run('E-Wallet', 'ewallet');
}

// Kolom deleted_at untuk recycle bin (soft delete transaksi)
const txDeletedCols = db.prepare('PRAGMA table_info(transactions)').all();
if (!txDeletedCols.some((c) => c.name === 'deleted_at')) {
  db.exec('ALTER TABLE transactions ADD COLUMN deleted_at TEXT');
}
const delIdx = db
  .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_tx_deleted'")
  .get();
if (!delIdx) {
  db.exec('CREATE INDEX idx_tx_deleted ON transactions(deleted_at)');
}

// Kolom deleted_at untuk recycle bin pada tabel lain (rekening, transfer, berulang)
for (const table of ['accounts', 'transfers', 'recurring']) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === 'deleted_at')) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at TEXT`);
  }
}

// ---------------------------------------------------------------------------
// Migrasi multi-user: setiap baris data dimiliki satu pengguna (user_id).
// Baris lama dibiarkan NULL dan diadopsi oleh pengguna pertama yang mendaftar
// (lihat adoptLegacyData), sehingga data yang sudah ada tidak hilang.
// ---------------------------------------------------------------------------

function hasColumn(table, column) {
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((c) => c.name === column);
}

function addUserColumn(table) {
  if (!hasColumn(table, 'user_id')) {
    // ALTER TABLE ... ADD COLUMN dengan REFERENCES sah selama default-nya NULL.
    db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER REFERENCES users(id) ON DELETE CASCADE`);
  }
}

// Tabel yang butuh user_id langsung bisa ditambah kolomnya.
for (const table of ['transactions', 'accounts', 'transfers', 'recurring']) {
  addUserColumn(table);
}

// Tabel dengan UNIQUE / PRIMARY KEY harus dibangun ulang agar batasannya
// berlaku per pengguna (UNIQUE(user_id, ...)), bukan global.
function rebuildTable(table, createSql, columns) {
  db.exec('PRAGMA foreign_keys = OFF;');
  try {
    db.exec('BEGIN');
    db.exec(createSql);
    db.exec(
      `INSERT INTO ${table}_new (${columns.join(', ')}) SELECT ${columns.join(', ')} FROM ${table}`
    );
    db.exec(`DROP TABLE ${table}`);
    db.exec(`ALTER TABLE ${table}_new RENAME TO ${table}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    db.exec('PRAGMA foreign_keys = ON;');
  }
}

// categories: UNIQUE(type, name) → UNIQUE(user_id, type, name)
if (!hasColumn('categories', 'user_id')) {
  rebuildTable(
    'categories',
    `CREATE TABLE categories_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
      name TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, type, name)
    )`,
    ['id', 'type', 'name']
  );
}

// settings: PRIMARY KEY(key) → PRIMARY KEY(user_id, key)
if (!hasColumn('settings', 'user_id')) {
  rebuildTable(
    'settings',
    `CREATE TABLE settings_new (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )`,
    ['key', 'value']
  );
}

// category_budgets: PRIMARY KEY(category) → PRIMARY KEY(user_id, category)
if (!hasColumn('category_budgets', 'user_id')) {
  rebuildTable(
    'category_budgets',
    `CREATE TABLE category_budgets_new (
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      PRIMARY KEY (user_id, category)
    )`,
    ['category', 'amount']
  );
}

// Index per pengguna supaya query terfilter tetap cepat saat data bertambah
for (const table of [
  'transactions',
  'categories',
  'accounts',
  'transfers',
  'recurring',
  'category_budgets',
]) {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_${table}_user ON ${table}(user_id)`);
}

// Tabel kanonik yang ikut diadopsi pengguna pertama
const USER_SCOPED_TABLES = [
  'accounts',
  'categories',
  'settings',
  'category_budgets',
  'transactions',
  'transfers',
  'recurring',
];

// Apakah masih ada data lama yang belum punya pemilik?
export function hasLegacyData() {
  return USER_SCOPED_TABLES.some(
    (t) => Number(db.prepare(`SELECT COUNT(*) AS c FROM ${t} WHERE user_id IS NULL`).get().c) > 0
  );
}

// Pindahkan seluruh data lama (user_id NULL) ke pengguna pertama yang mendaftar.
export function adoptLegacyData(userId) {
  db.exec('BEGIN');
  try {
    for (const table of USER_SCOPED_TABLES) {
      db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(userId);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Data awal untuk pengguna baru (kategori & rekening bawaan).
export function seedUserDefaults(userId) {
  db.exec('BEGIN');
  try {
    const insertCategory = db.prepare(
      'INSERT INTO categories (type, name, user_id) VALUES (?, ?, ?)'
    );
    for (const name of ['Gaji', 'Bonus', 'Investasi', 'Lainnya']) {
      insertCategory.run('income', name, userId);
    }
    for (const name of ['Makanan', 'Transport', 'Tagihan', 'Belanja', 'Hiburan', 'Lainnya']) {
      insertCategory.run('expense', name, userId);
    }
    const insertAccount = db.prepare(
      'INSERT INTO accounts (name, initial_balance, kind, user_id) VALUES (?, 0, ?, ?)'
    );
    insertAccount.run('Tunai', 'cash', userId);
    insertAccount.run('Bank', 'bank', userId);
    insertAccount.run('E-Wallet', 'ewallet', userId);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Verifikasi email & token sekali pakai (reset password, verifikasi email,
// kode login OAuth).
// ---------------------------------------------------------------------------

if (!hasColumn('users', 'email_verified_at')) {
  db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');
  // Akun yang sudah ada sebelum fitur verifikasi dianggap sudah terverifikasi.
  db.prepare("UPDATE users SET email_verified_at = datetime('now', 'localtime')").run();
}

db.exec(`
  CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('reset_password', 'verify_email', 'oauth_login')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    expires_at TEXT NOT NULL,
    used_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, purpose);
  CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
`);

export { db, dbPath };
