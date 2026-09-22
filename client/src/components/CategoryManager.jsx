import { useEffect, useState } from 'react';
import { Check, Pencil, Trash2, X } from 'lucide-react';
import { deleteCategory, getCategoryDetails, updateCategory } from '../api';
import ConfirmDialog from './ConfirmDialog';

export default function CategoryManager({ open, onClose, onChanged }) {
  const [cats, setCats] = useState({ income: [], expense: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setCats(await getCategoryDetails());
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  function startEdit(cat) {
    setEditingId(cat.id);
    setEditName(cat.name);
    setError('');
  }

  async function saveRename(cat) {
    const name = editName.trim();
    if (!name || name === cat.name) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    try {
      await updateCategory(cat.id, name);
      setEditingId(null);
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteCategory(pendingDelete.id);
      setPendingDelete(null);
      await load();
      await onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const renderGroup = (type, title) => (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</h4>
      {cats[type].length === 0 ? (
        <p className="text-sm text-slate-400">Tidak ada kategori.</p>
      ) : (
        <ul className="space-y-1.5">
          {cats[type].map((cat) => (
            <li
              key={cat.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-700"
            >
              {editingId === cat.id ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename(cat);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="input py-1.5"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => saveRename(cat)}
                    disabled={busy}
                    className="shrink-0 rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50"
                    title="Simpan"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                    title="Batal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                    {cat.name}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(cat)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-50"
                      title="Ganti nama"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(cat)}
                      disabled={busy}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                      title="Hapus"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 print:hidden">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="relative flex max-h-[80vh] w-full max-w-md flex-col rounded-xl bg-white shadow-xl dark:bg-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">Kelola Kategori</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700"
            title="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <p className="text-xs text-slate-400">
            Ganti nama atau hapus kategori. Ganti nama juga memperbarui semua transaksi yang
            memakainya.
          </p>
          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600 dark:bg-rose-950/60 dark:text-rose-300">
              {error}
            </p>
          )}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
              <p className="text-sm">Memuat...</p>
            </div>
          ) : (
            <>
              {renderGroup('income', 'Pemasukan')}
              {renderGroup('expense', 'Pengeluaran')}
            </>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus kategori?"
        message={`Kategori "${pendingDelete?.name ?? ''}" akan dihapus dari daftar. Transaksi lama tetap tersimpan.`}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={busy}
      />
    </div>
  );
}
