# Bygger menu.yaml, data.json och restaurant.json för Pattaya Bar & Restaurang (Tallkrogen) ur deras meny på
# pattayabar.se/Meny.html (avläst 2026-10-27). Priser, nummer och styrka exakt som där. Barens drycker (öl, vin, drinkar)
# finns inte med: alkohol säljs inte för avhämtning. Bilder: genererade studiofoton i samma stil (gen.json), annars
# deras egna foton där rätten är den som syns.
# Kör: python3 -I build.py
import json, pathlib, shutil

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parents[2] / "apps/web/public/demo"
IMG = WEB / "pattaya-bar-tallkrogen/img"
BASE = "/demo/pattaya-bar-tallkrogen/img"
SITE = pathlib.Path.home() / "Website/pattaya-site/website/public/img"

MENU = {
 "Smått": [
  (1, "Salat", 70, "Gurk- och tomatsallad med chili, vitlök och färsk koriander (mycket stark)"),
  (2, "Pa Peiya", 70, "Hemgjorda vegetariska vårrullar. Serveras med sweet chili"),
  (3, "Tom Ka Gai", 89, "Kycklingsoppa i kokosmjölk med citrongräs, galanga, limeblad och färsk koriander (mild)"),
  (4, "Tom Yam Goong", 99, "Scampisoppa med citrongräs, galanga, limeblad och färsk koriander (mycket stark)"),
  (5, "Koong Tord", 99, "Friterade scampi. Serveras med vitlöksaioli och sweet chili"),
  (6, "Koong Yang", 99, "Grillade scampi och grönsaker. Serveras med vitlöksaioli och yamsås"),
  (7, "Friterade kycklingdumplings", 70, "Serveras med dumplingsoja"),
  (8, "Yang Natmok", 99, "Stekt biffsallad med lime, koriander, mynta, rödlök och chili (stark)"),
  (9, "Som Tam", 99, "Papayasallad med scampi, lime och jordnötter (mycket stark)"),
 ],
 "Fågel": [
  (20, "Gaeng Khew Wan Gai", 160, "Kyckling i kokosmjölk med grön curry och bambuskott (stark)"),
  (21, "Gaeng Ped Gai", 160, "Kyckling i kokosmjölk med röd curry, grönsaker och thaibasilika (lite stark)"),
  (22, "Pad Medd Mamoeng", 160, "Wokad kyckling med cashewnötter och grönsaker (lite stark)"),
  (23, "Pad Thai Gai", 152, "Stekta risnudlar med kyckling, ägg och grönsaker. Serveras med chiliflingor och hackade jordnötter (mild)"),
  (24, "Pad Nam Prik Pow", 160, "Wokad kyckling med chilipasta, sötbasilika och grönsaker (lite stark)"),
  (25, "Khao Pad Gai", 152, "Stekt ris med kyckling, ägg och grönsaker. Serveras med prik nam pla (mild)"),
  (26, "Paneng Ped Heng", 179, "Wokad anka med panengcurry, grönsaker och ananas (lite stark)"),
 ],
 "Kött": [
  (30, "Pad Nam Mam Hoy", 170, "Wokad biff med grönsaker och ostronsås (mild)"),
  (31, "Pad Kratiem Prik Thai", 170, "Wokad biff med grönsaker, vitlök och svartpeppar (lite stark)"),
  (32, "Pad Ba Mee", 170, "Stekta äggnudlar med biff, grönsaker och ostronsås (mild)"),
  (33, "Gaeng Phaneng", 170, "Strimlad biff i kokosmjölk med phanengcurry och grönsaker (lite stark)"),
  (34, "Pad Krapaw Nua", 179, "Wokad biff med grönsaker, färsk basilika och thaibönor (mycket stark)"),
  (35, "Yam Nua", 179, "Biffsallad med koriander, mynta, lime, selleri, chili, rödlök och tomat (mycket stark)"),
 ],
 "Från havet": [
  (40, "Pad Thai Goong", 179, "Stekta risnudlar med scampi, ägg och grönsaker. Serveras med chiliflingor och hackade jordnötter (mild)"),
  (41, "Gaeng Ped Koong", 189, "Scampi i kokosmjölk med röd curry och grönsaker (lite stark)"),
  (42, "Yam Taley", 197, "Skaldjurssallad med koriander, mynta, lime, selleri, chili, rödlök och tomat (mycket stark)"),
  (43, "Pad Kratiam Koong", 197, "Wokad scampi med grönsaker, vitlök och svartpeppar"),
  (44, "Pad Krapaw Taley", 197, "Wokad skaldjursmix (bläckfisk, scampi, blåmusslor) med thaibasilika och färska grönsaker (mycket stark)"),
  (45, "Chu Chi Pla", 197, "Torskryggfilé med phanengcurry, kokosmjölk, limeblad och paprika (lite stark)"),
 ],
 "BBQ": [
  (50, "Tofu Satay", 179, "Grillade tofuspett med jordnötssås (mild)"),
  (51, "Gai Satay", 170, "Grillade kycklingspett med jordnötssås (mild)"),
  (52, "Nua Yang", 215, "Grillade biffspett med grönsaker. Serveras med vitlöksaioli och yamsås (lite stark)"),
  (53, "Talay Yang", 225, "Grillade havets läckerheter (bläckfisk, scampi, vitfisk, blåmusslor). Serveras med vitlöksaioli och yamsås (lite stark)"),
 ],
 "Vegetariskt": [
  (60, "Pad Pak King", 160, "Wokade grönsaker med tofu, vitlök och färsk ingefära (mild)"),
  (61, "Gaeng Keow Wan Pak", 157, "Tofu i kokosmjölk med grön curry och paprika (stark)"),
  (62, "Yam Tofu", 170, "Sauterad tofu och grönsaker med chili, lime och färsk koriander (mycket stark)"),
  (63, "Pad Thai Pak", 143, "Stekta risnudlar med grönsaker och ägg. Serveras med chiliflingor och hackade jordnötter (mild)"),
 ],
 "Thai starka rätter": [
  (70, "Lab Gai", 179, "Thailändsk ljummen kycklingsallad med rödlök, selleri, citrongräs, galanga, koriander och mynta (mycket stark)"),
  (71, "Yam Wonsen", 197, "Glasnudlar med hackad kyckling, scampi, selleri, lime och chili (mycket stark)"),
  (72, "Tom Yam Talay", 197, "Skaldjurssoppa med citrongräs, galanga, limeblad och färsk koriander (mycket stark)"),
  (73, "Pad Krapaw Nua med ägg", 197, "Hackad biff med thaibasilika, vitlök och chili, toppad med stekt ägg (mycket stark)"),
 ],
 "Barnmeny": [
  (80, "Gai Tord", 95, "Friterade kycklingbitar. Serveras med vitlöksaioli och sweet chili"),
  (81, "Gai Satay (barn)", 99, "Grillade kycklingspett med jordnötssås (mild)"),
  (82, "Khao Pad Gai (barn)", 99, "Stekt ris med kyckling och grönsaker (mild)"),
  (83, "Pad Thai Gai (barn)", 99, "Stekta risnudlar med kyckling, ägg och grönsaker. Serveras med hackade jordnötter (mild)"),
 ],
}
VEGAN = "Gör den vegansk"   # Menyn: "Alla vegetariska rätter går att få vegansk!"
GEN = json.loads((HERE / "gen.json").read_text())["products"] if (HERE / "gen.json").exists() else {}
PHOTOS = {"Pad Medd Mamoeng": "food-cashew.webp", "Koong Tord": "food-scampi.webp"}   # deras egna foton av just de rätterna

