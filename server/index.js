import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { db, hasLegacyData, adoptLegacyData, seedUserDefaults } from './db.js';
import {
  hashPassword,
  verifyPassword,
  burnTime,
  createToken,
  hashToken,
  normalizeEmail,
  validateCredentials,
  tooManyAttempts,
  recordFailedAttempt,
  clearAttempts,
  attemptKey,
  sessionExpirySql,
  sessionHours,
  issueAuthToken,
  peekAuthToken,
  consumeAuthToken,
  PURPOSE,
  RESET_MINUTES,
  VERIFY_HOURS,
  OAUTH_CODE_MINUTES,
  githubConfigured,
  createGithubAuthUrl,
  consumeGithubState,
  fetchGithubProfile,
  publicUrl,
  serverUrl,
  MIN_PASSWORD_LENGTH,
} from './auth.js';
import {
  sendEmail,
  emailConfigured,
  resetPasswordEmail,
  verifyEmailEmail,
  appName,
} from './email.js';

const app = express();
// Di belakang reverse proxy (mis. Vercel/Render) set TRUST_PROXY=1 agar IP asli
// terbaca oleh pembatas percobaan login.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);
}
// Security headers (CSP, X-Frame-Options, X-Content-Type-Options, dll).
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS: hanya izinkan origin yang dikenal (frontend sendiri). Daftar dari
// CORS_ORIGIN (pisahkan koma) atau APP_URL; fallback localhost untuk dev.
const allowedOrigins = new Set(
  String(process.env.CORS_ORIGIN || process.env.APP_URL || 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);
app.use(
  cors({
    origin(origin, cb) {
      // Permintaan tanpa Origin (curl, server-to-server) tetap diizinkan.
      if (!origin || allowedOrigins.has(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
  })
);

// Respons API tidak boleh di-cache: mencegah browser/CDN menyajikan header CORS
// atau data lama (mis. ACAO wildcard dari versi sebelumnya) setelah redeploy.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Limit dinaikkan dari default 100kb agar import CSV & restore backup JSON besar tidak gagal 413
app.use(express.json({ limit: '5mb' }));
app.use(cookieParser());

// Pembungkus handler async agar pengecualian diteruskan ke error handler JSON
// (Express 4 tidak menangkap Promise rejection secara otomatis).
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ===========================================================================
// AUTENTIKASI & SESI
// Semua endpoint di bawah /api (kecuali /api/auth/* dan /api/health) wajib
// menyertakan header  Authorization: Bearer <token>.
// ===========================================================================

// Pendaftaran terbuka bisa dimatikan dengan ALLOW_SIGNUP=0 (mis. mode undangan).
const ALLOW_SIGNUP = process.env.ALLOW_SIGNUP !== '0';

// Verifikasi email diwajibkan (REQUIRE_EMAIL_VERIFICATION=1) — otomatis
// dimatikan bila pengiriman email belum dikonfigurasi, supaya pengguna tidak
// terkunci di luar aplikasi.
const REQUIRE_EMAIL_VERIFICATION =
  process.env.REQUIRE_EMAIL_VERIFICATION === '1' && emailConfigured();
// Tanpa penyedia email, verifikasi tidak mungkin dilakukan → anggap terverifikasi.
const AUTO_VERIFY_EMAILS = !emailConfigured() && !REQUIRE_EMAIL_VERIFICATION;
if (process.env.REQUIRE_EMAIL_VERIFICATION === '1' && !emailConfigured()) {
  console.warn(
    '⚠️  REQUIRE_EMAIL_VERIFICATION=1 diabaikan karena RESEND_API_KEY belum diisi.'
  );
}

// --- Cookie sesi (httpOnly) -------------------------------------------------
// Token sesi dikirim lewat cookie httpOnly sehingga tidak bisa dibaca JavaScript
// (mengurangi risiko pencurian token lewat XSS). Di produksi lintas-domain
// (frontend & backend beda host) gunakan SameSite=None + Secure.
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME || 'session';
const COOKIE_SECURE = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE !== '0'
  : String(process.env.PUBLIC_URL || '').startsWith('https://');
const COOKIE_SAME_SITE = process.env.COOKIE_SAME_SITE || (COOKIE_SECURE ? 'none' : 'lax');

function setSessionCookie(res, token, remember = false) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    maxAge: sessionHours({ remember }) * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAME_SITE,
    path: '/',
  });
}

// Batas permintaan tautan reset: 5 kali per jam per IP+email.
const FORGOT_LIMIT_MAX = 5;
const FORGOT_LIMIT_WINDOW_MS = 60 * 60 * 1000;

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name || '',
    emailVerified: Boolean(row.email_verified_at),
  };
}

// Catat kejadian keamanan (login, logout, ganti password, dsb) ke tabel auth_events.
// Kegagalan mencatat tidak boleh menggagalkan permintaan utama.
async function logEvent(userId, event, req, detail = null) {
  try {
    await db
      .prepare(
        'INSERT INTO auth_events (user_id, event, detail, ip, user_agent) VALUES (?, ?, ?, ?, ?)'
      )
      .run(
        userId ?? null,
        event,
        detail ? String(detail).slice(0, 300) : null,
        req.ip || null,
        String(req.headers['user-agent'] || '').slice(0, 200)
      );
  } catch (err) {
    console.error('⚠️ Gagal mencatat audit log:', err.message);
  }
}

