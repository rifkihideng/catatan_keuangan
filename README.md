# 💰 Catatan Keuangan Pribadi

Aplikasi pencatat keuangan pribadi: pemasukan & pengeluaran, anggaran, multi-rekening, laporan per kategori, dan cadangan data otomatis.

## Teknologi
- **Frontend**: Vite + React 19 + Tailwind CSS v4 + Recharts
- **Backend**: Express + `node:sqlite` (database SQLite bawaan Node.js)

## Struktur
```
project fix 4/
├── client/   # Frontend (Vite + React + Tailwind)
└── server/   # Backend (Express + SQLite)
```

## Cara menjalankan

> **Cara cepat** (dari folder root): `npm install` lalu `npm run dev` untuk menjalankan backend & frontend sekaligus. Script lain: `npm run server`, `npm run client`, `npm run build`.

### 1. Backend (server)
```bash
cd server
npm install
npm run dev
```
Server berjalan di http://localhost:3001 (database otomatis dibuat di `server/finance.db`).

### 2. Frontend (client)
```bash
cd client
npm install
npm run dev
```
Buka http://localhost:5173 di browser.

## Fitur

### Transaksi & pencatatan
- Tambah, edit, dan hapus transaksi (pemasukan/pengeluaran) dengan kategori, tanggal, keterangan, dan rekening.
- Pencarian, filter kategori, filter bulan/rentang tanggal (bisa satu sisi), dan urutkan (tanggal/nominal/kategori).
- Import dari CSV dan export ke CSV/PDF.

### Kategori
- Tambah kategori baru.
- Ganti nama kategori (otomatis memperbarui semua transaksi, transaksi berulang, dan anggaran yang memakainya).
- Hapus kategori.

### Anggaran & target
- Anggaran bulanan dengan progress bar & peringatan saat melebihi.
- Anggaran per kategori dengan progress bar masing-masing.
- Target tabungan dengan progress pencapaian.

### Rekening, transfer & transaksi berulang
- Multi-rekening (tunai/bank/e-wallet) dengan saldo otomatis.
- Transfer antar rekening beserta riwayatnya (edit & hapus).
- Transaksi berulang (harian/mingguan/bulanan) dengan pengingat jatuh tempo.

### Laporan & analisis
- Kartu ringkasan: saldo, pemasukan, dan pengeluaran (mengikuti filter).
- Statistik: rata-rata pengeluaran harian, transaksi terbesar, tren bulan ini vs bulan lalu.
- Laporan pengeluaran per kategori per bulan (bisa dibatasi rentang bulan).
- Kartu pemasukan vs pengeluaran: persentase tabungan total & per bulan.
- Grafik: batang bulanan, pie per kategori, tren saldo kumulatif.

### Data & keamanan
- Recycle bin 30 hari: transaksi, transaksi berulang, transfer, dan rekening yang terhapus bisa dipulihkan.
- Backup & restore seluruh data ke file JSON.
- Backup otomatis file database ke `server/backups/` (setiap 6 jam, menyimpan 14 salinan terakhir).
- Mode tema terang/gelap/otomatis (mengikuti sistem).

## API
| Method | Endpoint | Keterangan |
| ------ | -------- | ---------- |
| GET    | `/api/transactions` | Semua transaksi (`?month=YYYY-MM` atau `?from=&to=`) |
| POST   | `/api/transactions` | Tambah transaksi |
| PUT    | `/api/transactions/:id` | Edit transaksi |
| DELETE | `/api/transactions/:id` | Hapus transaksi (soft delete → recycle bin) |
| POST   | `/api/transactions/import` | Import transaksi dari CSV |
| GET    | `/api/summary` | Ringkasan, anggaran, target, tren & data per bulan |
| GET    | `/api/reports/category-monthly` | Laporan pengeluaran per kategori per bulan |
| GET    | `/api/categories` | Daftar kategori (nama) |
| GET    | `/api/categories/detail` | Daftar kategori lengkap dengan id |
| POST   | `/api/categories` | Tambah kategori |
| PUT    | `/api/categories/:id` | Ganti nama kategori (ikut memperbarui transaksi) |
| DELETE | `/api/categories/:id` | Hapus kategori |
| GET    | `/api/budget` | Ambil anggaran bulanan |
| PUT    | `/api/budget` | Simpan anggaran bulanan |
| PUT    | `/api/category-budgets` | Simpan anggaran per kategori |
| DELETE | `/api/category-budgets/:category` | Hapus anggaran per kategori |
| GET    | `/api/savings-goal` | Ambil target tabungan |
| PUT    | `/api/savings-goal` | Simpan target tabungan |
| GET    | `/api/accounts` | Daftar rekening + saldo |
| POST   | `/api/accounts` | Tambah rekening |
| DELETE | `/api/accounts/:id` | Hapus rekening (soft delete) |
| GET    | `/api/transfers` | Riwayat transfer |
| POST   | `/api/transfers` | Transfer antar rekening |
| PUT    | `/api/transfers/:id` | Edit transfer |
| DELETE | `/api/transfers/:id` | Hapus transfer (soft delete) |
| GET    | `/api/recurring` | Daftar transaksi berulang |
| POST   | `/api/recurring` | Tambah transaksi berulang |
| PUT    | `/api/recurring/:id` | Aktif/nonaktifkan transaksi berulang |
| DELETE | `/api/recurring/:id` | Hapus transaksi berulang (soft delete) |
| GET    | `/api/trash` | Daftar item recycle bin |
| POST   | `/api/trash/:entity/:id/restore` | Pulihkan item (`transaction\|recurring\|transfer\|account`) |
| DELETE | `/api/trash/:entity/:id` | Hapus permanen satu item |
| DELETE | `/api/trash` | Kosongkan recycle bin |
| GET    | `/api/backup` | Export seluruh data (JSON) |
| POST   | `/api/restore` | Import seluruh data dari backup JSON |
