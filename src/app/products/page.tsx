"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { safeReadJson } from "@/components/safeJson";

interface Shop {
  id: string;
  displayName: string;
  domain: string;
  connectionStatus?: string;
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
  ["vendor", "Fournisseur (= marque)"],
  ["handle", "Handle (non sécurisé uniquement)"],
] as const;

export default function ProductsPage() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"UPDATE_PRODUCTS" | "OPTIMIZE_SEO" | "CREATE_PRODUCTS">("UPDATE_PRODUCTS");
  const [batchSize, setBatchSize] = useState<10 | 25 | 50>(25);
  const [fields, setFields] = useState<Record<string, boolean>>({
    title: true,
    description: true,
    meta: true,
    tags: true,
    altText: true,
    internalLinking: true,
    vendor: false,
    handle: false,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/shops")
      .then(safeReadJson)
      .then((j) => {
        const list: Shop[] = j.data?.shops ?? [];
        setShops(list);
        if (list[0]) setShopId(list[0].id);
        if (!j.ok) setMsg(`Erreur chargement boutiques : ${j.error}`);
      })
      .catch(() => setMsg("Serveur injoignable (/api/shops)."));
  }, []);

  async function loadProducts(id: string) {
    const r = await fetch(`/api/products?shopId=${id}`).catch(() => null);
    if (!r) return;
    const j = await safeReadJson(r);
    setProducts(j.data?.products ?? []);
  }

  useEffect(() => {
    if (!shopId) return;
    loadProducts(shopId);
  }, [shopId]);

  const safeMode = mode === "UPDATE_PRODUCTS";
  const currentShop = shops.find((s) => s.id === shopId);

  async function sync() {
    setBusy(true);
    setMsg("Synchronisation depuis Shopify…");
    const r = await fetch(`/api/shops/${shopId}/sync?resource=products`, { method: "POST" });
    const j = await safeReadJson(r);
    setMsg(j.ok ? `${j.data?.synced ?? 0} produits synchronisés.` : `Erreur de synchronisation : ${j.error}`);
    if (j.ok) await loadProducts(shopId);
    setBusy(false);
  }

  // Explains exactly why "Générer" is disabled (or empty if it's enabled).
  function disabledReason(): string {
    if (busy) return "Traitement en cours…";
    if (shops.length === 0) return "Aucune boutique : ajoute-la dans Réglages.";
    if (!shopId) return "Sélectionne une boutique.";
    if (products.length === 0) return "Aucun produit en cache : clique « Synchroniser depuis Shopify » (ou « + Ajouter des produits »).";
    if (selected.size === 0) return "Sélectionne au moins un produit (5 / 50 / Tout).";
    return "";
  }

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  function selectFirst(n: number) {
    setSelected(new Set(products.slice(0, n).map((p) => p.id)));
  }
  function selectAll() {
    setSelected(new Set(products.map((p) => p.id)));
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
    const j = await safeReadJson(r);
    setBusy(false);
    // Generation runs async; follow progress on the job page.
    if (j.ok && j.data?.jobId) router.push(`/jobs/${j.data.jobId}`);
    else setMsg(`Erreur : ${j.error}`);
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
            <option value="OPTIMIZE_SEO">Optimisation SEO (handle modifiable)</option>
            <option value="CREATE_PRODUCTS">Création / refonte produits</option>
          </select>
          <a className="btn-secondary" href="/products/new">+ Ajouter des produits</a>
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn-primary"
            disabled={disabledReason() !== ""}
            onClick={launch}
          >
            Générer pour {selected.size} produit(s)
          </button>
          {disabledReason() && <span className="text-sm text-warn">{disabledReason()}</span>}
        </div>
        {currentShop && currentShop.connectionStatus !== "CONNECTED" && (
          <p className="text-xs text-warn">
            Boutique non confirmée connectée (statut : {currentShop.connectionStatus ?? "inconnu"}).
            La synchronisation et la publication nécessitent une connexion valide —
            teste-la dans <a className="underline" href="/settings">Réglages</a>.
          </p>
        )}
        <p className="text-xs text-gray-400">
          La génération est asynchrone : suis-la sur la page Job. Si elle reste à 0 %,
          lance le traitement avec « Traiter maintenant » (page Jobs) ou {""}
          <code>npm run worker</code> en local.
        </p>
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-gray-500">Sélection rapide :</span>
          <button className="btn-secondary" onClick={() => selectFirst(5)}>5</button>
          <button className="btn-secondary" onClick={() => selectFirst(50)}>50</button>
          <button className="btn-secondary" onClick={selectAll}>Tout</button>
          <button className="btn-secondary" onClick={() => setSelected(new Set())}>Aucun</button>
          <span className="text-gray-400">{selected.size} / {products.length} sélectionné(s)</span>
        </div>
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
