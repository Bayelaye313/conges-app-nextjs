import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  aujourdhuiUTC,
  chargerRegistre,
  CONFIG,
  construirePeriodes,
  projeterSolde,
  soumettreDemande,
  trouverAgent,
  verifierDemande
} from "@/lib/conges";
import { detailDecompte } from "@/lib/calendrier";
import { exigerAgent } from "@/lib/auth";
import { erreur, lireCorps, refusSession } from "@/lib/api";

const Choix = z.object({
  annee: z.number().int().min(2000).max(2100),
  mois: z.number().int().min(1).max(12),
  partie: z.enum(["debut", "fin"]),
  nbJours: z.number().int().min(1).max(CONFIG.MAX_DAYS)
});

const Corps = z.object({
  periodes: z.array(Choix).min(1).max(2),
  confirmer: z.boolean().optional()
});

export async function POST(req: NextRequest) {
  const session = await exigerAgent(req);
  if (!session.ok) return refusSession(session);

  const corps = await lireCorps(req, Corps);
  if (!corps.ok) return corps.reponse;
  const { confirmer } = corps.data;

  const construction = construirePeriodes(corps.data.periodes);
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

  const soldes = projeterSolde(agent, periodes).filter((s) => s.nouvelle);
  return NextResponse.json({
    ok: true,
    apercu: true,
    nbJours: periodes.reduce((s, p) => s + p.jours, 0),
    periodes: periodes.map((p, i) => {
      const d = detailDecompte(p.debut, p.fin);
      return {
        ...p,
        calendaires: d.calendaires,
        dimanches: d.dimanches,
        feries: d.feries,
        soldeAvant: soldes[i].avant,
        soldeApres: soldes[i].apres
      };
    })
  });
}
