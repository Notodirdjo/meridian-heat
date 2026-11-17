# MERIDIAN HEAT

![gta6-01](https://make.fun/badge/gta6-01.svg)
![rank](https://make.fun/badge/gta6-01/Notodirdjo/meridian-heat/rank.svg)
![reward](https://make.fun/badge/gta6-01/Notodirdjo/meridian-heat/reward.svg)

An original 2D top-down open-world crime game, built for the
[make.fun gta6-01 bounty](https://make.fun/bounty/gta6-01).
https://make.fun/r/bqq5g77j

## The game

Vex Marlowe is back in Port Meridian — broke, wanted, and owed a favour by
Rico. Explore a living city on foot and by car, steal whatever you can drive,
outrun the Port Meridian PD, and run four story missions to take the harbour.

- **Open city** — four districts (Old Town, Downtown, Marina, Harbor), a park
  and a harbour, all explorable on foot and by car.
- **Traffic & pedestrians** — cars with driving AI, parked cars to steal,
  pedestrians who flee gunfire and speeding cars.
- **Wanted level 1–5** — patrol cars that chase and ram, foot cops who chase
  and arrest (1.4 s hold = Busted). Lay low and the heat decays.
- **4 story missions** — First Delivery ($500, timed courier), Hot Wheels
  ($900, steal the gold Comet Sport), Dockside Pickup ($1,500, fight the
  crew), Harbor Showdown ($4,000, three waves + escape). Free roam after the
  story ends.
- **Combat** — pistol (mouse aim, click to shoot, 12-round mag, auto-reload),
  punch (F), enemy gunmen with health bars, health pickups.
- **HUD + minimap** — health, money, wanted stars, weapon/ammo, mission
  objective, speed while driving, a live minimap (roads, water, player
  heading, mission marker, flashing police) and an off-screen objective arrow.
- **Start, pause, Wasted / Busted screens, restart, and save** — progress
  saves to localStorage; Continue on the title screen restores it.
- **Polish** — day/night cycle over a neon-dusk palette, skid / muzzle /
  explosion particles, screen shake, danger vignette, mission cards, synth
  SFX and a WebAudio synthwave loop. All art drawn in code, all sound
  synthesized — no assets, no network, no libraries.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive |
| E | Enter / exit car, start mission at the marker |
| Mouse | Aim, click to shoot |
| F | Punch |
| Space | Handbrake |
| M | Mission list |
| P | Pause |
| R | Restart |

## How to run

No build step. Serve `game/` with any static server and open `index.html`:

```sh
node serve.ts   # serves game/ at http://localhost:8080
```

Or: `python3 -m http.server -d game 8080`.

## Screenshots

Staged from real game states with `?shot=title|drive|mission|combat&seed=N`
(see `shots.json`).

## Tech

Vanilla JavaScript + Canvas 2D, ES modules, no dependencies. Source layout:

- `game/js/main.js` — boot, loop, state machine
- `game/js/config.js` — tuning + shared state
- `game/js/world.js` — city generation
- `game/js/entities.js` — player, cars, traffic AI, peds, police, wanted
- `game/js/missions.js` — the four story missions
- `game/js/combat.js` — shooting, punching, gunmen, pickups
- `game/js/audio.js` — WebAudio SFX + synthwave loop
- `game/js/render.js` — camera + world drawing
- `game/js/ui.js` — HUD, minimap, screens
- `game/js/input.js` — keyboard / mouse
- `game/js/save.js` — localStorage save / continue
- `game/js/shots.js` — staged screenshot states

`main.ts` (Node 22, stdlib only) copies `game/` and `screenshots/` to
`/output` and writes `/output/dossier.json` via `buildDossier` from
`vendor/makefun-game.ts`:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see `LICENSE`. Everything in this game is original: no Rockstar or
other commercial game content of any kind.
