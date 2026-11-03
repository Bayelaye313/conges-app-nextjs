"use client";

type Routeur = { replace: (href: string) => void };

export class RedirectionEnCours extends Error {}

/**
 * fetch JSON côté navigateur. Session absente → page de connexion ; code
 * provisoire non encore changé → page /compte. Lève RedirectionEnCours dans
 * ces deux cas, et Error (message lisible) en cas de panne réseau.
 */
export async function appelApi<T = Record<string, unknown>>(
  routeur: Routeur,
  url: string,
  corps?: unknown
): Promise<{ status: number; data: T & { ok: boolean; message?: string } }> {
  let res: Response;
  try {
    res = await fetch(
      url,
      corps === undefined
        ? { cache: "no-store" }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }
    );
  } catch {
    throw new Error("Impossible de contacter le registre. Vérifiez votre connexion et réessayez.");
  }
  const data = await res.json().catch(() => ({ ok: false, message: "Réponse inattendue du serveur." }));
  if (res.status === 401) {
    routeur.replace("/");
    throw new RedirectionEnCours();
  }
  if (res.status === 403 && data.doitChangerCode) {
    routeur.replace("/compte");
    throw new RedirectionEnCours();
  }
  return { status: res.status, data };
}

export const MOIS_NOMS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
];

export function formatFr(dateStr: string): string {
  const [y, m, j] = dateStr.split("-").map(Number);
  return `${String(j).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
}

/** Date de retour (reprise du service) = lendemain du dernier jour de congé. */
export function dateRetour(fin: string): string {
  const d = new Date(`${fin}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function moisAnnee(dateStr: string): string {
  const [y, m] = dateStr.split("-").map(Number);
  return `${MOIS_NOMS[m - 1]} ${y}`;
}

export const STATUTS_VOEU: Record<string, { libelle: string; classe: string }> = {
  en_attente: { libelle: "En attente", classe: "bg-amber-50 text-amber-700 ring-amber-600/20" },
  valide: { libelle: "Validé", classe: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  supprime: { libelle: "Supprimé", classe: "bg-rose-50 text-rose-700 ring-rose-600/20" }
};
