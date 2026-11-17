// MERIDIAN HEAT — entities.js: the player, cars, traffic AI, pedestrians
// and police, plus the wanted system and particles.
// Design rules baked in from the start:
//  - car-vs-car damage: one impact per 0.6 s cooldown, never per frame;
//  - police rams never explode the player's car, and rams on foot are
//    survivable (modest damage + real knockback);
//  - wanted decays after a quiet spell with no police near.

import { CFG, G, clamp, lerp, dist, angleTo, angDiff, addShake, toast, pick } from './config.js';
import { buildingHit, resolveBuildingCollision, onRoad, nearestRoadPoint, inWater } from './world.js';
import { sfx } from './audio.js';

const CAR_COLORS = ['#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad', '#ecf0f1', '#2c3e50', '#e67e22', '#16a085', '#d35400'];
const PED_COLORS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8', '#00cec9'];
let carId = 1;

// ---- particles ---------------------------------------------------------
export function spawnParticles(x, y, n, colors, speed = 180, life = 0.6, size = 4) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    G.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * (0.5 + Math.random() * 0.5), maxLife: life,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: size * (0.6 + Math.random() * 0.8),
    });
  }
}
export function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= (1 - 2.2 * dt); p.vy *= (1 - 2.2 * dt);
    if (p.life <= 0) G.particles.splice(i, 1);
  }
  for (let i = G.skidmarks.length - 1; i >= 0; i--) {
    G.skidmarks[i].life -= dt;
    if (G.skidmarks[i].life <= 0) G.skidmarks.splice(i, 1);
  }
}

// ---- player ------------------------------------------------------------
export function spawnPlayer() {
  G.player = {
    x: G.world.spawn.x, y: G.world.spawn.y, angle: -Math.PI / 2,
    hp: G.health, car: null, speed: 0, invuln: 0,
    arrestProgress: 0, knockX: 0, knockY: 0,
  };
  G.health = G.player.hp;
}

export function addWanted(n) {
  const before = G.wanted;
  G.wanted = clamp(G.wanted + n, 0, 5);
  if (G.wanted > before) G.lastCrime = G.time;
}

export function damagePlayer(amount, kx = 0, ky = 0) {
  const p = G.player;
  if (!p || p.invuln > 0 || G.state !== 'playing') return;
  p.hp -= amount;
  G.health = Math.max(0, p.hp);
  p.knockX += kx; p.knockY += ky;
  p.invuln = 0.35;
  addShake(4);
  sfx.hurt();
  if (p.hp <= 0) {
    p.hp = 0; G.health = 0;
    G.state = 'wasted';
    spawnParticles(p.x, p.y, 26, ['#e74c3c', '#f39c12', '#ffffff'], 220, 0.9, 5);
  }
}

// ---- cars --------------------------------------------------------------
export function makeCar(x, y, angle, kind, color, opts = {}) {
  const car = {
    id: carId++, x, y, angle, speed: 0,
    kind, // 'traffic' | 'parked' | 'police' | 'gold' | 'player'
    color: color || CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
    hp: opts.hp || 100,
    w: 46, h: 22,
    driver: opts.driver || null, // 'player' | 'traffic' | null
    axis: opts.axis || null, // road axis for traffic/police pursuit; null until derived
    dir: opts.dir || 1,
    roadIdx: opts.roadIdx ?? null,
    lane: opts.lane || 0,
    lastHit: 0, hitCooldown: 0,
    giveUp: 0, stuck: 0,
    siren: kind === 'police',
    name: opts.name || null,
  };
  G.cars.push(car);
  return car;
}

