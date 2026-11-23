import * as THREE from '../vendor/three.module.min.js';
import { CFG, G, clamp, dist, angleTo, angDiff, addShake, toast, wx, wz } from './config.js';
import { buildingHit, hasLineOfSight, resolveBuildingCollision, spawnParticles } from './world.js';
import { makeCharacterMesh, animateRig } from './actors.js';
import { exitCar, removeCar } from './vehicles.js';
import { sfx } from './radio.js';
import { awardRp } from './progression.js';

export const WEAPONS = {
  fists: { name: 'FISTS', slot: 1 },
  pistol: { name: 'PISTOL', slot: 2, mag: CFG.PISTOL_MAG, damage: CFG.PISTOL_DAMAGE, fireCd: 0.22, spread: 0.06, speed: 900 },
  smg: { name: 'SMG', slot: 3, mag: CFG.SMG_MAG, damage: CFG.SMG_DAMAGE, fireCd: CFG.SMG_FIRE_CD, spread: 0.11, speed: 950 },
};

let fireCd = 0;
const tracerGeo = new THREE.BoxGeometry(6, 0.14, 0.14);
const tracerMatP = new THREE.MeshBasicMaterial({ color: 0xffe27a });
const tracerMatE = new THREE.MeshBasicMaterial({ color: 0xff7a5a });

export function currentWeapon() { return WEAPONS[G.weapon] || WEAPONS.pistol; }
export function currentFireCd() { return currentWeapon().fireCd || 0.22; }

export function switchWeapon(slot) {
  if (slot === 1 && G.weapon !== 'fists') { G.weapon = 'fists'; toast('Fists — get close and personal.', 2); }
  else if (slot === 2 && G.weapon !== 'pistol') { G.weapon = 'pistol'; toast('Pistol equipped.', 2); }
  else if (slot === 3) {
    if (!G.smgUnlocked) { toast('SMG locked — reach FIXER rank (1,500 RP).', 3); return; }
    if (G.weapon !== 'smg') { G.weapon = 'smg'; toast('SMG equipped. Hold it down.', 2); }
  }
}

export function ammoFor(weapon) {
  if (weapon === 'smg') return { ammo: G.smgAmmo, reserve: G.smgReserve, mag: CFG.SMG_MAG };
  return { ammo: G.ammo, reserve: G.reserveAmmo, mag: CFG.PISTOL_MAG };
}

export function muzzleWorldPos() {
  const p = G.player;
  return { x: p.x + Math.cos(G.aimAngle) * 26, y: p.y + Math.sin(G.aimAngle) * 26 };
}

export function addWanted(n) {
  const before = G.wanted;
  G.wanted = clamp(G.wanted + n, 0, 5);
  if (G.wanted > before) G.lastCrime = G.time;
  if (G.wanted > G.stats.highestWanted) G.stats.highestWanted = G.wanted;
}

export function damagePlayer(amount) {
  const p = G.player;
  if (!p || p.invuln > 0 || G.state !== 'playing') return;
  let remaining = amount;
  if (G.armour > 0) {
    const absorbed = Math.min(G.armour, amount * 0.6);
    G.armour = Math.max(0, G.armour - absorbed);
    remaining = amount - absorbed;
  }
  G.health = Math.max(0, G.health - remaining);
  if (G.mission) G.missionDamage += remaining;
  p.invuln = 0.35;
  addShake(4);
  if (G.health <= 0) {
    G.state = 'wasted';
    sfx.explosion();
    spawnParticles(p.x, p.y, 26, ['#e74c3c', '#f39c12', '#ffffff'], 220, 0.9, 5);
  }
}

function knockPed(ped, fromX, fromY) {
  if (ped.dead) return;
  ped.dead = true;
  ped.rig.group.rotation.x = -Math.PI / 2;
  G.stats.pedsDown++;
  spawnParticles(ped.x, ped.y, 10, ['#e74c3c', '#ffffff'], 140, 0.5, 3);
  addWanted(1);
  toast('You took someone down! The police are coming.');
}

export function firePistol() {
  const p = G.player;
  if (!p || p.car || G.reloading > 0 || G.state !== 'playing') return;
  if (G.weapon === 'fists') { punch(); return; }
  if (fireCd > 0) return;
  const w = currentWeapon();
  const a = ammoFor(G.weapon);
  if (a.ammo <= 0) { startReload(); return; }
  fireCd = w.fireCd;
  if (G.weapon === 'smg') G.smgAmmo--;
  else G.ammo--;
  G.stats.shotsFired++;
  const m = muzzleWorldPos();
  const ang = G.aimAngle + (Math.random() - 0.5) * w.spread;
  const mesh = new THREE.Mesh(tracerGeo, tracerMatP);
  mesh.position.set(wx(m.x), 1.6, wz(m.y));
  mesh.rotation.y = -ang;
  G.scene.add(mesh);
  G.bullets.push({ x: m.x, y: m.y, vx: Math.cos(ang) * w.speed, vy: Math.sin(ang) * w.speed, life: 0.8, dmg: w.damage, from: 'player', mesh });
  spawnParticles(m.x, m.y, 4, ['#f1c40f', '#ffffff'], 140, 0.14, 3);
  addShake(G.weapon === 'smg' ? 0.7 : 1.2);
  sfx.shoot();
  const shot = { x: p.x, y: p.y, t: G.time };
  G.lastShot = shot;
  G.shot = shot;
  if (ammoFor(G.weapon).ammo === 0) startReload();
  if (G.wanted === 0) addWanted(1);
}

