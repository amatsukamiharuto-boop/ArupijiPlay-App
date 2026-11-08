import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'config/app_info.dart';
import 'screens/splash_screen.dart';
import 'services/game_db.dart';
import 'services/library_store.dart';
import 'services/native_bridge.dart';
import 'services/settings_store.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Error Flutter ikut masuk ke log debug
  FlutterError.onError = (details) {
    FlutterError.presentError(details);
    NativeBridge.debugLog('E', 'Flutter', '${details.exceptionAsString()}\n${details.stack ?? ''}');
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    NativeBridge.debugLog('E', 'Dart', '$error\n$stack');
    return true;
  };

  final settings = await SettingsStore.load();
  final library = LibraryStore(await GameDb.open());
  await library.refresh();
  await NativeBridge.cleanOrphans(library.games.map((g) => g.path).toList());
  runApp(MultiProvider(
    providers: [
      ChangeNotifierProvider<SettingsStore>.value(value: settings),
      ChangeNotifierProvider<LibraryStore>.value(value: library),
    ],
    child: const ArupijiApp(),
  ));
}

ThemeData buildTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final bg = dark ? const Color(0xFF14181F) : const Color(0xFFF3F6FA);
  final panel = dark ? const Color(0xFF1E2530) : Colors.white;
  final accent = dark ? const Color(0xFF5BB8F0) : const Color(0xFF1B7FBF);
  const orange = Color(0xFFF2A65A);

  final scheme = dark
      ? ColorScheme.dark(primary: accent, secondary: orange, surface: panel)
      : ColorScheme.light(primary: accent, secondary: orange, surface: panel, onPrimary: Colors.white);

  return ThemeData(
    useMaterial3: true,
    brightness: b,
    scaffoldBackgroundColor: bg,
    colorScheme: scheme,
    appBarTheme: AppBarTheme(
      backgroundColor: bg,
      elevation: 0,
      scrolledUnderElevation: 0,
      foregroundColor: dark ? Colors.white : const Color(0xFF14181F),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: panel,
      indicatorColor: accent.withAlpha(dark ? 60 : 45),
    ),
  );
}

class ArupijiApp extends StatelessWidget {
  const ArupijiApp({super.key});

  @override
  Widget build(BuildContext context) {
    final mode = switch (context.watch<SettingsStore>().themeMode) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
    return MaterialApp(
      title: AppInfo.appName,
      debugShowCheckedModeBanner: false,
      theme: buildTheme(Brightness.light),
      darkTheme: buildTheme(Brightness.dark),
      themeMode: mode,
      home: const SplashScreen(),
    );
  }
}
