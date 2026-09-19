# Rekrytering först — kampanjpaket 2026-09-19

## Två målgrupper, två sidor
- `/tipsa`: uppdrag, ersättning, stöd, intresseanmälan. Kampanjerna leder hit.
- `/for-restauranger`: beställningssystemet för restaurangägare. Egen navigation, titel, beskrivning, canonical och sitemap. Rekryterare kan visa sidan för en ägare.
- `/tipsa/studio`: omdirigerar till restaurangsidan. Samtalsguiden ligger på rekryteringssidan.
- `/tipsa/kampanjer`: ej indexerat visningsrum för annonsfiler, bildspel och filmer.

Allt är lokalt. Inga annonser har publicerats och ingen deployment har gjorts. SEO-inställningarna får effekt först när sidan publiceras; ingen ranking utlovas.

## Annons A — Samtalet
Rubrik: Ditt nästa samtal kan leda till 800 kr.
Text: Hjälp en restaurang att byta beställningssida till viaeats. Du tar kontakten och hjälper ägaren fram till avtal. Vi ger dig materialet, svarar på frågor och sköter installationen. 800 kr per godkänt avtal: 500 kr efter godkännandet och 300 kr inom 30 dagar. Före skatt. Villkor gäller.
CTA: Läs mer / Anmäl intresse.
Länk: https://viaeats.se/tipsa?utm_source=meta&utm_campaign=partner_start&utm_content=samtalet

## Annons B — Ditt nätverk
Rubrik: Känner du en restaurangägare?
Text: Din lokala kontakt kan bli början på ett samarbete. Visa hur viaeats fungerar och hjälp restaurangen att jämföra en ny beställningssida. Du får 800 kr per godkänt avtal, före skatt. Material och introduktion ingår. Ett restaurangnamn räcker inte — du hjälper ägaren fram till avtal. Läs upplägget och anmäl intresse.
Länk: https://viaeats.se/tipsa?utm_source=meta&utm_campaign=partner_start&utm_content=kontakten

## Annons C — Stödet
Rubrik: Du tar kontakten. Vi ger dig stödet.
Text: Nyfiken på försäljning? Hos viaeats får du exempelsidor, filmer och en introduktion innan du börjar. Uppgiften: prata med restaurangägare och hjälpa dem fram till ett godkänt avtal. Ersättning: 800 kr per avtal, före skatt. Ingen fast lön eller garanterad inkomst. Lämna namn och e-post så berättar vi mer.
Länk: https://viaeats.se/tipsa?utm_source=meta&utm_campaign=partner_start&utm_content=stodet

## Bildspel och animation
Fem individuella bilder, 1080×1920: möjligheten → kontakt → material → ersättning → anmälan.
Bildspel: 25 sekunder, 1080×1920, 24 fps, med originalmusik.
Kort animation: 9 sekunder, 1080×1920, 24 fps, text i rörelse och originalmusik.
Båda utan berättarröst. CTA och huvudsakligt budskap har generösa marginaler. Kontrollera plattformens placeringsförhandsvisning före publicering.
TikTok-länk: https://viaeats.se/tipsa?utm_source=tiktok&utm_campaign=partner_start&utm_content=stegen
Kortfilm: https://viaeats.se/tipsa?utm_source=tiktok&utm_campaign=partner_start&utm_content=kortfilm

## Vad som går att mäta
Formuläret behåller befintlig UTM-hantering (source, campaign, creative). Inga testanmälningar skickade till produktion i detta arbete. Separera intresseanmälan, genomförd introduktion och godkänt restaurangavtal när resultat följs upp. Klick och anmälningar är inte intäkter.

## Bildproduktion och prompts
Verktyg: inbyggda image_gen. Fotorealistiska bilder med fiktiva vuxna modeller, inte kundomdömen eller dokumentära fotografier. Animationen och bildspelet är kodritad typografi. Originalen ligger under `apps/web/public/partners/recruitment/`.

Prompt 1: Premium photorealistic Swedish recruitment advertising photograph, portrait 4:5. Adult woman 23 in charcoal jacket and rust sweater talking with adult pizzeria owner in Lund. Tablet angled away. Warm wood, sage walls, natural light, quiet upper wall. No text, logos or testimonial.
Prompt 2: Swedish viaeats recruiter ad, portrait 9:16. Cream, dark green rounded typography and burnt orange. “Ditt nästa samtal.” “800 kr.” “Hjälp en restaurang att byta till viaeats.” Young adult and owner in Swedish pizzeria. “500 kr efter godkänt avtal.” “300 kr inom 30 dagar.” CTA viaeats.se/tipsa, before-tax condition.
Prompt 3: Square editorial recruitment ad. “Känner du en restaurangägare?” “800 kr per godkänt avtal”. Adult woman showing tablet to female cafe owner. “Hjälp dem att byta beställningssida.” “Vi ger dig materialet. Du tar kontakten.” CTA and payment split with conditions.
Prompt 4: Portrait 4:5 forest-green recruitment ad. “Du tar kontakten. Vi ger dig stödet.” Adult viewing presentation at cafe table. “800 kr per godkänt restaurangavtal”. Show material/help owner to contract. CTA and payment split with conditions.