def copy(src, dst):
    out = IMG / dst
    out.parent.mkdir(parents=True, exist_ok=True)
    if not out.exists(): shutil.copy(src, out)
    return f"{BASE}/{dst}"

def q(s): return '"' + s.replace('"', '\\"') + '"'
y = ["# Pattaya Bar & Restaurang, Tallkrogsplan 93: meny för massimport. GENERERAD av build.py ur pattayabar.se/Meny.html (2026-10-27).",
     "# Barens drycker är inte med (alkohol säljs inte för avhämtning). Menyns 5 % rabatt vid avhämtning är inte inlagd.",
     "extraGroups:", f"  - name: {q(VEGAN)}", "    type: checkbox", "    required: false", "    max: 1", "    options:",
     "      - { name: \"Vegansk\", price: 0 }", "\ncategories:"]
data = {"_kommentar": "GENERERAD av build.py. Läses av docs/restaurants/apply-menu.mjs.", "sizeGroups": [], "productGroups": {},
        "categoryOrder": list(MENU), "productOrder": [],
        "images": {"logo": copy(SITE / "icon-512.png", "logo-square.png"), "hero": copy(SITE / "bar.webp", "hero.webp"),
                   "categories": {"Fågel": copy(SITE / "food-cashew.webp", "dishes/food-cashew.webp"),
                                  "Smått": copy(SITE / "food-scampi.webp", "dishes/food-scampi.webp")},
                   "products": {}, "extras": {}}}
