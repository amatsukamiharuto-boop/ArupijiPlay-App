# ArupijiPlay

Launcher game RPG Maker MV dan MZ untuk Android. UI launcher memakai Flutter, game dijalankan di WebView native (Kotlin) pada proses terpisah.

## Struktur

- `lib/` kode Flutter: pustaka game, pengaturan, halaman Dukung dan Tentang
- `android_overlay/` kode native Android (Kotlin, manifest, skrip JS yang disuntik ke game)
- `tools/setup_android.sh` membuat folder `android/` lewat `flutter create`, mengatur minSdk 26, lalu menimpa dengan isi `android_overlay/`
- `.github/workflows/build.yml` build APK otomatis di GitHub Actions

## Cara build lewat GitHub

1. Buat repo baru, upload semua isi folder ini, branch `main`.
2. Buka tab Actions, jalankan workflow "Build APK" (atau cukup push).
3. Setelah selesai, unduh `ArupijiPlay-apk` dari bagian Artifacts, di dalamnya ada `app-release.apk`.

Build lokal: `bash tools/setup_android.sh && flutter pub get && flutter build apk --release --no-shrink`

## Yang perlu kamu ganti

- `lib/config/app_info.dart` nama developer, bio, email, link GitHub, link Trakteer/Saweria/Ko-fi
- `assets/images/qris.png` gambar QRIS (opsional, kalau ada otomatis tampil di halaman Dukung)
- Ikon app: pakai paket `flutter_launcher_icons` atau ganti manual di `android/app/src/main/res/mipmap-*`
- Untuk rilis ke Play Store, siapkan keystore sendiri, jangan pakai debug key bawaan

## Cara kerja singkat

Tambah Game: Android membuka picker folder, isi folder game (yang berisi `index.html`, atau `www/index.html`) disalin ke penyimpanan internal app, lalu judul dan cover dibaca dari `data/System.json` dan `img/titles1`. Metadata disimpan di SQLite.

Main: `GameActivity` membuka `file:///.../index.html` di WebView dengan JavaScript, DOM storage, akses file, dan hardware acceleration aktif. Setelah halaman selesai dimuat, `inject.js` disuntik otomatis: gamepad virtual (multi-touch, mengirim event keyboard ke RPG Maker), menu overlay, dan hook terjemahan.

Terjemahan: hook di `Window_Message.startMessage` menahan dialog sebentar sampai teks terjemahan siap. Urutan pengecekan: override buatan pemain, lalu cache SQLite, lalu panggilan API (endpoint kompatibel OpenAI, jadi bisa OpenAI, Gemini, OpenRouter, Groq, dan sejenisnya). Glosarium dikirim di system prompt.

## Batasan yang perlu diketahui

- Terjemahan mencakup dialog, pilihan, teks scroll, menu, item, skill, deskripsi, dan battle log. Teks yang digambar langsung oleh plugin pihak ketiga (tanpa lewat Window_Base) belum tertangkap. Teks menu/battle muncul dulu dalam bahasa asli lalu berganti sendiri setelah terjemahan datang, kecuali sudah ada di cache.
- Save game dipisah per game lewat `WebView.setDataDirectorySuffix`, hanya di Android 9 ke atas. Di Android 8 save antar game bisa tercampur.
- Cover otomatis gagal untuk game dengan gambar terenkripsi (`.rpgmvp`), akan tampil huruf awal judul.
- Game besar butuh waktu saat disalin pertama kali.
- Kode ini belum dikompilasi di lingkungan pembuatnya, jadi build pertama di GitHub bisa menampilkan error kecil yang perlu disesuaikan.
