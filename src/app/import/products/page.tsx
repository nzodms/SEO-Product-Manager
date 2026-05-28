"use client";

import { useState } from "react";
import { readFileText } from "@/components/fileUtils";

interface Issue { code: string; severity: string; message: string; sample?: string[] }
interface PreviewRow { handle: string; title: string; vendor: string; productType: string; images: number; variants: number }
interface Stats { realProducts: number; totalRows: number; images: number; variants: number; metafieldColumns: string[] }

export default function ImportProductsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function onFile(file: File) {
    setBusy(true);
    setMsg(`Analyse de ${file.name}…`);
    try {
      const csv = await readFileText(file);
      const r = await fetch("/api/migration/products/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setStats(d.stats);
      setIssues(d.issues);
      setPreview(d.preview);
      setMsg("");
    } catch (e) {
      setMsg(`Erreur : ${e instanceof Error ? e.message : e}`);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Import produits (CSV Shopify)</h1>

      <div className="card space-y-2">
        <input type="file" accept=".csv,text/csv" disabled={busy}
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <p className="text-xs text-gray-500">
          L&apos;app regroupe les lignes par <code>Handle</code> : les lignes images/variantes
          ne sont jamais comptées comme des produits séparés.
        </p>
        {msg && <p className="text-sm text-gray-700">{msg}</p>}
      </div>

      {stats && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Produits réels" value={stats.realProducts} />
            <Stat label="Lignes totales" value={stats.totalRows} />
            <Stat label="Images" value={stats.images} />
            <Stat label="Variantes" value={stats.variants} />
          </div>

          <div className="card">
            <h2 className="mb-2 text-base font-semibold">Contrôles</h2>
            {issues.length === 0 ? (
              <p className="text-sm text-ok">Aucune anomalie détectée.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {issues.map((i, idx) => (
                  <li key={idx} className={i.severity === "error" ? "text-danger" : i.severity === "warn" ? "text-warn" : "text-gray-500"}>
                    <span className="font-medium">[{i.code}]</span> {i.message}
                    {i.sample?.length ? <span className="text-gray-400"> — ex : {i.sample.slice(0, 5).join(", ")}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card">
            <h2 className="mb-2 text-base font-semibold">Produits détectés (aperçu)</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-gray-500">
                <tr><th className="py-1">Titre</th><th>Handle</th><th>Vendor</th><th>Type</th><th>Images</th><th>Variantes</th></tr>
              </thead>
              <tbody>
                {preview.map((p) => (
                  <tr key={p.handle} className="border-t border-gray-100">
                    <td className="py-1.5">{p.title}</td>
                    <td className="text-gray-400">{p.handle}</td>
                    <td>{p.vendor}</td>
                    <td>{p.productType}</td>
                    <td>{p.images}</td>
                    <td>{p.variants}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-sm text-gray-500">{label}</div>
    </div>
  );
}
