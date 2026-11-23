import { CFG, G, clamp, dist, toast, wx, wz } from './config.js';
import { initScene, buildWorld, updateParticles } from './world.js';
import { spawnPlayer, updatePlayer, updateCamera, spawnPeds, updatePeds } from './actors.js';
import { spawnTraffic, spawnParked, updateCars, nearestCar, enterCar, exitCar, removeCar } from './vehicles.js';
import { initRadio, resumeRadio, cycleStation, STATIONS } from './radio.js';
import { saveGame, loadGame, readSave, slotInfo, autosaveTick, deleteSave } from './save.js';
import { startMission, updateMission, updateRace, updateExports, nextMissionDef, missionAvailable, nearestRaceStart, startRace, pickExportTarget, updateBeacon, missionMarkerPos } from './missions.js';
import { firePistol, punch, startReload, switchWeapon, updateCombat, clearGunmen, clearBullets } from './combat.js';
import { updatePolice, clearPolice } from './police.js';
import { useCrewAbility, updateCrew } from './crew.js';
import { initDepth, updateDepth } from './depth.js';
import { updateHUD, updatePause, updateEndScreens, renderTitleSlots, renderPauseTab, initUI } from './ui.js';

let jumpVel = 0;
let orbitA = 0;

function beginPlay() {
  initRadio();
  const ts = document.getElementById('title-screen');
  ts.hidden = true;
  ts.style.display = 'none';
  const hud = document.getElementById('hud');
  hud.hidden = false;
  hud.style.display = '';
  G.state = 'playing';
}

function clearMissionCars() {
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const c = G.cars[i];
    if (c.name === 'Marlow Hauler') removeCar(c);
  }
}

function resetRun() {
  clearPolice();
  clearGunmen();
  clearBullets();
  clearMissionCars();
  const p = G.player;
  if (p && p.car) {
    p.car.kind = 'parked';
    p.car.driver = null;
    p.car = null;
  }
  G.time = 0; G.dayTime = 0.32;
  G.money = 250; G.health = 100; G.armour = 0;
  G.wanted = 0; G.highestWanted = 0; G.lastCrime = -999; G.decayTimer = 0; G.policeSpawnTimer = 1.6;
  G.weapon = 'pistol'; G.ammo = 12; G.reserveAmmo = 96;
  G.smgAmmo = 0; G.smgReserve = 0; G.smgUnlocked = false;
  G.reloading = 0; G.punchTimer = 0; G.punchCooldown = 0;
  G.rp = 0;
  for (const k of Object.keys(G.rep)) G.rep[k] = 50;
  for (const k of Object.keys(G.crew)) { G.crew[k].recruited = false; G.crew[k].cd = 0; G.crew[k].uses = 0; }
  G.anchorsFound = 0;
  for (const a of G.anchors) a.found = false;
  G.ratings = {};
  G.racesWon = 0; G.racesDone = []; G.race = null;
  G.jumpsDone = 0; G.jumpsFound = [];
  G.exportsDone = 0; G.exportsDelivered = []; G.exportTarget = null;
  G.dialogue = null; G.radioStation = 0; G.waypoint = null; G.eyesOutTimer = 0; G.heli = null;
  G.missionDamage = 0; G.missionStartTime = 0; G.playtime = 0; G.pauseTab = 'map';
  G.mission = null; G.missionsDone = []; G.storyDone = false;
  G.missionCard = null; G.toast = null; G.missionListOpen = false;
  for (const k of Object.keys(G.stats)) G.stats[k] = 0;
  for (const pk of G.pickups) { pk.taken = false; pk.t = 0; }
  if (p) {
    p.x = G.world.spawn.x; p.y = G.world.spawn.y;
    p.angle = -Math.PI / 2; p.speed = 0; p.airborne = 0; p.invuln = 0;
    p.rig.group.visible = true;
    p.rig.group.position.set(wx(p.x), 0, wz(p.y));
    G.cam.yaw = p.angle;
    G.cam.off = 0;
  }
  jumpVel = 0;
  pickExportTarget();
  initDepth();
}