async function createSession(userId, req, remember = false) {
  const { token, tokenHash } = createToken();
  await db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent)
       VALUES (?, ?, ${sessionExpirySql(sessionHours({ remember }))}, ?)`
    )
    .run(tokenHash, userId, String(req.headers['user-agent'] || '').slice(0, 200));
  return token;
}

function bearerToken(req) {
  const cookieToken = req.cookies?.[SESSION_COOKIE];
  if (cookieToken) return String(cookieToken);
  const match = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
  return match ? match[1].trim() : '';
}

// Pasang req.userId / req.user, atau balas 401.
const requireAuth = asyncHandler(async (req, res, next) => {
  const token = bearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Silakan masuk terlebih dahulu' });
  }
  const tokenHash = hashToken(token);
  const row = await db
    .prepare(
      `SELECT s.token_hash, u.id, u.email, u.name, u.email_verified_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > datetime('now', 'localtime')`
    )
    .get(tokenHash);
  if (!row) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return res.status(401).json({ error: 'Sesi berakhir, silakan masuk kembali' });
  }
  req.userId = row.id;
  req.user = publicUser(row);
  req.tokenHash = row.token_hash;

  // Gerbang verifikasi email: endpoint /api/auth/* tetap boleh diakses agar
  // pengguna bisa mengirim ulang tautan konfirmasi.
  if (REQUIRE_EMAIL_VERIFICATION && !req.user.emailVerified && !req.path.startsWith('/auth/')) {
    return res.status(403).json({
      error: 'Konfirmasi alamat email kamu dulu sebelum memakai aplikasi',
      code: 'email_unverified',
    });
  }
  next();
});

// Pemeriksaan sederhana untuk monitoring/uptime (tanpa autentikasi).
app.get('/api/health', (req, res) => {
  res.json({ ok: true, signup: ALLOW_SIGNUP });
});

// Halaman root API — supaya kunjungan langsung ke URL backend tidak 404.
app.get('/', (req, res) => {
  res.json({
    ok: true,
    app: 'Catatan Keuangan API',
    health: '/api/health',
  });
});

// Kirim tautan konfirmasi email. Kegagalan pengiriman tidak menggagalkan
// permintaan — pengguna bisa minta ulang dari dalam aplikasi.
async function sendVerificationEmail(req, user) {
  if (AUTO_VERIFY_EMAILS) return { sent: false, reason: 'auto_verified' };
  const token = await issueAuthToken(user.id, PURPOSE.verifyEmail, VERIFY_HOURS * 60);
  const mail = verifyEmailEmail({
    url: publicUrl(req, `/?verify=${token}`),
    expiresHours: VERIFY_HOURS,
  });
  try {
    const result = await sendEmail({ to: user.email, ...mail });
    return { sent: true, mode: result.mode };
  } catch (err) {
    console.error('❌ Gagal mengirim email verifikasi:', err.message);
    return { sent: false, reason: 'send_failed' };
  }
}

// Daftar akun baru
app.post(
  '/api/auth/register',
  asyncHandler(async (req, res) => {
    if (!ALLOW_SIGNUP) {
      return res.status(403).json({ error: 'Pendaftaran akun baru sedang ditutup' });
    }
    const key = attemptKey(req);
    if (await tooManyAttempts(key)) {
      return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi nanti.' });
    }
    const parsed = validateCredentials(req.body ?? {}, { requireName: true });
    if (parsed.error) {
      await recordFailedAttempt(key);
      return res.status(400).json({ error: parsed.error });
    }

    let userId;
    try {
      const result = await db
        .prepare(
          `INSERT INTO users (email, name, password_hash, email_verified_at)
           VALUES (?, ?, ?, ${AUTO_VERIFY_EMAILS ? "datetime('now', 'localtime')" : 'NULL'})`
        )
        .run(parsed.email, parsed.name, hashPassword(parsed.password));
      userId = Number(result.lastInsertRowid);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Email sudah terdaftar' });
      }
      throw err;
    }

    // Akun pertama mewarisi data sebelum aplikasi multi-user; akun berikutnya
    // mendapat kategori & rekening bawaan sendiri.
    if (await hasLegacyData()) {
      await adoptLegacyData(userId);
    } else {
      await seedUserDefaults(userId);
    }

    await clearAttempts(key);
    await logEvent(userId, 'register', req);
    const token = await createSession(userId, req, true);
    setSessionCookie(res, token, true);
    const verification = await sendVerificationEmail(req, { id: userId, email: parsed.email });
    res.status(201).json({
      user: {
        id: userId,
        email: parsed.email,
        name: parsed.name,
        emailVerified: AUTO_VERIFY_EMAILS,
      },
      verificationSent: Boolean(verification.sent),
      emailConfigured: emailConfigured(),
    });
  })
);

// Masuk
app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const { email, password, remember } = req.body ?? {};
    const key = attemptKey(req, email);
    if (await tooManyAttempts(key)) {
      return res
        .status(429)
        .json({ error: 'Terlalu banyak percobaan masuk. Coba lagi dalam 15 menit.' });
    }
    const cleanEmail = normalizeEmail(email);
    const user = cleanEmail
      ? await db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail)
      : null;
    // burnTime() menjaga waktu respons tetap serupa saat email tidak terdaftar.
    const ok = user ? verifyPassword(String(password ?? ''), user.password_hash) : burnTime();
    if (!ok) {
      await recordFailedAttempt(key);
      await logEvent(null, 'login_failed', req, cleanEmail);
      return res.status(401).json({ error: 'Email atau password salah' });
    }
    await clearAttempts(key);
    await db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now', 'localtime')").run();
    const token = await createSession(user.id, req, remember === true);
    setSessionCookie(res, token, remember === true);
    await logEvent(user.id, 'login', req);
    res.json({ user: publicUser(user) });
  })
);

// Profil pengguna yang sedang masuk
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// Keluar (token yang dipakai langsung dicabut)
app.post(
  '/api/auth/logout',
  requireAuth,
  asyncHandler(async (req, res) => {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(req.tokenHash);
    await logEvent(req.userId, 'logout', req);
    clearSessionCookie(res);
    res.json({ ok: true });
  })
);

// Ganti password; sesi lain dicabut agar perangkat yang hilang tidak ikut masuk.
app.put(
  '/api/auth/password',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
    if (!user || !verifyPassword(String(currentPassword ?? ''), user.password_hash)) {
      return res.status(400).json({ error: 'Password saat ini salah' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ error: `Password baru minimal ${MIN_PASSWORD_LENGTH} karakter` });
    }
    await db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(newPassword), req.userId);
    await db
      .prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?')
      .run(req.userId, req.tokenHash);
    await logEvent(req.userId, 'password_changed', req);
    res.json({ ok: true });
  })
);

// Konfigurasi publik untuk layar masuk (dibaca klien sebelum ada sesi)
app.get('/api/auth/config', (req, res) => {
  res.json({
    siteName: appName(),
    signup: ALLOW_SIGNUP,
    github: githubConfigured(),
    email: emailConfigured(),
    requireVerification: REQUIRE_EMAIL_VERIFICATION,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    sessionHours: {
      short: sessionHours({ remember: false }),
      long: sessionHours({ remember: true }),
    },
  });
});

// --- Lupa password & verifikasi email ---------------------------------------

// Minta tautan reset. Balasannya selalu sama supaya keberadaan sebuah akun
// tidak bisa ditebak dari respons (anti user-enumeration).
app.post(
  '/api/auth/forgot-password',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) {
      return res.status(400).json({ error: 'Email wajib diisi' });
    }
    const key = `forgot|${attemptKey(req, email)}`;
    if (await tooManyAttempts(key, FORGOT_LIMIT_MAX, FORGOT_LIMIT_WINDOW_MS)) {
      return res
        .status(429)
        .json({ error: 'Terlalu banyak permintaan tautan reset. Coba lagi nanti.' });
    }
    await recordFailedAttempt(key, FORGOT_LIMIT_WINDOW_MS);
    await logEvent(null, 'forgot_password', req, email);

    const user = await db.prepare('SELECT id, email FROM users WHERE email = ?').get(email);
    if (user) {
      const token = await issueAuthToken(user.id, PURPOSE.resetPassword, RESET_MINUTES);
      const mail = resetPasswordEmail({
        url: publicUrl(req, `/?reset=${token}`),
        expiresMinutes: RESET_MINUTES,
      });
      try {
        await sendEmail({ to: user.email, ...mail });
      } catch (err) {
        // Jangan bongkar ke klien; cukup catat di log server.
        console.error('❌ Gagal mengirim email reset:', err.message);
      }
    }
    res.json({ ok: true, emailConfigured: emailConfigured() });
  })
);

// Cek tautan reset sebelum menampilkan form password baru
app.get(
  '/api/auth/reset-password/:token',
  asyncHandler(async (req, res) => {
    const row = await peekAuthToken(req.params.token, PURPOSE.resetPassword);
    if (!row) {
      return res.status(400).json({ error: 'Tautan reset tidak berlaku atau sudah dipakai' });
    }
    res.json({ valid: true, email: row.email, name: row.name || '' });
  })
);

// Simpan password baru dari tautan reset
app.post(
  '/api/auth/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = req.body ?? {};
    // Diintip dulu: kalau password baru tidak memenuhi syarat, token tidak hangus.
    const target = await peekAuthToken(token, PURPOSE.resetPassword);
    if (!target) {
      return res.status(400).json({ error: 'Tautan reset tidak berlaku atau sudah dipakai' });
    }
    if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
      return res
        .status(400)
        .json({ error: `Password minimal ${MIN_PASSWORD_LENGTH} karakter` });
    }
    const userId = await consumeAuthToken(token, PURPOSE.resetPassword);
    if (!userId) {
      return res.status(400).json({ error: 'Tautan reset tidak berlaku atau sudah dipakai' });
    }
    await db
      .prepare(
        `UPDATE users
         SET password_hash = ?, email_verified_at = COALESCE(email_verified_at, datetime('now', 'localtime'))
         WHERE id = ?`
      )
      .run(hashPassword(password), userId);
    // Membuka tautan reset membuktikan kepemilikan email → sekaligus terverifikasi.
    // Semua sesi lama dicabut karena password sudah berganti.
    await db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
    res.json({ ok: true, email: target.email });
  })
);

// Konfirmasi email lewat tautan
app.post(
  '/api/auth/verify-email',
  asyncHandler(async (req, res) => {
    const userId = await consumeAuthToken(req.body?.token, PURPOSE.verifyEmail);
    if (!userId) {
      return res.status(400).json({ error: 'Tautan konfirmasi tidak berlaku atau sudah dipakai' });
    }
    await db
      .prepare(
        "UPDATE users SET email_verified_at = COALESCE(email_verified_at, datetime('now', 'localtime')) WHERE id = ?"
      )
      .run(userId);
    const user = await db
      .prepare('SELECT id, email, name, email_verified_at FROM users WHERE id = ?')
      .get(userId);
    res.json({ ok: true, user: publicUser(user) });
  })
);

// --- Login dengan GitHub (opsional; dibatasi pada anggota GITHUB_ORG) ------

// Password untuk akun yang hanya masuk lewat GitHub: bukan hash scrypt yang
// sah sehingga tidak bisa dipakai untuk login password biasa.
const OAUTH_ONLY_PASSWORD_GITHUB = 'oauth-github';

app.get('/api/auth/github/start', (req, res) => {
  if (!githubConfigured()) {
    return res.status(404).json({ error: 'Login GitHub belum dikonfigurasi di server' });
  }
  res.redirect(createGithubAuthUrl(serverUrl(req, '/api/auth/github/callback')));
});

app.get(
  '/api/auth/github/callback',
  asyncHandler(async (req, res) => {
    const clientUrl = publicUrl(req, '/');
    const fail = (reason) => res.redirect(`${clientUrl}?authError=${reason}`);
    if (!githubConfigured()) return fail('github_tidak_aktif');
    if (req.query.error) return fail('github_ditolak');

    const state = consumeGithubState(req.query.state);
    if (!state || !req.query.code) return fail('github_state_tidak_valid');

    try {
      const profile = await fetchGithubProfile({
        code: req.query.code,
        redirectUri: serverUrl(req, '/api/auth/github/callback'),
      });
      if (!profile.orgAllowed) {
        console.warn(
          `⛔ Login GitHub ditolak: @${profile.login} bukan anggota organisasi yang diizinkan.`
        );
        return fail('github_tidak_anggota');
      }
      if (!profile.email) return fail('github_gagal');

      let user = await db.prepare('SELECT * FROM users WHERE email = ?').get(profile.email);
      if (!user) {
        const result = await db
          .prepare(
            `INSERT INTO users (email, name, password_hash, email_verified_at)
             VALUES (?, ?, ?, datetime('now', 'localtime'))`
          )
          .run(profile.email, profile.name, OAUTH_ONLY_PASSWORD_GITHUB);
        const userId = Number(result.lastInsertRowid);
        if (await hasLegacyData()) await adoptLegacyData(userId);
        else await seedUserDefaults(userId);
        user = await db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      } else if (!user.email_verified_at) {
        // Email dari GitHub sudah terverifikasi GitHub.
        await db
          .prepare("UPDATE users SET email_verified_at = datetime('now', 'localtime') WHERE id = ?")
          .run(user.id);
      }

      // Kode sekali pakai supaya token sesi tidak pernah muncul di URL/tombol back.
      const code = await issueAuthToken(user.id, PURPOSE.oauthLogin, OAUTH_CODE_MINUTES);
      return res.redirect(`${clientUrl}?github_code=${encodeURIComponent(code)}`);
    } catch (err) {
      console.error('❌ Login GitHub gagal:', err.message);
      return fail('github_gagal');
    }
  })
);

// Tukar kode sekali pakai dari callback GitHub menjadi sesi
app.post(
  '/api/auth/github/exchange',
  asyncHandler(async (req, res) => {
    const userId = await consumeAuthToken(req.body?.code, PURPOSE.oauthLogin);
    if (!userId) {
      return res
        .status(400)
        .json({ error: 'Kode login GitHub tidak berlaku, silakan coba lagi' });
    }
    const user = await db
      .prepare('SELECT id, email, name, email_verified_at FROM users WHERE id = ?')
      .get(userId);
    if (!user) {
      return res.status(400).json({ error: 'Akun tidak ditemukan' });
    }
    const token = await createSession(user.id, req, true);
    setSessionCookie(res, token, true);
    res.json({ user: publicUser(user) });
  })
);

// Batas autentikasi: semua endpoint data di bawah ini butuh token yang sah.
app.use('/api', requireAuth);

// Batas permintaan umum untuk endpoint data: mencegah penarikan data massal
// bila sebuah token bocor. Diatur lewat env API_RATE_MAX & API_RATE_WINDOW_MINUTES.
const API_RATE_MAX = Number(process.env.API_RATE_MAX) || 300;
const API_RATE_WINDOW_MS = (Number(process.env.API_RATE_WINDOW_MINUTES) || 5) * 60 * 1000;
const apiRateLimit = asyncHandler(async (req, res, next) => {
  const key = `api|${req.userId}`;
  if (await tooManyAttempts(key, API_RATE_MAX, API_RATE_WINDOW_MS)) {
    return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
  }
  await recordFailedAttempt(key, API_RATE_WINDOW_MS);
  next();
});
app.use('/api', apiRateLimit);

// Riwayat kejadian keamanan milik pengguna ini (login, logout, ganti password).
app.get(
  '/api/security/events',
  asyncHandler(async (req, res) => {
    const rows = await db
      .prepare(
        `SELECT id, event, detail, ip, user_agent, created_at
         FROM auth_events
         WHERE user_id = ? OR detail = ?
         ORDER BY id DESC LIMIT 100`
      )
      .all(req.userId, req.user.email);
    res.json(rows);
  })
);

// Kirim ulang tautan konfirmasi email (butuh sesi yang sah)
app.post(
  '/api/auth/resend-verification',
  asyncHandler(async (req, res) => {
    const user = await db
      .prepare('SELECT id, email, name, email_verified_at FROM users WHERE id = ?')
      .get(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'Akun tidak ditemukan' });
    }
    if (user.email_verified_at || AUTO_VERIFY_EMAILS) {
      return res.json({ ok: true, alreadyVerified: true });
    }
    const key = `verify|${attemptKey(req, user.email)}`;
    if (await tooManyAttempts(key, FORGOT_LIMIT_MAX, FORGOT_LIMIT_WINDOW_MS)) {
      return res.status(429).json({ error: 'Terlalu banyak permintaan. Coba lagi nanti.' });
    }
    await recordFailedAttempt(key, FORGOT_LIMIT_WINDOW_MS);
    const result = await sendVerificationEmail(req, user);
    res.json({
      ok: true,
      alreadyVerified: false,
      sent: Boolean(result.sent),
      emailConfigured: emailConfigured(),
    });
  })
);

// Helper pengaturan (settings) — per pengguna
async function getSetting(userId, key, fallback = '0') {
  const row = await db
    .prepare('SELECT value FROM settings WHERE user_id = ? AND key = ?')
    .get(userId, key);
  return row ? row.value : fallback;
}

async function setSetting(userId, key, value) {
  await db
    .prepare(
      `INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
    )
    .run(userId, key, String(value));
}

