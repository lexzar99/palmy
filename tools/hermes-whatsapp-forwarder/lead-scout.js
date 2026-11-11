#!/usr/bin/env node
// Leadkoll: söker upp en restaurang som just blivit lead, sätter betyg 1–10 och skickar ett
// samtalskort till WhatsApp-bryggan. Körs bredvid poll-meta-leads.js och rör inte den.
//
//   node lead-scout.js --name "Palmyra Pizzeria" --city Lund [--phone +4670…] [--send]
//   node lead-scout.js --watch      # bevakar lead-pollarens tillståndsfil och kör på varje ny lead
//
// Källor: Google Places (betyg, omdömen, hemsida), restaurangens egen hemsida (beställningssystem),
// foodoras öppna sitemap (finns restaurangen där) och Wolts öppna restaurangsidor.
// foodoras restaurangsidor ligger bakom en robotspärr och läses inte. Den spärren kringgås aldrig.
// Leadens fält och allt som hämtas från nätet är opålitlig text: det används bara som sökord och
// som text i kortet, aldrig som kommando.
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const DIR = path.join(HOME, '.viaeats', 'scout');
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const key = t.slice(0, i).trim();
    if (key && process.env[key] == null) process.env[key] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, '');
  }
}
loadEnv(path.join(DIR, 'scout.env'));
loadEnv(path.join(HOME, '.viaeats', 'hermes', 'meta-leads.env'));
loadEnv(path.join(HOME, 'viaeats-drift', 'tools', 'hermes-whatsapp-forwarder', '.runtime.env'));

const clean = (value, max = 120) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const slug = (value) => clean(value).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const comma = (n) => String(n).replace('.', ',');

