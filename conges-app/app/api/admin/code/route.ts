import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { modifierDocument } from "@/lib/storage";
import { trouverAgent, type Registre } from "@/lib/conges";
import { exigerAdmin, genererCodeProvisoire, hacherCode } from "@/lib/auth";
import { erreur, lireCorps, refusSession } from "@/lib/api";

const Corps = z.object({ matricule: z.string().min(1).max(20) });

/**
 * Nouveau code provisoire pour un agent (code oublié, première distribution).
 * Le code n'est affiché qu'une fois, à l'admin, qui le transmet à l'agent.
 */
export async function POST(req: NextRequest) {
  const session = await exigerAdmin(req);
  if (!session.ok) return refusSession(session);
  const corps = await lireCorps(req, Corps);
  if (!corps.ok) return corps.reponse;

  const code = genererCodeProvisoire();
  const auth = { hash: await hacherCode(code), doit_changer: true, modifie_le: new Date().toISOString() };
  const resultat = await modifierDocument<Registre, "ok" | "inconnu" | "desactive">((registre) => {
    const agent = trouverAgent(registre, corps.data.matricule);
    if (!agent) return { ecrire: false, resultat: "inconnu" };
    if (agent.desactive) return { ecrire: false, resultat: "desactive" };
    agent.auth = auth;
    return { ecrire: true, resultat: "ok" };
  });
  if (resultat === "inconnu") return erreur(404, "Matricule inconnu.");
  if (resultat === "desactive") return erreur(422, "Ce compte agent est désactivé.");
  return NextResponse.json({ ok: true, code });
}
