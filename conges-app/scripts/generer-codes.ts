/**
 * Génère des codes d'accès provisoires, à remettre en main propre.
 * Chaque titulaire doit choisir son propre code dès sa première connexion.
 *
 *   npm run codes:generer                                 → agents qui n'ont encore aucun code
 *   npm run codes:generer -- --matricule 0291             → réinitialise un agent
 *   npm run codes:generer -- --tous                       → réinitialise tous les agents
 *   npm run codes:generer -- --admin 0568 --nom "Prénom Nom" → crée/réinitialise un administrateur
 *   npm run codes:generer -- --role CEV,CS --code IcanPass2026 → même code provisoire pour tous les CEV et CS
 *
 * --role AV|CEV|CS (liste séparée par des virgules) réinitialise tous les agents de ces rôles.
 * --code X impose un code provisoire commun au lieu d'un code aléatoire par
 * personne ; chacun reste obligé de le remplacer à sa première connexion.
 *
 * Une fois l'application en ligne, l'admin peut aussi générer un code depuis
 * son tableau de bord (onglet Agents → « nouveau code »).
 *
 * Les codes en clair sont écrits UNE SEULE FOIS dans data/import/codes-*.csv
 * (lisible uniquement par l'utilisateur courant). Supprimer ce fichier dès
 * que les codes ont été distribués : le registre ne garde que leur empreinte.
 */
import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { dossierDonnees, lireDocument, modifierDocument } from "../lib/storage";
import { trouverAdmin, trouverAgent, type AuthCompte, type Registre, type Role } from "../lib/conges";
import { CODE_MIN_LONGUEUR, genererCodeProvisoire, hacherCode } from "../lib/auth";
import { argument, arreter, drapeau } from "./outils";

async function main() {
  const registre = (await lireDocument<Registre>())?.data;
  if (!registre) arreter("Registre introuvable : lancer d'abord importer:agents.");

  const matricule = argument("--matricule");
  const admin = argument("--admin");
  const codeCommun = argument("--code");
  if (codeCommun !== undefined && codeCommun.length < CODE_MIN_LONGUEUR) {
    arreter(`Le code commun doit contenir au moins ${CODE_MIN_LONGUEUR} caractères.`);
  }
  const rolesArg = argument("--role");
  const roles = rolesArg?.split(",").map((r) => r.trim().toUpperCase()) as Role[] | undefined;
  if (roles?.some((r) => !["AV", "CEV", "CS"].includes(r))) arreter("--role accepte AV, CEV, CS (séparés par des virgules).");
  type Cible = { matricule: string; prenom: string; nom: string; fonction: string; admin: boolean };
  let cibles: Cible[];

  if (admin) {
    if (trouverAgent(registre, admin)) arreter(`${admin} est un agent : un administrateur doit avoir un matricule distinct.`);
    const nom = argument("--nom") ?? trouverAdmin(registre, admin)?.nom;
    if (!nom) arreter('Préciser le nom de l\'administrateur : --nom "Prénom Nom".');
    cibles = [{ matricule: admin, prenom: "", nom, fonction: "ADMINISTRATEUR", admin: true }];
  } else if (matricule) {
    const agent = trouverAgent(registre, matricule);
    if (!agent) arreter(`Matricule ${matricule} inconnu.`);
    cibles = [{ ...agent, admin: false }];
  } else if (roles) {
    cibles = Object.values(registre.agents)
      .filter((a) => roles.includes(a.role))
      .map((a) => ({ ...a, admin: false }));
  } else {
    cibles = Object.values(registre.agents)
      .filter((a) => drapeau("--tous") || !a.auth)
      .map((a) => ({ ...a, admin: false }));
  }
  if (cibles.length === 0) {
    console.log("Tous les agents ont déjà un code. Utiliser --matricule X pour en réinitialiser un.");
    return;
  }

  const lignes = ["Matricule;Prénom;Nom;Fonction;Code provisoire"];
  const maintenant = new Date().toISOString();
  const auths = new Map<string, AuthCompte>();
  for (const c of cibles.sort((a, b) => a.matricule.localeCompare(b.matricule))) {
    const code = codeCommun ?? genererCodeProvisoire();
    // Un hash (sel) distinct par compte, même avec un code commun.
    auths.set(c.matricule, { hash: await hacherCode(code), doit_changer: true, modifie_le: maintenant });
    lignes.push([c.matricule, c.prenom, c.nom, c.fonction, code].join(";"));
  }

  // Fichier écrit AVANT le registre : si l'écriture échoue, aucun code n'est perdu.
  const horodatage = `${maintenant.slice(0, 19).replace(/[-:T]/g, "")}-${randomBytes(2).toString("hex")}`;
  const sortie = path.join(dossierDonnees(), "import", `codes-provisoires-${horodatage}.csv`);
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  fs.writeFileSync(sortie, "\uFEFF" + lignes.join("\n") + "\n", { encoding: "utf-8", mode: 0o600, flag: "wx" });


  // Le hachage prend plusieurs secondes : on applique les codes sur la
  // version la plus récente du registre pour ne rien écraser.
  await modifierDocument<Registre, void>((frais) => {
    frais.admins ??= {};
    for (const c of cibles) {
      const auth = auths.get(c.matricule)!;
      if (c.admin) frais.admins[c.matricule] = { matricule: c.matricule, nom: c.nom, auth };
      else trouverAgent(frais, c.matricule)!.auth = auth;
    }
    return { ecrire: true, resultat: undefined };
  });

  console.log(`\n✔ ${cibles.length} code(s) provisoire(s) générés → ${sortie}`);
  console.log("  Les sessions ouvertes de ces comptes sont fermées.");
  console.log("  ⚠ Distribuer les codes puis SUPPRIMER ce fichier.\n");
}

main();
