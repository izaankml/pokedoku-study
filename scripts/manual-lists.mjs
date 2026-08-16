// Membership that cannot be derived from @pkmn/dex data alone.
// All ids are national dex numbers.

// PokeAPI is_baby (19)
export const BABY_IDS = new Set([
  172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 433, 438, 439, 440,
  446, 447, 458, 848,
]);

// First-partner base forms (Bulbasaur..Sprigatito lines); Let's Go
// Pikachu/Eevee partners are deliberately excluded (PokeDoku does the same).
// Expanded to whole evolution lines by the build script.
export const STARTER_BASE_IDS = new Set([
  1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501, 650,
  653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912,
]);

// Revived-from-fossil species and their evolutions (25)
export const FOSSIL_IDS = new Set([
  138, 139, 140, 141, 142, // Omanyte, Omastar, Kabuto, Kabutops, Aerodactyl
  345, 346, 347, 348, // Lileep, Cradily, Anorith, Armaldo
  408, 409, 410, 411, // Cranidos, Rampardos, Shieldon, Bastiodon
  564, 565, 566, 567, // Tirtouga, Carracosta, Archen, Archeops
  696, 697, 698, 699, // Tyrunt, Tyrantrum, Amaura, Aurorus
  880, 881, 882, 883, // Dracozolt, Arctozolt, Dracovish, Arctovish
]);

// Cross-checked against the dex "Ultra Beast" tag by the build script (11)
export const ULTRA_BEAST_IDS = new Set([
  793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806,
]);

// The dex "Paradox" tag is incomplete, so numbers are authoritative here.
// Koraidon/Miraidon count as both Paradox and Legendary (PokeDoku agrees). (22)
export const PARADOX_IDS = new Set([
  984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995,
  1005, 1006, 1007, 1008, 1009, 1010,
  1020, 1021, 1022, 1023,
]);

// Species debuting in Legends: Arceus. @pkmn/dex reports them as gen 8;
// their region of origin is Hisui, not Galar. Regional FORMS of older
// species (Hisuian Growlithe etc.) do not relocate the species.
export const HISUI_IDS = new Set([899, 900, 901, 902, 903, 904, 905]);

// Where our method taxonomy deliberately disagrees with @pkmn/dex evoType
// (keys are dex ids/slugs). Rationale:
// - sylveon: friendship + Fairy move in modern games (dex says levelExtra)
// - shedinja: party-slot side effect, no real method (dex says plain level)
// - ursaluna: Peat Block is a used item (dex says other)
// - sneasler: Razor Claw is a used item in PLA, per PokeAPI (dex says levelHold)
export const EVO_METHOD_OVERRIDES = {
  sylveon: "friendship",
  shedinja: "other",
  ursaluna: "item",
  sneasler: "item",
};

// Showdown spells these with -F/-M suffixes
export const DISPLAY_NAME_OVERRIDES = {
  nidoranf: "Nidoran♀",
  nidoranm: "Nidoran♂",
};
