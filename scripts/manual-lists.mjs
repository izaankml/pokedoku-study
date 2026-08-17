// Membership that cannot be derived from @pkmn/dex data alone.
// All ids are national dex numbers.

// PokeAPI is_baby (19)
export const BABY_IDS = new Set([
  172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 433, 438, 439, 440,
  446, 447, 458, 848,
]);

// First-partner base forms (Bulbasaur..Sprigatito lines). Expanded to whole
// evolution lines by the build script. The Let's Go Partner Pikachu/Eevee
// forms are first partners too (PokeDoku counts them) — see FORM_IDS.
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
// species (Hisuian Growlithe etc.) do not relocate the species — they get
// their own records instead (see FORM_IDS).
export const HISUI_IDS = new Set([899, 900, 901, 902, 903, 904, 905]);

// Gen-8 forms that debuted in Legends: Arceus but are not named "-Hisui"
// and do not belong to a Hisui species (keys are dex ids/slugs).
export const HISUI_FORM_IDS = new Set([
  "basculinwhitestriped",
  "dialgaorigin",
  "palkiaorigin",
]);

// Evolution methods a Pokémon counts for, where they can't be read off the
// dex evoType (keys are dex ids/slugs). PokeDoku counts every method that
// works in some core game, so a Pokémon can have several. Sources: PokeDoku's
// notes and pokedoku-helper.com's PokeAPI-derived data.
// - Linking Cord (Legends: Arceus) makes the classic trade evolutions also
//   count as item.
// - Modern games swapped some location/level evolutions for stones or made
//   held items usable, so those count as item AND level.
// - dex "other" methods: PokeAPI files most as level-up (Rage Fist, 999 coins,
//   1000 steps, recoil...), a few as item (Sweets, Towers), and three as
//   nothing at all (critical hits, taking damage, agile-style moves).
export const EVO_METHOD_OVERRIDES = {
  alakazam: ["trade", "item"],
  machamp: ["trade", "item"],
  golem: ["trade", "item"],
  gengar: ["trade", "item"],
  sylveon: ["friendship", "level"],
  magnezone: ["item", "level"],
  probopass: ["item", "level"],
  vikavolt: ["item", "level"],
  crabominable: ["item", "level"],
  leafeon: ["item", "stone", "level"],
  glaceon: ["item", "stone", "level"],
  milotic: ["trade", "item", "level"],
  ursaluna: ["item"],
  shedinja: ["level"],
  basculegion: ["level"],
  basculegionf: ["level"],
  overqwil: ["level"],
  pawmot: ["level"],
  rabsca: ["level"],
  brambleghast: ["level"],
  annihilape: ["level"],
  kingambit: ["level"],
  gholdengo: ["level"],
  alcremie: ["item"],
  urshifu: ["item"],
  urshifurapidstrike: ["item"],
  sirfetchd: [],
  runerigus: [],
  wyrdeer: [],
  melmetal: [], // Meltan Candy in GO; no in-game method
};

// The item behind an item evolution where the dex doesn't name one
// (dex ids/slugs -> item). Everything else comes from the dex's evoItem.
export const EVO_ITEM_OVERRIDES = {
  alakazam: "Linking Cord",
  machamp: "Linking Cord",
  golem: "Linking Cord",
  gengar: "Linking Cord",
  probopass: "Thunder Stone",
  kleavor: "Black Augurite",
  ursaluna: "Peat Block",
  alcremie: "a Sweet",
  urshifu: "Scroll of Darkness",
  urshifurapidstrike: "Scroll of Waters",
};

