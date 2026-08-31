/**
 * Välkomstmejlet som går ut när någon anmäler sitt intresse på viaeats.se.
 *
 * Ett enda syfte: ge kunden koden och leda in dem på sajten. Kort med flit —
 * mejlet har ett budskap, och varje extra stycke gör att koden syns sämre.
 *
 * Mallen är egen och följer varumärkesguiden (navy/orange/cream), till
 * skillnad från den generella `renderBrandedEmail` som är guld på mörkt och
 * används för interna driftmejl. Ordmärket är en bild eftersom Gmail inte
 * laddar webfonts — Baloo 2 kan alltså inte sättas som text i mejl.
 */

import { sendEmail } from './email';

/** Kännedomskoden. Raden ligger i DiscountCode och går att redigera i admin. */
export const LAUNCH_SHARED_COUPON_CODE = 'VIAEATS30';

/** Rabatt i procent — bara för mejltexten. DiscountCode-raden är sanningen. */
const LAUNCH_SHARED_COUPON_PERCENT = 30;

// Varumärkespaletten (Logotyp/VIAEATS_BRAND_GUIDE.md). På cream bär navy både
// rubrik och brödtext; orange används bara som accent och knappyta.
const NAVY = '#0A2340';
const ORANGE = '#F04F1A';
const CREAM = '#FEF7F0';
const SLATE = '#5A6472';

function siteBaseUrl(): string {
  return (
    process.env.WEB_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://viaeats.se'
  );
}

/**
 * Länkmål med kampanjmärkning. Vercel Analytics (cookielöst, redan installerat
 * i apps/web/app/layout.tsx) grupperar besök på utm_source, så antalet som
 * klickar sig in från mejlet går att läsa av utan egen mätinfrastruktur.
 *
 * `content` skiljer knappen från de andra länkarna i samma mejl — annars går
 * det inte att se om folk trycker på knappen eller på fotens länk.
 */
function trackedUrl(path: string, content: string): string {
  const url = new URL(path, siteBaseUrl());
  url.searchParams.set('utm_source', 'valkomstmejl');
  url.searchParams.set('utm_medium', 'email');
  url.searchParams.set('utm_campaign', 'viaeats30');
  url.searchParams.set('utm_content', content);
  return url.toString();
}

/**
 * Ordmärket ligger i webbens publika katalog och deployas med den. Byts
 * domänen följer bilden med via WEB_BASE_URL.
 */
function wordmarkUrl(): string {
  // www är den kanoniska värden — apex 308-redirectar dit. Alla mejlklienter
  // följer inte redirects för bilder, så vi pekar direkt på slutmålet i
  // stället för att gå via siteBaseUrl().
  const base = process.env.EMAIL_ASSET_BASE_URL || 'https://www.viaeats.se';
  return `${base}/email/viaeats-wordmark.png`;
}

/** Adressen kunden kan svara till. Ett mejl utan svarsväg känns automatiskt. */
function replyToAddress(): string | undefined {
  return process.env.EMAIL_REPLY_TO || undefined;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

export function renderLaunchWelcomeEmail(params: { name: string; code: string }) {
  const site = siteBaseUrl();
  const code = params.code;
  const hello = `Hej ${firstName(params.name)}!`;

  // Inline-styles genomgående — Gmail strippar <style>-block. Layouten är
  // tabellbaserad av samma skäl: flexbox och grid renderas inte i Outlook.
  const html = `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Här kommer din kod för viaeats</title>
  </head>
  <body style="margin:0;padding:0;background:${CREAM};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${CREAM};">
      <tr>
        <td align="center" style="padding:40px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:420px;background:#ffffff;border-radius:20px;">
            <tr>
              <td align="center" style="padding:36px 32px 34px;">

                <img src="${wordmarkUrl()}" width="150" alt="viaeats" style="display:block;width:150px;max-width:60%;height:auto;border:0;" />

                <p style="margin:26px 0 0;font-size:16px;line-height:24px;color:${NAVY};">${hello}</p>

                <p style="margin:6px 0 0;font-size:15px;line-height:23px;color:${SLATE};">Här är din kod.</p>

                <p style="margin:20px 0 0;font-size:30px;line-height:36px;font-weight:800;letter-spacing:2px;color:${NAVY};">${code}</p>

                <p style="margin:10px 0 0;font-size:14px;line-height:21px;color:${SLATE};">${LAUNCH_SHARED_COUPON_PERCENT} % på ordinarie priser. Använd den så ofta du vill.</p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px auto 0;">
                  <tr>
                    <td align="center" style="border-radius:12px;background:${ORANGE};">
                      <a href="${trackedUrl('/', 'knapp')}" style="display:inline-block;padding:14px 34px;font-size:15px;font-weight:800;color:${NAVY};text-decoration:none;">Beställ mat</a>
                    </td>
                  </tr>
                </table>

              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0;font-size:11px;line-height:17px;color:${SLATE};">
            viaeats · Lund · <a href="${site}/contact" style="color:${SLATE};">avregistrera</a>
          </p>

        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    hello,
    '',
    `Här är din kod: ${code}`,
    `${LAUNCH_SHARED_COUPON_PERCENT} % på ordinarie priser. Använd den så ofta du vill.`,
    '',
    trackedUrl('/', 'text'),
    '',
    `viaeats · Lund · avregistrera: ${site}/contact`,
  ].join('\n');

  return { subject: 'Här kommer din kod för viaeats', html, text };
}

/**
 * Skickar välkomstmejlet. Fail-open: ett mejl som inte går fram får aldrig
 * fälla registreringen — kunden är redan sparad när vi kommer hit.
 * Returnerar true bara när transporten bekräftat leverans, så anroparen vet
 * om `couponSentAt` ska sättas.
 */
export async function sendLaunchWelcomeEmail(params: {
  to: string;
  name: string;
  code?: string;
}): Promise<boolean> {
  const code = params.code || LAUNCH_SHARED_COUPON_CODE;
  const { subject, html, text } = renderLaunchWelcomeEmail({ name: params.name, code });
  const site = siteBaseUrl();
  try {
    return await sendEmail({
      to: params.to,
      subject,
      text,
      html,
      replyTo: replyToAddress(),
      headers: {
        // Krav för att inte rankas som skräppost på utskick med samtycke.
        'List-Unsubscribe': `<${site}/contact>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
  } catch (error) {
    console.error('[launch/welcome-email] send failed:', error);
    return false;
  }
}
