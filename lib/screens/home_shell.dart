import 'package:flutter/material.dart';
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
        destinations: const [
          NavigationDestination(icon: Icon(Icons.sports_esports_outlined), selectedIcon: Icon(Icons.sports_esports), label: 'Pustaka'),
          NavigationDestination(icon: Icon(Icons.tune), label: 'Pengaturan'),
          NavigationDestination(icon: Icon(Icons.favorite_border), selectedIcon: Icon(Icons.favorite), label: 'Dukung'),
          NavigationDestination(icon: Icon(Icons.info_outline), selectedIcon: Icon(Icons.info), label: 'Tentang'),
        ],
      ),
    );
  }
}
