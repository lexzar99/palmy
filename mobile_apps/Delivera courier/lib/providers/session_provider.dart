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
  // Bumpas vid varje online/offline-övergång. Ett svar från en äldre
  // online-session får aldrig skriva in i ett nyare tillstånd.
  int _epoch = 0;
  bool _disposed = false;

  // ── Getters ────────────────────────────────────────────────────────────────
  bool get online => _online;
  bool get busy => _busy;
  String? get error => _error;
  List<Job> get jobs => List.unmodifiable(_jobs);
  List<ActiveDelivery> get active => List.unmodifiable(_active);
  List<HistoryOrder> get history => List.unmodifiable(_history);
  int get newJobBadge => _newJobBadge;
  bool get atActiveLimit => _active.length >= Constants.maxActive;

  /// Intjäning (kr) + antal leveranser inom [startInclusive, endExclusive).
  /// Räknas ur historiken (senaste 60 leveranserna från backend).
  ({double earned, int count}) statsBetween(
      DateTime startInclusive, DateTime endExclusive) {
    double earned = 0;
    int count = 0;
    for (final h in _history) {
      final t = h.deliveredAt;
      if (!t.isBefore(startInclusive) && t.isBefore(endExclusive)) {
        earned += h.payout;
        count++;
      }
    }
    return (earned: earned, count: count);
  }

  /// Idag (från midnatt till nu).
  ({double earned, int count}) get statsToday {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day);
    return statsBetween(start, start.add(const Duration(days: 1)));
  }

  /// Igår (hela gårdagen).
  ({double earned, int count}) get statsYesterday {
    final now = DateTime.now();
    final start = DateTime(now.year, now.month, now.day)
        .subtract(const Duration(days: 1));
    return statsBetween(start, start.add(const Duration(days: 1)));
  }

  // ── Bootstrap: läs serverns session-status + ev. återuppta online ──────────
  Future<void> bootstrap() async {
    final epoch = _epoch;
    bool online;
    try {
      online = await _api.getSession();
    } catch (_) {
      final prefs = await SharedPreferences.getInstance();
      online = prefs.getBool(Constants.onlineFlagKey) ?? false;
    }
    // En utloggning/reset under bootstrap får inte återuppliva online-läget.
    if (_disposed || _epoch != epoch) return;
    _online = online;
    if (_online) {
      await _location.start();
      if (_disposed || _epoch != epoch) return;
      _startJobsPolling();
    }
    await Future.wait([refreshActive(), refreshHistory()]);
    if (_disposed || _epoch != epoch) return;
    notifyListeners();
  }

  // ── Online/offline ─────────────────────────────────────────────────────────
  Future<bool> goOnline() async {
    _setBusy(true);
    try {
      await _api.startSession();
      _epoch++;
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
    _epoch++; // ogiltigförklara ev. inflygande refresh-svar direkt
    _setBusy(true);
    _online = false;
    _stopJobsPolling();
    _jobs = [];
    _newJobBadge = 0;
    await _location.stop();
    try {
      await _api.stopSession();
    } catch (_) {
      // Lokalt offline ändå.
    }
    await _persistOnline(false);
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
    final epoch = _epoch;
    try {
      final fresh = await _api.listJobs();
      // Sessionen kan ha gått offline/online under flykten → kasta svaret.
      if (_disposed || !_online || _epoch != epoch) return;
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
      final active = await _api.listActive();
      if (_disposed) return;
      _active = active;
      notifyListeners();
    } catch (_) {}
  }

  ActiveDelivery? activeById(String id) {
    for (final a in _active) {
      if (a.id == id) return a;
    }
    return null;
  }

  /// Acceptera ett uppdrag. Returnerar den skapade leveransen + ev. fel.
  Future<({ActiveDelivery? delivery, String? error})> acceptJob(
      String orderId) async {
    if (atActiveLimit) {
      return (
        delivery: null,
        error: 'Du kan ha max ${Constants.maxActive} uppdrag samtidigt.'
      );
    }
    try {
      final delivery = await _api.acceptJob(orderId);
      _active = [..._active, delivery];
      _jobs = _jobs.where((j) => j.id != orderId).toList();
      notifyListeners();
      return (delivery: delivery, error: null);
    } catch (e) {
      return (delivery: null, error: _friendly(e));
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
      final history = await _api.getHistory();
      if (_disposed) return;
      _history = history;
      notifyListeners();
    } catch (_) {}
  }

  // ── App-livscykel: pausa nätverk/GPS i bakgrunden ──────────────────────────
  void handleAppPaused() {
    if (!_online) return;
    _stopJobsPolling();
    _location.stop();
  }

  void handleAppResumed() {
    if (!_online) return;
    _location.start();
    _startJobsPolling();
    refreshJobs();
    refreshActive();
  }

  /// Nollställ allt vid utloggning (även påtvingad 401). Stoppar timers/GPS,
  /// rensar listor och den persistade online-flaggan så nästa konto inte ärver.
  Future<void> reset() async {
    // Synkron del först → stänger polling/GPS-fönstret omedelbart.
    _epoch++;
    _online = false;
    _busy = false;
    _error = null;
    _newJobBadge = 0;
    _jobs = [];
    _active = [];
    _history = [];
    _stopJobsPolling();
    if (!_disposed) notifyListeners();
    await _location.stop();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(Constants.onlineFlagKey);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  String _friendly(Object e) => ApiClient.messageFor(e);

  void _setBusy(bool v) {
    _busy = v;
    if (!_disposed) notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    _stopJobsPolling();
    _location.stop();
    super.dispose();
  }
}
