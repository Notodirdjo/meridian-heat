import * as THREE from '../vendor/three.module.min.js';
import { CFG, G, clamp, lerp, dist, angDiff, wx, wz } from './config.js';
import { buildingHit, resolveBuildingCollision, onRoad } from './world.js';

export const CAR_MODELS = [
  { name: 'Old Town Classic', color: 0x8a2f4d, top: 430 },
  { name: 'Sunset Runner', color: 0x2f6b8a, top: 470 },
  { name: 'Koral Sunburst', color: 0xd88a2f, top: 450 },
  { name: 'Terrace GT', color: 0x3a3a3a, top: 500 },
  { name: 'Night Owl', color: 0x4d2f8a, top: 460 },
  { name: 'Meridian Comet', color: 0xc0c0c0, top: 480 },
  { name: 'Rukan Pelo GT', color: 0xb02020, top: 520 },
  { name: 'Comet Sport', color: 0xd4af37, top: 540 },
];

export function makeCarMesh(color, police) {
  const grp = new THREE.Group();
  const mat = (c, e) => new THREE.MeshLambertMaterial({ color: c, ...(e ? { emissive: e } : {}) });
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.6, 1.1, 2.1), mat(color));
  body.position.y = 0.85; body.castShadow = true;
  grp.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.9, 1.9), mat(0x1a2530));
  cabin.position.set(-0.2, 1.8, 0);
  cabin.castShadow = true;
  grp.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
  const wheelMat = mat(0x111111);
  for (const [px, pz] of [[1.5, 1.0], [1.5, -1.0], [-1.5, 1.0], [-1.5, -1.0]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.x = Math.PI / 2;
    w.position.set(px, 0.42, pz);
    grp.add(w);
  }
  const lightGeo = new THREE.BoxGeometry(0.15, 0.3, 0.5);
  for (const pz of [0.7, -0.7]) {
    const h = new THREE.Mesh(lightGeo, mat(0xfff2b0, 0x555522));
    h.position.set(2.32, 0.9, pz);
    grp.add(h);
    const t = new THREE.Mesh(lightGeo, mat(0xcc2222, 0x330000));
    t.position.set(-2.32, 0.9, pz);
    grp.add(t);
  }
  if (police) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 1.4), mat(0x222222));
    bar.position.set(-0.2, 2.4, 0);
    grp.add(bar);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.6), mat(0xff2222, 0x881111));
    r.position.set(-0.2, 2.4, 0.4);
    grp.add(r);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.6), mat(0x2244ff, 0x111188));
    b.position.set(-0.2, 2.4, -0.4);
    grp.add(b);
  }
  return grp;
}

export function makeCar(x, y, angle, kind, color, opts = {}) {
  const model = opts.model || CAR_MODELS[Math.floor(Math.random() * CAR_MODELS.length)];
  const police = kind === 'police';
  const mesh = makeCarMesh(police ? 0x14181f : (color ?? model.color), police);
  mesh.position.set(wx(x), 0, wz(y));
  mesh.rotation.y = -angle;
  G.scene.add(mesh);
  const car = {
    x, y, angle, speed: 0, kind,
    name: opts.name || model.name,
    topSpeed: opts.topSpeed || model.top,
    hp: opts.hp || 100, maxHp: opts.hp || 100,
    mesh, driver: opts.driver === undefined ? null : opts.driver,
    w: opts.w || 34, hitCd: 0, _landedJump: false,
    roadAxis: opts.roadAxis || null, roadPos: opts.roadPos || 0,
  };
  G.cars.push(car);
  return car;
}

export function spawnTraffic(n) {
  const w = G.world;
  for (let i = 0; i < n; i++) {
    const vertical = Math.random() > 0.5;
    if (vertical) {
      const rx = w.roadsV[Math.floor(Math.random() * w.roadsV.length)];
      const y = 200 + Math.random() * 2200;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const car = makeCar(rx + (dir > 0 ? 24 : -24), y, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 'traffic');
      car.roadAxis = 'v'; car.roadPos = rx;
      car.speed = CFG.TRAFFIC_SPEED_MIN + Math.random() * (CFG.TRAFFIC_SPEED_MAX - CFG.TRAFFIC_SPEED_MIN);
      car.cruise = car.speed;
    } else {
      const ry = w.roadsH[Math.floor(Math.random() * w.roadsH.length)];
      const x = 200 + Math.random() * 3200;
      const dir = Math.random() > 0.5 ? 1 : -1;
      const car = makeCar(x, ry + (dir > 0 ? 24 : -24), dir > 0 ? 0 : Math.PI, 'traffic');
      car.roadAxis = 'h'; car.roadPos = ry;
      car.speed = CFG.TRAFFIC_SPEED_MIN + Math.random() * (CFG.TRAFFIC_SPEED_MAX - CFG.TRAFFIC_SPEED_MIN);
      car.cruise = car.speed;
    }
  }
}