Kontroller: bygg, mobil/dator, bildladdning, källor utan berättarröst, full avkodning av MP4. Inga nya juridiska villkor eller backendförändringar i detta arbete.


## Nya varianter — ersättning, unga vuxna och mål

### D: Vill du tjäna 800 kr?
Vill du tjäna extra? Hjälp en restaurang att byta beställningssida till viaeats. Du tar kontakten och hjälper ägaren fram till avtal. Vi ger dig material och stöd. 800 kr per godkänt avtal, med möjlighet till utbetalning via Swish enligt ditt upplägg. 500 kr efter godkännandet och 300 kr inom 30 dagar. Anmäl intresse på viaeats.se/tipsa.
Spårning: https://viaeats.se/tipsa?utm_source=meta&utm_campaign=partner_start&utm_content=800_swish

### E: 17–24 år?
Nyfiken på att tjäna extra och prova försäljning? Visa viaeats för en restaurangägare och hjälp dem fram till ett godkänt avtal. Du får material, introduktion och stöd. 800 kr per godkänt avtal. Är du under 18 ordnar vi upplägget med din vårdnadshavare innan start. Lämna namn och e-post så berättar vi mer.
Spårning: https://viaeats.se/tipsa?utm_source=tiktok&utm_campaign=partner_start&utm_content=unga
Åldersbudskapet är en kreativ variant. Webbplatsen har fortsatt ingen övre åldersgräns. Detta arbete ändrar inga inställningar för annonsinriktning.

### F: Sätt ditt nästa mål
7 godkända restaurangavtal × 800 kr = 5 600 kr. Börja med en restaurang och hjälp ägaren att jämföra ett byte till viaeats. Vi ger dig materialet och sköter tekniken. Räkneexempel, ingen garanterad inkomst. För sju avtal blir delbetalningarna 3 500 kr efter godkännandena och 2 100 kr inom 30 dagar från respektive godkännande.
Spårning: https://viaeats.se/tipsa?utm_source=meta&utm_campaign=partner_start&utm_content=mal_5600

### Bildprompts för D–F
Inbyggda image_gen användes; genererade vuxna modeller är illustrationer, inte verkliga deltagare.
D: Premium ivory/forest-green 9:16 Swedish recruiter ad. Exact headline “Vill du tjäna 800 kr?”; fictional adults outside Swedish pizzeria; restaurant switch, included material/support, Swish possibility, CTA, per-approved-contract condition and 500+300 payment split.
E: Sage/green square editorial ad. “17–24 år?”, “Gör din nästa kontakt värd något”, “800 kr per godkänt restaurangavtal”. Adult woman with tablet outside cafe. Three task lines, CTA, payment split and guardian arrangement for minors.
F: Forest-green 4:5 typographic ad. “Sätt ditt nästa mål”, “5 600 kr”, “7 godkända avtal × 800 kr”. Seven numbered tiles, restaurant switch, support, Swish possibility, CTA, illustrative-income condition and split payments. No invented bonus or guaranteed income.


## Förenklade original, version 2
De tre senaste annonserna har ersatts i visningsrummet med enklare versioner. En rubrik, ett belopp, en CTA. Uppdragets detaljer och utbetalningsupplägg förklaras på landningssidan. Beloppet är fortfarande kopplat till godkänt restaurangavtal; 5 600 kr är ett räkneexempel för sju avtal.

Inbyggda image_gen, nya original med suffix -v2. Tidigare versioner sparas som arbetsmaterial.
Prompt A: Minimal 9:16 ivory/forest-green Swedish ad. Only “viaeats”, “Vill du tjäna 800 kr?”, “Per godkänt restaurangavtal”, “Läs mer · viaeats.se/tipsa”. Photorealistic fictional adult woman22 speaking with pizzeria owner, soft daylight, generous whitespace, no additional copy or icons.
Prompt B: Minimal square sage/cream Swedish ad. Only “viaeats”, “17–24 år?”, “Tjäna extra.”, “800 kr”, “Per godkänt restaurangavtal”, “Nyfiken? viaeats.se/tipsa”. Fictional adult22-year-old man at Lund cafe, bold rounded type, no extra text.
Prompt C: Minimal 4:5 forest-green typographic ad. Only “viaeats”, “Sikta på”, “5 600 kr.”, “7 godkända restaurangavtal × 800 kr”, “Räkneexempel”, “Börja här · viaeats.se/tipsa”. Oversized cream rounded type and one understated orange stroke. No steps, icons or extra copy.
