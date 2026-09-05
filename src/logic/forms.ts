// Alternate forms that are transformations (the same Pokémon switched into
// another shape by an item or a battle state, and back), as opposed to
// variants that are different individuals (regional forms, Tauros breeds,
// gender forms). Only transformations belong beside an evolution line.

import { ALL_POKEMON, POKEMON_BY_ID } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";

// Mega Stones by species name (Serebii's Legends: Z-A table); X / Y / Z
// forms append their letter. Rayquaza needs no stone.
const MEGA_STONES: Record<string, string> = {
  Abomasnow: "Abomasite", Absol: "Absolite", Aerodactyl: "Aerodactylite", Aggron: "Aggronite",
  Alakazam: "Alakazite", Altaria: "Altarianite", Ampharos: "Ampharosite", Audino: "Audinite",
  Banette: "Banettite", Barbaracle: "Barbaracite", Baxcalibur: "Baxcalibrite", Beedrill: "Beedrillite",
  Blastoise: "Blastoisinite", Blaziken: "Blazikenite", Camerupt: "Cameruptite", Chandelure: "Chandelurite",
  Charizard: "Charizardite", Chesnaught: "Chesnaughtite", Chimecho: "Chimechite", Clefable: "Clefablite",
  Crabominable: "Crabominite", Darkrai: "Darkranite", Delphox: "Delphoxite", Diancie: "Diancite",
  Dragalge: "Dragalgite", Dragonite: "Dragoninite", Drampa: "Drampanite", Eelektross: "Eelektrossite",
  Emboar: "Emboarite", Excadrill: "Excadrite", Falinks: "Falinksite", Feraligatr: "Feraligite",
  Floette: "Floettite", Froslass: "Froslassite", Gallade: "Galladite", Garchomp: "Garchompite",
  Gardevoir: "Gardevoirite", Gengar: "Gengarite", Glalie: "Glalitite", Glimmora: "Glimmoranite",
  Golisopod: "Golisopite", Golurk: "Golurkite", Greninja: "Greninjite", Gyarados: "Gyaradosite",
  Hawlucha: "Hawluchanite", Heatran: "Heatranite", Heracross: "Heracronite", Houndoom: "Houndoominite",
  Kangaskhan: "Kangaskhanite", Latias: "Latiasite", Latios: "Latiosite", Lopunny: "Lopunnite",
  Lucario: "Lucarionite", Magearna: "Magearnite", Malamar: "Malamarite", Manectric: "Manectite",
  Mawile: "Mawilite", Medicham: "Medichamite", Meganium: "Meganiumite", Meowstic: "Meowsticite",
  Metagross: "Metagrossite", Mewtwo: "Mewtwonite", Pidgeot: "Pidgeotite", Pinsir: "Pinsirite",
  Pyroar: "Pyroarite", Raichu: "Raichunite", Sableye: "Sablenite", Salamence: "Salamencite",
  Sceptile: "Sceptilite", Scizor: "Scizorite", Scolipede: "Scolipite", Scovillain: "Scovillainite",
  Scrafty: "Scraftinite", Sharpedo: "Sharpedonite", Skarmory: "Skarmorite", Slowbro: "Slowbronite",
  Staraptor: "Staraptite", Starmie: "Starminite", Steelix: "Steelixite", Swampert: "Swampertite",
  Tatsugiri: "Tatsugirinite", Tyranitar: "Tyranitarite", Venusaur: "Venusaurite", Victreebel: "Victreebelite",
  Zeraora: "Zeraorite", Zygarde: "Zygardite",
};

