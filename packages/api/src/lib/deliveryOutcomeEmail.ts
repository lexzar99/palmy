/**
 * Mejl till kunden när restaurangen markerat "Kunden gick inte att nå".
 *
 * Transaktionsmejl. Mejlet ska gå att förstå utan länk: en kund som beställt i
 * en embed saknar orderns nyckel på en annan enhet, så allt kunden behöver
 * (vad som hänt och restaurangens nummer) står i själva mejlet. Fail-open:
 * ett mejl som inte går fram får aldrig fälla markeringen.
 */

import { sendEmail } from './email';
import { deliveryOutcomeCopy, type DeliveryOutcomeCode } from './deliveryOutcome';

const NAVY = '#0A2340';
const CREAM = '#FEF7F0';
const SLATE = '#5A6472';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** Samma korta nummer som spårningssidan och plattan visar (PA-1234-AB12C → 1234). */
export function customerOrderNumber(orderNumber: string): string {
  return orderNumber.match(/\d{4,}/)?.[0] ?? orderNumber;
}

export function renderDeliveryOutcomeEmail(params: {
  code: DeliveryOutcomeCode;
  note: string | null;
  orderNumber: string;
  restaurantName: string;
  restaurantPhone: string;
}) {
  const copy = deliveryOutcomeCopy(params.code, params);
  if (!copy) return null;
  const number = customerOrderNumber(params.orderNumber);
  const name = params.restaurantName || 'restaurangen';
  const subject = `Om din beställning #${number} från ${name}`;
  const contact = params.restaurantPhone ? `${name}: ${params.restaurantPhone}` : '';

  const text = [copy.title, '', copy.body, '', `Order #${number}`, contact, '', 'viaeats'].filter((l, i, a) => l || a[i - 1]).join('\n');

  const phoneHtml = params.restaurantPhone
    ? `<p style="margin:18px 0 0;font-size:15px;line-height:23px;color:${NAVY};">Ring ${escapeHtml(name)}: <a href="tel:${escapeHtml(params.restaurantPhone.replace(/\s+/g, ''))}" style="color:${NAVY};font-weight:700;">${escapeHtml(params.restaurantPhone)}</a></p>`
    : '';

  const html = `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CREAM};">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:440px;background:#ffffff;border-radius:20px;">
            <tr>
              <td style="padding:34px 30px 30px;">
                <p style="margin:0;font-size:13px;color:${SLATE};">Order #${escapeHtml(number)} · ${escapeHtml(name)}</p>
                <p style="margin:12px 0 0;font-size:20px;line-height:28px;font-weight:700;color:${NAVY};">${escapeHtml(copy.title)}</p>
                <p style="margin:10px 0 0;font-size:15px;line-height:23px;color:${SLATE};">${escapeHtml(copy.body)}</p>
                ${phoneHtml}
                <p style="margin:22px 0 0;font-size:13px;line-height:20px;color:${SLATE};">viaeats</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

export async function sendDeliveryOutcomeEmail(params: Parameters<typeof renderDeliveryOutcomeEmail>[0] & { to: string }): Promise<boolean> {
  try {
    const rendered = renderDeliveryOutcomeEmail(params);
    if (!rendered) return false;
    return await sendEmail({ to: params.to, ...rendered, replyTo: process.env.EMAIL_REPLY_TO || undefined });
  } catch (error) {
    console.error('[delivery-outcome] mejl misslyckades:', (error as Error)?.message ?? error);
    return false;
  }
}
