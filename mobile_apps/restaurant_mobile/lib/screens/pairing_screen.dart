import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../core/theme.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_ui.dart';

/// Engångsparning av plattan mot en restaurang. Admin genererar en pairing-kod
/// i admin-panelen (Enheter); personalen skriver in den här EN gång. Därefter
/// förblir plattan inloggad (även efter ominstallation) tills admin loggar ut
/// den.
class PairingScreen extends StatefulWidget {
  const PairingScreen({super.key});

  @override
  State<PairingScreen> createState() => _PairingScreenState();
}

class _PairingScreenState extends State<PairingScreen> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _pair(AuthProvider auth) async {
    if (auth.isLoading) return;
    FocusScope.of(context).unfocus();
    await auth.pair(_controller.text);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Consumer<AuthProvider>(
                  builder: (context, auth, _) {
                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Center(
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(26),
                            child: Image.asset(
                              'assets/icon/levera_logo.png',
                              width: 104,
                              height: 104,
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        const SizedBox(height: 26),
                        Text(
                          'Para enheten',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 26,
                            fontWeight: FontWeight.w900,
                            letterSpacing: -0.6,
                            color: isDark ? Colors.white : AppTheme.ink,
                          ),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'Be admin generera en pairing-kod och skriv in den '
                          'här. Plattan förblir inloggad efteråt.',
                          textAlign: TextAlign.center,
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                            height: 1.4,
                            color: AppTheme.mutedColor(context),
                          ),
                        ),
                        const SizedBox(height: 28),
                        TextField(
                          controller: _controller,
                          autofocus: true,
                          textAlign: TextAlign.center,
                          textCapitalization: TextCapitalization.characters,
                          maxLength: 6,
                          style: TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 8,
                            color: isDark ? Colors.white : AppTheme.ink,
                          ),
                          inputFormatters: [_UpperCaseFormatter()],
                          decoration: const InputDecoration(
                            hintText: 'KOD',
                            counterText: '',
                          ),
                          onSubmitted: (_) => _pair(auth),
                        ),
                        if (auth.error != null) ...[
                          const SizedBox(height: 10),
                          Text(
                            auth.error!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              color: AppTheme.danger,
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                            ),
                          ),
                        ],
                        const SizedBox(height: 22),
                        EmberButton(
                          label: auth.isLoading ? 'Parar…' : 'Para enhet',
                          icon: Icons.link_rounded,
                          busy: auth.isLoading,
                          onPressed: auth.isLoading ? null : () => _pair(auth),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
      TextEditingValue oldValue, TextEditingValue newValue) {
    return TextEditingValue(
      text: newValue.text.toUpperCase(),
      selection: newValue.selection,
    );
  }
}
