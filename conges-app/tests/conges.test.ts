import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  ajouterMois,
  construirePeriodes,
  dateToStr,
  joursAcquis,
  occupationParQuinzaine,
  premiereDatePossible,
  projeterSolde,
  solde,
  strToDate,
  trouverAgent,
  verifierDemande,
  verifierFetesMajeures,
  verifierPlafond,
  type Agent,
  type Demande,
  type Periode,
  type Registre
} from "../lib/conges";
import { compterJoursDecomptes, detailDecompte, estFerie, fetesExclusives, paques } from "../lib/calendrier";
import { construireSynthese, exportVoeux, mettreAJourInfosAgent } from "../lib/admin";

const AUJOURDHUI = strToDate("2026-11-03");

function agent(partiel: Partial<Agent> = {}): Agent {
  return {
    matricule: "0001",
    prenom: "Test",
    nom: "AGENT",
    fonction: "AGENT DE VENTE",
    role: "AV",
    date_embauche: "2023-12-20",
    jours_pris_reprise: 14,
    historique: [],
    demandes: [],
    ...partiel
  };
}

function registre(...agents: Agent[]): Registre {
  return {
    version: 2,
    date_reprise: "2026-10-31",
    agents: Object.fromEntries(agents.map((a) => [a.matricule, a])),
    admins: {}
  };
}

function demande(periodes: Periode[], statut: Demande["statut"] = "en_attente"): Demande {
  return {
    id: crypto.randomUUID(),
    periodes,
    jours: periodes.reduce((s, p) => s + p.jours, 0),
    statut,
    cree_le: "2026-11-01T00:00:00.000Z"
  };
}

function periodes(annee: number, mois: number, nbJours: number, partie: "debut" | "fin"): Periode[] {
  const r = construirePeriodes([{ annee, mois, partie, nbJours }]);
  if (r.status !== "ok") throw new Error(r.message);
  return r.periodes;
}

describe("calendrier : dimanches et jours fériés non décomptés", () => {
  it("calcule Pâques", () => {
    expect(dateToStr(paques(2026))).toBe("2026-04-05");
    expect(dateToStr(paques(2027))).toBe("2027-03-28");
  });

  it("reconnaît les fêtes fixes et mobiles", () => {
    expect(estFerie(strToDate("2027-04-04"))).toBe(true); // Indépendance
    expect(estFerie(strToDate("2027-03-29"))).toBe(true); // Lundi de Pâques
    expect(estFerie(strToDate("2027-05-06"))).toBe(true); // Ascension
    expect(estFerie(strToDate("2027-03-02"))).toBe(false);
  });

  it("ne décompte ni les dimanches ni les fériés", () => {
    // 1er → 15 février 2027 : 15 jours, 2 dimanches (7, 14), aucun férié → 13
    expect(compterJoursDecomptes("2027-02-01", "2027-02-15")).toBe(13);
    // 1er → 15 mars 2027 : idem, moins la Korité estimée au 10 → 12
    expect(compterJoursDecomptes("2027-03-01", "2027-03-15")).toBe(12);
    // 20 déc. 2027 → 2 janv. 2028 : 14 jours − 2 dimanches (26, 2) − Noël − Jour de l'An = 10
    expect(compterJoursDecomptes("2027-12-20", "2028-01-02")).toBe(10);
  });
});

