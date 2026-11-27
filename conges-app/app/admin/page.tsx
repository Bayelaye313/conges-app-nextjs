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
  Pencil,
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
  type?: "conge" | "recuperation";
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
  desactive: boolean;
  jours_pris_reprise: number;
  date_embauche: string;
  date_anniversaire: string;
  solde: number;
  dernier_conge_fin: string | null;
  dernier_conge_historique_debut: string | null;
  dernier_conge_historique_fin: string | null;
  premiere_date_possible: string;
  solde_a_cette_date: number;
  date_solde_suffisant: string | null;
  voeux_actifs: number;
  a_soumis: boolean;
  a_code: boolean;
  code_personnalise: boolean;
}

interface Occupation {
  cle: string;
  libelle: string;
  pic: number;
  picLe: string | null;
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
    agents_codes_personnalises: number;
    par_role: Record<Role, { agents: number; ayant_soumis: number }>;
  };
  agents: LigneAgent[];
  demandes: LigneDemande[];
  occupation: Record<Role, Occupation[]>;
}

type Onglet = "voeux" | "sans_voeu" | "agents" | "occupation";

interface EditionAgent {
  matricule: string;
  nouveau_matricule: string;
  prenom: string;
  nom: string;
  fonction: string;
  role: Role;
  date_embauche: string;
  jours_pris_reprise: string;
  dernier_conge_debut: string;
  dernier_conge_retour: string;
}

function correspond(recherche: string, ...champs: string[]) {
  const r = recherche.trim().toLowerCase();
  return !r || champs.some((c) => c.toLowerCase().includes(r));
}

