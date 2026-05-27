"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Shop { id: string; displayName: string }
interface Job {
  id: string;
  type: string;
  status: string;
  total: number;
  processed: number;
  succeeded: number;
  failed: number;
  progress: number;
  runId: string | null;
  createdAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  COMPLETED: "badge-ok",
  COMPLETED_WITH_ERRORS: "badge-risk",
  RUNNING: "badge-warn",
  PENDING: "badge-warn",
  PAUSED: "badge-warn",
  FAILED: "badge-risk",
  CANCELLED: "badge-risk",
};

export default function JobsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [shopId, setShopId] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    fetch("/api/shops").then((r) => r.json()).then((d) => {
      setShops(d.shops ?? []);
      if (d.shops?.[0]) setShopId(d.shops[0].id);
    });
  }, []);

  useEffect(() => {
    if (!shopId) return;
    const load = () =>
      fetch(`/api/jobs?shopId=${shopId}`).then((r) => r.json()).then((d) => setJobs(d.jobs ?? []));
    load();
    // Refresh history while jobs are running.
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [shopId]);

  async function runNow() {
    setProcessing(true);
    await fetch("/api/jobs/run-now", { method: "POST" }).catch(() => {});
    setProcessing(false);
    fetch(`/api/jobs?shopId=${shopId}`).then((r) => r.json()).then((d) => setJobs(d.jobs ?? []));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold">Historique des jobs</h1>
        <select className="rounded border border-gray-300 px-2 py-1.5 text-sm" value={shopId} onChange={(e) => setShopId(e.target.value)}>
          {shops.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
        <button className="btn-primary" disabled={processing} onClick={runNow}>
          {processing ? "Traitement…" : "Traiter maintenant"}
        </button>
        <span className="text-xs text-gray-400">
          En production (Vercel), les jobs sont aussi traités automatiquement par le cron.
        </span>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead className="text-left text-gray-500">
            <tr>
              <th className="py-1">Type</th>
              <th>Statut</th>
              <th>Progression</th>
              <th>OK / Échec</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} className="border-t border-gray-100">
                <td className="py-1.5">{j.type}</td>
                <td><span className={`badge ${STATUS_BADGE[j.status] ?? "badge-warn"}`}>{j.status}</span></td>
                <td className="w-48">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-32 overflow-hidden rounded bg-gray-100">
                      <div className="h-full bg-brand" style={{ width: `${j.progress}%` }} />
                    </div>
                    <span className="text-xs text-gray-500">{j.progress}% ({j.processed}/{j.total})</span>
                  </div>
                </td>
                <td className="text-xs text-gray-500">{j.succeeded} / {j.failed}</td>
                <td className="text-right">
                  <Link href={`/jobs/${j.id}`} className="text-brand underline">Ouvrir</Link>
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-gray-400">Aucun job.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
