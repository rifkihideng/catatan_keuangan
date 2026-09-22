import { useState } from 'react';
import { Power, Plus, Repeat, Trash2 } from 'lucide-react';
import { formatRupiah, todayLocal } from '../format';
import ConfirmDialog from './ConfirmDialog';

const FREQ_LABEL = { daily: 'Harian', weekly: 'Mingguan', monthly: 'Bulanan' };

export default function RecurringCard({ recurring = [], accounts = [], onAdd, onToggle, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState('monthly');
  const [nextDate, setNextDate] = useState(() => todayLocal());
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  async function toggleActive(r) {
    setError('');
    try {
      await onToggle(r.id, !r.active);
    } catch (err) {
      setError(err.message || 'Gagal mengubah status transaksi berulang');
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    setError('');
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
    } catch (err) {
      setError(err.message || 'Gagal menghapus transaksi berulang');
    } finally {
      setDeleting(false);
    }
  }

  async function submit(e) {
    e.preventDefault();
    const val = Number(amount);
    if (!category.trim()) {
      setError('Kategori wajib diisi');
      return;
    }
    if (!nextDate) {
      setError('Tanggal wajib diisi');
      return;
    }
    if (Number.isNaN(val) || val <= 0) {
      setError('Nominal harus lebih dari 0');
      return;
    }
    setBusy(true);
    try {
      await onAdd({
        type,
        amount: val,
        category: category.trim(),
        description,
        frequency,
        nextDate,
        accountId: accountId ? Number(accountId) : null,
      });
      setAmount('');
      setCategory('');
      setDescription('');
      setError('');
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
          <Repeat className="h-4 w-4 text-indigo-600" /> Transaksi Berulang
        </h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="h-3.5 w-3.5" /> {showForm ? 'Batal' : 'Tambah'}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
        >
          {error}
        </p>
      )}

      {showForm && (
        <form onSubmit={submit} className="mb-4 space-y-2 rounded-xl bg-slate-100 p-3 dark:bg-slate-900">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-slate-200 p-1 dark:bg-slate-700">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                type === 'expense'
                  ? 'bg-white text-rose-600 shadow-sm dark:bg-slate-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Pengeluaran
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                type === 'income'
                  ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Pemasukan
            </button>
          </div>
          <input
            className="input"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Kategori (mis. WiFi)"
          />
          <input
            className="input"
            type="number"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Nominal"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
            >
              <option value="daily">Harian</option>
              <option value="weekly">Mingguan</option>
              <option value="monthly">Bulanan</option>
            </select>
            <input
              className="input"
              type="date"
              value={nextDate}
              onChange={(e) => setNextDate(e.target.value)}
            />
          </div>
          <input
            className="input"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Keterangan (opsional)"
          />
          <select
            className="input"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Tanpa rekening</option>
            {accounts.map((a) => (
              <option key={a.id} value={String(a.id)}>
                {a.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={busy} className="btn btn-primary w-full py-2">
            {busy ? '...' : 'Simpan'}
          </button>
        </form>
      )}

      {recurring.length === 0 && !showForm ? (
        <p className="py-4 text-sm text-slate-400 dark:text-slate-500">
          Belum ada transaksi berulang. Klik "Tambah" untuk membuat tagihan otomatis.
        </p>
      ) : (
        <ul className="space-y-2">
          {recurring.map((r) => (
            <li
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900"
            >
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                  {r.category || 'Tanpa kategori'}
                </p>
                <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                  {r.type === 'income' ? '+' : '−'}
                  {formatRupiah(r.amount)} · {FREQ_LABEL[r.frequency] || 'Bulanan'} · berikutnya{' '}
                  {new Date(r.next_date).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {dueBadge(r)}
                <button
                  onClick={() => toggleActive(r)}
                  className={`p-1 transition-colors ${
                    r.active
                      ? 'text-emerald-600 hover:text-emerald-700'
                      : 'text-slate-400 hover:text-slate-500'
                  }`}
                  title={r.active ? 'Nonaktifkan' : 'Aktifkan'}
                  aria-label={`${r.active ? 'Nonaktifkan' : 'Aktifkan'} ${r.category || 'tanpa kategori'}`}
                >
                  <Power className="h-4 w-4" />
                </button>
                <button
                  onClick={() => {
                    setError('');
                    setPendingDelete(r);
                  }}
                  className="p-1 text-slate-400 transition-colors hover:text-rose-600"
                  title="Hapus"
                  aria-label={`Hapus transaksi berulang ${r.category || 'tanpa kategori'}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus transaksi berulang?"
        message={`"${pendingDelete?.category || 'Tanpa kategori'}" sebesar ${formatRupiah(
          pendingDelete?.amount ?? 0
        )} akan dipindah ke recycle bin (bisa dipulihkan 30 hari).`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
      />
    </div>
  );
}

function dueBadge(r) {
  if (!r.active) return null;
  const d = daysUntil(r.next_date);
  if (d < 0) {
    return (
      <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-950/60 dark:text-rose-300">
        Terlambat {-d} hari
      </span>
    );
  }
  if (d === 0) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
        Hari ini
      </span>
    );
  }
  if (d <= 3) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
        {d} hari lagi
      </span>
    );
  }
  return null;
}

function daysUntil(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}
