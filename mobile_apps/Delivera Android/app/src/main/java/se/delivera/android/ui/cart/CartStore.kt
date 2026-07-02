package se.delivera.android.ui.cart

import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import se.delivera.android.data.MenuCategory
import se.delivera.android.data.MenuProduct
import se.delivera.android.data.OrderMode
import se.delivera.android.data.Restaurant

data class CartItem(
    val product: MenuProduct,
    val quantity: Int = 1
) {
    val total: Double get() = product.effectivePrice * quantity
}

class CartStore {
    val items = mutableStateListOf<CartItem>()
    var restaurant = mutableStateOf<Restaurant?>(null)
        private set
    var orderMode = mutableStateOf(OrderMode.Delivery)
        private set
    var address = mutableStateOf("")
        private set
    var deliveryFee = mutableStateOf(0.0)
        private set
    var recommendedProducts = mutableStateListOf<MenuProduct>()
        private set

    val count: Int get() = items.sumOf { it.quantity }
    val subtotal: Double get() = items.sumOf { it.total }
    val displayedDeliveryFee: Double get() = if (orderMode.value == OrderMode.Pickup) 0.0 else deliveryFee.value
    val total: Double get() = subtotal + displayedDeliveryFee

    fun configure(
        restaurant: Restaurant,
        orderMode: OrderMode,
        address: String,
        deliveryFee: Double,
        categories: List<MenuCategory>
    ) {
        if (requiresRestaurantSwitch(restaurant)) return
        this.restaurant.value = restaurant
        this.orderMode.value = orderMode
        this.address.value = address
        this.deliveryFee.value = if (orderMode == OrderMode.Pickup) 0.0 else deliveryFee
        recommendedProducts.clear()
        recommendedProducts.addAll(recommendations(categories))
    }

    fun replaceContext(
        restaurant: Restaurant,
        orderMode: OrderMode,
        address: String,
        deliveryFee: Double,
        categories: List<MenuCategory>
    ) {
        clear()
        configure(restaurant, orderMode, address, deliveryFee, categories)
    }

    fun requiresRestaurantSwitch(next: Restaurant): Boolean {
        val current = restaurant.value ?: return false
        return items.isNotEmpty() && current.id != next.id
    }

    fun add(product: MenuProduct, restaurant: Restaurant, orderMode: OrderMode, address: String, deliveryFee: Double, categories: List<MenuCategory>) {
        if (requiresRestaurantSwitch(restaurant)) {
            replaceContext(restaurant, orderMode, address, deliveryFee, categories)
        } else {
            configure(restaurant, orderMode, address, deliveryFee, categories)
        }
        val index = items.indexOfFirst { it.product.id == product.id }
        if (index >= 0) {
            items[index] = items[index].copy(quantity = items[index].quantity + 1)
        } else {
            items.add(CartItem(product))
        }
    }

    fun increment(item: CartItem) {
        val index = items.indexOfFirst { it.product.id == item.product.id }
        if (index >= 0) items[index] = items[index].copy(quantity = items[index].quantity + 1)
    }

    fun addRecommended(product: MenuProduct) {
        val index = items.indexOfFirst { it.product.id == product.id }
        if (index >= 0) {
            items[index] = items[index].copy(quantity = items[index].quantity + 1)
        } else {
            items.add(CartItem(product))
        }
    }

    fun decrement(item: CartItem) {
        val index = items.indexOfFirst { it.product.id == item.product.id }
        if (index < 0) return
        if (items[index].quantity <= 1) items.removeAt(index) else items[index] = items[index].copy(quantity = items[index].quantity - 1)
    }

    fun clear() {
        items.clear()
        restaurant.value = null
        address.value = ""
        deliveryFee.value = 0.0
        recommendedProducts.clear()
    }

    private fun recommendations(categories: List<MenuCategory>): List<MenuProduct> {
        val drinks = listOf("dryck", "cola", "fanta", "sprite", "vatten", "juice", "zero")
        val flat = categories.flatMap { it.products }
        return (flat.filter { product -> drinks.any { product.name.contains(it, ignoreCase = true) } } + flat)
            .distinctBy { it.id }
            .take(8)
    }
}
