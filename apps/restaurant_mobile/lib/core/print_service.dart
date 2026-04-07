import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';
import '../models/order_model.dart';
import 'package:intl/intl.dart';

class PrintService {
  static Future<void> printReceipt(OrderModel order) async {
    final pdf = pw.Document();

    pdf.addPage(
      pw.Page(
        pageFormat: PdfPageFormat.roll80, // Thermal printer standard width
        build: (pw.Context context) {
          return pw.Padding(
            padding: const pw.EdgeInsets.all(10),
            child: pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Center(
                  child: pw.Text('MATGO ORDER', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 18)),
                ),
                pw.Divider(thickness: 1),
                pw.Text('ORDER #${order.orderNumber}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 16)),
                pw.Text('Typ: ${order.type == "DELIVERY" ? "UTKÖRNING" : "AVHÄMTNING"}'),
                pw.Text('Datum: ${DateFormat('yyyy-MM-dd HH:mm').format(order.createdAt)}'),
                pw.SizedBox(height: 10),
                pw.Text('KUND: ${order.customerName}'),
                pw.Text('TEL: ${order.customerPhone}'),
                if (order.type == 'DELIVERY') ...[
                  pw.Text('ADRESS: ${order.deliveryStreet ?? ""}'),
                  pw.Text('${order.deliveryZip ?? ""} ${order.deliveryCity ?? ""}'),
                ],
                if (order.note != null && order.note!.isNotEmpty) ...[
                  pw.SizedBox(height: 5),
                  pw.Text('NOTERING: ${order.note}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontStyle: pw.FontStyle.italic)),
                ],
                pw.Divider(thickness: 1),
                pw.SizedBox(height: 5),
                ...order.items.map((item) => pw.Column(
                  crossAxisAlignment: pw.CrossAxisAlignment.start,
                  children: [
                    pw.Row(
                      mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                      children: [
                        pw.Text('${item.quantity}x ${item.productName}', style: pw.TextStyle(fontWeight: pw.FontWeight.bold)),
                        pw.Text('${item.subtotal.toInt()} KR'),
                      ],
                    ),
                    if (item.selectedExtras.isNotEmpty)
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(left: 10),
                        child: pw.Text('+ ${item.selectedExtras.join(", ")}', style: const pw.TextStyle(fontSize: 10)),
                      ),
                    if (item.note != null && item.note!.isNotEmpty)
                      pw.Padding(
                        padding: const pw.EdgeInsets.only(left: 10),
                        child: pw.Text('Not: ${item.note}', style: const pw.TextStyle(fontStyle: pw.FontStyle.italic, fontSize: 10)),
                      ),
                    pw.SizedBox(height: 5),
                  ],
                )),
                pw.Divider(thickness: 1),
                pw.Row(
                  mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
                  children: [
                    pw.Text('TOTALT:', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 14)),
                    pw.Text('${order.total.toInt()} KR', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 14)),
                  ],
                ),
                if (order.deliveryFee > 0)
                   pw.Text('Inkl. leveransavgift: ${order.deliveryFee.toInt()} kr', style: const pw.TextStyle(fontSize: 8)),
                pw.SizedBox(height: 20),
                pw.Center(
                  child: pw.Text('Tack för din beställning!', style: const pw.TextStyle(fontSize: 10)),
                ),
              ],
            ),
          );
        },
      ),
    );

    await Printing.layoutPdf(
      onLayout: (PdfPageFormat format) async => pdf.save(),
      name: 'MatGo_Order_${order.orderNumber}',
    );
  }
}
