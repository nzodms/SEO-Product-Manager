import { parseCsv, toCsv } from "./csv";
import type { CsvIssue } from "./shopifyProducts";

// Matrixify Custom Collections export: collection-level fields appear on a
// collection's first row; product associations are rows (sharing the collection
// Handle) carrying "Product: Handle" + "Product: Position" (+ "Product: ID").

export interface CollectionAssociation {
  productHandle: string;
  position: number | null;
  productId: string;
}

export interface ParsedCollection {
  handle: string;
  title: string;
  bodyHtml: string;
  titleTag: string;
  descriptionTag: string;
  published: string;
  sortOrder: string;
  command: string;
  products: CollectionAssociation[];
}

export interface CollectionsAnalysis {
  collections: ParsedCollection[];
  stats: {
    collections: number;
    emptyCollections: number;
    associations: number;
    uniqueProducts: number;
  };
  issues: CsvIssue[];
}

const get = (row: Record<string, string>, names: string[]): string => {
  for (const n of names) if (row[n] !== undefined && row[n] !== "") return row[n];
  return "";
};

const COLS = {
  handle: ["Handle"],
  title: ["Title"],
  body: ["Body HTML", "Body (HTML)", "Body"],
  titleTag: ["Metafield: title_tag [string]", "SEO Title", "Title Tag"],
  descTag: ["Metafield: description_tag [string]", "SEO Description", "Description Tag"],
  published: ["Published"],
  sortOrder: ["Sort Order"],
  command: ["Command"],
  productHandle: ["Product: Handle"],
  productPosition: ["Product: Position"],
  productId: ["Product: ID"],
};

export function analyzeMatrixifyCollections(text: string): CollectionsAnalysis {
  const { rows } = parseCsv(text);
  const byHandle = new Map<string, ParsedCollection>();
  const order: string[] = [];
  const issues: CsvIssue[] = [];
  const missingHandleRows: number[] = [];

  rows.forEach((row, idx) => {
    const handle = get(row, COLS.handle);
    if (!handle) {
      // A product association with no collection handle is unusable.
      if (get(row, COLS.productHandle)) missingHandleRows.push(idx + 2);
      return;
    }
    if (!byHandle.has(handle)) {
      byHandle.set(handle, {
        handle,
        title: get(row, COLS.title),
        bodyHtml: get(row, COLS.body),
        titleTag: get(row, COLS.titleTag),
        descriptionTag: get(row, COLS.descTag),
        published: get(row, COLS.published),
        sortOrder: get(row, COLS.sortOrder),
        command: get(row, COLS.command) || "MERGE",
        products: [],
      });
      order.push(handle);
    }
    const collection = byHandle.get(handle)!;
    // Fill collection-level fields from whichever row has them.
    if (!collection.title) collection.title = get(row, COLS.title);
    if (!collection.bodyHtml) collection.bodyHtml = get(row, COLS.body);
    if (!collection.titleTag) collection.titleTag = get(row, COLS.titleTag);
    if (!collection.descriptionTag) collection.descriptionTag = get(row, COLS.descTag);

    const productHandle = get(row, COLS.productHandle);
    if (productHandle) {
      const posRaw = get(row, COLS.productPosition);
      collection.products.push({
        productHandle,
        position: posRaw ? Number(posRaw) : null,
        productId: get(row, COLS.productId),
      });
    }
  });

  const collections = order.map((h) => byHandle.get(h)!);
  const allProductHandles = new Set<string>();
  let associations = 0;
  let emptyCollections = 0;
  const duplicateAssoc: string[] = [];

  for (const c of collections) {
    if (c.products.length === 0) emptyCollections++;
    const seen = new Set<string>();
    for (const p of c.products) {
      associations++;
      allProductHandles.add(p.productHandle);
      if (seen.has(p.productHandle)) duplicateAssoc.push(`${c.handle} → ${p.productHandle}`);
      seen.add(p.productHandle);
    }
  }

  if (missingHandleRows.length) {
    issues.push({
      code: "MISSING_COLLECTION_HANDLE",
      severity: "error",
      message: `${missingHandleRows.length} association(s) sans handle de collection.`,
      sample: missingHandleRows.slice(0, 10).map(String),
    });
  }
  if (duplicateAssoc.length) {
    issues.push({
      code: "DUPLICATE_ASSOCIATION",
      severity: "warn",
      message: `${duplicateAssoc.length} association(s) en doublon.`,
      sample: duplicateAssoc.slice(0, 10),
    });
  }
  if (emptyCollections) {
    issues.push({
      code: "EMPTY_COLLECTIONS",
      severity: "info",
      message: `${emptyCollections} collection(s) vide(s) (conservée(s) à l'export).`,
    });
  }

  return {
    collections,
    stats: {
      collections: collections.length,
      emptyCollections,
      associations,
      uniqueProducts: allProductHandles.size,
    },
    issues,
  };
}

export interface RebuildReport {
  collectionsKept: number;
  associationsKept: number;
  associationsRemoved: number;
  notFound: Array<{ collection: string; oldHandle: string }>;
}

const EXPORT_HEADERS = [
  "Handle",
  "Title",
  "Body HTML",
  "Published",
  "Sort Order",
  "Metafield: title_tag [string]",
  "Metafield: description_tag [string]",
  "Command",
  "Product: Handle",
  "Product: Position",
];

// Rebuilds a Matrixify-compatible Custom Collections CSV:
// - keeps every collection (including empty ones),
// - replaces old product handles with the matched new ones,
// - clears old Product: ID (never reuse IDs across shops),
// - keeps positions,
// - drops associations whose product was not matched (reported, never silently shipped).
export function rebuildMatrixifyCollections(
  collections: ParsedCollection[],
  handleMap: Record<string, string>
): { csv: string; report: RebuildReport } {
  const out: Record<string, string>[] = [];
  const report: RebuildReport = {
    collectionsKept: 0,
    associationsKept: 0,
    associationsRemoved: 0,
    notFound: [],
  };

  for (const c of collections) {
    // Collection header row (preserves empty collections too).
    out.push({
      Handle: c.handle,
      Title: c.title,
      "Body HTML": c.bodyHtml,
      Published: c.published || "true",
      "Sort Order": c.sortOrder,
      "Metafield: title_tag [string]": c.titleTag,
      "Metafield: description_tag [string]": c.descriptionTag,
      Command: c.command || "MERGE",
      "Product: Handle": "",
      "Product: Position": "",
    });
    report.collectionsKept++;

    for (const p of c.products) {
      const newHandle = handleMap[p.productHandle];
      if (!newHandle) {
        report.associationsRemoved++;
        report.notFound.push({ collection: c.handle, oldHandle: p.productHandle });
        continue;
      }
      out.push({
        Handle: c.handle,
        Title: "",
        "Body HTML": "",
        Published: "",
        "Sort Order": "",
        "Metafield: title_tag [string]": "",
        "Metafield: description_tag [string]": "",
        Command: "MERGE",
        "Product: Handle": newHandle,
        "Product: Position": p.position != null ? String(p.position) : "",
      });
      report.associationsKept++;
    }
  }

  return { csv: toCsv(EXPORT_HEADERS, out), report };
}
