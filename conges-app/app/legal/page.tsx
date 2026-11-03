"use client";

import { useState } from "react";
import Link from "next/link";
import { REPERES_LEGAUX_SENEGAL, estimerJoursLegauxAnnuels } from "@/lib/droitTravail";

function Bloc({ titre, points }: { titre: string; points: readonly string[] }) {
  return (
    <div className="card rounded-card px-6 py-5">
      <h2 className="font-display text-xl text-parchemin-50">{titre}</h2>
      <ul className="mt-3 space-y-2">
        {points.map((p, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-parchemin-100/80">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cachet" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function LegalPage() {
  const [anciennete, setAnciennete] = useState(6);
  const [enfants, setEnfants] = useState(0);
  const estimation = estimerJoursLegauxAnnuels(anciennete, enfants);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <Link href="/dashboard" className="eyebrow text-parchemin-100/40 hover:text-parchemin-100/70">
        ← Retour au dossier
      </Link>

      <p className="eyebrow mt-6 text-cachet-light">Cadre légal</p>
      <h1 className="font-display text-3xl font-semibold text-parchemin-50">
        Congés payés — droit du travail sénégalais
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-parchemin-100/70">
        Ce qui suit est un repère informatif, reformulé à partir de sources spécialisées en droit
        social, pour aider les agents à comprendre le cadre général. Il ne remplace pas le texte de
        loi ni la convention collective applicable, qui peuvent prévoir des dispositions plus
        favorables.
      </p>

      <div className="mt-8 space-y-5">
        <Bloc {...REPERES_LEGAUX_SENEGAL.droitBase} />
        <Bloc {...REPERES_LEGAUX_SENEGAL.regimesParticuliers} />
        <Bloc {...REPERES_LEGAUX_SENEGAL.priseDesConges} />
        <Bloc {...REPERES_LEGAUX_SENEGAL.articulationAvecCeService} />
      </div>

      <section className="mt-10 card rounded-card px-6 py-6">
        <h2 className="font-display text-xl text-parchemin-50">Estimation indicative de vos droits</h2>
        <p className="mt-1 text-xs text-parchemin-100/50">
          Approximation pédagogique — le calcul réel se fait mois de service par mois de service.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="eyebrow text-parchemin-100/50">Ancienneté (années)</span>
            <input
              type="number"
              min={0}
              value={anciennete}
              onChange={(e) => setAnciennete(Number(e.target.value))}
              className="mt-2 w-full rounded-card border border-encre-700 bg-encre-900 px-4 py-2 font-mono text-parchemin-50"
            />
          </label>
          <label className="block">
            <span className="eyebrow text-parchemin-100/50">Enfants à charge (&lt; 14 ans)</span>
            <input
              type="number"
              min={0}
              value={enfants}
              onChange={(e) => setEnfants(Number(e.target.value))}
              className="mt-2 w-full rounded-card border border-encre-700 bg-encre-900 px-4 py-2 font-mono text-parchemin-50"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap gap-4 font-mono text-sm text-parchemin-100/70">
          <span>Base : {estimation.base} j</span>
          <span>+ Ancienneté : {estimation.majorationAnciennete} j</span>
          <span>+ Enfants : {estimation.majorationEnfants} j</span>
          <span className="font-semibold text-cachet-light">
            = {estimation.total} jours ouvrables / an
          </span>
        </div>
      </section>

      <p className="mt-8 text-xs text-parchemin-100/40">
        Sources : {REPERES_LEGAUX_SENEGAL.texteReference} ; {REPERES_LEGAUX_SENEGAL.texteComplementaire}.
      </p>
    </main>
  );
}
