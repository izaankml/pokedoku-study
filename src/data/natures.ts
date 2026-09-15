// The 25 natures and the stat each raises and lowers (by 10%). The five
// neutral natures change nothing.

export const STAT_NAMES = ["attack", "defense", "spAttack", "spDefense", "speed"] as const;
export type StatName = (typeof STAT_NAMES)[number];

// "Special Attack" in full, "Sp. Atk" on a pad button
export const STAT_LABELS: Record<StatName, { label: string; short: string }> = {
  attack: { label: "Attack", short: "Attack" },
  defense: { label: "Defense", short: "Defense" },
  spAttack: { label: "Special Attack", short: "Sp. Atk" },
  spDefense: { label: "Special Defense", short: "Sp. Def" },
  speed: { label: "Speed", short: "Speed" },
};

export interface Nature {
  // the name in lower case ("adamant"): the card's id and stats key
  id: string;
  name: string;
  raised: StatName | null;
  lowered: StatName | null;
}

const nature = (name: string, raised: StatName | null, lowered: StatName | null): Nature => ({
  id: name.toLowerCase(),
  name,
  raised,
  lowered,
});

// In the order of the in-game table: by the raised stat, then the
// lowered one, with the neutral natures last.
export const NATURES: Nature[] = [
  nature("Lonely", "attack", "defense"),
  nature("Adamant", "attack", "spAttack"),
  nature("Naughty", "attack", "spDefense"),
  nature("Brave", "attack", "speed"),
  nature("Bold", "defense", "attack"),
  nature("Impish", "defense", "spAttack"),
  nature("Lax", "defense", "spDefense"),
  nature("Relaxed", "defense", "speed"),
  nature("Modest", "spAttack", "attack"),
  nature("Mild", "spAttack", "defense"),
  nature("Rash", "spAttack", "spDefense"),
  nature("Quiet", "spAttack", "speed"),
  nature("Calm", "spDefense", "attack"),
  nature("Gentle", "spDefense", "defense"),
  nature("Careful", "spDefense", "spAttack"),
  nature("Sassy", "spDefense", "speed"),
  nature("Timid", "speed", "attack"),
  nature("Hasty", "speed", "defense"),
  nature("Jolly", "speed", "spAttack"),
  nature("Naive", "speed", "spDefense"),
  nature("Hardy", null, null),
  nature("Docile", null, null),
  nature("Bashful", null, null),
  nature("Quirky", null, null),
  nature("Serious", null, null),
];

export const NATURE_BY_ID = new Map<string, Nature>(NATURES.map((each) => [each.id, each]));
