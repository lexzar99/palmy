export const DEFAULT_DELIVERY_FEE = 49;
export const DEFAULT_MIN_ORDER_AMOUNT = 150;
export const DEFAULT_ESTIMATED_PICKUP_TIME = 20;
export const DEFAULT_ESTIMATED_DELIVERY_TIME = 35;
export const DEFAULT_DELIVERY_RADIUS = 10;

export const DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export const defaultOpeningHours = DAYS.reduce<Record<string, { open: string; close: string; closed: boolean }>>(
  (acc, day) => {
    acc[day] = { open: '11:00', close: '22:00', closed: false };
    return acc;
  },
  {},
);

export const defaultRestaurantSettings = {
  id: 'settings',
  isOpen: true,
  deliveryFee: DEFAULT_DELIVERY_FEE,
  minOrderAmount: DEFAULT_MIN_ORDER_AMOUNT,
  deliveryRadius: DEFAULT_DELIVERY_RADIUS,
  estimatedPickupTime: DEFAULT_ESTIMATED_PICKUP_TIME,
  estimatedDeliveryTime: DEFAULT_ESTIMATED_DELIVERY_TIME,
  notificationSound: 'signal-1',
  openingHours: defaultOpeningHours,
};

export const parseOpeningHours = (value?: string | null) => {
  if (!value) {
    return { ...defaultOpeningHours };
  }

  try {
    return {
      ...defaultOpeningHours,
      ...(JSON.parse(value) as Record<string, { open: string; close: string; closed: boolean }>),
    };
  } catch {
    return { ...defaultOpeningHours };
  }
};

export const isRestaurantOpen = (isOpenFlag: boolean, openingHours: any, now = new Date()) => {
  if (!isOpenFlag) return false;
  
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = dayNames[now.getDay()];
  const hours = openingHours[dayKey];
  
  if (!hours || hours.closed) return false;
  
  const currentTime = now.getHours() * 60 + now.getMinutes();
  const [openH, openM] = hours.open.split(':').map(Number);
  const [closeH, closeM] = hours.close.split(':').map(Number);
  
  const openMinutes = openH * 60 + openM;
  let closeMinutes = closeH * 60 + closeM;
  
  // Handle closing after midnight (e.g. 02:00)
  if (closeMinutes <= openMinutes) {
    closeMinutes += 24 * 60;
  }
  
  return currentTime >= openMinutes && currentTime < closeMinutes;
};
