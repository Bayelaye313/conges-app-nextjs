import { NextRequest, NextResponse } from "next/server";
import { aujourdhuiUTC, chargerRegistre, CONFIG } from "@/lib/conges";
import { construireSynthese } from "@/lib/admin";
import { exigerAdmin } from "@/lib/auth";
import { refusSession } from "@/lib/api";

export async function GET(req: NextRequest) {
  const session = await exigerAdmin(req);
  if (!session.ok) return refusSession(session);
  return NextResponse.json({
    ok: true,
    admin: { matricule: session.compte.matricule, nom: session.compte.admin.nom },
    minJours: CONFIG.MIN_DAYS,
    plafonds: CONFIG.PLAFONDS,
    ...construireSynthese(await chargerRegistre(), aujourdhuiUTC())
  });
}
