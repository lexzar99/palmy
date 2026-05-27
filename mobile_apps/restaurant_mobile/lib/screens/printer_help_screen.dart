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
          'Om problemet kvarstår mer än 10 minuter, kontakta MatGo support med en bild på skrivarens display.',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _expanded = widget.focusCategory ?? PrinterFailureCategory.unknown;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(8, 12, 16, 0),
                child: Row(
                  children: [
                    IconButton(
                      onPressed: () => Navigator.pop(context),
                      icon: const Icon(Icons.arrow_back_rounded),
                    ),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(
                        'Felsökning skrivare',
                        style: TextStyle(
                          fontSize: 24,
                          fontWeight: FontWeight.w600,
                          letterSpacing: -0.4,
                          color: isDark ? Colors.white : AppTheme.ink,
                        ),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () => Navigator.pushReplacement(
                        context,
                        MaterialPageRoute(
                            builder: (_) => const PrintSettingsScreen()),
                      ),
                      icon: const Icon(Icons.settings_rounded, size: 18),
                      label: const Text('Inställningar'),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
                  children: [
                    _buildIntroCard(isDark),
                    const SizedBox(height: 20),
                    for (final section in _sections) ...[
                      _buildSection(section, isDark),
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

  Widget _buildIntroCard(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.ember.withOpacity(0.10),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.ember.withOpacity(0.30)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.auto_fix_high_rounded, color: AppTheme.ember),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Appen försöker automatiskt återansluta',
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: isDark ? Colors.white : AppTheme.ink),
                ),
                const SizedBox(height: 4),
                Text(
                  'Vid första misslyckande väntar vi 1,5 sek och försöker igen. Om vi fortfarande inte når skrivaren ser du detta meddelande — följ stegen nedan.',
                  style: TextStyle(
                      fontSize: 13,
                      color: isDark
                          ? Colors.white.withOpacity(0.75)
                          : AppTheme.mutedInk),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSection(_HelpSection section, bool isDark) {
    final isExpanded = _expanded == section.category;
    final accent = AppTheme.ember;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      decoration: BoxDecoration(
        color: isDark
            ? AppTheme.deepSea
            : AppTheme.mist,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isExpanded ? accent : Colors.transparent,
          width: isExpanded ? 1.5 : 0,
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
                      color: accent.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(section.icon, color: accent, size: 22),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      section.title,
                      style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: isDark ? Colors.white : AppTheme.ink,
                      ),
                    ),
                  ),
                  Icon(
                    isExpanded
                        ? Icons.expand_less_rounded
                        : Icons.expand_more_rounded,
                    color: isDark
                        ? Colors.white.withOpacity(0.55)
                        : AppTheme.mutedInk,
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
                              color: accent.withOpacity(0.18),
                              shape: BoxShape.circle,
                            ),
                            child: Center(
                              child: Text(
                                '${i + 1}',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                  color: accent,
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
                        color: isDark
                            ? Colors.white.withOpacity(0.04)
                            : Colors.black.withOpacity(0.04),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        section.footerNote!,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontStyle: FontStyle.italic,
                          color: isDark
                              ? Colors.white.withOpacity(0.7)
                              : AppTheme.mutedInk,
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
