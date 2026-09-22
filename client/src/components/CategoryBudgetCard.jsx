import { useEffect, useState } from 'react';
import { PieChart, Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteCategoryBudget, getCategories, setCategoryBudget } from '../api';
import { formatRupiah } from '../format';

export default function CategoryBudgetCard({ budgets, expenses, onReload }) {
  const [cats, setCats] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selCat, setSelCat] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCategories()
      .then((c) => {
        setCats(c.expense);
        setSelCat(c.expense[0] || '');
      })
      .catch(() => {});
  }, []);

  const expenseMap = Object.fromEntries((expenses || []).map((e) => [e.category, e.total]));

  function openAdd() {
    setSelCat(cats[0] || '');
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
    await deleteCategoryBudget(cat);
    await onReload();
  }

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-bold text-slate-900">
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
        <form onSubmit={submit} className="mb-4 space-y-2 rounded-lg bg-slate-50 p-3">
          <select
            value={selCat}
            onChange={(e) => setSelCat(e.target.value)}
            className="input"
          >
            {cats.map((c) => (
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
        <p className="py-4 text-sm text-slate-400">Belum ada anggaran per kategori. Klik "Tambah".</p>
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
                  <span className="font-medium text-slate-700">{b.category}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {formatRupiah(spent)} / {formatRupiah(limit)}
                    </span>
                    <button
                      onClick={() => openEdit(b)}
                      className="text-slate-400 transition-colors hover:text-indigo-600"
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => remove(b.category)}
                      className="text-slate-400 transition-colors hover:text-rose-600"
                      title="Hapus"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
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
