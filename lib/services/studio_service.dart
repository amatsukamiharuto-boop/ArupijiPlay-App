import 'package:flutter/services.dart';
import '../models/game.dart';
import 'settings_store.dart';

/// Jembatan ke Studio terjemahan offline di sisi Android.
class StudioService {
  static const _ch = MethodChannel('arupiji/studio');

  static Map<String, dynamic> _args(Game g, [Map<String, dynamic>? extra]) =>
      {'gameId': g.id, 'path': g.path, ...?extra};

  static Future<Map<String, dynamic>> status() async =>
      await _ch.invokeMapMethod<String, dynamic>('status') ?? {};

  static Future<void> cancel() => _ch.invokeMethod('cancel');

  static Future<void> startExtract(Game g) =>
      _ch.invokeMethod('startExtract', _args(g));

  static Future<void> startTranslate(Game g, SettingsStore s, {bool force = false}) =>
      _ch.invokeMethod('startTranslate', _args(g, {
            'apiKey': s.apiKey,
            'baseUrl': s.baseUrl,
            'model': s.model,
            'lang': s.targetLang,
            'glossary': s.glossary,
            'force': force,
          }));

  static Future<void> startApplyText(Game g, SettingsStore s) =>
      _ch.invokeMethod('startApplyText', _args(g, {
            'wrapPlain': s.wrapPlain,
            'wrapFace': s.wrapFace,
          }));

  static Future<void> startApplyImages(Game g, {String? only}) =>
      _ch.invokeMethod('startApplyImages', _args(g, {'only': only ?? ''}));

  static Future<void> startRevert(Game g) =>
      _ch.invokeMethod('startRevert', _args(g));

  static Future<void> startScan(Game g, SettingsStore s, List<String> folders) =>
      _ch.invokeMethod('startScan', _args(g, {'folders': folders, 'script': s.ocrScript}));

  static Future<List<Map<String, dynamic>>> list(
      String gameId, List<String> kinds, String query, int offset, int limit) async {
    final r = await _ch.invokeListMethod<Map>('list', {
      'gameId': gameId,
      'kinds': kinds,
      'query': query,
      'offset': offset,
      'limit': limit,
    });
    return (r ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<Map<String, List<int>>> counts(String gameId) async {
    final r = await _ch.invokeMapMethod<String, dynamic>('counts', {'gameId': gameId});
    return (r ?? {}).map((k, v) => MapEntry(k, List<int>.from(v as List)));
  }

  static Future<void> update(int id, String text) =>
      _ch.invokeMethod('update', {'id': id, 'text': text});

  static Future<List<Map<String, dynamic>>> imageFiles(String gameId) async {
    final r = await _ch.invokeListMethod<Map>('imageFiles', {'gameId': gameId});
    return (r ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<List<Map<String, dynamic>>> regions(String gameId, String file) async {
    final r = await _ch.invokeListMethod<Map>('regions', {'gameId': gameId, 'file': file});
    return (r ?? []).map((e) => Map<String, dynamic>.from(e)).toList();
  }

  static Future<void> updateRegion(int id, String text) =>
      _ch.invokeMethod('updateRegion', {'id': id, 'text': text});

  static Future<String> imagePath(Game g, String file, {bool original = false}) async =>
      (await _ch.invokeMethod<String>('imagePath', _args(g, {'file': file, 'original': original}))) ?? '';
}
