import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../models/game.dart';
import '../services/library_store.dart';
import '../services/native_bridge.dart';
import '../services/settings_store.dart';
import '../widgets/game_card.dart';
import 'studio_screen.dart';

class LibraryScreen extends StatelessWidget {
  const LibraryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final lib = context.watch<LibraryStore>();
    return Scaffold(
      appBar: AppBar(title: const Text('ArupijiPlay')),
      body: Column(
        children: [
          if (lib.busy) _ImportBanner(lib: lib),
          Expanded(
            child: lib.games.isEmpty
                ? const _EmptyState()
                : GridView.builder(
                    padding: const EdgeInsets.fromLTRB(14, 8, 14, 100),
                    gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                      maxCrossAxisExtent: 200,
                      childAspectRatio: 0.66,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                    ),
                    itemCount: lib.games.length,
                    itemBuilder: (_, i) {
                      final g = lib.games[i];
                      return GameCard(
                        game: g,
                        onPlay: () => _play(context, g),
                        onAction: (a) => _onAction(context, g, a),
                      );
                    },
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: lib.busy ? null : () => _add(context),
        icon: const Icon(Icons.add),
        label: const Text('Tambah Game'),
      ),
    );
  }

  Future<void> _add(BuildContext context) async {
    final lib = context.read<LibraryStore>();
    final messenger = ScaffoldMessenger.of(context);
    final mode = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.bolt),
              title: const Text('Tanpa salin (cepat)'),
              subtitle: const Text(
                  'Game dibuka langsung dari foldernya, langsung siap. Cocok untuk game besar. '
                  'Butuh izin Akses semua file. Jangan hapus atau pindahkan foldernya.'),
              onTap: () => Navigator.pop(ctx, 'link'),
            ),
            ListTile(
              leading: const Icon(Icons.copy_all),
              title: const Text('Salin ke app'),
              subtitle: const Text(
                  'Game disalin ke penyimpanan app. Folder asli boleh dihapus, tapi game besar butuh waktu lama dan ruang ganda.'),
              onTap: () => Navigator.pop(ctx, 'copy'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (mode == null) return;

    if (mode == 'link' && !await NativeBridge.hasAllFilesAccess()) {
      await NativeBridge.requestAllFilesAccess();
      messenger.showSnackBar(const SnackBar(
        duration: Duration(seconds: 8),
        content: Text('Izinkan "Akses semua file" untuk ArupijiPlay, lalu kembali ke app dan tekan Tambah Game lagi.'),
      ));
      return;
    }
    final msg = await lib.addGame(link: mode == 'link');
    if (msg != null) messenger.showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _play(BuildContext context, Game g) async {
    final lib = context.read<LibraryStore>();
    final settings = context.read<SettingsStore>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      await lib.play(g, settings);
    } on PlatformException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text('Tidak bisa membuka game: ${e.message}')));
    }
  }

  Future<void> _onAction(BuildContext context, Game g, GameAction a) async {
    final lib = context.read<LibraryStore>();
    if (a == GameAction.studio) {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => StudioScreen(game: g)));
      return;
    }
    if (a == GameAction.rename) {
      final c = TextEditingController(text: g.title);
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Ubah judul'),
          content: TextField(controller: c, autofocus: true),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Simpan')),
          ],
        ),
      );
      if (ok == true) await lib.rename(g, c.text);
    } else {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Hapus game?'),
          content: Text('"${g.title}" beserta file salinannya dan save data-nya akan dihapus dari app ini.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Hapus')),
          ],
        ),
      );
      if (ok == true) await lib.remove(g);
    }
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.folder_open, size: 64, color: Theme.of(context).colorScheme.primary),
            const SizedBox(height: 16),
            const Text('Belum ada game', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            const Text(
              'Tekan Tambah Game lalu pilih folder game RPG Maker MV atau MZ '
              '(yang berisi index.html atau folder www).',
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _ImportBanner extends StatelessWidget {
  const _ImportBanner({required this.lib});
  final LibraryStore lib;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 4, 14, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(value: lib.importProgress, minHeight: 6),
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(child: Text(lib.importText, style: const TextStyle(fontSize: 12))),
              if (lib.canCancel) TextButton(onPressed: lib.cancelImport, child: const Text('Batal')),
            ],
          ),
        ],
      ),
    );
  }
}
