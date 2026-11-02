# Bygger menu.yaml, data.json och restaurant.json för Eld & Vin, Heimdallgatan 33, Ängelholm.
# Källa: foodora.se/restaurant/t687, avläst 2026-11-02. Rätter och priser exakt som på foodora, utom stavfel.
# Beskrivningar från eldochvin.se där foodoras är autogenererade.
# ANTAGET: foodora visar inte tillval när restaurangen är stängd. Storlekar och tillval är Palmyras upplägg,
# utom gram på kött och burgare, som kommer från eldochvin.se. Bekräfta med restaurangen.
import json, shutil
from pathlib import Path

HERE = Path(__file__).parent
BASE = "/demo/eld-och-vin"
PUBLIC = HERE.parents[2] / "apps/web/public" / BASE.lstrip("/") / "img"
FREDS = Path.home() / "viaeats/apps/web/public/demo/freds-pizzeria/img"
SAUCE = "Välj sås (ingår)"
PIZZA = ["size:pizza", "Extra pålägg", "Sås i burk", "Lägg till tillbehör", "Lägg till dryck"]
SIDE = [SAUCE, "Sås i burk", "Lägg till dryck"]
PLAIN = ["Sås i burk", "Lägg till dryck"]

# (namn, pris, beskrivning, bild, tillval). Bilder utan "/" är nya, övriga kommer från Freds.
def pizza(name, price, text, img): return (name, price, text, img, PIZZA)
MENU = {
 "Förrätter": [
  ("Buffalo wings", 99, "Krispiga kycklingvingar med kryddig buffalosås.", "buffalo-wings", None),
  ("Vitlöksbröd", 79, "", "f/vitloksbrod", None),
  ("Snacks", 79, "", "snacks", None)],
 "Pizzor": [
  pizza("Oxen", 145, "Oxfilé, tryffelkräm, karamelliserad lök, champinjoner, ruccola, grana padano, nymald svartpeppar.", "oxen"),
  pizza("Skinkan", 145, "Cocktailmozzarella, lufttorkad skinka, vitlökssalami, crema di balsamico, ruccola, grana padano.", "skinkan"),
  pizza("Sötis", 129, "Grana padano, skinka, bacon, honung, ruccola.", "sotis"),
  pizza("Chevre", 149, "Chevré och färska grönsaker.", "chevre"),
  pizza("Margherita", 110, "Ost och tomatsås.", "f/margherita"),
  pizza("Al Funghi", 110, "Tomatsås, ost och champinjoner.", "f/al-funghi"),
  pizza("Hawaii", 120, "Tomatsås, ost, ananas och skinka.", "f/hawaii"),
  pizza("Vesuvio", 110, "Tomatsås, ost och skinka.", "f/vesuvio"),
  pizza("Capricciosa", 120, "Tomatsås, champinjoner, skinka och ost.", "f/capricciosa"),
  pizza("Bolognese", 120, "Köttfärs, tomatsås, ost och rödlök.", "f/bolognese"),
  pizza("Calzone", 120, "Skinka och ost, inbakad.", "f/calzone"),
  pizza("Carpaccio", 139, "Oxfilé, ruccola, grana padano och tryffelkräm.", "carpaccio"),
  pizza("Matilda", 139, "Färska grönsaker och smält ost.", "matilda"),
  pizza("Florens", 159, "Oxfilé, rödlök, champinjoner, färsk vitlök och bearnaise.", "f/oxfile-special"),
  pizza("Bussola", 120, "Skinka, tomatsås, ost och räkor.", "f/monaco"),
  pizza("Bananen", 120, "Tomatsås, ost, banan, skinka och jordnötter.", "f/banana"),
  pizza("La Lambada", 110, "Tomatsås, ost, banan, curry och jordnötter.", "f/exotica"),
  pizza("Mexicana", 120, "Köttfärs, paprika, lök, cayennepeppar, jalapeño och vitlökssås.", "f/mexicana"),
  pizza("Tonfisken", 120, "Tonfisk, majs och gul lök.", "f/al-tonno"),
  pizza("Venedig", 125, "Tonfisk och räkor.", "f/pescatore"),
  pizza("Bari", 125, "Tomatsås, ost, bacon, skinka och ägg.", "f/amigo"),
  pizza("Torino", 125, "Skinka, räkor och champinjoner.", "f/torino"),
  pizza("Amigo", 125, "Bacon, köttfärs och lök.", "f/mama-mia"),
  pizza("Jägaren", 139, "Bacon, salami, skinka, köttfärs, champinjoner, lök, paprika och tabasco.", "f/new-york"),
  pizza("Provence", 139, "Oxfilé, champinjoner, rödlök, bacon och bearnaise.", "f/sverige-special"),
  pizza("Palermo", 139, "Oxfilé, gorgonzola, champinjoner, lök och bearnaise.", "f/gorgonzola"),
  pizza("Mazlum Special", 130, "Tomatsås, ost, skinka, gyros och bacon.", "f/kebab-special"),
  pizza("Quattro Stagioni", 135, "Tomat, ost, skinka, svamp, räkor, musslor och kronärtskocka.", "f/quattro-stagioni")],
 "Kebabpizzor": [
  pizza("Baresi", 130, "Gyros, rödlök och valfri sås.", "f/notkebabpizza"),
  pizza("BBQ-Kebaben", 139, "Gyros, BBQ-sås, jalapeño, bacon, picklad rödlök och valfri sås.", "bbq-kebaben"),
  pizza("Romana", 130, "Gyros, skinka, feferoni och valfri sås.", "f/domino"),
  pizza("Montella", 130, "Gyros, färska grönsaker och valfri sås.", "f/dana-pizza"),
  pizza("Super Kebab", 139, "Gyros, rödlök, pommes och valfri sås.", "super-kebab")],
 "Kycklingpizzor": [
  pizza("Hönan", 125, "Kyckling, rödlök, champinjoner och valfri sås.", "f/kycklingpizza"),
  pizza("Tuppen", 135, "Kyckling, pesto, färsk vitlök, sherrytomater, ruccola och grana padano.", "tuppen"),
  pizza("Chicken", 135, "Kyckling, bacon, BBQ-sås, picklad rödlök och valfri sås.", "chicken")],
 "Havets pizzor": [
  pizza("Havet", 159, "Scampi, räkor, färsk vitlök, provencalska kryddor, kronärtskocka och sherrytomater.", "f/havet"),
  pizza("Oceanen", 159, "Scampi, pesto, tryffelkräm, sherrytomater och cocktailmozzarella.", "oceanen"),
  pizza("Räkor & Rom", 159, "Räkor, krämig sås och rom.", "rakor-rom"),
  pizza("Skagerrak", 139, "Grönmusslor, räkor, färsk vitlök, sherrytomater och ruccola.", "skagerrak"),
  pizza("Atlanten", 139, "Räkor, rödlök, champinjoner, grana padano och ruccola.", "atlanten")],
 "Vegetariska pizzor": [
  pizza("Eld & Vin Special", 125, "Sherrytomater, cocktailmozzarella, kalamataoliver och färsk vitlök.", "eldvin-special"),
  pizza("Di Bufala", 130, "Cocktailmozzarella, ruccola, sherrytomater, crema di balsamico, flingsalt och pesto.", "di-bufala"),
  pizza("Ängen", 139, "Grana padano, champinjoner, kalamataoliver, sherrytomater, picklad rödlök och ruccola.", "angen"),
  pizza("Ostis", 129, "Gorgonzola, grana padano, rödlök, champinjoner och ruccola.", "ostis"),
  pizza("Vegetariana", 125, "Paprika, lök, champinjoner, kronärtskocka och oliver.", "f/vegetariana")],
 "Pasta": [
  ("Krämig kycklingpasta", 179, "Majskycklingfilé från Munka-Ljungby, paprika, lök, champinjoner, vitlök, tomatsås, grädde och grana padano.", "kycklingpasta", PLAIN),
  ("Carbonara", 159, "Bacon, grädde, lök, svartpeppar och grana padano.", "carbonara", PLAIN),
  ("Vegetarisk pasta", 149, "Tomatsås, paprika, lök, vitlök, champinjoner, cocktailmozzarella och grana padano.", "vegopasta", PLAIN),
  ("Oxfilépasta", 199, "Oxfilé, lök, svamp, gorgonzola, parmesan och paprika.", "oxfilepasta", PLAIN),
  ("Skaldjurspasta", 199, "Svamp, räkor, scampi och vitlök.", "skaldjurspasta", PLAIN)],
 "Från kolgrillen": [
  ("Hängmörad ryggbiff", 299, "Kolgrillad, serveras med kappa, hemslagen bearnaise och rödvinssås.", "ryggbiff", ["size:kott80", "Lägg till dryck"]),
  ("BBQ-glaserad karré", 219, "Kolgrillad karré med Eld & Vins BBQ-glaze.", "karre", ["size:kott50", "Lägg till dryck"]),
  ("Baby back ribs", 219, "Med Eld & Vins BBQ-glaze.", "ribs", ["Lägg till dryck"]),
  ("Grillad kycklingfilé", 219, "Majskycklingfilé från Munka-Ljungby.", "kycklingfile", ["Lägg till dryck"]),
  ("Black & White", 269, "Grillad ryggbiff och karré med hemslagen bearnaise och rödvinssås.", "black-white", ["Lägg till dryck"]),
  ("Surf n Turf", 369, "Grillad ryggbiff och argentinska rödräkor med bearnaise och citronaioli.", "surf-turf", ["Lägg till dryck"]),
  ("Mixgrill", 319, "Blandat från grillen.", "mixgrill", ["Lägg till dryck"]),
  ("Grillad lax", 259, "ASC-märkt lax med kallrörd dill- och limesås.", "lax", ["Lägg till dryck"]),
  ("Fish n Chips", 199, "Panerad ASC-märkt torskfilé med citronaioli.", "fish-chips", ["Lägg till dryck"])],
 "Kebab & sallad": [
  ("Kebabtallrik", 125, "Gyros, pommes, sallad, tomat, gurka, lök, feferoni och valfri sås.", "f/kebabtallrik", SIDE),
  ("Kebabsallad", 125, "Kebabkött, sallad, gurka, tomat, lök, feferoni, hembakat bröd och valfri sås.", "f/kebabsallad", SIDE),
  ("Caesarsallad", 159, "Kyckling från Munka-Ljungby, bacon, grana padano, caesardressing, sallad, gurka, tomat, lök och hembakat bröd.", "caesar", PLAIN),
  ("Grekisk sallad", 140, "Sallad, tomat, gurka, lök, vit ost, oliver, hembakat bröd och valfri sås.", "f/grekisk-sallad", SIDE),
  ("Kebab i pitabröd", 125, "Gyros, sallad, lök, tomat, gurka, feferoni och valfri sås.", "pita", SIDE),
  ("Kebabrulle", 125, "Gyros, sallad, tomat, gurka, lök, feferoni och valfri sås.", "f/kebabrulle", SIDE),
  ("Räksallad", 159, "Räkor, sallad, tomat, gurka, lök, hembakat bröd och valfri sås.", "f/raksallad", SIDE)],
 "Hamburgare": [
  ("Americano", 119, "Chilimayo, bostongurka, cheddar, bacon, sallad, rödlök, tomat och pommes.", "americano", ["size:burgare", "Lägg till dryck"]),
  ("Texas", 119, "BBQ-sås, mayo, cheddar, bacon, sallad, rödlök, tomat och pommes.", "texas", ["size:burgare", "Lägg till dryck"]),
  ("Eld & Vin burgare", 119, "Mayo, sötstark senap, karamelliserad lök, cheddar, sallad, tomat och pommes.", "eldvin-burgare", ["size:burgare", "Lägg till dryck"]),
  ("Baconlover", 119, "BBQ-sås, mayo, rödlök, cheddar, dubbel bacon och pommes.", "baconlover", ["size:burgare", "Lägg till dryck"]),
  ("Halloumi", 149, "Hamburgerdressing, mangochutney, sallad, rödlök, tomat och pommes.", "halloumi", ["Lägg till dryck"])],
 "Barnmeny": [
  ("Barn Vesuvio", 99, "", "f/vesuvio", ["Lägg till dryck"]),
  ("Barn Bolognese", 99, "", "f/bolognese", ["Lägg till dryck"]),
  ("Barn Burgare", 99, "", "barnburgare", ["Lägg till dryck"]),
  ("Barn Hawaii", 99, "", "f/hawaii", ["Lägg till dryck"])],
 "Drycker": [
  ("Pepsi 33 cl", 30, "", "d/pepsi-33", None),
  ("Pepsi Max 33 cl", 30, "", "d/pepsi-max-33", None),
  ("Zingo 33 cl", 30, "", None, None),
  ("7UP 33 cl", 30, "", None, None),
  ("Loka Naturell 33 cl", 30, "", None, None)],
}
GROUPS = [
 (SAUCE, "radio", True, None, [("Mild sås",0,"sas-kebab-mild"),("Stark sås",0,"sas-kebab-stark"),("Blandad sås",0,"sas-kebab-blandad"),("Vitlökssås",0,"sas-vitlok"),("Bearnaisesås",0,"sas-bearnaise"),("Ingen sås",0,"sas-ingen")]),
 ("Sås i burk", "checkbox", False, 5, [("Bearnaisesås i burk",15,"sas-bearnaise"),("Mild sås i burk",15,"sas-kebab-mild"),("Stark sås i burk",15,"sas-kebab-stark"),("Vitlökssås i burk",15,"sas-vitlok")]),
 ("Lägg till tillbehör", "checkbox", False, 6, [("Pommes frites",40,"pommes-mellan"),("Vitlöksbröd",50,"vitloksbrod"),("Lökringar",50,"lokringar"),("Mozzarellasticks",50,"mozzarellasticks")]),
 ("Lägg till dryck", "checkbox", False, 10, [("Pepsi 33 cl",30,"d/pepsi-33"),("Pepsi Max 33 cl",30,"d/pepsi-max-33")]),
 ("Extra pålägg", "checkbox", False, 10, [(n,p,None) for n,p in [("Ananas",15),("Bacon",15),("Banan",15),("Champinjoner",15),("Feferoni",15),("Färsk vitlök",15),("Jalapeño",15),("Kebabkött",25),("Kyckling",25),("Köttfärs",15),("Lök",15),("Oliver",15),("Oxfilé",35),("Paprika",15),("Räkor",25),("Salami",15),("Skinka",15),("Tonfisk",15),("Extra ost",15)]]),
]
SIZES = {
 "size:pizza": ("eldvin-pizza", "Normal", [("Normal",0,"storlek-normal"),("Familj",110,"storlek-familj")]),
 "size:kott80": ("eldvin-kott80", "200 g", [("200 g",0,None),("300 g",80,None)]),
 "size:kott50": ("eldvin-kott50", "200 g", [("200 g",0,None),("300 g",50,None)]),
 "size:burgare": ("eldvin-burgare", "110 g", [("110 g",0,None),("220 g",70,None)]),
}

