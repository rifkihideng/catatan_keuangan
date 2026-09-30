import { useEffect, useRef, useState } from 'react';
import { Minus, Paperclip, Pencil, Plus, X } from 'lucide-react';
import { addCategory, getCategories } from '../api';
import { todayLocal } from '../format';
import CategoryManager from './CategoryManager';

const FALLBACK = { income: ['Lainnya'], expense: ['Lainnya'] };

export default function TransactionForm({
  onAdd,
  onUpdate,
  editing,
  onCancelEdit,
  accounts = [],
  onCategoriesChanged,
}) {
  const today = todayLocal();
  const [cats, setCats] = useState(FALLBACK);
  const [type, setType] = useState('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [receipt, setReceipt] = useState('');
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAddCat, setShowAddCat] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [showManager, setShowManager] = useState(false);
  const receiptInputRef = useRef(null);

  function refreshCategories() {
    getCategories()
      .then((c) => setCats(c))
      .catch(() => {});
    // Beri tahu induk agar daftar kategori di tempat lain (filter, anggaran) ikut segar
    onCategoriesChanged?.();
  }

  useEffect(() => {
    refreshCategories();
  }, []);

  // Isi form saat mode edit
  useEffect(() => {
    if (editing) {
      setType(editing.type);
      setAmount(String(editing.amount));
      setCategory(editing.category || '');
      setDescription(editing.description || '');
      setTags(editing.tags || '');
      setReceipt(editing.receipt || '');
      setDate(editing.date);
      setAccountId(editing.account_id ? String(editing.account_id) : '');
    } else {
      setAmount('');
      setDescription('');
      setTags('');
      setReceipt('');
      setAccountId('');
    }
  }, [editing]);

  // Pastikan kategori terpilih selalu valid
  useEffect(() => {
    if (!category || !cats[type].includes(category)) {
      setCategory(cats[type][0] || '');
    }
  }, [type, cats, category]);

  function switchType(t) {
    setType(t);
    setCategory(cats[t][0] || '');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setError('Nominal harus berupa angka lebih dari 0');
      return;
    }
    setLoading(true);
    try {
      const data = {
        type,
        amount: value,
        category,
        description,
        tags,
        receipt,
        date,
        accountId: accountId ? Number(accountId) : null,
      };
      if (editing) {
        await onUpdate(editing.id, data);
      } else {
        await onAdd(data);
      }
      setAmount('');
      setDescription('');
      setTags('');
      setReceipt('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReceiptFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      const dataUrl = await compressImage(file);
      setReceipt(dataUrl);
    } catch (err) {
      setError(err.message || 'Gagal memuat gambar');
    }
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    const name = newCat.trim();
    if (!name) return;
    try {
      const created = await addCategory({ type, name });
      setCats((prev) => ({ ...prev, [type]: [...prev[type], created.name] }));
      setCategory(created.name);
      setNewCat('');
      setShowAddCat(false);
      onCategoriesChanged?.();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="card space-y-4 self-start p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
          {editing ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {editing ? 'Edit Transaksi' : 'Tambah Transaksi'}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200 p-1 dark:bg-slate-700">
        <button
          type="button"
          onClick={() => switchType('expense')}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-all ${
            type === 'expense'
              ? 'bg-white text-rose-600 shadow-sm dark:bg-slate-700'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Minus className="h-4 w-4" /> Pengeluaran
        </button>
        <button
          type="button"
          onClick={() => switchType('income')}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-all ${
            type === 'income'
              ? 'bg-white text-emerald-600 shadow-sm dark:bg-slate-700'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Plus className="h-4 w-4" /> Pemasukan
        </button>
      </div>

      <div>
        <label className="label">Nominal (Rp)</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-400">
            Rp
          </span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="50000"
            className="input pl-10"
          />
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="label mb-0">Kategori</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowManager(true)}
              className="inline-flex items-center text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Kelola
            </button>
            <button
              type="button"
              onClick={() => setShowAddCat((s) => !s)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" /> Baru
            </button>
          </div>
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="input"
        >
          {cats[type].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {showAddCat && (
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              placeholder="Nama kategori baru"
              className="input"
            />
            <button
              type="button"
              onClick={handleAddCategory}
              className="shrink-0 rounded-xl bg-indigo-100 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-200"
            >
              Tambah
            </button>
          </div>
        )}
      </div>

      <div>
        <label className="label">Tanggal</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input"
        />
      </div>

      <div>
        <label className="label">Rekening (opsional)</label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="input"
        >
          <option value="">Tanpa rekening</option>
          {accounts.map((a) => (
            <option key={a.id} value={String(a.id)}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="label">Keterangan (opsional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="contoh: Makan siang"
          className="input"
        />
      </div>

      <div>
        <label className="label">Tag (opsional)</label>
        <input
          type="text"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="contoh: liburan, keluarga (pisahkan dengan koma)"
          className="input"
        />
      </div>

      <div>
        <label className="label">Lampiran struk (opsional)</label>
        {receipt ? (
          <div className="flex items-center gap-2">
            <img
              src={receipt}
              alt="Pratinjau struk"
              className="h-16 w-16 rounded-lg border border-slate-200 object-cover"
            />
            <button
              type="button"
              onClick={() => setReceipt('')}
              className="btn btn-secondary px-2.5 py-1.5 text-xs"
              title="Hapus lampiran"
            >
              <X className="h-4 w-4" /> Hapus
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => receiptInputRef.current?.click()}
            className="btn btn-secondary w-full px-3 py-2"
          >
            <Paperclip className="h-4 w-4" /> Lampirkan struk
          </button>
        )}
        <input
          ref={receiptInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleReceiptFile}
        />
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={loading} className="btn btn-primary flex-1 py-2.5">
          {loading ? 'Menyimpan...' : editing ? 'Perbarui' : 'Simpan'}
        </button>
        {editing && (
          <button type="button" onClick={onCancelEdit} className="btn btn-secondary px-4 py-2.5">
            Batal
          </button>
        )}
      </div>

      <CategoryManager
        open={showManager}
        onClose={() => setShowManager(false)}
        onChanged={refreshCategories}
      />
    </form>
  );
}

// Kompres & ubah ukuran gambar menjadi data URL JPEG (maks. 800px) agar
// lampiran struk tetap ringan untuk disimpan di database.
function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('File harus berupa gambar'));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 800;
      let { width, height } = img;
      if (width > max) {
        height = Math.round((height * max) / width);
        width = max;
      }
      if (height > max) {
        width = Math.round((width * max) / height);
        height = max;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Gagal membaca gambar'));
    };
    img.src = url;
  });
}