export function spawnParked(n) {
  const w = G.world;
  let placed = 0, tries = 0;
  while (placed < n && tries < n * 20) {
    tries++;
    const vertical = Math.random() > 0.5;
    let x, y, a;
    if (vertical) {
      const rx = w.roadsV[Math.floor(Math.random() * w.roadsV.length)];
      x = rx + (Math.random() > 0.5 ? 78 : -78);
      y = 200 + Math.random() * 2200;
      a = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      const ry = w.roadsH[Math.floor(Math.random() * w.roadsH.length)];
      x = 200 + Math.random() * 3200;
      y = ry + (Math.random() > 0.5 ? 78 : -78);
      a = Math.random() > 0.5 ? 0 : Math.PI;
    }
    if (buildingHit(x, y, 30) || y > 2500) continue;
    makeCar(x, y, a, 'parked');
    placed++;
  }
}

export function nearestCar(x, y, maxD) {
  let best = null, bd = maxD;
  for (const c of G.cars) {
    if (c.kind === 'traffic') continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function enterCar(car) {
  const p = G.player;
  if (!p || p.car || !car) return false;
  const wasKind = car.kind;
  p.car = car;
  car.kind = 'player';
  car.driver = 'player';
  p.rig.group.visible = false;
  if (wasKind === 'parked' || wasKind === 'police') G.stats.carsStolen++;
  return true;
}

export function exitCar() {
  const p = G.player;
  if (!p || !p.car) return false;
  const car = p.car;
  p.car = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 40;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 40;
  p.x = clamp(p.x, 40, CFG.WORLD_W - 40);
  p.y = clamp(p.y, 40, 2540);
  resolveBuildingCollision(p, CFG.PLAYER_RADIUS);
  p.angle = car.angle;
  p.rig.group.visible = true;
  p.rig.group.position.set(wx(p.x), 0, wz(p.y));
  return true;
}

function syncCarMesh(car) {
  car.mesh.position.set(wx(car.x), car.mesh.position.y, wz(car.y));
  car.mesh.rotation.y = -car.angle;
}

export function updatePlayerCar(dt) {
  const p = G.player;
  if (!p || !p.car) return;
  const car = p.car;
  const k = G.keys;
  const fwd = k.has('KeyW') || k.has('ArrowUp');
  const back = k.has('KeyS') || k.has('ArrowDown');
  const left = k.has('KeyA') || k.has('ArrowLeft');
  const right = k.has('KeyD') || k.has('ArrowRight');
  const brake = k.has('Space');
  if (fwd) car.speed += CFG.CAR_ACCEL * dt;
  else if (back) car.speed -= CFG.CAR_BRAKE * 0.7 * dt;
  else car.speed = lerp(car.speed, 0, Math.min(1, dt * 0.7));
  if (brake) car.speed = lerp(car.speed, 0, Math.min(1, dt * 4));
  car.speed = clamp(car.speed, -140, car.topSpeed);
  const steer = (left ? 1 : 0) - (right ? 1 : 0);
  const spdF = clamp(Math.abs(car.speed) / 200, 0, 1);
  car.angle += steer * CFG.CAR_TURN * spdF * dt * (car.speed < 0 ? -1 : 1) * (brake ? 1.6 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.hitCd = Math.max(0, car.hitCd - dt);
  if (buildingHit(nx, ny, 22)) {
    if (Math.abs(car.speed) > 120 && car.hitCd <= 0) {
      car.hp = Math.max(0, car.hp - 12);
      car.hitCd = CFG.CAR_HIT_COOLDOWN;
      G.shake = Math.min(26, G.shake + 8);
    }
    car.speed *= 0.35;
  } else {
    car.x = clamp(nx, 40, CFG.WORLD_W - 40);
    car.y = clamp(ny, 40, 2540);
  }
  G.stats.distanceDriven += Math.abs(car.speed) * dt / 4;
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  syncCarMesh(car);
}

export function updateTrafficCar(car, dt) {
  if (car.roadAxis === 'v') {
    car.x = car.roadPos + (car.angle > 0 ? 24 : -24);
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (car.y < 120) { car.y = 120; car.angle = Math.PI / 2; }
    if (car.y > 2480) { car.y = 2480; car.angle = -Math.PI / 2; }
  } else {
    car.y = car.roadPos + (Math.abs(car.angle) < Math.PI / 2 ? 24 : -24);
    car.x += Math.cos(car.angle) * car.speed * dt;
    if (car.x < 120) { car.x = 120; car.angle = 0; }
    if (car.x > 3480) { car.x = 3480; car.angle = Math.PI; }
  }
  car.speed = lerp(car.speed, car.cruise || 140, Math.min(1, dt));
  syncCarMesh(car);
}

export function updateCars(dt) {
  updatePlayerCar(dt);
  for (const car of G.cars) {
    if (car.kind === 'traffic') updateTrafficCar(car, dt);
  }
}

export function removeCar(car) {
  const i = G.cars.indexOf(car);
  if (i >= 0) G.cars.splice(i, 1);
  if (car.mesh) G.scene.remove(car.mesh);
}
