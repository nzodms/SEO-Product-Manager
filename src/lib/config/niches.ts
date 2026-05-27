// Seed keyword bases per niche. These bootstrap the Keyword Research agent and
// can be persisted/extended per shop in the KeywordSet table.

export interface NicheKeywords {
  primary: string[];
  byType: string[];
  byMaterial: string[];
  byRoom: string[];
  byStyle: string[];
  ambience: string[];
}

export const NICHE_KEYWORDS: Record<string, NicheKeywords> = {
  luminaire: {
    primary: [
      "lustre",
      "suspension",
      "lampe suspendue",
      "plafonnier",
      "applique murale",
      "lampe de chevet",
      "éclairage intérieur",
    ],
    byType: [
      "lustre",
      "suspension",
      "plafonnier",
      "applique",
      "lampe de chevet",
      "plafonnier ventilateur",
      "suspension îlot central",
      "lustre escalier",
    ],
    byMaterial: [
      "verre",
      "verre fumé",
      "cristal",
      "cristal K9",
      "métal",
      "métal noir",
      "laiton",
      "rotin",
      "bois",
    ],
    byRoom: [
      "luminaire salon",
      "luminaire salle à manger",
      "luminaire chambre",
      "luminaire cuisine",
      "luminaire entrée",
      "îlot de cuisine",
    ],
    byStyle: [
      "moderne",
      "design",
      "doré",
      "noir",
      "haut plafond",
      "grand volume",
    ],
    ambience: ["lumière chaude", "ambiance lumineuse", "éclairage d'ambiance"],
  },
  bebe: {
    primary: [
      "lit cododo",
      "berceau cododo",
      "tire-lait",
      "chauffe-biberon",
      "chaise haute bébé",
      "poussette bébé",
      "porte-bébé",
    ],
    byType: [
      "cododo",
      "babyphone",
      "tapis d'éveil",
      "lit parapluie",
      "parc bébé",
      "coussin de grossesse",
      "soutien-gorge allaitement",
    ],
    byMaterial: ["coton", "bois", "tissu respirant"],
    byRoom: ["chambre bébé", "nurserie"],
    byStyle: ["sécurité bébé", "confort", "naturel"],
    ambience: ["sommeil bébé", "allaitement", "maternité"],
  },
};

export function getNicheKeywords(niche: string): NicheKeywords | null {
  return NICHE_KEYWORDS[niche] ?? null;
}
