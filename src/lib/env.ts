// Bulletproof .env loader for Node entrypoints OUTSIDE Next.js
// (worker, seed, scripts). Importing this module loads .env automatically.
//
// Why not just `import "dotenv/config"`? It loads from `process.cwd()` only, so
// running the worker from a different shell cwd silently leaves env vars unset
// and you get "GEMINI_API_KEY is not set" even though .env has it.
//
// This module:
// - walks up from cwd AND from this file's own directory to find the repo root
//   (the directory containing package.json),
// - loads `.env` then `.env.local` (override),
// - logs a clear startup banner with what was loaded + any missing critical var.

import { config as dotenvConfig } from "dotenv";
import fs from "node:fs";
import path from "node:path";

const CRITICAL_VARS = ["DATABASE_URL", "APP_ENCRYPTION_KEY", "GEMINI_API_KEY"];

function findRepoRoot(start: string): string | null {
  let dir = path.resolve(start);
  for (let i = 0; i < 8; i++) {
    if (fs.existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function thisFileDir(): string {
  // CJS path used by tsx for compiled scripts.
  const g = globalThis as { __dirname?: string };
  if (typeof g.__dirname === "string") return g.__dirname;
  try {
    // Fallback for true ESM.
    return path.dirname(new URL(import.meta.url).pathname);
  } catch {
    return process.cwd();
  }
}

const candidates = Array.from(
  new Set([findRepoRoot(process.cwd()), findRepoRoot(thisFileDir())].filter((x): x is string => !!x))
);

const loaded: string[] = [];
let rootUsed: string | null = null;
for (const root of candidates) {
  for (const file of [".env", ".env.local"] as const) {
    const p = path.join(root, file);
    if (fs.existsSync(p)) {
      dotenvConfig({ path: p, override: file === ".env.local" });
      loaded.push(`${file} (${root})`);
      rootUsed = root;
    }
  }
  if (rootUsed) break; // first repo root that yielded any file wins
}

if (loaded.length === 0) {
  console.warn(
    `[env] Aucun fichier .env trouvé. cwd=${process.cwd()}. Lance la commande depuis la racine du repo, ou crée un .env.`
  );
} else {
  console.log(`[env] Chargé : ${loaded.join(" ; ")}`);
}

const missing = CRITICAL_VARS.filter((k) => !process.env[k] || process.env[k] === "");
if (missing.length) {
  console.warn(
    `[env] Variable(s) manquante(s) ou vide(s) : ${missing.join(", ")}. ` +
      `Renseigne-les dans .env (et redémarre le worker).`
  );
}
