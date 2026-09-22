import { Component } from 'react';
import { CircleAlert, RotateCcw } from 'lucide-react';

/**
 * Menangkap error saat render sehingga aplikasi tidak menampilkan halaman putih.
 * Tanpa ini, satu error di komponen mana pun akan mengosongkan seluruh UI.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Kesalahan render:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const detail = String(
      (this.state.error && (this.state.error.stack || this.state.error.message)) || this.state.error
    );

    return (
      <div className="flex min-h-screen items-center justify-center p-6 print:hidden">
        <div className="card w-full max-w-md p-6 text-center">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400">
            <CircleAlert className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-bold text-slate-900 dark:text-white">
            Terjadi kesalahan pada tampilan
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Data kamu tetap aman di server. Coba muat ulang halaman — kalau tetap gagal, detail
            teknis di bawah bisa membantu.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-slate-200 p-3 text-left text-xs whitespace-pre-wrap text-rose-700 dark:bg-slate-700 dark:text-rose-300">
            {detail}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="btn btn-primary mt-4 px-4 py-2.5"
          >
            <RotateCcw className="h-4 w-4" /> Muat ulang
          </button>
        </div>
      </div>
    );
  }
}
