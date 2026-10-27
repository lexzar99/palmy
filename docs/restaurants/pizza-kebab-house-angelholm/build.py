# Bygger menu.yaml, data.json och restaurant.json för Pizza Kebab House (Ängelholm) ur deras Lumit-meny
# (embed.lumit.se/stores/60/data.json, sparad i raw/lumit-data.json 2026-10-27). Priser exakt som i Lumit.
# Rättbilderna är genererade studiofoton i PKH:s stil (gen.json: pizzor i kraftkartong, övrigt på grön tallrik, allt på
# mörkgrönt). Drycker är produktbilder från Freds. Kör: python3 -I build.py
import json, pathlib, re, shutil

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parents[2] / "apps/web/public/demo"
FREDS = WEB / "freds-pizzeria/img"
IMG = WEB / "pizza-kebab-house-angelholm/img"
BASE = "/demo/pizza-kebab-house-angelholm/img"
SITE = pathlib.Path.home() / "Website/pkh-site/website/public/img"

d = json.loads((HERE / "raw/lumit-data.json").read_text())
opts = {o["optionsId"]: o for o in d["compMenuOptions"] if not o["deleted"]}
ocats = {o["optionsCatId"]: o for o in d["compMenuOptionsCategories"] if not o["deleted"]}

SMALL = {"i", "och", "med", "på", "g", "cl"}
def nice(name):
    name = name.strip()
    words = re.split(r"(\s+)", name.lower())
    out = []
    for i, w in enumerate(words):
        out.append(w if (w in SMALL and i) or w.isspace() else w[:1].upper() + w[1:])
    s = "".join(out).replace("(Inbakad)", "(inbakad)").replace("7Up", "7up").replace("Cl", "cl")
    return re.sub(r"\b(\d+) G\b", r"\1 g", s)

# Lumits tillvalsgrupper → viaeats-grupper
SAUCE, POTATO = "Välj sås (ingår)", "Pommes eller stekt potatis"
GEN = json.loads((HERE / "gen.json").read_text()) if (HERE / "gen.json").exists() else {"products": {}, "extras": {}}
EXTRA_NAMES = {548: "Extra kött och protein", 549: "Extra sås och kryddor", 550: "Extra grönsaker", 551: "Extra ost och övrigt"}
SIZE_CATS = {543, 544, 545, 546, 547}
SIZE_NAME = {"Vanlig": "Normal"}

def group_options(cid):
    return [(opts[int(i)]["name"], opts[int(i)]["priceBase"]) for i in ocats[cid]["optionsId"] if int(i) in opts]

size_groups = {}
for cid in sorted(SIZE_CATS):
    o = group_options(cid)
    fam = dict(o).get("Familjepizza")
    key = f"size:{fam}"
    size_groups.setdefault(key, {"key": key, "description": f"storlek-pkh-{fam}", "default": "Normal",
                                 "extras": [[SIZE_NAME.get(n, n), p, None] for n, p in o]})

cats = sorted([c for c in d["compMenuCategories"] if not c["deleted"]], key=lambda c: c["listIndex"])
products = sorted([p for p in d["compMenu"] if not p["deleted"]], key=lambda p: (p["categoryId"], p["listIndex"] or 0))

