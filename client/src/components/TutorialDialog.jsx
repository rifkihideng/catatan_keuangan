import { useEffect, useId, useState } from 'react';
import { useModalA11y } from '../useModalA11y';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  DatabaseBackup,
  PiggyBank,
  PlusCircle,
  Repeat,
  Wallet,
  X,
} from 'lucide-react';

const STEPS = [
  {
    icon: PlusCircle,
    title: 'Catat Transaksi',
    desc: 'Gunakan form "Tambah Transaksi" di sebelah kiri untuk mencatat pemasukan & pengeluaran. Pilih tipe, isi nominal, kategori, tanggal, dan rekening, lalu tekan Simpan.',
  },
  {
    icon: Wallet,
    title: 'Kelola Rekening',
    desc: 'Pantau saldo tiap rekening (Tunai, Bank, E-Wallet) di kartu "Rekening". Pindahkan dana antar rekening lewat tombol "Transfer".',
  },
  {
    icon: Repeat,
    title: 'Transaksi Berulang',
    desc: 'Buat tagihan otomatis harian, mingguan, atau bulanan. Pengeluaran rutin tercatat sendiri dan muncul pengingat saat mendekati jatuh tempo.',
  },
  {
    icon: PiggyBank,
    title: 'Anggaran & Target',
    desc: 'Atur anggaran bulanan, anggaran per kategori, dan target tabungan untuk memantau progres serta mencegah pengeluaran berlebih.',
  },
  {
    icon: BarChart3,
    title: 'Laporan & Grafik',
    desc: 'Lihat ringkasan saldo, laporan pengeluaran per kategori, dan tren keuangan lewat grafik interaktif yang mengikuti filter bulan.',
  },
  {
    icon: DatabaseBackup,
    title: 'Simpan & Amankan Data',
    desc: 'Ekspor ke CSV/PDF, import CSV, serta lakukan Backup & Restore dari tombol di pojok kanan atas. Data kamu tersimpan aman.',
  },
];

export default function TutorialDialog({ open, onClose }) {
  const titleId = useId();
  const panelRef = useModalA11y(open, onClose);
  const [step, setStep] = useState(0);

  // Mulai dari langkah pertama setiap kali dialog dibuka
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const total = STEPS.length;
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === total - 1;

  function handleNext() {
    if (isLast) onClose();
    else setStep((s) => s + 1);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 print:hidden">
      <div
        className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-md animate-dialog-in rounded-2xl border border-slate-200/70 bg-white p-6 shadow-2xl outline-none dark:border-slate-700/60"
      >
        <button
          onClick={onClose}
          aria-label="Tutup tutorial"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <X className="h-5 w-5" />
        </button>

        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
          <Icon className="h-7 w-7" />
        </span>

        <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
          Langkah {step + 1} dari {total}
        </p>
        <h3 id={titleId} className="mt-1 text-lg font-bold text-slate-900 dark:text-white">
          {current.title}
        </h3>
        <p className="mt-1.5 min-h-[3.5rem] text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          {current.desc}
        </p>

        <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${
                i <= step ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <button
            onClick={onClose}
            className="rounded-xl px-3 py-2 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Lewati
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="btn btn-secondary px-3 py-2"
              >
                <ArrowLeft className="h-4 w-4" /> Kembali
              </button>
            )}
            <button onClick={handleNext} className="btn btn-primary px-4 py-2">
              {isLast ? (
                <>
                  <Check className="h-4 w-4" /> Mengerti
                </>
              ) : (
                <>
                  Lanjut <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
