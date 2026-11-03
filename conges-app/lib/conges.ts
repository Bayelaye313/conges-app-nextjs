import { randomUUID } from "crypto";
import { compterJoursDecomptes, etendrePeriode } from "./calendrier";
import { lireDocument, modifierDocument } from "./storage";

// -------------------- CONFIGURATION --------------------
export type Role = "AV" | "CEV" | "CS";

export const CONFIG = {
  MIN_DAYS: 11, // jours décomptés (hors dimanches et fériés)
  MAX_DAYS: 90, // garde-fou technique
  DELAI_MOIS: 12, // entre la fin d'un congé et le début du suivant
  ANCIENNETE_MIN_MOIS: 12, // premier congé possible à la date anniversaire d'entrée
  JOURS_ACQUIS_PAR_MOIS: 2,
  /** Agents absents au maximum par quinzaine, par rôle (null = pas de plafond). */
  PLAFONDS: { AV: 20, CEV: 3, CS: null } as Record<Role, number | null>
} as const;

export const LIBELLES_ROLE: Record<Role, string> = {
  AV: "Agents de vente",
  CEV: "Chefs d'équipe vente",
  CS: "Chefs de secteur"
};

// -------------------- MODELE --------------------
export interface Periode {
  debut: string; // YYYY-MM-DD, premier jour d'absence
  fin: string; // YYYY-MM-DD, dernier jour d'absence (la reprise est le lendemain)
  jours: number; // jours décomptés (hors dimanches et fériés)
}

export type StatutDemande = "en_attente" | "valide" | "supprime";

/** Vœu de congé déposé dans l'application (1 ou 2 périodes). */
export interface Demande {
  id: string;
  periodes: Periode[];
  jours: number;
  statut: StatutDemande;
  cree_le: string; // ISO
  traite_le?: string;
  traite_par?: string; // matricule de l'admin, ou de l'agent s'il a annulé
  motif?: string;
}

export interface AuthCompte {
  hash: string;
  doit_changer: boolean;
  modifie_le: string; // ISO — sert aussi à invalider les sessions existantes
}

export interface Agent {
  matricule: string;
  prenom: string;
  nom: string;
  fonction: string;
  role: Role;
  date_embauche: string;
  /** Cumul des jours pris selon le tableau RH, congés déjà planifiés inclus. */
  jours_pris_reprise: number;
  /** Congés repris de l'ancien suivi (déjà inclus dans jours_pris_reprise). */
  historique: Periode[];
  demandes: Demande[];
  auth?: AuthCompte;
}

export interface Admin {
  matricule: string;
  nom: string;
  auth?: AuthCompte;
}

export interface Registre {
  version: 2;
  date_reprise: string;
  agents: Record<string, Agent>;
  admins: Record<string, Admin>;
}

// -------------------- DATES (UTC : Dakar est en UTC toute l'année) --------------------
function dateUTC(annee: number, mois1based: number, jour: number): Date {
  return new Date(Date.UTC(annee, mois1based - 1, jour));
}

export function nbJoursMois(annee: number, mois1based: number): number {
  return new Date(Date.UTC(annee, mois1based, 0)).getUTCDate();
}

export function dateToStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function strToDate(s: string): Date {
  const [y, m, j] = s.split("-").map(Number);
  return dateUTC(y, m, j);
}

