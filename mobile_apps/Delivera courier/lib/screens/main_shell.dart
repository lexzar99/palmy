import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../providers/session_provider.dart';
import '../widgets/app_ui.dart';
import 'account_screen.dart';
import 'active_list_screen.dart';
import 'jobs_screen.dart';
import 'session_start_screen.dart';

/// App-skal med 3 flikar: Uppdrag, Pågående, Konto. Flytande pill-nav (samma
/// språk som Delivera Business).
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  int _index = 0;
  late final AnimationController _tabAnim;
  late final SessionProvider _session;

  @override
  void initState() {
    super.initState();
    _tabAnim = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
      value: 1,
    );
    _session = context.read<SessionProvider>();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _session.bootstrap());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Pausa polling + GPS i bakgrunden, återuppta i förgrunden.
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden) {
      _session.handleAppPaused();
    } else if (state == AppLifecycleState.resumed) {
      _session.handleAppResumed();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _tabAnim.dispose();
    // OBS: sessionen rivs vid auth-övergången (AuthProvider.onLoggedOut →
    // session.reset()), INTE här — dispose fördröjs av AnimatedSwitcher.
    super.dispose();
  }

  void _select(int i) {
    if (i == _index) return;
    setState(() => _index = i);
    _tabAnim.forward(from: 0);
    if (i == 0) context.read<SessionProvider>().clearJobBadge();
  }

  static const _destinations = [
    _Dest('Uppdrag', Icons.bolt_outlined, Icons.bolt_rounded),
    _Dest('Pågående', Icons.local_shipping_outlined,
        Icons.local_shipping_rounded),
    _Dest('Konto', Icons.person_outline_rounded, Icons.person_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionProvider>();
    // Uppdrag-fliken: online → uppdragslistan, offline → gå-online-skärmen.
    final pages = [
      session.online ? const JobsScreen() : const SessionStartScreen(),
      const ActiveListScreen(),
      const AccountScreen(),
    ];

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Stack(
            children: [
              AnimatedBuilder(
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
                child: IndexedStack(index: _index, children: pages),
              ),
              Positioned(
                left: 0,
                right: 0,
                bottom: 10,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: _PillNav(
                    destinations: _destinations,
                    currentIndex: _index,
                    activeBadge: session.active.length,
                    jobBadge: session.newJobBadge,
                    onSelect: _select,
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

class _Dest {
  final String label;
  final IconData icon;
  final IconData activeIcon;
  const _Dest(this.label, this.icon, this.activeIcon);
}

class _PillNav extends StatelessWidget {
  final List<_Dest> destinations;
  final int currentIndex;
  final int activeBadge;
  final int jobBadge;
  final ValueChanged<int> onSelect;

  const _PillNav({
    required this.destinations,
    required this.currentIndex,
    required this.activeBadge,
    required this.jobBadge,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final activeColor = isDark ? Colors.white : AppTheme.ink;
    final bg = isDark ? AppTheme.steel : Colors.white;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 6),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isDark
              ? Colors.white.withOpacity(0.08)
              : AppTheme.ink.withOpacity(0.12),
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
        children: List.generate(destinations.length, (i) {
          final dest = destinations[i];
          final selected = i == currentIndex;
          final badge = i == 0 ? jobBadge : (i == 1 ? activeBadge : 0);
          final item = _NavItem(
            icon: selected ? dest.activeIcon : dest.icon,
            label: dest.label,
            selected: selected,
            activeColor: activeColor,
            badge: badge,
            onTap: () => onSelect(i),
          );
          return selected ? Expanded(child: item) : item;
        }),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final bool selected;
  final Color activeColor;
  final int badge;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon,
    required this.label,
    required this.selected,
    required this.activeColor,
    required this.badge,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
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
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: selected ? MainAxisSize.max : MainAxisSize.min,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  Icon(icon, size: 21, color: iconColor),
                  if (badge > 0)
                    Positioned(
                      right: -7,
                      top: -6,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        constraints:
                            const BoxConstraints(minWidth: 16, minHeight: 16),
                        decoration: BoxDecoration(
                          color: AppTheme.danger,
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '$badge',
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                            height: 1,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
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
