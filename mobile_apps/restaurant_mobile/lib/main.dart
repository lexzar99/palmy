import 'package:flutter/material.dart';
import 'dart:async';
import 'dart:ui';
import 'package:flutter/foundation.dart';
import 'package:provider/provider.dart';

import 'package:wakelock_plus/wakelock_plus.dart';

import 'core/api_client.dart';
import 'core/foreground_service.dart';
import 'core/push_service.dart';
import 'core/theme.dart';
import 'providers/auth_provider.dart';
import 'providers/order_provider.dart';
import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/history_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/menu_screen.dart';
import 'screens/sleep_screen.dart';
import 'providers/theme_provider.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'core/audio_helper.dart';
import 'widgets/app_ui.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  try {
    await AudioHelper.initConfigs();
  } catch (e) {
    debugPrint('Initial audio config failed: $e');
  }

  final authProvider = AuthProvider();
  ApiClient.onUnauthorized = () => authProvider.logout();
  await authProvider.tryAutoLogin();

  // FCM init i bakgrunden – blockerar inte app-start.
  unawaited(PushService.init().catchError((e) {
    debugPrint('PushService init failed: $e');
  }));

  PackageInfo packageInfo = await PackageInfo.fromPlatform();
  final String fullVersion =
      '${packageInfo.version}+${packageInfo.buildNumber}';

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: authProvider),
        ChangeNotifierProvider(create: (_) => OrderProvider()),
        ChangeNotifierProvider(create: (_) => ThemeProvider()),
      ],
      child: MatGoBusinessApp(version: fullVersion),
    ),
  );
}

class MatGoBusinessApp extends StatelessWidget {
  final String version;
  const MatGoBusinessApp({super.key, required this.version});

  @override
  Widget build(BuildContext context) {
    return Consumer<ThemeProvider>(
      builder: (context, themeProvider, _) {
        return Consumer<AuthProvider>(
          builder: (context, auth, _) {
            return MaterialApp(
              title: 'MatGo Business v$version',
              debugShowCheckedModeBanner: false,
              theme: themeProvider.currentTheme,
              scrollBehavior: const MaterialScrollBehavior().copyWith(
                dragDevices: {
                  PointerDeviceKind.mouse,
                  PointerDeviceKind.touch,
                  PointerDeviceKind.stylus,
                  PointerDeviceKind.unknown
                },
              ),
              home: AnimatedSwitcher(
                duration: const Duration(milliseconds: 360),
                switchInCurve: Curves.easeOutCubic,
                switchOutCurve: Curves.easeInCubic,
                child: auth.isAuthenticated
                    ? MainShell(key: mainShellKey)
                    : const LoginScreen(key: ValueKey('login-screen')),
              ),
            );
          },
        );
      },
    );
  }
}

// Global key så att andra skärmar (t.ex. dashboard) kan trigga sleep direkt.
final GlobalKey<_MainShellState> mainShellKey = GlobalKey<_MainShellState>();

