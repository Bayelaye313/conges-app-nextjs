"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { appelApi, RedirectionEnCours } from "@/lib/client";

interface Quinzaine {
  cle: string;
  libelle: string;
  debut: string;
  absents: number;
  plafond: number | null;
}

interface ReponsePlanning {
  libelleRole: string;
  plafond: number | null;
  quinzaines: Quinzaine[];
}

export default function PlanningPage() {
  const router = useRouter();
  const [donnees, setDonnees] = useState<ReponsePlanning | null>(null);
  const [erreur, setErreur] = useState("");

  useEffect(() => {
    appelApi<ReponsePlanning>(router, "/api/planning")
      .then(({ data }) => {
        if (!data.ok) setErreur(data.message ?? "Impossible de charger le planning.");
        else setDonnees(data);
      })
      .catch((err) => {
        if (!(err instanceof RedirectionEnCours)) setErreur((err as Error).message);
      });
  }, [router]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/dashboard" className="eyebrow text-parchemin-100/40 hover:text-parchemin-100/70">
        ← Retour au dossier
      </Link>

      <p className="eyebrow mt-6 text-cachet-light">Planning collectif</p>
      <h1 className="font-display text-3xl font-semibold text-parchemin-50">Places disponibles par quinzaine</h1>

      {erreur && <p role="alert" className="mt-10 text-sm text-alerte">{erreur}</p>}
      {!erreur && !donnees && <p className="eyebrow mt-10 text-parchemin-100/50">Chargement du planning…</p>}

      {donnees && (
        <>
          <p className="mt-2 max-w-2xl text-sm text-parchemin-100/70">
            {donnees.plafond === null
              ? `Pas de plafond pour les ${donnees.libelleRole.toLowerCase()} : seules vos règles individuelles (solde, délai de 12 mois) s'appliquent.`
              : `Au plus ${donnees.plafond} ${donnees.libelleRole.toLowerCase()} en congé par quinzaine. Un congé occupe une place dans chaque quinzaine qu'il touche ; les vœux en attente comptent déjà.`}
          </p>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {donnees.quinzaines.map((q) => {
              const restant = q.plafond === null ? null : Math.max(0, q.plafond - q.absents);
              const ratio = q.plafond ? q.absents / q.plafond : 0;
              const couleur = restant === 0 ? "#B4483A" : ratio >= 0.75 ? "#C1793A" : "#3E7A5E";
              const [annee, mois, partie] = q.cle.split("-");
              return (
                <div key={q.cle} className="card rounded-card px-4 py-3">
                  <div className="flex items-center justify-between">
                    <span className="font-display text-parchemin-50">{q.libelle}</span>
                    <span className="font-mono text-xs" style={{ color: couleur }}>
                      {restant === null ? `${q.absents} absents` : restant === 0 ? "Complet" : `${restant} place${restant > 1 ? "s" : ""}`}
                    </span>
                  </div>
                  {q.plafond !== null && (
                    <div className="mt-2 h-2 overflow-hidden rounded-sm bg-encre-800">
                      <div className="h-full" style={{ width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: couleur }} />
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-xs text-parchemin-100/50">
                    <span className="font-mono">
                      {q.plafond === null ? "sans plafond" : `${q.absents}/${q.plafond} absents`}
                    </span>
                    {restant !== 0 && (
                      <Link
                        href={`/demande?annee=${annee}&mois=${Number(mois)}&partie=${partie}`}
                        className="text-cachet-light underline underline-offset-2"
                      >
                        Partir à cette date →
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
