import { z } from "zod";

// Editorial + safety rules attached to each shop (stored as JSON in Shop.rulesJson).
export const ShopRulesSchema = z.object({
  brandName: z.string().default(""),
  storeUrl: z.string().url().or(z.literal("")).default(""),
  niche: z.string().default("luminaire"),
  // Appended to SEO titles, e.g. "| Lumio".
  seoTitleSuffix: z.string().default(""),
  // Required ending of every meta description.
  metaSuffix: z.string().default("✓ Livraison gratuite."),
  // Whether this shop allows branded names in titles.
  useBrandedNames: z.boolean().default(false),
  // Collection anchor → absolute URL, used by the internal-linking agent.
  collectionUrls: z.record(z.string(), z.string().url()).default({}),
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

// Sensible starter rules for the three known shops.
export const SHOP_PRESETS: Record<string, ShopRules> = {
  lumio: ShopRulesSchema.parse({
    brandName: "Lumio",
    niche: "luminaire",
    seoTitleSuffix: "| Lumio",
    useBrandedNames: true,
  }),
  "le-petit-luminaire": ShopRulesSchema.parse({
    brandName: "Le Petit Luminaire",
    niche: "luminaire",
    seoTitleSuffix: "| Le Petit Luminaire",
    useBrandedNames: true,
  }),
  bebilo: ShopRulesSchema.parse({
    brandName: "Bebilo",
    niche: "bebe",
    seoTitleSuffix: "| Bebilo",
    useBrandedNames: true,
  }),
};
