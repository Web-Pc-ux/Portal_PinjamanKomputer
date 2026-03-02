# 🖥️ Portal Peminjaman Komputer UMS

Sistem pengurusan peminjaman peralatan ICT (Komputer/Laptop) yang dioptimumkan untuk penggunaan di **Jabatan Digital UMS , Unit Perkomputeraan**.

## ✨ Ciri-Ciri Utama
- **Dashboard Admin:** Analisis data, pengurusan permohonan, dan inventori komputer.
- **Borang Peminjaman:** Borang mesra pengguna untuk pemohon.
- **QR Code Verification:** Sistem imbasan QR untuk pengesahan masa pinjam/pulang secara real-time.
- **Custom Branding:** Logo, latar belakang, dan footer yang boleh disesuaikan.
- **Integrasi Cloud:** Menggunakan Firebase (Auth & Firestore) dan Google Sheets (Apps Script) sebagai pangkalan data.
- **Sistem Keselamatan:** Carian Admin secara server-side untuk mengelakkan kebocoran data.

## 🛠️ Tech Stack
- **Frontend:** HTML5, Vanilla CSS3, Javascript (ES6+)
- **UI Components:** [SweetAlert2](https://sweetalert2.github.io/), [FontAwesome](https://fontawesome.com/)
- **Backend/Database:** 
  - [Firebase](https://firebase.google.com/) (Authentication & Firestore)
  - [Google Apps Script](https://developers.google.com/apps-script) (Turbo Sync Engine v5)
  - [Google Sheets](https://www.google.com/sheets/about/) (Penyimpanan data utama)

## 🚀 Cara Setup
1. **Dapatkan Kod:** `Clone` repo ini ke komputer anda.
2. **Setup Firebase:**
   - Bina projek baru di [Firebase Console](https://console.firebase.google.com/).
   - Aktifkan **Authentication** (Email/Password) dan **Firestore**.
   - Masukkan konfigurasi Firebase anda ke dalam `login.js` dan `dashboard/script.js`.
3. **Setup Google Sheets:**
   - Buat Google Sheets baru.
   - Buka **Extensions > Apps Script**.
   - Salin dan tampal kod dari `googlescript.md` ke dalam Apps Script tersebut.
   - **Deploy** sebagai Web App (Access: Anyone).
   - Salin pautan URL yang diberikan dan masukkan ke dalam `GAS_URL` di fail-fail Javascript berkaitan.
4. **Token Keselamatan:** Setkan `GAS_TOKEN` anda sendiri untuk keselamatan tambahan.

## 📝 Nota Keselamatan
- Pastikan anda tidak berkongsi `GAS_URL` dan `apiKey` anda kepada umum tanpa kawalan.
- Folder `node_modules` dan `_archive_lama` telah diabaikan dalam `.gitignore`.

---
© 2026 Jabatan Digital UMS , Unit Perkomputeraan. Hak Cipta Terpelihara.
