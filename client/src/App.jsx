import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CircleHelp,
  Clock,
  DatabaseBackup,
  Download,
  LogOut,
  MailWarning,
  Menu,
  Monitor,
  Moon,
  Printer,
  RotateCcw,
  Sun,
  Upload,
  Wallet,
  X,
} from 'lucide-react';
import {
  AUTH_UNAUTHORIZED_EVENT,
  addAccount,
  addRecurring,
  addTransaction,
  addTransfer,
  clearToken,
  deleteAccount,
  deleteCategoryBudget,
  deleteRecurring,
  deleteTransaction,
  deleteTransfer,
  exchangeGithubCode,
  getAccounts,
  getAuthConfig,
  getBackup,
  getCategories,
  getCategoryMonthlyReport,
  getMe,
  getRecurring,
  getSummary,
  getToken,
  getTransactions,
  getTransfers,
  importTransactions,
  logout,
  resendVerification,
  restoreBackup,
  setBudget,
  setCategoryBudget,
  setSavingsGoal,
  setToken,
  toggleRecurring,
  updateTransaction,
  updateTransfer,
  verifyEmail,
} from './api';
import { todayLocal } from './format';
import AuthScreen from './AuthScreen';
import SummaryCards from './components/SummaryCards';
import LoadingScreen from './components/LoadingScreen';
import TransactionForm from './components/TransactionForm';
import TransactionList from './components/TransactionList';
// Chart memakai Recharts (paket besar) → dimuat terpisah agar bundle awal ringan
const MonthlyChart = lazy(() => import('./components/MonthlyChart'));
const BalanceTrendChart = lazy(() => import('./components/BalanceTrendChart'));
const CategoryChart = lazy(() => import('./components/CategoryChart'));
import BudgetCard from './components/BudgetCard';
import SavingsGoalCard from './components/SavingsGoalCard';
import CategoryBudgetCard from './components/CategoryBudgetCard';
import CategoryReport from './components/CategoryReport';
import SavingsRateCard from './components/SavingsRateCard';
import StatsCard from './components/StatsCard';
import AccountsCard from './components/AccountsCard';
import RecurringCard from './components/RecurringCard';
import TutorialDialog from './components/TutorialDialog';

// Ringkasan kosong — dipakai saat pertama kali memuat dan sesudah keluar akun.
const EMPTY_SUMMARY = {
  income: 0,
  expense: 0,
  balance: 0,
  savingsGoal: 0,
  categoryBudgets: [],
  categoryExpenses: [],
  monthly: [],
  balanceTrend: [],
  stats: { avgDailyExpense: 0, largestTransaction: null, trend: { current: 0, last: 0 } },
};

// Pesan untuk kode galat yang dikirim server lewat ?authError=...
const AUTH_ERRORS = {
  github_tidak_aktif: 'Login GitHub belum dikonfigurasi di server ini.',
  github_ditolak: 'Akses ke akun GitHub dibatalkan.',
  github_state_tidak_valid: 'Sesi login GitHub kedaluwarsa. Silakan coba lagi.',
  github_tidak_anggota: 'Akun GitHub kamu bukan anggota organisasi yang diizinkan.',
  github_gagal: 'Login dengan GitHub gagal. Silakan coba lagi.',
  default: 'Login gagal. Silakan coba lagi.',
};

