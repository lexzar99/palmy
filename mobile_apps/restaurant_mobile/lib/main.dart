import 'package:flutter/material.dart';
import 'dart:ui';
import 'package:provider/provider.dart';

import 'core/theme.dart';
import 'providers/auth_provider.dart';
import 'providers/order_provider.dart';
import 'screens/login_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/history_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/menu_screen.dart';
import 'screens/insights_screen.dart';
import 'providers/theme_provider.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'core/audio_helper.dart';
import 'widgets/app_ui.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Try initializing audio configurations
  try {
    await AudioHelper.initConfigs();
  } catch (e) {
    debugPrint('Initial audio config failed: $e');
  }

  final authProvider = AuthProvider();
  await authProvider.tryAutoLogin();

  PackageInfo packageInfo = await PackageInfo.fromPlatform();
  final String fullVersion =
      '${packageInfo.version}+${packageInfo.buildNumber}';

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: authProvider),
        ChangeNotifierProvider(create: (_) => OrderProvider()),
        ChangeNotifierProvider(
            create: (_) => ThemeProvider()), // NEW THEME PROVIDER
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
                    ? const MainShell(key: ValueKey('main-shell'))
                    : const LoginScreen(key: ValueKey('login-screen')),
              ),
            );
          },
        );
      },
    );
  }
}

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _currentIndex = 0;
  late final PageController _pageController;

  final _pages = const [
    DashboardScreen(),
    HistoryScreen(),
    InsightsScreen(),
    MenuScreen(),
    SettingsScreen(),
  ];

  final _destinations = const [
    _ShellDestination(
      label: 'Ordrar',
      icon: Icons.receipt_long_outlined,
      activeIcon: Icons.receipt_long_rounded,
    ),
    _ShellDestination(
      label: 'Historik',
      icon: Icons.history_toggle_off_rounded,
      activeIcon: Icons.history_rounded,
    ),
    _ShellDestination(
      label: 'Insikter',
      icon: Icons.auto_graph_outlined,
      activeIcon: Icons.auto_graph_rounded,
    ),
    _ShellDestination(
      label: 'Meny',
      icon: Icons.restaurant_menu_outlined,
      activeIcon: Icons.restaurant_menu_rounded,
    ),
    _ShellDestination(
      label: 'Inställningar',
      icon: Icons.tune_rounded,
      activeIcon: Icons.tune_rounded,
    ),
  ];

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = Provider.of<AuthProvider>(context, listen: false);
      final orders = Provider.of<OrderProvider>(context, listen: false);
      if (auth.isAuthenticated && auth.user?['restaurantId'] != null) {
        orders.initSocket(auth.user!['restaurantId']);
      }
    });
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _selectTab(int index) {
    if (index == _currentIndex) return;

    setState(() => _currentIndex = index);
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 420),
      curve: Curves.easeOutCubic,
    );
  }

  @override
  Widget build(BuildContext context) {
    final mediaQuery = MediaQuery.of(context);
    final showRail = mediaQuery.size.width >= 1080;
    final themeProvider = Provider.of<ThemeProvider>(context);

    WidgetsBinding.instance.addPostFrameCallback((_) {
      themeProvider.updateSystemBrightness(mediaQuery.platformBrightness);
    });

    return Scaffold(
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
  }

  Widget _buildViewport() {
    return PageView(
      controller: _pageController,
      physics: const NeverScrollableScrollPhysics(),
      onPageChanged: (index) => setState(() => _currentIndex = index),
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
