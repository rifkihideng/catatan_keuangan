import { Wallet } from 'lucide-react';

export default function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-slate-50 dark:bg-slate-950">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="animate-ripple absolute inset-0 rounded-full border-2 border-indigo-200 dark:border-indigo-500/40" />
        <span
          className="animate-ripple absolute inset-0 rounded-full border-2 border-indigo-300 dark:border-indigo-500/30"
          style={{ animationDelay: '0.7s' }}
        />
        <span className="animate-spin-slow absolute inset-2 rounded-full border-2 border-dashed border-indigo-300/70 dark:border-indigo-400/40" />
        <span className="animate-float relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/40">
          <Wallet className="h-7 w-7" />
        </span>
      </div>

      <div className="animate-fade-up text-center">
        <h1 className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-2xl font-extrabold tracking-tight text-transparent dark:from-indigo-300 dark:to-violet-300">
          Catatan Keuangan
        </h1>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">Menyiapkan data kamu…</p>
      </div>

      <div className="flex items-center gap-1.5">
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-indigo-500"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-indigo-500"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="h-2 w-2 animate-bounce rounded-full bg-indigo-500"
          style={{ animationDelay: '300ms' }}
        />
      </div>
    </div>
  );
}
