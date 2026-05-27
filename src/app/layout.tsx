import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "SEO Product Manager",
  description: "Optimisation SEO multi-agents pour boutiques Shopify (app interne).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <div className="min-h-screen">
          <header className="border-b border-gray-200 bg-white">
            <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
              <Link href="/" className="text-lg font-semibold text-brand">
                SEO Product Manager
              </Link>
              <nav className="flex gap-4 text-sm">
                <Link href="/" className="hover:text-brand">Dashboard</Link>
                <Link href="/products" className="hover:text-brand">Produits</Link>
                <Link href="/collections" className="hover:text-brand">Collections</Link>
                <Link href="/matching" className="hover:text-brand">Matching</Link>
                <Link href="/jobs" className="hover:text-brand">Jobs</Link>
                <Link href="/settings" className="hover:text-brand">Réglages</Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
