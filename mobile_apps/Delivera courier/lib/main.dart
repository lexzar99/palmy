import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'core/api_client.dart';
import 'core/constants.dart';
import 'core/models_api.dart';
import 'core/theme.dart';
import 'providers/auth_provider.dart';
import 'providers/session_provider.dart';
import 'providers/theme_provider.dart';
import 'screens/login_screen.dart';
import 'screens/main_shell.dart';
import 'screens/onboarding_screen.dart';
import 'widgets/app_ui.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  FlutterError.onError = (details) {
    debugPrint('FLUTTER ERROR: ${details.exceptionAsString()}');
  };

  final client = ApiClient.instance;
  final api = CourierApi(client);
  final auth = AuthProvider(api, client);
  await auth.bootstrap();

  final prefs = await SharedPreferences.getInstance();
  final onboardingSeen = prefs.getBool(Constants.onboardingSeenKey) ?? false;

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider(create: (_) => SessionProvider(api)),
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
      ],
      child: DeliveraCourierApp(onboardingSeen: onboardingSeen),
    ),
  );
}

class DeliveraCourierApp extends StatefulWidget {
  final bool onboardingSeen;
  const DeliveraCourierApp({super.key, required this.onboardingSeen});

  @override
  State<DeliveraCourierApp> createState() => _DeliveraCourierAppState();
}

class _DeliveraCourierAppState extends State<DeliveraCourierApp> {
  late bool _onboardingSeen = widget.onboardingSeen;

  @override
  Widget build(BuildContext context) {
    return Consumer2<ThemeProvider, AuthProvider>(
      builder: (context, themeProvider, auth, _) {
        return MaterialApp(
          title: 'Delivera Courier',
          debugShowCheckedModeBanner: false,
          theme: themeProvider.currentTheme,
          scrollBehavior: const MaterialScrollBehavior().copyWith(
            dragDevices: {
              PointerDeviceKind.mouse,
              PointerDeviceKind.touch,
              PointerDeviceKind.stylus,
              PointerDeviceKind.unknown,
            },
          ),
          builder: (context, child) {
            // Håll systemets ljus/mörker uppdaterad för "Följ systemet".
            final brightness = MediaQuery.platformBrightnessOf(context);
            WidgetsBinding.instance.addPostFrameCallback((_) {
              themeProvider.updateSystemBrightness(brightness);
            });
            return child ?? const SizedBox.shrink();
          },
          home: AnimatedSwitcher(
            duration: const Duration(milliseconds: 360),
            switchInCurve: Curves.easeOutCubic,
            switchOutCurve: Curves.easeInCubic,
            child: _root(auth),
          ),
        );
      },
    );
  }

  Widget _root(AuthProvider auth) {
    if (!_onboardingSeen) {
      return OnboardingScreen(
        key: const ValueKey('onboarding'),
        onDone: () => setState(() => _onboardingSeen = true),
      );
    }
    switch (auth.status) {
      case AuthStatus.booting:
        return const _BootSplash(key: ValueKey('boot'));
      case AuthStatus.loggedOut:
        return const LoginScreen(key: ValueKey('login'));
      case AuthStatus.loggedIn:
        return const MainShell(key: ValueKey('shell'));
    }
  }
}

class _BootSplash extends StatelessWidget {
  const _BootSplash({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: Center(child: CircularProgressIndicator(color: AppTheme.ember)),
      ),
    );
  }
}
