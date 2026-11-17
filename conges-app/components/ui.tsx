"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Info,
  KeyRound,
  Loader2,
  LogOut,
  Menu,
  Palmtree,
  Scale,
  TriangleAlert,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import { STATUTS_VOEU } from "@/lib/client";

// Petits composants d'interface dans l'esprit de shadcn/ui : une seule source
// pour les boutons, cartes, badges et messages, afin que toutes les pages
// partagent le même langage visuel.

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

type Variante = "primaire" | "secondaire" | "fantome" | "danger" | "succes";

const VARIANTES: Record<Variante, string> = {
  primaire: "bg-brand-600 text-white shadow-sm shadow-brand-900/10 hover:bg-brand-700",
  secondaire: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900",
  fantome: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  danger: "text-rose-600 hover:bg-rose-50",
  succes: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700"
};

const TAILLES = {
  sm: "h-9 gap-1.5 px-3 text-sm",
  md: "h-11 gap-2 px-4 text-[15px]",
  lg: "h-12 gap-2 px-6 text-base"
};

export function classesBouton(variante: Variante = "primaire", taille: keyof typeof TAILLES = "md", extra?: string) {
  return cx(
    "inline-flex items-center justify-center rounded-lg font-semibold transition duration-150 disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTES[variante],
    TAILLES[taille],
    extra
  );
}

export function Bouton({
  variante,
  taille,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; taille?: keyof typeof TAILLES }) {
  return <button {...props} className={classesBouton(variante, taille, className)} />;
}

export function Carte({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("rounded-xl border border-slate-100 bg-white shadow-card", className)} />;
}

export function BadgeStatut({ statut }: { statut: string }) {
  const s = STATUTS_VOEU[statut];
  return (
    <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", s.classe)}>
      {s.libelle}
    </span>
  );
}

