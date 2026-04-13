export type OrderType = "DELIVERY" | "PICKUP";

export type AppRoute =
  | { name: "home" }
  | { name: "discover" }
  | { name: "search" }
  | { name: "restaurant"; slug: string }
  | { name: "cart" }
  | { name: "profile" }
  | { name: "register" }
  | { name: "order"; id: string }
  | { name: "discover-filtered"; restaurantIds: string[]; dealId?: string; dealTitle?: string };

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  cuisine?: string;
  description?: string;
  address?: string;
  city?: string;
  zip?: string;
  phone?: string;
  imageUrl?: string;
  heroImageUrl?: string;
  rating?: number;
  ratingCount?: number;
  deliveryFee?: number;
  minOrderAmount?: number;
  etaMinutes?: number;
  activeOrdersCount?: number;
  isOpen?: boolean;
  manualIsOpen?: boolean;
  featuredClass?: number;
  tags?: string[];
  openingHours?: {
    regular?: Record<string, { closed?: boolean; shifts?: { open: string; close: string }[] }>;
    special?: unknown[];
  };
}

export interface City {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  deliveryMode: "ALL" | "ONLY_PICKUP" | "ONLY_DELIVERY";
}

export interface PublicDeal {
  id: string;
  title: string;
  description?: string;
  badgeText?: string | null;
  isGlobal?: boolean;
  restaurantId?: string | null;
  restaurant?: {
    id?: string;
    name?: string;
    slug?: string;
  } | null;
  isActive?: boolean;
  showOnSite?: boolean;
  discountType?: "FIXED" | "PERCENTAGE";
  discountValue?: number;
  minOrder?: number;
  comboProductNames?: string[];
  validUntil?: string | null;
  applicableRestaurantIds?: string[];
}

export interface MenuExtra {
  id: string;
  name: string;
  price?: number;
  priceAddon?: number;
  isDefault?: boolean;
}

export interface MenuExtraGroup {
  id: string;
  name: string;
  description?: string;
  type?: string;
  required?: boolean;
  minSelections?: number;
  maxSelections?: number;
  position?: number;
  extras: MenuExtra[];
}

export interface MenuProduct {
  id: string;
  slug?: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isVegan?: boolean;
  isVegetarian?: boolean;
  isGlutenFree?: boolean;
  extraGroups?: MenuExtraGroup[];
}

export interface MenuCategory {
  id: string;
  name: string;
  products: MenuProduct[];
}

export interface CartItem {
  cartItemId: string;
  productId: string;
  restaurantId: string;
  restaurantSlug?: string | null;
  name: string;
  price: number;
  quantity: number;
  extras: {
    groupId: string;
    groupName: string;
    extraId: string;
    name: string;
    price: number;
  }[];
  note?: string;
}

export interface Profile {
  id?: string;
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  zip?: string;
  isVerified?: boolean;
  image?: string | null;
}

export interface Order {
  id: string;
  orderNumber?: string;
  status: string;
  type: OrderType;
  customerName?: string;
  customerPhone?: string;
  total?: number;
  totalAmount?: number;
  deliveryFee?: number;
  deliveryStreet?: string;
  deliveryZip?: string;
  deliveryCity?: string;
  estimatedTime?: number;
  createdAt?: string;
  restaurantId?: string;
  // Backend GET /api/orders/:id returns these flat fields (not a nested restaurant object)
  restaurantName?: string;
  restaurantAddress?: string;
  restaurantZip?: string;
  restaurantCity?: string;
  restaurantPhone?: string;
  // Some list endpoints return a nested restaurant object
  restaurant?: {
    id?: string;
    name?: string;
    slug?: string;
  };
  items?: Array<{
    id?: string;
    productId?: string;
    productName?: string;
    name?: string;
    quantity: number;
    basePrice?: number;
    subtotal?: number;
    selectedExtras?: Array<{
      groupId?: string;
      groupName?: string;
      extraId?: string;
      extraName?: string;
      priceAddon?: number;
    }>;
    note?: string;
  }>;
  // Rating and review (from profile/orders/:id/review endpoint)
  rating?: number;
  review?: string;
  reviewedAt?: string;
}

export interface DeliveryCheck {
  available: boolean;
  deliveryFee: number;
  minOrder: number;
}

export interface ReviewPayload {
  rating: number;
  review?: string;
}

export interface AppStoreState {
  hydrated: boolean;
  items: CartItem[];
  restaurantId: string | null;
  restaurantSlug: string | null;
  address: string;
  coords: { lat: number; lng: number } | null;
  deliveryAddress: string;
  deliveryCoords: { lat: number; lng: number } | null;
  pickupCity: string;
  orderType: OrderType;
  token: string | null;
  profile: Profile | null;
  pendingPromoCode: string | null;
  filteredRestaurantIds: string[] | null;
  activeOrderId: string | null;
  dislikedIngredients: string[];
  deliveryOverrides: Record<string, { deliveryFee: number; minOrderAmount: number }>;
  addItem: (item: Omit<CartItem, "cartItemId">) => void;
  removeItem: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, amount: number) => void;
  clearCart: () => void;
  setAddress: (address: string, coords?: { lat: number; lng: number } | null) => void;
  setDeliveryAddress: (address: string, coords?: { lat: number; lng: number } | null) => void;
  setPickupCity: (city: string) => void;
  setOrderType: (orderType: OrderType) => void;
  setToken: (token: string | null) => void;
  setProfile: (profile: Profile | null) => void;
  setPendingPromoCode: (code: string | null) => void;
  setFilteredRestaurantIds: (ids: string[] | null) => void;
  clearSession: () => void;
  setActiveOrder: (id: string | null) => void;
  setDislikedIngredients: (ingredients: string[]) => void;
  setDeliveryOverrides: (overrides: Record<string, { deliveryFee: number; minOrderAmount: number }>) => void;
  updateDeliveryOverride: (restaurantId: string, deliveryFee: number, minOrderAmount: number) => void;
  hydrate: () => Promise<void>;
  /** True once the user has completed or dismissed the first-launch onboarding */
  onboardingComplete: boolean;
  setOnboardingComplete: (value: boolean) => void;
}
