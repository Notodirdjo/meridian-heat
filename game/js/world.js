// MERIDIAN HEAT — world.js: Port Meridian city generation.
// A fixed road grid with four districts, a park, and a harbour strip along
// the south edge. Deterministic from a seed so staged screenshots are stable.

import { CFG, G, mulberry32, pick, clamp, dist } from './config.js';

const DISTRICT_COLORS = ['#2e3a55', '#3a2f4d', '#274b4a', '#4d3a2f'];

export function buildWorld(seed) {
  const rng = mulberry32(seed);
  const W = CFG.WORLD_W, H = CFG.WORLD_H, GAP = CFG.ROAD_GAP, RW = CFG.ROAD_W;

  const roadsV = [];
  for (let x = 300; x < W - 100; x += GAP) roadsV.push(x);
  const roadsH = [];
  for (let y = 300; y < H - 300; y += GAP) roadsH.push(y);

  // Water: harbour strip along the south edge, with a dock pier.
  const water = { x: 0, y: 2560, w: W, h: H - 2560 };
  const docks = [
    { x: 1380, y: 2400, w: 420, h: 160 },
    { x: 2160, y: 2400, w: 420, h: 160 },
  ];

  // Park block: between roads x 720..1140, y 720..1140.
  const park = { x: 720 + RW / 2 + 14, y: 720 + RW / 2 + 14, w: GAP - RW - 28, h: GAP - RW - 28 };

  // Buildings: one to three per block, skipping the park block, the
  // safehouse lot, the dock lots and two plaza blocks.
  const buildings = [];
  const skipBlocks = new Set(['1,1', '4,5', '5,5', '3,4']);
  const palette = ['#5b6b8c', '#7a6a8f', '#6b8c7a', '#8c6a5b', '#4f5f7d', '#84688a', '#5f7d8c', '#97795a'];
  for (let bi = 0; bi < roadsV.length - 1; bi++) {
    for (let bj = 0; bj < roadsH.length - 1; bj++) {
      const key = bi + ',' + bj;
      if (skipBlocks.has(key)) continue;
      const bx0 = roadsV[bi] + RW / 2 + 16;
      const by0 = roadsH[bj] + RW / 2 + 16;
      const bw = GAP - RW - 32, bh = GAP - RW - 32;
      const n = 1 + Math.floor(rng() * 3);
      if (n === 1) {
        buildings.push({ x: bx0 + 14, y: by0 + 14, w: bw - 28, h: bh - 28, c: pick(rng, palette), hgt: 26 + rng() * 46 });
      } else if (n === 2) {
        const vertical = rng() > 0.5;
        if (vertical) {
          buildings.push({ x: bx0 + 10, y: by0 + 10, w: bw / 2 - 16, h: bh - 20, c: pick(rng, palette), hgt: 24 + rng() * 44 });
          buildings.push({ x: bx0 + bw / 2 + 6, y: by0 + 10, w: bw / 2 - 16, h: bh - 20, c: pick(rng, palette), hgt: 24 + rng() * 44 });
        } else {
          buildings.push({ x: bx0 + 10, y: by0 + 10, w: bw - 20, h: bh / 2 - 16, c: pick(rng, palette), hgt: 24 + rng() * 44 });
          buildings.push({ x: bx0 + 10, y: by0 + bh / 2 + 6, w: bw - 20, h: bh / 2 - 16, c: pick(rng, palette), hgt: 24 + rng() * 44 });
        }
      } else {
        buildings.push({ x: bx0 + 12, y: by0 + 12, w: bw / 2 - 18, h: bh / 2 - 18, c: pick(rng, palette), hgt: 22 + rng() * 40 });
        buildings.push({ x: bx0 + bw / 2 + 6, y: by0 + 12, w: bw / 2 - 18, h: bh / 2 - 18, c: pick(rng, palette), hgt: 22 + rng() * 40 });
        buildings.push({ x: bx0 + 12, y: by0 + bh / 2 + 6, w: bw - 24, h: bh / 2 - 18, c: pick(rng, palette), hgt: 22 + rng() * 40 });
      }
    }
  }

  // Trees in the park and along a few sidewalks.
  const trees = [];
  for (let i = 0; i < 26; i++) {
    trees.push({ x: park.x + 20 + rng() * (park.w - 40), y: park.y + 20 + rng() * (park.h - 40), r: 12 + rng() * 10 });
  }
  for (let i = 0; i < 30; i++) {
    const rx = roadsV[Math.floor(rng() * roadsV.length)];
    const ry = roadsH[Math.floor(rng() * roadsH.length)];
    trees.push({ x: rx + (rng() > 0.5 ? 78 : -78), y: ry + (rng() - 0.5) * 300, r: 9 + rng() * 7 });
  }

  // Districts (quadrants) + named places.
  const districts = [
    { name: 'OLD TOWN', x: 0, y: 0, w: W / 2, h: H / 2 - 140, c: DISTRICT_COLORS[0] },
    { name: 'DOWNTOWN', x: W / 2, y: 0, w: W / 2, h: H / 2 - 140, c: DISTRICT_COLORS[1] },
    { name: 'MARINA DISTRICT', x: 0, y: H / 2 - 140, w: W / 2, h: H / 2, c: DISTRICT_COLORS[2] },
    { name: 'HARBOR DISTRICT', x: W / 2, y: H / 2 - 140, w: W / 2, h: H / 2, c: DISTRICT_COLORS[3] },
  ];

  const world = {
    roadsV, roadsH, water, docks, park, buildings, trees, districts,
    safehouse: { x: 1140, y: 1980, r: 70 },          // Marina District, west side
    spawn: { x: 1560, y: 720 },                     // Downtown corner, on foot
    missionSpots: {
      firstDelivery: { x: 1560, y: 720 },
      hotWheels: { x: 2400, y: 1140 },              // gold Comet Sport lot
      dockside: { x: 1560, y: 2400 },               // dock pier
      showdown: { x: 2400, y: 2400 },               // harbour warehouse
    },
    deliveryDrop: { x: 2820, y: 1980 },
    lenaDrop: { x: 720, y: 1560 },
    escapePoint: { x: 720, y: 300 },
    healthSpots: [
      { x: 720, y: 300 }, { x: 2400, y: 720 }, { x: 1140, y: 1980 },
      { x: 2820, y: 1140 }, { x: 1980, y: 2400 }, { x: 300, y: 1560 },
    ],
    rng,
  };
  G.world = world;
  return world;
}

