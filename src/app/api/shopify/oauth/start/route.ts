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
// merchant to Shopify's authorize screen. This endpoint is a full-page
// navigation, so errors redirect back to /settings (never raw JSON / blank).
export async function GET(req: Request) {
  const origin = appOriginFromRequest(req);
  const settingsError = (msg: string) =>
    NextResponse.redirect(`${origin}/settings?oauth_error=${encodeURIComponent(msg)}`);

  try {
    const { searchParams } = new URL(req.url);
    const shopId = searchParams.get("shopId");
    if (!shopId) return settingsError("shopId manquant.");

    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop) return settingsError("Boutique introuvable.");
    if (shop.authMode !== "OAUTH" || !shop.clientId) {
      return settingsError("Cette boutique n'est pas en mode OAuth (Client ID manquant).");
    }

    const state = randomState();
    await prisma.shop.update({ where: { id: shopId }, data: { oauthState: state } });

    const redirectUri = `${origin}/api/shopify/oauth/callback`;
    const url = buildAuthorizeUrl({
      shop: shop.domain,
      clientId: shop.clientId,
      scopes: shop.scopes || DEFAULT_SCOPES.join(","),
      redirectUri,
      state,
    });
    return NextResponse.redirect(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/shopify/oauth/start] ${message}`);
    return settingsError(`Démarrage OAuth échoué : ${message}`);
  }
}
