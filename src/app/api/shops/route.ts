import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { encryptToken } from "@/lib/security/crypto";
import { ShopRulesSchema, SHOP_PRESETS } from "@/lib/config/shops";
import { DEFAULT_SCOPES, normalizeShopDomain, isValidShopDomain } from "@/lib/shopify/oauth";

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
      authMode: true,
      clientId: true, // not secret; the Client Secret is never selected
      scopes: true,
      connectionStatus: true,
      connectionCheckedAt: true,
      connectionError: true,
      // accessTokenEnc / clientSecretEnc deliberately excluded.
    },
  });
  return NextResponse.json({ shops });
}

const TokenShop = z.object({
  authMode: z.literal("TOKEN"),
  domain: z.string().min(3),
  displayName: z.string().min(1),
  accessToken: z.string().min(10),
  apiVersion: z.string().optional(),
  preset: z.string().optional(),
  rules: ShopRulesSchema.partial().optional(),
});

const OauthShop = z.object({
  authMode: z.literal("OAUTH"),
  domain: z.string().min(3),
  displayName: z.string().min(1),
  clientId: z.string().min(5),
  clientSecret: z.string().min(5),
  scopes: z.string().optional(),
  apiVersion: z.string().optional(),
  preset: z.string().optional(),
  rules: ShopRulesSchema.partial().optional(),
});

const CreateShopSchema = z.discriminatedUnion("authMode", [TokenShop, OauthShop]);

export async function POST(req: Request) {
  const parsed = CreateShopSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const data = parsed.data;

  const domain = normalizeShopDomain(data.domain);
  if (!isValidShopDomain(domain)) {
    return NextResponse.json(
      { error: "Domaine invalide. Format attendu : ta-boutique.myshopify.com" },
      { status: 400 }
    );
  }

  const baseRules =
    data.preset && SHOP_PRESETS[data.preset] ? SHOP_PRESETS[data.preset] : ShopRulesSchema.parse({});
  const mergedRules = ShopRulesSchema.parse({ ...baseRules, ...(data.rules ?? {}) });

  if (data.authMode === "TOKEN") {
    const shop = await prisma.shop.create({
      data: {
        authMode: "TOKEN",
        domain,
        displayName: data.displayName,
        accessTokenEnc: encryptToken(data.accessToken),
        apiVersion: data.apiVersion ?? "2025-01",
        rulesJson: JSON.stringify(mergedRules),
        connectionStatus: "TOKEN_PRESENT",
      },
      select: { id: true, domain: true, displayName: true, authMode: true },
    });
    return NextResponse.json({ shop }, { status: 201 });
  }

  // OAUTH: store credentials only; the access token is obtained after the
  // merchant authorizes via /api/shopify/oauth/start → Shopify → callback.
  const shop = await prisma.shop.create({
    data: {
      authMode: "OAUTH",
      domain,
      displayName: data.displayName,
      clientId: data.clientId,
      clientSecretEnc: encryptToken(data.clientSecret),
      scopes: (data.scopes && data.scopes.trim()) || DEFAULT_SCOPES.join(","),
      apiVersion: data.apiVersion ?? "2025-01",
      rulesJson: JSON.stringify(mergedRules),
      connectionStatus: "NOT_CONNECTED",
    },
    select: { id: true, domain: true, displayName: true, authMode: true },
  });
  // Client triggers the OAuth redirect with this URL.
  return NextResponse.json(
    { shop, authorizeStart: `/api/shopify/oauth/start?shopId=${shop.id}` },
    { status: 201 }
  );
}
