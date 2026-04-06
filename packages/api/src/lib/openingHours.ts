
export interface OpeningHours {
  open: string; // e.g., "11:00"
  close: string; // e.g., "22:00"
  closed: boolean;
}

export type WeeklyOpeningHours = Record<string, OpeningHours>;

export function isRestaurantOpen(openingHours: any | string | null | undefined): boolean {
  if (!openingHours) return true;
  
  let hours: any;
  if (typeof openingHours === 'string') {
    try {
      hours = JSON.parse(openingHours);
    } catch {
      return true;
    }
  } else {
    hours = openingHours;
  }

  // Use Sweden (Europe/Stockholm) time
  const nowInSweden = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Stockholm" }));
  const todayStr = nowInSweden.toISOString().split('T')[0];
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = dayNames[nowInSweden.getDay()];

  // Check Special Hours (Exceptions)
  if (hours.specialHours && Array.isArray(hours.specialHours)) {
    const special = hours.specialHours.find((sh: any) => sh.date === todayStr);
    if (special) {
      if (special.closed) return false;
      if (special.open && special.close) {
        return isWithinSlot(nowInSweden, special.open, special.close);
      }
    }
  }

  const todayData = hours[dayKey] || hours.regular?.[dayKey];

  // If no hours set at all, default to open
  if (!todayData) return true;

  // Handle { closed: true, shifts: [...] } format
  if ((todayData as any).closed === true) return false;

  // Extract slots
  let slots: any[] = [];
  if (Array.isArray(todayData)) {
    slots = todayData;
  } else if ((todayData as any).shifts && Array.isArray((todayData as any).shifts)) {
    slots = (todayData as any).shifts;
  } else {
    slots = [todayData];
  }

  for (const slot of slots) {
    if (!slot.open || !slot.close) continue;
    if (isWithinSlot(nowInSweden, slot.open, slot.close)) return true;
  }

  return false;
}

function isWithinSlot(now: Date, open: any, close: any): boolean {
  if (typeof open !== 'string' || typeof close !== 'string') return false;
  if (!open.includes(':') || !close.includes(':')) return false;

  const [openH, openM] = open.split(':').map(Number);
  const [closeH, closeM] = close.split(':').map(Number);
  
  if (isNaN(openH) || isNaN(openM) || isNaN(closeH) || isNaN(closeM)) return false;
  
  const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
  const openTimeInMinutes = openH * 60 + openM;
  let closeTimeInMinutes = closeH * 60 + closeM;

  if (closeTimeInMinutes <= openTimeInMinutes) {
    closeTimeInMinutes += 24 * 60;
  }

  return currentTimeInMinutes >= openTimeInMinutes && currentTimeInMinutes < closeTimeInMinutes;
}
