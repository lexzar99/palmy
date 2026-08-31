/**
 * Välkomstmejlet som går ut när någon anmäler sitt intresse på viaeats.se.
 *
 * Ett enda syfte: säga tack, ge kunden kännedomskoden och leda in dem på
 * sajten. Koden är delad (samma för alla) och obegränsad — poängen är att
 * folk ska lära känna viaeats, inte att ransonera rabatten.
 *
 * Mejlet är marknadsföring, inte transaktion: det skickas bara efter att
 * kunden kryssat i marknadsföringssamtycke, och det bär List-Unsubscribe så
 * Gmail/Outlook inte rankar ner avsändaren.
 */

import { renderBrandedEmail, sendEmail } from './email';

/** Kännedomskoden. Raden ligger i DiscountCode och går att redigera i admin. */
export const LAUNCH_SHARED_COUPON_CODE = 'VIAEATS30';

/** Rabatt i procent — bara för mejltexten. DiscountCode-raden är sanningen. */
const LAUNCH_SHARED_COUPON_PERCENT = 30;

function siteBaseUrl(): string {
  return (
    process.env.WEB_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://viaeats.se'
  );
}

/** Adressen kunden kan svara till. Ett mejl utan svarsväg känns automatiskt. */
function replyToAddress(): string | undefined {
  return process.env.EMAIL_REPLY_TO || undefined;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

/** Kupongrutan i mejlet. Inline-styles — Gmail strippar <style>-block. */
function couponBox(code: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 4px 0 4px;">
  <tr>
    <td align="center" style="border: 2px dashed #E7B24B; border-radius: 14px; padding: 18px 16px; background: #fff8ea;">
      <div style="font-size: 12px; font-weight: 700; letter-spacing: 1.5px; color: #6b6b6b; text-transform: uppercase;">Din kod</div>
      <div style="margin-top: 6px; font-size: 30px; font-weight: 900; letter-spacing: 3px; color: #0b0a0f;">${code}</div>
      <div style="margin-top: 6px; font-size: 13px; line-height: 19px; color: #6b6b6b;">${LAUNCH_SHARED_COUPON_PERCENT} % rabatt · använd den hur många gånger du vill</div>
    </td>
  </tr>
</table>`;
}

export function renderLaunchWelcomeEmail(params: { name: string; code: string }) {
  const site = siteBaseUrl();
  const code = params.code;
  const greeting = `Hej ${firstName(params.name)}!`;

  const html = renderBrandedEmail({
    headline: 'Tack för att du registrerade dig',
    greeting,
    intro: [
      'Kul att ha dig med oss. viaeats är matleverans i Lund byggd för att vara enklare — färre steg till maten, och en bättre affär för restaurangerna du beställer från.',
      `Som tack får du ${LAUNCH_SHARED_COUPON_PERCENT} % rabatt med koden nedan. Den gäller på ordinarie priser och du kan använda den om och om igen — dela den gärna med någon som också borde testa.`,
      couponBox(code),
      'Skriv in koden i kassan så dras rabatten av direkt.',
    ],
    cta: { label: 'Beställ på viaeats', url: site },
    footnote:
      `Koden gäller varor till ordinarie pris och kan inte kombineras med varor som redan är nedsatta. Vi vill att du blir nöjd — svara på det här mejlet om något strular, så löser vi det. Du får det här mejlet för att du anmälde ditt intresse på viaeats.se. <a href="${site}/contact" style="color: #6b6b6b;">Avregistrera dig här</a>.`,
  });

  const text = [
    greeting,
    '',
    'Tack för att du registrerade dig hos viaeats.',
    '',
    `Som tack får du ${LAUNCH_SHARED_COUPON_PERCENT} % rabatt med koden: ${code}`,
    'Koden gäller varor till ordinarie pris och kan användas hur många gånger du vill.',
    '',
    `Beställ här: ${site}`,
    '',
    'Vi vill att du blir nöjd — svara på det här mejlet om något strular.',
    '',
    `Du får det här mejlet för att du anmälde ditt intresse på viaeats.se. Avregistrera dig: ${site}/contact`,
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
