import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/api_client.dart';
import '../core/format.dart';
import '../core/models_api.dart';
import '../core/push_service.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/auth_provider.dart';
import '../providers/session_provider.dart';
import '../providers/theme_provider.dart';
import '../widgets/app_ui.dart';
import 'delivery_detail_screen.dart';
import '../widgets/courier_ui.dart';

/// Konto: profil, dagens/historikens intjäning, tema och utloggning.
class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  String _version = '';
  // Vald period för intjäning. Null = default (senaste 7 dagarna).
  DateTimeRange? _period;

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform().then((info) {
      if (mounted) {
        setState(() => _version = '${info.version}+${info.buildNumber}');
      }
    });
  }

  /// Vald period, eller senaste 7 dagarna som default.
  DateTimeRange get _effectiveRange {
    if (_period != null) return _period!;
    final now = DateTime.now();
    final end = DateTime(now.year, now.month, now.day);
    return DateTimeRange(start: end.subtract(const Duration(days: 6)), end: end);
  }

  Future<void> _pickPeriod() async {
    final now = DateTime.now();
    final picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year, now.month, now.day),
      initialDateRange: _effectiveRange,
    );
    if (picked != null && mounted) setState(() => _period = picked);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final courier = context.watch<AuthProvider>().courier;
    final session = context.watch<SessionProvider>();
    final accent =
        AppTheme.isDark(context) ? AppTheme.ember : AppTheme.emberDeep;

    final range = _effectiveRange;
    final periodStart =
        DateTime(range.start.year, range.start.month, range.start.day);
    final periodEndEx = DateTime(range.end.year, range.end.month, range.end.day)
        .add(const Duration(days: 1));
    final period = session.statsBetween(periodStart, periodEndEx);
    final yesterday = session.statsYesterday;
    final today = session.statsToday;

    return RefreshIndicator(
      onRefresh: () => context.read<SessionProvider>().refreshHistory(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 120),
        children: [
          const Eyebrow('Konto'),
          const SizedBox(height: 6),
          Text('Profil', style: theme.textTheme.displaySmall),
          const SizedBox(height: 18),
          // Profilkort
          AppPanel(
            child: Row(
              children: [
                Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                    color: AppTheme.faintColor(context),
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: AppTheme.borderColor(context)),
                  ),
                  child: Center(
                    child: Text(
                      courier?.initials ?? '?',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(courier?.name ?? '—',
                          style: theme.textTheme.titleLarge),
                      const SizedBox(height: 2),
                      Text(courier?.email ?? '',
                          style: theme.textTheme.bodyMedium),
                      const SizedBox(height: 8),
                      Row(
                        children: [
                          AppPill(
                            label: courier?.vehicle.label ?? '—',
                            color: AppTheme.mutedColor(context),
                            icon: courier?.vehicle == VehicleType.car
                                ? Icons.directions_car_rounded
                                : Icons.pedal_bike_rounded,
                          ),
                          const SizedBox(width: 8),
                          AppPill(
                            label: courier?.city ?? '—',
                            color: AppTheme.mutedColor(context),
                            icon: Icons.place_outlined,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          // Intjäning — igår, idag och en vald period
          Row(
            children: [
              Expanded(
                child: AppMetricCard(
                  eyebrow: 'Igår',
                  value: kr(yesterday.earned),
                  label: '${yesterday.count} leveranser',
                  accent: AppTheme.mutedColor(context),
                  icon: Icons.history_rounded,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: AppMetricCard(
                  eyebrow: 'Idag',
                  value: kr(today.earned),
                  label: '${today.count} leveranser',
                  accent: accent,
                  icon: Icons.today_rounded,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          // Period — kuriren väljer datumintervall själv
          InkWell(
            onTap: _pickPeriod,
            borderRadius: BorderRadius.circular(20),
            child: AppPanel(
              child: Row(
                children: [
                  Container(
                    width: 46,
                    height: 46,
                    decoration: BoxDecoration(
                      color: AppTheme.faintColor(context),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppTheme.borderColor(context)),
                    ),
                    child: Icon(Icons.insights_rounded,
                        color: AppTheme.mutedColor(context), size: 22),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text('PERIOD',
                                style: theme.textTheme.labelMedium?.copyWith(
                                  color: AppTheme.mutedColor(context),
                                )),
                            const SizedBox(width: 8),
                            Text(
                              dateRangeLabel(range.start, range.end),
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: AppTheme.mutedColor(context),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(kr(period.earned),
                            style: theme.textTheme.headlineSmall),
                        const SizedBox(height: 2),
                        Text('${period.count} leveranser',
                            style: theme.textTheme.bodyMedium),
                      ],
                    ),
                  ),
                  Icon(Icons.tune_rounded,
                      size: 20, color: AppTheme.mutedColor(context)),
                ],
              ),
            ),
          ),
          const SizedBox(height: 24),
          // Historik
          const AppSectionHeader(
              eyebrow: 'Historik', title: 'Senaste leveranser'),
          const SizedBox(height: 12),
          if (session.history.isEmpty)
            const AppEmptyState(
              icon: Icons.receipt_long_outlined,
              title: 'Inga leveranser än',
              subtitle: 'Dina slutförda leveranser visas här.',
            )
          else
            ..._groupedHistory(session.history),
          const SizedBox(height: 24),
          // Push-diagnostik: visa status + testa direkt.
          const AppSectionHeader(eyebrow: 'Notiser', title: 'Push-status'),
          const SizedBox(height: 12),
          const _PushDiagnosticCard(),
          const SizedBox(height: 24),
          // Tema
          const AppSectionHeader(eyebrow: 'Utseende', title: 'Tema'),
          const SizedBox(height: 12),
          const _ThemeSelector(),
          const SizedBox(height: 24),
          GhostButton(
            label: 'Logga ut',
            icon: Icons.logout_rounded,
            color: AppTheme.danger,
            onPressed: () => _confirmLogout(context),
          ),
          const SizedBox(height: 12),
          // Apple Guideline 5.1.1(v): kontot måste gå att ta bort. Konton skapas
          // av Delivera-admin, så borttagning sker via en begäran till supporten.
          Center(
            child: TextButton(
              onPressed: () => _requestDeletion(courier?.email),
              child: Text(
                'Begär borttagning av konto',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppTheme.mutedColor(context),
                  decoration: TextDecoration.underline,
                ),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text(
              'Delivera Courier${_version.isEmpty ? '' : '  ·  v$_version'}',
              style: theme.textTheme.bodySmall,
            ),
          ),
        ],
      ),
    );
  }

  List<Widget> _groupedHistory(List<HistoryOrder> history) {
    final widgets = <Widget>[];
    String? currentDay;
    for (final h in history) {
      final label = dayLabel(h.deliveredAt);
      if (label != currentDay) {
        currentDay = label;
        widgets.add(Padding(
          padding: const EdgeInsets.only(top: 8, bottom: 6),
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: AppTheme.mutedColor(context),
                  letterSpacing: 0.8,
                ),
          ),
        ));
      }
      widgets.add(_HistoryRow(order: h));
    }
    return widgets;
  }

  Future<void> _requestDeletion(String? email) async {
    final subject = Uri.encodeComponent('Begäran om borttagning av kurirkonto');
    final body = Uri.encodeComponent(
        'Jag vill att mitt Delivera-kurirkonto${email != null ? ' ($email)' : ''} och tillhörande data tas bort.');
    final uri = Uri.parse('mailto:support@delivera.se?subject=$subject&body=$body');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  Future<void> _confirmLogout(BuildContext context) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Logga ut?'),
        content: const Text(
            'Du behöver ditt Delivera-konto för att logga in igen.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Avbryt')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Logga ut',
                style: TextStyle(color: AppTheme.danger)),
          ),
        ],
      ),
    );
    if (yes == true && context.mounted) {
      await context.read<SessionProvider>().goOffline();
      if (context.mounted) await context.read<AuthProvider>().logout();
    }
  }
}