const ALERTES = {
  erreur: { icone: AlertCircle, classe: "border-rose-200 bg-rose-50 text-rose-800" },
  succes: { icone: CheckCircle2, classe: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  info: { icone: Info, classe: "border-brand-200 bg-brand-50 text-brand-900" },
  attention: { icone: TriangleAlert, classe: "border-amber-200 bg-amber-50 text-amber-900" }
};

export function Alerte({
  type = "info",
  children,
  className,
  role
}: {
  type?: keyof typeof ALERTES;
  children: React.ReactNode;
  className?: string;
  role?: string;
}) {
  const { icone: Icone, classe } = ALERTES[type];
  return (
    <div role={role ?? (type === "erreur" ? "alert" : undefined)} className={cx("flex gap-3 rounded-xl border px-4 py-3 text-[15px]", classe, className)}>
      <Icone className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Indicateur({
  titre,
  valeur,
  detail,
  icone: Icone,
  ton = "brand",
  children
}: {
  titre: string;
  valeur: React.ReactNode;
  detail?: React.ReactNode;
  icone?: LucideIcon;
  ton?: "brand" | "emerald" | "amber" | "rose" | "slate";
  children?: React.ReactNode;
}) {
  const tons = {
    brand: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-100 text-slate-600"
  };
  return (
    <Carte className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{titre}</p>
        {Icone && (
          <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tons[ton])}>
            <Icone className="h-[18px] w-[18px]" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-1.5 text-[1.75rem] font-bold leading-tight tracking-tight text-slate-900">{valeur}</p>
      {children}
      {detail && <p className="mt-1 text-sm text-slate-500">{detail}</p>}
    </Carte>
  );
}

export function EnTete({ surtitre, titre, description, actions }: {
  surtitre?: string;
  titre: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {surtitre && <p className="text-xs font-bold uppercase tracking-[0.12em] text-brand-600">{surtitre}</p>}
        <h1 className="mt-1 text-[1.75rem] font-bold leading-tight tracking-tight text-slate-900 sm:text-3xl">{titre}</h1>
        {description && <div className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-slate-600">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Chargement({ texte }: { texte: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden />
      <p className="text-[15px]">{texte}</p>
    </div>
  );
}

export function EcranErreur({ message }: { message: string }) {
  const router = useRouter();
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Carte className="w-full max-w-md p-6 text-center sm:p-7">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertCircle className="h-6 w-6" aria-hidden />
        </span>
        <p role="alert" className="mt-4 text-base text-slate-700">{message}</p>
        <Bouton className="mt-6" onClick={() => router.replace("/")}>Retour à l&apos;accueil</Bouton>
      </Carte>
    </main>
  );
}

export function Logo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-elevated">
        <Palmtree className="h-5 w-5" aria-hidden />
      </span>
      <span className={cx("text-base font-bold tracking-tight", inverse ? "text-white" : "text-slate-900")}>Mes Congés</span>
    </span>
  );
}

const NAV_AGENT = [
  { href: "/dashboard", libelle: "Mon espace", icone: UserRound },
  { href: "/planning", libelle: "Disponibilités", icone: CalendarDays },
  { href: "/legal", libelle: "Cadre légal", icone: Scale }
];

export function BarreNavigation({ admin = false, children }: { admin?: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const chemin = usePathname();
  const [menuOuvert, setMenuOuvert] = useState(false);

  useEffect(() => setMenuOuvert(false), [chemin]);

  async function deconnecter() {
    await fetch("/api/auth/deconnexion", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  }

  const liens = admin
    ? [{ href: "/admin", libelle: "Tableau de bord", icone: CalendarDays }]
    : NAV_AGENT;

  const contenuMenu = (
    <div className="flex h-full flex-col gap-6 p-4">
      <Link href={admin ? "/admin" : "/dashboard"} className="flex flex-col gap-2.5 px-2 pt-2">
        <Logo inverse />
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
          <span aria-hidden className="h-1 w-4 rounded-full bg-amber-400" />
          {admin ? "Administration" : "Espace agents de terrain"}
        </span>
      </Link>

      <nav aria-label="Navigation principale" className="flex flex-col gap-1">
        <span className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">
          Navigation
        </span>
        {liens.map(({ href, libelle, icone: Icone }) => {
          const actif = chemin === href || (href !== "/dashboard" && chemin.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              aria-current={actif ? "page" : undefined}
              className={cx(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
                actif
                  ? "bg-brand-600/15 text-white shadow-[inset_0_0_0_1px_rgb(52_196_124/0.25)]"
                  : "text-white/60 hover:bg-white/5 hover:text-white"
              )}
            >
              {actif && (
                <span aria-hidden className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-emerald-400 shadow-[0_0_12px_rgb(52_196_124/0.7)]" />
              )}
              <Icone className={cx("h-5 w-5", actif ? "text-emerald-400" : "text-white/50 group-hover:text-white/80")} aria-hidden />
              {libelle}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white ring-2 ring-white/10">
            <UserRound className="h-4 w-4" aria-hidden />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-semibold text-white">{admin ? "Administration" : "Espace agent"}</span>
            <span className="block text-xs text-white/50">Gestion des congés</span>
          </span>
        </div>
        <Link href="/compte" className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">
          <KeyRound className="h-4 w-4" aria-hidden />
          Changer mon code
        </Link>
        <button onClick={deconnecter} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/10 hover:text-white">
          <LogOut className="h-4 w-4" aria-hidden />
          Déconnexion
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-white/5 bg-[#052e1c] bg-[radial-gradient(30rem_20rem_at_0%_0%,rgb(0_136_75/0.25),transparent_60%),linear-gradient(to_bottom,#052e1c,#0a3f27)] lg:block print:hidden">
        {contenuMenu}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-[#052e1c] px-4 text-white lg:hidden print:hidden">
        <button
          onClick={() => setMenuOuvert(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={menuOuvert}
          className="grid h-9 w-9 place-items-center rounded-lg text-white/80 transition hover:bg-white/10"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Link href={admin ? "/admin" : "/dashboard"} className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white">
            <Palmtree className="h-4 w-4" aria-hidden />
          </span>
          <span className="text-sm font-bold text-white">Mes Congés</span>
        </Link>
      </header>

      {menuOuvert && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu de navigation">
          <button
            aria-label="Fermer le menu"
            onClick={() => setMenuOuvert(false)}
            className="absolute inset-0 cursor-default bg-[#052e1c]/60 backdrop-blur-sm"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-[#052e1c] bg-[linear-gradient(to_bottom,#052e1c,#0a3f27)]">
            <button
              onClick={() => setMenuOuvert(false)}
              aria-label="Fermer le menu"
              className="absolute right-3 top-4 z-10 grid h-9 w-9 place-items-center rounded-xl text-white/60 transition hover:bg-white/10"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
            {contenuMenu}
          </aside>
        </div>
      )}
      <div className="min-h-[calc(100vh-3.5rem)] lg:ml-64 lg:min-h-screen">{children}</div>
    </div>
  );
}
