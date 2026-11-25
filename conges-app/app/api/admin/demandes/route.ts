import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CONFIG, traiterDemande } from "@/lib/conges";
import { exigerAdmin } from "@/lib/auth";
import { lireCorps, refusSession } from "@/lib/api";

const Corps = z.object({
  matricule: z.string().min(1).max(20),
  id: z.string().uuid(),
  action: z.enum(["valider", "supprimer", "scinder_recuperation", "changer_type"]),
  motif: z.string().trim().max(200).optional(),
  periodeIndex: z.number().int().min(0).max(1).optional(),
  typeCible: z.enum(["conge", "recuperation"]).optional(),
  joursCible: z.number().int().min(CONFIG.MIN_DAYS).max(CONFIG.MAX_DAYS).optional()
}).refine((corps) => corps.action !== "scinder_recuperation" || corps.periodeIndex !== undefined, {
  path: ["periodeIndex"],
  message: "Sélectionnez une période à convertir."
}).refine((corps) => corps.action !== "scinder_recuperation" || corps.joursCible !== undefined, {
  path: ["joursCible"],
  message: "Indiquez le nombre total de jours souhaité pour la période convertie."
}).refine((corps) => corps.action !== "changer_type" || corps.typeCible !== undefined, {
  path: ["typeCible"],
  message: "Sélectionnez le nouveau type de demande."
}).refine((corps) => corps.action !== "changer_type" || corps.typeCible !== "conge" || corps.joursCible !== undefined, {
  path: ["joursCible"],
  message: "Indiquez le nombre total de jours souhaité pour le congé."
});

/** Validation ou suppression d'un vœu. */
export async function POST(req: NextRequest) {
  const session = await exigerAdmin(req);
  if (!session.ok) return refusSession(session);
  const corps = await lireCorps(req, Corps);
  if (!corps.ok) return corps.reponse;
  const { matricule, id, action, motif, periodeIndex, typeCible, joursCible } = corps.data;

  const r = await traiterDemande(session.compte.matricule, matricule, id, action, motif || undefined, periodeIndex, typeCible, joursCible);
  return NextResponse.json({ ok: r.succes, message: r.message }, { status: r.succes ? 200 : 422 });
}
