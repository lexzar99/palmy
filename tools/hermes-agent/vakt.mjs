#!/usr/bin/env node
// Hermes-vakten: automatiska kontroller som meddelar via WhatsApp-bryggan.
//
//   node tools/hermes-agent/vakt.mjs tick      # var 2:a minut: sajtvakt, oppettidsvakt, rekord
//   node tools/hermes-agent/vakt.mjs vecka     # mandag 08:00: veckobrev
//   node tools/hermes-agent/vakt.mjs morgon    # morgonbrief (Hermes har en egen 07:30, sa denna ar inte schemalagd)
//   node tools/hermes-agent/vakt.mjs idag      # skriver ut dagens siffror (Hermes svarar med dem)
//   node tools/hermes-agent/vakt.mjs restauranger   # vilka som har oppet just nu
//   node tools/hermes-agent/vakt.mjs order PA-1234   # orderuppslag (aven telefonnummer)
//   node tools/hermes-agent/vakt.mjs <kommando> --dry-run   # skriv ut i stallet for att skicka
//
// Varje kontroll ar en ren funktion (tillstand, data, tid) -> meddelanden, sa
// logiken gar att testa utan natverk. IO sker bara i main().
// Restaurangvakten (order som ingen tagit) bor i poll-api.js, eftersom den
// behover orderhandelserna.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HOME_DIR = path.join(os.homedir(), '.viaeats', 'hermes');
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const TZ = 'Europe/Stockholm';

// --- formatering ------------------------------------------------------------

const kr = (value) => `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0))} kr`;
const dateKey = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
const dayLabel = (key) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(Date.parse(`${key}T12:00:00Z`));
const clock = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(ms);
const shiftKey = (key, days) => dateKey(Date.parse(`${key}T12:00:00Z`) + days * DAY);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function percentChange(now, before) {
  if (!before) return null;
  const change = Math.round(((now - before) / before) * 100);
  return `${change >= 0 ? '+' : '−'}${Math.abs(change)} %`;
}

// --- 1. Sajtvakt --------------------------------------------------------------

export const SITE_DOWN_AFTER_FAILURES = 2;
const SITE_REMIND_MS = 60 * MINUTE;
const CERT_WARN_DAYS = 14;

// probes: [{ key, label, ok, detail }]. internetOk=false betyder att minin
// sjalv ar utan natt - da larmas inget, annars blir varje glapp ett falsklarm.
export function checkSites(state, probes, { now = Date.now(), internetOk = true } = {}) {
  const messages = [];
  state.sites = state.sites || {};
  if (!internetOk) return messages;
  for (const probe of probes) {
    const site = state.sites[probe.key] || { failures: 0, downSince: null, alertedAt: null };
    if (probe.ok) {
      if (site.alertedAt) {
        const minutes = Math.max(1, Math.round((now - Date.parse(site.downSince)) / MINUTE));
        messages.push({ type: 'site:up', text: `🟢 ${probe.label} svarar igen. Nere i ${minutes} min.` });
      }
      state.sites[probe.key] = { failures: 0, downSince: null, alertedAt: null };
      continue;
    }
    site.failures += 1;
    if (!site.downSince) site.downSince = new Date(now).toISOString();
    const minutes = Math.max(1, Math.round((now - Date.parse(site.downSince)) / MINUTE));
    if (!site.alertedAt && site.failures >= SITE_DOWN_AFTER_FAILURES) {
      messages.push({ type: 'site:down', text: `🔴 ${probe.label} svarar inte (${probe.detail}). Kollar igen varannan minut.`, onSent: () => { site.alertedAt = new Date(now).toISOString(); } });
    } else if (site.alertedAt && now - Date.parse(site.alertedAt) >= SITE_REMIND_MS) {
      messages.push({ type: 'site:still_down', text: `🔴 ${probe.label} är fortfarande nere efter ${minutes} min (${probe.detail}).`, onSent: () => { site.alertedAt = new Date(now).toISOString(); } });
    }
    state.sites[probe.key] = site;
  }
  return messages;
}