// The other transformations, by slug: what switches the Pokémon into it.
const TRIGGERS: Record<string, string> = {
  groudonprimal: "Red Orb",
  kyogreprimal: "Blue Orb",
  deoxysspeed: "Meteorite",
  tornadustherian: "Reveal Glass",
  thundurustherian: "Reveal Glass",
  enamorustherian: "Reveal Glass",
  kyuremblack: "DNA Splicers + Zekrom",
  kyuremwhite: "DNA Splicers + Reshiram",
  keldeoresolute: "Knowing Secret Sword",
  aegislashblade: "Stance Change, Attacking",
  wishiwashischool: "Schooling, Lv 20+, ¼+ HP",
  mimikyubusted: "Disguise Broken",
  eiscuenoice: "Ice Face Broken",
  morpekohangry: "Hunger Switch, Each Turn",
  cherrimsunshine: "Flower Gift, Harsh Sunlight",
  miniorred: "Shields Down, ½ HP",
  miniororange: "Shields Down, ½ HP",
  minioryellow: "Shields Down, ½ HP",
  miniorgreen: "Shields Down, ½ HP",
  miniorblue: "Shields Down, ½ HP",
  miniorindigo: "Shields Down, ½ HP",
  miniorviolet: "Shields Down, ½ HP",
  cramorantgulping: "Gulp Missile, after Surf / Dive",
  cramorantgorging: "Gulp Missile, under ½ HP",
  palafinhero: "Zero to Hero, Switch Out",
  terapagosterastal: "Tera Shift, in Battle",
  terapagosstellar: "Terastallize",
  eternatuseternamax: "Eternamax (Raid)",
  dialgaorigin: "Adamant Crystal",
  palkiaorigin: "Lustrous Globe",
  giratinaorigin: "Griseous Core",
  zaciancrowned: "Rusted Sword",
  zamazentacrowned: "Rusted Shield",
  necrozmaduskmane: "N-Solarizer + Solgaleo",
  necrozmadawnwings: "N-Lunarizer + Lunala",
  necrozmaultra: "Ultranecrozium Z",
  hoopaunbound: "Prison Bottle",
  zygarde10: "Zygarde Cube",
  zygardecomplete: "Power Construct, ½ HP",
  calyrexice: "Reins of Unity + Glastrier",
  calyrexshadow: "Reins of Unity + Spectrier",
  ogerponwellspring: "Wellspring Mask",
  ogerponhearthflame: "Hearthflame Mask",
  ogerponcornerstone: "Cornerstone Mask",
  rotomheat: "Microwave Oven",
  rotomwash: "Washing Machine",
  rotomfrost: "Refrigerator",
  rotomfan: "Electric Fan",
  rotommow: "Lawn Mower",
  shayminsky: "Gracidea",
  landorustherian: "Reveal Glass",
  meloettapirouette: "Relic Song",
  darmanitanzen: "Zen Mode, ½ HP",
  darmanitangalarzen: "Zen Mode, ½ HP",
  castformsunny: "Harsh Sunlight",
  castformrainy: "Rain",
  castformsnowy: "Snow",
  deoxysattack: "Meteorite",
  deoxysdefense: "Meteorite",
  greninjaash: "Battle Bond",
};

const isMega = (pokemon: Pokemon): boolean =>
  /mega$/i.test(pokemon.form || "") || /^Mega-[XYZ]$/.test(pokemon.form || "");
const isGmax = (pokemon: Pokemon): boolean => /gmax$/i.test(pokemon.form || "");

// Whether a record is a transformation of another Pokémon.
export function isTransformation(pokemon: Pokemon): boolean {
  return Boolean(pokemon.form) && (isMega(pokemon) || isGmax(pokemon) || pokemon.name in TRIGGERS);
}

// The transformations that last outside battle, switched by an item or a
// state and kept until switched back. Every other transformation (Mega,
// Gigantamax, Primal, an ability's form) holds for a battle only.
const LASTING = new Set([
  "rotomheat", "rotomwash", "rotomfrost", "rotomfan", "rotommow",
  "deoxysattack", "deoxysdefense", "deoxysspeed",
  "tornadustherian", "thundurustherian", "landorustherian", "enamorustherian",
  "dialgaorigin", "palkiaorigin", "giratinaorigin",
  "shayminsky",
  "kyuremblack", "kyuremwhite",
  "necrozmaduskmane", "necrozmadawnwings",
  "hoopaunbound",
  "zygarde10",
  "calyrexice", "calyrexshadow",
  "ogerponwellspring", "ogerponhearthflame", "ogerponcornerstone",
  "keldeoresolute",
]);
// Whether a record is a transformation that only holds for a battle.
export function isTemporary(pokemon: Pokemon): boolean {
  return isTransformation(pokemon) && !LASTING.has(pokemon.name);
}

