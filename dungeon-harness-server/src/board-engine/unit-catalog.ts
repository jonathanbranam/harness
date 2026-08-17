// Hand-transcribed from
// track-web/client-games/src/games/dungeon-tactics-solo/unitDefs.ts at the
// time this module was written. Not a runtime read of that file (see
// design.md's "Hand-copied, hardcoded archetype catalog" decision) — if
// track-web's real values change later, resync this file by hand against
// that exact path.

import type { Archetype, UnitDef } from './types'

export const UNIT_CATALOG: Record<Archetype, UnitDef> = {
  melee: {
    maxHp: 3,
    movement: { range: 4 },
    attack: {
      damage: 2,
      targeting: { mode: 'direction', arc: 'cardinal', minRange: 1, maxRange: 1 },
      propagation: { shape: 'single', penetration: 'none' },
    },
  },
  rogue: {
    maxHp: 3,
    movement: { range: 4 },
    attack: {
      damage: 1,
      targeting: { mode: 'direction', arc: 'cardinal', minRange: 1, maxRange: 1 },
      propagation: { shape: 'single', penetration: 'none' },
    },
  },
  ranger: {
    maxHp: 3,
    movement: { range: 3 },
    attack: {
      damage: 1,
      // "line propagation range 2 to board edge" — starts at distance 2,
      // extends as far as the board allows; attack.ts's computeFootprint
      // clips maxRange to the board's actual bounds, so this sentinel just
      // needs to be "at least as far as any board gets."
      targeting: { mode: 'direction', arc: 'cardinal', minRange: 2, maxRange: Number.MAX_SAFE_INTEGER },
      propagation: { shape: 'line', penetration: 'stop_at_first' },
    },
  },
  'magic-user': {
    maxHp: 3,
    movement: { range: 3 },
    attack: {
      damage: 1,
      targeting: { mode: 'direction', arc: 'cardinal', minRange: 2, maxRange: 2 },
      propagation: { shape: 'plus', penetration: 'none' },
    },
  },
  'short-range': {
    maxHp: 3,
    movement: { range: 3 },
    attack: {
      damage: 1,
      targeting: { mode: 'direction', arc: 'cardinal', minRange: 1, maxRange: 1 },
      propagation: { shape: 'single', penetration: 'none' },
    },
  },
  'long-range': {
    maxHp: 3,
    movement: { range: 3 },
    attack: {
      damage: 1,
      targeting: { mode: 'direction', arc: 'cardinal', minRange: 1, maxRange: 1 },
      propagation: { shape: 'single', penetration: 'none' },
    },
  },
}

export const ARCHETYPES = Object.keys(UNIT_CATALOG) as Archetype[]
