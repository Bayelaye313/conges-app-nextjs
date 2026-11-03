"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Alerte, Bouton, Carte, Logo } from "@/components/ui";
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

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 to-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <Carte className="p-8">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <ShieldCheck className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-900">Choisissez votre code personnel</h1>
          <p className="mt-2 text-[15px] text-slate-600">
            Remplacez le code provisoire par un code que vous seul connaissez (8 caractères minimum).
            Ne le communiquez à personne.
          </p>

          <form onSubmit={changerCode} className="mt-6 space-y-5">
            <label className="block">
              <span className="libelle">Code actuel</span>
              <input type="password" autoComplete="current-password" value={ancien}
                onChange={(e) => setAncien(e.target.value)} className="champ" />
            </label>
            <label className="block">
              <span className="libelle">Nouveau code</span>
              <input type="password" autoComplete="new-password" minLength={8} value={nouveau}
                onChange={(e) => setNouveau(e.target.value)} className="champ" />
              {nouveau.length > 0 && (
                <span className={`mt-1.5 block text-sm ${nouveau.length >= 8 ? "text-emerald-600" : "text-slate-500"}`}>
                  {nouveau.length >= 8 ? "✓ Longueur suffisante" : `Encore ${8 - nouveau.length} caractère(s)`}
                </span>
              )}
            </label>
            <label className="block">
              <span className="libelle">Confirmer le nouveau code</span>
              <input type="password" autoComplete="new-password" value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)} className="champ" />
            </label>

            {erreur && <Alerte type="erreur">{erreur}</Alerte>}

            <Bouton
              type="submit"
              taille="lg"
              className="w-full"
              disabled={chargement || !ancien || !nouveau || !confirmation}
            >
              {chargement && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
              {chargement ? "Enregistrement…" : "Enregistrer mon code"}
            </Bouton>
          </form>
        </Carte>
      </div>
    </main>
  );
}
