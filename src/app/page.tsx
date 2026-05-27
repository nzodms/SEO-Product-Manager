import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const shops = await prisma.shop.findMany({ orderBy: { createdAt: "asc" } });
  const [productCount, collectionCount, runCount] = await Promise.all([
    prisma.product.count(),
    prisma.collection.count(),
    prisma.optimizationRun.count(),
  ]);

  const recentRuns = await prisma.optimizationRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { _count: { select: { drafts: true } }, shop: { select: { displayName: true } } },
  });

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="mb-3 text-base font-semibold">Actions rapides</h2>
        <div className="flex flex-wrap gap-2">
          <Link href="/import/products" className="btn-secondary">Importer produits</Link>
          <Link href="/import/collections" className="btn-secondary">Importer collections</Link>
          <Link href="/products" className="btn-secondary">Optimiser produits</Link>
          <Link href="/matching" className="btn-secondary">Mapper collections</Link>
          <Link href="/products" className="btn-secondary">Export Shopify CSV</Link>
          <Link href="/matching" className="btn-secondary">Export Matrixify</Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <Stat label="Boutiques" value={shops.length} />
        <Stat label="Produits en cache" value={productCount} />
        <Stat label="Collections en cache" value={collectionCount} />
        <Stat label="Runs" value={runCount} />
      </div>

      <section className="card">
        <h2 className="mb-3 text-base font-semibold">Boutiques</h2>
        {shops.length === 0 ? (
          <p className="text-sm text-gray-500">
            Aucune boutique. Ajoutez-en une dans{" "}
            <Link href="/settings" className="text-brand underline">Réglages</Link>.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {shops.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium">{s.displayName}</span>{" "}
                  <span className="text-gray-400">({s.domain})</span>
                </span>
                <span className={`badge ${s.active ? "badge-ok" : "badge-warn"}`}>
                  {s.active ? "actif" : "inactif"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-3 text-base font-semibold">Runs récents</h2>
        {recentRuns.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun run pour le moment.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-gray-500">
              <tr>
                <th className="py-1">Boutique</th>
                <th>Mode</th>
                <th>Statut</th>
                <th>Brouillons</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recentRuns.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="py-1.5">{r.shop.displayName}</td>
                  <td>{r.mode}</td>
                  <td>{r.status}</td>
                  <td>{r._count.drafts}</td>
                  <td className="text-right">
                    <Link href={`/runs/${r.id}`} className="text-brand underline">
                      Revoir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
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