export function checkCertificates(state, certs, { now = Date.now() } = {}) {
  const messages = [];
  state.certWarned = state.certWarned || {};
  const today = dateKey(now);
  for (const cert of certs) {
    if (!Number.isFinite(cert.validTo)) continue;
    const days = Math.floor((cert.validTo - now) / DAY);
    if (days >= CERT_WARN_DAYS || state.certWarned[cert.host] === today) continue;
    messages.push({
      type: 'site:cert',
      text: `🔒 Certifikatet för ${cert.host} går ut om ${plural(days, 'dag', 'dagar')}. Vercel och Railway brukar förnya själva, så något har fastnat.`,
      onSent: () => { state.certWarned[cert.host] = today; },
    });
  }
  return messages;
}

// --- 2. Oppettidsvakt ---------------------------------------------------------

export const CLOSED_ALERT_AFTER_MS = 15 * MINUTE;
// Bara stangningar som nagon kan gora nagot at. "Kommer snart", utkast och
// "stangt till oppning" ar avsiktliga.
const CLOSED_REASONS = {
  RESTAURANT_PAUSED: 'pausad',
  MANUAL_FORCE_CLOSED: 'manuellt stängd',
  CITY_PAUSED: 'staden är pausad',
  PLATFORM_PAUSED: 'hela plattformen är pausad',
};

export function checkOpeningHours(state, restaurants, { now = Date.now() } = {}) {
  const messages = [];
  const tracked = state.closed || {};
  const next = {};
  for (const restaurant of restaurants || []) {
    const reason = CLOSED_REASONS[restaurant.availabilityReason];
    const unexpectedlyClosed = restaurant.hasHours && restaurant.scheduledOpenNow && !restaurant.isOpen && reason;
    const previous = tracked[restaurant.id];
    if (unexpectedlyClosed) {
      const entry = previous || { since: new Date(now).toISOString(), alerted: false };
      if (!entry.alerted && now - Date.parse(entry.since) >= CLOSED_ALERT_AFTER_MS) {
        messages.push({
          type: 'restaurant:closed',
          text: `🕐 ${restaurant.name} ska ha öppet nu men tar inte emot beställningar (${reason}). Stängd sedan ${clock(Date.parse(entry.since))}.`,
          onSent: () => { entry.alerted = true; },
        });
      }
      next[restaurant.id] = entry;
    } else if (previous?.alerted && restaurant.isOpen) {
      messages.push({ type: 'restaurant:open', text: `✅ ${restaurant.name} tar emot beställningar igen.` });
    }
  }
  state.closed = next;
  return messages;
}

// --- 3. Rekord ----------------------------------------------------------------

const RECORD_MIN_ORDERS = 3;
const RECORD_MIN_HISTORY_DAYS = 7;
const HISTORY_DAYS = 400;

// trend7d fran /api/admin/overview: [{ date, orders, netSales }], idag sist.
export function rememberDays(state, trend, { now = Date.now() } = {}) {
  state.days = state.days || {};
  for (const point of trend || []) {
    if (point?.date) state.days[point.date] = { orders: Number(point.orders) || 0, netSales: Number(point.netSales) || 0 };
  }
  const oldest = shiftKey(dateKey(now), -HISTORY_DAYS);
  for (const key of Object.keys(state.days)) if (key < oldest) delete state.days[key];
}

export function checkRecord(state, today, { now = Date.now() } = {}) {
  const todayKey = dateKey(now);
  if (state.recordAlertDate === todayKey) return [];
  const past = Object.entries(state.days || {}).filter(([key]) => key < todayKey);
  if (past.length < RECORD_MIN_HISTORY_DAYS) return [];
  const orders = Number(today?.orders) || 0;
  const [bestKey, best] = past.reduce((top, entry) => (entry[1].orders > top[1].orders ? entry : top), past[0]);
  if (orders < RECORD_MIN_ORDERS || orders <= best.orders) return [];
  const span = past.length + 1;
  const title = span >= 90 ? 'Rekorddag' : `Bästa dagen på ${span} dagar`;
  return [{
    type: 'record',
    text: `🏆 ${title}: ${plural(orders, 'order', 'ordrar')} och ${kr(today.netSales)} hittills idag. Förra toppen: ${plural(best.orders, 'order', 'ordrar')} (${dayLabel(bestKey)}).`,
    onSent: () => { state.recordAlertDate = todayKey; },
  }];
}

