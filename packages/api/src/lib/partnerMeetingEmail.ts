/**
 * Bekräftelsemejl till den som bokat en genomgång via /boka.
 *
 * Transaktionsmejl, inte marknadsföring — därför ingen List-Unsubscribe.
 * Samma fail-open-stil som välkomstmejlet: ett mejl som inte går fram får
 * aldrig fälla bokningen, den ligger redan i databasen och Jalle har fått
 * WhatsApp-notisen.
 */

import { sendEmail } from './email';
import { formatMeetingLong, type MeetingMode } from './partnerMeetings';

const NAVY = '#0A2340';
const CREAM = '#FEF7F0';
const SLATE = '#5A6472';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));

function wordmarkUrl(): string {
  const base = process.env.EMAIL_ASSET_BASE_URL || 'https://www.viaeats.se';
  return `${base}/email/viaeats-wordmark.png`;
}

export function renderPartnerMeetingEmail(params: {
  name: string;
  restaurant: string;
  city: string;
  mode: MeetingMode;
  slotStart: string;
  slotEnd: string;
}) {
  const { date, time } = formatMeetingLong(params.slotStart, params.slotEnd);
  const first = params.name.trim().split(/\s+/)[0] || '';
  const hello = first.length >= 2 ? `Hej ${first}!` : 'Hej!';
  const modeLine = params.mode === 'onsite'
    ? `Jag kommer förbi ${params.restaurant} i ${params.city} och visar terminalen på plats.`
    : 'Vi ses på video. Länken till mötet kommer innan vi ses.';
  const after = params.mode === 'onsite'
    ? 'Jag ringer dig innan jag kommer.'
    : 'Jag hör av mig innan mötet med länken.';
  const subject = `Bokat: genomgång med viaeats ${date} ${time.split('–')[0]}`;

  const text = [
    hello,
    '',
    `Din genomgång med viaeats är bokad ${date} kl. ${time}.`,
    modeLine,
    after,
    '',
    'Behöver du flytta tiden räcker det att svara på det här mejlet.',
    '',
    'Jalle, viaeats',
  ].join('\n');

  const row = (label: string, value: string) => `
                  <tr>
                    <td style="padding:6px 0;font-size:13px;color:${SLATE};width:90px;">${label}</td>
                    <td style="padding:6px 0;font-size:15px;color:${NAVY};font-weight:600;">${escapeHtml(value)}</td>
                  </tr>`;

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
                <img src="${wordmarkUrl()}" width="130" alt="viaeats" style="display:block;width:130px;height:auto;border:0;" />
                <p style="margin:26px 0 0;font-size:16px;line-height:24px;color:${NAVY};">${escapeHtml(hello)}</p>
                <p style="margin:6px 0 18px;font-size:15px;line-height:23px;color:${SLATE};">Din genomgång med viaeats är bokad.</p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${row('Dag', date)}${row('Tid', time)}${row('Möte', params.mode === 'onsite' ? 'På plats' : 'Videomöte')}${row('Restaurang', params.restaurant)}
                </table>
                <p style="margin:18px 0 0;font-size:15px;line-height:23px;color:${NAVY};">${escapeHtml(modeLine)} ${escapeHtml(after)}</p>
                <p style="margin:18px 0 0;font-size:13px;line-height:20px;color:${SLATE};">Behöver du flytta tiden räcker det att svara på det här mejlet.</p>
                <p style="margin:18px 0 0;font-size:15px;line-height:23px;color:${NAVY};">Jalle, viaeats</p>
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

export async function sendPartnerMeetingEmail(params: Parameters<typeof renderPartnerMeetingEmail>[0] & { to: string }): Promise<boolean> {
  try {
    const { subject, text, html } = renderPartnerMeetingEmail(params);
    return await sendEmail({
      to: params.to,
      subject,
      text,
      html,
      replyTo: process.env.EMAIL_REPLY_TO || undefined,
    });
  } catch (error) {
    console.error('[partner-meetings] bekräftelsemejl misslyckades:', (error as Error)?.message ?? error);
    return false;
  }
}
