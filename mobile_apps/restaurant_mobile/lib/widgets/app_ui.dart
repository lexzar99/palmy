import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Bakgrund som täcker hela appen. I nya stilen är det en ren neutral
/// gradient — inga decorative orbs som tidigare. Mer "admin v2"-känsla.
class AppBackdrop extends StatelessWidget {
  final Widget child;

  const AppBackdrop({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(gradient: AppTheme.shellGradient(context)),
      child: child,
    );
  }
}

/// Generisk panel/card med subtila borders och konsistent hörnradie.
/// Default 14px (matchar admin v2). Ingen backdrop-blur längre — den
/// gjorde appen tyngre att rendera utan att ge mervärde i nya stilen.
class AppPanel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;
  final Color? tint;
  final Gradient? gradient;
  final Color? color;
  final VoidCallback? onTap;

  const AppPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.radius = 14,
    this.tint,
    this.gradient,
    this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final panel = AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
      padding: padding,
      decoration: AppTheme.panelDecoration(
        context,
        tint: tint,
        radius: radius,
        gradient: gradient,
        color: color,
      ),
      child: child,
    );

    if (onTap == null) return panel;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(radius),
        child: panel,
      ),
    );
  }
}

/// Section-header: liten eyebrow + title. Subtilare än tidigare; eyebrow
/// är inte längre guld-färgad utan muted så title sticker ut.
class AppSectionHeader extends StatelessWidget {
  final String eyebrow;
  final String title;
  final String? subtitle;
  final Widget? trailing;

  const AppSectionHeader({
    super.key,
    required this.eyebrow,
    required this.title,
    this.subtitle,
    this.trailing,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (eyebrow.trim().isNotEmpty) ...[
                Text(
                  eyebrow.toUpperCase(),
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: AppTheme.mutedColor(context),
                    letterSpacing: 0.9,
                  ),
                ),
                const SizedBox(height: 4),
              ],
              Text(title, style: theme.textTheme.titleLarge),
              if (subtitle != null) ...[
                const SizedBox(height: 4),
                Text(subtitle!, style: theme.textTheme.bodyMedium),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: 16),
          trailing!,
        ],
      ],
    );
  }
}

/// Mindre pill/badge. Tighter padding, mindre rundad (8px), inte font-w900.
class AppPill extends StatelessWidget {
  final String label;
  final Color color;
  final IconData? icon;
  final bool filled;

  const AppPill({
    super.key,
    required this.label,
    required this.color,
    this.icon,
    this.filled = false,
  });

  @override
  Widget build(BuildContext context) {
    final textColor = filled
        ? (AppTheme.isDark(context) ? AppTheme.ink : Colors.white)
        : color;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: filled ? color : color.withOpacity(0.10),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(
          color: color.withOpacity(filled ? 0 : 0.20),
          width: 1,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: textColor),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: textColor,
              fontSize: 10.5,
              fontWeight: FontWeight.w600,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

/// Stor metric-card för dashboards. Värde i stor sans-serif, label under.
/// Inget tonat ikon-fält längre — bara värde + label, mer "premium dashboard".
class AppMetricCard extends StatelessWidget {
  final String eyebrow;
  final String value;
  final String label;
  final Color accent;
  final IconData icon;
  final String? caption;

  const AppMetricCard({
    super.key,
    required this.eyebrow,
    required this.value,
    required this.label,
    required this.accent,
    required this.icon,
    this.caption,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppPanel(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: accent, size: 18),
              const SizedBox(width: 8),
              Text(
                eyebrow.toUpperCase(),
                style: theme.textTheme.labelMedium?.copyWith(
                  color: AppTheme.mutedColor(context),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            value,
            style: theme.textTheme.displaySmall?.copyWith(
              fontSize: 32,
              fontWeight: FontWeight.w600,
              letterSpacing: -0.5,
              height: 1.05,
            ),
          ),
          const SizedBox(height: 6),
          Text(label, style: theme.textTheme.bodyMedium),
          if (caption != null) ...[
            const SizedBox(height: 4),
            Text(caption!, style: theme.textTheme.bodySmall),
          ],
        ],
      ),
    );
  }
}

/// Empty state med ikon + titel + valfri subtitle.
class AppEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;

  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppTheme.faintColor(context),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, size: 26, color: AppTheme.mutedColor(context)),
          ),
          const SizedBox(height: 16),
          Text(
            title,
            style: Theme.of(context).textTheme.titleMedium,
            textAlign: TextAlign.center,
          ),
          if (subtitle.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              subtitle,
              style: Theme.of(context).textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
          ],
        ],
      ),
    );
  }
}
