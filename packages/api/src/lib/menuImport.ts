/**
 * Bulk-import av meny (kategorier → produkter → pålägg) från YAML eller JSON.
 *
 * Format (YAML — js-yaml parsar även JSON så autodetektion är gratis):
 *
 *   extraGroups:
 *     - name: Sås
 *       type: radio            # radio = max 1 | checkbox = flera
 *       required: false        # true => Min 1
 *       max: 3                 # bara checkbox
 *       options:
 *         - { name: Vitlökssås, price: 0 }   # price i KRONOR
 *   categories:
 *     - name: Kyckling
 *       description: "…"        # valfri
 *       products:
 *         - name: Crispy tallrik
 *           description: "…"     # valfri
 *           price: 139           # KRONOR
 *           extras: [Sås, Dip]   # grupp-namn ovan (eller redan i DB)
 *
 * Idempotent upsert: matchar på namn (trim + lowercase) per restaurang.
 * Kör om utan dubbletter. Priser anges i kronor och konverteras till öre.
 */
import yaml from 'js-yaml';
import { z } from 'zod';
import { slugify } from './slug';
import type { PrismaClient } from '@prisma/client';

const norm = (s: string) => s.trim().toLowerCase();
const toOre = (kr: number) => Math.round(Number(kr) * 100);

let _slugCounter = 0;
const uniqueSlug = (name: string) =>
  `${slugify(name) || 'item'}-${Date.now().toString(36)}${(_slugCounter++).toString(36)}`;

// ── Schema ─────────────────────────────────────────────────────────────────
const OptionSchema = z.union([
  z.string().min(1).transform((name) => ({ name, price: 0 })),
  z.object({ name: z.string().min(1), price: z.coerce.number().default(0) }),
]);

const ExtraGroupSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional(),
  required: z.boolean().optional(),
  min: z.coerce.number().optional(),
  max: z.coerce.number().optional(),
  description: z.string().optional(),
  options: z.array(OptionSchema).default([]),
});

const ProductSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  price: z.coerce.number(),
  vatPercent: z.union([z.literal(0), z.literal(6), z.literal(12), z.literal(25)]).optional(),
  extras: z.array(z.string()).default([]),
  displayMode: z.string().optional(),
  hideDescription: z.boolean().optional(),
});

const CategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  products: z.array(ProductSchema).default([]),
});

const SpecSchema = z.object({
  extraGroups: z.array(ExtraGroupSchema).default([]),
  categories: z.array(CategorySchema).default([]),
});

export type MenuImportSpec = z.infer<typeof SpecSchema>;

export type MenuImportResult = {
  ok: boolean;
  dryRun: boolean;
  summary: {
    extraGroupsCreated: number;
    extraGroupsUpdated: number;
    categoriesCreated: number;
    categoriesUpdated: number;
    productsCreated: number;
    productsUpdated: number;
    links: number;
  };
  errors: string[];
  warnings: string[];
  examples: string[];
};

/** Parsa YAML/JSON → validerad spec. Kastar Error med läsbart meddelande. */
export function parseMenuImport(content: string): MenuImportSpec {
  let raw: unknown;
  try {
    raw = yaml.load(content); // hanterar både YAML och JSON
  } catch (e: any) {
    throw new Error(`Kunde inte tolka filen (YAML/JSON-fel): ${e?.reason || e?.message || e}`);
  }
  if (!raw || typeof raw !== 'object') {
    throw new Error('Filen är tom eller har fel format. Förväntar `categories:` och/eller `extraGroups:`.');
  }
  const parsed = SpecSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    throw new Error(`Valideringsfel: ${first?.path?.join('.') || ''} ${first?.message || ''}`.trim());
  }
  return parsed.data;
}

function normalizeGroup(g: z.infer<typeof ExtraGroupSchema>) {
  const type = /radio|single|one|en\b/i.test(g.type || '') ? 'RADIO' : 'CHECKBOX';
  let min = g.min != null ? g.min : g.required ? 1 : 0;
  let max = type === 'RADIO' ? 1 : g.max != null ? g.max : 99;
  const required = g.required != null ? g.required : min >= 1;
  if (required && min < 1) min = 1;
  if (max < Math.max(min, 1)) max = Math.max(min, 1);
  return { type, required, minSelections: min, maxSelections: max };
}

/**
 * Kör importen. apply=false → dry-run (inga skrivningar, bara plan + validering).
 */
