import * as THREE from '../vendor/three.module.min.js';
import { CFG, G, mulberry32, pick, clamp, dist, wx, wz } from './config.js';

const PALETTE = ['#5b6b8c', '#7a6a8f', '#6b8c7a', '#8c6a5b', '#4f5f7d', '#84688a', '#5f7d8c', '#97795a'];
const DISTRICT_COLORS = ['#2e3a55', '#3a2f4d', '#274b4a', '#4d3a2f'];

let winTex = null;
function windowsTexture() {
  if (winTex) return winTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9fae'; g.fillRect(0, 0, 128, 256);
  const rng = mulberry32(7);
  for (let y = 0; y < 14; y++) for (let x = 0; x < 6; x++) {
    const lit = rng() > 0.45;
    g.fillStyle = lit ? (rng() > 0.5 ? '#ffd27a' : '#ffe9b0') : '#3a4152';
    g.fillRect(8 + x * 19, 10 + y * 17, 12, 10);
  }
  winTex = new THREE.CanvasTexture(c);
  winTex.colorSpace = THREE.SRGBColorSpace;
  return winTex;
}

export function initScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !G.lowQ, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = !G.lowQ;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xd97a52, 130, 520);
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1500);
  camera.position.set(0, 60, 120);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 top = vec3(0.23, 0.11, 0.31); vec3 mid = vec3(0.91, 0.45, 0.29); vec3 low = vec3(0.97, 0.70, 0.40); vec3 c = h > 0.25 ? mix(mid, top, smoothstep(0.25, 0.75, h)) : mix(low, mid, smoothstep(-0.05, 0.25, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(900, 24, 16), skyMat));
  const hemi = new THREE.HemisphereLight(0xffb08a, 0x2a1a2e, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffd9a0, 1.6);
  sun.position.set(-120, 180, -80);
  sun.castShadow = !G.lowQ;
  sun.shadow.camera.left = -260; sun.shadow.camera.right = 260;
  sun.shadow.camera.top = 260; sun.shadow.camera.bottom = -260;
  sun.shadow.camera.far = 700;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.WORLD_W * CFG.SCALE + 400, CFG.WORLD_H * CFG.SCALE + 400),
    new THREE.MeshLambertMaterial({ color: 0x5a4f45 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  G.scene = scene; G.renderer = renderer; G.cam3 = camera;
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    G.vw = window.innerWidth; G.vh = window.innerHeight;
  });
}

function box(w, h, d, color, x, y, z, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color, ...(opts.map ? { map: opts.map } : {}), ...(opts.emissive ? { emissive: opts.emissive } : {}) })
  );
  m.position.set(x, y, z);
  if (opts.ry) m.rotation.y = opts.ry;
  m.castShadow = !!opts.shadow; m.receiveShadow = true;
  return m;
}

