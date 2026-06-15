import 'dart:async';
import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';

import 'firebase_options.dart';
import 'core/api_client.dart';
import 'core/constants.dart';
import 'core/models_api.dart';
import 'core/notify.dart';
import 'core/push_service.dart';
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

  // Ladda locale-data INNAN något DateFormat/NumberFormat används (annars
  // LocaleDataException på t.ex. Konto-skärmen).
  Intl.defaultLocale = 'sv_SE';
  await initializeDateFormatting('sv_SE', null);

  // Initiera Firebase TIDIGT (innan bakgrunds-push-handlern registreras —
  // annars kraschar onBackgroundMessage på iOS för att default-appen saknas).
  // Guardat: utan config kör appen vidare utan push.
  try {
    await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
  } catch (e) {
    debugPrint('[push] Firebase-init i main misslyckades: $e');
  }

  // Skapa notis-kanalerna (med custom-ljud) redan vid start — annars saknas de
  // när en stängd-app-FCM-notis kommer in innan budet hunnit gå online, och
  // ljudet faller tillbaka på default. Promptar INTE (behörighet sker separat).
  unawaited(Notify.ensureInit());

  final client = ApiClient.instance;
  final api = CourierApi(client);
  final auth = AuthProvider(api, client);
  final session = SessionProvider(api);
  // Vid utloggning (manuell eller påtvingad 401): riv ner sessionen direkt.
  auth.onLoggedOut = () => session.reset();
  await auth.bootstrap();

  final prefs = await SharedPreferences.getInstance();
  final onboardingSeen = prefs.getBool(Constants.onboardingSeenKey) ?? false;

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: auth),
        ChangeNotifierProvider.value(value: session),
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

class _DeliveraCourierAppState extends State<DeliveraCourierApp>
    with WidgetsBindingObserver {
  late bool _onboardingSeen = widget.onboardingSeen;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    // Initial systembrightness (för "Följ systemet").
    final b = WidgetsBinding.instance.platformDispatcher.platformBrightness;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.read<ThemeProvider>().updateSystemBrightness(b);
    });
  }

  @override
  void didChangePlatformBrightness() {
    // Endast vid faktisk ändring — inte på varje rebuild.
    final b = WidgetsBinding.instance.platformDispatcher.platformBrightness;
    if (mounted) context.read<ThemeProvider>().updateSystemBrightness(b);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer2<ThemeProvider, AuthProvider>(
      builder: (context, themeProvider, auth, _) {
        return MaterialApp(
          title: 'Delivera Courier',
          debugShowCheckedModeBanner: false,
          theme: themeProvider.currentTheme,
          locale: const Locale('sv', 'SE'),
          supportedLocales: const [Locale('sv', 'SE'), Locale('en')],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          scrollBehavior: const MaterialScrollBehavior().copyWith(
            dragDevices: {
              PointerDeviceKind.mouse,
              PointerDeviceKind.touch,
              PointerDeviceKind.stylus,
              PointerDeviceKind.unknown,
            },
          ),
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
