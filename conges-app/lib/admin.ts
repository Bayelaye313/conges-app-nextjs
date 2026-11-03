import {
  CONFIG,
  dateAnniversaire,
  dateToStr,
  demandesActives,
  dernierConge,
  joursAcquis,
  joursPris,
  occupationParQuinzaine,
  premiereDatePossible,
  solde,
  strToDate,
  ajouterJours,
  type Demande,
  type OccupationQuinzaine,
  type Registre,
  type Role
} from "./conges";

export interface LigneAgent {
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
  /** Première date (dans les 18 mois) où le solde atteint le minimum de jours, ou null. */
  date_solde_suffisant: string | null;
  voeux_actifs: number;
  a_soumis: boolean;
  a_code: boolean;
  code_change: boolean;
}

export interface LigneDemande extends Demande {
  matricule: string;
  prenom: string;
  nom: string;
  role: Role;
}

export interface Synthese {
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
  occupation: Record<Role, OccupationQuinzaine[]>;
}

function dateSoldeSuffisant(agent: Registre["agents"][string], depuis: string): string | null {
  let d = strToDate(depuis);
  for (let i = 0; i < 19; i++) {
    if (solde(agent, d) >= CONFIG.MIN_DAYS) return dateToStr(d);
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); // 1er du mois suivant : +2 jours
  }
  return null;
}

export function construireSynthese(registre: Registre, aujourdHui: Date): Synthese {
  const agents = Object.values(registre.agents);
  const aujourdHuiStr = dateToStr(aujourdHui);

  const lignesAgents: LigneAgent[] = agents
    .map((a) => {
      const premiere = premiereDatePossible(a, aujourdHui);
      const actifs = demandesActives(a);
      return {
        matricule: a.matricule,
        prenom: a.prenom,
        nom: a.nom,
        fonction: a.fonction,
        role: a.role,
        date_embauche: a.date_embauche,
        date_anniversaire: dateAnniversaire(a),
        solde: solde(a, aujourdHui),
        dernier_conge_fin: dernierConge(a)?.fin ?? null,
        premiere_date_possible: premiere,
        solde_a_cette_date: solde(a, strToDate(premiere)),
        date_solde_suffisant: dateSoldeSuffisant(a, premiere),
        voeux_actifs: actifs.length,
        a_soumis: actifs.length > 0,
        a_code: !!a.auth,
        code_change: !!a.auth && !a.auth.doit_changer
      };
    })
    .sort((x, y) => x.matricule.localeCompare(y.matricule));

  const demandes: LigneDemande[] = agents
    .flatMap((a) => a.demandes.map((d) => ({ ...d, matricule: a.matricule, prenom: a.prenom, nom: a.nom, role: a.role })))
    .sort((x, y) => (x.cree_le < y.cree_le ? 1 : -1));

  const parRole = { AV: { agents: 0, ayant_soumis: 0 }, CEV: { agents: 0, ayant_soumis: 0 }, CS: { agents: 0, ayant_soumis: 0 } };
  for (const l of lignesAgents) {
    parRole[l.role].agents++;
    if (l.a_soumis) parRole[l.role].ayant_soumis++;
  }
  const ayantSoumis = lignesAgents.filter((l) => l.a_soumis).length;
  const actives = demandes.filter((d) => d.statut !== "supprime");

  return {
    genere_le: new Date().toISOString(),
    kpis: {
      agents: agents.length,
      agents_ayant_soumis: ayantSoumis,
      agents_sans_voeu: agents.length - ayantSoumis,
      taux_soumission: agents.length ? Math.round((ayantSoumis / agents.length) * 100) : 0,
      voeux_en_attente: demandes.filter((d) => d.statut === "en_attente").length,
      voeux_valides: demandes.filter((d) => d.statut === "valide").length,
      voeux_supprimes: demandes.filter((d) => d.statut === "supprime").length,
      jours_demandes: actives.reduce((s, d) => s + d.jours, 0),
      agents_moins_un_an: lignesAgents.filter((l) => l.date_anniversaire > aujourdHuiStr).length,
      agents_solde_insuffisant_aujourdhui: lignesAgents.filter((l) => l.solde < CONFIG.MIN_DAYS).length,
      agents_connectes: lignesAgents.filter((l) => l.code_change).length,
      par_role: parRole
    },
    agents: lignesAgents,
    demandes,
    occupation: {
      AV: occupationParQuinzaine(registre, "AV", aujourdHuiStr, 26),
      CEV: occupationParQuinzaine(registre, "CEV", aujourdHuiStr, 26),
      CS: occupationParQuinzaine(registre, "CS", aujourdHuiStr, 26)
    }
  };
}