export function buildWorld(seed) {
  const rng = mulberry32(seed);
  const W = CFG.WORLD_W, H = CFG.WORLD_H, GAP = CFG.ROAD_GAP, RW = CFG.ROAD_W;
  const S = CFG.SCALE;
  const roadsV = [];
  for (let x = 300; x < W - 100; x += GAP) roadsV.push(x);
  const roadsH = [];
  for (let y = 300; y < H - 300; y += GAP) roadsH.push(y);
  const water = { x: 0, y: 2560, w: W, h: H - 2560 };
  const docks = [
    { x: 1380, y: 2400, w: 420, h: 160 },
    { x: 2160, y: 2400, w: 420, h: 160 },
  ];
  const park = { x: 720 + RW / 2 + 14, y: 720 + RW / 2 + 14, w: GAP - RW - 28, h: GAP - RW - 28 };
  const buildings = [];
  const skipBlocks = new Set(['1,1', '4,5', '5,5', '3,4']);
  for (let bi = 0; bi < roadsV.length - 1; bi++) {
    for (let bj = 0; bj < roadsH.length - 1; bj++) {
      if (skipBlocks.has(bi + ',' + bj)) continue;
      const bx0 = roadsV[bi] + RW / 2 + 16, by0 = roadsH[bj] + RW / 2 + 16;
      const bw = GAP - RW - 32, bh = GAP - RW - 32;
      const n = 2 + Math.floor(rng() * 2);
      const push = (x, y, w, h, hgt) => buildings.push({ x, y, w, h, c: pick(rng, PALETTE), hgt });
      if (n === 1) push(bx0 + 14, by0 + 14, bw - 28, bh - 28, 26 + rng() * 46);
      else if (n === 2 && rng() > 0.5) {
        push(bx0 + 10, by0 + 10, bw / 2 - 16, bh - 20, 24 + rng() * 44);
        push(bx0 + bw / 2 + 6, by0 + 10, bw / 2 - 16, bh - 20, 24 + rng() * 44);
      } else if (n === 2) {
        push(bx0 + 10, by0 + 10, bw - 20, bh / 2 - 16, 24 + rng() * 44);
        push(bx0 + 10, by0 + bh / 2 + 6, bw - 20, bh / 2 - 16, 24 + rng() * 44);
      } else {
        push(bx0 + 12, by0 + 12, bw / 2 - 18, bh / 2 - 18, 22 + rng() * 40);
        push(bx0 + bw / 2 + 6, by0 + 12, bw / 2 - 18, bh / 2 - 18, 22 + rng() * 40);
        push(bx0 + 12, by0 + bh / 2 + 6, bw - 24, bh / 2 - 18, 22 + rng() * 40);
      }
    }
  }
  const trees = [];
  for (let i = 0; i < 26; i++) trees.push({ x: park.x + 20 + rng() * (park.w - 40), y: park.y + 20 + rng() * (park.h - 40), r: 12 + rng() * 10 });
  for (let i = 0; i < 30; i++) {
    const rx = roadsV[Math.floor(rng() * roadsV.length)];
    const ry = roadsH[Math.floor(rng() * roadsH.length)];
    trees.push({ x: rx + (rng() > 0.5 ? 78 : -78), y: ry + (rng() - 0.5) * 300, r: 9 + rng() * 7 });
  }
  const districts = [
    { name: 'OLD TOWN', x: 0, y: 0, w: W / 2, h: H / 2 - 140, c: DISTRICT_COLORS[0] },
    { name: 'DOWNTOWN', x: W / 2, y: 0, w: W / 2, h: H / 2 - 140, c: DISTRICT_COLORS[1] },
    { name: 'MARINA DISTRICT', x: 0, y: H / 2 - 140, w: W / 2, h: H / 2, c: DISTRICT_COLORS[2] },
    { name: 'HARBOR DISTRICT', x: W / 2, y: H / 2 - 140, w: W / 2, h: H / 2, c: DISTRICT_COLORS[3] },
  ];
  const crates = [];
  for (const [cx, cy] of [[1470, 2440], [1530, 2470], [2280, 2440], [2340, 2475], [1500, 2520], [2400, 2500]]) {
    crates.push({ x: cx - 22, y: cy - 22, w: 44, h: 44 });
  }
  const world = {
    roadsV, roadsH, water, docks, park, buildings, trees, districts, crates,
    solids: buildings.concat(crates),
    safehouse: { x: 1140, y: 1980, r: 70 },
    spawn: { x: 1560, y: 720 },
    exportDock: { x: 2400, y: 2520 },
    missionSpots: {
      firstDelivery: { x: 1560, y: 720 }, hotWheels: { x: 2400, y: 1140 },
      dockside: { x: 1560, y: 2400 }, showdown: { x: 2400, y: 2400 },
      grandPrix: { x: 300, y: 300 }, lastDrop: { x: 2820, y: 2400 },
    },
    deliveryDrop: { x: 2820, y: 1980 }, lenaDrop: { x: 720, y: 1560 }, escapePoint: { x: 720, y: 300 },
    healthSpots: [
      { x: 720, y: 300 }, { x: 2400, y: 720 }, { x: 1140, y: 1980 },
      { x: 2820, y: 1140 }, { x: 1980, y: 2400 }, { x: 300, y: 1560 },
    ],
    armourSpots: [{ x: 300, y: 720 }, { x: 2820, y: 720 }, { x: 720, y: 2400 }],
    anchorSpots: [
      { x: 420, y: 300 }, { x: 1140, y: 420 }, { x: 2400, y: 420 },
      { x: 3300, y: 720 }, { x: 930, y: 930 }, { x: 1980, y: 1140 },
      { x: 300, y: 1560 }, { x: 2820, y: 1560 }, { x: 720, y: 1980 },
      { x: 1560, y: 2520 }, { x: 2400, y: 2520 }, { x: 3300, y: 2400 },
    ],
    ramps: [
      { id: 'r1', x: 1560, y: 300, angle: 0, name: 'North Gate Leap' },
      { id: 'r2', x: 3300, y: 1140, angle: Math.PI / 2, name: 'Eastside Flyer' },
      { id: 'r3', x: 720, y: 1980, angle: Math.PI, name: 'Marina Hop' },
      { id: 'r4', x: 2400, y: 2400, angle: -Math.PI / 2, name: 'Dockside Launch' },
      { id: 'r5', x: 1980, y: 1560, angle: 0, name: 'Downtown Air' },
    ],
    races: [
      { slug: 'terrace-climb', name: 'Terrace Climb', par: 75, payout: 300, start: { x: 300, y: 300 },
        checkpoints: [{ x: 1560, y: 300 }, { x: 2820, y: 300 }, { x: 2820, y: 1140 }, { x: 1560, y: 1140 }, { x: 300, y: 1140 }] },
      { slug: 'harbour-loop', name: 'Harbour Loop', par: 80, payout: 350, start: { x: 1560, y: 2400 },
        checkpoints: [{ x: 2820, y: 2400 }, { x: 2820, y: 1560 }, { x: 1560, y: 1560 }, { x: 720, y: 1980 }, { x: 1140, y: 2400 }] },
      { slug: 'city-sprint', name: 'City Sprint', par: 95, payout: 450, start: { x: 720, y: 720 },
        checkpoints: [{ x: 2400, y: 720 }, { x: 2400, y: 1980 }, { x: 720, y: 1980 }, { x: 720, y: 1140 }, { x: 1560, y: 720 }] },
    ],
  };
  G.world = world;
  const prev = G.anchors || [];
  G.anchors = world.anchorSpots.map((s, i) => ({ x: s.x, y: s.y, found: !!(prev[i] && prev[i].found) }));
  buildMeshes(world, rng);
  return world;
}

