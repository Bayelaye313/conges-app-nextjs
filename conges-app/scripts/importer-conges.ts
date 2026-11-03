/**
 * Import des congés déjà pris ou planifiés hors application (ex. 2026), pour
 * que le délai de 12 mois, les chevauchements et les plafonds en tiennent compte.
 *
 *   npm run importer:conges -- data/import/conges-2026.tsv [--retour reprise|dernier-jour] [--essai]
 *
 * Colonnes : Matricule, [Nom de l'agent], Date de départ, Date de retour
 * (JJ/MM/AAAA). La colonne du nom est facultative. Les lignes sans dates sont
 * ignorées (agents sans congé connu). Un agent peut avoir plusieurs lignes.
 *
 * --retour reprise (défaut) : la date de retour est le jour de reprise du
 *                             service → dernier jour de congé = retour − 1.
 * --retour dernier-jour     : la date de retour est le dernier jour de congé.
 * --ignorer-inconnus        : ignore (en le signalant) un matricule absent du
 *                             tableau des agents au lieu d'annuler l'import.
 *
 * Ces congés sont déjà inclus dans le cumul « jours pris » du tableau RH :
 * ils ne sont PAS débités une seconde fois du solde.
 * L'import est tout ou rien : à la moindre erreur, rien n'est écrit.
 */
import { compterJoursDecomptes } from "../lib/calendrier";
import {
  ajouterJours,
  CONFIG,
  absentsQuinzaine,
  dateToStr,
  LIBELLES_ROLE,
  libelleQuinzaine,
  quinzainesEntre,
  strToDate,
  trouverAgent,
  type Registre,
  type Role
} from "../lib/conges";
import { ecrireDocumentForce, lireDocument } from "../lib/storage";
import { argument, argumentsPositionnels, arreter, dateIso, drapeau, lireTableau, nettoyer } from "./outils";

async function main() {
  const [fichier] = argumentsPositionnels();
  const modeRetour = argument("--retour") ?? "reprise";
  if (!fichier || (modeRetour !== "reprise" && modeRetour !== "dernier-jour")) {
    arreter("Usage : npm run importer:conges -- <fichier> [--retour reprise|dernier-jour] [--essai]");
  }
  const essai = drapeau("--essai");
  const ignorerInconnus = drapeau("--ignorer-inconnus");

  const registre = (await lireDocument<Registre>())?.data;
  if (!registre || registre.version !== 2) arreter("Registre absent ou ancien : lancer d'abord importer:agents.");

  const lignes = lireTableau(fichier);
  const debutDonnees = /^\s*mat/i.test(lignes[0][0]) ? 1 : 0;

  const erreurs: string[] = [];
  const alertes: string[] = [];
  const sansDate: string[] = [];
  let ajoutes = 0;
  let dejaPresents = 0;

  lignes.slice(debutDonnees).forEach((brut, i) => {
    const n = i + 1 + debutDonnees;
    // Avec ou sans colonne « nom » : les deux dernières colonnes non vides sont les dates.
    const cols = brut.map(nettoyer);
    const matricule = cols[0];
    const dates = cols.slice(1).filter((c) => /\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2}/.test(c));
    try {
      const agent = trouverAgent(registre, matricule);
      if (!agent && ignorerInconnus) {
        alertes.push(`ligne ${n} : matricule ${matricule} inconnu, ligne ignorée`);
        return;
      }
      if (!agent) throw new Error(`matricule ${matricule} inconnu (absent du tableau des agents)`);
      if (dates.length === 0) {
        sansDate.push(matricule);
        return;
      }
      if (dates.length !== 2) throw new Error(`${matricule} : il faut une date de départ ET une date de retour`);

      const debut = dateIso(dates[0]);
      const retour = dateIso(dates[1]);
      const fin = modeRetour === "reprise" ? dateToStr(ajouterJours(strToDate(retour), -1)) : retour;
      if (fin < debut) throw new Error(`${matricule} : retour (${dates[1]}) avant le départ (${dates[0]})`);
      const jours = compterJoursDecomptes(debut, fin);

      if (agent.historique.some((h) => h.debut === debut && h.fin === fin)) {
        dejaPresents++;
        return;
      }
      const conflit = agent.historique.find((h) => !(fin < h.debut || debut > h.fin));
      if (conflit) throw new Error(`${matricule} : ${debut}→${fin} chevauche ${conflit.debut}→${conflit.fin}`);
      agent.historique.push({ debut, fin, jours });
      ajoutes++;
    } catch (e) {
      erreurs.push(`ligne ${n} : ${(e as Error).message}`);
    }
  });

  if (erreurs.length) arreter(`Import annulé, rien n'a été écrit :\n  - ${erreurs.join("\n  - ")}`);

  // Contrôle des plafonds par quinzaine (constat sur le passé : simple alerte).
  const toutes = Object.values(registre.agents).flatMap((a) => a.historique);
  if (toutes.length) {
    const min = toutes.reduce((m, p) => (p.debut < m ? p.debut : m), toutes[0].debut);
    const max = toutes.reduce((m, p) => (p.fin > m ? p.fin : m), toutes[0].fin);
    for (const q of quinzainesEntre(min, max)) {
      for (const role of ["AV", "CEV"] as Role[]) {
        const plafond = CONFIG.PLAFONDS[role]!;
        const nb = absentsQuinzaine(registre, role, q).size;
        if (nb > plafond) alertes.push(`${libelleQuinzaine(q)} : ${nb} ${LIBELLES_ROLE[role].toLowerCase()} absents (plafond ${plafond})`);
      }
    }
  }

  const absentsDuFichier = Object.values(registre.agents).filter((a) => a.historique.length === 0);
  console.log(`\nCongés ajoutés : ${ajoutes}${dejaPresents ? ` (${dejaPresents} déjà présents, ignorés)` : ""}`);
  console.log(`Lignes sans dates : ${sansDate.length} (${sansDate.join(", ")})`);
  console.log(`Agents sans aucun congé connu : ${absentsDuFichier.length} → ${absentsDuFichier.map((a) => a.matricule).join(", ")}`);
  if (alertes.length) console.log(`\n⚠ ${alertes.length} alerte(s) :\n  - ${alertes.join("\n  - ")}`);

  if (essai) {
    console.log("\nMode --essai : rien n'a été écrit.\n");
  } else {
    await ecrireDocumentForce(registre);
    console.log("\n✔ Registre enregistré.\n");
  }
}

main();
