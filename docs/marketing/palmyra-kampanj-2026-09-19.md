# Palmyra 19 september 2026

Dagens test: VIA50 = 50 kr från 150 kr mat; VIA70 = 70 kr från 250 kr mat. Slutar 23:59 svensk tid. Inga kombinationer med rabatterade produkter, BOGO eller andra kuponger. Privat embed får inte koderna. Inget användningstak utlovas.

Palmyras redirect (utm_source=palmyra) behåller produktkampanjer. Direkt/Meta visar ordinarie meny under testet. Privat avgiftskanal kräver fortfarande verifierat kioskbevis. Menyval och samtyckesstyrd marknadsföringsattribuering är separata. Saknat samtycke ger inte fabricerad attribution.

Palmyras fyra befintliga leveranszoner och restaurangens miniminivå sattes till 10000 öre på uttrycklig begäran. Geometri och avgifter oförändrade. Backup finns lokalt i output/via50/zones-before.json. Inga schemaändringar.

Meta: budgettak 300 kr totalt, inte per annons. Nya annonser får aktiveras först efter livekontroll. Gamla Palmyrakampanjen pausad genom Chrome. Publicering måste verifieras separat.

Bildmaterial: public/campaigns/via50, flöde 4:5 och story 9:16. Skapade med imagegen utifrån befintlig Palmyra kebabpizza och viaeats lockup. Prompt: premium svensk restaurangannons, varm ivory/navy, stora lättlästa rundade bokstäver, exakt kod/tröskel, 'Fri hemleverans inom Lund', CTA viaeats.se, 'Gäller ej rabatterade varor. Villkor i kassan'. VIA70: 'Stor middag ikväll?' två pizzor. Story VIA50: 'Hungrig nu?' navy bakgrund. Ingen påhittad knapphet eller recension.

Verifiering: API-kontrakt, checkout-integritet, orderattribution, faktiska kodvalideringsanrop med mockdatabas; webbkontrakt 108 tester; TypeScript API; Next webpack produktionsbygge. Ingen verklig betalning utförd av agenten.

## Livekontroll
Webb + API deploy c9e968a9 lyckades. VIA50/150 och VIA70/250 ger HTTP200 och rätt rabatt i kr. Under gränsen eller rabattvaror ger tydligt400. Live kebabpizza: direkt/Meta135, Palmyraredirect89. Alla fyra zoner verifierade100kr, avgift0. Gamla varukorgar synkas nu mot aktuell meny före betalning, med synligt meddelande; tillval och antal behålls.

Meta-utkast: kampanj120251087739260036, adset120251087739250036, annons120251087739240036. Livstidsbudget300SEK, Lund endast ort (ingen40kmradie, geografisk expansion av), sluttid19september23:00GMT+2. Köp/pixel1850021916382355. INTE PUBLICERAT: media- och textguiden laddar aldrig färdigt efter flera försök/omladdning. Bilder finns lokalt men inte uppladdade. Gamla kampanj120251040974170036 är AV, verifierat i Chrome.

Server-CAPI är inte aktiv: META_CAPI_ENABLED=1 men META_CAPI_ACCESS_TOKEN saknas. UI säger att administratörs-/utvecklarbehörighet i företagsportföljen krävs för token. Ingen token skapad. Webbläsarpixel visar PageView/AddToCart/InitiateCheckout, ingen nylig Purchase. Betalningar påverkas inte av detta. Inga köp fabricerade eller testköp skickade som riktiga.

Annonscopy VIA50: Hungrig? Beställ från Palmyra på viaeats.se. 50 kr rabatt på mat från 150 kr med VIA50. Fri hemleverans inom Lund. Gäller idag, ej rabatterade varor.
Annonscopy VIA70: Stor middag ikväll? Få 70 kr rabatt på mat från 250 kr hos Palmyra. Kod VIA70. Fri hemleverans inom Lund. Beställ på viaeats.se. Gäller idag, ej rabatterade varor.
Placeringar: VIA50 feedbild4:5 för flöden och separat9:16 för story/reels. VIA70feed endast flöden tills egen9:16 finns. Undvik automatisk beskärning som tar bort tröskel/kod. Inga annonser ska aktiveras efter att koderna gått ut.
