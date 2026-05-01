import 'package:flutter/material.dart';

import '../core/log_service.dart';

class LogScreen extends StatefulWidget {
  const LogScreen({super.key});

  @override
  State<LogScreen> createState() => _LogScreenState();
}

class _LogScreenState extends State<LogScreen> {
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final logs = logger.logs;

    return Scaffold(
      appBar: AppBar(
        title: const Text('DEBUG LOGS',
            style: TextStyle(
                fontWeight: FontWeight.w900, fontSize: 16, letterSpacing: 2)),
        actions: [
          IconButton(
            onPressed: () {
              logger.clear();
              setState(() {});
            },
            icon: const Icon(Icons.delete_outline),
          ),
          IconButton(
            onPressed: () async {
              final messenger = ScaffoldMessenger.of(context);
              await logger.copyToClipboard();
              if (!mounted) return;
              messenger.showSnackBar(
                const SnackBar(
                    content: Text('✅ Logs copied to clipboard'),
                    backgroundColor: Colors.green),
              );
            },
            icon: const Icon(Icons.copy_all),
          ),
        ],
      ),
      body: logs.isEmpty
          ? const Center(child: Text('Empty logs'))
          : ListView.builder(
              padding: const EdgeInsets.all(20),
              itemCount: logs.length,
              itemBuilder: (context, index) {
                // Return in reverse order (newest first)
                final logLine = logs[logs.length - 1 - index];
                return Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    logLine,
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontSize: 10,
                      color: isDark ? Colors.white70 : Colors.black87,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                );
              },
            ),
    );
  }
}
