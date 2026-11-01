import 'dart:async';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../models/game.dart';
import '../services/settings_store.dart';
import '../services/studio_service.dart';
import 'image_editor_screen.dart';

/// Terjemahan offline: ekstrak semua teks, terjemahkan, edit, lalu tulis ke file game.
class StudioScreen extends StatefulWidget {
  const StudioScreen({super.key, required this.game});
  final Game game;
  @override
  State<StudioScreen> createState() => _StudioScreenState();
}

class _StudioScreenState extends State<StudioScreen> {
  Timer? _timer;
  Map<String, dynamic> _st = {};
  Map<String, List<int>> _counts = {};
  bool _wasRunning = false;
  int _refresh = 0;

  bool get _running => _st['running'] == true;

  @override
  void initState() {
    super.initState();
    _loadCounts();
    _poll();
    _timer = Timer.periodic(const Duration(milliseconds: 800), (_) => _poll());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _loadCounts() async {
    try {
      final c = await StudioService.counts(widget.game.id);
      if (mounted) setState(() => _counts = c);
    } catch (_) {}
  }

  Future<void> _poll() async {
    try {
      final st = await StudioService.status();
      if (!mounted) return;
      final running = st['running'] == true;
      final finished = _wasRunning && !running;
      setState(() {
        _st = st;
        _wasRunning = running;
      });
      if (finished) {
        await _loadCounts();
        if (!mounted) return;
        setState(() => _refresh++);
        final err = st['error'];
        _snack(err != null ? 'Gagal: $err' : '${st['message']}', error: err != null);
      }
    } catch (_) {}
  }

  void _snack(String msg, {bool error = false}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: error ? Colors.red.shade700 : null,
      duration: Duration(seconds: error ? 8 : 4),
    ));
  }

  Future<void> _do(Future<void> Function() f) async {
    try {
      await f();
      await _poll();
    } on PlatformException catch (e) {
      _snack(e.message ?? 'Gagal', error: true);
    }
  }

  Future<bool> _confirm(String title, String body) async {
    final r = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Lanjut')),
        ],
      ),
    );
    return r == true;
  }

  int _total(List<String> kinds) => kinds.fold(0, (a, k) => a + (_counts[k]?[0] ?? 0));
  int _done(List<String> kinds) => kinds.fold(0, (a, k) => a + (_counts[k]?[1] ?? 0));

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SettingsStore>();
    final g = widget.game;
    final all = ['dialog', 'scroll', 'name', 'choice', 'db', 'system', 'map', 'misc'];
    final extracted = _total(all) > 0;

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(g.title, maxLines: 1, overflow: TextOverflow.ellipsis),
          actions: [
            IconButton(
              tooltip: 'Pengaturan studio',
              icon: const Icon(Icons.tune),
              onPressed: () => _studioSettings(s),
            ),
            PopupMenuButton<String>(
              onSelected: (v) async {
                if (v == 'force') {
                  if (await _confirm('Terjemahkan ulang semua?',
                      'Semua teks yang belum kamu edit sendiri akan diterjemahkan ulang. Ini memakai kuota API lagi.')) {
                    await _do(() => StudioService.startTranslate(g, s, force: true));
                  }
                } else if (v == 'cancel') {
                  await StudioService.cancel();
                }
              },
              itemBuilder: (_) => const [
                PopupMenuItem(value: 'force', child: Text('Terjemahkan ulang semua')),
                PopupMenuItem(value: 'cancel', child: Text('Batalkan proses')),
              ],
            ),
          ],
        ),
        body: Column(
          children: [
            _actions(s, extracted),
            const TabBar(
              isScrollable: true,
              tabAlignment: TabAlignment.start,
              tabs: [Tab(text: 'Dialog'), Tab(text: 'Nama'), Tab(text: 'Menu dan lainnya'), Tab(text: 'Gambar')],
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _StringList(key: ValueKey('d$_refresh'), game: g, kinds: const ['dialog', 'scroll'], showKind: false),
                  _StringList(key: ValueKey('n$_refresh'), game: g, kinds: const ['name'], showKind: false),
                  _StringList(key: ValueKey('o$_refresh'), game: g, kinds: const ['choice', 'db', 'system', 'map', 'misc'], showKind: true),
                  _ImagesTab(key: ValueKey('i$_refresh'), game: g, running: _running, onAction: _do),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _actions(SettingsStore s, bool extracted) {
    final g = widget.game;
    final text = ['dialog', 'scroll', 'name', 'choice', 'db', 'system', 'map', 'misc'];
    final total = _total(text);
    final done = _done(text);
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurface.withAlpha(150);
    final running = _running;
    final tot = (_st['total'] as num?)?.toInt() ?? 0;
    final dn = (_st['done'] as num?)?.toInt() ?? 0;

    return Card(
      margin: const EdgeInsets.fromLTRB(12, 4, 12, 8),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              extracted ? 'Teks terdaftar: $total, sudah diterjemahkan: $done' : 'Belum ada teks. Mulai dari langkah 1.',
              style: const TextStyle(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                FilledButton.tonal(
                  onPressed: running ? null : () => _do(() => StudioService.startExtract(g)),
                  child: const Text('1. Ekstrak teks'),
                ),
                FilledButton.tonal(
                  onPressed: running || !extracted ? null : () => _do(() => StudioService.startTranslate(g, s)),
                  child: const Text('2. Terjemahkan (AI)'),
                ),
                FilledButton(
                  onPressed: running || !extracted
                      ? null
                      : () async {
                          if (await _confirm('Terapkan ke game?',
                              'File data game akan ditulis ulang dengan terjemahan. File asli tetap aman dan bisa dikembalikan kapan saja.')) {
                            await _do(() => StudioService.startApplyText(g, s));
                          }
                        },
                  child: const Text('3. Terapkan teks'),
                ),
                OutlinedButton(
                  onPressed: running
                      ? null
                      : () async {
                          if (await _confirm('Kembalikan ke asli?',
                              'Teks dan gambar game dikembalikan ke versi sebelum diterjemahkan. Hasil terjemahanmu di sini tetap tersimpan.')) {
                            await _do(() => StudioService.startRevert(g));
                          }
                        },
                  child: const Text('Kembalikan asli'),
                ),
              ],
            ),
            if (running) ...[
              const SizedBox(height: 12),
              LinearProgressIndicator(value: tot > 0 ? dn / tot : null),
              const SizedBox(height: 6),
              Row(
                children: [
                  Expanded(child: Text('${_st['task']}: ${_st['message']}', style: TextStyle(fontSize: 12, color: muted))),
                  TextButton(onPressed: StudioService.cancel, child: const Text('Batal')),
                ],
              ),
            ] else if ((_st['message'] as String? ?? '').isNotEmpty && _st['error'] == null) ...[
              const SizedBox(height: 8),
              Text('${_st['message']}', style: TextStyle(fontSize: 12, color: muted)),
            ] else if (_st['error'] != null) ...[
              const SizedBox(height: 8),
              Text('Gagal: ${_st['error']}', style: TextStyle(fontSize: 12, color: Colors.red.shade400, fontWeight: FontWeight.w600)),
            ],
          ],
        ),
      ),
    );
  }

  void _studioSettings(SettingsStore s) {
    final plain = TextEditingController(text: '${s.wrapPlain}');
    final face = TextEditingController(text: '${s.wrapFace}');
    var script = s.ocrScript;
    showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Pengaturan studio'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Bahasa tulisan di gambar game'),
                DropdownButton<String>(
                  value: script,
                  isExpanded: true,
                  items: const [
                    DropdownMenuItem(value: 'latin', child: Text('Latin (Inggris dan sejenisnya)')),
                    DropdownMenuItem(value: 'japanese', child: Text('Jepang')),
                    DropdownMenuItem(value: 'chinese', child: Text('Mandarin')),
                    DropdownMenuItem(value: 'korean', child: Text('Korea')),
                  ],
                  onChanged: (v) => setD(() => script = v ?? 'latin'),
                ),
                const SizedBox(height: 12),
                const Text('Panjang baris dialog (jumlah huruf). Baris yang lebih panjang dipotong otomatis.'),
                const SizedBox(height: 8),
                TextField(
                  controller: plain,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Tanpa gambar wajah', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: face,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Dengan gambar wajah', border: OutlineInputBorder()),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
            FilledButton(
              onPressed: () async {
                await s.setOcrScript(script);
                await s.setWrap(int.tryParse(plain.text) ?? 46, int.tryParse(face.text) ?? 38);
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: const Text('Simpan'),
            ),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- daftar teks

class _StringList extends StatefulWidget {
  const _StringList({super.key, required this.game, required this.kinds, required this.showKind});
  final Game game;
  final List<String> kinds;
  final bool showKind;
  @override
  State<_StringList> createState() => _StringListState();
}

class _StringListState extends State<_StringList> {
  final _items = <Map<String, dynamic>>[];
  final _scroll = ScrollController();
  Timer? _deb;
  String _q = '';
  bool _loading = false;
  bool _end = false;

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 400) _more();
    });
    _more();
  }

  @override
  void dispose() {
    _deb?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _more() async {
    if (_loading || _end) return;
    _loading = true;
    try {
      final r = await StudioService.list(widget.game.id, widget.kinds, _q, _items.length, 40);
      _items.addAll(r);
      if (r.length < 40) _end = true;
    } catch (_) {
      _end = true;
    }
    _loading = false;
    if (mounted) setState(() {});
  }

  void _onSearch(String v) {
    _deb?.cancel();
    _deb = Timer(const Duration(milliseconds: 400), () {
      _q = v;
      _items.clear();
      _end = false;
      _more();
    });
  }

  Future<void> _edit(Map<String, dynamic> item) async {
    final c = TextEditingController(text: (item['translated'] as String?) ?? '');
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit terjemahan'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Teks asli', style: TextStyle(fontSize: 12, color: Theme.of(ctx).colorScheme.onSurface.withAlpha(150))),
              const SizedBox(height: 4),
              SelectableText(item['original'] as String),
              const SizedBox(height: 14),
              TextField(
                controller: c,
                minLines: 3,
                maxLines: 10,
                autofocus: true,
                decoration: const InputDecoration(labelText: 'Terjemahan', border: OutlineInputBorder()),
              ),
              const SizedBox(height: 6),
              Text(
                'Jangan hapus kode seperti \\C[2], \\N[1], atau {0}. Tekan enter untuk pindah baris.',
                style: TextStyle(fontSize: 11, color: Theme.of(ctx).colorScheme.onSurface.withAlpha(140)),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Simpan')),
        ],
      ),
    );
    if (ok == true) {
      await StudioService.update((item['id'] as num).toInt(), c.text);
      setState(() {
        item['translated'] = c.text;
        item['edited'] = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = theme.colorScheme.onSurface.withAlpha(150);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: TextField(
            onChanged: _onSearch,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Cari teks asli atau terjemahan',
              isDense: true,
              border: OutlineInputBorder(),
            ),
          ),
        ),
        Expanded(
          child: _items.isEmpty && !_loading
              ? Center(child: Text('Belum ada data.', style: TextStyle(color: muted)))
              : ListView.separated(
                  controller: _scroll,
                  itemCount: _items.length + (_end ? 0 : 1),
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    if (i >= _items.length) {
                      return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
                    }
                    final it = _items[i];
                    final tr = (it['translated'] as String?) ?? '';
                    final orig = (it['original'] as String?) ?? '';
                    final edited = it['edited'] == true;
                    return ListTile(
                      onTap: () => _edit(it),
                      title: Text(
                        widget.showKind ? '[${it['kind']}] $orig' : orig,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 12, color: muted),
                      ),
                      subtitle: Text(
                        tr.isEmpty ? '(belum diterjemahkan)' : tr,
                        maxLines: 4,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(fontSize: 14, color: tr.isEmpty ? muted : theme.colorScheme.onSurface),
                      ),
                      trailing: edited ? Icon(Icons.edit, size: 16, color: theme.colorScheme.primary) : null,
                    );
                  },
                ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------- tab gambar

class _ImagesTab extends StatefulWidget {
  const _ImagesTab({super.key, required this.game, required this.running, required this.onAction});
  final Game game;
  final bool running;
  final Future<void> Function(Future<void> Function()) onAction;
  @override
  State<_ImagesTab> createState() => _ImagesTabState();
}

class _ImagesTabState extends State<_ImagesTab> {
  List<Map<String, dynamic>> _files = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final f = await StudioService.imageFiles(widget.game.id);
      if (mounted) setState(() => _files = f);
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  static const _folders = {
    'titles1': 'Layar judul (titles1)',
    'titles2': 'Layar judul 2 (titles2)',
    'pictures': 'Gambar umum (pictures)',
    'system': 'Sistem (system)',
    'enemies': 'Musuh (enemies)',
  };

  Future<void> _scan() async {
    final s = context.read<SettingsStore>();
    final chosen = <String>{'titles1', 'titles2', 'pictures'};
    var script = s.ocrScript;
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setD) => AlertDialog(
          title: const Text('Pindai tulisan di gambar'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Pilih folder gambar. Makin banyak, makin lama prosesnya.'),
                for (final e in _folders.entries)
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    dense: true,
                    title: Text(e.value),
                    value: chosen.contains(e.key),
                    onChanged: (v) => setD(() => v == true ? chosen.add(e.key) : chosen.remove(e.key)),
                  ),
                const SizedBox(height: 8),
                const Text('Bahasa tulisan di gambar'),
                DropdownButton<String>(
                  value: script,
                  isExpanded: true,
                  items: const [
                    DropdownMenuItem(value: 'latin', child: Text('Latin (Inggris dan sejenisnya)')),
                    DropdownMenuItem(value: 'japanese', child: Text('Jepang')),
                    DropdownMenuItem(value: 'chinese', child: Text('Mandarin')),
                    DropdownMenuItem(value: 'korean', child: Text('Korea')),
                  ],
                  onChanged: (v) => setD(() => script = v ?? 'latin'),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Pindai')),
          ],
        ),
      ),
    );
    if (go != true || chosen.isEmpty) return;
    await s.setOcrScript(script);
    await widget.onAction(() => StudioService.startScan(widget.game, s, chosen.toList()));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.read<SettingsStore>();
    final g = widget.game;
    final muted = Theme.of(context).colorScheme.onSurface.withAlpha(150);
    if (_loading) return const Center(child: CircularProgressIndicator());

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.tonalIcon(
                onPressed: widget.running ? null : _scan,
                icon: const Icon(Icons.document_scanner_outlined, size: 18),
                label: const Text('Pindai gambar (OCR)'),
              ),
              FilledButton.tonalIcon(
                onPressed: widget.running || _files.isEmpty
                    ? null
                    : () => widget.onAction(() => StudioService.startTranslate(g, s)),
                icon: const Icon(Icons.translate, size: 18),
                label: const Text('Terjemahkan'),
              ),
              FilledButton.icon(
                onPressed: widget.running || _files.isEmpty
                    ? null
                    : () => widget.onAction(() => StudioService.startApplyImages(g)),
                icon: const Icon(Icons.image_outlined, size: 18),
                label: const Text('Terapkan gambar'),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 4, 14, 6),
          child: Text(
            'Tulisan yang ada di dalam gambar (misalnya judul dan menu utama) dibaca dari gambar, '
            'diterjemahkan, lalu digambar ulang. Buka satu gambar untuk mengedit teksnya.',
            style: TextStyle(fontSize: 12, color: muted, height: 1.35),
          ),
        ),
        Expanded(
          child: _files.isEmpty
              ? Center(child: Text('Belum ada gambar yang dipindai.', style: TextStyle(color: muted)))
              : ListView.separated(
                  itemCount: _files.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, i) {
                    final f = _files[i];
                    final rel = f['file'] as String;
                    return ListTile(
                      leading: SizedBox(
                        width: 56,
                        height: 56,
                        child: Image.file(
                          File('${g.path}/$rel'),
                          fit: BoxFit.cover,
                          cacheWidth: 112,
                          errorBuilder: (_, __, ___) => const Icon(Icons.image_not_supported_outlined),
                        ),
                      ),
                      title: Text(rel.split('/').last, maxLines: 1, overflow: TextOverflow.ellipsis),
                      subtitle: Text('${f['count']} teks, ${f['done']} diterjemahkan'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () async {
                        await Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => ImageEditorScreen(game: g, file: rel)),
                        );
                        _load();
                      },
                    );
                  },
                ),
        ),
      ],
    );
  }
}