describe("solde : 2 jours par mois, mois d'embauche compris", () => {
  it("reproduit le tableau RH arrêté fin octobre 2026", () => {
    expect(joursAcquis("2023-12-20", AUJOURDHUI)).toBe(70);
    expect(joursAcquis("2026-02-02", AUJOURDHUI)).toBe(18);
  });

  it("augmente de 2 jours chaque mois", () => {
    expect(joursAcquis("2023-12-20", strToDate("2026-12-01"))).toBe(72);
    expect(joursAcquis("2023-12-20", strToDate("2027-03-16"))).toBe(78);
  });

  const tsv = path.join(__dirname, "..", "data", "import", "agents.tsv");
  it.skipIf(!fs.existsSync(tsv))("donne le même solde que le tableau RH pour chaque agent", () => {
    for (const l of fs.readFileSync(tsv, "utf-8").trim().split("\n").slice(1)) {
      const c = l.split("\t");
      const [j, m, a] = c[5].trim().split("/");
      const ag = agent({ date_embauche: `${a}-${m}-${j}`, jours_pris_reprise: Number(c[6]) });
      expect(solde(ag, AUJOURDHUI), `matricule ${c[0]}`).toBe(Number(c[8]));
    }
  });

  it("ne débite pas les congés repris, débite les vœux actifs mais pas les supprimés", () => {
    const a = agent({
      historique: [{ debut: "2026-03-02", fin: "2026-03-14", jours: 11 }],
      demandes: [demande(periodes(2027, 3, 11, "debut")), demande(periodes(2028, 3, 11, "debut"), "supprime")]
    });
    expect(solde(a, AUJOURDHUI)).toBe(70 - 14 - 11);
  });
});

describe("construirePeriodes", () => {
  const c = (annee: number, mois: number, partie: "debut" | "fin", nbJours: number) => ({ annee, mois, partie, nbJours });

  it("1 période : 11 jours décomptés à partir du 1er, dimanches sautés", () => {
    expect(periodes(2027, 2, 11, "debut")).toEqual([{ debut: "2027-02-01", fin: "2027-02-12", jours: 11 }]);
  });

  it("démarre au premier jour décompté si le 1er est un dimanche", () => {
    // 1er août 2027 est un dimanche
    expect(periodes(2027, 8, 11, "debut")[0].debut).toBe("2027-08-02");
  });

  it("1 période peut couvrir un mois complet", () => {
    // Juin 2027 : 30 jours − 4 dimanches − Tamkharit (15) = 25 jours décomptés
    expect(periodes(2027, 6, 25, "debut")).toEqual([{ debut: "2027-06-01", fin: "2027-06-30", jours: 25 }]);
  });

  it("2 périodes distinctes, chacune avec son mois, son départ et sa durée", () => {
    const r = construirePeriodes([c(2027, 8, "fin", 6), c(2027, 2, "debut", 11)]);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      // triées chronologiquement
      expect(r.periodes.map((p) => [p.debut, p.jours])).toEqual([["2027-02-01", 11], ["2027-08-16", 6]]);
    }
  });

  it("refuse moins de 11 jours au total, une durée démesurée, plus de 2 périodes", () => {
    expect(construirePeriodes([c(2027, 3, "debut", 10)]).status).toBe("erreur");
    expect(construirePeriodes([c(2027, 3, "debut", 5), c(2027, 6, "debut", 5)]).status).toBe("erreur");
    expect(construirePeriodes([c(2027, 3, "debut", 5), c(2027, 6, "debut", 6)]).status).toBe("ok");
    expect(construirePeriodes([c(2027, 3, "debut", 100_000_000)]).status).toBe("erreur");
    expect(construirePeriodes([c(2027, 1, "debut", 5), c(2027, 3, "debut", 5), c(2027, 6, "debut", 5)]).status).toBe("erreur");
  });

  it("n'impose pas de minimum aux demandes de récupération", () => {
    expect(construirePeriodes([c(2027, 3, "debut", 1)], "recuperation").status).toBe("ok");
    expect(
      construirePeriodes(
        [c(2027, 3, "debut", 1), c(2027, 6, "debut", 1)],
        "recuperation"
      ).status
    ).toBe("ok");
    expect(construirePeriodes([c(2027, 3, "debut", 1)]).status).toBe("erreur");
  });

  it("refuse deux périodes qui se chevauchent", () => {
    // 1er mars + 15 jours décomptés déborde après le 16
    expect(construirePeriodes([c(2027, 3, "debut", 15), c(2027, 3, "fin", 6)]).status).toBe("erreur");
    expect(construirePeriodes([c(2027, 3, "debut", 6), c(2027, 3, "fin", 6)]).status).toBe("ok");
  });
});

