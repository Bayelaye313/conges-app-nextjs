import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Registre des Congés — Agents de Terrain",
  description: "Gestion équitable et transparente des congés, avec délai de 12 mois et capacité journalière garantie.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
