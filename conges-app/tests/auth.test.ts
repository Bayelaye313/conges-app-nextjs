import fs from "fs";
import os from "os";
import path from "path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  creerJetonSession,
  genererCodeProvisoire,
  hacherCode,
  lireJetonSession,
  noterEchec,
  tentativesBloquees,
  validerNouveauCode,
  verifierCode,
  type Compte
} from "../lib/auth";
import { lireDocument, modifierDocument, ecrireDocumentForce } from "../lib/storage";

beforeAll(() => {
  process.env.CONGES_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "conges-test-"));
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
