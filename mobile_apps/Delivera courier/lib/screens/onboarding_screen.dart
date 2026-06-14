import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../widgets/app_ui.dart';

/// Modern, monokrom onboarding (3 sidor) som kuriren ser första gången.
class OnboardingScreen extends StatefulWidget {
  final VoidCallback onDone;
  const OnboardingScreen({super.key, required this.onDone});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  static const _pages = [
    _OnboardPage(
      icon: Icons.bolt_rounded,
      title: 'Välkommen till\nDelivera Courier',
      body:
          'Ditt bud-konto skapas av Delivera. Logga in, gå online och börja ta leveranser i din stad.',
    ),
    _OnboardPage(
      icon: Icons.alt_route_rounded,
      title: 'Ett uppdrag\ni taget',
      body:
          'Se tillgängliga uppdrag nära dig, acceptera med en tryckning och få vägbeskrivning till restaurang och kund.',
    ),
    _OnboardPage(
      icon: Icons.payments_outlined,
      title: 'Se vad du\ntjänar',
      body:
          'Varje leverans visar din ersättning direkt. Följ dagens och historikens intjäning på Konto-fliken.',
    ),
  ];

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(Constants.onboardingSeenKey, true);
    widget.onDone();
  }

  void _next() {
    if (_page < _pages.length - 1) {
      _controller.nextPage(
        duration: const Duration(milliseconds: 320),
        curve: Curves.easeOutCubic,
      );
    } else {
      _finish();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _page == _pages.length - 1;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(0, 8, 12, 0),
                  child: TextButton(
                    onPressed: _finish,
                    child: const Text('Hoppa över'),
                  ),
                ),
              ),
              Expanded(
                child: PageView(
                  controller: _controller,
                  onPageChanged: (i) => setState(() => _page = i),
                  children: _pages,
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_pages.length, (i) {
                  final active = i == _page;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: active ? 22 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: active
                          ? (AppTheme.isDark(context)
                              ? AppTheme.ember
                              : AppTheme.emberDeep)
                          : AppTheme.mutedColor(context).withOpacity(0.3),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  );
                }),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 22, 24, 24),
                child: EmberButton(
                  label: isLast ? 'Kom igång' : 'Nästa',
                  icon: isLast
                      ? Icons.check_rounded
                      : Icons.arrow_forward_rounded,
                  onPressed: _next,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OnboardPage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;
  const _OnboardPage({
    required this.icon,
    required this.title,
    required this.body,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent =
        AppTheme.isDark(context) ? AppTheme.ember : AppTheme.emberDeep;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 96,
            height: 96,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [AppTheme.emberSoft, accent],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(28),
              boxShadow: [
                BoxShadow(
                  color: accent.withOpacity(0.32),
                  blurRadius: 24,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Icon(icon, size: 46, color: AppTheme.ink),
          ),
          const SizedBox(height: 40),
          Text(title, style: theme.textTheme.displaySmall),
          const SizedBox(height: 18),
          Text(
            body,
            style: theme.textTheme.bodyLarge?.copyWith(
              color: AppTheme.mutedColor(context),
              height: 1.5,
            ),
          ),
        ],
      ),
    );
  }
}
