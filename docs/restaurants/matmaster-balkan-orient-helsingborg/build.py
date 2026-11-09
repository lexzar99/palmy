# Bygger menu.yaml, data.json och restaurant.json för Matmaster Balkan & Orient, Ekslingan 8, Helsingborg (Väla).
# Källa: menytavlan i restaurangen, fotograferad av gäster och uppladdad på restaurantguru.com (cirka ett år gammal, avläst 2026-11-09),
# och restaurangens egen kampanjbild om ćevapi och pljeskavica. Priser i kronor exakt som på tavlan. Läs README.md om det som måste bekräftas.
import json
from pathlib import Path

HERE = Path(__file__).parent
IMG = "/demo/matmaster/img"
SAUCE, MENU_ADD, EXTRA, DRINK, FRIES, LUNCH = "Välj sås (ingår)", "Gör det till en meny", "Extra", "Lägg till dryck", "Storlek", "Välj lunchrätt"
WRAP = [SAUCE, EXTRA, DRINK]
BALKAN = [MENU_ADD, EXTRA, DRINK]

# (namn, pris, beskrivning, bild eller None, tillval eller None)
MENU = {
 "Dagens lunch": [
  ("Dagens lunch", 99, "Vardagar 11 till 14. Välj ćevapi, pljeskavica, turkisk kebab, falafel eller burgare.", "cevapi", [LUNCH, SAUCE, DRINK])],
 "Balkan": [
  ("Ćevapčići", 105, "Nötfärs i somun (bosniskt bröd) med kajmak, ajvar, hackad lök och sallad.", "cevapi", BALKAN),
  ("Pljeskavica", 105, "Nötfärs i somun (bosniskt bröd) med kajmak, ajvar, hackad lök och sallad.", "pljeskavica", BALKAN)],
 "Turkisk kebab": [
  ("Kebab i bröd", 105, "Nötkebab i hembakat bröd med sallad, saltgurka, lök och tomat.", "kebab-i-brod", WRAP),
  ("Kebabrulle", 110, "Nötkebab i dürüm med sallad, saltgurka, lök och tomat.", "kebabrulle", WRAP),
  ("Kebabtallrik", 125, "Nötkebab med pommes, sallad, saltgurka, lök, gurka och tomat.", "kebabtallrik", WRAP),
  ("Kebab box", 89, "Kebabkött, kyckling, falafel och halloumi.", "kebabbox", WRAP),
  ("Kyckling i bröd", 105, "Stekt kyckling i hembakat bröd med sallad, saltgurka, lök och tomat.", "kyckling-i-brod", WRAP),
  ("Kycklingrulle", 110, "Stekt kyckling i dürüm med sallad, saltgurka, lök och tomat.", "kycklingrulle", WRAP),
  ("Kycklingtallrik", 125, "Stekt kyckling med pommes, sallad, saltgurka, lök, gurka och tomat.", "kycklingtallrik", WRAP),
  ("Crispy kycklingfilé tallrik", 125, "5 st med sallad, spicy pommes och vitlökssås.", "crispy-tallrik", [DRINK]),
  ("Hot wings tallrik", 125, "5 st med sallad och spicy pommes.", "hotwings-tallrik", [SAUCE, DRINK]),
  ("Chicken nuggets tallrik", 110, "7 st med pommes och remouladsås.", "nuggets-tallrik", [DRINK])],
 "Burgare": [
  ("Smash Texas", 110, "120 g högrev, pommes, sallad, double cheese, rödlök, pickles och BBQ-sås.", "smash", [DRINK]),
  ("Smash New York", 110, "120 g högrev, pommes, sallad, tomat, rödlök, jalapeños och original dressing.", "smash-newyork", [DRINK]),
  ("Smash Dubbel cheese", 110, "120 g högrev, pommes, pickles, double cheese, crispy sallad, gul lök, ketchup och senap.", "smash-dubbelcheese", [DRINK]),
  ("Matmaster burgare", 129, "180 g hemgjord burgare, spicy pommes, sallad, double cheese, rödlök, pickles och original dressing.", "matmaster-burgare", [DRINK]),
  ("Chicken crispy burgare XL", 129, "Spicy pommes, sallad, rödlök, pickles och original dressing.", "chicken-xl", [DRINK]),
  ("Fiskburgare", 129, "Pommes, sallad, rödlök och original dressing.", "fiskburgare", [DRINK])],
 "Falafel och halloumi": [
  ("Falafeltallrik", 120, "Sallad, saltgurka, lök och tomat.", "falafel", WRAP),
  ("Falafel i bröd", 99, "Hembakat bröd med sallad, saltgurka, lök och tomat.", "falafel-i-brod", WRAP),
  ("Falafelrulle", 90, "Dürüm med sallad, saltgurka, lök och tomat.", "falafelrulle", WRAP),
  ("Halloumitallrik", 125, "Sallad, saltgurka, lök och tomat.", "halloumitallrik", WRAP),
  ("Halloumi i bröd", 105, "Hembakat bröd med sallad, saltgurka, lök och tomat.", "halloumi-i-brod", WRAP),
  ("Halloumirulle", 110, "Dürüm med sallad, saltgurka, lök och tomat.", "halloumirulle", WRAP),
  ("Halloumiburgare", 85, "Sallad, saltgurka, lök och tomat.", "halloumi", [SAUCE, DRINK])],
 "Sallader": [
  ("Ćevapisallad", 120, "Sallad, lök, gurka och tomat.", "cevapisallad", [SAUCE]),
  ("Kycklingsallad", 120, "Stekt kyckling, sallad, lök, gurka och tomat.", "kycklingsallad", [SAUCE]),
  ("Kebabsallad", 120, "Kebab, sallad, lök, gurka, tomat och fefferoni.", "kebabsallad", [SAUCE]),
  ("Grekisk sallad", 120, "Vitost, sallad, lök, gurka, tomat och oliver.", "grekisk-sallad", [SAUCE]),
  ("Tonfisksallad", 120, "Tonfisk, sallad, lök, gurka, tomat och fefferoni.", "tonfisksallad", [SAUCE]),
  ("Falafelsallad", 120, "Sallad, lök, saltgurka, tomat och fefferoni.", "falafelsallad", [SAUCE]),
  ("Halloumisallad", 120, "Sallad, lök, saltgurka, tomat och fefferoni.", "halloumisallad", [SAUCE])],
 "Fisk": [
  ("Fish & chips", 115, "Pommes frites, sallad och remouladsås.", "fish-chips", [DRINK]),
  ("Rödspätta", 129, "Pommes frites, sallad och remouladsås.", "rodspatta", [DRINK])],
 "Snacks": [
  ("Snacks box", 99, "3 mozzarella, 3 chili cheese, 2 hot wings, 3 chicken nuggets och 3 lökringar.", "snacks", None),
  ("Pommes", 40, "Liten eller stor.", "pommes", [FRIES]),
  ("Chili cheese", 80, "8 st.", "chili-cheese", None),
  ("Mozzarella", 80, "8 st.", "mozzarella", None),
  ("Lökringar", 49, "8 st.", "lokringar", None),
  ("Nuggets", 80, "8 st.", "nuggets", None),
  ("Hot wings", 89, "5 st.", "hot-wings", None)],
 "Dryck": [
  ("Läsk burk", 20, "", None, None),
  ("Läsk flaska", 29, "", None, None),
  ("Red Bull", 25, "", None, None),
  ("Ayran", 20, "", "ayran", None)],
}

