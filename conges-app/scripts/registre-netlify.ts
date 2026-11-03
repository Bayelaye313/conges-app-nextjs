/**
 * Transfert du registre entre le fichier local (data/registre.json) et
 * Netlify Blobs (production).
 *
 *   npm run registre:publier     → envoie le registre local sur Netlify (mise en service)
 *   npm run registre:recuperer   → rapatrie le registre de Netlify en local (sauvegarde, export)
 *
 * Variables nécessaires : NETLIFY_SITE_ID (Site configuration → Site ID) et
 * NETLIFY_AUTH_TOKEN (User settings → Applications → Personal access tokens).
 *
 * `publier` refuse d'écraser un registre déjà en ligne qui contient des
 * vœux, sauf avec --force : une fois la campagne ouverte, toutes les
 * modifications se font dans l'application.
 */
import fs from "fs";
import path from "path";
import type { Registre } from "../lib/conges";
import { dossierDonnees, lireDocument, ecrireDocumentForce } from "../lib/storage";
import { argumentsPositionnels, arreter, drapeau } from "./outils";

const FICHIER = () => path.join(dossierDonnees(), "registre.json");

function nbVoeux(r: Registre): number {
  return Object.values(r.agents).reduce((s, a) => s + a.demandes.length, 0);
}

async function avecBlobs<T>(fn: () => Promise<T>): Promise<T> {
  const avant = process.env.CONGES_STOCKAGE;
  process.env.CONGES_STOCKAGE = "blobs";
  try {
    return await fn();
  } finally {
    process.env.CONGES_STOCKAGE = avant;
  }
}

async function main() {
  const [action] = argumentsPositionnels();
  if (!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_AUTH_TOKEN) {
    arreter("Définir NETLIFY_SITE_ID et NETLIFY_AUTH_TOKEN (voir README).");
  }

  if (action === "publier") {
    if (!fs.existsSync(FICHIER())) arreter(`${FICHIER()} introuvable.`);
    const local = JSON.parse(fs.readFileSync(FICHIER(), "utf-8")) as Registre;
    const distant = await avecBlobs(() => lireDocument<Registre>());
    if (distant && nbVoeux(distant.data) > 0 && !drapeau("--force")) {
      arreter(
        `Le registre en ligne contient déjà ${nbVoeux(distant.data)} vœu(x) : le publier les effacerait. ` +
          "Lancer d'abord registre:recuperer, ou --force si c'est vraiment voulu."
      );
    }
    await avecBlobs(() => ecrireDocumentForce(local));
    console.log(`\n✔ Registre publié sur Netlify (${Object.keys(local.agents).length} agents, ${Object.keys(local.admins).length} admin).\n`);
  } else if (action === "recuperer") {
    const distant = await avecBlobs(() => lireDocument<Registre>());
    if (!distant) arreter("Aucun registre en ligne.");
    const horodatage = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
    const sortie = path.join(dossierDonnees(), `registre-netlify-${horodatage}.json`);
    fs.mkdirSync(path.dirname(sortie), { recursive: true });
    fs.writeFileSync(sortie, JSON.stringify(distant.data, null, 2), { mode: 0o600 });
    console.log(`\n✔ Registre récupéré (${nbVoeux(distant.data)} vœux) → ${sortie}\n`);
  } else {
    arreter("Usage : npm run registre:publier | npm run registre:recuperer");
  }
}

main();