function buildMeshes(w, rng) {
  const scene = G.scene, S = CFG.SCALE;
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x55525e });
  const dashGeo = new THREE.BoxGeometry(1.2, 0.06, 6);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8d2a8 });
  const dashSpots = [];
  for (const rx of w.roadsV) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(CFG.ROAD_W * S, 2560 * S), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(wx(rx), 0.02, wz(1280));
    road.receiveShadow = true;
    scene.add(road);
    for (let y = 120; y < 2500; y += 90) dashSpots.push([wx(rx), wz(y), 0]);
  }
  for (const ry of w.roadsH) {
    const road = new THREE.Mesh(new THREE.PlaneGeometry(CFG.WORLD_W * S, CFG.ROAD_W * S), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, wz(ry));
    road.receiveShadow = true;
    scene.add(road);
    for (let x = 120; x < 3500; x += 90) dashSpots.push([wx(x), wz(ry), Math.PI / 2]);
  }
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, dashSpots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  dashSpots.forEach((d, i) => {
    e.set(0, d[2], 0); q.setFromEuler(e); v.set(d[0], 0.06, d[1]);
    m4.compose(v, q, sc); dashes.setMatrixAt(i, m4);
  });
  scene.add(dashes);
  for (let bi = 0; bi < w.roadsV.length - 1; bi++) {
    for (let bj = 0; bj < w.roadsH.length - 1; bj++) {
      const x0 = w.roadsV[bi] + CFG.ROAD_W / 2, y0 = w.roadsH[bj] + CFG.ROAD_W / 2;
      const bw = CFG.ROAD_GAP - CFG.ROAD_W, bh = CFG.ROAD_GAP - CFG.ROAD_W;
      const slab = box(bw * S, 0.5, bh * S, 0x6b5d50, wx(x0 + bw / 2), 0.25, wz(y0 + bh / 2));
      slab.receiveShadow = true;
      scene.add(slab);
    }
  }
  const parkMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w.park.w * S, w.park.h * S),
    new THREE.MeshLambertMaterial({ color: 0x2f7a3d })
  );
  parkMesh.rotation.x = -Math.PI / 2;
  parkMesh.position.set(wx(w.park.x + w.park.w / 2), 0.55, wz(w.park.y + w.park.h / 2));
  parkMesh.receiveShadow = true;
  scene.add(parkMesh);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CFG.WORLD_W * S + 400, (CFG.WORLD_H - 2560) * S + 200),
    new THREE.MeshLambertMaterial({ color: 0x14707f })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.04, wz(2560) + (CFG.WORLD_H - 2560) * S / 2 + 25);
  scene.add(sea);
  for (const d of w.docks) {
    const dock = box(d.w * S, 1.2, d.h * S, 0x7a5a38, wx(d.x + d.w / 2), 0.6, wz(d.y + d.h / 2));
    dock.receiveShadow = true;
    scene.add(dock);
  }
  const tex = windowsTexture();
  for (const b of w.buildings) {
    const h = b.hgt * S;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w * S, h, b.h * S),
      new THREE.MeshLambertMaterial({ map: tex, color: b.c })
    );
    mesh.position.set(wx(b.x + b.w / 2), h / 2 + 0.5, wz(b.y + b.h / 2));
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    const roof = box(b.w * S + 1, 0.6, b.h * S + 1, 0x2a2430, wx(b.x + b.w / 2), h + 0.8, wz(b.y + b.h / 2));
    scene.add(roof);
  }
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x1f6b2e });
  for (const t of w.trees) {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 4, 6), trunkMat);
    trunk.position.set(wx(t.x), 2.5, wz(t.y));
    trunk.castShadow = true;
    scene.add(trunk);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(t.r * S + 1.5, 7, 7), leafMat);
    crown.position.set(wx(t.x), 7.5, wz(t.y));
    crown.castShadow = true;
    scene.add(crown);
  }
  for (let i = 0; i < 14; i++) {
    const px = 120 + rng() * 3360, py = 2420 + rng() * 120;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 9, 6), trunkMat);
    trunk.position.set(wx(px), 5, wz(py));
    trunk.rotation.z = (rng() - 0.5) * 0.25;
    trunk.castShadow = true;
    scene.add(trunk);
    for (let f = 0; f < 6; f++) {
      const frond = box(0.25, 0.15, 7, 0x2a8a3d, wx(px), 9.5, wz(py), { ry: (f / 6) * Math.PI * 2 });
      frond.position.z += Math.cos((f / 6) * Math.PI * 2) * 3;
      frond.position.x += Math.sin((f / 6) * Math.PI * 2) * 3;
      frond.rotation.x = 0.5;
      scene.add(frond);
    }
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9b0 });
  for (const rx of w.roadsV) {
    for (const ly of [600, 1500, 2280]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 9, 6), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      pole.position.set(wx(rx + 56), 4.5, wz(ly));
      scene.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 6), lampMat);
      bulb.position.set(wx(rx + 56), 9.2, wz(ly));
      scene.add(bulb);
    }
  }
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x8a6a3a });
  for (const c of w.crates) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(c.w * S, 3.2, c.h * S), crateMat);
    crate.position.set(wx(c.x + c.w / 2), 1.6, wz(c.y + c.h / 2));
    crate.castShadow = true; crate.receiveShadow = true;
    scene.add(crate);
  }
}

