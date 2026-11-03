import { NextRequest, NextResponse } from "next/server";
import { aujourdhuiUTC, chargerRegistre, dateToStr } from "@/lib/conges";
import { exportAgents, exportRegistre, exportVoeux } from "@/lib/admin";
import { exigerAdmin } from "@/lib/auth";
import { erreur, refusSession } from "@/lib/api";

/** Téléchargement : ?type=voeux | agents (CSV Excel) | registre (sauvegarde JSON). */
export async function GET(req: NextRequest) {
  const session = await exigerAdmin(req);
  if (!session.ok) return refusSession(session);

  const type = req.nextUrl.searchParams.get("type");
  const registre = await chargerRegistre();
  const aujourdHui = aujourdhuiUTC();
  const jour = dateToStr(aujourdHui);

  let contenu: string;
  let nom: string;
  let mime = "text/csv; charset=utf-8";
  if (type === "voeux") {
    contenu = exportVoeux(registre);
    nom = `voeux-conges-${jour}.csv`;
  } else if (type === "agents") {
    contenu = exportAgents(registre, aujourdHui);
    nom = `agents-soldes-${jour}.csv`;
  } else if (type === "registre") {
    contenu = exportRegistre(registre);
    nom = `registre-conges-${jour}.json`;
    mime = "application/json; charset=utf-8";
  } else {
    return erreur(400, "Type d'export inconnu.");
  }

  return new NextResponse(contenu, {
    headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="${nom}"` }
  });
}
