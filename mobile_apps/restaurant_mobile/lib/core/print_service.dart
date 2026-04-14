import 'package:flutter/services.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:esc_pos_utils_plus/esc_pos_utils_plus.dart';
import 'dart:io';
import '../models/order_model.dart';

class PrintService {
  static Future<void> printReceipt(OrderModel order) async {
    final doc = pw.Document();
    
    // Modern High-End Styling
    final font = await PdfGoogleFonts.robotoMonoBold();
    final regularFont = await PdfGoogleFonts.robotoMonoRegular();

    doc.addPage(
      pw.Page(
        pageFormat: const PdfPageFormat(80 * PdfPageFormat.mm, double.infinity, marginAll: 5 * PdfPageFormat.mm),
        build: (pw.Context context) {
          return pw.Column(
            crossAxisAlignment: pw.CrossAxisAlignment.start,
            children: [
              // Header
              pw.Center(
                child: pw.Column(children: [
                  pw.Text('MATGO BUSINESS', style: pw.TextStyle(font: font, fontSize: 16)),
                  pw.SizedBox(height: 5),
                  pw.Text('PREMIUM RESTAURANT SYSTEM', style: pw.TextStyle(font: regularFont, fontSize: 8, color: PdfColors.grey700)),
                  pw.SizedBox(height: 10),
                  pw.Divider(thickness: 1),
                  pw.SizedBox(height: 10),
                ]),
              ),

              // Order Number
              pw.Center(
                child: pw.Column(children: [
                   pw.Text('ORDER #${order.orderNumber}', style: pw.TextStyle(font: font, fontSize: 24)),
                   pw.SizedBox(height: 5),
                   pw.Text(order.type == 'DELIVERY' ? '>>>> UTKÖRNING <<<<' : '>>>> AVHÄMTNING <<<<', style: pw.TextStyle(font: font, fontSize: 10)),
                ]),
              ),

              pw.SizedBox(height: 15),
              pw.Divider(),
              pw.SizedBox(height: 10),

              // Customer Info
              pw.Text('KUND: ${order.customerName.toUpperCase()}', style: pw.TextStyle(font: font, fontSize: 11)),
              pw.Text('TEL: ${order.customerPhone}', style: pw.TextStyle(font: regularFont, fontSize: 10)),
              if (order.type == 'DELIVERY') ...[
                pw.SizedBox(height: 5),
                pw.Text('ADRESS:', style: pw.TextStyle(font: font, fontSize: 9)),
                pw.Text('${order.deliveryStreet}', style: pw.TextStyle(font: regularFont, fontSize: 10)),
                pw.Text('${order.deliveryZip} ${order.deliveryCity}', style: pw.TextStyle(font: regularFont, fontSize: 10)),
                if (order.deliveryInstructions != null && order.deliveryInstructions!.isNotEmpty) ...[
                  pw.SizedBox(height: 5),
                  pw.Text('INSTRUKTIONER:', style: pw.TextStyle(font: font, fontSize: 9)),
                  pw.Text('${order.deliveryInstructions}', style: pw.TextStyle(font: font, fontSize: 10)),
                ],
              ],
              if (order.note != null && order.note!.isNotEmpty) ...[
                pw.SizedBox(height: 10),
                pw.Container(
                  padding: const pw.EdgeInsets.all(5),
                  decoration: pw.BoxDecoration(border: pw.Border.all(width: 1)),
                  child: pw.Text('NOTERING: ${order.note}', style: pw.TextStyle(font: regularFont, fontSize: 9, fontStyle: pw.FontStyle.italic)),
                ),
              ],

              pw.SizedBox(height: 15),
              pw.Divider(thickness: 1),
              pw.SizedBox(height: 10),

              // Items
              ...order.items.map((item) => pw.Padding(
                padding: const pw.EdgeInsets.only(bottom: 8),
                child: pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Row(
                      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                      children: [
                        pw.Text('${item.quantity}x ${item.productName.toUpperCase()}', style: pw.TextStyle(font: font, fontSize: 11)),
                        pw.Text('${item.subtotal.toInt()} KR', style: pw.TextStyle(font: font, fontSize: 11)),
                      ],
                    ),
                    if (item.selectedExtras.isNotEmpty)
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(left: 10, top: 4),
                        child: pw.Text(' + ${item.selectedExtras.join(", ")}'.toUpperCase(), 
                          style: pw.TextStyle(font: regularFont, fontSize: 8, color: PdfColors.grey900)),
                      ),
                    if (item.note != null && item.note!.isNotEmpty)
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(left: 10, top: 4),
                        child: pw.Text(' ! NOTERING: ${item.note}'.toUpperCase(), 
                          style: pw.TextStyle(font: regularFont, fontSize: 8, color: PdfColors.red800)),
                      ),
                  ],
                ),
              )),

              pw.SizedBox(height: 15),
              pw.Divider(thickness: 1),
              pw.SizedBox(height: 10),

              // Total
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text('TOTALT ATT BETALA:', style: pw.TextStyle(font: font, fontSize: 14)),
                  pw.Text('${order.total.toInt()} KR', style: pw.TextStyle(font: font, fontSize: 16)),
                ],
              ),
              pw.SizedBox(height: 5),
              pw.Row(
                mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                children: [
                  pw.Text('BETALNINGSMETOD:', style: pw.TextStyle(font: regularFont, fontSize: 9)),
                  pw.Text(order.paymentMethod?.toUpperCase() ?? 'KORT (ONLINE)', style: pw.TextStyle(font: font, fontSize: 10)),
                ],
              ),

