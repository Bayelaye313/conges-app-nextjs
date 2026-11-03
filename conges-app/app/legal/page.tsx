"use client";

import { useState } from "react";
import { Calculator, CheckCircle2 } from "lucide-react";
import { BarreNavigation, Carte, EnTete } from "@/components/ui";
import { REPERES_LEGAUX_SENEGAL, estimerJoursLegauxAnnuels } from "@/lib/droitTravail";

function Bloc({ titre, points }: { titre: string; points: readonly string[] }) {
  return (
    <Carte className="p-5">
      <h2 className="text-base font-bold text-slate-900">{titre}</h2>
      <ul className="mt-3 space-y-2.5">
        {points.map((p, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-slate-700">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" aria-hidden />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </Carte>
  );
}

export default function LegalPage() {
  const [anciennete, setAnciennete] = useState(6);
  const [enfants, setEnfants] = useState(0);
  const estimation = estimerJoursLegauxAnnuels(anciennete, enfants);

  return (
    <>
      <BarreNavigation />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        <EnTete
          surtitre="Cadre légal"
          titre="Congés payés — droit du travail sénégalais"
          description="Ce qui suit est un repère informatif, reformulé à partir de sources spécialisées en droit social, pour aider les agents à comprendre le cadre général. Il ne remplace pas le texte de loi ni la convention collective applicable, qui peuvent prévoir des dispositions plus favorables."
        />

        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Bloc {...REPERES_LEGAUX_SENEGAL.droitBase} />
            <Bloc {...REPERES_LEGAUX_SENEGAL.regimesParticuliers} />
            <Bloc {...REPERES_LEGAUX_SENEGAL.priseDesConges} />
            <Bloc {...REPERES_LEGAUX_SENEGAL.articulationAvecCeService} />
          </div>

          <aside className="lg:sticky lg:top-20 lg:self-start">
            <Carte className="p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Calculator className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="mt-3 text-base font-bold text-slate-900">Estimez vos droits</h2>
              <p className="mt-1 text-sm text-slate-500">
                Approximation pédagogique — le calcul réel se fait mois de service par mois de service.
              </p>

              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="libelle">Ancienneté (années)</span>
                  <input type="number" min={0} value={anciennete} onChange={(e) => setAnciennete(Number(e.target.value))} className="champ" />
                </label>
                <label className="block">
                  <span className="libelle">Enfants à charge (&lt; 14 ans)</span>
                  <input type="number" min={0} value={enfants} onChange={(e) => setEnfants(Number(e.target.value))} className="champ" />
                </label>
              </div>

              <dl className="mt-5 space-y-1.5 border-t border-slate-100 pt-4 text-sm tabular-nums">
                <div className="flex justify-between text-slate-600"><dt>Base</dt><dd className="font-semibold text-slate-900">{estimation.base} j</dd></div>
                <div className="flex justify-between text-slate-600"><dt>+ Ancienneté</dt><dd className="font-semibold text-slate-900">{estimation.majorationAnciennete} j</dd></div>
                <div className="flex justify-between text-slate-600"><dt>+ Enfants</dt><dd className="font-semibold text-slate-900">{estimation.majorationEnfants} j</dd></div>
              </dl>
              <div className="mt-4 rounded-xl bg-brand-600 px-4 py-3 text-white">
                <p className="text-sm text-brand-100">Total estimé</p>
                <p className="text-xl font-bold">{estimation.total} jours ouvrables / an</p>
              </div>
            </Carte>
          </aside>
        </div>

        <p className="mt-6 text-sm text-slate-500">
          Sources : {REPERES_LEGAUX_SENEGAL.texteReference} ; {REPERES_LEGAUX_SENEGAL.texteComplementaire}.
        </p>
      </main>
    </>
  );
}
