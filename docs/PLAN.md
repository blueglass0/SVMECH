# Steel Vulture — Build Plan

Nov 18, 2026 · @M

## Overview

Steel Vulture (working title) is a top-down, real-time mech game. You're an elite mercenary pilot in a war-torn galaxy: you take contracts from three warring factions and pay to keep your mechs running, in an open-ended career with no story or ending. It's inspired by MechWarrior and Armored Core but is its own thing, with simple vector-style graphics and simple sound.

- **Platforms:** PC browser first, phones supported. Both use the same small set of controls. When they conflict, PC wins, but nothing in the design should be impossible on a phone.
- **Tech:** TypeScript, the Phaser game framework (latest stable), and Vite. A public GitHub repo hosts the game on GitHub Pages, and GitHub Actions deploys it on every push. Saves live in the browser's local storage.
- **Who does what:** Claude Code writes all the code, draws the art in code, and generates the sound. You set direction, make design calls, and playtest each milestone on PC and phone.

## Core design

The mech should feel heavy, and its depth should come from loadout choices, not button count: at most two weapon groups and two equipment actions in combat.

### Movement and aiming

- Legs and torso are separate. Legs accelerate, carry momentum, slow down gradually, and turn at a set rate. The torso turns toward the aim point at its own speed. All of these speeds come from the chassis.
- **PC:** tank controls by default: W and S set the throttle, A and D turn the legs, and the mouse aims. Direction-based movement is an option. Left click fires weapon group 1, right click fires group 2, and two keys trigger equipment (flares, shield).
- **Phone:** direction-based by default: the legs turn toward the left stick's direction at their turn rate and build up speed, so momentum still applies. Tank controls are an option. The right stick aims and fires group 1 while held. Three buttons around the right stick: group 2, equipment, and interact (swap stations). Light aim assist on phone only.

### Mech loadouts

MechWarrior-style: each chassis is fixed and you customize what goes in it.

- **Chassis** sets the weight class, max tonnage, armor per section, speed and turn rates, and hardpoints per section (for example, right arm: 1 ballistic and 1 energy).
- **Hardpoints** take weapons of the matching type: ballistic, energy, or missile.
- **Internal slots** take equipment: one reactor, plus heat sinks, sensors, extra armor, ammo bins, a shield generator, flares, and point defense.
- **Limits:** tonnage, power, slots, and price.

### Power and heat

Power is a build budget, not a meter, and heat is the limit in combat.

- The reactor supplies power output. Every weapon and powered part (sensors, shield) draws some. A loadout is valid only if total draw fits the reactor. Reactors trade off output, weight, and price, and bigger reactors give off passive heat, so they need more heat sinks.
- Firing generates heat, energy weapons far more than ballistics. Heat sinks shed it. Overheating forces a short shutdown, with a warning before it happens.
- Energy weapons cost nothing per shot but need more power and run hot. Ballistics run cool but cost ammo money.

### Weapons and ammo

| Family | Weapons | Fires using | Trade-off |
| --- | --- | --- | --- |
| Ballistic | Machine gun, autocannon, Gatling gun, heavy cannon | Ballistic ammo | Cool and low power, but ammo costs money |
| Energy | Several lasers, plasma launcher, short-range lightning | Power and heat | No ammo cost, high power draw and heat |
| Missile | Seeking missiles, unguided rockets | Missile ammo | Burst damage, but can be countered |

Ammo is two shared pools, ballistic and missile, bought before each mission. Capacity comes from the chassis plus ammo bins.

### Missiles and countermeasures

- Missiles are real objects with HP, so either side can shoot them down.
- **Flares** (equipment, limited charges) break locks on incoming missiles.
- **Point defense** (equipment, draws power) shoots nearby missiles automatically. It's worth having because a slow-turning torso makes manual shoot-downs hard.

### Locational damage

A mech has four sections: torso, left arm, right arm, and legs. In top-down view, the angle a shot comes from relative to the torso decides which section it hits. Enemy mechs use the same system; tanks, drones, and turrets just have one HP bar. A small silhouette in the HUD shows each section's condition, and repairs are priced per section.

&#91;embedded content: locational damage · four hit arcs plus legs\]

Shots from the front hit the torso, shots from either side hit that arm, and rear hits strike thinner torso armor. Legs take splash damage plus a small share of every hit.

## Career and economy

The game is an open-ended sandbox career with no story or ending. Money is the pressure, and going bankrupt is how you lose.

