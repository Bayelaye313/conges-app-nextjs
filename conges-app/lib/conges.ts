import { randomUUID } from "crypto";
import { estDecompte, etendrePeriode, fetesExclusives } from "./calendrier";
import { lireDocument, modifierDocument } from "./storage";

// -------------------- CONFIGURATION --------------------
export type Role = "AV" | "CEV" | "CS";

export const CONFIG = {
  MIN_DAYS: 11, // jours décomptés (hors dimanches et fériés)
  MAX_DAYS: 90, // garde-fou technique
  DELAI_MOIS: 12, // entre les mois de deux congés
  ANCIENNETE_MIN_MOIS: 12, // premier congé possible à la date anniversaire d'entrée
  JOURS_ACQUIS_PAR_MOIS: 2,
  /** Absents simultanés au maximum par jour, par rôle (null = pas de plafond). */
  PLAFONDS: { AV: 16, CEV: 3, CS: null } as Record<Role, number | null>
} as const;

export const LIBELLES_ROLE: Record<Role, string> = {
  AV: "Agents de vente",
  CEV: "Chefs d'équipe vente",
  CS: "Chefs de secteur"
};

export function plafondParDate(role: Role, date: string): number | null {
  if (role === "AV" && date >= "2027-01-01") {
    return date <= "2027-01-15" ? 9 : 16;
  }
  return CONFIG.PLAFONDS[role];
}

// -------------------- MODELE --------------------
export interface Periode {
  debut: string; // YYYY-MM-DD, premier jour d'absence
  fin: string; // YYYY-MM-DD, dernier jour d'absence (la reprise est le lendemain)
  jours: number; // jours décomptés (hors dimanches et fériés)
}

export type StatutDemande = "en_attente" | "valide" | "supprime";
export type TypeDemande = "conge" | "recuperation";

