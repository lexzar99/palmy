import 'package:animate_do/animate_do.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/constants.dart';
import '../core/theme.dart';
import '../providers/auth_provider.dart';
import '../widgets/app_ui.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  Future<void> _handleLogin() async {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    await auth.login(
      _emailController.text.trim(),
      _passwordController.text.trim(),
    );
  }

  Future<void> _testServer() async {
    try {
      final dio = Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 30),
        receiveTimeout: const Duration(seconds: 30),
      ));
      final response = await dio.get('${AppConstants.baseUrl}/health');
      if (!mounted) return;

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Server svarar ✓ (${response.statusCode})'),
          backgroundColor: AppTheme.success,
        ),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      final String msg;
      if (e.type == DioExceptionType.connectionTimeout ||
          e.type == DioExceptionType.receiveTimeout) {
        msg = 'Ingen svar från servern – kontrollera internet (timeout 30 s)';
      } else if (e.type == DioExceptionType.connectionError) {
        msg = 'Kunde inte nå servern – kontrollera internet';
      } else {
        msg = 'Server ej nåbar (${e.response?.statusCode ?? e.type.name})';
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(msg), backgroundColor: AppTheme.danger),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Servertest misslyckades – okänt fel'),
          backgroundColor: AppTheme.danger,
        ),
      );
    }
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final accent = isDark ? AppTheme.ember : AppTheme.emberDeep;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: FadeInUp(
                  duration: const Duration(milliseconds: 240),
                  child: Consumer<AuthProvider>(
                    builder: (context, auth, _) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Stor logo
                          Center(
                            child: Container(
                              width: 96,
                              height: 96,
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  colors: [
                                    AppTheme.emberSoft,
                                    AppTheme.ember,
                                  ],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                                borderRadius: BorderRadius.circular(28),
                                boxShadow: [
                                  BoxShadow(
                                    color: AppTheme.ember.withOpacity(0.38),
                                    blurRadius: 30,
                                    offset: const Offset(0, 12),
                                  ),
                                ],
                              ),
                              child: const Center(
                                child: Text(
                                  'M',
                                  style: TextStyle(
                                    color: AppTheme.ink,
                                    fontSize: 44,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: -2,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 28),
                          Center(
                            child: Text(
                              'MatGo Business',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                fontSize: 32,
                                fontWeight: FontWeight.w900,
                                letterSpacing: -1.2,
                                height: 1.0,
                                color:
                                    isDark ? Colors.white : AppTheme.ink,
                              ),
                            ),
                          ),
                          const SizedBox(height: 10),
                          Center(
                            child: Text(
                              'Logga in på din restaurang',
                              style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.mutedColor(context),
                              ),
                            ),
                          ),
                          const SizedBox(height: 36),

                          // Form-panel
                          Container(
                            padding: const EdgeInsets.all(22),
                            decoration: BoxDecoration(
                              color: AppTheme.panelColor(context),
                              borderRadius: BorderRadius.circular(22),
                              border: Border.all(
                                  color: AppTheme.borderColor(context)),
                              boxShadow: isDark
                                  ? []
                                  : [
                                      BoxShadow(
                                        color: Colors.black.withOpacity(0.04),
                                        blurRadius: 28,
                                        offset: const Offset(0, 10),
                                      ),
                                    ],
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _FieldLabel(label: 'Användarnamn'),
                                const SizedBox(height: 8),
                                TextField(
                                  controller: _emailController,
                                  keyboardType: TextInputType.emailAddress,
                                  textInputAction: TextInputAction.next,
                                  decoration: const InputDecoration(
                                    hintText: 'användarnamn',
                                    prefixIcon: Icon(
                                      Icons.person_outline_rounded,
                                      size: 19,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 18),
                                _FieldLabel(label: 'Lösenord'),
                                const SizedBox(height: 8),
                                TextField(
                                  controller: _passwordController,
                                  obscureText: _obscurePassword,
                                  textInputAction: TextInputAction.done,
                                  onSubmitted: (_) => _handleLogin(),
                                  decoration: InputDecoration(
                                    hintText: '••••••••',
                                    prefixIcon: const Icon(
                                      Icons.lock_outline_rounded,
                                      size: 19,
                                    ),
                                    suffixIcon: IconButton(
                                      onPressed: () {
                                        setState(
                                          () => _obscurePassword =
                                              !_obscurePassword,
                                        );
                                      },
                                      icon: Icon(
                                        _obscurePassword
                                            ? Icons.visibility_outlined
                                            : Icons.visibility_off_outlined,
                                        size: 19,
                                      ),
                                    ),
                                  ),
                                ),
                                if (auth.error != null &&
                                    auth.error!.trim().isNotEmpty) ...[
                                  const SizedBox(height: 16),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 14,
                                      vertical: 12,
                                    ),
                                    decoration: BoxDecoration(
                                      color:
                                          AppTheme.danger.withOpacity(0.10),
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                        color: AppTheme.danger
                                            .withOpacity(0.28),
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(
                                          Icons.error_outline_rounded,
                                          color: AppTheme.danger,
                                          size: 18,
                                        ),
                                        const SizedBox(width: 10),
                                        Expanded(
                                          child: Text(
                                            auth.error!,
                                            style: const TextStyle(
                                              color: AppTheme.danger,
                                              fontSize: 13,
                                              fontWeight: FontWeight.w700,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 22),
                                EmberButton(
                                  label: auth.isLoading
                                      ? 'Loggar in...'
                                      : 'Logga in',
                                  icon: auth.isLoading
                                      ? null
                                      : Icons.arrow_forward_rounded,
                                  busy: auth.isLoading,
                                  onPressed: auth.isLoading
                                      ? null
                                      : _handleLogin,
                                  height: 56,
                                  color: accent,
                                  foreground:
                                      isDark ? AppTheme.ink : Colors.white,
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 16),
                          Center(
                            child: TextButton.icon(
                              onPressed: _testServer,
                              icon: Icon(
                                Icons.wifi_tethering_rounded,
                                size: 16,
                                color: AppTheme.mutedColor(context),
                              ),
                              label: Text(
                                'Testa serveranslutning',
                                style: TextStyle(
                                  color: AppTheme.mutedColor(context),
                                  fontSize: 13,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
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
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String label;
  const _FieldLabel({required this.label});

  @override
  Widget build(BuildContext context) {
    return Text(
      label.toUpperCase(),
      style: TextStyle(
        color: AppTheme.mutedColor(context),
        fontSize: 11,
        fontWeight: FontWeight.w800,
        letterSpacing: 1.2,
      ),
    );
  }
}