// ---- geometry helpers -------------------------------------------------
export function onRoad(x, y) {
  const w = G.world;
  for (const rx of w.roadsV) if (Math.abs(x - rx) < CFG.ROAD_W / 2 + 6) return true;
  for (const ry of w.roadsH) if (Math.abs(y - ry) < CFG.ROAD_W / 2 + 6) return true;
  return false;
}
export function inWater(x, y) {
  return y > G.world.water.y;
}
export function nearestRoadPoint(x, y) {
  // Snap to the closest road centre line.
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
// Circle vs building AABB; returns the building hit, or null.
export function buildingHit(x, y, r) {
  for (const b of G.world.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return b;
  }
  return null;
}
// Push a circle out of buildings (simple slide: resolve per-axis).
// Returns true when a building blocked the circle.
export function resolveBuildingCollision(e, r) {
  const b = buildingHit(e.x, e.y, r);
  if (!b) return false;
  const cx = clamp(e.x, b.x, b.x + b.w), cy = clamp(e.y, b.y, b.y + b.h);
  const dx = e.x - cx, dy = e.y - cy;
  if (Math.abs(dx) > Math.abs(dy)) e.x = cx + (dx >= 0 ? r : -r);
  else e.y = cy + (dy >= 0 ? r : -r);
  return true;
}
// True when no building blocks the straight segment (sampled).
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