function loadSlot(slot) {
  clearPolice();
  clearGunmen();
  clearBullets();
  if (!loadGame(slot)) return false;
  const p = G.player;
  if (p) {
    G.cam.yaw = p.angle;
    G.cam.off = 0;
    p.rig.group.position.set(wx(p.x), 0, wz(p.y));
  }
  if (!G.exportTarget || G.exportsDelivered.includes(G.exportTarget.name)) pickExportTarget();
  initDepth();
  return true;
}

function mostRecentSlot() {
  let best = -1, bestT = -1;
  for (let s = 0; s <= 3; s++) {
    const d = readSave(s);
    if (d && d.savedAt > bestT) { bestT = d.savedAt; best = s; }
  }
  return best;
}

function handleInteract() {
  const p = G.player;
  if (!p) return;
  if (!G.mission) {
    const next = nextMissionDef();
    if (next && missionAvailable(next)) {
      const s = G.world.missionSpots[next.spot];
      if (dist(p.x, p.y, s.x, s.y) < 130) {
        startMission(next);
        return;
      }
    }
  }
  if (p.car) {
    const race = nearestRaceStart();
    if (race) { startRace(race); return; }
    exitCar();
    return;
  }
  const car = nearestCar(p.x, p.y, 90);
  if (car) enterCar(car);
}

function handlePlayingInput() {
  const pr = G.pressed;
  if (pr.has('KeyE')) handleInteract();
  if (pr.has('Digit1')) switchWeapon(1);
  if (pr.has('Digit2')) switchWeapon(2);
  if (pr.has('Digit3')) switchWeapon(3);
  if (pr.has('KeyZ')) useCrewAbility('rico');
  if (pr.has('KeyX')) useCrewAbility('lena');
  if (pr.has('KeyC')) useCrewAbility('captain');
  if (pr.has('KeyQ')) cycleStation();
  if (pr.has('KeyR')) startReload();
  if (pr.has('KeyF')) punch();
  if (G.mouse.clicked || G.mouse.down) firePistol();
}

function handleGlobalInput() {
  const pr = G.pressed;
  if (pr.has('KeyP') || pr.has('Escape')) {
    if (G.state === 'playing') G.state = 'paused';
    else if (G.state === 'paused') G.state = 'playing';
    else if (G.state === 'missionlist') G.state = 'playing';
  }
  if (pr.has('KeyM')) {
    if (G.state === 'playing') G.state = 'missionlist';
    else if (G.state === 'missionlist') G.state = 'playing';
  }
  if (G.state === 'paused') {
    const tabs = ['map', 'story', 'stats', 'crew', 'save'];
    const i = tabs.indexOf(G.pauseTab);
    if (pr.has('KeyE')) G.pauseTab = tabs[(i + 1) % tabs.length];
    if (pr.has('KeyQ')) G.pauseTab = tabs[(i + tabs.length - 1) % tabs.length];
  }
}

function updateJump(dt) {
  const p = G.player;
  if (!p) return;
  if (p.airborne > 0 || jumpVel !== 0) {
    jumpVel -= 26 * dt;
    p.airborne += jumpVel * dt;
    if (p.airborne <= 0) { p.airborne = 0; jumpVel = 0; }
  }
}

function syncTestFields() {
  G.camYaw = G.cam.yaw;
  G.camera = G.cam3;
  G.radioOn = G.radioStation !== 0;
  G.radioStationName = G.radioStation === 0 ? '' : STATIONS[G.radioStation].name;
  const p = G.player;
  if (p) {
    p.z = p.airborne || 0;
    p.onGround = (p.airborne || 0) <= 0;
  }
}

function titleOrbit(raw) {
  orbitA += raw * 0.05;
  G.cam3.position.set(Math.cos(orbitA) * 220, 95, Math.sin(orbitA) * 220);
  G.cam3.lookAt(0, 0, 0);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = Math.min((now - last) / 1000, 0.05);
  last = now;
  const dt = raw * G._timeScale;
  handleGlobalInput();
  if (G.state === 'title') {
    titleOrbit(raw);
    updatePause();
    updateEndScreens();
    G.renderer.render(G.scene, G.cam3);
  } else if (G.state === 'playing') {
    G.time += dt;
    G.playtime += dt;
    G.dayTime = (G.dayTime + dt / CFG.DAY_LENGTH) % 1;
    handlePlayingInput();
    updatePlayer(dt);
    updateCamera(dt);
    updateCars(dt);
    updatePeds(dt);
    updatePolice(dt);
    updateMission(dt);
    updateRace(dt);
    updateExports();
    updateCombat(dt);
    updateCrew(dt);
    updateDepth(dt);
    updateParticles(dt);
    updateBeacon(dt);
    updateJump(dt);
    autosaveTick(dt);
    updateHUD(dt);
    updatePause();
    updateEndScreens();
    syncTestFields();
    G.renderer.render(G.scene, G.cam3);
  } else {
    updateHUD(0);
    updatePause();
    updateEndScreens();
    G.renderer.render(G.scene, G.cam3);
  }
  G.pressed.clear();
  G.mouse.clicked = false;
  G.mouse.dx = 0;
  G.mouse.dy = 0;
}

