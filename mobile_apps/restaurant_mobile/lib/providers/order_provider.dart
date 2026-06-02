import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as socket_io;
import '../core/api_client.dart';
import '../core/constants.dart';
import '../models/order_model.dart';
import '../core/audio_helper.dart';
import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import 'package:flutter/services.dart';
import '../core/log_service.dart';
import '../core/print_service.dart';
import '../core/secure_token_store.dart';

class OrderProvider with ChangeNotifier {
  final ApiClient _api = ApiClient();
  List<OrderModel> _orders = [];
  bool _isLoading = false;
  socket_io.Socket? _socket;
  String? _restaurantId;
  final String _selectedAlarm = 'notification.wav';
  bool _isRestaurantOpen = true;
  bool _isOffline = false;
  Timer? _alarmWatchdog;
  bool _socketInitializing = false;
  DateTime? _pausedUntil;
  Timer? _pauseTimer;
  String openingTime = '11:00';
  String closingTime = '21:00';
  String _lastKnownHours = '';

  // ── Connection-lost-larm ──────────────────────────────────────────────────
  // Vid tappad anslutning: röd skärm + en LUGN signal (disconnect.wav, ej samma
  // som ny-order-ljudet) som upprepas var 10:e sek. Användaren tystar genom att
  // trycka på skärmen; efter några minuter återupptas signalen om appen
  // fortfarande är offline. Signalen spelas ENDAST under öppettider — utanför
  // öppettider visas bara den röda skärmen, helt tyst.
  Timer? _disconnectAlarmTimer;
  Timer? _disconnectReAlertTimer;
  bool _disconnectAcknowledged = false;
  static const Duration _disconnectReAlertAfter = Duration(minutes: 3);

  /// Röd skärm visas så länge appen är offline. När restaurangen är öppen kan
  /// användaren trycka för att tysta (då döljs den tills re-alert), när den är
  /// stängd ligger den kvar (passiv, tyst).
  bool get showDisconnectOverlay =>
      _isOffline && (!_isRestaurantOpen || !_disconnectAcknowledged);
  bool get disconnectSoundActive =>
      _isOffline && _isRestaurantOpen && !_disconnectAcknowledged;

  // Anropas när servern signalerar att den här plattans session ändrats
  // (admin revoke/delete). Wire:as i MainShell → AuthProvider.bootstrapTerminal.
  void Function(Map<String, dynamic> data)? onDeviceSessionChanged;

  List<OrderModel> get orders => _orders;
  bool get isLoading => _isLoading;
  String get selectedAlarm => _selectedAlarm;
  bool get isRestaurantOpen => _isRestaurantOpen;
  bool get isOffline => _isOffline;
  DateTime? get pausedUntil => _pausedUntil;
  bool get isPaused => _pausedUntil != null && _pausedUntil!.isAfter(DateTime.now());

  static const _pausedUntilKey = 'paused_until_iso';

  Future<void> pauseFor(int minutes) async {
    _pausedUntil = DateTime.now().add(Duration(minutes: minutes));
    await _persistPause();
    await _syncPauseToBackend();
    _isRestaurantOpen = false; // backend har redan satt det
    _scheduleResume();
    notifyListeners();
  }

  Future<void> extendPause(int minutes) async {
    final base = _pausedUntil ?? DateTime.now();
    _pausedUntil = base.add(Duration(minutes: minutes));
    await _persistPause();
    await _syncPauseToBackend();
    _scheduleResume();
    notifyListeners();
  }

  Future<void> cancelPause() async {
    _pauseTimer?.cancel();
    _pausedUntil = null;
    await _persistPause();
    await _syncPauseToBackend();
    if (!_isRestaurantOpen) await setStatus(true);
    notifyListeners();
  }

  /// Skickar pausedUntil till backend så att kund-appen vet att restaurangen
  /// är pausad (inte bara stängd). Misslyckas tyst – local pause är ändå
  /// aktiv och nästa fetchRestaurantStatus synkar.
  Future<void> _syncPauseToBackend() async {
    if (_restaurantId == null) return;
    try {
      await _api.patch('/api/restaurants/$_restaurantId', {
        'pausedUntil': _pausedUntil?.toUtc().toIso8601String(),
      });
    } catch (e) {
      logger.log('PAUSE SYNC ERROR: $e');
    }
  }

