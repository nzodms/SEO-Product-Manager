"use client";

import { useEffect, useState } from "react";

interface Shop { id: string; displayName: string; domain: string; active: boolean }

export default function SettingsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [form, setForm] = useState({
    displayName: "",
    domain: "",
    accessToken: "",
    preset: "lumio",
  });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    fetch("/api/shops").then((r) => r.json()).then((d) => setShops(d.shops ?? []));
  }
  useEffect(load, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const r = await fetch("/api/shops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    setBusy(false);
    if (r.ok) {
      setMsg("Boutique ajoutée.");
      setForm({ displayName: "", domain: "", accessToken: "", preset: "lumio" });
      load();
    } else {
      setMsg(`Erreur : ${JSON.stringify(d.error)}`);
    }
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="card space-y-3">
        <h2 className="text-base font-semibold">Ajouter une boutique</h2>
        <form onSubmit={submit} className="space-y-3 text-sm">
          <Field label="Nom affiché">
            <input className="input" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
          </Field>
          <Field label="Domaine myshopify">
            <input className="input" placeholder="lumio.myshopify.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} required />
          </Field>
          <Field label="Admin API access token">
            <input className="input" type="password" placeholder="shpat_…" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} required />
          </Field>
          <Field label="Préréglage de règles">
            <select className="input" value={form.preset} onChange={(e) => setForm({ ...form, preset: e.target.value })}>
              <option value="lumio">Lumio (luminaire)</option>
              <option value="le-petit-luminaire">Le Petit Luminaire (luminaire)</option>
              <option value="bebilo">Bebilo (bébé)</option>
            </select>
          </Field>
          <button className="btn-primary" disabled={busy}>Ajouter</button>
          {msg && <p className="text-gray-600">{msg}</p>}
          <p className="text-xs text-gray-400">
            Le token est chiffré (AES-256-GCM) avant stockage et n&apos;est jamais renvoyé au navigateur.
          </p>
        </form>
      </section>

      <section className="card">
        <h2 className="mb-3 text-base font-semibold">Boutiques connectées</h2>
        <ul className="divide-y divide-gray-100 text-sm">
          {shops.map((s) => (
            <li key={s.id} className="flex items-center justify-between py-2">
              <span><span className="font-medium">{s.displayName}</span> <span className="text-gray-400">{s.domain}</span></span>
              <span className={`badge ${s.active ? "badge-ok" : "badge-warn"}`}>{s.active ? "actif" : "inactif"}</span>
            </li>
          ))}
          {shops.length === 0 && <li className="py-2 text-gray-400">Aucune boutique.</li>}
        </ul>
      </section>

      <style jsx global>{`
        .input {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          padding: 0.375rem 0.5rem;
        }
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
