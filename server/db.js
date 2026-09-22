import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath = join(__dirname, 'finance.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
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

export { db, dbPath };
