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
