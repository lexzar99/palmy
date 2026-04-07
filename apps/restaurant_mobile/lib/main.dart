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

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final authProvider = AuthProvider();
  await authProvider.tryAutoLogin();

  runApp(
    MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: authProvider),
        ChangeNotifierProvider(create: (_) => OrderProvider()),
      ],
      child: const MatGoBusinessApp(),
    ),
  );
}

class MatGoBusinessApp extends StatelessWidget {
  const MatGoBusinessApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'MatGo Business v1.15',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.darkTheme,
      home: Consumer<AuthProvider>(
        builder: (context, auth, _) {
          if (auth.isAuthenticated) return const MainShell();
          return const LoginScreen();
        },
      ),
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
  Widget build(BuildContext context) {
    final isTablet = MediaQuery.of(context).size.shortestSide >= 600;

    if (isTablet) {
      return Scaffold(
        body: Row(children: [
            NavigationRail(
              backgroundColor: AppTheme.charcoal,
              selectedIndex: _currentIndex,
              onDestinationSelected: (i) => setState(() => _currentIndex = i),
              labelType: NavigationRailLabelType.all,
              leading: Padding(padding: const EdgeInsets.symmetric(vertical: 20), child: Container(width: 45, height: 45, decoration: BoxDecoration(color: AppTheme.gold, borderRadius: BorderRadius.circular(14), boxShadow: [BoxShadow(color: AppTheme.gold.withOpacity(0.1), blurRadius: 10)]), child: const Center(child: Text('M', style: TextStyle(color: AppTheme.charcoal, fontSize: 24, fontWeight: FontWeight.w900))))),
              selectedIconTheme: const IconThemeData(color: AppTheme.gold, size: 28),
              unselectedIconTheme: IconThemeData(color: Colors.white.withOpacity(0.2), size: 24),
              selectedLabelTextStyle: const TextStyle(color: AppTheme.gold, fontSize: 9, fontWeight: FontWeight.w900, letterSpacing: 1),
              unselectedLabelTextStyle: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 8, fontWeight: FontWeight.w900, letterSpacing: 1),
              destinations: const [
                NavigationRailDestination(icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: Text('ORDRAR')),
                NavigationRailDestination(icon: Icon(Icons.history_outlined), selectedIcon: Icon(Icons.history), label: Text('HISTORIK')),
                NavigationRailDestination(icon: Icon(Icons.bar_chart_outlined), selectedIcon: Icon(Icons.add_chart_rounded), label: Text('STATS')),
                NavigationRailDestination(icon: Icon(Icons.restaurant_menu_outlined), selectedIcon: Icon(Icons.restaurant_menu), label: Text('MENY')),
                NavigationRailDestination(icon: Icon(Icons.settings_outlined), selectedIcon: Icon(Icons.settings), label: Text('INST.')),
              ],
            ),
            Container(width: 1.5, color: Colors.white.withOpacity(0.06)),
            Expanded(child: _pages[_currentIndex]),
          ]),
      );
    }

    return Scaffold(
      body: _pages[_currentIndex],
      bottomNavigationBar: Container(
        decoration: BoxDecoration(color: AppTheme.charcoal, border: Border(top: BorderSide(color: Colors.white.withOpacity(0.06), width: 1.5))),
        child: SafeArea(
          child: Padding(padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 10),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildNavItem(0, Icons.receipt_long_outlined, Icons.receipt_long, 'ORDRAR'),
                _buildNavItem(1, Icons.history_outlined, Icons.history, 'HIST.'),
                _buildNavItem(2, Icons.bar_chart_outlined, Icons.add_chart_rounded, 'INSIGHTS'),
                _buildNavItem(3, Icons.restaurant_menu_outlined, Icons.restaurant_menu, 'MENY'),
                _buildNavItem(4, Icons.settings_outlined, Icons.settings, 'INST.'),
              ]),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(int index, IconData icon, IconData activeIcon, String label) {
    final isActive = _currentIndex == index;
    return GestureDetector(
      onTap: () => setState(() => _currentIndex = index),
      behavior: HitTestBehavior.opaque,
      child: Padding(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(isActive ? activeIcon : icon, color: isActive ? AppTheme.gold : Colors.white.withOpacity(0.25), size: 24),
            const SizedBox(height: 5),
            Text(label, style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, letterSpacing: 1, color: isActive ? AppTheme.gold : Colors.white.withOpacity(0.25))),
          ]),
      ),
    );
  }
}
