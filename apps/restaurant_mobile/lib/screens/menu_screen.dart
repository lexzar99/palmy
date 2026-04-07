import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../core/api_client.dart';
import '../core/theme.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  final ApiClient _api = ApiClient();
  List<dynamic> _categories = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchMenu();
  }

  Future<void> _fetchMenu() async {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final restaurantId = auth.user?['restaurantId'];
    if (restaurantId == null) return;

    try {
      final res = await _api.get('/api/restaurants/$restaurantId/menu');
      if (mounted) {
        setState(() {
          _categories = res.data ?? [];
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() { _isLoading = false; });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppTheme.charcoal,
        elevation: 0,
        title: const Text('MENYHANTERING',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2)),
        actions: [
          IconButton(onPressed: _fetchMenu, icon: const Icon(Icons.refresh, color: Colors.white24)),
          const SizedBox(width: 10),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.gold))
          : _categories.isEmpty 
              ? _buildEmptyState()
              : ListView.builder(
                  padding: const EdgeInsets.all(20),
                  itemCount: _categories.length,
                  itemBuilder: (ctx, i) => _buildCategorySection(_categories[i]),
                ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.restaurant_menu_outlined, size: 60, color: Colors.white.withOpacity(0.1)),
          const SizedBox(height: 16),
          const Text('KUNDE INTE HÄMTA MENYN',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: Colors.white24, letterSpacing: 2)),
        ],
      ),
    );
  }

  Widget _buildCategorySection(dynamic category) {
    final products = category['products'] as List? ?? [];
    if (products.isEmpty) return const SizedBox.shrink();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 20),
          child: Row(
            children: [
              Text(
                category['name'].toString().toUpperCase(),
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: AppTheme.gold, letterSpacing: 3),
              ),
              const SizedBox(width: 15),
              Expanded(child: Container(height: 1, color: AppTheme.gold.withOpacity(0.1))),
            ],
          ),
        ),
        ...products.map((p) => _buildProductCard(p)),
      ],
    );
  }

  Widget _buildProductCard(dynamic product) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: AppTheme.zinc,
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: Colors.white.withOpacity(0.04)),
      ),
      child: Row(
        children: [
          Container(
            width: 45, height: 45,
            decoration: BoxDecoration(
              color: Colors.black26,
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.fastfood_outlined, color: Colors.white24, size: 20),
          ),
          const SizedBox(width: 18),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(product['name'].toString().toUpperCase(),
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w900, color: Colors.white)),
                const SizedBox(height: 4),
                Text('${product["price"]} KR',
                  style: const TextStyle(fontSize: 12, color: AppTheme.gold, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          Switch(
            value: true, 
            onChanged: (v) {}, // TODO: Implement toggle
            activeColor: Colors.green,
            activeTrackColor: Colors.green.withOpacity(0.2),
          ),
        ],
      ),
    );
  }
}
