import * as THREE from '../vendor/three.module.min.js';
import { CFG, G, clamp, lerp, dist, angleTo, angDiff, wx, wz } from './config.js';
import { resolveBuildingCollision, buildingHit } from './world.js';

const SHIRTS = [0x2ecc71, 0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1];
const PANTS = [0x2c3e50, 0x1a1a1a, 0x5a4a3a, 0x34495e];
const SKINS = [0xe8b98a, 0xc98d5e, 0x8a5a33, 0xf0c8a0];

export function makeCharacterMesh(shirt, pants, skin) {
  const grp = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.1, 0.5), mat(shirt));
  torso.position.y = 1.35; torso.castShadow = true;
  grp.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), mat(skin));
  head.position.y = 2.2; head.castShadow = true;
  grp.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.2, 0.58), mat(0x1a1210));
  hair.position.y = 2.5;
  grp.add(hair);
  const mkLimb = (w, h, c, px, py) => {
    const pivot = new THREE.Group();
    pivot.position.set(px, py, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat(c));
    m.position.y = -h / 2;
    m.castShadow = true;
    pivot.add(m);
    grp.add(pivot);
    return pivot;
  };
  const armL = mkLimb(0.28, 1.0, shirt, -0.62, 1.85);
  const armR = mkLimb(0.28, 1.0, shirt, 0.62, 1.85);
  const legL = mkLimb(0.32, 1.0, pants, -0.24, 0.85);
  const legR = mkLimb(0.32, 1.0, pants, 0.24, 0.85);
  return { group: grp, armL, armR, legL, legR, head };
}

export function animateRig(rig, speed, dt, ph) {
  ph.v += dt * (4 + speed * 0.06);
  const s = Math.min(1, speed / 120) * 0.75;
  const sw = Math.sin(ph.v) * s;
  rig.armL.rotation.x = sw; rig.armR.rotation.x = -sw;
  rig.legL.rotation.x = -sw; rig.legR.rotation.x = sw;
  rig.group.position.y = Math.abs(Math.cos(ph.v)) * 0.08 * Math.min(1, speed / 120);
}

export function spawnPlayer(x, y) {
  const rig = makeCharacterMesh(0x2ecc71, 0x1a1a1a, 0xe8b98a);
  rig.group.position.set(wx(x), 0, wz(y));
  G.scene.add(rig.group);
  G.player = {
    x, y, angle: -Math.PI / 2, speed: 0, car: null,
    rig, phase: { v: 0 }, moving: false, airborne: 0,
  };
  G.cam.yaw = G.player.angle;
  return G.player;
}

function syncRig(e) {
  e.rig.group.position.set(wx(e.x), e.airborne || 0, wz(e.y));
  e.rig.group.rotation.y = -e.angle;
}