// Validasi tanggal ISO (YYYY-MM-DD) sekaligus memastikan tanggalnya nyata (mis. 2026-02-30 ditolak)
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// Nominal wajib angka berhingga dan lebih dari 0 (menolak negatif, NaN, dan teks)
function parseAmount(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Normalisasi accountId: kosong → null, id valid milik pengguna → number,
// tidak valid / milik pengguna lain → undefined
async function normalizeAccountId(userId, accountId) {
  if (accountId === null || accountId === undefined || accountId === '') return null;
  const id = Number(accountId);
  if (!Number.isInteger(id) || id <= 0) return undefined;
  return (await db.prepare('SELECT 1 FROM accounts WHERE id = ? AND user_id = ?').get(id, userId))
    ? id
    : undefined;
}

async function getTransaction(userId, id) {
  return db
    .prepare(
      `SELECT t.*, a.name AS account_name
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.id = ? AND t.user_id = ?`
    )
    .get(id, userId);
}

async function accountBalance(userId, accountId) {
  const row = await db
    .prepare(
      `SELECT
        COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = ? AND user_id = ? AND type = 'income' AND deleted_at IS NULL), 0) AS income,
        COALESCE((SELECT SUM(amount) FROM transactions WHERE account_id = ? AND user_id = ? AND type = 'expense' AND deleted_at IS NULL), 0) AS expense,
        COALESCE((SELECT SUM(amount) FROM transfers WHERE from_account_id = ? AND user_id = ? AND deleted_at IS NULL), 0) AS out_amt,
        COALESCE((SELECT SUM(amount) FROM transfers WHERE to_account_id = ? AND user_id = ? AND deleted_at IS NULL), 0) AS in_amt`
    )
    .get(accountId, userId, accountId, userId, accountId, userId, accountId, userId);
  return row.income - row.expense + row.in_amt - row.out_amt;
}

// Buat transaksi dari transaksi berulang yang sudah jatuh tempo (semua pengguna)
async function processRecurring() {
  const advance = { daily: '+1 day', weekly: '+7 days', monthly: '+1 month' };
  const insertSql =
    'INSERT INTO transactions (type, amount, category, description, date, account_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
  let guard = 0;
  while (guard < 100) {
    const due = await db
      .prepare(
        "SELECT * FROM recurring WHERE active = 1 AND deleted_at IS NULL AND next_date <= date('now','localtime') ORDER BY id LIMIT 1"
      )
      .get();
    if (!due) break;
    await db.batch([
      {
        sql: insertSql,
        args: [
          due.type,
          due.amount,
          due.category || '',
          due.description || '',
          due.next_date,
          due.account_id ?? null,
          due.user_id ?? null,
        ],
      },
      {
        sql: 'UPDATE recurring SET next_date = date(next_date, ?) WHERE id = ?',
        args: [advance[due.frequency] || '+1 month', due.id],
      },
    ]);
    guard++;
  }
}

// Ambil semua transaksi (bisa filter per bulan: ?month=YYYY-MM, atau rentang tanggal: ?from=&to=)
app.get(
  '/api/transactions',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { month, from, to } = req.query;
    const base =
      'SELECT t.*, a.name AS account_name FROM transactions t LEFT JOIN accounts a ON a.id = t.account_id WHERE t.deleted_at IS NULL AND t.user_id = ?';
    if (month) {
      const rows = await db
        .prepare(`${base} AND strftime('%Y-%m', t.date) = ? ORDER BY t.date DESC, t.id DESC`)
        .all(userId, month);
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
      const rows = await db
        .prepare(`${base} AND ${clauses.join(' AND ')} ORDER BY t.date DESC, t.id DESC`)
        .all(userId, ...params);
      return res.json(rows);
    }
    const rows = await db.prepare(`${base} ORDER BY t.date DESC, t.id DESC`).all(userId);
    res.json(rows);
  })
);

