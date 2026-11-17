// MERIDIAN HEAT — combat.js: pistol fire, punching, bullets, enemy
// gunmen with health bars, explosions and health pickups.

import { CFG, G, clamp, dist, angleTo, addShake } from './config.js';
import { spawnParticles, addWanted, damagePlayer, knockPed } from './entities.js';
import { buildingHit, hasLineOfSight, resolveBuildingCollision } from './world.js';
import { sfx } from './audio.js';

export function muzzleWorldPos() {
  const p = G.player;
  return { x: p.x + Math.cos(G.aimAngle) * 26, y: p.y + Math.sin(G.aimAngle) * 26 };
}

export function firePistol() {
  const p = G.player;
  if (!p || p.car || G.reloading > 0 || G.state !== 'playing') return;
  if (G.ammo <= 0) {
    startReload();
    return;
  }
  G.ammo--;
  G.stats.shotsFired++;
  const m = muzzleWorldPos();
  const spread = (Math.random() - 0.5) * 0.06;
  const a = G.aimAngle + spread;
  G.bullets.push({
    x: m.x, y: m.y, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900,
    life: 0.8, dmg: CFG.PISTOL_DAMAGE, from: 'player',
  });
  spawnParticles(m.x, m.y, 4, ['#f1c40f', '#ffffff'], 140, 0.14, 3);
  addShake(1.2);
  sfx.shoot();
  G.shotRecently = true;
  G.shotRecentTimer = 0.5;
  if (G.ammo === 0) startReload();
  if (G.wanted === 0) addWanted(1); // firing a gun in public draws the law
}

export function startReload() {
  if (G.reloading > 0 || G.reserveAmmo <= 0 || G.ammo === CFG.PISTOL_MAG) return;
  G.reloading = 1.0;
  sfx.reload();
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
  // Hit gunmen, cops and peds in range.
  for (const g of G.gunmen) {
    if (dist(px, py, g.x, g.y) < 46) hurtGunman(g, CFG.PUNCH_DAMAGE, G.aimAngle);
  }
  for (const cop of G.cops) {
    if (dist(px, py, cop.x, cop.y) < 46) {
      cop.hp -= CFG.PUNCH_DAMAGE;
      cop.x += Math.cos(G.aimAngle) * 18; cop.y += Math.sin(G.aimAngle) * 18;
    }
  }
  for (const ped of G.peds) {
    if (!ped.down && dist(px, py, ped.x, ped.y) < 46) {
      knockPed(ped, p.x, p.y);
      addWanted(1);
    }
  }
}

export function hurtGunman(g, dmg, fromAngle) {
  g.hp -= dmg;
  g.flash = 0.12;
  g.x += Math.cos(fromAngle) * 6; g.y += Math.sin(fromAngle) * 6;
  spawnParticles(g.x, g.y, 5, ['#e74c3c'], 120, 0.35, 3);
  if (g.hp <= 0 && !g.dead) {
    g.dead = true;
    spawnParticles(g.x, g.y, 18, ['#e74c3c', '#ffffff'], 200, 0.7, 4);
    if (Math.random() < 0.4) spawnHealthPickup(g.x, g.y);
  }
}

export function spawnGunman(x, y, opts = {}) {
  const g = {
    x, y, angle: 0, hp: opts.hp || 80, maxHp: opts.hp || 80,
    shootCd: 0.8 + Math.random(), moveCd: 0, flash: 0, dead: false,
    speed: 150, wave: opts.wave || 0,
  };
  G.gunmen.push(g);
  return g;
}

export function spawnHealthPickup(x, y) {
  G.pickups.push({ x, y, kind: 'health', t: 0 });
}