/** Demande de congé ou de récupération : 1 période continue ou 2 périodes distinctes. */
export interface Demande {
  id: string;
  type?: TypeDemande;
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
  /** Marque un code provisoire non encore remplacé ; son remplacement reste facultatif. */
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
  /** Compte désactivé : accès bloqué, historique conservé. */
  desactive?: boolean;
  /** Fin de congé connue sans période détaillée. */
  dernier_conge_fin?: string | null;
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
/** Un « congé » = une période reprise ou une demande active (ses 2 périodes comptent pour un, pour le délai de 12 mois). */
interface Conge {
  debut: string;
  fin: string;
  periodes: Periode[];
}

export function congesDeLAgent(agent: Agent, inclureRecuperations = true): Conge[] {
  const conges: Conge[] = [
    ...agent.historique.map((p) => ({ debut: p.debut, fin: p.fin, periodes: [p] })),
    ...demandesActives(agent).filter((d) => inclureRecuperations || d.type !== "recuperation").map((d) => ({
      debut: d.periodes[0].debut,
      fin: d.periodes[d.periodes.length - 1].fin,
      periodes: d.periodes
    }))
  ];
  if (agent.dernier_conge_fin && !agent.historique.length) {
    const periode = { debut: agent.dernier_conge_fin, fin: agent.dernier_conge_fin, jours: 0 };
    conges.push({ debut: periode.debut, fin: periode.fin, periodes: [periode] });
  }
  return conges;
}

export function dernierConge(agent: Agent): Conge | null {
  return congesDeLAgent(agent, false).reduce<Conge | null>((max, c) => (!max || c.fin > max.fin ? c : max), null);
}

function premierJourMoisDelai(debut: string): string {
  const date = strToDate(debut);
  return dateToStr(dateUTC(date.getUTCFullYear(), date.getUTCMonth() + 1 + CONFIG.DELAI_MOIS, 1));
}

/** Prochaine date de départ choisissable (le 1er ou le 16 du mois) à partir de `date`. */
export function prochainAncrage(date: string): string {
  const [a, m, j] = date.split("-").map(Number);
  if (j === 1 || j === 16) return date;
  return dateToStr(j < 16 ? dateUTC(a, m, 16) : dateUTC(a, m + 1, 1));
}

/**
 * Première date de départ possible (1er ou 16 du mois) : après aujourd'hui,
 * à partir de la date anniversaire d'entrée et du premier jour du mois qui
 * marque les 12 mois calendaires depuis le départ du dernier congé.
 */
export function premiereDatePossible(agent: Agent, aujourdHui: Date): string {
  const dernier = dernierConge(agent);
  return prochainAncrage(
    maxStr(
      dateToStr(ajouterJours(aujourdHui, 1)),
      dateAnniversaire(agent),
      dernier ? premierJourMoisDelai(dernier.debut) : ""
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

/** Matricules des agents d'un rôle absents à cette date. */
function absentsLeJour(registre: Registre, role: Role, date: string, sauf?: string): Set<string> {
  const res = new Set<string>();
  for (const a of Object.values(registre.agents)) {
    if (a.role !== role || a.matricule === sauf) continue;
    if (congesDeLAgent(a).some((c) => c.periodes.some((p) => p.debut <= date && date <= p.fin))) {
      res.add(a.matricule);
    }
  }
  return res;
}

/** Matricules des agents ayant un vœu actif sur cette date (sans l'historique importé). */
function soumissionsActivesLeJour(registre: Registre, role: Role, date: string): Set<string> {
  const res = new Set<string>();
  for (const a of Object.values(registre.agents)) {
    if (a.role !== role) continue;
    if (demandesActives(a).some((d) => d.periodes.some((p) => p.debut <= date && date <= p.fin))) {
      res.add(a.matricule);
    }
  }
  return res;
}

export interface OccupationQuinzaine {
  cle: string;
  libelle: string;
  debut: string;
  fin: string;
  pic: number;
  picLe: string | null;
  parJour: { date: string; absents: number }[];
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
    const parJour: { date: string; absents: number }[] = [];
    for (let date = q.debut; date <= q.fin; date = dateToStr(ajouterJours(strToDate(date), 1))) {
      parJour.push({ date, absents: soumissionsActivesLeJour(registre, role, date).size });
    }
    const pic = Math.max(0, ...parJour.map((jour) => jour.absents));
    res.push({
      cle: q.cle,
      libelle: libelleQuinzaine(q),
      debut: q.debut,
      fin: q.fin,
      pic,
      picLe: pic > 0 ? parJour.find((jour) => jour.absents === pic)!.date : null,
      parJour,
      plafond: plafondParDate(role, q.debut)
    });
  }
  return res;
}

// -------------------- CONSTRUCTION D'UNE DEMANDE --------------------
export type ConstructionResult = { status: "ok"; periodes: Periode[] } | { status: "erreur"; message: string };

/** Une période choisie par l'agent : départ le 1er ou le 16 d'un mois, durée en jours décomptés. */
export interface ChoixPeriode {
  annee: number;
  mois: number;
  partie: "debut" | "fin"; // départ le 1er ou le 16
  nbJours: number;
}

function periode(depart: Date, nbJours: number): Periode {
  const { debut, fin } = etendrePeriode(depart, nbJours);
  return { debut: dateToStr(debut), fin: dateToStr(fin), jours: nbJours };
}

/**
 * Une demande = 1 période continue (qui peut couvrir un mois entier ou déborder
 * sur le suivant) ou 2 périodes distinctes. Les dimanches et jours fériés ne
 * sont pas décomptés : la période s'allonge d'autant. Le minimum s'applique
 * aux congés, pas aux récupérations.
 */
export function construirePeriodes(choix: ChoixPeriode[], type: TypeDemande = "conge"): ConstructionResult {
  if (choix.length < 1 || choix.length > 2) {
    return { status: "erreur", message: "❌ Une demande comporte 1 ou 2 périodes." };
  }
  if (choix.some((c) => !Number.isInteger(c.nbJours) || c.nbJours < 1)) {
    return { status: "erreur", message: "❌ Indiquez un nombre de jours pour chaque période." };
  }
  const total = choix.reduce((s, c) => s + c.nbJours, 0);
  if (type === "conge" && total < CONFIG.MIN_DAYS) {
    return {
      status: "erreur",
      message:
        choix.length === 1
          ? `❌ Le minimum est de ${CONFIG.MIN_DAYS} jours.`
          : `❌ Le minimum est de ${CONFIG.MIN_DAYS} jours au total (vous en demandez ${total}).`
    };
  }
  if (total > CONFIG.MAX_DAYS) {
    return { status: "erreur", message: `❌ Une demande ne peut pas dépasser ${CONFIG.MAX_DAYS} jours.` };
  }

  const periodes = choix
    .map((c) => periode(dateUTC(c.annee, c.mois, c.partie === "debut" ? 1 : 16), c.nbJours))
    .sort((a, b) => (a.debut < b.debut ? -1 : 1));

  if (periodes.length === 2 && periodes[1].debut <= periodes[0].fin) {
    return {
      status: "erreur",
      message: `❌ Les deux périodes se chevauchent : la première se termine le ${formatFr(periodes[0].fin)} (retour le ${formatFr(dateToStr(ajouterJours(strToDate(periodes[0].fin), 1)))}). Choisissez une date de départ plus tardive pour l'autre période, ou prenez votre congé en une seule fois.`
    };
  }
  return { status: "ok", periodes };
}

// -------------------- VERIFICATIONS --------------------
type Verif = { ok: true } | { ok: false; message: string };

export interface SoldePeriode {
  debut: string;
  jours: number;
  acquis: number; // jours acquis à la date de départ
  avant: number; // solde disponible au départ
  apres: number; // solde après déduction des jours posés
  nouvelle: boolean;
}

/**
 * Solde projeté au départ de CHAQUE période (anciens vœux et nouvelles
 * périodes), dans l'ordre chronologique : jours acquis à cette date (+2 par
 * mois) − jours déjà pris ou posés avant. Les jours posés sont des jours
 * décomptés (hors dimanches et fériés).
 */
export function projeterSolde(agent: Agent, nouvelles: Periode[]): SoldePeriode[] {
  const items = [
    ...demandesActives(agent).flatMap((d) => d.periodes.map((p) => ({ debut: p.debut, jours: p.jours, nouvelle: false }))),
    ...nouvelles.map((p) => ({ debut: p.debut, jours: p.jours, nouvelle: true }))
  ].sort((a, b) => (a.debut < b.debut ? -1 : 1));

  let cumul = agent.jours_pris_reprise;
  return items.map((it) => {
    const acquis = joursAcquis(agent.date_embauche, strToDate(it.debut));
    const avant = acquis - cumul;
    cumul += it.jours;
    return { ...it, acquis, avant, apres: avant - it.jours };
  });
}

/**
 * Le solde doit suffire au départ de chaque période : un agent à 6 jours
 * aujourd'hui peut demander un congé de 11 jours dans 3 mois.
 */
export function verifierSoldeProjete(agent: Agent, nouvelles: Periode[]): Verif {
  for (const s of projeterSolde(agent, nouvelles)) {
    if (s.avant < s.jours) {
      return {
        ok: false,
        message: s.nouvelle
          ? `❌ Solde insuffisant : au ${formatFr(s.debut)} vous aurez ${s.avant} jours (${s.acquis} acquis − ${s.acquis - s.avant} pris), vous en demandez ${s.jours}. Chaque mois ajoute ${CONFIG.JOURS_ACQUIS_PAR_MOIS} jours : choisissez un mois plus tardif ou moins de jours.`
          : `❌ Ce vœu rendrait insuffisant le solde de votre congé du ${formatFr(s.debut)}.`
      };
    }
  }
  return { ok: true };
}

/** Période élargie aux jours non décomptés (dimanches, fériés) qui la précèdent ou la suivent. */
function absenceEtendue(p: Periode): { debut: string; fin: string } {
  let debut = strToDate(p.debut);
  let fin = strToDate(p.fin);
  while (!estDecompte(ajouterJours(debut, -1))) debut = ajouterJours(debut, -1);
  while (!estDecompte(ajouterJours(fin, 1))) fin = ajouterJours(fin, 1);
  return { debut: dateToStr(debut), fin: dateToStr(fin) };
}

/**
 * Fêtes exclusives (Korité/Tabaski, Magal/Gamou) : sur une même année, un
 * agent peut être en congé pour l'une des deux fêtes d'un groupe, pas pour
 * les deux (congés repris, vœux actifs et nouveau vœu confondus). Une fête
 * est « couverte » si elle tombe pendant l'absence, y compris sur les
 * dimanches et fériés collés au départ ou au retour (ex. : Tabaski un
 * dimanche 16, départ le lundi 17).
 */
export function verifierFetesMajeures(agent: Agent, nouvelles: Periode[]): Verif {
  const existantes = congesDeLAgent(agent).flatMap((c) => c.periodes);
  const couvrante = (ps: Periode[], date: string) =>
    ps.find((p) => {
      const e = absenceEtendue(p);
      return e.debut <= date && date <= e.fin;
    });
  const decrire = (p: Periode, nouvelle: boolean) =>
    `${nouvelle ? "la période demandée" : "votre congé déjà enregistré"} du ${formatFr(p.debut)} au ${formatFr(p.fin)}`;

  const annees = new Set(nouvelles.flatMap((p) => [Number(p.debut.slice(0, 4)), Number(p.fin.slice(0, 4))]));
  for (const annee of [...annees].sort()) {
    for (const groupe of fetesExclusives(annee)) {
      const touchees = groupe.fetes.flatMap((f) => {
        const n = couvrante(nouvelles, f.date);
        const e = n ? undefined : couvrante(existantes, f.date);
        return n || e ? [{ fete: f, periode: (n ?? e)!, nouvelle: !!n }] : [];
      });
      if (touchees.length < 2 || !touchees.some((t) => t.nouvelle)) continue;

      const [t1, t2] = touchees;
      const detail =
        t1.periode === t2.periode
          ? `${decrire(t1.periode, t1.nouvelle)[0].toUpperCase()}${decrire(t1.periode, t1.nouvelle).slice(1)} couvre les deux fêtes.`
          : `${decrire(t1.periode, t1.nouvelle)[0].toUpperCase()}${decrire(t1.periode, t1.nouvelle).slice(1)} couvre ${t1.fete.libelle}, et ${decrire(t2.periode, t2.nouvelle)} couvre ${t2.fete.libelle}.`;
      return {
        ok: false,
        message:
          `⛔ Vœu refusé : vous ne pouvez pas être en congé à la fois pour ${t1.fete.libelle} (${formatFr(t1.fete.date)}) ` +
          `et pour ${t2.fete.libelle} (${formatFr(t2.fete.date)}). Le service n'autorise qu'une seule de ces deux fêtes par année (règle « ${groupe.titre} »). ` +
          `${detail} Modifiez vos dates pour ne garder qu'une seule de ces fêtes.`
      };
    }
  }
  return { ok: true };
}

export function verifierPlafond(registre: Registre, agent: Agent, periodes: Periode[]): Verif {
  if (CONFIG.PLAFONDS[agent.role] === null) return { ok: true };
  const datesVues = new Set<string>();
  for (const p of periodes) {
    for (let date = p.debut; date <= p.fin; date = dateToStr(ajouterJours(strToDate(date), 1))) {
      if (datesVues.has(date)) continue;
      datesVues.add(date);
      const plafond = plafondParDate(agent.role, date);
      if (plafond === null) continue;
      const absents = absentsLeJour(registre, agent.role, date, agent.matricule).size;
      if (absents + 1 > plafond) {
        return {
          ok: false,
          message: `⛔ Le plafond de ${plafond} ${LIBELLES_ROLE[agent.role].toLowerCase()} simultanément en congé serait dépassé le ${formatFr(date)} (${absents} déjà prévus). Consultez les disponibilités pour choisir d'autres dates.`
        };
      }
    }
  }
  return { ok: true };
}

/** Toutes les règles, sans rien enregistrer (aperçu et soumission). */
export function verifierDemande(
  registre: Registre,
  agent: Agent,
  periodes: Periode[],
  aujourdHui: Date,
  type: TypeDemande = "conge"
): Verif {
  if (periodes.length === 0) return { ok: false, message: "Aucune date sélectionnée." };
  const debut = periodes[0].debut;

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
  }

  if (type === "conge") {
    // Le délai de 12 mois lie les congés entre eux, mais pas les récupérations.
    for (const c of congesDeLAgent(agent, false)) {
      const debutPrecedent = c.fin < debut ? c.debut : debut;
      const debutSuivant = c.fin < debut ? debut : c.debut;
      const limite = premierJourMoisDelai(debutPrecedent);
      if (debutSuivant.slice(0, 7) < limite.slice(0, 7)) {
        return {
          ok: false,
          message:
            c.fin < debut
              ? `⛔ Délai de ${CONFIG.DELAI_MOIS} mois non respecté : votre dernier congé a débuté le ${formatFr(c.debut)}, prochain départ possible le ${formatFr(limite)}.`
              : `⛔ Délai de ${CONFIG.DELAI_MOIS} mois non respecté avec votre congé prévu le ${formatFr(c.debut)}.`
        };
      }
    }
  }

  const fetesOk = verifierFetesMajeures(agent, periodes);
  if (!fetesOk.ok) return fetesOk;

  const soldeOk = verifierSoldeProjete(agent, periodes);
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

/** Change le type d'une demande active et la remet en attente de validation. */
export function changerTypeDemande(
  registre: Registre,
  matricule: string,
  id: string,
  typeCible: TypeDemande,
  aujourdHui: Date = aujourdhuiUTC()
): ResultatAction {
  const agent = trouverAgent(registre, matricule);
  if (!agent) return { succes: false, message: "❌ Agent introuvable." };

  const demande = agent.demandes.find((d) => d.id === id);
  if (!demande) return { succes: false, message: "Vœu introuvable." };
  if (demande.statut === "supprime") return { succes: false, message: "Ce vœu est déjà supprimé." };
  if ((demande.type ?? "conge") === typeCible) {
    return { succes: false, message: `Cette demande est déjà de type ${typeCible === "conge" ? "congé" : "récupération"}.` };
  }

  const jours = demande.periodes.reduce((total, periode) => total + periode.jours, 0);
  if (typeCible === "conge" && jours < CONFIG.MIN_DAYS) {
    return {
      succes: false,
      message: `❌ Cette demande compte ${jours} jours; le minimum pour un congé est de ${CONFIG.MIN_DAYS} jours.`
    };
  }
  if (jours > CONFIG.MAX_DAYS) {
    return { succes: false, message: `❌ Une demande ne peut pas dépasser ${CONFIG.MAX_DAYS} jours.` };
  }

  const agentVerifie: Agent = {
    ...agent,
    demandes: agent.demandes.filter((d) => d.id !== id)
  };
  const registreVerifie: Registre = {
    ...registre,
    agents: { ...registre.agents, [matricule]: agentVerifie }
  };
  const verification = verifierDemande(registreVerifie, agentVerifie, demande.periodes, aujourdHui, typeCible);
  if (!verification.ok) return { succes: false, message: verification.message };

  demande.type = typeCible;
  demande.statut = "en_attente";
  delete demande.traite_le;
  delete demande.traite_par;
  delete demande.motif;
  return {
    succes: true,
    message: `Demande passée en ${typeCible === "conge" ? "congé" : "récupération"} et remise en attente de validation.`
  };
}

/** Scinde une récupération à deux périodes et convertit l'une d'elles en congé. */
export function scinderRecuperationEnConge(
  registre: Registre,
  matricule: string,
  id: string,
  periodeIndex: number,
  aujourdHui: Date = aujourdhuiUTC()
): ResultatAction {
  const agent = trouverAgent(registre, matricule);
  if (!agent) return { succes: false, message: "❌ Agent introuvable." };

  const demande = agent.demandes.find((d) => d.id === id);
  if (!demande) return { succes: false, message: "Vœu introuvable." };
  if (demande.statut === "supprime") return { succes: false, message: "Ce vœu est déjà supprimé." };
  if (demande.type !== "recuperation" || demande.periodes.length !== 2) {
    return { succes: false, message: "Seule une récupération composée de deux périodes peut être scindée." };
  }
  if (!Number.isInteger(periodeIndex) || periodeIndex < 0 || periodeIndex > 1) {
    return { succes: false, message: "Sélectionnez une période valide à convertir." };
  }

  const periodeConge = demande.periodes[periodeIndex];
  if (periodeConge.jours < CONFIG.MIN_DAYS) {
    return {
      succes: false,
      message: `❌ Cette période compte ${periodeConge.jours} jours; le minimum pour un congé est de ${CONFIG.MIN_DAYS} jours.`
    };
  }
  if (periodeConge.jours > CONFIG.MAX_DAYS) {
    return { succes: false, message: `❌ Un congé ne peut pas dépasser ${CONFIG.MAX_DAYS} jours.` };
  }

  const periodeRecuperation = demande.periodes[1 - periodeIndex];
  const agentVerifie: Agent = {
    ...agent,
    demandes: agent.demandes.map((d) =>
      d.id === id ? { ...d, periodes: [periodeRecuperation], jours: periodeRecuperation.jours } : d
    )
  };
  const registreVerifie: Registre = {
    ...registre,
    agents: { ...registre.agents, [matricule]: agentVerifie }
  };
  const verification = verifierDemande(registreVerifie, agentVerifie, [periodeConge], aujourdHui, "conge");
  if (!verification.ok) return { succes: false, message: verification.message };

  demande.periodes = [periodeRecuperation];
  demande.jours = periodeRecuperation.jours;
  agent.demandes.push({
    id: randomUUID(),
    type: "conge",
    periodes: [periodeConge],
    jours: periodeConge.jours,
    statut: "en_attente",
    cree_le: new Date().toISOString()
  });
  return {
    succes: true,
    message: "Récupération scindée : la période choisie est devenue une demande de congé en attente; l'autre reste une récupération."
  };
}

export function soumettreDemande(
  matricule: string,
  periodes: Periode[],
  type: TypeDemande = "conge"
): Promise<ResultatAction> {
  return modifierDocument<Registre, ResultatAction>((registre) => {
    const agent = trouverAgent(registre, matricule);
    if (!agent) return { ecrire: false, resultat: { succes: false, message: "❌ Agent introuvable." } };

    const verif = verifierDemande(registre, agent, periodes, aujourdhuiUTC(), type);
    if (!verif.ok) return { ecrire: false, resultat: { succes: false, message: verif.message } };

    const jours = periodes.reduce((s, p) => s + p.jours, 0);
    agent.demandes.push({ id: randomUUID(), type, periodes, jours, statut: "en_attente", cree_le: new Date().toISOString() });
    const resume = periodes.map((p) => `du ${formatFr(p.debut)} au ${formatFr(p.fin)}`).join(" et ");
    return {
      ecrire: true,
      resultat: {
        succes: true,
        message: `✅ ${type === "recuperation" ? "Demande de récupération enregistrée" : "Vœu enregistré"} ${resume} (${jours} jours), en attente de validation.`
      }
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
  action: "valider" | "supprimer" | "scinder_recuperation" | "changer_type",
  motif?: string,
  periodeIndex?: number,
  typeCible?: TypeDemande
): Promise<ResultatAction> {
  return modifierDocument<Registre, ResultatAction>((registre) => {
    if (action === "scinder_recuperation") {
      if (periodeIndex === undefined) {
        return { ecrire: false, resultat: { succes: false, message: "Sélectionnez une période à convertir." } };
      }
      const resultat = scinderRecuperationEnConge(registre, matricule, id, periodeIndex);
      return { ecrire: resultat.succes, resultat };
    }
    if (action === "changer_type") {
      if (!typeCible) {
        return { ecrire: false, resultat: { succes: false, message: "Sélectionnez le nouveau type de demande." } };
      }
      const resultat = changerTypeDemande(registre, matricule, id, typeCible);
      return { ecrire: resultat.succes, resultat };
    }

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
  jours_pris_cumules: number;
  jours_reserves: number;
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
  const joursReserves = demandesActives(agent).reduce((s, d) => s + d.jours, 0);
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
    jours_pris_cumules: agent.jours_pris_reprise,
    jours_reserves: joursReserves,
    jours_pris: joursPris(agent),
    solde: solde(agent, aujourdHui),
    premiere_date_possible: premiere,
    solde_a_cette_date: solde(agent, strToDate(premiere)),
    projection,
    historique: [...agent.historique].sort((a, b) => (a.debut < b.debut ? 1 : -1)),
    demandes: [...agent.demandes].sort((a, b) => (a.cree_le < b.cree_le ? 1 : -1))
  };
}
