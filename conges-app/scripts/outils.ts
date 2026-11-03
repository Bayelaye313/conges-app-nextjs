import fs from "fs";

/** Lit un tableau copié depuis Excel (tabulations), ou un CSV séparé par ; ou ,. */
export function lireTableau(fichier: string): string[][] {
  const texte = fs.readFileSync(fichier, "utf-8").replace(/^﻿/, "");
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== "");
  const sep = lignes[0].includes("\t") ? "\t" : lignes[0].includes(";") ? ";" : ",";
  return lignes.map((l) => l.split(sep));
}

/** Supprime les espaces superflus (début, fin, doubles espaces). */
export function nettoyer(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/** "20/12/2023" ou "2023-12-20" → "2023-12-20". Lève une erreur si la date est invalide. */
export function dateIso(s: string): string {
  const v = nettoyer(s);
  let a: number, m: number, j: number;
  let r = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (r) [j, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = v.match(/^(\d{4})-(\d{2})-(\d{2})$/))) [a, m, j] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else throw new Error(`date illisible « ${s} »`);
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCFullYear() !== a || d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) {
    throw new Error(`date inexistante « ${s} »`);
  }
  return d.toISOString().slice(0, 10);
}

export function entier(s: string, champ: string): number {
  const v = nettoyer(s);
  if (!/^-?\d+$/.test(v)) throw new Error(`${champ} n'est pas un nombre entier : « ${s} »`);
  return Number(v);
}

export function argument(nom: string): string | undefined {
  const i = process.argv.indexOf(nom);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export function drapeau(nom: string): boolean {
  return process.argv.includes(nom);
}

export function argumentsPositionnels(): string[] {
  const res: string[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      if (args[i + 1] && !args[i + 1].startsWith("--") && !["--force", "--tous", "--essai", "--ignorer-inconnus"].includes(args[i])) i++;
      continue;
    }
    res.push(args[i]);
  }
  return res;
}

export function arreter(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}