function wireInput() {
  const canvas = document.getElementById('game-canvas');
  window.addEventListener('keydown', (ev) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) ev.preventDefault();
    if (ev.repeat) return;
    G.keys.add(ev.code);
    G.pressed.add(ev.code);
    resumeRadio();
    if (ev.code === 'Space' && G.state === 'playing') {
      const p = G.player;
      if (p && !p.car && (p.airborne || 0) <= 0) {
        p.airborne = 0.01;
        jumpVel = 8;
        p.z = 0.01;
        p.onGround = false;
      }
    }
  });
  window.addEventListener('keyup', (ev) => G.keys.delete(ev.code));
  window.addEventListener('blur', () => G.keys.clear());
  window.addEventListener('mousemove', (ev) => {
    G.mouse.dx = ev.movementX || 0;
    G.mouse.dy = ev.movementY || 0;
    G.mouse.x = ev.clientX;
    G.mouse.y = ev.clientY;
  });
  canvas.addEventListener('mousedown', (ev) => {
    if (ev.button !== 0) return;
    G.mouse.down = true;
    G.mouse.clicked = true;
    G.mouse.x = ev.clientX;
    G.mouse.y = ev.clientY;
    resumeRadio();
  });
  window.addEventListener('mouseup', (ev) => {
    if (ev.button !== 0) return;
    G.mouse.down = false;
  });
}

function boot() {
  const params = new URLSearchParams(window.location.search);
  G.lowQ = params.get('low') === '1';
  const ts = parseFloat(params.get('ts'));
  if (Number.isFinite(ts) && ts > 0) G._timeScale = ts;
  G.vw = window.innerWidth;
  G.vh = window.innerHeight;
  initScene(document.getElementById('game-canvas'));
  buildWorld(G.seed);
  const p = spawnPlayer(G.world.spawn.x, G.world.spawn.y);
  p.mesh = p.rig;
  p.invuln = 0;
  p.z = 0;
  p.onGround = true;
  spawnPeds(24);
  spawnTraffic(14);
  spawnParked(12);
  pickExportTarget();
  initDepth();
  G.policeSpawnTimer = 1.6;
  wireInput();
  initUI({
    onStart: () => { resetRun(); beginPlay(); },
    onContinue: () => {
      const s = mostRecentSlot();
      if (s >= 0) loadSlot(s);
      beginPlay();
    },
    onChip: (slot) => {
      if (slotInfo(slot)) loadSlot(slot);
      else { G.saveSlot = slot; resetRun(); }
      beginPlay();
    },
    onRetry: () => {
      if (!loadSlot(G.saveSlot)) resetRun();
      beginPlay();
    },
    onStoryContinue: () => { G.state = 'playing'; },
    onSave: (slot) => {
      if (saveGame(slot)) toast('Game saved to slot ' + slot + '.', 3);
      else toast('Save failed.', 3);
      renderPauseTab();
    },
    onLoad: (slot) => {
      if (loadSlot(slot)) {
        G.state = 'playing';
        toast('Save loaded.', 3);
      }
    },
    onDelete: (slot) => { deleteSave(slot); renderPauseTab(); },
    onResume: () => { G.state = 'playing'; },
    onRestart: () => { resetRun(); G.state = 'playing'; },
  });
  renderTitleSlots();
  G.missionMarker = missionMarkerPos;
  window.MERIDIAN = G;
  window.MERIDIAN_THREE = { renderer: G.renderer, scene: G.scene, camera: G.cam3 };
  requestAnimationFrame(frame);
}

boot();
