# Orderkälla och Meta Purchase

Varje ny order binder, efter marknadsföringssamtycke, observerad trafikkälla till ORDER_CHANNEL_CAPTURED i samma transaktion som ordern. Ingen databasändring krävs. Källan visas bara via admin-API och i orderlistan, historiken och orderdetaljerna.

## Tolkning

- Besökskälla: aktuell ingång, bevaras genom intern navigation, omladdning och betalretur. Nytt besök efter 30 minuters inaktivitet eller ny flik. Ny explicit kampanj kan byta källa under ett besök.
- Första och senaste marknadsföringskontakt sparas separat upp till 30 dagar. Ett direkt återbesök blir inte automatiskt Meta i orderlistan.
- Direkt betyder ingen identifierbar extern källa, inte bevis på inskriven adress. Okänd används för äldre ordrar eller saknat samtycke/lagringsunderlag.
- Meta-klick-id kan komma från en delad länk; bevisar inte betald annons. UTM-medium och annons-id hjälper skilja annons från annan trafik.
- Palmyra betyder observerad Palmyra-ingång. Det bevisar inte vilken annons som först skickade kunden till Palmyras egen domän. Den sajten måste vidarebefordra kampanjmärkning för att hela kedjan ska bli synlig.
- Rapporten Kundresan → betalda order utgår från riktiga betalda ordrar, inte enbart ORDER_PLACED eller de senaste 500 besöken. Exkluderar test, annullerade och helt återbetalda; särmarkerar delvis återbetalda.

## Länkmärkning

Använd konsekvent utm_source, utm_medium, utm_campaign, utm_content och ad_id/adset_id. Meta: utm_source={{site_source_name}}&utm_medium=paid_social&utm_campaign={{campaign.id}}&ad_id={{ad.id}}&adset_id={{adset.id}}. QR: utm_source=palmyra&utm_medium=qr&utm_campaign=resto. Ändra inte rabatter eller priser via analysparametrar.

## Purchase

PAID från betalningslagret skapar en beständig kö. Belopp kommer från ordern, SEK från öre. Stabilt event-id Purchase:<order-id> används av både browser och server. Köfel får inte stoppa betalningen. Servern återförsöker högst åtta gånger och inom 47 timmar. Återbetalda, annullerade och testordrar skickas inte. Ett accepterat Meta-event innebär inte garanterad attribuering till en annons.

Miljövariabler: META_CAPI_ENABLED=1, META_PIXEL_ID=1850021916382355, META_GRAPH_VERSION=v23.0 och META_CAPI_ACCESS_TOKEN. Hemlig token endast i Railway. META_TEST_EVENT_CODE ska inte finnas i produktion. Aktivering kräver giltig token; adminrapporten visar verklig konfigurationsstatus. Testa i Metas Testhändelser före att hävda att serverhändelser mottagits.

## Historisk kontroll 18 september

PA-1193-JV, PA-1196-DP och PA-1197-CF har enbart VIAEATS_WEB i sparad kanallogg. Exakt trafikkälla kan inte bevisas. PA-1196-DP har tidigare beställningar; tidigare Palmyra-källa bevisar inte dagens källa. Inga påhittade konverteringar eller historiska källor har skrivits tillbaka.

Det publicerade webbgränssnittet väntade på marketingPurchase, som saknades i publicerad backend. Denna leverans lägger till den betalverifierade kvittensen. Betalningar och Meta-rapportering är separata; ett fullständigt köp inuti Facebook/Instagram på fysisk telefon återstår att verifiera.
