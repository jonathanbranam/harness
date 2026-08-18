# Brute — the enemy baseline

> Source rules: `unit-definition.md` (`brute`: one move, then one attack,
> AI-driven) and the playtest kit §7 (Brute HP 6, move 4, adjacent 3 damage;
> Archer HP 4, move 3, shoot range 5 for 2 then step away; Harpy flying).

The brute is the least interesting machine and the most important one to
show, because it demonstrates the **machine / policy split**: the machine
says what is legal, a *policy* picks. For PCs the policy is the player (or
the harness agent, or a Gherkin step). For NPCs it's an AI policy. Nothing
about the machine changes.

## Brute

```
unit brute "Brute"
  hp 6
  movement walk

  actions
    club "Club"
      targeting tile, arc both, range 1, occupied
      damage 3

  turn
    start -> approach
    approach
      move up to 4      -> strike
      choose "Hold"     -> strike           # already adjacent, or nowhere useful to go
    strike
      act club          -> done
      end
```

That's the whole `brute` archetype. Notes:

- `choose "Hold"` is how "the AI declines to move" is expressed. It's an
  ordinary menu transition; for a human it would be a *Hold* button, for the
  AI policy it's a legitimate answer. When `move` has no reachable tile,
  *Hold* is the only thing enabled and the policy takes it. No special
  "pass" concept is needed — a good sign the vocabulary is right.
- `end` in `strike` covers the "nothing in range" case explicitly rather
  than relying on implicit exhaustion (`act club` isn't enabled with no
  legal target, so `end` is what remains).

## The AI policy (today's `npc.ts`, restated)

The policy is not part of the unit file. It's engine code, selected per unit
(`policy brute_ai` on the unit, defaulting to `player` for PCs), and it's
today's `npc.ts` behavior expressed as answers to the machine's questions:

```
policy brute_ai:
  on state approach, offered {move up to N, choose Hold}:
    target := PC with fewest hp that can be reached-and-hit this turn, else nearest PC
    dest   := tile on shortest path toward target, ≤ N steps, avoiding hazards
    answer move(dest)            (or Hold, if already adjacent / no path)
  on state strike, offered {act club, end}:
    answer act club(target tile) if target adjacent, else end
```

The playtest kit's tie-break ("prefer the PC the Berserker is *not* adjacent
to") is a policy line, not a rule line. So is every "smarter/reactive AI"
idea in `archetype-concepts.md` (cluster, space out, avoid being shoved into
pits) — the concepts doc parks that as a separate workstream and this
proposal keeps it parked. **The seam is now explicit**: a better AI is a
better `policy`, and it drives the same machine the harness steps by hand.

Today's game already separates NPC move (immediate) from NPC attack
(telegraphed, resolved on the player's confirm). That's a **round-structure**
detail — the machine's `strike` state is where the telegraph is captured;
the actual `attack.md` resolution happens when the round says so. Not a
machine concern.

## Archer

Adds "shoot, then step 1 away" — an after-move on the action, no new
mechanism:

```
unit archer "Archer"
  hp 4
  movement walk

  actions
    shoot "Shoot"
      targeting tile, arc both, range 2..5, los, occupied
      damage 2
      move after, away from target, up to 1

  turn
    start -> approach
    approach
      act shoot          -> done          # prefer the shot if one exists…
      move up to 3       -> strike        # …else close in
      choose "Hold"      -> strike
    strike
      act shoot          -> done
      end
```

The policy is asked "shoot, move, or hold?" in `approach` and shoots when
`can_target(shoot)`. The *order* transitions are listed doesn't constrain
the AI — it sees the whole enabled set — but file order documents intent,
and the harness's rendering lists them that way.

## Harpy (flying)

Pure `movement.md`: `movement fly`. Water and pits stop being lethal for
her because forced-movement resolution and terrain hooks consult traversal
(playtest §2). No machine change from the brute:

```
unit harpy "Harpy"
  hp 4
  movement fly
  actions
    talons "Talons"
      targeting tile, arc both, range 1, occupied
      damage 2
  turn
    start -> approach
    approach
      move up to 5    -> strike
      choose "Hold"   -> strike
    strike
      act talons      -> done
      end
```

## Coverage check

| Concept | Where it lives |
|---|---|
| one move then one attack | two states, one `move`, one `act` |
| AI picks target / path | policy, not machine |
| "shoot then step away" | embedded `move after, away from target` |
| flying ignores water/pits | `movement fly` (unchanged `movement.md`) |
| brute has more than one attack → AI picks first usable | policy; machine just offers all enabled `act`s |
| smarter AI (cluster, avoid hazards, deny the ring) | out of scope; a policy change, seam is explicit |
