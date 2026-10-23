---
name: viaeats-drift
description: Svara på frågor om viaeats drift via WhatsApp - dagens siffror, restauranger, ordrar, leads och vakternas status.
---

# viaeats drift på begäran

Använd när användaren frågar om läget i viaeats. Alla kommandon nedan **läser
bara**. De ändrar ingenting i produktionen. Kör dem från `~/viaeats-hermes`
(repot som vakterna körs ifrån) och svara kort på svenska med siffrorna. Hitta
aldrig på siffror: säg att ett kommando inte gav något om det inte gjorde det.

| Användaren skriver ungefär | Kör |
|---|---|
| "siffror", "hur går det idag", "läget" | `node tools/hermes-agent/vakt.mjs idag` |
| "vilka har öppet", "restauranger" | `node tools/hermes-agent/vakt.mjs restauranger` |
| "veckan", "veckobrev" | `node tools/hermes-agent/vakt.mjs vecka --dry-run` |
| "order PA-1234", "kolla ordern från 0701234567" | `node tools/hermes-agent/vakt.mjs order <nr eller telefon>` |
| "senaste leadsen", "leads" | `node tools/hermes-whatsapp-forwarder/poll-meta-leads.js --latest 5` |
| "fungerar allt", "status på vakterna" | `node tools/hermes-agent/doctor.mjs` och `systemctl list-timers 'hermes-*' --no-pager` |

## Det som sköts automatiskt (användaren behöver inte be om det)

- **NY ORDER**: en rad per ny order med pris och restaurang. Statusbyten skickas inte.
- **NY LEAD**: varje ny lead från Metas snabbformulär.
- **Restaurangvakten**: en order som ingen tagit på 4 minuter ger ett larm med restaurangens nummer.
- **Veckobrev** måndagar 08:00: veckan mot veckan innan, bästa dagen, nya leads och kampanjslut. Den dagliga morgonrapporten kl 07:30 är Hermes eget cron-jobb.
- **Sajtvakten**: viaeats.se och API:t. Larm om de ligger nere, och ett meddelande när de är uppe igen. Certifikat som snart går ut.
- **Öppettidsvakten**: en restaurang som ska ha öppet men varit stängd eller pausad i 15 minuter.
- **Rekordnotis**: bästa dagen hittills.

Vill användaren stänga av något: berätta att det görs på minin med `sudo systemctl disable --now <tjänst>`, eller med `VAKT_DISABLE=sajt,oppettider,rekord` i `~/.viaeats/hermes/vakt.env`. Gör det inte själv.

För kodändringar: använd skillen `viaeats-jour`.
