import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

class SettingsStore extends ChangeNotifier {
  SettingsStore._(this._p);
  final SharedPreferences _p;

  static const defaultGlossary =
      'HP=HP\nMP=MP\nTP=TP\nEXP=EXP\nLevel=Level\nQuest=Quest\nItem=Item\nSkill=Skill\nGold=Gold';

  static Future<SettingsStore> load() async =>
      SettingsStore._(await SharedPreferences.getInstance());

  String get baseUrl => _p.getString('baseUrl') ?? 'https://api.openai.com/v1';
  String get apiKey => _p.getString('apiKey') ?? '';
  String get model => _p.getString('model') ?? 'gpt-4o-mini';
  String get targetLang => _p.getString('lang') ?? 'Indonesian';
  String get glossary => _p.getString('glossary') ?? defaultGlossary;
  bool get autoTranslate => _p.getBool('autoTranslate') ?? false;
  bool get gamepad => _p.getBool('gamepad') ?? true;
  double get opacity => _p.getDouble('opacity') ?? 0.55;

  Future<void> saveAi({
    required String baseUrl,
    required String apiKey,
    required String model,
    required String glossary,
  }) async {
    await _p.setString('baseUrl', baseUrl.trim());
    await _p.setString('apiKey', apiKey.trim());
    await _p.setString('model', model.trim());
    await _p.setString('glossary', glossary);
    notifyListeners();
  }

  Future<void> setLang(String v) async {
    await _p.setString('lang', v);
    notifyListeners();
  }

  Future<void> setAutoTranslate(bool v) async {
    await _p.setBool('autoTranslate', v);
    notifyListeners();
  }

  Future<void> setGamepad(bool v) async {
    await _p.setBool('gamepad', v);
    notifyListeners();
  }

  Future<void> setOpacity(double v) async {
    await _p.setDouble('opacity', v);
    notifyListeners();
  }
}
