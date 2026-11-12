import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import '../models/game.dart';
import 'game_db.dart';
import 'native_bridge.dart';
import 'settings_store.dart';

class AddResult {
  const AddResult.ok(this.title, this.engine) : error = null;
  const AddResult.fail(this.error)
      : title = null,
        engine = null;
  final String? title;
  final String? engine;
  final String? error;
  bool get isOk => error == null;
}

class LibraryStore extends ChangeNotifier {
  LibraryStore(this._db);
  final GameDb _db;

  List<Game> games = [];
  bool busy = false;

  // Kemajuan menambah game (diformat di layar supaya mengikuti bahasa aplikasi)
  bool importWaiting = true;
  String importPhase = '';
  int importDoneMb = 0;
  int importTotalMb = 0;
  int importDoneFiles = 0;
  int importTotalFiles = 0;
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

  Future<void> _pollOnce() async {
    try {
      final st = await NativeBridge.importStatus();
      if (st['running'] != true) {
        importWaiting = true;
        importProgress = null;
        canCancel = false;
      } else {
        importWaiting = false;
        final total = (st['totalBytes'] as num?) ?? 0;
        final done = (st['doneBytes'] as num?) ?? 0;
        importPhase = '${st['phase']}';
        importTotalFiles = (st['totalFiles'] as num?)?.toInt() ?? 0;
        importDoneFiles = (st['doneFiles'] as num?)?.toInt() ?? 0;
        importDoneMb = (done / 1048576).round();
        importTotalMb = (total / 1048576).round();
        importProgress = total > 0 ? (done / total).clamp(0.0, 1.0).toDouble() : null;
        canCancel = true;
      }
      notifyListeners();
    } catch (_) {}
  }

  Future<void> cancelImport() => NativeBridge.importCancel();

  /// Null kalau pengguna membatalkan.
  Future<AddResult?> addGame({bool link = false}) async {
    busy = true;
    importWaiting = true;
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
      return AddResult.ok(game.title, game.engine);
    } on PlatformException catch (e) {
      return AddResult.fail(e.message ?? '');
    } finally {
      _poll?.cancel();
      busy = false;
      canCancel = false;
      notifyListeners();
    }
  }

  Future<void> play(Game g, SettingsStore s) async {
    await NativeBridge.launchGame(g, s);
    if (s.resetControls) await s.setResetControls(false);
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
