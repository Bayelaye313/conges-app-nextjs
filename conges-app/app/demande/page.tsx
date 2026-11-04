"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Loader2, SearchCheck, Send } from "lucide-react";
import { Alerte, BarreNavigation, Bouton, Carte, Chargement, classesBouton, EnTete } from "@/components/ui";
import { appelApi, dateRetour, formatFr, MOIS_NOMS, RedirectionEnCours } from "@/lib/client";
import { FETES_EXCLUSIVES, fetesExclusives } from "@/lib/calendrier";

interface PeriodeApercu {
  debut: string;
  fin: string;
  jours: number;
  calendaires: number;
  dimanches: number;
  feries: { date: string; nom: string }[];
  soldeAvant: number;
  soldeApres: number;
}

interface Apercu {
  periodes: PeriodeApercu[];
  nbJours: number;
}

interface Choix {
  annee: number;
  mois: number;
  partie: "debut" | "fin";
  nbJours: number;
}

function DemandeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const maintenant = new Date();
  const anneeCourante = maintenant.getUTCFullYear();
  const annees = [0, 1, 2].map((d) => anneeCourante + d);

  const [mode, setMode] = useState<1 | 2>(1);
  const [choix1, setChoix1] = useState<Choix>({
    annee: Number(searchParams.get("annee")) || anneeCourante,
    mois: Number(searchParams.get("mois")) || maintenant.getUTCMonth() + 1,
    partie: searchParams.get("partie") === "2" ? "fin" : "debut",
    nbJours: 11
  });
  const [choix2, setChoix2] = useState<Choix>(() => ({ ...choix1, nbJours: 6 }));

  const [apercu, setApercu] = useState<Apercu | null>(null);
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);
  const [resultat, setResultat] = useState<{ succes: boolean; message: string } | null>(null);

  // Toute modification du formulaire invalide l'aperçu : on ne peut confirmer
  // que ce qui a été prévisualisé.
  useEffect(() => {
    setApercu(null);
  }, [mode, choix1, choix2]);

  const aujourdhuiStr = maintenant.toISOString().slice(0, 10);
  const groupesFetes = FETES_EXCLUSIVES.map((g) => ({
    titre: g.titre,
    fetes: annees.flatMap((a) => fetesExclusives(a).find((x) => x.titre === g.titre)?.fetes ?? []).filter((f) => f.date > aujourdhuiStr)
  })).filter((g) => g.fetes.length > 0);

  async function envoyer(confirmer: boolean) {
    setErreur("");
    setResultat(null);
    setChargement(true);
    try {
      const { data } = await appelApi<Apercu>(router, "/api/demande", {
        periodes: mode === 1 ? [choix1] : [choix1, choix2],
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

  function champsPeriode(c: Choix, maj: (c: Choix) => void, minJours: number) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="libelle">Mois de départ</span>
            <select value={c.mois} onChange={(e) => maj({ ...c, mois: Number(e.target.value) })} className="champ">
              {MOIS_NOMS.map((nom, idx) => (
                <option key={nom} value={idx + 1}>{nom}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="libelle">Année</span>
            <select value={c.annee} onChange={(e) => maj({ ...c, annee: Number(e.target.value) })} className="champ">
              {annees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="libelle">Nombre de jours</span>
            <input
              type="number"
              min={minJours}
              max={90}
              value={c.nbJours}
              onChange={(e) => maj({ ...c, nbJours: Number(e.target.value) })}
              className="champ font-semibold"
            />
          </label>
        </div>
        <div>
          <span className="libelle">Date de départ</span>
          <div className="mt-1.5 flex flex-col gap-2.5 sm:flex-row">
            <button type="button" onClick={() => maj({ ...c, partie: "debut" })} className={bouton(c.partie === "debut")}>
              {puce(c.partie === "debut")} Le 1er du mois
            </button>
            <button type="button" onClick={() => maj({ ...c, partie: "fin" })} className={bouton(c.partie === "fin")}>
              {puce(c.partie === "fin")} Le 16 du mois
            </button>
          </div>
        </div>
      </div>
    );
  }

  const total = choix1.nbJours + (mode === 2 ? choix2.nbJours : 0);

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
          description="Départ le 1er ou le 16 du mois, minimum 11 jours. Les dimanches et jours fériés du calendrier sénégalais ne sont pas décomptés : seuls les jours ouvrables posés sont déduits de votre solde, recalculé à la date de départ (+2 jours par mois d'ici là)."
        />

        <Carte className="p-5 sm:p-6">
          <ol className="space-y-6">
            <li>
              <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">1</span>
                Comment organiser votre congé ?
              </h2>
              <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
                <button type="button" onClick={() => setMode(1)} className={bouton(mode === 1)}>
                  {puce(mode === 1)}
                  <span>
                    En une seule fois
                    <span className="block text-sm font-normal text-slate-500">Une période continue, un mois complet ou plus</span>
                  </span>
                </button>
                <button type="button" onClick={() => setMode(2)} className={bouton(mode === 2)}>
                  {puce(mode === 2)}
                  <span>
                    Sur 2 périodes différentes
                    <span className="block text-sm font-normal text-slate-500">Chaque période a son mois, son départ et sa durée</span>
                  </span>
                </button>
              </div>
            </li>

            <li>
              <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">2</span>
                {mode === 1 ? "Quand et combien de jours ?" : "1ʳᵉ période"}
              </h2>
              <div className="mt-3">{champsPeriode(choix1, setChoix1, mode === 1 ? 11 : 1)}</div>
              {mode === 1 && (
                <p className="mt-2 text-sm text-slate-500">
                  Minimum 11 jours. Le congé se poursuit sans interruption et peut déborder sur le mois suivant.
                </p>
              )}
            </li>

            {mode === 2 && (
              <li>
                <h2 className="flex items-center gap-2.5 text-base font-bold text-slate-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs text-white">3</span>
                  2ᵉ période
                </h2>
                <div className="mt-3">{champsPeriode(choix2, setChoix2, 1)}</div>
                <p className={`mt-2 text-sm ${total >= 11 ? "text-slate-500" : "font-semibold text-amber-700"}`}>
                  Total des deux périodes : {total} jours (minimum 11). Les deux périodes forment un seul vœu.
                </p>
              </li>
            )}
          </ol>

          {groupesFetes.length > 0 && (
            <Alerte type="info" className="mt-5">
              <p className="font-semibold">Grandes fêtes : une seule par groupe et par année</p>
              <p className="mt-1">
                Vous ne pouvez pas être en congé à la fois pour la Korité et la Tabaski, ni à la fois pour le Grand Magal de
                Touba et le Gamou. Dates prévues (estimations, à confirmer par le calendrier officiel) :
              </p>
              <ul className="mt-1 list-disc pl-5">
                {groupesFetes.map((g) => (
                  <li key={g.titre}>
                    <strong>{g.titre}</strong> : {g.fetes.map((f) => `${f.nom} ${formatFr(f.date)}`).join(" · ")}
                  </li>
                ))}
              </ul>
            </Alerte>
          )}

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
              {apercu.periodes.map((p, i) => (
                <div key={p.debut} className="mt-3 rounded-xl bg-white/70 p-3">
                  {apercu.periodes.length > 1 && (
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Période {i + 1}</p>
                  )}
                  <p className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900">
                    {formatFr(p.debut)}
                    <ArrowRight className="h-5 w-5 text-emerald-600" aria-hidden />
                    retour {formatFr(dateRetour(p.fin))}
                  </p>
                  <p className="mt-1 text-[15px] text-slate-700">
                    {p.calendaires} jours d&apos;absence − {p.dimanches} dimanche{p.dimanches > 1 ? "s" : ""}
                    {p.feries.length > 0 && ` − ${p.feries.length} férié${p.feries.length > 1 ? "s" : ""}`} ={" "}
                    <strong>{p.jours} jours déduits</strong>
                  </p>
                  {p.feries.length > 0 && (
                    <p className="mt-0.5 text-sm text-slate-500">
                      Non décomptés : {p.feries.map((f) => `${f.nom} (${formatFr(f.date)})`).join(", ")}
                    </p>
                  )}
                  <p className="mt-1 text-[15px] text-slate-700">
                    Solde au départ : <strong>{p.soldeAvant} jours</strong> → après ce congé : <strong>{p.soldeApres} jours</strong>
                  </p>
                </div>
              ))}
              <p className="mt-3 text-[15px] text-slate-700">
                {apercu.nbJours} jours seront déduits de votre solde. Les règles seront revérifiées à l&apos;envoi.
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