### Mission loop

1. Pick a contract from the board. Each shows the employer, the enemy faction, the objective, the difficulty tier, and the payout.
2. Pick your active mech and your backup, then buy ammo and fuel.
3. Fight the mission.
4. Get paid, with bonuses for optional objectives. Reputation goes up with your employer and down with the faction you fought.
5. Repair, rearm, buy and sell gear, and pay any loan installment.

All contracts are procedurally generated. An optional final mission might come much later.

### Upkeep

- **Fuel:** a cost per deployment that rises with mech weight.
- **Ammo:** you pay for what you load.
- **Repairs:** priced per damaged section. A destroyed mech can be rebuilt, but at a large cost.
- **Risk and reward:** a stronger loadout costs more to field but can take higher-tier contracts that pay more. A failed mission pays nothing and still costs fuel, ammo, and repairs.

### Backup mechs and swap stations

- Your ship carries your active mech plus up to two backups (the exact number gets tuned in playtesting).
- If your active mech is destroyed, the backup drops onto the battlefield and you keep going. With no backup left, the mission fails.
- Some maps have a cargo station where you can pay to swap your current mech for the backup, for example when it's badly damaged or out of ammo.

### Loans and game over

- When money runs low you can take a loan: cash now, repaid in installments with interest after each mission. You can hold one loan at a time.
- If your last mech is destroyed and you have no backups, you can take a loan to buy a replacement.
- If you already have a loan when that happens, or you can't cover your debt even after selling gear, the career ends and you start over.

### Factions and reputation

The lore stays in the background, showing up in flavor text, enemy armies, and shop stock rather than exposition.

| Faction | Color | Who they are | How they fight | What their shop sells |
| --- | --- | --- | --- | --- |
| Royalists | Red | Stern authoritarians descended from ancient Earth governments | Big numbers, heavy mechs, lots of guns | Heavy mechs, ballistic weapons |
| Technocrats | Blue | Cybernetic transhumanists, the most advanced faction | Energy weapons and advanced parts, smaller forces | Energy weapons, reactors, sensors, shields |
| Freestars | Dirt brown | Ragtag rebels and outcasts on the edge of anarchy | Light mechs, drones, ruthless guerrilla tactics | Light mechs, cheap weathered gear |

Working for a faction raises your reputation with them, and fighting them lowers it. Higher reputation unlocks more of their mechs and equipment in the shop.

### Difficulty

Two separate settings, chosen when starting a career:

- **Combat:** enemy numbers, accuracy, and damage.
- **Economy:** costs, payouts, loan terms, and whether bankruptcy ends the career.

All economy numbers live in data tables with multipliers, so these settings are cheap to build.

## Milestones

Milestones 1 to 5 are the prototype: a complete, playable loop with one mech, a starter set of gear, and one faction-neutral enemy army. Everything after that is optional and gets added as time allows; the order is a suggestion. Each milestone ends with a deployed build and a specific thing for you to test, and milestone 2 is the make-or-break checkpoint.

### The prototype

1. **Foundation.** Repo, TypeScript, Phaser, and Vite set up; auto-deploy to GitHub Pages; an empty map that scales to PC and phone screens.
   - *You test:* the link loads on your PC and your phone.
2. **Movement feel.** One mech with momentum-driven legs and an independent torso. Tank controls on PC, direction-based on phone, both selectable on either. The camera and a test arena with obstacles.
   - *You test:* does it feel heavy but controllable on both? We tune until the answer is yes.
3. **Combat core.** Three weapons (machine gun, autocannon, laser), heat, ballistic ammo, turrets and tanks with basic AI, one destroy-targets mission on a procedurally generated map, and win and lose screens.
   - *You test:* is fighting fun?
4. **Locational damage.** Sections, hit-angle detection, arm and leg damage effects, and the HUD silhouette.
   - *You test:* is it clear what's damaged, and does losing an arm or legs matter?
5. **Economy loop.** Contract board, payouts, fuel, ammo and repair costs, a small shop, a loadout screen with tonnage, power and hardpoints, loans, career over, and saving.
   - *You test:* does mission, repair, upgrade feel good? First real tuning pass.

### Later, as time allows

