// Email-transport för FoodGo.
//
// Stöder 3 transports — priority-ordning:
//
//   1. **Gmail SMTP** (om GMAIL_USER + GMAIL_APP_PASSWORD är satta)
//      — Skickar via Gmails SMTP-server. Funkar UTAN egen domän, fungerar
//      direkt till ANY mottagare. Avsändare blir den Gmail-adress du
//      konfigurerat. Limit: ~500 mejl/dag per Gmail-konto.
//      Setup: aktivera 2FA på Google-kontot, skapa "App password" på
//      https://myaccount.google.com/apppasswords, sätt env-vars i Railway.
//
//   2. **Resend** (om RESEND_API_KEY är satt)
//      — Modern email-API. KRÄVER verifierad domän för att skicka till
//      andra än kontoägarens egen email. Utan verifierad domän:
//      `onboarding@resend.dev` används men endast kontoägarens email
//      tar emot. Bäst för PRODUKTION med egen domän.
//
//   3. **Console-log** (fallback om varken Gmail eller Resend är konfade)
//      — Loggar email-innehåll till stdout. Bra för dev så flöden kan
//      testas end-to-end utan extern beroende.
//
// Anrop misslyckas aldrig hårt — vi fail-open, dvs. loggar och returnerar
// utan att kasta. Anroparna (auth-routes) har egen `try/catch` runt
// `sendEmail()` men returnerar 200 även vid mejl-fel, så vi avslöjar
// inte om en adress finns eller ej.
//
// Switch-rekommendation:
//   - DEV/TEST utan domän: Gmail SMTP (kan skicka till alla)
//   - PROD med egen domän: Resend (snyggare avsändare, bättre deliverability)

import { Resend } from 'resend';
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

// ── Brevo HTTPS API (REKOMMENDERAT för Railway) ──────────────────────────────
// Brevo's REST API på api.brevo.com — använder port 443 (HTTPS) som ALDRIG
// blockeras av Railway. Tillåter sender-verifiering utan domän via klick-länk.
// 300 gratis-mejl/dag.
//
// Setup:
//   1. Skapa konto på brevo.com
//   2. Senders → "Add a sender" → verifiera din email via klick-länk
//   3. SMTP & API → "API Keys"-fliken → "Generate a new API key"
//      (OBS: API key är ANNAN sak än SMTP key. Behöver API-fliken, inte
//      SMTP-fliken.)
//   4. Sätt BREVO_API_KEY i Railway (det börjar med "xkeysib-...")
const BREVO_API_KEY = process.env.BREVO_API_KEY;

// ── Brevo SMTP transport (LOKAL dev) ──────────────────────────────────────────
// Behåll som fallback för lokal utveckling där SMTP funkar.
const BREVO_SMTP_USER = process.env.BREVO_SMTP_USER;
const BREVO_SMTP_PASS = process.env.BREVO_SMTP_PASS;
const brevoTransporter =
  BREVO_SMTP_USER && BREVO_SMTP_PASS
    ? nodemailer.createTransport({
        host: 'smtp-relay.brevo.com',
        port: 587,
        secure: false,
        auth: { user: BREVO_SMTP_USER, pass: BREVO_SMTP_PASS },
        connectionTimeout: SMTP_TIMEOUT_MS,
        greetingTimeout: SMTP_TIMEOUT_MS,
        socketTimeout: SMTP_TIMEOUT_MS,
      })
    : null;

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

// ── Resend transport (om konfigurerad) ────────────────────────────────────────
// HTTPS-baserad — inga port-blockaden. Bäst för PRODUKTION med egen domän.
// Utan domän: kan bara skicka till kontoägarens email.
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// ── Default From-adress ────────────────────────────────────────────────────────
function defaultFrom(): string {
  if (process.env.EMAIL_FROM) return process.env.EMAIL_FROM;
  if (BREVO_SMTP_USER) return `FoodGo <${BREVO_SMTP_USER}>`;
  if (GMAIL_USER) return `FoodGo <${GMAIL_USER}>`;
  return 'FoodGo <onboarding@resend.dev>';
}

// Parsa "Name <email@x.com>" → { name?, email } för Brevo API
function parseFromAddress(from: string): { name?: string; email: string } {
  const match = from.match(/^\s*(.+?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1].trim(), email: match[2].trim() };
  return { email: from.trim() };
}

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const from = msg.from || defaultFrom();

  // 1. Brevo HTTPS API — REKOMMENDERAT för Railway. Inga port-blockaden.
  if (BREVO_API_KEY) {
    try {
      const sender = parseFromAddress(from);
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': BREVO_API_KEY,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender,
          to: [{ email: msg.to }],
          subject: msg.subject,
          textContent: msg.text,
          htmlContent: msg.html,
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error(`[email] Brevo API ${response.status}:`, body);
      } else {
        console.log(`[email] Brevo API sent to ${msg.to}`);
      }
    } catch (err) {
      console.error('[email] Brevo API threw:', err);
    }
    return;
  }

  // 2. Brevo SMTP — funkar lokalt om port 587 inte är blockerad.
  if (brevoTransporter) {
    try {
      await brevoTransporter.sendMail({
        from,
        to: msg.to,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
      });
      console.log(`[email] Brevo SMTP sent to ${msg.to}`);
    } catch (err) {
      console.error('[email] Brevo SMTP send failed:', err);
    }
    return;
  }

  // 2. Gmail SMTP — funkar lokalt, ofta timeout från Railway pga port-block.
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

  // 3. Resend — HTTPS-baserad. Inga port-blockaden. Kräver verifierad domän
  // för att skicka till andra än kontoägaren.
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
        console.error('[email] resend.emails.send error:', error);
      } else {
        console.log(`[email] Resend sent to ${msg.to}`);
      }
    } catch (err) {
      console.error('[email] resend send threw:', err);
    }
    return;
  }

  // 3. Console-log fallback.
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