// -------------------- EXPORTS CSV (Excel, séparateur ;) --------------------
function cellule(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  // Neutralise les formules (=, +, -, @) pour éviter l'injection dans Excel.
  const sur = /^[=+\-@\t\r]/.test(s) && !/^-?\d+$/.test(s) ? `'${s}` : s;
  return /[;"\n\r]/.test(sur) ? `"${sur.replace(/"/g, '""')}"` : sur;
}

function csv(entete: string[], lignes: unknown[][]): string {
  return "﻿" + [entete, ...lignes].map((l) => l.map(cellule).join(";")).join("\r\n") + "\r\n";
}

function fr(d: string | null | undefined): string {
  if (!d) return "";
  const [y, m, j] = d.slice(0, 10).split("-");
  return `${j}/${m}/${y}`;
}

const STATUTS: Record<Demande["statut"], string> = { en_attente: "En attente", valide: "Validé", supprime: "Supprimé" };

export function exportVoeux(registre: Registre): string {
  const lignes = Object.values(registre.agents).flatMap((a) =>
    a.demandes.map((d) => {
      const [p1, p2] = d.periodes;
      const retour = (p: typeof p1 | undefined) => (p ? dateToStr(ajouterJours(strToDate(p.fin), 1)) : "");
      return [
        a.matricule, a.prenom, a.nom, a.fonction, a.role, STATUTS[d.statut], d.jours,
        fr(p1?.debut), fr(retour(p1)), p1?.jours ?? "",
        fr(p2?.debut), fr(retour(p2)), p2?.jours ?? "",
        fr(d.cree_le), fr(d.traite_le), d.traite_par ?? "", d.motif ?? "", d.id
      ];
    })
  );
  return csv(
    ["Matricule", "Prénom", "Nom", "Fonction", "Rôle", "Statut", "Jours",
      "Départ 1", "Retour 1", "Jours 1", "Départ 2", "Retour 2", "Jours 2",
      "Soumis le", "Traité le", "Traité par", "Motif", "Identifiant"],
    lignes
  );
}

export function exportAgents(registre: Registre, aujourdHui: Date): string {
  const synthese = construireSynthese(registre, aujourdHui);
  const parMatricule = registre.agents;
  return csv(
    ["Matricule", "Prénom", "Nom", "Fonction", "Rôle", "Date d'embauche", "Date anniversaire",
      "Jours acquis", "Jours pris (dont vœux)", "Solde aujourd'hui", "Retour du dernier congé",
      "Premier départ possible", "Solde à cette date", `Solde ≥ ${CONFIG.MIN_DAYS} j à partir du`,
      "Vœux actifs", "A soumis", "Code personnel choisi"],
    synthese.agents.map((l) => [
      l.matricule, l.prenom, l.nom, l.fonction, l.role, fr(l.date_embauche), fr(l.date_anniversaire),
      joursAcquis(l.date_embauche, aujourdHui), joursPris(parMatricule[l.matricule]), l.solde,
      fr(l.dernier_conge_fin && dateToStr(ajouterJours(strToDate(l.dernier_conge_fin), 1))), fr(l.premiere_date_possible), l.solde_a_cette_date, fr(l.date_solde_suffisant),
      l.voeux_actifs, l.a_soumis ? "Oui" : "Non", l.code_change ? "Oui" : "Non"
    ])
  );
}

/** Sauvegarde complète, sans les empreintes de codes d'accès. */
export function exportRegistre(registre: Registre): string {
  const sansAuth = {
    ...registre,
    agents: Object.fromEntries(Object.entries(registre.agents).map(([m, a]) => [m, { ...a, auth: undefined }])),
    admins: Object.fromEntries(Object.entries(registre.admins).map(([m, a]) => [m, { ...a, auth: undefined }]))
  };
  return JSON.stringify(sansAuth, null, 2);
}
