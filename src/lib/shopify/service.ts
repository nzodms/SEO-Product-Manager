import { prisma } from "@/lib/db";
import { decryptToken } from "@/lib/security/crypto";
import { ShopifyClient } from "./client";
import { PRODUCTS_QUERY, COLLECTIONS_QUERY } from "./queries";
import {
  PRODUCT_UPDATE_MUTATION,
  PRODUCT_UPDATE_MEDIA_MUTATION,
  COLLECTION_UPDATE_MUTATION,
  PRODUCT_CREATE_MUTATION,
} from "./mutations";
import type { ProductImage } from "@/lib/security/guards";

// Build an authenticated client for a managed shop.
export async function clientForShop(shopId: string): Promise<ShopifyClient> {
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop) throw new Error("Shop not found.");
  if (!shop.accessTokenEnc) throw new Error("Shop has no access token configured.");
  return new ShopifyClient({
    domain: shop.domain,
    accessToken: decryptToken(shop.accessTokenEnc),
    apiVersion: shop.apiVersion,
  });
}

// ---- Read & cache --------------------------------------------------------
interface RawProduct {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string | null;
  vendor: string | null;
  productType: string | null;
  tags: string[];
  status: string;
  seo: { title: string | null; description: string | null } | null;
  media: {
    nodes: Array<{ id?: string; image?: { url: string; altText: string | null } }>;
  };
}

export function mapImages(p: RawProduct): ProductImage[] {
  return p.media.nodes
    .filter((n) => n.image)
    .map((n, i) => ({
      shopifyId: n.id,
      src: n.image!.url ?? "",
      altText: n.image!.altText ?? "",
      position: i + 1,
    }));
}

export async function syncProducts(shopId: string, queryFilter?: string, max = 100) {
  const client = await clientForShop(shopId);
  let after: string | null = null;
  let fetched = 0;
  const collected: RawProduct[] = [];

  do {
    const data: { products: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawProduct[] } } =
      await client.request(PRODUCTS_QUERY, {
        first: Math.min(50, max - fetched),
        after,
        query: queryFilter ?? null,
      });
    collected.push(...data.products.nodes);
    fetched += data.products.nodes.length;
    after = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (after && fetched < max);

  for (const p of collected) {
    await prisma.product.upsert({
      where: { shopId_shopifyId: { shopId, shopifyId: p.id } },
      create: {
        shopId,
        shopifyId: p.id,
        handle: p.handle,
        title: p.title,
        bodyHtml: p.descriptionHtml,
        vendor: p.vendor,
        productType: p.productType,
        tags: (p.tags ?? []).join(","),
        seoTitle: p.seo?.title ?? null,
        seoDescription: p.seo?.description ?? null,
        imagesJson: JSON.stringify(mapImages(p)),
        status: p.status,
      },
      update: {
        handle: p.handle,
        title: p.title,
        bodyHtml: p.descriptionHtml,
        vendor: p.vendor,
        productType: p.productType,
        tags: (p.tags ?? []).join(","),
        seoTitle: p.seo?.title ?? null,
        seoDescription: p.seo?.description ?? null,
        imagesJson: JSON.stringify(mapImages(p)),
        status: p.status,
        syncedAt: new Date(),
      },
    });
  }
  return collected.length;
}

interface RawCollection {
  id: string;
  handle: string;
  title: string;
  descriptionHtml: string | null;
  seo: { title: string | null; description: string | null } | null;
}

export async function syncCollections(shopId: string, queryFilter?: string, max = 100) {
  const client = await clientForShop(shopId);
  let after: string | null = null;
  let fetched = 0;
  const collected: RawCollection[] = [];

  do {
    const data: { collections: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: RawCollection[] } } =
      await client.request(COLLECTIONS_QUERY, {
        first: Math.min(50, max - fetched),
        after,
        query: queryFilter ?? null,
      });
    collected.push(...data.collections.nodes);
    fetched += data.collections.nodes.length;
    after = data.collections.pageInfo.hasNextPage ? data.collections.pageInfo.endCursor : null;
  } while (after && fetched < max);

  for (const c of collected) {
    await prisma.collection.upsert({
      where: { shopId_shopifyId: { shopId, shopifyId: c.id } },
      create: {
        shopId,
        shopifyId: c.id,
        handle: c.handle,
        title: c.title,
        bodyHtml: c.descriptionHtml,
        seoTitle: c.seo?.title ?? null,
        seoDescription: c.seo?.description ?? null,
      },
      update: {
        handle: c.handle,
        title: c.title,
        bodyHtml: c.descriptionHtml,
        seoTitle: c.seo?.title ?? null,
        seoDescription: c.seo?.description ?? null,
        syncedAt: new Date(),
      },
    });
  }
  return collected.length;
}

// ---- Write ---------------------------------------------------------------
interface UserError {
  field: string[] | null;
  message: string;
}

