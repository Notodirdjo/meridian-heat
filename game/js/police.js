import * as THREE from '../vendor/three.module.min.js';
import { CFG, G, clamp, lerp, dist, angleTo, angDiff, toast, wx, wz } from './config.js';
import { nearestRoadPoint, districtAt, buildingHit, resolveBuildingCollision, spawnParticles } from './world.js';
import { makeCharacterMesh, animateRig } from './actors.js';
import { makeCar, removeCar } from './vehicles.js';
import { damagePlayer, addWanted } from './combat.js';

const UNIT_CALLSIGNS = ['CORAL-48', 'CORAL-85', 'CORAL-43', 'KITE-1', 'MARLIN-3', 'REEF-12', 'TIDE-7', 'SURF-21', 'GULL-9', 'ANCHOR-2'];
const CHATTER = [
  'shots fired in {d}', 'suspect heading {dir} on the grid', 'units, converge on {d}',
  'suspect in a {car}', 'all units: suspect is armed', 'air unit, keep visual on the suspect',
  'suspect last seen near {d}', 'roadblock forming at the {d} junction',
];
let chatterTimer = 0;

function callsign() {
  const used = new Set();
  for (const c of G.cars) if (c.callsign) used.add(c.callsign);
  for (const c of G.cops) if (c.callsign) used.add(c.callsign);
  const free = UNIT_CALLSIGNS.filter((c) => !used.has(c));
  const pool = free.length > 0 ? free : UNIT_CALLSIGNS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function unitRole(car) {
  const p = G.player;
  if (!p) return 'PURSUIT';
  const d = dist(car.x, car.y, p.x, p.y);
  if (d < 240) {
    const diff = Math.abs(angDiff(car.angle, angleTo(car.x, car.y, p.x, p.y)));
    return diff < 0.6 ? 'RAMMING' : 'FLANKING';
  }
  return 'PURSUIT';
}

export function policeUnits() {
  const p = G.player;
  const units = G.cars.filter((c) => c.kind === 'police').map((c) => ({
    name: c.callsign || 'PD', role: unitRole(c),
    dist: p ? Math.round(dist(c.x, c.y, p.x, p.y)) : 0,
  }));
  for (const cop of G.cops) {
    units.push({ name: cop.callsign || 'FOOT', role: 'FOOT', dist: p ? Math.round(dist(cop.x, cop.y, p.x, p.y)) : 0 });
  }
  return units;
}

export function policeCount() { return G.cars.filter((c) => c.kind === 'police').length; }
export function policeChatter() { return G._chatter || ''; }

function refreshChatter() {
  const p = G.player;
  if (!p) return;
  const d = districtAt(p.x, p.y);
  const dirs = ['north', 'south', 'east', 'west'];
  const line = CHATTER[Math.floor(Math.random() * CHATTER.length)]
    .replace('{d}', d)
    .replace('{dir}', dirs[Math.floor(Math.random() * dirs.length)])
    .replace('{car}', p.car ? (p.car.name || 'stolen car') : 'on foot');
  const unit = G.cars.find((c) => c.kind === 'police') || G.cops[0];
  G._chatter = (unit && unit.callsign ? unit.callsign + ': ' : 'KPD: ') + line;
}

function spawnPoliceCar() {
  const p = G.player;
  const a = Math.random() * Math.PI * 2;
  const sx = clamp(p.x + Math.cos(a) * 560, 120, CFG.WORLD_W - 120);
  const sy = clamp(p.y + Math.sin(a) * 560, 120, CFG.WORLD_H - 200);
  const np = nearestRoadPoint(sx, sy);
  const car = makeCar(np.x, np.y, angleTo(np.x, np.y, p.x, p.y), 'police', null, { driver: 'police', hp: 120 });
  car.callsign = callsign();
  car.speed = 200;
  car.giveUp = 0;
  car.axis = null;
  car.roadIdx = null;
  car.dir = 1;
  return car;
}

function spawnFootCop() {
  const p = G.player;
  const skins = [0xe8b98a, 0xc98d5e, 0x8a5a33, 0xf0c8a0];
  const rig = makeCharacterMesh(0x1f3a93, 0x1a1a1a, skins[Math.floor(Math.random() * skins.length)]);
  const a = Math.random() * Math.PI * 2;
  const x = clamp(p.x + Math.cos(a) * 420, 60, CFG.WORLD_W - 60);
  const y = clamp(p.y + Math.sin(a) * 420, 60, CFG.WORLD_H - 200);
  rig.group.position.set(wx(x), 0, wz(y));
  G.scene.add(rig.group);
  const cop = {
    x, y, angle: 0, hp: 60, speed: CFG.COP_SPEED, hold: 0,
    rig, mesh: rig, phase: { v: Math.random() * 6 }, callsign: callsign(),
  };
  G.cops.push(cop);
  return cop;
}

function nearestRoadIdx(list, val) {
  let best = 0, bd = 1e9;
  for (let i = 0; i < list.length; i++) {
    const d = Math.abs(list[i] - val);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function nextRoadInDir(list, val, dir) {
  if (dir > 0) { for (const v of list) if (v > val + 1) return v; }
  else { for (let i = list.length - 1; i >= 0; i--) if (list[i] < val - 1) return list[i]; }
  return null;
}
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
  if (best) { c.axis = best.axis; c.dir = best.dir; c.roadIdx = best.roadIdx; }
}

function updatePoliceCar(c, dt, quiet) {
  const p = G.player;
  if (!p) return;
  const d = dist(c.x, c.y, p.x, p.y);
  if (quiet || d > 1100) {
    c.giveUp += dt;
    if (c.giveUp > (quiet ? 3 : 4)) { removeCar(c); return; }
    if (quiet) {
      c.speed = lerp(c.speed, 120, clamp(2 * dt, 0, 1));
      c.x += Math.cos(c.angle) * c.speed * dt;
      c.y += Math.sin(c.angle) * c.speed * dt;
      c.mesh.position.set(wx(c.x), 0, wz(c.y));
      return;
    }
  } else c.giveUp = 0;
  if (d < 240) {
    const target = angleTo(c.x, c.y, p.x, p.y);
    c.angle += clamp(angDiff(c.angle, target), -3.4 * dt, 3.4 * dt);
    const want = d > 90 ? CFG.POLICE_CAR_SPEED : CFG.POLICE_CAR_SPEED * 0.55;
    c.speed = lerp(c.speed, want, clamp(2 * dt, 0, 1));
    const nx = c.x + Math.cos(c.angle) * c.speed * dt;
    const ny = c.y + Math.sin(c.angle) * c.speed * dt;
    if (buildingHit(nx, ny, 22)) { c.speed *= 0.4; c.angle += 0.6 * dt; }
    else { c.x = nx; c.y = ny; }
  } else {
    const w = G.world;
    if (!c.axis || c.roadIdx === null || c.roadIdx === undefined) initPoliceAxis(c, p);
    if (c.axis === 'v' && Math.abs(c.x - w.roadsV[c.roadIdx]) > 90) initPoliceAxis(c, p);
    if (c.axis === 'h' && Math.abs(c.y - w.roadsH[c.roadIdx]) > 90) initPoliceAxis(c, p);
    c.speed = lerp(c.speed, CFG.POLICE_CAR_SPEED, clamp(2 * dt, 0, 1));
    if (c.axis === 'v') {
      const rx = w.roadsV[c.roadIdx];
      c.x = lerp(c.x, rx + (c.dir > 0 ? -22 : 22), clamp(8 * dt, 0, 1));
      c.angle = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      const nextRy = nextRoadInDir(w.roadsH, c.y, c.dir);
      c.y += c.dir * c.speed * dt;
      if (nextRy !== null && ((c.dir > 0 && c.y >= nextRy) || (c.dir < 0 && c.y <= nextRy))) {
        c.y = nextRy;
        decidePoliceTurn(c, p, rx, nextRy);
      }
    } else {
      const ry = w.roadsH[c.roadIdx];
      c.y = lerp(c.y, ry + (c.dir > 0 ? 22 : -22), clamp(8 * dt, 0, 1));
      c.angle = c.dir > 0 ? 0 : Math.PI;
      const nextRx = nextRoadInDir(w.roadsV, c.x, c.dir);
      c.x += c.dir * c.speed * dt;
      if (nextRx !== null && ((c.dir > 0 && c.x >= nextRx) || (c.dir < 0 && c.x <= nextRx))) {
        c.x = nextRx;
        decidePoliceTurn(c, p, nextRx, ry);
      }
    }
  }
  c.x = clamp(c.x, 40, CFG.WORLD_W - 40);
  c.y = clamp(c.y, 40, 2540);
  c.mesh.position.set(wx(c.x), 0, wz(c.y));
  c.mesh.rotation.y = -c.angle;
  if (!p.car && d < 46) {
    damagePlayer(12);
    c.speed *= 0.4;
  }
}

function makeHeliMesh() {
  const grp = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 2.2, 2.6), mat(0x1a2530));
  body.position.y = 0;
  grp.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 1), mat(0x1a2530));
  tail.position.set(-6, 0.4, 0);
  grp.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(13, 0.12, 0.5), mat(0x111111));
  rotor.position.y = 1.5;
  grp.add(rotor);
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(11, 52, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false })
  );
  cone.position.y = -26;
  grp.add(cone);
  return { grp, rotor };
}