export function spawnTrafficAndParked(rng) {
  // Parked cars along roads.
  for (let i = 0; i < 16; i++) {
    const p = nearestRoadPoint(200 + rng() * 3200, 200 + rng() * 2200);
    const along = p.axis === 'v';
    const off = (rng() > 0.5 ? 1 : -1) * (CFG.ROAD_W / 2 - 16);
    const x = along ? p.x + off : p.x + (rng() - 0.5) * 300;
    const y = along ? p.y + (rng() - 0.5) * 300 : p.y + off;
    if (dist(x, y, G.world.spawn.x, G.world.spawn.y) < 120) continue;
    // Face along the road: vertical road -> north/south, horizontal -> east/west.
    makeCar(x, y, along ? (rng() > 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() > 0.5 ? 0 : Math.PI), 'parked', null, { driver: null });
  }
  // Moving traffic.
  for (let i = 0; i < 14; i++) {
    const p = nearestRoadPoint(200 + rng() * 3200, 200 + rng() * 2200);
    const lane = (rng() > 0.5 ? 1 : -1) * 22;
    const c = makeCar(
      p.axis === 'v' ? p.x + lane : p.x,
      p.axis === 'v' ? p.y : p.y + lane,
      0, 'traffic', null,
      { axis: p.axis, dir: rng() > 0.5 ? 1 : -1, driver: 'traffic' },
    );
    c.angle = p.axis === 'v' ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
    c.speed = CFG.TRAFFIC_SPEED_MIN + rng() * (CFG.TRAFFIC_SPEED_MAX - CFG.TRAFFIC_SPEED_MIN);
    c.cruise = c.speed;
  }
  // The gold Comet Sport for mission 2, parked at its lot.
  const gs = G.world.missionSpots.hotWheels;
  makeCar(gs.x, gs.y, Math.PI / 2, 'gold', '#f1c40f', { name: 'Comet Sport', driver: null });
}

function carCollideBuildings(car, r) {
  const b = buildingHit(car.x, car.y, r);
  if (!b) return false;
  // Stop and bounce back a little instead of sticking.
  car.speed *= -0.25;
  car.x -= Math.cos(car.angle) * 6;
  car.y -= Math.sin(car.angle) * 6;
  // A police car that rams a building picks a fixed detour heading to
  // slide around it instead of grinding head-on forever.
  if (car.kind === 'police') {
    car.avoidT = 0.9;
    car.avoidDir = Math.random() > 0.5 ? 1 : -1;
    car.avoidAngle = car.angle + car.avoidDir * 1.5;
  }
  if (car.driver === 'player' && G.time - car.lastHit > CFG.CAR_HIT_COOLDOWN) {
    car.lastHit = G.time;
    car.hp -= 6;
    sfx.crash();
    addShake(5);
    spawnParticles(car.x, car.y, 8, ['#bdc3c7', '#f39c12'], 120, 0.4, 3);
  }
  return true;
}

// One car-vs-car impact, with the 0.6 s cooldown that keeps police rams
// from shredding the player's car frame by frame.
function carVsCar(a, b) {
  const d = dist(a.x, a.y, b.x, b.y);
  if (d > 52 || d === 0) return;
  const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
  const overlap = 52 - d;
  a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
  b.x += nx * overlap / 2; b.y += ny * overlap / 2;
  const relSpeed = Math.abs(a.speed - b.speed) + 40;
  if (G.time - a.lastHit > CFG.CAR_HIT_COOLDOWN && G.time - b.lastHit > CFG.CAR_HIT_COOLDOWN) {
    a.lastHit = G.time; b.lastHit = G.time;
    const dmg = clamp(relSpeed * 0.06, 4, 18);
    const playerCar = a.driver === 'player' ? a : b.driver === 'player' ? b : null;
    const other = playerCar === a ? b : a;
    if (playerCar && other.kind === 'police') {
      // Police ram: modest damage only, never an explosion.
      playerCar.hp -= Math.min(dmg, 8);
      sfx.crash(); addShake(6);
    } else if (playerCar) {
      playerCar.hp -= dmg;
      sfx.crash(); addShake(6);
    } else {
      a.hp -= dmg * 0.5; b.hp -= dmg * 0.5;
      if (Math.random() < 0.4) sfx.crash();
    }
    spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 10, ['#f39c12', '#bdc3c7', '#ffffff'], 160, 0.5, 3);
    // Nudge speeds apart so the cars separate instead of grinding.
    a.speed *= 0.6; b.speed *= 0.6;
  }
}

function explodeCar(car) {
  spawnParticles(car.x, car.y, 42, ['#e74c3c', '#f39c12', '#f1c40f', '#2c3e50'], 320, 1.0, 6);
  addShake(16);
  sfx.explosion();
  const p = G.player;
  if (p && dist(p.x, p.y, car.x, car.y) < 150) {
    damagePlayer(30, (p.x - car.x) * 0.6, (p.y - car.y) * 0.6);
  }
  if (car.driver === 'player' && p) {
    // Eject the player from the wreck.
    p.car = null;
    p.x = car.x + 60; p.y = car.y;
    p.invuln = 1.2;
    toast('Your car blew up!');
  }
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
}