// Records grouped under a key, in record order.
function groupBy(records: readonly Pokemon[], keyOf: (pokemon: Pokemon) => number): Map<number, Pokemon[]> {
  const groups = new Map<number, Pokemon[]>();
  for (const pokemon of records) {
    const key = keyOf(pokemon);
    const group = groups.get(key);
    if (group) group.push(pokemon);
    else groups.set(key, [pokemon]);
  }
  return groups;
}

const bySpecies = groupBy(ALL_POKEMON, (pokemon) => pokemon.species);

// The Pokémon a transformation is a form of: the variant whose form its
// own form extends (Galar-Zen → Galarian Darmanitan, Rapid-Strike-Gmax →
// Rapid Strike Urshifu, Droopy-Mega → Droopy Tatsugiri), else the species
// (the record itself when it isn't a transformation).
export function baseOf(pokemon: Pokemon): Pokemon {
  if (!isTransformation(pokemon)) return pokemon;
  const form = pokemon.form ?? "";
  const owner = (bySpecies.get(pokemon.species) || [])
    .filter((variant) => !isTransformation(variant) && variant.form && form.startsWith(`${variant.form}-`))
    .sort((a, b) => (b.form?.length ?? 0) - (a.form?.length ?? 0))[0];
  return owner || POKEMON_BY_ID.get(pokemon.species) || pokemon;
}

// A transformation's kind, without its base's own form: Galar-Zen → Zen,
// Rapid-Strike-Gmax → Gmax, Curly-Mega → Mega. Forms of one kind on
// different variants are counterparts.
export function formKind(pokemon: Pokemon): string {
  const form = pokemon.form ?? "";
  if (isMega(pokemon)) return form.match(/Mega(-[XYZ])?$/)?.[0] ?? "Mega";
  if (isGmax(pokemon)) return "Gmax";
  const base = baseOf(pokemon);
  return base.form && form.startsWith(`${base.form}-`) ? form.slice(base.form.length + 1) : form;
}

// What switches a Pokémon into this form.
export function formTrigger(pokemon: Pokemon): string | undefined {
  if (isMega(pokemon)) {
    const species = POKEMON_BY_ID.get(pokemon.species);
    if (species?.name === "rayquaza") return "Dragon Ascent";
    const letter = pokemon.form?.match(/-([XYZ])$/)?.[1];
    const stone = MEGA_STONES[pokemon.speciesName || species?.displayName || ""];
    return stone ? stone + (letter ? ` ${letter}` : "") : "Mega Stone";
  }
  if (isGmax(pokemon)) return "Gigantamax Factor";
  return TRIGGERS[pokemon.name];
}

const formsByBase = groupBy(
  ALL_POKEMON.filter((pokemon) => isTransformation(pokemon)),
  (pokemon) => baseOf(pokemon).id,
);
for (const list of formsByBase.values()) list.sort((a, b) => a.id - b.id);

// The transformations of a Pokémon, in record order (Mega X before Mega Y,
// Megas before Gigantamax).
export function formsOf(pokemon: Pokemon): Pokemon[] {
  return formsByBase.get(pokemon.id) || [];
}

// The form's own name, without the species it sits beside: "Mega X",
// "Gmax", "Wash", "Dusk".
export function formLabel(pokemon: Pokemon): string {
  const prefix = pokemon.speciesName + " ";
  return pokemon.displayName.startsWith(prefix) ? pokemon.displayName.slice(prefix.length) : pokemon.displayName;
}