for cat, items in MENU.items():
    y += [f"  - name: {q(cat)}", "    products:"]
    for no, name, price, desc in items:
        y += [f"      - name: {q(name)}", f"        description: {q(f'{no}. {desc}')}", f"        price: {price}"]
        if cat == "Vegetariskt": y.append(f"        extras: [{q(VEGAN)}]")
        data["productOrder"].append(name)
        if name in PHOTOS: data["images"]["products"][name] = copy(SITE / PHOTOS[name], f"dishes/{PHOTOS[name]}")
        # Genererade studiofoton (gen.json) går före: samma indigoblå tallrik och valnötsbord för alla rätter
        g = GEN.get(name)
        if g and (IMG / f"gen/{g}.webp").exists(): data["images"]["products"][name] = f"{BASE}/gen/{g}.webp"
    first = next((data["images"]["products"][n] for _, n, _, _ in items if n in data["images"]["products"]), None)
    if first: data["images"]["categories"][cat] = first
(HERE / "menu.yaml").write_text("\n".join(y) + "\n")
(HERE / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))

hours = {"monday": ("16:00", "22:00"), "tuesday": ("16:00", "22:00"), "wednesday": ("16:00", "22:00"), "thursday": ("16:00", "22:00"),
         "friday": ("15:00", "23:00"), "saturday": ("12:00", "23:00"), "sunday": ("12:00", "22:00")}
restaurant = {
    "_kommentar": "Body till POST /api/restaurants. Källa: pattayabar.se och Google, 2026-10-27. Koordinater från viaeats adressökning. Telefon och e-post läggs inte in. Endast avhämtning. Publiceras direkt när den läggs upp på riktigt (draft=false).",
    "name": "Pattaya Bar & Restaurang", "slug": "pattaya-bar-tallkrogen", "cuisine": "Thai · Bar",
    "address": "Tallkrogsplan 93", "city": "Stockholm", "latitude": 59.2719046, "longitude": 18.0840287,
    "etaMinutes": 20, "vatPercent": 6, "rating": 0, "ratingCount": 0, "pickupOnly": True, "draft": True,
    "openingHours": {k: {"open": o, "close": c, "closed": False} for k, (o, c) in hours.items()},
}
(HERE / "restaurant.json").write_text(json.dumps(restaurant, ensure_ascii=False, indent=2))
print(f"{len(MENU)} kategorier, {len(data['productOrder'])} rätter, {len(data['images']['products'])} med eget foto")
