// Deterministic safety guards. These run in code (not via the LLM) so the
// hard rules are enforced regardless of what any agent returns. The QC *agent*
// is a second opinion; THIS is the gate that cannot be talked around.

export interface ProductImage {
  shopifyId?: string;
  src: string;
  altText: string;
  position: number;
}

export interface DraftFields {
  title?: string;
  bodyHtml?: string;
  seoTitle?: string;
  seoDescription?: string;
  handle?: string;
  tags?: string[];
  vendor?: string;
  images?: ProductImage[];
}

export interface RunContext {
  safeMode: boolean; // true => UPDATE mode: never change handle/images
  metaSuffix: string; // required meta-description ending
  storeDomain: string; // current store domain (links must not point elsewhere)
  oldDomains?: string[]; // legacy domains that must never appear
  existingTitles?: string[]; // for duplicate detection
  existingBrandedNames?: string[];
}

export interface GuardIssue {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  field: string;
}

const BAD_ENDINGS = ["et", "ou", "en", "de", "-", "à", "le", "la"];
const INTERNAL_JARGON = [
  "maillage interne",
  "mot-clé principal",
  "mot clé principal",
  "référencement",
  "cette page travaille",
];

const META_MAX = 160;

export function runGuards(
  before: DraftFields,
  after: DraftFields,
  ctx: RunContext
): GuardIssue[] {
  const issues: GuardIssue[] = [];
  const add = (
    severity: GuardIssue["severity"],
    code: string,
    field: string,
    message: string
  ) => issues.push({ severity, code, field, message });

  // 1. Handle protection in safe (update) mode.
  if (
    ctx.safeMode &&
    after.handle !== undefined &&
    before.handle !== undefined &&
    after.handle !== before.handle
  ) {
    add(
      "error",
      "HANDLE_LOCKED",
      "handle",
      `Mode mise à jour : le handle ne doit pas changer ("${before.handle}" → "${after.handle}").`
    );
  }

  // 2. Image protection: src/position/count must never change here.
  if (after.images && before.images) {
    if (after.images.length !== before.images.length) {
      add("error", "IMAGE_COUNT_CHANGED", "images", "Le nombre d'images a changé.");
    }
    for (const img of after.images) {
      const orig = before.images.find((b) => b.position === img.position);
      if (orig && orig.src !== img.src) {
        add(
          "error",
          "IMAGE_SRC_CHANGED",
          "images",
          `Image src modifiée en position ${img.position}.`
        );
      }
      // 3. Alt text must be empty when src is empty.
      if ((!img.src || img.src.trim() === "") && img.altText && img.altText.trim() !== "") {
        add(
          "error",
          "ALT_WITHOUT_SRC",
          "images",
          `Alt text rempli alors que l'image n'a pas de src (position ${img.position}).`
        );
      }
    }
  }

  // 4. Meta description length + required suffix.
  if (after.seoDescription !== undefined) {
    const meta = after.seoDescription.trim();
    if (meta.length > META_MAX) {
      add(
        "error",
        "META_TOO_LONG",
        "seoDescription",
        `Meta description ${meta.length} caractères (max ${META_MAX}).`
      );
    }
    if (!meta.endsWith(ctx.metaSuffix)) {
      add(
        "error",
        "META_SUFFIX_MISSING",
        "seoDescription",
        `La meta description doit se terminer par "${ctx.metaSuffix}".`
      );
    }
  }

  // 5. Title quality: bad trailing words.
  if (after.title) {
    const t = after.title.trim().replace(/[.!?]+$/, "");
    const lastWord = t.split(/\s+/).pop()?.toLowerCase() ?? "";
    if (BAD_ENDINGS.includes(lastWord) || t.endsWith("-")) {
      add(
        "error",
        "TITLE_BAD_ENDING",
        "title",
        `Le titre se termine par un mot interdit ("${lastWord}").`
      );
    }
    // 6. Duplicate title detection.
    if (
      ctx.existingTitles?.some(
        (x) => x.trim().toLowerCase() === after.title!.trim().toLowerCase()
      )
    ) {
      add("warn", "TITLE_DUPLICATE", "title", "Titre déjà utilisé par un autre produit.");
    }
  }

  // 7. Internal jargon / internal notes leaking into public text.
  for (const field of ["bodyHtml", "seoDescription", "seoTitle", "title"] as const) {
    const value = after[field];
    if (typeof value === "string") {
      const lower = value.toLowerCase();
      for (const term of INTERNAL_JARGON) {
        if (lower.includes(term)) {
          add(
            "error",
            "INTERNAL_JARGON",
            field,
            `Terme interne interdit dans le texte public : "${term}".`
          );
        }
      }
      // 8. Links to legacy domains.
      for (const old of ctx.oldDomains ?? []) {
        if (old && lower.includes(old.toLowerCase())) {
          add(
            "error",
            "LEGACY_DOMAIN_LINK",
            field,
            `Lien vers un ancien domaine détecté : "${old}".`
          );
        }
      }
    }
  }

  return issues;
}

export function verdictFromIssues(issues: GuardIssue[]): "OK" | "REVIEW" | "RISK" {
  if (issues.some((i) => i.severity === "error")) return "RISK";
  if (issues.some((i) => i.severity === "warn")) return "REVIEW";
  return "OK";
}