function updateHeli(dt) {
  const p = G.player;
  if (!p) return;
  if (G.wanted >= 4 && !G.heli) {
    const { grp, rotor } = makeHeliMesh();
    grp.position.set(wx(p.x + 300), 55, wz(p.y - 300));
    G.scene.add(grp);
    G.heli = { x: p.x + 300, y: p.y - 300, angle: 0, leaving: false, leaveT: 0, mesh: grp, rotor };
    toast('AIR UNIT DEPLOYED — the helicopter has you in sight.', 4);
  }
  const h = G.heli;
  if (!h) return;
  if (G.wanted < 4 && !h.leaving) { h.leaving = true; h.leaveT = 2; }
  if (h.leaving) {
    h.leaveT -= dt;
    h.y -= 260 * dt;
    h.mesh.position.set(wx(h.x), 55, wz(h.y));
    h.rotor.rotation.y += dt * 20;
    if (h.leaveT <= 0) { G.scene.remove(h.mesh); G.heli = null; }
    return;
  }
  h.angle += dt * 0.55;
  const tx = p.x + Math.cos(h.angle) * 210;
  const ty = p.y + Math.sin(h.angle) * 210;
  h.x = lerp(h.x, tx, clamp(2 * dt, 0, 1));
  h.y = lerp(h.y, ty, clamp(2 * dt, 0, 1));
  h.mesh.position.set(wx(h.x), 55, wz(h.y));
  h.mesh.rotation.y = -h.angle;
  h.rotor.rotation.y += dt * 20;
}

