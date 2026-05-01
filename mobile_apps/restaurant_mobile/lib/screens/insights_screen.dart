import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/order_ui.dart';
import '../core/theme.dart';
import '../providers/order_provider.dart';

/// Narrow-phone optimised insights view. Three side-by-side metric tiles
/// at the top (always fit on a 320 dp screen), a small distribution card
/// below, then a compact comparison card.
class InsightsScreen extends StatelessWidget {
  const InsightsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Consumer<OrderProvider>(
        builder: (context, provider, _) {
          final todayOrders = provider.todayHistoryOrders;
          final yesterdayOrders = provider.yesterdayHistoryOrders;
          final deliveryCount =
              todayOrders.where((o) => o.type == 'DELIVERY').length;
          final pickupCount =
              todayOrders.where((o) => o.type == 'PICKUP').length;
          final scheduledCount =
              todayOrders.where((o) => o.scheduledFor != null).length;
          final avgToday = todayOrders.isEmpty
              ? 0
              : provider.todayTotal / todayOrders.length;
          final avgYesterday = yesterdayOrders.isEmpty
              ? 0
              : provider.yesterdayTotal / yesterdayOrders.length;
          final deliveryShare =
              todayOrders.isEmpty ? 0.0 : deliveryCount / todayOrders.length;
          final pickupShare =
              todayOrders.isEmpty ? 0.0 : pickupCount / todayOrders.length;

          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _Title(
                  eyebrow: 'STATISTIK',
                  title: 'Insikter',
                ),
                const SizedBox(height: 14),
                // Three compact metric tiles on a single row
                Row(
                  children: [
                    Expanded(
                      child: _MiniMetric(
                        eyebrow: 'OMSATTNING',
                        value: OrderUi.formatCurrency(provider.todayTotal),
                        sub: '${todayOrders.length} ordrar',
                        accent: AppTheme.gold,
                        icon: Icons.payments_rounded,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _MiniMetric(
                        eyebrow: 'SNITT',
                        value: OrderUi.formatCurrency(avgToday),
                        sub: 'per kvitto',
                        accent: AppTheme.info,
                        icon: Icons.stacked_line_chart_rounded,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _MiniMetric(
                        eyebrow: 'SCHEMA',
                        value: '$scheduledCount',
                        sub: 'förbeställda',
                        accent: AppTheme.success,
                        icon: Icons.schedule_rounded,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                // Distribution card (compact)
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: AppTheme.panelColor(context),
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: AppTheme.borderColor(context)),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Försäljningsmix',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 14),
                      _Bar(
                        label: 'Utkörning',
                        value: deliveryShare,
                        countLabel: '$deliveryCount st',
                        accent: AppTheme.info,
                      ),
                      const SizedBox(height: 10),
                      _Bar(
                        label: 'Avhämtning',
                        value: pickupShare,
                        countLabel: '$pickupCount st',
                        accent: AppTheme.success,
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                // Comparison row
                Row(
                  children: [
                    Expanded(
                      child: _CompareCard(
                        title: 'Idag',
                        value: OrderUi.formatCurrency(provider.todayTotal),
                        sub:
                            'Igår: ${OrderUi.formatCurrency(provider.yesterdayTotal)}',
                        accent: AppTheme.lavender,
                        icon: Icons.compare_arrows_rounded,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: _CompareCard(
                        title: 'Live-kö',
                        value:
                            '${provider.pendingOrders.length + provider.activeOrders.length} st',
                        sub:
                            '${provider.pendingOrders.length} nya · ${provider.activeOrders.length} aktiva',
                        accent: AppTheme.warning,
                        icon: Icons.local_dining_rounded,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  'Snittkvitto igår: ${OrderUi.formatCurrency(avgYesterday)}',
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Title extends StatelessWidget {
  final String eyebrow;
  final String title;
  const _Title({required this.eyebrow, required this.title});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          eyebrow,
          style: TextStyle(
            color: isDark ? AppTheme.goldAccent : AppTheme.lightGold,
            fontSize: 11,
            fontWeight: FontWeight.w900,
            letterSpacing: 1.6,
          ),
        ),
        const SizedBox(height: 4),
        Text(
          title,
          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                fontSize: 26,
                letterSpacing: -0.6,
              ),
        ),
      ],
    );
  }
}

class _MiniMetric extends StatelessWidget {
  final String eyebrow;
  final String value;
  final String sub;
  final Color accent;
  final IconData icon;

  const _MiniMetric({
    required this.eyebrow,
    required this.value,
    required this.sub,
    required this.accent,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 12),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withOpacity(0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: accent.withOpacity(0.16),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, color: accent, size: 16),
          ),
          const SizedBox(height: 8),
          Text(
            eyebrow,
            style: TextStyle(
              color: accent,
              fontSize: 9,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.0,
            ),
          ),
          const SizedBox(height: 2),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.4,
              ),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            sub,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: AppTheme.mutedColor(context),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bar extends StatelessWidget {
  final String label;
  final double value;
  final String countLabel;
  final Color accent;

  const _Bar({
    required this.label,
    required this.value,
    required this.countLabel,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Text(
              label,
              style: const TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
              ),
            ),
            const Spacer(),
            Text(
              '$countLabel · ${(value * 100).toStringAsFixed(0)}%',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: AppTheme.mutedColor(context),
              ),
            ),
          ],
        ),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(99),
          child: LinearProgressIndicator(
            value: value,
            minHeight: 8,
            color: accent,
            backgroundColor: AppTheme.faintColor(context),
          ),
        ),
      ],
    );
  }
}

class _CompareCard extends StatelessWidget {
  final String title;
  final String value;
  final String sub;
  final Color accent;
  final IconData icon;

  const _CompareCard({
    required this.title,
    required this.value,
    required this.sub,
    required this.accent,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: accent.withOpacity(0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: accent, size: 16),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              value,
              style: const TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w900,
                letterSpacing: -0.4,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            sub,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: AppTheme.mutedColor(context),
            ),
          ),
        ],
      ),
    );
  }
}
