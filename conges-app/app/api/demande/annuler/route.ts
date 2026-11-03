import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { annulerDemande } from "@/lib/conges";
import { exigerAgent } from "@/lib/auth";
import { lireCorps, refusSession } from "@/lib/api";

const Corps = z.object({ id: z.string().uuid() });

/** L'agent retire un vœu encore en attente. */
export async function POST(req: NextRequest) {
  const session = await exigerAgent(req);
  if (!session.ok) return refusSession(session);
  const corps = await lireCorps(req, Corps);
  if (!corps.ok) return corps.reponse;

  const r = await annulerDemande(session.compte.matricule, corps.data.id);
  return NextResponse.json({ ok: r.succes, message: r.message }, { status: r.succes ? 200 : 422 });
}
