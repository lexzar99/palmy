export const ORDER_CHANNELS = {
  partnerEmbed: 'PARTNER_EMBED',
  web: 'VIAEATS_WEB',
  app: 'VIAEATS_APP',
} as const;

export type OrderChannel = (typeof ORDER_CHANNELS)[keyof typeof ORDER_CHANNELS];

type ResolveOrderChannelInput = {
  clientType?: unknown;
  kioskRestaurantSlug?: string | null;
  restaurantSlug?: string | null;
};

/**
 * Beställningskanalen avgörs av serververifierad kontext, aldrig av ett fritt
 * body-fält. Ett giltigt kioskbevis är bundet till partnerrestaurangen och kan
 * därför skilja Palmyras privata embed från en vanlig viaeats-webbcheckout.
 */
export function resolveOrderChannel(input: ResolveOrderChannelInput): OrderChannel {
  const clientType = String(input.clientType || '').trim().toLowerCase();
  if (clientType === 'ios' || clientType === 'android') return ORDER_CHANNELS.app;

  if (
    clientType === 'web' &&
    input.kioskRestaurantSlug &&
    input.restaurantSlug &&
    input.kioskRestaurantSlug === input.restaurantSlug
  ) {
    return ORDER_CHANNELS.partnerEmbed;
  }

  return ORDER_CHANNELS.web;
}

export function orderChannelAuditChanges(
  channel: OrderChannel,
  context: { clientType?: unknown; restaurantSlug?: string | null },
): string {
  return JSON.stringify({
    channel,
    clientType: String(context.clientType || '').trim().toLowerCase() || null,
    restaurantSlug: context.restaurantSlug || null,
  });
}

export function orderChannelFromAuditChanges(value: string | null | undefined): OrderChannel | null {
  if (!value) return null;
  try {
    const channel = JSON.parse(value)?.channel;
    return Object.values(ORDER_CHANNELS).includes(channel) ? channel : null;
  } catch {
    return null;
  }
}

export function customerNameWithOrderChannel(
  customerName: string | null | undefined,
  channel: OrderChannel | null | undefined,
): string {
  const name = String(customerName || '').trim();
  if (!name || !channel) return name;
  if (/\s[–-]\s(?:privat|viaeats)$/i.test(name)) return name;
  const label = channel === ORDER_CHANNELS.partnerEmbed ? 'privat' : 'viaeats';
  return `${name} – ${label}`;
}
