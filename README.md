# 💰 Catatan Keuangan Pribadi

Aplikasi pencatat keuangan sederhana: pemasukan & pengeluaran, ringkasan saldo, dan grafik bulanan.

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
- Tambah, edit, dan hapus transaksi (pemasukan / pengeluaran) dengan kategori, tanggal, dan keterangan.
- Konfirmasi sebelum hapus transaksi.
- Pencarian transaksi (berdasarkan kategori / keterangan).
- Kategori custom: tambahkan kategori sendiri.
- Anggaran bulanan dengan progress bar & peringatan saat melebihi.
- Anggaran per kategori dengan progress bar masing-masing.
- Statistik: rata-rata pengeluaran harian, transaksi terbesar, tren bulan ini vs bulan lalu.
- Multi-rekening (cash / bank / e-wallet) dengan transfer antar rekening.
- Riwayat transfer: edit & hapus transfer.
- Kartu ringkasan: saldo, total pemasukan, total pengeluaran (mengikuti filter).
- Grafik batang pemasukan vs pengeluaran per bulan.
- Pie chart rincian pengeluaran/pemasukan per kategori.
- Grafik tren saldo kumulatif dari waktu ke waktu.
- Target tabungan dengan progress pencapaian.
- Filter riwayat transaksi per bulan atau rentang tanggal bebas.
- Export CSV & PDF.
- Backup & restore seluruh data ke file JSON.
- Data tersimpan permanen di database SQLite.

## API
| Method | Endpoint                  | Keterangan                                    |
| ------ | ------------------------- | --------------------------------------------- |
| GET    | `/api/transactions`       | Semua transaksi (`?month=YYYY-MM` atau `?from=&to=` untuk filter) |
| POST   | `/api/transactions`       | Tambah transaksi                              |
| PUT    | `/api/transactions/:id`   | Edit transaksi                                |
| DELETE | `/api/transactions/:id`   | Hapus transaksi                               |
| GET    | `/api/summary`            | Ringkasan, saldo, anggaran, target tabungan, tren saldo & data per bulan |
| GET    | `/api/categories`         | Daftar kategori                                |
| POST   | `/api/categories`         | Tambah kategori                                |
| DELETE | `/api/categories/:id`     | Hapus kategori                                 |
| GET    | `/api/budget`             | Ambil anggaran bulanan                         |
| PUT    | `/api/budget`             | Simpan anggaran bulanan                        |
| PUT    | `/api/category-budgets`           | Simpan anggaran per kategori          |
| DELETE | `/api/category-budgets/:category` | Hapus anggaran per kategori          |
| GET    | `/api/savings-goal`               | Ambil target tabungan                  |
| PUT    | `/api/savings-goal`               | Simpan target tabungan                 |
| GET    | `/api/accounts`                   | Daftar rekening                        |
| POST   | `/api/accounts`                   | Tambah rekening                        |
| DELETE | `/api/accounts/:id`               | Hapus rekening                         |
| GET    | `/api/transfers`                  | Riwayat transfer                       |
| POST   | `/api/transfers`                  | Transfer antar rekening                |
| PUT    | `/api/transfers/:id`              | Edit transfer                          |
| DELETE | `/api/transfers/:id`              | Hapus transfer                         |
| GET    | `/api/backup`                     | Export seluruh data (JSON)             |
| POST   | `/api/restore`                    | Import seluruh data dari backup JSON   |
