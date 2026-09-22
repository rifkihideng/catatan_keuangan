import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  CircleAlert,
  Clock,
  DatabaseBackup,
  Download,
  Monitor,
  Moon,
  Printer,
  RotateCcw,
  Sun,
  Upload,
  Wallet,
} from 'lucide-react';
import {
  addAccount,
  addRecurring,
  addTransaction,
  addTransfer,
  deleteAccount,
  deleteCategoryBudget,
  deleteRecurring,
  deleteTransaction,
  deleteTransfer,
  getAccounts,
  getBackup,
  getCategories,
  getCategoryMonthlyReport,
  getRecurring,
  getSummary,
  getTransactions,
  getTransfers,
  importTransactions,
  restoreBackup,
  setBudget,
  setCategoryBudget,
  setSavingsGoal,
  toggleRecurring,
  updateTransaction,
  updateTransfer,
} from './api';
import { todayLocal } from './format';
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

export default function App() {
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [recurring, setRecurring] = useState([]);
  const [categories, setCategories] = useState({ income: [], expense: [] });
  const [categoryReport, setCategoryReport] = useState([]);
  const [summary, setSummary] = useState({
    income: 0,
    expense: 0,
    balance: 0,
    savingsGoal: 0,
    categoryBudgets: [],
    categoryExpenses: [],
    monthly: [],
    balanceTrend: [],
    stats: { avgDailyExpense: 0, largestTransaction: null, trend: { current: 0, last: 0 } },
  });
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
    loadData();
  }, [loadData]);

  async function handleAdd(data) {
    await addTransaction(data);
    await loadData();
  }

  async function handleDelete(id) {
    await deleteTransaction(id);
    await loadData();
  }

  async function handleUpdate(id, data) {
    await updateTransaction(id, data);
    setEditing(null);
    await loadData();
  }

  async function handleSaveBudget(amount) {
    await setBudget(amount);
    await loadData();
  }

  async function handleSaveCategoryBudget(category, amount) {
    await setCategoryBudget(category, amount);
    await loadData();
  }

  async function handleDeleteCategoryBudget(category) {
    await deleteCategoryBudget(category);
    await loadData();
  }

  async function handleAddAccount(name, initial, kind) {
    await addAccount(name, initial, kind);
    await loadData();
  }

  async function handleDeleteAccount(id) {
    await deleteAccount(id);
    await loadData();
  }

  async function handleTransfer(data) {
    await addTransfer(data);
    await loadData();
  }

  async function handleUpdateTransfer(id, data) {
    await updateTransfer(id, data);
    await loadData();
  }

  async function handleDeleteTransfer(id) {
    await deleteTransfer(id);
    await loadData();
  }

  async function handleAddRecurring(data) {
    await addRecurring(data);
    await loadData();
  }

  async function handleToggleRecurring(id, active) {
    await toggleRecurring(id, active);
    await loadData();
  }

  async function handleDeleteRecurring(id) {
    await deleteRecurring(id);
    await loadData();
  }

  async function handleSaveSavingsGoal(amount) {
    await setSavingsGoal(amount);
    await loadData();
  }

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
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur-xl print:static print:border-none dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-500/30">
                <Wallet className="h-6 w-6" />
              </span>
              <div>
                <h1 className="text-xl font-extrabold tracking-tight text-slate-900 sm:text-2xl dark:text-white">
                  Catatan Keuangan
                </h1>
                <p className="text-xs font-medium text-slate-400 sm:text-sm">
                  Kelola pemasukan &amp; pengeluaranmu dengan rapi
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 print:hidden">
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
              <button onClick={handleExportCSV} className="btn btn-secondary px-3 py-2">
                <Download className="h-4 w-4" /> CSV
              </button>
              <button onClick={() => window.print()} className="btn btn-secondary px-3 py-2">
                <Printer className="h-4 w-4" /> PDF
              </button>
              <button onClick={handleBackup} className="btn btn-secondary px-3 py-2">
                <DatabaseBackup className="h-4 w-4" /> Backup
              </button>
              <button
                onClick={() => restoreInputRef.current?.click()}
                disabled={restoring}
                className="btn btn-secondary px-3 py-2"
              >
                <RotateCcw className="h-4 w-4" /> {restoring ? 'Memulihkan...' : 'Restore'}
              </button>
              <button onClick={() => importInputRef.current?.click()} className="btn btn-secondary px-3 py-2">
                <Upload className="h-4 w-4" /> Import
              </button>
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
            </div>
          </div>
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
