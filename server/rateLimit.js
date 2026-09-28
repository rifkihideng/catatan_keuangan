// Pembatas percobaan dengan backend ganda:
//   - Upstash Redis (REST) bila UPSTASH_REDIS_REST_URL & UPSTASH_REDIS_REST_TOKEN diisi.
//   - Fallback: Map di memori (cukup untuk pengembangan lokal).
//
// Di Vercel (serverless), Map lokal TIDAK dibagi antar instance sehingga batas
// mudah di-bypass — gunakan Redis di produksi agar penghitungnya terpusat dan
// tidak hilang saat restart.

const REDIS_URL = String(process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, '');
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const USE_REDIS = Boolean(REDIS_URL && REDIS_TOKEN);

export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 10;

const memory = new Map();

function memoryCount(key) {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now > entry.resetAt) return 0;
  return entry.count;
}

function memoryIncr(key, windowMs) {
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now > entry.resetAt) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
  } else {
    entry.count += 1;
  }
  if (memory.size > 5000) {
    for (const [k, v] of memory) if (now > v.resetAt) memory.delete(k);
  }
}

function memoryDel(key) {
  memory.delete(key);
}

async function redis(path, options = {}) {
  const res = await fetch(`${REDIS_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, ...(options.headers || {}) },
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  return res.json();
}

// INCR + set TTL dalam satu pipeline (jendela geser per percobaan).
async function redisIncr(key, windowMs) {
  const body = JSON.stringify([
    ['INCR', key],
    ['PEXPIRE', key, Math.max(1, Math.ceil(windowMs))],
  ]);
  const data = await redis('/pipeline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const n = Number(data?.[0]?.result);
  return Number.isFinite(n) ? n : 0;
}

async function redisGet(key) {
  const data = await redis(`/get/${encodeURIComponent(key)}`);
  const n = Number(data?.result);
  return Number.isFinite(n) ? n : 0;
}

async function redisDel(key) {
  await redis(`/del/${encodeURIComponent(key)}`, { method: 'DELETE' });
}

export async function tooManyAttempts(key, max = MAX_ATTEMPTS, windowMs = WINDOW_MS) {
  if (!USE_REDIS) return memoryCount(key) >= max;
  try {
    return (await redisGet(key)) >= max;
  } catch (err) {
    console.error('⚠️ Upstash gagal dibaca; fallback memori:', err.message);
    return memoryCount(key) >= max;
  }
}

export async function recordFailedAttempt(key, windowMs = WINDOW_MS) {
  if (!USE_REDIS) return memoryIncr(key, windowMs);
  try {
    await redisIncr(key, windowMs);
  } catch (err) {
    console.error('⚠️ Upstash gagal ditulis; fallback memori:', err.message);
    memoryIncr(key, windowMs);
  }
}

export async function clearAttempts(key) {
  if (!USE_REDIS) return memoryDel(key);
  try {
    await redisDel(key);
  } catch {
    // Abaikan; kegagalan menghapus tidak berbahaya.
  }
}
