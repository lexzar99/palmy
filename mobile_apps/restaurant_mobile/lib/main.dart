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
import 'screens/pairing_screen.dart';
import 'screens/locked_screen.dart';
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
  // Device-session: 401 → tyst refresh via terminal-sessionen (ingen utloggning).
  ApiClient.onRefreshToken = authProvider.refreshTerminalSession;
  await authProvider.bootstrapTerminal();

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
              title: 'Delivera Business v$version',
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
                child: _rootForStatus(auth),
              ),
            );
          },
        );
      },
    );
  }

  Widget _rootForStatus(AuthProvider auth) {
    switch (auth.terminalStatus) {
      case TerminalStatus.revoked:
        return const LockedScreen(key: ValueKey('locked-screen'));
      case TerminalStatus.booting:
        return const _BootSplash(key: ValueKey('boot-splash'));
      case TerminalStatus.needsPairing:
        return const PairingScreen(key: ValueKey('pairing-screen'));
      case TerminalStatus.paired:
        return auth.isAuthenticated
            ? MainShell(key: mainShellKey)
            : const PairingScreen(key: ValueKey('pairing-screen'));
    }
  }
}

/// Enkel laddnings-splash medan device-sessionen återupptas vid app-start.
class _BootSplash extends StatelessWidget {
  const _BootSplash({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: Center(
          child: CircularProgressIndicator(color: AppTheme.ember),
        ),
      ),
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

class _MainShellState extends State<MainShell>
    with WidgetsBindingObserver, SingleTickerProviderStateMixin {
  int _currentIndex = 0;
  Timer? _sleepTimer;
  bool _sleeping = false;
  // Mjuk fade + lätt upp-glid när man byter flik (IndexedStack behåller state).
  late final AnimationController _tabAnim;

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
    WidgetsBinding.instance.addObserver(this);
    _tabAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
      value: 1,
    );
    WakelockPlus.enable();
    AppForegroundService.init();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final auth = Provider.of<AuthProvider>(context, listen: false);
      final orders = Provider.of<OrderProvider>(context, listen: false);
      orders.restorePauseState();
      // Admin revoke/delete → lås/pairing direkt via socket-signalen.
      orders.onDeviceSessionChanged =
          (data) => auth.handleDeviceSessionChanged(data['deviceId'] as String?);
      if (auth.isAuthenticated && auth.user?['restaurantId'] != null) {
        orders.initSocket(auth.user!['restaurantId']);
        AppForegroundService.start();
      }
      _resetSleepTimer();
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    WakelockPlus.disable();
    _sleepTimer?.cancel();
    _tabAnim.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // När appen återvänder till förgrunden: om-validera device-sessionen så att
    // en revoke/delete som skedde medan appen var i bakgrunden (då socket-
    // eventet kan ha missats) fångas direkt → låsskärm/pairing.
    if (state == AppLifecycleState.resumed && mounted) {
      Provider.of<AuthProvider>(context, listen: false).revalidateSession();
    }
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
    _tabAnim.forward(from: 0); // spela fade+glid-in för den nya fliken
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
                      bottom: 10,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        child: _FloatingPillNav(
                          destinations: _destinations,
                          currentIndex: _currentIndex,
                          onSelect: _selectTab,
                        ),
                      ),
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
          // Connection-lost: röd skärm överst (även ovanför viloläget). Sound-
          // logiken sköts i OrderProvider (endast under öppettider).
          if (orderProvider.showDisconnectOverlay)
            Positioned.fill(
              child: _DisconnectOverlay(
                soundActive: orderProvider.disconnectSoundActive,
                onTap: orderProvider.acknowledgeDisconnect,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildViewport() {
    return AnimatedBuilder(
      animation: _tabAnim,
      builder: (context, child) {
        final t = Curves.easeOutCubic.transform(_tabAnim.value);
        return Opacity(
          opacity: 0.35 + 0.65 * t,
          child: Transform.translate(
            offset: Offset(0, (1 - t) * 14),
            child: child,
          ),
        );
      },
      child: IndexedStack(
        index: _currentIndex,
        children: _pages,
      ),
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
                'D',
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

/// Fast Android-nav med varm amber-indikator.
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
    final activeColor = isDark ? Colors.white : AppTheme.ink;
    final bg = isDark ? AppTheme.steel : Colors.white;

    // Flat bar — ingen blur/gradient. Vald flik får guld-highlight.
    return Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isDark
                  ? Colors.white.withOpacity(0.08)
                  : AppTheme.ink.withOpacity(0.12),
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(isDark ? 0.30 : 0.10),
                blurRadius: 14,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.max,
            children: List.generate(destinations.length, (i) {
              final dest = destinations[i];
              final selected = i == currentIndex;
              final item = _NavPillItem(
                icon: selected ? dest.activeIcon : dest.icon,
                label: dest.label,
                selected: selected,
                activeColor: activeColor,
                onTap: () => onSelect(i),
              );
              // Bara den valda fliken expanderar och visar sin etikett; övriga
              // krymper till ren ikon-storlek. Det ger den valda etiketten
              // gott om plats istället för att tvinga in långa ord som
              // "Inställningar" i en fjärdedels bredd (där de svämmade över).
              return selected ? Expanded(child: item) : item;
            }),
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
    // Svartvit nav: vald flik = solid pill, ikon/text i kontrastfärg.
    final selFg = isDark ? AppTheme.ink : Colors.white;
    final iconColor = selected
        ? selFg
        : (isDark ? Colors.white.withOpacity(0.6) : AppTheme.mutedInk);
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          curve: Curves.easeOutCubic,
          padding: EdgeInsets.symmetric(
            horizontal: selected ? 14 : 11,
            vertical: 10,
          ),
          decoration: BoxDecoration(
            color: selected ? activeColor : Colors.transparent,
            borderRadius: BorderRadius.circular(12),
          ),
          // Vald flik ligger i en Expanded → max + Flexible-etikett som
          // ellipsar inom pillen. Övriga är ikon-only och min-breda, så de
          // aldrig får en obegränsad Flexible (skulle krascha layouten).
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: selected ? MainAxisSize.max : MainAxisSize.min,
            children: [
              Icon(icon, size: 21, color: iconColor),
              if (selected)
                Flexible(
                  child: Padding(
                    padding: const EdgeInsets.only(left: 8),
                    child: Text(
                      label,
                      maxLines: 1,
                      softWrap: false,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: selFg,
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0,
                      ),
                    ),
                  ),
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

/// Röd helskärm vid tappad anslutning. Lugn, pulserande wifi-ikon. När en signal
/// är aktiv (öppettid) visas "Tryck för att tysta" — tryck → tystar signalen och
/// döljer skärmen tills re-alert. När stängt visas den passivt utan ljud.
class _DisconnectOverlay extends StatefulWidget {
  final bool soundActive;
  final VoidCallback onTap;
  const _DisconnectOverlay({required this.soundActive, required this.onTap});

  @override
  State<_DisconnectOverlay> createState() => _DisconnectOverlayState();
}

class _DisconnectOverlayState extends State<_DisconnectOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const red = Color(0xFFB3261E);
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _pulse,
        builder: (context, _) {
          final t = Curves.easeInOut.transform(_pulse.value);
          return Container(
            color: Color.lerp(red, const Color(0xFF8C1D16), t),
            child: SafeArea(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Opacity(
                      opacity: 0.55 + 0.45 * t,
                      child: const Icon(Icons.wifi_off_rounded,
                          size: 88, color: Colors.white),
                    ),
                    const SizedBox(height: 28),
                    const Text(
                      'Ingen anslutning',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 10),
                    const Padding(
                      padding: EdgeInsets.symmetric(horizontal: 40),
                      child: Text(
                        'Plattan har tappat internet. Ordrar kan missas tills den är online igen.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: Colors.white70,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          height: 1.4,
                        ),
                      ),
                    ),
                    const SizedBox(height: 32),
                    if (widget.soundActive)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 18, vertical: 11),
                        decoration: BoxDecoration(
                          color: Colors.white.withOpacity(0.16),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(
                              color: Colors.white.withOpacity(0.4), width: 1),
                        ),
                        child: const Text(
                          'Tryck för att tysta',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.3,
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
    );
  }
}