def q(s): return '"' + s.replace('"', '\\"') + '"'
def picture(ref):
    """Kopierar bilden till demomappen och svarar med dess webbadress."""
    if not ref: return None
    if ref.startswith("f/"): src, name = FREDS / f"dishes/{ref[2:]}.webp", f"dishes/{ref[2:]}.webp"
    elif ref.startswith("d/"): src, name = FREDS / f"drinks/{ref[2:]}.webp", f"drinks/{ref[2:]}.webp"
    elif ref.startswith("t/"): src, name = FREDS / f"tiles/{ref[2:]}.webp", f"tiles/{ref[2:]}.webp"
    else: src, name = None, f"dishes/{ref}.webp"
    if src:
        (PUBLIC / name).parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, PUBLIC / name)
    return f"{BASE}/img/{name}"

y = ["# Eld & Vin, Heimdallgatan 33, Ängelholm: GENERERAD av build.py. Källa foodora, avläst 2026-11-02.", "extraGroups:"]
for name, typ, req, mx, opts in GROUPS:
    y += [f"  - name: {q(name)}", f"    type: {typ}", f"    required: {'true' if req else 'false'}"] + ([f"    max: {mx}"] if mx else []) + ["    options:"]
    y += [f"      - {{ name: {q(n)}, price: {p} }}" for n, p, _ in opts]
