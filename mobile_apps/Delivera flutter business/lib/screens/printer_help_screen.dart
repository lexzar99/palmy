import 'package:flutter/material.dart';
import '../core/print_service.dart';
import '../core/theme.dart';
import '../widgets/app_ui.dart';
import 'print_settings_screen.dart';

/// Hjälp-skärm för printer-problem. Öppnas från:
///   1. SnackBar-action "HJÄLP" på dashboard när auto-print fails.
///   2. "Hjälp och felsökning"-rad i PrintSettingsScreen.
///
/// Visar steg-för-steg-guider grupperade per kategori (Bluetooth, Nätverk,
/// Allmänt). Vid djuplänkning från SnackBar pre-expanderas den kategori
/// som matchar felet — personalen ser de relevanta stegen direkt.
class PrinterHelpScreen extends StatefulWidget {
  final PrinterFailureCategory? focusCategory;

  const PrinterHelpScreen({super.key, this.focusCategory});

  @override
  State<PrinterHelpScreen> createState() => _PrinterHelpScreenState();
}

class _HelpSection {
  final PrinterFailureCategory category;
  final String title;
  final IconData icon;
  final List<String> steps;
  final String? footerNote;

  const _HelpSection({
    required this.category,
    required this.title,
    required this.icon,
    required this.steps,
    this.footerNote,
  });
}

class _PrinterHelpScreenState extends State<PrinterHelpScreen> {
  late PrinterFailureCategory _expanded;

