import { useEffect, useState } from 'react';
import {
  CircleAlert,
  Eye,
  EyeOff,
  LogIn,
  ShieldCheck,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { ForgotForm, ResetForm } from './PasswordResetForms';
import { login, register, setToken } from './api';

const REMEMBER_KEY = 'auth_remember';

export default function AuthScreen({
  config = null,
  notice = '',
  authError = '',
  resetToken = '',
  onAuthenticated,
  onNotice,
  onResetDone,
}) {
  // view: 'auth' (masuk/daftar) | 'forgot' (minta tautan) | 'reset' (password baru)
  const [view, setView] = useState(resetToken ? 'reset' : 'auth');
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => {
    try {
      return localStorage.getItem(REMEMBER_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';
  const minPassword = config?.minPasswordLength || 8;
  const signupAllowed = config?.signup !== false;
  const googleEnabled = Boolean(config?.google);

  useEffect(() => {
    if (resetToken) setView('reset');
  }, [resetToken]);

  useEffect(() => {
    try {
      localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
    } catch {
      // localStorage bisa diblokir — pilihan berlaku untuk sesi ini saja
    }
  }, [remember]);

  function switchMode(next) {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  }

  function startGoogle() {
    window.location.href = '/api/auth/google/start';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;

    if (isRegister && password !== confirm) {
      setError('Konfirmasi password tidak sama');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = isRegister
        ? await register({ email: email.trim(), name: name.trim(), password })
        : await login(email.trim(), password, remember);
      setToken(data.token);
      onAuthenticated(data.user);
    } catch (err) {
      setError(err.message || 'Gagal masuk');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 px-4 py-10 dark:bg-slate-950">
      {/* Latar dekoratif */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-300/40 blur-3xl dark:bg-indigo-600/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-violet-300/40 blur-3xl dark:bg-violet-600/20"
      />

      <div className="animate-fade-up relative w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <Wallet className="h-7 w-7" />
          </span>
          <h1 className="mt-3 bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent dark:from-indigo-300 dark:to-violet-300">
            {config?.siteName || 'Catatan Keuangan'}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {view === 'forgot'
              ? 'Masukkan email untuk menerima tautan reset'
              : view === 'reset'
                ? 'Buat password baru untuk akunmu'
                : isRegister
                  ? 'Buat akun untuk mulai mencatat keuanganmu'
                  : 'Masuk untuk melanjutkan catatan keuanganmu'}
          </p>
        </div>

        <div className="card p-5 sm:p-6">
          {/* ---- Masuk / Daftar ---- */}
          {view === 'auth' && (
            <>
              {signupAllowed && (
                <div
                  role="tablist"
                  aria-label="Pilih masuk atau daftar"
                  className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-700/50"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!isRegister}
                    onClick={() => switchMode('login')}
                    className={`btn px-3 py-2 ${
                      !isRegister
                        ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
                        : 'text-slate-500 dark:text-slate-300'
                    }`}
                  >
                    <LogIn className="h-4 w-4" /> Masuk
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={isRegister}
                    onClick={() => switchMode('register')}
                    className={`btn px-3 py-2 ${
                      isRegister
                        ? 'bg-white text-indigo-600 shadow-sm dark:bg-slate-800 dark:text-indigo-300'
                        : 'text-slate-500 dark:text-slate-300'
                    }`}
                  >
                    <UserPlus className="h-4 w-4" /> Daftar
                  </button>
                </div>
              )}

              {notice && !error && (
                <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{notice}</span>
                </div>
              )}

              {authError && !error && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/60 dark:text-rose-300"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {error && (
                <div
                  role="alert"
                  className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/60 dark:text-rose-300"
                >
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {isRegister && (
                  <div>
                    <label className="label" htmlFor="auth-name">
                      Nama
                    </label>
                    <input
                      id="auth-name"
                      className="input"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Nama kamu"
                      autoComplete="name"
                      maxLength={80}
                      required
                    />
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="auth-email">
                    Email
                  </label>
                  <input
                    id="auth-email"
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <div>
                  <label className="label" htmlFor="auth-password">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="auth-password"
                      className="input pr-11"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={isRegister ? `Minimal ${minPassword} karakter` : 'Password kamu'}
                      autoComplete={isRegister ? 'new-password' : 'current-password'}
                      minLength={isRegister ? minPassword : undefined}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="btn btn-ghost absolute inset-y-0 right-0 px-3"
                      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {isRegister ? (
                  <div>
                    <label className="label" htmlFor="auth-confirm">
                      Ulangi password
                    </label>
                    <input
                      id="auth-confirm"
                      className="input"
                      type={showPassword ? 'text' : 'password'}
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Ketik ulang password"
                      autoComplete="new-password"
                      required
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-4 w-4 accent-indigo-600"
                      />
                      Tetap masuk
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setError('');
                        setView('forgot');
                      }}
                      className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Lupa password?
                    </button>
                  </div>
                )}

                <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5">
                  {busy ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Memproses…
                    </>
                  ) : isRegister ? (
                    <>
                      <UserPlus className="h-4 w-4" /> Buat akun
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" /> Masuk
                    </>
                  )}
                </button>
              </form>

              {googleEnabled && (
                <div className="mt-5">
                  <div className="relative mb-4 text-center">
                    <span className="absolute inset-x-0 top-1/2 h-px bg-slate-200 dark:bg-slate-700" />
                    <span className="relative bg-white px-2 text-xs font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                      atau
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={startGoogle}
                    className="btn btn-secondary w-full py-2.5"
                  >
                    <GoogleMark />
                    Lanjutkan dengan Google
                  </button>
                </div>
              )}
            </>
          )}

          {/* ---- Lupa password ---- */}
          {view === 'forgot' && (
            <ForgotForm onBack={() => setView('auth')} onGoToReset={() => setView('reset')} />
          )}

          {/* ---- Reset password (dari tautan email) ---- */}
          {view === 'reset' && (
            <ResetForm
              token={resetToken}
              config={config}
              onBack={() => {
                onResetDone?.();
                setView('auth');
              }}
              onRequestLink={() => {
                onResetDone?.();
                setView('forgot');
              }}
              onDone={() => {
                onResetDone?.();
                setMode('login');
                setView('auth');
                setPassword('');
                setConfirm('');
                setError('');
                onNotice?.('Password berhasil diganti. Silakan masuk dengan password baru.');
              }}
            />
          )}
        </div>

        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" />
          Tiap akun punya data sendiri — catatanmu tidak terlihat oleh pengguna lain.
        </p>
      </div>
    </div>
  );
}

// Logo Google (inline agar tidak menambah dependensi)
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-4 w-4">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.5 14.5 0 0 1 9.77 24c0-1.6.28-3.14.77-4.59l-7.98-6.19A23.94 23.94 0 0 0 0 24c0 3.88.93 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
