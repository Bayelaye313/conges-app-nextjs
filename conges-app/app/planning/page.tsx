"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Alerte, BarreNavigation, Carte, Chargement, EnTete } from "@/components/ui";
import { appelApi, RedirectionEnCours } from "@/lib/client";

const TONS = {
  libre: { badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", barre: "bg-emerald-500" },
  presque: { badge: "bg-amber-50 text-amber-700 ring-amber-600/20", barre: "bg-amber-500" },
  complet: { badge: "bg-rose-50 text-rose-700 ring-rose-600/20", barre: "bg-rose-500" }
};

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
    <>
      <BarreNavigation />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <EnTete
          surtitre="Planning collectif"
          titre="Places disponibles par quinzaine"
          description={
            donnees &&
            (donnees.plafond === null
              ? `Pas de plafond pour les ${donnees.libelleRole.toLowerCase()} : seules vos règles individuelles (solde, délai de 12 mois) s'appliquent.`
              : `Au plus ${donnees.plafond} ${donnees.libelleRole.toLowerCase()} en congé par quinzaine. Un congé occupe une place dans chaque quinzaine qu'il touche ; les vœux en attente comptent déjà.`)
          }
        />

        {erreur && <Alerte type="erreur">{erreur}</Alerte>}
        {!erreur && !donnees && <Chargement texte="Chargement du planning…" />}

        {donnees && (
          <>
            {donnees.plafond !== null && (
              <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-[13px] font-medium text-slate-600">
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Places disponibles</span>
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />Presque complet</span>
                <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" />Complet</span>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {donnees.quinzaines.map((q) => {
                const restant = q.plafond === null ? null : Math.max(0, q.plafond - q.absents);
                const ratio = q.plafond ? q.absents / q.plafond : 0;
                const ton = restant === 0 ? TONS.complet : ratio >= 0.75 ? TONS.presque : TONS.libre;
                const [annee, mois, partie] = q.cle.split("-");
                return (
                  <Carte key={q.cle} className={`flex flex-col p-4 sm:p-5 ${restant === 0 ? "bg-slate-50" : ""}`}>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-[15px] font-bold capitalize text-slate-900">{q.libelle}</span>
                      <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${ton.badge}`}>
                        {restant === null ? `${q.absents} absents` : restant === 0 ? "Complet" : `${restant} place${restant > 1 ? "s" : ""}`}
                      </span>
                    </div>
                    {q.plafond !== null && (
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${ton.barre}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
                      </div>
                    )}
                    <div className="mt-2.5 flex flex-1 items-end justify-between gap-2 text-sm">
                      <span className="tabular-nums text-slate-500">
                        {q.plafond === null ? "Sans plafond" : `${q.absents} / ${q.plafond} absents`}
                      </span>
                      {restant !== 0 && (
                        <Link
                          href={`/demande?annee=${annee}&mois=${Number(mois)}&partie=${partie}`}
                          className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:text-brand-700"
                        >
                          Partir à cette date <ArrowRight className="h-4 w-4" aria-hidden />
                        </Link>
                      )}
                    </div>
                  </Carte>
                );
              })}
            </div>
          </>
        )}
      </main>
    </>
  );
}
