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

  FlutterError.onError = (details) {
    debugPrint('FLUTTER ERROR: ${details.exceptionAsString()}');
    debugPrint(details.stack.toString());
  };
  PlatformDispatcher.instance.onError = (error, stack) {
    debugPrint('PLATFORM ERROR: $error');
    debugPrint(stack.toString());
    return true;
  };

  try {
    await AudioHelper.initConfigs();
  } catch (e) {
    debugPrint('Initial audio config failed: $e');
  }

  final authProvider = AuthProvider();
  ApiClient.onUnauthorized = () => authProvider.logout();
  await authProvider.tryAutoLogin();

  if (!kIsWeb) {
    unawaited(PushService.init().catchError((e) {
      debugPrint('PushService init failed: $e');
    }));
  }

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
      child: LeveraBusinessApp(version: fullVersion),
    ),
  );
}

class LeveraBusinessApp extends StatelessWidget {
  final String version;
  const LeveraBusinessApp({super.key, required this.version});

  @override
  Widget build(BuildContext context) {
    return Consumer<ThemeProvider>(
      builder: (context, themeProvider, _) {
        return Consumer<AuthProvider>(
          builder: (context, auth, _) {
            return MaterialApp(
              title: 'Levera Business v$version',
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
    WakelockPlus.enable();
    AppForegroundService.init();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = Provider.of<AuthProvider>(context, listen: false);
      final orders = Provider.of<OrderProvider>(context, listen: false);
      orders.restorePauseState();
      if (auth.isAuthenticated && auth.user?['restaurantId'] != null) {
        orders.initSocket(auth.user!['restaurantId']);
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
                          width: 100, child: _buildDesktopRail(context)),
                    ),
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
                        child: _buildViewport(),
                      ),
                    ),
                  ],
                )
              : Stack(
                  children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(0, 0, 0, 0),
                      child: _buildViewport(),
                    ),
                    Positioned(
                      left: 0,
                      right: 0,
                      bottom: 16,
                      child: Center(child: _FloatingPillNav(
                        destinations: _destinations,
                        currentIndex: _currentIndex,
                        onSelect: _selectTab,
                      )),
                    ),
                  ],
                ),
        ),
      ),
    );

    return Listener(
      behavior: HitTestBehavior.translucent,
      onPointerDown: (_) {
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
    return IndexedStack(
      index: _currentIndex,
      children: _pages,
    );
  }

  Widget _buildDesktopRail(BuildContext context) {
    final activeColor =
        AppTheme.isDark(context) ? AppTheme.ember : AppTheme.emberDeep;

    return AppPanel(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [AppTheme.emberSoft, AppTheme.ember],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(18),
              boxShadow: [
                BoxShadow(
                  color: AppTheme.ember.withOpacity(0.32),
                  blurRadius: 16,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: const Center(
              child: Text(
                'M',
                style: TextStyle(
                  color: AppTheme.ink,
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  letterSpacing: -1,
                ),
              ),
            ),
          ),
          const SizedBox(height: 14),
          Expanded(
            child: NavigationRail(
              backgroundColor: Colors.transparent,
              minWidth: 72,
              selectedIndex: _currentIndex,
              labelType: NavigationRailLabelType.all,
              indicatorColor: activeColor.withOpacity(0.18),
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
}

/// Flytande pill-nav (Apple Maps-stil). Rundad container, ikoner med aktiv glow.
class _FloatingPillNav extends StatelessWidget {
  final List<_ShellDestination> destinations;
  final int currentIndex;
  final ValueChanged<int> onSelect;

  const _FloatingPillNav({
    required this.destinations,
    required this.currentIndex,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final activeColor = isDark ? AppTheme.ember : AppTheme.emberDeep;
    final bg = isDark
        ? AppTheme.steel.withOpacity(0.92)
        : Colors.white.withOpacity(0.96);

    return ClipRRect(
      borderRadius: BorderRadius.circular(32),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(32),
            border: Border.all(
              color: isDark
                  ? Colors.white.withOpacity(0.06)
                  : AppTheme.ink.withOpacity(0.06),
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(isDark ? 0.45 : 0.10),
                blurRadius: 28,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: List.generate(destinations.length, (i) {
              final dest = destinations[i];
              final selected = i == currentIndex;
              return _NavPillItem(
                icon: selected ? dest.activeIcon : dest.icon,
                label: dest.label,
                selected: selected,
                activeColor: activeColor,
                onTap: () => onSelect(i),
              );
            }),
          ),
        ),
      ),
    );
  }
}

class _NavPillItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final Color activeColor;
  final VoidCallback onTap;

  const _NavPillItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.activeColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(24),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: EdgeInsets.symmetric(
            horizontal: selected ? 16 : 14,
            vertical: 10,
          ),
          decoration: BoxDecoration(
            color: selected
                ? activeColor.withOpacity(isDark ? 0.20 : 0.16)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(24),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 22,
                color: selected
                    ? activeColor
                    : (isDark
                        ? Colors.white.withOpacity(0.65)
                        : AppTheme.mutedInk),
              ),
              AnimatedSize(
                duration: const Duration(milliseconds: 200),
                curve: Curves.easeOutCubic,
                child: selected
                    ? Padding(
                        padding: const EdgeInsets.only(left: 8),
                        child: Text(
                          label,
                          style: TextStyle(
                            color: activeColor,
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.2,
                          ),
                        ),
                      )
                    : const SizedBox.shrink(),
              ),
            ],
          ),
        ),
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