// How a Pokémon evolves, in words, where the dex's fields don't tell the
// whole story (dex ids/slugs -> text). Everything else is composed from
// evoType/evoLevel/evoItem/evoMove/evoCondition by the build script.
export const EVO_DETAIL_OVERRIDES = {
  alakazam: "Trade, or use a Linking Cord",
  machamp: "Trade, or use a Linking Cord",
  golem: "Trade, or use a Linking Cord",
  gengar: "Trade, or use a Linking Cord",
  magnezone: "Use a Thunder Stone, or level up in a special magnetic field",
  probopass: "Level up in a special magnetic field, or use a Thunder Stone",
  vikavolt: "Use a Thunder Stone, or level up in a special magnetic field",
  crabominable: "Use an Ice Stone, or level up at Mount Lanakila",
  leafeon: "Use a Leaf Stone, or level up near a Moss Rock",
  glaceon: "Use an Ice Stone, or level up near an Ice Rock",
  milotic: "Trade holding a Prism Scale, or level up with max Beauty",
  sylveon: "High friendship while knowing a Fairy-type move",
  ursaluna: "Use a Peat Block during a full moon",
  alcremie: "Spin while holding a Sweet",
  shedinja: "Evolve Nincada with an empty party slot and a Poké Ball",
  melmetal: "Meltan Candy (Pokémon GO)",
  kleavor: "Use a Black Augurite",
};

// Evolution links the dex is missing (child slug -> parent species name).
export const PREVO_OVERRIDES = {
  melmetal: "Meltan",
  lycanrocdusk: "Rockruff-Dusk", // Dusk Lycanroc comes from Own Tempo Rockruff, a form of its own
  // a form keeps its form when it evolves (PokeDoku lists these Burmy, Shellos
  // and Deerling forms as entries of their own — see POKEDOKU_FORM_IDS)
  wormadamsandy: "Burmy-Sandy",
  wormadamtrash: "Burmy-Trash",
  gastrodoneast: "Shellos-East",
};

// Species PokeDoku assigns no region at all (Meltan and Melmetal come from
// Pokémon GO / Let's Go and are neither Alola nor Galar).
export const NO_REGION_IDS = new Set([808, 809]);

// Forms whose debut region isn't the one their generation implies (dex ids/
// slugs -> region). PokeDoku counts these for both the base region and the
// debut region: Deoxys' Attack/Defense formes debuted in FireRed/LeafGreen
// (Kanto), Hoopa Unbound in Omega Ruby/Alpha Sapphire (Hoenn).
export const FORM_DEBUT_REGION_OVERRIDES = {
  deoxysattack: "kanto",
  deoxysdefense: "kanto",
  hoopaunbound: "hoenn",
};
// Showdown spells these with -F/-M suffixes; form names keep the hyphens
// the generic "Base (Forme)" formatter would turn into spaces
export const DISPLAY_NAME_OVERRIDES = {
  nidoranf: "Nidoran♀",
  nidoranm: "Nidoran♂",
  basculinwhitestriped: "Basculin (White-Striped)",
  oricoriopompom: "Oricorio (Pom-Pom)",
  greninjaash: "Ash-Greninja",
  rockruffdusk: "Rockruff (Own Tempo)",
  pikachustarter: "Partner Pikachu",
  eeveestarter: "Partner Eevee",
  toxtricitygmax: "Gigantamax Toxtricity",
  toxtricitylowkeygmax: "Gigantamax Toxtricity (Low Key)",
  urshifugmax: "Gigantamax Urshifu",
  urshifurapidstrikegmax: "Gigantamax Urshifu (Rapid Strike)",
};