// Tambah transaksi baru
app.post(
  '/api/transactions',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { type, amount, category, description, date, accountId } = req.body ?? {};
    if (!type || amount === undefined || amount === null || amount === '' || !date) {
      return res.status(400).json({ error: 'type, amount, dan date wajib diisi' });
    }
    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'type harus income atau expense' });
    }
    const value = parseAmount(amount);
    if (value === null) {
      return res.status(400).json({ error: 'Nominal harus angka lebih dari 0' });
    }
    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Tanggal harus format YYYY-MM-DD' });
    }
    const accId = await normalizeAccountId(userId, accountId);
    if (accId === undefined) {
      return res.status(400).json({ error: 'Rekening tidak ditemukan' });
    }

    const result = await db
      .prepare(
        'INSERT INTO transactions (type, amount, category, description, date, account_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .run(type, value, category || '', description || '', date, accId, userId);

    res.status(201).json(await getTransaction(userId, Number(result.lastInsertRowid)));
  })
);

// Import banyak transaksi (dari CSV)
app.post(
  '/api/transactions/import',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const items = req.body?.transactions;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Data transaksi tidak valid' });
    }
    const insertSql =
      'INSERT INTO transactions (type, amount, category, description, date, account_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)';
    const statements = [];
    for (const t of items) {
      const { type, amount, category, description, date, accountId } = t ?? {};
      const value = parseAmount(amount);
      if (!type || !['income', 'expense'].includes(type)) continue;
      if (value === null || !isValidDate(date)) continue;
      const accId = await normalizeAccountId(userId, accountId);
      statements.push({
        sql: insertSql,
        args: [type, value, category || '', description || '', date, accId ?? null, userId],
      });
    }
    if (statements.length === 0) {
      return res.json({ imported: 0 });
    }
    try {
      await db.batch(statements);
    } catch (err) {
      return res.status(500).json({ error: `Gagal import: ${err.message}` });
    }
    res.json({ imported: statements.length });
  })
);

// Perbarui transaksi
app.put(
  '/api/transactions/:id',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { type, amount, category, description, date, accountId } = req.body ?? {};
    if (!type || amount === undefined || amount === null || amount === '' || !date) {
      return res.status(400).json({ error: 'type, amount, dan date wajib diisi' });
    }
    if (!['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'type harus income atau expense' });
    }
    const value = parseAmount(amount);
    if (value === null) {
      return res.status(400).json({ error: 'Nominal harus angka lebih dari 0' });
    }
    if (!isValidDate(date)) {
      return res.status(400).json({ error: 'Tanggal harus format YYYY-MM-DD' });
    }
    const accId = await normalizeAccountId(userId, accountId);
    if (accId === undefined) {
      return res.status(400).json({ error: 'Rekening tidak ditemukan' });
    }

    const result = await db
      .prepare(
        'UPDATE transactions SET type = ?, amount = ?, category = ?, description = ?, date = ?, account_id = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
      .run(type, value, category || '', description || '', date, accId, req.params.id, userId);

    if (Number(result.changes) === 0) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    }
    res.json(await getTransaction(userId, req.params.id));
  })
);

// Daftar kategori (custom)
app.get(
  '/api/categories',
  asyncHandler(async (req, res) => {
    const rows = await db
      .prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY type, id')
      .all(req.userId);
    res.json({
      income: rows.filter((r) => r.type === 'income').map((r) => r.name),
      expense: rows.filter((r) => r.type === 'expense').map((r) => r.name),
    });
  })
);

