import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../config/features.dart';
import '../models/game.dart';
import '../services/i18n.dart';
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
    context.watch<SettingsStore>(); // supaya teks ikut berganti saat bahasa diubah
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
        label: Text(context.t('Tambah Game', 'Add Game')),
      ),
    );
  }

  Future<void> _add(BuildContext context) async {
    final lib = context.read<LibraryStore>();
    final messenger = ScaffoldMessenger.of(context);
    final linkText = context.t(
        'Game dibuka langsung dari foldernya, langsung siap. Cocok untuk game besar. '
            'Butuh izin Akses semua file. Jangan hapus atau pindahkan foldernya.',
        'The game opens straight from its folder and is ready right away. Good for big games. '
            'Needs the All files access permission. Do not delete or move the folder.');
    final copyText = context.t(
        'Game disalin ke penyimpanan app. Folder asli boleh dihapus, tapi game besar butuh waktu lama dan ruang ganda.',
        'The game is copied into the app storage. You may delete the original folder, but big games take long and use double the space.');
    final mode = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.bolt),
              title: Text(ctx.t('Tanpa salin (cepat)', 'No copy (fast)')),
              subtitle: Text(linkText),
              onTap: () => Navigator.pop(ctx, 'link'),
            ),
            ListTile(
              leading: const Icon(Icons.copy_all),
              title: Text(ctx.t('Salin ke app', 'Copy into app')),
              subtitle: Text(copyText),
              onTap: () => Navigator.pop(ctx, 'copy'),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (mode == null || !context.mounted) return;

    if (mode == 'link' && !await NativeBridge.hasAllFilesAccess()) {
      await NativeBridge.requestAllFilesAccess();
      if (!context.mounted) return;
      messenger.showSnackBar(SnackBar(
        duration: const Duration(seconds: 8),
        content: Text(context.t(
            'Izinkan "Akses semua file" untuk ArupijiPlay, lalu kembali ke app dan tekan Tambah Game lagi.',
            'Allow "All files access" for ArupijiPlay, then come back and tap Add Game again.')),
      ));
      return;
    }
    final r = await lib.addGame(link: mode == 'link');
    if (r == null || !context.mounted) return;
    final msg = r.isOk
        ? context.t('${r.title} ditambahkan (${r.engine})', '${r.title} added (${r.engine})')
        : context.t('Gagal menambah game: ${r.error}', 'Could not add the game: ${r.error}');
    messenger.showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _play(BuildContext context, Game g) async {
    final lib = context.read<LibraryStore>();
    final settings = context.read<SettingsStore>();
    final messenger = ScaffoldMessenger.of(context);
    try {
      await lib.play(g, settings);
    } on PlatformException catch (e) {
      if (!context.mounted) return;
      messenger.showSnackBar(SnackBar(
          content: Text(context.t('Tidak bisa membuka game: ${e.message}', 'Could not open the game: ${e.message}'))));
    }
  }

  Future<void> _onAction(BuildContext context, Game g, GameAction a) async {
    final lib = context.read<LibraryStore>();
    if (a == GameAction.studio) {
      if (Features.showTranslation) {
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => StudioScreen(game: g)));
      }
      return;
    }
    if (a == GameAction.rename) {
      final c = TextEditingController(text: g.title);
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(ctx.t('Ubah judul', 'Rename')),
          content: TextField(controller: c, autofocus: true),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.t('Batal', 'Cancel'))),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.t('Simpan', 'Save'))),
          ],
        ),
      );
      if (ok == true) await lib.rename(g, c.text);
    } else {
      final ok = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: Text(ctx.t('Hapus game?', 'Remove game?')),
          content: Text(ctx.t(
              '"${g.title}" dihapus dari pustaka. Kalau game ini disalin ke app, salinannya ikut dihapus. Folder asli dan folder save tidak disentuh.',
              '"${g.title}" will be removed from the library. If it was copied into the app, that copy is deleted too. The original folder and the save folder are not touched.')),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(ctx.t('Batal', 'Cancel'))),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(ctx.t('Hapus', 'Remove'))),
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
            Text(context.t('Belum ada game', 'No games yet'),
                style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            Text(
              context.t(
                  'Tekan Tambah Game lalu pilih folder game RPG Maker MV atau MZ (yang berisi index.html atau folder www).',
                  'Tap Add Game, then pick an RPG Maker MV or MZ game folder (one that has index.html or a www folder).'),
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

  String _phase(BuildContext context) {
    final p = lib.importPhase;
    if (p.startsWith('Menyalin')) return context.t('Menyalin file game...', 'Copying game files...');
    if (p.startsWith('Menyiapkan')) return context.t('Menyiapkan data game...', 'Preparing game data...');
    return context.t('Membaca daftar file...', 'Reading file list...');
  }

  @override
  Widget build(BuildContext context) {
    String text;
    if (lib.importWaiting) {
      text = context.t('Menunggu pilihan folder...', 'Waiting for the folder choice...');
    } else if (lib.importTotalMb > 0) {
      text = context.t(
          '${_phase(context)}  ${lib.importDoneMb} dari ${lib.importTotalMb} MB  (${lib.importDoneFiles}/${lib.importTotalFiles} file)',
          '${_phase(context)}  ${lib.importDoneMb} of ${lib.importTotalMb} MB  (${lib.importDoneFiles}/${lib.importTotalFiles} files)');
    } else {
      text = _phase(context);
    }
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
              Expanded(child: Text(text, style: const TextStyle(fontSize: 12))),
              if (lib.canCancel)
                TextButton(onPressed: lib.cancelImport, child: Text(context.t('Batal', 'Cancel'))),
            ],
          ),
        ],
      ),
    );
  }
}
