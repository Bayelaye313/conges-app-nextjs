/**
 * Transfert du registre local (data/registre.json) vers/depuis PostgreSQL.
 *
 *   npm run registre:db -- publier
 *   npm run registre:db -- recuperer
 *
 * DATABASE_URL doit contenir l'URL de connexion poolée PostgreSQL.
 */
import fs from "fs";
import path from "path";
import type { Registre } from "../lib/conges";
import {
  dossierDonnees,
  ecrireDocumentForce,
  initialiserStockagePostgres,
  lireDocument
} from "../lib/storage";
import { argumentsPositionnels, arreter, drapeau } from "./outils";

const FICHIER = () => path.join(dossierDonnees(), "registre.json");

async function avecPostgres<T>(fn: () => Promise<T>): Promise<T> {
  const stockageAvant = process.env.CONGES_STOCKAGE;
  process.env.CONGES_STOCKAGE = "postgres";
  try {
    return await fn();
  } finally {
    if (stockageAvant === undefined) delete process.env.CONGES_STOCKAGE;
    else process.env.CONGES_STOCKAGE = stockageAvant;
  }
}

async function main() {
  const [action] = argumentsPositionnels();
  if (!process.env.DATABASE_URL) arreter("Définir DATABASE_URL (URL poolée PostgreSQL).");

  await initialiserStockagePostgres();

  if (action === "publier") {
    if (!fs.existsSync(FICHIER())) arreter(`${FICHIER()} introuvable.`);
    const local = JSON.parse(fs.readFileSync(FICHIER(), "utf-8")) as Registre;
    const distant = await avecPostgres(() => lireDocument<Registre>());
    if (distant && !drapeau("--force")) {
      arreter("Un registre existe déjà dans PostgreSQL. Utiliser --force uniquement pour le remplacer.");
    }
    await avecPostgres(() => ecrireDocumentForce(local));
    console.log(
      `\n✔ Registre importé dans PostgreSQL (${Object.keys(local.agents).length} agents, ${Object.keys(local.admins).length} admin).\n`
    );
  } else if (action === "recuperer") {
    const distant = await avecPostgres(() => lireDocument<Registre>());
    if (!distant) arreter("Aucun registre PostgreSQL.");
    const horodatage = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const sortie = path.join(dossierDonnees(), `registre-postgres-${horodatage}.json`);
    fs.mkdirSync(path.dirname(sortie), { recursive: true });
    fs.writeFileSync(sortie, JSON.stringify(distant.data, null, 2), { mode: 0o600 });
    console.log(`\n✔ Registre récupéré → ${sortie}\n`);
  } else {
    arreter("Usage : npm run registre:db -- publier | recuperer [--force]");
  }
}

main().catch((e: unknown) => {
  console.error("\n✖ Échec du transfert PostgreSQL :", e);
  process.exitCode = 1;
});
