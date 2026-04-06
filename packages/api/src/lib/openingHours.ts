
export interface OpeningHours {
  open: string; // e.g., "11:00"
  close: string; // e.g., "22:00"
  closed: boolean;
}

export type WeeklyOpeningHours = Record<string, OpeningHours>;

export function isRestaurantOpen(openingHours: WeeklyOpeningHours | string | null | undefined): boolean {
  if (!openingHours) return true;
  
  let hours: WeeklyOpeningHours;
  if (typeof openingHours === 'string') {
    try {
      hours = JSON.parse(openingHours);
    } catch {
      return true;
    }
  } else {
    hours = openingHours;
  }

  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = dayNames[now.getDay()];
  const todayHours = hours[dayKey];

  if (!todayHours || (todayHours as any).closed) return false;

  const slots = Array.isArray(todayHours) ? todayHours : [todayHours];

  for (const slot of slots) {
    if (!slot.open || !slot.close) continue;

    const [openH, openM] = slot.open.split(':').map(Number);
    const [closeH, closeM] = slot.close.split(':').map(Number);
    
    const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
    const openTimeInMinutes = openH * 60 + openM;
    let closeTimeInMinutes = closeH * 60 + closeM;

    // Handle closing time after midnight (e.g., 02:00)
    if (closeTimeInMinutes <= openTimeInMinutes) {
      closeTimeInMinutes += 24 * 60;
    }

    if (currentTimeInMinutes >= openTimeInMinutes && currentTimeInMinutes < closeTimeInMinutes) {
      return true;
    }
  }

  return false;
}