export function onRoad(x, y) {
  const w = G.world;
  for (const rx of w.roadsV) if (Math.abs(x - rx) < CFG.ROAD_W / 2 + 6) return true;
  for (const ry of w.roadsH) if (Math.abs(y - ry) < CFG.ROAD_W / 2 + 6) return true;
  return false;
}
export function inWater(x, y) { return y > G.world.water.y; }
export function nearestRoadPoint(x, y) {
  const w = G.world;
  let best = null, bd = 1e9;
  for (const rx of w.roadsV) {
    const d = Math.abs(x - rx);
    if (d < bd) { bd = d; best = { x: rx, y: clamp(y, 60, CFG.WORLD_H - 60), axis: 'v' }; }
  }
  for (const ry of w.roadsH) {
    const d = Math.abs(y - ry);
    if (d < bd) { bd = d; best = { x: clamp(x, 60, CFG.WORLD_W - 60), y: ry, axis: 'h' }; }
  }
  return best;
}
export function buildingHit(x, y, r) {
  for (const b of G.world.solids) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}
export function resolveBuildingCollision(e, r) {
  const b = buildingHit(e.x, e.y, r);
  if (!b) return false;
  const cx = clamp(e.x, b.x, b.x + b.w), cy = clamp(e.y, b.y, b.y + b.h);
  const dx = e.x - cx, dy = e.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) e.x = cx + (dx >= 0 ? r : -r);
  else e.y = cy + (dy >= 0 ? r : -r);
  return true;
}
export function hasLineOfSight(x1, y1, x2, y2) {
  const d = dist(x1, y1, x2, y2);
  const steps = Math.max(1, Math.floor(d / 24));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (buildingHit(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, 4)) return false;
  }
  return true;
}
export function districtAt(x, y) {
  for (const d of G.world.districts) {
    if (x >= d.x && x < d.x + d.w && y >= d.y && y < d.y + d.h) return d.name;
  }
  if (inWater(x, y)) return 'THE HARBOUR';
  return 'PORT MERIDIAN';
}

