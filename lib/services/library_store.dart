import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../models/game.dart';
import 'game_db.dart';
import 'native_bridge.dart';
import 'settings_store.dart';

class LibraryStore extends ChangeNotifier {
  LibraryStore(this._db);
  final GameDb _db;

  List<Game> games = [];
  bool busy = false;

  /// Keterangan proses tambah game. progress null = belum diketahui.
  String importText = '';
  double? importProgress;
  bool canCancel = false;
  Timer? _poll;

  Future<void> refresh() async {
    games = await _db.all();
    _sort();
    notifyListeners();
  }

  void _sort() {
    games.sort((a, b) {
      final c = b.lastPlayed.compareTo(a.lastPlayed);
      return c != 0 ? c : b.addedAt.compareTo(a.addedAt);
    });
  }

  String _mb(num bytes) => (bytes / 1048576).toStringAsFixed(0);

  Future<void> _pollOnce() async {
    try {
      final st = await NativeBridge.importStatus();
      if (st['running'] != true) {
        importText = 'Menunggu pilihan folder...';
        importProgress = null;
        canCancel = false;
      } else {
        final total = (st['totalBytes'] as num?) ?? 0;
        final done = (st['doneBytes'] as num?) ?? 0;
        final files = (st['totalFiles'] as num?)?.toInt() ?? 0;
        final doneFiles = (st['doneFiles'] as num?)?.toInt() ?? 0;
        if (total > 0) {
          importProgress = (done / total).clamp(0.0, 1.0).toDouble();
          importText = '${st['phase']}  ${_mb(done)} dari ${_mb(total)} MB  ($doneFiles/$files file)';
        } else {
          importProgress = null;
          importText = '${st['phase']}';
        }
        canCancel = true;
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<void> cancelImport() => NativeBridge.importCancel();

  /// Balikin pesan untuk ditampilkan, atau null kalau dibatalkan.
  Future<String?> addGame({bool link = false}) async {
    busy = true;
    importText = 'Menunggu pilihan folder...';
    importProgress = null;
    canCancel = false;
    notifyListeners();
    _poll = Timer.periodic(const Duration(milliseconds: 500), (_) => _pollOnce());
    try {
      final meta = await NativeBridge.importGame(link: link);
      if (meta == null) return null;
      final game = Game(
        id: meta['id'] as String,
        title: meta['title'] as String,
        engine: meta['engine'] as String,
        path: meta['path'] as String,
        cover: meta['cover'] as String?,
        addedAt: DateTime.now().millisecondsSinceEpoch,
      );
      await _db.insert(game);
      await refresh();
      return '${game.title} ditambahkan (${game.engine})';
    } on PlatformException catch (e) {
      return 'Gagal menambah game: ${e.message}';
    } finally {
      _poll?.cancel();
      busy = false;
      canCancel = false;
      notifyListeners();
    }
  }

  Future<void> play(Game g, SettingsStore s) async {
    await NativeBridge.launchGame(g, s);
    g.lastPlayed = DateTime.now().millisecondsSinceEpoch;
    await _db.update(g);
    _sort();
    notifyListeners();
  }

  Future<void> rename(Game g, String title) async {
    final t = title.trim();
    if (t.isEmpty) return;
    g.title = t;
    await _db.update(g);
    notifyListeners();
  }

  Future<void> remove(Game g) async {
    await NativeBridge.deleteGameFiles(g.path);
    await _db.delete(g.id);
    games.removeWhere((x) => x.id == g.id);
    notifyListeners();
  }
}
