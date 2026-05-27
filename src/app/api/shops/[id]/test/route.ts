import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { clientForShop } from "@/lib/shopify/service";
import { SHOP_INFO_QUERY } from "@/lib/shopify/queries";

export const runtime = "nodejs";

// Live diagnostic: runs a tiny `shop { name }` query with the stored token and
// records the outcome. Distinguishes "no token yet" from "token invalid" (401,
// e.g. app uninstalled) so the UI can prompt a reconnect.
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const shop = await prisma.shop.findUnique({ where: { id: params.id } });
  if (!shop) return NextResponse.json({ error: "Boutique introuvable" }, { status: 404 });

  if (!shop.accessTokenEnc) {
    await prisma.shop.update({
      where: { id: shop.id },
      data: { connectionStatus: "NOT_CONNECTED", connectionCheckedAt: new Date(), connectionError: "Aucun token. Connecte la boutique." },
    });
    return NextResponse.json({ status: "NOT_CONNECTED", tokenPresent: false });
  }

  try {
    const client = await clientForShop(shop.id);
    const data = await client.request<{ shop: { name: string; myshopifyDomain: string } }>(SHOP_INFO_QUERY);
    await prisma.shop.update({
      where: { id: shop.id },
      data: { connectionStatus: "CONNECTED", connectionCheckedAt: new Date(), connectionError: null },
    });
    return NextResponse.json({
      status: "CONNECTED",
      tokenPresent: true,
      shopName: data.shop.name,
      domain: data.shop.myshopifyDomain,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const invalid = /\b401\b|403|access denied|unauthorized/i.test(message);
    await prisma.shop.update({
      where: { id: shop.id },
      data: {
        connectionStatus: invalid ? "TOKEN_INVALID" : "TOKEN_PRESENT",
        connectionCheckedAt: new Date(),
        connectionError: message,
      },
    });
    return NextResponse.json({
      status: invalid ? "TOKEN_INVALID" : "ERROR",
      tokenPresent: true,
      error: message,
    });
  }
}
