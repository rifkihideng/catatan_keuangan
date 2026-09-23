import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, CircleAlert, Eye, EyeOff, MailCheck, Send } from 'lucide-react';
import { checkResetToken, forgotPassword, resetPassword } from './api';

// Kartu pesan (galat / sukses) — disamakan dengan gaya di AuthScreen.
function Alert({ tone = 'error', children }) {
  const styles =
    tone === 'success'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/60 dark:text-emerald-300'
      : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/60 dark:text-rose-300';
  const Icon = tone === 'success' ? CheckCircle2 : CircleAlert;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm ${styles}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function BackLink({ onClick, children = 'Kembali ke halaman masuk' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-ghost mx-auto px-3 py-2 text-sm"
    >
      <ArrowLeft className="h-4 w-4" /> {children}
    </button>
  );
}

function PasswordInput({ id, value, onChange, placeholder, autoComplete, minLength }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        className="input pr-11"
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        minLength={minLength}
        required
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="btn btn-ghost absolute inset-y-0 right-0 px-3"
        aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;
}

// ---------------------------------------------------------------------------
// Lupa password: minta tautan reset
// ---------------------------------------------------------------------------

export function ForgotForm({ onBack, onGoToReset }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await forgotPassword(email.trim());
      setSent({ emailConfigured: res.emailConfigured !== false });
    } catch (err) {
      setError(err.message || 'Gagal meminta tautan reset');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="space-y-4">
        <Alert tone="success">
          Kalau <span className="font-semibold">{email.trim()}</span> terdaftar, kami sudah
          mengirim tautan untuk membuat password baru. Periksa kotak masuk dan folder spam.
        </Alert>
        {!sent.emailConfigured && (
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Catatan: pengiriman email belum dikonfigurasi di server ini (RESEND_API_KEY kosong),
            jadi isi tautan reset dicetak pada log server.
          </p>
        )}
        <div className="flex justify-center">
          <BackLink onClick={onBack} />
        </div>
        {onGoToReset && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            Menerima tautannya?{' '}
            <button
              type="button"
              onClick={onGoToReset}
              className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Buka halaman reset
            </button>
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Masukkan email akunmu. Kami akan mengirim tautan untuk membuat password baru.
      </p>

      {error && <Alert>{error}</Alert>}

      <div>
        <label className="label" htmlFor="forgot-email">
          Email
        </label>
        <input
          id="forgot-email"
          className="input"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@email.com"
          autoComplete="email"
          required
        />
      </div>

      <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5">
        {busy ? (
          <>
            <Spinner /> Mengirim…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" /> Kirim tautan reset
          </>
        )}
      </button>

      <div className="flex justify-center">
        <BackLink onClick={onBack} />
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Reset password: form password baru (dibuka dari tautan email)
// ---------------------------------------------------------------------------

export function ResetForm({ token, config, onBack, onDone, onRequestLink }) {
  const [check, setCheck] = useState({ status: 'checking' });
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const minLength = config?.minPasswordLength || 8;

  useEffect(() => {
    let cancelled = false;
    checkResetToken(token)
      .then((res) => {
        if (!cancelled) setCheck({ status: 'ready', email: res.email, name: res.name });
      })
      .catch((err) => {
        if (!cancelled) setCheck({ status: 'invalid', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Konfirmasi password tidak sama');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetPassword(token, password);
      onDone();
    } catch (err) {
      setError(err.message || 'Gagal mengganti password');
      setBusy(false);
    }
  }

  if (check.status === 'checking') {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
        Memeriksa tautan…
      </div>
    );
  }

  if (check.status === 'invalid') {
    return (
      <div className="space-y-4">
        <Alert>{check.message}</Alert>
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Tautan reset hanya berlaku sekali pakai dan punya masa berlaku terbatas. Minta tautan
          baru untuk melanjutkan.
        </p>
        <button type="button" onClick={onRequestLink} className="btn btn-primary w-full py-2.5">
          <MailCheck className="h-4 w-4" /> Minta tautan baru
        </button>
        <div className="flex justify-center">
          <BackLink onClick={onBack} />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        Membuat password baru untuk{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-200">{check.email}</span>.
      </p>

      {error && <Alert>{error}</Alert>}

      <div>
        <label className="label" htmlFor="reset-password">
          Password baru
        </label>
        <PasswordInput
          id="reset-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={`Minimal ${minLength} karakter`}
          autoComplete="new-password"
          minLength={minLength}
        />
      </div>

      <div>
        <label className="label" htmlFor="reset-confirm">
          Ulangi password baru
        </label>
        <input
          id="reset-confirm"
          className="input"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Ketik ulang password baru"
          autoComplete="new-password"
          required
        />
      </div>

      <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5">
        {busy ? (
          <>
            <Spinner /> Menyimpan…
          </>
        ) : (
          'Simpan password baru'
        )}
      </button>

      <div className="flex justify-center">
        <BackLink onClick={onBack} />
      </div>
    </form>
  );
}