export default function AdminPage() {
  const router = useRouter();
  const [s, setS] = useState<Synthese | null>(null);
  const [erreur, setErreur] = useState("");
  const [message, setMessage] = useState<{ succes: boolean; texte: string } | null>(null);
  const [onglet, setOnglet] = useState<Onglet>("voeux");
  const [filtreStatut, setFiltreStatut] = useState<"tous" | LigneDemande["statut"]>("en_attente");
  const [filtreRole, setFiltreRole] = useState<"tous" | Role>("tous");
  const [filtreType, setFiltreType] = useState<"tous" | "conge" | "recuperation">("tous");
  const [recherche, setRecherche] = useState("");
  const [enCours, setEnCours] = useState<string | null>(null);
  const [codeAffiche, setCodeAffiche] = useState<{ matricule: string; nom: string; code: string } | null>(null);
  const [edition, setEdition] = useState<EditionAgent | null>(null);
  const [erreurEdition, setErreurEdition] = useState("");

  function afficherMessage(succes: boolean, texte: string) {
    setMessage({ succes, texte });
  }

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
      afficherMessage(data.ok, `${d.matricule} — ${data.message ?? (data.ok ? "Action effectuée." : "L'action a échoué.")}`);
      if (data.ok) charger();
    } catch (err) {
      if (!(err instanceof RedirectionEnCours)) afficherMessage(false, (err as Error).message);
    }
    setEnCours(null);
  }

  async function convertirPeriodeRecuperation(d: LigneDemande, periodeIndex: number) {
    const periode = d.periodes[periodeIndex];
    if (!periode) return;
    const minimum = Math.max(s?.minJours ?? 11, periode.jours);
    const saisie = window.prompt(
      `Nombre de jours décomptés pour cette période (minimum ${minimum} jours). Elle sera prolongée si nécessaire.`,
      String(minimum)
    );
    if (saisie === null) return;
    const joursCible = Number(saisie.trim());
    if (!Number.isInteger(joursCible) || joursCible < minimum || joursCible > 90) {
      afficherMessage(false, `Indiquez un nombre entier entre ${minimum} et 90 jours.`);
      return;
    }
    const confirmer = window.confirm(
      `Scinder la récupération de ${d.prenom} ${d.nom} ? La période du ${formatFr(periode.debut)} au ${formatFr(dateRetour(periode.fin))} passera de ${periode.jours} à ${joursCible} jours décomptés et sera prolongée si nécessaire. Les règles habituelles (délai, solde et plafond) seront vérifiées. L'autre période restera une récupération. Le congé sera soumis à validation.`
    );
    if (!confirmer) return;

    setEnCours(d.id);
    try {
      const { data } = await appelApi(router, "/api/admin/demandes", {
        matricule: d.matricule,
        id: d.id,
        action: "scinder_recuperation",
        periodeIndex,
        joursCible
      });
      afficherMessage(data.ok, `${d.matricule} — ${data.message ?? (data.ok ? "Demande scindée." : "La conversion a échoué.")}`);
      if (data.ok) charger();
    } catch (err) {
      if (!(err instanceof RedirectionEnCours)) afficherMessage(false, (err as Error).message);
    }
    setEnCours(null);
  }

  async function changerTypeSoumission(d: LigneDemande) {
    const typeCible = (d.type ?? "conge") === "recuperation" ? "conge" : "recuperation";
    const libelleCible = typeCible === "conge" ? "congé" : "récupération";
    const joursActuels = d.periodes.reduce((total, periode) => total + periode.jours, 0);
    let joursCible: number | undefined;
    if (typeCible === "conge") {
      const minimum = Math.max(s?.minJours ?? 11, joursActuels);
      const saisie = window.prompt(
        `Nombre total de jours décomptés pour le congé (minimum ${minimum} jours). Si nécessaire, la dernière période sera prolongée.`,
        String(minimum)
      );
      if (saisie === null) return;
      joursCible = Number(saisie.trim());
      if (!Number.isInteger(joursCible) || joursCible < minimum || joursCible > 90) {
        afficherMessage(false, `Indiquez un nombre entier entre ${minimum} et 90 jours.`);
        return;
      }
    }
    const detailJours = joursCible !== undefined
      ? ` Le total passera de ${joursActuels} à ${joursCible} jour(s) décompté(s), en prolongeant la dernière période si nécessaire.`
      : "";
    const detailHistorique = typeCible === "recuperation"
      ? " Les dates et jours réservés ne changent pas; les périodes identiques de l'historique seront retirées."
      : "";
    if (!window.confirm(
      `Passer cette demande en ${libelleCible} ?${detailJours}${detailHistorique}${typeCible === "conge" ? " Les règles de solde, délai et plafond seront vérifiées." : ""} Elle repassera en attente de validation.`
    )) return;

    setEnCours(d.id);
    try {
      const { data } = await appelApi(router, "/api/admin/demandes", {
        matricule: d.matricule,
        id: d.id,
        action: "changer_type",
        typeCible,
        joursCible
      });
      afficherMessage(data.ok, `${d.matricule} — ${data.message ?? (data.ok ? "Type de demande modifié." : "Le changement de type a échoué.")}`);
      if (data.ok) charger();
    } catch (err) {
      if (!(err instanceof RedirectionEnCours)) afficherMessage(false, (err as Error).message);
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
    afficherMessage(ok === aValider.length, `${ok} vœu(x) validé(s) sur ${aValider.length}.`);
    setEnCours(null);
    charger();
  }

  async function nouveauCode(a: LigneAgent) {
    const avertissement = a.code_personnalise
      ? `${a.prenom} ${a.nom} a déjà choisi son code. Le remplacer par un code provisoire ? Ses sessions seront fermées.`
      : `Générer un code provisoire pour ${a.prenom} ${a.nom} ?`;
    if (!window.confirm(avertissement)) return;
    try {
      const { data } = await appelApi<{ code: string }>(router, "/api/admin/code", { matricule: a.matricule });
      if (data.ok) setCodeAffiche({ matricule: a.matricule, nom: `${a.prenom} ${a.nom}`, code: data.code });
      else afficherMessage(false, data.message ?? "Échec de génération du code.");
      charger();
    } catch (err) {
      if (!(err instanceof RedirectionEnCours)) afficherMessage(false, (err as Error).message);
    }
  }

  function ouvrirEdition(a: LigneAgent) {
    setEdition({
      matricule: a.matricule,
      nouveau_matricule: a.matricule,
      prenom: a.prenom,
      nom: a.nom,
      fonction: a.fonction,
      role: a.role,
      date_embauche: a.date_embauche,
      jours_pris_reprise: String(a.jours_pris_reprise),
      dernier_conge_debut: a.dernier_conge_historique_debut ?? "",
      dernier_conge_retour: a.dernier_conge_historique_fin ? dateRetour(a.dernier_conge_historique_fin) : ""
    });
    setErreurEdition("");
  }

  async function enregistrerEdition(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edition) return;
    setEnCours(`agent-${edition.matricule}`);
    setErreurEdition("");
    try {
      const { data } = await appelApi(router, "/api/admin/agents", {
        ...edition,
        jours_pris_reprise: Number(edition.jours_pris_reprise),
        dernier_conge_debut: edition.dernier_conge_debut || null,
        dernier_conge_retour: edition.dernier_conge_retour || null
      });
      if (!data.ok) {
        setErreurEdition(data.message ?? "La mise à jour a échoué.");
      } else {
        afficherMessage(true, `${edition.matricule} — ${data.message ?? "Informations mises à jour."}`);
        setEdition(null);
        charger();
      }
    } catch (err) {
      if (!(err instanceof RedirectionEnCours)) setErreurEdition((err as Error).message);
    } finally {
      setEnCours(null);
    }
  }

  const demandesFiltrees = useMemo(
    () =>
      (s?.demandes ?? []).filter(
        (d) =>
          (filtreStatut === "tous" || d.statut === filtreStatut) &&
          (filtreRole === "tous" || d.role === filtreRole) &&
          (filtreType === "tous" || (d.type ?? "conge") === filtreType) &&
          correspond(recherche, d.matricule, d.prenom, d.nom)
      ),
    [s, filtreStatut, filtreRole, filtreType, recherche]
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
      <BarreNavigation admin>
        <Chargement texte="Chargement du tableau de bord…" />
      </BarreNavigation>
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
    <BarreNavigation admin>
      <main className="page-container max-w-screen-2xl">
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
              <a href="/api/admin/export?type=calendrier" className={classesBouton("secondaire", "md")}>
                <Download className="h-4 w-4" aria-hidden /> Calendrier (12 mois, CSV)
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
            { titre: "Codes personnalisés", valeur: `${kpis.agents_codes_personnalises} / ${kpis.agents}`, detail: "remplacés volontairement" },
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
              Notez-le maintenant : il ne sera plus affiché. L&apos;agent peut l&apos;utiliser directement ou le remplacer plus tard.
            </p>
            <Bouton variante="secondaire" taille="sm" className="mt-3" onClick={() => setCodeAffiche(null)}>J&apos;ai transmis le code</Bouton>
          </Alerte>
        )}
        {message && (
          <Alerte type={message.succes ? "succes" : "erreur"} role="status" className="mt-4">
            <p className="font-semibold">{message.succes ? "Opération réussie" : "Échec de l'opération"}</p>
            <p className="mt-1">{message.texte}</p>
          </Alerte>
        )}

        {edition && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/40 p-4" role="presentation">
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="titre-edition-agent"
              onSubmit={enregistrerEdition}
              className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl sm:p-6"
            >
              <div className="mb-5">
                <h2 id="titre-edition-agent" className="text-lg font-bold text-slate-900">
                  Modifier l’agent {edition.matricule}
                </h2>
                <p className="mt-1 text-sm text-slate-500">Si le matricule change, l’agent devra se reconnecter avec le nouveau. Son code d’accès et son historique sont conservés.</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="libelle">
                  Matricule
                  <input required maxLength={20} pattern="[A-Za-z0-9]+" className="champ" value={edition.nouveau_matricule} onChange={(e) => setEdition({ ...edition, nouveau_matricule: e.target.value })} />
                </label>
                <label className="libelle">
                  Prénom
                  <input required maxLength={100} className="champ" value={edition.prenom} onChange={(e) => setEdition({ ...edition, prenom: e.target.value })} />
                </label>
                <label className="libelle">
                  Nom
                  <input required maxLength={100} className="champ" value={edition.nom} onChange={(e) => setEdition({ ...edition, nom: e.target.value })} />
                </label>
                <label className="libelle">
                  Fonction
                  <input required maxLength={100} className="champ" value={edition.fonction} onChange={(e) => setEdition({ ...edition, fonction: e.target.value })} />
                </label>
                <label className="libelle">
                  Rôle
                  <select className="champ" value={edition.role} onChange={(e) => setEdition({ ...edition, role: e.target.value as Role })}>
                    <option value="AV">Agent de vente (AV)</option>
                    <option value="CEV">Chef d’équipe vente (CEV)</option>
                    <option value="CS">Chef de secteur (CS)</option>
                  </select>
                </label>
                <label className="libelle">
                  Date d’embauche
                  <input required type="date" className="champ" value={edition.date_embauche} onChange={(e) => setEdition({ ...edition, date_embauche: e.target.value })} />
                </label>
                <label className="libelle">
                  Jours pris (cumul)
                  <input required type="number" min={0} max={9999} step={1} className="champ" value={edition.jours_pris_reprise} onChange={(e) => setEdition({ ...edition, jours_pris_reprise: e.target.value })} />
                </label>
                <label className="libelle">
                  Départ du dernier congé
                  <input type="date" className="champ" value={edition.dernier_conge_debut} onChange={(e) => setEdition({ ...edition, dernier_conge_debut: e.target.value })} />
                </label>
                <label className="libelle">
                  Retour au travail
                  <input type="date" className="champ" value={edition.dernier_conge_retour} onChange={(e) => setEdition({ ...edition, dernier_conge_retour: e.target.value })} />
                </label>
                <p className="text-sm font-normal text-slate-500 sm:col-span-2">
                  La période la plus récente sera corrigée et ses jours recalculés. Sans historique détaillé, indiquez les deux dates pour créer la période de référence. Le cumul des jours pris se modifie séparément.
                </p>
              </div>
              {erreurEdition && <Alerte type="erreur" className="mt-4">{erreurEdition}</Alerte>}
              <div className="mt-6 flex justify-end gap-2">
                <Bouton type="button" variante="secondaire" onClick={() => setEdition(null)}>Annuler</Bouton>
                <Bouton type="submit" disabled={enCours !== null}>
                  {enCours === `agent-${edition.matricule}` ? "Enregistrement…" : "Enregistrer"}
                </Bouton>
              </div>
            </form>
          </div>
        )}

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
                <>
                  <select aria-label="Filtrer par type" value={filtreType} onChange={(e) => setFiltreType(e.target.value as typeof filtreType)} className={filtre}>
                    <option value="tous">Toutes demandes</option>
                    <option value="conge">Congés</option>
                    <option value="recuperation">Récupérations</option>
                  </select>
                  <select aria-label="Filtrer par statut" value={filtreStatut} onChange={(e) => setFiltreStatut(e.target.value as typeof filtreStatut)} className={filtre}>
                    <option value="tous">Tous statuts</option>
                    <option value="en_attente">En attente</option>
                    <option value="valide">Validés</option>
                    <option value="supprime">Supprimés</option>
                  </select>
                </>
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
                      {demandesFiltrees.filter((d) => d.statut === "en_attente").length} demande(s) en attente dans cette liste
                    </p>
                    <Bouton variante="succes" taille="sm" disabled={enCours !== null} onClick={() => validerTout(demandesFiltrees)}>
                      <CheckCheck className="h-4 w-4" aria-hidden /> Tout valider
                    </Bouton>
                  </div>
                )}
                <table className="w-full text-sm tabular-nums text-slate-700">
                  <thead className={entete}>
                    <tr><th className={cellule}>Agent</th><th className={cellule}>Type</th><th className={cellule}>Départ → retour</th><th className={cellule}>Jours</th><th className={cellule}>Soumis le</th><th className={cellule}>Statut</th><th className={cellule}></th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {demandesFiltrees.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-500">Aucune demande pour ces filtres.</td></tr>
                    )}
                    {demandesFiltrees.map((d) => (
                      <tr key={d.id} className="transition hover:bg-slate-50">
                        <td className={cellule}>{agentCellule(d.matricule, d.prenom, d.nom, d.role)}</td>
                        <td className={cellule}>
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${d.type === "recuperation" ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700"}`}>
                            {d.type === "recuperation" ? "Récupération" : "Congé"}
                          </span>
                        </td>
                        <td className={cellule}>
                          {d.periodes.map((p, index) => (
                            <div key={p.debut} className="flex flex-wrap items-center gap-1 font-medium text-slate-900">
                              <span>{formatFr(p.debut)} → {formatFr(dateRetour(p.fin))}</span>
                              {d.type === "recuperation" && d.periodes.length === 2 && d.statut !== "supprime" && (
                                <Bouton
                                  variante="fantome"
                                  taille="sm"
                                  className="h-auto px-2 py-1 text-xs text-brand-700"
                                  disabled={enCours !== null}
                                  onClick={() => convertirPeriodeRecuperation(d, index)}
                                >
                                  Convertir en congé
                                </Bouton>
                              )}
                            </div>
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
                              <>
                                <Bouton
                                  variante="secondaire"
                                  taille="sm"
                                  disabled={enCours !== null}
                                  onClick={() => changerTypeSoumission(d)}
                                >
                                  {(d.type ?? "conge") === "recuperation" ? "Convertir en congé" : "Passer en récupération"}
                                </Bouton>
                                <Bouton variante="danger" taille="sm" disabled={enCours !== null} onClick={() => traiter(d, "supprimer")} title="Supprimer">
                                  <Trash2 className="h-4 w-4" aria-hidden />
                                </Bouton>
                              </>
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
                    {onglet === "agents" && <><th className={cellule}>Dernier congé</th><th className={cellule}>Vœux</th></>}
                    <th className={cellule}>Accès</th>
                    {onglet === "agents" && <th className={cellule}>Informations</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agentsFiltres.length === 0 && (
                    <tr><td colSpan={onglet === "agents" ? 9 : 6} className="px-4 py-10 text-center text-slate-500">Aucun agent pour ces filtres.</td></tr>
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
                      {onglet === "agents" && <td className={cellule}>{a.dernier_conge_historique_fin ? formatFr(a.dernier_conge_historique_fin) : "—"}</td>}
                      {onglet === "agents" && <td className={cellule}>{a.voeux_actifs || "—"}</td>}
                      <td className={`${cellule} whitespace-nowrap`}>
                        <div className="flex items-center gap-2">
                          <span className={cx(
                            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                            a.desactive ? "bg-rose-50 text-rose-700 ring-rose-600/20" : a.code_personnalise ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : a.a_code ? "bg-amber-50 text-amber-700 ring-amber-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20"
                          )}>
                            {a.desactive ? "Accès désactivé" : a.code_personnalise ? "Code personnalisé" : a.a_code ? "Code provisoire" : "Aucun code"}
                          </span>
                          {!a.desactive && (
                            <Bouton variante="fantome" taille="sm" onClick={() => nouveauCode(a)} title="Générer un nouveau code">
                              <KeyRound className="h-4 w-4" aria-hidden />
                            </Bouton>
                          )}
                        </div>
                      </td>
                      {onglet === "agents" && (
                        <td className={cellule}>
                          <Bouton variante="fantome" taille="sm" onClick={() => ouvrirEdition(a)} title={`Modifier les informations de ${a.prenom} ${a.nom}`}>
                            <Pencil className="h-4 w-4" aria-hidden /> Modifier
                          </Bouton>
                        </td>
                      )}
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
                      <th key={r} className={cellule}>{r} <span className="font-normal normal-case">({s.plafonds[r] === null ? "sans plafond" : r === "AV" ? "plafond selon période" : `plafond ${s.plafonds[r]}`})</span></th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {s.occupation.AV.map((q, i) => (
                    <tr key={q.cle} className="transition hover:bg-slate-50">
                      <td className={`${cellule} font-semibold capitalize text-slate-900`}>{q.libelle}</td>
                      {(["AV", "CEV", "CS"] as Role[]).map((r) => {
                        const o = s.occupation[r][i];
                        const plein = o.plafond !== null && o.pic >= o.plafond;
                        const ratio = o.plafond ? o.pic / o.plafond : 0;
                        return (
                          <td key={r} className={cellule}>
                            <span className={plein ? "font-bold text-rose-600" : ratio >= 0.75 ? "font-semibold text-amber-700" : "text-slate-900"}>
                              {o.pic}{o.plafond !== null ? ` / ${o.plafond}` : ""}
                            </span>
                            {o.picLe && <div className="text-xs text-slate-500">Pic le {formatFr(o.picLe)}</div>}
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
    </BarreNavigation>
  );
}
