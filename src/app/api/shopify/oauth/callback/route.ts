import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encryptToken, decryptToken } from "@/lib/security/crypto";
import {
  verifyOauthHmac,
  exchangeCodeForToken,
  normalizeShopDomain,
  isValidShopDomain,
} from "@/lib/shopify/oauth";

export const runtime = "nodejs";

// Shopify redirects here after the merchant approves. We validate HMAC + state,
// exchange the code for a (long-lived, offline) access token, and store it
// encrypted. The Client Secret never leaves the server.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sp = url.searchParams;
  const shopParam = normalizeShopDomain(sp.get("shop") ?? "");
  const code = sp.get("code");
  const state = sp.get("state");

  const fail = (msg: string) =>
    NextResponse.redirect(`${url.origin}/settings?oauth_error=${encodeURIComponent(msg)}`);

  if (!shopParam || !code || !state || !isValidShopDomain(shopParam)) {
    return fail("Paramètres OAuth manquants ou invalides.");
  }

  const shop = await prisma.shop.findUnique({ where: { domain: shopParam } });
  if (!shop || shop.authMode !== "OAUTH" || !shop.clientId || !shop.clientSecretEnc) {
    return fail("Boutique OAuth introuvable.");
  }
  if (!shop.oauthState || shop.oauthState !== state) {
    return fail("State OAuth invalide (CSRF).");
  }

  const clientSecret = decryptToken(shop.clientSecretEnc);
  if (!verifyOauthHmac(sp, clientSecret)) {
    return fail("Signature HMAC invalide.");
  }

  try {
    const { accessToken } = await exchangeCodeForToken({
      shop: shopParam,
      clientId: shop.clientId,
      clientSecret,
      code,
    });
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        accessTokenEnc: encryptToken(accessToken),
        tokenObtainedAt: new Date(),
        oauthState: null,
        connectionStatus: "TOKEN_PRESENT",
        connectionError: null,
      },
    });
    return NextResponse.redirect(`${url.origin}/settings?connected=${shop.id}`);
  } catch (err) {
    await prisma.shop.update({
      where: { id: shop.id },
      data: { connectionStatus: "TOKEN_INVALID", connectionError: err instanceof Error ? err.message : "Échange échoué" },
    });
    return fail(err instanceof Error ? err.message : "Échange OAuth échoué.");
  }
}
