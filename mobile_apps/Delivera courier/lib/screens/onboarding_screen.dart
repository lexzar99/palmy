import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../widgets/app_ui.dart';
import '../widgets/courier_ui.dart';

/// Editorial, varumärkesledd onboarding (3 sidor). Inga gradient-ikonrutor —
/// stora Outfit-numeraler, delivera-ordmärke och stram typografi.
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
    _OnboardContent(
      index: '01',
      eyebrow: 'Kom igång',
      title: 'Kör för\nDelivera',
      body:
          'Ditt bud-konto skapas av Delivera. Logga in, gå online och börja ta leveranser i din stad.',
    ),
    _OnboardContent(
      index: '02',
      eyebrow: 'Enkelt flöde',
      title: 'Ett uppdrag\ni taget',
      body:
          'Se uppdrag nära dig, acceptera med en tryckning och få vägbeskrivning till restaurang och kund.',
    ),
    _OnboardContent(
      index: '03',
      eyebrow: 'Full koll',
      title: 'Du ser vad\ndu tjänar',
      body:
          'Varje leverans visar din ersättning direkt. Följ dagens och historikens intjäning på Konto.',
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
        duration: const Duration(milliseconds: 360),
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
              // Topp: ordmärke + hoppa över
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 14, 12, 0),
                child: Row(
                  children: [
                    const DeliveraWordmark(fontSize: 22, tagline: 'Courier'),
                    const Spacer(),
                    TextButton(
                      onPressed: _finish,
                      child: const Text('Hoppa över'),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: PageView(
                  controller: _controller,
                  onPageChanged: (i) => setState(() => _page = i),
                  children: _pages,
                ),
              ),
              // Indikator
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_pages.length, (i) {
                  final active = i == _page;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: active ? 26 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: active
                          ? (AppTheme.isDark(context)
                              ? AppTheme.ember
                              : AppTheme.emberDeep)
                          : AppTheme.mutedColor(context).withOpacity(0.28),
                      borderRadius: BorderRadius.circular(4),
                    ),
                  );
                }),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 22, 24, 22),
                child: EmberButton(
                  label: isLast ? 'Kom igång' : 'Nästa',
                  icon: isLast
                      ? Icons.arrow_forward_rounded
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

class _OnboardContent extends StatelessWidget {
  final String index;
  final String eyebrow;
  final String title;
  final String body;
  const _OnboardContent({
    required this.index,
    required this.eyebrow,
    required this.title,
    required this.body,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final gold =
        AppTheme.isDark(context) ? AppTheme.ember : AppTheme.emberDeep;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Stor varumärkes-numeral som hero (ingen gradient-blob-ikon)
          ShaderMask(
            shaderCallback: (rect) => LinearGradient(
              colors: [AppTheme.emberSoft, gold],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ).createShader(rect),
            child: Text(
              index,
              style: const TextStyle(
                fontFamily: AppTheme.displayFont,
                fontSize: 108,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                height: 0.9,
                letterSpacing: -4,
              ),
            ),
          ),
          const SizedBox(height: 28),
          Text(
            eyebrow.toUpperCase(),
            style: theme.textTheme.labelMedium?.copyWith(
              color: gold,
              letterSpacing: 1.4,
            ),
          ),
          const SizedBox(height: 12),
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