export function updateCars(dt) {
  const p = G.player;
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const c = G.cars[i];
    if (c.hp <= 0) { explodeCar(c); continue; }
    if (c.kind === 'traffic') updateTrafficCar(c, dt);
    else if (c.kind === 'police') updatePoliceCar(c, dt);
    else if (c.driver === 'player') updatePlayerCar(c, dt);
    // Parked / gold cars sit still.
    carCollideBuildings(c, 26);
    c.x = clamp(c.x, 40, CFG.WORLD_W - 40);
    c.y = clamp(c.y, 40, CFG.WORLD_H - 40);
  }
  // Pairwise car collisions (small N, O(n^2) is fine).
  for (let i = 0; i < G.cars.length; i++) {
    for (let j = i + 1; j < G.cars.length; j++) {
      carVsCar(G.cars[i], G.cars[j]);
    }
  }
  // Player car hitting peds.
  if (p && p.car) {
    for (const ped of G.peds) {
      if (!ped.down && dist(p.x, p.y, ped.x, ped.y) < 34 && Math.abs(p.car.speed) > 120) {
        knockPed(ped, p.x, p.y);
        addWanted(1);
        toast('You ran someone over! The police are coming.');
      }
    }
  }
}

function updatePlayerCar(c, dt) {
  const p = G.player;
  const fwd = (G.keys.has('KeyW') || G.keys.has('ArrowUp') ? 1 : 0) - (G.keys.has('KeyS') || G.keys.has('ArrowDown') ? 1 : 0);
  const steer = (G.keys.has('KeyA') || G.keys.has('ArrowLeft') ? -1 : 0) + (G.keys.has('KeyD') || G.keys.has('ArrowRight') ? 1 : 0);
  const handbrake = G.keys.has('Space');
  if (fwd > 0) c.speed += CFG.CAR_ACCEL * dt;
  else if (fwd < 0) c.speed -= CFG.CAR_BRAKE * dt * 0.8;
  else c.speed *= (1 - 0.7 * dt);
  if (handbrake) c.speed *= (1 - 2.4 * dt);
  c.speed = clamp(c.speed, -CFG.CAR_MAX_SPEED * 0.45, CFG.CAR_MAX_SPEED);
  const grip = handbrake ? 1.7 : 1;
  c.angle += steer * CFG.CAR_TURN * grip * dt * clamp(Math.abs(c.speed) / 160, 0, 1) * (c.speed >= 0 ? 1 : -1);
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;
  if (Math.abs(c.speed) > 200 && (handbrake || Math.abs(steer) > 0)) {
    G.skidmarks.push({ x: c.x - Math.cos(c.angle) * 18, y: c.y - Math.sin(c.angle) * 18, life: 1.6, maxLife: 1.6 });
    if (Math.random() < 0.5) spawnParticles(c.x - Math.cos(c.angle) * 20, c.y - Math.sin(c.angle) * 20, 1, ['#7f8c8d'], 40, 0.4, 3);
  }
  p.x = c.x; p.y = c.y; p.angle = c.angle; p.speed = c.speed;
}

