# Bygger menu.yaml, data.json och restaurant.json för Kuben (Umeå). Menyn kommer från Kuben Väst på Stans Yabie-butik
# (yabie.online/kuben, avläst 2026-10-27). Mariedals och Tomtebos menyer visas bara när de är öppna, så samma meny
# antas gälla alla tre (bekräfta med Kuben). Tillval syns inte när butiken är stängd, så inga tillval är inlagda.
# Tre restauranger i viaeats, en per ställe, eftersom adress och tider skiljer sig. Kör: python3 -I build.py
import json, pathlib, shutil

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parents[2] / "apps/web/public/demo"
IMG = WEB / "kuben-umea/img"
BASE = "/demo/kuben-umea/img"
SITE = pathlib.Path.home() / "Website/kuben-site/website/public/img"

MENU = {
 "Pizza": [
  ("Margherita", 134, "San Marzano-tomater, fior di latte, toppad med basilika och grana padano"),
  ("Vesuvio", 134, "Tomatsås, fior di latte, prosciutto cotto"),
  ("Capricciosa", 134, "Tomatsås, fior di latte, prosciutto cotto, champinjoner"),
  ("Fungi", 134, "San Marzano-tomater, fior di latte, champinjoner, toppad med basilika och grana padano"),
  ("Pepperoni", 138, "San Marzano-tomater, fior di latte, pepperonikorv, toppad med honung, ricotta och basilika"),
  ("Ananas", 138, "Tomatsås, fior di latte, prosciutto cotto och ananas"),
  ("Bussola", 138, "Tomatsås, fior di latte, prosciutto cotto, toppad med handskalade räkor"),
  ("Kebab", 159, "Tomatsås, fior di latte, kebab, rödlök, feferoni, toppad med tomatmix och vitlökssås"),
  ("Carlzone", 159, "Tomatsås, fior di latte, prosciutto cotto, champinjoner, toppad med parmaskinka, västerbottensost, ruccola och olivolja"),
  ("Nduja", 148, "Tomatsås, fior di latte, salami, nduja, rödlök, chili, toppad med ruccola och olivolja"),
  ("Pesto", 159, "Pesto, fior di latte, toppad med ruccola, parmaskinka, tomatmix och västerbottensost (vit pizza)"),
  ("G.O.A.T", 159, "Vispad crème fraîche, chèvre, rödbetor, valnötter, honung, ruccola och fikonmarmelad"),
  ("Pera", 159, "Vispad crème fraîche, fior di latte, päron, chèvre, toppad med valnötter och honung"),
  ("Morsan", 159, "Tomatsås, fior di latte, kalamataoliver, toppad med parmaskinka, soltorkade tomater och västerbottensost"),
  ("Scampi", 159, "Tomatsås, fior di latte, scampi, chèvre, vitlök, chili, toppad med ruccola"),
  ("T.B.M", 159, "Tomatsås, fior di latte, vitlök, toppad med ruccola, buffelmozzarella, tomater, basilika och västerbottensost"),
  ("Manzo", 169, "Tomatsås, fior di latte, oxfilé, rödlök, champinjoner, vitlök, toppad med ruccola, chili, bearnaise och tomater"),
  ("Gamberetti", 149, "Tomatsås, fior di latte, vitlök, toppad med handskalade räkor"),
  ("Maggan", 159, "Tomatsås, toppad med buffelmozzarella, burrata, olivolja och basilika"),
  ("Burrata e Parma", 169, "Tomatsås, fior di latte, toppad med parmaskinka, soltorkade tomater och burrata"),
  ("Burrata e Tryffelsalami", 169, "Tomatsås, fior di latte, toppad med tryffelsalami, pinjenötter och burrata"),
 ],
 "Burgare": [
  ("Cheeseburgare", 139, "110 g svenskt nötkött, briochebröd, majonnäs, ketchup, cheddarost, isad silverlök och dillpicklad gurka"),
  ("Kuben", 139, "110 g svenskt kött, briochebröd, originaldressing, sallad och rödlök"),
  ("Kaptenen", 139, "110 g svenskt nötkött, briochebröd, smashed onion, cheddarost, chipotlemajo, sallad, tomat och bacon"),
  ("Tryffeln", 139, "110 g svenskt nötkött, briochebröd, cheddarost, tryffelmajonnäs, isbergssallad, tomat, rostad lök och picklad rödlök"),
  ("Chilicheeseburgare", 139, "110 g svenskt nötkött, briochebröd, majo, sallad, smashad chilicheese, jalapeñomajo och färska jalapeños (stark)"),
  ("Pepperjack Reaper", 139, "110 g svenskt nötkött, briochebröd, jalapeñomajo, sallad, pepperjackost, cheddarost och skivad paprika"),
  ("Honey Sriracha", 139, "110 g svenskt nötkött, briochebröd, rödlök, cheddarost, pepperjackost, honung och srirachamajo"),
  ("Falafel- eller halloumiburgare", 139, "Välj halloumi eller falafel, briochebröd, majo, sallad, tomat, picklad rödlök och srirachamajo"),
  ("Pommestallrik", 65, "Med chipotlemajo"),
 ],
 "Grill": [
  ("Kebabtallriken", 139, "Spettgrillad kalvbringa, isbergssallad, rödkålssallad, tomat, pommes och sauce blanche"),
  ("Kebabrullen", 139, "Kebab i bröd med mixad sallad och sauce blanche"),
  ("Kebab Bowl", 139, "Spettgrillad döner, isbergssallad, rödkålssallad, silverlök, rostad lök, picklad gurka, feferoni, sauce blanche och srirachamajo"),
  ("Vegobowl", 139, "Halloumi, falafel, isbergssallad, rödkålssallad, isad silverlök, rostad lök, feferoni, picklad gurka, sauce blanche och srirachamajo"),
  ("Veganrullen", 139, "Falafel i stenugnsbakat tunt lavashbröd, mixad sallad, picklad gurka, harissa och hemmagjord tahini"),
  ("Vegotallriken", 139, "Halloumi, falafel, rödkålssallad, isbergssallad, tomat, pommes och sauce blanche"),
 ],
 "Barnmeny": [
  ("Barnburgare", 99, "80 g svenskt nötkött, briochebröd, ketchup och cheddarost"),
  ("Barn Margherita", 99, "Tomatsås och fior di latte (mozzarella)"),
  ("Barn Vesuvio", 99, "Tomatsås, fior di latte och prosciutto cotto (kokt skinka)"),
  ("Barn Ananas", 99, "Tomatsås, fior di latte, prosciutto cotto och ananas"),
  ("Barn Capricciosa", 99, "Tomatsås, fior di latte, prosciutto cotto och champinjoner"),
 ],
}
GEN = json.loads((HERE / "gen.json").read_text())["products"] if (HERE / "gen.json").exists() else {}
PHOTOS = {"Pepperoni": "pizza.webp"}   # deras eget foto av pepperonipizzan med ricotta, honung och basilika

