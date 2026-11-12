import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';
import 'settings_store.dart';

/// Bahasa tampilan aplikasi (bukan bahasa game): Indonesia atau Inggris.
extension I18n on BuildContext {
  /// Pakai di dalam build() dan sertakan context.watch<SettingsStore>() di awal build
  /// supaya layar ikut berganti saat bahasa diubah.
  String t(String id, String en) => read<SettingsStore>().appLang == 'en' ? en : id;
}