// Tambah kategori baru
app.post(
  '/api/categories',
  asyncHandler(async (req, res) => {
    const { type, name } = req.body ?? {};
    if (!type || !['income', 'expense'].includes(type) || !name || !String(name).trim()) {
      return res.status(400).json({ error: 'type dan name wajib diisi' });
    }
    const trimmed = String(name).trim();
    try {
      const result = await db
        .prepare('INSERT INTO categories (type, name, user_id) VALUES (?, ?, ?)')
        .run(type, trimmed, req.userId);
      res.status(201).json({ id: Number(result.lastInsertRowid), type, name: trimmed });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Kategori sudah ada' });
      }
      throw err;
    }
  })
);

// Ganti nama kategori (termasuk semua transaksi yang memakainya)
app.put(
  '/api/categories/:id',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { name } = req.body ?? {};
    const trimmed = String(name ?? '').trim();
    if (!trimmed) {
      return res.status(400).json({ error: 'Nama kategori wajib diisi' });
    }
    const cat = await db
      .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId);
    if (!cat) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    }
    if (cat.name === trimmed) {
      return res.json({ id: cat.id, type: cat.type, name: trimmed });
    }
    try {
      await db.batch([
        { sql: 'UPDATE categories SET name = ? WHERE id = ?', args: [trimmed, cat.id] },
        {
          sql: 'UPDATE transactions SET category = ? WHERE category = ? AND user_id = ?',
          args: [trimmed, cat.name, userId],
        },
        {
          sql: 'UPDATE recurring SET category = ? WHERE category = ? AND user_id = ?',
          args: [trimmed, cat.name, userId],
        },
        {
          sql: 'UPDATE category_budgets SET category = ? WHERE category = ? AND user_id = ?',
          args: [trimmed, cat.name, userId],
        },
      ]);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Kategori sudah ada' });
      }
      throw err;
    }
    res.json({ id: cat.id, type: cat.type, name: trimmed });
  })
);

// Daftar kategori lengkap dengan id (untuk kelola kategori)
app.get(
  '/api/categories/detail',
  asyncHandler(async (req, res) => {
    const rows = await db
      .prepare('SELECT id, type, name FROM categories WHERE user_id = ? ORDER BY type, id')
      .all(req.userId);
    res.json({
      income: rows.filter((r) => r.type === 'income'),
      expense: rows.filter((r) => r.type === 'expense'),
    });
  })
);

// Hapus kategori
app.delete(
  '/api/categories/:id',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const cat = await db
      .prepare('SELECT * FROM categories WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId);
    if (!cat) {
      return res.status(404).json({ error: 'Kategori tidak ditemukan' });
    }
    await db.batch([
      {
        sql: 'DELETE FROM category_budgets WHERE category = ? AND user_id = ?',
        args: [cat.name, userId],
      },
      { sql: 'DELETE FROM categories WHERE id = ?', args: [cat.id] },
    ]);
    res.json({ ok: true });
  })
);

// Ambil anggaran bulanan
app.get(
  '/api/budget',
  asyncHandler(async (req, res) => {
    res.json({ amount: Number(await getSetting(req.userId, 'monthly_budget', '0')) || 0 });
  })
);

// Simpan anggaran bulanan
app.put(
  '/api/budget',
  asyncHandler(async (req, res) => {
    const value = Number(req.body?.amount);
    if (Number.isNaN(value) || value < 0) {
      return res.status(400).json({ error: 'Anggaran harus angka >= 0' });
    }
    await setSetting(req.userId, 'monthly_budget', value);
    res.json({ amount: value });
  })
);

// Simpan anggaran per kategori (upsert)
app.put(
  '/api/category-budgets',
  asyncHandler(async (req, res) => {
    const { category, amount } = req.body ?? {};
    const value = Number(amount);
    if (!category || !String(category).trim()) {
      return res.status(400).json({ error: 'Kategori wajib diisi' });
    }
    if (Number.isNaN(value) || value <= 0) {
      return res.status(400).json({ error: 'Anggaran harus angka lebih dari 0' });
    }
    const cat = String(category).trim();
    await db
      .prepare(
        'INSERT INTO category_budgets (category, amount, user_id) VALUES (?, ?, ?) ON CONFLICT(user_id, category) DO UPDATE SET amount = excluded.amount'
      )
      .run(cat, value, req.userId);
    res.json({ category: cat, amount: value });
  })
);

// Hapus anggaran per kategori
app.delete(
  '/api/category-budgets/:category',
  asyncHandler(async (req, res) => {
    const result = await db
      .prepare('DELETE FROM category_budgets WHERE category = ? AND user_id = ?')
      .run(req.params.category, req.userId);
    if (Number(result.changes) === 0) {
      return res.status(404).json({ error: 'Anggaran kategori tidak ditemukan' });
    }
    res.json({ ok: true });
  })
);

// Ambil target tabungan
app.get(
  '/api/savings-goal',
  asyncHandler(async (req, res) => {
    res.json({ amount: Number(await getSetting(req.userId, 'savings_goal', '0')) || 0 });
  })
);

// Simpan target tabungan
app.put(
  '/api/savings-goal',
  asyncHandler(async (req, res) => {
    const value = Number(req.body?.amount);
    if (Number.isNaN(value) || value < 0) {
      return res.status(400).json({ error: 'Target harus angka >= 0' });
    }
    await setSetting(req.userId, 'savings_goal', value);
    res.json({ amount: value });
  })
);

// Daftar rekening
app.get(
  '/api/accounts',
  asyncHandler(async (req, res) => {
    const accounts = await db
      .prepare('SELECT * FROM accounts WHERE deleted_at IS NULL AND user_id = ? ORDER BY id')
      .all(req.userId);
    const withBalance = [];
    for (const a of accounts) {
      withBalance.push({
        ...a,
        balance: Number(a.initial_balance) + (await accountBalance(req.userId, a.id)),
      });
    }
    res.json(withBalance);
  })
);

// Tambah rekening
app.post(
  '/api/accounts',
  asyncHandler(async (req, res) => {
    const { name, initialBalance, kind } = req.body ?? {};
    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: 'Nama rekening wajib diisi' });
    }
    const init = Number(initialBalance) || 0;
    const k = ['cash', 'bank', 'ewallet'].includes(kind) ? kind : 'bank';
    const result = await db
      .prepare('INSERT INTO accounts (name, initial_balance, kind, user_id) VALUES (?, ?, ?, ?)')
      .run(String(name).trim(), init, k, req.userId);
    const a = await db
      .prepare('SELECT * FROM accounts WHERE id = ?')
      .get(Number(result.lastInsertRowid));
    res.status(201).json({ ...a, balance: init });
  })
);

// Hapus rekening (soft delete → recycle bin; transaksi tetap tertaut untuk pemulihan)
app.delete(
  '/api/accounts/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    const userId = req.userId;
    const now = "datetime('now', 'localtime')";
    const result = await db
      .prepare(`UPDATE accounts SET deleted_at = ${now} WHERE id = ? AND user_id = ? AND deleted_at IS NULL`)
      .run(id, userId);
    if (Number(result.changes) === 0) {
      return res.status(404).json({ error: 'Rekening tidak ditemukan' });
    }
    await db
      .prepare(
        `UPDATE transfers SET deleted_at = ${now} WHERE (from_account_id = ? OR to_account_id = ?) AND user_id = ? AND deleted_at IS NULL`
      )
      .run(id, id, userId);
    res.json({ ok: true });
  })
);