// --- 4. Morgonbrief -----------------------------------------------------------

export function morningBrief({ days = {}, ops = null, leadDates = null, campaign = null, now = Date.now() }) {
  const todayKey = dateKey(now);
  const yesterdayKey = shiftKey(todayKey, -1);
  const yesterday = days[yesterdayKey] || { orders: 0, netSales: 0 };
  const lastWeek = days[shiftKey(yesterdayKey, -7)];
  const week = Array.from({ length: 7 }, (_, index) => days[shiftKey(yesterdayKey, -index)]).filter(Boolean);
  const weekOrders = week.reduce((sum, day) => sum + day.orders, 0);
  const weekSales = week.reduce((sum, day) => sum + day.netSales, 0);

  const lines = ['God morgon ☀️', `Igår (${dayLabel(yesterdayKey)}): ${plural(yesterday.orders, 'order', 'ordrar')} · ${kr(yesterday.netSales)}`];
  if (lastWeek) {
    const change = percentChange(yesterday.netSales, lastWeek.netSales);
    lines.push(`Samma dag förra veckan: ${plural(lastWeek.orders, 'order', 'ordrar')} · ${kr(lastWeek.netSales)}${change ? ` (${change})` : ''}`);
  }
  if (week.length >= 2) lines.push(`Senaste ${week.length} dagarna: ${plural(weekOrders, 'order', 'ordrar')} · ${kr(weekSales)}`);

  if (leadDates) {
    const yesterdayLeads = leadDates.filter((key) => key === yesterdayKey).length;
    lines.push(`Leads igår: ${yesterdayLeads}${leadDates.length ? ` (${leadDates.length} sedan bevakningen startade)` : ''}`);
  }
  const failed = ops?.payments?.failedPayments24h || 0;
  const stuck = ops?.payments?.stuckAwaitingPayment || 0;
  if (failed || stuck) lines.push(`Betalningar senaste dygnet: ${failed} misslyckade, ${stuck} fastnade före betalning`);

  if (campaign?.end) {
    const daysLeft = Math.round((Date.parse(`${campaign.end}T12:00:00Z`) - Date.parse(`${todayKey}T12:00:00Z`)) / DAY);
    if (daysLeft >= 0 && daysLeft <= 7) lines.push(`${campaign.name || 'Kampanjen'} slutar ${daysLeft === 0 ? 'idag' : `om ${plural(daysLeft, 'dag', 'dagar')}`}.`);
    else if (daysLeft === -1) lines.push(`${campaign.name || 'Kampanjen'} tog slut igår.`);
  }
  return { type: 'morning', text: lines.join('\n') };
}

// --- 5. Pa begaran (Hermes svarar anvandaren) --------------------------------

const REASON_TEXT = {
  SCHEDULE_OPEN: 'öppet', MANUAL_FORCE_OPEN: 'öppet (manuellt)', OUTSIDE_OPENING_HOURS: 'stängt enligt tider',
  CLOSED_UNTIL_OPENING: 'stängt till öppning', COMING_SOON: 'kommer snart', ...CLOSED_REASONS,
};