export default function App() {
  // Status sesi: 'checking' (memeriksa token tersimpan), 'anon', atau 'user'
  const [auth, setAuth] = useState({ status: 'checking', user: null });
  const [authConfig, setAuthConfig] = useState(null);
  const [authNotice, setAuthNotice] = useState('');
  const [authError, setAuthError] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resendingVerification, setResendingVerification] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [categories, setCategories] = useState({ income: [], expense: [] });
  const [categoryReport, setCategoryReport] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [month, setMonth] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Penjaga respons usang: hanya respons dari permintaan terakhir yang dipakai
  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [notice, setNotice] = useState('');
  const restoreInputRef = useRef(null);
  const importInputRef = useRef(null);
  const headerRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dataMenuOpen, setDataMenuOpen] = useState(false);
  const [mobileDataOpen, setMobileDataOpen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {}
    return 'system';
  });
  const [systemDark, setSystemDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  );
  const effectiveTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;

  // Transisi warna halus saat tema berganti (dilewati pada render pertama)
  const themeReadyRef = useRef(false);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark');
    try {
      localStorage.setItem('theme', theme);
    } catch {}
    if (!themeReadyRef.current) {
      themeReadyRef.current = true;
      return undefined;
    }
    const root = document.documentElement;
    root.classList.add('theme-transition');
    const timer = setTimeout(() => root.classList.remove('theme-transition'), 280);
    return () => clearTimeout(timer);
  }, [effectiveTheme, theme]);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Tutup menu navigasi & dropdown saat klik di luar atau tekan Escape
  useEffect(() => {
    if (!menuOpen && !dataMenuOpen && !mobileDataOpen) return undefined;
    const onPointerDown = (e) => {
      if (headerRef.current && !headerRef.current.contains(e.target)) {
        setMenuOpen(false);
        setDataMenuOpen(false);
        setMobileDataOpen(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setDataMenuOpen(false);
        setMobileDataOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, dataMenuOpen, mobileDataOpen]);

  // Tutup submenu Data di menu mobile saat menu utama ditutup
  useEffect(() => {
    if (!menuOpen) setMobileDataOpen(false);
  }, [menuOpen]);

  // Bootstrap: tangani parameter URL (reset password, konfirmasi email, kode
  // OAuth, pesan galat) lalu periksa sesi yang tersimpan.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(window.location.search);

    // Bersihkan query string supaya token tidak tertinggal di address bar
    const clearUrl = () => window.history.replaceState({}, '', window.location.pathname);

    async function start() {
      const config = await getAuthConfig().catch(() => null);
      if (cancelled) return;
      setAuthConfig(config);

      const errorCode = params.get('authError');
      if (errorCode) {
        setAuthError(AUTH_ERRORS[errorCode] || AUTH_ERRORS.default);
        clearUrl();
      }

      const githubCode = params.get('github_code');
      if (githubCode) {
        try {
          const data = await exchangeGithubCode(githubCode);
          setToken(data.token);
          if (cancelled) return;
          setAuthError('');
          setAuth({ status: 'user', user: data.user });
          setShowTutorial(true);
        } catch (err) {
          if (!cancelled) setAuthError(err.message);
        }
        clearUrl();
        return;
      }

      const verifyToken = params.get('verify');
      if (verifyToken) {
        try {
          const { user } = await verifyEmail(verifyToken);
          if (cancelled) return;
          setAuthNotice('Email berhasil dikonfirmasi. Terima kasih!');
          setAuth((prev) =>
            prev.status === 'user' || getToken() ? { status: 'user', user } : prev
          );
        } catch (err) {
          if (!cancelled) setAuthError(err.message);
        }
        clearUrl();
      }

      const reset = params.get('reset');
      if (reset) {
        if (!cancelled) {
          setResetToken(reset);
          setAuth({ status: 'anon', user: null });
        }
        return;
      }

      if (!getToken()) {
        if (!cancelled) setAuth({ status: 'anon', user: null });
        return;
      }
      try {
        const { user } = await getMe();
        if (!cancelled) setAuth({ status: 'user', user });
      } catch {
        if (!cancelled) setAuth({ status: 'anon', user: null });
      }
    }

    start();
    return () => {
      cancelled = true;
    };
  }, []);

  // Server menolak token (kadaluarsa / dicabut) → kembali ke layar masuk
  useEffect(() => {
    const onUnauthorized = () => {
      setAuthNotice('Sesi kamu berakhir. Silakan masuk kembali.');
      setAuth((prev) => (prev.status === 'user' ? { status: 'anon', user: null } : prev));
    };
    window.addEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(AUTH_UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const handleAuthenticated = useCallback((user) => {
    setAuthNotice('');
    setAuthError('');
    setError('');
    setNotice('');
    hasLoadedRef.current = false;
    setLoading(true);
    setAuth({ status: 'user', user });
    setShowTutorial(true);
  }, []);

  // Selesai memakai tautan reset → bersihkan token dari URL
  const handleResetDone = useCallback(() => {
    setResetToken('');
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  async function handleResendVerification() {
    setResendingVerification(true);
    setError('');
    setNotice('');
    try {
      const res = await resendVerification();
      if (res.alreadyVerified) {
        setAuth((prev) => ({ ...prev, user: { ...prev.user, emailVerified: true } }));
        setNotice('Email kamu sudah terverifikasi.');
      } else if (res.sent) {
        setNotice('Tautan konfirmasi sudah dikirim. Periksa kotak masuk emailmu.');
      } else {
        setNotice(
          'Pengiriman email belum dikonfigurasi di server ini, jadi tautan konfirmasi dicetak pada log server.'
        );
      }
    } catch (err) {
      setError(err.message || 'Gagal mengirim tautan konfirmasi');
    } finally {
      setResendingVerification(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // Token mungkin sudah tidak berlaku — keluar dari aplikasi tetap dilanjutkan
    }
    clearToken();
    // Buang sisa data pengguna sebelumnya agar tidak sempat terlihat akun berikutnya
    requestIdRef.current += 1;
    hasLoadedRef.current = false;
    setTransactions([]);
    setAccounts([]);
    setTransfers([]);
    setRecurring([]);
    setCategories({ income: [], expense: [] });
    setCategoryReport([]);
    setSummary(EMPTY_SUMMARY);
    setEditing(null);
    setError('');
    setNotice('');
    setAuthNotice('');
    setLoading(true);
    setAuth({ status: 'anon', user: null });
  }

  const loadData = useCallback(async () => {
    const id = ++requestIdRef.current;
    const isReload = hasLoadedRef.current;
    const startedAt = Date.now();
    if (isReload) setRefreshing(true);
    try {
      const [tx, sum, accs, trfs, recs, cats, report] = await Promise.all([
        getTransactions({ month, from, to }),
        getSummary(),
        getAccounts(),
        getTransfers(),
        getRecurring(),
        getCategories(),
        getCategoryMonthlyReport(),
      ]);
      if (id !== requestIdRef.current) return;
      setTransactions(tx);
      setSummary(sum);
      setAccounts(accs);
      setTransfers(trfs);
      setRecurring(recs);
      setCategories(cats);
      setCategoryReport(report);
      setError('');
    } catch (err) {
      if (id !== requestIdRef.current) return;
      setError(err.message);
    } finally {
      if (id === requestIdRef.current) {
        // Splash screen diberi waktu minimal 2,2 detik hanya pada pemuatan pertama
        const wait = isReload ? 0 : Math.max(0, 2200 - (Date.now() - startedAt));
        setTimeout(() => {
          if (id !== requestIdRef.current) return;
          hasLoadedRef.current = true;
          setLoading(false);
          setRefreshing(false);
        }, wait);
      }
    }
  }, [month, from, to]);

  useEffect(() => {
    if (auth.status === 'user') loadData();
  }, [auth.status, loadData]);

  // Semua aksi tulis lewat sini: muat ulang data, tampilkan kegagalan di banner
  // global, lalu teruskan error ke komponen agar pesannya muncul di tempat aksi.
  const runAction = useCallback(
    async (action) => {
      try {
        await action();
        await loadData();
      } catch (err) {
        setError(err.message || 'Terjadi kesalahan');
        throw err;
      }
    },
    [loadData]
  );

  const handleAdd = (data) => runAction(() => addTransaction(data));

  const handleDelete = (id) => runAction(() => deleteTransaction(id));

  const handleUpdate = (id, data) =>
    runAction(async () => {
      await updateTransaction(id, data);
      setEditing(null);
    });

  const handleSaveBudget = (amount) => runAction(() => setBudget(amount));

  const handleSaveCategoryBudget = (category, amount) =>
    runAction(() => setCategoryBudget(category, amount));

  const handleDeleteCategoryBudget = (category) =>
    runAction(() => deleteCategoryBudget(category));

  const handleAddAccount = (name, initial, kind) =>
    runAction(() => addAccount(name, initial, kind));

  const handleDeleteAccount = (id) => runAction(() => deleteAccount(id));

  const handleTransfer = (data) => runAction(() => addTransfer(data));

  const handleUpdateTransfer = (id, data) => runAction(() => updateTransfer(id, data));

  const handleDeleteTransfer = (id) => runAction(() => deleteTransfer(id));

  const handleAddRecurring = (data) => runAction(() => addRecurring(data));

  const handleToggleRecurring = (id, active) => runAction(() => toggleRecurring(id, active));

  const handleDeleteRecurring = (id) => runAction(() => deleteRecurring(id));

  const handleSaveSavingsGoal = (amount) => runAction(() => setSavingsGoal(amount));

  async function handleBackup() {
    try {
      const data = await getBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-keuangan-${todayLocal()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRestoreFile(file) {
    if (!file) return;
    setRestoring(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await restoreBackup(data);
      setMonth('');
      setFrom('');
      setTo('');
      await loadData();
    } catch (err) {
      setError(err.message || 'File backup tidak valid');
    } finally {
      setRestoring(false);
      if (restoreInputRef.current) restoreInputRef.current.value = '';
    }
  }

  async function handleImportCSV(file) {
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length < 2) throw new Error('File CSV kosong');
      const header = rows[0].map((h) => h.trim().toLowerCase());
      const idxDate = header.indexOf('tanggal');
      const idxType = header.indexOf('tipe');
      const idxCat = header.indexOf('kategori');
      const idxDesc = header.indexOf('keterangan');
      const idxAmount = header.indexOf('nominal');
      if (idxDate < 0 || idxAmount < 0) {
        throw new Error('Header CSV tidak dikenali (butuh kolom Tanggal & Nominal)');
      }
      const transactions = rows
        .slice(1)
        .map((r) => ({
          date: String(r[idxDate] || '').trim(),
          type:
            String(r[idxType] || '').trim().toLowerCase() === 'pemasukan'
              ? 'income'
              : 'expense',
          category: String(r[idxCat] || '').trim(),
          description: String(r[idxDesc] || '').trim(),
          amount: Number(String(r[idxAmount] || '').replace(/[^\d.-]/g, '')),
        }))
        .filter((t) => t.date && t.amount > 0);
      if (transactions.length === 0) throw new Error('Tidak ada baris transaksi yang valid');
      const result = await importTransactions(transactions);
      setNotice(`${result.imported} transaksi berhasil diimpor`);
      setError('');
      await loadData();
    } catch (err) {
      setError(err.message || 'Gagal import CSV');
      setNotice('');
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
    }
  }

  function handleExportCSV() {
    const header = ['Tanggal', 'Tipe', 'Kategori', 'Keterangan', 'Nominal'];
    const rows = transactions.map((t) => [
      t.date,
      t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      t.category || '',
      t.description || '',
      t.amount,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transaksi-${month || 'semua'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleEdit(t) {
    setEditing(t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function handleCancelEdit() {
    setEditing(null);
  }

  // Ringkasan mengikuti filter bulan (dihitung dari transaksi yang sudah difilter)
  const totals = useMemo(() => {
    const income = transactions
      .filter((t) => t.type === 'income')
      .reduce((s, t) => s + Number(t.amount), 0);
    const expense = transactions
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + Number(t.amount), 0);
    return { income, expense, balance: income - expense };
  }, [transactions]);

  const periodLabel =
    from || to
      ? `${from ? shortDate(from) : '…'} – ${to ? shortDate(to) : '…'}`
      : month
        ? monthLabel(month)
        : 'Semua data';

  const dueReminders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return recurring
      .filter((r) => r.active && r.next_date)
      .map((r) => ({ ...r, days: diffDays(today, r.next_date) }))
      .filter((r) => r.days <= 3)
      .sort((a, b) => a.days - b.days);
  }, [recurring]);

  // Inisial untuk avatar pengguna di navbar
  const userInitial = useMemo(() => {
    const source = (auth.user?.name || auth.user?.email || '').trim();
    return (source[0] || '?').toUpperCase();
  }, [auth.user]);

  // Gerbang autentikasi: belum tahu status sesi → splash; belum masuk → layar masuk
  if (auth.status === 'checking') {
    return <LoadingScreen />;
  }

  // Verifikasi email diwajibkan (server mengaktifkannya lewat REQUIRE_EMAIL_VERIFICATION)
  if (auth.user && authConfig?.requireVerification && !auth.user.emailVerified) {
    return (
      <VerifyEmailScreen
        user={auth.user}
        emailConfigured={Boolean(authConfig.email)}
        onResend={handleResendVerification}
        onLogout={handleLogout}
      />
    );
  }

  if (auth.status === 'anon') {
    return (
      <AuthScreen
        config={authConfig}
        notice={authNotice}
        authError={authError}
        resetToken={resetToken}
        onAuthenticated={handleAuthenticated}
        onNotice={setAuthNotice}
        onResetDone={handleResetDone}
      />
    );
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <div className="min-h-screen text-slate-800 print:bg-white dark:bg-slate-950 dark:text-slate-200">
      {refreshing && (
        <div
          role="progressbar"
          aria-label="Memuat data"
          className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-indigo-100 print:hidden dark:bg-slate-800"
        >
          <div className="animate-indeterminate h-full w-1/3 bg-indigo-500" />
        </div>
      )}
      <header
        ref={headerRef}
        className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl print:static print:border-none dark:border-slate-800 dark:bg-slate-900/80"
      >
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30 sm:h-11 sm:w-11">
                <Wallet className="h-5 w-5 sm:h-6 sm:w-6" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                  Catatan Keuangan
                </h1>
                <p className="truncate text-xs font-medium text-slate-400 sm:text-sm">
                  Kelola pemasukan &amp; pengeluaranmu dengan rapi
                </p>
              </div>
            </div>

            {/* Aksi header — layar lebar */}
            <div className="hidden shrink-0 flex-wrap items-center justify-end gap-2 print:hidden lg:flex">
              <button
                onClick={() => setShowTutorial(true)}
                className="btn btn-secondary px-3 py-2"
                title="Tutorial penggunaan"
                aria-label="Buka tutorial penggunaan"
              >
                <CircleHelp className="h-4 w-4" /> Bantuan
              </button>
              <button
                onClick={() =>
                  setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')
                }
                className="btn btn-secondary px-2.5 py-2"
                aria-label={`Ganti tema (sekarang: ${
                  theme === 'light' ? 'terang' : theme === 'dark' ? 'gelap' : 'otomatis'
                })`}
                title={
                  theme === 'light'
                    ? 'Tema: Terang'
                    : theme === 'dark'
                      ? 'Tema: Gelap'
                      : 'Tema: Otomatis (ikut sistem)'
                }
              >
                {theme === 'light' ? (
                  <Sun className="h-4 w-4" />
                ) : theme === 'dark' ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Monitor className="h-4 w-4" />
                )}
              </button>
              <div className="relative">
                <button
                  onClick={() => setDataMenuOpen((open) => !open)}
                  className="btn btn-secondary px-3 py-2"
                  aria-expanded={dataMenuOpen}
                  aria-haspopup="menu"
                  aria-controls="data-menu"
                  title="Data & cadangan"
                >
                  <DatabaseBackup className="h-4 w-4" /> Data
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${dataMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {dataMenuOpen && (
                  <div
                    id="data-menu"
                    role="menu"
                    className="absolute right-0 top-full z-50 mt-2 w-60 animate-menu-in overflow-hidden rounded-xl border border-slate-200/70 bg-white p-1.5 shadow-xl dark:border-slate-700/60 dark:bg-slate-800"
                  >
                    <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Data &amp; Cadangan
                    </p>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setDataMenuOpen(false);
                        handleExportCSV();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Download className="h-4 w-4 text-slate-400" /> Ekspor CSV
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setDataMenuOpen(false);
                        window.print();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Printer className="h-4 w-4 text-slate-400" /> Ekspor PDF
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setDataMenuOpen(false);
                        importInputRef.current?.click();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Upload className="h-4 w-4 text-slate-400" /> Import CSV
                    </button>
                    <div className="my-1 h-px bg-slate-100 dark:bg-slate-700" />
                    <button
                      role="menuitem"
                      onClick={() => {
                        setDataMenuOpen(false);
                        handleBackup();
                      }}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <DatabaseBackup className="h-4 w-4 text-slate-400" /> Backup Data
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => {
                        setDataMenuOpen(false);
                        restoreInputRef.current?.click();
                      }}
                      disabled={restoring}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <RotateCcw className="h-4 w-4 text-slate-400" />{' '}
                      {restoring ? 'Memulihkan...' : 'Restore Data'}
                    </button>
                  </div>
                )}
              </div>
              <input
                ref={restoreInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => handleRestoreFile(e.target.files?.[0])}
              />
              <input
                ref={importInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleImportCSV(e.target.files?.[0])}
              />
              <span className="mx-0.5 hidden h-8 w-px bg-slate-200 sm:block dark:bg-slate-700" />
              <span className="hidden items-center gap-2.5 sm:flex">
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white shadow-sm ring-2 ring-white/60 dark:ring-white/10"
                >
                  {userInitial}
                </span>
                <span className="min-w-0 text-left">
                  <span className="block max-w-[12rem] truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                    {auth.user?.name || auth.user?.email}
                  </span>
                  <span className="block max-w-[12rem] truncate text-xs text-slate-400 dark:text-slate-500">
                    {auth.user?.email}
                  </span>
                </span>
              </span>
              <button
                onClick={handleLogout}
                className="btn btn-secondary px-3 py-2"
                title="Keluar dari akun"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Keluar</span>
              </button>
            </div>

            {/* Tombol menu — layar kecil */}
            <button
              onClick={() => setMenuOpen((open) => !open)}
              className="btn btn-secondary shrink-0 px-3 py-2 print:hidden lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              aria-label={menuOpen ? 'Tutup menu' : 'Buka menu'}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>

          {menuOpen && (
            <nav
              id="mobile-menu"
              className="mt-3 animate-menu-in rounded-2xl border border-slate-200/70 bg-white p-3 shadow-lg print:hidden lg:hidden dark:border-slate-700/60 dark:bg-slate-800"
            >
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setShowTutorial(true);
                }}
                className="btn btn-primary w-full px-3 py-2.5"
              >
                <CircleHelp className="h-4 w-4" /> Bantuan &amp; Tutorial
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light');
                    setMenuOpen(false);
                  }}
                  className="btn btn-secondary px-3 py-2.5"
                >
                  {theme === 'light' ? (
                    <Sun className="h-4 w-4" />
                  ) : theme === 'dark' ? (
                    <Moon className="h-4 w-4" />
                  ) : (
                    <Monitor className="h-4 w-4" />
                  )}
                  Tema
                </button>
                <button
                  onClick={() => setMobileDataOpen((open) => !open)}
                  className="btn btn-secondary px-3 py-2.5"
                  aria-expanded={mobileDataOpen}
                  aria-controls="mobile-data-menu"
                >
                  <DatabaseBackup className="h-4 w-4" /> Data
                  <ChevronDown
                    className={`h-4 w-4 transition-transform duration-200 ${mobileDataOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </div>
              {mobileDataOpen && (
                <div
                  id="mobile-data-menu"
                  className="mt-2 space-y-1.5 border-t border-slate-200/70 pt-2 dark:border-slate-700/60"
                >
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setMobileDataOpen(false);
                      handleExportCSV();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Download className="h-4 w-4 text-slate-400" /> Ekspor CSV
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setMobileDataOpen(false);
                      window.print();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Printer className="h-4 w-4 text-slate-400" /> Ekspor PDF
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setMobileDataOpen(false);
                      importInputRef.current?.click();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Upload className="h-4 w-4 text-slate-400" /> Import CSV
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setMobileDataOpen(false);
                      handleBackup();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <DatabaseBackup className="h-4 w-4 text-slate-400" /> Backup Data
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setMobileDataOpen(false);
                      restoreInputRef.current?.click();
                    }}
                    disabled={restoring}
                    className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <RotateCcw className="h-4 w-4 text-slate-400" />{' '}
                    {restoring ? 'Memulihkan...' : 'Restore Data'}
                  </button>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-3 dark:border-slate-700/60">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-base font-bold text-white shadow-sm ring-2 ring-white/60 dark:ring-white/10"
                  >
                    {userInitial}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {auth.user?.name || auth.user?.email}
                    </span>
                    <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                      {auth.user?.email}
                    </span>
                  </span>
                </span>
                <button onClick={handleLogout} className="btn btn-secondary shrink-0 px-3 py-2">
                  <LogOut className="h-4 w-4" /> Keluar
                </button>
              </div>
            </nav>
          )}

          <p className="mt-2 hidden text-sm text-slate-500 print:block">
            Dicetak pada{' '}
            {new Date().toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        </div>
      </header>

      <main
        aria-busy={refreshing}
        className={`mx-auto max-w-6xl space-y-6 px-4 py-8 transition-opacity sm:px-6 ${
          refreshing ? 'opacity-60' : 'opacity-100'
        }`}
      >
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 print:hidden dark:border-rose-900/50 dark:bg-rose-950/60 dark:text-rose-300">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 print:hidden dark:border-emerald-900/50 dark:bg-emerald-950/60 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {auth.user && !auth.user.emailVerified && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 print:hidden dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300">
            <MailWarning className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              Email <span className="font-semibold">{auth.user.email}</span> belum dikonfirmasi.{' '}
              {authConfig?.email
                ? 'Periksa kotak masukmu untuk tautan konfirmasi.'
                : 'Pengiriman email belum diaktifkan di server ini.'}
            </span>
            <button
              onClick={handleResendVerification}
              disabled={resendingVerification}
              className="btn btn-secondary px-3 py-1.5 text-xs"
            >
              {resendingVerification ? 'Mengirim…' : 'Kirim ulang tautan'}
            </button>
          </div>
        )}

        {dueReminders.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 print:hidden dark:border-amber-900/50 dark:bg-amber-950/50 dark:text-amber-300">
            <Clock className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {dueReminders.length} tagihan jatuh tempo:{' '}
              {dueReminders
                .map(
                  (r) =>
                    `${r.category || 'Tanpa kategori'} ${
                      r.days < 0
                        ? `(terlambat ${-r.days} hari)`
                        : r.days === 0
                          ? '(hari ini)'
                          : `(${r.days} hari lagi)`
                    }`
                )
                .join(', ')}
            </span>
          </div>
        )}

        <SummaryCards summary={totals} periodLabel={periodLabel} balance={summary.balance} />

        <div className="print:hidden">
          <StatsCard stats={summary.stats} />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 print:hidden">
          <BudgetCard
            monthExpense={summary.monthExpense}
            budget={summary.budget}
            onSave={handleSaveBudget}
          />
          <SavingsGoalCard
            balance={summary.balance}
            goal={summary.savingsGoal}
            onSave={handleSaveSavingsGoal}
          />
          <CategoryBudgetCard
            budgets={summary.categoryBudgets || []}
            expenses={summary.categoryExpenses || []}
            categories={categories.expense}
            onReload={loadData}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CategoryReport data={categoryReport} />
          </div>
          <SavingsRateCard
            income={totals.income}
            expense={totals.expense}
            monthly={summary.monthly || []}
            periodLabel={periodLabel}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 print:hidden">
            <TransactionForm
              onAdd={handleAdd}
              onUpdate={handleUpdate}
              editing={editing}
              onCancelEdit={handleCancelEdit}
              accounts={accounts}
              onCategoriesChanged={loadData}
            />
            <AccountsCard
              accounts={accounts}
              transfers={transfers}
              onAdd={handleAddAccount}
              onDelete={handleDeleteAccount}
              onTransfer={handleTransfer}
              onUpdateTransfer={handleUpdateTransfer}
              onDeleteTransfer={handleDeleteTransfer}
            />
            <RecurringCard
              recurring={recurring}
              accounts={accounts}
              onAdd={handleAddRecurring}
              onToggle={handleToggleRecurring}
              onDelete={handleDeleteRecurring}
            />
          </div>
          <div className="space-y-6 lg:col-span-2 print:space-y-0">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 print:hidden">
              <Suspense fallback={<ChartSkeleton />}>
                <MonthlyChart data={summary.monthly} />
              </Suspense>
              <Suspense fallback={<ChartSkeleton />}>
                <CategoryChart transactions={transactions} />
              </Suspense>
            </div>
            <div className="print:hidden">
              <Suspense fallback={<ChartSkeleton />}>
                <BalanceTrendChart data={summary.balanceTrend} />
              </Suspense>
            </div>
            <TransactionList
              transactions={transactions}
              categories={categories}
              month={month}
              setMonth={setMonth}
              from={from}
              setFrom={setFrom}
              to={to}
              setTo={setTo}
              loading={loading}
              refreshing={refreshing}
              onDelete={handleDelete}
              onEdit={handleEdit}
              onTrashChanged={loadData}
            />
          </div>
        </div>
      </main>

      <TutorialDialog open={showTutorial} onClose={() => setShowTutorial(false)} />
    </div>
  );
}

// Layar wajib konfirmasi email (aktif hanya bila REQUIRE_EMAIL_VERIFICATION=1)
function VerifyEmailScreen({ user, emailConfigured, onResend, onLogout }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <div className="card w-full max-w-md p-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-500/30">
          <MailWarning className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Konfirmasi email kamu
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          Kami sudah mengirim tautan konfirmasi ke{' '}
          <span className="font-semibold text-slate-700 dark:text-slate-200">{user.email}</span>.
          Buka tautan itu untuk mulai memakai aplikasi.
        </p>
        {!emailConfigured && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            Catatan: pengiriman email belum dikonfigurasi di server, jadi tautan dicetak pada log
            server.
          </p>
        )}
        <div className="mt-5 space-y-2">
          <button onClick={onResend} className="btn btn-primary w-full py-2.5">
            Kirim ulang tautan konfirmasi
          </button>
          <button onClick={onLogout} className="btn btn-secondary w-full py-2.5">
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </div>
      </div>
    </div>
  );
}

// Placeholder saat chunk chart sedang diunduh
function ChartSkeleton() {
  return (
    <div className="card flex min-h-[16rem] items-center justify-center p-5">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
    </div>
  );
}

function monthLabel(m) {
  const [y, mo] = m.split('-');
  return new Date(Number(y), Number(mo) - 1, 1).toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
}

function shortDate(d) {
  const [y, mo, day] = d.split('-');
  return `${Number(day)}/${Number(mo)}/${y}`;
}

function diffDays(fromDate, dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target - fromDate) / 86400000);
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}
