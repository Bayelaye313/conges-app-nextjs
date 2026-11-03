import { NextRequest, NextResponse } from "next/server";
import { aujourdhuiUTC, CONFIG, vuePublique } from "@/lib/conges";
import { exigerAgent } from "@/lib/auth";
import { refusSession } from "@/lib/api";

/** Dossier de l'agent connecté. */
export async function GET(req: NextRequest) {
  const session = await exigerAgent(req);
  if (!session.ok) return refusSession(session);

  return NextResponse.json({
    ok: true,
    agent: vuePublique(session.compte.agent, aujourdhuiUTC()),
    minJours: CONFIG.MIN_DAYS,
    delaiMois: CONFIG.DELAI_MOIS,
    plafond: CONFIG.PLAFONDS[session.compte.agent.role]
  });
}
