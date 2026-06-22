# FacultyWare — Data Induk Pegawai & Akademik

[![Playwright Tests](https://img.shields.io/badge/tests-69%20passed-brightgreen)](tests/)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-green)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-v4-blue)](https://expressjs.com)

**Repository Implementasi Fitur Utama (UAS)**  
Kelompok B1 — Tugas Besar Pemrograman Web  
Fakultas Teknologi Informasi, Universitas Andalas — 2026

🌐 **URL Deployment:** https://ftiunand.my.id

---

## Deskripsi Aplikasi

**FacultyWare** adalah aplikasi web manajemen data induk pegawai dan akademik yang dirancang untuk lingkungan fakultas. Sistem ini memungkinkan pengelolaan data pegawai, dosen, mahasiswa, nomenklatur jabatan, struktur organisasi, dan standar biaya perjalanan dinas secara terpusat dan terintegrasi.

### Fitur Utama

| No | Modul | Deskripsi |
|----|-------|-----------|
| 1 | **Autentikasi** | Login, logout, dan proteksi akses berbasis session |
| 2 | **Data Pegawai & Dosen** | Kelola data pegawai dan dosen (CRUD), pencarian, ekspor PDF & JSON, REST API |
| 3 | **Nomenklatur & Klasifikasi Jabatan** | Kelola nomenklatur jabatan (CRUD), pencarian, ekspor PDF & JSON, REST API |
| 4 | **Struktur Jabatan & Tupoksi** | Kelola struktur jabatan dan tupoksi (CRUD), pencarian, ekspor PDF & JSON, REST API |
| 5 | **SBM Perjalanan Dinas** | Kelola standar biaya perjalanan dinas (CRUD), validasi tarif, ekspor PDF & JSON, REST API |
| 6 | **Data Mahasiswa** | Kelola data mahasiswa (CRUD), validasi input, pencarian, ekspor PDF & JSON, REST API |

### Teknologi yang Digunakan

| Kategori | Teknologi |
|----------|-----------|
| Runtime | Node.js v18+ |
| Framework | Express.js v4 |
| Template Engine | EJS |
| Database | MySQL 8 (native `mysql2`, tanpa ORM) |
| Session | express-session + express-mysql-session |
| PDF Generator | PDFKit |
| CSS Framework | Basecoat UI v0.3.11 (via CDN) |
| Testing | Playwright (End-to-End, Chromium) |

---

## Cara Instalasi dan Menjalankan Aplikasi

### Prasyarat

Pastikan perangkat Anda telah terinstall:
- [Node.js](https://nodejs.org) versi 18 atau lebih baru
- [MySQL](https://www.mysql.com) versi 8
- [Git](https://git-scm.com)

### Langkah Instalasi

**1. Clone repository**

```bash
git clone https://github.com/Daffarael/B1-data-induk-pegawai.git
cd B1-data-induk-pegawai
```

**2. Install dependencies**

```bash
npm install
```

**3. Konfigurasi environment**

Buat file `.env` di root project:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=facultyware
SESSION_SECRET=your_session_secret_key
```

**4. Siapkan database**

Buat database MySQL dengan nama `facultyware`, kemudian import SQL schema yang disediakan dosen:

```bash
mysql -u root -p facultyware < facultyware.sql
```

**5. Jalankan scripts setup**

Setelah database di-import, jalankan script berikut untuk membuat akun pengguna dan mengisi data master:

```bash
# Buat akun admin dan assign role
node scripts/init_db.js

# Isi data master (status kepegawaian, golongan, kota, komponen biaya, dll)
node scripts/seed_master_data.js
```

**6. Jalankan aplikasi**

```bash
# Mode development (dengan auto-reload saat ada perubahan file)
npm run dev

# Mode production
npm start
```

Aplikasi akan berjalan di: **http://localhost:3000**

### Akun Login Default

Setelah menjalankan `node scripts/init_db.js`:

| Role | Email | Password |
|------|-------|----------|
| Admin Kepegawaian | `admin.kepegawaian@fti.unand.ac.id` | `Kepegawaian@2026` |
| Admin Kemahasiswaan | `admin.kemahasiswaan@fti.unand.ac.id` | `Kemahasiswaan@2026` |

### Daftar Perintah (npm Scripts)

| Perintah | Fungsi |
|----------|--------|
| `npm start` | Menjalankan server dalam mode production |
| `npm run dev` | Menjalankan server dalam mode development (nodemon) |
| `npm test` | Menjalankan seluruh test suite Playwright |
| `npm run test:ui` | Menjalankan test dengan tampilan UI interaktif |
| `npm run test:report` | Membuka HTML report hasil test di browser |

### Menjalankan Testing

Pastikan aplikasi **sedang berjalan** di `http://localhost:3000` sebelum menjalankan test.

```bash
# Install Chromium untuk Playwright (hanya perlu sekali)
npx playwright install chromium

# Jalankan semua test (69 test case)
npm test

# Jalankan test per modul
npx playwright test tests/01-login.spec.js           # Login & Logout (6 test)
npx playwright test tests/02-pegawai.spec.js          # Data Pegawai & Dosen (12 test)
npx playwright test tests/03-nomenklatur.spec.js      # Nomenklatur (12 test)
npx playwright test tests/04-struktur-jabatan.spec.js # Struktur Jabatan (12 test)
npx playwright test tests/05-sbm.spec.js              # SBM Perjalanan Dinas (13 test)
npx playwright test tests/06-mahasiswa.spec.js        # Data Mahasiswa (14 test)

# Lihat laporan hasil test dalam format HTML
npm run test:report
```

**Hasil Testing:** 69/69 test passed ✅ (Browser: Chromium)

---

## Pembagian Tugas Anggota

| No | Nama | NIM | Tugas / Modul yang Dikerjakan |
|----|------|-----|-------------------------------|
| 1 | Daffarael Anaqi Ali | 2411523015 | Modul Data Pegawai & Dosen — CRUD, pencarian, ekspor PDF/JSON, REST API, testing |
| 2 | Firzatunnisa | 2411523011 | Modul Nomenklatur & Klasifikasi Jabatan — CRUD, pencarian, ekspor PDF/JSON, REST API, testing |
| 3 | Luthfi Harisna Mufti | 2411523019 | Modul Struktur Jabatan & Tupoksi — CRUD, pencarian, ekspor PDF/JSON, REST API, testing |
| 4 | Tasya Putri Wandari | 2411523027 | Modul SBM Perjalanan Dinas — CRUD, validasi tarif, ekspor PDF/JSON, REST API, testing |
| 5 | Ayesah Luthfiah Maharani | 2411523002 | Modul Data Mahasiswa — CRUD, validasi input, pencarian, ekspor PDF/JSON, REST API, testing |

> **Dikerjakan bersama:** Setup project, konfigurasi awal, sistem autentikasi (login/logout), desain UI/CSS, dan deployment.

---

*Kelompok B1 — Tugas Besar Pemrograman Web, Departemen Sistem Informasi, Fakultas Teknologi Informasi, Universitas Andalas — Juni 2026*
