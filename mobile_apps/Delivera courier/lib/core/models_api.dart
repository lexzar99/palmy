import '../models/models.dart';
import 'api_client.dart';

/// Endpoint-lager för kurir-backenden. Matchar `apps/courier/src/lib/api.ts`
/// och backend `packages/api/src/routes/courier.ts` exakt.
class CourierApi {
  CourierApi(this._client);
  final ApiClient _client;

  // ── Auth ──────────────────────────────────────────────────────────────────
  Future<({String token, CourierProfile courier})> login(
      String email, String password) async {
    final res = await _client.post('/api/courier/login', data: {
      'email': email.trim(),
      'password': password,
    });
    final data = res.data as Map<String, dynamic>;
    return (
      token: data['token'] as String,
      courier: CourierProfile.fromJson(data['courier'] as Map<String, dynamic>),
    );
  }

  Future<CourierProfile> me() async {
    final res = await _client.get('/api/courier/me');
    return CourierProfile.fromJson(res.data as Map<String, dynamic>);
  }

  // ── Session (online/offline) ───────────────────────────────────────────────
  Future<bool> getSession() async {
    final res = await _client.get('/api/courier/session');
    return (res.data as Map<String, dynamic>)['online'] == true;
  }

  Future<void> startSession() => _client.post('/api/courier/session/start');
  Future<void> stopSession() => _client.post('/api/courier/session/stop');

  // ── Tillgängliga uppdrag ───────────────────────────────────────────────────
  Future<List<Job>> listJobs() async {
    final res = await _client.get('/api/courier/jobs');
    return ((res.data as List?) ?? [])
        .map((e) => Job.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Job?> getJob(String id) async {
    final res = await _client.get('/api/courier/jobs/$id');
    if (res.data == null) return null;
    return Job.fromJson(res.data as Map<String, dynamic>);
  }

  // ── Aktiva leveranser ──────────────────────────────────────────────────────
  Future<List<ActiveDelivery>> listActive() async {
    final res = await _client.get('/api/courier/active');
    return ((res.data as List?) ?? [])
        .map((e) => ActiveDelivery.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ActiveDelivery?> getActive(String id) async {
    final res = await _client.get('/api/courier/deliveries/$id');
    if (res.data == null) return null;
    return ActiveDelivery.fromJson(res.data as Map<String, dynamic>);
  }

  Future<ActiveDelivery> acceptJob(String orderId) async {
    final res = await _client.post('/api/courier/jobs/$orderId/accept');
    return ActiveDelivery.fromJson(res.data as Map<String, dynamic>);
  }

  Future<ActiveDelivery> markPickedUp(String deliveryId) async {
    final res =
        await _client.post('/api/courier/deliveries/$deliveryId/picked-up');
    return ActiveDelivery.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> completeDelivery(
    String deliveryId, {
    required ProofMethod method,
    String? photoDataUrl,
  }) {
    return _client.post('/api/courier/deliveries/$deliveryId/complete', data: {
      'method': method.api,
      if (photoDataUrl != null) 'photoDataUrl': photoDataUrl,
    });
  }

  // ── Historik / intjäning ───────────────────────────────────────────────────
  Future<List<HistoryOrder>> getHistory() async {
    final res = await _client.get('/api/courier/history');
    return ((res.data as List?) ?? [])
        .map((e) => HistoryOrder.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  // ── Live-position ──────────────────────────────────────────────────────────
  Future<void> sendLocation(double lat, double lng) =>
      _client.post('/api/courier/location', data: {'lat': lat, 'lng': lng});
}