def copy(src, dst):
    out = IMG / dst
    out.parent.mkdir(parents=True, exist_ok=True)
    if not out.exists(): shutil.copy(src, out)
    return f"{BASE}/{dst}"

def q(s): return '"' + s.replace('"', '\\"') + '"'
y = ["# Kuben (Umeå): meny för massimport, samma för alla tre ställen. GENERERAD av build.py ur yabie.online/kuben (2026-10-27).", "categories:"]
data = {"_kommentar": "GENERERAD av build.py. Läses av docs/restaurants/apply-menu.mjs.", "sizeGroups": [], "productGroups": {},
        "categoryOrder": list(MENU), "productOrder": [],
        "images": {"logo": copy(SITE / "icon-512.png", "logo-square.png"), "hero": copy(SITE / "vast.webp", "hero-vast.webp"),
                   "categories": {"Pizza": copy(SITE / "pizza.webp", "dishes/pizza.webp"), "Burgare": copy(SITE / "smash.webp", "dishes/smash.webp")},
                   "products": {}, "extras": {}}}
for cat, items in MENU.items():
    y += [f"  - name: {q(cat)}", "    products:"]
    for name, price, desc in items:
        y += [f"      - name: {q(name)}", f"        description: {q(desc)}", f"        price: {price}"]
        data["productOrder"].append(name)
        if name in PHOTOS: data["images"]["products"][name] = copy(SITE / PHOTOS[name], f"dishes/{PHOTOS[name]}")
        # Genererade studiofoton (gen.json) går före: svart tallrik på svart sten mot Kuben-gul vägg
        g = GEN.get(name)
        if g and (IMG / f"gen/{g}.webp").exists(): data["images"]["products"][name] = f"{BASE}/gen/{g}.webp"
    first = next((data["images"]["products"][n] for n, _, _ in items if n in data["images"]["products"]), None)
    if first: data["images"]["categories"][cat] = first
(HERE / "menu.yaml").write_text("\n".join(y) + "\n")
(HERE / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))

def week(rows):
    keys = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    return {k: ({"open": r[0], "close": r[1], "closed": False} if r else {"open": "11:00", "close": "20:00", "closed": True}) for k, r in zip(keys, rows)}
# viaeats har ett intervall per dag. Väst på Stan har lunchstängt 14–16 tis–tor och lör; det går inte att lägga in än.
SPOTS = [
 ("Kuben Väst på Stan", "kuben-vast-pa-stan", "Kungsgatan 22", 63.8279857, 20.2509455, "vast.webp",
  [None, ("11:00", "20:00"), ("11:00", "20:00"), ("11:00", "20:00"), ("11:00", "20:30"), ("12:00", "20:30"), ("12:00", "20:30")]),
 ("Kuben Mariedal", "kuben-mariedal", "Björnvägen 7", 63.8482428, 20.3052024, "mariedal.webp",
  [None, ("11:00", "20:00"), ("11:00", "20:00"), ("11:00", "20:00"), ("11:00", "20:30"), ("12:00", "20:30"), ("12:00", "20:30")]),
 ("Kuben Tomtebo", "kuben-tomtebo", "Kålhagsvägen 16", 63.8078408, 20.3636381, "tomtebo.webp",
  [None, ("16:00", "20:00"), ("16:00", "20:00"), ("16:00", "20:00"), ("16:00", "20:30"), ("12:00", "20:30"), ("12:00", "20:30")]),
]
restaurants = []
for name, slug, addr, lat, lng, hero, rows in SPOTS:
    restaurants.append({
        "_kommentar": "Källa: kubenumea.se och Google, 2026-10-27. Koordinater från viaeats adressökning. Endast avhämtning. Publiceras direkt när den läggs upp på riktigt.",
        "_hero": copy(SITE / hero, f"hero-{slug}.webp"),
        "name": name, "slug": slug, "cuisine": "Pizza · Smashburgare · Grill", "address": addr, "city": "Umeå",
        "latitude": lat, "longitude": lng, "etaMinutes": 15, "vatPercent": 6, "rating": 0, "ratingCount": 0,
        "pickupOnly": True, "draft": True, "openingHours": week(rows),
    })
(HERE / "restaurant.json").write_text(json.dumps(restaurants, ensure_ascii=False, indent=2))
print(f"{len(MENU)} kategorier, {len(data['productOrder'])} rätter, {len(restaurants)} ställen")