export function aujourdhuiUTC(): Date {
  const n = new Date();
  return dateUTC(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
}

export function ajouterJours(d: Date, n: number): Date {
  const nd = new Date(d);
  nd.setUTCDate(nd.getUTCDate() + n);
  return nd;
}

/** Ajoute des mois calendaires (corrige le bug du script Python qui ajoutait des années). */
export function ajouterMois(d: Date, nMois: number): Date {
  const totalMois = d.getUTCMonth() + nMois;
  const anneeCible = d.getUTCFullYear() + Math.floor(totalMois / 12);
  const moisCible = ((totalMois % 12) + 12) % 12;
  const nd = new Date(d);
  nd.setUTCFullYear(anneeCible, moisCible);
  return nd;
}

function maxStr(...dates: string[]): string {
  return dates.reduce((a, b) => (b > a ? b : a));
}

export function formatFr(s: string): string {
  const [y, m, j] = s.split("-");
  return `${j}/${m}/${y}`;
}

// -------------------- SOLDE --------------------
/**
 * Mois de service ouvrant droit à congé à une date donnée : le mois
 * d'embauche compte en entier, le mois en cours pas encore (règle du tableau
 * RH, vérifiée sur les 206 agents). +2 jours à chaque début de mois.
 */
export function moisDeService(dateEmbauche: string, date: Date): number {
  const [a, m] = dateEmbauche.split("-").map(Number);
  return Math.max(0, (date.getUTCFullYear() - a) * 12 + (date.getUTCMonth() + 1 - m));
}

export function joursAcquis(dateEmbauche: string, date: Date): number {
  return moisDeService(dateEmbauche, date) * CONFIG.JOURS_ACQUIS_PAR_MOIS;
}

export function demandesActives(agent: Agent): Demande[] {
  return agent.demandes.filter((d) => d.statut !== "supprime");
}

export function joursPris(agent: Agent): number {
  return agent.jours_pris_reprise + demandesActives(agent).reduce((s, d) => s + d.jours, 0);
}

/** Solde à une date : jours acquis à cette date − tous les jours pris ou réservés. */
export function solde(agent: Agent, date: Date): number {
  return joursAcquis(agent.date_embauche, date) - joursPris(agent);
}

/** Date anniversaire d'entrée : premier jour où un congé peut commencer. */
export function dateAnniversaire(agent: Agent): string {
  return dateToStr(ajouterMois(strToDate(agent.date_embauche), CONFIG.ANCIENNETE_MIN_MOIS));
}

// -------------------- CONGES DE L'AGENT --------------------
/** Un « congé » = une période reprise ou une demande active (ses 2 parties comptent pour un). */
interface Conge {
  debut: string;
  fin: string;
  periodes: Periode[];
}

export function congesDeLAgent(agent: Agent): Conge[] {
  return [
    ...agent.historique.map((p) => ({ debut: p.debut, fin: p.fin, periodes: [p] })),
    ...demandesActives(agent).map((d) => ({
      debut: d.periodes[0].debut,
      fin: d.periodes[d.periodes.length - 1].fin,
      periodes: d.periodes
    }))
  ];
}

export function dernierConge(agent: Agent): Conge | null {
  return congesDeLAgent(agent).reduce<Conge | null>((max, c) => (!max || c.fin > max.fin ? c : max), null);
}

/** Prochaine date de départ choisissable (le 1er ou le 16 du mois) à partir de `date`. */
export function prochainAncrage(date: string): string {
  const [a, m, j] = date.split("-").map(Number);
  if (j === 1 || j === 16) return date;
  return dateToStr(j < 16 ? dateUTC(a, m, 16) : dateUTC(a, m + 1, 1));
}

/**
 * Première date de départ possible (1er ou 16 du mois) : après aujourd'hui,
 * à partir de la date anniversaire d'entrée, et 12 mois après le retour du
 * dernier congé.
 */
export function premiereDatePossible(agent: Agent, aujourdHui: Date): string {
  const dernier = dernierConge(agent);
  return prochainAncrage(
    maxStr(
      dateToStr(ajouterJours(aujourdHui, 1)),
      dateAnniversaire(agent),
      dernier ? dateToStr(ajouterMois(ajouterJours(strToDate(dernier.fin), 1), CONFIG.DELAI_MOIS)) : ""
    )
  );
}

// -------------------- QUINZAINES --------------------
export interface Quinzaine {
  cle: string; // "2027-03-1" (1–15) ou "2027-03-2" (16–fin)
  annee: number;
  mois: number;
  partie: 1 | 2;
  debut: string;
  fin: string;
}

export function quinzaine(annee: number, mois: number, partie: 1 | 2): Quinzaine {
  const mm = String(mois).padStart(2, "0");
  return {
    cle: `${annee}-${mm}-${partie}`,
    annee,
    mois,
    partie,
    debut: `${annee}-${mm}-${partie === 1 ? "01" : "16"}`,
    fin: `${annee}-${mm}-${partie === 1 ? "15" : String(nbJoursMois(annee, mois))}`
  };
}

export function quinzaineDe(date: string): Quinzaine {
  const [a, m, j] = date.split("-").map(Number);
  return quinzaine(a, m, j <= 15 ? 1 : 2);
}

export function quinzaineSuivante(q: Quinzaine): Quinzaine {
  if (q.partie === 1) return quinzaine(q.annee, q.mois, 2);
  return q.mois === 12 ? quinzaine(q.annee + 1, 1, 1) : quinzaine(q.annee, q.mois + 1, 1);
}

export function quinzainesEntre(debut: string, fin: string): Quinzaine[] {
  const res: Quinzaine[] = [];
  for (let q = quinzaineDe(debut); q.debut <= fin; q = quinzaineSuivante(q)) res.push(q);
  return res;
}

export function libelleQuinzaine(q: Quinzaine): string {
  const mois = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${q.partie === 1 ? "1–15" : `16–${q.fin.slice(8)}`} ${mois[q.mois - 1]} ${q.annee}`;
}

function chevauche(a: { debut: string; fin: string }, b: { debut: string; fin: string }): boolean {
  return !(a.fin < b.debut || a.debut > b.fin);
}

/** Matricules des agents d'un rôle absents au moins un jour de la quinzaine. */
export function absentsQuinzaine(registre: Registre, role: Role, q: Quinzaine, sauf?: string): Set<string> {
  const res = new Set<string>();
  for (const a of Object.values(registre.agents)) {
    if (a.role !== role || a.matricule === sauf) continue;
    if (congesDeLAgent(a).some((c) => c.periodes.some((p) => chevauche(p, q)))) res.add(a.matricule);
  }
  return res;
}

export interface OccupationQuinzaine {
  cle: string;
  libelle: string;
  debut: string;
  fin: string;
  absents: number;
  plafond: number | null;
}

export function occupationParQuinzaine(
  registre: Registre,
  role: Role,
  depuis: string,
  nbQuinzaines: number
): OccupationQuinzaine[] {
  const res: OccupationQuinzaine[] = [];
  let q = quinzaineDe(depuis);
  for (let i = 0; i < nbQuinzaines; i++, q = quinzaineSuivante(q)) {
    res.push({
      cle: q.cle,
      libelle: libelleQuinzaine(q),
      debut: q.debut,
      fin: q.fin,
      absents: absentsQuinzaine(registre, role, q).size,
      plafond: CONFIG.PLAFONDS[role]
    });
  }
  return res;
}

// -------------------- CONSTRUCTION D'UNE DEMANDE --------------------
export type ConstructionResult = { status: "ok"; periodes: Periode[] } | { status: "erreur"; message: string };

function periode(depart: Date, nbJours: number): Periode {
  const { debut, fin } = etendrePeriode(depart, nbJours);
  return { debut: dateToStr(debut), fin: dateToStr(fin), jours: nbJours };
}

/**
 * 1 partie : départ le 1er ou le 16, durée libre (peut déborder sur le mois suivant).
 * 2 parties : ceil(n/2) jours à partir du 1er (dans la 1ʳᵉ quinzaine) et
 * floor(n/2) jours à partir du 16 (dans la 2ᵉ quinzaine).
 * Les dimanches et jours fériés ne sont pas décomptés.
 */
export function construirePeriodes(
  annee: number,
  mois: number,
  nbParties: 1 | 2,
  nbJours: number,
  partieChoisie?: "debut" | "fin"
): ConstructionResult {
  if (nbJours < CONFIG.MIN_DAYS) {
    return { status: "erreur", message: `❌ Le minimum est de ${CONFIG.MIN_DAYS} jours.` };
  }
  if (nbJours > CONFIG.MAX_DAYS) {
    return { status: "erreur", message: `❌ Une demande ne peut pas dépasser ${CONFIG.MAX_DAYS} jours.` };
  }

  if (nbParties === 1) {
    if (partieChoisie !== "debut" && partieChoisie !== "fin") {
      return { status: "erreur", message: "Choisissez la partie du mois (début ou mi-mois)." };
    }
    return { status: "ok", periodes: [periode(dateUTC(annee, mois, partieChoisie === "debut" ? 1 : 16), nbJours)] };
  }

  const q1 = quinzaine(annee, mois, 1);
  const q2 = quinzaine(annee, mois, 2);
  const n1 = Math.ceil(nbJours / 2);
  const n2 = Math.floor(nbJours / 2);
  const max1 = compterJoursDecomptes(q1.debut, q1.fin);
  const max2 = compterJoursDecomptes(q2.debut, q2.fin);
  if (n1 > max1) {
    return {
      status: "erreur",
      message: `❌ La 1ʳᵉ partie (1–15) ne compte que ${max1} jours décomptés ; vous en demandez ${n1}. Réduisez le total ou choisissez 1 partie.`
    };
  }
  if (n2 > max2) {
    return {
      status: "erreur",
      message: `❌ La 2ᵉ partie (16–fin) ne compte que ${max2} jours décomptés ; vous en demandez ${n2}. Réduisez le total ou choisissez 1 partie.`
    };
  }
  return {
    status: "ok",
    periodes: [periode(dateUTC(annee, mois, 1), n1), periode(dateUTC(annee, mois, 16), n2)]
  };
}

// -------------------- VERIFICATIONS --------------------
type Verif = { ok: true } | { ok: false; message: string };

/**
 * Le solde doit suffire au départ de CHAQUE congé, en comptant les jours
 * acquis jusqu'à ce départ (+2 par mois) : un agent à 6 jours aujourd'hui
 * peut demander un congé de 11 jours dans 3 mois. Les demandes déjà
 * déposées sont prises en compte dans l'ordre chronologique.
 */
export function verifierSoldeProjete(agent: Agent, nouvelle: { debut: string; jours: number }): Verif {
  const demandes = [
    ...demandesActives(agent).map((d) => ({ debut: d.periodes[0].debut, jours: d.jours, nouvelle: false })),
    { ...nouvelle, nouvelle: true }
  ].sort((a, b) => (a.debut < b.debut ? -1 : 1));

  let cumul = agent.jours_pris_reprise;
  for (const d of demandes) {
    const acquis = joursAcquis(agent.date_embauche, strToDate(d.debut));
    const disponible = acquis - cumul;
    cumul += d.jours;
    if (disponible < d.jours) {
      return {
        ok: false,
        message: d.nouvelle
          ? `❌ Solde insuffisant : au ${formatFr(d.debut)} vous aurez ${disponible} jours (${acquis} acquis − ${acquis - disponible} pris), vous en demandez ${d.jours}. Chaque mois ajoute ${CONFIG.JOURS_ACQUIS_PAR_MOIS} jours : choisissez un mois plus tardif ou moins de jours.`
          : `❌ Cette demande rendrait insuffisant le solde de votre congé du ${formatFr(d.debut)}.`
      };
    }
  }
  return { ok: true };
}

export function verifierPlafond(registre: Registre, agent: Agent, periodes: Periode[]): Verif {
  const plafond = CONFIG.PLAFONDS[agent.role];
  if (plafond === null) return { ok: true };
  const vues = new Set<string>();
  for (const p of periodes) {
    for (const q of quinzainesEntre(p.debut, p.fin)) {
      if (vues.has(q.cle)) continue;
      vues.add(q.cle);
      const absents = absentsQuinzaine(registre, agent.role, q, agent.matricule).size;
      if (absents + 1 > plafond) {
        return {
          ok: false,
          message: `⛔ La quinzaine du ${libelleQuinzaine(q)} est complète pour les ${LIBELLES_ROLE[agent.role].toLowerCase()} (${absents}/${plafond}). Consultez les disponibilités pour choisir une autre période.`
        };
      }
    }
  }
  return { ok: true };
}

/** Toutes les règles, sans rien enregistrer (aperçu et soumission). */
export function verifierDemande(registre: Registre, agent: Agent, periodes: Periode[], aujourdHui: Date): Verif {
  if (periodes.length === 0) return { ok: false, message: "Aucune date sélectionnée." };
  const debut = periodes[0].debut;
  const fin = periodes[periodes.length - 1].fin;
  const jours = periodes.reduce((s, p) => s + p.jours, 0);

  if (debut <= dateToStr(aujourdHui)) {
    return { ok: false, message: "⛔ La date de départ doit être postérieure à aujourd'hui." };
  }

  const anniversaire = dateAnniversaire(agent);
  if (debut < anniversaire) {
    return {
      ok: false,
      message: `⛔ Un premier congé n'est possible qu'à partir de votre date anniversaire d'entrée, le ${formatFr(anniversaire)} (${CONFIG.ANCIENNETE_MIN_MOIS} mois d'ancienneté).`
    };
  }

  for (const c of congesDeLAgent(agent)) {
    if (c.periodes.some((p) => periodes.some((n) => chevauche(p, n)))) {
      return { ok: false, message: `⛔ Chevauchement avec votre congé du ${formatFr(c.debut)} au ${formatFr(c.fin)}.` };
    }
    // Délai de 12 mois dans les deux sens (on peut demander avant un congé déjà prévu).
    const finPrecedent = c.fin < debut ? c.fin : fin;
    const debutSuivant = c.fin < debut ? debut : c.debut;
    const limite = dateToStr(ajouterMois(ajouterJours(strToDate(finPrecedent), 1), CONFIG.DELAI_MOIS));
    if (debutSuivant < limite) {
      return {
        ok: false,
        message:
          c.fin < debut
            ? `⛔ Délai de ${CONFIG.DELAI_MOIS} mois non respecté : votre dernier congé finit le ${formatFr(c.fin)}, prochain départ possible le ${formatFr(limite)}.`
            : `⛔ Délai de ${CONFIG.DELAI_MOIS} mois non respecté avec votre congé prévu le ${formatFr(c.debut)}.`
      };
    }
  }

  const soldeOk = verifierSoldeProjete(agent, { debut, jours });
  if (!soldeOk.ok) return soldeOk;

  return verifierPlafond(registre, agent, periodes);
}

// -------------------- ACCES AU REGISTRE --------------------
export async function chargerRegistre(): Promise<Registre> {
  const lu = await lireDocument<Registre>();
  if (!lu) throw new Error("Registre introuvable. Importer d'abord les agents (voir README).");
  return lu.data;
}

/** Recherche sûre : ignore les clés héritées du prototype ("constructor", "__proto__"…). */
export function trouverAgent(registre: Registre, matricule: string): Agent | null {
  return Object.hasOwn(registre.agents, matricule) ? registre.agents[matricule] : null;
}

export function trouverAdmin(registre: Registre, matricule: string): Admin | null {
  return Object.hasOwn(registre.admins, matricule) ? registre.admins[matricule] : null;
}

// -------------------- ACTIONS --------------------
export interface ResultatAction {
  succes: boolean;
  message: string;
}

export function soumettreDemande(matricule: string, periodes: Periode[]): Promise<ResultatAction> {
  return modifierDocument<Registre, ResultatAction>((registre) => {
    const agent = trouverAgent(registre, matricule);
    if (!agent) return { ecrire: false, resultat: { succes: false, message: "❌ Agent introuvable." } };

    const verif = verifierDemande(registre, agent, periodes, aujourdhuiUTC());
    if (!verif.ok) return { ecrire: false, resultat: { succes: false, message: verif.message } };

    const jours = periodes.reduce((s, p) => s + p.jours, 0);
    agent.demandes.push({ id: randomUUID(), periodes, jours, statut: "en_attente", cree_le: new Date().toISOString() });
    const resume = periodes.map((p) => `du ${formatFr(p.debut)} au ${formatFr(p.fin)}`).join(" et ");
    return {
      ecrire: true,
      resultat: { succes: true, message: `✅ Vœu enregistré ${resume} (${jours} jours), en attente de validation.` }
    };
  });
}

/** L'agent retire lui-même un vœu encore en attente. */
export function annulerDemande(matricule: string, id: string): Promise<ResultatAction> {
  return modifierDocument<Registre, ResultatAction>((registre) => {
    const demande = trouverAgent(registre, matricule)?.demandes.find((d) => d.id === id);
    if (!demande) return { ecrire: false, resultat: { succes: false, message: "Vœu introuvable." } };
    if (demande.statut !== "en_attente") {
      return { ecrire: false, resultat: { succes: false, message: "Ce vœu a déjà été traité, contactez l'administration." } };
    }
    Object.assign(demande, { statut: "supprime", traite_le: new Date().toISOString(), traite_par: matricule, motif: "Annulé par l'agent" });
    return { ecrire: true, resultat: { succes: true, message: "Vœu annulé." } };
  });
}

/** Validation ou suppression d'un vœu par un administrateur. */
export function traiterDemande(
  admin: string,
  matricule: string,
  id: string,
  action: "valider" | "supprimer",
  motif?: string
): Promise<ResultatAction> {
  return modifierDocument<Registre, ResultatAction>((registre) => {
    const demande = trouverAgent(registre, matricule)?.demandes.find((d) => d.id === id);
    if (!demande) return { ecrire: false, resultat: { succes: false, message: "Vœu introuvable." } };
    if (demande.statut === "supprime") return { ecrire: false, resultat: { succes: false, message: "Ce vœu est déjà supprimé." } };
    if (action === "valider" && demande.statut === "valide") {
      return { ecrire: false, resultat: { succes: false, message: "Ce vœu est déjà validé." } };
    }
    Object.assign(demande, {
      statut: action === "valider" ? "valide" : "supprime",
      traite_le: new Date().toISOString(),
      traite_par: admin,
      ...(motif ? { motif } : {})
    });
    return { ecrire: true, resultat: { succes: true, message: action === "valider" ? "Vœu validé." : "Vœu supprimé." } };
  });
}

// -------------------- VUE AGENT --------------------
export interface AgentPublic {
  matricule: string;
  prenom: string;
  nom: string;
  fonction: string;
  role: Role;
  date_embauche: string;
  date_anniversaire: string;
  anciennete_mois: number;
  jours_acquis: number;
  jours_pris: number;
  solde: number;
  premiere_date_possible: string;
  solde_a_cette_date: number;
  projection: { mois: string; solde: number }[]; // solde au 1er de chacun des 12 prochains mois
  historique: Periode[];
  demandes: Demande[];
}

export function vuePublique(agent: Agent, aujourdHui: Date): AgentPublic {
  const premiere = premiereDatePossible(agent, aujourdHui);
  const projection = Array.from({ length: 12 }, (_, i) => {
    const d = dateUTC(aujourdHui.getUTCFullYear(), aujourdHui.getUTCMonth() + 2 + i, 1);
    return { mois: dateToStr(d), solde: solde(agent, d) };
  });
  return {
    matricule: agent.matricule,
    prenom: agent.prenom,
    nom: agent.nom,
    fonction: agent.fonction,
    role: agent.role,
    date_embauche: agent.date_embauche,
    date_anniversaire: dateAnniversaire(agent),
    anciennete_mois: moisDeService(agent.date_embauche, aujourdHui),
    jours_acquis: joursAcquis(agent.date_embauche, aujourdHui),
    jours_pris: joursPris(agent),
    solde: solde(agent, aujourdHui),
    premiere_date_possible: premiere,
    solde_a_cette_date: solde(agent, strToDate(premiere)),
    projection,
    historique: [...agent.historique].sort((a, b) => (a.debut < b.debut ? 1 : -1)),
    demandes: [...agent.demandes].sort((a, b) => (a.cree_le < b.cree_le ? 1 : -1))
  };
}
