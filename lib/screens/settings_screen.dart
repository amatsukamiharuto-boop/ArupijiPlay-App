import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/features.dart';
import '../services/i18n.dart';
import '../services/native_bridge.dart';
import '../services/settings_store.dart';
import 'debug_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  // Bagian terjemahan AI disembunyikan dulu (lihat Features), controller tetap disiapkan.
  late final TextEditingController _url;
  late final TextEditingController _key;
  late final TextEditingController _model;
  late final TextEditingController _glossary;
  bool _hideKey = true;

  static const _langs = ['Indonesian', 'English', 'Malay', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Spanish', 'Portuguese'];
  static const _presets = {
    'OpenAI': ['https://api.openai.com/v1', 'gpt-4o-mini'],
    'Gemini': ['https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-2.0-flash'],
    'OpenRouter': ['https://openrouter.ai/api/v1', 'openai/gpt-4o-mini'],
    'Groq': ['https://api.groq.com/openai/v1', 'llama-3.3-70b-versatile'],
  };

  @override
  void initState() {
    super.initState();
    final s = context.read<SettingsStore>();
    _url = TextEditingController(text: s.baseUrl);
    _key = TextEditingController(text: s.apiKey);
    _model = TextEditingController(text: s.model);
    _glossary = TextEditingController(text: s.glossary);
  }

  @override
  void dispose() {
    _url.dispose();
    _key.dispose();
    _model.dispose();
    _glossary.dispose();
    super.dispose();
  }

  Future<void> _saveAi() async {
    final messenger = ScaffoldMessenger.of(context);
    final saved = context.t('Pengaturan tersimpan', 'Settings saved');
    await context.read<SettingsStore>().saveAi(
          baseUrl: _url.text,
          apiKey: _key.text,
          model: _model.text,
          glossary: _glossary.text,
        );
    messenger.showSnackBar(SnackBar(content: Text(saved)));
  }

  Widget _head(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
      );

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SettingsStore>();
    final muted = Theme.of(context).colorScheme.onSurface.withAlpha(140);

    return Scaffold(
      appBar: AppBar(title: Text(context.t('Pengaturan', 'Settings'))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 1. Tampilan
          _head(context.t('Tampilan', 'Appearance')),
          const SizedBox(height: 4),
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<String>(
              segments: [
                ButtonSegment(value: 'system', label: Text(context.t('Otomatis', 'Auto')), icon: const Icon(Icons.brightness_auto)),
                ButtonSegment(value: 'light', label: Text(context.t('Terang', 'Light')), icon: const Icon(Icons.light_mode)),
                ButtonSegment(value: 'dark', label: Text(context.t('Gelap', 'Dark')), icon: const Icon(Icons.dark_mode)),
              ],
              selected: {s.themeMode},
              onSelectionChanged: (v) => s.setThemeMode(v.first),
            ),
          ),
          const Divider(height: 32),

          // 2. Setting tombol layar di game
          _head(context.t('Tombol layar di game', 'On-screen buttons')),
          Text(
            context.t(
                'Posisi dan ukuran tiap tombol diatur dari menu garis tiga di dalam game (Atur posisi dan ukuran tombol).',
                'Each button\'s position and size is edited from the three-line menu inside the game (Edit button position and size).'),
            style: TextStyle(fontSize: 12, color: muted, height: 1.35),
          ),
          const SizedBox(height: 10),
          Text('${context.t('Transparansi tombol', 'Button opacity')}: ${(s.opacity * 100).round()}%'),
          Slider(value: s.opacity, min: 0.15, max: 1, divisions: 17, onChanged: s.setOpacity),
          Text('${context.t('Ukuran tombol', 'Button size')}: ${(s.btnScale * 100).round()}%'),
          Slider(value: s.btnScale, min: 0.7, max: 1.6, divisions: 9, onChanged: s.setBtnScale),
          Align(
            alignment: Alignment.centerLeft,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.restart_alt, size: 18),
              label: Text(context.t('Kembalikan posisi tombol', 'Reset button positions')),
              onPressed: () async {
                final messenger = ScaffoldMessenger.of(context);
                final msg = context.t('Posisi tombol dikembalikan ke bawaan saat game dibuka berikutnya.',
                    'Button positions will go back to default the next time a game opens.');
                await s.setResetControls(true);
                messenger.showSnackBar(SnackBar(content: Text(msg)));
              },
            ),
          ),
          const Divider(height: 32),

          // 3. Izin penyimpanan
          const _StoragePermissionTile(),

          // 4. Cheat
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(context.t('Cheat', 'Cheat')),
            subtitle: Text(context.t('Menu Cheat (mirip MTools) di dalam game. Kalau mati, menunya hilang dan semua cheat berhenti.',
                'The MTools-style Cheat menu inside the game. When off, the menu is hidden and all cheats stop.')),
            value: s.cheat,
            onChanged: s.setCheat,
          ),

          // 5. Mode kursor
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(context.t('Mode kursor', 'Cursor mode')),
            subtitle: Text(context.t(
                'Layar jadi touchpad: geser satu jari untuk menggerakkan kursor. Jari lain yang menyentuh sisi kiri layar = klik kiri, sisi kanan = klik kanan.',
                'The screen becomes a touchpad: drag one finger to move the cursor. A second finger touching the left side = left click, the right side = right click.')),
            value: s.cursorMode,
            onChanged: s.setCursorMode,
          ),
          if (s.cursorMode) ...[
            Text('${context.t('Kecepatan kursor', 'Cursor speed')}: ${s.cursorSpeed.toStringAsFixed(1)}x'),
            Slider(value: s.cursorSpeed, min: 0.6, max: 4, divisions: 34, onChanged: s.setCursorSpeed),
          ],
          const Divider(height: 24),

          // 6. Bahasa aplikasi
          _head(context.t('Bahasa aplikasi', 'App language')),
          Text(
            context.t('Hanya mengubah tampilan app, bukan bahasa game.', 'Only changes the app interface, not the game\'s language.'),
            style: TextStyle(fontSize: 12, color: muted),
          ),
          const SizedBox(height: 8),
          SizedBox(
            width: double.infinity,
            child: SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'id', label: Text('Indonesia')),
                ButtonSegment(value: 'en', label: Text('English')),
              ],
              selected: {s.appLang},
              onSelectionChanged: (v) => s.setAppLang(v.first),
            ),
          ),
          const SizedBox(height: 8),

          // 7. Mode gamepad
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: Text(context.t('Mode gamepad', 'Gamepad mode')),
            subtitle: Text(context.t('Joystick, E, X, Shift, dan I di layar game.', 'Joystick, E, X, Shift, and I on the game screen.')),
            value: s.gamepad,
            onChanged: s.setGamepad,
          ),

          // 8. FPS
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('FPS'),
            subtitle: Text(context.t('Tampilkan frame per detik di pojok kanan atas game.', 'Show frames per second in the top right of the game.')),
            value: s.fps,
            onChanged: s.setFps,
          ),

          // Disembunyikan dulu: terjemahan AI
          if (Features.showTranslation) ..._translationSection(s, muted),

          // Disembunyikan dulu: mode debug
          if (Features.showDebug) ..._debugSection(s),
        ],
      ),
    );
  }

  List<Widget> _translationSection(SettingsStore s, Color muted) => [
        const Divider(height: 32),
        const Text('Terjemahan AI', style: TextStyle(fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text(
          'Pengaturan ini dipakai oleh Terjemahan offline (menu titik tiga di kartu game) dan oleh terjemahan langsung di dalam game.',
          style: TextStyle(fontSize: 12, color: muted, height: 1.35),
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Terjemahan langsung saat bermain'),
          subtitle: const Text('Opsional. Menerjemahkan sambil main, butuh internet.'),
          value: s.autoTranslate,
          onChanged: s.setAutoTranslate,
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Bahasa tujuan'),
          trailing: DropdownButton<String>(
            value: _langs.contains(s.targetLang) ? s.targetLang : _langs.first,
            items: [for (final l in _langs) DropdownMenuItem(value: l, child: Text(l))],
            onChanged: (v) {
              if (v != null) s.setLang(v);
            },
          ),
        ),
        Wrap(
          spacing: 8,
          children: [
            for (final e in _presets.entries)
              ActionChip(
                label: Text(e.key),
                onPressed: () => setState(() {
                  _url.text = e.value[0];
                  _model.text = e.value[1];
                }),
              ),
          ],
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _url,
          keyboardType: TextInputType.url,
          decoration: const InputDecoration(labelText: 'Base URL (kompatibel OpenAI)', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _key,
          obscureText: _hideKey,
          decoration: InputDecoration(
            labelText: 'API key',
            border: const OutlineInputBorder(),
            suffixIcon: IconButton(
              icon: Icon(_hideKey ? Icons.visibility : Icons.visibility_off),
              onPressed: () => setState(() => _hideKey = !_hideKey),
            ),
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _model,
          decoration: const InputDecoration(labelText: 'Model', border: OutlineInputBorder()),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _glossary,
          minLines: 5,
          maxLines: 10,
          decoration: const InputDecoration(
            labelText: 'Glosarium (satu baris: istilah=terjemahan)',
            alignLabelWithHint: true,
            border: OutlineInputBorder(),
          ),
        ),
        const SizedBox(height: 16),
        FilledButton(onPressed: _saveAi, child: const Text('Simpan')),
      ];

  List<Widget> _debugSection(SettingsStore s) => [
        const Divider(height: 32),
        const Text('Pemecahan masalah', style: TextStyle(fontWeight: FontWeight.w700)),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Mode debug'),
          subtitle: const Text('Catat lebih banyak log dan tampilkan lencana merah di menu game saat ada error.'),
          value: s.debug,
          onChanged: s.setDebug,
        ),
        ListTile(
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.bug_report_outlined),
          title: const Text('Lihat log debug'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const DebugScreen())),
        ),
      ];
}

