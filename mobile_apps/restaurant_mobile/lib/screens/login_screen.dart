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
    } catch (error) {
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
    final accent = isDark ? AppTheme.gold : AppTheme.lightGold;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: AppBackdrop(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 400),
                child: FadeInUp(
                  duration: const Duration(milliseconds: 220),
                  child: Consumer<AuthProvider>(
                    builder: (context, auth, _) {
                      return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Brand-logo + namn
                          Center(
                            child: Container(
                              width: 56,
                              height: 56,
                              decoration: BoxDecoration(
                                color: accent,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Center(
                                child: Text(
                                  'M',
                                  style: TextStyle(
                                    color: isDark
                                        ? AppTheme.ink
                                        : AppTheme.paper,
                                    fontSize: 24,
                                    fontWeight: FontWeight.w700,
                                    letterSpacing: -0.5,
                                  ),
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 20),
                          Center(
                            child: Text(
                              'MatGo Business',
                              style: Theme.of(context)
                                  .textTheme
                                  .headlineMedium
                                  ?.copyWith(
                                    fontWeight: FontWeight.w600,
                                    letterSpacing: -0.5,
                                  ),
                            ),
                          ),
                          const SizedBox(height: 6),
                          Center(
                            child: Text(
                              'Logga in på din restaurang',
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ),
                          const SizedBox(height: 32),

                          // Form
                          AppPanel(
                            padding: const EdgeInsets.all(20),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                _FieldLabel(label: 'Användarnamn'),
                                const SizedBox(height: 6),
                                TextField(
                                  controller: _emailController,
                                  keyboardType: TextInputType.emailAddress,
                                  textInputAction: TextInputAction.next,
                                  decoration: const InputDecoration(
                                    hintText: 'användarnamn',
                                    prefixIcon: Icon(
                                      Icons.person_outline_rounded,
                                      size: 18,
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 16),
                                _FieldLabel(label: 'Lösenord'),
                                const SizedBox(height: 6),
                                TextField(
                                  controller: _passwordController,
                                  obscureText: _obscurePassword,
                                  textInputAction: TextInputAction.done,
                                  onSubmitted: (_) => _handleLogin(),
                                  decoration: InputDecoration(
                                    hintText: '••••••••',
                                    prefixIcon: const Icon(
                                      Icons.lock_outline_rounded,
                                      size: 18,
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
                                        size: 18,
                                      ),
                                    ),
                                  ),
                                ),
                                if (auth.error != null &&
                                    auth.error!.trim().isNotEmpty) ...[
                                  const SizedBox(height: 14),
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 12,
                                      vertical: 10,
                                    ),
                                    decoration: BoxDecoration(
                                      color: AppTheme.danger.withOpacity(0.08),
                                      borderRadius: BorderRadius.circular(8),
                                      border: Border.all(
                                        color:
                                            AppTheme.danger.withOpacity(0.22),
                                      ),
                                    ),
                                    child: Row(
                                      children: [
                                        const Icon(
                                          Icons.error_outline_rounded,
                                          color: AppTheme.danger,
                                          size: 16,
                                        ),
                                        const SizedBox(width: 8),
                                        Expanded(
                                          child: Text(
                                            auth.error!,
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodyMedium
                                                ?.copyWith(
                                                  color: AppTheme.danger,
                                                ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                                const SizedBox(height: 20),
                                SizedBox(
                                  height: 48,
                                  child: ElevatedButton(
                                    onPressed:
                                        auth.isLoading ? null : _handleLogin,
                                    child: auth.isLoading
                                        ? SizedBox(
                                            width: 16,
                                            height: 16,
                                            child: CircularProgressIndicator(
                                              strokeWidth: 2,
                                              color: isDark
                                                  ? AppTheme.ink
                                                  : AppTheme.paper,
                                            ),
                                          )
                                        : const Text('Logga in'),
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: 12),
                          Center(
                            child: TextButton(
                              onPressed: _testServer,
                              child: const Text('Testa serveranslutning'),
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
      style: Theme.of(context).textTheme.labelMedium?.copyWith(
            color: AppTheme.mutedColor(context),
            letterSpacing: 0.9,
          ),
    );
  }
}
