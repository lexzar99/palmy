import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

class LogService {
  static final LogService _instance = LogService._internal();
  factory LogService() => _instance;
  LogService._internal() {
    _init();
  }

  final List<String> _logs = [];
  bool _initialized = false;

  Future<void> _init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getStringList('app_logs');
      if (saved != null) {
        _logs.addAll(saved);
      }
      _initialized = true;
      log('--- LOG SYSTEM INITIALIZED ---');
    } catch (e) {
      debugPrint('Error initializing LogService: $e');
    }
  }

  void log(String message) {
    final timestamp =
        DateTime.now().toIso8601String().split('T').last.substring(0, 8);
    final logLine = '[$timestamp] $message';
    _logs.add(logLine);
    if (_logs.length > 2000) _logs.removeAt(0);
    debugPrint(logLine);
    _persist();
  }

  Future<void> _persist() async {
    if (!_initialized) return;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setStringList('app_logs', _logs);
    } catch (e) {
      // Ignored
    }
  }

  List<String> get logs => List.unmodifiable(_logs);

  void clear() async {
    _logs.clear();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('app_logs');
  }

  Future<void> copyToClipboard() async {
    await Clipboard.setData(ClipboardData(text: _logs.join('\n')));
  }
}

final logger = LogService();