export function startReload() {
  const a = ammoFor(G.weapon);
  if (G.weapon === 'fists' || G.reloading > 0 || a.reserve <= 0 || a.ammo === a.mag) return;
  G.reloading = G.weapon === 'smg' ? 1.3 : 1.0;
}

function finishReload() {
  const a = ammoFor(G.weapon);
  const take = Math.min(a.mag - a.ammo, a.reserve);
  if (G.weapon === 'smg') { G.smgAmmo += take; G.smgReserve -= take; }
  else { G.ammo += take; G.reserveAmmo -= take; }
}

export function punch() {
  const p = G.player;
  if (!p || p.car || G.punchCooldown > 0 || G.state !== 'playing') return;
  G.punchCooldown = 0.45;
  G.punchTimer = 0.18;
  sfx.punch();
  const px = p.x + Math.cos(G.aimAngle) * 40;
  const py = p.y + Math.sin(G.aimAngle) * 40;
  spawnParticles(px, py, 5, ['#ffffff', '#f39c12'], 120, 0.25, 3);
  for (const g of G.gunmen) if (!g.dead && dist(px, py, g.x, g.y) < 46) hurtGunman(g, CFG.PUNCH_DAMAGE, G.aimAngle);
  for (const cop of G.cops) {
    if (dist(px, py, cop.x, cop.y) < 46) {
      cop.hp -= CFG.PUNCH_DAMAGE;
      cop.x += Math.cos(G.aimAngle) * 18;
      cop.y += Math.sin(G.aimAngle) * 18;
      addWanted(1);
    }
  }
  for (const ped of G.peds) if (!ped.dead && dist(px, py, ped.x, ped.y) < 46) knockPed(ped, p.x, p.y);
}

export function hurtGunman(g, dmg, fromAngle) {
  if (g.dead) return;
  g.hp -= dmg;
  g.flash = 0.12;
  g.x += Math.cos(fromAngle) * 6;
  g.y += Math.sin(fromAngle) * 6;
  spawnParticles(g.x, g.y, 5, ['#e74c3c'], 120, 0.35, 3);
  if (g.hp <= 0) {
    g.dead = true;
    g.deathT = 2.5;
    g.rig.group.rotation.x = -Math.PI / 2;
    G.stats.gunmenDown++;
    awardRp(15, 'Crew down');
    spawnParticles(g.x, g.y, 18, ['#e74c3c', '#ffffff'], 200, 0.7, 4);
  }
}

export function spawnGunman(x, y, opts = {}) {
  const skins = [0xe8b98a, 0xc98d5e, 0x8a5a33, 0xf0c8a0];
  const rig = makeCharacterMesh(0xc0392b, 0x1a1a1a, skins[Math.floor(Math.random() * skins.length)]);
  rig.group.position.set(wx(x), 0, wz(y));
  G.scene.add(rig.group);
  const g = {
    x, y, angle: 0, hp: opts.hp || 80, maxHp: opts.hp || 80,
    shootCd: 0.8 + Math.random(), moveCd: 0, flash: 0, dead: false, deathT: 0,
    speed: 150, wave: opts.wave || 0, rig, phase: { v: Math.random() * 6 },
    avoidT: 0, avoidDir: 1,
  };
  G.gunmen.push(g);
  return g;
}

export function clearGunmen() {
  for (const g of G.gunmen) G.scene.remove(g.rig.group);
  G.gunmen = [];
}

export function clearBullets() {
  for (const b of G.bullets) if (b.mesh) G.scene.remove(b.mesh);
  G.bullets = [];
}

function enemyShoot(g, p) {
  const ang = angleTo(g.x, g.y, p.x, p.y) + (Math.random() - 0.5) * 0.14;
  const mesh = new THREE.Mesh(tracerGeo, tracerMatE);
  mesh.position.set(wx(g.x), 1.6, wz(g.y));
  mesh.rotation.y = -ang;
  G.scene.add(mesh);
  G.bullets.push({ x: g.x, y: g.y, vx: Math.cos(ang) * 700, vy: Math.sin(ang) * 700, life: 1.1, dmg: 10, from: 'enemy', mesh });
}

