import { useEffect, useState } from 'react';
import { CircleAlert, KeyRound, ShieldCheck, X } from 'lucide-react';
import { useModalA11y } from '../useModalA11y';
import { confirmTwoFactor, disableTwoFactor, enableTwoFactor, getTwoFactor } from '../api';

export default function SecurityDialog({ open, onClose, email }) {
  const panelRef = useModalA11y(open, onClose);
  const [status, setStatus] = useState(null); // { enabled, emailVerified, emailConfigured }
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('idle'); // idle | code | disable
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setError('');
    setNotice('');
    setStep('idle');
    setCode('');
    setPassword('');
    let cancelled = false;
    getTwoFactor()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Gagal memuat status keamanan');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const enabled = Boolean(status?.enabled);

  async function handleEnable() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await enableTwoFactor();
      setNotice('Kode konfirmasi sudah dikirim ke email kamu.');
      setStep('code');
    } catch (err) {
      setError(err.message || 'Gagal mengirim kode');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await confirmTwoFactor(code.trim());
      setStatus((prev) => ({ ...prev, enabled: true }));
      setStep('idle');
      setCode('');
      setNotice('Verifikasi 2 langkah berhasil diaktifkan.');
    } catch (err) {
      setError(err.message || 'Kode salah');
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await disableTwoFactor(password);
      setStatus((prev) => ({ ...prev, enabled: false }));
      setStep('idle');
      setPassword('');
      setNotice('Verifikasi 2 langkah dinonaktifkan.');
    } catch (err) {
      setError(err.message || 'Gagal menonaktifkan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 print:hidden">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Keamanan akun"
        className="card relative z-10 w-full max-w-md p-5 sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900 dark:text-white">
            <ShieldCheck className="h-5 w-5 text-indigo-500" /> Keamanan Akun
          </h2>
          <button onClick={onClose} className="btn btn-ghost px-2 py-1.5" aria-label="Tutup">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Akun:{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">
            {email || '—'}
          </span>
        </p>

        {error && (
          <div
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/60 dark:text-rose-300"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/60 dark:text-emerald-300">
            {notice}
          </div>
        )}

        {!status && !error && (
          <p className="mt-4 text-sm text-slate-400">Memuat status keamanan…</p>
        )}

        {status && step === 'idle' && (
          <div className="mt-4 space-y-3">
            {!status.emailConfigured ? (
              <p className="rounded-xl bg-slate-100 px-3.5 py-2.5 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                Pengiriman email belum dikonfigurasi di server, jadi verifikasi 2 langkah tidak
                bisa diaktifkan.
              </p>
            ) : !status.emailVerified ? (
              <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                Konfirmasi alamat email kamu dulu untuk mengaktifkan verifikasi 2 langkah.
              </p>
            ) : enabled ? (
              <>
                <p className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  Verifikasi 2 langkah <span className="font-semibold">aktif</span>. Setiap masuk
                  akan meminta kode dari email.
                </p>
                <button
                  onClick={() => {
                    setStep('disable');
                    setError('');
                    setNotice('');
                  }}
                  className="btn btn-secondary w-full py-2.5"
                >
                  Nonaktifkan 2 langkah
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Verifikasi 2 langkah <span className="font-semibold">nonaktif</span>. Aktifkan
                  untuk meminta kode verifikasi setiap kali masuk.
                </p>
                <button
                  onClick={handleEnable}
                  disabled={busy}
                  className="btn btn-primary w-full py-2.5"
                >
                  {busy ? 'Mengirim…' : 'Aktifkan 2 langkah'}
                </button>
              </>
            )}
          </div>
        )}

        {step === 'code' && (
          <form onSubmit={handleConfirm} className="mt-4 space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Masukkan kode 6 digit yang dikirim ke email kamu.
            </p>
            <input
              className="input text-center text-2xl tracking-[0.5em]"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="••••••"
              autoFocus
              required
            />
            <button type="submit" disabled={busy} className="btn btn-primary w-full py-2.5">
              {busy ? 'Memverifikasi…' : 'Konfirmasi'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('idle');
                setCode('');
                setError('');
                setNotice('');
              }}
              className="btn btn-secondary w-full py-2.5"
            >
              Batal
            </button>
          </form>
        )}

        {step === 'disable' && (
          <form onSubmit={handleDisable} className="mt-4 space-y-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Masukkan password kamu untuk menonaktifkan verifikasi 2 langkah.
            </p>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password saat ini"
                autoFocus
                required
              />
            </div>
            <button type="submit" disabled={busy} className="btn btn-secondary w-full py-2.5">
              {busy ? 'Memproses…' : 'Nonaktifkan'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('idle');
                setPassword('');
                setError('');
                setNotice('');
              }}
              className="btn btn-ghost w-full py-2.5"
            >
              Batal
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
