import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/format.dart';
import '../core/theme.dart';
import '../models/models.dart';
import '../providers/session_provider.dart';
import '../widgets/app_ui.dart';
import '../widgets/courier_ui.dart';
import 'delivery_screen.dart';

/// Detaljvy för ett tillgängligt uppdrag innan man accepterar.
class JobDetailScreen extends StatefulWidget {
  final String jobId;
  const JobDetailScreen({super.key, required this.jobId});

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  Job? _job;
  bool _loading = true;
  bool _accepting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final job = await context.read<SessionProvider>().jobDetail(widget.jobId);
    if (!mounted) return;
    setState(() {
      _job = job;
      _loading = false;
    });
  }

  Future<void> _accept() async {
    setState(() => _accepting = true);
    final session = context.read<SessionProvider>();
    final navigator = Navigator.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final result = await session.acceptJob(widget.jobId);
    if (!mounted) return;
    setState(() => _accepting = false);
    if (result.error != null) {
      messenger.showSnackBar(SnackBar(content: Text(result.error!)));
      navigator.pop();
      return;
    }
    // Använd den auktoritativa leveransen från accept-svaret.
    navigator.pop();
    if (result.delivery != null) {
      navigator.push(MaterialPageRoute(
        builder: (_) => DeliveryScreen(deliveryId: result.delivery!.id),
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accent =
        AppTheme.isDark(context) ? AppTheme.ember : AppTheme.emberDeep;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: _loading
              ? const Center(child: CircularProgressIndicator())
              : _job == null
                  ? _NotAvailable(onBack: () => Navigator.pop(context))
                  : Column(
                      children: [
                        _Header(job: _job!),
                        Expanded(
                          child: ListView(
                            padding: const EdgeInsets.fromLTRB(20, 4, 20, 24),
                            children: [
                              // Payout-hero
                              AppPanel(
                                child: Row(
                                  children: [
                                    Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      children: [
                                        const Eyebrow('Ersättning'),
                                        const SizedBox(height: 6),
                                        Text(
                                          kr(_job!.payout),
                                          style: theme.textTheme.displaySmall
                                              ?.copyWith(color: accent),
                                        ),
                                        if (_job!.tip > 0) ...[
                                          const SizedBox(height: 2),
                                          Text('inkl. ${kr(_job!.tip)} dricks',
                                              style: theme.textTheme.bodySmall),
                                        ],
                                      ],
                                    ),
                                    const Spacer(),
                                    _Stat(
                                        icon: Icons.straighten_rounded,
                                        value: km(_job!.distanceKm),
                                        label: 'Sträcka'),
                                    const SizedBox(width: 18),
                                    _Stat(
                                        icon: Icons.schedule_rounded,
                                        value: minutes(_job!.etaMin),
                                        label: 'Restid'),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              AppPanel(
                                child: Column(
                                  children: [
                                    AddressRow(
                                      icon: Icons.storefront_rounded,
                                      iconColor: accent,
                                      title: _job!.restaurantName,
                                      address: _job!.pickupAddress,
                                    ),
                                    const Padding(
                                      padding:
                                          EdgeInsets.symmetric(vertical: 14),
                                      child: _DottedConnector(),
                                    ),
                                    AddressRow(
                                      icon: Icons.flag_rounded,
                                      iconColor: AppTheme.info,
                                      title: _job!.dropoffName,
                                      address: _job!.dropoffAddress,
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 16),
                              AppSectionHeader(
                                  eyebrow: 'Beställning',
                                  title: '${_job!.itemCount} artiklar'),
                              const SizedBox(height: 10),
                              AppPanel(
                                child: Column(
                                  children: [
                                    for (final item in _job!.items)
                                      Padding(
                                        padding: const EdgeInsets.symmetric(
                                            vertical: 5),
                                        child: Row(
                                          children: [
                                            Text('${item.qty}×',
                                                style: theme
                                                    .textTheme.titleMedium
                                                    ?.copyWith(color: accent)),
                                            const SizedBox(width: 10),
                                            Expanded(
                                                child: Text(item.name,
                                                    style: theme
                                                        .textTheme.bodyLarge)),
                                          ],
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                        // Accept-bar
                        Container(
                          padding: EdgeInsets.fromLTRB(
                              20, 12, 20, MediaQuery.of(context).padding.bottom + 12),
                          decoration: BoxDecoration(
                            color: AppTheme.panelColor(context),
                            border: Border(
                              top: BorderSide(
                                  color: AppTheme.borderColor(context)),
                            ),
                          ),
                          child: EmberButton(
                            label: 'Acceptera uppdrag',
                            icon: Icons.check_rounded,
                            busy: _accepting,
                            onPressed: _accepting ? null : _accept,
                          ),
                        ),
                      ],
                    ),
        ),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  final Job job;
  const _Header({required this.job});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
      child: Row(
        children: [
          CircleIconButton(
            icon: Icons.arrow_back_rounded,
            onTap: () => Navigator.pop(context),
          ),
          const SizedBox(width: 12),
          Text('#${job.orderNumber}',
              style: Theme.of(context).textTheme.titleLarge),
          const Spacer(),
          if (job.expiresAt > 0) CountdownPill(expiresAt: job.expiresAt),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final IconData icon;
  final String value;
  final String label;
  const _Stat({required this.icon, required this.value, required this.label});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Icon(icon, size: 16, color: AppTheme.mutedColor(context)),
        const SizedBox(height: 4),
        Text(value, style: theme.textTheme.titleMedium),
        Text(label, style: theme.textTheme.bodySmall),
      ],
    );
  }
}

class _DottedConnector extends StatelessWidget {
  const _DottedConnector();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const SizedBox(width: 19),
        Column(
          children: List.generate(
            3,
            (_) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 1.5),
              child: Container(
                width: 2,
                height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.mutedColor(context).withOpacity(0.4),
                  borderRadius: BorderRadius.circular(1),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _NotAvailable extends StatelessWidget {
  final VoidCallback onBack;
  const _NotAvailable({required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const AppEmptyState(
            icon: Icons.search_off_rounded,
            title: 'Uppdraget är borta',
            subtitle: 'Ett annat bud hann före, eller så gick uppdraget ut.',
          ),
          const SizedBox(height: 16),
          GhostButton(
              label: 'Tillbaka',
              icon: Icons.arrow_back_rounded,
              onPressed: onBack),
        ],
      ),
    );
  }
}
