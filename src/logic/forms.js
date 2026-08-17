// Alternate forms that are transformations — the same Pokémon switched
// into another shape by an item or a battle state, and back — as opposed
// to variants that are different individuals (regional forms, Tauros
// breeds, Oricorio, Wormadam's cloaks, Partner Pikachu …). Only the
// transformations belong beside an evolution line: Charizard ⇢ Mega X /
// Mega Y / Gigantamax. Regional forms already sit in the tree via `prevo`.

import { POKEMON, POKEMON_BY_ID, POKEMON_BY_NAME } from "../data/pokedex.js";

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
for (const p of POKEMON) {
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
