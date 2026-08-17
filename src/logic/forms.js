// Alternate forms that are transformations — the same Pokémon switched
// into another shape by an item or a battle state, and back — as opposed
// to variants that are different individuals (regional forms, Tauros
// breeds, Oricorio, Wormadam's cloaks, Partner Pikachu, Minior's colours,
// Squawkabilly, gender forms …). Only the transformations belong beside an
// evolution line: Charizard ⇢ Mega X / Mega Y / Gigantamax. Regional forms
// (and Lycanroc's, Toxtricity's) already sit in the tree via `prevo`.

import { ALL_POKEMON, POKEMON_BY_ID } from "../data/pokedex.js";

// Mega Stones (Serebii's Legends: Z-A table — the older ones aren't
// formulaic: Blastoisinite, Alakazite, Lucarionite …), by species name;
// X / Y / Z forms append their letter. Rayquaza needs no stone.
const MEGA_STONES = {
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
const TRIGGERS = {
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

const isMega = (p) => /mega$/i.test(p.form || "") || /^Mega-[XYZ]$/.test(p.form || "");
const isGmax = (p) => /gmax$/i.test(p.form || "");

// Whether a record is a transformation of another Pokémon.
export function isTransformation(p) {
  return Boolean(p.form) && (isMega(p) || isGmax(p) || p.name in TRIGGERS);
}

const bySpecies = new Map();
for (const p of ALL_POKEMON) {
  if (!bySpecies.has(p.species)) bySpecies.set(p.species, []);
  bySpecies.get(p.species).push(p);
}

// The Pokémon a transformation is a form of: the variant whose form its
// own form extends (Galar-Zen → Galarian Darmanitan, Rapid-Strike-Gmax →
// Rapid Strike Urshifu, Droopy-Mega → Droopy Tatsugiri), else the species
// (the record itself when it isn't a transformation).
export function baseOf(p) {
  if (!isTransformation(p)) return p;
  const owner = (bySpecies.get(p.species) || [])
    .filter((v) => !isTransformation(v) && v.form && p.form.startsWith(`${v.form}-`))
    .sort((a, b) => b.form.length - a.form.length)[0];
  return owner || POKEMON_BY_ID.get(p.species) || p;
}

// A transformation's kind, without its base's own form: Galar-Zen → Zen,
// Rapid-Strike-Gmax → Gmax, Curly-Mega / M-Mega → Mega, Mega-X → Mega-X —
// so Zen and Galar Zen, the two Gigantamax Urshifu, or Tatsugiri's three
// Megas are counterparts.
export function formKind(p) {
  if (isMega(p)) return p.form.match(/Mega(-[XYZ])?$/)[0];
  if (isGmax(p)) return "Gmax";
  const base = baseOf(p);
  return base.form && p.form.startsWith(`${base.form}-`) ? p.form.slice(base.form.length + 1) : p.form;
}

// What switches a Pokémon into this form.
export function formTrigger(p) {
  if (isMega(p)) {
    const species = POKEMON_BY_ID.get(p.species);
    if (species.name === "rayquaza") return "Dragon Ascent";
    const letter = (p.form.match(/-([XYZ])$/) || [])[1];
    const stone = MEGA_STONES[p.speciesName || species.displayName];
    return stone ? stone + (letter ? ` ${letter}` : "") : "Mega Stone";
  }
  if (isGmax(p)) return "Gigantamax Factor";
  return TRIGGERS[p.name];
}

const formsByBase = new Map();
for (const p of ALL_POKEMON) {
  if (!isTransformation(p)) continue;
  const base = baseOf(p);
  if (!formsByBase.has(base.id)) formsByBase.set(base.id, []);
  formsByBase.get(base.id).push(p);
}
for (const list of formsByBase.values()) list.sort((a, b) => a.id - b.id);

// The transformations of a Pokémon, in record order (Mega X before Mega Y,
// Megas before Gigantamax).
export function formsOf(p) {
  return formsByBase.get(p.id) || [];
}

// The form's own name, without the species it sits beside: "Mega X",
// "Gmax", "Wash", "Dusk".
export function formLabel(p) {
  const prefix = p.speciesName + " ";
  return p.displayName.startsWith(prefix) ? p.displayName.slice(prefix.length) : p.displayName;
}

// The *variants* of a Pokémon: the other records of its species that
// aren't transformations — regional forms, Own Tempo Rockruff, Partner
// Pikachu, Oricorio's styles, Squawkabilly's plumages, Zarude Dada, the
// female Meowstic … A stage's tree-mates (Alolan Raichu beside Raichu) are
// left out by the caller. What each one is, in a word or two:
const VARIANT_NOTES = {
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
  urshifurapidstrike: "Rapid Strike Style",
  burmysandy: "From Cave Battles",
  burmytrash: "From Indoor Battles",
};
// by species (slug prefix) → note, or null when the label says it all
const VARIANT_KINDS = [
  [/^oricorio/, "Nectar Style"],
  [/^squawkabilly/, null],
  [/^(pumpkaboo|gourgeist)/, null],
  [/^tatsugiri/, null],
  [/^tauros/, null],
];
const REGION_ADJ = { Alola: "Alolan", Galar: "Galarian", Hisui: "Hisuian", Paldea: "Paldean" };
export function variantNote(p) {
  if (VARIANT_NOTES[p.name]) return VARIANT_NOTES[p.name];
  if (p.form === "F") return "Female";
  if (REGION_ADJ[p.form]) return `${REGION_ADJ[p.form]} Form`;
  for (const [re, note] of VARIANT_KINDS) if (re.test(p.name)) return note;
  return null;
}

export function variantsOf(p) {
  return (bySpecies.get(p.species) || []).filter((q) => q.id !== p.id && !isTransformation(q));
}

// A transformation's counterparts: the same kind of transformation of the
// species' other variants (Zen ≈ Galar Zen; Single Strike Gmax ≈ Rapid
// Strike Gmax; Magearna Mega ≈ Original Mega).
export function counterpartsOf(p) {
  if (!isTransformation(p)) return [];
  const kind = formKind(p);
  const base = baseOf(p);
  return (bySpecies.get(p.species) || []).filter(
    (q) => q.id !== p.id && isTransformation(q) && formKind(q) === kind && baseOf(q) !== base
  );
}

// The Forms row for a sheet: the Pokémon and the forms that relate to it
// directly, in dex order, as one flat list —
//   the species base S:  S, its transformations, its variants
//   a variant V:         S, the variants, V's transformations (a gender
//                        form shares S's: Pyroar Female lists Pyroar Mega)
//   a transformation T:  T's base, that base's transformations, T's
//                        counterparts (the same kind on other variants)
// so Darmanitan lists Zen and Galarian Darmanitan (not Galar Zen); Zen
// lists Darmanitan and Galar Zen; Galarian Darmanitan lists Darmanitan and
// Galar Zen; Charizard Mega X lists Charizard, Mega X, Mega Y, Gmax;
// every Lycanroc lists all three. Empty when there's nothing but itself.
// A gender form (Pyroar Female) shares its base's transformations — she
// Mega Evolves into the same Mega Pyroar — unless she has her own of that
// kind (Meowstic Female has her own Mega); those rows list each other.
const sharedFormsOf = (female, base) => {
  const own = new Set(formsOf(female).map(formKind));
  return formsOf(base).filter((f) => !own.has(formKind(f)));
};
const genderMatesOf = (t) => {
  const B = baseOf(t);
  return variantsOf(B).filter((v) => v.form === "F" && sharedFormsOf(v, B).includes(t));
};
export function formsRow(p) {
  const S = POKEMON_BY_ID.get(p.species) || p;
  let list;
  if (isTransformation(p)) {
    const B = baseOf(p);
    list = [B, ...formsOf(B), ...counterpartsOf(p), ...genderMatesOf(p)];
  } else if (p === S) {
    list = [S, ...formsOf(S), ...variantsOf(S)];
  } else {
    list = [S, ...variantsOf(S), ...formsOf(p), ...(p.form === "F" ? sharedFormsOf(p, S) : [])];
  }
  const seen = new Set();
  list = list.filter((q) => !seen.has(q.id) && seen.add(q.id)).sort((a, b) => a.id - b.id);
  return list.length > 1 ? list : [];
}
