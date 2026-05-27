import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  buildAuthorizeUrl,
  appOriginFromRequest,
  randomState,
  DEFAULT_SCOPES,
} from "@/lib/shopify/oauth";

export const runtime = "nodejs";

// Begins the OAuth round-trip: saves a CSRF state nonce, then redirects the
// merchant to Shopify's authorize screen for the configured shop.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId");
  if (!shopId) return NextResponse.json({ error: "shopId requis" }, { status: 400 });

  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });
  if (shop.authMode !== "OAUTH" || !shop.clientId) {
    return NextResponse.json({ error: "Cette boutique n'est pas en mode OAuth." }, { status: 400 });
  }

  const state = randomState();
  await prisma.shop.update({ where: { id: shopId }, data: { oauthState: state } });

  const redirectUri = `${appOriginFromRequest(req)}/api/shopify/oauth/callback`;
  const url = buildAuthorizeUrl({
    shop: shop.domain,
    clientId: shop.clientId,
    scopes: shop.scopes || DEFAULT_SCOPES.join(","),
    redirectUri,
    state,
  });
  return NextResponse.redirect(url);
}
