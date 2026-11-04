/**
 * Calendrier des jours décomptés en congé : tous les jours SAUF les dimanches
 * et les jours fériés au Sénégal.
 *
 * Les fêtes fixes et chrétiennes sont calculées automatiquement pour toute
 * année. Les fêtes musulmanes dépendent de l'observation de la lune : les
 * dates ci-dessous sont des ESTIMATIONS à confirmer (ou corriger) dès que le
 * gouvernement publie le calendrier officiel. Une fête qui tombe un dimanche
 * ne décompte rien de plus.
 */

const FETES_FIXES: [string, string][] = [
  ["01-01", "Jour de l'An"],
  ["04-04", "Fête de l'Indépendance"],
  ["05-01", "Fête du Travail"],
  ["08-15", "Assomption"],
  ["11-01", "Toussaint"],
  ["12-25", "Noël"]
];

/** Fêtes musulmanes — estimations, à corriger selon le calendrier officiel. */
export const FETES_MUSULMANES: Record<string, string> = {
  "2026-03-20": "Korité (estimation)",
  "2026-05-27": "Tabaski (estimation)",
  "2026-06-26": "Tamkharit (estimation)",
  "2026-08-02": "Grand Magal de Touba (estimation)",
  "2026-08-25": "Maouloud (estimation)",
  "2027-03-10": "Korité (estimation)",
  "2027-05-16": "Tabaski (estimation)",
  "2027-06-15": "Tamkharit (estimation)",
  "2027-07-23": "Grand Magal de Touba (estimation)",
  "2027-08-14": "Maouloud (estimation)",
  "2028-02-27": "Korité (estimation)",
  "2028-05-05": "Tabaski (estimation)",
  "2028-06-04": "Tamkharit (estimation)",
  "2028-07-12": "Grand Magal de Touba (estimation)",
  "2028-08-03": "Maouloud (estimation)"
};

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Dimanche de Pâques (algorithme de Meeus/Jones/Butcher, calendrier grégorien). */
export function paques(annee: number): Date {
  const a = annee % 19;
  const b = Math.floor(annee / 100);
  const c = annee % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(annee, mois - 1, jour));
}

const cache = new Map<number, Map<string, string>>();

export function joursFeries(annee: number): Map<string, string> {
  const existant = cache.get(annee);
  if (existant) return existant;

  const feries = new Map<string, string>();
  for (const [md, nom] of FETES_FIXES) feries.set(`${annee}-${md}`, nom);

  const p = paques(annee);
  const decale = (n: number) => iso(new Date(p.getTime() + n * 86400000));
  feries.set(decale(1), "Lundi de Pâques");
  feries.set(decale(39), "Ascension");
  feries.set(decale(50), "Lundi de Pentecôte");

  for (const [date, nom] of Object.entries(FETES_MUSULMANES)) {
    if (date.startsWith(`${annee}-`)) feries.set(date, feries.has(date) ? `${feries.get(date)} / ${nom}` : nom);
  }
  cache.set(annee, feries);
  return feries;
}

export function estFerie(d: Date): boolean {
  return joursFeries(d.getUTCFullYear()).has(iso(d));
}

/** Jour décompté du solde : ni dimanche, ni férié. */
export function estDecompte(d: Date): boolean {
  return d.getUTCDay() !== 0 && !estFerie(d);
}

/** Nombre de jours décomptés entre deux dates (YYYY-MM-DD), bornes incluses. */
export function compterJoursDecomptes(debut: string, fin: string): number {
  let n = 0;
  const d = new Date(`${debut}T00:00:00Z`);
  const f = new Date(`${fin}T00:00:00Z`);
  while (d <= f) {
    if (estDecompte(d)) n++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return n;
}

/**
 * Période qui commence au premier jour décompté à partir de `depart` et se
 * termine le jour où `nbJours` jours décomptés sont atteints.
 */
export function etendrePeriode(depart: Date, nbJours: number): { debut: Date; fin: Date } {
  const d = new Date(depart);
  while (!estDecompte(d)) d.setUTCDate(d.getUTCDate() + 1);
  const debut = new Date(d);
  let compte = 1;
  while (compte < nbJours) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (estDecompte(d)) compte++;
  }
  return { debut, fin: d };
}

/** Nom de la fête sans la mention « (estimation) ». */
function nomCourt(nom: string): string {
  return nom.replace(/\s*\(estimation\)/g, "");
}

export interface JourFerie {
  date: string;
  nom: string;
}

/** Jours fériés (hors dimanche) compris entre deux dates, bornes incluses. */
export function feriesEntre(debut: string, fin: string): JourFerie[] {
  const res: JourFerie[] = [];
  const d = new Date(`${debut}T00:00:00Z`);
  const f = new Date(`${fin}T00:00:00Z`);
  while (d <= f) {
    const nom = joursFeries(d.getUTCFullYear()).get(iso(d));
    if (nom && d.getUTCDay() !== 0) res.push({ date: iso(d), nom: nomCourt(nom) });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return res;
}

/** Détail du décompte d'une période : jours calendaires, dimanches et fériés exclus. */
export function detailDecompte(debut: string, fin: string) {
  let calendaires = 0;
  let dimanches = 0;
  const d = new Date(`${debut}T00:00:00Z`);
  const f = new Date(`${fin}T00:00:00Z`);
  while (d <= f) {
    calendaires++;
    if (d.getUTCDay() === 0) dimanches++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  const feries = feriesEntre(debut, fin);
  return { calendaires, dimanches, feries, decomptes: calendaires - dimanches - feries.length };
}

/**
 * Fêtes « exclusives » : dans chaque groupe, un agent ne peut être en congé
 * que pour UNE des deux fêtes sur une même année (Korité OU Tabaski, Magal
 * OU Gamou). `prefixe` reprend le nom de FETES_MUSULMANES.
 */
export const FETES_EXCLUSIVES = [
  {
    titre: "Korité ou Tabaski",
    fetes: [
      { prefixe: "Korité", nom: "Korité", libelle: "la Korité" },
      { prefixe: "Tabaski", nom: "Tabaski", libelle: "la Tabaski" }
    ]
  },
  {
    titre: "Magal ou Gamou",
    fetes: [
      { prefixe: "Grand Magal de Touba", nom: "Grand Magal de Touba", libelle: "le Grand Magal de Touba" },
      { prefixe: "Maouloud", nom: "Gamou (Maouloud)", libelle: "le Gamou" }
    ]
  }
] as const;

export interface FeteExclusive {
  date: string;
  nom: string; // ex. "Gamou (Maouloud)"
  libelle: string; // ex. "le Gamou"
}

/** Pour une année, chaque groupe avec les dates prévues de ses fêtes. */
export function fetesExclusives(annee: number): { titre: string; fetes: FeteExclusive[] }[] {
  return FETES_EXCLUSIVES.map((g) => ({
    titre: g.titre,
    fetes: g.fetes.flatMap((f) =>
      Object.entries(FETES_MUSULMANES)
        .filter(([date, nom]) => date.startsWith(`${annee}-`) && nom.startsWith(f.prefixe))
        .map(([date]) => ({ date, nom: f.nom, libelle: f.libelle }))
    )
  }));
}
