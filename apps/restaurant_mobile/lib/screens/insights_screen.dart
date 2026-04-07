import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/order_provider.dart';
import '../core/theme.dart';

class InsightsScreen extends StatelessWidget {
  const InsightsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.charcoal,
        elevation: 0,
        title: const Text('INSIGHTS & STATISTIK',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2)),
      ),
      body: Consumer<OrderProvider>(
        builder: (context, provider, _) {
          final todayOrders = provider.todayHistoryOrders;
          final yesterdayOrders = provider.yesterdayHistoryOrders;
          
          final avgToday = todayOrders.isEmpty ? 0 : (provider.todayTotal / todayOrders.length).toInt();
          final avgYesterday = yesterdayOrders.isEmpty ? 0 : (provider.yesterdayTotal / yesterdayOrders.length).toInt();

          return SingleChildScrollView(
            padding: const EdgeInsets.all(25),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildSectionHeader('FÖRSÄLJNINGSÖVERSIKT'),
                const SizedBox(height: 25),
                _buildInsightCard(
                  'TOTAL FÖRSÄLJNING IDAG',
                  '${provider.todayTotal.toInt()} KR',
                  '+${todayOrders.length} ordrar',
                  AppTheme.gold,
                  true,
                ),
                const SizedBox(height: 15),
                _buildInsightCard(
                  'FÖRSÄLJNING IGÅR',
                  '${provider.yesterdayTotal.toInt()} KR',
                  '${yesterdayOrders.length} ordrar',
                  Colors.white24,
                  false,
                ),
                const SizedBox(height: 40),
                _buildSectionHeader('NYCKELTAL (KPI)'),
                const SizedBox(height: 20),
                Row(
                  children: [
                    Expanded(child: _buildMetricBox(
                      'SNITTORDERVÄRDE (IDAG)',
                      '$avgToday KR',
                      Icons.trending_up,
                      Colors.blue,
                    )),
                    const SizedBox(width: 15),
                    Expanded(child: _buildMetricBox(
                      'SNITTORDERVÄRDE (IGÅR)',
                      '$avgYesterday KR',
                      Icons.bar_chart_outlined,
                      Colors.white10,
                    )),
                  ],
                ),
                const SizedBox(height: 40),
                _buildSectionHeader('AKTIVITET'),
                const SizedBox(height: 20),
                Container(
                  padding: const EdgeInsets.all(30),
                  decoration: BoxDecoration(
                    color: AppTheme.zinc,
                    borderRadius: BorderRadius.circular(28),
                    border: Border.all(color: Colors.white.withOpacity(0.04)),
                  ),
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('LEVERANS-GRAD', style: TextStyle(color: Colors.white38, fontSize: 13, fontWeight: FontWeight.bold)),
                          Text('${todayOrders.where((o) => o.type == 'DELIVERY').length} UTKÖRNINGAR', 
                            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 1)),
                        ],
                      ),
                      const SizedBox(height: 20),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: LinearProgressIndicator(
                          value: todayOrders.isEmpty ? 0 : todayOrders.where((o) => o.type == 'DELIVERY').length / todayOrders.length,
                          backgroundColor: Colors.black,
                          color: AppTheme.gold,
                          minHeight: 10,
                        ),
                      ),
                      const SizedBox(height: 30),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('AVHÄMTNINGS-GRAD', style: TextStyle(color: Colors.white38, fontSize: 13, fontWeight: FontWeight.bold)),
                          Text('${todayOrders.where((o) => o.type == 'PICKUP').length} AVHÄMTNINGAR', 
                            style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w900, letterSpacing: 1)),
                        ],
                      ),
                      const SizedBox(height: 20),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: LinearProgressIndicator(
                          value: todayOrders.isEmpty ? 0 : todayOrders.where((o) => o.type == 'PICKUP').length / todayOrders.length,
                          backgroundColor: Colors.black,
                          color: Colors.green,
                          minHeight: 10,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Row(
      children: [
        Text(title, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: AppTheme.gold, letterSpacing: 3)),
        const SizedBox(width: 15),
        Expanded(child: Container(height: 1, color: AppTheme.gold.withOpacity(0.1))),
      ],
    );
  }

  Widget _buildInsightCard(String label, String amount, String subtitle, Color color, bool highlight) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(30),
      decoration: BoxDecoration(
        color: AppTheme.zinc,
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: color.withOpacity(0.15), width: 1.5),
        gradient: highlight ? LinearGradient(
          colors: [color.withOpacity(0.05), Colors.transparent],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ) : null,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w900, color: color, letterSpacing: 3)),
          const SizedBox(height: 15),
          Text(amount, style: const TextStyle(fontSize: 36, fontWeight: FontWeight.w900, color: Colors.white, fontStyle: FontStyle.italic)),
          const SizedBox(height: 6),
          Text(subtitle, style: const TextStyle(fontSize: 13, color: Colors.white24, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildMetricBox(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: AppTheme.zinc,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(height: 15),
          Text(value, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900, color: Colors.white)),
          const SizedBox(height: 6),
          Text(label, style: const TextStyle(fontSize: 8, fontWeight: FontWeight.w900, color: Colors.white24, letterSpacing: 1)),
        ],
      ),
    );
  }
}
