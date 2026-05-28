import { parseCsv } from "./csv";

// A Shopify product CSV spans MULTIPLE rows per product: the first row carries
// the Title + product fields; following rows (same Handle, empty Title) hold
// extra variants and images. We MUST group by Handle and never count those
// sub-rows as separate products.

export interface ProductImage {
  src: string;
  position: number;
  altText: string;
}

export interface ParsedProduct {
  handle: string;
  title: string;
  bodyHtml: string;
  vendor: string;
  productType: string;
  productCategory: string;
  tags: string;
  seoTitle: string;
  seoDescription: string;
  status: string;
  images: ProductImage[];
  variantCount: number;
  rowCount: number;
}

export interface CsvIssue {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  sample?: string[];
}

export interface ProductCsvAnalysis {
  products: ParsedProduct[];
  stats: {
    realProducts: number;
    totalRows: number;
    images: number;
    variants: number;
    metafieldColumns: string[];
  };
  issues: CsvIssue[];
}

const col = (row: Record<string, string>, names: string[]): string => {
  for (const n of names) if (row[n] !== undefined && row[n] !== "") return row[n];
  return "";
};

export function analyzeShopifyProductCsv(text: string): ProductCsvAnalysis {
  const { headers, rows } = parseCsv(text);

  // Column aliases (Shopify varies slightly across exports).
  const H = {
    handle: ["Handle"],
    title: ["Title"],
    body: ["Body (HTML)", "Body HTML", "Body"],
    vendor: ["Vendor"],
    type: ["Type", "Product Type"],
    category: ["Product Category", "Standard Product Type", "Google Shopping / Google Product Category"],
    tags: ["Tags"],
    seoTitle: ["SEO Title", "Metafield: title_tag [string]", "Title Tag"],
    seoDesc: ["SEO Description", "Metafield: description_tag [string]", "Description Tag"],
    status: ["Status"],
    imageSrc: ["Image Src"],
    imagePos: ["Image Position"],
    imageAlt: ["Image Alt Text"],
    variantSku: ["Variant SKU"],
    variantPrice: ["Variant Price"],
    option1: ["Option1 Value"],
  };

  const metafieldColumns = headers.filter((h) => /^Metafield:/i.test(h));
  const groups = new Map<string, Record<string, string>[]>();
  const order: string[] = [];

  for (const row of rows) {
    const handle = col(row, H.handle);
    if (!handle) continue;
    if (!groups.has(handle)) {
      groups.set(handle, []);
      order.push(handle);
    }
    groups.get(handle)!.push(row);
  }

  const products: ParsedProduct[] = [];
  let images = 0;
  let variants = 0;

  const issues: CsvIssue[] = [];
  const duplicateHandles: string[] = [];
  const altWithoutSrc: string[] = [];
  const missingTitle: string[] = [];

  for (const handle of order) {
    const groupRows = groups.get(handle)!;
    const headerRows = groupRows.filter((r) => col(r, H.title) !== "");

    if (headerRows.length === 0) {
      missingTitle.push(handle);
    }
    if (headerRows.length > 1) {
      duplicateHandles.push(handle);
    }

    const header = headerRows[0] ?? groupRows[0];

    const groupImages: ProductImage[] = [];
    let variantCount = 0;
    for (const r of groupRows) {
      const src = col(r, H.imageSrc);
      const alt = col(r, H.imageAlt);
      if (src) {
        images++;
        groupImages.push({
          src,
          position: Number(col(r, H.imagePos)) || groupImages.length + 1,
          altText: alt,
        });
      } else if (alt) {
        // Alt text on a row without an image source — invalid.
        altWithoutSrc.push(handle);
      }
      const isVariant =
        col(r, H.variantPrice) !== "" || col(r, H.variantSku) !== "" || col(r, H.option1) !== "";
      if (isVariant) {
        variants++;
        variantCount++;
      }
    }

    products.push({
      handle,
      title: col(header, H.title),
      bodyHtml: col(header, H.body),
      vendor: col(header, H.vendor),
      productType: col(header, H.type),
      productCategory: col(header, H.category),
      tags: col(header, H.tags),
      seoTitle: col(header, H.seoTitle),
      seoDescription: col(header, H.seoDesc),
      status: col(header, H.status),
      images: groupImages,
      variantCount: Math.max(variantCount, 1),
      rowCount: groupRows.length,
    });
  }

  // Build issue report.
  if (duplicateHandles.length) {
    issues.push({
      code: "DUPLICATE_HANDLE",
      severity: "error",
      message: `${duplicateHandles.length} handle(s) avec plusieurs lignes-produit (titre dupliqué).`,
      sample: duplicateHandles.slice(0, 10),
    });
  }
  if (missingTitle.length) {
    issues.push({
      code: "MISSING_TITLE",
      severity: "error",
      message: `${missingTitle.length} handle(s) sans aucune ligne avec un titre (lignes orphelines).`,
      sample: missingTitle.slice(0, 10),
    });
  }
  if (altWithoutSrc.length) {
    issues.push({
      code: "ALT_WITHOUT_SRC",
      severity: "error",
      message: `${altWithoutSrc.length} ligne(s) avec Image Alt Text mais sans Image Src.`,
      sample: Array.from(new Set(altWithoutSrc)).slice(0, 10),
    });
  }
  if (metafieldColumns.length) {
    issues.push({
      code: "METAFIELDS_PRESENT",
      severity: "warn",
      message: `${metafieldColumns.length} colonne(s) Metafield détectée(s) — vérifier avant import (risque d'écrasement).`,
      sample: metafieldColumns.slice(0, 10),
    });
  }
  const withCategory = products.filter((p) => p.productCategory).length;
  if (withCategory) {
    issues.push({
      code: "PRODUCT_CATEGORY_PRESENT",
      severity: "info",
      message: `${withCategory} produit(s) avec une Product Category — non vérifiée contre la taxonomie Shopify.`,
    });
  }

  return {
    products,
    stats: {
      realProducts: products.length,
      totalRows: rows.length,
      images,
      variants,
      metafieldColumns,
    },
    issues,
  };
}
