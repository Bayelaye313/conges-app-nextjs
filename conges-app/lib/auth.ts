import { createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import type { NextRequest, NextResponse } from "next/server";
import { chargerRegistre, trouverAdmin, trouverAgent, type Admin, type Agent, type AuthCompte } from "./conges";
import { lireDocument, modifierDocument, ecrireDocumentForce } from "./storage";

export type TypeCompte = "agent" | "admin";

/** Un compte de connexion : agent (vœux de congé) ou administrateur. */
export type Compte =
  | { type: "agent"; matricule: string; auth?: AuthCompte; agent: Agent }
  | { type: "admin"; matricule: string; auth?: AuthCompte; admin: Admin };

export function trouverCompte(registre: Parameters<typeof trouverAgent>[0], matricule: string): Compte | null {
  const admin = trouverAdmin(registre, matricule);
  if (admin) return { type: "admin", matricule, auth: admin.auth, admin };
  const agent = trouverAgent(registre, matricule);
  if (agent) return { type: "agent", matricule, auth: agent.auth, agent };
  return null;
}

const scryptAsync = promisify(scrypt) as (
  code: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 64;

export const COOKIE_SESSION = "conges_session";
export const DUREE_SESSION_S = 8 * 60 * 60; // une journée de travail

export const CODE_MIN_LONGUEUR = 8;

// -------------------- CODES D'ACCES --------------------
export async function hacherCode(code: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(code, salt, KEYLEN, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifierCode(code: string, stocke: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stocke.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const attendu = Buffer.from(hashB64, "base64");
  const calcule = await scryptAsync(code, Buffer.from(saltB64, "base64"), attendu.length, SCRYPT);
  return calcule.length === attendu.length && timingSafeEqual(calcule, attendu);
}

/** Hash factice pour que la réponse prenne le même temps, matricule connu ou non. */
let hashFactice: Promise<string> | null = null;
export function obtenirHashFactice(): Promise<string> {
  hashFactice ??= hacherCode(randomBytes(12).toString("hex"));
  return hashFactice;
}

/** Code provisoire lisible (sans 0/O, 1/I/l), à transmettre à l'agent. */
export function genererCodeProvisoire(longueur = 10): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < longueur; i++) code += alphabet[randomInt(alphabet.length)];
  return code;
}

export function validerNouveauCode(code: string, matricule: string): string | null {
  if (code.length < CODE_MIN_LONGUEUR) {
    return `Le code doit contenir au moins ${CODE_MIN_LONGUEUR} caractères.`;
  }
  if (code.length > 128) return "Le code est trop long.";
  if (code.includes(matricule)) return "Le code ne doit pas contenir votre matricule.";
  if (/^(\d)\1+$/.test(code) || /^(0123456789|123456789|12345678)/.test(code)) {
    return "Ce code est trop facile à deviner.";
  }
  return null;
}

// -------------------- SESSION (cookie signé HMAC) --------------------
let secretDev: Buffer | null = null;
function secretSession(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return Buffer.from(s, "utf-8");
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET manquant ou trop court (32 caractères minimum).");
  }
  // En développement : secret aléatoire, les sessions sont perdues au redémarrage.
  secretDev ??= randomBytes(32);
  return secretDev;
}

function signer(payload: string): string {
  return createHmac("sha256", secretSession()).update(payload).digest("base64url");
}

interface ContenuSession {
  m: string; // matricule
  r: TypeCompte;
  v: string; // version du code (auth.modifie_le) : changer le code déconnecte partout
  exp: number; // epoch secondes
}

export function creerJetonSession(compte: Compte): string {
  const contenu: ContenuSession = {
    m: compte.matricule,
    r: compte.type,
    v: compte.auth?.modifie_le ?? "",
    exp: Math.floor(Date.now() / 1000) + DUREE_SESSION_S
  };
  const payload = Buffer.from(JSON.stringify(contenu)).toString("base64url");
  return `${payload}.${signer(payload)}`;
}

export function lireJetonSession(jeton: string | undefined): ContenuSession | null {
  if (!jeton) return null;
  const [payload, sig] = jeton.split(".");
  if (!payload || !sig) return null;
  const attendu = Buffer.from(signer(payload));
  const recu = Buffer.from(sig);
  if (attendu.length !== recu.length || !timingSafeEqual(attendu, recu)) return null;
  try {
    const contenu = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as ContenuSession;
    if (typeof contenu.m !== "string" || typeof contenu.exp !== "number") return null;
    if (contenu.r !== "agent" && contenu.r !== "admin") return null;
    if (contenu.exp < Math.floor(Date.now() / 1000)) return null;
    return contenu;
  } catch {
    return null;
  }
}

export function poserCookieSession(res: NextResponse, compte: Compte): void {
  res.cookies.set(COOKIE_SESSION, creerJetonSession(compte), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_INSECURE !== "1",
    sameSite: "lax",
    path: "/",
    maxAge: DUREE_SESSION_S
  });
}