// Alternate forms that can get their own dataset record, mapped from their
// @pkmn/dex id to the PokeAPI id PokeDoku uses for them (which is also the
// sprite id). This is the intersection of @pkmn/dex formes and PokeDoku's
// visible answer list (api.pokedoku.com/api/pokemon/all), minus Totems and
// PokeDoku's own cosmetic pseudo-ids (90000+: seasons, genders, cloaks),
// which have no PokeAPI sprite and no category difference.
// The build script drops any form here whose category profile is a subset
// of its base species' (e.g. Kyurem-Black, Lycanroc Midnight) — those never
// answer a cell the base species doesn't. Mega and Gigantamax forms always
// stay: in PokeDoku they are the answers to the Mega/Gigantamax categories.
export const FORM_IDS = {
  venusaurmega: 10033, // Venusaur-Mega
  charizardmegax: 10034, // Charizard-Mega-X
  charizardmegay: 10035, // Charizard-Mega-Y
  blastoisemega: 10036, // Blastoise-Mega
  beedrillmega: 10090, // Beedrill-Mega
  pidgeotmega: 10073, // Pidgeot-Mega
  rattataalola: 10091, // Rattata-Alola
  raticatealola: 10092, // Raticate-Alola
  raichualola: 10100, // Raichu-Alola
  raichumegax: 10304, // Raichu-Mega-X
  raichumegay: 10305, // Raichu-Mega-Y
  sandshrewalola: 10101, // Sandshrew-Alola
  sandslashalola: 10102, // Sandslash-Alola
  clefablemega: 10278, // Clefable-Mega
  vulpixalola: 10103, // Vulpix-Alola
  ninetalesalola: 10104, // Ninetales-Alola
  diglettalola: 10105, // Diglett-Alola
  dugtrioalola: 10106, // Dugtrio-Alola
  meowthalola: 10107, // Meowth-Alola
  meowthgalar: 10161, // Meowth-Galar
  persianalola: 10108, // Persian-Alola
  growlithehisui: 10229, // Growlithe-Hisui
  arcaninehisui: 10230, // Arcanine-Hisui
  alakazammega: 10037, // Alakazam-Mega
  victreebelmega: 10279, // Victreebel-Mega
  geodudealola: 10109, // Geodude-Alola
  graveleralola: 10110, // Graveler-Alola
  golemalola: 10111, // Golem-Alola
  ponytagalar: 10162, // Ponyta-Galar
  rapidashgalar: 10163, // Rapidash-Galar
  slowpokegalar: 10164, // Slowpoke-Galar
  slowbromega: 10071, // Slowbro-Mega
  slowbrogalar: 10165, // Slowbro-Galar
  farfetchdgalar: 10166, // Farfetch’d-Galar
  grimeralola: 10112, // Grimer-Alola
  mukalola: 10113, // Muk-Alola
  gengarmega: 10038, // Gengar-Mega
  voltorbhisui: 10231, // Voltorb-Hisui
  electrodehisui: 10232, // Electrode-Hisui
  exeggutoralola: 10114, // Exeggutor-Alola
  marowakalola: 10115, // Marowak-Alola
  weezinggalar: 10167, // Weezing-Galar
  kangaskhanmega: 10039, // Kangaskhan-Mega
  starmiemega: 10280, // Starmie-Mega
  mrmimegalar: 10168, // Mr. Mime-Galar
  pinsirmega: 10040, // Pinsir-Mega
  taurospaldeacombat: 10250, // Tauros-Paldea-Combat
  taurospaldeablaze: 10251, // Tauros-Paldea-Blaze
  taurospaldeaaqua: 10252, // Tauros-Paldea-Aqua
  gyaradosmega: 10041, // Gyarados-Mega
  aerodactylmega: 10042, // Aerodactyl-Mega
  articunogalar: 10169, // Articuno-Galar
  zapdosgalar: 10170, // Zapdos-Galar
  moltresgalar: 10171, // Moltres-Galar
  dragonitemega: 10281, // Dragonite-Mega
  mewtwomegax: 10043, // Mewtwo-Mega-X
  mewtwomegay: 10044, // Mewtwo-Mega-Y
  meganiummega: 10282, // Meganium-Mega
  typhlosionhisui: 10233, // Typhlosion-Hisui
  feraligatrmega: 10283, // Feraligatr-Mega
  ampharosmega: 10045, // Ampharos-Mega
  wooperpaldea: 10253, // Wooper-Paldea
  // PokeDoku's own entries (ids 90000 + dex number) for cosmetic forms
  // PokeAPI doesn't split out; they cover nothing new, so they're
  // display-only records, sprites from PokeDoku's CDN
  burmysandy: 90412, // burmy-sandy-cloak
  burmytrash: 91412, // burmy-trash-cloak
  cherrimsunshine: 90421, // cherrim-sunshine
  shelloseast: 90422, // shellos-east
  gastrodoneast: 90423, // gastrodon-east
  deerlingsummer: 91585, // deerling-summer
  deerlingautumn: 90585, // deerling-autumn
  deerlingwinter: 92585, // deerling-winter (Sawsbuck's seasons aren't dex formes: see CLONED_FORMS)

  slowkinggalar: 10172, // Slowking-Galar
  steelixmega: 10072, // Steelix-Mega
  qwilfishhisui: 10234, // Qwilfish-Hisui
  scizormega: 10046, // Scizor-Mega
  heracrossmega: 10047, // Heracross-Mega
  sneaselhisui: 10235, // Sneasel-Hisui
  corsolagalar: 10173, // Corsola-Galar
  skarmorymega: 10284, // Skarmory-Mega
  houndoommega: 10048, // Houndoom-Mega
  tyranitarmega: 10049, // Tyranitar-Mega
  sceptilemega: 10065, // Sceptile-Mega
  blazikenmega: 10050, // Blaziken-Mega
  swampertmega: 10064, // Swampert-Mega
  zigzagoongalar: 10174, // Zigzagoon-Galar
  linoonegalar: 10175, // Linoone-Galar
  gardevoirmega: 10051, // Gardevoir-Mega
  sableyemega: 10066, // Sableye-Mega
  mawilemega: 10052, // Mawile-Mega
  aggronmega: 10053, // Aggron-Mega
  medichammega: 10054, // Medicham-Mega
  manectricmega: 10055, // Manectric-Mega
  sharpedomega: 10070, // Sharpedo-Mega
  cameruptmega: 10087, // Camerupt-Mega
  altariamega: 10067, // Altaria-Mega
  castformsunny: 10013, // Castform-Sunny
  castformrainy: 10014, // Castform-Rainy
  castformsnowy: 10015, // Castform-Snowy
  banettemega: 10056, // Banette-Mega
  chimechomega: 10306, // Chimecho-Mega
  absolmega: 10057, // Absol-Mega
  absolmegaz: 10307, // Absol-Mega-Z
  glaliemega: 10074, // Glalie-Mega
  salamencemega: 10089, // Salamence-Mega
  metagrossmega: 10076, // Metagross-Mega
  latiasmega: 10062, // Latias-Mega
  latiosmega: 10063, // Latios-Mega
  kyogreprimal: 10077, // Kyogre-Primal
  groudonprimal: 10078, // Groudon-Primal
  rayquazamega: 10079, // Rayquaza-Mega
  deoxysattack: 10001, // Deoxys-Attack
  deoxysdefense: 10002, // Deoxys-Defense
  deoxysspeed: 10003, // Deoxys-Speed
  staraptormega: 10308, // Staraptor-Mega
  wormadamsandy: 10004, // Wormadam-Sandy
  wormadamtrash: 10005, // Wormadam-Trash
  lopunnymega: 10088, // Lopunny-Mega
  garchompmega: 10058, // Garchomp-Mega
  garchompmegaz: 10309, // Garchomp-Mega-Z
  lucariomega: 10059, // Lucario-Mega
  lucariomegaz: 10310, // Lucario-Mega-Z
  abomasnowmega: 10060, // Abomasnow-Mega
  gallademega: 10068, // Gallade-Mega
  froslassmega: 10285, // Froslass-Mega
  rotomheat: 10008, // Rotom-Heat
  rotomwash: 10009, // Rotom-Wash
  rotomfrost: 10010, // Rotom-Frost
  rotomfan: 10011, // Rotom-Fan
  rotommow: 10012, // Rotom-Mow
  dialgaorigin: 10245, // Dialga-Origin
  palkiaorigin: 10246, // Palkia-Origin
  heatranmega: 10311, // Heatran-Mega
  giratinaorigin: 10007, // Giratina-Origin
  darkraimega: 10312, // Darkrai-Mega
  shayminsky: 10006, // Shaymin-Sky
  emboarmega: 10286, // Emboar-Mega
  samurotthisui: 10236, // Samurott-Hisui
  excadrillmega: 10287, // Excadrill-Mega
  audinomega: 10069, // Audino-Mega
  scolipedemega: 10288, // Scolipede-Mega
  lilliganthisui: 10237, // Lilligant-Hisui
  basculinbluestriped: 10016, // Basculin-Blue-Striped
  basculinwhitestriped: 10247, // Basculin-White-Striped
  darumakagalar: 10176, // Darumaka-Galar
  darmanitanzen: 10017, // Darmanitan-Zen
  darmanitangalar: 10177, // Darmanitan-Galar
  darmanitangalarzen: 10178, // Darmanitan-Galar-Zen
  scraftymega: 10289, // Scrafty-Mega
  yamaskgalar: 10179, // Yamask-Galar
  zoruahisui: 10238, // Zorua-Hisui
  zoroarkhisui: 10239, // Zoroark-Hisui
  eelektrossmega: 10290, // Eelektross-Mega
  chandeluremega: 10291, // Chandelure-Mega
  stunfiskgalar: 10180, // Stunfisk-Galar
  golurkmega: 10313, // Golurk-Mega
  braviaryhisui: 10240, // Braviary-Hisui
  tornadustherian: 10019, // Tornadus-Therian
  thundurustherian: 10020, // Thundurus-Therian
  landorustherian: 10021, // Landorus-Therian
  kyuremblack: 10022, // Kyurem-Black
  kyuremwhite: 10023, // Kyurem-White
  keldeoresolute: 10024, // Keldeo-Resolute
  meloettapirouette: 10018, // Meloetta-Pirouette
  chesnaughtmega: 10292, // Chesnaught-Mega
  delphoxmega: 10293, // Delphox-Mega
  greninjaash: 10117, // Greninja-Ash
  greninjamega: 10294, // Greninja-Mega
  pyroarmega: 10295, // Pyroar-Mega
  floetteeternal: 10061, // Floette-Eternal
  floettemega: 10296, // Floette-Mega
  meowsticf: 10025, // Meowstic-F
  meowsticmmega: 10314, // Meowstic-M-Mega
  meowsticfmega: 10326, // Meowstic-F-Mega (Legends Z-A; PokeDoku lists it hidden)
  aegislashblade: 10026, // Aegislash-Blade
  malamarmega: 10297, // Malamar-Mega
  barbaraclemega: 10298, // Barbaracle-Mega
  dragalgemega: 10299, // Dragalge-Mega
  hawluchamega: 10300, // Hawlucha-Mega
  sliggoohisui: 10241, // Sliggoo-Hisui
  goodrahisui: 10242, // Goodra-Hisui
  pumpkaboosmall: 10027, // Pumpkaboo-Small
  pumpkaboolarge: 10028, // Pumpkaboo-Large
  pumpkaboosuper: 10029, // Pumpkaboo-Super
  gourgeistsmall: 10030, // Gourgeist-Small
  gourgeistlarge: 10031, // Gourgeist-Large
  gourgeistsuper: 10032, // Gourgeist-Super
  avalugghisui: 10243, // Avalugg-Hisui
  zygarde10: 10118, // Zygarde-10%
  zygardecomplete: 10120, // Zygarde-Complete
  zygardemega: 10301, // Zygarde-Mega
  dianciemega: 10075, // Diancie-Mega
  hoopaunbound: 10086, // Hoopa-Unbound
  decidueyehisui: 10244, // Decidueye-Hisui
  crabominablemega: 10315, // Crabominable-Mega
  oricoriopompom: 10123, // Oricorio-Pom-Pom
  oricoriopau: 10124, // Oricorio-Pa'u
  oricoriosensu: 10125, // Oricorio-Sensu
  rockruffdusk: 10151, // Rockruff-Own-Tempo (the dex calls it Rockruff-Dusk)
  lycanrocmidnight: 10126, // Lycanroc-Midnight
  lycanrocdusk: 10152, // Lycanroc-Dusk
  wishiwashischool: 10127, // Wishiwashi-School
  golisopodmega: 10316, // Golisopod-Mega
  miniororange: 10137, // Minior-Orange
  minioryellow: 10138, // Minior-Yellow
  miniorgreen: 10139, // Minior-Green
  miniorblue: 10140, // Minior-Blue
  miniorindigo: 10141, // Minior-Indigo
  miniorviolet: 10142, // Minior-Violet
  mimikyubusted: 10143, // Mimikyu-Busted
  drampamega: 10302, // Drampa-Mega
  necrozmaduskmane: 10155, // Necrozma-Dusk-Mane
  necrozmadawnwings: 10156, // Necrozma-Dawn-Wings
  necrozmaultra: 10157, // Necrozma-Ultra
  magearnaoriginal: 10147, // Magearna-Original
  magearnamega: 10317, // Magearna-Mega
  magearnaoriginalmega: 10318, // Magearna-Original-Mega
  zeraoramega: 10319, // Zeraora-Mega
  toxtricitylowkey: 10184, // Toxtricity-Low-Key
  falinksmega: 10303, // Falinks-Mega
  eiscuenoice: 10185, // Eiscue-Noice
  indeedeef: 10186, // Indeedee-F
  cramorantgulping: 10182, // Cramorant-Gulping
  cramorantgorging: 10183, // Cramorant-Gorging
  morpekohangry: 10187, // Morpeko-Hangry
  zaciancrowned: 10188, // Zacian-Crowned
  zamazentacrowned: 10189, // Zamazenta-Crowned
  eternatuseternamax: 10190, // Eternatus-Eternamax
  urshifurapidstrike: 10191, // Urshifu-Rapid-Strike
  zarudedada: 10192, // Zarude-Dada
  calyrexice: 10193, // Calyrex-Ice
  calyrexshadow: 10194, // Calyrex-Shadow
  ursalunabloodmoon: 10272, // Ursaluna-Bloodmoon
  basculegionf: 10248, // Basculegion-F
  enamorustherian: 10249, // Enamorus-Therian
  oinkolognef: 10254, // Oinkologne-F
  squawkabillyblue: 10260, // Squawkabilly-Blue
  squawkabillyyellow: 10261, // Squawkabilly-Yellow
  squawkabillywhite: 10262, // Squawkabilly-White
  scovillainmega: 10320, // Scovillain-Mega
  palafinhero: 10256, // Palafin-Hero
  glimmoramega: 10321, // Glimmora-Mega
  tatsugiridroopy: 10258, // Tatsugiri-Droopy
  tatsugiristretchy: 10259, // Tatsugiri-Stretchy
  tatsugiricurlymega: 10322, // Tatsugiri-Curly-Mega
  tatsugiridroopymega: 10323, // Tatsugiri-Droopy-Mega
  tatsugiristretchymega: 10324, // Tatsugiri-Stretchy-Mega
  dudunsparcethreesegment: 10255, // Dudunsparce-Three-Segment
  baxcaliburmega: 10325, // Baxcalibur-Mega
  gimmighoulroaming: 10263, // Gimmighoul-Roaming
  ogerponwellspring: 10273, // Ogerpon-Wellspring
  ogerponhearthflame: 10274, // Ogerpon-Hearthflame
  ogerponcornerstone: 10275, // Ogerpon-Cornerstone
  terapagosterastal: 10276, // Terapagos-Terastal
  terapagosstellar: 10277, // Terapagos-Stellar
  // Gigantamax forms and Let's Go partners
  venusaurgmax: 10195, // Venusaur-Gmax
  charizardgmax: 10196, // Charizard-Gmax
  blastoisegmax: 10197, // Blastoise-Gmax
  butterfreegmax: 10198, // Butterfree-Gmax
  pikachustarter: 10158, // Pikachu-Starter
  pikachugmax: 10199, // Pikachu-Gmax
  meowthgmax: 10200, // Meowth-Gmax
  machampgmax: 10201, // Machamp-Gmax
  gengargmax: 10202, // Gengar-Gmax
  kinglergmax: 10203, // Kingler-Gmax
  laprasgmax: 10204, // Lapras-Gmax
  eeveestarter: 10159, // Eevee-Starter
  eeveegmax: 10205, // Eevee-Gmax
  snorlaxgmax: 10206, // Snorlax-Gmax
  garbodorgmax: 10207, // Garbodor-Gmax
  melmetalgmax: 10208, // Melmetal-Gmax
  rillaboomgmax: 10209, // Rillaboom-Gmax
  cinderacegmax: 10210, // Cinderace-Gmax
  inteleongmax: 10211, // Inteleon-Gmax
  corviknightgmax: 10212, // Corviknight-Gmax
  orbeetlegmax: 10213, // Orbeetle-Gmax
  drednawgmax: 10214, // Drednaw-Gmax
  coalossalgmax: 10215, // Coalossal-Gmax
  flapplegmax: 10216, // Flapple-Gmax
  appletungmax: 10217, // Appletun-Gmax
  sandacondagmax: 10218, // Sandaconda-Gmax
  toxtricitygmax: 10219, // Toxtricity-Gmax
  toxtricitylowkeygmax: 10228, // Toxtricity-Low-Key-Gmax
  centiskorchgmax: 10220, // Centiskorch-Gmax
  hatterenegmax: 10221, // Hatterene-Gmax
  grimmsnarlgmax: 10222, // Grimmsnarl-Gmax
  alcremiegmax: 10223, // Alcremie-Gmax
  copperajahgmax: 10224, // Copperajah-Gmax
  duraludongmax: 10225, // Duraludon-Gmax
  urshifurapidstrikegmax: 10227, // Urshifu-Rapid-Strike-Gmax
  urshifugmax: 10226, // Urshifu-Gmax (Single Strike)
};