export function todayText(overview, days = {}, { now = Date.now() } = {}) {
  const today = overview?.today || {};
  const lastWeek = days[shiftKey(dateKey(now), -7)];
  const lines = [`Idag hittills: ${plural(today.orders || 0, 'order', 'ordrar')} · ${kr(today.netSales)}`];
  if (lastWeek) lines.push(`Samma dag förra veckan (hela dagen): ${plural(lastWeek.orders, 'order', 'ordrar')} · ${kr(lastWeek.netSales)}`);
  lines.push(`Pågår nu: ${today.liveOrders || 0}, varav ${today.pendingOrders || 0} väntar på restaurangen`);
  if (overview?.restaurants) lines.push(`Öppna restauranger: ${overview.restaurants.open} av ${overview.restaurants.total}`);
  return lines.join('\n');
}

export function restaurantsText(restaurants = []) {
  if (!restaurants.length) return 'Inga publicerade restauranger.';
  return restaurants.map((restaurant) => {
    const state = restaurant.isOpen ? '🟢' : '⚪️';
    const reason = REASON_TEXT[restaurant.availabilityReason] || restaurant.availabilityReason || '';
    const live = restaurant.liveOrders ? ` · ${restaurant.liveOrders} pågår` : '';
    return `${state} ${restaurant.name}: ${reason}${live}`;
  }).join('\n');
}

// --- 6. Veckobrev (mandag 08:00) ----------------------------------------------

// Hermes har redan en daglig morgonrapport (cron "Delivera morgonrapport"),
// sa vakten skickar i stallet en jamforelse vecka mot vecka.
export function weeklyBrief({ days = {}, leadDates = null, campaign = null, now = Date.now() }) {
  const todayKey = dateKey(now);
  // Senaste hela veckan, aven om brevet kommer en dag sent (Persistent=true).
  const weekday = new Date(`${todayKey}T12:00:00Z`).getUTCDay();
  const lastSunday = shiftKey(todayKey, -(weekday === 0 ? 7 : weekday));
  const span = (endKey) => Array.from({ length: 7 }, (_, index) => shiftKey(endKey, -index));
  const thisWeek = span(lastSunday);
  const prevWeek = span(shiftKey(lastSunday, -7));
  const sum = (keys) => keys.reduce((total, key) => ({
    orders: total.orders + (days[key]?.orders || 0),
    netSales: total.netSales + (days[key]?.netSales || 0),
    known: total.known + (days[key] ? 1 : 0),
  }), { orders: 0, netSales: 0, known: 0 });
  const week = sum(thisWeek);
  const before = sum(prevWeek);

  const weekNumber = (key) => {
    const date = new Date(`${key}T12:00:00Z`);
    const thursday = new Date(date);
    thursday.setUTCDate(date.getUTCDate() + 3 - ((date.getUTCDay() + 6) % 7));
    const firstThursday = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((thursday - firstThursday) / DAY - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  };

  const lines = [`Veckobrev, vecka ${weekNumber(lastSunday)} 📊`];
  lines.push(`${plural(week.orders, 'order', 'ordrar')} · ${kr(week.netSales)}${week.known < 7 ? ` (data för ${week.known} av 7 dagar)` : ''}`);
  if (before.known >= 7) {
    const change = percentChange(week.netSales, before.netSales);
    lines.push(`Veckan innan: ${plural(before.orders, 'order', 'ordrar')} · ${kr(before.netSales)}${change ? ` (${change})` : ''}`);
  }
  const best = thisWeek.filter((key) => days[key]?.orders).sort((a, b) => days[b].orders - days[a].orders)[0];
  if (best) lines.push(`Bästa dagen: ${dayLabel(best)} med ${plural(days[best].orders, 'order', 'ordrar')}`);
  if (leadDates) {
    const weekLeads = leadDates.filter((key) => thisWeek.includes(key)).length;
    lines.push(`Nya leads: ${weekLeads}`);
  }
  if (campaign?.end) {
    const daysLeft = Math.round((Date.parse(`${campaign.end}T12:00:00Z`) - Date.parse(`${todayKey}T12:00:00Z`)) / DAY);
    if (daysLeft >= 0 && daysLeft <= 14) lines.push(`${campaign.name || 'Kampanjen'} slutar ${daysLeft === 0 ? 'idag' : `om ${plural(daysLeft, 'dag', 'dagar')}`}.`);
    else if (daysLeft < 0 && daysLeft >= -7) lines.push(`${campaign.name || 'Kampanjen'} har slutat. Dags att bestämma nästa?`);
  }
  return { type: 'weekly', text: lines.join('\n') };
}

// --- IO -----------------------------------------------------------------------

function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return fallback;
    throw new Error(`${path.basename(file)} gar inte att lasa (${error.message})`);
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

async function probe(url) {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'User-Agent': 'viaeats-hermes-vakt' } });
    return { ok: response.status < 500 && response.status !== 404, detail: `HTTP ${response.status}` };
  } catch (error) {
    return { ok: false, detail: error?.name === 'TimeoutError' ? 'timeout' : (error?.cause?.code || error?.code || 'nätverksfel') };
  }
}

