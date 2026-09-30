import { useState } from 'react';
import { Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { formatRupiah } from '../format';

export default function NetWorthCard({ assets = [], balance = 0, onAdd, onUpdate, onDelete }) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState('asset');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  const totalAsset = assets
    .filter((a) => a.type === 'asset')
    .reduce((s, a) => s + Number(a.value), 0);
  const totalLiability = assets
    .filter((a) => a.type === 'liability')
    .reduce((s, a) => s + Number(a.value), 0);
  const netWorth = Number(balance) + totalAsset - totalLiability;

  function openAdd() {
    setEditingId(null);
    setName('');
    setValue('');
    setType('asset');
    setError('');
    setShowForm(true);
  }

  function openEdit(a) {
    setEditingId(a.id);
    setName(a.name);
    setValue(String(a.value));
    setType(a.type);
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setError('');
  }

  async function submit(e) {
    e.preventDefault();
    const v = Number(value);
    if (!name.trim()) {
      setError('Nama wajib diisi');
      return;
    }
    if (Number.isNaN(v) || v < 0) {
      setError('Nilai harus angka 0 atau lebih');
      return;
    }
    setBusy(true);
    try {
      const data = { name: name.trim(), value: v, type };
      if (editingId != null) await onUpdate(editingId, data);
      else await onAdd(data);
      closeForm();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setError('');
    try {
      await onDelete(pendingDelete.id);
      setPendingDelete(null);
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
          <Landmark className="h-4 w-4 text-indigo-600" /> Aset &amp; Liabilitas
        </h2>
        <button
          onClick={() => (showForm ? closeForm() : openAdd())}
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
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-700">
            <button
              type="button"
              onClick={() => setType('asset')}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                type === 'asset'
                  ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Aset
            </button>
            <button
              type="button"
              onClick={() => setType('liability')}
              className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
                type === 'liability'
                  ? 'bg-white text-rose-600 shadow-sm dark:bg-slate-700'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Liabilitas
            </button>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama (mis. Emas, Motor, KPR)"
            className="input"
          />
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Nilai (Rp)"
              className="input"
            />
            <button type="submit" disabled={busy} className="btn btn-primary shrink-0 px-4 py-2">
              {busy ? '...' : editingId != null ? 'Perbarui' : 'Simpan'}
            </button>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
        </form>
      )}

      <div className="mb-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-900">
        <p className="text-xs text-slate-500">Kekayaan bersih (net worth)</p>
        <p
          className={`text-xl font-extrabold ${
            netWorth < 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'
          }`}
          title={formatRupiah(netWorth)}
        >
          {formatRupiah(netWorth)}
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          Rekening {formatRupiah(balance)} + Aset {formatRupiah(totalAsset)} − Liabilitas{' '}
          {formatRupiah(totalLiability)}
        </p>
      </div>

      {assets.length === 0 && !showForm ? (
        <p className="py-2 text-sm text-slate-400 dark:text-slate-400">
          Belum ada aset/liabilitas. Klik "Tambah".
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-700">
          {assets.map((a) => {
            const isAsset = a.type === 'asset';
            return (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-700 dark:text-slate-200">{a.name}</p>
                  <p className={`text-xs ${isAsset ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {isAsset ? 'Aset' : 'Liabilitas'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span
                    className={`text-sm font-semibold ${
                      isAsset ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    {isAsset ? '+' : '−'}
                    {formatRupiah(a.value)}
                  </span>
                  <button
                    onClick={() => openEdit(a)}
                    className="text-slate-400 transition-colors hover:text-indigo-600"
                    title="Edit"
                    aria-label={`Edit ${a.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => {
                      setError('');
                      setPendingDelete(a);
                    }}
                    className="text-slate-400 transition-colors hover:text-rose-600"
                    title="Hapus"
                    aria-label={`Hapus ${a.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="card w-full max-w-sm p-5">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Hapus item?</h3>
            <p className="mt-1 text-sm text-slate-500">
              &quot;{pendingDelete.name}&quot; akan dihapus permanen.
            </p>
            {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setPendingDelete(null)}
                className="btn btn-secondary px-4 py-2"
              >
                Batal
              </button>
              <button onClick={confirmDelete} disabled={busy} className="btn btn-primary px-4 py-2">
                {busy ? '...' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