/// Izin Akses semua file: dibutuhkan agar save game bertahan setelah app dihapus
/// dan untuk mode Tanpa salin. Android hanya mengizinkan mengubahnya lewat halaman sistem.
class _StoragePermissionTile extends StatefulWidget {
  const _StoragePermissionTile();
  @override
  State<_StoragePermissionTile> createState() => _StoragePermissionTileState();
}

class _StoragePermissionTileState extends State<_StoragePermissionTile> with WidgetsBindingObserver {
  bool _ok = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _check();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) _check();
  }

  Future<void> _check() async {
    final v = await NativeBridge.hasAllFilesAccess();
    if (mounted) setState(() => _ok = v);
  }

  @override
  Widget build(BuildContext context) {
    context.watch<SettingsStore>();
    return SwitchListTile(
      contentPadding: EdgeInsets.zero,
      title: Text(context.t('Izin penyimpanan', 'Storage permission')),
      subtitle: Text(_ok
          ? context.t('Aktif (Akses semua file). Save game bertahan walau app dihapus. Untuk mematikan, matikan di halaman yang terbuka.',
              'On (All files access). Game saves survive uninstalling the app. To turn it off, switch it off on the page that opens.')
          : context.t('Mati. Dibutuhkan agar save bertahan setelah app dihapus dan untuk mode Tanpa salin.',
              'Off. Needed so saves survive uninstalling the app and for the No copy mode.')),
      value: _ok,
      // Android tidak mengizinkan mencabut izin lewat kode, jadi dua arah membuka halaman pengaturan sistem
      onChanged: (_) => NativeBridge.requestAllFilesAccess(),
    );
  }
}
