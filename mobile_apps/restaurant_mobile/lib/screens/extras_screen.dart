import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../core/theme.dart';

class ExtrasScreen extends StatefulWidget {
  const ExtrasScreen({super.key});

  @override
  State<ExtrasScreen> createState() => _ExtrasScreenState();
}

class _ExtrasScreenState extends State<ExtrasScreen> {
  List<dynamic> _categories = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchMenu();
  }

  Future<void> _fetchMenu() async {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final orderProvider = Provider.of<OrderProvider>(context, listen: false);
    final restaurantId = auth.user?['restaurantId'];
    if (restaurantId != null) {
      final data = await orderProvider.fetchMenu(restaurantId);
      if (mounted) {
        setState(() {
          _categories = data;
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Collect all unique Extras from all products
    final allExtras = <Map<String, dynamic>>[];
    for (var cat in _categories) {
      for (var prod in (cat['products'] as List)) {
        if (prod['extraGroups'] != null) {
          for (var group in (prod['extraGroups'] as List)) {
            if (group['extras'] != null) {
              for (var extra in (group['extras'] as List)) {
                if (!allExtras.any((e) => e['id'] == extra['id'])) {
                  allExtras.add({...extra, 'groupName': group['name']});
                }
              }
            }
          }
        }
      }
    }

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.charcoal,
        elevation: 0,
        title: const Text('HANTERA TILLBEHÖR',
            style: TextStyle(
                fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 2)),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.gold))
          : allExtras.isEmpty
              ? Center(
                  child: Text('INGA TILLBEHÖR HITTADES',
                      style: TextStyle(
                          color: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.color
                              ?.withOpacity(0.6),
                          fontWeight: FontWeight.w900,
                          letterSpacing: 2)))
              : ListView.builder(
                  padding: const EdgeInsets.all(20),
                  itemCount: allExtras.length,
                  itemBuilder: (ctx, i) {
                    final extra = allExtras[i];
                    final isActive = extra['isActive'] ?? true;
                    return Container(
                      margin: const EdgeInsets.only(bottom: 12),
                      decoration: BoxDecoration(
                        color: AppTheme.zinc,
                        borderRadius: BorderRadius.circular(22),
                        border: Border.all(
                            color: isActive
                                ? AppTheme.gold.withOpacity(0.2)
                                : Theme.of(context)
                                    .dividerColor
                                    .withOpacity(0.5)),
                      ),
                      child: ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 20, vertical: 8),
                        title: Text(
                          extra['name'].toString().toUpperCase(),
                          style: TextStyle(
                            color: isActive
                                ? Theme.of(context).textTheme.bodyLarge?.color
                                : Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.color
                                    ?.withOpacity(0.7),
                            fontWeight: FontWeight.w900,
                            fontSize: 14,
                          ),
                        ),
                        subtitle: Text(
                            extra['groupName'].toString().toUpperCase(),
                            style: const TextStyle(
                                color: AppTheme.gold,
                                fontSize: 9,
                                fontWeight: FontWeight.w900,
                                letterSpacing: 1)),
                        trailing: Switch(
                          value: isActive,
                          onChanged: (v) async {
                            final messenger = ScaffoldMessenger.of(context);
                            final orderProvider = Provider.of<OrderProvider>(
                                context,
                                listen: false);
                            setState(() => extra['isActive'] = v);
                            final ok = await orderProvider.updateExtraStatus(
                                extra['id'], v);
                            if (!mounted) return;
                            if (!ok) {
                              setState(() => extra['isActive'] = !v);
                              messenger.showSnackBar(
                                const SnackBar(
                                    content: Text(
                                        'Kunde inte uppdatera tillbehöret.')),
                              );
                              return;
                            }
                          },
                          activeColor: AppTheme.gold,
                        ),
                      ),
                    );
                  },
                ),
    );
  }
}
