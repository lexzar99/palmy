type RestaurantAdminIdentity = {
  id: string;
  name: string;
  slug: string;
  adminEmail?: string | null;
};

export const normalizeAdminLoginAlias = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const getRestaurantAdminLogin = (restaurant: {
  slug: string;
  adminEmail?: string | null;
}) => {
  const primaryLogin = String(restaurant.adminEmail || restaurant.slug || '').trim().toLowerCase();
  return primaryLogin;
};

export const buildRestaurantAdminLoginLookup = <T extends RestaurantAdminIdentity>(restaurants: T[]) => {
  const restaurantByLogin = new Map<string, { id: string; name: string; slug: string }>();

  for (const restaurant of restaurants) {
    const slugLogin = String(restaurant.slug || '').trim().toLowerCase();
    const primaryLogin = getRestaurantAdminLogin(restaurant);
    const identity = { id: restaurant.id, name: restaurant.name, slug: restaurant.slug };

    if (slugLogin) {
      restaurantByLogin.set(slugLogin, identity);
    }

    if (primaryLogin) {
      restaurantByLogin.set(primaryLogin, identity);
    }
  }

  return restaurantByLogin;
};