export async function runMenuImport(
  prisma: PrismaClient,
  restaurantId: string,
  spec: MenuImportSpec,
  apply: boolean,
): Promise<MenuImportResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const examples: string[] = [];
  const summary = {
    extraGroupsCreated: 0, extraGroupsUpdated: 0,
    categoriesCreated: 0, categoriesUpdated: 0,
    productsCreated: 0, productsUpdated: 0, links: 0,
  };

  // Befintlig data → namn-uppslag (upsert-matchning), strikt per restaurang.
  // Globala grupper återanvänds aldrig: en senare ändring hos restaurang A får
  // inte ändra val eller priser hos restaurang B.
  const [existingGroups, existingCats] = await Promise.all([
    prisma.extraGroup.findMany({
      where: { restaurantId },
      select: { id: true, name: true, restaurantId: true },
    }),
    prisma.category.findMany({
      where: { restaurantId },
      select: { id: true, name: true, products: { select: { id: true, name: true } } },
    }),
  ]);
  const groupByName = new Map<string, { id: string; global: boolean }>();
  existingGroups.forEach((g) => {
    const k = norm(g.name);
    groupByName.set(k, { id: g.id, global: false });
  });

  // ── 1) Extra-grupper (pålägg) ──────────────────────────────────────────────
  for (const g of spec.extraGroups) {
    const key = norm(g.name);
    const existing = groupByName.get(key);
    const cfg = normalizeGroup(g);

    if (existing) summary.extraGroupsUpdated++; else summary.extraGroupsCreated++;
    examples.push(`Pålägg ${existing ? '↻' : '＋'} ${g.name} (${cfg.type}${cfg.required ? ', required' : ''}, ${g.options.length} val)`);

    if (!apply) continue;
    if (existing) {
      await prisma.extraGroup.update({ where: { id: existing.id }, data: { description: g.description ?? null, ...cfg } });
      await prisma.extra.deleteMany({ where: { extraGroupId: existing.id } });
      if (g.options.length) {
        await prisma.extra.createMany({
          data: g.options.map((o, i) => ({ extraGroupId: existing.id, name: o.name, priceAddon: toOre(o.price), position: i })),
        });
      }
    } else {
      const created = await prisma.extraGroup.create({
        data: {
          restaurantId, name: g.name, description: g.description ?? null, ...cfg,
          extras: { create: g.options.map((o, i) => ({ name: o.name, priceAddon: toOre(o.price), position: i })) },
        },
        select: { id: true },
      });
      groupByName.set(key, { id: created.id, global: false });
    }
  }
  // Dry-run: registrera nya namn så referens-validering nedan funkar.
  if (!apply) spec.extraGroups.forEach((g) => { const k = norm(g.name); if (!groupByName.has(k)) groupByName.set(k, { id: '(ny)', global: false }); });

  // ── 2) Kategorier + produkter ──────────────────────────────────────────────
  const catIdByName = new Map<string, string>();
  const prodIdsByCat = new Map<string, Map<string, string>>();
  existingCats.forEach((c) => {
    catIdByName.set(norm(c.name), c.id);
    prodIdsByCat.set(c.id, new Map(c.products.map((p) => [norm(p.name), p.id])));
  });

  for (const cat of spec.categories) {
    const catKey = norm(cat.name);
    const catExists = catIdByName.has(catKey);
    if (catExists) summary.categoriesUpdated++; else summary.categoriesCreated++;
    examples.push(`Kategori ${catExists ? '↻' : '＋'} ${cat.name} (${cat.products.length} produkter)`);

    let catId = catIdByName.get(catKey) || '';
    if (apply) {
      if (catExists) {
        await prisma.category.update({
          where: { id: catId },
          data: { description: cat.description ?? null },
        });
      } else {
        const created = await prisma.category.create({
          data: { restaurantId, name: cat.name, slug: uniqueSlug(cat.name), description: cat.description ?? null },
          select: { id: true },
        });
        catId = created.id;
        catIdByName.set(catKey, catId);
        prodIdsByCat.set(catId, new Map());
      }
    }

    const prodMap = prodIdsByCat.get(catId) || new Map<string, string>();

    for (const p of cat.products) {
      const pKey = norm(p.name);
      const pExists = prodMap.has(pKey);
      if (pExists) summary.productsUpdated++; else summary.productsCreated++;

      // Validera pålägg-referenser
      const groupIds: string[] = [];
      for (const exName of p.extras) {
        const gid = groupByName.get(norm(exName))?.id;
        if (!gid) {
          warnings.push(`Produkten "${p.name}" refererar pålägg "${exName}" som inte finns (definiera den i extraGroups eller i admin först) — hoppar över kopplingen.`);
        } else {
          groupIds.push(gid);
          summary.links++;
        }
      }

      if (!apply) continue;

      if (pExists) {
        const pid = prodMap.get(pKey)!;
        await prisma.product.update({
          where: { id: pid },
          data: {
            description: p.description ?? null, price: toOre(p.price),
            ...(p.vatPercent != null ? { vatPercent: p.vatPercent } : {}),
            ...(p.displayMode ? { displayMode: p.displayMode.toUpperCase() === 'COMPACT' ? 'COMPACT' : 'FULL' } : {}),
            ...(p.hideDescription != null ? { hideDescription: p.hideDescription } : {}),
          },
        });
        // Synka pålägg-kopplingar (ersätt)
        await prisma.productExtraGroup.deleteMany({ where: { productId: pid } });
        if (groupIds.length) {
          await prisma.productExtraGroup.createMany({
            data: groupIds.map((extraGroupId, i) => ({ productId: pid, extraGroupId, position: i })),
            skipDuplicates: true,
          });
        }
      } else {
        const created = await prisma.product.create({
          data: {
            categoryId: catId, name: p.name, slug: uniqueSlug(p.name),
            description: p.description ?? null, price: toOre(p.price),
            ...(p.vatPercent != null ? { vatPercent: p.vatPercent } : {}),
            displayMode: p.displayMode?.toUpperCase() === 'COMPACT' ? 'COMPACT' : 'FULL',
            ...(p.hideDescription != null ? { hideDescription: p.hideDescription } : {}),
            ...(groupIds.length ? { extraGroups: { create: groupIds.map((extraGroupId, i) => ({ extraGroupId, position: i })) } } : {}),
          },
          select: { id: true },
        });
        prodMap.set(pKey, created.id);
      }
    }
  }

  return { ok: errors.length === 0, dryRun: !apply, summary, errors, warnings, examples: examples.slice(0, 40) };
}