describe("déduction du solde et fêtes", () => {
  it("déduit uniquement les jours posés hors dimanches et fériés", () => {
    // 1er → 15 mars 2027 : Korité le 10, dimanches 7 et 14
    expect(detailDecompte("2027-03-01", "2027-03-15")).toEqual({
      calendaires: 15,
      dimanches: 2,
      feries: [{ date: "2027-03-10", nom: "Korité" }],
      decomptes: 12
    });
    const a = agent();
    const p = periodes(2027, 3, 12, "debut");
    expect(p[0].fin).toBe("2027-03-15");
    const [s] = projeterSolde(a, p);
    expect(s.avant).toBe(joursAcquis(a.date_embauche, strToDate("2027-03-01")) - 14);
    expect(s.apres).toBe(s.avant - 12);
  });

  it("solde vérifié au départ de chaque période", () => {
    const a = agent({ date_embauche: "2024-02-20", jours_pris_reprise: 60 }); // 12 j au 01/02/2027, 24 au 01/08/2027
    const ok = construirePeriodes([{ annee: 2027, mois: 2, partie: "debut", nbJours: 11 }, { annee: 2027, mois: 8, partie: "debut", nbJours: 11 }]);
    const ko = construirePeriodes([{ annee: 2027, mois: 2, partie: "debut", nbJours: 11 }, { annee: 2027, mois: 3, partie: "debut", nbJours: 11 }]);
    if (ok.status !== "ok" || ko.status !== "ok") throw new Error("construction");
    expect(verifierDemande(registre(a), a, ok.periodes, AUJOURDHUI).ok).toBe(true);
    expect(verifierDemande(registre(a), a, ko.periodes, AUJOURDHUI).ok).toBe(false);
  });

  it("Korité et Tabaski 2027 : une seule des deux", () => {
    expect(fetesExclusives(2027).map((g) => g.fetes.map((f) => f.nom))).toEqual([
      ["Korité", "Tabaski"],
      ["Grand Magal de Touba", "Gamou (Maouloud)"]
    ]);
    const a = agent({ jours_pris_reprise: 0 });
    const deux = construirePeriodes([{ annee: 2027, mois: 3, partie: "debut", nbJours: 11 }, { annee: 2027, mois: 5, partie: "fin", nbJours: 6 }]);
    if (deux.status !== "ok") throw new Error(deux.message);
    const r = verifierDemande(registre(a), a, deux.periodes, AUJOURDHUI);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("Tabaski");
    // Korité seule : accepté
    expect(verifierDemande(registre(a), a, [deux.periodes[0]], AUJOURDHUI).ok).toBe(true);
  });

  it("Korité et Tabaski : tient compte d'un congé déjà prévu", () => {
    const a = agent({ jours_pris_reprise: 0, historique: [{ debut: "2027-03-01", fin: "2027-03-15", jours: 12 }] });
    expect(verifierFetesMajeures(a, periodes(2027, 5, 11, "fin")).ok).toBe(false);
    expect(verifierFetesMajeures(a, periodes(2028, 5, 11, "debut")).ok).toBe(true);
  });

  it("Magal et Gamou 2027 : une seule des deux, avec un message clair", () => {
    const a = agent({ jours_pris_reprise: 0 });
    // Magal estimé le 23/07/2027, Gamou le 14/08/2027
    const deux = construirePeriodes([{ annee: 2027, mois: 7, partie: "fin", nbJours: 6 }, { annee: 2027, mois: 8, partie: "debut", nbJours: 12 }]);
    if (deux.status !== "ok") throw new Error(deux.message);
    const r = verifierDemande(registre(a), a, deux.periodes, AUJOURDHUI);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain("Grand Magal de Touba (23/07/2027)");
      expect(r.message).toContain("le Gamou (14/08/2027)");
      expect(r.message).toContain("La période demandée du 16/07/2027");
    }
    // Une seule longue période qui couvre les deux fêtes est aussi refusée
    const longue = periodes(2027, 7, 28, "fin"); // 16/07 → 19/08
    const r2 = verifierDemande(registre(a), a, longue, AUJOURDHUI);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.message).toContain("couvre les deux fêtes");
    // Magal seul : accepté
    expect(verifierDemande(registre(a), a, [deux.periodes[0]], AUJOURDHUI).ok).toBe(true);
  });

  it("Magal et Gamou : tient compte d'un vœu déjà déposé", () => {
    const a = agent({ jours_pris_reprise: 0 });
    a.demandes.push(demande([{ debut: "2027-08-09", fin: "2027-08-20", jours: 10 }]));
    const r = verifierFetesMajeures(a, periodes(2027, 7, 11, "fin"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("votre congé déjà enregistré du 09/08/2027");
  });
});