# Bilder från Freds där rätten har samma pålägg (namn i PKH → filnamn i freds-pizzeria/img/dishes)
SAME = {
    "Margherita": "margherita", "Vesuvio": "vesuvio", "Al Funghi": "al-funghi", "Capricciosa": "capricciosa", "Hawaii": "hawaii",
    "Calzone (inbakad)": "calzone", "Calzone Special (inbakad)": "calzone-special", "Tutti Frutti": "frutti", "Capri": "tropicana",
    "Vegetarisk Pizza": "vegetariana", "Salami Pizza": "salami", "Tonfiskpizza": "al-tonno", "Quattro": "quattro-stagioni",
    "Kebabpizza": "notkebabpizza", "Inbakad Pizza": "kebab-special", "Kebab Special": "sibyll", "Husets Special": "la-more",
    "Ängelholm Special": "babylon-special", "Kycklingpizza": "mexico", "Chicko Special": "kyckling-special",
    "Oxfilépizza": "oxfile-special", "Paris": "florida", "Acapulco": "acapulco",
    "Kebabtallrik": "kebabtallrik", "Mixtallrik": "mixtallrik", "Kycklingtallrik": "kycklingtallrik", "Falafeltallrik": "falafeltallrik",
    "Kyckling Nuggets Tallrik": "kyckling-nuggets", "Kebabrulle": "kebabrulle", "Kycklingrulle": "kycklingrulle",
    "Falafelrulle": "falafelrulle", "Kycklingkebabrulle": "mix-kebabrulle", "Kebab i Pitabröd": "kebab-pitabrod",
    "Kyckling i Pitabröd": "kyckling-pitabrod", "Falafel i Pitabröd": "falafel-brod",
    "Hamburgare med Pommes, 90 g": "hamburgertallrik", "Hamburgare med Pommes, 150 g": "hamburgertallrik",
    "Halloumiburgare, 150 g": "halloumiburgare", "Kebabsallad": "kebabsallad", "Kycklingsallad": "kycklingsallad",
    "Räksallad": "raksallad", "Tonfisksallad": "tonfisksallad", "Ost- & Skinksallad": "skinksallad",
    "Havets Sallad": "vastkustsallad", "Vegetarisk Sallad": "grekisk-sallad", "Pommes": "pommes-mellan", "Pizzasallad": "pizzasallad",
}
SAUCE_PICS = {"Kebabsås mild": "sas-kebab-mild", "Kebabsås stark": "sas-kebab-stark", "Kebabsås mellan": "sas-kebab-blandad",
              "Vitlökssås": "sas-vitlok", "Bearnaisesås": "sas-bearnaise", "Utan sås": "sas-ingen"}
DRINK_PICS = {"Coca-Cola 33 cl": "coca-cola-33", "Coca-Cola Zero 33 cl": "cola-zero-33", "Fanta Orange 33 cl": "fanta-orange-33",
              "Pepsi 33 cl": "pepsi-33"}
JAR = {"Kebabsås mild (i burk)": "sas-kebab-mild", "Kebabsås stark (i burk)": "sas-kebab-stark", "Bearnaisesås (i burk)": "sas-bearnaise",
       "Kebabsås mellan (i burk)": "sas-kebab-blandad", "Vitlökssås (i burk)": "sas-vitlok"}

def copy(src, dst):
    out = IMG / dst
    out.parent.mkdir(parents=True, exist_ok=True)
    if not out.exists(): shutil.copy(src, out)
    return f"{BASE}/{dst}"

def q(s): return '"' + s.replace('"', '\\"') + '"'

y = ["# Pizza Kebab House, Skolgatan 1d, Ängelholm: meny för massimport. GENERERAD av build.py ur Lumit (stores/60, avläst 2026-10-27).",
     "# Priser i kronor exakt som i Lumit. Storleksgrupperna (alla heter \"Storlek\") och gruppordningen per rätt sätts av apply-menu.mjs ur data.json.",
     "extraGroups:",
     f"  - name: {q(SAUCE)}", "    type: radio", "    required: true", "    options:"]
y += [f"      - {{ name: {q(n)}, price: {p} }}" for n, p in group_options(541)]
y += [f"  - name: {q(POTATO)}", "    type: radio", "    required: true", "    options:"]
y += [f"      - {{ name: {q(n)}, price: {p} }}" for n, p in group_options(542)]
for cid, gname in EXTRA_NAMES.items():
    o = group_options(cid)
    y += [f"  - name: {q(gname)}", "    type: checkbox", "    required: false", f"    max: {len(o)}", "    options:"]
    y += [f"      - {{ name: {q(n)}, price: {p} }}" for n, p in o]
y.append("\ncategories:")

data = {"_kommentar": "GENERERAD av build.py. Läses av docs/restaurants/apply-menu.mjs.", "sizePrefix": "storlek-pkh",
        "sizeGroups": list(size_groups.values()), "productGroups": {}, "categoryOrder": [], "productOrder": [],
        "images": {"logo": copy(SITE / "icon-512.png", "logo-square.png"), "hero": copy(SITE / "facade.webp", "hero.webp"),
                   "categories": {}, "products": {}, "extras": {SAUCE: {}}}}
for n, f in SAUCE_PICS.items():
    data["images"]["extras"][SAUCE][n] = copy(FREDS / f"tiles/{f}.webp", f"tiles/{f}.webp")
# Rutorna för korta tillval (sås, pommes/potatis, storlek) i PKH:s egen stil när de finns
def gen_tile(f): return f"{BASE}/gen/{f}.webp" if (IMG / f"gen/{f}.webp").exists() else None
for group in (SAUCE, POTATO):
    for n, f in GEN["extras"].get(group, {}).items():
        if gen_tile(f): data["images"]["extras"].setdefault(group, {})[n] = gen_tile(f)
