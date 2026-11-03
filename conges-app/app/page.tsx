"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [matricule, setMatricule] = useState("");
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  async function ouvrirDossier(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    setChargement(true);
    try {
      const res = await fetch("/api/auth/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricule: matricule.trim(), code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErreur(data.message ?? "Connexion impossible.");
        setCode("");
        setChargement(false);
        return;
      }
      router.push(data.doitChangerCode ? "/compte" : data.type === "admin" ? "/admin" : "/dashboard");
    } catch {
      setErreur("Impossible de contacter le registre. Réessayez.");
      setChargement(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div
        className="pointer-events-none absolute inset-0 bg-grain opacity-40"
        style={{ backgroundSize: "18px 18px" }}
      />

      <div className="relative w-full max-w-md">
        <p className="eyebrow mb-3 text-center text-cachet-light">
          Registre des congés — service de terrain
        </p>

        <div className="card stamp-border rounded-card px-8 py-10 shadow-2xl shadow-black/40">
          <h1 className="font-display text-3xl font-semibold leading-tight text-parchemin-50">
            Ouvrir mon dossier
          </h1>
          <p className="mt-2 text-sm text-parchemin-100/70">
            Entrez votre matricule et votre code d&apos;accès pour consulter votre solde et déposer
            vos vœux de congé.
          </p>

          <form onSubmit={ouvrirDossier} className="mt-8 space-y-4">
            <label className="block">
              <span className="eyebrow text-parchemin-100/60">Matricule</span>
              <input
                autoFocus
                autoComplete="username"
                inputMode="numeric"
                value={matricule}
                onChange={(e) => setMatricule(e.target.value)}
                placeholder="ex. 0291"
                className="mt-2 w-full rounded-card border border-encre-700 bg-encre-900 px-4 py-3 font-mono text-lg tracking-wide text-parchemin-50 placeholder:text-parchemin-100/30 focus:border-cachet"
              />
            </label>

            <label className="block">
              <span className="eyebrow text-parchemin-100/60">Code d&apos;accès</span>
              <input
                type="password"
                autoComplete="current-password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-2 w-full rounded-card border border-encre-700 bg-encre-900 px-4 py-3 font-mono text-lg tracking-wide text-parchemin-50 focus:border-cachet"
              />
            </label>

            {erreur && (
              <p role="alert" className="rounded-card border border-alerte/40 bg-alerte/10 px-4 py-3 text-sm text-alerte">
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={chargement || matricule.trim().length === 0 || code.length === 0}
              className="w-full rounded-card bg-cachet px-4 py-3 font-medium text-encre-950 transition hover:bg-cachet-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {chargement ? "Vérification…" : "Consulter mon dossier"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-parchemin-100/40">
          Code oublié ? Adressez-vous à l&apos;administration pour obtenir un nouveau code provisoire.
        </p>
      </div>
    </main>
  );
}
