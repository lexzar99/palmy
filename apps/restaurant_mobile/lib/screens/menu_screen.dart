import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';
import '../core/theme.dart';

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  List<dynamic> _categories = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadMenu();
  }

  Future<void> _loadMenu() async {
    if (mounted) setState(() => _isLoading = true);
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final provider = Provider.of<OrderProvider>(context, listen: false);
    final restaurantId = auth.user?['restaurantId'] ?? '';
    
    final data = await provider.fetchMenu(restaurantId);
    debugPrint('LOADED MENU DATA: ${data.length} categories');
    if (data.isNotEmpty) {
      debugPrint('FIRST CAT: ${data.first}');
    }
    if (mounted) {
      setState(() {
        _categories = data;
        _isLoading = false;
      });
    }
  }

  Future<void> _toggleProduct(String productId, bool isActive) async {
    final provider = Provider.of<OrderProvider>(context, listen: false);
    await provider.updateProductStatus(productId, isActive);
    _loadMenu();
  }

  Future<void> _toggleExtra(String extraId, bool isActive) async {
    final provider = Provider.of<OrderProvider>(context, listen: false);
    await provider.updateExtraStatus(extraId, isActive);
    _loadMenu();
  }

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 2,
      child: Scaffold(
        appBar: AppBar(
          elevation: 0,
          title: Text('MENY & TILLBEHÖR', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w900, letterSpacing: 2, color: Theme.of(context).textTheme.bodyLarge?.color)),
          bottom: TabBar(
            indicatorColor: AppTheme.gold,
            labelColor: AppTheme.gold,
            unselectedLabelColor: Theme.of(context).textTheme.bodySmall?.color,
            labelStyle: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2),
            tabs: [
              Tab(text: 'PRODUKTER'),
              Tab(text: 'TILLBEHÖR & EXTRA'),
            ],
          ),
          actions: [
            IconButton(onPressed: _loadMenu, icon: Icon(Icons.refresh, color: Theme.of(context).textTheme.bodySmall?.color)),
          ],
        ),
        body: Container(
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [Theme.of(context).scaffoldBackgroundColor, Theme.of(context).scaffoldBackgroundColor.withAlpha(200)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
          child: _isLoading 
            ? const Center(child: CircularProgressIndicator(color: AppTheme.gold))
            : TabBarView(
                children: [
                  _buildProductsTab(),
                  _buildExtrasTab(),
                ],
              ),
        ),
      ),
    );
  }

  Widget _buildProductsTab() {
    if (_categories.isEmpty) return _buildEmptyState();
    return ListView.builder(
      padding: const EdgeInsets.all(25),
      itemCount: _categories.length,
      itemBuilder: (ctx, i) => _buildCategoryTile(context, _categories[i]),
    );
  }

  Widget _buildExtrasTab() {
    final Map<String, dynamic> extraGroups = {};
    for (var cat in _categories) {
       // IMPORTANT: The products might be null if the mapping failed
      final dynamic productsRaw = cat['products'];
      if (productsRaw is List) {
        for (var prod in productsRaw) {
          final dynamic groupsRaw = prod['extraGroups'];
          if (groupsRaw is List) {
            for (var g in groupsRaw) {
              final Map<String, dynamic>? group = g['extraGroup'] ?? (g is Map<String, dynamic> ? g : null); 
              if (group != null && group['id'] != null) {
                extraGroups[group['id']] = group;
              }
            }
          }
        }
      }
    }

    if (extraGroups.isEmpty) return _buildEmptyState();

    return ListView(
      padding: const EdgeInsets.all(25),
      children: extraGroups.values.map((group) => _buildExtraGroupTile(context, group)).toList(),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.restaurant_menu_outlined, size: 60, color: Theme.of(context).textTheme.bodyLarge?.color?.withOpacity(0.05)),
          const SizedBox(height: 16),
          Text('INGET DATA HITTADES', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: Theme.of(context).textTheme.bodySmall?.color, letterSpacing: 3)),
        ],
      ),
    );
  }

  Widget _buildCategoryTile(BuildContext context, Map<String, dynamic> category) {
    final dynamic productsRaw = category['products'];
    final List products = productsRaw is List ? productsRaw : [];
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader((category['name'] ?? 'KATEGORI').toUpperCase()),
        const SizedBox(height: 25),
        if (products.isEmpty)
          Padding(
            padding: const EdgeInsets.only(left: 10, bottom: 40),
            child: Text('INGA ARTIKLAR HITTADES I ${(category['name'] ?? 'KATEGORIEN').toUpperCase()}', 
              style: TextStyle(color: Colors.white.withOpacity(0.04), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
          ),
        ...products.map((p) => _buildToggleCard(
          context: context,
          title: (p['name'] ?? '').toUpperCase(),
          subtitle: '${((p['price'] ?? 0) as num).toDouble().toInt()} KR',
          isActive: p['isActive'] ?? true,
          onChanged: (v) => _toggleProduct(p['id'], v),
        )).toList(),
        const SizedBox(height: 30),
      ],
    );
  }

  Widget _buildExtraGroupTile(BuildContext context, Map<String, dynamic> group) {
    final dynamic extrasRaw = group['extras'];
    final List extras = extrasRaw is List ? extrasRaw : [];
    
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionHeader((group['name'] ?? 'EXTRA').toUpperCase()),
        const SizedBox(height: 20),
        if (extras.isEmpty)
          Padding(padding: const EdgeInsets.only(left: 10, bottom: 20), child: Text('INGA TILLBEHÖR HITTADES', style: TextStyle(color: Theme.of(context).textTheme.bodySmall?.color?.withOpacity(0.5), fontSize: 10))),
        ...extras.map((e) => _buildToggleCard(
          context: context,
          title: (e['name'] ?? '').toUpperCase(),
          subtitle: '${((e['priceAddon'] ?? 0) as num).toDouble().toInt()} KR EXTRA',
          isActive: e['isActive'] ?? true,
          onChanged: (v) => _toggleExtra(e['id'], v),
        )).toList(),
        const SizedBox(height: 30),
      ],
    );
  }

  Widget _buildSectionHeader(String title) {
    return Row(
      children: [
        Text(title, style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w900, color: AppTheme.gold, letterSpacing: 3)),
        const SizedBox(width: 20),
        Expanded(child: Container(height: 1, color: AppTheme.gold.withOpacity(0.1))),
      ],
    );
  }

  Widget _buildToggleCard({
    required BuildContext context,
    required String title,
    required String subtitle,
    required bool isActive,
    required Function(bool) onChanged,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 15),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(26),
        gradient: LinearGradient(
          colors: [Theme.of(context).colorScheme.surface, Theme.of(context).colorScheme.surface.withOpacity(0.7)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        border: Border.all(
          color: isActive ? Colors.white.withOpacity(0.04) : AppTheme.danger.withOpacity(0.3),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.2),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 25, vertical: 12),
        title: Text(title, style: TextStyle(color: isActive ? Theme.of(context).textTheme.bodyLarge?.color : Colors.grey, fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1)),
        subtitle: Row(
          children: [
            Text(subtitle, style: TextStyle(color: isActive ? Theme.of(context).primaryColor : Theme.of(context).textTheme.bodySmall?.color, fontSize: 16, fontWeight: FontWeight.w900, fontStyle: FontStyle.italic)),
            const SizedBox(width: 12),
            if (!isActive) _buildStatusBadge('STÄNGD', AppTheme.danger),
          ],
        ),
        trailing: Transform.scale(
          scale: 1.2,
          child: Switch(
            value: isActive,
            onChanged: (v) => onChanged(v),
            activeColor: AppTheme.gold,
            inactiveThumbColor: AppTheme.danger,
            inactiveTrackColor: AppTheme.danger.withOpacity(0.1),
          ),
        ),
      ),
    );
  }

  Widget _buildStatusBadge(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.5), width: 0.8)),
      child: Text(text, style: TextStyle(fontSize: 8, fontWeight: FontWeight.w900, color: color, letterSpacing: 1.2)),
    );
  }
}
