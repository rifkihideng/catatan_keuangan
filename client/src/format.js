export function formatRupiah(n) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
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