  Future<void> _persistPause() async {
    final prefs = await SharedPreferences.getInstance();
    if (_pausedUntil == null) {
      await prefs.remove(_pausedUntilKey);
    } else {
      await prefs.setString(_pausedUntilKey, _pausedUntil!.toIso8601String());
    }
  }

  void _scheduleResume() {
    _pauseTimer?.cancel();
    if (_pausedUntil == null) return;
    final remaining = _pausedUntil!.difference(DateTime.now());
    if (remaining.isNegative) {
      // Pause hade redan tagit slut (t.ex. efter krasch + restart) → öppna direkt
      _pausedUntil = null;
      _persistPause();
      if (!_isRestaurantOpen) setStatus(true);
      notifyListeners();
      return;
    }
    _pauseTimer = Timer(remaining, () {
      _pausedUntil = null;
      _persistPause();
      if (!_isRestaurantOpen) setStatus(true);
      notifyListeners();
    });
  }

  /// Anropas vid app-start för att återställa pause-state efter krasch/restart.
  Future<void> restorePauseState() async {
    final prefs = await SharedPreferences.getInstance();
    final iso = prefs.getString(_pausedUntilKey);
    if (iso == null) return;
    final until = DateTime.tryParse(iso);
    if (until == null) {
      await prefs.remove(_pausedUntilKey);
      return;
    }
    _pausedUntil = until;
    _scheduleResume();
    notifyListeners();
  }

  // ORDERS IN LIVE VIEW (Nya och Matlagning)
  List<OrderModel> get pendingOrders =>
      _orders.where((o) => o.status == 'PENDING').toList();

  // Active means ACCEPTED, PREPARING, READY (Wait for pickup)
  // For Delivery, once it's DELIVERING it goes to history.
  // For Pickup, READY is active until DELIVERED.
  List<OrderModel> get activeOrders => _orders
      .where((o) => (['ACCEPTED', 'PREPARING'].contains(o.status)))
      .toList();