export function updateBullets(dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0 || buildingHit(b.x, b.y, 2);
    if (!dead) {
      if (b.from === 'player') {
        for (const g of G.gunmen) {
          if (!g.dead && dist(b.x, b.y, g.x, g.y) < 18) {
            hurtGunman(g, b.dmg, Math.atan2(b.vy, b.vx));
            dead = true; break;
          }
        }
        if (!dead) for (const cop of G.cops) {
          if (dist(b.x, b.y, cop.x, cop.y) < 16) {
            cop.hp -= b.dmg; dead = true;
            spawnParticles(b.x, b.y, 6, ['#e74c3c'], 120, 0.3, 3);
            break;
          }
        }
        if (!dead) for (const ped of G.peds) {
          if (!ped.down && dist(b.x, b.y, ped.x, ped.y) < 14) {
            knockPed(ped, G.player.x, G.player.y);
            addWanted(1);
            dead = true; break;
          }
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
        if (p && !p.car && dist(b.x, b.y, p.x, p.y) < 16) {
          damagePlayer(b.dmg * 0.5);
          dead = true;
        } else if (p && p.car && dist(b.x, b.y, p.x, p.y) < 26) {
          p.car.hp -= b.dmg * 0.4;
          dead = true;
        }
      }
    }
    if (dead) {
      if (b.life > 0) spawnParticles(b.x, b.y, 3, ['#f1c40f'], 90, 0.2, 2);
      G.bullets.splice(i, 1);
    }
  }
  // Gunmen AI: strafe toward the player and shoot back.
  const p = G.player;
  for (let i = G.gunmen.length - 1; i >= 0; i--) {
    const g = G.gunmen[i];
    if (g.dead) { G.gunmen.splice(i, 1); continue; }
    g.flash = Math.max(0, g.flash - dt);
    if (!p) continue;
    const d = dist(g.x, g.y, p.x, p.y);
    g.angle = angleTo(g.x, g.y, p.x, p.y);
    g.moveCd -= dt;
    g.avoidT = Math.max(0, (g.avoidT || 0) - dt);
    if (g.avoidT > 0) {
      // Slide around the building that just blocked us.
      const sa = g.angle + (g.avoidDir || 1) * Math.PI / 2;
      g.x += Math.cos(sa) * g.speed * dt;
      g.y += Math.sin(sa) * g.speed * dt;
    } else if (d > 260) {
      g.x += Math.cos(g.angle) * g.speed * dt;
      g.y += Math.sin(g.angle) * g.speed * dt;
    } else if (d < 140) {
      g.x -= Math.cos(g.angle) * g.speed * 0.6 * dt;
      g.y -= Math.sin(g.angle) * g.speed * 0.6 * dt;
    } else if (g.moveCd <= 0) {
      g.moveCd = 0.7 + Math.random() * 0.8;
      g.strafe = Math.random() > 0.5 ? 1 : -1;
    }
    if (g.strafe && g.avoidT <= 0 && d <= 260 && d >= 140) {
      g.x += Math.cos(g.angle + Math.PI / 2) * g.strafe * g.speed * 0.5 * dt;
      g.y += Math.sin(g.angle + Math.PI / 2) * g.strafe * g.speed * 0.5 * dt;
    }
    if (resolveBuildingCollision(g, 14)) {
      g.avoidT = 0.8;
      g.avoidDir = Math.random() > 0.5 ? 1 : -1;
    }
    g.shootCd -= dt;
    if (g.shootCd <= 0 && d < 520 && !p.car && hasLineOfSight(g.x, g.y, p.x, p.y)) {
      g.shootCd = 0.9 + Math.random() * 0.7;
      const a = g.angle + (Math.random() - 0.5) * 0.22;
      G.bullets.push({
        x: g.x + Math.cos(a) * 24, y: g.y + Math.sin(a) * 24,
        vx: Math.cos(a) * 620, vy: Math.sin(a) * 620,
        life: 1.0, dmg: 12, from: 'enemy',
      });
      spawnParticles(g.x + Math.cos(a) * 24, g.y + Math.sin(a) * 24, 3, ['#f1c40f'], 120, 0.12, 3);
      sfx.enemyShoot();
    } else if (g.shootCd <= 0 && d < 520 && p.car) {
      g.shootCd = 1.4 + Math.random();
    }
  }
  // Health pickups.
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    pk.t += dt;
    if (p && dist(pk.x, pk.y, p.x, p.y) < 30) {
      G.health = clamp(G.health + 40, 0, G.maxHealth);
      p.hp = G.health;
      sfx.health();
      spawnParticles(pk.x, pk.y, 12, ['#2ecc71', '#ffffff'], 140, 0.5, 4);
      G.pickups.splice(i, 1);
    } else if (pk.t > 60) G.pickups.splice(i, 1);
  }
}