describe("verifierDemande", () => {
  it("accepte une demande valide", () => {
    const a = agent();
    expect(verifierDemande(registre(a), a, periodes(2027, 1, 11, "fin"), AUJOURDHUI)).toEqual({ ok: true });
  });

  it("refuse un départ passé ou aujourd'hui", () => {
    const a = agent();
    expect(verifierDemande(registre(a), a, periodes(2026, 1, 11, "debut"), AUJOURDHUI).ok).toBe(false);
  });

  it("nouvel agent : pas de départ avant la date anniversaire d'entrée", () => {
    const a = agent({ date_embauche: "2026-02-02", jours_pris_reprise: 0 });
    expect(premiereDatePossible(a, AUJOURDHUI)).toBe("2027-02-16"); // anniversaire le 02/02 → départ le 16
    const r = verifierDemande(registre(a), a, periodes(2027, 2, 11, "debut"), AUJOURDHUI);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("02/02/2027");
    expect(verifierDemande(registre(a), a, periodes(2027, 2, 11, "fin"), AUJOURDHUI).ok).toBe(true);
  });

  it("solde projeté : 6 jours aujourd'hui, mais assez 3 mois plus tard", () => {
    const a = agent({ date_embauche: "2024-02-20", jours_pris_reprise: 60 }); // solde 6 au 03/11/2026
    expect(solde(a, AUJOURDHUI)).toBe(6);
    expect(verifierDemande(registre(a), a, periodes(2026, 12, 11, "debut"), AUJOURDHUI).ok).toBe(false); // 8 j
    expect(verifierDemande(registre(a), a, periodes(2027, 2, 11, "debut"), AUJOURDHUI).ok).toBe(true); // 12 j
  });

  it("solde projeté : tient compte des vœux déjà déposés", () => {
    const a = agent({ jours_pris_reprise: 60 }); // solde 10 aujourd'hui, 18 au 1er mars 2027
    a.demandes.push(demande(periodes(2027, 3, 11, "debut")));
    // Un vœu plus tôt rendrait celui de mars impossible
    expect(verifierDemande(registre(a), a, periodes(2027, 1, 11, "debut"), AUJOURDHUI).ok).toBe(false);
  });

  it("délai de 12 mois calendaires après le mois du dernier congé", () => {
    const a = agent({ historique: [{ debut: "2026-08-17", fin: "2026-08-31", jours: 12 }] });
    expect(premiereDatePossible(a, AUJOURDHUI)).toBe("2027-08-01");
    expect(verifierDemande(registre(a), a, periodes(2027, 7, 11, "fin"), AUJOURDHUI).ok).toBe(false);
    expect(verifierDemande(registre(a), a, periodes(2027, 8, 11, "debut"), AUJOURDHUI).ok).toBe(true);
    expect(verifierDemande(registre(a), a, periodes(2027, 9, 11, "debut"), AUJOURDHUI).ok).toBe(true);
  });

  it("les récupérations sont indépendantes du délai depuis le dernier congé", () => {
    const a = agent({
      jours_pris_reprise: 0,
      historique: [{ debut: "2026-08-01", fin: "2026-08-15", jours: 12 }]
    });
    const unJour = [{ debut: "2027-02-01", fin: "2027-02-01", jours: 1 }];
    expect(verifierDemande(registre(a), a, unJour, AUJOURDHUI).ok).toBe(false);
    expect(verifierDemande(registre(a), a, unJour, AUJOURDHUI, "recuperation").ok).toBe(true);
  });

  it("une récupération ne repousse pas la prochaine date de congé", () => {
    const recovery = demande([{ debut: "2027-12-01", fin: "2027-12-01", jours: 1 }]);
    recovery.type = "recuperation";
    const a = agent({
      jours_pris_reprise: 0,
      historique: [{ debut: "2026-03-01", fin: "2026-03-15", jours: 12 }],
      demandes: [recovery]
    });
    expect(premiereDatePossible(a, AUJOURDHUI)).toBe("2027-03-01");
    expect(verifierDemande(registre(a), a, periodes(2027, 3, 11, "debut"), AUJOURDHUI).ok).toBe(true);
  });

  it("autorise une nouvelle demande dès le même mois, 12 mois plus tard", () => {
    const a = agent({
      jours_pris_reprise: 0,
      historique: [{ debut: "2026-03-01", fin: "2026-03-15", jours: 12 }]
    });
    const memeMois = periodes(2027, 3, 11, "debut");
    expect(memeMois[0].debut).toBe("2027-03-01");
    expect(premiereDatePossible(a, AUJOURDHUI)).toBe("2027-03-01");
    expect(verifierDemande(registre(a), a, memeMois, AUJOURDHUI).ok).toBe(true);
  });

  it("délai de 12 mois aussi avec un vœu déjà prévu plus tard", () => {
    const a = agent({ jours_pris_reprise: 0 });
    a.demandes.push(demande(periodes(2027, 12, 11, "debut")));
    expect(verifierDemande(registre(a), a, periodes(2027, 3, 11, "debut"), AUJOURDHUI).ok).toBe(false);
  });

  it("plafond : 16 AV déjà absents le même jour → refus", () => {
    const absents = Array.from({ length: 16 }, (_, i) =>
      agent({ matricule: `A${i}`, historique: [{ debut: "2027-03-01", fin: "2027-03-01", jours: 1 }] })
    );
    const demandeur = agent({ matricule: "9999" });
    const r = verifierDemande(registre(demandeur, ...absents), demandeur, periodes(2027, 3, 11, "debut"), AUJOURDHUI);
    expect(r.ok).toBe(false);
    // Les agents ne sont plus absents pendant la seconde quinzaine.
    expect(verifierDemande(registre(demandeur, ...absents), demandeur, periodes(2027, 3, 11, "fin"), AUJOURDHUI).ok).toBe(true);
  });

  it("vérifie le plafond pour chaque jour de la période", () => {
    const agents = Array.from({ length: 16 }, (_, i) =>
      agent({ matricule: `C${i}`, historique: [{ debut: "2027-03-15", fin: "2027-03-15", jours: 1 }] })
    );
    const demandeur = agent({ matricule: "C99" });
    const r = registre(demandeur, ...agents);
    expect(verifierPlafond(r, demandeur, [{ debut: "2027-03-01", fin: "2027-03-14", jours: 10 }]).ok).toBe(true);
    expect(verifierPlafond(r, demandeur, [{ debut: "2027-03-01", fin: "2027-03-15", jours: 11 }]).ok).toBe(false);
  });

  it("calcule le pic simultané plutôt que le nombre de personnes successives", () => {
    const premieres = Array.from({ length: 18 }, (_, i) =>
      agent({ matricule: `D${i}`, demandes: [demande([{ debut: "2027-03-01", fin: "2027-03-07", jours: 6 }])] })
    );
    const suivantes = Array.from({ length: 18 }, (_, i) =>
      agent({ matricule: `E${i}`, demandes: [demande([{ debut: "2027-03-08", fin: "2027-03-15", jours: 7 }])] })
    );
    const occ = occupationParQuinzaine(registre(...premieres, ...suivantes), "AV", "2027-03-01", 1)[0];
    expect(occ.pic).toBe(18);
    expect(occ.parJour).toHaveLength(15);
    expect(occ.picLe).toBe("2027-03-01");
  });

  it("n'inclut pas les congés importés dans le quota des soumissions plateforme", () => {
    const sansSoumission = agent({
      historique: [{ debut: "2026-12-16", fin: "2026-12-31", jours: 12 }]
    });
    const r = registre(sansSoumission);
    expect(occupationParQuinzaine(r, "AV", "2026-12-16", 1)[0].pic).toBe(0);

    sansSoumission.demandes.push(demande([{ debut: "2026-12-16", fin: "2026-12-31", jours: 12 }]));
    expect(occupationParQuinzaine(r, "AV", "2026-12-16", 1)[0].pic).toBe(1);
  });

  it("applique 9 AV du 1 au 15 janvier 2027, puis 16", () => {
    expect(occupationParQuinzaine(registre(), "AV", "2026-12-16", 1)[0].plafond).toBe(16);
    expect(occupationParQuinzaine(registre(), "AV", "2027-01-01", 1)[0].plafond).toBe(9);
    expect(occupationParQuinzaine(registre(), "AV", "2027-01-16", 1)[0].plafond).toBe(16);
    expect(occupationParQuinzaine(registre(), "AV", "2027-02-01", 1)[0].plafond).toBe(16);

    const demandeur = agent({ matricule: "9999" });
    const neufEnJanvier = Array.from({ length: 9 }, (_, i) =>
      agent({
        matricule: `J${i}`,
        demandes: [demande([{ debut: "2027-01-01", fin: "2027-01-15", jours: 11 }])]
      })
    );
    expect(
      verifierPlafond(registre(demandeur, ...neufEnJanvier), demandeur, [
        { debut: "2027-01-15", fin: "2027-01-16", jours: 2 }
      ]).ok
    ).toBe(false);

    const quinzeLe16 = Array.from({ length: 15 }, (_, i) =>
      agent({
        matricule: `F${i}`,
        demandes: [demande([{ debut: "2027-01-16", fin: "2027-01-16", jours: 1 }])]
      })
    );
    expect(
      verifierPlafond(registre(demandeur, ...quinzeLe16), demandeur, [
        { debut: "2027-01-16", fin: "2027-01-16", jours: 1 }
      ]).ok
    ).toBe(true);
    quinzeLe16.push(
      agent({
        matricule: "F15",
        demandes: [demande([{ debut: "2027-01-16", fin: "2027-01-16", jours: 1 }])]
      })
    );
    expect(
      verifierPlafond(registre(demandeur, ...quinzeLe16), demandeur, [
        { debut: "2027-01-16", fin: "2027-01-16", jours: 1 }
      ]).ok
    ).toBe(false);
  });

  it("plafond : les vœux en attente comptent, les supprimés non", () => {
    const enAttente = Array.from({ length: 16 }, (_, i) =>
      agent({ matricule: `B${i}`, demandes: [demande(periodes(2027, 3, 11, "debut"))] })
    );
    const demandeur = agent({ matricule: "9999" });
    expect(verifierDemande(registre(demandeur, ...enAttente), demandeur, periodes(2027, 3, 11, "debut"), AUJOURDHUI).ok).toBe(false);
    enAttente[0].demandes[0].statut = "supprime";
    expect(verifierDemande(registre(demandeur, ...enAttente), demandeur, periodes(2027, 3, 11, "debut"), AUJOURDHUI).ok).toBe(true);
  });

  it("plafonds séparés par rôle : 3 CEV, CS sans plafond, les AV ne comptent pas pour les CEV", () => {
    const av = Array.from({ length: 20 }, (_, i) => agent({ matricule: `A${i}`, historique: [{ debut: "2027-03-02", fin: "2027-03-02", jours: 1 }] }));
    const cev = Array.from({ length: 3 }, (_, i) => agent({ matricule: `C${i}`, role: "CEV", historique: [{ debut: "2027-03-02", fin: "2027-03-02", jours: 1 }] }));
    const p = periodes(2027, 3, 11, "debut");

    const cev4 = agent({ matricule: "C9", role: "CEV" });
    expect(verifierDemande(registre(cev4, ...cev), cev4, p, AUJOURDHUI).ok).toBe(false);
    expect(verifierDemande(registre(cev4, ...av), cev4, p, AUJOURDHUI).ok).toBe(true);

    const cs = Array.from({ length: 30 }, (_, i) => agent({ matricule: `S${i}`, role: "CS", historique: [{ debut: "2027-03-02", fin: "2027-03-02", jours: 1 }] }));
    const csDemandeur = agent({ matricule: "S99", role: "CS" });
    expect(verifierDemande(registre(csDemandeur, ...cs), csDemandeur, p, AUJOURDHUI).ok).toBe(true);
  });
});

