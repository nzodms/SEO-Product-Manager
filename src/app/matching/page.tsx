"use client";

import { useMemo, useState } from "react";
import { readFileText, downloadText, rowsToCsv } from "@/components/fileUtils";

type Bucket = "sure" | "medium" | "none";
interface MatchRow {
  oldHandle: string;
  oldTitle: string;
  newHandle: string | null;
  newTitle: string | null;
  confidence: number;
  bucket: Bucket;
  reasons: string[];
}
interface Summary { total: number; sure: number; medium: number; none: number; oldProducts: number; newProducts: number }
interface RebuildReport {
  collectionsKept: number;
  associationsKept: number;
  associationsRemoved: number;
  notFound: Array<{ collection: string; oldHandle: string }>;
}

const BUCKET_BADGE: Record<Bucket, string> = { sure: "badge-ok", medium: "badge-warn", none: "badge-risk" };
const BUCKET_LABEL: Record<Bucket, string> = { sure: "Sûr", medium: "Moyen", none: "Non matché" };

export default function MatchingPage() {
  const [oldCsv, setOldCsv] = useState("");
  const [newCsv, setNewCsv] = useState("");
  const [collectionsCsv, setCollectionsCsv] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [report, setReport] = useState<RebuildReport | null>(null);
  const [filter, setFilter] = useState<"all" | Bucket>("all");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function pick(setter: (s: string) => void, file: File, label: string) {
    setter(await readFileText(file));
    setMsg(`${label} chargé : ${file.name}`);
  }

  async function runMatch() {
    if (!oldCsv || !newCsv) { setMsg("Charge l'ancien et le nouvel export produits."); return; }
    setBusy(true);
    setMsg("Matching en cours…");
    const r = await fetch("/api/migration/match", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ oldCsv, newCsv }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(`Erreur : ${d.error}`); return; }
    setMatches(d.matches);
    setSummary(d.summary);
    setReport(null);
    setMsg("");
  }

  function editNewHandle(oldHandle: string, value: string) {
    setMatches((prev) =>
      prev.map((m) => (m.oldHandle === oldHandle ? { ...m, newHandle: value || null } : m))
    );
  }

  const handleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of matches) if (m.newHandle) map[m.oldHandle] = m.newHandle;
    return map;
  }, [matches]);

  async function exportMatrixify() {
    if (!collectionsCsv) { setMsg("Charge l'export collections Matrixify."); return; }
    setBusy(true);
    setMsg("Génération du fichier Matrixify corrigé…");
    const r = await fetch("/api/migration/export/matrixify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ collectionsCsv, handleMap }),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setMsg(`Erreur : ${d.error}`); return; }
    setReport(d.report);
    downloadText("collections-matrixify-corrige.csv", d.csv);
    setMsg("Fichier Matrixify corrigé téléchargé.");
  }

  function exportMatchReport() {
    const csv = rowsToCsv(
      ["oldHandle", "oldTitle", "newHandle", "newTitle", "confidence", "bucket", "reasons"],
      matches.map((m) => ({ ...m, confidence: m.confidence.toFixed(2), reasons: m.reasons.join(" | ") }))
    );
    downloadText("rapport-matching.csv", csv);
  }

  function exportErrorsReport() {
    const rows = matches.filter((m) => !m.newHandle).map((m) => ({ oldHandle: m.oldHandle, oldTitle: m.oldTitle, raison: m.reasons.join(" | ") }));
    downloadText("rapport-erreurs.csv", rowsToCsv(["oldHandle", "oldTitle", "raison"], rows));
  }

  const filtered = matches.filter((m) => filter === "all" || m.bucket === filter);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Matching produits & migration collections</h1>

      <div className="card grid gap-3 sm:grid-cols-3">
        <FileInput label="Ancien export produits (CSV Shopify)" onPick={(f) => pick(setOldCsv, f, "Ancien produits")} done={!!oldCsv} />
        <FileInput label="Nouvel export produits (CSV Shopify)" onPick={(f) => pick(setNewCsv, f, "Nouveaux produits")} done={!!newCsv} />
        <FileInput label="Collections Matrixify (CSV)" onPick={(f) => pick(setCollectionsCsv, f, "Collections")} done={!!collectionsCsv} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={busy} onClick={runMatch}>Lancer le matching</button>
        <button className="btn-secondary" disabled={busy || !matches.length || !collectionsCsv} onClick={exportMatrixify}>
          Export Matrixify corrigé
        </button>
        <button className="btn-secondary" disabled={!matches.length} onClick={exportMatchReport}>Rapport matching CSV</button>
        <button className="btn-secondary" disabled={!matches.length} onClick={exportErrorsReport}>Rapport erreurs CSV</button>
        {msg && <span className="text-sm text-gray-600">{msg}</span>}
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Anciens produits" value={summary.oldProducts} />
          <Stat label="Sûrs" value={summary.sure} />
          <Stat label="Moyens" value={summary.medium} />
          <Stat label="Non matchés" value={summary.none} />
        </div>
      )}

      {report && (
        <div className="card text-sm">
          <h2 className="mb-1 text-base font-semibold">Rapport d&apos;export</h2>
          <p>Collections conservées : {report.collectionsKept} · Associations conservées : {report.associationsKept} · Associations retirées : {report.associationsRemoved}</p>
          {report.notFound.length > 0 && (
            <p className="mt-1 text-warn">
              {report.notFound.length} association(s) retirée(s) (produit non matché) — voir « Rapport erreurs CSV ».
            </p>
          )}
        </div>
      )}

      {matches.length > 0 && (
        <div className="card">
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            {(["all", "sure", "medium", "none"] as const).map((b) => (
              <button key={b} className={filter === b ? "btn-primary" : "btn-secondary"} onClick={() => setFilter(b)}>
                {b === "all" ? "Tous" : BUCKET_LABEL[b]}
              </button>
            ))}
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1">Ancien produit</th>
                <th>Confiance</th>
                <th>Nouveau handle (modifiable)</th>
                <th>Raisons</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((m) => (
                <tr key={m.oldHandle} className="border-t border-gray-100 align-top">
                  <td className="py-1.5">
                    {m.oldTitle}
                    <div className="text-xs text-gray-400">{m.oldHandle}</div>
                  </td>
                  <td>
                    <span className={`badge ${BUCKET_BADGE[m.bucket]}`}>{Math.round(m.confidence * 100)}%</span>
                  </td>
                  <td>
                    <input
                      className="w-56 rounded border border-gray-300 px-2 py-1 text-xs"
                      value={m.newHandle ?? ""}
                      placeholder="(non matché)"
                      onChange={(e) => editNewHandle(m.oldHandle, e.target.value)}
                    />
                    {m.newTitle && <div className="text-xs text-gray-400">{m.newTitle}</div>}
                  </td>
                  <td className="text-xs text-gray-500">{m.reasons.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FileInput({ label, onPick, done }: { label: string; onPick: (f: File) => void; done: boolean }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-gray-600">{label} {done && <span className="text-ok">✓</span>}</span>
      <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])} />
    </label>
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
