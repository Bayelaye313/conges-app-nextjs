import { NextRequest, NextResponse } from "next/server";
import {
  aujourdhuiUTC,
  chargerRegistre,
  CONFIG,
  dateToStr,
  LIBELLES_ROLE,
  occupationParQuinzaine
} from "@/lib/conges";
import { exigerAgent } from "@/lib/auth";
import { refusSession } from "@/lib/api";

/** Places restantes par quinzaine pour le rôle de l'agent connecté (16 quinzaines). */
export async function GET(req: NextRequest) {
  const session = await exigerAgent(req);
  if (!session.ok) return refusSession(session);
  const role = session.compte.agent.role;

  return NextResponse.json({
    ok: true,
    role,
    libelleRole: LIBELLES_ROLE[role],
    plafond: CONFIG.PLAFONDS[role],
    minJours: CONFIG.MIN_DAYS,
    quinzaines: occupationParQuinzaine(await chargerRegistre(), role, dateToStr(aujourdhuiUTC()), 16)
  });
}