function updateTrafficCar(c, dt) {
  const w = G.world;
  const ahead = 60;
  const ax = c.x + Math.cos(c.angle) * ahead, ay = c.y + Math.sin(c.angle) * ahead;
  // Slow for cars ahead on the same road.
  let target = c.cruise;
  for (const o of G.cars) {
    if (o === c || o.kind === 'parked') continue;
    const d = dist(c.x, c.y, o.x, o.y);
    if (d < 90 && Math.abs(angDiff(c.angle, angleTo(c.x, c.y, o.x, o.y))) < 0.6) target = Math.min(target, 40);
  }
  // Slow for a pedestrian right in front.
  for (const ped of G.peds) {
    if (!ped.down && dist(ax, ay, ped.x, ped.y) < 34) { target = 0; break; }
  }
  c.speed = lerp(c.speed, target, clamp(1.5 * dt, 0, 1));
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;
  // At an intersection, sometimes turn onto the crossing road.
  const nearV = w.roadsV.some((rx) => Math.abs(c.x - rx) < 26);
  const nearH = w.roadsH.some((ry) => Math.abs(c.y - ry) < 26);
  if ((c.axis === 'v' && nearH) || (c.axis === 'h' && nearV)) {
    if (Math.random() < 0.35) {
      if (c.axis === 'v') {
        c.axis = 'h';
        c.dir = Math.random() > 0.5 ? 1 : -1;
        c.angle = c.dir > 0 ? 0 : Math.PI;
      } else {
        c.axis = 'v';
        c.dir = Math.random() > 0.5 ? 1 : -1;
        c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        c.x = w.roadsV.reduce((a, b) => Math.abs(b - c.x) < Math.abs(a - c.x) ? b : a);
      }
      // Re-lane onto the new road centre.
      if (c.axis === 'h') c.y = w.roadsH.reduce((a, b) => Math.abs(b - c.y) < Math.abs(a - c.y) ? b : a) + (c.dir > 0 ? 22 : -22);
      else c.x = w.roadsV.reduce((a, b) => Math.abs(b - c.x) < Math.abs(a - c.x) ? b : a) + (c.dir > 0 ? -22 : 22);
    }
  }
  // Wrap around the world edges on the same road.
  if (c.x < 80 || c.x > CFG.WORLD_W - 80 || c.y < 80 || c.y > CFG.WORLD_H - 160) {
    c.dir *= -1;
    c.angle += Math.PI;
    c.x = clamp(c.x, 120, CFG.WORLD_W - 120);
    c.y = clamp(c.y, 120, CFG.WORLD_H - 200);
  }
}

