import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';
import '../models/game.dart';

class GameDb {
  GameDb._(this._db);
  final Database _db;

  static Future<GameDb> open() async {
    final file = p.join(await getDatabasesPath(), 'library.db');
    final db = await openDatabase(
      file,
      version: 1,
      onCreate: (d, _) => d.execute('''
        CREATE TABLE games(
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          engine TEXT NOT NULL,
          path TEXT NOT NULL,
          cover TEXT,
          added_at INTEGER NOT NULL,
          last_played INTEGER NOT NULL DEFAULT 0
        )'''),
    );
    return GameDb._(db);
  }

  Future<List<Game>> all() async {
    final rows = await _db.query('games');
    return rows.map(Game.fromMap).toList();
  }

  Future<void> insert(Game g) =>
      _db.insert('games', g.toMap(), conflictAlgorithm: ConflictAlgorithm.replace);

  Future<void> update(Game g) =>
      _db.update('games', g.toMap(), where: 'id = ?', whereArgs: [g.id]);

  Future<void> delete(String id) =>
      _db.delete('games', where: 'id = ?', whereArgs: [id]);
}