6. **Loadout depth and missiles.** Reactors, heat sinks, sensors, extra armor, and the shield generator. Missiles and rockets for both sides, missile HP, flares, and point defense.
   - **Fog of war and line of sight** (added after M3). The player sees a vision cone in front of the torso plus a small all-round radius; enemies outside it or behind walls are hidden, with last-seen markers. Hit-direction indicators for shots from out of sight. Sensors and radar widen or extend vision, and some chassis come with wider cones. Default rendering is the cheap version (one pre-baked darkness image rotated with the torso); an option keeps buildings and terrain visible but faded outside the cone, if performance allows.
6b. **Destructible terrain** (added after M3). Buildings and walls take weapon damage, show damage stages and collapse into walkable rubble; small objects (fences, trees, sheds, barriers) are crushed by walking through them, with mech weight deciding what can be crushed. Whole objects break, not pieces.
7. **Hangar and backups.** Also (added after M5): **contract tonnage limits** (some contracts cap mech weight, rewarding a varied hangar), and **field ammo and repair stations** that appear on some maps: walk onto one and pay to restore some ammo or repair sections mid-mission, using the same interact action as swap stations.
   - Original scope: Three or four buyable chassis, backup mechs with drop-in, and swap stations.
8. **Enemies and weapons.** Drones, enemy mechs that use the player's systems, and the rest of the weapons: Gatling gun, heavy cannon, more lasers, plasma, and lightning. Laser variants include continuous-beam lasers (damage and heat per second while held) alongside pulse lasers, with different range and heat trade-offs.
9. **Factions.** Three factions with their colors and army styles, reputation, and reputation-gated shops.
10. **More mission types.** Defend, escort, convoy raid, and mech hunt.
11. **Polish.** Difficulty settings menu, tutorial, sound pass, menu and phone UI pass, and a performance check on your phone. The phone UI pass should rethink the buttons around the right stick (weapon swap, two equipment actions, interact), which get crowded as features are added.
12. **Optional final mission.** Maybe, someday.

## Working rules for Claude Code

These keep the project easy to tune and easy to hand between sessions.

- **Data-driven content.** Mechs, weapons, equipment, enemies, factions, and every economy number live in data files, separate from game logic. Balancing means editing numbers, and you can tweak them yourself.
- **One input layer.** Game code reads abstract actions (move, aim, fire group 1, and so on). Keyboard-and-mouse and touch are two sources feeding it; nothing else reads keys or touches directly.
- **Ship every milestone.** Each milestone ends deployed to GitHub Pages with a short note on what to test. The next milestone starts only after you sign off. Leave room in the code and data for later systems (factions, more chassis, backups, mission types), but don't build them early.
- **Dev tools.** A debug overlay (frame rate, hit arcs) and a dev menu (add money, spawn enemies, skip missions) so playtests go fast.
- **Phone performance.** Target a smooth 60 fps on a mid-range phone: reuse bullets and effects instead of creating new ones, and cap particles.
- **Project memory.** Keep this plan in the repo as `docs/PLAN.md` (export this doc as Markdown) and a `CLAUDE.md` with conventions and the current milestone, so every new session starts with context.

Starting prompt for the first Claude Code session:

```text
This is a new game project. Read docs/PLAN.md: it's the full design and build plan. Do milestone 1 (Foundation): set up TypeScript, Phaser and Vite, a GitHub Actions workflow that deploys to GitHub Pages, and a CLAUDE.md summarizing the plan's working rules. Then tell me the Pages link and what to test.
```

## Decisions made during development

- Phones are landscape-only; portrait shows a rotate prompt.
- Throttle is hold-to-move (it maps onto the phone stick).
- Phones show slightly less of the map than PC so the mech isn't tiny.
- Weapons fire along the torso facing, not converging on the cursor; aiming with the slow torso is part of the skill.
- Heat should be a build choice: some builds run hot and need heat management, others barely notice it, with trade-offs both ways.
- Phone weapon groups: the right stick fires the selected group; a button next to it switches between group 1 and 2. A smoother phone solution is still wanted later.
- Aim assist on phones stays light.
- One backup mech per mission: a single extra chance (after M7).
- Field stations (ammo, repair, swap) are single-use per station and cost 1.5× hangar prices; field repair can't fix destroyed sections.

## Open questions

- [ ] **Phone weapon firing.** The tap-to-switch button works for now; find something easier to use before release.

Decided so far: power is a build budget, tank controls on PC and direction-based movement on phone, an open-ended sandbox career, and the loan rule for losing your last mech. Still open:

- [ ] **Final mission (someday).** Whether to add one, and what it would be.
- [ ] **Final title.** Steel Vulture for now.