  static const List<_HelpSection> _sections = [
    _HelpSection(
      category: PrinterFailureCategory.bluetooth,
      title: 'Bluetooth-skrivare',
      icon: Icons.bluetooth_rounded,
      steps: [
        'Kontrollera att skrivaren är påslagen och att indikatorn lyser.',
        'Öppna telefonens Android-inställningar → Bluetooth.',
        'Verifiera att skrivaren visas som parad. Om inte: para den först.',
        'Slå av/på Bluetooth på telefonen och vänta tills skrivaren ansluts igen.',
        'Försök skriva ut ett testkvitto från Inställningar → Skrivare.',
        'Om felet kvarstår: håll skrivarens power-knapp nedtryckt i 5 sek för full omstart.',
      ],
      footerNote:
          'Tips: Vissa skrivare somnar efter 5 minuter. Slå på auto-print så väcks de när en order kommer in.',
    ),
    _HelpSection(
      category: PrinterFailureCategory.network,
      title: 'Nätverksskrivare (Wi-Fi)',
      icon: Icons.wifi_rounded,
      steps: [
        'Kontrollera att skrivaren är ansluten till samma Wi-Fi-nätverk som telefonen.',
        'Hitta skrivarens IP-adress (skriv ut en self-test eller titta på displayen).',
        'Öppna Inställningar → Skrivare → "Skanna nätverk" och välj den.',
        'Verifiera att IP-adressen är korrekt sparad och kör ett testkvitto.',
        'Om felet kvarstår: starta om både routern och skrivaren.',
        'Behöver du fast IP? Kontakta din IT eller routerns admin-panel.',
      ],
      footerNote:
          'Default-port är 9100 (ESC/POS). Om din skrivare använder en annan port, skriv "ip:port" i adressfältet.',
    ),
    _HelpSection(
      category: PrinterFailureCategory.config,
      title: 'Ingen skrivare konfigurerad',
      icon: Icons.print_disabled_rounded,
      steps: [
        'Öppna Inställningar → Skrivare.',
        'Välj "Skanna nätverk" för Wi-Fi-skrivare eller "Skanna Bluetooth" för BT-skrivare.',
        'Tryck på din skrivare i listan för att spara den.',
        'Slå på "Auto-utskrift" så skrivs varje accepterad order ut automatiskt.',
        'Kör ett testkvitto för att verifiera att allt fungerar innan rusning.',
      ],
    ),
    _HelpSection(
      category: PrinterFailureCategory.unknown,
      title: 'Allmänna tips',
      icon: Icons.lightbulb_outline_rounded,
      steps: [
        'Kontrollera att skrivaren har papper och inte är öppen (locket stängt).',
        'Titta efter blinkande lampor — många skrivare signalerar fel via LED.',
        'Försök ett testkvitto från Inställningar → Skrivare.',
        'Om appen säger "skrivare ej nåbar" — vänta 10 sek och försök igen, vi gör ett auto-retry.',
        'Som sista utväg: starta om appen helt och försök igen.',
      ],
      footerNote:
          'Om problemet kvarstår mer än 10 minuter, kontakta Delivera support med en bild på skrivarens display.',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _expanded = widget.focusCategory ?? PrinterFailureCategory.unknown;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
                child: Row(
                  children: [
                    _CircleButton(
                      icon: Icons.arrow_back_rounded,
                      onTap: () => Navigator.pop(context),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'HJÄLP',
                            style: TextStyle(
                              color: AppTheme.mutedColor(context),
                              fontSize: 11,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.4,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            'Felsökning skrivare',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 22,
                              fontWeight: FontWeight.w900,
                              letterSpacing: -0.5,
                              color: ink,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    _CircleButton(
                      icon: Icons.settings_rounded,
                      onTap: () => Navigator.pushReplacement(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const PrintSettingsScreen()),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
                  children: [
                    _buildIntroCard(context, isDark, ink),
                    const SizedBox(height: 18),
                    for (final section in _sections) ...[
                      _buildSection(context, section, isDark, ink),
                      const SizedBox(height: 12),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildIntroCard(BuildContext context, bool isDark, Color ink) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.faintColor(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.auto_fix_high_rounded, color: ink, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Appen försöker automatiskt återansluta',
                  style: TextStyle(fontWeight: FontWeight.w700, color: ink),
                ),
                const SizedBox(height: 4),
                Text(
                  'Vid första misslyckande väntar vi 1,5 sek och försöker igen. Om vi fortfarande inte når skrivaren ser du detta meddelande — följ stegen nedan.',
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.4,
                    color: AppTheme.mutedColor(context),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(
      BuildContext context, _HelpSection section, bool isDark, Color ink) {
    final isExpanded = _expanded == section.category;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isExpanded ? ink : AppTheme.borderColor(context),
          width: isExpanded ? 1.5 : 1,
        ),
      ),
      child: Column(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(16),
            onTap: () => setState(() {
              _expanded = isExpanded
                  ? PrinterFailureCategory.unknown
                  : section.category;
            }),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppTheme.faintColor(context),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppTheme.borderColor(context)),
                    ),
                    child: Icon(section.icon, color: ink, size: 22),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      section.title,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: ink,
                      ),
                    ),
                  ),
                  Icon(
                    isExpanded
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    color: AppTheme.mutedColor(context),
                  ),
                ],
              ),
            ),
          ),
          if (isExpanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < section.steps.length; i++) ...[
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            width: 22,
                            height: 22,
                            margin: const EdgeInsets.only(top: 2, right: 12),
                            decoration: BoxDecoration(
                              color: ink,
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Text(
                                '${i + 1}',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: isDark ? AppTheme.ink : Colors.white,
                                ),
                              ),
                            ),
                          ),
                          Expanded(
                            child: Text(
                              section.steps[i],
                              style: TextStyle(
                                fontSize: 14,
                                height: 1.45,
                                color: isDark
                                    ? Colors.white.withOpacity(0.88)
                                    : AppTheme.ink,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                  if (section.footerNote != null) ...[
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppTheme.faintColor(context),
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppTheme.borderColor(context)),
                      ),
                      child: Text(
                        section.footerNote!,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontStyle: FontStyle.italic,
                          color: AppTheme.mutedColor(context),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _CircleButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _CircleButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: AppTheme.faintColor(context),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppTheme.borderColor(context)),
          ),
          child: Icon(
            icon,
            color: isDark ? Colors.white : AppTheme.ink,
            size: 20,
          ),
        ),
      ),
    );
  }
}
