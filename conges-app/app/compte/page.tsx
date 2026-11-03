"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appelApi, RedirectionEnCours } from "@/lib/client";

export default function ComptePage() {
  const router = useRouter();
  const [ancien, setAncien] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  async function changerCode(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    if (nouveau !== confirmation) {
      setErreur("Les deux nouveaux codes ne correspondent pas.");
      return;
    }
    setChargement(true);
    try {
      const { data } = await appelApi<{ type?: string }>(router, "/api/auth/code", { ancien, nouveau });
      if (!data.ok) {
        setErreur(data.message ?? "Changement refusé.");
        setChargement(false);
        return;
      }
      router.replace(data.type === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      if (err instanceof RedirectionEnCours) return;
      setErreur((err as Error).message);
      setChargement(false);
    }
  }

  const champ =
    "mt-2 w-full rounded-card border border-encre-700 bg-encre-900 px-4 py-3 font-mono text-parchemin-50 focus:border-cachet";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="card rounded-card px-8 py-10">
          <p className="eyebrow text-cachet-light">Sécurité du compte</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-parchemin-50">
            Choisir mon code personnel
          </h1>
          <p className="mt-2 text-sm text-parchemin-100/70">
            Remplacez le code provisoire par un code que vous seul connaissez (8 caractères minimum).
            Ne le communiquez à personne.
          </p>

          <form onSubmit={changerCode} className="mt-6 space-y-4">
            <label className="block">
              <span className="eyebrow text-parchemin-100/60">Code actuel</span>
              <input type="password" autoComplete="current-password" value={ancien}
                onChange={(e) => setAncien(e.target.value)} className={champ} />
            </label>
            <label className="block">
              <span className="eyebrow text-parchemin-100/60">Nouveau code</span>
              <input type="password" autoComplete="new-password" minLength={8} value={nouveau}
                onChange={(e) => setNouveau(e.target.value)} className={champ} />
            </label>
            <label className="block">
              <span className="eyebrow text-parchemin-100/60">Confirmer le nouveau code</span>
              <input type="password" autoComplete="new-password" value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)} className={champ} />
            </label>

            {erreur && (
              <p role="alert" className="rounded-card border border-alerte/40 bg-alerte/10 px-4 py-3 text-sm text-alerte">
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={chargement || !ancien || !nouveau || !confirmation}
              className="w-full rounded-card bg-cachet px-4 py-3 font-medium text-encre-950 transition hover:bg-cachet-light disabled:cursor-not-allowed disabled:opacity-50"
            >
              {chargement ? "Enregistrement…" : "Enregistrer mon code"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
