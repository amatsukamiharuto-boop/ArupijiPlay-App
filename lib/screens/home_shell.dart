import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/i18n.dart';
import '../services/settings_store.dart';
import 'about_screen.dart';
import 'library_screen.dart';
import 'settings_screen.dart';
import 'support_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    context.watch<SettingsStore>();
    return Scaffold(
      body: IndexedStack(index: _index, children: const [
        LibraryScreen(),
        SettingsScreen(),
        SupportScreen(),
        AboutScreen(),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(
              icon: const Icon(Icons.sports_esports_outlined),
              selectedIcon: const Icon(Icons.sports_esports),
              label: context.t('Pustaka', 'Library')),
          NavigationDestination(icon: const Icon(Icons.tune), label: context.t('Pengaturan', 'Settings')),
          NavigationDestination(
              icon: const Icon(Icons.favorite_border),
              selectedIcon: const Icon(Icons.favorite),
              label: context.t('Dukung', 'Support')),
          NavigationDestination(
              icon: const Icon(Icons.info_outline),
              selectedIcon: const Icon(Icons.info),
              label: context.t('Tentang', 'About')),
        ],
      ),
    );
  }
}
