import 'package:flutter/material.dart';
import 'home_shell.dart';

/// Animasi pembuka: logo muncul membesar pelan, lalu bar kecil mengisi sebelum masuk ke pustaka.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> with SingleTickerProviderStateMixin {
  late final AnimationController _c =
      AnimationController(vsync: this, duration: const Duration(milliseconds: 2600));

  @override
  void initState() {
    super.initState();
    _c.forward().whenComplete(_next);
  }

  void _next() {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(PageRouteBuilder<void>(
      transitionDuration: const Duration(milliseconds: 500),
      pageBuilder: (_, __, ___) => const HomeShell(),
      transitionsBuilder: (_, anim, __, child) => FadeTransition(opacity: anim, child: child),
    ));
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  double _span(double t, double from, double to) {
    if (t <= from) return 0;
    if (t >= to) return 1;
    return (t - from) / (to - from);
  }

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.of(context).size.width;
    return Scaffold(
      backgroundColor: const Color(0xFF14181F), // sama dengan latar gambar logo
      body: Center(
        child: AnimatedBuilder(
          animation: _c,
          builder: (context, _) {
            final t = _c.value;
            final fade = Curves.easeOut.transform(_span(t, 0, 0.4));
            final scale = 0.8 + 0.2 * Curves.easeOutBack.transform(_span(t, 0, 0.6));
            final lift = 18 * (1 - Curves.easeOutCubic.transform(_span(t, 0, 0.5)));
            final bar = Curves.easeInOut.transform(_span(t, 0.35, 1));
            return Opacity(
              opacity: fade,
              child: Transform.translate(
                offset: Offset(0, lift),
                child: Transform.scale(
                  scale: scale,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Image.asset(
                        'assets/images/arupijiplay_logo.png',
                        width: width * 0.92,
                        errorBuilder: (_, __, ___) => const Text(
                          'ArupijiPlay',
                          style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: Colors.white),
                        ),
                      ),
                      const SizedBox(height: 10),
                      SizedBox(
                        width: 150,
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(4),
                          child: LinearProgressIndicator(
                            value: bar,
                            minHeight: 3,
                            backgroundColor: Colors.white12,
                            color: const Color(0xFF5BB8F0),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