// What a variant (a record of the species that isn't a transformation:
// a regional form, Own Tempo Rockruff, Partner Pikachu) is, in a word or
// two, for its tile in the Forms row
const VARIANT_NOTES: Record<string, string> = {
  pikachustarter: "Let's Go Partner",
  eeveestarter: "Let's Go Partner",
  zarudedada: "Dada's Cloth",
  rockruffdusk: "Own Tempo",
  lycanrocmidnight: "Evolved at Night",
  lycanrocdusk: "From Own Tempo Rockruff",
  toxtricitylowkey: "Low Key Natures",
  ursalunabloodmoon: "Bloodmoon",
  gimmighoulroaming: "Roaming",
  floetteeternal: "Eternal Flower",
  magearnaoriginal: "Original Colour",
  basculinbluestriped: "Blue-Striped",
  basculinwhitestriped: "White-Striped",
  dudunsparcethreesegment: "1 in 100",
  mausholdthree: "1 in 100",
  caterpiecowboyhat: "Yee-haw",
  urshifurapidstrike: "Rapid Strike Style",
  burmysandy: "From Cave Battles",
  burmytrash: "From Indoor Battles",
};
// by species (slug prefix): the note, or null when the label is enough
const VARIANT_KINDS: ReadonlyArray<readonly [RegExp, string | null]> = [
  [/^oricorio/, "Nectar Style"],
  [/^squawkabilly/, null],
  [/^(pumpkaboo|gourgeist)/, null],
  [/^tatsugiri/, null],
  [/^tauros/, null],
];
const REGION_ADJ: Record<string, string> = { Alola: "Alolan", Galar: "Galarian", Hisui: "Hisuian", Paldea: "Paldean" };
export function variantNote(pokemon: Pokemon): string | null {
  if (VARIANT_NOTES[pokemon.name]) return VARIANT_NOTES[pokemon.name];
  if (pokemon.form === "F") return "Female";
  if (pokemon.form && REGION_ADJ[pokemon.form]) return `${REGION_ADJ[pokemon.form]} Form`;
  for (const [pattern, note] of VARIANT_KINDS) if (pattern.test(pokemon.name)) return note;
  return null;
}

export function variantsOf(pokemon: Pokemon): Pokemon[] {
  return (bySpecies.get(pokemon.species) || []).filter(
    (other) => other.id !== pokemon.id && !isTransformation(other),
  );
}

// A transformation's counterparts: the same kind of transformation of the
// species' other variants (Zen ≈ Galar Zen; Single Strike Gmax ≈ Rapid
// Strike Gmax; Magearna Mega ≈ Original Mega).
export function counterpartsOf(pokemon: Pokemon): Pokemon[] {
  if (!isTransformation(pokemon)) return [];
  const kind = formKind(pokemon);
  const base = baseOf(pokemon);
  return (bySpecies.get(pokemon.species) || []).filter(
    (other) => other.id !== pokemon.id && isTransformation(other) && formKind(other) === kind && baseOf(other) !== base,
  );
}

// A gender form shares its base's transformations (Pyroar Female Mega
// Evolves into the same Mega) unless it has its own of that kind.
const sharedFormsOf = (female: Pokemon, base: Pokemon): Pokemon[] => {
  const own = new Set(formsOf(female).map(formKind));
  return formsOf(base).filter((form) => !own.has(formKind(form)));
};
// The gender forms that share a transformation with its base (Meowstic
// Female for Mega Meowstic); empty for anything that isn't one.
export function sharersOf(transformation: Pokemon): Pokemon[] {
  if (!isTransformation(transformation)) return [];
  const base = baseOf(transformation);
  return variantsOf(base).filter(
    (variant) => variant.form === "F" && sharedFormsOf(variant, base).includes(transformation),
  );
}
// The Forms row for a sheet: the Pokémon and the forms that relate to it
// directly (the species and its variants and transformations; for a
// transformation, its base's other transformations and its counterparts),
// ordered by formRank. Empty when there is nothing but itself.
export function formsRow(pokemon: Pokemon): Pokemon[] {
  const species = POKEMON_BY_ID.get(pokemon.species) || pokemon;
  let list: Pokemon[];
  if (isTransformation(pokemon)) {
    const base = baseOf(pokemon);
    list = [base, ...formsOf(base), ...counterpartsOf(pokemon), ...sharersOf(pokemon)];
  } else if (pokemon === species) {
    list = [species, ...formsOf(species), ...variantsOf(species)];
  } else {
    list = [
      species,
      ...variantsOf(species),
      ...formsOf(pokemon),
      ...(pokemon.form === "F" ? sharedFormsOf(pokemon, species) : []),
    ];
  }
  const seen = new Set<number>();
  list = list
    .filter((entry) => !seen.has(entry.id) && seen.add(entry.id))
    .sort((a, b) => formRank(a) - formRank(b) || a.id - b.id);
  return list.length > 1 ? list : [];
}

// Row order: base forms (the species and its variants), then the other
// transformations, then Megas, then Gigantamax, in dex order within each.
export function formRank(pokemon: Pokemon): number {
  if (!isTransformation(pokemon)) return 0;
  if (isMega(pokemon)) return 2;
  if (isGmax(pokemon)) return 3;
  return 1;
}