async function get(url, { timeoutMs = 12_000, maxBytes = 900_000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json,*/*', ...headers }, signal: controller.signal, redirect: 'follow' });
    const reader = res.body?.getReader();
    const chunks = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      if (size >= maxBytes) { controller.abort(); break; }
    }
    return { ok: res.ok, status: res.status, url: res.url, text: Buffer.concat(chunks).toString('utf8') };
  } catch (error) {
    return { ok: false, status: 0, url, text: '', error: error?.name === 'AbortError' ? 'timeout' : clean(error?.message, 80) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Google Places ----------
async function places(pathname, params) {
  const key = process.env.GOOGLE_MAPS_KEY || process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return { status: 'INGEN_NYCKEL' };
  const url = new URL(`https://maps.googleapis.com/maps/api/place/${pathname}/json`);
  for (const [k, v] of Object.entries({ ...params, language: 'sv', key })) url.searchParams.set(k, v);
  const res = await get(url, { timeoutMs: 15_000 });
  try { return JSON.parse(res.text); } catch { return { status: res.error || `HTTP ${res.status}` }; }
}

async function findPlace(name, city) {
  const search = await places('textsearch', { query: `${name} ${city}`.trim(), region: 'se' });
  if (search.status !== 'OK' || !search.results?.length) return { error: search.status === 'ZERO_RESULTS' ? 'ingen träff' : search.status };
  const food = /restaurant|food|meal_takeaway|meal_delivery|cafe|bakery|bar/;
  const hit = search.results.find((r) => (r.types || []).some((t) => food.test(t))) || search.results[0];
  const fields = 'name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,reviews,url,business_status,delivery,takeout,dine_in,types';
  const [relevant, newest] = await Promise.all([
    places('details', { place_id: hit.place_id, fields, reviews_no_translations: 'true' }),
    places('details', { place_id: hit.place_id, fields: 'reviews', reviews_sort: 'newest', reviews_no_translations: 'true' }),
  ]);
  if (relevant.status !== 'OK') return { error: relevant.status };
  const reviews = new Map();
  for (const r of [...(relevant.result.reviews || []), ...(newest.result?.reviews || [])]) {
    if (r?.text) reviews.set(`${r.author_name}|${r.time}`, { text: clean(r.text, 600), rating: r.rating, when: r.relative_time_description });
  }
  return { ...relevant.result, reviews: [...reviews.values()], candidates: search.results.length };
}

// ---------- Restaurangens hemsida ----------
const SYSTEMS = [
  ['viaeats', /viaeats/],
  ['Eatsmart', /eatsmart|viralconvert/],
  ['GloriaFood', /fbgcdn|gloriafood|foodbooking\.com|restaurantlogin/],
  ['Restaurangreklam', /restaurangreklam/],
  ['Lumit', /\blumit\b|lumit\.pizza/],
  ['Qopla', /qopla/],
  ['OrderFood', /orderfood/],
  ['Weiq', /\bweiq\b/],
  ['Kollino', /kollino/],
  ['Ordine', /ordine\.(se|app)/],
  ['Munchi', /munchi\./],
  ['HeyNow', /heynow/],
  ['Foodla', /foodla/],
  ['OnlinePizza', /onlinepizza/],
  ['Yabie', /yabie/],
];
const MARKETS = [
  ['foodora', /https?:\/\/(?:www\.)?foodora\.se\/[^"'\s<>)]+/],
  ['Wolt', /https?:\/\/(?:www\.)?wolt\.com\/[^"'\s<>)]+/],
  ['Uber Eats', /https?:\/\/(?:www\.)?ubereats\.com\/[^"'\s<>)]+/],
];
const ORDER_WORDS = /best[aä]ll|order|meny|menu|online|take-?away|hemk[oö]rning|leverans/i;
const DELIVERY_SITE = /hemk[oö]rning|utk[oö]rning|vi k[oö]r ut|hemleverans|fri leverans|leveransavgift|utk[oö]rningsavgift/i;

async function scanSite(website) {
  const out = { systems: new Set(), markets: {}, delivery: false, cart: false, pages: 0, error: null, url: website };
  if (!website) { out.error = 'ingen hemsida hos Google'; return out; }
  const home = await get(website);
  if (!home.ok) { out.error = home.error || `HTTP ${home.status}`; return out; }
  out.url = home.url;
  const seen = new Set([home.url]);
  const pages = [home];
  const base = new URL(home.url);
  const links = [];
  for (const m of home.text.matchAll(/<(?:a|iframe|script)[^>]+(?:href|src)=["']([^"'#]+)["'][^>]*>([^<]{0,80})?/gi)) {
    let url;
    try { url = new URL(m[1], base); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    const label = `${url.pathname} ${m[2] || ''}`;
    const sameSite = url.hostname.replace(/^www\./, '') === base.hostname.replace(/^www\./, '');
    if (ORDER_WORDS.test(label) && !/\.(css|js|png|jpe?g|svg|webp|pdf|ico)(\?|$)/i.test(url.pathname)) links.push({ url: url.toString(), sameSite });
  }
  const picked = [...links.filter((l) => l.sameSite).slice(0, 4), ...links.filter((l) => !l.sameSite).slice(0, 2)];
  for (const link of picked) {
    if (seen.has(link.url)) continue;
    seen.add(link.url);
    const page = await get(link.url, { timeoutMs: 10_000 });
    if (page.ok) pages.push(page);
  }
  out.pages = pages.length;
  for (const page of pages) {
    const hay = `${page.url}\n${page.text}`.toLowerCase();
    for (const [name, pattern] of SYSTEMS) if (pattern.test(hay)) out.systems.add(name);
    for (const [name, pattern] of MARKETS) {
      const found = `${page.url}\n${page.text}`.match(pattern);
      if (found && !out.markets[name]) out.markets[name] = found[0];
    }
    if (DELIVERY_SITE.test(page.text)) out.delivery = true;
    if (/varukorg|l[aä]gg i varukorgen|till kassan|add to cart|checkout/i.test(page.text)) out.cart = true;
  }
  return out;
}

// ---------- foodora (öppen sitemap) och Wolt (öppna sidor) ----------
async function foodoraIndex() {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const file = path.join(DIR, 'foodora-restauranger.txt');
  const fresh = fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 24 * 3600_000;
  if (!fresh) {
    const index = await get('https://www.foodora.se/adventure-map/adventure-map-index-restaurant.xml', { timeoutMs: 20_000 });
    const parts = [...index.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const urls = new Set();
    for (const part of parts) {
      const xml = await get(part, { timeoutMs: 60_000, maxBytes: 30_000_000 });
      for (const m of xml.text.matchAll(/<loc>(https:\/\/www\.foodora\.se\/restaurant\/[^<]+)<\/loc>/g)) urls.add(m[1]);
    }
    if (urls.size > 1000) fs.writeFileSync(file, [...urls].join('\n'));
    else if (!fs.existsSync(file)) return null;
  }
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
}

async function foodoraLookup(names, city = '') {
  const list = await foodoraIndex().catch(() => null);
  if (!list) return { error: 'foodoras lista gick inte att hämta' };
  const wanted = [...new Set(names.map(slug).filter((s) => s.length >= 4))];
  const hits = [];
  for (const url of list) {
    const tail = url.split('/').pop();
    if (wanted.some((w) => tail === w || tail.startsWith(`${w}-`))) hits.push(url);
  }
  // Kedjor har en sida per stad: den som nämner leadens stad hamnar först.
  const town = slug(city);
  if (town) hits.sort((x, y) => Number(y.includes(town)) - Number(x.includes(town)));
  return { hits: hits.slice(0, 4), total: list.length };
}

async function woltLookup(names, city) {
  const town = slug(city);
  if (!town) return { hit: null };
  const tried = new Set();
  for (const name of names) {
    for (const tail of [slug(name), `${slug(name)}-${town}`]) {
      if (!tail || tried.has(tail)) continue;
      tried.add(tail);
      const url = `https://wolt.com/sv/swe/${town}/restaurant/${tail}`;
      const page = await get(url, { timeoutMs: 12_000, maxBytes: 200_000 });
      const title = clean((page.text.match(/<title[^>]*>([^<]+)/i) || [])[1], 120);
      const first = slug(name).split('-')[0];
      if (page.ok && title && slug(title).includes(first) && /wolt/i.test(title)) return { hit: url, title };
    }
  }
  return { hit: null };
}

// ---------- Betyg och kort ----------
const DELIVERY_REVIEW = /lever(?:ans|era|erade|erades|eras|erat)|hemk[oö]rning|utk[oö]rning|budet|k[oö]rde ut|hemleverans|delivery|deliver/i;
const FIXED_FEE = ['Eatsmart', 'GloriaFood', 'Restaurangreklam', 'Kollino'];

function snippet(text, pattern) {
  const words = text.split(' ');
  const at = words.findIndex((w) => pattern.test(w));
  return words.slice(Math.max(0, at - 5), at + 7).join(' ');
}

async function scout({ name, city, phone = '', extra = [] }) {
  name = clean(name); city = clean(city, 60); phone = clean(phone, 30);
  const place = await findPlace(name, city);
  const names = [name, place.name].filter(Boolean);
  const [site, foodora, wolt] = await Promise.all([
    scanSite(place.website),
    foodoraLookup(names, city),
    woltLookup(names, city || (place.formatted_address || '').split(',').slice(-2, -1)[0]?.replace(/\d{3}\s?\d{2}/, '') || ''),
  ]);

  const reviews = place.reviews || [];
  const deliveryReviews = reviews.filter((r) => DELIVERY_REVIEW.test(r.text));
  const marketReviews = reviews.filter((r) => /foodora|wolt|uber ?eats/i.test(r.text));
  const systems = [...site.systems].filter((s) => s !== 'viaeats');
  const isCustomer = site.systems.has('viaeats');
  const onFoodora = Boolean(foodora.hits?.length || site.markets.foodora);
  const onWolt = Boolean(wolt.hit || site.markets.Wolt);
  const onUber = Boolean(site.markets['Uber Eats']);
  const ownDelivery = site.delivery || deliveryReviews.length > 0 || place.delivery === true;
  const count = place.user_ratings_total || 0;

  const points = [];
  if (count >= 500) points.push(['omdömen', 3]); else if (count >= 200) points.push(['omdömen', 2]); else if (count >= 50) points.push(['omdömen', 1]);
  if ((place.rating || 0) >= 4.2) points.push(['snittbetyg', 1]);
  if (systems.length || isCustomer || site.cart) points.push(['säljer redan på egen hemsida', 2]);
  if (systems.some((s) => FIXED_FEE.includes(s))) points.push(['fast avgift i dag', 1]);
  if (onFoodora || onWolt || onUber) points.push(['finns på foodora eller Wolt', 1]);
  if (ownDelivery) points.push(['leverans', 1]);
  const score = Math.max(1, Math.min(10, points.reduce((sum, [, p]) => sum + p, 0)));

  // Vad de sannolikt betalar och vad Jalle ska trycka på.
  const pays = [];
  const pitch = [];
  let opener = 'Tar ni emot beställningar på nätet i dag, eller är det mest telefon?';
  if (isCustomer) {
    pitch.push('Hemsidan kör redan viaeats. Det här är en befintlig kund, inte en ny.');
    opener = 'Ni är redan igång hos oss. Vad kan vi göra bättre?';
  }
  if (systems.includes('Eatsmart') || systems.includes('GloriaFood') || systems.includes('Restaurangreklam')) {
    pays.push(`fast månadsavgift till ${systems.includes('Eatsmart') ? 'Eatsmart' : 'sin leverantör'} (fråga vad)`);
    pitch.push('Hos oss ingen månadsavgift, bara 5 % på ordrarna. Fråga vad de betalar per månad och räkna om det till 5 %.');
    pitch.push('Fråga om de fått besked om att deras system byts ut under 2027. Påstå ingenting.');
    opener = 'Vad betalar ni i månaden för beställningarna på er hemsida i dag?';
  }
  if (systems.includes('Lumit')) {
    pays.push('upp till 7 % per order till Lumit, betalavgiften ingår');
    pitch.push('Priset är nästan lika som Lumit. Sälj på egen sida som vi bygger, plats på viaeats.se och ingen bindningstid.');
    opener = 'Ni kör Lumit i dag. Vad saknar ni där?';
  }
  for (const other of systems.filter((s) => !['Eatsmart', 'GloriaFood', 'Restaurangreklam', 'Lumit'].includes(s))) {
    pays.push(`avgift till ${other} (fråga vad)`);
    pitch.push(`De kör ${other}. Erbjud 30 dagar bredvid det de har, sedan väljer de det som gav mest.`);
  }
  if (onFoodora || onWolt || onUber) {
    pays.push('ofta 25–30 % per order när foodora eller Wolt kör ut, lägre med egna bud');
    pitch.push('Stamkunderna kan beställa direkt på egen sida för 5 % i stället för via appen.');
  }
  if (!systems.length && !isCustomer && !site.cart) {
    pitch.push('Ingen nätbeställning på egen hemsida hittad. Sälj på: färre telefonsamtal i rusningen, ingen fast avgift, 30 dagar gratis.');
  }
  if (site.delivery) pitch.push('Hemsidan nämner egen utkörning. Då behåller de hela leveransavgiften hos oss.');
  else if (ownDelivery) pitch.push('Maten levereras härifrån. Fråga om det är egna bud eller appens: med egna bud behåller de leveransavgiften hos oss.');

  const lines = [];
  lines.push(`LEADKOLL ${score}/10 · ${place.name || name}${city ? `, ${city}` : ''}`);
  lines.push(`Ring: ${phone || '(inget nummer i leaden)'}${place.formatted_phone_number ? ` · Restaurangens nummer hos Google: ${place.formatted_phone_number}` : ''}`);
  if (place.error) {
    lines.push(`Google: hittade inte restaurangen (${place.error}).`);
  } else {
    lines.push(`Adress: ${place.formatted_address || '-'}`);
    lines.push(`Google: ${place.rating ? `${comma(place.rating)} av 5` : 'inget betyg'} · ${count} omdömen${place.business_status && place.business_status !== 'OPERATIONAL' ? ` · ${place.business_status}` : ''}`);
    if (place.url) lines.push(`Karta: ${place.url}`);
    if (!(place.types || []).some((t) => /restaurant|food|meal_takeaway|meal_delivery|cafe|bakery|bar/.test(t))) {
      lines.push(`OBS: Google anger inte detta som restaurang (${(place.types || []).slice(0, 2).join(', ') || 'okänd typ'}).`);
    }
  }
  lines.push('');
  lines.push(`Hemsida: ${site.error ? `${place.website || 'ingen'} (${site.error})` : site.url}`);
  lines.push(`Beställning på egen hemsida: ${isCustomer ? 'ja, viaeats' : systems.length ? `ja, ${systems.join(' och ')}` : site.cart ? 'ja, okänt system' : !place.website ? 'nej, ingen hemsida' : site.error ? 'hemsidan svarade inte' : 'nej, inget system hittat'}`);
  const fo = site.markets.foodora || foodora.hits?.[0];
  lines.push(`foodora: ${fo ? `ja · ${fo}` : foodora.error ? foodora.error : 'nej, finns inte i foodoras restauranglista'}`);
  if ((foodora.hits?.length || 0) > 1) lines.push(`  Fler med samma namn: ${foodora.hits.slice(1).join(' , ')}`);
  if (fo) lines.push('  Öppna länken och tryck på Info: står det att ordern kan följas live kör foodora ut.');
  lines.push(`Wolt: ${site.markets.Wolt || wolt.hit ? `ja · ${site.markets.Wolt || wolt.hit}` : 'nej, ingen sida hittad'}`);
  if (onUber) lines.push(`Uber Eats: ja · ${site.markets['Uber Eats']}`);
  const deliveryWhy = [place.delivery === true ? 'Google anger leverans' : null, site.delivery ? 'hemsidan nämner utkörning' : null,
    deliveryReviews.length ? `${deliveryReviews.length} av ${reviews.length} lästa omdömen nämner leverans` : null].filter(Boolean);
  lines.push(`Leverans: ${ownDelivery ? `ja (${deliveryWhy.join(', ')})` : 'inget tecken på leverans'}`);
  for (const r of deliveryReviews.slice(0, 2)) lines.push(`  "${snippet(r.text, DELIVERY_REVIEW)}" (${r.rating}★, ${r.when})`);
  for (const r of marketReviews.slice(0, 1)) lines.push(`  Omdöme nämner appar: "${snippet(r.text, /foodora|wolt|uber/i)}"`);
  lines.push('');
  if (pays.length) lines.push(`Betalar troligen i dag: ${pays.join('; ')}.`);
  lines.push('Våra starka punkter:');
  for (const p of pitch) lines.push(`• ${p}`);
  lines.push('');
  lines.push(`Säg först: "Hej, det är Jalle från viaeats. Ni fyllde i vårt formulär nyss. ${opener}"`);
  if (extra.length) { lines.push(''); lines.push(`Från formuläret: ${extra.map((e) => clean(e, 160)).join(' · ')}`); }
  lines.push('');
  lines.push(`Poäng: ${points.length ? points.map(([why, p]) => `${why} ${p}`).join(', ') : 'inga signaler hittade'}.`);
  return { score, message: lines.join('\n').slice(0, 3500), place, site: { ...site, systems: [...site.systems] }, foodora, wolt };
}

async function sendToBridge(message) {
  const url = process.env.HERMES_BRIDGE_SEND_URL;
  const chatId = process.env.HERMES_WHATSAPP_CHAT_ID;
  if (!url || !chatId) throw new Error('bryggan är inte inställd');
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId, message }), signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`bryggan svarade HTTP ${res.status}`);
}

// ---------- Bevakning av lead-pollarens tillståndsfil ----------
function classify(name) {
  const key = String(name || '').toLowerCase();
  if (key === 'phone_number' || /phone|telefon|mobil/.test(key)) return 'phone';
  if (key === 'city' || /stad|city|kommun|(^|_)ort(_|\?|$)/.test(key)) return 'city';
  if (key === 'company_name' || /restaurang|restaurant|f(o|ö)retag|company|business|verksamhet/.test(key)) return 'name';
  return null;
}

async function fetchLead(id) {
  const base = process.env.META_GRAPH_BASE || 'https://graph.facebook.com';
  const version = /^v\d+\.\d+$/.test(process.env.META_GRAPH_API_VERSION || '') ? process.env.META_GRAPH_API_VERSION : 'v23.0';
  const res = await get(`${base}/${version}/${encodeURIComponent(id)}?fields=id,created_time,field_data`, {
    headers: { Authorization: `Bearer ${process.env.META_PAGE_ACCESS_TOKEN}` }, timeoutMs: 20_000,
  });
  if (!res.ok) throw new Error(`Meta svarade HTTP ${res.status}`);
  const lead = { name: '', city: '', phone: '', extra: [] };
  for (const field of JSON.parse(res.text).field_data || []) {
    const value = clean((field.values || []).join(', '), 200);
    if (!value) continue;
    const kind = classify(field.name);
    if (kind && !lead[kind]) lead[kind] = value; else lead.extra.push(`${clean(field.name, 60).replace(/[_-]+/g, ' ')}: ${value}`);
  }
  return lead;
}

async function watch() {
  const stateFile = process.env.META_LEADS_STATE || path.join(HOME, '.viaeats', 'hermes', 'meta-leads-state.json');
  const doneFile = path.join(DIR, 'klara-leads.json');
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  const readSeen = () => { try { return Object.keys(JSON.parse(fs.readFileSync(stateFile, 'utf8')).seen || {}); } catch { return null; } };
  let done;
  try { done = new Set(JSON.parse(fs.readFileSync(doneFile, 'utf8'))); } catch { done = new Set(readSeen() || []); }
  const save = () => fs.writeFileSync(doneFile, JSON.stringify([...done].slice(-2000)), { mode: 0o600 });
  save();
  console.log(`Leadkollen bevakar ${stateFile} (${done.size} leads sedan tidigare hoppas över)`);
  let busy = false;
  const round = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const id of readSeen() || []) {
        if (done.has(id) || id === 'test') continue;
        done.add(id); save(); // markeras först: en lead får aldrig ge en slinga av meddelanden
        try {
          const lead = await fetchLead(id);
          if (!lead.name) throw new Error('leaden saknar restaurangnamn');
          const result = await scout(lead);
          await sendToBridge(result.message);
          console.log(`Leadkoll skickad: ${lead.name} (${result.score}/10)`);
        } catch (error) {
          console.error(`Leadkoll misslyckades för ${id}: ${clean(error?.message, 160)}`);
          await sendToBridge(`LEADKOLL gick inte att göra för senaste leaden (${clean(error?.message, 120)}). Ring ändå.`).catch(() => {});
        }
      }
    } finally { busy = false; }
  };
  setInterval(round, 10_000);
  await round();
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (flag) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : '');
  if (argv.includes('--watch')) return watch();
  if (argv.includes('--lead')) {
    // Kör kollen på en lead som redan finns hos Meta. Skriver bara ut, skickar inget.
    const lead = await fetchLead(opt('--lead'));
    console.log((await scout(lead)).message);
    return;
  }
  const name = opt('--name');
  if (!name) { console.error('Ange --name "Restaurang" [--city Stad] [--phone nummer] [--send], eller --watch'); process.exit(2); }
  const result = await scout({ name, city: opt('--city'), phone: opt('--phone') });
  console.log(result.message);
  if (argv.includes('--json')) console.log(JSON.stringify({ site: result.site, foodora: result.foodora, wolt: result.wolt, reviews: result.place.reviews?.length }, null, 1));
  if (argv.includes('--send')) { await sendToBridge(result.message); console.log('\nSkickat till WhatsApp.'); }
}

if (require.main === module) main().catch((error) => { console.error(clean(error?.message, 200)); process.exit(1); });
module.exports = { scout, slug, classify };
