import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/game.dart';
import '../services/studio_service.dart';

/// Edit teks yang terbaca dari satu gambar, lalu gambar ulang.
class ImageEditorScreen extends StatefulWidget {
  const ImageEditorScreen({super.key, required this.game, required this.file});
  final Game game;
  final String file;
  @override
  State<ImageEditorScreen> createState() => _ImageEditorScreenState();
}

class _Region {
  _Region(this.id, this.original, String translated) : controller = TextEditingController(text: translated), saved = translated;
  final int id;
  final String original;
  final TextEditingController controller;
  String saved;
}

class _ImageEditorScreenState extends State<ImageEditorScreen> {
  final _regions = <_Region>[];
  bool _loading = true;
  bool _busy = false;
  bool _showOriginal = false;
  int _stamp = 0;
  String _path = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final r in _regions) {
      r.controller.dispose();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final rows = await StudioService.regions(widget.game.id, widget.file);
    _regions
      ..clear()
      ..addAll(rows.map((e) => _Region((e['id'] as num).toInt(), e['original'] as String, e['translated'] as String)));
    await _loadPath();
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _loadPath() async {
    _path = await StudioService.imagePath(widget.game, widget.file, original: _showOriginal);
    if (mounted) setState(() {});
  }

  Future<void> _saveAndRender() async {
    final messenger = ScaffoldMessenger.of(context);
    setState(() => _busy = true);
    try {
      for (final r in _regions) {
        final t = r.controller.text;
        if (t != r.saved) {
          await StudioService.updateRegion(r.id, t);
          r.saved = t;
        }
      }
      await StudioService.startApplyImages(widget.game, only: widget.file);
      for (var i = 0; i < 160; i++) {
        await Future<void>.delayed(const Duration(milliseconds: 500));
        final st = await StudioService.status();
        if (st['running'] != true) break;
      }
      imageCache.clear();
      imageCache.clearLiveImages();
      _stamp++;
      _showOriginal = false;
      await _loadPath();
      messenger.showSnackBar(const SnackBar(content: Text('Gambar diperbarui')));
    } on PlatformException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message ?? 'Gagal'), backgroundColor: Colors.red.shade700));
    }
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final muted = Theme.of(context).colorScheme.onSurface.withAlpha(150);
    return Scaffold(
      appBar: AppBar(title: Text(widget.file.split('/').last, overflow: TextOverflow.ellipsis)),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(value: true, label: Text('Asli')),
                    ButtonSegment(value: false, label: Text('Hasil')),
                  ],
                  selected: {_showOriginal},
                  onSelectionChanged: (v) {
                    _showOriginal = v.first;
                    _loadPath();
                  },
                ),
                const SizedBox(height: 10),
                Container(
                  color: const Color(0xFF2A2A2A),
                  child: _path.isEmpty
                      ? const SizedBox(height: 120)
                      : InteractiveViewer(
                          maxScale: 5,
                          child: Image.file(
                            File(_path),
                            key: ValueKey('$_path$_stamp$_showOriginal'),
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => const Padding(
                              padding: EdgeInsets.all(24),
                              child: Icon(Icons.broken_image_outlined, color: Colors.white54),
                            ),
                          ),
                        ),
                ),
                const SizedBox(height: 14),
                Text('Teks terdeteksi (${_regions.length})', style: const TextStyle(fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                for (final r in _regions)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Asli: ${r.original}', style: TextStyle(fontSize: 12, color: muted)),
                        const SizedBox(height: 4),
                        TextField(
                          controller: r.controller,
                          decoration: const InputDecoration(
                            isDense: true,
                            border: OutlineInputBorder(),
                            hintText: 'Terjemahan (kosong = biarkan asli)',
                          ),
                        ),
                      ],
                    ),
                  ),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: _busy ? null : _saveAndRender,
                  icon: _busy
                      ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.check),
                  label: const Text('Simpan dan gambar ulang'),
                ),
                const SizedBox(height: 8),
                Text(
                  'Latar teks lama diganti warna sekitarnya, lalu teks baru digambar di tempat yang sama. '
                  'Hasil terbaik di gambar dengan latar polos.',
                  style: TextStyle(fontSize: 12, color: muted, height: 1.35),
                ),
              ],
            ),
    );
  }
}
