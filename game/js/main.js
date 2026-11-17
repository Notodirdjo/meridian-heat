// MERIDIAN HEAT — main.js: boot, game loop and state machine.
// The loop reads input during update() and only clears the edge-triggered
// key/click sets AFTER update() has run, so every press reaches gameplay.

import { CFG, G, clamp, dist, angleTo, lerp, toast } from './config.js';
import { buildWorld, resolveBuildingCollision } from './world.js';
import { initInput, wasPressed, moveAxis } from './input.js';
import { renderWorld, setCtx as setRenderCtx, nightFactor } from './render.js';
import {
  drawHUD, drawTitle, drawPaused, drawWasted, drawBusted, drawStoryComplete,
  drawMissionList, drawMissionCard, drawHintBar, setCtx as setUiCtx,
} from './ui.js';
import {
  spawnPlayer, spawnTrafficAndParked, spawnPeds, updateCars, updatePeds,
  updatePolice, updateParticles, nearestCar, enterCar, exitCar, addWanted,
  damagePlayer,
} from './entities.js';
import { firePistol, startReload, punch, updateBullets } from './combat.js';
import { MISSIONS, startMission, updateMission, missionMarkerPos, nextMissionDef, missionAvailable } from './missions.js';
import { initAudio, updateAudio, sfx } from './audio.js';
import { saveGame, loadSave, hasSave, applySave, clearSave } from './save.js';
import { applyShotParams } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
G.canvas = canvas;
G.ctx = ctx;
setRenderCtx(ctx);
setUiCtx(ctx);

let lastT = 0;
let fireCd = 0;
let autosaveTimer = 20;
let buttons = {};
let attractAngle = 0;

function resetRun(fresh) {
  G.cars.length = 0;
  G.peds.length = 0;
  G.cops.length = 0;
  G.gunmen.length = 0;
  G.bullets.length = 0;
  G.particles.length = 0;
  G.skidmarks.length = 0;
  G.pickups.length = 0;
  G.mission = null;
  G.missionCard = null;
  G.toast = null;
  G.health = 100;
  G.wanted = 0;
  G.lastCrime = -999;
  G.ammo = CFG.PISTOL_MAG;
  G.reserveAmmo = CFG.PISTOL_RESERVE;
  G.reloading = 0;
  G.storyDone = false;
  // A fresh run resets money and missions; a restart (R) mid-run keeps
  // the player's earnings and completed missions — respawn, not wipe.
  if (fresh) {
    G.money = 250;
    G.missionsDone = [];
    G.stats = { shotsFired: 0, carsStolen: 0, pedsDown: 0, copsDown: 0 };
  }
  buildWorld(G.seed);
  spawnPlayer();
  const rng = G.world.rng;
  spawnTrafficAndParked(rng);
  spawnPeds(rng);
  for (const hs of G.world.healthSpots) G.pickups.push({ x: hs.x, y: hs.y, kind: 'health', t: 0 });
  G.camera.x = G.player.x;
  G.camera.y = G.player.y;
  autosaveTimer = 20;
}

function startGame(useSave) {
  initAudio();
  if (useSave) {
    const data = loadSave();
    resetRun(false);
    if (data) {
      applySave(data);
      toast('Welcome back, Vex. Progress restored.');
    }
  } else {
    clearSave();
    resetRun(true);
  }
  G.state = 'playing';
  sfx.click();
}

function updatePlayerOnFoot(dt) {
  const p = G.player;
  const mv = moveAxis();
  const len = Math.hypot(mv.x, mv.y) || 1;
  p.x += (mv.x / len) * CFG.PLAYER_SPEED * dt * (mv.x || mv.y ? 1 : 0);
  p.y += (mv.y / len) * CFG.PLAYER_SPEED * dt * (mv.x || mv.y ? 1 : 0);
  if (mv.x || mv.y) p.angle = Math.atan2(mv.y, mv.x);
  // Knockback decay.
  p.x += p.knockX * dt; p.y += p.knockY * dt;
  p.knockX *= (1 - 6 * dt); p.knockY *= (1 - 6 * dt);
  p.x = clamp(p.x, 30, CFG.WORLD_W - 30);
  p.y = clamp(p.y, 30, CFG.WORLD_H - 30);
  // Buildings are solid on foot too — slide along their walls.
  resolveBuildingCollision(p, CFG.PLAYER_RADIUS);
  // Aim at the mouse.
  G.aimAngle = angleTo(p.x, p.y, G.mouse.wx, G.mouse.wy);
  if (mv.x || mv.y) p.angle = G.aimAngle;
  // Firing (hold to fire, 0.22 s between shots).
  fireCd -= dt;
  if (G.mouse.down && fireCd <= 0) {
    firePistol();
    fireCd = 0.22;
  }
  if (wasPressed('KeyF')) punch();
  // Reload is automatic when the magazine empties (R is restart).
  if (G.reloading > 0) {
    G.reloading -= dt;
    if (G.reloading <= 0) {
      const need = CFG.PISTOL_MAG - G.ammo;
      const take = Math.min(need, G.reserveAmmo);
      G.ammo += take;
      G.reserveAmmo -= take;
    }
  }
  G.punchCooldown = Math.max(0, G.punchCooldown - dt);
  G.punchTimer = Math.max(0, G.punchTimer - dt);
  p.invuln = Math.max(0, p.invuln - dt);
}

