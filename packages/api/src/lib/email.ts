// Email-transport för MatGo.
//
// STATUS: Plattformen har INGEN aktiv e-postleverantör konfigurerad än
// (varken nodemailer, Resend, SendGrid eller Postmark är installerade). Den här
// modulen tar emot ett "skicka mejl"-anrop och loggar innehållet till konsolen
// så flöden som beror på mejl (t.ex. glömt-lösenord) kan testas end-to-end
// utan att faktiskt skicka något. När en riktig leverantör väljs är detta
// den enda fil som behöver fyllas i — anroparna behöver inte ändras.
//
// TODO(infra): koppla på en riktig transport (förslag: Resend eller SES).
//   1. `pnpm add resend` (eller motsvarande)
//   2. Ersätt console.log-blocket i sendEmail() med klientens send-anrop.
//   3. Sätt RESEND_API_KEY i Railway-miljön.

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
   * en platshållare som loggas tydligt.
   */
  from?: string;
};

const DEFAULT_FROM =
  process.env.EMAIL_FROM ||
  'MatGo <no-reply@matgo.se>';

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const from = msg.from || DEFAULT_FROM;

  // Logg-fallback. Behåll formattering — Railway parsar JSON-rader bra,
  // men för dev-konsollen vill vi se att mejlet "kom fram" i klartext.
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

  // När transporten är installerad: avkommentera ungefär såhär.
  //
  // const { Resend } = require('resend');
  // const client = new Resend(process.env.RESEND_API_KEY);
  // await client.emails.send({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
}
