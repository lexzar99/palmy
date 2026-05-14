// Email-transport för MatGo.
//
// STATUS: Resend är wired up. Om `RESEND_API_KEY` finns i env skickas mejl
// via Resend API; saknas nyckeln faller modulen tillbaka till en console.log-
// stub så dev/test fortsätter fungera utan extern beroende.
//
// Anrop misslyckas aldrig hårt — vi fail-open, dvs. loggar och returnerar
// utan att kasta. Anroparna (auth-routes) har egen `try/catch` runt
// `sendEmail()` men returnerar 200 även vid mejl-fel, så vi avslöjar
// inte om en adress finns eller ej.
//
// Setup (post-deploy):
//   1. Skapa konto på resend.com (free tier funkar).
//   2. Generera API-nyckel.
//   3. Sätt RESEND_API_KEY i Railway-miljön (kund-API:t).
//
// PROD: när du har verifierat matgo.se i Resend (via DNS-records), sätt
//   EMAIL_FROM=MatGo <no-reply@matgo.se>
// i Railway env för att skicka från egen domän.
//
// DEV/TEST: utan verifierad domän, använd Resend's test-avsändare
// `onboarding@resend.dev` — den är förverifierad och kräver inget DNS.
// VIKTIGT: emails går då BARA till email-adressen kontot är registrerat
// på Resend (= din egen email). Andra mottagare blockas. Default nedan.

import { Resend } from 'resend';

export type EmailMessage = {
  to: string;
  subject: string;
  /**
   * Plain text-body. Alltid obligatorisk så vi har en fallback om
   * mottagaren inte renderar HTML.
   */
  text: string;
  /**
   * Valfri HTML-body. Om transporten stödjer det skickas båda;
   * annars används bara `text`.
   */
  html?: string;
  /**
   * From-adress. Default tas från env (`EMAIL_FROM`) om satt, annars
   * `MatGo <no-reply@matgo.se>`.
   */
  from?: string;
};

// Default: Resend's förverifierade test-avsändare. Funkar direkt utan DNS,
// men mejlen levereras bara till email-adressen som Resend-kontot är
// registrerat på. När matgo.se är verifierad i Resend → sätt EMAIL_FROM
// i Railway till "MatGo <no-reply@matgo.se>".
const DEFAULT_FROM =
  process.env.EMAIL_FROM ||
  'MatGo <onboarding@resend.dev>';

// Instansiera en gång vid modulladdning. `null` om ingen API-nyckel —
// då används console.log-fallbacken så lokal utveckling inte kraschar.
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const from = msg.from || DEFAULT_FROM;

  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
      if (error) {
        // Resend signalerar fel via `error`-fältet snarare än throw.
        // Logga, men kasta inte vidare — anroparen har redan try/catch
        // och vi vill inte krascha auth-flöden för ett mejl-fel.
        console.error('[email] resend.emails.send error:', error);
      }
    } catch (err) {
      console.error('[email] resend send threw:', err);
    }
    return;
  }

  // Logg-fallback. Behåll formattering — Railway parsar JSON-rader bra,
  // men för dev-konsollen vill vi se att mejlet "kom fram" i klartext.
  console.log('────────────────────────────────────────────────────');
  console.log('[email] (no RESEND_API_KEY — logging only)');
  console.log(`  From:    ${from}`);
  console.log(`  To:      ${msg.to}`);
  console.log(`  Subject: ${msg.subject}`);
  console.log('  Body:');
  for (const line of msg.text.split('\n')) {
    console.log(`    ${line}`);
  }
  if (msg.html) {
    console.log('  HTML-version finns (loggas ej; använd transporten).');
  }
  console.log('────────────────────────────────────────────────────');
}

// ----------------------------------------------------------------------------
// HTML-mall för MatGo-mejl.
// Gold-accent (#E7B24B) mot mörk panel (#0b0a0f) med ljusare innehållscontainer
// så CTA-knappen sticker ut. Inline-styles för bred klient-kompatibilitet
// (Gmail strippar <style>-block i många sammanhang).
// ----------------------------------------------------------------------------

export type EmailTemplateOptions = {
  /** Stora rubriken högst upp, t.ex. "Återställ ditt lösenord". */
  headline: string;
  /** Hälsning före brödtexten, t.ex. "Hej Anna!". */
  greeting?: string;
  /** En eller flera paragrafer som ska visas före CTA-knappen. */
  intro: string[];
  /** CTA-text + URL. */
  cta: { label: string; url: string };
  /** Sub-paragraf efter CTA, t.ex. utgångstid och säkerhetsinfo. */
  footnote?: string;
  /** Liten ytterligare deeplink (mobil) under CTA, valfritt. */
  mobileDeepLink?: { label: string; url: string };
};

export function renderBrandedEmail(opts: EmailTemplateOptions): string {
  const gold = '#E7B24B';
  const dark = '#0b0a0f';
  const cream = '#fdfbf7';
  const text = '#1a1a1a';
  const muted = '#6b6b6b';

  const intro = opts.intro
    .map(
      (p) =>
        `<p style="margin: 0 0 14px; font-size: 15px; line-height: 22px; color: ${text};">${p}</p>`,
    )
    .join('');

  const greetingHtml = opts.greeting
    ? `<p style="margin: 0 0 14px; font-size: 15px; line-height: 22px; color: ${text};">${opts.greeting}</p>`
    : '';

  const footnoteHtml = opts.footnote
    ? `<p style="margin: 24px 0 0; font-size: 12px; line-height: 18px; color: ${muted};">${opts.footnote}</p>`
    : '';

  const mobileLinkHtml = opts.mobileDeepLink
    ? `<p style="margin: 14px 0 0; font-size: 12px; line-height: 18px; color: ${muted};">${opts.mobileDeepLink.label}<br><a href="${opts.mobileDeepLink.url}" style="color: ${gold}; text-decoration: none;">${opts.mobileDeepLink.url}</a></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="sv">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${opts.headline}</title>
  </head>
  <body style="margin: 0; padding: 0; background: ${dark}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background: ${dark};">
      <tr>
        <td align="center" style="padding: 32px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width: 540px; background: ${cream}; border-radius: 24px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.35);">
            <!-- Header bar -->
            <tr>
              <td align="center" style="padding: 28px 24px 8px; background: ${dark};">
                <div style="font-size: 22px; font-weight: 900; letter-spacing: 4px; color: ${gold};">MATGO</div>
              </td>
            </tr>
            <!-- Gold accent line -->
            <tr>
              <td style="height: 4px; background: ${gold}; line-height: 4px; font-size: 4px;">&nbsp;</td>
            </tr>
            <!-- Body -->
            <tr>
              <td style="padding: 36px 32px 32px;">
                <h1 style="margin: 0 0 20px; font-size: 24px; line-height: 30px; font-weight: 900; letter-spacing: -0.5px; color: ${dark};">${opts.headline}</h1>
                ${greetingHtml}
                ${intro}
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 28px 0 8px;">
                  <tr>
                    <td align="center" style="border-radius: 14px; background: ${gold};">
                      <a href="${opts.cta.url}" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 900; letter-spacing: 0.5px; color: ${dark}; text-decoration: none;">${opts.cta.label}</a>
                    </td>
                  </tr>
                </table>
                ${mobileLinkHtml}
                ${footnoteHtml}
              </td>
            </tr>
            <!-- Footer -->
            <tr>
              <td style="padding: 20px 24px; background: ${dark}; text-align: center;">
                <p style="margin: 0; font-size: 11px; line-height: 16px; color: ${muted};">© MatGo · <a href="https://matgo.se" style="color: ${muted}; text-decoration: none;">matgo.se</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
