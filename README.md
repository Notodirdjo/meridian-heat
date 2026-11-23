[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Notodirdjo/meridian-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Notodirdjo/meridian-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
# MERIDIAN HEAT — Open-World Crime in Port Meridian

[![Play the game](https://img.shields.io/badge/play-in%20your%20browser-brightgreen)](https://notodirdjo.github.io/meridian-heat/game/)
[![three.js](https://img.shields.io/badge/3D-three.js%20r160-blue)](https://threejs.org/)
[![No build step](https://img.shields.io/badge/build-none%20—%20static%20files-orange)](#how-to-run)

Vex Marlowe is back in Port Meridian — broke, wanted, and owed a favour by
Rico. Steal cars. Outrun the law. Six story missions, a crew of three, and
a whole sunset city to take. A low-poly third-person open-world crime game
in three.js, made for the [make.fun](https://make.fun/r/bqq5g77j) GTA 6
bounty. Every street, name and sound is original — no Rockstar content.

## How to run

No build step, no install, no network at runtime. Serve the `game/`
folder with any static server and open `index.html`:

```sh
cd game && python3 -m http.server 8000
# open http://localhost:8000/
```

## Controls

| Input | Action |
|---|---|
| WASD / arrows | Move on foot, drive in a car |
| Mouse drag | Orbit camera · Mouse click | Shoot |
| E | Enter / exit car · Start mission / race at a marker |
| Space | Jump on foot · Handbrake while driving |
| F | Punch · R | Reload · 1 / 2 / 3 | Fists / Pistol / SMG |
| Z / X / C | Crew: Rico swap plates · Lena quick fix · Captain eyes out |
| Q | Radio station (Sunset FM 89.1 · Meridian Heat 104.7 · Koral Jazz 92.5) |
| M | Mission list · P / Esc | Pause |

## Features

- **A living city** — procedural low-poly Port Meridian: 70+ buildings with
  lit windows, roads and traffic, pedestrians, a park, docks and palms,
  all under a gradient sunset sky.
- **Six staged story missions** — First Delivery, Hot Wheels, Dockside
  Pickup, Harbor Showdown, Meridian GP and The Last Drop, with named
  stages, in-mission dialogue, timers and S/A/B ratings.
- **Wanted system** — 1–5 stars, named KPD units with roles (pursuit,
  ramming, flanking), foot cops with an arrest hold, radio chatter, and a
  police helicopter at 4+ stars.
- **Progression** — five ranks (Rookie → Kingpin) with RP, district
  reputation (Wary / Neutral / Friendly — friendly locals hide you), and
  a completion percentage across eight categories.
- **Side content** — 12 Golden Anchors, 3 street races, 5 stunt jumps, a
  5-car export list, health and armour pickups.
- **Crew** — recruit Rico, Lena and the Captain through the story and call
  on their abilities.
- **Saves** — autosave plus three manual slots, with a tabbed pause menu
  (map, story, stats, crew, save) and a clickable minimap waypoint.

## Layout

```
game/
  index.html          page shell: title, HUD, pause, end screens
  css/style.css       all styling
  js/config.js        tuning constants + the shared game state
  js/world.js         three.js scene, procedural city, beacons, particles
  js/actors.js        player character, camera, pedestrians
  js/vehicles.js      cars, traffic, entering/exiting, arcade driving
  js/radio.js         WebAudio synth: 3 stations + sound effects
  js/save.js          localStorage slots + autosave
  js/progression.js   ranks, RP, reputation, ratings, career stats
  js/crew.js          Rico / Lena / Captain abilities
  js/combat.js        weapons, tracers, gunmen, damage, wanted
  js/police.js        wanted levels, pursuit, arrest, helicopter
  js/depth.js         anchors, stunt jumps, pickups
  js/missions.js      story missions, races, export list, beacon
  js/ui.js            HUD, minimap, pause tabs, title wiring
  js/main.js          boot, input, game loop
  vendor/three.module.min.js   three.js r160 (MIT), vendored
main.ts               entrypoint: builds /output + dossier.json
```

Test aids: `?low=1` disables shadows and antialiasing, `?ts=N` runs game
time N times faster.
