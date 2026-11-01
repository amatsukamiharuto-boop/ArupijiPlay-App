import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config/app_info.dart';

class SupportScreen extends StatelessWidget {
  const SupportScreen({super.key});

  static const _qrisAsset = 'assets/images/qris.png';

  Future<bool> _qrisExists() async {
    try {
      await rootBundle.load(_qrisAsset);
      return true;
    } catch (_) {
      return false;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Dukung Developer')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text(AppInfo.dukungkami, style: TextStyle(height: 1.45)),
          const SizedBox(height: 16),
          for (final d in AppInfo.donations)
            Card(
              margin: const EdgeInsets.only(bottom: 10),
              child: ListTile(
                title: Text(d.name, style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text(d.note),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    IconButton(
                      tooltip: 'Tampilkan QR',
                      icon: const Icon(Icons.qr_code_2),
                      onPressed: () => _showQr(context, d.name, d.url),
                    ),
                    IconButton(
                      tooltip: 'Buka link',
                      icon: const Icon(Icons.open_in_new),
                      onPressed: () => launchUrl(Uri.parse(d.url), mode: LaunchMode.externalApplication),
                    ),
                  ],
                ),
              ),
            ),
          FutureBuilder<bool>(
            future: _qrisExists(),
            builder: (_, snap) {
              if (snap.data != true) return const SizedBox.shrink();
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      const Text('QRIS', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(height: 4),
                      const Text('Scan lewat m-banking atau e-wallet apa saja'),
                      const SizedBox(height: 12),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.asset(_qrisAsset, width: 240),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  void _showQr(BuildContext context, String name, String url) {
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(name),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              color: Colors.white,
              padding: const EdgeInsets.all(10),
              child: QrImageView(data: url, size: 210),
            ),
            const SizedBox(height: 10),
            SelectableText(url, style: const TextStyle(fontSize: 12)),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Tutup'))],
      ),
    );
  }
}