# (namn, typ, obligatorisk, max, [(val, pris)])
GROUPS = [
 # Tavlan säger bara "valfri sås". Vilka såser som finns är inte känt: bekräfta med restaurangen.
 (SAUCE, "radio", True, None, [("Vitlökssås", 0), ("Mild sås", 0), ("Stark sås", 0), ("Ingen sås", 0)]),
 # Restaurangens kampanjbild: "Lägg till pommes och dricka till din Cevapcici eller Pljeskavica för endast 50 kr".
 (MENU_ADD, "checkbox", False, 1, [("Pommes och dricka", 50)]),
 # Tavlan, rubriken Extra.
 (EXTRA, "checkbox", False, 10, [("Extra kebab", 20), ("Extra kyckling", 20), ("Extra falafel 1 st", 8), ("Extra halloumi 1 st", 10)]),
 (DRINK, "checkbox", False, 10, [("Läsk burk", 20), ("Läsk flaska", 29), ("Red Bull", 25), ("Ayran", 20)]),
 # Pommes 40 liten och 55 stor.
 (FRIES, "radio", True, None, [("Liten", 0), ("Stor", 15)]),
 # Lunchskylten i restaurangen.
 (LUNCH, "radio", True, None, [("Ćevapi", 0), ("Pljeskavica", 0), ("Turkisk kebab", 0), ("Falafel", 0), ("Burgare", 0)]),
]

