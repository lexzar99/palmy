# Bygger menu.yaml, data.json och restaurant.json för Ramis Grill i Växjö.
# TILLFÄLLIGT: Ramis har nyss startat och har ingen publicerad meny. Rätter, priser och öppettider är testdata
# för att visa systemet. Adress saknas med flit: bolagets adress kan vara en bostad. Byt allt när riktig meny finns.
import json
from pathlib import Path

HERE = Path(__file__).parent
F = "/demo/freds-pizzeria/img"
OWN = "/demo/ramis-grill/img"
SAUCE, DRINK = "Välj sås (ingår)", "Lägg till dryck"
EX = [SAUCE, DRINK]
MENU = {
 "Rullar": [
  ("Kebabrulle", 119, "Kebabkött, sallad, tomat, lök och valfri sås i tunnbröd.", "kebabrulle", EX),
  ("Kycklingrulle", 119, "Kyckling, sallad, tomat, lök och valfri sås i tunnbröd.", "kycklingrulle", EX),
  ("Falafelrulle", 109, "Falafel, sallad, tomat, lök och valfri sås i tunnbröd.", "falafelrulle", EX),
  ("Mixrulle", 129, "Kebab och kyckling, sallad, tomat, lök och valfri sås.", "mix-kebabrulle", EX)],
 "Tallrikar": [
  ("Kebabtallrik", 139, "Kebabkött med pommes, sallad och valfri sås.", "kebabtallrik", EX),
  ("Kycklingtallrik", 139, "Kyckling med pommes, sallad och valfri sås.", "kycklingtallrik", EX),
  ("Falafeltallrik", 129, "Falafel med pommes, sallad och valfri sås.", "falafeltallrik", EX)],
 "Pitabröd": [
  ("Kebab i pitabröd", 109, "Kebabkött, sallad, tomat, lök och valfri sås.", "kebab-pitabrod", EX),
  ("Kyckling i pitabröd", 109, "Kyckling, sallad, tomat, lök och valfri sås.", "kyckling-pitabrod", EX)],
 "Burgare": [
  ("Ramis burgare", 119, "Hamburgare med pommes, sallad, tomat och dressing.", "hamburgertallrik", [DRINK]),
  ("Kycklingburgare", 125, "Kycklingburgare med pommes, sallad och dressing.", "kycklingburgertallrik", [DRINK])],
 "Tillbehör": [
  ("Pommes", 39, "", "pommes-mellan", None),
  ("Lökringar", 49, "", "lokringar", None),
  ("Mozzarellasticks", 49, "", "mozzarellasticks", None)],
 "Drycker": [
  ("Coca-Cola 33 cl", 25, "", "d/coca-cola-33", None),
  ("Coca-Cola Zero 33 cl", 25, "", "d/cola-zero-33", None),
  ("Fanta 33 cl", 25, "", "d/fanta-orange-33", None),
  ("Sprite 33 cl", 25, "", "d/sprite-33", None)],
}
pic = lambda n: f"{F}/drinks/{n[2:]}.webp" if n.startswith("d/") else f"{F}/dishes/{n}.webp"
q = lambda s: json.dumps(s, ensure_ascii=False)
out = [
 "# Ramis Grill, Växjö: GENERERAD av build.py. TESTMENY, inte restaurangens riktiga.",
 "extraGroups:",
 f"  - name: {q(SAUCE)}", "    type: radio", "    required: true", "    options:",
]
SAUCES = [("Mild sås", "sas-kebab-mild"), ("Stark sås", "sas-kebab-stark"), ("Blandad sås", "sas-kebab-blandad"), ("Vitlökssås", "sas-vitlok"), ("Ingen sås", "sas-ingen")]
out += [f"      - {{ name: {q(n)}, price: 0 }}" for n, _ in SAUCES]
DRINKS = [("Coca-Cola 33 cl", "coca-cola-33"), ("Coca-Cola Zero 33 cl", "cola-zero-33"), ("Fanta 33 cl", "fanta-orange-33"), ("Sprite 33 cl", "sprite-33")]
out += [f"  - name: {q(DRINK)}", "    type: checkbox", "    required: false", "    max: 10", "    options:"]
out += [f"      - {{ name: {q('Extra ' + n)}, price: 25 }}" for n, _ in DRINKS]
out += ["", "categories:"]
products, groups, order = {}, {}, []
for cat, items in MENU.items():
    out += [f"  - name: {q(cat)}", "    products:"]
    for name, price, text, img, extras in items:
        out += [f"      - name: {q(name)}", f"        description: {q(text)}", f"        price: {price}"]
        if extras:
            out.append(f"        extras: {q(extras)}")
            groups[name] = extras
        products[name] = pic(img)
        order.append(name)
(HERE / "menu.yaml").write_text("\n".join(out) + "\n")
(HERE / "data.json").write_text(json.dumps({
 "_kommentar": "GENERERAD av build.py. Läses av docs/restaurants/apply-menu.mjs.",
 "sizePrefix": "storlek-ramis", "sizeGroups": [], "productGroups": groups,
 "categoryOrder": list(MENU), "productOrder": order,
 "images": {
  "logo": f"{OWN}/logo-square.png", "hero": f"{OWN}/hero.webp",
  "categories": {c: pic(i[0][3]) for c, i in MENU.items()}, "products": products,
  "extras": {SAUCE: {n: f"{F}/dishes/{p}.webp" for n, p in SAUCES},
             DRINK: {"Extra " + n: f"{F}/drinks/{p}.webp" for n, p in DRINKS}},
 }}, ensure_ascii=False, indent=1))
day = {"closed": False, "shifts": [{"open": "11:00", "close": "21:00"}]}
(HERE / "restaurant.json").write_text(json.dumps({
 "_kommentar": "Body till POST /api/restaurants. Testdata, se build.py. pickupOnly eftersom viaeats inte kör bud.",
 "name": "Ramis Grill", "slug": "ramis-grill-vaxjo", "cuisine": "Gatukök · Kebab · Burgare",
 "address": "Växjö", "city": "Växjö", "latitude": 56.8777, "longitude": 14.8091,
 "etaMinutes": 20, "vatPercent": 6, "rating": 0, "ratingCount": 0, "pickupOnly": True, "draft": True,
 "openingHours": {d: day for d in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]},
}, ensure_ascii=False, indent=1))
