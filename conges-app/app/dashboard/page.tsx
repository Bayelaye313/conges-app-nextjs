"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  CalendarPlus,
  ChevronDown,
  History,
  Plane,
  Plus,
  Wallet,
  X
} from "lucide-react";
import {
  Alerte,
  BadgeStatut,
  BarreNavigation,
  Bouton,
  Carte,
  Chargement,
  classesBouton,
  EcranErreur,
  EnTete,
  Indicateur
} from "@/components/ui";
import {
  appelApi,
  dateRetour,
  formatFr,
  moisAnnee,
  RedirectionEnCours
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

  if (erreur) return <EcranErreur message={erreur} />;

  if (!donnees) {
    return (
      <>
        <BarreNavigation />
        <Chargement texte="Ouverture de votre dossier…" />
      </>
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

  const maxProjection = Math.max(minJours, ...agent.projection.map((p) => p.solde), 1);

  return (
    <>
      <BarreNavigation />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <EnTete
          surtitre={`Matricule ${agent.matricule} · ${agent.fonction}`}
          titre={`Bonjour, ${agent.prenom} !`}
          description="Voici l'état de vos droits à congé et le suivi de vos vœux."
          actions={
            <Link href="/demande" className={classesBouton("primaire", "lg")}>
              <Plus className="h-5 w-5" aria-hidden />
              Déposer un vœu
            </Link>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          <Indicateur
            titre="Solde aujourd'hui"
            icone={Wallet}
            ton={agent.solde < 0 ? "rose" : "brand"}
            valeur={<span className={agent.solde < 0 ? "text-rose-600" : ""}>{agent.solde} <span className="text-base font-semibold text-slate-400">jours</span></span>}
            detail={`${agent.jours_acquis} acquis − ${agent.jours_pris} pris · +2 j chaque mois`}
          />
          <Indicateur
            titre="Ancienneté"
            icone={Award}
            ton="emerald"
            valeur={formatAnciennete(agent.anciennete_mois)}
            detail={`Entrée le ${formatFr(agent.date_embauche)}`}
          />
          <Indicateur
            titre="Dernier congé"
            icone={Plane}
            ton="amber"
            valeur={<span className="text-lg">{dernier ? `Retour le ${formatFr(dateRetour(dernier.fin))}` : "Aucun enregistré"}</span>}
            detail={dernier ? `Départ le ${formatFr(dernier.debut)}` : undefined}
          />
        </div>

        <Alerte type={agent.solde_a_cette_date < minJours ? "attention" : "info"} className="mt-4">
          <p>
            Premier départ possible : <strong>{formatFr(agent.premiere_date_possible)}</strong>
            {agent.premiere_date_possible === agent.date_anniversaire && " (date anniversaire de votre entrée)"}
            {" "}— vous aurez alors <strong>{agent.solde_a_cette_date} jours</strong>.
          </p>
          {agent.solde_a_cette_date < minJours && (
            <p className="mt-1 font-medium">
              {moisSuffisant
                ? `Le minimum de ${minJours} jours sera atteint à partir de ${moisAnnee(moisSuffisant.mois).toLowerCase()} (${moisSuffisant.solde} jours).`
                : `Le minimum de ${minJours} jours ne sera pas atteint dans les 12 prochains mois.`}
            </p>
          )}
        </Alerte>

        <div className="mt-6 grid gap-5 lg:grid-cols-5">
          <section className="lg:col-span-3">
            <Carte>
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
                <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                  Mes vœux de congé
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{voeuxActifs.length}</span>
                </h2>
                <Link href="/demande" className={classesBouton("secondaire", "sm")}>
                  <Plus className="h-4 w-4" aria-hidden />
                  Nouveau
                </Link>
              </div>
              {message && <Alerte type="info" role="status" className="mx-5 mt-4">{message}</Alerte>}
              {agent.demandes.length === 0 ? (
                <div className="flex flex-col items-center px-5 py-10 text-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <CalendarPlus className="h-6 w-6" aria-hidden />
                  </span>
                  <p className="mt-3 text-base font-semibold text-slate-900">Aucun vœu pour l&apos;instant</p>
                  <p className="mt-1 max-w-xs text-sm text-slate-500">
                    Consultez les disponibilités puis déposez votre premier vœu de congé.
                  </p>
                  <Link href="/planning" className={classesBouton("secondaire", "sm", "mt-4")}>Voir les disponibilités</Link>
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {agent.demandes.map((d) => (
                    <li key={d.id} className={`px-5 py-3.5 ${d.statut === "supprime" ? "opacity-60" : ""}`}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="space-y-1">
                          {d.periodes.map((p) => (
                            <p key={p.debut} className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-slate-900">
                              {formatFr(p.debut)}
                              <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden />
                              retour {formatFr(dateRetour(p.fin))}
                              <span className="text-sm font-medium text-slate-500">· {p.jours} jours</span>
                            </p>
                          ))}
                        </div>
                        <div className="flex items-center gap-2">
                          <BadgeStatut statut={d.statut} />
                          {d.statut === "en_attente" && (
                            <Bouton variante="danger" taille="sm" onClick={() => annuler(d.id)}>
                              <X className="h-4 w-4" aria-hidden />
                              Annuler
                            </Bouton>
                          )}
                        </div>
                      </div>
                      {d.motif && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{d.motif}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Carte>
          </section>

          <section className="lg:col-span-2">
            <Carte className="p-5">
              <h2 className="text-base font-bold text-slate-900">Évolution de mon solde</h2>
              <p className="text-sm text-slate-500">Au 1er de chaque mois, vœux déjà déduits</p>
              <ul className="mt-4 space-y-2">
                {agent.projection.map((p) => {
                  const suffisant = p.solde >= minJours;
                  return (
                    <li key={p.mois} className="flex items-center gap-3 text-sm">
                      <span className="w-20 shrink-0 font-medium capitalize text-slate-600">{moisAnnee(p.mois)}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className={`block h-full rounded-full ${suffisant ? "bg-brand-500" : "bg-slate-300"}`}
                          style={{ width: `${Math.max(0, p.solde / maxProjection) * 100}%` }}
                        />
                      </span>
                      <span className={`w-12 shrink-0 text-right font-bold tabular-nums ${suffisant ? "text-slate-900" : "text-slate-400"}`}>
                        {p.solde} j
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-xs text-slate-500">
                Barres bleues : minimum de {minJours} jours atteint. Dimanches et jours fériés non décomptés.
              </p>
            </Carte>
          </section>
        </div>

        <Carte className="mt-5">
          <button
            onClick={() => setHistoriqueOuvert((v) => !v)}
            aria-expanded={historiqueOuvert}
            className="flex w-full items-center justify-between rounded-2xl px-5 py-3.5 text-left transition hover:bg-slate-50/70"
          >
            <span className="flex items-center gap-3 text-base font-bold text-slate-900">
              <History className="h-[18px] w-[18px] text-slate-400" aria-hidden />
              Congés déjà enregistrés
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{agent.historique.length}</span>
            </span>
            <ChevronDown className={`h-5 w-5 text-slate-400 transition ${historiqueOuvert ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {historiqueOuvert && (
            <ul className="divide-y divide-slate-100 border-t border-slate-100">
              {agent.historique.length === 0 && (
                <li className="px-5 py-3.5 text-sm text-slate-500">Aucun congé enregistré.</li>
              )}
              {agent.historique.map((h) => (
                <li key={h.debut} className="flex items-center justify-between px-5 py-2.5 text-sm">
                  <span className="text-slate-800">
                    {formatFr(h.debut)} → retour {formatFr(dateRetour(h.fin))}
                  </span>
                  <span className="text-sm font-medium text-slate-500">{h.jours} jours</span>
                </li>
              ))}
            </ul>
          )}
        </Carte>
      </main>
    </>
  );
}
