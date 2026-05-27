"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface JobItem {
  id: string;
  resourceRef: string;
  label: string | null;
  status: string;
  attempts: number;
  errorMessage: string | null;
  log: Record<string, unknown>;
}
interface Job {
  id: string;
  type: string;
  status: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  progress: number;
  batchSize: number;
  runId: string | null;
  errorMessage: string | null;
  result: unknown;
}

const ITEM_BADGE: Record<string, string> = {
  DONE: "badge-ok",
  RUNNING: "badge-warn",
  PENDING: "badge-warn",
  FAILED: "badge-risk",
  SKIPPED: "badge-warn",
};

const ACTIVE = ["PENDING", "RUNNING", "PAUSED"];

export default function JobDetailPage({ params }: { params: { id: string } }) {
  const [job, setJob] = useState<Job | null>(null);
  const [items, setItems] = useState<JobItem[]>([]);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`/api/jobs/${params.id}`)
      .then((r) => r.json())
      .then((d) => {
        setJob(d.job);
        setItems(d.items ?? []);
      });
  }, [params.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load]);

  async function action(name: "pause" | "resume" | "cancel" | "rollback") {
    setMsg("");
    const r = await fetch(`/api/jobs/${params.id}/${name}`, { method: "POST" });
    const d = await r.json();
    setMsg(r.ok ? `Action « ${name} » effectuée.${d.restored != null ? ` ${d.restored} ressource(s) restaurée(s).` : ""}` : `Erreur : ${d.error}`);
    load();
  }

  if (!job) return <p className="text-sm text-gray-500">Chargement…</p>;

  const isGenerate = job.type.startsWith("GENERATE");
  const isApply = job.type === "APPLY";
  const isMatching = job.type === "MATCHING";
  const active = ACTIVE.includes(job.status);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Job · {job.type}</h1>
          <p className="text-sm text-gray-500">Statut : {job.status} · Lot : {job.batchSize}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {active && job.status !== "PAUSED" && (
            <button className="btn-secondary" onClick={() => action("pause")}>Pause</button>
          )}
          {job.status === "PAUSED" && (
            <button className="btn-secondary" onClick={() => action("resume")}>Reprendre</button>
          )}
          {active && <button className="btn-secondary" onClick={() => action("cancel")}>Annuler</button>}
          {isApply && job.status === "COMPLETED" && (
            <button className="btn-secondary" onClick={() => action("rollback")}>Rollback</button>
          )}
          {isGenerate && job.runId && (
            <Link href={`/runs/${job.runId}`} className="btn-primary">Prévisualiser les résultats</Link>
          )}
          {isMatching && job.status === "COMPLETED" && (
            <a className="btn-secondary" href={`/api/jobs/${job.id}/export?format=matrixify`}>Export Matrixify CSV</a>
          )}
        </div>
      </div>

      <div className="card">
        <div className="mb-2 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded bg-gray-100">
            <div className="h-full bg-brand transition-all" style={{ width: `${job.progress}%` }} />
          </div>
          <span className="text-sm font-medium">{job.progress}%</span>
        </div>
        <div className="flex gap-6 text-sm text-gray-600">
          <span>Total : {job.total}</span>
          <span>Traités : {job.processed}</span>
          <span className="text-ok">Réussis : {job.succeeded}</span>
          <span className="text-danger">Échecs : {job.failed}</span>
        </div>
        {job.errorMessage && <p className="mt-2 text-sm text-danger">{job.errorMessage}</p>}
        {msg && <p className="mt-2 text-sm text-gray-700">{msg}</p>}
        {isGenerate && (
          <p className="mt-2 text-xs text-gray-400">
            L&apos;IA propose uniquement des brouillons. Rien n&apos;est publié sur Shopify tant que
            vous n&apos;avez pas validé les lignes puis lancé l&apos;application.
          </p>
        )}
      </div>

      <div className="card">
        <h2 className="mb-2 text-base font-semibold">Logs par élément</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-gray-400">
            <tr>
              <th className="py-1">Élément</th>
              <th>Statut</th>
              <th>Essais</th>
              <th>Détail</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-t border-gray-100 align-top">
                <td className="py-1.5">{it.label ?? it.resourceRef}</td>
                <td><span className={`badge ${ITEM_BADGE[it.status] ?? "badge-warn"}`}>{it.status}</span></td>
                <td>{it.attempts}</td>
                <td className="text-gray-500">
                  {it.errorMessage
                    ? <span className="text-danger">{it.errorMessage}</span>
                    : summarizeLog(it.log)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function summarizeLog(log: Record<string, unknown>): string {
  if (log.qcStatus) return `QC: ${log.qcStatus}${log.issues != null ? ` · ${log.issues} issue(s)` : ""}`;
  if (log.result) return String(log.result);
  if (log.match) {
    const m = log.match as { matchShopifyId: string | null; confidence: number };
    return m.matchShopifyId ? `Match (conf. ${Math.round(m.confidence * 100)}%)` : "Aucun match";
  }
  return "—";
}