function updatePlaying(dt) {
  const p = G.player;
  // Mission intro card freezes the world until dismissed.
  if (G.missionCard) {
    G.missionCard.t -= dt;
    if (G.missionCard.t <= 0 || wasPressed('KeyE') || G.mouse.clicked) G.missionCard = null;
    return;
  }
  // Mission list overlay.
  if (wasPressed('KeyM') || wasPressed('Escape')) {
    G.missionListOpen = !G.missionListOpen;
    sfx.click();
    return;
  }
  if (G.missionListOpen) return;
  // Pause.
  if (wasPressed('KeyP')) {
    G.state = 'paused';
    sfx.click();
    return;
  }
  if (wasPressed('KeyR')) {
    resetRun(false);
    G.state = 'playing';
    toast('Run restarted.');
    return;
  }

  // Day/night cycle.
  G.dayTime = (G.dayTime + dt / CFG.DAY_LENGTH) % 1;

  // Proximity state for hints and E.
  G._markerPos = missionMarkerPos();
  G._nearMarker = G._markerPos ? dist(p.x, p.y, G._markerPos.x, G._markerPos.y) < 85 : false;
  G._nearCar = p.car ? null : nearestCar(75);

  // E: start mission at the marker, else enter/exit car.
  if (wasPressed('KeyE')) {
    if (G._nearMarker && !G.mission) {
      const next = nextMissionDef();
      if (next && missionAvailable(next)) startMission(next);
    } else if (p.car) {
      exitCar();
    } else if (G._nearCar) {
      enterCar(G._nearCar);
    }
  }

  if (p.car) {
    p.invuln = Math.max(0, p.invuln - dt);
  } else {
    updatePlayerOnFoot(dt);
  }

  updateCars(dt);
  updatePeds(dt);
  updatePolice(dt);
  updateBullets(dt);
  updateParticles(dt);

  // Mission progress; 'done' pays out and saves, 'failed' just reports.
  if (G.mission) {
    const result = updateMission(dt);
    if (result === 'done') saveGame();
  }

  // Gunfire echo fades.
  if (G.shotRecentTimer > 0) {
    G.shotRecentTimer -= dt;
    if (G.shotRecentTimer <= 0) G.shotRecently = false;
  }

  // Camera follows the player.
  const tx = clamp(p.x, G.vw / 2, CFG.WORLD_W - G.vw / 2);
  const ty = clamp(p.y, G.vh / 2, CFG.WORLD_H - G.vh / 2);
  G.camera.x = lerp(G.camera.x, tx, clamp(6 * dt, 0, 1));
  G.camera.y = lerp(G.camera.y, ty, clamp(6 * dt, 0, 1));
  G.shake = Math.max(0, G.shake - 40 * dt);

  // Mouse world position (for aiming).
  G.mouse.wx = G.mouse.x + G.camera.x - G.vw / 2;
  G.mouse.wy = G.mouse.y + G.camera.y - G.vh / 2;

  // Toast timer.
  if (G.toast) {
    G.toast.t -= dt;
    if (G.toast.t <= 0) G.toast = null;
  }

  // Autosave.
  autosaveTimer -= dt;
  if (autosaveTimer <= 0) {
    autosaveTimer = 20;
    saveGame();
  }

  updateAudio();
}

function updateTitle(dt) {
  // Attract mode: the city lives behind the title.
  attractAngle += dt * 0.02;
  G.camera.x = 1800 + Math.cos(attractAngle) * 500;
  G.camera.y = 1400 + Math.sin(attractAngle * 0.7) * 300;
  G.dayTime = (G.dayTime + dt / CFG.DAY_LENGTH) % 1;
  updateCars(dt);
  updatePeds(dt);
  updateParticles(dt);
  G.mouse.wx = G.mouse.x + G.camera.x - G.vw / 2;
  G.mouse.wy = G.mouse.y + G.camera.y - G.vh / 2;
  if (wasPressed('Enter')) startGame(false);
  if (G.mouse.clicked) {
    if (buttons.start && inside(G.mouse, buttons.start)) startGame(hasSave());
    else if (buttons.newGame && inside(G.mouse, buttons.newGame)) startGame(false);
  }
}

