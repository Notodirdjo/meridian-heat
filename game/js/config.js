// MERIDIAN HEAT — shared state, tuning constants and small utilities.
// One mutable game state object (G) is shared by every module so the
// open world, missions, combat and UI all read the same truth.

export const CFG = {
  WORLD_W: 3600,
  WORLD_H: 2800,
  ROAD_W: 100,
  ROAD_GAP: 420,
  PLAYER_SPEED: 245,
  PLAYER_RADIUS: 14,
  CAR_MAX_SPEED: 470, // px/s; shown as ~175 km/h on the HUD
  CAR_ACCEL: 320,
  CAR_BRAKE: 520,
  CAR_TURN: 2.6,
  TRAFFIC_SPEED_MIN: 110,
  TRAFFIC_SPEED_MAX: 185,
  POLICE_CAR_SPEED: 520,
  COP_SPEED: 205,
  PED_SPEED: 55,
  PED_FLEE_SPEED: 165,
  PISTOL_MAG: 12,
  PISTOL_RESERVE: 96,
  PISTOL_DAMAGE: 34,
  PUNCH_DAMAGE: 26,
  PUNCH_RANGE: 56,
  ARREST_HOLD: 1.4,
  CAR_HIT_COOLDOWN: 0.6,
  QUIET_SPELL: 10,
  DECAY_EVERY: 4,
  DAY_LENGTH: 240, // seconds for a full day/night cycle
  SAVE_KEY: 'meridian-heat-save-v1',
};

// ---------------------------------------------------------------- state
export const G = {
  state: 'title', // title | playing | paused | wasted | busted | story
  prevState: 'title',
  time: 0,            // total seconds since boot
  dayTime: 0.32,      // 0..1, 0.32 = neon dusk
  seed: 1,
  money: 250,
  health: 100,
  maxHealth: 100,
  wanted: 0,
  lastCrime: -999,
  decayTimer: 0,
  policeSpawnTimer: 0,
  weapon: 'pistol',
  ammo: 12,
  reserveAmmo: 96,
  reloading: 0,
  punchTimer: 0,
  punchCooldown: 0,
  aimAngle: 0,
  player: null,       // {x,y,angle,hp,car,inCar,invuln}
  cars: [],           // traffic + parked + police cars
  peds: [],
  cops: [],           // foot cops (police cars live in cars[] with kind:'police')
  gunmen: [],         // mission enemies
  bullets: [],
  particles: [],
  skidmarks: [],
  pickups: [],        // health packs
  mission: null,      // active mission runtime object
  missionsDone: [],   // slugs completed
  storyDone: false,
  missionCard: null,  // {title, contact, lines, payout, t}
  toast: null,        // {text, t}
  missionListOpen: false,
  camera: { x: 1800, y: 1400 },
  shake: 0,
  keys: new Set(),
  pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, clicked: false, wx: 0, wy: 0 },
  canvas: null,
  ctx: null,
  vw: 1280,
  vh: 720,
  world: null,
  shot: null,         // staged screenshot mode: title|drive|mission|combat
  muted: false,
  stats: { shotsFired: 0, carsStolen: 0, pedsDown: 0, copsDown: 0 },
};

// ---------------------------------------------------------------- utils
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
export function angleTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
export function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
export function fmtMoney(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export function addShake(amount) { G.shake = Math.min(26, G.shake + amount); }
export function toast(text, seconds = 3) { G.toast = { text, t: seconds }; }
