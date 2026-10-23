# Hermes mot ViaEats-API:t

Allt Hermes-agenterna gör mot plattformen går genom två separata dörrar. De har
olika nycklar, och de går sönder på olika sätt.

| Dörr | Nyckel | Används till |
|---|---|---|
| `/api/hermes/*` | `HERMES_API_TOKEN` (Bearer) | ordernotiser, orderuppslag, supportrapporter |
| `/api/auth/login` → `/api/admin/*` | agentkonto + lösenord → JWT | morgonrapport, driftdata, meny- och deal-ändringar |

## Hur notiserna färdas

API:t skickar inte ut något själv. `falkenNotifier.ts` skriver varje händelse
(`order:new`, `order:accepted`, `order:delivering`, …) till en outbox i
`AuditLog`. Så länge produktionen saknar `HERMES_WHATSAPP_WEBHOOK_URL` och
`HERMES_WHATSAPP_SEND_URL` — vilket den gör — blir raden liggande som
`HERMES_ALERT_QUEUED` tills någon hämtar den:

```
Order → falkenNotifier → outbox (AuditLog) → GET /api/hermes/alerts → poll-api.js → WhatsApp-bryggan
```

Kedjan är alltså en **pull**-kedja. Står `poll-api.js` stilla skickas ingenting,
hur välmående API:t än är. Notiserna går inte förlorade — de ligger kvar i kön —
men de blir gamla.

`poll-api.js` hoppar därför över notiser äldre än 45 min
(`HERMES_MAX_ALERT_AGE_MS`) och skickar i stället en rad om hur många som
passerades. Utan det taket hade ett dygns avbrott betytt ett dygns notiser på en
gång när bryggan kom tillbaka.

## Agentsessionen — det som ger "AuthError"

`POST /api/auth/login` lämnar JWT:n **enbart** i en HttpOnly-cookie
(`Set-Cookie: admin_token=…`). Svarskroppen innehåller bara `admin`-objektet.
En agent som läser `body.token` får `undefined` och rapporterar AuthError trots
att inloggningen gick igenom.

`login.mjs` gör det rätt: plockar cookien, verifierar den mot
`POST /api/auth/verify` och lägger den i `~/.viaeats/hermes/<agent>.token`
(chmod 600). Agenten läser filen och skickar `Authorization: Bearer <token>`.
JWT:n lever 7 dygn; `hermes-login.timer` förnyar den varje natt.

Tre saker stoppar inloggningen, och skriptet säger vilken det är:

| Svar | Betyder |
|---|---|
| `401` | fel lösenord, eller kontot är avaktiverat (`isActive = false`) |
| `200 {"totpRequired":true}` | 2FA är påslaget på agentkontot — en headless agent kan inte svara på TOTP |
| `429` | inloggningsbudgeten slut. Sätt `AGENT_LOGIN_KEY` så gäller 80 försök/15 min i stället för 8 |

`AGENT_LOGIN_KEY` måste vara samma värde som Railway-variabeln, och skickas som
`x-viaeats-agent`. Utan den delar agenten den strama IP-budgeten med all annan
trafik från minin.

## Konfiguration på Linux-minin

`~/.viaeats/hermes/agents.env` (chmod 600):

```
VIAEATS_API_BASE=https://api.viaeats.se
AGENT_LOGIN_KEY=<samma som Railway>
FALKEN_EMAIL=falken@viaeats.se
FALKEN_PASSWORD=<lösenord>
KOCKEN_EMAIL=kocken@viaeats.se
KOCKEN_PASSWORD=<lösenord>
TORGET_EMAIL=torget@viaeats.se
TORGET_PASSWORD=<lösenord>
```

`tools/hermes-whatsapp-forwarder/.runtime.env` (chmod 600) styr pollaren:
`HERMES_API_TOKEN`, `HERMES_WHATSAPP_CHAT_ID`, `HERMES_BRIDGE_SEND_URL`.

## Kommandon

```bash
node tools/hermes-agent/doctor.mjs          # var i kedjan sitter felet?
node tools/hermes-agent/login.mjs           # förnya alla agentsessioner
node tools/hermes-agent/login.mjs falken    # bara en

node --test tools/hermes-whatsapp-forwarder/poll-api.test.mjs   # pollarens kontrakt
```

`doctor.mjs` kontrollerar API:ts hälsa, Hermes-token, pollarens markör, att
WhatsApp-bryggan lyssnar, och att varje agentsession fortfarande duger (Falken
provas dessutom mot `/api/admin/ops`, som är den drift-endpoint morgonrapporten
lutar sig mot). Den skriver aldrig ut tokens, lösenord eller chat-id.

Drift: `systemd/` innehåller `hermes-poll.service` (pollaren, `Restart=always`),
`hermes-login.service` + `.timer` (nattlig sessionsförnyelse). Loggar:

```bash
journalctl -u hermes-poll -n 100 --no-pager
```

## Lead-bevakning: Meta-leads → WhatsApp

