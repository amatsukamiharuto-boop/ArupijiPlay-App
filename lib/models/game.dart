class Game {
  final String id;
  String title;
  final String engine;
  final String path;
  final String? cover;
  final int addedAt;
  int lastPlayed;

  Game({
    required this.id,
    required this.title,
    required this.engine,
    required this.path,
    required this.addedAt,
    this.cover,
    this.lastPlayed = 0,
  });

  factory Game.fromMap(Map<String, Object?> m) => Game(
        id: m['id'] as String,
        title: m['title'] as String,
        engine: m['engine'] as String,
        path: m['path'] as String,
        cover: m['cover'] as String?,
        addedAt: m['added_at'] as int,
        lastPlayed: (m['last_played'] as int?) ?? 0,
      );

  Map<String, Object?> toMap() => {
        'id': id,
        'title': title,
        'engine': engine,
        'path': path,
        'cover': cover,
        'added_at': addedAt,
        'last_played': lastPlayed,
      };
}
