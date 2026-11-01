import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/native_bridge.dart';

class _Entry {
  _Entry(this.time, this.level, this.tag, this.msg);
  final String time;
  final String level;
  final String tag;
  final String msg;
}

/// Menampilkan log app dan game. Error berwarna merah, peringatan oranye.
class DebugScreen extends StatefulWidget {
  const DebugScreen({super.key});
  @override
  State<DebugScreen> createState() => _DebugScreenState();
}

class _DebugScreenState extends State<DebugScreen> {
  List<_Entry> _all = [];
  String _raw = '';
  String _filter = 'all'; // all, E, W
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final raw = await NativeBridge.debugRead();
    final out = <_Entry>[];
    for (final line in raw.split('\n')) {
      if (line.trim().isEmpty) continue;
      final p = line.split('|');
      if (p.length < 4) {
        out.add(_Entry('', 'I', '', line));
        continue;
      }
      out.add(_Entry(p[0], p[1], p[2], p.sublist(3).join('|').replaceAll('\u0001', '\n')));
    }
    if (!mounted) return;
    setState(() {
      _raw = raw;
      _all = out.reversed.toList();
      _loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    final items = _filter == 'all'
        ? _all
        : _all.where((e) => _filter == 'W' ? (e.level == 'W' || e.level == 'E') : e.level == 'E').toList();
    final errors = _all.where((e) => e.level == 'E').length;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Log debug'),
        actions: [
          IconButton(tooltip: 'Segarkan', icon: const Icon(Icons.refresh), onPressed: _load),
          IconButton(
            tooltip: 'Salin semua',
            icon: const Icon(Icons.copy_all),
            onPressed: () async {
              final m = ScaffoldMessenger.of(context);
              await Clipboard.setData(ClipboardData(text: _raw.replaceAll('\u0001', '\n')));
              m.showSnackBar(const SnackBar(content: Text('Log disalin')));
            },
          ),
          IconButton(
            tooltip: 'Hapus',
            icon: const Icon(Icons.delete_outline),
            onPressed: () async {
              await NativeBridge.debugClear();
              await _load();
            },
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: Wrap(
              spacing: 8,
              children: [
                ChoiceChip(label: Text('Semua (${_all.length})'), selected: _filter == 'all', onSelected: (_) => setState(() => _filter = 'all')),
                ChoiceChip(label: Text('Error ($errors)'), selected: _filter == 'E', onSelected: (_) => setState(() => _filter = 'E')),
                ChoiceChip(label: const Text('Error + peringatan'), selected: _filter == 'W', onSelected: (_) => setState(() => _filter = 'W')),
              ],
            ),
          ),
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : items.isEmpty
                    ? const Center(child: Text('Belum ada log.'))
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(12, 0, 12, 24),
                        itemCount: items.length,
                        separatorBuilder: (_, __) => const Divider(height: 1),
                        itemBuilder: (_, i) => _tile(context, items[i]),
                      ),
          ),
        ],
      ),
    );
  }

  Widget _tile(BuildContext context, _Entry e) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final base = Theme.of(context).colorScheme.onSurface.withAlpha(170);
    Color color;
    FontWeight weight = FontWeight.w400;
    Color? bg;
    if (e.level == 'E') {
      color = dark ? const Color(0xFFFF8A80) : const Color(0xFFD50000);
      weight = FontWeight.w600;
      bg = dark ? const Color(0x33FF5252) : const Color(0x14D50000);
    } else if (e.level == 'W') {
      color = dark ? const Color(0xFFFFB74D) : const Color(0xFFE65100);
    } else {
      color = base;
    }
    return Container(
      color: bg,
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
      child: SelectableText.rich(
        TextSpan(children: [
          TextSpan(text: '${e.time}  [${e.tag}]\n', style: TextStyle(fontSize: 11, color: base)),
          TextSpan(text: e.msg, style: TextStyle(fontSize: 12.5, color: color, fontWeight: weight, fontFamily: 'monospace', height: 1.35)),
        ]),
      ),
    );
  }
}