export function effacerCookieSession(res: NextResponse): void {
  res.cookies.set(COOKIE_SESSION, "", { httpOnly: true, path: "/", maxAge: 0 });
}

type Refus = { ok: false; status: 401 | 403; message: string; doitChangerCode?: boolean };
export type ResultatSession<C extends Compte = Compte> = ({ ok: true } & { compte: C }) | Refus;

/**
 * Identifie le compte à partir du cookie de session. C'est la SEULE source
 * d'identité côté serveur : on n'accepte jamais un matricule venant du
 * corps de la requête ou de l'URL.
 */
export async function exigerSession(
  req: NextRequest,
  options: { autoriserCodeProvisoire?: boolean } = {}
): Promise<ResultatSession> {
  const expiree: Refus = { ok: false, status: 401, message: "Session expirée. Reconnectez-vous." };
  const contenu = lireJetonSession(req.cookies.get(COOKIE_SESSION)?.value);
  if (!contenu) return expiree;

  const compte = trouverCompte(await chargerRegistre(), contenu.m);
  if (!compte?.auth || compte.type !== contenu.r || compte.auth.modifie_le !== contenu.v) return expiree;
  if (compte.auth.doit_changer && !options.autoriserCodeProvisoire) {
    return { ok: false, status: 403, message: "Vous devez d'abord choisir votre code personnel.", doitChangerCode: true };
  }
  return { ok: true, compte };
}

export async function exigerAgent(req: NextRequest): Promise<ResultatSession<Extract<Compte, { type: "agent" }>>> {
  const s = await exigerSession(req);
  if (!s.ok) return s;
  if (s.compte.type !== "agent") return { ok: false, status: 403, message: "Réservé aux agents." };
  return { ok: true, compte: s.compte };
}

export async function exigerAdmin(req: NextRequest): Promise<ResultatSession<Extract<Compte, { type: "admin" }>>> {
  const s = await exigerSession(req);
  if (!s.ok) return s;
  if (s.compte.type !== "admin") return { ok: false, status: 403, message: "Réservé à l'administration." };
  return { ok: true, compte: s.compte };
}

// -------------------- LIMITATION DES TENTATIVES --------------------
const MAX_ECHECS_MATRICULE = 5;
const MAX_ECHECS_IP = 50; // plusieurs agents peuvent partager la même connexion (agence, 4G)
const BLOCAGE_MS = 15 * 60 * 1000;

/**
 * Compteurs d'échecs stockés avec le registre (document séparé) : sur
 * Netlify, chaque requête peut tomber sur une instance différente, un
 * compteur en mémoire ne suffirait pas.
 */
const CLE_ECHECS = "echecs.json";
type Echecs = Record<string, { nb: number; depuis: number }>;

function estBloque(echecs: Echecs, cle: string, max: number, maintenant: number): boolean {
  const e = Object.hasOwn(echecs, cle) ? echecs[cle] : undefined;
  return !!e && maintenant - e.depuis <= BLOCAGE_MS && e.nb >= max;
}

export function adresseIp(req: NextRequest): string {
  // Netlify fournit l'IP réelle ; sinon reverse proxy (X-Forwarded-For).
  return (
    req.headers.get("x-nf-client-connection-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "inconnue"
  );
}

export async function tentativesBloquees(matricule: string, ip: string, maintenant = Date.now()): Promise<boolean> {
  const echecs = (await lireDocument<Echecs>(CLE_ECHECS))?.data ?? {};
  return (
    estBloque(echecs, `m:${matricule}`, MAX_ECHECS_MATRICULE, maintenant) ||
    estBloque(echecs, `ip:${ip}`, MAX_ECHECS_IP, maintenant)
  );
}

async function modifierEchecs(fn: (e: Echecs) => boolean): Promise<void> {
  if (!(await lireDocument<Echecs>(CLE_ECHECS))) await ecrireDocumentForce<Echecs>({}, CLE_ECHECS);
  await modifierDocument<Echecs, void>((e) => ({ ecrire: fn(e), resultat: undefined }), CLE_ECHECS);
}

export async function noterEchec(matricule: string, ip: string, maintenant = Date.now()): Promise<void> {
  await modifierEchecs((echecs) => {
    for (const cle of [`m:${matricule}`, `ip:${ip}`]) {
      const e = Object.hasOwn(echecs, cle) ? echecs[cle] : undefined;
      if (!e || maintenant - e.depuis > BLOCAGE_MS) echecs[cle] = { nb: 1, depuis: maintenant };
      else e.nb += 1;
    }
    // Ménage des entrées expirées.
    for (const [cle, e] of Object.entries(echecs)) if (maintenant - e.depuis > BLOCAGE_MS) delete echecs[cle];
    return true;
  });
}

export async function reinitialiserEchecs(matricule: string): Promise<void> {
  const cle = `m:${matricule}`;
  const echecs = (await lireDocument<Echecs>(CLE_ECHECS))?.data;
  if (!echecs || !Object.hasOwn(echecs, cle)) return;
  await modifierEchecs((e) => {
    delete e[cle];
    return true;
  });
}
