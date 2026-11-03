"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Info,
  KeyRound,
  Loader2,
  LogOut,
  Palmtree,
  Scale,
  TriangleAlert,
  UserRound,
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
  primaire: "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
  secondaire: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900",
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
    "inline-flex items-center justify-center rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
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
  return <div {...props} className={cx("rounded-2xl border border-slate-200 bg-white shadow-card", className)} />;
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
  ton = "brand"
}: {
  titre: string;
  valeur: React.ReactNode;
  detail?: React.ReactNode;
  icone?: LucideIcon;
  ton?: "brand" | "emerald" | "amber" | "rose" | "slate";
}) {
  const tons = {
    brand: "bg-brand-50 text-brand-600",
    emerald: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    slate: "bg-slate-100 text-slate-600"
  };
  return (
    <Carte className="p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{titre}</p>
        {Icone && (
          <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", tons[ton])}>
            <Icone className="h-5 w-5" aria-hidden />
          </span>
        )}
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{valeur}</p>
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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {surtitre && <p className="text-sm font-semibold text-brand-600">{surtitre}</p>}
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{titre}</h1>
        {description && <div className="mt-2 max-w-2xl text-base text-slate-600">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Chargement({ texte }: { texte: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-slate-500">
      <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-hidden />
      <p className="text-base">{texte}</p>
    </div>
  );
}

export function EcranErreur({ message }: { message: string }) {
  const router = useRouter();
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Carte className="w-full max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 text-rose-600">
          <AlertCircle className="h-6 w-6" aria-hidden />
        </span>
        <p role="alert" className="mt-4 text-base text-slate-700">{message}</p>
        <Bouton className="mt-6" onClick={() => router.replace("/")}>Retour à l&apos;accueil</Bouton>
      </Carte>
    </main>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-elevated">
        <Palmtree className="h-5 w-5" aria-hidden />
      </span>
      <span className="text-base font-bold tracking-tight text-slate-900">Mes Congés</span>
    </span>
  );
}

const NAV_AGENT = [
  { href: "/dashboard", libelle: "Mon espace", icone: UserRound },
  { href: "/planning", libelle: "Disponibilités", icone: CalendarDays },
  { href: "/legal", libelle: "Cadre légal", icone: Scale }
];

export function BarreNavigation({ admin = false }: { admin?: boolean }) {
  const router = useRouter();
  const chemin = usePathname();

  async function deconnecter() {
    await fetch("/api/auth/deconnexion", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  }

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href={admin ? "/admin" : "/dashboard"}><Logo /></Link>
        {!admin && (
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_AGENT.map(({ href, libelle, icone: Icone }) => (
              <Link
                key={href}
                href={href}
                className={cx(
                  "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
                  chemin === href ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                <Icone className="h-4 w-4" aria-hidden />
                {libelle}
              </Link>
            ))}
          </nav>
        )}
        {admin && (
          <span className="hidden rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 sm:inline">
            Administration
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Link href="/compte" className={classesBouton("fantome", "sm")} title="Changer mon code">
            <KeyRound className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Mon code</span>
          </Link>
          <button onClick={deconnecter} className={classesBouton("fantome", "sm")} title="Se déconnecter">
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Déconnexion</span>
          </button>
        </div>
      </div>
      {!admin && (
        <nav className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 md:hidden">
          {NAV_AGENT.map(({ href, libelle, icone: Icone }) => (
            <Link
              key={href}
              href={href}
              className={cx(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold",
                chemin === href ? "bg-brand-50 text-brand-700" : "text-slate-600"
              )}
            >
              <Icone className="h-4 w-4" aria-hidden />
              {libelle}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
