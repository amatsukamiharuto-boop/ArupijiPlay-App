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

  /// Balikin pesan untuk ditampilkan, atau null kalau dibatalkan.
  Future<String?> addGame() async {
    busy = true;
    notifyListeners();
    try {
      final meta = await NativeBridge.importGame();
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
      busy = false;
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
