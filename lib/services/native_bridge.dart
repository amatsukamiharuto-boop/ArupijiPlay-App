import 'package:flutter/services.dart';
import '../models/game.dart';
import 'settings_store.dart';

class NativeBridge {
  static const _ch = MethodChannel('arupiji/native');

  /// Buka picker folder, salin game ke penyimpanan app, balikin metadata.
  /// Null kalau pengguna membatalkan.
  static Future<Map<String, dynamic>?> importGame() async {
    final r = await _ch.invokeMapMethod<String, dynamic>('importGame');
    return r;
  }

  static Future<void> launchGame(Game g, SettingsStore s) {
    return _ch.invokeMethod('launchGame', {
      'id': g.id,
      'title': g.title,
      'path': g.path,
      'apiKey': s.apiKey,
      'baseUrl': s.baseUrl,
      'model': s.model,
      'lang': s.targetLang,
      'glossary': s.glossary,
      'translate': s.autoTranslate,
      'gamepad': s.gamepad,
      'opacity': s.opacity,
    });
  }

  static Future<void> deleteGameFiles(String path) =>
      _ch.invokeMethod('deleteGame', {'path': path});
}
