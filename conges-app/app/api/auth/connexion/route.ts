import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { chargerRegistre } from "@/lib/conges";
import {
  adresseIp,
  noterEchec,
  obtenirHashFactice,
  poserCookieSession,
  reinitialiserEchecs,
  tentativesBloquees,
  trouverCompte,
  verifierCode
} from "@/lib/auth";
import { erreur, lireCorps } from "@/lib/api";

const Corps = z.object({
  matricule: z.string().trim().min(1).max(20),
  code: z.string().min(1).max(128)
});

export async function POST(req: NextRequest) {
  const corps = await lireCorps(req, Corps);
  if (!corps.ok) return corps.reponse;
  const { matricule, code } = corps.data;
  const ip = adresseIp(req);

  if (await tentativesBloquees(matricule, ip)) {
    return erreur(429, "Trop de tentatives. Réessayez dans 15 minutes.");
  }

  const compte = trouverCompte(await chargerRegistre(), matricule);
  // Même message et même coût de calcul que le matricule existe ou non.
  const valide = await verifierCode(code, compte?.auth?.hash ?? (await obtenirHashFactice()));
  if (!compte?.auth || !valide) {
    await noterEchec(matricule, ip);
    return erreur(401, "Matricule ou code incorrect.");
  }

  await reinitialiserEchecs(matricule);
  const res = NextResponse.json({ ok: true, doitChangerCode: compte.auth.doit_changer, type: compte.type });
  poserCookieSession(res, compte);
  return res;
}
