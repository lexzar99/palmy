import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import '../providers/auth_provider.dart';
import '../core/theme.dart';
import '../core/constants.dart';
import 'package:dio/dio.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  void _handleLogin() async {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final success = await auth.login(
      _emailController.text.trim(),
      _passwordController.text.trim(),
    );

    if (!mounted) return;
    if (success) {
      // Navigation happens automatically via main.dart listener or here
    } else {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(auth.error ?? 'Inloggning misslyckades'),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  void _testSoundBridge() async {
    try {
      final res = await Dio().get('http://localhost:5005/play');
      if (res.statusCode == 200 && mounted) {
         ScaffoldMessenger.of(context).showSnackBar(
           const SnackBar(content: Text('✅ Mac-brygga svarade! Ljud bör höras.'), backgroundColor: Colors.green)
         );
      }
    } catch (e) {
      if (mounted) {
         ScaffoldMessenger.of(context).showSnackBar(
           SnackBar(content: Text('❌ Kunde inte ansluta till Mac-brygga: $e'), backgroundColor: Colors.redAccent)
         );
      }
    }
  }

  Future<void> _testServer() async {
    try {
      final res = await Dio().get('${AppConstants.baseUrl}/health');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('✅ Server OK (${res.statusCode})'),
          backgroundColor: Colors.green,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('❌ Server-test misslyckades: $e'),
          backgroundColor: Colors.redAccent,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final bgColor = isDark ? AppTheme.charcoal : AppTheme.lightBg;
    final textColor = isDark ? Colors.white : AppTheme.lightText;
    final goldColor = isDark ? AppTheme.gold : AppTheme.lightGold;
    final subtextColor = isDark ? Colors.white.withOpacity(0.4) : AppTheme.lightSubtext;

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(
          color: bgColor,
          image: isDark ? const DecorationImage(
            image: NetworkImage('https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?q=80&w=2070'),
            opacity: 0.05,
            fit: BoxFit.cover,
          ) : null,
        ),
        child: Padding(
          padding: const EdgeInsets.all(30.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              FadeInDown(
                duration: const Duration(milliseconds: 800),
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    color: AppTheme.gold,
                    borderRadius: BorderRadius.circular(25),
                    boxShadow: [
                      BoxShadow(
                        color: AppTheme.gold.withOpacity(0.3),
                        blurRadius: 30,
                        spreadRadius: 5,
                      )
                    ],
                  ),
                  child: const Center(
                    child: Text(
                      'M',
                      style: TextStyle(
                        fontSize: 40,
                        fontWeight: FontWeight.w900,
                        color: AppTheme.charcoal,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 40),
              FadeInUp(
                delay: const Duration(milliseconds: 300),
                child: Column(
                  children: [
                    Text(
                      'MATGO BUSINESS',
                      style: TextStyle(
                        fontSize: 24,
                        fontWeight: FontWeight.w900,
                        color: textColor,
                        letterSpacing: 2,
                      ),
                    ),
                    Text(
                      'AUTENTISERAD ÅTKOMST',
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w900,
                        color: goldColor.withOpacity(0.5),
                        letterSpacing: 4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 60),
              FadeInUp(
                delay: const Duration(milliseconds: 500),
                child: Column(
                  children: [
                    TextField(
                      controller: _emailController,
                      style: TextStyle(color: textColor),
                      decoration: const InputDecoration(
                        labelText: 'ANVÄNDARNAMN',
                        prefixIcon: Icon(Icons.person_outline, size: 20),
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      'Använd samma inloggning som i MatGo Admin (din restaurang-användare).',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: subtextColor,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.5,
                      ),
                    ),
                    const SizedBox(height: 20),
                    TextField(
                      controller: _passwordController,
                      obscureText: true,
                      style: TextStyle(color: textColor),
                      decoration: const InputDecoration(
                        labelText: 'LÖSENORD',
                        prefixIcon: Icon(Icons.lock_outline, size: 20),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 40),
              FadeInUp(
                delay: const Duration(milliseconds: 700),
                child: Consumer<AuthProvider>(
                  builder: (context, auth, child) => Column(
                    children: [
                      SizedBox(
                        width: double.infinity,
                        height: 65,
                        child: ElevatedButton(
                          onPressed: auth.isLoading ? null : _handleLogin,
                          child: auth.isLoading
                              ? const CircularProgressIndicator(color: AppTheme.charcoal)
                              : const Text('LOGGA IN'),
                        ),
                      ),
                      if (auth.error != null && auth.error!.trim().isNotEmpty) ...[
                        const SizedBox(height: 12),
                        Text(
                          auth.error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            color: Colors.redAccent,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                      const SizedBox(height: 10),
                      TextButton(
                        onPressed: _testServer,
                        child: Text(
                          'TESTA SERVER',
                          style: TextStyle(
                            color: goldColor.withOpacity(0.9),
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 2,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                'Server: ${AppConstants.baseUrl}',
                style: TextStyle(
                  color: subtextColor.withOpacity(0.6),
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
