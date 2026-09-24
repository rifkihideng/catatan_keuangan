// Modul autentikasi: hashing password, token sesi, dan pembatas percobaan login.
// Hanya memakai modul bawaan Node (node:crypto) supaya tidak menambah dependensi.
import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { db } from './db.js';

const SCRYPT_KEYLEN = 64;
// Durasi sesi bawaan (jam): "ingat saya" 30 hari, sesi biasa 12 jam.
const SESSION_LONG_HOURS = 30 * 24;
const SESSION_SHORT_HOURS = 12;
const MAX_EMAIL_LENGTH = 254;
const MAX_NAME_LENGTH = 80;
export const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

// --- Password -------------------------------------------------------------

// Format tersimpan: scrypt$<salt hex>$<hash hex>
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  if (!/^[0-9a-f]+$/.test(hash) || !/^[0-9a-f]+$/.test(salt)) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Dipakai saat email tidak ditemukan: tetap jalankan scrypt agar waktu respons
// tidak membocorkan apakah sebuah email terdaftar atau tidak.
const DUMMY_HASH = hashPassword(randomBytes(24).toString('hex'));
export function burnTime() {
  verifyPassword('tidak-akan-cocok', DUMMY_HASH);
  return false;
}

// --- Token sesi -----------------------------------------------------------

// Token asli hanya dikirim ke klien; DB menyimpan hash SHA-256-nya sehingga
// kebocoran file database tidak langsung memberi akses akun.
export function createToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function sessionExpirySql(hours) {
  return `datetime('now', 'localtime', '+${Number(hours) || SESSION_SHORT_HOURS} hours')`;
}

export function sessionHours({ remember = false } = {}) {
  const longHours = Number(process.env.SESSION_HOURS) || SESSION_LONG_HOURS;
  const shortHours = Number(process.env.SESSION_SHORT_HOURS) || SESSION_SHORT_HOURS;
  return remember ? longHours : shortHours;
}

// --- Validasi input -------------------------------------------------------

export function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function validateCredentials({ email, name, password }, { requireName = false } = {}) {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return { error: 'Email wajib diisi' };
  if (cleanEmail.length > MAX_EMAIL_LENGTH) return { error: 'Email terlalu panjang' };
  // Pola sederhana: satu @, ada bagian sebelum/sesudah, dan ada titik di domain.
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(cleanEmail)) {
    return { error: 'Format email tidak valid' };
  }

  const cleanName = String(name ?? '').trim();
  if (requireName && !cleanName) return { error: 'Nama wajib diisi' };
  if (cleanName.length > MAX_NAME_LENGTH) return { error: 'Nama terlalu panjang (maksimal 80 karakter)' };

  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    return { error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) return { error: 'Password terlalu panjang' };

  return { email: cleanEmail, name: cleanName, password };
}

// --- Pembatas percobaan (rate limit) --------------------------------------

const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

// Batas jumlah percobaan per kunci dalam satu jendela waktu.
export function tooManyAttempts(key, max = MAX_ATTEMPTS) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= max;
}

export function recordFailedAttempt(key, windowMs = WINDOW_MS) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
  }
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (now > v.resetAt) attempts.delete(k);
  }
}

export function clearAttempts(key) {
  attempts.delete(key);
}

// Kunci pembatas: gabungan IP dan email agar satu penyerang tidak bisa
// mengunci akun orang lain hanya dengan menebak emailnya.
export function attemptKey(req, email = '') {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `${ip}|${normalizeEmail(email)}`;
}

// --- Token sekali pakai (reset password, verifikasi email, kode login OAuth) --
// Sama seperti sesi: yang disimpan di database hanya hash-nya.

export const RESET_MINUTES = Number(process.env.RESET_TOKEN_MINUTES) || 60;
export const VERIFY_HOURS = Number(process.env.VERIFY_TOKEN_HOURS) || 24;
export const OAUTH_CODE_MINUTES = 5;

export const PURPOSE = {
  resetPassword: 'reset_password',
  verifyEmail: 'verify_email',
  oauthLogin: 'oauth_login',
};

function expirySql(minutes) {
  return `datetime('now', 'localtime', '+${Number(minutes)} minutes')`;
}

// Terbitkan token baru; token lama untuk tujuan yang sama dibatalkan.
export function issueAuthToken(userId, purpose, minutes) {
  const { token, tokenHash } = createToken();
  db.prepare("DELETE FROM auth_tokens WHERE expires_at <= datetime('now', 'localtime')").run();
  db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND purpose = ?').run(userId, purpose);
  db.prepare(
    `INSERT INTO auth_tokens (token_hash, user_id, purpose, expires_at) VALUES (?, ?, ?, ${expirySql(minutes)})`
  ).run(tokenHash, userId, purpose);
  return token;
}

// Cek token tanpa memakainya (mis. untuk menampilkan form di klien).
export function peekAuthToken(token, purpose) {
  if (!token) return null;
  return (
    db
      .prepare(
        `SELECT t.user_id, u.email, u.name
         FROM auth_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ? AND t.purpose = ? AND t.used_at IS NULL
           AND t.expires_at > datetime('now', 'localtime')`
      )
      .get(hashToken(token), purpose) || null
  );
}

