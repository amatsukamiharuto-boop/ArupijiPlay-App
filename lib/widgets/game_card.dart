import 'dart:io';
import 'package:flutter/material.dart';
import '../models/game.dart';

enum GameAction { studio, rename, delete }

class GameCard extends StatelessWidget {
  const GameCard({
    super.key,
    required this.game,
    required this.onPlay,
    required this.onAction,
  });

  final Game game;
  final VoidCallback onPlay;
  final void Function(GameAction) onAction;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Material(
      color: scheme.surface,
      elevation: dark ? 0 : 1.5,
      borderRadius: BorderRadius.circular(14),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: onPlay,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Stack(
                fit: StackFit.expand,
                children: [
                  _poster(scheme),
                  Positioned(
                    left: 8,
                    top: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: Colors.black.withAlpha(180),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(game.engine,
                          style: const TextStyle(fontSize: 11, color: Color(0xFF8FD0F7), fontWeight: FontWeight.w600)),
                    ),
                  ),
                  Positioned(
                    right: 2,
                    top: 2,
                    child: Container(
                      decoration: BoxDecoration(
                        color: Colors.black.withAlpha(110),
                        shape: BoxShape.circle,
                      ),
                      child: PopupMenuButton<GameAction>(
                        icon: const Icon(Icons.more_vert, size: 20, color: Colors.white),
                        onSelected: onAction,
                        itemBuilder: (_) => const [
                          PopupMenuItem(value: GameAction.studio, child: Text('Terjemahan offline')),
                          PopupMenuItem(value: GameAction.rename, child: Text('Ubah judul')),
                          PopupMenuItem(value: GameAction.delete, child: Text('Hapus dari pustaka')),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
              child: Text(game.title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
              child: FilledButton.icon(
                onPressed: onPlay,
                icon: const Icon(Icons.play_arrow_rounded, size: 20),
                label: const Text('Main'),
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(36),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _poster(ColorScheme scheme) {
    final cover = game.cover;
    if (cover != null && File(cover).existsSync()) {
      return Image.file(File(cover), fit: BoxFit.cover, errorBuilder: (_, __, ___) => _fallback(scheme));
    }
    return _fallback(scheme);
  }

  Widget _fallback(ColorScheme scheme) {
    final initial = game.title.trim().isEmpty ? '?' : game.title.trim()[0].toUpperCase();
    return Container(
      color: scheme.primary.withAlpha(40),
      alignment: Alignment.center,
      child: Text(initial,
          style: TextStyle(fontSize: 54, fontWeight: FontWeight.w700, color: scheme.primary)),
    );
  }
}
