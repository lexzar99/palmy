import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/log_service.dart';
import '../core/theme.dart';
import '../providers/auth_provider.dart';
import '../providers/order_provider.dart';

enum _MenuView { products, extras }

class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  List<dynamic> _categories = [];
  bool _isLoading = true;
  String _query = '';
  _MenuView _view = _MenuView.products;

  @override
  void initState() {
    super.initState();
    _loadMenu();
  }

  bool _setProductActiveLocal(String productId, bool isActive) {
    var updated = false;
    for (final category in _categories) {
      if (category is! Map) continue;
      final products = category['products'];
      if (products is! List) continue;
      for (final product in products) {
        if (product is! Map) continue;
        if (product['id'] == productId) {
          product['isActive'] = isActive;
          updated = true;
          break;
        }
      }
    }
    return updated;
  }

  bool _setExtraActiveLocal(String extraId, bool isActive) {
    var updated = false;
    for (final category in _categories) {
      if (category is! Map) continue;
      final products = category['products'];
      if (products is! List) continue;
      for (final product in products) {
        if (product is! Map) continue;
        final groups = product['extraGroups'];
        if (groups is! List) continue;
        for (final groupItem in groups) {
          if (groupItem is! Map) continue;
          final extraGroup = groupItem['extraGroup'] ?? groupItem;
          if (extraGroup is! Map) continue;
          final extras = extraGroup['extras'];
          if (extras is! List) continue;
          for (final extra in extras) {
            if (extra is! Map) continue;
            if (extra['id'] == extraId) {
              extra['isActive'] = isActive;
              updated = true;
              break;
            }
          }
        }
      }
    }
    return updated;
  }

  Future<void> _loadMenu() async {
    if (mounted) setState(() => _isLoading = true);
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final provider = Provider.of<OrderProvider>(context, listen: false);
    final restaurantId = auth.user?['restaurantId'] ?? '';

    final data = await provider.fetchMenu(restaurantId);
    if (!mounted) return;

    setState(() {
      _categories = data;
      _isLoading = false;
    });
  }

  Future<void> _toggleProduct(String productId, bool isActive) async {
    logger.log('BUTTON: Toggle Product $productId -> $isActive');
    final provider = Provider.of<OrderProvider>(context, listen: false);
    final updated = _setProductActiveLocal(productId, isActive);
    if (updated && mounted) setState(() {});

    final ok = await provider.updateProductStatus(productId, isActive);
    if (!mounted || ok) return;

    _setProductActiveLocal(productId, !isActive);
    setState(() {});
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Kunde inte uppdatera artikeln.')),
    );
  }

  Future<void> _toggleExtra(String extraId, bool isActive) async {
    logger.log('BUTTON: Toggle Extra $extraId -> $isActive');
    final provider = Provider.of<OrderProvider>(context, listen: false);
    final updated = _setExtraActiveLocal(extraId, isActive);
    if (updated && mounted) setState(() {});

    final ok = await provider.updateExtraStatus(extraId, isActive);
    if (!mounted || ok) return;

    _setExtraActiveLocal(extraId, !isActive);
    setState(() {});
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Kunde inte uppdatera tillbehöret.')),
    );
  }

  List<Map<String, dynamic>> _filteredCategories() {
    final query = _query.trim().toLowerCase();
    final filtered = <Map<String, dynamic>>[];

    for (final category in _categories) {
      if (category is! Map) continue;
      final categoryMap =
          Map<String, dynamic>.from(category.cast<String, dynamic>());
      final products = (categoryMap['products'] as List? ?? const [])
          .whereType<Map>()
          .map(
            (product) =>
                Map<String, dynamic>.from(product.cast<String, dynamic>()),
          )
          .toList();

      products.sort((a, b) {
        final posA = (a['position'] as num?)?.toInt() ?? 0;
        final posB = (b['position'] as num?)?.toInt() ?? 0;
        final positionComparison = posA.compareTo(posB);
        if (positionComparison != 0) return positionComparison;
        return (a['name'] ?? '')
            .toString()
            .compareTo((b['name'] ?? '').toString());
      });

      final matchingProducts = query.isEmpty
          ? products
          : products.where((product) {
              final name = (product['name'] ?? '').toString().toLowerCase();
              return name.contains(query);
            }).toList();

      if (matchingProducts.isEmpty) continue;
      categoryMap['products'] = matchingProducts;
      filtered.add(categoryMap);
    }

    return filtered;
  }

  List<Map<String, dynamic>> _filteredExtraGroups() {
    final groups = <String, Map<String, dynamic>>{};
    final query = _query.trim().toLowerCase();

    for (final category in _categories) {
      if (category is! Map) continue;
      final products = category['products'];
      if (products is! List) continue;
      for (final product in products) {
        if (product is! Map) continue;
        final extraGroups = product['extraGroups'];
        if (extraGroups is! List) continue;
        for (final item in extraGroups) {
          if (item is! Map) continue;
          final rawGroup = item['extraGroup'] ?? item;
          if (rawGroup is! Map) continue;
          final group =
              Map<String, dynamic>.from(rawGroup.cast<String, dynamic>());
          final extras = (group['extras'] as List? ?? const [])
              .whereType<Map>()
              .map(
                (extra) =>
                    Map<String, dynamic>.from(extra.cast<String, dynamic>()),
              )
              .where((extra) {
            if (query.isEmpty) return true;
            return (extra['name'] ?? '')
                .toString()
                .toLowerCase()
                .contains(query);
          }).toList();

          if (extras.isEmpty) continue;
          group['extras'] = extras;
          groups[group['id'].toString()] = group;
        }
      }
    }

    return groups.values.toList()
      ..sort(
        (a, b) => (a['name'] ?? '')
            .toString()
            .compareTo((b['name'] ?? '').toString()),
      );
  }

  @override
  Widget build(BuildContext context) {
    final productSections = _filteredCategories();
    final extraSections = _filteredExtraGroups();

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: AppTheme.gold))
          : Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          'Meny',
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                      ),
                      IconButton(
                        onPressed: _loadMenu,
                        icon: const Icon(Icons.refresh_rounded),
                        tooltip: 'Uppdatera',
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  TextField(
                    onChanged: (value) => setState(() => _query = value),
                    decoration: const InputDecoration(
                      labelText: 'Sök',
                      prefixIcon: Icon(Icons.search_rounded),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SegmentedButton<_MenuView>(
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment<_MenuView>(
                        value: _MenuView.products,
                        label: Text('Artiklar'),
                      ),
                      ButtonSegment<_MenuView>(
                        value: _MenuView.extras,
                        label: Text('Tillbehör'),
                      ),
                    ],
                    selected: {_view},
                    onSelectionChanged: (selection) {
                      setState(() => _view = selection.first);
                    },
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: _loadMenu,
                      child: _view == _MenuView.products
                          ? _MenuSectionList(
                              emptyTitle: 'Ingen meny',
                              sections: productSections,
                              rowBuilder: (entry) => _MenuToggleTile(
                                title: (entry['name'] ?? '').toString(),
                                subtitle:
                                    '${((entry['price'] ?? 0) as num).toStringAsFixed(0)} kr',
                                active: entry['isActive'] != false,
                                accent: AppTheme.info,
                                onChanged: (value) => _toggleProduct(
                                  entry['id'].toString(),
                                  value,
                                ),
                              ),
                            )
                          : _MenuSectionList(
                              emptyTitle: 'Inga tillbehör',
                              sections: extraSections,
                              rowBuilder: (entry) => _MenuToggleTile(
                                title: (entry['name'] ?? '').toString(),
                                subtitle:
                                    '+${((entry['priceAddon'] ?? 0) as num).toStringAsFixed(0)} kr',
                                active: entry['isActive'] != false,
                                accent: AppTheme.success,
                                onChanged: (value) => _toggleExtra(
                                  entry['id'].toString(),
                                  value,
                                ),
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _MenuSectionList extends StatelessWidget {
  final String emptyTitle;
  final List<Map<String, dynamic>> sections;
  final Widget Function(Map<String, dynamic>) rowBuilder;

  const _MenuSectionList({
    required this.emptyTitle,
    required this.sections,
    required this.rowBuilder,
  });

  @override
  Widget build(BuildContext context) {
    if (sections.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          const SizedBox(height: 80),
          Center(
            child: Text(
              emptyTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ),
        ],
      );
    }

    return ListView.separated(
      physics: const BouncingScrollPhysics(
        parent: AlwaysScrollableScrollPhysics(),
      ),
      padding: const EdgeInsets.only(bottom: 24),
      itemCount: sections.length,
      separatorBuilder: (_, __) => const SizedBox(height: 18),
      itemBuilder: (context, index) {
        final section = sections[index];
        final items = (section['products'] as List? ??
                section['extras'] as List? ??
                const [])
            .whereType<Map>()
            .map((item) =>
                Map<String, dynamic>.from(item.cast<String, dynamic>()))
            .toList();

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Text(
                (section['name'] ?? '').toString(),
                style: Theme.of(context).textTheme.titleMedium,
              ),
            ),
            ...items.map(
              (item) => Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: rowBuilder(item),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _MenuToggleTile extends StatelessWidget {
  final String title;
  final String subtitle;
  final bool active;
  final Color accent;
  final ValueChanged<bool> onChanged;

  const _MenuToggleTile({
    required this.title,
    required this.subtitle,
    required this.active,
    required this.accent,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final backgroundColor = active
        ? (isDark ? accent.withOpacity(0.10) : Colors.white)
        : AppTheme.panelColor(context);
    final borderColor = active
        ? accent.withOpacity(isDark ? 0.38 : 0.22)
        : AppTheme.borderColor(context);

    return AnimatedContainer(
      duration: const Duration(milliseconds: 160),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: borderColor,
        ),
        boxShadow: isDark
            ? null
            : [
                BoxShadow(
                  color: const Color(0xFF95A3BE).withOpacity(0.06),
                  blurRadius: 8,
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: Row(
        children: [
          Container(
            width: 8,
            height: 36,
            decoration: BoxDecoration(
              color: active ? accent : AppTheme.faintColor(context),
              borderRadius: BorderRadius.circular(999),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontSize: 15,
                      ),
                ),
                const SizedBox(height: 2),
                Text(subtitle, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Switch(value: active, onChanged: onChanged),
        ],
      ),
    );
  }
}
