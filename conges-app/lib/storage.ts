import fs from "fs";
import path from "path";
import { createHash } from "crypto";

/**
 * Deux stockages possibles pour le registre (un seul document JSON) :
 * - "fichier" (par défaut) : data/registre.json — développement, VPS, scripts.
 * - "blobs" (CONGES_STOCKAGE=blobs) : Netlify Blobs — production sur Netlify,
 *   où le disque n'est pas persistant et où plusieurs instances tournent.
 *
 * Les écritures sont conditionnelles (version lue = version courante), avec
 * nouvelle tentative : deux soumissions simultanées ne peuvent jamais
 * s'écraser, même sur plusieurs instances.
 */

const CLE_REGISTRE = "registre.json";
const NOM_STORE = "conges";

export class RegistreIllisibleError extends Error {}
export class ConflitEcritureError extends Error {}

interface Lu<T> {
  data: T;
  version: string;
}

interface Backend {
  lire<T>(cle: string): Promise<Lu<T> | null>;
  /** Écrit si la version courante vaut `versionAttendue` (null = la clé ne doit pas exister). */
  ecrire<T>(cle: string, data: T, versionAttendue: string | null): Promise<boolean>;
  supprimer(cle: string): Promise<void>;
}

// -------------------- FICHIER --------------------
export function dossierDonnees(): string {
  return process.env.CONGES_DATA_DIR || path.join(process.cwd(), "data");
}

function empreinte(texte: string): string {
  return createHash("sha256").update(texte).digest("hex");
}

/** Verrou en mémoire : rend lecture-comparaison-écriture atomique dans ce processus. */
let fileAttente: Promise<unknown> = Promise.resolve();
function avecVerrou<T>(fn: () => T | Promise<T>): Promise<T> {
  const resultat = fileAttente.then(fn, fn);
  fileAttente = resultat.catch(() => undefined);
  return resultat;
}

const backendFichier: Backend = {
  async lire<T>(cle: string) {
    const fp = path.join(dossierDonnees(), cle);
    if (!fs.existsSync(fp)) return null;
    const brut = fs.readFileSync(fp, "utf-8");
    try {
      return { data: JSON.parse(brut) as T, version: empreinte(brut) };
    } catch (e) {
      throw new RegistreIllisibleError(
        `Le fichier ${fp} est illisible (${(e as Error).message}). Restaurer ${cle}.bak.`
      );
    }
  },

  ecrire<T>(cle: string, data: T, versionAttendue: string | null) {
    return avecVerrou(() => {
      const dir = dossierDonnees();
      fs.mkdirSync(path.dirname(path.join(dir, cle)), { recursive: true });
      const fp = path.join(dir, cle);
      const existe = fs.existsSync(fp);
      const versionCourante = existe ? empreinte(fs.readFileSync(fp, "utf-8")) : null;
      if (versionCourante !== versionAttendue) return false;

      const tmp = `${fp}.${process.pid}.${Date.now()}.tmp`;
      const fd = fs.openSync(tmp, "w", 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify(data, null, 2), "utf-8");
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      if (existe) fs.copyFileSync(fp, `${fp}.bak`);
      fs.renameSync(tmp, fp); // opération atomique
      return true;
    });
  },

  async supprimer(cle: string) {
    fs.rmSync(path.join(dossierDonnees(), cle), { force: true });
  }
};

// -------------------- NETLIFY BLOBS --------------------
const DELAI_BLOBS_MS = 8000;

/**
 * fetch avec délai maximal : un appel à Netlify Blobs qui ne répond pas
 * devient une erreur explicite au lieu de bloquer la fonction jusqu'au
 * 504 de Netlify. Les appels lents ou en échec sont journalisés.
 */
const fetchAvecDelai: typeof fetch = async (entree, init) => {
  const debut = Date.now();
  const methode = init?.method ?? "GET";
  const url = String(entree instanceof Request ? entree.url : entree).replace(/\?.*$/, "");
  try {
    const res = await fetch(entree, { ...init, cache: "no-store", signal: AbortSignal.timeout(DELAI_BLOBS_MS) });
    const duree = Date.now() - debut;
    if (duree > 1500 || res.status >= 500) console.warn(`[blobs] ${methode} ${url} → ${res.status} en ${duree} ms`);
    return res;
  } catch (e) {
    console.error(`[blobs] ${methode} ${url} → échec après ${Date.now() - debut} ms : ${(e as Error).message}`);
    throw e;
  }
};

async function storeBlobs() {
  const { getStore } = await import("@netlify/blobs");
  // Hors de Netlify (scripts locaux), il faut l'identifiant du site et un jeton.
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN;
  return siteID && token
    ? getStore({ name: NOM_STORE, siteID, token, consistency: "strong", fetch: fetchAvecDelai })
    : getStore({ name: NOM_STORE, consistency: "strong", fetch: fetchAvecDelai });
}

const backendBlobs: Backend = {
  async lire<T>(cle: string) {
    const store = await storeBlobs();
    const r = await store.getWithMetadata(cle, { type: "json", consistency: "strong" });
    if (!r) return null;
    return { data: r.data as T, version: r.etag ?? "" };
  },

  async ecrire<T>(cle: string, data: T, versionAttendue: string | null) {
    const store = await storeBlobs();
    const r = await store.setJSON(
      cle,
      data,
      versionAttendue === null ? { onlyIfNew: true } : { onlyIfMatch: versionAttendue }
    );
    return r.modified;
  },

  async supprimer(cle: string) {
    const store = await storeBlobs();
    await store.delete(cle);
  }
};

export function typeStockage(): "fichier" | "blobs" {
  return process.env.CONGES_STOCKAGE === "blobs" ? "blobs" : "fichier";
}

function backend(): Backend {
  return typeStockage() === "blobs" ? backendBlobs : backendFichier;
}

// -------------------- API GENERIQUE --------------------
export async function lireDocument<T>(cle: string = CLE_REGISTRE): Promise<Lu<T> | null> {
  return backend().lire<T>(cle);
}

/** Écriture inconditionnelle (scripts d'administration : import, publication). */
export async function ecrireDocumentForce<T>(data: T, cle: string = CLE_REGISTRE): Promise<void> {
  for (let i = 0; i < 5; i++) {
    const actuel = await backend().lire<T>(cle).catch(() => null);
    if (await backend().ecrire(cle, data, actuel?.version ?? null)) return;
  }
  throw new ConflitEcritureError("Écriture impossible : le registre change sans arrêt.");
}

/**
 * Lit le document, applique `modifier`, réécrit si personne n'a écrit
 * entre-temps ; sinon recommence avec la nouvelle version. `modifier` peut
 * renvoyer { ecrire: false } pour ne rien enregistrer (demande refusée…).
 */
export async function modifierDocument<T, R>(
  modifier: (doc: T) => { ecrire: boolean; resultat: R } | Promise<{ ecrire: boolean; resultat: R }>,
  cle: string = CLE_REGISTRE
): Promise<R> {
  for (let tentative = 0; tentative < 8; tentative++) {
    const lu = await backend().lire<T>(cle);
    if (!lu) throw new Error(`Document ${cle} introuvable.`);
    const { ecrire, resultat } = await modifier(lu.data);
    if (!ecrire) return resultat;
    if (await backend().ecrire(cle, lu.data, lu.version)) return resultat;
    await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * (tentative + 1)));
  }
  throw new ConflitEcritureError("Trop de modifications simultanées, réessayez dans un instant.");
}

export async function supprimerDocument(cle: string): Promise<void> {
  return backend().supprimer(cle);
}
