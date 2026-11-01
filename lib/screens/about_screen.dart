import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_info.dart';

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  static const _steps = [
    'Siapkan folder game RPG Maker MV atau MZ di HP (hasil ekstrak, bukan file zip).',
    'Tekan Tambah Game di Pustaka lalu pilih foldernya. Game akan disalin ke dalam app.',
    'Tekan Main. Tombol di layar langsung muncul tanpa plugin tambahan.',
    'Di dalam game, tekan tombol menu kecil di pojok kiri atas untuk mengatur tombol, melihat log, atau menyalakan terjemahan langsung.',
    'Mau terjemahan offline? Buka titik tiga di kartu game lalu pilih Terjemahan offline. Semua teks dan gambar bisa diterjemahkan lalu diedit sebelum dimainkan.',
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final primary = theme.colorScheme.primary;
    final muted = theme.colorScheme.onSurface.withAlpha(150);
    return Scaffold(
      appBar: AppBar(title: const Text('Tentang')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(color: primary.withAlpha(40), borderRadius: BorderRadius.circular(14)),
                child: Icon(Icons.sports_esports, color: primary, size: 30),
              ),
              const SizedBox(width: 14),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(AppInfo.appName, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
                  FutureBuilder<PackageInfo>(
                    future: PackageInfo.fromPlatform(),
                    builder: (_, s) => Text(
                      s.hasData ? 'Versi ${s.data!.version}' : '',
                      style: TextStyle(color: muted),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Launcher untuk memainkan game RPG Maker MV dan MZ di Android dengan sekali tap, '
            'lengkap dengan tombol layar yang bisa diatur dan terjemahan game.',
            style: TextStyle(height: 1.4),
          ),
          const SizedBox(height: 22),
          const Text('Cara pakai', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 8),
          for (var i = 0; i < _steps.length; i++)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(width: 24, child: Text('${i + 1}.', style: TextStyle(color: primary, fontWeight: FontWeight.w700))),
                  Expanded(child: Text(_steps[i], style: const TextStyle(height: 1.35))),
                ],
              ),
            ),
          const SizedBox(height: 14),
          const Text('Developer', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 6),
          const Text(AppInfo.developerName, style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          const Text(AppInfo.appBio, style: TextStyle(height: 1.35)),
          const SizedBox(height: 10),
          OutlinedButton.icon(
            onPressed: () => launchUrl(Uri.parse('mailto:${AppInfo.contactEmail}')),
            icon: const Icon(Icons.mail_outline, size: 18),
            label: const Text('Email'),
          ),
          const SizedBox(height: 22),
          Text(
            'ArupijiPlay tidak menyertakan game apa pun. Pastikan kamu hanya memainkan game yang kamu miliki '
            'atau yang boleh kamu mainkan.',
            style: TextStyle(fontSize: 12, color: muted, height: 1.4),
          ),
        ],
      ),
    );
  }
}
