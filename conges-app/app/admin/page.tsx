"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { appelApi, dateRetour, formatFr, RedirectionEnCours, STATUTS_VOEU } from "@/lib/client";

type Role = "AV" | "CEV" | "CS";

interface Periode {
  debut: string;
  fin: string;
  jours: number;
}

interface LigneDemande {
  id: string;
  matricule: string;
  prenom: string;
  nom: string;
  role: Role;
  periodes: Periode[];
  jours: number;
  statut: "en_attente" | "valide" | "supprime";
  cree_le: string;
  traite_le?: string;
  traite_par?: string;
  motif?: string;
}

interface LigneAgent {
  matricule: string;
  prenom: string;
  nom: string;
  fonction: string;
  role: Role;
  date_embauche: string;
  date_anniversaire: string;
  solde: number;
  dernier_conge_fin: string | null;
  premiere_date_possible: string;
  solde_a_cette_date: number;
  date_solde_suffisant: string | null;
  voeux_actifs: number;
  a_soumis: boolean;
  a_code: boolean;
  code_change: boolean;
}

interface Occupation {
  cle: string;
  libelle: string;
  absents: number;
  plafond: number | null;
}

interface Synthese {
  admin: { matricule: string; nom: string };
  minJours: number;
  plafonds: Record<Role, number | null>;
  genere_le: string;
  kpis: {
    agents: number;
    agents_ayant_soumis: number;
    agents_sans_voeu: number;
    taux_soumission: number;
    voeux_en_attente: number;
    voeux_valides: number;
    voeux_supprimes: number;
    jours_demandes: number;
    agents_moins_un_an: number;
    agents_solde_insuffisant_aujourdhui: number;
    agents_connectes: number;
    par_role: Record<Role, { agents: number; ayant_soumis: number }>;
  };
  agents: LigneAgent[];
  demandes: LigneDemande[];
  occupation: Record<Role, Occupation[]>;
}

type Onglet = "voeux" | "sans_voeu" | "agents" | "occupation";

function Kpi({ titre, valeur, detail, accent }: { titre: string; valeur: string | number; detail?: string; accent?: boolean }) {
  return (
    <div className="card rounded-card px-4 py-3">
      <p className="eyebrow text-parchemin-100/50">{titre}</p>
      <p className={`mt-1 font-display text-2xl ${accent ? "text-cachet-light" : "text-parchemin-50"}`}>{valeur}</p>
      {detail && <p className="font-mono text-[11px] text-parchemin-100/40">{detail}</p>}
    </div>
  );
}

function correspond(recherche: string, ...champs: string[]) {
  const r = recherche.trim().toLowerCase();
  return !r || champs.some((c) => c.toLowerCase().includes(r));
}

