import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/security/crypto";
import { ShopRulesSchema, SHOP_PRESETS } from "@/lib/config/shops";

export async function GET() {
  const shops = await prisma.shop.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      domain: true,
      displayName: true,
      apiVersion: true,
      active: true,
      rulesJson: true,
      // accessTokenEnc deliberately excluded — never sent to the client.
    },
  });
  return NextResponse.json({ shops });
}

const CreateShopSchema = z.object({
  domain: z.string().min(3),
  displayName: z.string().min(1),
  accessToken: z.string().min(10),
  apiVersion: z.string().optional(),
  preset: z.string().optional(),
  rules: ShopRulesSchema.partial().optional(),
});

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = CreateShopSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { domain, displayName, accessToken, apiVersion, preset, rules } = parsed.data;

  const baseRules = preset && SHOP_PRESETS[preset] ? SHOP_PRESETS[preset] : ShopRulesSchema.parse({});
  const mergedRules = ShopRulesSchema.parse({ ...baseRules, ...(rules ?? {}) });

  const shop = await prisma.shop.create({
    data: {
      domain,
      displayName,
      accessTokenEnc: encryptToken(accessToken),
      apiVersion: apiVersion ?? "2025-01",
      rulesJson: JSON.stringify(mergedRules),
    },
    select: { id: true, domain: true, displayName: true },
  });

  return NextResponse.json({ shop }, { status: 201 });
}
