import 'package:flutter/material.dart';
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
  final String fullVersion = '${packageInfo.version}+${packageInfo.buildNumber}';


  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: authProvider),
        ChangeNotifierProvider(create: (_) => OrderProvider()),
        ChangeNotifierProvider(create: (_) => ThemeProvider()), // NEW THEME PROVIDER
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
            debugPrint('🏠 APP ROOT: Authenticated: ${auth.isAuthenticated}. User: ${auth.user?['name']}');
            return MaterialApp(
              title: 'MatGo Business v$version',
              debugShowCheckedModeBanner: false,
              theme: themeProvider.currentTheme,
              home: auth.isAuthenticated ? const MainShell() : const LoginScreen(),
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

  final _pages = const [
    DashboardScreen(),
    HistoryScreen(),
    InsightsScreen(),
    MenuScreen(),
    SettingsScreen(),
  ];

  @override
  void initState() {
    super.initState();
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
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isTablet = MediaQuery.of(context).size.shortestSide >= 600;
    final themeProvider = Provider.of<ThemeProvider>(context);
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    debugPrint('📱 MainShell Build. Authenticated: ${authProvider.isAuthenticated}. User: ${authProvider.user?['name']}');
    
    // Sync system brightness to provider for 'SYNC WITH SYSTEM' mode
    WidgetsBinding.instance.addPostFrameCallback((_) {
      themeProvider.updateSystemBrightness(MediaQuery.of(context).platformBrightness);
    });

    final currentTheme = themeProvider.currentTheme;
    final bgColor = currentTheme.scaffoldBackgroundColor;
    final isDark = currentTheme.brightness == Brightness.dark;

    if (isTablet) {
      return Scaffold(
        body: Row(children: [
            NavigationRail(
              backgroundColor: bgColor,
              selectedIndex: _currentIndex,
              onDestinationSelected: (i) => setState(() => _currentIndex = i),
              labelType: NavigationRailLabelType.all,
              leading: Padding(padding: const EdgeInsets.symmetric(vertical: 20), child: Container(width: 45, height: 45, decoration: BoxDecoration(color: AppTheme.gold, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: AppTheme.gold.withOpacity(0.1), blurRadius: 10)]), child: const Center(child: Text('M', style: TextStyle(color: AppTheme.charcoal, fontSize: 24, fontWeight: FontWeight.w900))))),
              selectedIconTheme: IconThemeData(color: isDark ? AppTheme.charcoal : AppTheme.lightGold, size: 28),
              unselectedIconTheme: IconThemeData(color: isDark ? Colors.white.withOpacity(0.4) : AppTheme.lightSubtext, size: 24), 
              selectedLabelTextStyle: TextStyle(color: isDark ? AppTheme.gold : AppTheme.lightGold, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1),
              unselectedLabelTextStyle: TextStyle(color: isDark ? Colors.white.withOpacity(0.4) : AppTheme.lightSubtext, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1), 
              indicatorColor: isDark ? AppTheme.gold : const Color(0x257A5522),
              destinations: const [
                NavigationRailDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long, color: AppTheme.charcoal), label: Text('ORDRAR')),
                NavigationRailDestination(icon: Icon(Icons.history_outlined), selectedIcon: Icon(Icons.history, color: AppTheme.charcoal), label: Text('HISTORIK')),
                NavigationRailDestination(icon: Icon(Icons.bar_chart_outlined), selectedIcon: Icon(Icons.add_chart_rounded, color: AppTheme.charcoal), label: Text('STATS')),
                NavigationRailDestination(icon: Icon(Icons.restaurant_menu_outlined), selectedIcon: Icon(Icons.restaurant_menu, color: AppTheme.charcoal), label: Text('MENY')),
                NavigationRailDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings, color: AppTheme.charcoal), label: Text('INST.')),
              ],
            ),
            Container(width: 1.5, color: isDark ? Colors.white.withOpacity(0.06) : Colors.black.withOpacity(0.06)),
            Expanded(child: IndexedStack(index: _currentIndex, children: _pages)),
          ]),
      );
    }

    return Scaffold(
      body: IndexedStack(index: _currentIndex, children: _pages),
      bottomNavigationBar: Container(
        decoration: BoxDecoration(color: bgColor, border: Border(top: BorderSide(color: isDark ? Colors.white.withOpacity(0.06) : Colors.black.withOpacity(0.06), width: 1.5))),
        child: SafeArea(
          child: Padding(padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 10),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildNavItem(0, Icons.receipt_long_outlined, Icons.receipt_long, 'ORDRAR', isDark),
                _buildNavItem(1, Icons.history_outlined, Icons.history, 'HIST.', isDark),
                _buildNavItem(2, Icons.bar_chart_outlined, Icons.add_chart_rounded, 'STATS', isDark),
                _buildNavItem(3, Icons.restaurant_menu_outlined, Icons.restaurant_menu, 'MENY', isDark),
                _buildNavItem(4, Icons.settings_outlined, Icons.settings, 'INST.', isDark),
              ]),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(int index, IconData icon, IconData activeIcon, String label, bool isDark) {
    final isActive = _currentIndex == index;
    final activeColor = isDark ? AppTheme.gold : AppTheme.lightGold;
    final inactiveColor = isDark ? Colors.white.withOpacity(0.4) : AppTheme.lightSubtext;
    return GestureDetector(
      onTap: () => setState(() => _currentIndex = index),
      behavior: HitTestBehavior.opaque,
      child: Padding(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(isActive ? activeIcon : icon, color: isActive ? activeColor : inactiveColor, size: 24),
            const SizedBox(height: 5),
            Text(label, style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, letterSpacing: 1, color: isActive ? activeColor : inactiveColor)),
          ]),
      ),
    );
  }
}
