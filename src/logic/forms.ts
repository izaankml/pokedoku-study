// Alternate forms that are transformations — the same Pokémon switched
// into another shape by an item or a battle state, and back — as opposed
// to variants that are different individuals (regional forms, Tauros
// breeds, Oricorio, Wormadam's cloaks, Partner Pikachu, Minior's colours,
// Squawkabilly, gender forms …). Only the transformations belong beside an
// evolution line: Charizard ⇢ Mega X / Mega Y / Gigantamax. Regional forms
// (and Lycanroc's, Toxtricity's) already sit in the tree via `prevo`.

import { ALL_POKEMON, POKEMON_BY_ID } from "../data/pokedex.ts";
import type { Pokemon } from "../data/types.ts";

// Mega Stones (Serebii's Legends: Z-A table — the older ones aren't
// formulaic: Blastoisinite, Alakazite, Lucarionite …), by species name;
// X / Y / Z forms append their letter. Rayquaza needs no stone.
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
// Rapid-Strike-Gmax → Gmax, Curly-Mega / M-Mega → Mega, Mega-X → Mega-X —
// so Zen and Galar Zen, the two Gigantamax Urshifu, or Tatsugiri's three
// Megas are counterparts.
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

// The *variants* of a Pokémon: the other records of its species that
// aren't transformations — regional forms, Own Tempo Rockruff, Partner
// Pikachu, Oricorio's styles, Squawkabilly's plumages, Zarude Dada, the
// female Meowstic … A stage's tree-mates (Alolan Raichu beside Raichu) are
// left out by the caller. What each one is, in a word or two:
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
// by species (slug prefix) → note, or null when the label says it all
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

// The Forms row for a sheet: the Pokémon and the forms that relate to it
// directly, as one flat list (base forms, then transformations, Megas,
// Gigantamax — see formRank) —
//   the species base S:  S, its transformations, its variants
//   a variant V:         S, the variants, V's transformations (a gender
//                        form shares S's: Pyroar Female lists Pyroar Mega)
//   a transformation T:  T's base, that base's transformations, T's
//                        counterparts (the same kind on other variants)
// so Darmanitan lists Zen and Galarian Darmanitan (not Galar Zen); Zen
// lists Darmanitan and Galar Zen; Galarian Darmanitan lists Darmanitan and
// Galar Zen; Charizard Mega X lists Charizard, Mega X, Mega Y, Gmax;
// every Lycanroc lists all three. Empty when there's nothing but itself.
// A gender form (Pyroar Female, Meowstic Female) shares its base's
// transformations — she Mega Evolves into the same Mega — unless she has
// her own of that kind; those rows list each other.
const sharedFormsOf = (female: Pokemon, base: Pokemon): Pokemon[] => {
  const own = new Set(formsOf(female).map(formKind));
  return formsOf(base).filter((form) => !own.has(formKind(form)));
};
const genderMatesOf = (transformation: Pokemon): Pokemon[] => {
  const base = baseOf(transformation);
  return variantsOf(base).filter(
    (variant) => variant.form === "F" && sharedFormsOf(variant, base).includes(transformation),
  );
};
export function formsRow(pokemon: Pokemon): Pokemon[] {
  const species = POKEMON_BY_ID.get(pokemon.species) || pokemon;
  let list: Pokemon[];
  if (isTransformation(pokemon)) {
    const base = baseOf(pokemon);
    list = [base, ...formsOf(base), ...counterpartsOf(pokemon), ...genderMatesOf(pokemon)];
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
// transformations (Zen, Primal, Origin …), then Megas, then Gigantamax —
// dex order within each.
export function formRank(pokemon: Pokemon): number {
  if (!isTransformation(pokemon)) return 0;
  if (isMega(pokemon)) return 2;
  if (isGmax(pokemon)) return 3;
  return 1;
}
