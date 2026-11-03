"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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

  const champ = "mt-2 w-full rounded-card border border-encre-700 bg-encre-900 px-4 py-2 text-parchemin-50";
  const bouton = (actif: boolean) =>
    `flex-1 rounded-card border px-4 py-2 text-sm transition ${
      actif ? "border-cachet bg-cachet/10 text-cachet-light" : "border-encre-700 text-parchemin-100/60"
    }`;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between">
        <Link href="/dashboard" className="eyebrow text-parchemin-100/40 hover:text-parchemin-100/70">
          ← Retour au dossier
        </Link>
        <Link href="/planning" className="eyebrow text-cachet-light hover:text-cachet">
          Voir les disponibilités →
        </Link>
      </div>

      <p className="eyebrow mt-6 text-cachet-light">Nouveau vœu</p>
      <h1 className="font-display text-3xl font-semibold text-parchemin-50">Déposer un vœu de congé</h1>
      <p className="mt-2 text-sm text-parchemin-100/70">
        Départ le 1er ou le 16 du mois, minimum 11 jours. Les dimanches et jours fériés ne sont pas
        décomptés. Votre solde est recalculé à la date de départ (+2 jours par mois d&apos;ici là).
      </p>

      <div className="card mt-8 rounded-card px-6 py-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow text-parchemin-100/50">Mois de départ</span>
            <select value={mois} onChange={(e) => setMois(Number(e.target.value))} className={champ}>
              {MOIS_NOMS.map((nom, idx) => (
                <option key={nom} value={idx + 1}>{nom}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="eyebrow text-parchemin-100/50">Année</span>
            <select value={annee} onChange={(e) => setAnnee(Number(e.target.value))} className={`${champ} font-mono`}>
              {[0, 1, 2].map((d) => (
                <option key={d} value={anneeCourante + d}>{anneeCourante + d}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5">
          <span className="eyebrow text-parchemin-100/50">Nombre de parties</span>
          <div className="mt-2 flex gap-3">
            <button type="button" onClick={() => setNbParties(1)} className={bouton(nbParties === 1)}>
              1 partie (continue)
            </button>
            <button type="button" onClick={() => setNbParties(2)} className={bouton(nbParties === 2)}>
              2 parties (1–15 et 16–fin)
            </button>
          </div>
        </div>

        {nbParties === 1 && (
          <div className="mt-5">
            <span className="eyebrow text-parchemin-100/50">Date de départ</span>
            <div className="mt-2 flex gap-3">
              <button type="button" onClick={() => setPartieChoisie("debut")} className={bouton(partieChoisie === "debut")}>
                Le 1er du mois
              </button>
              <button type="button" onClick={() => setPartieChoisie("fin")} className={bouton(partieChoisie === "fin")}>
                Le 16 du mois
              </button>
            </div>
            <p className="mt-2 text-xs text-parchemin-100/40">
              Le congé se poursuit sans interruption et peut déborder sur le mois suivant.
            </p>
          </div>
        )}

        <label className="mt-5 block">
          <span className="eyebrow text-parchemin-100/50">Nombre de jours (min. 11, hors dimanches et fériés)</span>
          <input
            type="number"
            min={11}
            max={90}
            value={nbJours}
            onChange={(e) => setNbJours(Number(e.target.value))}
            className={`${champ} font-mono`}
          />
        </label>

        {erreur && (
          <p role="alert" className="mt-4 rounded-card border border-alerte/40 bg-alerte/10 px-4 py-3 text-sm text-alerte">
            {erreur}
          </p>
        )}

        <button
          onClick={() => envoyer(false)}
          disabled={chargement}
          className="mt-6 w-full rounded-card border border-cachet px-4 py-3 font-medium text-cachet-light transition hover:bg-cachet/10 disabled:opacity-50"
        >
          {chargement && !apercu ? "Vérification…" : "Vérifier mon vœu"}
        </button>

        {apercu && (
          <div className="mt-5 rounded-card border border-succes/40 bg-succes/10 px-5 py-4">
            {apercu.periodes.map((p) => (
              <p key={p.debut} className="font-display text-lg text-parchemin-50">
                Départ {formatFr(p.debut)} → retour {formatFr(dateRetour(p.fin))}{" "}
                <span className="text-sm text-parchemin-100/60">({p.jours} j)</span>
              </p>
            ))}
            <p className="mt-1 text-sm text-parchemin-100/70">
              {apercu.nbJours} jours décomptés. Solde au départ : {apercu.soldeAuDepart} jours. Toutes les
              règles sont respectées à l&apos;instant ; elles sont revérifiées à l&apos;envoi.
            </p>
            <button
              onClick={() => envoyer(true)}
              disabled={chargement}
              className="mt-4 w-full rounded-card bg-cachet px-4 py-3 font-medium text-encre-950 transition hover:bg-cachet-light disabled:opacity-50"
            >
              {chargement ? "Envoi…" : "Confirmer et envoyer mon vœu"}
            </button>
          </div>
        )}

        {resultat && (
          <div
            role="status"
            className={`mt-5 rounded-card border px-5 py-4 text-sm ${
              resultat.succes ? "border-succes/40 bg-succes/10 text-parchemin-50" : "border-alerte/40 bg-alerte/10 text-alerte"
            }`}
          >
            {resultat.message}
            {resultat.succes && (
              <Link href="/dashboard" className="mt-3 block text-xs text-cachet-light underline">
                Retour au dossier →
              </Link>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function DemandePage() {
  return (
    <Suspense fallback={<main className="eyebrow mx-auto max-w-2xl px-4 py-12 text-parchemin-100/50">Chargement…</main>}>
      <DemandeForm />
    </Suspense>
  );
}
