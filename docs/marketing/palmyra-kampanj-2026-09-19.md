# Palmyra 19 september 2026

Dagens test: VIA50 = 50 kr från 150 kr mat; VIA70 = 70 kr från 250 kr mat. Slutar 23:59 svensk tid. Inga kombinationer med rabatterade produkter, BOGO eller andra kuponger. Privat embed får inte koderna. Inget användningstak utlovas.

Palmyras redirect (utm_source=palmyra) behåller produktkampanjer. Direkt/Meta visar ordinarie meny under testet. Privat avgiftskanal kräver fortfarande verifierat kioskbevis. Menyval och samtyckesstyrd marknadsföringsattribuering är separata. Saknat samtycke ger inte fabricerad attribution.

Palmyras fyra befintliga leveranszoner och restaurangens miniminivå sattes till 10000 öre på uttrycklig begäran. Geometri och avgifter oförändrade. Backup finns lokalt i output/via50/zones-before.json. Inga schemaändringar.

Meta: budgettak 300 kr totalt, inte per annons. Nya annonser får aktiveras först efter livekontroll. Gamla Palmyrakampanjen pausad genom Chrome. Publicering måste verifieras separat.

Bildmaterial: public/campaigns/via50, flöde 4:5 och story 9:16. Skapade med imagegen utifrån befintlig Palmyra kebabpizza och viaeats lockup. Prompt: premium svensk restaurangannons, varm ivory/navy, stora lättlästa rundade bokstäver, exakt kod/tröskel, 'Fri hemleverans inom Lund', CTA viaeats.se, 'Gäller ej rabatterade varor. Villkor i kassan'. VIA70: 'Stor middag ikväll?' två pizzor. Story VIA50: 'Hungrig nu?' navy bakgrund. Ingen påhittad knapphet eller recension.

Verifiering: API-kontrakt, checkout-integritet, orderattribution, faktiska kodvalideringsanrop med mockdatabas; webbkontrakt 108 tester; TypeScript API; Next webpack produktionsbygge. Ingen verklig betalning utförd av agenten.