// Pakai token: sekali pakai, langsung ditandai terpakai. Mengembalikan user_id.
export function consumeAuthToken(token, purpose) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT user_id FROM auth_tokens
       WHERE token_hash = ? AND purpose = ? AND used_at IS NULL
         AND expires_at > datetime('now', 'localtime')`
    )
    .get(tokenHash, purpose);
  if (!row) return null;
  db.prepare("UPDATE auth_tokens SET used_at = datetime('now', 'localtime') WHERE token_hash = ?").run(
    tokenHash
  );
  return row.user_id;
}

// --- GitHub OAuth (opsional; login dibatasi pada anggota organisasi) -------

const GITHUB_AUTH_ENDPOINT = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_ENDPOINT = 'https://github.com/login/oauth/access_token';
const GITHUB_API_ENDPOINT = 'https://api.github.com';
const GITHUB_STATE_TTL_MS = 10 * 60 * 1000;

// Header standar untuk panggilan API GitHub (v3).
const GITHUB_API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'finance-tracker',
};

export function githubConfigured() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

// Daftar organisasi yang diizinkan (pisahkan dengan koma), sudah di-lowercase.
export function githubAllowedOrgs() {
  return String(process.env.GITHUB_ORG || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

// state disimpan di memori server (aplikasi ini berjalan satu proses).
const githubStates = new Map();

export function createGithubAuthUrl(redirectUri) {
  const state = randomBytes(16).toString('base64url');

  const now = Date.now();
  for (const [key, value] of githubStates) if (value.expiresAt <= now) githubStates.delete(key);
  githubStates.set(state, { expiresAt: now + GITHUB_STATE_TTL_MS });

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: redirectUri,
    // read:org dibutuhkan untuk melihat keanggotaan organisasi privat.
    scope: 'read:user user:email read:org',
    state,
  });
  return `${GITHUB_AUTH_ENDPOINT}?${params}`;
}

export function consumeGithubState(state) {
  const key = String(state || '');
  const entry = githubStates.get(key);
  if (!entry) return null;
  githubStates.delete(key);
  return entry.expiresAt > Date.now() ? entry : null;
}

// Tukar authorization code → akses token → profil + keanggotaan organisasi.
export async function fetchGithubProfile({ code, redirectUri }) {
  const tokenRes = await fetch(GITHUB_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: String(code),
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      redirect_uri: redirectUri,
    }),
  });
  const tokenData = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenData.access_token) {
    throw new Error(tokenData.error_description || tokenData.error || 'Gagal menukar kode GitHub');
  }

  const auth = { Authorization: `Bearer ${tokenData.access_token}` };
  const [profileRes, emailsRes, orgsRes] = await Promise.all([
    fetch(`${GITHUB_API_ENDPOINT}/user`, { headers: { ...auth, ...GITHUB_API_HEADERS } }),
    fetch(`${GITHUB_API_ENDPOINT}/user/emails`, { headers: { ...auth, ...GITHUB_API_HEADERS } }),
    fetch(`${GITHUB_API_ENDPOINT}/user/orgs?per_page=100`, {
      headers: { ...auth, ...GITHUB_API_HEADERS },
    }),
  ]);

  const profile = await profileRes.json().catch(() => ({}));
  const emails = await emailsRes.json().catch(() => []);
  const orgs = await orgsRes.json().catch(() => []);

  if (!profileRes.ok || !profile.login) throw new Error('Gagal mengambil profil GitHub');

  // Email: pakai email publik profil; kalau kosong cari email utama yang terverifikasi.
  let email = profile.email;
  if (!email && Array.isArray(emails)) {
    const primary = emails.find((e) => e.primary && e.verified) || emails.find((e) => e.verified);
    email = primary?.email || '';
  }
  // Cadangan: alamat noreply GitHub supaya tetap punya email unik.
  if (!email) email = `${profile.login}@users.noreply.github.com`;

  const memberOrgs = Array.isArray(orgs)
    ? orgs.map((o) => String(o.login || '').toLowerCase())
    : [];
  const allowed = githubAllowedOrgs();
  // Bila GITHUB_ORG tidak diisi, keanggotaan tidak dibatasi.
  const orgAllowed = allowed.length === 0 || allowed.some((org) => memberOrgs.includes(org));

  return {
    email: normalizeEmail(email),
    name: String(profile.name || profile.login || '').trim().slice(0, MAX_NAME_LENGTH),
    login: String(profile.login || ''),
    memberOrgs,
    orgAllowed,
  };
}

// --- URL publik ------------------------------------------------------------

function requestOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

// Alamat SERVER ini — dipakai sebagai redirect_uri OAuth (harus persis sama
// dengan yang didaftarkan pada penyedia OAuth, mis. GitHub).
export function serverUrl(req, path = '') {
  const base = process.env.PUBLIC_URL || requestOrigin(req);
  return `${String(base).replace(/\/+$/, '')}${path}`;
}

// Alamat APLIKASI (frontend) — dipakai untuk tautan di email dan redirect
// setelah login OAuth. Pada deployment terpisah (client di Vercel, API di
// host lain) isi APP_URL dengan alamat frontend.
export function publicUrl(req, path = '') {
  const base = process.env.APP_URL || process.env.PUBLIC_URL || requestOrigin(req);
  return `${String(base).replace(/\/+$/, '')}${path}`;
}
