---
name: viaeats-jour
description: Akuta småfixar i viaeats-koden via WhatsApp. Kodar och testar, och pushar bara efter användarens engångskod.
---

# Jour-läge för viaeats

Använd den här när användaren på WhatsApp ber om en **akut liten fix** i viaeats:
kundwebben (`apps/web`), API:t (`packages/api`) eller adminpanelen (`apps/admin`).
Arbetskartan över koden ligger i `references/CLAUDE.md`. Läs den först.

## Regler som aldrig bryts

1. **Pusha aldrig själv.** Den enda vägen till `main` är `viaeats-jour request` → användarens kod → `viaeats-jour approve`. Du har ingen nyckel till GitHub och terminalvakten stoppar `git push`.
2. **Leta aldrig efter godkännandekoden.** Den finns bara i användarens WhatsApp. Använd exakt den kod användaren skriver, och hitta aldrig på en.
3. **Inget destruktivt utan att fråga.** Innan du tar bort en fil, en funktion eller mer än ett par rader: skriv exakt vad som försvinner och vänta på "ja". Grinden visar dessutom raderingar med ⚠️, och då måste användaren svara `GODKÄNN RADERING`.
4. **Bara små fixar.** Högst 15 filer och 400 rader. Aldrig `packages/api/prisma` (schemat kräver manuell SQL i produktionen), aldrig `.env`, nycklar, `_hemligheter/`, `.github/` eller grindens egna filer. Grinden vägrar sådant ändå.
5. **Rör aldrig produktionen direkt.** Det gäller databasen, Railway, Vercel och migrationer.
6. Är uppdraget otydligt eller större än en jour-fix: fråga, eller föreslå att det får vänta tills användaren har Claude.

## Arbetsgång

1. Bekräfta uppdraget med en mening.
2. Gör arbetskopian ren och hämta senaste `main`:
   ```bash
   cd ~/viaeats-jour && git status --short   # ska vara tomt
   git fetch -q origin && git switch -C jour/<kort-namn> origin/main
   ```
3. Hitta rätt ställe (`rg`, läs koden runt omkring) och gör **minsta möjliga** ändring. Följ stilen i filen. Svenska i kommentarer och commit-meddelanden. Varumärket skrivs `viaeats`.
4. Testa det som berörs. Första gången: `pnpm install --frozen-lockfile`.
   - Webben: `pnpm --filter web test:contracts`
   - API:t: `pnpm --filter @viaeats/api test:contracts`, plus relevant `test:*` (till exempel `test:checkout-integrity`, `test:order-status`)
   - Typer: `pnpm --filter web exec tsc --noEmit` eller `pnpm --filter @viaeats/api exec tsc --noEmit`
5. Committa: `git add -A && git commit -m "Kort beskrivning på svenska"`
6. Begär godkännande: `viaeats-jour request "Kort titel"`. Grinden skickar exakt diff och en engångskod direkt till användaren.
7. Skriv till användaren i klartext:
   - vad du ändrade och varför
   - vilka filer
   - vilka tester som gick igenom (eller att något inte gick att testa)
   - vad som kan gå fel
   - "Svara med koden från grinden, eller NEJ."
8. Svar:
   - `GODKÄNN <id> <kod>` eller `GODKÄNN RADERING <id> <kod>`: kör `viaeats-jour approve <id> <kod>` och rapportera resultatet.
   - `NEJ <id>`: kör `viaeats-jour deny <id>`.
   - "Fel kod" eller "har ändrats sedan": berätta det rakt och gör en ny begäran om det behövs.
9. Efter push: vänta ungefär 3 minuter och kontrollera `https://viaeats.se` och `https://api.viaeats.se/health`. Säg vad du ser.

## Ångra en jour-fix

När användaren skriver "ångra <id>":
```bash
viaeats-jour info <id>                         # visar base och tip
cd ~/viaeats-jour && git fetch -q origin && git switch -C jour/angra-<id> origin/main
git revert --no-edit <base>..<tip>
viaeats-jour request "Ångra <id>"
```
En ångring går genom samma godkännande.

## Övrigt

- `viaeats-jour status` visar väntande begäranden. `viaeats-jour status --all` visar historiken.
- Koden gäller i 30 minuter och spärras efter 3 fel försök.
