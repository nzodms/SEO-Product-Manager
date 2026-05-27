import { z } from "zod";

// Editorial + safety rules attached to each shop (stored as JSON in Shop.rulesJson).
export const ShopRulesSchema = z.object({
  brandName: z.string().default(""),
  storeUrl: z.string().url().or(z.literal("")).default(""),
  niche: z.string().default("luminaire"),
  // Appended to META titles, e.g. "| Lumio" (the store name, not a product brand).
  seoTitleSuffix: z.string().default(""),
  // Required ending of every meta description.
  metaSuffix: z.string().default("✓ Livraison gratuite."),
  // Whether titles append a per-product invented brand name ("Titre | Aurélia").
  useBrandedNames: z.boolean().default(false),
  // Collection anchor → absolute URL, used by the internal-linking agent.
  collectionUrls: z.record(z.string(), z.string().url()).default({}),
  // Legacy domains that must NEVER appear in links (guard: LEGACY_DOMAIN_LINK).
  oldDomains: z.array(z.string()).default([]),
  // Old brand terms to strip from handles in non-safe modes (e.g. "lumio").
  oldBrandTerms: z.array(z.string()).default([]),
  // Editorial tone guidance fed to creative agents.
  editorialTone: z
    .string()
    .default("haut de gamme, chaleureux, clair, orienté client final"),
});

export type ShopRules = z.infer<typeof ShopRulesSchema>;

export function parseShopRules(json: string | null | undefined): ShopRules {
  if (!json) return ShopRulesSchema.parse({});
  try {
    return ShopRulesSchema.parse(JSON.parse(json));
  } catch {
    return ShopRulesSchema.parse({});
  }
}

// Starter rules for the known shops. Lumio uses NO per-product branded name;
// Le Petit Luminaire DOES; Bebilo uses natural baby-niche titles.
export const SHOP_PRESETS: Record<string, ShopRules> = {
  lumio: ShopRulesSchema.parse({
    brandName: "Lumio",
    niche: "luminaire",
    storeUrl: "https://lumio-o.com",
    seoTitleSuffix: "| Lumio",
    useBrandedNames: false,
    collectionUrls: {
      lustres: "https://lumio-o.com/collections/nos-lustres",
      suspensions: "https://lumio-o.com/collections/nos-lampes-suspendues",
      plafonniers: "https://lumio-o.com/collections/nos-plafonniers",
      "lampes de chevet": "https://lumio-o.com/collections/nos-lampes-de-chevet",
    },
  }),
  "le-petit-luminaire": ShopRulesSchema.parse({
    brandName: "Le Petit Luminaire",
    niche: "luminaire",
    storeUrl: "https://le-petit-luminaire.com",
    seoTitleSuffix: "| Le Petit Luminaire",
    useBrandedNames: true,
    collectionUrls: {
      lustres: "https://le-petit-luminaire.com/collections/nos-lustres",
      suspensions: "https://le-petit-luminaire.com/collections/nos-lampes-suspendues",
      plafonniers: "https://le-petit-luminaire.com/collections/nos-plafonniers",
      "lampes de chevet": "https://le-petit-luminaire.com/collections/nos-lampes-de-chevet",
    },
    // If migrating from Lumio, scrub these from handles in non-safe modes.
    oldBrandTerms: ["lumio"],
    oldDomains: ["lumio-o.com"],
  }),
  bebilo: ShopRulesSchema.parse({
    brandName: "Bebilo",
    niche: "bebe",
    storeUrl: "",
    seoTitleSuffix: "| Bebilo",
    useBrandedNames: false,
  }),
};
