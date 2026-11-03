"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  appelApi,
  dateRetour,
  formatFr,
  moisAnnee,
  RedirectionEnCours,
  STATUTS_VOEU
} from "@/lib/client";

interface Periode {
  debut: string;
  fin: string;
  jours: number;
}

interface Demande {
  id: string;
  periodes: Periode[];
  jours: number;
  statut: "en_attente" | "valide" | "supprime";
  cree_le: string;
  motif?: string;
}

interface Agent {
  matricule: string;
  prenom: string;
  nom: string;
  fonction: string;
  role: string;
  date_embauche: string;
  date_anniversaire: string;
  anciennete_mois: number;
  jours_acquis: number;
  jours_pris: number;
  solde: number;
  premiere_date_possible: string;
  solde_a_cette_date: number;
  projection: { mois: string; solde: number }[];
  historique: Periode[];
  demandes: Demande[];
}

interface ReponseMoi {
  agent: Agent;
  minJours: number;
  plafond: number | null;
}

function formatAnciennete(mois: number) {
  const ans = Math.floor(mois / 12);
  const reste = mois % 12;
  if (ans === 0) return `${reste} mois`;
  return `${ans} an${ans > 1 ? "s" : ""}${reste ? ` ${reste} mois` : ""}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [donnees, setDonnees] = useState<ReponseMoi | null>(null);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [historiqueOuvert, setHistoriqueOuvert] = useState(false);

  const charger = useCallback(() => {
    appelApi<ReponseMoi>(router, "/api/moi")
      .then(({ data }) => {
        if (!data.ok) setErreur(data.message ?? "Impossible de charger votre dossier.");
        else setDonnees(data);
      })
      .catch((err) => {
        if (!(err instanceof RedirectionEnCours)) setErreur((err as Error).message);
      });
  }, [router]);

  useEffect(charger, [charger]);

  async function annuler(id: string) {
    if (!window.confirm("Annuler ce vœu ? La place sera libérée pour les autres agents.")) return;
    try {
      const { data } = await appelApi(router, "/api/demande/annuler", { id });
      setMessage(data.message ?? "");
      charger();
    } catch (err) {
      if (!(err instanceof RedirectionEnCours)) setMessage((err as Error).message);
    }
  }

  async function deconnecter() {
    await fetch("/api/auth/deconnexion", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  }

  if (erreur) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p role="alert" className="text-alerte">{erreur}</p>
        <button onClick={() => router.replace("/")} className="text-cachet-light underline">
          Retour à l&apos;accueil
        </button>
      </main>
    );
  }

  if (!donnees) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="eyebrow text-parchemin-100/50">Ouverture du dossier…</p>
      </main>
    );
  }

  const { agent, minJours } = donnees;
  const dernier = [...agent.historique, ...agent.demandes.filter((d) => d.statut !== "supprime").flatMap((d) => d.periodes)]
    .reduce<Periode | null>((max, p) => (!max || p.fin > max.fin ? p : max), null);
  const moisSuffisant =
    agent.solde_a_cette_date >= minJours
      ? null
      : agent.projection.find((p) => p.mois >= agent.premiere_date_possible && p.solde >= minJours) ?? null;
  const voeuxActifs = agent.demandes.filter((d) => d.statut !== "supprime");

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-cachet-light">Dossier de l&apos;agent</p>
          <h1 className="font-display text-3xl font-semibold text-parchemin-50">
            {agent.prenom} {agent.nom}
          </h1>
          <p className="mt-1 font-mono text-sm text-parchemin-100/50">
            Matricule {agent.matricule} · {agent.fonction}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <button onClick={deconnecter} className="eyebrow text-parchemin-100/40 hover:text-parchemin-100/70">
            Se déconnecter
          </button>
          <Link href="/compte" className="eyebrow text-parchemin-100/40 hover:text-parchemin-100/70">
            Changer mon code
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card rounded-card px-5 py-4">
          <p className="eyebrow text-parchemin-100/50">Solde aujourd&apos;hui</p>
          <p className={`mt-2 font-display text-3xl ${agent.solde < 0 ? "text-alerte" : "text-parchemin-50"}`}>
            {agent.solde}
            <span className="ml-1 text-base text-parchemin-100/50">jours</span>
          </p>
          <p className="mt-1 font-mono text-[11px] text-parchemin-100/40">
            {agent.jours_acquis} acquis − {agent.jours_pris} pris · +2 j chaque mois
          </p>
        </div>
        <div className="card rounded-card px-5 py-4">
          <p className="eyebrow text-parchemin-100/50">Ancienneté</p>
          <p className="mt-2 font-display text-2xl text-parchemin-50">{formatAnciennete(agent.anciennete_mois)}</p>
          <p className="mt-1 font-mono text-[11px] text-parchemin-100/40">
            entrée le {formatFr(agent.date_embauche)}
          </p>
        </div>
        <div className="card rounded-card px-5 py-4">
          <p className="eyebrow text-parchemin-100/50">Dernier congé</p>
          <p className="mt-2 font-display text-lg text-parchemin-50">
            {dernier ? `retour le ${formatFr(dateRetour(dernier.fin))}` : "Aucun enregistré"}
          </p>
          {dernier && (
            <p className="mt-1 font-mono text-[11px] text-parchemin-100/40">départ le {formatFr(dernier.debut)}</p>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-card border border-cachet/40 bg-cachet/10 px-5 py-4 text-sm text-parchemin-50">
        <p>
          Premier départ possible : <strong>{formatFr(agent.premiere_date_possible)}</strong>
          {agent.premiere_date_possible === agent.date_anniversaire && " (date anniversaire de votre entrée)"}
          {" "}— vous aurez alors <strong>{agent.solde_a_cette_date} jours</strong>.
        </p>
        {agent.solde_a_cette_date < minJours && (
          <p className="mt-1 text-cachet-light">
            {moisSuffisant
              ? `Le minimum de ${minJours} jours sera atteint à partir de ${moisAnnee(moisSuffisant.mois).toLowerCase()} (${moisSuffisant.solde} jours).`
              : `Le minimum de ${minJours} jours ne sera pas atteint dans les 12 prochains mois.`}
          </p>
        )}
      </div>

      <section className="mt-10">
        <div className="mb-3 flex items-center justify-between">
          <p className="eyebrow text-parchemin-100/50">Mes vœux de congé ({voeuxActifs.length})</p>
          <Link href="/demande" className="eyebrow text-cachet-light hover:text-cachet">+ Nouveau vœu</Link>
        </div>
        {message && <p className="mb-3 text-sm text-parchemin-100/70">{message}</p>}
        <div className="card divide-y divide-encre-700 rounded-card">
          {agent.demandes.length === 0 && (
            <p className="px-5 py-4 text-sm text-parchemin-100/50">
              Vous n&apos;avez pas encore déposé de vœu.
            </p>
          )}
          {agent.demandes.map((d) => (
            <div key={d.id} className={`px-5 py-3 text-sm ${d.statut === "supprime" ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-mono text-parchemin-50">
                  {d.periodes.map((p) => (
                    <div key={p.debut}>
                      {formatFr(p.debut)} → retour {formatFr(dateRetour(p.fin))}{" "}
                      <span className="text-parchemin-100/50">({p.jours} j)</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`rounded border px-2 py-0.5 text-xs ${STATUTS_VOEU[d.statut].classe}`}>
                    {STATUTS_VOEU[d.statut].libelle}
                  </span>
                  {d.statut === "en_attente" && (
                    <button onClick={() => annuler(d.id)} className="text-xs text-parchemin-100/50 underline hover:text-alerte">
                      Annuler
                    </button>
                  )}
                </div>
              </div>
              {d.motif && <p className="mt-1 text-xs text-parchemin-100/40">{d.motif}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <p className="eyebrow mb-3 text-parchemin-100/50">Évolution de mon solde (au 1er de chaque mois)</p>
        <div className="card grid grid-cols-3 gap-px overflow-hidden rounded-card bg-encre-700 sm:grid-cols-6">
          {agent.projection.map((p) => (
            <div key={p.mois} className="bg-encre-900 px-3 py-2 text-center">
              <p className="font-mono text-[10px] uppercase text-parchemin-100/40">{moisAnnee(p.mois)}</p>
              <p className={`font-display text-lg ${p.solde >= minJours ? "text-parchemin-50" : "text-parchemin-100/40"}`}>
                {p.solde} j
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-parchemin-100/40">
          Les jours sont décomptés hors dimanches et jours fériés. Vos vœux sont déjà déduits.
        </p>
      </section>

      <section className="mt-8">
        <button
          onClick={() => setHistoriqueOuvert((v) => !v)}
          aria-expanded={historiqueOuvert}
          className="eyebrow flex w-full items-center justify-between text-parchemin-100/50 hover:text-parchemin-100/80"
        >
          <span>Congés déjà enregistrés ({agent.historique.length})</span>
          <span>{historiqueOuvert ? "▲" : "▼"}</span>
        </button>
        {historiqueOuvert && (
          <div className="card mt-3 divide-y divide-encre-700 rounded-card">
            {agent.historique.length === 0 && (
              <p className="px-5 py-4 text-sm text-parchemin-100/50">Aucun congé enregistré.</p>
            )}
            {agent.historique.map((h) => (
              <div key={h.debut} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="font-mono text-parchemin-50">
                  {formatFr(h.debut)} → retour {formatFr(dateRetour(h.fin))}
                </span>
                <span className="text-xs text-parchemin-100/40">{h.jours} j</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mt-10 flex flex-wrap justify-end gap-3">
        <Link href="/legal" className="rounded-card border border-encre-700 px-6 py-3 font-medium text-parchemin-100/70 transition hover:border-cachet/50 hover:text-cachet-light">
          Cadre légal
        </Link>
        <Link href="/planning" className="rounded-card border border-encre-700 px-6 py-3 font-medium text-parchemin-100/70 transition hover:border-cachet/50 hover:text-cachet-light">
          Voir les disponibilités
        </Link>
        <Link href="/demande" className="rounded-card bg-cachet px-6 py-3 font-medium text-encre-950 transition hover:bg-cachet-light">
          Déposer un vœu de congé
        </Link>
      </div>
    </main>
  );
}