export function updatePlayer(dt) {
  const p = G.player;
  if (!p || p.car) return;
  const k = G.keys;
  let mx = 0, mz = 0;
  const yaw = G.cam.yaw;
  const fwd = { x: Math.cos(yaw), y: Math.sin(yaw) };
  const right = { x: -fwd.y, y: fwd.x };
  if (k.has('KeyW') || k.has('ArrowUp')) { mx += fwd.x; mz += fwd.y; }
  if (k.has('KeyS') || k.has('ArrowDown')) { mx -= fwd.x; mz -= fwd.y; }
  if (k.has('KeyA') || k.has('ArrowLeft')) { mx -= right.x; mz -= right.y; }
  if (k.has('KeyD') || k.has('ArrowRight')) { mx += right.x; mz += right.y; }
  const len = Math.hypot(mx, mz);
  p.moving = len > 0.01;
  const sprint = (k.has('ShiftLeft') || k.has('ShiftRight')) ? 1.45 : 1;
  if (p.moving) {
    const target = Math.atan2(mz, mx);
    p.angle += angDiff(p.angle, target) * Math.min(1, dt * 12);
    p.speed = lerp(p.speed, CFG.PLAYER_SPEED * sprint, Math.min(1, dt * 8));
  } else {
    p.speed = lerp(p.speed, 0, Math.min(1, dt * 10));
  }
  p.x += Math.cos(p.angle) * p.speed * dt;
  p.y += Math.sin(p.angle) * p.speed * dt;
  p.x = clamp(p.x, 40, CFG.WORLD_W - 40);
  p.y = clamp(p.y, 40, 2540);
  resolveBuildingCollision(p, CFG.PLAYER_RADIUS);
  animateRig(p.rig, p.speed, dt, p.phase);
  syncRig(p);
  updateAim();
}

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hitP = new THREE.Vector3();
export function updateAim() {
  const p = G.player;
  if (!p || !G.cam3) return;
  ndc.set((G.mouse.x / window.innerWidth) * 2 - 1, -(G.mouse.y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, G.cam3);
  if (raycaster.ray.intersectPlane(groundPlane, hitP)) {
    G.aimAngle = Math.atan2((hitP.z / CFG.SCALE + CFG.WORLD_H / 2) - p.y, (hitP.x / CFG.SCALE + CFG.WORLD_W / 2) - p.x);
  }
}

export function updateCamera(dt) {
  const p = G.player;
  if (!p) return;
  const cam = G.cam;
  if (G.mouse.down) {
    cam.off += G.mouse.dx * 0.004;
    cam.pitch = clamp(cam.pitch + G.mouse.dy * 0.002, 0.15, 0.95);
  }
  cam.off = lerp(cam.off, 0, Math.min(1, dt * 0.6));
  const anchor = p.car || p;
  const heading = anchor.angle;
  const want = heading + cam.off;
  cam.yaw += angDiff(cam.yaw, want) * Math.min(1, dt * (p.car ? 3.5 : 5));
  const wantDist = p.car ? 34 : 26;
  cam.dist = lerp(cam.dist, wantDist, Math.min(1, dt * 3));
  const tx = wx(anchor.x), tz = wz(anchor.y);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const cx = tx - Math.cos(cam.yaw) * cam.dist * cp;
  const cz = tz - Math.sin(cam.yaw) * cam.dist * cp;
  const cy = 2 + cam.dist * sp + (p.car ? 1 : 0);
  G.cam3.position.set(cx, cy, cz);
  G.shake = Math.max(0, G.shake - dt * 30);
  const sh = G.shake * 0.06;
  G.cam3.lookAt(
    tx + (Math.random() - 0.5) * sh,
    3 + (Math.random() - 0.5) * sh,
    tz + (Math.random() - 0.5) * sh
  );
}

export function spawnPeds(n) {
  const rng = Math.random;
  let placed = 0, tries = 0;
  while (placed < n && tries < n * 30) {
    tries++;
    const x = 200 + rng() * 3200, y = 200 + rng() * 2200;
    if (buildingHit(x, y, 30)) continue;
    const rig = makeCharacterMesh(
      SHIRTS[Math.floor(rng() * SHIRTS.length)],
      PANTS[Math.floor(rng() * PANTS.length)],
      SKINS[Math.floor(rng() * SKINS.length)]
    );
    rig.group.position.set(wx(x), 0, wz(y));
    G.scene.add(rig.group);
    G.peds.push({
      x, y, angle: rng() * Math.PI * 2, speed: 0, rig, phase: { v: rng() * 6 },
      tx: x, ty: y, wait: rng() * 2, flee: 0, dead: false,
    });
    placed++;
  }
}

export function updatePeds(dt) {
  const shot = G.lastShot;
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (shot && G.time - shot.t < 2 && dist(ped.x, ped.y, shot.x, shot.y) < 420) {
      ped.flee = 3;
      ped.angle = Math.atan2(ped.y - shot.y, ped.x - shot.x);
    }
    if (ped.flee > 0) {
      ped.flee -= dt;
      ped.speed = lerp(ped.speed, CFG.PED_FLEE_SPEED, Math.min(1, dt * 6));
    } else if (ped.wait > 0) {
      ped.wait -= dt;
      ped.speed = lerp(ped.speed, 0, Math.min(1, dt * 6));
    } else {
      if (dist(ped.x, ped.y, ped.tx, ped.ty) < 40) {
        ped.wait = 1 + Math.random() * 3;
        ped.tx = clamp(ped.x + (Math.random() - 0.5) * 700, 100, CFG.WORLD_W - 100);
        ped.ty = clamp(ped.y + (Math.random() - 0.5) * 700, 100, 2500);
      }
      const target = angleTo(ped.x, ped.y, ped.tx, ped.ty);
      ped.angle += angDiff(ped.angle, target) * Math.min(1, dt * 4);
      ped.speed = lerp(ped.speed, CFG.PED_SPEED, Math.min(1, dt * 4));
    }
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    ped.x = clamp(ped.x, 40, CFG.WORLD_W - 40);
    ped.y = clamp(ped.y, 40, 2540);
    if (resolveBuildingCollision(ped, 14)) {
      ped.angle += Math.PI / 2;
      ped.tx = ped.x; ped.ty = ped.y;
    }
    animateRig(ped.rig, ped.speed, dt, ped.phase);
    syncRig(ped);
  }
}