              pw.SizedBox(height: 30),
              pw.Center(
                child: pw.Column(children: [
                  pw.Text('TACK FÖR DIN BESTÄLLNING!', style: pw.TextStyle(font: font, fontSize: 9)),
                  pw.SizedBox(height: 4),
                  pw.Text(DateTime.now().toString().substring(0, 16), style: pw.TextStyle(font: regularFont, fontSize: 7, color: PdfColors.grey600)),
                  pw.SizedBox(height: 20),
                  pw.Container(height: 10), // Padding
                ]),
              ),
            ],
          );
        },
      ),
    );

    final prefs = await SharedPreferences.getInstance();
    final ip = prefs.getString('printer_ip');

    if (ip != null && ip.isNotEmpty && ip.contains('.')) {
      try {
        final profile = await CapabilityProfile.load();
        final generator = Generator(PaperSize.mm80, profile);
        List<int> bytes = [];

        bytes += generator.text('MATGO BUSINESS', styles: const PosStyles(align: PosAlign.center, height: PosTextSize.size2, width: PosTextSize.size2));
        bytes += generator.feed(1);
        bytes += generator.text('ORDER #${order.orderNumber}', styles: const PosStyles(align: PosAlign.center, bold: true, height: PosTextSize.size2, width: PosTextSize.size2));
        bytes += generator.text(order.type == 'DELIVERY' ? 'UTKORNING' : 'AVHAMTNING', styles: const PosStyles(align: PosAlign.center, bold: true));
        bytes += generator.hr();
        bytes += generator.feed(1);
        
        bytes += generator.text('KUND: ${order.customerName.toUpperCase()}', styles: const PosStyles(bold: true));
        bytes += generator.text('TEL: ${order.customerPhone}');
        
        if (order.type == 'DELIVERY') {
          bytes += generator.feed(1);
          bytes += generator.text('ADRESS:');
          bytes += generator.text('${order.deliveryStreet}');
          bytes += generator.text('${order.deliveryZip} ${order.deliveryCity}');
          if (order.deliveryInstructions != null && order.deliveryInstructions!.isNotEmpty) {
            bytes += generator.text('INSTRUKTION: ${order.deliveryInstructions}', styles: const PosStyles(bold: true));
          }
        }
        
        if (order.note != null && order.note!.isNotEmpty) {
           bytes += generator.feed(1);
           bytes += generator.text('NOTERING: ${order.note}', styles: const PosStyles(bold: true));
        }

        bytes += generator.feed(1);
        bytes += generator.hr();
        bytes += generator.feed(1);
        
        for (var item in order.items) {
           bytes += generator.row([
             PosColumn(text: '${item.quantity}x ${item.productName.toUpperCase()}', width: 9, styles: const PosStyles(bold: true)),
             PosColumn(text: '${item.subtotal.toInt()} KR', width: 3, styles: const PosStyles(align: PosAlign.right)),
           ]);
           if (item.selectedExtras.isNotEmpty) {
             bytes += generator.text('   + ${item.selectedExtras.join(', ')}');
           }
           if (item.note != null && item.note!.isNotEmpty) {
             bytes += generator.text('   ! NOT: ${item.note}', styles: const PosStyles(bold: true));
           }
        }

        bytes += generator.feed(1);
        bytes += generator.hr();
        bytes += generator.feed(1);

        bytes += generator.row([
             PosColumn(text: 'TOTALT:', width: 6, styles: const PosStyles(bold: true, height: PosTextSize.size2, width: PosTextSize.size2)),
             PosColumn(text: '${order.total.toInt()} KR', width: 6, styles: const PosStyles(align: PosAlign.right, bold: true, height: PosTextSize.size2, width: PosTextSize.size2)),
        ]);
        
        bytes += generator.feed(2);
        bytes += generator.text('TACK FOR DIN BESTALLNING!', styles: const PosStyles(align: PosAlign.center));
        bytes += generator.text(DateTime.now().toString().substring(0, 16), styles: const PosStyles(align: PosAlign.center));
        bytes += generator.feed(2);
        bytes += generator.cut();

        final socket = await Socket.connect(ip, 9100, timeout: const Duration(seconds: 5));
        socket.add(bytes);
        await socket.flush();
        socket.destroy();
        return; 
      } catch (e) {
        print('Network print failed, falling back to PDF: $e');
      }
    }

    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => doc.save(),
      name: 'Order_${order.orderNumber}',
    );
  }
}