function inside(m, b) {
  return b && m.x >= b.x && m.x <= b.x + b.w && m.y >= b.y && m.y <= b.y + b.h;
}

function updatePaused(dt) {
  if (wasPressed('KeyP') || wasPressed('Escape')) { G.state = 'playing'; sfx.click(); return; }
  if (wasPressed('KeyR')) { resetRun(false); G.state = 'playing'; return; }
  if (G.mouse.clicked) {
    if (inside(G.mouse, buttons.resume)) G.state = 'playing';
    else if (inside(G.mouse, buttons.restart)) { resetRun(false); G.state = 'playing'; }
    else if (inside(G.mouse, buttons.quit)) { saveGame(); G.state = 'title'; }
  }
}

function updateEndScreen(dt) {
  // Wasted / busted / story-complete.
  if (wasPressed('KeyR') || wasPressed('Enter') || G.mouse.clicked) {
    if (G.state === 'story') {
      G.state = 'playing';
      return;
    }
    if (G.state === 'busted') {
      G.money = Math.max(0, G.money - 200);
      G.wanted = 0;
      G.cops.length = 0;
      G.health = 100;
      G.player.hp = 100;
      G.player.x = G.world.spawn.x;
      G.player.y = G.world.spawn.y;
      if (G.player.car) { G.player.car.driver = null; G.player.car = null; }
      G.mission = null;
      G.gunmen.length = 0;
      saveGame();
      G.state = 'playing';
      toast('Out on bail. $200 lighter. Stay sharp.');
    } else {
      // Wasted: respawn fresh at the spawn point, missions kept.
      G.health = 100;
      G.player.hp = 100;
      G.player.x = G.world.spawn.x;
      G.player.y = G.world.spawn.y;
      if (G.player.car) { G.player.car.driver = null; G.player.car = null; }
      G.mission = null;
      G.gunmen.length = 0;
      G.wanted = 0;
      G.cops.length = 0;
      saveGame();
      G.state = 'playing';
    }
  }
}

function update(dt) {
  G.time += dt;
  switch (G.state) {
    case 'title': updateTitle(dt); break;
    case 'playing': updatePlaying(dt); break;
    case 'paused': updatePaused(dt); break;
    case 'wasted':
    case 'busted':
    case 'story': updateEndScreen(dt); break;
    default: break;
  }
  // Wasted / busted can be set mid-update by damage/arrest.
  if ((G.state === 'wasted' || G.state === 'busted') && G.mission) {
    G.mission = null;
    G.gunmen.length = 0;
  }
}

function render() {
  ctx.clearRect(0, 0, G.vw, G.vh);
  // The world renders behind every state (title attract mode included).
  renderWorld();
  switch (G.state) {
    case 'title':
      buttons = drawTitle(hasSave());
      break;
    case 'playing':
      drawHUD();
      drawHintBar();
      if (G.missionCard) drawMissionCard();
      else if (G.missionListOpen) drawMissionList();
      break;
    case 'paused':
      drawHUD();
      buttons = drawPaused();
      break;
    case 'wasted':
      drawHUD();
      buttons = drawWasted();
      break;
    case 'busted':
      drawHUD();
      buttons = drawBusted();
      break;
    case 'story':
      drawHUD();
      buttons = drawStoryComplete();
      break;
    default: break;
  }
}

function frame(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
  lastT = t;
  update(dt);
  render();
  // Edge-triggered input is cleared AFTER update() has read it — never
  // before — so E / P / M / clicks always reach gameplay.
  G.pressed.clear();
  G.mouse.clicked = false;
  requestAnimationFrame(frame);
}

function boot() {
  const params = new URLSearchParams(window.location.search);
  const seed = parseInt(params.get('seed') || '7', 10) || 7;
  G.seed = seed;
  // Fit the canvas to its display size, keeping the 1280x720 playfield.
  const fit = () => {
    const scale = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    canvas.style.width = Math.floor(1280 * scale) + 'px';
    canvas.style.height = Math.floor(720 * scale) + 'px';
  };
  window.addEventListener('resize', fit);
  fit();
  initInput(canvas);
  resetRun(true);
  applyShotParams(params);
  // Test/debug handle (used by the Playwright play-test, harmless in play).
  window.MERIDIAN = G;
  window.MERIDIAN_MISSIONS = MISSIONS;
  requestAnimationFrame(frame);
}

boot();
