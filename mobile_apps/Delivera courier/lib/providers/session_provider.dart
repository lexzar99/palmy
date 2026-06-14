import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/api_client.dart';
import '../core/constants.dart';
import '../core/location_service.dart';
import '../core/models_api.dart';
import '../models/models.dart';

/// Driftläge för kuriren: online/offline, tillgängliga uppdrag (polling),
/// aktiva leveranser, accept/pickup/complete, historik och GPS-heartbeat.
class SessionProvider with ChangeNotifier {
  SessionProvider(this._api) : _location = LocationService(_api);

  final CourierApi _api;
  final LocationService _location;

  bool _online = false;
  bool _busy = false; // pågående nätverksåtgärd (login-toggle etc.)
  String? _error;

  List<Job> _jobs = [];
  List<ActiveDelivery> _active = [];
  List<HistoryOrder> _history = [];

  Timer? _jobsTimer;
  int _newJobBadge = 0; // antal nya uppdrag sedan senaste titt

  // ── Getters ────────────────────────────────────────────────────────────────
  bool get online => _online;
  bool get busy => _busy;
  String? get error => _error;
  List<Job> get jobs => List.unmodifiable(_jobs);
  List<ActiveDelivery> get active => List.unmodifiable(_active);
  List<HistoryOrder> get history => List.unmodifiable(_history);
  int get newJobBadge => _newJobBadge;
  bool get atActiveLimit => _active.length >= Constants.maxActive;

  /// Dagens intjäning (kr) — summan av historikens leveranser idag.
  double get earnedToday {
    final now = DateTime.now();
    return _history
        .where((h) =>
            h.deliveredAt.year == now.year &&
            h.deliveredAt.month == now.month &&
            h.deliveredAt.day == now.day)
        .fold<double>(0, (s, h) => s + h.payout);
  }

  int get deliveriesToday {
    final now = DateTime.now();
    return _history
        .where((h) =>
            h.deliveredAt.year == now.year &&
            h.deliveredAt.month == now.month &&
            h.deliveredAt.day == now.day)
        .length;
  }

  // ── Bootstrap: läs serverns session-status + ev. återuppta online ──────────
  Future<void> bootstrap() async {
    try {
      _online = await _api.getSession();
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      _online = prefs.getBool(Constants.onlineFlagKey) ?? false;
    }
    if (_online) {
      await _location.start();
      _startJobsPolling();
    }
    await Future.wait([refreshActive(), refreshHistory()]);
    notifyListeners();
  }

  // ── Online/offline ─────────────────────────────────────────────────────────
  Future<bool> goOnline() async {
    _setBusy(true);
    try {
      await _api.startSession();
      _online = true;
      await _persistOnline(true);
      await _location.start();
      _startJobsPolling();
      await refreshJobs();
      return true;
    } catch (e) {
      _error = 'Kunde inte gå online. Försök igen.';
      return false;
    } finally {
      _setBusy(false);
    }
  }

  Future<void> goOffline() async {
    _setBusy(true);
    try {
      await _api.stopSession();
    } catch (_) {
      // Lokalt offline ändå.
    }
    _online = false;
    await _persistOnline(false);
    await _location.stop();
    _stopJobsPolling();
    _jobs = [];
    _setBusy(false);
  }

  Future<void> _persistOnline(bool v) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(Constants.onlineFlagKey, v);
  }

  // ── Uppdrag (polling) ──────────────────────────────────────────────────────
  void _startJobsPolling() {
    _jobsTimer?.cancel();
    _jobsTimer = Timer.periodic(Constants.jobsPollInterval, (_) => refreshJobs());
  }

  void _stopJobsPolling() {
    _jobsTimer?.cancel();
    _jobsTimer = null;
  }

  Future<void> refreshJobs() async {
    if (!_online) return;
    try {
      final fresh = await _api.listJobs();
      final beforeIds = _jobs.map((j) => j.id).toSet();
      final added = fresh.where((j) => !beforeIds.contains(j.id)).length;
      if (added > 0 && _jobs.isNotEmpty) _newJobBadge += added;
      _jobs = fresh;
      _error = null;
      notifyListeners();
    } catch (_) {
      // Behåll föregående lista vid nätverksglapp.
    }
  }

  void clearJobBadge() {
    if (_newJobBadge != 0) {
      _newJobBadge = 0;
      notifyListeners();
    }
  }

  Future<Job?> jobDetail(String id) async {
    try {
      return await _api.getJob(id);
    } catch (_) {
      return null;
    }
  }

  // ── Aktiva leveranser ──────────────────────────────────────────────────────
  Future<void> refreshActive() async {
    try {
      _active = await _api.listActive();
      notifyListeners();
    } catch (_) {}
  }

  ActiveDelivery? activeById(String id) {
    for (final a in _active) {
      if (a.id == id) return a;
    }
    return null;
  }

  /// Acceptera ett uppdrag. Returnerar felmeddelande vid problem, annars null.
  Future<String?> acceptJob(String orderId) async {
    if (atActiveLimit) {
      return 'Du kan ha max ${Constants.maxActive} uppdrag samtidigt.';
    }
    try {
      final delivery = await _api.acceptJob(orderId);
      _active = [..._active, delivery];
      _jobs = _jobs.where((j) => j.id != orderId).toList();
      notifyListeners();
      return null;
    } catch (e) {
      return _friendly(e);
    }
  }

  Future<String?> markPickedUp(String deliveryId) async {
    try {
      final updated = await _api.markPickedUp(deliveryId);
      _active = _active.map((a) => a.id == deliveryId ? updated : a).toList();
      notifyListeners();
      return null;
    } catch (e) {
      return _friendly(e);
    }
  }

  Future<String?> completeDelivery(
    String deliveryId, {
    required ProofMethod method,
    String? photoDataUrl,
  }) async {
    try {
      await _api.completeDelivery(deliveryId,
          method: method, photoDataUrl: photoDataUrl);
      _active = _active.where((a) => a.id != deliveryId).toList();
      await refreshHistory();
      notifyListeners();
      return null;
    } catch (e) {
      return _friendly(e);
    }
  }

  // ── Historik ───────────────────────────────────────────────────────────────
  Future<void> refreshHistory() async {
    try {
      _history = await _api.getHistory();
      notifyListeners();
    } catch (_) {}
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  String _friendly(Object e) => ApiClient.messageFor(e);

  void _setBusy(bool v) {
    _busy = v;
    notifyListeners();
  }

  @override
  void dispose() {
    _stopJobsPolling();
    _location.stop();
    super.dispose();
  }
}
