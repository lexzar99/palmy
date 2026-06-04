// Email-transport för Delívera.
//
// Användarvänd transaktionsmejl (verifiering, lösenordsåterställning) hanteras
// av SUPABASE auth. sendEmail() här används för interna utskick (t.ex.
// kapacitets-varningar). Transports — priority-ordning:
//
//   1. **Gmail SMTP** (om GMAIL_USER + GMAIL_APP_PASSWORD är satta)
//      — Funkar lokalt; från Railway kan port 587 vara blockerad.
//   2. **Console-log** (fallback) — loggar mejlet till stdout.
//
// Anrop misslyckas aldrig hårt — fail-open (loggar, kastar ej).
// (Brevo/Resend/Twilio borttagna — Supabase + Gmail/console räcker.)

import * as nodemailer from 'nodemailer';

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
   * From-adress. Default tas från env (`EMAIL_FROM`) om satt; annars
   * Gmail-användarens adress (om Gmail-transport) eller Resend test-
   * adressen (om Resend-transport).
   */
  from?: string;
};

// Cloud-hostar (Railway, Heroku, Fly.io) blockerar ofta utgående SMTP-port
// 587/465 för att förebygga spam-abuse. SMTP-baserade transports (Gmail, Brevo
// via SMTP) timeout:ar då efter 30-60s. HTTPS-baserade transports (Brevo API,
// Resend API) blockas inte eftersom de går via port 443. För Railway: använd
// Brevo HTTPS API. För lokal dev: Gmail SMTP funkar.
const SMTP_TIMEOUT_MS = 10_000; // Fail-fast istället för att hänga 60s+

// ── Gmail SMTP transport (om konfigurerad) ────────────────────────────────────
// VARNING: Cloud-hostar blockerar ofta SMTP-port 587 → timeout. Gmail funkar
// pålitligt LOKALT men inte alltid från Railway. Använd Brevo eller Resend
// från Railway.
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const gmailTransporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // STARTTLS på port 587
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
      })
    : null;

// ── Default From-adress ────────────────────────────────────────────────────────
function defaultFrom(): string {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  if (GMAIL_USER) return `Delívera <${GMAIL_USER}>`;
  return 'Delívera <noreply@delivera.se>';
}

// Avsändaren routas från admin (Plattform-inställningar): företagsnamn som
// display-name och noReplyEmail som adress. Cachas 60s så vi inte slår mot DB
// per mejl. Faller tillbaka på defaultFrom() (env/SMTP-user) om settings saknas
// eller DB:t inte svarar — mejl ska aldrig blockeras av en settings-läsning.
let _fromCache: { value: string; expiresAt: number } | null = null;
async function resolveDefaultFrom(): Promise<string> {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  const now = Date.now();
  if (_fromCache && _fromCache.expiresAt > now) return _fromCache.value;
  let value = defaultFrom();
  try {
    const prisma = (await import('./prisma')).default;
    const s: any = await prisma.restaurantSettings.findUnique({
      where: { id: 'settings' },
      select: { companyName: true, noReplyEmail: true },
    });
    const name = (s?.companyName || 'Delívera').trim();
    const base = parseFromAddress(defaultFrom()).email;
    const email = (s?.noReplyEmail || base).trim();
    if (email) value = `${name} <${email}>`;
  } catch {
    /* behåll defaultFrom() */
  }
  _fromCache = { value, expiresAt: now + 60_000 };
  return value;
}

// Parsa "Name <email@x.com>" → { name?, email } för Brevo API
function parseFromAddress(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: from.trim() };
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const from = msg.from || await resolveDefaultFrom();

  // Gmail SMTP (om konfigurerad). Funkar lokalt; från Railway kan port 587 vara
  // blockerad → faller då igenom till console-loggen nedan.
  if (gmailTransporter) {
    try {
      await gmailTransporter.sendMail({
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
      console.log(`[email] Gmail sent to ${msg.to}`);
    } catch (err) {
      console.error('[email] gmail SMTP send failed:', err);
    }
    return;
  }

  // Console-log fallback (ingen e-post-transport konfigurerad).
  console.log('────────────────────────────────────────────────────');
  console.log('[email] (no transport configured — logging only)');
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
// HTML-mall för FoodGo-mejl.
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
                <div style="font-size: 22px; font-weight: 900; letter-spacing: 4px; color: ${gold};">FOODGO</div>
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
                <p style="margin: 0; font-size: 11px; line-height: 16px; color: ${muted};">© FoodGo · <a href="https://matgo.se" style="color: ${muted}; text-decoration: none;">matgo.se</a></p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