export function clearPolice() {
  for (let i = G.cars.length - 1; i >= 0; i--) {
    if (G.cars[i].kind === 'police') removeCar(G.cars[i]);
  }
  for (const cop of G.cops) G.scene.remove(cop.rig.group);
  G.cops = [];
  if (G.heli) { G.scene.remove(G.heli.mesh); G.heli = null; }
  G._chatter = '';
}

export function updatePolice(dt) {
  const p = G.player;
  if (!p) return;
  const quiet = G.time - G.lastCrime > CFG.QUIET_SPELL;
  G.crimeFlag = !quiet;
  G.policeSpawnTimer -= dt;
  if (G.policeSpawnTimer <= 0) {
    G.policeSpawnTimer = 1.6;
    if (!quiet && G.wanted > 0) {
      if (policeCount() < G.wanted) spawnPoliceCar();
      const wantCops = Math.min(G.wanted, 3);
      if (G.cops.length < wantCops && !p.car) spawnFootCop();
    }
  }
  if (G.wanted > 0) {
    chatterTimer -= dt;
    if (chatterTimer <= 0) { chatterTimer = 7; refreshChatter(); }
  }
  updateHeli(dt);
  const district = districtAt(p.x, p.y);
  const rep = G.rep[district] ?? 50;
  const friendly = rep >= 70;
  const arrestHold = friendly ? 2.2 : CFG.ARREST_HOLD;
  const decayEvery = friendly ? 2 : CFG.DECAY_EVERY;
  for (let i = G.cops.length - 1; i >= 0; i--) {
    const cop = G.cops[i];
    if (cop.hp <= 0) {
      G.scene.remove(cop.rig.group);
      G.cops.splice(i, 1);
      G.stats.copsDown++;
      addWanted(1);
      spawnParticles(cop.x, cop.y, 14, ['#e74c3c', '#ffffff'], 160, 0.6, 4);
      continue;
    }
    const d = dist(cop.x, cop.y, p.x, p.y);
    if (p.car) {
      cop.hold = 0;
      if (d > 900) { G.scene.remove(cop.rig.group); G.cops.splice(i, 1); }
      continue;
    }
    cop.angle = angleTo(cop.x, cop.y, p.x, p.y);
    let moving = 0;
    if (d > 52) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
      cop.hold = 0;
      moving = cop.speed;
    } else {
      cop.hold += dt;
      if (cop.hold >= arrestHold) {
        G.state = 'busted';
        return;
      }
    }
    resolveBuildingCollision(cop, 12);
    animateRig(cop.rig, moving, dt, cop.phase);
    cop.rig.group.position.set(wx(cop.x), 0, wz(cop.y));
    cop.rig.group.rotation.y = -cop.angle;
  }
  for (const c of [...G.cars]) {
    if (c.kind === 'police') updatePoliceCar(c, dt, quiet);
  }
  const heliWatching = G.heli && !G.heli.leaving;
  let nearestPolice = 1e9;
  for (const c of G.cars) if (c.kind === 'police') nearestPolice = Math.min(nearestPolice, dist(c.x, c.y, p.x, p.y));
  for (const cop of G.cops) nearestPolice = Math.min(nearestPolice, dist(cop.x, cop.y, p.x, p.y));
  if (G.wanted > 0 && quiet && nearestPolice > 700 && !heliWatching) {
    G.decayTimer += dt;
    if (G.decayTimer >= decayEvery) {
      G.decayTimer = 0;
      const was = G.wanted;
      G.wanted--;
      if (G.wanted === 0) {
        if (was >= 2) G.stats.copsEscaped++;
        if (friendly) {
          G.stats.hiddenByLocals++;
          toast("The locals hid you. Heat's off.");
        } else {
          toast('You lost the cops. Lay low.');
        }
      }
    }
  } else {
    G.decayTimer = 0;
  }
  if (G.wanted === 0) {
    if (G.cops.length > 0 && Math.random() < dt) {
      const cop = G.cops.pop();
      G.scene.remove(cop.rig.group);
    }
    if (policeCount() > 0 && Math.random() < dt * 2) {
      const car = G.cars.find((c) => c.kind === 'police');
      if (car) removeCar(car);
    }
  }
}