`tools/hermes-whatsapp-forwarder/poll-meta-leads.js` hämtar nya leads från
sidans snabbformulär (Graph API `/{form-id}/leads`) varje minut och skickar
dem till samma WhatsApp-brygga och chatt som ordernotiserna:

```
NY LEAD
Restaurang: …
Telefon: …
Stad: …

Inkom fre 23 okt. 16:05 · Facebook · <formulärnamn>
```

Den går direkt mot Meta och inte via API:t. Inget behöver deployas, och leads
som kom in medan minin var nere skickas när den är uppe igen (upp till 7 dygn
bakåt, `META_LEADS_LOOKBACK_HOURS`). Alla formulär på sidan bevakas, även nya
kampanjer. Sätt `META_LEAD_FORM_IDS` för att bara bevaka vissa formulär.

- **Ingen dubblett:** varje lead-id sparas i `~/.viaeats/hermes/meta-leads-state.json`
  direkt när bryggan svarat OK. Ett bryggfel markerar inget, så leadet skickas
  nästa minut. Om bryggan inte svarar alls kan den ändå ha skickat, och då
  märks nästa försök "(skickas igen, kan vara en dubblett)".
- **Första starten** skickar bara leads som kommer in efter starten.
  `--backfill` tar med hela fönstret bakåt.
- **Larm:** avvisar Meta token (kod 190, eller behörighet som saknas) kommer ett
  "Blockerad: …"-meddelande, och det upprepas var 12:e timme. Når pollaren inte
  Meta på 30 min kommer ett larm som upprepas var 6:e timme.

`~/.viaeats/hermes/meta-leads.env` (chmod 600), skapas av `setup-meta-leads.mjs`:
`META_PAGE_ID`, `META_PAGE_ACCESS_TOKEN`, `META_GRAPH_API_VERSION`. Bryggan och
chatten läses från `.runtime.env` precis som `poll-api.js`.
`META_LEADS_CHAT_ID` skickar leads till en annan chatt.

### Token (engångssteg)

1. Meta-app av typen Business, med användaren som admin. Utvecklingsläge räcker.
2. Graph API Explorer: välj appen och **Användartoken**, och lägg till behörigheterna
   `leads_retrieval`, `pages_show_list`, `pages_read_engagement` och `pages_manage_ads`.
   Klicka på Generate Access Token och bocka i ViaEats-sidan.
3. `node tools/hermes-whatsapp-forwarder/setup-meta-leads.mjs` frågar efter app-ID,
   app-hemlighet och token (dolt), byter till en sidtoken som inte går ut, och
   listar formulären som kontroll.

Sidtoken slutar gälla om lösenordet till Facebook-kontot byts eller appen tas
bort. Då kommer larmet, och då kör man steg 2–3 igen.

### Kommandon

```bash
node tools/hermes-whatsapp-forwarder/poll-meta-leads.js --check         # token, formulär, fältnycklar, brygga. Skickar inget.
node tools/hermes-whatsapp-forwarder/poll-meta-leads.js --test-message  # ett påhittat lead till WhatsApp
node --test tools/hermes-whatsapp-forwarder/poll-meta-leads.test.mjs    # kontrakten

sudo systemctl disable --now hermes-meta-leads   # stäng av (startar inte heller efter omstart)
sudo systemctl enable --now hermes-meta-leads    # slå på igen
journalctl -u hermes-meta-leads -n 50 --no-pager
```

## Ordernotiser: bara NY ORDER

`poll-api.js` skickar en rad per ny order och inget mer:

```
NY ORDER 359 kr Palmyra Pizzeria
```

Statusbyten (`order:accepted`, `order:delivering`, `order:delivered` …) och
budlarm (`courier:*`) tystas och kvitteras, så att `doctor.mjs` inte visar dem
som olevererade. Supportärenden och systemlarm går igenom som förut. Fler typer
släpps igenom med `HERMES_ORDER_ALERT_TYPES=order:new,order:rejected`.
Filtret ligger i pollaren på minin, så API:t behöver inte deployas för det.

**Restaurangvakten** ligger i samma pollare. Om en order fortfarande är PENDING
efter 4 minuter (`HERMES_PENDING_ORDER_ALERT_MIN`, 0 stänger av) frågar den
`/api/hermes/orders/lookup` om aktuell status och larmar en gång:

```
INGEN HAR TAGIT ORDERN
359 kr hos Palmyra Pizzeria har väntat 4 min (PA-1234).
Ring restaurangen: 046-…
```

## Vakten: automatiska meddelanden

`vakt.mjs` körs av två timers:

