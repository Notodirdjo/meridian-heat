// MERIDIAN HEAT — shots.js: staged screenshot states.
// ?shot=title|drive|mission|combat&seed=N puts the game into a REAL game
// state for screenshots. Nothing is faked: drive is a live mid-drive with
// traffic and wanted stars, mission is mid-mission, combat is a live
// shootout, title is the real title screen.

import { CFG, G, dist } from './config.js';
import { makeCar, enterCar, spawnTrafficAndParked, spawnPeds, spawnPlayer } from './entities.js';
import { spawnGunman } from './combat.js';
import { startMission, MISSIONS } from './missions.js';

export function applyShotParams(params) {
  const shot = params.get('shot');
  const seed = parseInt(params.get('seed') || '7', 10) || 7;
  G.seed = seed;
  if (!shot) return;
  G.shot = shot;
  if (shot === 'title') {
    G.state = 'title';
    // Attract-mode world behind the title: traffic + peds keep moving.
    return;
  }
  // All other shots start a live game.
  G.state = 'playing';
  const p = G.player;
  if (shot === 'drive') {
    // Mid-drive: player in a fast car on a main road, 2 wanted stars,
    // police cars in pursuit, traffic ahead.
    const road = G.world.roadsH[2];
    const car = makeCar(1500, road + 22, 0, 'player', '#c0392b', { driver: 'player', hp: 92 });
    car.speed = 380;
    car.cruise = 380;
    p.car = car;
    p.x = car.x; p.y = car.y; p.angle = 0;
    G.wanted = 2;
    G.lastCrime = G.time;
    G.money = 1250;
    // Two police cars chasing.
    const pc1 = makeCar(1320, road - 22, 0, 'police', '#1f3a93', { driver: 'police', hp: 120 });
    pc1.speed = 420;
    const pc2 = makeCar(1180, road + 22, 0, 'police', '#1f3a93', { driver: 'police', hp: 120 });
    pc2.speed = 400;
    // Traffic ahead.
    const t1 = makeCar(1780, road - 22, 0, 'traffic', '#2980b9', { driver: 'traffic' });
    t1.speed = 150; t1.cruise = 150;
    const t2 = makeCar(1960, road + 22, 0, 'traffic', '#27ae60', { driver: 'traffic' });
    t2.speed = 140; t2.cruise = 140;
    G.camera.x = p.x; G.camera.y = p.y;
  } else if (shot === 'mission') {
    // Mid-mission 1: second checkpoint active, timer running.
    const m = startMission(MISSIONS[0]);
    m.cpIndex = 1;
    m.timer = 62;
    G.missionCard = null; // skip the intro card for the shot
    p.x = 2400; p.y = 720;
    const car = makeCar(2400, 742, 0, 'player', '#8e44ad', { driver: 'player', hp: 100 });
    car.speed = 300;
    p.car = car;
    G.money = 750;
    G.camera.x = p.x; G.camera.y = p.y;
  } else if (shot === 'combat') {
    // On-foot shootout on the docks: gunmen + foot cops closing in.
    p.x = 1560; p.y = 2350;
    p.angle = Math.PI / 2;
    G.aimAngle = Math.PI / 2;
    G.ammo = 9;
    G.wanted = 3;
    G.lastCrime = G.time;
    G.money = 2100;
    spawnGunman(1560, 2180, { hp: 80 });
    spawnGunman(1440, 2260, { hp: 60 });
    spawnGunman(1700, 2240, { hp: 80 });
    G.cops.push({ x: 1420, y: 2420, angle: 0, hp: 60, speed: 205, hold: 0, shootCd: 1 });
    G.cops.push({ x: 1740, y: 2440, angle: 0, hp: 60, speed: 205, hold: 0, shootCd: 1.4 });
    G.camera.x = p.x; G.camera.y = p.y;
  }
  G._shotReady = true;
}
