"use client";

import { useEffect, useState } from "react";

interface Shop {
  id: string;
  displayName: string;
  domain: string;
  active: boolean;
  authMode: "TOKEN" | "OAUTH";
  clientId: string | null;
  scopes: string | null;
  connectionStatus: string;
  connectionCheckedAt: string | null;
  connectionError: string | null;
}

const STATUS: Record<string, { label: string; cls: string }> = {
  CONNECTED: { label: "Connecté ✓", cls: "badge-ok" },
  TOKEN_PRESENT: { label: "Token généré (non testé)", cls: "badge-warn" },
  NOT_CONNECTED: { label: "Non connecté", cls: "badge-warn" },
  TOKEN_INVALID: { label: "Token invalide / expiré", cls: "badge-risk" },
};

const DEFAULT_SCOPES = "read_products,write_products,read_collections,write_collections";

export default function SettingsPage() {
  const [shops, setShops] = useState<Shop[]>([]);
  const [mode, setMode] = useState<"TOKEN" | "OAUTH">("OAUTH");
  const [form, setForm] = useState({
    displayName: "",
    domain: "",
    preset: "le-petit-luminaire",
    accessToken: "",
    clientId: "",
    clientSecret: "",
    scopes: DEFAULT_SCOPES,
  });
  const [msg, setMsg] = useState("");
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  function load() {
    fetch("/api/shops").then((r) => r.json()).then((d) => setShops(d.shops ?? []));
  }

  useEffect(() => {
    load();
    const p = new URLSearchParams(window.location.search);
    if (p.get("connected")) setBanner("Boutique connectée via OAuth. Teste la connexion ci-dessous.");
    if (p.get("oauth_error")) setBanner(`Erreur OAuth : ${p.get("oauth_error")}`);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    const body =
      mode === "TOKEN"
        ? {
            authMode: "TOKEN",
            displayName: form.displayName,
            domain: form.domain,
            preset: form.preset,
            accessToken: form.accessToken,
          }
        : {
            authMode: "OAUTH",
            displayName: form.displayName,
            domain: form.domain,
            preset: form.preset,
            clientId: form.clientId,
            clientSecret: form.clientSecret,
            scopes: form.scopes,
          };

    const r = await fetch("/api/shops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) {
      setMsg(`Erreur : ${JSON.stringify(d.error)}`);
      return;
    }
    if (mode === "OAUTH" && d.authorizeStart) {
      // Redirect to Shopify's authorize screen to obtain the token.
      window.location.href = d.authorizeStart;
      return;
    }
    setMsg("Boutique ajoutée.");
    setForm({ ...form, accessToken: "", clientId: "", clientSecret: "" });
    load();
  }

  async function testConnection(id: string) {
    setTesting(id);
    const r = await fetch(`/api/shops/${id}/test`, { method: "POST" });
    const d = await r.json();
    setTesting(null);
    setBanner(
      d.status === "CONNECTED"
        ? `Connecté à « ${d.shopName} » (${d.domain}).`
        : d.status === "NOT_CONNECTED"
          ? "Aucun token : connecte la boutique via Shopify."
          : `Test : ${d.status}${d.error ? ` — ${d.error}` : ""}`
    );
    load();
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {banner && (
        <div className="md:col-span-2 rounded-md border border-gray-200 bg-blue-50 px-3 py-2 text-sm text-gray-700">
          {banner}
        </div>
      )}

      <section className="card space-y-3">
        <h2 className="text-base font-semibold">Ajouter une boutique</h2>

        <div className="flex gap-2 text-sm">
          <button type="button" className={mode === "OAUTH" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("OAUTH")}>
            Dev Dashboard (Client ID + Secret)
          </button>
          <button type="button" className={mode === "TOKEN" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("TOKEN")}>
            Token direct (shpat_)
          </button>
        </div>

        <form onSubmit={submit} className="space-y-3 text-sm">
          <Field label="Nom affiché">
            <input className="inp" value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} required />
          </Field>
          <Field label="Domaine myshopify">
            <input className="inp" placeholder="dertx1-dt.myshopify.com" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} required />
          </Field>
          <Field label="Préréglage de règles">
            <select className="inp" value={form.preset} onChange={(e) => setForm({ ...form, preset: e.target.value })}>
              <option value="lumio">Lumio (luminaire)</option>
              <option value="le-petit-luminaire">Le Petit Luminaire (luminaire)</option>
              <option value="bebilo">Bebilo (bébé)</option>
            </select>
          </Field>

          {mode === "TOKEN" ? (
            <Field label="Admin API access token (shpat_…)">
              <input className="inp" type="password" placeholder="shpat_…" value={form.accessToken} onChange={(e) => setForm({ ...form, accessToken: e.target.value })} required />
            </Field>
          ) : (
            <>
              <Field label="Client ID">
                <input className="inp" value={form.clientId} onChange={(e) => setForm({ ...form, clientId: e.target.value })} required />
              </Field>
              <Field label="Client Secret (clé secrète — PAS un token shpat_)">
                <input className="inp" type="password" value={form.clientSecret} onChange={(e) => setForm({ ...form, clientSecret: e.target.value })} required />
              </Field>
              <Field label="Scopes (séparés par des virgules)">
                <input className="inp" value={form.scopes} onChange={(e) => setForm({ ...form, scopes: e.target.value })} />
              </Field>
              <p className="text-xs text-gray-500">
                Dans la config de l&apos;app Shopify, ajoute l&apos;URL de redirection :
                <code className="ml-1">{typeof window !== "undefined" ? window.location.origin : ""}/api/shopify/oauth/callback</code>
              </p>
            </>
          )}

          <button className="btn-primary" disabled={busy}>
            {mode === "OAUTH" ? "Ajouter & connecter via Shopify" : "Ajouter"}
          </button>
          {msg && <p className="text-gray-600">{msg}</p>}
          <p className="text-xs text-gray-400">
            Le token et le Client Secret sont chiffrés (AES-256-GCM) avant stockage et ne sont jamais renvoyés au navigateur.
          </p>
        </form>
      </section>

      <section className="card">
        <h2 className="mb-3 text-base font-semibold">Boutiques connectées</h2>
        <ul className="divide-y divide-gray-100 text-sm">
          {shops.map((s) => {
            const st = STATUS[s.connectionStatus] ?? STATUS.NOT_CONNECTED;
            return (
              <li key={s.id} className="space-y-1 py-3">
                <div className="flex items-center justify-between">
                  <span>
                    <span className="font-medium">{s.displayName}</span>{" "}
                    <span className="text-gray-400">{s.domain}</span>
                    <span className="ml-2 text-xs text-gray-400">[{s.authMode}]</span>
                  </span>
                  <span className={`badge ${st.cls}`}>{st.label}</span>
                </div>
                {s.connectionError && <p className="text-xs text-danger">{s.connectionError}</p>}
                <div className="flex gap-2">
                  <button className="btn-secondary" disabled={testing === s.id} onClick={() => testConnection(s.id)}>
                    {testing === s.id ? "Test…" : "Tester la connexion"}
                  </button>
                  {s.authMode === "OAUTH" && (
                    <a className="btn-secondary" href={`/api/shopify/oauth/start?shopId=${s.id}`}>
                      {s.connectionStatus === "CONNECTED" || s.connectionStatus === "TOKEN_PRESENT" ? "Reconnecter" : "Connecter via Shopify"}
                    </a>
                  )}
                </div>
              </li>
            );
          })}
          {shops.length === 0 && <li className="py-2 text-gray-400">Aucune boutique.</li>}
        </ul>
      </section>

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
