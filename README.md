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

> Saat pertama kali dibuka, aplikasi menampilkan layar **Masuk / Daftar**. Buat akun terlebih dahulu — akun pertama akan otomatis mewarisi data yang sudah ada di database sebelum fitur multi-user ini aktif.

## Konfigurasi (opsional)

Backend membaca variabel lingkungan berikut:

| Variabel | Default | Fungsi |
| -------- | ------- | ------ |
| `PORT` | `3001` | Port server Express. |
| `FINANCE_DB_PATH` | `server/finance.db` | Lokasi file database SQLite (mis. volume persisten di hosting). |
| `ALLOW_SIGNUP` | `1` | Set `0` untuk menutup pendaftaran akun baru (mode undangan). |
| `TRUST_PROXY` | – | Set `1` bila berjalan di belakang reverse proxy agar IP asli terbaca pembatas percobaan login. |
| `PUBLIC_URL` | dari request | Alamat **server/API** ini. Dipakai untuk `redirect_uri` OAuth dan sebagai cadangan alamat frontend. |
| `APP_URL` | ikut `PUBLIC_URL` | Alamat **frontend**. Isi bila client & server di host berbeda (mis. client di Vercel, API di Render). |
| `SESSION_HOURS` | `720` (30 hari) | Masa berlaku sesi saat **"Tetap masuk"** dicentang. |
| `SESSION_SHORT_HOURS` | `12` | Masa berlaku sesi bila tidak dicentang. |
| `RESEND_API_KEY` | – | Kunci API [Resend](https://resend.com) untuk mengirim email. Kosong = email dicetak ke log server. |
| `EMAIL_FROM` | `Catatan Keuangan <no-reply@localhost>` | Pengirim email (domain harus terverifikasi di Resend). |
| `APP_NAME` | `Catatan Keuangan` | Nama aplikasi pada subjek & isi email. |
| `RESET_TOKEN_MINUTES` | `60` | Masa berlaku tautan reset password. |
| `VERIFY_TOKEN_HOURS` | `24` | Masa berlaku tautan konfirmasi email. |
| `REQUIRE_EMAIL_VERIFICATION` | `0` | Set `1` untuk mewajibkan konfirmasi email sebelum aplikasi bisa dipakai. Otomatis diabaikan bila email belum dikonfigurasi. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | – | Mengaktifkan tombol **Masuk dengan GitHub**. |
| `GITHUB_ORG` | – | Nama organisasi GitHub yang anggotanya diizinkan masuk (pisahkan dengan koma untuk lebih dari satu). Kosong = semua pengguna GitHub diizinkan. |

### Mengaktifkan pengiriman email (lupa password & konfirmasi email)
1. Daftar di Resend, verifikasi domain pengirim, lalu buat API key.
2. Set `RESEND_API_KEY`, `EMAIL_FROM`, dan `PUBLIC_URL` (mis. `https://api.domainku.com`).
3. Bila client di host lain, set juga `APP_URL` (mis. `https://domainku.com`) supaya tautan di email mengarah ke frontend.

Selama `RESEND_API_KEY` belum diisi, fitur tetap bisa dicoba: isi email (tautan reset/konfirmasi) dicetak pada log server, dan pemakai baru otomatis dianggap terverifikasi.

### Mengaktifkan login GitHub (khusus anggota organisasi)
1. Buat **OAuth App** di GitHub: `Settings → Developer settings → OAuth Apps → New OAuth App`.
   - **Homepage URL**: alamat frontend (lokal: `http://localhost:5173`).
   - **Authorization callback URL**: `<PUBLIC_URL>/api/auth/github/callback` (lokal: `http://localhost:3001/api/auth/github/callback`).
2. Set di `server/.env`:
   - `GITHUB_CLIENT_ID` dan `GITHUB_CLIENT_SECRET` dari OAuth App.
   - `GITHUB_ORG`: nama organisasi yang anggotanya diizinkan masuk (mis. `catatan-keuangan`).
   - `APP_URL`: alamat frontend (lokal: `http://localhost:5173`) — tujuan redirect setelah login.
   - `PUBLIC_URL`: alamat server/API (lokal: `http://localhost:3001`).
3. Jalankan ulang server.
4. Bila organisasinya **privat**, organisasi harus menyetujui OAuth App tersebut (`Settings → Third-party access`) supaya keanggotaan bisa dibaca; tanpa itu anggota organisasi privat tidak dikenali dan ditolak.

Saat login, GitHub meminta izin `read:user`, `user:email`, dan `read:org`; beri akses ke organisasi bila diminta. Tombol GitHub hanya muncul di layar masuk bila `GITHUB_CLIENT_ID` dan `GITHUB_CLIENT_SECRET` terisi. Hanya pengguna yang menjadi anggota `GITHUB_ORG` yang diizinkan masuk; akun baru otomatis dibuat dan langsung mendapat kategori & rekening bawaan.

## Deployment

Aplikasi terdiri dari **frontend** (Vite/React) dan **backend** (Express + SQLite). Backend menyimpan data di file SQLite sehingga butuh host dengan **penyimpanan persisten** — tidak cocok dengan Vercel (serverless, filesystem sementara).

### 1. Frontend ke Vercel
1. Di dashboard Vercel: **New Project** → import repository ini.
2. Set **Root Directory** ke `client` (atau `Framework Preset: Vite` dengan output `client/dist`).
3. Tambahkan **Environment Variable**:
   - `VITE_API_URL` = alamat backend + `/api`, mis. `https://api.domainmu.com/api`.
4. Deploy — Vercel menjalankan `vite build` dan menyajikan hasil di `client/dist`.

### 2. Backend ke host ber-penyimpanan persisten (Railway / Fly.io / Koyeb)
1. Deploy folder `server/` (Node, `npm install`, `npm start`).
2. Set environment variable di host backend:
   - `PUBLIC_URL` = alamat backend, mis. `https://api.domainmu.com`.
   - `APP_URL` = alamat frontend Vercel, mis. `https://domainmu.vercel.app`.
   - `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_ORG`.
3. Tambahkan **callback URL baru** di OAuth App GitHub: `https://api.domainmu.com/api/auth/github/callback`.

CORS backend sudah terbuka (`cors()`), jadi panggilan dari domain Vercel ke backend diperbolehkan.

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

### Akun & keamanan data
- **Multi-user dengan isolasi data**: setiap transaksi, kategori, anggaran, rekening, transfer, transaksi berulang, dan pengaturan hanya bisa dilihat & diubah oleh pemiliknya.
- **Masuk / Daftar** dengan email + password. Password disimpan sebagai hash **scrypt** (salt acak), bukan teks biasa.
- **Lupa password**: kirim tautan reset lewat email (berlaku 60 menit, sekali pakai). Membuka tautan reset otomatis menandai email sebagai terverifikasi dan mencabut semua sesi lama.
- **Konfirmasi email**: tautan verifikasi berlaku 24 jam; banner pengingat + tombol kirim ulang tampil di dashboard. Bisa diwajibkan dengan `REQUIRE_EMAIL_VERIFICATION=1`.
- **Login dengan GitHub** (opsional, OAuth 2.0) yang bisa dibatasi hanya untuk anggota organisasi tertentu (`GITHUB_ORG`).
- **"Tetap masuk"** untuk sesi panjang (30 hari); tanpa itu sesi berakhir dalam 12 jam. Keduanya bisa diatur lewat env.
- Sesi login disimpan sebagai hash SHA-256 di server dan bisa dicabut kapan pun lewat tombol **Keluar**.
- Ganti password dari API (`PUT /api/auth/password`) — sesi di perangkat lain otomatis dicabut.
- Percobaan masuk yang gagal dibatasi (10 kali / 15 menit per IP+email); permintaan tautan reset dibatasi 5 kali / jam.
- Respons lupa password selalu sama (tidak membocorkan apakah sebuah email terdaftar), dan pesan login tidak membedakan email salah vs password salah.
- Akun baru langsung mendapat kategori dan rekening bawaan sendiri.

### Data & keamanan
- Recycle bin 30 hari: transaksi, transaksi berulang, transfer, dan rekening yang terhapus bisa dipulihkan.
- Backup & restore seluruh data ke file JSON (per akun — restore tidak menyentuh data pengguna lain).
- Backup otomatis file database ke `server/backups/` (setiap 6 jam, menyimpan 14 salinan terakhir).
- Mode tema terang/gelap/otomatis (mengikuti sistem).

### Antarmuka & panduan
- **Navbar responsif**: di layar lebar semua aksi tampil berjajar; di layar sempit (HP/tablet) mengecil menjadi menu hamburger tanpa merusak tata letak.
- **Menu "Data"**: ekspor CSV/PDF, import CSV, backup, dan restore dikelompokkan dalam satu dropdown agar navbar tetap ringkas.
- **Avatar pengguna** dengan inisial nama di pojok kanan atas.
- **Tutorial penggunaan**: panduan langkah demi langkah (catat transaksi, kelola rekening, transaksi berulang, anggaran, laporan, dan backup) muncul otomatis setelah masuk, dan bisa dibuka lagi kapan pun lewat tombol **Bantuan**.

## API

Semua endpoint di bawah `/api` (kecuali `/api/auth/register`, `/api/auth/login`, dan `/api/health`) membutuhkan header `Authorization: Bearer <token>`. Data yang dikembalikan selalu hanya milik pengguna tersebut.

| Method | Endpoint | Keterangan |
| ------ | -------- | ---------- |
| GET    | `/api/health` | Cek status server |
| GET    | `/api/auth/config` | Konfigurasi publik: pendaftaran, GitHub, email, syarat password |
| POST   | `/api/auth/register` | Daftar akun baru (`email`, `name`, `password` ≥ 8 karakter) |
| POST   | `/api/auth/login` | Masuk (`remember: true` untuk sesi panjang), mengembalikan `token` + `user` |
| POST   | `/api/auth/logout` | Keluar (mencabut token yang dipakai) |
| GET    | `/api/auth/me` | Profil pengguna yang sedang masuk |
| PUT    | `/api/auth/password` | Ganti password (mencabut sesi lain) |
| POST   | `/api/auth/forgot-password` | Kirim tautan reset password |
| GET    | `/api/auth/reset-password/:token` | Periksa tautan reset (valid/tidak, milik email siapa) |
| POST   | `/api/auth/reset-password` | Simpan password baru dari tautan reset |
| POST   | `/api/auth/verify-email` | Konfirmasi email lewat token |
| POST   | `/api/auth/resend-verification` | Kirim ulang tautan konfirmasi (butuh sesi) |
| GET    | `/api/auth/github/start` | Mulai login GitHub (redirect ke GitHub) |
| GET    | `/api/auth/github/callback` | Callback OAuth dari GitHub |
| POST   | `/api/auth/github/exchange` | Tukar kode sekali pakai menjadi sesi |
| GET    | `/api/transactions` | Transaksi Milik Anda (`?month=YYYY-MM` atau `?from=&to=`) |
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
| GET    | `/api/backup` | Export seluruh data pengguna ini (JSON) |
| POST   | `/api/restore` | Import seluruh data dari backup JSON (mengganti data pengguna ini) |