| Timer | Vad |
|---|---|
| `hermes-vakt.timer` (var 2:a min) | **Sajtvakt**: viaeats.se och api.viaeats.se/health. Larmar efter 2 missar i rad och påminner varje timme. Ett meddelande kommer när sajten är uppe igen. Certifikat som går ut inom 14 dagar varnas. Larmar inte om minin själv saknar internet. |
| | **Öppettidsvakt**: en restaurang som enligt sina tider ska ha öppet men varit pausad eller stängd i 15 min. Ett meddelande kommer när den öppnar igen. |
| | **Rekordnotis**: bästa dagen hittills (minst 3 ordrar, minst 7 dagars historik), högst en per dag. |
| `hermes-vecka.timer` (måndag 08:00) | **Veckobrev**: veckan mot veckan innan, bästa dagen, nya leads och kampanjslut (`VAKT_CAMPAIGN_END=2026-10-31` i `~/.viaeats/hermes/vakt.env`). Den dagliga morgonrapporten 07:30 är Hermes eget cron-jobb `Delivera morgonrapport`. `vakt.mjs morgon` finns kvar men är inte schemalagd. |

Vakten läser `/api/admin/overview` och `/api/admin/ops` med Falkens session
(`falken.token`, som förnyas av `hermes-login.timer`). Den skriver aldrig något.
En enskild kontroll stängs av med `VAKT_DISABLE=sajt,oppettider,rekord` i `vakt.env`.

Hermes svarar på begäran med samma data (skillen `viaeats-drift`):
`vakt.mjs idag`, `vakt.mjs restauranger`, `vakt.mjs order <nr|telefon>`,
`poll-meta-leads.js --latest 5`.

## Jour: Hermes kodar akuta fixar, du godkänner

Skillen `viaeats-jour` låter Hermes göra små fixar från WhatsApp. Det går bara
till `main` genom grinden `viaeats-jour`:

1. Hermes committar i `~/viaeats-jour` och kör `viaeats-jour request "titel"`.
2. Grinden körs som en egen Linux-användare, `viaeats-jour`, som är den enda med
   deploy-nyckeln. Den hämtar commitarna och räknar själv fram exakt vad som
   ändras. Sedan skickar den filerna, diffen och en engångskod direkt till
   WhatsApp. Koden går aldrig via Hermes.
3. Du svarar `GODKÄNN <id> <kod>`, eller `GODKÄNN RADERING <id> <kod>` när något
   tas bort. Först då kan Hermes köra `viaeats-jour approve`, och grinden pushar
   exakt det som visades. Den gör det aldrig med force, och bara om `main` inte
   flyttat sig sedan begäran skapades.

Grinden stoppar en ändring innan något skickas om den:
- rör fler än 15 filer eller fler än 400 rader
- rör `packages/api/prisma`, `.env`, nycklar, `_hemligheter/`, `.github/` eller grindens egna filer
- innehåller något som ser ut som en hemlig nyckel

Koden gäller i 30 min. Efter 3 fel koder spärras begäran. Allt loggas i
`/var/lib/viaeats-jour/audit.jsonl`.

### Säkerhet, lager för lager

| Lager | Vad det stoppar | Hur hårt |
|---|---|---|
| Hermes har ingen GitHub-nyckel. Bara `viaeats-jour` har den (OS-användare, sudo-regel för just grinden). | Push utan din kod | Hårt: ingen prompt kan ta sig runt det |
| Engångskoden går från grinden till WhatsApp och lagras bara som hash hos `viaeats-jour` | Att Hermes godkänner åt dig | Hårt |
| `guard-terminal.py` (`pre_tool_call`, root-ägd, `fail_closed`) | Stoppar `git push`, Railway, Vercel, psql, migrationer, ändringar i Hermes egna inställningar och allt som rör grindens filer. `sudo`, `rm`, `mv`, `git reset --hard` m.fl. kräver ditt OK först. | Stoppar misstag. Ett skript som agenten själv skriver och kör syns inte för vakten. |
| `approvals.deny` i config.yaml | Samma push- och konfig-kommandon, även i yolo-läge | Som ovan |
| `WHATSAPP_ALLOWED_USERS` = bara ditt nummer, `unauthorized_dm_behavior: ignore` | Att någon annan styr Hermes | Hårt |

Inställningarna som ska in i `~/.hermes/config.yaml` finns i
`hermes-config.viaeats.yaml`. `harden-hermes.py` sammanfogar dem med en kopia först
(`~/.hermes/hermes-agent/venv/bin/python tools/hermes-agent/harden-hermes.py`). Installationen görs med
`bash tools/hermes-agent/install-mini.sh` på minin.

### Stäng av

```bash
sudo rm /etc/sudoers.d/viaeats-jour                  # jour: Hermes kan inte längre nå grinden
sudo systemctl disable --now hermes-vakt.timer       # sajt, öppettider, rekord
sudo systemctl disable --now hermes-vecka.timer      # veckobrevet
sudo systemctl disable --now hermes-meta-leads       # NY LEAD
```
Deploy-nyckeln tas bort under GitHub → lexzar99/palmy → Settings → Deploy keys.

### Hermes-version

`hermes --version` visar versionen och `hermes update --backup` uppdaterar till
senaste stabila version, med säkerhetskopia. Gatewayen startas om automatiskt.
Kontrollera efteråt med `hermes doctor` och `hermes gateway status`.
