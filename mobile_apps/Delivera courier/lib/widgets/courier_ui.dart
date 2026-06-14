import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../core/format.dart';
import '../core/theme.dart';

/// Liten versal etikett ("eyebrow") för sektioner.
class Eyebrow extends StatelessWidget {
  final String text;
  const Eyebrow(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Text(
        text.toUpperCase(),
        style: Theme.of(context).textTheme.labelMedium?.copyWith(
              color: AppTheme.mutedColor(context),
              letterSpacing: 1.0,
            ),
      );
}

/// "Maten är klar för hämtning"-banner — diskret, grön. Visas på pågående-
/// kortet + i hämtningsfasen när restaurangen markerat ordern klar.
class ReadyForPickupBanner extends StatelessWidget {
  const ReadyForPickupBanner({super.key});

  @override
  Widget build(BuildContext context) {
    const color = AppTheme.success;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: const Row(
        children: [
          Icon(Icons.notifications_active_rounded, size: 17, color: color),
          SizedBox(width: 9),
          Expanded(
            child: Text(
              'Maten är klar för hämtning',
              style: TextStyle(
                  fontSize: 13.5, fontWeight: FontWeight.w800, color: color),
            ),
          ),
        ],
      ),
    );
  }
}

/// Rund ikon-knapp (bak/karta/ring) i appens platta stil.
class CircleIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final Color? tint;
  const CircleIconButton({super.key, required this.icon, this.onTap, this.tint});

  @override
  Widget build(BuildContext context) {
    final c = tint ?? AppTheme.mutedColor(context);
    return Material(
      color: AppTheme.faintColor(context),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(11),
          child: Icon(icon, size: 20, color: c),
        ),
      ),
    );
  }
}

/// Adressrad med pickup/dropoff-ikon, "öppna i kartor" och valfri ring-knapp.
class AddressRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String address;
  final String? phone;

  const AddressRow({
    super.key,
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.address,
    this.phone,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(
            color: iconColor.withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: iconColor, size: 20),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: theme.textTheme.titleMedium),
              const SizedBox(height: 2),
              Text(address, style: theme.textTheme.bodyMedium),
            ],
          ),
        ),
        const SizedBox(width: 8),
        CircleIconButton(
          icon: Icons.navigation_rounded,
          tint: AppTheme.info,
          onTap: () => MapsLauncher.open(address),
        ),
        if (phone != null && phone!.isNotEmpty) ...[
          const SizedBox(width: 8),
          CircleIconButton(
            icon: Icons.call_rounded,
            tint: AppTheme.success,
            onTap: () => MapsLauncher.call(phone!),
          ),
        ],
      ],
    );
  }
}

/// Öppnar kartor / ringer via systemets appar.
class MapsLauncher {
  static Future<void> open(String address) async {
    final q = Uri.encodeComponent(address);
    // Apple Maps på iOS, Google Maps annars — båda förstår denna URI.
    final uri = Uri.parse('https://maps.apple.com/?q=$q');
    final google = Uri.parse('https://www.google.com/maps/search/?api=1&query=$q');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else {
      await launchUrl(google, mode: LaunchMode.externalApplication);
    }
  }

  static Future<void> call(String phone) async {
    final uri = Uri.parse('tel:${phone.replaceAll(RegExp(r'[^0-9+]'), '')}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }
}

/// Nedräknings-pill som tickar varje sekund mot ett epoch-ms-utgångsvärde.
class CountdownPill extends StatefulWidget {
  final int expiresAt;
  const CountdownPill({super.key, required this.expiresAt});

  @override
  State<CountdownPill> createState() => _CountdownPillState();
}

class _CountdownPillState extends State<CountdownPill> {
  Timer? _t;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _t?.cancel();
    if (secondsLeft(widget.expiresAt) <= 0) return; // redan slut → ingen timer
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {});
      if (secondsLeft(widget.expiresAt) <= 0) {
        _t?.cancel();
        _t = null;
      }
    });
  }

  @override
  void didUpdateWidget(CountdownPill old) {
    super.didUpdateWidget(old);
    if (old.expiresAt != widget.expiresAt) _startTimer(); // ny deadline
  }

  @override
  void dispose() {
    _t?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.expiresAt <= 0) return const SizedBox.shrink();
    final left = secondsLeft(widget.expiresAt);
    final urgent = left <= 15;
    final color = urgent ? AppTheme.danger : AppTheme.warning;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.24)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.timer_outlined, size: 13, color: color),
          const SizedBox(width: 5),
          Text(
            '${left}s',
            style: TextStyle(
              color: color,
              fontSize: 11,
              fontWeight: FontWeight.w800,
              letterSpacing: 0.4,
            ),
          ),
        ],
      ),
    );
  }
}

