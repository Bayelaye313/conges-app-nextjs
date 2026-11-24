import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { exigerAdmin } from "@/lib/auth";
import { erreur, lireCorps, refusSession } from "@/lib/api";
import { mettreAJourInfosAgent } from "@/lib/admin";
import { trouverAgent, type Registre } from "@/lib/conges";
import { modifierDocument } from "@/lib/storage";

const dateISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});

const Corps = z.object({
  matricule: z.string().min(1).max(20),
  nouveau_matricule: z.string().regex(/^[A-Za-z0-9]{1,20}$/),
  prenom: z.string().trim().min(1).max(100),
  nom: z.string().trim().min(1).max(100),
  fonction: z.string().trim().min(1).max(100),
  role: z.enum(["AV", "CEV", "CS"]),
  date_embauche: dateISO,
  jours_pris_reprise: z.number().int().min(0).max(9999),
  dernier_conge_debut: dateISO.nullable(),
  dernier_conge_retour: dateISO.nullable()
}).strict();

/** Mise à jour des informations RH d'un agent par l'administration. */
export async function POST(req: NextRequest) {
  const session = await exigerAdmin(req);
  if (!session.ok) return refusSession(session);
  const corps = await lireCorps(req, Corps);
  if (!corps.ok) return corps.reponse;

  const { matricule, nouveau_matricule, ...autresInfos } = corps.data;
  const resultat = await modifierDocument<Registre, { message: string; ok: boolean }>((registre) => {
    const agent = trouverAgent(registre, matricule);
    if (!agent) return { ecrire: false, resultat: { ok: false, message: "Matricule inconnu." } };
    if (nouveau_matricule !== matricule && Object.hasOwn(registre.agents, nouveau_matricule)) {
      return { ecrire: false, resultat: { ok: false, message: "Ce nouveau matricule est déjà attribué." } };
    }

    const message = mettreAJourInfosAgent(agent, { ...autresInfos, matricule: nouveau_matricule });
    if (message) return { ecrire: false, resultat: { ok: false, message } };
    if (nouveau_matricule !== matricule) {
      delete registre.agents[matricule];
      registre.agents[nouveau_matricule] = agent;
    }
    return { ecrire: true, resultat: { ok: true, message: "Informations de l’agent mises à jour." } };
  });

  return resultat.ok
    ? NextResponse.json(resultat)
    : erreur(resultat.message === "Matricule inconnu." ? 404 : 422, resultat.message);
}
