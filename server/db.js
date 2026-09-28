// Koneksi database: Turso (libsql).
// Kredensial dibaca dari environment variable TURSO_DATABASE_URL dan
// TURSO_AUTH_TOKEN (lihat .env.example). Turso memakai SQLite di sisi server,
// jadi sintaks SQL yang dipakai tetap SQLite.
import { createClient } from '@libsql/client';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error(
    '❌ Turso belum dikonfigurasi. Isi TURSO_DATABASE_URL dan TURSO_AUTH_TOKEN di server/.env'
  );
  process.exit(1);
}

const client = createClient({ url, authToken });

// ---------------------------------------------------------------------------
// Skema idempoten. Karena database Turso baru dibuat kosong, tabel langsung
// dibuat dalam bentuk final (sudah berisi user_id + deleted_at), tanpa
// migrasi bertahap dari skema lama.
// ---------------------------------------------------------------------------

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    password_hash TEXT NOT NULL,
    email_verified_at TEXT,
    two_factor_enabled INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`,

  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    expires_at TEXT NOT NULL,
    user_agent TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,

  `CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    initial_balance REAL NOT NULL DEFAULT 0,
    kind TEXT,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id)`,

  `CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount REAL NOT NULL,
    category TEXT,
    description TEXT,
    date TEXT NOT NULL,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tx_deleted ON transactions(deleted_at)`,

  `CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    name TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, type, name)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id)`,

  `CREATE TABLE IF NOT EXISTS settings (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (user_id, key)
  )`,

  `CREATE TABLE IF NOT EXISTS category_budgets (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    PRIMARY KEY (user_id, category)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_category_budgets_user ON category_budgets(user_id)`,

  `CREATE TABLE IF NOT EXISTS transfers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    to_account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount REAL NOT NULL,
    note TEXT,
    date TEXT NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_transfers_user ON transfers(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trf_from ON transfers(from_account_id)`,
  `CREATE INDEX IF NOT EXISTS idx_trf_to ON transfers(to_account_id)`,

  `CREATE TABLE IF NOT EXISTS recurring (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount REAL NOT NULL,
    category TEXT,
    description TEXT,
    account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('daily', 'weekly', 'monthly')),
    next_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    deleted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring(user_id)`,

  `CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('reset_password', 'verify_email', 'oauth_login', 'two_factor', 'two_factor_pending', 'two_factor_setup')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    expires_at TEXT NOT NULL,
    used_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, purpose)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at)`,

  `CREATE TABLE IF NOT EXISTS auth_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    event TEXT NOT NULL,
    detail TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_auth_events_created ON auth_events(created_at)`,
];

for (const sql of SCHEMA) {
  await client.execute(sql);
}

// Migrasi basis data lama: tambah kolom 2FA bila belum ada.
try {
  await client.execute(
    `ALTER TABLE users ADD COLUMN two_factor_enabled INTEGER NOT NULL DEFAULT 0`
  );
} catch {
  // Kolom sudah ada — abaikan.
}

// Migrasi basis data lama: tabel auth_tokens hanya mengizinkan 3 purpose.
// Perluas CHECK-nya agar purpose verifikasi 2 langkah bisa dipakai.
const authTokensSql = String(
  (
    await client.execute(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'auth_tokens'"
    )
  ).rows?.[0]?.sql || ''
);
if (authTokensSql && !authTokensSql.includes('two_factor')) {
  try {
    await client.batch(
      [
        `CREATE TABLE auth_tokens_new (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          purpose TEXT NOT NULL CHECK (purpose IN ('reset_password','verify_email','oauth_login','two_factor','two_factor_pending','two_factor_setup')),
          created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
          expires_at TEXT NOT NULL,
          used_at TEXT
        )`,
        'INSERT INTO auth_tokens_new SELECT token_hash, user_id, purpose, created_at, expires_at, used_at FROM auth_tokens',
        'DROP TABLE auth_tokens',
        'ALTER TABLE auth_tokens_new RENAME TO auth_tokens',
        'CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, purpose)',
        'CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at)',
      ],
      'write'
    );
    console.log('✅ Migrasi auth_tokens untuk 2FA selesai.');
  } catch (e) {
    console.error('⚠️ Gagal memigrasi auth_tokens:', e.message);
  }
}

// ---------------------------------------------------------------------------
// Lapisan antarmuka async yang dipakai seluruh server. Bentuknya menyerupai
// node:sqlite (prepare().get/all/run) supaya perubahan kode di file lain
// seminimal mungkin — hanya perlu ditambah `await` + handler `async`.
// ---------------------------------------------------------------------------

export const db = {
  // Jalankan satu pernyataan; kembalikan { rows, rowsAffected, lastInsertRowid }.
  async execute(sql, args = []) {
    const r = await client.execute({ sql, args });
    return {
      rows: r.rows,
      rowsAffected: Number(r.rowsAffected),
      lastInsertRowid: Number(r.lastInsertRowid),
    };
  },

  // prepare(sql) → { get, all, run } (semuanya async).
  prepare(sql) {
    return {
      async get(...args) {
        const r = await client.execute({ sql, args });
        return r.rows[0];
      },
      async all(...args) {
        const r = await client.execute({ sql, args });
        return r.rows;
      },
      async run(...args) {
        const r = await client.execute({ sql, args });
        return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.rowsAffected) };
      },
    };
  },

  // Jalankan pernyataan tunggal (dipakai untuk DDL). Transaksi tidak lagi
  // memakai BEGIN/COMMIT — gunakan db.batch untuk operasi atomik.
  async exec(sql, args = []) {
    const r = await client.execute({ sql, args });
    return r;
  },

  // Transaksi atomik: semua pernyataan dijalankan all-or-nothing.
  // statements: [{ sql, args }]
  async batch(statements) {
    return client.batch(statements, 'write');
  },
};

// ---------------------------------------------------------------------------
// Migrasi data lama & data awal pengguna baru.
// ---------------------------------------------------------------------------

const USER_SCOPED_TABLES = [
  'accounts',
  'categories',
  'settings',
  'category_budgets',
  'transactions',
  'transfers',
  'recurring',
];

// Apakah masih ada data lama yang belum punya pemilik? (Tidak terjadi pada
// database Turso baru; disimpan untuk kompatibilitas alur registrasi.)
export async function hasLegacyData() {
  for (const t of USER_SCOPED_TABLES) {
    const r = await client.execute({
      sql: `SELECT COUNT(*) AS c FROM ${t} WHERE user_id IS NULL`,
    });
    if (Number(r.rows[0]?.c) > 0) return true;
  }
  return false;
}

// Pindahkan seluruh data lama (user_id NULL) ke pengguna pertama yang mendaftar.
export async function adoptLegacyData(userId) {
  await client.batch(
    USER_SCOPED_TABLES.map((table) => ({
      sql: `UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`,
      args: [userId],
    })),
    'write'
  );
}

// Data awal untuk pengguna baru (kategori & rekening bawaan).
export async function seedUserDefaults(userId) {
  const statements = [];
  const insertCategorySql = 'INSERT INTO categories (type, name, user_id) VALUES (?, ?, ?)';
  for (const name of ['Gaji', 'Bonus', 'Investasi', 'Lainnya']) {
    statements.push({ sql: insertCategorySql, args: ['income', name, userId] });
  }
  for (const name of ['Makanan', 'Transport', 'Tagihan', 'Belanja', 'Hiburan', 'Lainnya']) {
    statements.push({ sql: insertCategorySql, args: ['expense', name, userId] });
  }
  const insertAccountSql = 'INSERT INTO accounts (name, initial_balance, kind, user_id) VALUES (?, 0, ?, ?)';
  statements.push({ sql: insertAccountSql, args: ['Tunai', 'cash', userId] });
  statements.push({ sql: insertAccountSql, args: ['Bank', 'bank', userId] });
  statements.push({ sql: insertAccountSql, args: ['E-Wallet', 'ewallet', userId] });
  await client.batch(statements, 'write');
}