function certExpiry(host) {
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 10_000 }, () => {
      const validTo = Date.parse(socket.getPeerCertificate()?.valid_to || '');
      socket.end();
      resolve({ host, validTo });
    });
    socket.on('error', () => resolve({ host, validTo: NaN }));
    socket.on('timeout', () => { socket.destroy(); resolve({ host, validTo: NaN }); });
  });
}

async function adminGet(config, pathname) {
  const response = await fetch(`${config.apiBase}${pathname}`, {
    headers: { Authorization: `Bearer ${config.falkenToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const error = new Error(`${pathname} svarade HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

// Tva format forekommer: { closed, shifts: [{open, close}] } och { open, close, closed }.
export function hasOpeningHours(hours) {
  if (!hours || typeof hours !== 'object') return false;
  return Object.values(hours).some((day) => day && !day.closed && (Array.isArray(day.shifts) ? day.shifts.length > 0 : Boolean(day.open)));
}

// Publika /api/restaurants i samma form som kontrollcentrets restaurantStatus.
export function restaurantsFromPublic(list) {
  return (Array.isArray(list) ? list : []).filter((restaurant) => !restaurant.draft).map((restaurant) => ({
    id: restaurant.id,
    name: restaurant.name,
    isOpen: Boolean(restaurant.isOpen),
    scheduledOpenNow: Boolean(restaurant.scheduledOpenNow),
    availabilityReason: restaurant.availabilityReason,
    hasHours: hasOpeningHours(restaurant.openingHours),
    liveOrders: Number(restaurant.activeOrdersCount) || 0,
  }));
}

// Pollarens orderbok (poll-api.js, orderDays) -> { datum: { orders, netSales } }.
function ledgerFromPollState(pollState) {
  const days = {};
  for (const [day, entry] of Object.entries(pollState?.orderDays || {})) {
    days[day] = { orders: Number(entry.orders) || 0, netSales: Number(entry.sales) || 0 };
  }
  return days;
}

async function publicJson(config, pathname) {
  const response = await fetch(`${config.apiBase}${pathname}`, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'viaeats-hermes-vakt' } });
  if (!response.ok) throw new Error(`${pathname} svarade HTTP ${response.status}`);
  return response.json();
}

function leadDatesFromState(file) {
  const state = readJson(file, null);
  if (!state?.seen) return null;
  return Object.values(state.seen).map((at) => Date.parse(at)).filter(Number.isFinite).map(dateKey);
}

function buildConfig() {
  loadEnvFile(path.join(HOME_DIR, 'agents.env'));
  loadEnvFile(path.join(ROOT, 'tools/hermes-whatsapp-forwarder/.runtime.env'));
  loadEnvFile(path.join(HOME_DIR, 'vakt.env'));
  const tokenDir = process.env.HERMES_AGENT_TOKEN_DIR || HOME_DIR;
  const tokenFile = path.join(tokenDir, 'falken.token');
  return {
    apiBase: (process.env.VIAEATS_API_BASE || 'https://api.viaeats.se').replace(/\/$/, ''),
    webUrl: process.env.VAKT_WEB_URL || 'https://viaeats.se/',
    bridgeSendUrl: process.env.HERMES_BRIDGE_SEND_URL || 'http://127.0.0.1:3000/send',
    chatId: process.env.VAKT_CHAT_ID || process.env.HERMES_WHATSAPP_CHAT_ID || '',
    falkenToken: fs.existsSync(tokenFile) ? fs.readFileSync(tokenFile, 'utf8').trim() : '',
    stateFile: process.env.VAKT_STATE || path.join(HOME_DIR, 'vakt-state.json'),
    leadStateFile: process.env.META_LEADS_STATE || path.join(HOME_DIR, 'meta-leads-state.json'),
    pollStateFile: process.env.HERMES_ALERT_STATE || path.join(ROOT, 'tools/hermes-whatsapp-forwarder/api-poll-state.json'),
    campaign: process.env.VAKT_CAMPAIGN_END ? { end: process.env.VAKT_CAMPAIGN_END, name: process.env.VAKT_CAMPAIGN_NAME || null } : null,
    disabled: new Set(String(process.env.VAKT_DISABLE || '').split(',').map((item) => item.trim()).filter(Boolean)),
  };
}

async function deliver(config, messages, state, { dryRun }) {
  for (const message of messages) {
    if (dryRun) {
      console.log(`--- ${message.type}\n${message.text}`);
    } else {
      const response = await fetch(config.bridgeSendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: config.chatId, message: message.text, payload: { type: `vakt:${message.type}` } }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`WhatsApp-bryggan svarade HTTP ${response.status}`);
      console.log(`[vakt] skickade ${message.type}`);
    }
    // Tillstandet ("redan larmat") satts bara nar meddelandet gick ivag.
    message.onSent?.();
    writeJson(config.stateFile, state);
  }
}

// Utgangen Falken-session ska synas, men inte varannan minut.
function falkenProblem(state, error, now) {
  const last = state.falkenAlertAt ? Date.parse(state.falkenAlertAt) : NaN;
  if (Number.isFinite(last) && now - last < 12 * 60 * MINUTE) return [];
  const hint = error?.status === 401 || error?.status === 403 ? 'Kör node tools/hermes-agent/login.mjs falken på minin.' : 'Försöker igen automatiskt.';
  return [{ type: 'falken', text: `Blockerad: vakten når inte admin-API:t (${error.message}). ${hint}`, onSent: () => { state.falkenAlertAt = new Date(now).toISOString(); } }];
}

// "order PA-1234" / "order 0701234567": Hermes-API:ts uppslag, token fran .runtime.env.
async function orderLookup(query) {
  buildConfig();
  const token = process.env.HERMES_API_TOKEN;
  if (!token) throw new Error('HERMES_API_TOKEN saknas i .runtime.env');
  if (!query.trim()) throw new Error('ange ordernummer eller telefon: vakt.mjs order PA-1234');
  const url = new URL('/api/hermes/orders/lookup', process.env.VIAEATS_API_BASE || 'https://api.viaeats.se');
  url.searchParams.set('query', query.trim());
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok && !data.answer) throw new Error(`uppslaget svarade HTTP ${response.status}`);
  console.log(data.answer || 'Hittade ingen order.');
  for (const order of data.orders || []) {
    console.log(`- ${order.orderNumber}: ${order.status}, ${order.total ?? '?'} kr, ${order.restaurant?.name || order.restaurantName || ''}`.trim());
  }
}

