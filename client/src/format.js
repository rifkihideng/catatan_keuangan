export function formatRupiah(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

// Tanggal hari ini menurut waktu lokal (YYYY-MM-DD).
// new Date().toISOString() memakai UTC, sehingga di WIB (UTC+7) pukul 00:00–06:59
// akan menghasilkan tanggal kemarin.
export function todayLocal(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

// Format ringkas untuk kartu ringkasan agar angka tidak keluar kolom
export function formatRupiahCompact(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (abs >= 1_000_000_000) {
    const x = (abs / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 });
    return `${sign}Rp ${x} M`;
  }
  if (abs >= 1_000_000) {
    const x = (abs / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 });
    return `${sign}Rp ${x} jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp ${Math.round(abs / 1_000).toLocaleString('id-ID')} rb`;
  }
  return formatRupiah(v);
}
