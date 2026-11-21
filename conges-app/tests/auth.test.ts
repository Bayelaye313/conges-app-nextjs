import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  COOKIE_SESSION,
  creerJetonSession,
  exigerSession,
  genererCodeProvisoire,
  hacherCode,
  lireJetonSession,
  noterEchec,
  tentativesBloquees,
  trouverCompte,
  validerNouveauCode,
  verifierCode,
  type Compte
} from "../lib/auth";
import { lireDocument, modifierDocument, ecrireDocumentForce } from "../lib/storage";

beforeAll(() => {
  process.env.CONGES_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "conges-test-"));
  process.env.CONGES_STOCKAGE = "fichier";
  process.env.SESSION_SECRET = "test-secret-for-session-authentication";
});

const compte = {
  type: "agent",
  matricule: "0291",
  auth: { hash: "x", doit_changer: false, modifie_le: "2026-11-03T00:00:00.000Z" }
} as Compte;

describe("codes d'accès", () => {
  it("vérifie le bon code et refuse un mauvais", async () => {
    const hash = await hacherCode("unBonCode2026");
    expect(hash).not.toContain("unBonCode2026");
    expect(await verifierCode("unBonCode2026", hash)).toBe(true);
    expect(await verifierCode("unBonCode2027", hash)).toBe(false);
  });

  it("refuse un hash mal formé sans planter", async () => {
    expect(await verifierCode("x", "nimporte-quoi")).toBe(false);
  });

  it("génère des codes provisoires différents et sans caractères ambigus", () => {
    const codes = new Set(Array.from({ length: 50 }, () => genererCodeProvisoire()));
    expect(codes.size).toBe(50);
    for (const c of codes) expect(c).not.toMatch(/[0O1Il]/);
  });

  it("refuse les codes trop courts, triviaux ou contenant le matricule", () => {
    expect(validerNouveauCode("abc", "0291")).not.toBeNull();
    expect(validerNouveauCode("11111111", "0291")).not.toBeNull();
    expect(validerNouveauCode("12345678", "0291")).not.toBeNull();
    expect(validerNouveauCode("moi0291abc", "0291")).not.toBeNull();
    expect(validerNouveauCode("Baobab-Thies", "0291")).toBeNull();
  });
});

describe("session", () => {
  it("autorise un agent à utiliser son code provisoire sans le remplacer", async () => {
    const agent = {
      matricule: "0779",
      prenom: "Test",
      nom: "Agent",
      fonction: "AGENT DE VENTE",
      role: "AV" as const,
      date_embauche: "2024-01-08",
      jours_pris_reprise: 0,
      historique: [],
      demandes: [],
      auth: { hash: "hash", doit_changer: true, modifie_le: "2026-11-20T00:00:00.000Z" }
    };
    await ecrireDocumentForce({
      version: 2 as const,
      date_reprise: "2026-10-31",
      agents: { "0779": agent },
      admins: {}
    });
    const compte = { type: "agent" as const, matricule: agent.matricule, auth: agent.auth, agent };
    const req = new NextRequest("https://conges.test/api/moi", {
      headers: { cookie: `${COOKIE_SESSION}=${creerJetonSession(compte)}` }
    });

    await expect(exigerSession(req)).resolves.toMatchObject({ ok: true });
  });

  it("relit un jeton valide avec son type de compte", () => {
    const contenu = lireJetonSession(creerJetonSession(compte));
    expect(contenu?.m).toBe("0291");
    expect(contenu?.r).toBe("agent");
  });

  it("refuse un jeton modifié (matricule ou passage en admin)", () => {
    const [payload, sig] = creerJetonSession(compte).split(".");
    for (const modif of [{ m: "0604" }, { r: "admin" }]) {
      const contenu = { ...JSON.parse(Buffer.from(payload, "base64url").toString()), ...modif };
      expect(lireJetonSession(`${Buffer.from(JSON.stringify(contenu)).toString("base64url")}.${sig}`)).toBeNull();
    }
  });

  it("refuse un jeton absent ou mal formé", () => {
    expect(lireJetonSession(undefined)).toBeNull();
    expect(lireJetonSession("abc")).toBeNull();
    expect(lireJetonSession("a.b.c")).toBeNull();
  });

  it("ne résout pas le compte d'un agent désactivé", () => {
    const registre = {
      version: 2 as const,
      date_reprise: "2026-10-31",
      agents: {
        "0062": {
          matricule: "0062",
          prenom: "Michel",
          nom: "COLY",
          fonction: "CHEF DE SECTEUR",
          role: "CS" as const,
          date_embauche: "2023-10-09",
          jours_pris_reprise: 41,
          desactive: true,
          historique: [],
          demandes: [],
          auth: { hash: "hash", doit_changer: false, modifie_le: "2026-11-20T00:00:00.000Z" }
        }
      },
      admins: {}
    };
    expect(trouverCompte(registre, "0062")).toBeNull();
  });
});

describe("limitation des tentatives (persistée)", () => {
  it("bloque un matricule après 5 échecs, puis débloque après 15 minutes", async () => {
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) await noterEchec("0777", "10.0.0.1", t0);
    expect(await tentativesBloquees("0777", "10.0.0.2", t0)).toBe(true);
    expect(await tentativesBloquees("0778", "10.0.0.2", t0)).toBe(false);
    expect(await tentativesBloquees("0777", "10.0.0.2", t0 + 16 * 60 * 1000)).toBe(false);
  });
});

describe("stockage : écritures concurrentes", () => {
  it("n'en perd aucune", async () => {
    await ecrireDocumentForce({ compteur: 0 }, "test.json");
    await Promise.all(
      Array.from({ length: 20 }, () =>
        modifierDocument<{ compteur: number }, void>(
          (d) => {
            d.compteur += 1;
            return { ecrire: true, resultat: undefined };
          },
          "test.json"
        )
      )
    );
    expect((await lireDocument<{ compteur: number }>("test.json"))?.data.compteur).toBe(20);
  });
});
