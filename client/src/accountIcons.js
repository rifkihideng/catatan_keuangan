import { Banknote, Landmark, Smartphone } from 'lucide-react';

// Daftar nama rekening populer + jenis ikon + warna khas
export const ACCOUNT_PRESETS = [
  { name: 'Tunai', kind: 'cash', color: '#16a34a' },
  { name: 'Bank', kind: 'bank', color: '#6366f1' },
  { name: 'E-Wallet', kind: 'ewallet', color: '#0ea5e9' },
  { name: 'BCA', kind: 'bank', color: '#0060af' },
  { name: 'Mandiri', kind: 'bank', color: '#fdb913' },
  { name: 'BNI', kind: 'bank', color: '#f15a24' },
  { name: 'BRI', kind: 'bank', color: '#00529c' },
  { name: 'CIMB Niaga', kind: 'bank', color: '#d71920' },
  { name: 'BSI', kind: 'bank', color: '#22a06b' },
  { name: 'Permata', kind: 'bank', color: '#0079c9' },
  { name: 'Danamon', kind: 'bank', color: '#ee7d00' },
  { name: 'SeaBank', kind: 'bank', color: '#f05123' },
  { name: 'Jago', kind: 'bank', color: '#ef5343' },
  { name: 'Bank Mega', kind: 'bank', color: '#b5121b' },
  { name: 'Maybank', kind: 'bank', color: '#1f2937' },
  { name: 'BTN', kind: 'bank', color: '#e31837' },
  { name: 'GoPay', kind: 'ewallet', color: '#00aed6' },
  { name: 'OVO', kind: 'ewallet', color: '#4c3494' },
  { name: 'DANA', kind: 'ewallet', color: '#108ee9' },
  { name: 'ShopeePay', kind: 'ewallet', color: '#ee4d2d' },
  { name: 'LinkAja', kind: 'ewallet', color: '#e30000' },
  { name: 'Jenius', kind: 'ewallet', color: '#00b5ad' },
  { name: 'Blu', kind: 'ewallet', color: '#00a0df' },
  { name: 'Sakuku', kind: 'ewallet', color: '#005bac' },
  { name: 'AstraPay', kind: 'ewallet', color: '#0072bc' },
  { name: 'Flip', kind: 'ewallet', color: '#0043ce' },
  { name: 'Neo', kind: 'ewallet', color: '#ff007a' },
  { name: 'iSaku', kind: 'ewallet', color: '#7cc242' },
];

function findPreset(name) {
  return ACCOUNT_PRESETS.find(
    (p) => p.name.toLowerCase() === String(name || '').toLowerCase()
  );
}

export function getAccountKind(name) {
  const p = findPreset(name);
  if (p) return p.kind;
  const n = String(name || '').toLowerCase();
  if (n.includes('tunai') || n.includes('cash') || n.includes('uang')) return 'cash';
  if (
    n.includes('pay') ||
    n.includes('wallet') ||
    n.includes('dana') ||
    n.includes('ovo') ||
    n.includes('saku') ||
    n.includes('flip') ||
    n.includes('neo') ||
    n.includes('e-wallet') ||
    n.includes('ewallet') ||
    n.includes('dompet')
  ) {
    return 'ewallet';
  }
  return 'bank';
}

export function getKindIcon(kind) {
  if (kind === 'cash') return Banknote;
  if (kind === 'ewallet') return Smartphone;
  return Landmark;
}

export function getKindColor(kind) {
  if (kind === 'cash') return '#16a34a';
  if (kind === 'ewallet') return '#0ea5e9';
  return '#6366f1';
}

export function getAccountIcon(name, kind) {
  return getKindIcon(kind || getAccountKind(name));
}

export function getAccountColor(name, kind) {
  const p = findPreset(name);
  if (p?.color) return p.color;
  return getKindColor(kind || getAccountKind(name));
}
