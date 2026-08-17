// Alternate forms that are transformations — the same Pokémon switched
// into another shape by an item or a battle state, and back — as opposed
// to variants that are different individuals (regional forms, Tauros
// breeds, Oricorio, Wormadam's cloaks, Partner Pikachu, Minior's colours,
// Squawkabilly, gender forms …). Only the transformations belong beside an
// evolution line: Charizard ⇢ Mega X / Mega Y / Gigantamax. Regional forms
// (and Lycanroc's, Toxtricity's) already sit in the tree via `prevo`.

import { ALL_POKEMON, POKEMON_BY_ID, POKEMON_BY_NAME } from "../data/pokedex.js";

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

// A form of a form attaches to that form, not the species (Galarian
// Darmanitan's Zen Mode; Gigantamax Rapid Strike Urshifu).
const BASE_OF = { darmanitangalarzen: "darmanitangalar", urshifurapidstrikegmax: "urshifurapidstrike" };

const isMega = (p) => /mega$/i.test(p.form || "") || /^Mega-[XYZ]$/.test(p.form || "");
const isGmax = (p) => /gmax$/i.test(p.form || "");

// Whether a record is a transformation of another Pokémon.
export function isTransformation(p) {
  return Boolean(p.form) && (isMega(p) || isGmax(p) || p.name in TRIGGERS);
}

// The Pokémon a transformation is a form of (the record itself otherwise).
export function baseOf(p) {
  if (!isTransformation(p)) return p;
  return POKEMON_BY_NAME.get(BASE_OF[p.name]) || POKEMON_BY_ID.get(p.species) || p;
}

// What switches a Pokémon into this form.
export function formTrigger(p) {
  if (isMega(p)) {
    const species = POKEMON_BY_ID.get(p.species);
    if (species.name === "rayquaza") return "Dragon Ascent";
    const letter = (p.form.match(/-([XYZ])$/) || [])[1];
    return MEGA_STONES[species.displayName] + (letter ? ` ${letter}` : "");
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
  const species = POKEMON_BY_ID.get(p.species);
  const prefix = species.displayName + " ";
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
  dudunsparcethreesegment: "Three-Segment",
};
const VARIANT_KINDS = [
  [/^(alola|galar|hisui|paldea)/i, (form) => `${{ alola: "Alolan", galar: "Galarian", hisui: "Hisuian", paldea: "Paldean" }[form.split("-")[0].toLowerCase()]} Form`],
  [/^(pom-pom|pa'u|sensu)$/i, () => "Nectar Style"],
  [/^(blue|yellow|white)$/i, () => "Plumage"],
  [/^(orange|yellow|green|blue|indigo|violet)$/i, () => "Core Colour"],
  [/^(small|large|super)$/i, () => "Size"],
  [/^(droopy|stretchy|curly)$/i, () => "Form"],
  [/^f$/i, () => "Female"],
];
export function variantNote(p) {
  if (VARIANT_NOTES[p.name]) return VARIANT_NOTES[p.name];
  for (const [re, note] of VARIANT_KINDS) if (re.test(p.form)) return note(p.form);
  return "Alternate Form";
}

const bySpecies = new Map();
for (const p of ALL_POKEMON) {
  if (!bySpecies.has(p.species)) bySpecies.set(p.species, []);
  bySpecies.get(p.species).push(p);
}
export function variantsOf(p) {
  return (bySpecies.get(p.species) || []).filter((q) => q.id !== p.id && !isTransformation(q));
}

// What the base is, where the base itself has a form name the game uses
// (shown under it in the Forms row beside its variants).
const BASE_NOTES = {
  lycanroc: "Midday",
  toxtricity: "Amped",
  dudunsparce: "Two-Segment",
  basculin: "Red-Striped",
  darmanitan: "Standard",
  darmanitangalar: "Standard",
  oricorio: "Baile Style",
  wormadam: "Plant Cloak",
  burmy: "Plant Cloak",
  meowstic: "Male",
  indeedee: "Male",
  basculegion: "Male",
  oinkologne: "Male",
  tatsugiri: "Curly",
  squawkabilly: "Green Plumage",
  pumpkaboo: "Average Size",
  gourgeist: "Average Size",
  urshifu: "Single Strike",
  zygarde: "50%",
  deoxys: "Normal Forme",
  giratina: "Altered",
  shaymin: "Land",
  tornadus: "Incarnate",
  thundurus: "Incarnate",
  landorus: "Incarnate",
  enamorus: "Incarnate",
  keldeo: "Ordinary",
  meloetta: "Aria",
  hoopa: "Confined",
  aegislash: "Shield",
  wishiwashi: "Solo",
  mimikyu: "Disguised",
  eiscue: "Ice Face",
  morpeko: "Full Belly",
  palafin: "Zero",
  ogerpon: "Teal Mask",
  terapagos: "Normal",
  zacian: "Hero of Many Battles",
  zamazenta: "Hero of Many Battles",
  castform: "Normal",
  gimmighoul: "Chest",
};
export function baseNote(p) {
  return BASE_NOTES[p.name] || null;
}