// Riwayat transfer
app.get(
  '/api/transfers',
  asyncHandler(async (req, res) => {
    const rows = await db
      .prepare(
        `SELECT t.*, fa.name AS from_name, ta.name AS to_name
         FROM transfers t
         LEFT JOIN accounts fa ON fa.id = t.from_account_id
         LEFT JOIN accounts ta ON ta.id = t.to_account_id
         WHERE t.deleted_at IS NULL AND t.user_id = ?
         ORDER BY t.date DESC, t.id DESC`
      )
      .all(req.userId);
    res.json(rows);
  })
);

// Transfer antar rekening
app.post(
  '/api/transfers',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
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
    // Pastikan kedua rekening memang milik pengguna ini.
    const from = await normalizeAccountId(userId, fromId);
    const to = await normalizeAccountId(userId, toId);
    if (!from || !to) {
      return res.status(400).json({ error: 'Rekening tidak ditemukan' });
    }
    const result = await db
      .prepare(
        'INSERT INTO transfers (from_account_id, to_account_id, amount, note, date, user_id) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(from, to, value, note || '', date || new Date().toISOString().slice(0, 10), userId);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  })
);

// Perbarui transfer
app.put(
  '/api/transfers/:id',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
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
    const from = await normalizeAccountId(userId, fromId);
    const to = await normalizeAccountId(userId, toId);
    if (!from || !to) {
      return res.status(400).json({ error: 'Rekening tidak ditemukan' });
    }
    const result = await db
      .prepare(
        'UPDATE transfers SET from_account_id = ?, to_account_id = ?, amount = ?, note = ?, date = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL'
      )
      .run(
        from,
        to,
        value,
        note || '',
        date || new Date().toISOString().slice(0, 10),
        req.params.id,
        userId
      );
    if (Number(result.changes) === 0) {
      return res.status(404).json({ error: 'Transfer tidak ditemukan' });
    }
    res.json({ id: Number(req.params.id) });
  })
);

// Hapus transfer (soft delete → recycle bin)
app.delete(
  '/api/transfers/:id',
  asyncHandler(async (req, res) => {
    const result = await db
      .prepare(
        "UPDATE transfers SET deleted_at = datetime('now', 'localtime') WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
      )
      .run(req.params.id, req.userId);
    if (Number(result.changes) === 0) {
      return res.status(404).json({ error: 'Transfer tidak ditemukan' });
    }
    res.json({ ok: true });
  })
);

// Daftar transaksi berulang (sekaligus proses yang jatuh tempo)
app.get(
  '/api/recurring',
  asyncHandler(async (req, res) => {
    await processRecurring();
    const rows = await db
      .prepare(
        `SELECT r.*, a.name AS account_name
         FROM recurring r
         LEFT JOIN accounts a ON a.id = r.account_id
         WHERE r.deleted_at IS NULL AND r.user_id = ?
         ORDER BY r.active DESC, r.next_date`
      )
      .all(req.userId);
    res.json(rows);
  })
);

// Tambah transaksi berulang
app.post(
  '/api/recurring',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const { type, amount, category, description, accountId, frequency, nextDate } = req.body ?? {};
    const value = Number(amount);
    if (!type || !['income', 'expense'].includes(type)) {
      return res.status(400).json({ error: 'type harus income atau expense' });
    }
    if (!nextDate || Number.isNaN(value) || value <= 0) {
      return res.status(400).json({ error: 'Nominal dan tanggal berikutnya wajib diisi' });
    }
    if (!isValidDate(nextDate)) {
      return res.status(400).json({ error: 'Tanggal harus format YYYY-MM-DD' });
    }
    const accId = await normalizeAccountId(userId, accountId);
    if (accId === undefined) {
      return res.status(400).json({ error: 'Rekening tidak ditemukan' });
    }
    const freq = ['daily', 'weekly', 'monthly'].includes(frequency) ? frequency : 'monthly';
    const result = await db
      .prepare(
        'INSERT INTO recurring (type, amount, category, description, account_id, frequency, next_date, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(type, value, category || '', description || '', accId, freq, nextDate, userId);
    res.status(201).json({ id: Number(result.lastInsertRowid) });
  })
);

// Aktifkan / nonaktifkan transaksi berulang
app.put(
  '/api/recurring/:id',
  asyncHandler(async (req, res) => {
    const { active } = req.body ?? {};
    const result = await db
      .prepare('UPDATE recurring SET active = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL')
      .run(active ? 1 : 0, req.params.id, req.userId);
    if (Number(result.changes) === 0) {
      return res.status(404).json({ error: 'Transaksi berulang tidak ditemukan' });
    }
    res.json({ ok: true });
  })
);

// Hapus transaksi berulang (soft delete → recycle bin)
app.delete(
  '/api/recurring/:id',
  asyncHandler(async (req, res) => {
    const result = await db
      .prepare(
        "UPDATE recurring SET deleted_at = datetime('now', 'localtime') WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
      )
      .run(req.params.id, req.userId);
    if (Number(result.changes) === 0) {
      return res.status(404).json({ error: 'Transaksi berulang tidak ditemukan' });
    }
    res.json({ ok: true });
  })
);

// Hapus transaksi (soft delete → masuk recycle bin)
app.delete(
  '/api/transactions/:id',
  asyncHandler(async (req, res) => {
    const result = await db
      .prepare(
        "UPDATE transactions SET deleted_at = datetime('now', 'localtime') WHERE id = ? AND user_id = ? AND deleted_at IS NULL"
      )
      .run(req.params.id, req.userId);
    if (Number(result.changes) === 0) {
      return res.status(404).json({ error: 'Transaksi tidak ditemukan' });
    }
    res.json({ ok: true });
  })
);

// Hapus permanen rekening beserta transfer terkaitnya.
// Catatan: pemanggil WAJIB sudah memverifikasi kepemilikan rekening (user_id),
// karena fungsi ini hanya bekerja berdasarkan id rekening yang unik global.
async function hardDeleteAccount(id) {
  await db.prepare('UPDATE transactions SET account_id = NULL WHERE account_id = ?').run(id);
  await db.prepare('DELETE FROM transfers WHERE from_account_id = ? OR to_account_id = ?').run(id, id);
  await db.prepare('DELETE FROM accounts WHERE id = ?').run(id);
}

// Bersihkan item recycle bin yang sudah lebih dari 30 hari
async function purgeExpiredTrash() {
  const cutoff = "datetime('now', 'localtime', '-30 days')";
  await db.prepare(`DELETE FROM transactions WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`).run();
  await db.prepare(`DELETE FROM recurring WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`).run();
  await db.prepare(`DELETE FROM transfers WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`).run();
  const accounts = await db
    .prepare(`SELECT id FROM accounts WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}`)
    .all();
  for (const a of accounts) await hardDeleteAccount(a.id);
}

