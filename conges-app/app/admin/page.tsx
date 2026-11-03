"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCheck,
  CheckCircle2,
  Clock,
  DatabaseBackup,
  Download,
  KeyRound,
  RefreshCw,
  Search,
  Trash2,
  TrendingUp,
  UserX
} from "lucide-react";
import {
  Alerte,
  BadgeStatut,
  BarreNavigation,
  Bouton,
  Carte,
  Chargement,
  classesBouton,
  cx,
  EcranErreur,
  EnTete,
  Indicateur
} from "@/components/ui";
import { appelApi, dateRetour, formatFr, RedirectionEnCours } from "@/lib/client";

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

  if (erreur) return <EcranErreur message={erreur} />;
  if (!s) {
    return (
      <>
        <BarreNavigation admin />
        <Chargement texte="Chargement du tableau de bord…" />
      </>
    );
  }

  const { kpis } = s;
  const lienOnglet = (o: Onglet, libelle: string, nombre?: number) => (
    <button
      onClick={() => setOnglet(o)}
      className={cx(
        "flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition",
        onglet === o ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
      )}
    >
      {libelle}
      {nombre !== undefined && (
        <span className={cx("rounded-full px-2 py-0.5 text-xs", onglet === o ? "bg-brand-50 text-brand-700" : "bg-slate-200 text-slate-600")}>{nombre}</span>
      )}
    </button>
  );
  const cellule = "px-4 py-2.5 align-middle";
  const entete = "border-b border-slate-200 bg-slate-50/80 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500";
  const filtre = "h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100";
  const tonOccupation = (plein: boolean, ratio: number) => (plein ? "bg-rose-500" : ratio >= 0.75 ? "bg-amber-500" : "bg-emerald-500");
  const agentCellule = (matricule: string, prenom: string, nom: string, role: Role) => (
    <div className="flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-bold text-brand-700">
        {prenom.charAt(0)}{nom.charAt(0)}
      </span>
      <div>
        <p className="whitespace-nowrap font-semibold text-slate-900">{prenom} {nom}</p>
        <p className="text-xs text-slate-500">{matricule} · {role}</p>
      </div>
    </div>
  );

  return (
    <>
      <BarreNavigation admin />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <EnTete
          surtitre="Campagne des vœux"
          titre="Tableau de bord"
          description={
            <span className="flex flex-wrap items-center gap-2 text-sm">
              {s.admin.nom} ({s.admin.matricule}) · données du {new Date(s.genere_le).toLocaleString("fr-FR")}
              <Bouton variante="fantome" taille="sm" onClick={charger}>
                <RefreshCw className="h-4 w-4" aria-hidden /> Actualiser
              </Bouton>
            </span>
          }
          actions={
            <>
              <a href="/api/admin/export?type=voeux" className={classesBouton("primaire", "md")}>
                <Download className="h-4 w-4" aria-hidden /> Vœux (CSV)
              </a>
              <a href="/api/admin/export?type=agents" className={classesBouton("secondaire", "md")}>
                <Download className="h-4 w-4" aria-hidden /> Agents (CSV)
              </a>
              <a href="/api/admin/export?type=registre" className={classesBouton("secondaire", "md")}>
                <DatabaseBackup className="h-4 w-4" aria-hidden /> Sauvegarde
              </a>
            </>
          }
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Indicateur titre="Taux de soumission" icone={TrendingUp} valeur={`${kpis.taux_soumission} %`} detail={`${kpis.agents_ayant_soumis} / ${kpis.agents} agents`}>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(kpis.taux_soumission, 100)}%` }} />
            </div>
          </Indicateur>
          <Indicateur titre="Vœux en attente" icone={Clock} ton={kpis.voeux_en_attente > 0 ? "amber" : "slate"} valeur={kpis.voeux_en_attente} detail="à valider" />
          <Indicateur titre="Vœux validés" icone={CheckCircle2} ton="emerald" valeur={kpis.voeux_valides} detail={`${kpis.voeux_supprimes} supprimé(s)`} />
          <Indicateur titre="Sans vœu" icone={UserX} ton="rose" valeur={kpis.agents_sans_voeu} detail="agents à relancer" />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {[
            { titre: "Jours demandés", valeur: kpis.jours_demandes, detail: "vœux actifs" },
            { titre: "Codes choisis", valeur: `${kpis.agents_connectes} / ${kpis.agents}`, detail: "déjà connectés" },
            { titre: "Moins d'un an", valeur: kpis.agents_moins_un_an, detail: "départ à l'anniversaire" },
            { titre: `Solde < ${s.minJours} j`, valeur: kpis.agents_solde_insuffisant_aujourdhui, detail: "aujourd'hui" },
            ...(["AV", "CEV", "CS"] as Role[]).map((r) => ({
              titre: `Soumission ${r}`,
              valeur: `${kpis.par_role[r].ayant_soumis} / ${kpis.par_role[r].agents}`,
              detail: kpis.par_role[r].agents ? `${Math.round((kpis.par_role[r].ayant_soumis / kpis.par_role[r].agents) * 100)} %` : ""
            }))
          ].map((k) => (
            <div key={k.titre} className="rounded-xl border border-slate-200/90 bg-white px-3.5 py-2.5 shadow-card">
              <p className="truncate text-xs font-medium text-slate-500">{k.titre}</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums text-slate-900">{k.valeur}</p>
              {k.detail && <p className="text-xs text-slate-500">{k.detail}</p>}
            </div>
          ))}
        </div>

        {codeAffiche && (
          <Alerte type="info" role="status" className="mt-4">
            <p>
              Code provisoire de <strong>{codeAffiche.nom}</strong> ({codeAffiche.matricule}) :{" "}
              <span className="ml-1 select-all rounded-lg bg-white px-3 py-1 font-mono text-lg font-semibold tracking-wider text-brand-700 ring-1 ring-brand-200">{codeAffiche.code}</span>
            </p>
            <p className="mt-2 text-sm">
              Notez-le maintenant : il ne sera plus affiché. L&apos;agent devra choisir son propre code à la première connexion.
            </p>
            <Bouton variante="secondaire" taille="sm" className="mt-3" onClick={() => setCodeAffiche(null)}>J&apos;ai transmis le code</Bouton>
          </Alerte>
        )}
        {message && <Alerte type="info" role="status" className="mt-4">{message}</Alerte>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {lienOnglet("voeux", "Vœux", s.demandes.length)}
            {lienOnglet("sans_voeu", "Sans vœu", kpis.agents_sans_voeu)}
            {lienOnglet("agents", "Agents", kpis.agents)}
            {lienOnglet("occupation", "Occupation")}
          </div>
          {onglet !== "occupation" && (
            <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  placeholder="Matricule ou nom…"
                  aria-label="Rechercher un agent"
                  className={cx(filtre, "w-full pl-9 sm:w-56")}
                />
              </div>
              <select aria-label="Filtrer par rôle" value={filtreRole} onChange={(e) => setFiltreRole(e.target.value as typeof filtreRole)} className={filtre}>
                <option value="tous">Tous rôles</option>
                <option value="AV">AV</option>
                <option value="CEV">CEV</option>
                <option value="CS">CS</option>
              </select>
              {onglet === "voeux" && (
                <select aria-label="Filtrer par statut" value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value as typeof filtreStatut)} className={filtre}>
                  <option value="tous">Tous statuts</option>
                  <option value="en_attente">En attente</option>
                  <option value="valide">Validés</option>
                  <option value="supprime">Supprimés</option>
                </select>
              )}
            </div>
          )}
        </div>

        <Carte className="mt-3 overflow-hidden">
          <div className="overflow-x-auto">
            {onglet === "voeux" && (
              <>
                {demandesFiltrees.some((d) => d.statut === "en_attente") && (
                  <div className="flex items-center justify-between gap-3 border-b border-amber-200/70 bg-amber-50/60 px-4 py-2">
                    <p className="text-sm text-amber-900">
                      {demandesFiltrees.filter((d) => d.statut === "en_attente").length} vœu(x) en attente dans cette liste
                    </p>
                    <Bouton variante="succes" taille="sm" disabled={enCours !== null} onClick={() => validerTout(demandesFiltrees)}>
                      <CheckCheck className="h-4 w-4" aria-hidden /> Tout valider
                    </Bouton>
                  </div>
                )}
                <table className="w-full text-sm tabular-nums text-slate-700">
                  <thead className={entete}>
                    <tr><th className={cellule}>Agent</th><th className={cellule}>Départ → retour</th><th className={cellule}>Jours</th><th className={cellule}>Soumis le</th><th className={cellule}>Statut</th><th className={cellule}></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {demandesFiltrees.length === 0 && (
                      <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">Aucun vœu pour ces filtres.</td></tr>
                    )}
                    {demandesFiltrees.map((d) => (
                      <tr key={d.id} className="transition hover:bg-slate-50">
                        <td className={cellule}>{agentCellule(d.matricule, d.prenom, d.nom, d.role)}</td>
                        <td className={cellule}>
                          {d.periodes.map((p) => (
                            <div key={p.debut} className="font-medium text-slate-900">{formatFr(p.debut)} → {formatFr(dateRetour(p.fin))}</div>
                          ))}
                        </td>
                        <td className={`${cellule} font-semibold text-slate-900`}>{d.jours}</td>
                        <td className={`${cellule} text-slate-500`}>{formatFr(d.cree_le.slice(0, 10))}</td>
                        <td className={cellule}>
                          <BadgeStatut statut={d.statut} />
                          {d.motif && <div className="mt-1 max-w-[14rem] text-xs text-slate-500">{d.motif}</div>}
                        </td>
                        <td className={`${cellule} whitespace-nowrap text-right`}>
                          <div className="flex justify-end gap-1">
                            {d.statut === "en_attente" && (
                              <Bouton variante="secondaire" taille="sm" disabled={enCours !== null} onClick={() => traiter(d, "valider")} className="text-emerald-700">
                                <Check className="h-4 w-4" aria-hidden /> Valider
                              </Bouton>
                            )}
                            {d.statut !== "supprime" && (
                              <Bouton variante="danger" taille="sm" disabled={enCours !== null} onClick={() => traiter(d, "supprimer")} title="Supprimer">
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Bouton>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {(onglet === "sans_voeu" || onglet === "agents") && (
              <table className="w-full text-sm tabular-nums text-slate-700">
                <thead className={entete}>
                  <tr>
                    <th className={cellule}>Agent</th><th className={cellule}>Entrée</th><th className={cellule}>Solde auj.</th>
                    <th className={cellule}>1er départ possible</th><th className={cellule}>Solde à cette date</th>
                    {onglet === "agents" && <th className={cellule}>Vœux</th>}
                    <th className={cellule}>Accès</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agentsFiltres.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Aucun agent pour ces filtres.</td></tr>
                  )}
                  {agentsFiltres.map((a) => (
                    <tr key={a.matricule} className="transition hover:bg-slate-50">
                      <td className={cellule}>{agentCellule(a.matricule, a.prenom, a.nom, a.role)}</td>
                      <td className={cellule}>
                        {formatFr(a.date_embauche)}
                        {a.date_anniversaire > s.genere_le.slice(0, 10) && (
                          <div className="text-xs font-medium text-amber-700">1 an le {formatFr(a.date_anniversaire)}</div>
                        )}
                      </td>
                      <td className={`${cellule} font-semibold ${a.solde < 0 ? "text-rose-600" : "text-slate-900"}`}>{a.solde}</td>
                      <td className={cellule}>{formatFr(a.premiere_date_possible)}</td>
                      <td className={cellule}>
                        <span className="font-semibold text-slate-900">{a.solde_a_cette_date}</span>
                        {a.solde_a_cette_date < s.minJours && (
                          <div className="text-xs font-medium text-amber-700">
                            {a.date_solde_suffisant ? `≥ ${s.minJours} j le ${formatFr(a.date_solde_suffisant)}` : `< ${s.minJours} j sur 18 mois`}
                          </div>
                        )}
                      </td>
                      {onglet === "agents" && <td className={cellule}>{a.voeux_actifs || "—"}</td>}
                      <td className={`${cellule} whitespace-nowrap`}>
                        <div className="flex items-center gap-2">
                          <span className={cx(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                            a.code_change ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : a.a_code ? "bg-amber-50 text-amber-700 ring-amber-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"
                          )}>
                            {a.code_change ? "Connecté" : a.a_code ? "Code provisoire" : "Aucun code"}
                          </span>
                          <Bouton variante="fantome" taille="sm" onClick={() => nouveauCode(a)} title="Générer un nouveau code">
                            <KeyRound className="h-4 w-4" aria-hidden />
                          </Bouton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {onglet === "occupation" && (
              <table className="w-full text-sm tabular-nums text-slate-700">
                <thead className={entete}>
                  <tr>
                    <th className={cellule}>Quinzaine</th>
                    {(["AV", "CEV", "CS"] as Role[]).map((r) => (
                      <th key={r} className={cellule}>{r} <span className="font-normal normal-case">({s.plafonds[r] === null ? "sans plafond" : `plafond ${s.plafonds[r]}`})</span></th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.occupation.AV.map((q, i) => (
                    <tr key={q.cle} className="transition hover:bg-slate-50">
                      <td className={`${cellule} font-semibold capitalize text-slate-900`}>{q.libelle}</td>
                      {(["AV", "CEV", "CS"] as Role[]).map((r) => {
                        const o = s.occupation[r][i];
                        const plein = o.plafond !== null && o.absents >= o.plafond;
                        const ratio = o.plafond ? o.absents / o.plafond : 0;
                        return (
                          <td key={r} className={cellule}>
                            <span className={plein ? "font-bold text-rose-600" : ratio >= 0.75 ? "font-semibold text-amber-700" : "text-slate-900"}>
                              {o.absents}{o.plafond !== null ? ` / ${o.plafond}` : ""}
                            </span>
                            {o.plafond !== null && (
                              <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-100">
                                <div className={`h-full rounded-full ${tonOccupation(plein, ratio)}`} style={{ width: `${Math.min(ratio, 1) * 100}%` }} />
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
        </Carte>
      </main>
    </>
  );
}