  // FÖREGÅENDE ORDRAR på dashboard: ordrar som restaurangen aktivt jobbar
  // på just nu (accepterat / tillagas). När ordern är på väg / klar /
  // levererad / NEKAD / AVBRUTEN → flytta till historik (terminal-states).
  // BUG-FIX: REJECTED och CANCELLED saknades tidigare i moveToHistory →
  // nekade ordrar fastnade i "Föregående" istället för att hamna i historik.
  List<OrderModel> get recentOrders {
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);
    const moveToHistory = [
      'DELIVERING',
      'DELIVERED',
      'COMPLETED',
      'READY',
      'REJECTED',
      'CANCELLED',
    ];
    return _orders
        .where((o) =>
            o.status != 'PENDING' &&
            !moveToHistory.contains(o.status) &&
            o.createdAt.isAfter(startOfToday))
        .toList();
  }

  // HISTORY TAB FILTERS
  List<OrderModel> get todayHistoryOrders {
    final now = DateTime.now();
    final startOfToday = DateTime(now.year, now.month, now.day);

    return _orders.where((o) {
      final isCompleted = [
        'READY',
        'DELIVERING',
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'REJECTED'
      ].contains(o.status);
      return isCompleted &&
          o.createdAt.isAfter(startOfToday) &&
          !_isTestOrder(o);
    }).toList();
  }

  List<OrderModel> get yesterdayHistoryOrders {
    final now = DateTime.now();
    final startOfYesterday = DateTime(now.year, now.month, now.day - 1);
    final startOfToday = DateTime(now.year, now.month, now.day);

    return _orders.where((o) {
      final isCompleted = [
        'READY',
        'DELIVERING',
        'DELIVERED',
        'COMPLETED',
        'CANCELLED',
        'REJECTED'
      ].contains(o.status);
      return isCompleted &&
          o.createdAt.isAfter(startOfYesterday) &&
          o.createdAt.isBefore(startOfToday) &&
          !_isTestOrder(o);
    }).toList();
  }

  // Endast lokalt simulerade ordrar (från "Skicka test-order"-knappen) döljs
  // från historiken. Riktiga ordrar — även test/E2E-ordrar lagda via appen
  // (t.ex. med "testorder" i noteringen) — ska visas och sparas i historiken
  // (idag/igår). Den gamla heuristiken (note/namn/rabattkod) filtrerade bort
  // riktiga ordrar och fick dem att försvinna efter "på väg".
  bool _isTestOrder(OrderModel o) => o.id.startsWith('mock_');

  void simulateOrder() {
    final mockOrder = OrderModel(
      id: 'mock_${DateTime.now().millisecondsSinceEpoch}',
      orderNumber: (1000 + _orders.length).toString(),
      customerName: 'Test Jari',
      customerPhone: '070000000',
      deliveryStreet: 'Testgatan 1',
      deliveryCity: 'Testby',
      deliveryZip: '12345',
      items: [
        OrderItemModel(
            productName: 'Test Pizza',
            quantity: 1,
            subtotal: 100,
            basePrice: 100,
            selectedExtras: []),
      ],
      total: 100,
      deliveryFee: 0,
      status: 'PENDING',
      type: 'DELIVERY',
      createdAt: DateTime.now(),
      discountCode: 'testa',
      note: 'Dette är en test-order',
    );

    _orders.insert(0, mockOrder);
    _evaluateAlarms();
    _saveOrdersToCache();
    notifyListeners();
  }

  // TOTALS for cards
  double get todayTotal => todayHistoryOrders
      .where((o) => !['CANCELLED', 'REJECTED'].contains(o.status))
      .fold(0.0, (sum, o) => sum + o.total);

  double get yesterdayTotal => yesterdayHistoryOrders
      .where((o) => !['CANCELLED', 'REJECTED'].contains(o.status))
      .fold(0.0, (sum, o) => sum + o.total);

  Future<void> fetchOrders(String restaurantId) async {
    _restaurantId = restaurantId;

    // 1. Immediately try to load from cache so user sees something while loading
    if (_orders.isEmpty) {
      _isLoading = true;
      notifyListeners();
      await _loadOrdersFromCache();
    }

    try {
      debugPrint('📡 FETCHING ORDERS for restaurant: $restaurantId');
      final res = await _api.get('/api/admin/orders', queryParameters: {
        'restaurantId': restaurantId,
        'limit': '50',
      });

      if (res.statusCode == 200) {
        final List data = res.data['orders'] ?? res.data;

        // Merge-strategi: servern är källan för de ordrar den returnerar, men
        // vi BEHÅLLER lokala ordrar som servern inte skickade med — mock-ordrar
        // OCH nyligen slutförda/på-väg-ordrar (inom 2-dygnsfönstret). Innan
        // detta ersattes _orders rakt av med serversvaret, så en order försvann
        // ur historiken så fort den markerats "på väg"/"klar" om backend prunar
        // den ur aktiv-listan vid nästa fetch/reconnect.
        final List<OrderModel> serverOrders =
            data.map((o) => OrderModel.fromJson(o)).toList();
        final serverIds = serverOrders.map((o) => o.id).toSet();
        final cutoff = DateTime.now().subtract(const Duration(days: 2));
        final retainedLocal = _orders
            .where((o) =>
                !serverIds.contains(o.id) &&
                (o.id.startsWith('mock_') || o.createdAt.isAfter(cutoff)))
            .toList();

        _orders = [...serverOrders, ...retainedLocal];

        // Ta bort dubbletter (servern vinner — den ligger först)
        final seenIds = <String>{};
        _orders = _orders.where((o) => seenIds.add(o.id)).toList();

        // Sortera senaste först
        _orders.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        logger.log(
            'SUCCESS: Fetched ${_orders.length} orders. Pending: ${pendingOrders.length}');
        _saveOrdersToCache();
      }
    } catch (e) {
      logger.log('FETCH ERROR: $e');
      if (_orders.isEmpty) {
        await _loadOrdersFromCache();
      }
    }

    _isLoading = false;
    _evaluateAlarms();
    notifyListeners();
    _fetchRestaurantStatus();
  }

  // Client-side auto-status check removed.
  // The backend now completely handles automated status transitions and broadcasts them via Socket.IO
  // using the 'status:auto-updated' event.

  bool isBeforeOpening() {
    final now = DateTime.now();
    final parts = openingTime.split(':');
    final openHour = int.parse(parts[0]);
    final openMinute = int.parse(parts[1]);

    if (now.hour < openHour) return true;
    if (now.hour == openHour && now.minute < openMinute) return true;
    return false;
  }

  Future<void> setStatus(bool open) async {
    if (_restaurantId == null) return;
    _isRestaurantOpen = open;
    // Att öppna restaurangen avbryter alltid en aktiv paus — annars blir den
    // kvar (isPaused = true) och statusen kan inte återgå till "Öppet".
    if (open && _pausedUntil != null) {
      _pauseTimer?.cancel();
      _pausedUntil = null;
      await _persistPause();
      await _syncPauseToBackend();
    }
    notifyListeners();

    try {
      await _api.patch('/api/restaurants/$_restaurantId', {
        'isOpen': _isRestaurantOpen,
      });
      logger.log('STATUS SET: ${_isRestaurantOpen ? "OPEN" : "CLOSED"}');
    } catch (e) {
      logger.log('STATUS SET ERROR: $e');
      _isRestaurantOpen = !_isRestaurantOpen; // Rollback
      notifyListeners();
    }
  }

  Future<void> _saveOrdersToCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final now = DateTime.now();

      // Filter out completed/cancelled orders older than 2 days
      final cutoff = now.subtract(const Duration(days: 2));
      final validOrders = _orders.where((o) {
        if (!['COMPLETED', 'DELIVERED', 'CANCELLED', 'REJECTED']
            .contains(o.status)) return true;
        return o.createdAt.isAfter(cutoff);
      }).toList();

      final encoded = jsonEncode(validOrders.map((o) => o.toJson()).toList());
      await prefs.setString('cached_orders_$_restaurantId', encoded);
    } catch (e) {
      debugPrint('Cache saving error: $e');
    }
  }

  Future<void> _loadOrdersFromCache() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final encoded = prefs.getString('cached_orders_$_restaurantId');
      if (encoded != null) {
        final List data = jsonDecode(encoded);
        _orders = data.map((o) => OrderModel.fromJson(o)).toList();
        _evaluateAlarms();
        notifyListeners();
      }
    } catch (e) {
      debugPrint('Cache loading error: $e');
    }
  }

  Future<void> _fetchRestaurantStatus() async {
    if (_restaurantId == null) return;
    try {
      final res = await _api.get('/api/restaurants');
      if (res.statusCode == 200) {
        final List data = res.data;
        final current = data.firstWhere((r) => r['id'] == _restaurantId,
            orElse: () => null);
        if (current != null) {
          _isRestaurantOpen =
              current['manualIsOpen'] ?? current['isOpen'] ?? true;

          // Backend är källa till sanning för pause – synka in den
          final pausedIso = current['pausedUntil'];
          if (pausedIso is String && pausedIso.isNotEmpty) {
            final until = DateTime.tryParse(pausedIso)?.toLocal();
            if (until != null && until.isAfter(DateTime.now())) {
              _pausedUntil = until;
              await _persistPause();
              _scheduleResume();
            } else {
              _pausedUntil = null;
              await _persistPause();
            }
          } else if (_pausedUntil != null) {
            // Backend säger no pause men vi har lokal pause – backend vinner
            _pausedUntil = null;
            _pauseTimer?.cancel();
            await _persistPause();
          }

          final Map<String, dynamic> allHours = current['openingHours'] ?? {};
          final hoursString = allHours.toString();

          if (_lastKnownHours.isNotEmpty && _lastKnownHours != hoursString) {
            logger.log('ADMIN CHANGED SCHEDULE: Resetting manual override.');
          }
          _lastKnownHours = hoursString;

          final now = DateTime.now();
          final dayName = _getDayName(now.weekday).toLowerCase();

          // Look for day key case-insensitively
          dynamic dayData;
          allHours.forEach((key, value) {
            if (key.toLowerCase() == dayName) dayData = value;
          });

          if (dayData != null) {
            Map? slot;
            if (dayData is Map) {
              if (dayData.containsKey('open')) {
                slot = dayData;
              } else if (dayData.containsKey('shifts') &&
                  dayData['shifts'] is List &&
                  (dayData['shifts'] as List).isNotEmpty) {
                slot = dayData['shifts'][0];
              }
            }
            if (slot != null &&
                slot.containsKey('open') &&
                slot.containsKey('close')) {
              openingTime = slot['open'];
              closingTime = slot['close'];
              logger.log(
                  'SCHEDULE LOADED: $dayName is $openingTime - $closingTime');
            }
          }

          notifyListeners();
        }
      }
    } catch (e) {
      logger.log('ERROR FETCHING STATUS: $e');
    }
  }

  String _getDayName(int weekday) {
    switch (weekday) {
      case 1:
        return 'monday';
      case 2:
        return 'tuesday';
      case 3:
        return 'wednesday';
      case 4:
        return 'thursday';
      case 5:
        return 'friday';
      case 6:
        return 'saturday';
      case 7:
        return 'sunday';
      default:
        return 'monday';
    }
  }

  Future<void> toggleRestaurantStatus() async {
    if (_restaurantId == null) return;
    _isRestaurantOpen = !_isRestaurantOpen;
    notifyListeners();

    try {
      await _api.patch('/api/restaurants/$_restaurantId', {
        'isOpen': _isRestaurantOpen,
      });
      logger.log('STATUS TOGGLED: ${_isRestaurantOpen ? "OPEN" : "CLOSED"}');
    } catch (e) {
      logger.log('STATUS TOGGLE ERROR: $e');
      _isRestaurantOpen = !_isRestaurantOpen; // Rollback
      notifyListeners();
    }
  }

  Future<List<dynamic>> fetchMenu(String restaurantId) async {
    try {
      // Use ADMIN endpoint to get ALL products (even inactive) for toggle control.
      // includeGlobal=auto: if the restaurant has no own categories (like Palmyra which uses
      // restaurantId=null in the DB), the server will automatically return global categories.
      final res = await _api.get('/api/admin/categories', queryParameters: {
        'restaurantId': restaurantId,
        'includeProducts': 'true',
        'includeGlobal': 'auto',
      });
      if (res.statusCode == 200) {
        final data = res.data;
        final List<dynamic> categories = (data is List)
            ? data
            : (data is Map && data.containsKey('categories'))
                ? (data['categories'] as List<dynamic>)
                : <dynamic>[];

        // /api/admin/categories returns money fields in öre (inte kr).
        // Normalize to kr for UI consistency.
        for (final cat in categories) {
          if (cat is! Map) continue;
          final products = cat['products'];
          if (products is! List) continue;

          for (final prod in products) {
            if (prod is! Map) continue;
            final price = prod['price'];
            if (price is num) prod['price'] = price.toDouble() / 100.0;

            final groups = prod['extraGroups'];
            if (groups is! List) continue;
            for (final g in groups) {
              if (g is! Map) continue;
              final extraGroup = g['extraGroup'] ?? g;
              if (extraGroup is! Map) continue;
              final extras = extraGroup['extras'];
              if (extras is! List) continue;
              for (final e in extras) {
                if (e is! Map) continue;
                final addon = e['priceAddon'];
                if (addon is num) e['priceAddon'] = addon.toDouble() / 100.0;
              }
            }
          }
        }

        return categories;
      }
    } catch (e) {
      debugPrint('Error fetching menu: $e');
    }
    return [];
  }

  Future<bool> updateProductStatus(String productId, bool isActive) async {
    try {
      final res = await _api
          .patch('/api/admin/products/$productId', {'isActive': isActive});
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('Error updating product status: $e');
      return false;
    }
  }

  Future<bool> updateExtraStatus(String extraId, bool isActive) async {
    try {
      final res = await _api
          .patch('/api/admin/extras/$extraId', {'isActive': isActive});
      return res.statusCode == 200;
    } catch (e) {
      debugPrint('Error updating extra status: $e');
      return false;
    }
  }

  Future<void> initSocket(String restaurantId) async {
    if (_socketInitializing) return;
    if (_socket != null &&
        _socket!.connected &&
        _restaurantId == restaurantId) {
      return; // Already initialized for this restaurant
    }
    _socketInitializing = true;
    _restaurantId = restaurantId;
    if (_socket != null) _socket!.dispose();

    final token = await SecureTokenStore.readToken() ?? '';

    _socket = socket_io.io(
        AppConstants.socketUrl,
        socket_io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .setAuth({'token': token})
            .enableAutoConnect()
            // Aldrig ge upp – appen ska återansluta så länge nätet kommer
            // tillbaka. Socket.IO klienten har redan exponential backoff
            // mellan setReconnectionDelay och setReconnectionDelayMax.
            .setReconnectionAttempts(1 << 30)
            .setReconnectionDelay(1000)
            .setReconnectionDelayMax(30000)
            .setRandomizationFactor(0.5)
            .build());

    _socket!.onConnect((_) {
      _socketInitializing = false;
      _socket!
          .emit('join:admin', {'restaurantId': restaurantId, 'token': token});
      logger.log('SOCKET CONNECTED: $restaurantId');
      // Sync ev. ordrar som tappats under offline-perioden
      fetchOrders(restaurantId);
      _handleConnectivity(false); // tillbaka online → dölj röd skärm, tysta larm
    });

    _socket!.onConnectError((err) {
      _socketInitializing = false;
      logger.log('SOCKET CONNECT ERROR: $err');
      // Når servern inte (t.ex. ingen internet vid uppstart) → offline-läge.
      _handleConnectivity(true);
    });

    _socket!.onReconnectAttempt((attempt) {
      logger.log('SOCKET RECONNECT attempt #$attempt');
    });

    _socket!.onReconnectFailed((_) {
      // Säkerhetsnät: om socket.io ändå skulle ge upp – starta om från noll.
      logger.log('SOCKET RECONNECT FAILED – startar om socket på nytt');
      Future.delayed(const Duration(seconds: 5), () {
        if (_restaurantId != null) initSocket(_restaurantId!);
      });
    });

    _socket!.on('order:new', (data) {
      debugPrint('📩 SOCKET: NEW ORDER RECEIVED: ${data['id']}');
      final newOrder = OrderModel.fromJson(data);
      if (!_orders.any((o) => o.id == newOrder.id)) {
        _orders.insert(0, newOrder);
        _saveOrdersToCache();

        // Vibrera direkt. Ljudet startas av _evaluateAlarms() nedan som EN
        // loopande spelare (spelas en gång, fortsätter tills ordern godkänts).
        // Vi spelar INTE ett extra one-shot här — det orsakade dubbel-ljudet.
        HapticFeedback.vibrate();
        HapticFeedback.heavyImpact();

        // Auto-print happens when the order is accepted (see updateStatus),
        // not on arrival — so the restaurant controls when the kitchen gets the ticket.

        _evaluateAlarms();
        notifyListeners();
      } else {
        debugPrint('📩 SOCKET: ORDER ALREADY EXISTS IN LIST');
      }
    });

    _socket!.onDisconnect((_) {
      logger.log('SOCKET DISCONNECTED');
      _handleConnectivity(true); // röd skärm + lugn signal (vid öppettid)
    });

    _socket!.on('order:updated', (data) {
      if (data is Map &&
          data.containsKey('orderId') &&
          data.containsKey('status')) {
        _updateLocalOrderStatus(
            data['orderId'].toString(),
            data['status'].toString(),
            data['estimatedTime'] != null
                ? int.tryParse(data['estimatedTime'].toString())
                : null);
      } else {
        fetchOrders(restaurantId);
      }
    });

    _socket!.on('settings:updated', (data) {
      debugPrint('📩 SOCKET EVENT: settings:updated RECEIVED: $data');
      if (data['restaurantId'] == _restaurantId ||
          data['restaurantId'].toString() == _restaurantId) {
        // Synka pause-state direkt från socket-payload
        if (data.containsKey('pausedUntil')) {
          final iso = data['pausedUntil'];
          if (iso is String && iso.isNotEmpty) {
            final until = DateTime.tryParse(iso)?.toLocal();
            if (until != null && until.isAfter(DateTime.now())) {
              _pausedUntil = until;
              _persistPause();
              _scheduleResume();
            }
          } else {
            _pauseTimer?.cancel();
            _pausedUntil = null;
            _persistPause();
          }
        }
        if (data.containsKey('isOpen')) {
          _isRestaurantOpen = data['isOpen'];
          notifyListeners();
        } else {
          _fetchRestaurantStatus();
        }
      }
    });

    _socket!.on('status:auto-updated', (data) {
      debugPrint('📩 SOCKET EVENT: status:auto-updated RECEIVED: $data');
      // This comes specifically from the server watchdog
      logger.log(
          'SOCKET: Status AUTO-UPDATED by server: ${data['isOpen'] ? "OPEN" : "CLOSED"}');
      _isRestaurantOpen = data['isOpen'];
      notifyListeners();
    });

    // Admin har loggat ut/raderat den här plattan → låt AuthProvider
    // omvärdera sessionen direkt (→ låsskärm / pairing) utan att vänta på
    // nästa API-anrop.
    _socket!.on('device:session-changed', (data) {
      logger.log('📩 SOCKET EVENT: device:session-changed: $data');
      if (data is Map) {
        onDeviceSessionChanged?.call(Map<String, dynamic>.from(data));
      }
    });

    // Start watchdogs
    _alarmWatchdog?.cancel();
    _alarmWatchdog =
        Timer.periodic(const Duration(seconds: 10), (_) => _evaluateAlarms());

    // Removed client side status watchdog, rely on server push.
  }

  // ── Connection-lost-larm ──────────────────────────────────────────────────
  void _handleConnectivity(bool offline) {
    final was = _isOffline;
    _isOffline = offline;
    if (offline && !was) {
      _startDisconnectAlarm();
    } else if (!offline && was) {
      _stopDisconnectAlarm();
    }
    notifyListeners();
  }

  void _startDisconnectAlarm() {
    _disconnectAlarmTimer?.cancel();
    _disconnectReAlertTimer?.cancel();
    _disconnectAcknowledged = false;
    _maybePlayDisconnect(); // direkt en gång
    _disconnectAlarmTimer = Timer.periodic(
        const Duration(seconds: 10), (_) => _maybePlayDisconnect());
  }

  void _maybePlayDisconnect() {
    if (!_isOffline) {
      _stopDisconnectAlarm();
      return;
    }
    if (!_isRestaurantOpen) return; // stängt → tyst, bara röd skärm
    if (_disconnectAcknowledged) return; // användaren har tystat
    AudioHelper.playAudio('disconnect.wav'); // lugn engångspling var 10:e sek
    HapticFeedback.mediumImpact();
  }

  /// Anropas när användaren trycker på den röda offline-skärmen → tystar
  /// signalen och döljer skärmen. Efter [_disconnectReAlertAfter] återupptas
  /// signalen + skärmen om appen fortfarande är offline (endast under öppettider
  /// hörs något).
  void acknowledgeDisconnect() {
    if (!_isOffline) return;
    _disconnectAcknowledged = true;
    AudioHelper.stopOneShot();
    notifyListeners();
    _disconnectReAlertTimer?.cancel();
    _disconnectReAlertTimer = Timer(_disconnectReAlertAfter, () {
      if (_isOffline) {
        _disconnectAcknowledged = false;
        _maybePlayDisconnect();
        notifyListeners();
      }
    });
  }

  void _stopDisconnectAlarm() {
    _disconnectAlarmTimer?.cancel();
    _disconnectAlarmTimer = null;
    _disconnectReAlertTimer?.cancel();
    _disconnectReAlertTimer = null;
    _disconnectAcknowledged = false;
    AudioHelper.stopOneShot();
  }

  void _evaluateAlarms() {
    debugPrint(
        '📢 Watchdog: Evaluating alarms. Pending: ${pendingOrders.length}');
    if (pendingOrders.isNotEmpty) {
      // Intense "Dring-Dring" effect by playing/vibrating in a short sequence
      AudioHelper.startLooping(_selectedAlarm);

      // Pulse vibration every time watchdog runs (every 10s)
      HapticFeedback.vibrate();
      Future.delayed(const Duration(milliseconds: 500),
          () => HapticFeedback.heavyImpact());
      Future.delayed(
          const Duration(milliseconds: 1000), () => HapticFeedback.vibrate());
    } else {
      AudioHelper.stopLooping();
    }
  }

  Future<void> playDisconnectAlarm() async {
    await AudioHelper.playAudio('disconnect.wav');
  }

  // Used for settings menu
  Future<void> testAlarm() async {
    await AudioHelper.playTest(_selectedAlarm);
  }

  Future<bool> updateStatus(String orderId, String status,
      {int? estimatedTime}) async {
    try {
      final body = <String, dynamic>{'status': status};
      if (estimatedTime != null) body['estimatedTime'] = estimatedTime;

      // Tidigare status (innan uppdateringen) — används för att avgöra OM detta
      // är själva godkännandet (PENDING → ACCEPTED/PREPARING) så auto-print
      // sker exakt EN gång och aldrig innan ordern godkänts.
      final prevIdx = _orders.indexWhere((o) => o.id == orderId);
      final prevStatus = prevIdx != -1 ? _orders[prevIdx].status : null;
      final isApproval = (prevStatus == null || prevStatus == 'PENDING') &&
          (status == 'ACCEPTED' || status == 'PREPARING');

      // Handle mock/test orders locally (no API needed)
      if (orderId.startsWith('mock_')) {
        _updateLocalOrderStatus(orderId, status, estimatedTime);
        return true;
      }

      final res = await _api.patch('/api/admin/orders/$orderId/status', body);

      if (res.statusCode == 200) {
        _updateLocalOrderStatus(orderId, status, estimatedTime);
        logger.log(
            'STATUS UPDATED: Order #$orderId -> $status ($estimatedTime min)');
        // Auto-print AUTOMATISKT direkt när restaurangen godkänner ordern —
        // aldrig innan. Godkännandet kan sätta ACCEPTED (detalj-sidan) eller
        // PREPARING (snabb-accept i order-take), därför fångar vi själva
        // PENDING→godkänd-övergången. forceToPrinter=true → skriver alltid till
        // konfigurerad skrivare oavsett toggle, ingen PDF-popup, tyst om ingen
        // skrivare. Skrivs ut exakt en gång (ej vid efterföljande steg-byten).
        if (isApproval) {
          final idx = _orders.indexWhere((o) => o.id == orderId);
          if (idx != -1) {
            unawaited(PrintService.printReceipt(_orders[idx], forceToPrinter: true));
          }
        }
        return true;
      }
      return false;
    } catch (e) {
      logger.log('UPDATE STATUS ERROR: $e');
      return false;
    }
  }

  void _updateLocalOrderStatus(
      String orderId, String status, int? estimatedTime) {
    final idx = _orders.indexWhere((o) => o.id == orderId);
    if (idx != -1) {
      _orders[idx] =
          _orders[idx].copyWith(status: status, estimatedTime: estimatedTime);
      _saveOrdersToCache();
      _evaluateAlarms();
      notifyListeners();
    }
  }

  void refresh() {
    if (_restaurantId != null) fetchOrders(_restaurantId!);
  }

  @override
  void dispose() {
    _socket?.dispose();
    _alarmWatchdog?.cancel();
    _pauseTimer?.cancel();
    _disconnectAlarmTimer?.cancel();
    _disconnectReAlertTimer?.cancel();
    AudioHelper.stopAll();
    super.dispose();
  }
}
