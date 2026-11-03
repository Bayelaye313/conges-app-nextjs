import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  aujourdhuiUTC,
  chargerRegistre,
  CONFIG,
  construirePeriodes,
  joursAcquis,
  joursPris,
  soumettreDemande,
  strToDate,
  trouverAgent,
  verifierDemande
} from "@/lib/conges";
import { exigerAgent } from "@/lib/auth";
import { erreur, lireCorps, refusSession } from "@/lib/api";

const Corps = z.object({
  annee: z.number().int().min(2000).max(2100),
  mois: z.number().int().min(1).max(12),
  nbParties: z.union([z.literal(1), z.literal(2)]),
  nbJours: z.number().int().min(1).max(CONFIG.MAX_DAYS),
  partieChoisie: z.enum(["debut", "fin"]).optional(),
  confirmer: z.boolean().optional()
});

export async function POST(req: NextRequest) {
  const session = await exigerAgent(req);
  if (!session.ok) return refusSession(session);

  const corps = await lireCorps(req, Corps);
  if (!corps.ok) return corps.reponse;
  const { annee, mois, nbParties, nbJours, partieChoisie, confirmer } = corps.data;

  const construction = construirePeriodes(annee, mois, nbParties, nbJours, partieChoisie);
  if (construction.status === "erreur") return erreur(422, construction.message);
  const periodes = construction.periodes;

  if (confirmer) {
    const resultat = await soumettreDemande(session.compte.matricule, periodes);
    return NextResponse.json({ ok: resultat.succes, message: resultat.message }, { status: resultat.succes ? 200 : 422 });
  }

  // Aperçu : mêmes vérifications que la soumission, sans rien enregistrer.
  const registre = await chargerRegistre();
  const agent = trouverAgent(registre, session.compte.matricule)!;
  const verif = verifierDemande(registre, agent, periodes, aujourdhuiUTC());
  if (!verif.ok) return erreur(422, verif.message);

  const depart = strToDate(periodes[0].debut);
  return NextResponse.json({
    ok: true,
    apercu: true,
    periodes,
    nbJours,
    soldeAuDepart: joursAcquis(agent.date_embauche, depart) - joursPris(agent)
  });
}
