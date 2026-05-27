"use client";

import { useCallback, useEffect, useState } from "react";

interface Issue {
  code: string;
  severity: "info" | "warn" | "error";
  message: string;
  field: string;
}
interface Draft {
  id: string;
  title: string | null;
  productHandle: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  qcStatus: "OK" | "REVIEW" | "RISK";
  issues: Issue[];
  approval: string;
  errorMessage: string | null;
}
interface RunData {
  run: { id: string; mode: string; resource: string; status: string };
  drafts: Draft[];
}

const FIELDS = ["title", "seoTitle", "seoDescription", "handle", "tags", "bodyHtml"] as const;

export default function RunPage({ params }: { params: { id: string } }) {
  const [data, setData] = useState<RunData | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    fetch(`/api/runs/${params.id}`)
      .then((r) => r.json())
      .then(setData);
  }, [params.id]);

  useEffect(load, [load]);

  async function setApproval(id: string, approval: string) {
    await fetch(`/api/drafts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approval }),
    });
    load();
  }

  async function bulk(strategy: "safe" | "all" | "count", count?: number) {
    await fetch(`/api/runs/${params.id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy, count }),
    });
    load();
  }

  async function apply(force = false) {
    setBusy(true);
    setMsg("Publication vers Shopify…");
    const r = await fetch(`/api/runs/${params.id}/apply?force=${force}`, { method: "POST" });
    const d = await r.json();
    setMsg(
      r.ok
        ? `Appliqués : ${d.applied} · Ignorés (risque) : ${d.skipped} · Échecs : ${d.failed}`
        : `Erreur : ${d.error}`
    );
    setBusy(false);
    load();
  }

  if (!data) return <p className="text-sm text-gray-500">Chargement…</p>;

  const approved = data.drafts.filter((d) => d.approval === "APPROVED").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Run · {data.run.mode}</h1>
          <p className="text-sm text-gray-500">Statut : {data.run.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={() => bulk("safe")}>Approuver les sûrs</button>
          <button className="btn-secondary" onClick={() => bulk("count", 10)}>Approuver 10</button>
          <button className="btn-secondary" onClick={() => bulk("count", 50)}>Approuver 50</button>
          <button className="btn-secondary" onClick={() => bulk("all")}>Tout approuver</button>
          <button className="btn-primary" disabled={busy || approved === 0} onClick={() => apply(false)}>
            Publier {approved} approuvé(s)
          </button>
        </div>
      </div>
      {msg && <p className="text-sm text-gray-700">{msg}</p>}

      <div className="space-y-4">
        {data.drafts.map((d) => (
          <div key={d.id} className="card space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {d.title ?? d.productHandle}{" "}
                <span className="ml-2 text-xs text-gray-400">{d.productHandle}</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`badge ${
                    d.qcStatus === "OK" ? "badge-ok" : d.qcStatus === "REVIEW" ? "badge-warn" : "badge-risk"
                  }`}
                >
                  {d.qcStatus}
                </span>
                <span className="text-xs text-gray-500">{d.approval}</span>
              </div>
            </div>

            {d.issues.length > 0 && (
              <ul className="space-y-1 text-xs">
                {d.issues.map((i, idx) => (
                  <li
                    key={idx}
                    className={
                      i.severity === "error"
                        ? "text-danger"
                        : i.severity === "warn"
                          ? "text-warn"
                          : "text-gray-500"
                    }
                  >
                    [{i.field}] {i.message}
                  </li>
                ))}
              </ul>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-left text-gray-400">
                  <tr>
                    <th className="w-24 py-1">Champ</th>
                    <th className="w-1/2">Avant</th>
                    <th className="w-1/2">Après</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map((f) => {
                    const before = stringify(d.before[f]);
                    const after = stringify(d.after[f]);
                    if (after === "" && before === "") return null;
                    const changed = before !== after && after !== "";
                    return (
                      <tr key={f} className="border-t border-gray-100 align-top">
                        <td className="py-1 font-medium text-gray-600">{f}</td>
                        <td className="whitespace-pre-wrap py-1 text-gray-400">{truncate(before)}</td>
                        <td className={`whitespace-pre-wrap py-1 ${changed ? "text-gray-900" : "text-gray-400"}`}>
                          {truncate(after)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {d.errorMessage && <p className="text-xs text-danger">{d.errorMessage}</p>}

            <div className="flex gap-2">
              <button
                className="btn-secondary"
                onClick={() => setApproval(d.id, d.approval === "APPROVED" ? "PENDING" : "APPROVED")}
              >
                {d.approval === "APPROVED" ? "Annuler" : "Approuver"}
              </button>
              <button className="btn-secondary" onClick={() => setApproval(d.id, "REJECTED")}>
                Rejeter
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function stringify(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (Array.isArray(v)) return v.join(", ");
  return String(v);
}
function truncate(s: string, n = 600): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}