function nextRoadInDir(list, val, dir) {
  if (dir > 0) {
    for (const v of list) if (v > val + 1) return v;
  } else {
    for (let i = list.length - 1; i >= 0; i--) if (list[i] < val - 1) return list[i];
  }
  return null;
}
function nearestRoadIdx(list, val) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < list.length; i++) {
    const d = Math.abs(list[i] - val);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// Pick the police car's road axis from its position (used at spawn and
// when it has cut across a block during a direct chase).
function initPoliceAxis(c, p) {
  const w = G.world;
  const iv = nearestRoadIdx(w.roadsV, c.x);
  const ih = nearestRoadIdx(w.roadsH, c.y);
  if (Math.abs(c.x - w.roadsV[iv]) <= Math.abs(c.y - w.roadsH[ih])) {
    c.axis = 'v'; c.roadIdx = iv; c.dir = p.y >= c.y ? 1 : -1;
  } else {
    c.axis = 'h'; c.roadIdx = ih; c.dir = p.x >= c.x ? 1 : -1;
  }
}
// At an intersection, pick the road move whose next intersection is
// closest to the player (greedy grid pursuit, no U-turns).
function decidePoliceTurn(c, p, rx, ry) {
  const w = G.world;
  const iv = nearestRoadIdx(w.roadsV, rx);
  const ih = nearestRoadIdx(w.roadsH, ry);
  const options = [];
  if (c.axis === 'v') {
    const nh = nextRoadInDir(w.roadsH, ry, c.dir);
    if (nh !== null) options.push({ axis: 'v', dir: c.dir, roadIdx: iv, x: rx, y: nh });
    const ev = nextRoadInDir(w.roadsV, rx, 1);
    if (ev !== null) options.push({ axis: 'h', dir: 1, roadIdx: ih, x: ev, y: ry });
    const wv = nextRoadInDir(w.roadsV, rx, -1);
    if (wv !== null) options.push({ axis: 'h', dir: -1, roadIdx: ih, x: wv, y: ry });
  } else {
    const nv = nextRoadInDir(w.roadsV, rx, c.dir);
    if (nv !== null) options.push({ axis: 'h', dir: c.dir, roadIdx: ih, x: nv, y: ry });
    const sh = nextRoadInDir(w.roadsH, ry, 1);
    if (sh !== null) options.push({ axis: 'v', dir: 1, roadIdx: iv, x: rx, y: sh });
    const nh = nextRoadInDir(w.roadsH, ry, -1);
    if (nh !== null) options.push({ axis: 'v', dir: -1, roadIdx: iv, x: rx, y: nh });
  }
  let best = null, bd = 1e18;
  for (const o of options) {
    const d = dist(o.x, o.y, p.x, p.y);
    if (d < bd) { bd = d; best = o; }
  }
  if (best) {
    c.axis = best.axis;
    c.dir = best.dir;
    c.roadIdx = best.roadIdx;
  }
}

function updatePoliceCar(c, dt) {
  const p = G.player;
  if (!p) return;
  const d = dist(c.x, c.y, p.x, p.y);
  // Far patrols give up so the wanted level can decay.
  if (d > 1100) {
    c.giveUp += dt;
    if (c.giveUp > 4) {
      const i = G.cars.indexOf(c);
      if (i >= 0) G.cars.splice(i, 1);
      return;
    }
  } else c.giveUp = 0;

  if (d < 240) {
    // Close in: direct pursuit and ram (with building avoidance).
    const target = angleTo(c.x, c.y, p.x, p.y);
    let steerTo = target;
    if (c.avoidT > 0) {
      c.avoidT -= dt;
      steerTo = c.avoidAngle;
    }
    const diff = angDiff(c.angle, steerTo);
    c.angle += clamp(diff, -3.4 * dt, 3.4 * dt);
    const want = d > 90 ? CFG.POLICE_CAR_SPEED : CFG.POLICE_CAR_SPEED * 0.55;
    c.speed = lerp(c.speed, want, clamp(2 * dt, 0, 1));
    c.x += Math.cos(c.angle) * c.speed * dt;
    c.y += Math.sin(c.angle) * c.speed * dt;
  } else {
    // Road mode: follow the grid toward the player, turning greedily
    // at intersections. This is what keeps a chase alive in a city of
    // buildings — straight-line pursuit just grinds into walls.
    const w = G.world;
    if (!c.axis || c.roadIdx === null || c.roadIdx === undefined) initPoliceAxis(c, p);
    if (c.axis === 'v' && Math.abs(c.x - w.roadsV[c.roadIdx]) > 90) initPoliceAxis(c, p);
    if (c.axis === 'h' && Math.abs(c.y - w.roadsH[c.roadIdx]) > 90) initPoliceAxis(c, p);
    c.speed = lerp(c.speed, CFG.POLICE_CAR_SPEED, clamp(2 * dt, 0, 1));
    if (c.axis === 'v') {
      const rx = w.roadsV[c.roadIdx];
      const lane = c.dir > 0 ? -22 : 22;
      c.x = lerp(c.x, rx + lane, clamp(8 * dt, 0, 1));
      c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      // The next crossing must be found BEFORE moving, or a car that has
      // just passed an intersection looks for the one after it and never
      // turns.
      const nextRy = nextRoadInDir(w.roadsH, c.y, c.dir);
      c.y += c.dir * c.speed * dt;
      if (nextRy !== null && ((c.dir > 0 && c.y >= nextRy) || (c.dir < 0 && c.y <= nextRy))) {
        c.y = nextRy;
        decidePoliceTurn(c, p, rx, nextRy);
      }
    } else {
      const ry = w.roadsH[c.roadIdx];
      const lane = c.dir > 0 ? 22 : -22;
      c.y = lerp(c.y, ry + lane, clamp(8 * dt, 0, 1));
      c.angle = c.dir > 0 ? 0 : Math.PI;
      const nextRx = nextRoadInDir(w.roadsV, c.x, c.dir);
      c.x += c.dir * c.speed * dt;
      if (nextRx !== null && ((c.dir > 0 && c.x >= nextRx) || (c.dir < 0 && c.x <= nextRx))) {
        c.x = nextRx;
        decidePoliceTurn(c, p, nextRx, ry);
      }
    }
  }
  // Ram the player on foot: survivable — modest damage + real knockback.
  if (!p.car && d < 46) {
    const kx = (p.x - c.x) / (d || 1) * 260, ky = (p.y - c.y) / (d || 1) * 260;
    damagePlayer(12, kx, ky);
    c.speed *= 0.4;
  }
}

// ---- entering / exiting cars -------------------------------------------
export function nearestCar(maxD = 70) {
  const p = G.player;
  let best = null, bd = maxD;
  for (const c of G.cars) {
    if (c.driver === 'player') continue;
    const d = dist(p.x, p.y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function enterCar(car) {
  const p = G.player;
  if (!car || car.hp <= 0) return false;
  const wasParked = car.kind === 'parked' || car.kind === 'gold';
  const wasTraffic = car.kind === 'traffic';
  car.driver = 'player';
  car.kind = 'player';
  p.car = car;
  p.x = car.x; p.y = car.y;
  sfx.carEnter();
  if (wasParked || wasTraffic) {
    G.stats.carsStolen++;
    addWanted(1);
    toast(wasTraffic ? 'You jacked a moving car! Wanted level up.' : 'Car stolen! Wanted level up.');
    if (car.name) toast('You stole the ' + car.name + '!');
  }
  return true;
}

export function exitCar() {
  const p = G.player;
  if (!p.car) return;
  const car = p.car;
  car.speed = 0;
  car.driver = null;
  car.kind = car.name ? 'gold' : 'parked';
  p.car = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
  resolveBuildingCollision(p, CFG.PLAYER_RADIUS);
  sfx.carEnter();
}

// ---- pedestrians -------------------------------------------------------
export function spawnPeds(rng, n = 42) {
  for (let i = 0; i < n; i++) {
    const p = nearestRoadPoint(150 + rng() * 3300, 150 + rng() * 2300);
    const side = rng() > 0.5 ? 1 : -1;
    G.peds.push({
      x: p.axis === 'v' ? p.x + side * 72 : p.x + (rng() - 0.5) * 260,
      y: p.axis === 'v' ? p.y + (rng() - 0.5) * 260 : p.y + side * 72,
      angle: rng() * Math.PI * 2,
      speed: CFG.PED_SPEED * (0.7 + rng() * 0.6),
      color: PED_COLORS[Math.floor(rng() * PED_COLORS.length)],
      state: 'walk', // walk | flee | down
      tx: 0, ty: 0, retarget: 0, downTimer: 0, fleeTimer: 0,
    });
  }
}

export function knockPed(ped, fx, fy) {
  ped.down = true;
  ped.state = 'down';
  ped.downTimer = 6;
  const d = dist(fx, fy, ped.x, ped.y) || 1;
  ped.x += (ped.x - fx) / d * 26;
  ped.y += (ped.y - fy) / d * 26;
  spawnParticles(ped.x, ped.y, 10, ['#e74c3c', '#ffffff'], 120, 0.5, 3);
  G.stats.pedsDown++;
}

export function updatePeds(dt) {
  const p = G.player;
  for (let i = G.peds.length - 1; i >= 0; i--) {
    const ped = G.peds[i];
    if (ped.state === 'down') {
      ped.downTimer -= dt;
      if (ped.downTimer <= 0) G.peds.splice(i, 1);
      continue;
    }
    // Flee gunfire or a speeding car nearby.
    let threatX = 0, threatY = 0, threat = false;
    if (p) {
      const d = dist(ped.x, ped.y, p.x, p.y);
      if (G.shotRecently && d < 320) { threat = true; threatX = p.x; threatY = p.y; }
      if (p.car && Math.abs(p.car.speed) > 200 && d < 170) { threat = true; threatX = p.x; threatY = p.y; }
    }
    if (threat) {
      ped.state = 'flee'; ped.fleeTimer = 1.6;
      ped.angle = angleTo(threatX, threatY, ped.x, ped.y);
    } else if (ped.state === 'flee') {
      ped.fleeTimer -= dt;
      if (ped.fleeTimer <= 0) ped.state = 'walk';
    }
    const speed = ped.state === 'flee' ? CFG.PED_FLEE_SPEED : ped.speed;
    ped.retarget -= dt;
    if (ped.retarget <= 0) {
      ped.retarget = 2 + Math.random() * 3;
      const np = nearestRoadPoint(ped.x + (Math.random() - 0.5) * 400, ped.y + (Math.random() - 0.5) * 400);
      ped.tx = np.x; ped.ty = np.y;
    }
    if (ped.state === 'walk') ped.angle = angleTo(ped.x, ped.y, ped.tx, ped.ty);
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    ped.x = clamp(ped.x, 60, CFG.WORLD_W - 60);
    ped.y = clamp(ped.y, 60, CFG.WORLD_H - 200);
    if (!onRoad(ped.x, ped.y) && buildingHit(ped.x, ped.y, 10)) {
      ped.angle += Math.PI / 2;
      ped.retarget = 0;
    }
  }
  // Keep the streets populated.
  if (G.peds.length < 30 && Math.random() < dt * 0.5) {
    const np = nearestRoadPoint(p.x + (Math.random() - 0.5) * 900, p.y + (Math.random() - 0.5) * 900);
    G.peds.push({
      x: np.x, y: np.y, angle: Math.random() * Math.PI * 2,
      speed: CFG.PED_SPEED, color: pick(Math.random, PED_COLORS),
      state: 'walk', tx: np.x, ty: np.y, retarget: 0, downTimer: 0, fleeTimer: 0,
    });
  }
}

// ---- police ------------------------------------------------------------
export function policeCount() {
  return G.cars.filter((c) => c.kind === 'police').length;
}
export function footCopCount() {
  return G.cops.length;
}

export function updatePolice(dt) {
  const p = G.player;
  if (!p) return;
  // Spawn patrol cars up to the wanted level; foot cops from 2 stars.
  // After a quiet spell no reinforcements arrive — that is what lets the
  // wanted level decay. Cars and foot cops spawn independently so one
  // kind can never starve the other.
  const wantCars = G.wanted;
  const wantCops = G.wanted >= 2 ? Math.min(G.wanted - 1, 3) : 0;
  const quiet = G.time - G.lastCrime > CFG.QUIET_SPELL;
  G.policeSpawnTimer -= dt;
  if (G.policeSpawnTimer <= 0) {
    G.policeSpawnTimer = 1.6;
    if (!quiet && G.wanted > 0) {
      if (policeCount() < wantCars) {
        const a = Math.random() * Math.PI * 2;
        const sx = p.x + Math.cos(a) * 560, sy = p.y + Math.sin(a) * 560;
        const np = nearestRoadPoint(clamp(sx, 120, CFG.WORLD_W - 120), clamp(sy, 120, CFG.WORLD_H - 200));
        const car = makeCar(np.x, np.y, angleTo(np.x, np.y, p.x, p.y), 'police', '#1f3a93', { driver: 'police', hp: 120 });
        car.speed = 200;
      }
      if (footCopCount() < wantCops && !p.car) {
        const a = Math.random() * Math.PI * 2;
        G.cops.push({
          x: clamp(p.x + Math.cos(a) * 420, 60, CFG.WORLD_W - 60),
          y: clamp(p.y + Math.sin(a) * 420, 60, CFG.WORLD_H - 200),
          angle: 0, hp: 60, speed: CFG.COP_SPEED, hold: 0, shootCd: 1.2,
        });
      }
    }
  }
  // Foot cops chase and arrest on a ~1.4 s hold.
  for (let i = G.cops.length - 1; i >= 0; i--) {
    const cop = G.cops[i];
    if (cop.hp <= 0) {
      G.cops.splice(i, 1);
      G.stats.copsDown++;
      addWanted(1);
      spawnParticles(cop.x, cop.y, 14, ['#e74c3c', '#ffffff'], 160, 0.6, 4);
      continue;
    }
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (p.car) {
      // Cops can't catch a car; they give up and fade out.
      cop.hold = 0;
      if (d > 900) G.cops.splice(i, 1);
      continue;
    }
    cop.angle = angleTo(cop.x, cop.y, p.x, p.y);
    if (d > 52) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      cop.hold = 0;
    } else {
      cop.hold += dt;
      if (cop.hold >= CFG.ARREST_HOLD) {
        G.state = 'busted';
        sfx.arrest();
        return;
      }
    }
    resolveBuildingCollision(cop, 12);
  }
  // Wanted decays after a quiet spell with no police near.
  const nearestPolice = Math.min(
    ...G.cars.filter((c) => c.kind === 'police').map((c) => dist(c.x, c.y, p.x, p.y)),
    ...G.cops.map((c) => dist(c.x, c.y, p.x, p.y)),
    1e9,
  );
  if (G.wanted > 0 && G.time - G.lastCrime > CFG.QUIET_SPELL && nearestPolice > 700) {
    G.decayTimer += dt;
    if (G.decayTimer >= CFG.DECAY_EVERY) {
      G.decayTimer = 0;
      G.wanted--;
      if (G.wanted === 0) toast('You lost the cops. Lay low.');
    }
  } else {
    G.decayTimer = 0;
  }
  // Clear leftover cops once the heat is off.
  if (G.wanted === 0 && G.cops.length > 0 && Math.random() < dt) G.cops.pop();
}
