import { useMemo, useState } from 'react';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Inbox,
  Pencil,
  Search,
  SearchX,
  Trash2,
  X,
} from 'lucide-react';
import { formatRupiah } from '../format';
import ConfirmDialog from './ConfirmDialog';
import TrashDialog from './TrashDialog';

export default function TransactionList({
  transactions,
  categories = { income: [], expense: [] },
  month,
  setMonth,
  from,
  setFrom,
  to,
  setTo,
  loading,
  onDelete,
  onEdit,
  onTrashChanged,
}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);

  const allCategories = useMemo(
    () =>
      [...new Set([...(categories.income || []), ...(categories.expense || [])])].sort((a, b) =>
        a.localeCompare(b, 'id')
      ),
    [categories]
  );

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    let list = transactions;
    if (query) {
      list = list.filter(
        (t) =>
          (t.category || '').toLowerCase().includes(query) ||
          (t.description || '').toLowerCase().includes(query)
      );
    }
    if (category) {
      list = list.filter((t) => (t.category || '') === category);
    }
    const dir = sort.endsWith('-desc') ? -1 : 1;
    const field = sort.startsWith('date')
      ? 'date'
      : sort.startsWith('amount')
        ? 'amount'
        : 'category';
    return [...list].sort((a, b) => {
      let va;
      let vb;
      if (field === 'date') {
        va = a.date;
        vb = b.date;
      } else if (field === 'amount') {
        va = Number(a.amount);
        vb = Number(b.amount);
      } else {
        va = (a.category || '').toLowerCase();
        vb = (b.category || '').toLowerCase();
      }
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  }, [transactions, query, category, sort]);

  async function confirmDelete() {
    if (!pending) return;
    setDeleting(true);
    try {
      await onDelete(pending.id);
      setPending(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="card p-5 print:border-none print:p-0 print:shadow-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900">Riwayat Transaksi</h2>
          {!loading && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
              {transactions.length}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2 print:hidden lg:flex-row lg:flex-wrap lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari transaksi..."
              className="w-48 rounded-xl border border-slate-300 bg-white py-1.5 pl-8 pr-3 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            title="Filter kategori"
          >
            <option value="">Semua kategori</option>
            {allCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            title="Urutkan"
          >
            <option value="date-desc">Tanggal (terbaru)</option>
            <option value="date-asc">Tanggal (terlama)</option>
            <option value="amount-desc">Nominal (terbesar)</option>
            <option value="amount-asc">Nominal (terkecil)</option>
            <option value="category-asc">Kategori (A–Z)</option>
            <option value="category-desc">Kategori (Z–A)</option>
          </select>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="month"
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                if (e.target.value) {
                  setFrom('');
                  setTo('');
                }
              }}
              className="w-40 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              title="Filter per bulan"
            />
            <span className="text-xs text-slate-400">atau</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value) setMonth('');
              }}
              className="w-40 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              title="Dari tanggal"
            />
            <span className="text-xs text-slate-400">–</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                if (e.target.value) setMonth('');
              }}
              className="w-40 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              title="Sampai tanggal"
            />
            {(month || from || to || category || search) && (
              <button
                onClick={() => {
                  setMonth('');
                  setFrom('');
                  setTo('');
                  setCategory('');
                  setSearch('');
                }}
                className="rounded-xl border border-slate-300 px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-50"
                title="Reset filter"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setTrashOpen(true)}
              className="rounded-xl border border-slate-300 px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-50"
              title="Recycle bin"
            >
              <Archive className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-2 py-10 text-slate-400">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
          <p className="text-sm">Memuat...</p>
        </div>
      ) : transactions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Inbox className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-slate-500">Belum ada transaksi</p>
          <p className="text-xs text-slate-400">Tambahkan transaksi pertamamu di form sebelah kiri.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <SearchX className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium text-slate-500">Tidak ada hasil untuk filter ini</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {filtered.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    t.type === 'income'
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'bg-rose-100 text-rose-600'
                  }`}
                >
                  {t.type === 'income' ? (
                    <ArrowUp className="h-5 w-5" />
                  ) : (
                    <ArrowDown className="h-5 w-5" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.category || 'Tanpa kategori'}</p>
                  <p className="truncate text-xs text-slate-400">
                    {formatDate(t.date)}
                    {t.account_name ? ` · ${t.account_name}` : ''}
                    {t.description ? ` · ${t.description}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`font-semibold ${
                    t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'
                  }`}
                >
                  {t.type === 'income' ? '+' : '−'}
                  {formatRupiah(t.amount)}
                </span>
                <button
                  onClick={() => onEdit(t)}
                  className="text-slate-400 transition-colors hover:text-indigo-600 print:hidden"
                  title="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPending(t)}
                  className="text-slate-400 transition-colors hover:text-rose-600 print:hidden"
                  title="Hapus"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!pending}
        title="Hapus transaksi?"
        message={`"${pending?.category || 'Tanpa kategori'}" sebesar ${formatRupiah(
          pending?.amount ?? 0
        )} akan dipindah ke recycle bin (bisa dipulihkan 30 hari).`}
        onCancel={() => setPending(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />

      <TrashDialog
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        onChanged={onTrashChanged}
      />
    </div>
  );
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