for sg in data["sizeGroups"]:
    sg["extras"] = [[n, pr, gen_tile(GEN["extras"]["size"][n]) if n in GEN["extras"].get("size", {}) else pic] for n, pr, pic in sg["extras"]]

seen = set()
for c in cats:
    cname = nice(c["name"]) if c["name"].isupper() else c["name"]
    items = [p for p in products if p["categoryId"] == c["categoryId"]]
    if not items: continue
    data["categoryOrder"].append(cname)
    y += [f"  - name: {q(cname)}", "    products:"]
    for p in items:
        name = nice(p["name"]) if p["name"].isupper() else p["name"].strip()
        if name in seen: name = f"{name} ({cname.lower()})"
        seen.add(name)
        ingr = [opts[int(i)]["name"] for i in (p["baseOptions"] or "").split(",") if i and int(i) in opts]
        desc = p["description"] or ", ".join(ingr)
        forced = set(int(x) for x in (c["forcedOptionsCatId"] or [])) | set(int(x) for x in (p["forcedOptions"] or []))
        keys = []
        for cid in sorted(forced):
            if cid in SIZE_CATS: keys.append(f"size:{dict(group_options(cid)).get('Familjepizza')}")
        if 541 in forced: keys.append(SAUCE)
        if 542 in forced: keys.append(POTATO)
        keys += [EXTRA_NAMES[int(x)] for x in (c["optionsCatId"] or []) if int(x) in EXTRA_NAMES]
        y += [f"      - name: {q(name)}"] + ([f"        description: {q(desc)}"] if desc else []) + [f"        price: {p['priceBase']}"]
        data["productOrder"].append(name)
        if keys: data["productGroups"][name] = keys
        pic = SAME.get(name) and FREDS / f"dishes/{SAME[name]}.webp"
        if name in JAR: pic = FREDS / f"tiles/{JAR[name]}.webp"
        if name in DRINK_PICS: pic = FREDS / f"drinks/{DRINK_PICS[name]}.webp"
        if pic and pic.exists():
            data["images"]["products"][name] = copy(pic, f"{pic.parent.name}/{pic.name}")
        # Genererade studiofoton (gen.json) går före: pizzor i kraftkartong, övrigt på grön tallrik, allt på mörkgrönt
        g = GEN["products"].get(name)
        if g and (IMG / f"gen/{g}.webp").exists(): data["images"]["products"][name] = f"{BASE}/gen/{g}.webp"
        if cname not in data["images"]["categories"] and name in data["images"]["products"]:
            data["images"]["categories"][cname] = data["images"]["products"][name]

(HERE / "menu.yaml").write_text("\n".join(y) + "\n")
(HERE / "data.json").write_text(json.dumps(data, ensure_ascii=False, indent=1))

hours = {"monday": ("11:00", "22:00"), "tuesday": ("11:00", "22:00"), "wednesday": ("11:00", "22:00"), "thursday": ("11:00", "22:00"),
         "friday": ("11:00", "04:00"), "saturday": ("12:00", "04:00"), "sunday": ("11:00", "22:00")}
restaurant = {
    "_kommentar": "Body till POST /api/restaurants. Källa: pizzakebabhouse.se (Lumit) och Google, 2026-10-27. Koordinater från viaeats adressökning. Telefon och e-post läggs inte in. pickupOnly eftersom viaeats inte kör bud. Publiceras direkt när den läggs upp på riktigt (draft=false).",
    "name": "Pizza Kebab House", "slug": "pizza-kebab-house-angelholm", "cuisine": "Pizza · Kebab · Burgare",
    "address": "Skolgatan 1d", "city": "Ängelholm", "latitude": 56.2462817, "longitude": 12.8647643,
    "etaMinutes": 20, "vatPercent": 6, "rating": 0, "ratingCount": 0, "pickupOnly": True, "draft": True,
    "openingHours": {k: {"open": o, "close": c, "closed": False} for k, (o, c) in hours.items()},
}
(HERE / "restaurant.json").write_text(json.dumps(restaurant, ensure_ascii=False, indent=2))
n = sum(1 for _ in data["productOrder"])
print(f"{len(data['categoryOrder'])} kategorier, {n} rätter, {len(data['images']['products'])} med bild, {len(size_groups)} storleksgrupper")
