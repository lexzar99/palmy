
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

  // If no hours set at all (completely empty object), default to open for new restaurants
  const allKeys = Object.keys(hours);
  const hasRegular = hours.regular && Object.keys(hours.regular).length > 0;
  if (allKeys.length === 0 && !hasRegular) return true;

  // If we have some data but nothing for today, it means we are closed today
  if (!todayData) return false;

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
    const open = isWithinSlot(nowInSweden, slot.open, slot.close);
    console.log(`[OpeningHours] Slot ${slot.open}-${slot.close} isWithin: ${open}`);
    if (open) return true;
  }

  return false;
}

/**
 * Returns true if the restaurant has any meaningful opening-hours data configured.
 * Accepts every shape isRestaurantOpen() handles:
 *   - { monday: { open, close } }
 *   - { monday: { open, close, closed } }
 *   - { monday: [{ open, close }, ...] }
 *   - { monday: { shifts: [{ open, close }, ...] } }
 *   - { monday: { closed: true } }
 *   - { specialHours: [...] }
 *   - { regular: { monday: ... } }
 */
export function hasOpeningHours(openingHours: any | string | null | undefined): boolean {
  if (!openingHours) return false;
  let hours: any;
  if (typeof openingHours === 'string') {
    try {
      hours = JSON.parse(openingHours);
    } catch {
      return false;
    }
  } else {
    hours = openingHours;
  }
  if (!hours || typeof hours !== 'object') return false;

  const dayHasData = (day: any): boolean => {
    if (!day) return false;
    if (Array.isArray(day)) return day.some((slot) => slot && (slot.open || slot.close));
    if (typeof day !== 'object') return false;
    if (day.closed === true || day.closed === false) return true;
    if (day.open && day.close) return true;
    if (Array.isArray(day.shifts) && day.shifts.some((s: any) => s && (s.open || s.close))) return true;
    return false;
  };

  if (Array.isArray(hours.specialHours) && hours.specialHours.some(dayHasData)) return true;
  if (hours.regular && typeof hours.regular === 'object') {
    for (const k of Object.keys(hours.regular)) {
      if (dayHasData(hours.regular[k])) return true;
    }
  }
  const skip = new Set(['specialHours', 'regular']);
  for (const key of Object.keys(hours)) {
    if (skip.has(key)) continue;
    if (dayHasData(hours[key])) return true;
  }
  return false;
}

/**
 * Minuter kvar tills restaurangen enligt schemat stänger IDAG, räknat från nu
 * (Europe/Stockholm). Returnerar null om restaurangen inte är inom ett öppet
 * pass just nu. Används av bedrägeri-vakten för att flagga "stängde tidigt"
 * (t.ex. pausade 1,5h innan stängning). Hanterar samma former som
 * isRestaurantOpen (platt, shifts, array, regular, specialHours).
 */
export function minutesUntilClose(openingHours: any | string | null | undefined): number | null {
  if (!openingHours) return null;
  let hours: any;
  if (typeof openingHours === 'string') {
    try {
      hours = JSON.parse(openingHours);
    } catch {
      return null;
    }
  } else {
    hours = openingHours;
  }
  if (!hours || typeof hours !== 'object') return null;

  const nowInSweden = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Stockholm' }));
  const todayStr = nowInSweden.toISOString().split('T')[0];
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayKey = dayNames[nowInSweden.getDay()];

  let todayData: any = hours[dayKey] || hours.regular?.[dayKey];
  if (hours.specialHours && Array.isArray(hours.specialHours)) {
    const special = hours.specialHours.find((sh: any) => sh.date === todayStr);
    if (special) {
      if (special.closed) return null;
      if (special.open && special.close) todayData = special;
    }
  }
  if (!todayData || (todayData as any).closed === true) return null;

  let slots: any[] = [];
  if (Array.isArray(todayData)) slots = todayData;
  else if (Array.isArray((todayData as any).shifts)) slots = (todayData as any).shifts;
  else slots = [todayData];

  const nowMin = nowInSweden.getHours() * 60 + nowInSweden.getMinutes();
  for (const slot of slots) {
    if (!slot?.open || !slot?.close) continue;
    const [oH, oM] = String(slot.open).split(':').map(Number);
    const [cH, cM] = String(slot.close).split(':').map(Number);
    if ([oH, oM, cH, cM].some((n) => Number.isNaN(n))) continue;
    const openMin = oH * 60 + oM;
    let closeMin = cH * 60 + cM;
    if (closeMin <= openMin) closeMin += 24 * 60; // efter midnatt
    if (nowMin >= openMin && nowMin < closeMin) return closeMin - nowMin;
  }
  return null;
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
