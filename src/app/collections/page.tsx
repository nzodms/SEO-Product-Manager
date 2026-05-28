"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface Shop { id: string; displayName: string }
interface Collection { id: string; title: string; handle: string; seoTitle: string | null }

export default function CollectionsPage() {
  const router = useRouter();
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState<10 | 25 | 50>(25);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch("/api/shops").then((r) => r.json()).then((d) => {
      setShops(d.shops ?? []);
      if (d.shops?.[0]) setShopId(d.shops[0].id);
    });
  }, []);

  useEffect(() => {
    if (!shopId) return;
    fetch(`/api/collections?shopId=${shopId}`).then((r) => r.json()).then((d) => setCollections(d.collections ?? []));
  }, [shopId]);

  async function sync() {
    setBusy(true);
    setMsg("Synchronisation…");
    const r = await fetch(`/api/shops/${shopId}/sync?resource=collections`, { method: "POST" });
    const d = await r.json();
    setMsg(r.ok ? `${d.synced} collections synchronisées.` : `Erreur : ${d.error}`);
    if (r.ok) {
      const c = await fetch(`/api/collections?shopId=${shopId}`).then((x) => x.json());
      setCollections(c.collections ?? []);
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
    const r = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shopId,
        mode: "OPTIMIZE_COLLECTIONS",
        resourceIds: [...selected],
        fields: { description: true, meta: true, title: false, handle: false, tags: false, altText: false, internalLinking: true },
        batchSize,
      }),
    });
    const d = await r.json();
    setBusy(false);
    if (r.ok) router.push(`/jobs/${d.jobId}`);
    else setMsg(`Erreur : ${JSON.stringify(d.error)}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select className="rounded border border-gray-300 px-2 py-1.5 text-sm" value={shopId} onChange={(e) => setShopId(e.target.value)}>
          {shops.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
        <button className="btn-secondary" onClick={sync} disabled={busy || !shopId}>Synchroniser</button>
        <select
          className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          value={batchSize}
          onChange={(e) => setBatchSize(Number(e.target.value) as 10 | 25 | 50)}
        >
          <option value={10}>Lot 10</option>
          <option value={25}>Lot 25</option>
          <option value={50}>Lot 50</option>
        </select>
        <button className="btn-primary" onClick={launch} disabled={busy || selected.size === 0}>
          Optimiser {selected.size} collection(s)
        </button>
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr><th className="w-8"></th><th className="py-1">Titre</th><th>Handle</th><th>SEO title</th></tr>
          </thead>
          <tbody>
            {collections.map((c) => (
              <tr key={c.id} className="border-t border-gray-100">
                <td className="py-1.5"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /></td>
                <td>{c.title}</td>
                <td className="text-gray-400">{c.handle}</td>
                <td className="text-gray-400">{c.seoTitle ?? "—"}</td>
              </tr>
            ))}
            {collections.length === 0 && (
              <tr><td colSpan={4} className="py-4 text-center text-gray-400">Aucune collection en cache.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