describe("occupation et synthèse admin", () => {
  it("compte le pic d'absents par quinzaine et par rôle", () => {
    const r = registre(agent({ demandes: [demande([{ debut: "2027-03-10", fin: "2027-03-20", jours: 9 }])] }));
    const occ = occupationParQuinzaine(r, "AV", "2027-03-01", 3);
    expect(occ.map((q) => q.pic)).toEqual([1, 1, 0]);
    expect(occ.map((q) => q.picLe)).toEqual(["2027-03-10", "2027-03-16", null]);
    expect(occ[0].plafond).toBe(16);
  });

  it("liste les agents sans vœu et les KPIs", () => {
    const a1 = agent({ matricule: "0001", demandes: [demande(periodes(2027, 3, 11, "debut"), "valide")] });
    const a2 = agent({ matricule: "0002", date_embauche: "2026-02-02", jours_pris_reprise: 0 });
    const s = construireSynthese(registre(a1, a2), AUJOURDHUI);
    expect(s.kpis.agents_ayant_soumis).toBe(1);
    expect(s.kpis.agents_sans_voeu).toBe(1);
    expect(s.kpis.voeux_valides).toBe(1);
    expect(s.kpis.agents_moins_un_an).toBe(1);
    const ligne2 = s.agents.find((l) => l.matricule === "0002")!;
    expect(ligne2.premiere_date_possible).toBe("2027-02-16");
    expect(ligne2.date_solde_suffisant).toBe("2027-02-16"); // 24 jours à cette date
  });

  it("exporte les vœux avec la date de retour = lendemain du dernier jour", () => {
    const a = agent({ demandes: [demande([{ debut: "2027-03-01", fin: "2027-03-12", jours: 11 }])] });
    const csv = exportVoeux(registre(a));
    expect(csv).toContain("01/03/2027;13/03/2027;11");
    expect(csv).toContain("Type");
    expect(csv).toContain(";Congé;");
  });

  it("exporte une demande de récupération avec son type", () => {
    const d = demande([{ debut: "2027-03-01", fin: "2027-03-12", jours: 11 }]);
    d.type = "recuperation";
    const a = agent({ demandes: [d] });
    expect(exportVoeux(registre(a))).toContain(";Récupération;En attente;");
  });

  it("neutralise les formules Excel dans l'export", () => {
    const a = agent({ nom: "=HYPERLINK(\"x\")", demandes: [demande(periodes(2027, 3, 11, "debut"))] });
    expect(exportVoeux(registre(a))).toContain("'=HYPERLINK");
  });
});