// Recycle bin: daftar semua item terhapus (transaksi, berulang, transfer, rekening)
app.get(
  '/api/trash',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    await purgeExpiredTrash();
    const transactions = await db
      .prepare(
        `SELECT t.id, 'transaction' AS entity, t.type, t.amount, t.category, t.description, t.date,
                t.deleted_at, a.name AS account_name
         FROM transactions t
         LEFT JOIN accounts a ON a.id = t.account_id
         WHERE t.deleted_at IS NOT NULL AND t.user_id = ?`
      )
      .all(userId);
    const recurring = await db
      .prepare(
        `SELECT r.id, 'recurring' AS entity, r.type, r.amount, r.category, r.description,
                r.frequency, r.next_date AS date, r.deleted_at
         FROM recurring r
         WHERE r.deleted_at IS NOT NULL AND r.user_id = ?`
      )
      .all(userId);
    const transfers = await db
      .prepare(
        `SELECT t.id, 'transfer' AS entity, t.amount, t.note AS description, t.date, t.deleted_at,
                fa.name AS from_name, ta.name AS to_name
         FROM transfers t
         LEFT JOIN accounts fa ON fa.id = t.from_account_id
         LEFT JOIN accounts ta ON ta.id = t.to_account_id
         WHERE t.deleted_at IS NOT NULL AND t.user_id = ?`
      )
      .all(userId);
    const accounts = await db
      .prepare(
        `SELECT a.id, 'account' AS entity, a.name, a.kind, a.initial_balance, a.deleted_at
         FROM accounts a
         WHERE a.deleted_at IS NOT NULL AND a.user_id = ?`
      )
      .all(userId);
    const items = [...transactions, ...recurring, ...transfers, ...accounts].sort((a, b) =>
      String(b.deleted_at).localeCompare(String(a.deleted_at))
    );
    res.json(items);
  })
);