// Pushes only the provided product fields. Alt text is applied via a separate
// media mutation that never touches src/position.
export async function applyProductUpdate(
  shopId: string,
  shopifyId: string,
  fields: {
    title?: string;
    bodyHtml?: string;
    handle?: string;
    tags?: string[];
    vendor?: string;
    seoTitle?: string;
    seoDescription?: string;
    images?: ProductImage[];
  }
): Promise<void> {
  const client = await clientForShop(shopId);

  const input: Record<string, unknown> = { id: shopifyId };
  if (fields.title !== undefined) input.title = fields.title;
  if (fields.bodyHtml !== undefined) input.descriptionHtml = fields.bodyHtml;
  if (fields.handle !== undefined) input.handle = fields.handle;
  if (fields.tags !== undefined) input.tags = fields.tags;
  if (fields.vendor !== undefined) input.vendor = fields.vendor;
  if (fields.seoTitle !== undefined || fields.seoDescription !== undefined) {
    input.seo = {
      ...(fields.seoTitle !== undefined ? { title: fields.seoTitle } : {}),
      ...(fields.seoDescription !== undefined ? { description: fields.seoDescription } : {}),
    };
  }

  // Only call productUpdate if there's something beyond images to set.
  if (Object.keys(input).length > 1) {
    const res = await client.request<{
      productUpdate: { userErrors: UserError[] };
    }>(PRODUCT_UPDATE_MUTATION, { input });
    assertNoUserErrors(res.productUpdate.userErrors);
  }

  // Alt text: only images that have a src and a non-empty alt.
  if (fields.images?.length) {
    const media = fields.images
      .filter((img) => img.shopifyId && img.src && img.altText !== undefined)
      .map((img) => ({ id: img.shopifyId, alt: img.altText }));
    if (media.length) {
      const res = await client.request<{
        productUpdateMedia: { mediaUserErrors: UserError[] };
      }>(PRODUCT_UPDATE_MEDIA_MUTATION, { productId: shopifyId, media });
      assertNoUserErrors(res.productUpdateMedia.mediaUserErrors);
    }
  }
}

// Creates a new product. Defaults to DRAFT status so nothing goes live on the
// storefront without an explicit publish — anti-casse for intake products.
export async function createProductInShopify(
  shopId: string,
  fields: {
    title: string;
    bodyHtml?: string;
    handle?: string;
    tags?: string[];
    vendor?: string;
    productType?: string;
    seoTitle?: string;
    seoDescription?: string;
  }
): Promise<string> {
  const client = await clientForShop(shopId);
  const input: Record<string, unknown> = { title: fields.title, status: "DRAFT" };
  if (fields.bodyHtml !== undefined) input.descriptionHtml = fields.bodyHtml;
  if (fields.handle !== undefined) input.handle = fields.handle;
  if (fields.tags !== undefined) input.tags = fields.tags;
  if (fields.vendor !== undefined) input.vendor = fields.vendor;
  if (fields.productType !== undefined) input.productType = fields.productType;
  if (fields.seoTitle !== undefined || fields.seoDescription !== undefined) {
    input.seo = {
      ...(fields.seoTitle !== undefined ? { title: fields.seoTitle } : {}),
      ...(fields.seoDescription !== undefined ? { description: fields.seoDescription } : {}),
    };
  }
  const res = await client.request<{
    productCreate: { product: { id: string } | null; userErrors: UserError[] };
  }>(PRODUCT_CREATE_MUTATION, { input });
  assertNoUserErrors(res.productCreate.userErrors);
  if (!res.productCreate.product) throw new Error("productCreate returned no product.");
  return res.productCreate.product.id;
}

export async function applyCollectionUpdate(
  shopId: string,
  shopifyId: string,
  fields: { bodyHtml?: string; seoTitle?: string; seoDescription?: string }
): Promise<void> {
  const client = await clientForShop(shopId);
  const input: Record<string, unknown> = { id: shopifyId };
  if (fields.bodyHtml !== undefined) input.descriptionHtml = fields.bodyHtml;
  if (fields.seoTitle !== undefined || fields.seoDescription !== undefined) {
    input.seo = {
      ...(fields.seoTitle !== undefined ? { title: fields.seoTitle } : {}),
      ...(fields.seoDescription !== undefined ? { description: fields.seoDescription } : {}),
    };
  }
  const res = await client.request<{ collectionUpdate: { userErrors: UserError[] } }>(
    COLLECTION_UPDATE_MUTATION,
    { input }
  );
  assertNoUserErrors(res.collectionUpdate.userErrors);
}

function assertNoUserErrors(errors: UserError[]) {
  if (errors?.length) {
    throw new Error(
      "Shopify userErrors: " +
        errors.map((e) => `${(e.field ?? []).join(".")}: ${e.message}`).join("; ")
    );
  }
}
