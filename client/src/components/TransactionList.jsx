import { useEffect, useMemo, useState } from 'react';
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
  total = 0,
  onLoadMore,
  categories = { income: [], expense: [] },
  accounts = [],
  month,
  setMonth,
  from,
  setFrom,
  to,
  setTo,
  type,
  setType,
  category,
  setCategory,
  account,
  setAccount,
  sort,
  setSort,
  onQueryChange,
  loading,
  refreshing,
  onDelete,
  onEdit,
  onTrashChanged,
}) {
  const [search, setSearch] = useState('');
  const [pending, setPending] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [trashOpen, setTrashOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState('');

  const allCategories = useMemo(
    () =>
      [...new Set([...(categories.income || []), ...(categories.expense || [])])].sort((a, b) =>
        a.localeCompare(b, 'id')
      ),
    [categories]
  );

  // Pencarian dikirim ke server dengan jeda singkat agar tidak membanjiri permintaan.
  useEffect(() => {
    const timer = setTimeout(() => onQueryChange(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search, onQueryChange]);

  const hasFilter = Boolean(month || from || to || category || type || account || search.trim());

  function resetFilters() {
    setMonth('');
    setFrom('');
    setTo('');
    setCategory('');
    setType('');
    setAccount('');
    setSort('');
    setSearch('');
    onQueryChange('');
  }

  async function confirmDelete() {
    if (!pending) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDelete(pending.id);
      setPending(null);
    } catch (err) {
      // Jangan tutup dialog saat gagal — tampilkan alasannya agar tidak terkesan "diam saja"
      setDeleteError(err.message || 'Gagal menghapus transaksi');
    } finally {
      setDeleting(false);
    }
  }

  function cancelDelete() {
    setPending(null);
    setDeleteError('');
  }

  return (
    <div className="card p-5 print:border-none print:p-0 print:shadow-none">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">Riwayat Transaksi</h2>
          {refreshing ? (
            <span
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400"
              role="status"
            >
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
              Memuat...
            </span>
          ) : (
            !loading && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                {total}
              </span>
            )
          )}
        </div>
        <div className="w-full space-y-2 rounded-xl bg-slate-50 p-2.5 print:hidden dark:bg-slate-900/50 lg:w-auto">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari transaksi..."
                aria-label="Cari transaksi"
                className="input w-full pl-8 sm:w-52"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="input w-auto"
              title="Filter kategori"
              aria-label="Filter kategori"
            >
              <option value="">Semua kategori</option>
              {allCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="input w-auto"
              title="Filter tipe"
              aria-label="Filter tipe transaksi"
            >
              <option value="">Semua tipe</option>
              <option value="income">Pemasukan</option>
              <option value="expense">Pengeluaran</option>
            </select>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="input w-auto"
              title="Filter rekening"
              aria-label="Filter rekening"
            >
              <option value="">Semua rekening</option>
              {accounts.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sort || 'date-desc'}
              onChange={(e) => setSort(e.target.value)}
              className="input w-auto"
              title="Urutkan"
              aria-label="Urutkan transaksi"
            >
              <option value="date-desc">Tanggal (terbaru)</option>
              <option value="date-asc">Tanggal (terlama)</option>
              <option value="amount-desc">Nominal (terbesar)</option>
              <option value="amount-asc">Nominal (terkecil)</option>
              <option value="category-asc">Kategori (A–Z)</option>
              <option value="category-desc">Kategori (Z–A)</option>
            </select>
            <span className="mx-0.5 hidden h-5 w-px bg-slate-200 sm:block dark:bg-slate-700" />
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
              className="input w-40"
              title="Filter per bulan"
              aria-label="Filter per bulan"
            />
            <span className="text-xs text-slate-400">atau</span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                if (e.target.value) setMonth('');
              }}
              className="input w-40"
              title="Dari tanggal"
              aria-label="Dari tanggal"
            />
            <span className="text-xs text-slate-400">–</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                if (e.target.value) setMonth('');
              }}
              className="input w-40"
              title="Sampai tanggal"
              aria-label="Sampai tanggal"
            />
            {(month || from || to || category || type || account || search) && (
              <button
                onClick={resetFilters}
                className="rounded-xl border border-slate-300 px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                title="Reset filter"
                aria-label="Reset filter"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setTrashOpen(true)}
              className="rounded-xl border border-slate-300 px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
              title="Recycle bin"
              aria-label="Buka recycle bin"
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
            {hasFilter ? <SearchX className="h-6 w-6" /> : <Inbox className="h-6 w-6" />}
          </span>
          <p className="text-sm font-medium text-slate-500">
            {hasFilter ? 'Tidak ada hasil untuk filter ini' : 'Belum ada transaksi'}
          </p>
          {!hasFilter && (
            <p className="text-xs text-slate-400">
              Tambahkan transaksi pertamamu di form sebelah kiri.
            </p>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {transactions.map((t, i) => (
            <li
              key={t.id}
              className="flex animate-list-in items-center justify-between gap-3 py-3"
              style={{ animationDelay: `${Math.min(i, 12) * 20}ms` }}
            >
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
                  {tagList(t.tags).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {tagList(t.tags).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                {t.receipt && (
                  <button
                    onClick={() => setViewReceipt(t.receipt)}
                    className="shrink-0 overflow-hidden rounded-md border border-slate-200"
                    title="Lihat struk"
                    aria-label={`Lihat struk transaksi ${t.category || 'tanpa kategori'}`}
                  >
                    <img src={t.receipt} alt="Struk" className="h-9 w-9 object-cover" />
                  </button>
                )}
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
                  aria-label={`Edit transaksi ${t.category || 'tanpa kategori'}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setDeleteError('');
                    setPending(t);
                  }}
                  className="text-slate-400 transition-colors hover:text-rose-600 print:hidden"
                  title="Hapus"
                  aria-label={`Hapus transaksi ${t.category || 'tanpa kategori'}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {transactions.length < total && (
        <div className="mt-3 flex justify-center print:hidden">
          <button onClick={onLoadMore} className="btn btn-secondary px-4 py-2">
            Muat lebih banyak
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        title="Hapus transaksi?"
        message={`"${pending?.category || 'Tanpa kategori'}" sebesar ${formatRupiah(
          pending?.amount ?? 0
        )} akan dipindah ke recycle bin (bisa dipulihkan 30 hari).`}
        error={deleteError}
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
        loading={deleting}
      />

      <TrashDialog
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        onChanged={onTrashChanged}
      />

      {viewReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Lihat struk"
          onClick={() => setViewReceipt('')}
        >
          <button
            onClick={() => setViewReceipt('')}
            className="absolute right-4 top-4 rounded-full bg-white/20 p-2 text-white transition hover:bg-white/30"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={viewReceipt}
            alt="Struk"
            className="max-h-[90vh] max-w-full rounded-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
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

function tagList(tags) {
  return String(tags || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