function updateGunmen(dt) {
  const p = G.player;
  for (let i = G.gunmen.length - 1; i >= 0; i--) {
    const g = G.gunmen[i];
    if (g.dead) {
      g.deathT -= dt;
      if (g.deathT <= 0) { G.scene.remove(g.rig.group); G.gunmen.splice(i, 1); }
      continue;
    }
    g.flash = Math.max(0, g.flash - dt);
    if (!p) continue;
    const d = dist(g.x, g.y, p.x, p.y);
    g.angle = angleTo(g.x, g.y, p.x, p.y);
    g.moveCd -= dt;
    g.avoidT = Math.max(0, g.avoidT - dt);
    let moving = 0;
    if (g.avoidT > 0) {
      const sa = g.angle + g.avoidDir * Math.PI / 2;
      g.x += Math.cos(sa) * g.speed * dt;
      g.y += Math.sin(sa) * g.speed * dt;
      moving = g.speed;
    } else if (d > 260) {
      g.x += Math.cos(g.angle) * g.speed * dt;
      g.y += Math.sin(g.angle) * g.speed * dt;
      moving = g.speed;
    } else if (d < 140) {
      g.x -= Math.cos(g.angle) * g.speed * 0.6 * dt;
      g.y -= Math.sin(g.angle) * g.speed * 0.6 * dt;
      moving = g.speed * 0.6;
    } else if (g.moveCd <= 0) {
      g.moveCd = 0.7 + Math.random() * 0.8;
      g.avoidT = 0.5;
      g.avoidDir = Math.random() > 0.5 ? 1 : -1;
    }
    if (resolveBuildingCollision(g, 14)) { g.avoidT = 0.6; g.avoidDir = Math.random() > 0.5 ? 1 : -1; }
    g.x = clamp(g.x, 40, CFG.WORLD_W - 40);
    g.y = clamp(g.y, 40, 2540);
    animateRig(g.rig, moving, dt, g.phase);
    g.rig.group.position.set(wx(g.x), 0, wz(g.y));
    g.rig.group.rotation.y = -g.angle;
    g.shootCd -= dt;
    if (g.shootCd <= 0 && d < 700 && hasLineOfSight(g.x, g.y, p.x, p.y)) {
      g.shootCd = 0.9 + Math.random() * 0.8;
      enemyShoot(g, p);
    }
  }
}

function updateBullets(dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0 || buildingHit(b.x, b.y, 2);
    if (!dead) {
      if (b.from === 'player') {
        for (const g of G.gunmen) {
          if (!g.dead && dist(b.x, b.y, g.x, g.y) < 18) { hurtGunman(g, b.dmg, Math.atan2(b.vy, b.vx)); dead = true; break; }
        }
        if (!dead) for (const cop of G.cops) {
          if (dist(b.x, b.y, cop.x, cop.y) < 16) {
            cop.hp -= b.dmg; dead = true;
            addWanted(1);
            spawnParticles(b.x, b.y, 6, ['#e74c3c'], 120, 0.3, 3);
            break;
          }
        }
        if (!dead) for (const ped of G.peds) {
          if (!ped.dead && dist(b.x, b.y, ped.x, ped.y) < 14) { knockPed(ped, G.player.x, G.player.y); dead = true; break; }
        }
        if (!dead) for (const c of G.cars) {
          if (c.driver !== 'player' && dist(b.x, b.y, c.x, c.y) < 26) {
            c.hp -= b.dmg; dead = true;
            spawnParticles(b.x, b.y, 6, ['#f39c12', '#bdc3c7'], 120, 0.3, 3);
            if (c.kind === 'police') addWanted(1);
            break;
          }
        }
      } else {
        const p = G.player;
        if (p && !p.car && dist(b.x, b.y, p.x, p.y) < 16) { damagePlayer(b.dmg * 0.5); dead = true; }
        else if (p && p.car && dist(b.x, b.y, p.x, p.y) < 26) { p.car.hp -= b.dmg * 0.4; dead = true; }
      }
    }
    if (dead) {
      if (b.life > 0) spawnParticles(b.x, b.y, 3, ['#f1c40f'], 90, 0.2, 2);
      if (b.mesh) G.scene.remove(b.mesh);
      G.bullets.splice(i, 1);
    } else if (b.mesh) {
      b.mesh.position.set(wx(b.x), 1.6, wz(b.y));
    }
  }
}

function updateWrecks() {
  const p = G.player;
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const c = G.cars[i];
    if (c.hp > 0) continue;
    spawnParticles(c.x, c.y, 30, ['#e74c3c', '#f39c12', '#2c3e50'], 260, 1.0, 6);
    sfx.explosion();
    if (p && dist(c.x, c.y, p.x, p.y) < 400) addShake(10);
    if (p && p.car === c) {
      exitCar();
      damagePlayer(25);
    }
    removeCar(c);
  }
}

function updateRunOver() {
  const p = G.player;
  if (!p || !p.car || Math.abs(p.car.speed) <= 120) return;
  for (const ped of G.peds) {
    if (!ped.dead && dist(p.x, p.y, ped.x, ped.y) < 34) knockPed(ped, p.x, p.y);
  }
}

export function updateCombat(dt) {
  fireCd = Math.max(0, fireCd - dt);
  G.punchCooldown = Math.max(0, G.punchCooldown - dt);
  G.punchTimer = Math.max(0, G.punchTimer - dt);
  if (G.reloading > 0) {
    G.reloading -= dt;
    if (G.reloading <= 0) { G.reloading = 0; finishReload(); }
  }
  const p = G.player;
  if (p && p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
  updateBullets(dt);
  updateGunmen(dt);
  updateWrecks();
  updateRunOver();
}
