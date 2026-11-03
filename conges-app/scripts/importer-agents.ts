/**
 * Import (ou mise à jour) des agents depuis le tableau RH.
 *
 *   npm run importer:agents -- data/import/agents.tsv [--arrete 2026-10-31] [--essai] [--force]
 *
 * Colonnes attendues : Matricule, Prénom, Nom, Fonction, Rôle (AV/CEV/CS),
 * Date d'embauche (JJ/MM/AAAA), Jours pris (cumulés), Jours acquis, Jours restants.
 *
 * --arrete : date jusqu'à laquelle le tableau a été arrêté (jours acquis
 *            comptés jusqu'à ce mois inclus). Sert à contrôler le tableau.
 * --essai  : contrôle et affiche le résumé sans rien écrire.
 * --force  : autorise à écraser le cumul « jours pris » d'un agent qui a
 *            déjà posé des congés dans l'application (risque de double compte).
 */
import { ecrireDocumentForce, lireDocument } from "../lib/storage";
import { ajouterJours, CONFIG, joursAcquis, strToDate, type Agent, type Registre, type Role } from "../lib/conges";
import { argument, argumentsPositionnels, arreter, dateIso, drapeau, entier, lireTableau, nettoyer } from "./outils";

const [fichier] = argumentsPositionnels();
if (!fichier) arreter("Usage : npm run importer:agents -- <fichier.tsv> [--arrete AAAA-MM-JJ] [--essai] [--force]");

const arrete = argument("--arrete") ?? "2026-10-31";
const lendemainArrete = ajouterJours(strToDate(dateIso(arrete)), 1);
const essai = drapeau("--essai");
const force = drapeau("--force");

const lignes = lireTableau(fichier);
const entete = lignes[0].map((c) => nettoyer(c).toLowerCase());
if (!entete[0]?.startsWith("matricule")) arreter(`Première colonne inattendue : « ${lignes[0][0]} » (attendu : Matricule).`);

const erreurs: string[] = [];
const alertes: string[] = [];
const importes = new Map<string, { agent: Omit<Agent, "historique" | "demandes" | "auth">; empreinte: string }>();

lignes.slice(1).forEach((cols, i) => {
  const n = i + 2; // numéro de ligne dans le fichier
  try {
    const matricule = nettoyer(cols[0]);
    if (!/^[A-Za-z0-9]+$/.test(matricule)) throw new Error(`matricule invalide « ${cols[0]} »`);
    const role = nettoyer(cols[4]).toUpperCase();
    if (!["AV", "CEV", "CS"].includes(role)) throw new Error(`rôle inconnu « ${cols[4]} »`);

    const agent = {
      matricule,
      prenom: nettoyer(cols[1]),
      nom: nettoyer(cols[2]),
      fonction: nettoyer(cols[3]),
      role: role as Role,
      date_embauche: dateIso(cols[5]),
      jours_pris_reprise: entier(cols[6], "Jours pris")
    };
    const acquisTableau = entier(cols[7], "Jours acquis");
    const restantTableau = entier(cols[8], "Jours restants");

    const acquisCalcule = joursAcquis(agent.date_embauche, lendemainArrete);
    if (acquisCalcule !== acquisTableau) {
      alertes.push(`ligne ${n} (${matricule}) : jours acquis ${acquisTableau} dans le tableau, ${acquisCalcule} selon la règle de ${CONFIG.JOURS_ACQUIS_PAR_MOIS} j/mois au ${arrete}`);
    }
    if (acquisTableau - agent.jours_pris_reprise !== restantTableau) {
      alertes.push(`ligne ${n} (${matricule}) : acquis − pris ≠ restant (${acquisTableau} − ${agent.jours_pris_reprise} ≠ ${restantTableau})`);
    }
    if (restantTableau < 0) alertes.push(`ligne ${n} (${matricule}) : solde négatif (${restantTableau} j)`);
    if (!agent.prenom || !agent.nom) throw new Error("prénom ou nom vide");

    const empreinte = JSON.stringify(agent);
    const existant = importes.get(matricule);
    if (existant) {
      if (existant.empreinte === empreinte) alertes.push(`ligne ${n} (${matricule}) : doublon identique ignoré`);
      else throw new Error(`matricule ${matricule} présent deux fois avec des données différentes`);
      return;
    }
    importes.set(matricule, { agent, empreinte });
  } catch (e) {
    erreurs.push(`ligne ${n} : ${(e as Error).message}`);
  }
});

if (erreurs.length) arreter(`Import annulé, rien n'a été écrit :\n  - ${erreurs.join("\n  - ")}`);

async function main() {
const actuel = (await lireDocument<Registre>())?.data;
const registre: Registre =
  actuel?.version === 2 ? actuel : { version: 2, date_reprise: dateIso(arrete), agents: {}, admins: {} };
registre.date_reprise = dateIso(arrete);

let crees = 0;
let misAJour = 0;
for (const [matricule, { agent }] of importes) {
  const existant = Object.hasOwn(registre.agents, matricule) ? registre.agents[matricule] : null;
  if (!existant) {
    registre.agents[matricule] = { ...agent, historique: [], demandes: [] };
    crees++;
    continue;
  }
  const aDesVoeux = existant.demandes.some((d) => d.statut !== "supprime");
  if (aDesVoeux && existant.jours_pris_reprise !== agent.jours_pris_reprise && !force) {
    arreter(
      `${matricule} a déjà déposé des vœux dans l'application : remplacer son cumul « jours pris » ` +
        `(${existant.jours_pris_reprise} → ${agent.jours_pris_reprise}) risque de les compter deux fois. ` +
        `Relancer avec --force seulement si le nouveau cumul les exclut.`
    );
  }
  // On garde l'historique et le code d'accès, on met à jour l'identité et le cumul.
  registre.agents[matricule] = { ...existant, ...agent };
  misAJour++;
}

const absents = Object.keys(registre.agents).filter((m) => !importes.has(m));

console.log(`\nAgents lus : ${importes.size} (${crees} nouveaux, ${misAJour} mis à jour)`);
const parRole = [...importes.values()].reduce<Record<string, number>>((acc, { agent }) => {
  acc[agent.role] = (acc[agent.role] ?? 0) + 1;
  return acc;
}, {});
console.log(`Par rôle : ${Object.entries(parRole).map(([r, c]) => `${r} ${c}`).join(", ")}`);
if (absents.length) console.log(`⚠ Présents dans le registre mais absents du fichier (conservés) : ${absents.join(", ")}`);
if (alertes.length) console.log(`\n⚠ ${alertes.length} alerte(s) :\n  - ${alertes.join("\n  - ")}`);

if (essai) {
  console.log("\nMode --essai : rien n'a été écrit.\n");
} else {
  await ecrireDocumentForce(registre);
  console.log(`\n✔ Registre enregistré (${Object.keys(registre.agents).length} agents).\n`);
}
}

main();
