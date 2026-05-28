import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientForShop } from "@/lib/shopify/service";
import { SHOP_INFO_QUERY } from "@/lib/shopify/queries";

export const runtime = "nodejs";

// Live diagnostic: runs a tiny `shop { name }` query with the stored token and
// records the outcome. Always returns JSON { ok, status, ... } and logs the
// likely source (Shopify auth / scope / database / network) server-side.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  let shop;
  try {
    shop = await prisma.shop.findUnique({ where: { id: params.id } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[api/shops/test] database error: ${message}`);
    return NextResponse.json(
      { ok: false, status: "ERROR", source: "database", error: `Base de données injoignable (DATABASE_URL ?). ${message}` },
      { status: 500 }
    );
  }

  if (!shop) {
    return NextResponse.json({ ok: false, status: "ERROR", error: "Boutique introuvable" }, { status: 404 });
  }

  if (!shop.accessTokenEnc) {
    await prisma.shop.update({
      where: { id: shop.id },
      data: { connectionStatus: "NOT_CONNECTED", connectionCheckedAt: new Date(), connectionError: "Aucun token. Connecte la boutique." },
    });
    return NextResponse.json({ ok: false, status: "NOT_CONNECTED", tokenPresent: false, error: "Aucun token : connecte la boutique via Shopify." });
  }

  try {
    const client = await clientForShop(shop.id);
    const data = await client.request<{ shop: { name: string; myshopifyDomain: string } }>(SHOP_INFO_QUERY);
    await prisma.shop.update({
      where: { id: shop.id },
      data: { connectionStatus: "CONNECTED", connectionCheckedAt: new Date(), connectionError: null },
    });
    return NextResponse.json({
      ok: true,
      status: "CONNECTED",
      tokenPresent: true,
      shopName: data.shop.name,
      domain: data.shop.myshopifyDomain,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const m = message.toLowerCase();
    let source = "shopify";
    let status = "ERROR";
    if (/\b401\b|unauthorized|invalid api key|access token/i.test(m)) {
      source = "token";
      status = "TOKEN_INVALID";
    } else if (/\b403\b|access denied|scope|not approved/i.test(m)) {
      source = "scope";
      status = "TOKEN_INVALID";
    } else if (/fetch failed|enotfound|network|timeout|econnreset/i.test(m)) {
      source = "network";
    } else if (/app_encryption_key/i.test(m)) {
      source = "encryption_key";
    }
    console.error(`[api/shops/test] source=${source}: ${message}`);
    await prisma.shop.update({
      where: { id: shop.id },
      data: { connectionStatus: status === "TOKEN_INVALID" ? "TOKEN_INVALID" : "TOKEN_PRESENT", connectionCheckedAt: new Date(), connectionError: message },
    }).catch(() => {});
    return NextResponse.json({ ok: false, status, source, tokenPresent: true, error: message });
  }
}
