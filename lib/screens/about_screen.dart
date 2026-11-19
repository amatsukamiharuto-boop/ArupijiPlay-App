import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:provider/provider.dart';

import '../config/app_info.dart';
import '../services/i18n.dart';
import '../services/settings_store.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  static const _stepsId = [
    'Siapkan folder game RPG Maker MV atau MZ di HP (hasil ekstrak, bukan file zip).',
    'Tekan Tambah Game di Pustaka, pilih Tanpa salin (cepat) atau Salin ke app, lalu pilih foldernya.',
    'Tekan Main. Tombol di layar langsung muncul tanpa plugin tambahan.',
    'Di dalam game, tekan tombol garis tiga di pojok kiri atas untuk mengatur posisi dan ukuran tombol atau membuka Cheat.',
    'Atur tombol, kursor, cheat, FPS, bahasa, dan izin penyimpanan dari halaman Pengaturan.',
  ];
  static const _stepsEn = [
    'Prepare an RPG Maker MV or MZ game folder on your phone (extracted, not a zip file).',
    'Tap Add Game in Library, choose No copy (fast) or Copy into app, then pick the folder.',
    'Tap Play. The on-screen buttons appear right away, no extra plugin needed.',
    'Inside the game, tap the three-line button at the top left to edit button position and size or open Cheat.',
    'Set buttons, cursor, cheat, FPS, language, and storage permission from the Settings page.',
  ];

  /// Buka halaman Lapor Bug di website. Kalau gagal dibuka, tampilkan pesan.
  Future<void> _openReport(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    final failText = context.t(
        'Tidak bisa membuka browser. Buka manual: ${AppInfo.reportUrl}',
        'Could not open the browser. Open it manually: ${AppInfo.reportUrl}');
    var ok = false;
    try {
      ok = await launchUrl(Uri.parse(AppInfo.reportUrl), mode: LaunchMode.externalApplication);
    } catch (_) {}
    if (!ok) {
      messenger.showSnackBar(SnackBar(content: Text(failText), duration: const Duration(seconds: 6)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final en = context.watch<SettingsStore>().appLang == 'en';
    final steps = en ? _stepsEn : _stepsId;
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final muted = theme.colorScheme.onSurface.withAlpha(150);
    return Scaffold(
      appBar: AppBar(title: Text(context.t('Tentang', 'About'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Logo HITOYA Interactive. Taruh gambarnya di assets/images/hitoya_logo.png
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: const Color(0xFFF6F6F6),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: theme.colorScheme.onSurface.withAlpha(30)),
            ),
            child: Image.asset(
              'assets/images/hitoya_logo.png',
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => const Column(
                children: [
                  Text('HITOYA Interactive',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.black)),
                  SizedBox(height: 4),
                  Text("RPG Maker & Ren'py Launcher", style: TextStyle(color: Colors.black54)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 10),
          Center(
            child: FutureBuilder<PackageInfo>(
              future: PackageInfo.fromPlatform(),
              builder: (_, s) => Text(
                s.hasData ? context.t('Versi ${s.data!.version}', 'Version ${s.data!.version}') : '',
                style: TextStyle(color: muted),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text(
            context.t(
                'Launcher untuk memainkan game RPG Maker MV dan MZ di Android dengan sekali tap, lengkap dengan tombol layar yang bisa diatur, mode kursor, dan menu cheat.',
                'A launcher to play RPG Maker MV and MZ games on Android with one tap, with adjustable on-screen buttons, a cursor mode, and a cheat menu.'),
            style: const TextStyle(height: 1.4),
          ),
          const SizedBox(height: 22),
          Text(context.t('Cara pakai', 'How to use'), style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 8),
          for (var i = 0; i < steps.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 24, child: Text('${i + 1}.', style: TextStyle(color: primary, fontWeight: FontWeight.w700))),
                  Expanded(child: Text(steps[i], style: const TextStyle(height: 1.35))),
                ],
              ),
            ),
          const SizedBox(height: 14),
          Text('Developer', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 6),
          const Text('HITOYA Interactive', style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text(
              en
                  ? 'A launcher for playing RPG Maker games on Android, free of charge.'
                  : 'Aplikasi launcher untuk memainkan game RPG Maker di Android, gratis tanpa dipungut biaya.',
              style: const TextStyle(height: 1.35)),
          const SizedBox(height: 10),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: () => launchUrl(Uri.parse('mailto:${AppInfo.contactEmail}')),
                icon: const Icon(Icons.mail_outline, size: 18),
                label: const Text('Email'),
              ),
              OutlinedButton.icon(
                onPressed: () => _openReport(context),
                icon: const Icon(Icons.bug_report_outlined, size: 18),
                label: Text(context.t('Lapor Bug / Error', 'Report a Bug / Error')),
              ),
            ],
          ),
          const SizedBox(height: 22),
          Text(
            context.t(
                'Aplikasi ini tidak menyertakan game apa pun. Pastikan kamu hanya memainkan game yang kamu miliki atau yang boleh kamu mainkan.',
                'This app does not include any games. Make sure you only play games you own or are allowed to play.'),
            style: TextStyle(fontSize: 12, color: muted, height: 1.4),
          ),
        ],
      ),
    );
  }
}
