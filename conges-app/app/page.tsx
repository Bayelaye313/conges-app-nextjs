"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, Loader2, Lock, Palmtree, ShieldCheck, UserRound, Wallet } from "lucide-react";
import { Alerte, Bouton, Logo } from "@/components/ui";

const ATOUTS = [
  { icone: Wallet, titre: "Votre solde en temps réel", texte: "Jours acquis, jours pris et projection mois par mois." },
  { icone: CalendarCheck2, titre: "Des places visibles", texte: "Choisissez une quinzaine en voyant les places restantes." },
  { icone: ShieldCheck, titre: "Équitable et transparent", texte: "Les mêmes règles s'appliquent à tous les agents." }
];

export default function LoginPage() {
  const router = useRouter();
  const [matricule, setMatricule] = useState("");
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState("");
  const [chargement, setChargement] = useState(false);

  async function ouvrirDossier(e: React.FormEvent) {
    e.preventDefault();
    setErreur("");
    setChargement(true);
    try {
      const res = await fetch("/api/auth/connexion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matricule: matricule.trim(), code })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setErreur(data.message ?? "Connexion impossible.");
        setCode("");
        setChargement(false);
        return;
      }
      router.push(data.doitChangerCode ? "/compte" : data.type === "admin" ? "/admin" : "/dashboard");
    } catch {
      setErreur("Impossible de contacter le registre. Réessayez.");
      setChargement(false);
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />

        <div className="relative flex items-center gap-2.5 text-lg font-bold">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <Palmtree className="h-5 w-5" aria-hidden />
          </span>
          Mes Congés
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-extrabold leading-tight tracking-tight">
            Préparez vos congés en toute sérénité.
          </h2>
          <p className="mt-4 text-lg text-brand-100">
            Consultez vos droits et déposez vos vœux en quelques clics, depuis le terrain ou depuis chez vous.
          </p>
          <ul className="mt-10 space-y-5">
            {ATOUTS.map(({ icone: Icone, titre, texte }) => (
              <li key={titre} className="flex gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
                  <Icone className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">{titre}</p>
                  <p className="text-[15px] text-brand-100">{texte}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-brand-200">Service de terrain — campagne des vœux de congé</p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden"><Logo /></div>

          <h1 className="mt-8 text-3xl font-bold tracking-tight text-slate-900 lg:mt-0">Bonjour 👋</h1>
          <p className="mt-2 text-base text-slate-600">
            Connectez-vous avec votre matricule et votre code d&apos;accès pour accéder à votre espace.
          </p>

          <form onSubmit={ouvrirDossier} className="mt-8 space-y-5">
            <label className="block">
              <span className="libelle">Matricule</span>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-4 top-1/2 mt-[3px] h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  autoFocus
                  autoComplete="username"
                  inputMode="numeric"
                  value={matricule}
                  onChange={(e) => setMatricule(e.target.value)}
                  placeholder="ex. 0291"
                  className="champ pl-12 text-lg tracking-wide"
                />
              </div>
            </label>

            <label className="block">
              <span className="libelle">Code d&apos;accès</span>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 mt-[3px] h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  type="password"
                  autoComplete="current-password"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="••••••••"
                  className="champ pl-12 text-lg tracking-wide"
                />
              </div>
            </label>

            {erreur && <Alerte type="erreur">{erreur}</Alerte>}

            <Bouton
              type="submit"
              taille="lg"
              className="w-full"
              disabled={chargement || matricule.trim().length === 0 || code.length === 0}
            >
              {chargement && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
              {chargement ? "Vérification…" : "Se connecter"}
            </Bouton>
          </form>

          <p className="mt-8 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600">
            Code oublié ? Adressez-vous à l&apos;administration pour obtenir un nouveau code provisoire.
          </p>
        </div>
      </section>
    </main>
  );
}
