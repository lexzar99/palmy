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
  final _searchCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadMenu();
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
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
    final isDark = AppTheme.isDark(context);
    final productSections = _filteredCategories();
    final extraSections = _filteredExtraGroups();

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: _isLoading
          ? Center(
              child: CircularProgressIndicator(
                color: isDark ? Colors.white : AppTheme.ink,
              ),
            )
          : SafeArea(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
                    child: _Header(
                      onRefresh: _loadMenu,
                    ),
                  ),
                  const SizedBox(height: 18),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                    child: _SearchBar(
                      controller: _searchCtrl,
                      onChanged: (v) => setState(() => _query = v),
                    ),
                  ),
                  const SizedBox(height: 14),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 0, 20, 0),
                    child: _ViewToggle(
                      current: _view,
                      onChange: (v) => setState(() => _view = v),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: _loadMenu,
                      color: isDark ? Colors.white : AppTheme.ink,
                      child: _view == _MenuView.products
                          ? _ProductsList(
                              sections: productSections,
                              isDark: isDark,
                              onToggle: _toggleProduct,
                            )
                          : _ExtrasList(
                              sections: extraSections,
                              isDark: isDark,
                              onToggle: _toggleExtra,
                            ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _Header extends StatelessWidget {
  final VoidCallback onRefresh;
  const _Header({required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'MENY',
                style: TextStyle(
                  color: AppTheme.mutedColor(context),
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.4,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Artiklar & tillbehör',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  height: 1.0,
                  letterSpacing: -1.0,
                  color: isDark ? Colors.white : AppTheme.ink,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Material(
          color: Colors.transparent,
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            onTap: onRefresh,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppTheme.faintColor(context),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppTheme.borderColor(context)),
              ),
              child: Icon(
                Icons.refresh_rounded,
                color: isDark ? Colors.white : AppTheme.ink,
                size: 20,
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _SearchBar extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;
  const _SearchBar({required this.controller, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Row(
        children: [
          Icon(
            Icons.search_rounded,
            color: AppTheme.mutedColor(context),
            size: 22,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: TextField(
              controller: controller,
              onChanged: onChanged,
              decoration: InputDecoration(
                hintText: 'Sök artikel eller tillbehör',
                hintStyle: TextStyle(
                  color: AppTheme.mutedColor(context).withOpacity(0.65),
                  fontSize: 14,
                  fontWeight: FontWeight.w500,
                ),
                border: InputBorder.none,
                enabledBorder: InputBorder.none,
                focusedBorder: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 14),
                isDense: true,
              ),
              style: TextStyle(
                color: isDark ? Colors.white : AppTheme.ink,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          if (controller.text.isNotEmpty)
            Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(20),
              child: InkWell(
                onTap: () {
                  controller.clear();
                  onChanged('');
                },
                borderRadius: BorderRadius.circular(20),
                child: Padding(
                  padding: const EdgeInsets.all(6),
                  child: Icon(
                    Icons.close_rounded,
                    color: AppTheme.mutedColor(context),
                    size: 18,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _ViewToggle extends StatelessWidget {
  final _MenuView current;
  final ValueChanged<_MenuView> onChange;
  const _ViewToggle({required this.current, required this.onChange});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;
    final fg = isDark ? AppTheme.ink : Colors.white;
    final muted = AppTheme.mutedColor(context);

    Widget seg(String label, _MenuView view) {
      final selected = current == view;
      return Expanded(
        child: GestureDetector(
          onTap: () => onChange(view),
          behavior: HitTestBehavior.opaque,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            padding: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
              color: selected ? ink : Colors.transparent,
              borderRadius: BorderRadius.circular(10),
            ),
            child: Center(
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: selected ? fg : muted,
                ),
              ),
            ),
          ),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.borderColor(context)),
      ),
      child: Row(
        children: [
          seg('Artiklar', _MenuView.products),
          seg('Tillbehör', _MenuView.extras),
        ],
      ),
    );
  }
}

class _ProductsList extends StatelessWidget {
  final List<Map<String, dynamic>> sections;
  final bool isDark;
  final Function(String, bool) onToggle;
  const _ProductsList({
    required this.sections,
    required this.isDark,
    required this.onToggle,
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
              'Ingen meny',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      physics: const BouncingScrollPhysics(
        parent: AlwaysScrollableScrollPhysics(),
      ),
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 140),
      itemCount: sections.length,
      itemBuilder: (context, i) {
        final s = sections[i];
        final items = (s['products'] as List? ?? const [])
            .whereType<Map>()
            .map((p) => Map<String, dynamic>.from(p.cast<String, dynamic>()))
            .toList();
        return Padding(
          padding: const EdgeInsets.only(bottom: 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CategoryHeader(name: (s['name'] ?? '').toString(), count: items.length),
              const SizedBox(height: 10),
              ...items.map(
                (p) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _MenuItemTile(
                    title: (p['name'] ?? '').toString(),
                    price:
                        '${((p['price'] ?? 0) as num).toStringAsFixed(0)} kr',
                    active: p['isActive'] != false,
                    onTap: () => onToggle(
                      p['id'].toString(),
                      !(p['isActive'] != false),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _ExtrasList extends StatelessWidget {
  final List<Map<String, dynamic>> sections;
  final bool isDark;
  final Function(String, bool) onToggle;
  const _ExtrasList({
    required this.sections,
    required this.isDark,
    required this.onToggle,
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
              'Inga tillbehör',
              style: Theme.of(context).textTheme.titleLarge,
            ),
          ),
        ],
      );
    }

    return ListView.builder(
      physics: const BouncingScrollPhysics(
        parent: AlwaysScrollableScrollPhysics(),
      ),
      padding: const EdgeInsets.fromLTRB(20, 4, 20, 140),
      itemCount: sections.length,
      itemBuilder: (context, i) {
        final s = sections[i];
        final extras = (s['extras'] as List? ?? const [])
            .whereType<Map>()
            .map((e) => Map<String, dynamic>.from(e.cast<String, dynamic>()))
            .toList();
        return Padding(
          padding: const EdgeInsets.only(bottom: 22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _CategoryHeader(name: (s['name'] ?? '').toString(), count: extras.length),
              const SizedBox(height: 10),
              ...extras.map(
                (e) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: _MenuItemTile(
                    title: (e['name'] ?? '').toString(),
                    price:
                        '+${((e['priceAddon'] ?? 0) as num).toStringAsFixed(0)} kr',
                    active: e['isActive'] != false,
                    onTap: () => onToggle(
                      e['id'].toString(),
                      !(e['isActive'] != false),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _CategoryHeader extends StatelessWidget {
  final String name;
  final int count;
  const _CategoryHeader({required this.name, required this.count});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(
          name,
          style: TextStyle(
            fontSize: 18,
            fontWeight: FontWeight.w800,
            letterSpacing: -0.3,
            color: isDark ? Colors.white : AppTheme.ink,
          ),
        ),
        const SizedBox(width: 8),
        Padding(
          padding: const EdgeInsets.only(bottom: 3),
          child: Text(
            '$count',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: AppTheme.mutedColor(context),
            ),
          ),
        ),
      ],
    );
  }
}

class _MenuItemTile extends StatelessWidget {
  final String title;
  final String price;
  final bool active;
  final VoidCallback onTap;

  const _MenuItemTile({
    required this.title,
    required this.price,
    required this.active,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppTheme.panelColor(context),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.borderColor(context), width: 1),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    decoration: active ? null : TextDecoration.lineThrough,
                    decorationThickness: 1.6,
                    color: active ? ink : AppTheme.mutedColor(context),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  price,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.mutedColor(context),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 12),
          _MonoSwitch(value: active, onChanged: (_) => onTap()),
        ],
      ),
    );
  }
}

/// Enkel monokrom toggle-switch (på = ink, av = muted).
class _MonoSwitch extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  const _MonoSwitch({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final isDark = AppTheme.isDark(context);
    final ink = isDark ? Colors.white : AppTheme.ink;
    final knob = isDark ? AppTheme.ink : Colors.white;

    return GestureDetector(
      onTap: () => onChanged(!value),
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
        width: 46,
        height: 28,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: value ? ink : AppTheme.mutedColor(context).withOpacity(0.30),
          borderRadius: BorderRadius.circular(20),
        ),
        child: AnimatedAlign(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
          alignment: value ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: value ? knob : Colors.white,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}
