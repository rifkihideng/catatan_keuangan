import { useState } from 'react';
import { PieChart, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteCategoryBudget, setCategoryBudget } from '../api';
import { formatRupiah } from '../format';

export default function CategoryBudgetCard({ budgets, expenses, categories = [], onReload }) {
  const [showForm, setShowForm] = useState(false);
  const [selCat, setSelCat] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Daftar kategori datang dari App agar selalu sinkron setelah kategori diubah
  const options =
    selCat && !categories.includes(selCat) ? [selCat, ...categories] : categories;

  const expenseMap = Object.fromEntries((expenses || []).map((e) => [e.category, e.total]));

  function openAdd() {
    setSelCat(categories[0] || '');
    setAmount('');
    setError('');
    setShowForm(true);
  }

  function openEdit(b) {
    setSelCat(b.category);
    setAmount(String(b.amount));
    setError('');
    setShowForm(true);
  }

  async function submit(e) {
    e.preventDefault();
    const val = Number(amount);
    if (!selCat) {
      setError('Pilih kategori');
      return;
    }
    if (Number.isNaN(val) || val <= 0) {
      setError('Nominal harus lebih dari 0');
      return;
    }
    setBusy(true);
    try {
      await setCategoryBudget(selCat, val);
      await onReload();
      setShowForm(false);
      setAmount('');
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(cat) {
    try {
      await deleteCategoryBudget(cat);
      await onReload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
          <PieChart className="h-4 w-4 text-indigo-600" /> Anggaran per Kategori
        </h2>
        <button
          onClick={() => (showForm ? setShowForm(false) : openAdd())}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
        >
          {showForm ? (
            'Batal'
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" /> Tambah
            </>
          )}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="mb-4 space-y-2 rounded-lg bg-slate-100 p-3 dark:bg-slate-900">
          <select
            value={selCat}
            onChange={(e) => setSelCat(e.target.value)}
            className="input"
            aria-label="Pilih kategori"
          >
            {options.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Nominal anggaran"
              className="input"
            />
            <button type="submit" disabled={busy} className="btn btn-primary shrink-0 px-4 py-2">
              {busy ? '...' : 'Simpan'}
            </button>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </form>
      )}

      {budgets.length === 0 && !showForm ? (
        <p className="py-4 text-sm text-slate-400 dark:text-slate-400">
          Belum ada anggaran per kategori. Klik "Tambah".
        </p>
      ) : (
        <ul className="space-y-3">
          {budgets.map((b) => {
            const spent = Number(expenseMap[b.category]) || 0;
            const limit = Number(b.amount);
            const percent = Math.min(100, Math.round((spent / limit) * 100));
            const over = spent > limit;
            return (
              <li key={b.category}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">{b.category}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {formatRupiah(spent)} / {formatRupiah(limit)}
                    </span>
                    <button
                      onClick={() => openEdit(b)}
                      className="text-slate-400 transition-colors hover:text-indigo-600"
                      title="Edit"
                      aria-label={`Edit anggaran ${b.category}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(b.category)}
                      className="text-slate-400 transition-colors hover:text-rose-600"
                      title="Hapus"
                      aria-label={`Hapus anggaran ${b.category}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all ${
                      over ? 'bg-rose-500' : percent >= 80 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