export function makeBeacon(color) {
  const grp = new THREE.Group();
  const cyl = new THREE.Mesh(
    new THREE.CylinderGeometry(3, 3, 14, 12, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  cyl.position.y = 7;
  grp.add(cyl);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.4, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  grp.add(ring);
  return grp;
}

export function spawnParticles(x, y, count, colors, speed, life, size) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size * CFG.SCALE, size * CFG.SCALE, size * CFG.SCALE),
      new THREE.MeshBasicMaterial({ color: colors[i % colors.length] })
    );
    const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random() * 0.7);
    mesh.position.set(wx(x), 1 + Math.random() * 2, wz(y));
    G.scene.add(mesh);
    G.particles.push({
      mesh, vx: Math.cos(a) * sp * CFG.SCALE, vz: Math.sin(a) * sp * CFG.SCALE,
      vy: (2 + Math.random() * 5), t: life * (0.6 + Math.random() * 0.4), max: life,
    });
  }
}
export function updateParticles(dt) {
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.t -= dt;
    if (p.t <= 0) {
      G.scene.remove(p.mesh);
      p.mesh.geometry.dispose(); p.mesh.material.dispose();
      G.particles.splice(i, 1);
      continue;
    }
    p.vy -= 14 * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.position.y = Math.max(0.2, p.mesh.position.y + p.vy * dt);
    const s = p.t / p.max;
    p.mesh.scale.setScalar(Math.max(0.05, s));
  }
}
