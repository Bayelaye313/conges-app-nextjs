import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { modifierDocument } from "@/lib/storage";
import type { Registre } from "@/lib/conges";
import {
  adresseIp,
  exigerSession,
  hacherCode,
  noterEchec,
  poserCookieSession,
  tentativesBloquees,
  trouverCompte,
  validerNouveauCode,
  verifierCode,
  type Compte
} from "@/lib/auth";
import { erreur, lireCorps, refusSession } from "@/lib/api";

const Corps = z.object({
  ancien: z.string().min(1).max(128),
  nouveau: z.string().min(1).max(128)
});

/** Changement du code d'accès (obligatoire à la première connexion). */
export async function POST(req: NextRequest) {
  const session = await exigerSession(req, { autoriserCodeProvisoire: true });
  if (!session.ok) return refusSession(session);

  const corps = await lireCorps(req, Corps);
  if (!corps.ok) return corps.reponse;
  const { ancien, nouveau } = corps.data;
  const matricule = session.compte.matricule;
  const ip = adresseIp(req);

  if (await tentativesBloquees(matricule, ip)) {
    return erreur(429, "Trop de tentatives. Réessayez dans 15 minutes.");
  }
  if (!(await verifierCode(ancien, session.compte.auth!.hash))) {
    await noterEchec(matricule, ip);
    return erreur(401, "Code actuel incorrect.");
  }
  const invalide = validerNouveauCode(nouveau, matricule);
  if (invalide) return erreur(422, invalide);
  if (nouveau === ancien) return erreur(422, "Le nouveau code doit être différent de l'ancien.");

  const auth = { hash: await hacherCode(nouveau), doit_changer: false, modifie_le: new Date().toISOString() };
  const compte = await modifierDocument<Registre, Compte | null>((registre) => {
    const c = trouverCompte(registre, matricule);
    if (!c) return { ecrire: false, resultat: null };
    if (c.type === "agent") c.agent.auth = auth;
    else c.admin.auth = auth;
    return { ecrire: true, resultat: { ...c, auth } };
  });
  if (!compte) return erreur(401, "Session expirée. Reconnectez-vous.");

  // Le changement invalide les autres sessions ; on reconnecte celle-ci.
  const res = NextResponse.json({ ok: true, type: compte.type });
  poserCookieSession(res, compte);
  return res;
}