y.append("\ncategories:")
data = {"_kommentar": "GENERERAD av build.py. Läses av docs/restaurants/apply-menu.mjs.", "sizePrefix": "storlek-eldvin",
        "sizeGroups": [], "productGroups": {}, "categoryOrder": list(MENU), "productOrder": [],
        "images": {"logo": f"{BASE}/img/logo-square.png", "hero": f"{BASE}/img/hero.webp", "categories": {}, "products": {}, "extras": {}}}
for key, (suffix, default, opts) in SIZES.items():
    data["sizeGroups"].append({"key": key, "description": f"storlek-{suffix}", "default": default,
                               "extras": [[n, p, picture(f"t/{i}") if i else None] for n, p, i in opts]})
for name, _, _, _, opts in GROUPS:
    if all(i for _, _, i in opts):
        data["images"]["extras"][name] = {n: picture(i if "/" in i else f"t/{i}") for n, _, i in opts}
for cat, items in MENU.items():
    y += [f"  - name: {q(cat)}", "    products:"]
    data["images"]["categories"][cat] = picture(items[0][3])
    for n, p, d, img, ex in items:
        plain = [g for g in (ex or []) if not g.startswith("size:")]
        y += [f"      - name: {q(n)}", f"        description: {q(d)}", f"        price: {p}"]
        if plain: y.append("        extras: [" + ", ".join(q(g) for g in plain) + "]")
        data["productOrder"].append(n)
        if img: data["images"]["products"][n] = picture(img)
        if ex: data["productGroups"][n] = ex
(HERE / "menu.yaml").write_text("\n".join(y) + "\n")
(HERE / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))
hours = lambda o, c: {"closed": False, "shifts": [{"open": o, "close": c}]}
(HERE / "restaurant.json").write_text(json.dumps({
 "_kommentar": "Body till POST /api/restaurants. Källa: eldochvin.se och foodora, 2026-11-02. pickupOnly eftersom viaeats inte kör bud. rating 0, så foodoras betyg följer inte med.",
 "name": "Eld & Vin", "slug": "eld-och-vin-angelholm", "cuisine": "Grill · Pizza · Pasta", "address": "Heimdallgatan 33", "city": "Ängelholm",
 "latitude": 56.2515, "longitude": 12.8887, "etaMinutes": 25, "vatPercent": 6, "rating": 0, "ratingCount": 0, "pickupOnly": True, "draft": True, "phone": "0431-10420",
 "openingHours": {**{d: hours("11:00", "21:00") for d in ["monday", "tuesday", "wednesday", "thursday", "friday"]}, "saturday": hours("12:00", "22:00"), "sunday": hours("12:00", "21:00")},
}, ensure_ascii=False, indent=1))
print(len(data["productOrder"]), "rätter,", len(MENU), "kategorier")
