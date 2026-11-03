/**
 * Repères du droit du travail sénégalais relatifs aux congés payés.
 *
 * Contenu reformulé (à partir de plusieurs sources spécialisées en droit
 * social ouest-africain) à titre informatif pour les agents. Il ne remplace
 * pas une consultation de la loi n°97-17 du 1er décembre 1997 portant Code
 * du travail, de ses décrets d'application, ni de la convention collective
 * ou de l'accord d'entreprise applicable — ceux-ci peuvent prévoir des
 * dispositions plus favorables que les minima légaux présentés ici.
 */

export const REPERES_LEGAUX_SENEGAL = {
  texteReference: "Loi n°97-17 du 1er décembre 1997 portant Code du travail (art. L.143 à L.163)",
  texteComplementaire: "Convention Collective Nationale Interprofessionnelle (CCNI, 1982) et conventions sectorielles",

  droitBase: {
    titre: "Acquisition du droit à congé",
    points: [
      "Un salarié acquiert 2 jours ouvrables de congé par mois de service effectif chez le même employeur.",
      "Sur une année complète, cela représente un minimum légal de 24 jours ouvrables après 12 mois d'ancienneté.",
      "Les jours ouvrables se comptent du lundi au samedi, hors dimanches et jours fériés — pas en jours calendaires.",
      "Certaines absences (maladie, maternité, accident du travail) sont assimilées à du travail effectif pour ce calcul."
    ]
  },

  regimesParticuliers: {
    titre: "Régimes plus favorables",
    points: [
      "Les travailleurs de moins de 18 ans bénéficient d'un régime renforcé, pouvant aller jusqu'à 30 jours ouvrables par an.",
      "Les salariées ayant des enfants à charge de moins de 14 ans bénéficient généralement d'un jour de congé supplémentaire par enfant et par an.",
      "Une majoration liée à l'ancienneté est fréquemment prévue au-delà d'un certain seuil (souvent à partir de 10 ans de service), à vérifier dans la convention applicable."
    ]
  },

  priseDesConges: {
    titre: "Prise et fractionnement",
    points: [
      "Chaque année, un minimum de 6 jours ouvrables consécutifs doit obligatoirement être pris — le congé ne peut pas être intégralement fractionné en journées isolées.",
      "Le solde restant peut être fractionné ou reporté d'un commun accord entre l'agent et l'employeur, dans la limite de 3 ans.",
      "En cas de rupture du contrat, les congés acquis et non pris ouvrent droit à une indemnité compensatrice, calculée sur le salaire moyen des 12 derniers mois."
    ]
  },

  articulationAvecCeService: {
    titre: "Comment ces règles se combinent avec celles du service",
    points: [
      "Le Code du travail fixe des minima individuels (durée acquise, fractionnement) — il ne traite pas de la coordination entre plusieurs agents d'une même équipe.",
      "Le délai de 12 mois entre deux prises et les plafonds d'absents par quinzaine (20 agents de vente, 3 chefs d'équipe) appliqués par cette plateforme sont des règles internes de continuité de service : elles s'ajoutent à la loi, elles ne la remplacent pas et ne peuvent pas réduire les droits légaux d'un agent.",
      "Le minimum de 11 jours par demande retenu ici est une convention interne de planification ; il reste néanmoins conseillé de couvrir dans l'année le minimum légal de 6 jours consécutifs obligatoires."
    ]
  }
} as const;

/**
 * Estimation indicative du nombre de jours de congé légalement acquis sur une
 * année, à partir de l'ancienneté. C'est une approximation pédagogique, pas
 * un calcul de paie : le calcul réel se fait mois de service par mois de
 * service et dépend de la convention collective applicable.
 */
export function estimerJoursLegauxAnnuels(
  ancienneteAnnees: number,
  enfantsMoinsDe14: number = 0
): { base: number; majorationAnciennete: number; majorationEnfants: number; total: number } {
  const base = 24; // 2 jours ouvrables x 12 mois

  // Majoration indicative : +1 jour par tranche de 5 ans au-delà de 10 ans d'ancienneté.
  const majorationAnciennete = ancienneteAnnees >= 10 ? Math.floor((ancienneteAnnees - 5) / 5) : 0;

  const majorationEnfants = Math.max(0, enfantsMoinsDe14);

  return {
    base,
    majorationAnciennete,
    majorationEnfants,
    total: base + majorationAnciennete + majorationEnfants
  };
}
