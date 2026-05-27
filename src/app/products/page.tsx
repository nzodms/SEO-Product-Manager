"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Shop {
  id: string;
  displayName: string;
  domain: string;
}
interface Product {
  id: string;
  title: string;
  handle: string;
  seoTitle: string | null;
  status: string;
}

const FIELD_KEYS = [
  ["title", "Titre"],
  ["description", "Description HTML"],
  ["meta", "SEO title + meta"],
  ["tags", "Tags"],
  ["altText", "Alt text images"],
  ["internalLinking", "Maillage interne"],
  ["handle", "Handle (création uniquement)"],
] as const;

export default function ProductsPage() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"UPDATE_PRODUCTS" | "CREATE_PRODUCTS">("UPDATE_PRODUCTS");
  const [batchSize, setBatchSize] = useState<10 | 25 | 50>(25);
  const [fields, setFields] = useState<Record<string, boolean>>({
    title: true,
    description: true,
    meta: true,
    tags: true,
    altText: true,
    internalLinking: true,
    handle: false,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/shops")
      .then((r) => r.json())
      .then((d) => {
        setShops(d.shops ?? []);
        if (d.shops?.[0]) setShopId(d.shops[0].id);
      });
  }, []);

  useEffect(() => {
    if (!shopId) return;
    fetch(`/api/products?shopId=${shopId}`)
      .then((r) => r.json())
      .then((d) => setProducts(d.products ?? []));
  }, [shopId]);

  const safeMode = mode === "UPDATE_PRODUCTS";

  async function sync() {
    setBusy(true);
    setMsg("Synchronisation depuis Shopify…");
    const r = await fetch(`/api/shops/${shopId}/sync?resource=products`, { method: "POST" });
    const d = await r.json();
    setMsg(r.ok ? `${d.synced} produits synchronisés.` : `Erreur : ${d.error}`);
    if (r.ok) {
      const pr = await fetch(`/api/products?shopId=${shopId}`).then((x) => x.json());
      setProducts(pr.products ?? []);
    }
    setBusy(false);
  }

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function launch() {
    setBusy(true);
    setMsg("Mise en file d'attente…");
    const effectiveFields = { ...fields, handle: safeMode ? false : fields.handle };
    const r = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId,
        mode,
        resourceIds: [...selected],
        fields: effectiveFields,
        batchSize,
      }),
    });
    const d = await r.json();
    setBusy(false);
    // Generation runs async in the worker; follow progress on the job page.
    if (r.ok) router.push(`/jobs/${d.jobId}`);
    else setMsg(`Erreur : ${JSON.stringify(d.error)}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          value={shopId}
          onChange={(e) => setShopId(e.target.value)}
        >
          {shops.map((s) => (
            <option key={s.id} value={s.id}>{s.displayName}</option>
          ))}
        </select>
        <button className="btn-secondary" onClick={sync} disabled={busy || !shopId}>
          Synchroniser depuis Shopify
        </button>
        <a className="btn-secondary" href={`/api/export?shopId=${shopId}`}>
          Export CSV (sauvegarde)
        </a>
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>

      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm font-medium">Mode :</label>
          <select
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="UPDATE_PRODUCTS">Mise à jour sécurisée (handle &amp; images verrouillés)</option>
            <option value="CREATE_PRODUCTS">Création / refonte produits</option>
          </select>
          <label className="text-sm font-medium">Lot :</label>
          <select
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            value={batchSize}
            onChange={(e) => setBatchSize(Number(e.target.value) as 10 | 25 | 50)}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-3">
          {FIELD_KEYS.map(([key, label]) => {
            const locked = key === "handle" && safeMode;
            return (
              <label key={key} className={`flex items-center gap-1.5 text-sm ${locked ? "opacity-40" : ""}`}>
                <input
                  type="checkbox"
                  disabled={locked}
                  checked={!locked && fields[key]}
                  onChange={(e) => setFields({ ...fields, [key]: e.target.checked })}
                />
                {label}
              </label>
            );
          })}
        </div>
        <button
          className="btn-primary"
          disabled={busy || selected.size === 0}
          onClick={launch}
        >
          Générer pour {selected.size} produit(s)
        </button>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="w-8"></th>
              <th className="py-1">Titre</th>
              <th>Handle</th>
              <th>SEO title</th>
              <th>Statut</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-gray-100">
                <td className="py-1.5">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                </td>
                <td>{p.title}</td>
                <td className="text-gray-400">{p.handle}</td>
                <td className="text-gray-400">{p.seoTitle ?? "—"}</td>
                <td>{p.status}</td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-400">
                  Aucun produit en cache. Cliquez sur « Synchroniser depuis Shopify ».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