export default function AdminPage() {
  const router = useRouter();
  const [s, setS] = useState<Synthese | null>(null);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState("");
  const [onglet, setOnglet] = useState<Onglet>("voeux");
  const [filtreStatut, setFiltreStatut] = useState<"tous" | LigneDemande["statut"]>("en_attente");
  const [filtreRole, setFiltreRole] = useState<"tous" | Role>("tous");
  const [recherche, setRecherche] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);
  const [codeAffiche, setCodeAffiche] = useState<{ matricule: string; nom: string; code: string } | null>(null);

  const charger = useCallback(() => {
    appelApi<Synthese>(router, "/api/admin/synthese")
      .then(({ data }) => {
        if (!data.ok) setErreur(data.message ?? "Accès refusé.");
        else setS(data);
      })
      .catch((err) => {
        if (!(err instanceof RedirectionEnCours)) setErreur((err as Error).message);
      });
  }, [router]);

  useEffect(charger, [charger]);

  async function traiter(d: LigneDemande, action: "valider" | "supprimer") {
    let motif: string | undefined;
    if (action === "supprimer") {
      const saisie = window.prompt(`Supprimer le vœu de ${d.prenom} ${d.nom} ? Motif (facultatif, visible par l'agent) :`, "");
      if (saisie === null) return;
      motif = saisie;
    }
    setEnCours(d.id);
    try {
      const { data } = await appelApi(router, "/api/admin/demandes", { matricule: d.matricule, id: d.id, action, motif });
      setMessage(`${d.matricule} — ${data.message}`);
      charger();
    } catch (err) {
      if (!(err instanceof RedirectionEnCours)) setMessage((err as Error).message);
    }
    setEnCours(null);
  }

  async function validerTout(liste: LigneDemande[]) {
    const aValider = liste.filter((d) => d.statut === "en_attente");
    if (!aValider.length || !window.confirm(`Valider les ${aValider.length} vœux en attente affichés ?`)) return;
    setEnCours("tous");
    let ok = 0;
    for (const d of aValider) {
      try {
        const { data } = await appelApi(router, "/api/admin/demandes", { matricule: d.matricule, id: d.id, action: "valider" });
        if (data.ok) ok++;
      } catch (err) {
        if (err instanceof RedirectionEnCours) return;
      }
    }
    setMessage(`${ok} vœu(x) validé(s) sur ${aValider.length}.`);
    setEnCours(null);
    charger();
  }

  async function nouveauCode(a: LigneAgent) {
    const avertissement = a.code_change
      ? `${a.prenom} ${a.nom} a déjà choisi son code. Le remplacer par un code provisoire ? Ses sessions seront fermées.`
      : `Générer un code provisoire pour ${a.prenom} ${a.nom} ?`;
    if (!window.confirm(avertissement)) return;
    try {
      const { data } = await appelApi<{ code: string }>(router, "/api/admin/code", { matricule: a.matricule });
      if (data.ok) setCodeAffiche({ matricule: a.matricule, nom: `${a.prenom} ${a.nom}`, code: data.code });
      else setMessage(data.message ?? "Échec.");
      charger();
    } catch (err) {
      if (!(err instanceof RedirectionEnCours)) setMessage((err as Error).message);
    }
  }

  async function deconnecter() {
    await fetch("/api/auth/deconnexion", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  }

  const demandesFiltrees = useMemo(
    () =>
      (s?.demandes ?? []).filter(
        (d) =>
          (filtreStatut === "tous" || d.statut === filtreStatut) &&
          (filtreRole === "tous" || d.role === filtreRole) &&
          correspond(recherche, d.matricule, d.prenom, d.nom)
      ),
    [s, filtreStatut, filtreRole, recherche]
  );

  const agentsFiltres = useMemo(
    () =>
      (s?.agents ?? []).filter(
        (a) =>
          (onglet !== "sans_voeu" || !a.a_soumis) &&
          (filtreRole === "tous" || a.role === filtreRole) &&
          correspond(recherche, a.matricule, a.prenom, a.nom, a.fonction)
      ),
    [s, onglet, filtreRole, recherche]
  );

  if (erreur) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4">
        <p role="alert" className="text-alerte">{erreur}</p>
        <button onClick={() => router.replace("/")} className="text-cachet-light underline">Retour à l&apos;accueil</button>
      </main>
    );
  }
  if (!s) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="eyebrow text-parchemin-100/50">Chargement du tableau de bord…</p>
      </main>
    );
  }

  const { kpis } = s;
  const lienOnglet = (o: Onglet, libelle: string) => (
    <button
      onClick={() => setOnglet(o)}
      className={`rounded-card border px-3 py-1.5 text-sm ${onglet === o ? "border-cachet bg-cachet/10 text-cachet-light" : "border-encre-700 text-parchemin-100/60 hover:text-parchemin-100"}`}
    >
      {libelle}
    </button>
  );
  const cellule = "px-3 py-2 align-top";

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-cachet-light">Administration — campagne des vœux</p>
          <h1 className="font-display text-3xl font-semibold text-parchemin-50">Tableau de bord</h1>
          <p className="mt-1 font-mono text-xs text-parchemin-100/40">
            {s.admin.nom} ({s.admin.matricule}) · données du {new Date(s.genere_le).toLocaleString("fr-FR")}
            <button onClick={charger} className="ml-3 underline hover:text-parchemin-100">Actualiser</button>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <a href="/api/admin/export?type=voeux" className="rounded-card bg-cachet px-3 py-2 font-medium text-encre-950 hover:bg-cachet-light">Exporter les vœux (CSV)</a>
          <a href="/api/admin/export?type=agents" className="rounded-card border border-cachet px-3 py-2 text-cachet-light hover:bg-cachet/10">Exporter les agents (CSV)</a>
          <a href="/api/admin/export?type=registre" className="rounded-card border border-encre-700 px-3 py-2 text-parchemin-100/70 hover:border-cachet/50">Sauvegarde (JSON)</a>
          <Link href="/compte" className="eyebrow ml-2 text-parchemin-100/40 hover:text-parchemin-100/70">Mon code</Link>
          <button onClick={deconnecter} className="eyebrow text-parchemin-100/40 hover:text-parchemin-100/70">Déconnexion</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi titre="Taux de soumission" valeur={`${kpis.taux_soumission} %`} detail={`${kpis.agents_ayant_soumis} / ${kpis.agents} agents`} accent />
        <Kpi titre="Sans vœu" valeur={kpis.agents_sans_voeu} detail="agents à relancer" />
        <Kpi titre="Vœux en attente" valeur={kpis.voeux_en_attente} detail="à valider" accent={kpis.voeux_en_attente > 0} />
        <Kpi titre="Vœux validés" valeur={kpis.voeux_valides} detail={`${kpis.voeux_supprimes} supprimé(s)`} />
        <Kpi titre="Jours demandés" valeur={kpis.jours_demandes} detail="vœux actifs" />
        <Kpi titre="Codes choisis" valeur={`${kpis.agents_connectes} / ${kpis.agents}`} detail="agents déjà connectés" />
        <Kpi titre="Moins d'un an" valeur={kpis.agents_moins_un_an} detail="départ à la date anniversaire" />
        <Kpi titre={`Solde < ${s.minJours} j`} valeur={kpis.agents_solde_insuffisant_aujourdhui} detail="aujourd'hui (+2 j/mois)" />
        {(["AV", "CEV", "CS"] as Role[]).map((r) => (
          <Kpi
            key={r}
            titre={`Soumission ${r}`}
            valeur={`${kpis.par_role[r].ayant_soumis} / ${kpis.par_role[r].agents}`}
            detail={kpis.par_role[r].agents ? `${Math.round((kpis.par_role[r].ayant_soumis / kpis.par_role[r].agents) * 100)} %` : ""}
          />
        ))}
      </div>

      {codeAffiche && (
        <div role="status" className="mt-6 rounded-card border border-cachet bg-cachet/10 px-5 py-4 text-sm text-parchemin-50">
          Code provisoire de <strong>{codeAffiche.nom}</strong> ({codeAffiche.matricule}) :{" "}
          <span className="select-all rounded bg-encre-950 px-2 py-1 font-mono text-lg tracking-wider text-cachet-light">{codeAffiche.code}</span>
          <p className="mt-2 text-xs text-parchemin-100/60">
            Notez-le maintenant : il ne sera plus affiché. L&apos;agent devra choisir son propre code à la première connexion.
          </p>
          <button onClick={() => setCodeAffiche(null)} className="mt-2 text-xs underline">J&apos;ai transmis le code</button>
        </div>
      )}
      {message && <p className="mt-4 text-sm text-parchemin-100/70">{message}</p>}

      <div className="mt-8 flex flex-wrap items-center gap-2">
        {lienOnglet("voeux", `Vœux (${s.demandes.length})`)}
        {lienOnglet("sans_voeu", `Sans vœu (${kpis.agents_sans_voeu})`)}
        {lienOnglet("agents", `Tous les agents (${kpis.agents})`)}
        {lienOnglet("occupation", "Occupation par quinzaine")}
        {onglet !== "occupation" && (
          <div className="ml-auto flex flex-wrap gap-2">
            <input
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Matricule ou nom…"
              className="rounded-card border border-encre-700 bg-encre-900 px-3 py-1.5 text-sm text-parchemin-50"
            />
            <select value={filtreRole} onChange={(e) => setFiltreRole(e.target.value as typeof filtreRole)} className="rounded-card border border-encre-700 bg-encre-900 px-2 py-1.5 text-sm text-parchemin-50">
              <option value="tous">Tous rôles</option>
              <option value="AV">AV</option>
              <option value="CEV">CEV</option>
              <option value="CS">CS</option>
            </select>
            {onglet === "voeux" && (
              <select value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value as typeof filtreStatut)} className="rounded-card border border-encre-700 bg-encre-900 px-2 py-1.5 text-sm text-parchemin-50">
                <option value="tous">Tous statuts</option>
                <option value="en_attente">En attente</option>
                <option value="valide">Validés</option>
                <option value="supprime">Supprimés</option>
              </select>
            )}
          </div>
        )}
      </div>

      <div className="card mt-3 overflow-x-auto rounded-card">
        {onglet === "voeux" && (
          <>
            {demandesFiltrees.some((d) => d.statut === "en_attente") && (
              <div className="flex justify-end border-b border-encre-700 px-3 py-2">
                <button disabled={enCours !== null} onClick={() => validerTout(demandesFiltrees)} className="text-xs text-succes underline disabled:opacity-50">
                  Valider tous les vœux en attente affichés
                </button>
              </div>
            )}
            <table className="w-full text-sm text-parchemin-100/80">
              <thead className="eyebrow text-left text-parchemin-100/40">
                <tr><th className={cellule}>Agent</th><th className={cellule}>Départ → retour</th><th className={cellule}>Jours</th><th className={cellule}>Soumis le</th><th className={cellule}>Statut</th><th className={cellule}></th></tr>
              </thead>
              <tbody className="divide-y divide-encre-700">
                {demandesFiltrees.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-parchemin-100/40">Aucun vœu pour ces filtres.</td></tr>
                )}
                {demandesFiltrees.map((d) => (
                  <tr key={d.id}>
                    <td className={cellule}>
                      <span className="font-mono text-parchemin-50">{d.matricule}</span> {d.prenom} {d.nom}
                      <span className="ml-1 text-xs text-parchemin-100/40">{d.role}</span>
                    </td>
                    <td className={`${cellule} font-mono`}>
                      {d.periodes.map((p) => (
                        <div key={p.debut}>{formatFr(p.debut)} → {formatFr(dateRetour(p.fin))}</div>
                      ))}
                    </td>
                    <td className={cellule}>{d.jours}</td>
                    <td className={`${cellule} font-mono text-xs`}>{formatFr(d.cree_le.slice(0, 10))}</td>
                    <td className={cellule}>
                      <span className={`rounded border px-2 py-0.5 text-xs ${STATUTS_VOEU[d.statut].classe}`}>{STATUTS_VOEU[d.statut].libelle}</span>
                      {d.motif && <div className="mt-1 text-xs text-parchemin-100/40">{d.motif}</div>}
                    </td>
                    <td className={`${cellule} whitespace-nowrap text-right`}>
                      {d.statut === "en_attente" && (
                        <button disabled={enCours !== null} onClick={() => traiter(d, "valider")} className="mr-3 text-xs text-succes underline disabled:opacity-50">Valider</button>
                      )}
                      {d.statut !== "supprime" && (
                        <button disabled={enCours !== null} onClick={() => traiter(d, "supprimer")} className="text-xs text-alerte underline disabled:opacity-50">Supprimer</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {(onglet === "sans_voeu" || onglet === "agents") && (
          <table className="w-full text-sm text-parchemin-100/80">
            <thead className="eyebrow text-left text-parchemin-100/40">
              <tr>
                <th className={cellule}>Agent</th><th className={cellule}>Entrée</th><th className={cellule}>Solde auj.</th>
                <th className={cellule}>1er départ possible</th><th className={cellule}>Solde à cette date</th>
                {onglet === "agents" && <th className={cellule}>Vœux</th>}
                <th className={cellule}>Accès</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-encre-700">
              {agentsFiltres.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-parchemin-100/40">Aucun agent pour ces filtres.</td></tr>
              )}
              {agentsFiltres.map((a) => (
                <tr key={a.matricule}>
                  <td className={cellule}>
                    <span className="font-mono text-parchemin-50">{a.matricule}</span> {a.prenom} {a.nom}
                    <span className="ml-1 text-xs text-parchemin-100/40">{a.role}</span>
                  </td>
                  <td className={`${cellule} font-mono text-xs`}>
                    {formatFr(a.date_embauche)}
                    {a.date_anniversaire > s.genere_le.slice(0, 10) && (
                      <div className="text-cachet-light">1 an le {formatFr(a.date_anniversaire)}</div>
                    )}
                  </td>
                  <td className={`${cellule} ${a.solde < 0 ? "text-alerte" : ""}`}>{a.solde}</td>
                  <td className={`${cellule} font-mono text-xs`}>{formatFr(a.premiere_date_possible)}</td>
                  <td className={cellule}>
                    {a.solde_a_cette_date}
                    {a.solde_a_cette_date < s.minJours && (
                      <div className="text-xs text-cachet-light">
                        {a.date_solde_suffisant ? `≥ ${s.minJours} j le ${formatFr(a.date_solde_suffisant)}` : `< ${s.minJours} j sur 18 mois`}
                      </div>
                    )}
                  </td>
                  {onglet === "agents" && <td className={cellule}>{a.voeux_actifs || "—"}</td>}
                  <td className={`${cellule} whitespace-nowrap text-xs`}>
                    <span className={a.code_change ? "text-succes" : "text-parchemin-100/40"}>
                      {a.code_change ? "connecté" : a.a_code ? "code provisoire" : "aucun code"}
                    </span>
                    <button onClick={() => nouveauCode(a)} className="ml-2 text-cachet-light underline">nouveau code</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {onglet === "occupation" && (
          <table className="w-full text-sm text-parchemin-100/80">
            <thead className="eyebrow text-left text-parchemin-100/40">
              <tr>
                <th className={cellule}>Quinzaine</th>
                {(["AV", "CEV", "CS"] as Role[]).map((r) => (
                  <th key={r} className={cellule}>{r} ({s.plafonds[r] === null ? "sans plafond" : `plafond ${s.plafonds[r]}`})</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-encre-700">
              {s.occupation.AV.map((q, i) => (
                <tr key={q.cle}>
                  <td className={`${cellule} font-mono`}>{q.libelle}</td>
                  {(["AV", "CEV", "CS"] as Role[]).map((r) => {
                    const o = s.occupation[r][i];
                    const plein = o.plafond !== null && o.absents >= o.plafond;
                    const ratio = o.plafond ? o.absents / o.plafond : 0;
                    return (
                      <td key={r} className={cellule}>
                        <span className={plein ? "font-semibold text-alerte" : ratio >= 0.75 ? "text-cachet-light" : ""}>
                          {o.absents}{o.plafond !== null ? ` / ${o.plafond}` : ""}
                        </span>
                        {o.plafond !== null && (
                          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-sm bg-encre-800">
                            <div className="h-full" style={{ width: `${Math.min(ratio, 1) * 100}%`, backgroundColor: plein ? "#B4483A" : ratio >= 0.75 ? "#C1793A" : "#3E7A5E" }} />
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