q = lambda s: json.dumps(s, ensure_ascii=False)
pic = lambda name: f"{IMG}/dishes/{name}.webp" if name else None
out = [
 "# Matmaster Balkan & Orient, Helsingborg: GENERERAD av build.py. Ändra där, inte här.",
 "# Meny för massimport (Admin → Meny → Massimport, eller POST /api/admin/menu/bulk-import). Priser i kronor.",
 "extraGroups:",
]
for name, kind, required, mx, options in GROUPS:
    out += [f"  - name: {q(name)}", f"    type: {kind}", f"    required: {'true' if required else 'false'}"]
    if mx:
        out.append(f"    max: {mx}")
    out.append("    options:")
    out += [f"      - {{ name: {q(o)}, price: {p} }}" for o, p in options]
out += ["", "categories:"]
products, groups, order = {}, {}, []
for cat, items in MENU.items():
    out += [f"  - name: {q(cat)}", "    products:"]
    for name, price, text, img, extras in items:
        out += [f"      - name: {q(name)}", f"        description: {q(text)}", f"        price: {price}"]
        if extras:
            out.append(f"        extras: {q(extras)}")
            groups[name] = extras
        if img:
            products[name] = pic(img)
        order.append(name)
(HERE / "menu.yaml").write_text("\n".join(out) + "\n")

CATEGORY_IMAGES = {"Dagens lunch": "cevapi", "Balkan": "pljeskavica", "Turkisk kebab": "kebabrulle", "Burgare": "smash",
                   "Falafel och halloumi": "falafel", "Sallader": "grekisk-sallad",
                   "Fisk": "fish-chips", "Snacks": "snacks", "Dryck": "ayran"}
(HERE / "data.json").write_text(json.dumps({
 "_kommentar": "GENERERAD av build.py. Läses av docs/restaurants/apply-menu.mjs.",
 "sizePrefix": "storlek-matmaster", "sizeGroups": [], "productGroups": groups,
 "categoryOrder": list(MENU), "productOrder": order,
 "images": {
  "logo": f"{IMG}/logo-square.png", "hero": f"{IMG}/hero.webp",
  "categories": {c: pic(i) for c, i in CATEGORY_IMAGES.items()}, "products": products,
 }}, ensure_ascii=False, indent=1) + "\n")

weekday = {"closed": False, "shifts": [{"open": "11:00", "close": "19:00"}]}
weekend = {"closed": False, "shifts": [{"open": "12:00", "close": "18:00"}]}
(HERE / "restaurant.json").write_text(json.dumps({
 "_kommentar": "Body till POST /api/restaurants. Utkast och bara avhämtning tills restaurangen sagt ja. Öppettiderna är antagna, se README.md.",
 "name": "Matmaster Balkan & Orient", "slug": "matmaster-balkan-orient-helsingborg", "cuisine": "Balkan · Kebab · Burgare",
 "address": "Ekslingan 8", "city": "Helsingborg", "phone": "072-251 22 57", "latitude": 56.0907, "longitude": 12.7485,
 "etaMinutes": 20, "vatPercent": 6, "rating": 0, "ratingCount": 0, "pickupOnly": True, "draft": True,
 "openingHours": {**{d: weekday for d in ["monday", "tuesday", "wednesday", "thursday", "friday"]},
                  **{d: weekend for d in ["saturday", "sunday"]}},
}, ensure_ascii=False, indent=1) + "\n")
print(f"{len(order)} rätter i {len(MENU)} kategorier, {len(GROUPS)} tillvalsgrupper")