describe("modification des informations RH par l'administration", () => {
  const infos = {
    matricule: "0002",
    prenom: "Nouveau prénom",
    nom: "NOUVEAU NOM",
    fonction: "AGENT DE VENTE",
    role: "AV" as const,
    date_embauche: "2024-01-08",
    jours_pris_reprise: 20,
    dernier_conge_debut: "2027-03-01",
    dernier_conge_retour: "2027-03-16"
  };

  it("met à jour les données et recalcule les jours d'une période historique", () => {
    const a = agent({
      historique: [{ debut: "2027-02-25", fin: "2027-03-12", jours: 12 }],
      auth: { hash: "conserve", doit_changer: false, modifie_le: "2026-01-01T00:00:00.000Z" }
    });

    expect(mettreAJourInfosAgent(a, infos)).toBeNull();
    expect(a).toMatchObject({
      matricule: "0002",
      prenom: "Nouveau prénom",
      nom: "NOUVEAU NOM",
      date_embauche: "2024-01-08",
      jours_pris_reprise: 20,
      auth: { hash: "conserve" },
      historique: [{ debut: "2027-03-01", fin: "2027-03-15", jours: 12 }]
    });
  });

  it("refuse un historique chevauchant sans appliquer les autres changements", () => {
    const a = agent({
      prenom: "Avant",
      historique: [{ debut: "2027-03-01", fin: "2027-03-12", jours: 10 }],
      demandes: [demande([{ debut: "2027-03-14", fin: "2027-03-20", jours: 5 }])]
    });

    expect(mettreAJourInfosAgent(a, infos)).toContain("chevaucher");
    expect(a.prenom).toBe("Avant");
    expect(a.historique[0].fin).toBe("2027-03-12");
  });

  it("utilise une date repère lorsqu'aucune période historique détaillée n'existe", () => {
    const a = agent({ historique: [] });
    expect(
      mettreAJourInfosAgent(a, {
        ...infos,
        dernier_conge_debut: null,
        dernier_conge_retour: "2026-04-01"
      })
    ).toBeNull();
    expect(a.dernier_conge_fin).toBe("2026-03-31");
    expect(premiereDatePossible(a, AUJOURDHUI)).toBe("2027-03-01");
    expect(verifierDemande(registre(a), a, periodes(2027, 2, 11, "debut"), AUJOURDHUI).ok).toBe(false);
    expect(verifierDemande(registre(a), a, periodes(2027, 3, 11, "debut"), AUJOURDHUI).ok).toBe(true);
  });

  it("crée un historique détaillé quand les deux dates sont renseignées", () => {
    const a = agent({ historique: [], dernier_conge_fin: "2026-03-31" });
    expect(
      mettreAJourInfosAgent(a, {
        ...infos,
        dernier_conge_debut: "2026-03-01",
        dernier_conge_retour: "2026-04-01"
      })
    ).toBeNull();
    expect(a.historique).toEqual([{ debut: "2026-03-01", fin: "2026-03-31", jours: 25 }]);
    expect(a.dernier_conge_fin).toBeUndefined();
  });

  it("refuse une date de retour antérieure au départ sans modifier l'agent", () => {
    const a = agent({ prenom: "Avant", historique: [] });
    expect(
      mettreAJourInfosAgent(a, {
        ...infos,
        dernier_conge_debut: "2027-03-20",
        dernier_conge_retour: "2027-03-16"
      })
    ).toContain("postérieure");
    expect(a.prenom).toBe("Avant");
    expect(a.historique).toEqual([]);
  });
});

describe("divers", () => {
  it("ajoute 12 mois et non 12 ans (bug du script Python d'origine)", () => {
    expect(dateToStr(ajouterMois(strToDate("2026-07-24"), 12))).toBe("2027-07-24");
  });

  it("ignore les clés héritées du prototype", () => {
    const r = registre(agent());
    expect(trouverAgent(r, "constructor")).toBeNull();
    expect(trouverAgent(r, "__proto__")).toBeNull();
    expect(trouverAgent(r, "0001")).not.toBeNull();
  });
});
