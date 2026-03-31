import { slugify } from './slug';

const kr = (amount: number) => Math.round(amount * 100);

export type CatalogProduct = {
  name: string;
  description?: string;
  price: number;
  isVegan?: boolean;
  isVegetarian?: boolean;
  isGlutenFree?: boolean;
};

export type CatalogCategory = {
  name: string;
  description?: string;
  imageUrl?: string;
  products: CatalogProduct[];
};

const pizza = (name: string, description: string, price: number, flags?: Partial<CatalogProduct>): CatalogProduct => ({
  name,
  description,
  price: kr(price),
  ...flags,
});

const menuImage = (slug: string) => `/menu/categories/${slug}.svg`;

export const eatsmartCatalog: CatalogCategory[] = [
  {
    name: 'Nyhet - Crispy Chicken',
    description: 'Krispig kyckling med boxar, rullar, burgare och familjealternativ.',
    imageUrl: menuImage('nyhet-crispy-chicken'),
    products: [
      pizza('Crispy tallrik', 'Serveras med ris, crispy chicken (4 st), grönsaker, coleslaw och valfri dip.', 139),
      pizza('Crispy tallrik Familj', 'Serveras med ris, crispy chicken (10 st), grönsaker, coleslaw och 2 valfria dippar.', 290),
      pizza('Crispyrulle', 'Serveras med isbergssallad, tomat, gurka, lök, crispy chicken och valfri sås.', 110),
      pizza('Hot & Crispy', 'Serveras med ris eller pommes, crispy chicken, jalapeno och valfri sås.', 115),
      pizza('CrispyBurgare', 'Krispig kycklingburgare.', 125),
      pizza('CrispyBox', 'Crispy chicken i box.', 95),
    ],
  },
  {
    name: 'Pizza Standard 1',
    description: 'Våra klassiska standardpizzor.',
    imageUrl: menuImage('pizza-standard-1'),
    products: [
      pizza('Margherita', 'Tomat, ost.', 110, { isVegetarian: true }),
      pizza('Vesuvio', 'Ost, skinka.', 110),
      pizza('Capricciosa', 'Ost, skinka, champinjoner.', 110),
      pizza('Funghi', 'Champinjoner.', 110, { isVegetarian: true }),
      pizza('Hawaii', 'Skinka, ananas.', 110),
      pizza('Tomaso', 'Skinka, räkor.', 110),
    ],
  },
  {
    name: 'Pizza Standard 2',
    description: 'Standardpizzor med lite mer topping.',
    imageUrl: menuImage('pizza-standard-2'),
    products: [
      pizza('Mamma mia', 'Skinka, svamp, räkor.', 115),
      pizza('Princessa', 'Skinka, räkor, ananas.', 115),
      pizza('Salami', 'Salami, paprika, lök.', 115),
      pizza('Salami Special', 'Salami, paprika, svamp, lök.', 120),
    ],
  },
  {
    name: 'Pizzor Inbakade',
    description: 'Inbakade pizzor med klassiska fyllningar.',
    imageUrl: menuImage('pizzor-inbakade'),
    products: [
      pizza('Calzone', 'Tomatsås, ost, skinka.', 115),
      pizza('Calzone Special', 'Skinka, ananas.', 120),
      pizza('Kung Calzone', 'Skinka, räkor, champinjoner.', 125),
    ],
  },
  {
    name: 'Vegetariska Pizzor',
    description: 'Grönare pizzor med mycket smak.',
    imageUrl: menuImage('vegetariska-pizzor'),
    products: [
      pizza('Afrikana', 'Jordnötter, banan, ananas, curry.', 120, { isVegetarian: true }),
      pizza('Vegetariana', 'Svamp, paprika, oliver, lök, kronärtskocka.', 120, { isVegetarian: true }),
      pizza('Vegetariana special', 'Paprika, lök, svamp, banan, ananas.', 125, { isVegetarian: true }),
    ],
  },
  {
    name: 'Bacon Pizzor',
    description: 'Rejäla pizzor med bacon och kraftiga smaker.',
    imageUrl: menuImage('bacon-pizzor'),
    products: [
      pizza('Bacon special', 'Bacon, köttfärs, gorgonzolaost, lök.', 125),
      pizza('La Maffia', 'Skinka, bacon, lök, ägg, svartpeppar.', 125),
      pizza('Rimini', 'Skinka, bacon, lök, svamp, svartpeppar.', 125),
    ],
  },
  {
    name: 'Mexikanska Pizzor',
    description: 'Pizzor med hetta, vitlök och kryddig köttfärs.',
    imageUrl: menuImage('mexikanska-pizzor'),
    products: [
      pizza('Bolognese', 'Köttfärssås, färsk vitlök, lök.', 120),
      pizza('Barbone', 'Skinka, lök, köttfärssås, färsk vitlök.', 125),
      pizza('Mexikana', 'Köttfärssås, lök, paprika, jalapeno, tacokryddmix.', 125),
    ],
  },
  {
    name: 'Tonfisk Pizzor',
    description: 'Tonfiskfavoriter med räkor, lök och sås.',
    imageUrl: menuImage('tonfisk-pizzor'),
    products: [
      pizza('Pescatore', 'Tonfisk, lök.', 120),
      pizza('Toscana', 'Tonfisk, svamp, lök, vitlökssås.', 125),
      pizza('Roma', 'Svamp, tonfisk, räkor.', 125),
    ],
  },
  {
    name: 'Kebab Pizzor',
    description: 'Kebabpizzor med valfri sås.',
    imageUrl: menuImage('kebab-pizzor'),
    products: [
      pizza('King Kong', 'Kebabkött, pommes, feferoni, valfri sås.', 135),
      pizza('Kebabpizza', 'Kebabkött, lök, feferoni, valfri sås.', 130),
      pizza('Kebabpizza Special', 'Kebabkött, lök, gurka, isbergssallad, färska tomater, feferoni, valfri sås.', 135),
      pizza('Palmyra Pizza', 'Kebabkött, lök, svamp, ananas, feferoni.', 135),
    ],
  },
  {
    name: 'Kyckling Pizzor',
    description: 'Kycklingpizzor med fräscha toppingar.',
    imageUrl: menuImage('kyckling-pizzor'),
    products: [
      pizza('Kycklingpizza', 'Kyckling, lök, feferoni, valfri sås.', 130),
      pizza('Kycklingpizza Special', 'Kyckling, lök, isbergssallad, färska tomater, gurka, feferoni, valfri sås.', 135),
      pizza('Bombay', 'Kyckling, jordnötter, banan, ananas, curry.', 130),
    ],
  },
  {
    name: 'Mozzarella Pizzor',
    description: 'Mozzarellapizzor med rikare topping och såser.',
    imageUrl: menuImage('mozzarella-pizzor'),
    products: [
      pizza('Orient', 'Mozzarella, kyckling, svamp, lök, ägg, curry.', 135),
      pizza('Adrian', 'Mozzarella, kyckling, svamp, lök, paprika, valfri sås.', 135),
      pizza('Portafino', 'Mozzarella, skinka, köttfärs, färska tomater, svamp, valfri sås.', 135),
      pizza('Venedig', 'Mozzarella, köttfärs, skinka, svamp, lök, valfri sås.', 135),
    ],
  },
  {
    name: 'Veganska Pizzor',
    description: 'Växtbaserade favoriter med vegansk ost och växtbaserade alternativ.',
    imageUrl: menuImage('veganska-pizzor'),
    products: [
      pizza('Margarita - VEGANSK', 'Vegansk ost.', 125, { isVegan: true, isVegetarian: true }),
      pizza('Funghi - VEGANSK', 'Vegansk ost, champinjoner.', 125, { isVegan: true, isVegetarian: true }),
      pizza('Bolognese - VEGANSK', 'Vegansk ost och köttfärssås, lök, färsk vitlök.', 130, { isVegan: true }),
      pizza('Mexikana - VEGANSK', 'Vegansk ost och köttfärssås, lök, paprika, jalapeno.', 130, { isVegan: true }),
      pizza('Delphi Special - VEGANSK', 'Kantareller, paprika, lök, soltorkade tomater, oliver, pestosås.', 135, { isVegan: true }),
      pizza('Kebabpizza - VEGANSK', 'Vegansk ost och kebab, lök, feferoni, valfri sås.', 135, { isVegan: true }),
    ],
  },
  {
    name: 'Italienska Pizzor',
    description: 'Italiensk stil med mozzarella, ruccola och pesto.',
    imageUrl: menuImage('italienska-pizzor'),
    products: [
      pizza('Verdura', 'Mozzarella, spenat, paprika, oliver, färska tomater, pestosås.', 135, { isVegetarian: true }),
      pizza('Salamiruccola', 'Mozzarella, salami, ruccola, parmesan, pestosås.', 139),
      pizza('Fume', 'Mozzarella, champinjoner, soltorkade tomater, färsk vitlök, färsk persilja.', 135, { isVegetarian: true }),
    ],
  },
  {
    name: 'Tallrikar',
    description: 'Serveras med isbergssallad, tomat, gurka, lök, feferoni och valfri sås. Välj pommes eller ris.',
    imageUrl: menuImage('tallrikar'),
    products: [
      pizza('MIX tallrik', 'Halloumi, falafel, kebab, kyckling.', 139),
      pizza('Kebabtallrik', 'Kebabtallrik med valfri sås.', 129),
      pizza('Kycklingtallrik', 'Kycklingtallrik med valfri sås.', 129),
      pizza('Shawarmatallrik', 'Shawarmatallrik med valfri sås.', 129),
      pizza('Halloumitallrik', 'Halloumitallrik med valfri sås.', 125, { isVegetarian: true }),
      pizza('Falafeltallrik', 'Falafeltallrik med valfri sås.', 125, { isVegan: true, isVegetarian: true }),
    ],
  },
  {
    name: 'Rullar & Bröd',
    description: 'Serveras med isbergssallad, tomat, gurka, lök och valfri sås.',
    imageUrl: menuImage('rullar-brod'),
    products: [
      pizza('Kebabrulle', 'Kebabrulle med valfri sås.', 109),
      pizza('Kycklingrulle', 'Kycklingrulle med valfri sås.', 109),
      pizza('Shawarmarulle', 'Shawarmarulle med valfri sås.', 109),
      pizza('Halloumirulle', 'Halloumirulle med valfri sås.', 105, { isVegetarian: true }),
      pizza('Falafelrulle', 'Falafelrulle med valfri sås.', 105, { isVegan: true, isVegetarian: true }),
      pizza('Kebab i Pitabröd', 'Kebab i pitabröd med valfri sås.', 95),
      pizza('Kyckling i Pitabröd', 'Kyckling i pitabröd med valfri sås.', 95),
      pizza('Shawarma i Pitabröd', 'Shawarma i pitabröd med valfri sås.', 95),
      pizza('Falafel i Pitabröd (NY)', 'Falafel i pitabröd med valfri sås.', 89, { isVegan: true, isVegetarian: true }),
      pizza('Halloumi i Pitabröd (NY)', 'Halloumi i pitabröd med valfri sås.', 89, { isVegetarian: true }),
    ],
  },
  {
    name: 'Sallader',
    description: 'Serveras med isbergssallad, tomat, gurka, lök, majs, feferoni och valfri sås.',
    imageUrl: menuImage('sallader'),
    products: [
      pizza('Kebabsallad', 'Kebabsallad med valfri sås.', 119),
      pizza('Kycklingsallad', 'Kycklingsallad med valfri sås.', 119),
      pizza('Grekisk sallad', 'Med fetaost, oliver och lök.', 115, { isVegetarian: true }),
      pizza('Tonfisksallad', 'Med citroner.', 119),
      pizza('Räksallad', 'Med citroner och oliver.', 125),
    ],
  },
  {
    name: 'Box',
    description: 'Serveras med pommes eller grönsaker, kött och valfri sås.',
    imageUrl: menuImage('box'),
    products: [
      pizza('Kebabbox', 'Kebabbox med valfri sås.', 105),
      pizza('Kycklingbox', 'Kycklingbox med valfri sås.', 105),
      pizza('Shawarmabox', 'Shawarmabox med valfri sås.', 105),
      pizza('Halloumibox', 'Halloumibox med valfri sås.', 99, { isVegetarian: true }),
      pizza('Falafelbox', 'Falafelbox med valfri sås.', 99, { isVegan: true, isVegetarian: true }),
    ],
  },
  {
    name: 'Bakad Potatis',
    description: 'Serveras med isbergssallad, tomat, gurka, lök, majs, smör, ost, feferoni och valfri sås.',
    imageUrl: menuImage('bakad-potatis'),
    products: [
      pizza('Bakad potatis - Kebab', 'Bakad potatis med kebab och valfri sås.', 119),
      pizza('Bakad potatis - Kyckling', 'Bakad potatis med kyckling och valfri sås.', 119),
      pizza('Bakad potatis - Räkor', 'Bakad potatis med räkor och valfri sås.', 125),
      pizza('Bakad Potatis - Skinka', 'Bakad potatis med skinka och valfri sås.', 115),
      pizza('Bakad Potatis - Tonfisk', 'Bakad potatis med tonfisk och valfri sås.', 119),
    ],
  },
  {
    name: 'Hamburgare',
    description: 'Serveras med isbergssallad, tomat, gurka, lök, hamburgerdressing och hamburgerbröd.',
    imageUrl: menuImage('hamburgare'),
    products: [
      pizza('Texas 2x150g', 'Dubbelburgare.', 149),
      pizza('Hamburgare', 'Klassisk hamburgare.', 99),
      pizza('Kycklingburgare MENY', 'Kycklingburgare med meny.', 125),
      pizza('ChilliBurgare MENY', 'Chiliburgare med meny.', 129),
      pizza('OstBurgare 200g Meny', 'Ostburgare 200 g med meny.', 139),
      pizza('Baconburgare 200g Meny', 'Baconburgare 200 g med meny.', 145),
    ],
  },
  {
    name: 'Tillbehör',
    description: 'Snacks och småtillbehör till beställningen.',
    imageUrl: menuImage('tillbehor'),
    products: [
      pizza('Pommestallrik', 'Pommes.', 35, { isVegetarian: true }),
      pizza('Chilli cheese', 'Chilli cheese.', 45, { isVegetarian: true }),
      pizza('Mozzarella sticks', 'Mozzarella sticks.', 49, { isVegetarian: true }),
      pizza('Lökringar', 'Lökringar.', 39, { isVegetarian: true }),
      pizza('Chicken nuggets', 'Chicken nuggets.', 49),
      pizza('Plastbestick', '1 kniv, 1 gaffel.', 5),
    ],
  },
  {
    name: 'Dryck',
    description: 'Läsk och vatten till maten.',
    imageUrl: menuImage('dryck'),
    products: [
      pizza('Coca Cola', '33 cl.', 20),
      pizza('Fanta Orange', '33 cl.', 20),
      pizza('Fanta Exotic', '33 cl.', 20),
      pizza('Fanta Lemon', '33 cl.', 20),
      pizza('Loka', '33 cl.', 20),
      pizza('Pepsi', '33 cl.', 20),
      pizza('Coca cola Zero', '33 cl.', 20),
      pizza('Sprite', '33 cl.', 20),
      pizza('Mer', 'Juice.', 15),
    ],
  },
];

export const getCatalogStats = () => ({
  categoryCount: eatsmartCatalog.length,
  productCount: eatsmartCatalog.reduce((sum, category) => sum + category.products.length, 0),
});

export const catalogSlug = (value: string) => slugify(value);
