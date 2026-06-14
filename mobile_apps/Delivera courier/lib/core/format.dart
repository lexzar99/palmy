import 'package:intl/intl.dart';

/// Formaterings-helpers — speglar `apps/courier/src/lib/format.ts` så att
/// kuriren ser exakt samma siffror i Flutter-appen som i webben.

final NumberFormat _kr = NumberFormat.decimalPattern('sv_SE');

/// "120 kr" — heltal, svensk tusentalsavgränsare.
String kr(num n) => '${_kr.format((n).round())} kr';

/// "2,4 km" — en decimal, svenskt komma.
String km(num n) => '${n.toStringAsFixed(1).replaceAll('.', ',')} km';

/// Sekunder kvar tills en epoch-ms-tidsstämpel (golvat vid 0).
int secondsLeft(int epochMs) {
  final diff = (epochMs - DateTime.now().millisecondsSinceEpoch) / 1000;
  return diff < 0 ? 0 : diff.round();
}

/// "Idag" / "Igår" / "måndag 3 jun".
String dayLabel(DateTime d) {
  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);
  final that = DateTime(d.year, d.month, d.day);
  final diff = today.difference(that).inDays;
  if (diff == 0) return 'Idag';
  if (diff == 1) return 'Igår';
  return DateFormat('EEEE d MMM', 'sv_SE').format(d);
}

/// "18:09" — tid på dygnet.
String timeOfDay(DateTime d) => DateFormat('HH:mm').format(d);

/// "8 jun" — kort datum (för datumintervall).
String dateShort(DateTime d) => DateFormat('d MMM', 'sv_SE').format(d);

/// "8 jun – 14 jun" eller "14 jun" om start = slut.
String dateRangeLabel(DateTime start, DateTime end) {
  final a = DateTime(start.year, start.month, start.day);
  final b = DateTime(end.year, end.month, end.day);
  if (a == b) return dateShort(a);
  return '${dateShort(a)} – ${dateShort(b)}';
}

/// "11 min" — minuter.
String minutes(num n) => '${n.round()} min';
