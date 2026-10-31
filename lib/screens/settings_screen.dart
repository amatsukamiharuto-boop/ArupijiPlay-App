import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../services/settings_store.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});
  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _url;
  late final TextEditingController _key;
  late final TextEditingController _model;
  late final TextEditingController _glossary;
  bool _hideKey = true;

  static const _langs = ['Indonesian', 'English', 'Malay', 'Japanese', 'Korean', 'Chinese (Simplified)', 'Spanish', 'Portuguese'];
  static const _presets = {
    'OpenAI': ['https://api.openai.com/v1', 'gpt-4o-mini'],
    'Gemini': ['https://generativelanguage.googleapis.com/v1beta/openai', 'gemini-3.5-flash-lite'],
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

  Future<void> _save() async {
    final messenger = ScaffoldMessenger.of(context);
    await context.read<SettingsStore>().saveAi(
          baseUrl: _url.text,
          apiKey: _key.text,
          model: _model.text,
          glossary: _glossary.text,
        );
    messenger.showSnackBar(const SnackBar(content: Text('Pengaturan tersimpan')));
  }

  @override
  Widget build(BuildContext context) {
    final s = context.watch<SettingsStore>();
    return Scaffold(
      appBar: AppBar(title: const Text('Pengaturan')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Kontrol layar', style: TextStyle(fontWeight: FontWeight.w700)),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Gamepad virtual'),
            subtitle: const Text('D-pad dan tombol aksi di atas game'),
            value: s.gamepad,
            onChanged: s.setGamepad,
          ),
          Text('Transparansi gamepad: ${(s.opacity * 100).round()}%'),
          Slider(value: s.opacity, min: 0.15, max: 1, divisions: 17, onChanged: s.setOpacity),
          const Divider(height: 32),
          const Text('Terjemahan', style: TextStyle(fontWeight: FontWeight.w700)),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Terjemahkan otomatis saat game dibuka'),
            subtitle: const Text('Bisa dinyalakan atau dimatikan juga dari menu di dalam game'),
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
          const SizedBox(height: 8),
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
          FilledButton(onPressed: _save, child: const Text('Simpan')),
          const SizedBox(height: 8),
          const Text(
            'API key hanya disimpan di HP ini dan dikirim langsung ke penyedia yang kamu pilih.',
            style: TextStyle(fontSize: 12, color: Colors.white54),
          ),
        ],
      ),
    );
  }
}
