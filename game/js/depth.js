import * as THREE from '../vendor/three.module.min.js';
import { CFG, G, dist, angDiff, addShake, toast, wx, wz } from './config.js';
import { spawnParticles } from './world.js';
import { sfx } from './radio.js';
import { awardRp, rankFor } from './progression.js';

let jump = null;
let pickupsBuilt = false;

function anchorMesh() {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(2.2),
    new THREE.MeshLambertMaterial({ color: 0xf1c40f, emissive: 0x664d00 })
  );
  m.position.y = 2.5;
  return m;
}

function pickupMesh(kind) {
  const grp = new THREE.Group();
  if (kind === 'health') {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 2.4), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    grp.add(box);
    const cMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.3), cMat);
    c1.position.z = 1.25;
    grp.add(c1);
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.6, 0.3), cMat);
    c2.position.z = 1.25;
    grp.add(c2);
  } else {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.6), new THREE.MeshLambertMaterial({ color: 0x3498db, emissive: 0x0a2a4a }));
    grp.add(box);
    const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.6, 0.6), new THREE.MeshLambertMaterial({ color: 0x85c1e9 }));
    top.position.y = 1.5;
    grp.add(top);
  }
  grp.position.y = 2;
  return grp;
}

export function spawnPickup(x, y, kind, respawn = 0) {
  const mesh = pickupMesh(kind);
  mesh.position.set(wx(x), 2, wz(y));
  G.scene.add(mesh);
  const pk = { x, y, kind, t: 0, mesh, respawn, taken: false };
  G.pickups.push(pk);
  return pk;
}

export function initDepth() {
  for (const a of G.anchors) {
    if (!a.mesh) {
      a.mesh = anchorMesh();
      a.mesh.position.set(wx(a.x), 2.5, wz(a.y));
      G.scene.add(a.mesh);
    }
    a.mesh.visible = !a.found;
  }
  if (!pickupsBuilt) {
    pickupsBuilt = true;
    for (const s of G.world.healthSpots) spawnPickup(s.x, s.y, 'health', 60);
    for (const s of G.world.armourSpots) spawnPickup(s.x, s.y, 'armour', 60);
  }
  for (const pk of G.pickups) {
    if (pk.kind === 'armour') pk.mesh.visible = !pk.taken && rankFor(G.rp) >= 1;
    else pk.mesh.visible = !pk.taken;
  }
}

function updateAnchors(dt) {
  const p = G.player;
  for (const a of G.anchors) {
    if (a.found || !a.mesh) continue;
    a.mesh.rotation.y += dt * 1.5;
    a.mesh.position.y = 2.5 + Math.sin(G.time * 2 + a.x) * 0.5;
    if (p && dist(p.x, p.y, a.x, a.y) < 34) {
      a.found = true;
      a.mesh.visible = false;
      G.anchorsFound++;
      G.money += 100;
      awardRp(50, 'Golden Anchor');
      sfx.pickup();
      spawnParticles(a.x, a.y, 18, ['#f1c40f', '#ffffff'], 200, 0.7, 4);
      toast('Golden Anchor ' + G.anchorsFound + '/' + CFG.ANCHOR_TOTAL + '! +$100  •  +50 RP', 4);
    }
  }
}

function updateJumps(dt) {
  const p = G.player;
  for (const r of G.world.ramps) if (r.cool > 0) r.cool -= dt;
  if (jump) {
    jump.t -= dt;
    const car = p && p.car;
    if (car) {
      jump.dist += Math.abs(car.speed) * dt * 0.106;
      const prog = 1 - Math.max(0, jump.t) / 0.9;
      car.mesh.position.y = Math.sin(prog * Math.PI) * 6;
    }
    if (jump.t <= 0) {
      const meters = Math.round(jump.dist);
      const ramp = jump.ramp;
      jump = null;
      if (car) car.mesh.position.y = 0;
      addShake(6);
      spawnParticles(p.x, p.y, 14, ['#f1c40f', '#ffffff'], 200, 0.5, 4);
      if (meters > G.stats.longestJump) G.stats.longestJump = meters;
      if (!G.jumpsFound.includes(ramp.id)) {
        G.jumpsFound.push(ramp.id);
        G.jumpsDone++;
        awardRp(60, ramp.name);
        sfx.pickup();
        toast('STUNT JUMP — ' + ramp.name + '! ' + meters + 'm  •  ' + G.jumpsDone + '/' + CFG.JUMP_TOTAL + '  •  +60 RP', 4);
      } else {
        awardRp(20, ramp.name);
        toast('STUNT JUMP — ' + meters + 'm  •  +20 RP', 3);
      }
    }
    return;
  }
  if (!p || !p.car) return;
  const car = p.car;
  for (const r of G.world.ramps) {
    if (r.cool > 0) continue;
    if (dist(car.x, car.y, r.x, r.y) < 28 && Math.abs(car.speed) > 60 && Math.abs(angDiff(car.angle, r.angle)) < 0.9) {
      jump = { t: 0.9, dist: 0, ramp: r };
      r.cool = 3;
      break;
    }
  }
}

function updatePickups(dt) {
  const p = G.player;
  const canArmour = rankFor(G.rp) >= 1;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    if (pk.taken) {
      if (pk.respawn > 0) {
        pk.t += dt;
        if (pk.t >= pk.respawn) {
          pk.taken = false;
          pk.t = 0;
          pk.mesh.visible = pk.kind !== 'armour' || canArmour;
        }
      }
      continue;
    }
    if (pk.kind === 'armour' && !canArmour) { pk.mesh.visible = false; continue; }
    pk.mesh.visible = true;
    pk.mesh.rotation.y += dt;
    if (!p) continue;
    if (dist(p.x, p.y, pk.x, pk.y) < 40) {
      if (pk.kind === 'health') {
        if (G.health >= G.maxHealth) continue;
        G.health = Math.min(G.maxHealth, G.health + 50);
        toast('Health restored. +50', 2);
      } else {
        if (G.armour >= G.maxArmour) continue;
        G.armour = Math.min(G.maxArmour, G.armour + 50);
        toast('Armour picked up. +50', 2);
      }
      sfx.pickup();
      spawnParticles(pk.x, pk.y, 10, ['#2ecc71', '#ffffff'], 160, 0.5, 3);
      pk.taken = true;
      pk.t = 0;
      pk.mesh.visible = false;
      if (pk.respawn <= 0) {
        G.scene.remove(pk.mesh);
        G.pickups.splice(i, 1);
      }
    }
  }
}

export function updateDepth(dt) {
  updateAnchors(dt);
  updateJumps(dt);
  updatePickups(dt);
}