// PokeDoku also lists, as entries of its own (ids 90000 + dex number), the
// female of the gender-dimorphic species and Sawsbuck's seasons; the dex
// has no forme for these, so the builder clones the species record — same
// everything, with this form — as a display-only record. `prevo` is the
// record id of the pre-evolution's matching form where there is one, else
// the species' own pre-evolution.
export const CLONED_FORMS = [
  { id: 90449, species: 449, name: "hippopotasf", form: "F" },
  { id: 90450, species: 450, name: "hippowdonf", form: "F", prevo: 90449 },
  { id: 90521, species: 521, name: "unfezantf", form: "F", prevo: 520 },
  { id: 90592, species: 592, name: "frillishf", form: "F" },
  { id: 90593, species: 593, name: "jellicentf", form: "F", prevo: 90592 },
  { id: 90668, species: 668, name: "pyroarf", form: "F", prevo: 667 },
  { id: 10136, species: 774, name: "miniorred", form: "Red" }, // Minior's red core (the dex's base Minior is the meteor)
  { id: 91586, species: 586, name: "sawsbucksummer", form: "Summer", prevo: 91585 },
  { id: 90586, species: 586, name: "sawsbuckautumn", form: "Autumn", prevo: 90585 },
  { id: 92586, species: 586, name: "sawsbuckwinter", form: "Winter", prevo: 92585 },
];