/// Svep-för-att-bekräfta. Dra tummen hela vägen till höger → onConfirm.
class SwipeToConfirm extends StatefulWidget {
  final String label;
  final IconData icon;
  final Color color;
  final Future<void> Function() onConfirm;
  final bool enabled;

  const SwipeToConfirm({
    super.key,
    required this.label,
    required this.onConfirm,
    this.icon = Icons.chevron_right_rounded,
    this.color = AppTheme.success,
    this.enabled = true,
  });

  @override
  State<SwipeToConfirm> createState() => _SwipeToConfirmState();
}

class _SwipeToConfirmState extends State<SwipeToConfirm>
    with SingleTickerProviderStateMixin {
  // Gesture-ytan ligger på HELA spåret (statisk), inte på den rörliga tummen —
  // det var roten till glitchen. Tummen ritas ovanpå med IgnorePointer.
  late final AnimationController _snap;
  double _dx = 0; // tummens position i px (0.._maxDx)
  double _maxDx = 0;
  bool _busy = false;
  bool _confirmed = false;

  static const double _thumb = 56;
  static const double _pad = 4;
  static const double _height = 64;

  @override
  void initState() {
    super.initState();
    _snap = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 240),
    )..addListener(() {
        // Snap-animationen driver _dx mellan start- och målfraktion.
        setState(() => _dx = _snap.value * _maxDx);
      });
  }

  @override
  void didUpdateWidget(SwipeToConfirm old) {
    super.didUpdateWidget(old);
    // Aktionsbyte (ny label, t.ex. Hämtad → Levererad på samma återanvända
    // State) eller inaktiverad → snäpp HEM direkt, så tummen aldrig startar
    // nästa (mer destruktiva) aktion mitt i resan.
    if (old.label != widget.label || (!widget.enabled && old.enabled)) {
      _snap.stop();
      _confirmed = false;
      _snap.value = 0;
      if (mounted) setState(() => _dx = 0);
    }
  }

  @override
  void dispose() {
    _snap.dispose();
    super.dispose();
  }

  Future<void> _animateTo(double targetFraction, {Curve curve = Curves.easeOut}) {
    if (_maxDx <= 0) return Future.value();
    _snap.value = (_dx / _maxDx).clamp(0.0, 1.0);
    return _snap.animateTo(targetFraction.clamp(0.0, 1.0), curve: curve);
  }

  bool get _interactive => widget.enabled && !_busy && !_confirmed;

  void _onDragUpdate(DragUpdateDetails d) {
    if (!_interactive) return;
    _snap.stop();
    setState(() => _dx = (_dx + d.delta.dx).clamp(0.0, _maxDx));
  }

  Future<void> _onDragEnd(DragEndDetails _) async {
    if (!_interactive) return;
    if (_dx >= _maxDx * 0.85) {
      // Full → bekräfta. _confirmed hålls true tills tummen är hemma igen, så
      // ingen ny gest kan re-passera tröskeln och dubbel-avfyra.
      _confirmed = true;
      HapticFeedback.mediumImpact();
      setState(() => _busy = true);
      unawaited(_animateTo(1.0));
      try {
        await widget.onConfirm();
      } finally {
        if (mounted) {
          // Stoppa spinnern DIREKT när aktionen är klar — vänta inte på
          // hem-animationen (om skärmen revs ned mitt i den kunde spinnern
          // bli kvar och snurra). Tummen glider hem separat, och re-fire-låset
          // (_confirmed) hålls tills den är hemma.
          setState(() => _busy = false);
          await _animateTo(0.0, curve: Curves.easeInOut);
          if (mounted) setState(() => _confirmed = false);
        }
      }
    } else {
      _animateTo(0.0); // snäpp tillbaka
    }
  }

  @override
  Widget build(BuildContext context) {
    final fg = AppTheme.isDark(context) ? AppTheme.ink : Colors.white;
    return LayoutBuilder(
      builder: (context, c) {
        _maxDx = (c.maxWidth - _thumb - _pad * 2).clamp(0.0, double.infinity);
        final progress = _maxDx <= 0 ? 0.0 : (_dx / _maxDx).clamp(0.0, 1.0);
        return Opacity(
          opacity: widget.enabled ? 1 : 0.5,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onHorizontalDragUpdate: _onDragUpdate,
            onHorizontalDragEnd: _onDragEnd,
            child: Container(
              height: _height,
              decoration: BoxDecoration(
                color: widget.color.withOpacity(0.14),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: widget.color.withOpacity(0.30)),
              ),
              child: Stack(
                children: [
                  // Etikett tonas ut allteftersom man drar.
                  Center(
                    child: Opacity(
                      opacity: (1 - progress * 1.6).clamp(0.0, 1.0),
                      child: Padding(
                        padding: const EdgeInsets.only(left: 40),
                        child: Text(
                          widget.label,
                          style: TextStyle(
                            color: widget.color,
                            fontSize: 15,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 0.3,
                          ),
                        ),
                      ),
                    ),
                  ),
                  // Tummen — bara visuell (IgnorePointer), så gesten alltid
                  // träffar det statiska spåret nedanför.
                  Positioned(
                    left: _pad + _dx,
                    top: _pad,
                    child: IgnorePointer(
                      child: Container(
                        width: _thumb,
                        height: _height - _pad * 2,
                        decoration: BoxDecoration(
                          color: widget.color,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: Center(
                          child: _busy
                              ? SizedBox(
                                  width: 22,
                                  height: 22,
                                  child: CircularProgressIndicator(
                                      color: fg, strokeWidth: 2.6),
                                )
                              : Icon(widget.icon, color: fg, size: 26),
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

/// Levera-ordmärke renderat nativt: "deli" i bläck/vit + "vera" i guld,
/// med valfri versal undertext (t.ex. COURIER). Ersätter generiska
/// gradient-ikonrutor — autentisk varumärkestypografi (Outfit).
class DeliveraWordmark extends StatelessWidget {
  final double fontSize;
  final String? tagline;
  final bool center;

  const DeliveraWordmark({
    super.key,
    this.fontSize = 34,
    this.tagline,
    this.center = false,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final inkColor = isDark ? AppTheme.paper : AppTheme.ink;
    final gold = isDark ? AppTheme.ember : AppTheme.emberDeep;
    return Column(
      crossAxisAlignment:
          center ? CrossAxisAlignment.center : CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text.rich(
          TextSpan(
            style: TextStyle(
              fontFamily: AppTheme.displayFont,
              fontSize: fontSize,
              fontWeight: FontWeight.w800,
              letterSpacing: -fontSize * 0.03,
              height: 1.0,
            ),
            children: [
              TextSpan(text: 'deli', style: TextStyle(color: inkColor)),
              TextSpan(text: 'vera', style: TextStyle(color: gold)),
            ],
          ),
        ),
        if (tagline != null) ...[
          SizedBox(height: fontSize * 0.16),
          Text(
            tagline!.toUpperCase(),
            style: TextStyle(
              fontFamily: AppTheme.displayFont,
              fontSize: fontSize * 0.30,
              fontWeight: FontWeight.w700,
              letterSpacing: fontSize * 0.22,
              color: gold,
            ),
          ),
        ],
      ],
    );
  }
}
