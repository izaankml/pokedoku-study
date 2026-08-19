// Moves and abilities PokeDoku uses as categories ("Learns Earthquake",
// "Has Intimidate"). Shared by the dataset build script and the category
// definitions so the two can't drift. The list is the union of what
// PokeDoku's frontend links to and what pokedoku-helper.com has seen in
// puzzles; PokeDoku can add more at any time.

export interface Trait {
  id: string;
  name: string;
}

const trait = ([id, name]: readonly [string, string]): Trait => ({ id, name });

export const MOVES: Trait[] = (
  [
    ["acrobatics", "Acrobatics"],
    ["brickbreak", "Brick Break"],
    ["calmmind", "Calm Mind"],
    ["closecombat", "Close Combat"],
    ["crunch", "Crunch"],
    ["dazzlinggleam", "Dazzling Gleam"],
    ["dragonrage", "Dragon Rage"],
    ["earthquake", "Earthquake"],
    ["flamethrower", "Flamethrower"],
    ["fly", "Fly"],
    ["hydropump", "Hydro Pump"],
    ["icebeam", "Ice Beam"],
    ["icepunch", "Ice Punch"],
    ["metronome", "Metronome"],
    ["protect", "Protect"],
    ["psychic", "Psychic"],
    ["razorleaf", "Razor Leaf"],
    ["shadowball", "Shadow Ball"],
    ["sludgebomb", "Sludge Bomb"],
    ["surf", "Surf"],
    ["tailslap", "Tail Slap"],
    ["thunderbolt", "Thunderbolt"],
  ] as const
).map(trait);

export const ABILITIES: Trait[] = (
  [
    ["intimidate", "Intimidate"],
    ["keeneye", "Keen Eye"],
    ["levitate", "Levitate"],
    ["sturdy", "Sturdy"],
    ["swiftswim", "Swift Swim"],
  ] as const
).map(trait);