async function main(argv = process.argv.slice(2)) {
  const command = argv.find((arg) => !arg.startsWith('--')) || 'tick';
  if (command === 'order') return orderLookup(argv.slice(argv.indexOf('order') + 1).join(' '));
  const dryRun = argv.includes('--dry-run');
  const config = buildConfig();
  if (!config.chatId && !dryRun) throw new Error('HERMES_WHATSAPP_CHAT_ID saknas');
  const state = readJson(config.stateFile, {});
  const now = Date.now();
  const messages = [];
  const on = (name) => !config.disabled.has(name);

  let overview = null;
  if (config.falkenToken) {
    overview = await adminGet(config, '/api/admin/overview').catch((error) => {
      console.warn(`[vakt] ${error.message}`);
      messages.push(...falkenProblem(state, error, now));
      return null;
    });
  }
  if (overview) {
    rememberDays(state, overview.trend7d, { now });
    state.falkenAlertAt = null;
  } else {
    // Utan Falken: pollarens orderbok for siffrorna och det publika
    // restaurang-API:t for oppetstatus. Samma form som kontrollcentret.
    const pollState = readJson(config.pollStateFile, {});
    const ledger = ledgerFromPollState(pollState);
    state.days = { ...(state.days || {}), ...ledger };
    const restaurantStatus = await publicJson(config, '/api/restaurants').then(restaurantsFromPublic).catch((error) => {
      console.warn(`[vakt] ${error.message}`);
      return null;
    });
    const todayEntry = ledger[dateKey(now)] || { orders: 0, netSales: 0 };
    overview = {
      source: 'orderbok',
      today: {
        orders: todayEntry.orders,
        netSales: todayEntry.netSales,
        liveOrders: (restaurantStatus || []).reduce((sum, restaurant) => sum + restaurant.liveOrders, 0),
        pendingOrders: Object.values(pollState.pendingOrders || {}).filter((order) => !order.alarmed).length,
      },
      restaurants: restaurantStatus ? { open: restaurantStatus.filter((restaurant) => restaurant.isOpen).length, total: restaurantStatus.length } : null,
      restaurantStatus: restaurantStatus || [],
    };
  }

  if (command === 'tick') {
    if (on('sajt')) {
      const host = (url) => new URL(url).hostname;
      const [web, api, control] = await Promise.all([probe(config.webUrl), probe(`${config.apiBase}/health`), probe('https://www.google.com/generate_204')]);
      messages.push(...checkSites(state, [
        { key: 'web', label: host(config.webUrl), ...web },
        { key: 'api', label: host(config.apiBase), ...api },
      ], { now, internetOk: control.ok || web.ok || api.ok }));
      const lastCertCheck = state.certCheckedAt ? Date.parse(state.certCheckedAt) : NaN;
      if (!Number.isFinite(lastCertCheck) || now - lastCertCheck > 12 * 60 * MINUTE) {
        const certs = await Promise.all([certExpiry(host(config.webUrl)), certExpiry(host(config.apiBase))]);
        messages.push(...checkCertificates(state, certs, { now }));
        state.certCheckedAt = new Date(now).toISOString();
      }
    }
    if (on('oppettider') && overview.restaurantStatus.length) messages.push(...checkOpeningHours(state, overview.restaurantStatus, { now }));
    if (on('rekord')) messages.push(...checkRecord(state, overview.today, { now }));
  } else if (command === 'morgon') {
    const ops = config.falkenToken ? await adminGet(config, '/api/admin/ops').catch(() => null) : null;
    messages.push(morningBrief({ days: state.days, ops, leadDates: leadDatesFromState(config.leadStateFile), campaign: config.campaign, now }));
  } else if (command === 'vecka') {
    messages.push(weeklyBrief({ days: state.days, leadDates: leadDatesFromState(config.leadStateFile), campaign: config.campaign, now }));
  } else if (command === 'idag' || command === 'restauranger') {
    // Svar till Hermes nar anvandaren fragar. Skrivs ut, skickas inte.
    writeJson(config.stateFile, state);
    console.log(command === 'idag' ? todayText(overview, state.days, { now }) : restaurantsText(overview.restaurantStatus));
    return;
  } else {
    throw new Error(`okant kommando ${command} (tick, vecka, morgon, idag, restauranger eller order)`);
  }

  writeJson(config.stateFile, state);
  await deliver(config, messages, state, { dryRun });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[vakt] fel:', error?.message || error);
    process.exit(1);
  });
}