class _HistoryRow extends StatelessWidget {
  final HistoryOrder order;
  const _HistoryRow({required this.order});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final meta = [
      timeOfDay(order.deliveredAt),
      km(order.distanceKm),
      if (order.totalMin != null) minutes(order.totalMin!),
    ].join('  ·  ');
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => DeliveryDetailScreen(deliveryId: order.id),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('#${order.orderNumber} · ${order.restaurantName}',
                      style: theme.textTheme.titleSmall),
                  const SizedBox(height: 2),
                  Text(meta, style: theme.textTheme.bodySmall),
                ],
              ),
            ),
            Text(
              kr(order.payout),
              style: theme.textTheme.titleMedium?.copyWith(
                color: AppTheme.isDark(context)
                    ? AppTheme.ember
                    : AppTheme.emberDeep,
              ),
            ),
            const SizedBox(width: 6),
            Icon(Icons.chevron_right_rounded,
                size: 20, color: AppTheme.mutedColor(context)),
          ],
        ),
      ),
    );
  }
}

class _ThemeSelector extends StatelessWidget {
  const _ThemeSelector();

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<ThemeProvider>();
    const options = ThemePreference.values;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: AppTheme.faintColor(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Row(
        children: options.map((opt) {
          final selected = provider.themePreference == opt;
          final fg = AppTheme.isDark(context) ? AppTheme.ink : Colors.white;
          final activeColor =
              AppTheme.isDark(context) ? Colors.white : AppTheme.ink;
          return Expanded(
            child: GestureDetector(
              onTap: () => context.read<ThemeProvider>().setThemePreference(opt),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.symmetric(vertical: 11),
                decoration: BoxDecoration(
                  color: selected ? activeColor : Colors.transparent,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  _shortLabel(opt),
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: selected ? fg : AppTheme.mutedColor(context),
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  String _shortLabel(ThemePreference p) {
    switch (p) {
      case ThemePreference.light:
        return 'Ljust';
      case ThemePreference.midnight:
        return 'Mörkt';
      case ThemePreference.system:
        return 'System';
    }
  }
}

/// Push-diagnostik: visar om notiser fungerar (behörighet + registrerad token)
/// och låter budet skicka en testnotis till sig själv — så problem blir synliga
/// och direkt testbara, oberoende av order-flödet.
class _PushDiagnosticCard extends StatefulWidget {
  const _PushDiagnosticCard();

  @override
  State<_PushDiagnosticCard> createState() => _PushDiagnosticCardState();
}

class _PushDiagnosticCardState extends State<_PushDiagnosticCard> {
  final CourierApi _api = CourierApi(ApiClient.instance);
  bool _loading = true;
  bool _busy = false;
  bool _hasToken = false;
  bool _fcmConfigured = false;

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() => _loading = true);
    try {
      final s = await _api.pushStatus();
      if (!mounted) return;
      setState(() {
        _hasToken = s['hasToken'] == true;
        _fcmConfigured = s['fcmConfigured'] == true;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _reregister() async {
    setState(() => _busy = true);
    await PushService.instance.forceRegister(_api);
    // Token kommer asynkront (APNs) — vänta lite och hämta status igen.
    await Future.delayed(const Duration(seconds: 3));
    await _refresh();
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _test() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final r = await _api.pushTest();
      final hasToken = r['hasToken'] == true;
      final sent = (r['sent'] as num?)?.toInt() ?? 0;
      final stage = r['stage']?.toString() ?? '';
      final status = r['status']?.toString();
      final detail = r['detail']?.toString();
      if (!mounted) return;
      String msg;
      if (!hasToken) {
        msg = 'Ingen token registrerad än — tryck "Registrera token igen".';
      } else if (sent > 0) {
        msg = 'Testnotis skickad — du bör se den om en sekund.';
      } else {
        // Visa exakt var det fastnade så det går att åtgärda.
        msg = 'Sändning misslyckades (steg: $stage'
            '${status != null && status != 'null' ? ' $status' : ''})'
            '${detail != null && detail != 'null' ? ': $detail' : ''}';
      }
      messenger.showSnackBar(SnackBar(content: Text(msg), duration: const Duration(seconds: 8)));
    } catch (_) {
      if (mounted) messenger.showSnackBar(const SnackBar(content: Text('Kunde inte skicka testnotis.')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ps = PushService.instance;
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _row('Firebase initierat', ps.firebaseOk),
          const SizedBox(height: 8),
          _row('Notis-behörighet', ps.permissionGranted),
          const SizedBox(height: 8),
          _row('APNs-token (iOS)', ps.apnsOk),
          const SizedBox(height: 8),
          _row('FCM-token hämtad', ps.fcmOk),
          const SizedBox(height: 8),
          _row('Registrerad hos server', _hasToken, loading: _loading),
          const SizedBox(height: 8),
          _row('Server-FCM konfigurerad', _fcmConfigured, loading: _loading),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: GhostButton(
                  label: 'Registrera token igen',
                  icon: Icons.sync_rounded,
                  onPressed: _busy ? null : _reregister,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: GhostButton(
                  label: 'Skicka testnotis',
                  icon: Icons.notifications_active_rounded,
                  onPressed: _busy || !_hasToken ? null : _test,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _row(String label, bool ok, {bool loading = false}) {
    return Row(
      children: [
        if (loading)
          const SizedBox(
              width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
        else
          Icon(ok ? Icons.check_circle_rounded : Icons.cancel_rounded,
              size: 18, color: ok ? AppTheme.success : AppTheme.danger),
        const SizedBox(width: 10),
        Expanded(child: Text(label, style: Theme.of(context).textTheme.bodyMedium)),
        if (!loading)
          Text(ok ? 'OK' : 'Saknas',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: ok ? AppTheme.success : AppTheme.danger)),
      ],
    );
  }
}
