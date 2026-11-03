import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { traiterDemande } from "@/lib/conges";
import { exigerAdmin } from "@/lib/auth";
import { lireCorps, refusSession } from "@/lib/api";

const Corps = z.object({
  matricule: z.string().min(1).max(20),
  id: z.string().uuid(),
  action: z.enum(["valider", "supprimer"]),
  motif: z.string().trim().max(200).optional()
});

/** Validation ou suppression d'un vœu. */
export async function POST(req: NextRequest) {
  const session = await exigerAdmin(req);
  if (!session.ok) return refusSession(session);
  const corps = await lireCorps(req, Corps);
  if (!corps.ok) return corps.reponse;
  const { matricule, id, action, motif } = corps.data;

  const r = await traiterDemande(session.compte.matricule, matricule, id, action, motif || undefined);
  return NextResponse.json({ ok: r.succes, message: r.message }, { status: r.succes ? 200 : 422 });
}
