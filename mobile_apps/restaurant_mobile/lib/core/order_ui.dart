import 'package:flutter/material.dart';

import '../models/order_model.dart';
import 'theme.dart';

class OrderUi {
  static String formatCurrency(num value) {
    final rounded = value.toStringAsFixed(value % 1 == 0 ? 0 : 2);
    return '$rounded kr';
  }

  static String formatTime(DateTime dateTime) {
    final hour = dateTime.hour.toString().padLeft(2, '0');
    final minute = dateTime.minute.toString().padLeft(2, '0');
    return '$hour:$minute';
  }

  static String formatDate(DateTime dateTime) {
    final day = dateTime.day.toString().padLeft(2, '0');
    final month = dateTime.month.toString().padLeft(2, '0');
    return '$day/$month/${dateTime.year}';
  }

  static String formatDateTime(DateTime dateTime) {
    return '${formatDate(dateTime)} ${formatTime(dateTime)}';
  }

  static String typeLabel(String type) {
    return type == 'DELIVERY' ? 'Utkörning' : 'Avhämtning';
  }

  static IconData typeIcon(String type) {
    return type == 'DELIVERY'
        ? Icons.delivery_dining_rounded
        : Icons.shopping_bag_rounded;
  }

  static Color typeColor(String type) {
    return type == 'DELIVERY' ? AppTheme.brandBlue : AppTheme.brandGold;
  }

  static String statusLabel(String status) {
    switch (status) {
      case 'PENDING':
        return 'Väntar';
      case 'ACCEPTED':
        return 'Bekräftad';
      case 'PREPARING':
        return 'Tillagas';
      case 'READY':
        return 'Klar';
      case 'DELIVERING':
        return 'På väg';
      case 'DELIVERED':
      case 'COMPLETED':
        return 'Levererad';
      case 'CANCELLED':
        return 'Avbruten';
      case 'REJECTED':
        return 'Nekad';
      default:
        return status;
    }
  }

  static Color statusColor(String status) {
    switch (status) {
      case 'PENDING':
        return AppTheme.warning;
      case 'ACCEPTED':
      case 'PREPARING':
        return AppTheme.info;
      case 'READY':
      case 'DELIVERING':
      case 'DELIVERED':
      case 'COMPLETED':
        return AppTheme.success;
      case 'CANCELLED':
      case 'REJECTED':
        return AppTheme.danger;
      default:
        return AppTheme.gold;
    }
  }

  static bool isFinished(String status) {
    return const {
      'DELIVERED',
      'COMPLETED',
      'CANCELLED',
      'REJECTED',
    }.contains(status);
  }

  static bool isScheduled(OrderModel order) => order.scheduledFor != null;

  static String scheduledLabel(OrderModel order) {
    final scheduled = order.scheduledFor;
    if (scheduled == null) return '';
    return '${formatDate(scheduled)} kl ${formatTime(scheduled)}';
  }

  static String deliveryInstructionLabel(String? value) {
    if (value == null || value.isEmpty) return '';
    switch (value.toUpperCase().trim()) {
      case 'RING_DOORBELL':
        return 'Ring på dörren';
      case 'LEAVE_AT_DOOR':
        return 'Lämna vid dörren';
      case 'MEET_OUTSIDE':
        return 'Möt mig utanför';
      case 'MEET_AT_DOOR':
        return 'Möt vid dörren';
      case 'NO_CONTACT':
        return 'Kontaktfri leverans';
      case 'CALL_ON_ARRIVAL':
        return 'Ring vid ankomst';
      default:
        return value;
    }
  }
}
