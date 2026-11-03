import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";

// Polices téléchargées au build et servies par l'application elle-même :
// aucune requête vers Google depuis le navigateur des agents.
const fraunces = Fraunces({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-display" });
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Registre des Congés — Agents de Terrain",
  description: "Gestion équitable et transparente des congés, avec délai de 12 mois et capacité journalière garantie.",
  robots: { index: false, follow: false }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${fraunces.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="min-h-screen bg-encre-950 antialiased">{children}</body>
    </html>
  );
}