void triggerSleep() {
  mainShellKey.currentState?._sleepNow();
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;
  Timer? _sleepTimer;
  bool _sleeping = false;

  static const _sleepAfter = Duration(seconds: 30);

  final _pages = const [
    DashboardScreen(),
    HistoryScreen(),
    MenuScreen(),
    SettingsScreen(),
  ];

  final _destinations = const [
    _ShellDestination(
      label: 'Order',
      icon: Icons.receipt_long_outlined,
      activeIcon: Icons.receipt_long_rounded,
    ),
    _ShellDestination(
      label: 'Historik',
      icon: Icons.history_toggle_off_rounded,
      activeIcon: Icons.history_rounded,
    ),
    _ShellDestination(
      label: 'Meny',
      icon: Icons.restaurant_menu_outlined,
      activeIcon: Icons.restaurant_menu_rounded,
    ),
    _ShellDestination(
      label: 'Inställningar',
      icon: Icons.settings_outlined,
      activeIcon: Icons.settings_rounded,
    ),
  ];

  @override
  void initState() {
    super.initState();
    // Håll skärmen vaken hela tiden appen är öppen – kritiskt för
    // restaurang-tablet som annars släcker mellan ordrar.
    WakelockPlus.enable();
    AppForegroundService.init();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = Provider.of<AuthProvider>(context, listen: false);
      final orders = Provider.of<OrderProvider>(context, listen: false);
      orders.restorePauseState();
      if (auth.isAuthenticated && auth.user?['restaurantId'] != null) {
        orders.initSocket(auth.user!['restaurantId']);
        // Starta persistent notifikation – håller Android från att killa
        // appen när skärmen är låst eller annan app är förgrund.
        AppForegroundService.start();
      }
      _resetSleepTimer();
    });
  }

  @override
  void dispose() {
    WakelockPlus.disable();
    _sleepTimer?.cancel();
    super.dispose();
  }

  void _resetSleepTimer() {
    _sleepTimer?.cancel();
    _sleepTimer = Timer(_sleepAfter, _maybeSleep);
  }

  void _maybeSleep() {
    final orders = Provider.of<OrderProvider>(context, listen: false);
    if (!orders.isRestaurantOpen && orders.pendingOrders.isEmpty && mounted) {
      setState(() => _sleeping = true);
    }
  }

  void _sleepNow() {
    if (!mounted) return;
    _sleepTimer?.cancel();
    setState(() => _sleeping = true);
  }

  void _wake() {
    if (mounted && _sleeping) {
      setState(() => _sleeping = false);
    }
    _resetSleepTimer();
  }

  void _selectTab(int index) {
    if (index == _currentIndex) return;
    setState(() => _currentIndex = index);
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final showRail = mediaQuery.size.width >= 1080;
    final themeProvider = Provider.of<ThemeProvider>(context);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      themeProvider.updateSystemBrightness(mediaQuery.platformBrightness);
    });

    // Wake up when a new pending order arrives
    final orderProvider = Provider.of<OrderProvider>(context);
    if (_sleeping && orderProvider.pendingOrders.isNotEmpty) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _wake());
    }

    final shell = Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: showRail
              ? Row(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 12, 0, 12),
                      child: SizedBox(
                          width: 92, child: _buildDesktopRail(context)),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                        child: _buildViewport(),
                      ),
                    ),
                  ],
                )
              : Column(
                  children: [
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
                        child: _buildViewport(),
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
                      child: _buildBottomNavigation(context),
                    ),
                  ],
                ),
        ),
      ),
    );

    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) {
        // När viloskärmen är synlig får touch INTE wake — endast X-knappen.
        if (!_sleeping) _resetSleepTimer();
      },
      child: Stack(
        children: [
          shell,
          if (_sleeping)
            Positioned.fill(
              child: SleepScreen(onWake: _wake),
            ),
        ],
      ),
    );
  }

  Widget _buildViewport() {
    // IndexedStack istället för PageView – garanterar att nav-index alltid
    // matchar visad sida (PageController kunde tappa sig vid theme-rebuild
    // och hoppa till sida 0 medan navbar låg kvar på Settings).
    return IndexedStack(
      index: _currentIndex,
      children: _pages,
    );
  }

  Widget _buildDesktopRail(BuildContext context) {
    final activeColor =
        AppTheme.isDark(context) ? AppTheme.gold : AppTheme.lightGold;

    return AppPanel(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppTheme.goldAccent, AppTheme.gold],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
            ),
            child: const Center(
              child: Text(
                'M',
                style: TextStyle(
                  color: AppTheme.ink,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: NavigationRail(
              backgroundColor: Colors.transparent,
              minWidth: 64,
              selectedIndex: _currentIndex,
              labelType: NavigationRailLabelType.all,
              indicatorColor: activeColor.withOpacity(0.16),
              onDestinationSelected: _selectTab,
              destinations: _destinations
                  .map(
                    (destination) => NavigationRailDestination(
                      icon: Icon(destination.icon),
                      selectedIcon: Icon(
                        destination.activeIcon,
                        color: activeColor,
                      ),
                      label: Text(destination.label),
                    ),
                  )
                  .toList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildBottomNavigation(BuildContext context) {
    return AppPanel(
      padding: EdgeInsets.zero,
      radius: 18,
      child: NavigationBar(
        height: 68,
        backgroundColor: Colors.transparent,
        selectedIndex: _currentIndex,
        onDestinationSelected: _selectTab,
        destinations: _destinations
            .map(
              (destination) => NavigationDestination(
                icon: Icon(destination.icon),
                selectedIcon: Icon(destination.activeIcon),
                label: destination.label,
              ),
            )
            .toList(),
      ),
    );
  }
}

class _ShellDestination {
  final String label;
  final IconData icon;
  final IconData activeIcon;

  const _ShellDestination({
    required this.label,
    required this.icon,
    required this.activeIcon,
  });
}
