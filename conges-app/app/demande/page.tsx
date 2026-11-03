"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Loader2, SearchCheck, Send } from "lucide-react";
import { Alerte, BarreNavigation, Bouton, Carte, Chargement, classesBouton, EnTete } from "@/components/ui";
import { appelApi, dateRetour, formatFr, MOIS_NOMS, RedirectionEnCours } from "@/lib/client";

interface Apercu {
  periodes: { debut: string; fin: string; jours: number }[];
  nbJours: number;
  soldeAuDepart: number;
}

function DemandeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const maintenant = new Date();
  const anneeCourante = maintenant.getUTCFullYear();

  const [annee, setAnnee] = useState(Number(searchParams.get("annee")) || anneeCourante);
  const [mois, setMois] = useState(Number(searchParams.get("mois")) || maintenant.getUTCMonth() + 1);
  const [nbParties, setNbParties] = useState<1 | 2>(1);
  const [nbJours, setNbJours] = useState(11);
  const [partieChoisie, setPartieChoisie] = useState<"debut" | "fin">(
    searchParams.get("partie") === "2" ? "fin" : "debut"
  );

  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const [resultat, setResultat] = useState<{ succes: boolean; message: string } | null>(null);

  // Toute modification du formulaire invalide l'aperçu : on ne peut confirmer
  // que ce qui a été prévisualisé.
  useEffect(() => {
    setApercu(null);
  }, [annee, mois, nbParties, nbJours, partieChoisie]);

  async function envoyer(confirmer: boolean) {
    setErreur("");
    setResultat(null);
    setChargement(true);
    try {
      const { data } = await appelApi<Apercu>(router, "/api/demande", {
        annee,
        mois,
        nbParties,
        nbJours,
        partieChoisie: nbParties === 1 ? partieChoisie : undefined,
        confirmer
      });
      if (confirmer) {
        setResultat({ succes: data.ok, message: data.message ?? "Vœu refusé." });
        setApercu(null);
      } else if (!data.ok) {
        setErreur(data.message ?? "Vœu refusé.");
      } else {
        setApercu(data);
      }
    } catch (err) {
      if (err instanceof RedirectionEnCours) return;
      if (confirmer) setResultat({ succes: false, message: (err as Error).message });
      else setErreur((err as Error).message);
    }
    setChargement(false);
  }

  const bouton = (actif: boolean) =>
    `flex flex-1 items-center gap-3 rounded-xl border-2 px-3.5 py-2.5 text-left text-[15px] font-semibold transition ${
      actif ? "border-brand-500 bg-brand-50 text-brand-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
    }`;
  const puce = (actif: boolean) => (
    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${actif ? "border-brand-600" : "border-slate-300"}`}>
      {actif && <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />}
    </span>
  );

  return (
    <>
      <BarreNavigation />
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:py-8">
        <Link href="/dashboard" className={classesBouton("fantome", "sm", "-ml-3 mb-3")}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Retour à mon espace
        </Link>

        <EnTete
          surtitre="Nouveau vœu"
          titre="Déposer un vœu de congé"
          description="Départ le 1er ou le 16 du mois, minimum 11 jours. Les dimanches et jours fériés ne sont pas décomptés. Votre solde est recalculé à la date de départ (+2 jours par mois d'ici là)."
        />

        <Carte className="p-5 sm:p-6">
          <ol className="space-y-6">
            <li>
              <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">1</span>
                Quand souhaitez-vous partir ?
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="libelle">Mois de départ</span>
                  <select value={mois} onChange={(e) => setMois(Number(e.target.value))} className="champ">
                    {MOIS_NOMS.map((nom, idx) => (
                      <option key={nom} value={idx + 1}>{nom}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="libelle">Année</span>
                  <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className="champ">
                    {[0, 1, 2].map((d) => (
                      <option key={d} value={anneeCourante + d}>{anneeCourante + d}</option>
                    ))}
                  </select>
                </label>
              </div>
            </li>

            <li>
              <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">2</span>
                Comment organiser votre congé ?
              </h2>
              <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                <button type="button" onClick={() => setNbParties(1)} className={bouton(nbParties === 1)}>
                  {puce(nbParties === 1)} En une seule fois
                </button>
                <button type="button" onClick={() => setNbParties(2)} className={bouton(nbParties === 2)}>
                  {puce(nbParties === 2)} En 2 parties (1–15 et 16–fin)
                </button>
              </div>

              {nbParties === 1 && (
                <div className="mt-4">
                  <span className="libelle">Date de départ</span>
                  <div className="mt-1.5 flex flex-col gap-2.5 sm:flex-row">
                    <button type="button" onClick={() => setPartieChoisie("debut")} className={bouton(partieChoisie === "debut")}>
                      {puce(partieChoisie === "debut")} Le 1er du mois
                    </button>
                    <button type="button" onClick={() => setPartieChoisie("fin")} className={bouton(partieChoisie === "fin")}>
                      {puce(partieChoisie === "fin")} Le 16 du mois
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    Le congé se poursuit sans interruption et peut déborder sur le mois suivant.
                  </p>
                </div>
              )}
            </li>

            <li>
              <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">3</span>
                Combien de jours ?
              </h2>
              <label className="mt-3 block max-w-xs">
                <span className="libelle">Nombre de jours</span>
                <input
                  type="number"
                  min={11}
                  max={90}
                  value={nbJours}
                  onChange={(e) => setNbJours(Number(e.target.value))}
                  className="champ text-lg font-semibold"
                />
                <span className="mt-1.5 block text-sm text-slate-500">Minimum 11, hors dimanches et jours fériés</span>
              </label>
            </li>
          </ol>

          {erreur && <Alerte type="erreur" className="mt-5">{erreur}</Alerte>}

          {!apercu && !resultat?.succes && (
            <Bouton variante="secondaire" taille="lg" onClick={() => envoyer(false)} disabled={chargement} className="mt-6 w-full">
              {chargement ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <SearchCheck className="h-5 w-5" aria-hidden />}
              {chargement ? "Vérification…" : "Vérifier mon vœu"}
            </Bouton>
          )}

          {apercu && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
                Votre vœu respecte toutes les règles
              </p>
              {apercu.periodes.map((p) => (
                <p key={p.debut} className="mt-2.5 flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900">
                  {formatFr(p.debut)}
                  <ArrowRight className="h-5 w-5 text-emerald-600" aria-hidden />
                  retour {formatFr(dateRetour(p.fin))}
                  <span className="text-base font-medium text-slate-500">· {p.jours} jours</span>
                </p>
              ))}
              <p className="mt-2 text-[15px] text-slate-700">
                {apercu.nbJours} jours décomptés. Solde au départ : <strong>{apercu.soldeAuDepart} jours</strong>.
                Les règles seront revérifiées à l&apos;envoi.
              </p>
              <Bouton taille="lg" onClick={() => envoyer(true)} disabled={chargement} className="mt-4 w-full">
                {chargement ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Send className="h-5 w-5" aria-hidden />}
                {chargement ? "Envoi…" : "Confirmer et envoyer mon vœu"}
              </Bouton>
            </div>
          )}

          {resultat && (
            <Alerte type={resultat.succes ? "succes" : "erreur"} role="status" className="mt-5">
              <p>{resultat.message}</p>
              {resultat.succes && (
                <Link href="/dashboard" className="mt-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2">
                  Retour à mon espace <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
            </Alerte>
          )}
        </Carte>

        <Link href="/planning" className="mt-4 flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3.5 text-[15px] font-semibold text-slate-700 shadow-card transition hover:border-brand-200 hover:text-brand-700">
          <span className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5 text-brand-600" aria-hidden />
            Voir les places disponibles par quinzaine
          </span>
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      </main>
    </>
  );
}

export default function DemandePage() {
  return (
    <Suspense fallback={<Chargement texte="Chargement…" />}>
      <DemandeForm />
    </Suspense>
  );
}
