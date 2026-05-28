"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Shop { id: string; displayName: string }
interface IntakeProduct {
  title: string;
  productType?: string;
  vendor?: string;
  tags?: string[];
  bodyHtml?: string;
}

export default function NewProductsPage() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [tab, setTab] = useState<"paste" | "csv">("paste");

  // Paste form (single product).
  const [form, setForm] = useState({ title: "", productType: "", vendor: "", tags: "", bodyHtml: "" });
  // CSV.
  const [csvProducts, setCsvProducts] = useState<IntakeProduct[]>([]);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/shops").then((r) => r.json()).then((d) => {
      setShops(d.shops ?? []);
      if (d.shops?.[0]) setShopId(d.shops[0].id);
    });
  }, []);

  function onCsv(file: File) {
    const reader = new FileReader();
    reader.onload = () => setCsvProducts(parseCsv(String(reader.result)));
    reader.readAsText(file);
  }

  async function submit() {
    const products: IntakeProduct[] =
      tab === "paste"
        ? [{
            title: form.title.trim(),
            productType: form.productType.trim() || undefined,
            vendor: form.vendor.trim() || undefined,
            tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
            bodyHtml: form.bodyHtml.trim() || undefined,
          }]
        : csvProducts;

    if (!products.length || products.some((p) => !p.title)) {
      setMsg("Au moins un produit avec un titre est requis.");
      return;
    }

    setBusy(true);
    setMsg("Création des brouillons + mise en file…");
    // 1. Create local DRAFT products.
    const intake = await fetch("/api/products/intake", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shopId, products }),
    });
    const intakeData = await intake.json();
    if (!intake.ok) {
      setBusy(false);
      setMsg(`Erreur : ${JSON.stringify(intakeData.error)}`);
      return;
    }
    // 2. Enqueue a CREATE generation run over them.
    const run = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId,
        mode: "CREATE_PRODUCTS",
        resourceIds: intakeData.productIds,
        fields: {
          title: true, description: true, meta: true, handle: true,
          tags: true, altText: false, internalLinking: true, vendor: true,
        },
        batchSize: 25,
      }),
    });
    const runData = await run.json();
    setBusy(false);
    if (run.ok) router.push(`/jobs/${runData.jobId}`);
    else setMsg(`Erreur : ${JSON.stringify(runData.error)}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">Ajouter des produits</h1>
        <select className="rounded border border-gray-300 px-2 py-1.5 text-sm" value={shopId} onChange={(e) => setShopId(e.target.value)}>
          {shops.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
      </div>

      <div className="flex gap-2">
        <button className={tab === "paste" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("paste")}>Copier-coller</button>
        <button className={tab === "csv" ? "btn-primary" : "btn-secondary"} onClick={() => setTab("csv")}>Import CSV</button>
      </div>

      {tab === "paste" ? (
        <div className="card space-y-3 text-sm">
          <Field label="Titre / nom de base du produit *">
            <input className="inp" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Lustre cristal salon" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type de produit">
              <input className="inp" value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })} placeholder="Lustre" />
            </Field>
            <Field label="Fournisseur (laisser vide = marque)">
              <input className="inp" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            </Field>
          </div>
          <Field label="Tags (séparés par des virgules)">
            <input className="inp" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="lustre, cristal, salon" />
          </Field>
          <Field label="Notes / infos produit (facultatif)">
            <textarea className="inp h-28" value={form.bodyHtml} onChange={(e) => setForm({ ...form, bodyHtml: e.target.value })} placeholder="Matériaux, dimensions connues, style… (l'IA ne doit rien inventer)" />
          </Field>
        </div>
      ) : (
        <div className="card space-y-3 text-sm">
          <p className="text-gray-600">
            CSV avec en-têtes : <code>Title, Type, Vendor, Tags, Body</code> (seul <code>Title</code> est obligatoire).
          </p>
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onCsv(e.target.files[0])} />
          {csvProducts.length > 0 && (
            <p className="text-gray-600">{csvProducts.length} produit(s) détecté(s) dans le CSV.</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={busy || !shopId} onClick={submit}>
          Générer la fiche produit
        </button>
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>
      <p className="text-xs text-gray-400">
        Les produits sont créés en brouillon (DRAFT) dans Shopify uniquement après votre validation des résultats.
      </p>

      <style jsx global>{`
        .inp { width: 100%; border: 1px solid #d1d5db; border-radius: 0.375rem; padding: 0.375rem 0.5rem; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-gray-600">{label}</span>
      {children}
    </label>
  );
}

// Minimal CSV parser (handles quoted fields with commas and escaped quotes).
function parseCsv(text: string): IntakeProduct[] {
  const rows = splitCsvRows(text);
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  const ti = idx("title"), pi = idx("type"), vi = idx("vendor"), gi = idx("tags"), bi = idx("body");
  return rows
    .slice(1)
    .filter((r) => r[ti]?.trim())
    .map((r) => ({
      title: r[ti].trim(),
      productType: pi >= 0 ? r[pi]?.trim() || undefined : undefined,
      vendor: vi >= 0 ? r[vi]?.trim() || undefined : undefined,
      tags: gi >= 0 && r[gi] ? r[gi].split(/[,;]/).map((t) => t.trim()).filter(Boolean) : undefined,
      bodyHtml: bi >= 0 ? r[bi]?.trim() || undefined : undefined,
    }));
}

function splitCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x !== "")) rows.push(row); }
  return rows;
}
