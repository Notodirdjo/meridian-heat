import { CFG, G } from './config.js';
import { districtAt } from './world.js';

const KEY = (slot) => CFG.SAVE_KEY + ':' + slot;
let autoTimer = 0;

export function collectSave() {
  const p = G.player;
  return {
    v: 2, savedAt: Date.now(),
    money: G.money, health: G.health, armour: G.armour, rp: G.rp,
    rep: { ...G.rep },
    crew: JSON.parse(JSON.stringify(G.crew)),
    anchorsFound: G.anchorsFound,
    anchors: G.anchors.map((a) => a.found),
    ratings: { ...G.ratings },
    racesWon: G.racesWon, racesDone: [...G.racesDone],
    jumpsDone: G.jumpsDone, jumpsFound: [...G.jumpsFound],
    exportsDone: G.exportsDone, exportsDelivered: [...G.exportsDelivered],
    missionsDone: [...G.missionsDone], storyDone: G.storyDone,
    weapon: G.weapon, ammo: G.ammo, reserveAmmo: G.reserveAmmo,
    smgAmmo: G.smgAmmo, smgReserve: G.smgReserve, smgUnlocked: G.smgUnlocked,
    radioStation: G.radioStation,
    player: p ? { x: p.x, y: p.y, angle: p.angle } : null,
    playtime: G.playtime, dayTime: G.dayTime, seed: G.seed,
    stats: { ...G.stats },
  };
}

export function saveGame(slot) {
  try {
    localStorage.setItem(KEY(slot), JSON.stringify(collectSave()));
    G.saveSlot = slot;
    return true;
  } catch (e) { return false; }
}

export function readSave(slot) {
  try {
    const raw = localStorage.getItem(KEY(slot));
    if (!raw) return null;
    const d = JSON.parse(raw);
    return d && d.v === 2 ? d : null;
  } catch (e) { return null; }
}

export function slotInfo(slot) {
  const d = readSave(slot);
  if (!d) return null;
  return {
    exists: true, money: d.money, missions: d.missionsDone.length,
    playtime: d.playtime, savedAt: d.savedAt,
    district: d.player ? districtAt(d.player.x, d.player.y) : 'PORT MERIDIAN',
  };
}

export function applySave(d) {
  G.money = d.money; G.health = d.health; G.armour = d.armour; G.rp = d.rp;
  G.rep = { ...G.rep, ...d.rep };
  for (const k of Object.keys(G.crew)) if (d.crew[k]) G.crew[k] = { ...G.crew[k], ...d.crew[k] };
  G.anchorsFound = d.anchorsFound;
  G.anchors.forEach((a, i) => { a.found = !!d.anchors[i]; });
  G.ratings = { ...d.ratings };
  G.racesWon = d.racesWon; G.racesDone = [...d.racesDone];
  G.jumpsDone = d.jumpsDone; G.jumpsFound = [...d.jumpsFound];
  G.exportsDone = d.exportsDone; G.exportsDelivered = [...d.exportsDelivered];
  G.missionsDone = [...d.missionsDone]; G.storyDone = d.storyDone;
  G.weapon = d.weapon; G.ammo = d.ammo; G.reserveAmmo = d.reserveAmmo;
  G.smgAmmo = d.smgAmmo; G.smgReserve = d.smgReserve; G.smgUnlocked = d.smgUnlocked;
  G.radioStation = d.radioStation;
  G.playtime = d.playtime; G.dayTime = d.dayTime; G.seed = d.seed;
  G.stats = { ...G.stats, ...d.stats };
  G.wanted = 0; G.mission = null; G.race = null; G.gunmen = []; G.cops = [];
  G.bullets = []; G.heli = null; G.eyesOutTimer = 0;
  if (d.player && G.player) {
    G.player.x = d.player.x; G.player.y = d.player.y; G.player.angle = d.player.angle;
    G.player.car = null;
    G.player.rig.group.visible = true;
  }
}

export function loadGame(slot) {
  const d = readSave(slot);
  if (!d) return false;
  applySave(d);
  G.saveSlot = slot;
  return true;
}

export function deleteSave(slot) {
  try { localStorage.removeItem(KEY(slot)); return true; }
  catch (e) { return false; }
}

export function autosaveTick(dt) {
  if (G.state !== 'playing') return;
  autoTimer += dt;
  if (autoTimer >= 20) {
    autoTimer = 0;
    saveGame(0);
  }
}