// Pulihkan item dari recycle bin
app.post(
  '/api/trash/:entity/:id/restore',
  asyncHandler(async (req, res) => {
    const { entity, id } = req.params;
    const userId = req.userId;
    if (entity === 'account') {
      const account = await db
        .prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
        .get(id, userId);
      if (!account) {
        return res.status(404).json({ error: 'Item tidak ditemukan di recycle bin' });
      }
      const deletedAt = account.deleted_at;
      await db.prepare('UPDATE accounts SET deleted_at = NULL WHERE id = ?').run(id);
      if (deletedAt) {
        await db
          .prepare(
            'UPDATE transfers SET deleted_at = NULL WHERE (from_account_id = ? OR to_account_id = ?) AND user_id = ? AND deleted_at = ?'
          )
          .run(id, id, userId, deletedAt);
      }
      return res.json({ ok: true });
    }
    const table =
      entity === 'transaction'
        ? 'transactions'
        : entity === 'recurring'
          ? 'recurring'
          : entity === 'transfer'
            ? 'transfers'
            : null;
    if (!table) {
      return res.status(400).json({ error: 'Entitas tidak dikenal' });
    }
    const result = await db
      .prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ? AND user_id = ?`)
      .run(id, userId);
    if (Number(result.changes) === 0) {
      return res.status(404).json({ error: 'Item tidak ditemukan di recycle bin' });
    }
    res.json({ ok: true });
  })
);

// Hapus permanen satu item dari recycle bin
app.delete(
  '/api/trash/:entity/:id',
  asyncHandler(async (req, res) => {
    const { entity, id } = req.params;
    const userId = req.userId;
    if (entity === 'account') {
      const account = await db
        .prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL')
        .get(id, userId);
      if (!account) {
        return res.status(404).json({ error: 'Item tidak ditemukan di recycle bin' });
      }
      await hardDeleteAccount(account.id);
      return res.json({ ok: true });
    }
    const table =
      entity === 'transaction'
        ? 'transactions'
        : entity === 'recurring'
          ? 'recurring'
          : entity === 'transfer'
            ? 'transfers'
            : null;
    if (!table) {
      return res.status(400).json({ error: 'Entitas tidak dikenal' });
    }
    const result = await db
      .prepare(`DELETE FROM ${table} WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL`)
      .run(id, userId);
    if (Number(result.changes) === 0) {
      return res.status(404).json({ error: 'Item tidak ditemukan di recycle bin' });
    }
    res.json({ ok: true });
  })
);

// Kosongkan recycle bin (hapus permanen semua milik pengguna ini)
app.delete(
  '/api/trash',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    await db.prepare('DELETE FROM transactions WHERE deleted_at IS NOT NULL AND user_id = ?').run(userId);
    await db.prepare('DELETE FROM recurring WHERE deleted_at IS NOT NULL AND user_id = ?').run(userId);
    await db.prepare('DELETE FROM transfers WHERE deleted_at IS NOT NULL AND user_id = ?').run(userId);
    const accounts = await db
      .prepare('SELECT id FROM accounts WHERE deleted_at IS NOT NULL AND user_id = ?')
      .all(userId);
    for (const a of accounts) await hardDeleteAccount(a.id);
    res.json({ ok: true });
  })
);

// Backup: export seluruh data MILIK PENGGUNA INI sebagai JSON
app.get(
  '/api/backup',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    res.json({
      app: 'finance-tracker',
      formatVersion: 2,
      exportedAt: new Date().toISOString(),
      transactions: await db
        .prepare('SELECT * FROM transactions WHERE deleted_at IS NULL AND user_id = ? ORDER BY id')
        .all(userId),
      categories: await db
        .prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY id')
        .all(userId),
      settings: await db.prepare('SELECT * FROM settings WHERE user_id = ?').all(userId),
      categoryBudgets: await db
        .prepare('SELECT * FROM category_budgets WHERE user_id = ? ORDER BY category')
        .all(userId),
      accounts: await db
        .prepare('SELECT * FROM accounts WHERE deleted_at IS NULL AND user_id = ? ORDER BY id')
        .all(userId),
      transfers: await db
        .prepare('SELECT * FROM transfers WHERE deleted_at IS NULL AND user_id = ? ORDER BY id')
        .all(userId),
      recurring: await db
        .prepare('SELECT * FROM recurring WHERE deleted_at IS NULL AND user_id = ? ORDER BY id')
        .all(userId),
    });
  })
);

// Cegah tabrakan id antar pengguna saat restore (id bersifat unik global).
async function idConflict(userId, table, rows) {
  const stmt = db.prepare(`SELECT user_id FROM ${table} WHERE id = ?`);
  for (const row of rows) {
    const id = Number(row?.id);
    if (!Number.isInteger(id) || id <= 0) return true;
    const found = await stmt.get(id);
    if (found && Number(found.user_id) !== Number(userId)) return true;
  }
  return false;
}

// Restore: ganti SELURUH data milik pengguna ini dengan isi file backup
app.post(
  '/api/restore',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const d = req.body ?? {};
    const required = ['transactions', 'categories', 'settings', 'categoryBudgets', 'accounts', 'transfers'];
    if (!required.every((t) => Array.isArray(d[t]))) {
      return res.status(400).json({ error: 'Format file backup tidak valid' });
    }
    const recurring = Array.isArray(d.recurring) ? d.recurring : [];
    const conflict =
      (await idConflict(userId, 'accounts', d.accounts)) ||
      (await idConflict(userId, 'transactions', d.transactions)) ||
      (await idConflict(userId, 'transfers', d.transfers)) ||
      (await idConflict(userId, 'recurring', recurring)) ||
      (await idConflict(userId, 'categories', d.categories));
    if (conflict) {
      return res.status(409).json({
        error: 'File backup tidak kompatibel (id data bertabrakan). Hubungi dukungan.',
      });
    }
    try {
      const stmts = [];
      for (const t of ['transfers', 'transactions', 'recurring', 'category_budgets', 'categories', 'accounts', 'settings']) {
        stmts.push({ sql: `DELETE FROM ${t} WHERE user_id = ?`, args: [userId] });
      }
      const insAccount = {
        sql: 'INSERT INTO accounts (id, name, initial_balance, kind, user_id) VALUES (?, ?, ?, ?, ?)',
      };
      for (const a of d.accounts) {
        stmts.push({
          sql: insAccount.sql,
          args: [a.id, a.name, Number(a.initial_balance) || 0, a.kind || 'bank', userId],
        });
      }
      const insTx = {
        sql: 'INSERT INTO transactions (id, type, amount, category, description, date, account_id, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      };
      for (const t of d.transactions) {
        stmts.push({
          sql: insTx.sql,
          args: [
            t.id,
            t.type,
            Number(t.amount) || 0,
            t.category || '',
            t.description || '',
            t.date,
            t.account_id ?? null,
            userId,
          ],
        });
      }
      const insTransfer = {
        sql: 'INSERT INTO transfers (id, from_account_id, to_account_id, amount, note, date, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      };
      for (const t of d.transfers) {
        stmts.push({
          sql: insTransfer.sql,
          args: [
            t.id,
            t.from_account_id,
            t.to_account_id,
            Number(t.amount) || 0,
            t.note || '',
            t.date,
            userId,
          ],
        });
      }
      const insRecurring = {
        sql: 'INSERT INTO recurring (id, type, amount, category, description, account_id, frequency, next_date, active, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      };
      for (const r of recurring) {
        stmts.push({
          sql: insRecurring.sql,
          args: [
            r.id,
            r.type,
            Number(r.amount) || 0,
            r.category || '',
            r.description || '',
            r.account_id ?? null,
            r.frequency || 'monthly',
            r.next_date,
            r.active ? 1 : 0,
            userId,
          ],
        });
      }
      const insCat = { sql: 'INSERT INTO categories (id, type, name, user_id) VALUES (?, ?, ?, ?)' };
      for (const c of d.categories) stmts.push({ sql: insCat.sql, args: [c.id, c.type, c.name, userId] });
      const insCb = { sql: 'INSERT INTO category_budgets (category, amount, user_id) VALUES (?, ?, ?)' };
      for (const b of d.categoryBudgets) stmts.push({ sql: insCb.sql, args: [b.category, Number(b.amount) || 0, userId] });
      const insSet = { sql: 'INSERT INTO settings (key, value, user_id) VALUES (?, ?, ?)' };
      for (const s of d.settings) stmts.push({ sql: insSet.sql, args: [s.key, String(s.value), userId] });
      await db.batch(stmts);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: `Gagal restore: ${err.message}` });
    }
  })
);

// Laporan pengeluaran per kategori per bulan
app.get(
  '/api/reports/category-monthly',
  asyncHandler(async (req, res) => {
    const rows = await db
      .prepare(
        `SELECT
          strftime('%Y-%m', date) AS month,
          COALESCE(NULLIF(category, ''), 'Tanpa kategori') AS category,
          SUM(amount) AS total
         FROM transactions
         WHERE type = 'expense' AND deleted_at IS NULL AND user_id = ?
         GROUP BY month, category
         ORDER BY month, category`
      )
      .all(req.userId);
    res.json(rows);
  })
);

// Ringkasan: total pemasukan, pengeluaran, saldo, dan rincian per bulan
app.get(
  '/api/summary',
  asyncHandler(async (req, res) => {
    const userId = req.userId;
    const totals = await db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) AS income,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
        FROM transactions
        WHERE deleted_at IS NULL AND user_id = ?`
      )
      .get(userId);

    const monthly = await db
      .prepare(
        `SELECT
          strftime('%Y-%m', date) AS month,
          SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) AS income,
          SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) AS expense
        FROM transactions
        WHERE deleted_at IS NULL AND user_id = ?
        GROUP BY month
        ORDER BY month`
      )
      .all(userId);

    const monthExpense = (
      await db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS total
           FROM transactions
           WHERE type = 'expense' AND deleted_at IS NULL AND user_id = ? AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')`
        )
        .get(userId)
    ).total;

    const budget = Number(await getSetting(userId, 'monthly_budget', '0')) || 0;

    const categoryBudgets = await db
      .prepare('SELECT category, amount FROM category_budgets WHERE user_id = ? ORDER BY category')
      .all(userId);

    const categoryExpenses = await db
      .prepare(
        `SELECT COALESCE(NULLIF(category, ''), 'Tanpa kategori') AS category, SUM(amount) AS total
         FROM transactions
         WHERE type = 'expense' AND deleted_at IS NULL AND user_id = ? AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')
         GROUP BY category`
      )
      .all(userId);

    // Statistik tambahan
    const daysElapsed =
      Number(
        (await db.prepare("SELECT CAST(strftime('%d', 'now', 'localtime') AS INTEGER) AS d").get()).d
      ) || 1;
    const avgDailyExpense = monthExpense / daysElapsed;

    const largestTransaction =
      (await db
        .prepare(
          `SELECT amount, category, description, date, type
           FROM transactions
           WHERE deleted_at IS NULL AND user_id = ? AND strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime')
           ORDER BY amount DESC
           LIMIT 1`
        )
        .get(userId)) || null;

    const trend = await db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime') AND type = 'expense' THEN amount ELSE 0 END), 0) AS current,
          COALESCE(SUM(CASE WHEN strftime('%Y-%m', date) = strftime('%Y-%m', 'now', 'localtime', '-1 month') AND type = 'expense' THEN amount ELSE 0 END), 0) AS last
        FROM transactions
        WHERE deleted_at IS NULL AND user_id = ?`
      )
      .get(userId);

    // Saldo awal seluruh rekening aktif — disamakan dengan GET /api/accounts
    // agar "Saldo" di ringkasan tidak berbeda dengan "Total" di kartu Rekening.
    const initialBalances =
      (
        await db
          .prepare(
            'SELECT COALESCE(SUM(initial_balance), 0) AS total FROM accounts WHERE deleted_at IS NULL AND user_id = ?'
          )
          .get(userId)
      ).total || 0;

    // Tren saldo kumulatif dari waktu ke waktu (harian), dimulai dari saldo awal
    const dailyDelta = await db
      .prepare(
        `SELECT date, SUM(CASE WHEN type = 'income' THEN amount ELSE -amount END) AS delta
         FROM transactions
         WHERE deleted_at IS NULL AND user_id = ?
         GROUP BY date
         ORDER BY date`
      )
      .all(userId);
    let runningBalance = initialBalances;
    const balanceTrend = dailyDelta.map((r) => {
      runningBalance += Number(r.delta);
      return { date: r.date, balance: runningBalance };
    });

    const savingsGoal = Number(await getSetting(userId, 'savings_goal', '0')) || 0;

    res.json({
      income: totals.income,
      expense: totals.expense,
      initialBalances,
      balance: initialBalances + totals.income - totals.expense,
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
  })
);

// Handler error terakhir: semua kegagalan dibalas JSON (bukan halaman HTML dari Express)
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const message = String(err?.message || '');
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Data terlalu besar (maksimal 5 MB)' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ error: 'Format JSON tidak valid' });
  }
  if (message.includes('UNIQUE constraint failed')) {
    return res.status(409).json({ error: 'Data sudah ada' });
  }
  if (message.includes('FOREIGN KEY constraint failed')) {
    return res.status(400).json({ error: 'Referensi data tidak valid' });
  }
  if (message.includes('CHECK constraint failed')) {
    return res.status(400).json({ error: 'Nilai tidak diizinkan' });
  }
  console.error('❌ Error tidak tertangani:', err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

const PORT = process.env.PORT || 3001;
// Proses transaksi berulang yang jatuh tempo saat server mulai.
processRecurring().catch((err) =>
  console.error('⚠️ Gagal memproses transaksi berulang:', err.message)
);
app.listen(PORT, () => {
  console.log(`✅ Server berjalan di http://localhost:${PORT}`);
});
