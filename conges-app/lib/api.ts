import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { z } from "zod";
import type { ResultatSession } from "./auth";

/** Réponse d'erreur homogène pour toutes les routes. */
export function erreur(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, message, ...extra }, { status });
}

export function refusSession(session: Exclude<ResultatSession, { ok: true }>) {
  return erreur(session.status, session.message, session.doitChangerCode ? { doitChangerCode: true } : {});
}

/**
 * Lit et valide le corps JSON. Exiger `Content-Type: application/json`
 * empêche un site tiers de déclencher la requête via un simple formulaire
 * (protection CSRF complémentaire du cookie SameSite=Lax).
 */
export async function lireCorps<T>(
  req: NextRequest,
  schema: z.ZodType<T>
): Promise<{ ok: true; data: T } | { ok: false; reponse: NextResponse }> {
  if (!req.headers.get("content-type")?.startsWith("application/json")) {
    return { ok: false, reponse: erreur(415, "Format de requête non pris en charge.") };
  }
  const brut = await req.json().catch(() => undefined);
  const resultat = schema.safeParse(brut);
  if (!resultat.success) {
    return { ok: false, reponse: erreur(400, "Requête invalide.") };
  }
  return { ok: true, data: resultat.data };
}
