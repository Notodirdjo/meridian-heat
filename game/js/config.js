export const CFG = {
  WORLD_W: 3600, WORLD_H: 2800, SCALE: 0.25,
  ROAD_W: 100, ROAD_GAP: 420,
  PLAYER_SPEED: 245, PLAYER_RADIUS: 14,
  CAR_MAX_SPEED: 470, CAR_ACCEL: 330, CAR_BRAKE: 560, CAR_TURN: 2.7,
  TRAFFIC_SPEED_MIN: 110, TRAFFIC_SPEED_MAX: 185,
  POLICE_CAR_SPEED: 520, COP_SPEED: 205,
  PED_SPEED: 55, PED_FLEE_SPEED: 165,
  PISTOL_MAG: 12, PISTOL_RESERVE: 96, PISTOL_DAMAGE: 34,
  SMG_MAG: 30, SMG_RESERVE: 180, SMG_DAMAGE: 18, SMG_FIRE_CD: 0.09,
  PUNCH_DAMAGE: 26, PUNCH_RANGE: 56,
  ARREST_HOLD: 1.4, CAR_HIT_COOLDOWN: 0.6, QUIET_SPELL: 10, DECAY_EVERY: 4,
  DAY_LENGTH: 240, SAVE_KEY: 'meridian-heat-save-v2',
  CREW_CD: { rico: 45, lena: 60, captain: 50 },
  ANCHOR_TOTAL: 12, JUMP_TOTAL: 5, RACE_TOTAL: 3, EXPORT_TOTAL: 5,
};

export const G = {
  state: 'title', prevState: 'title',
  time: 0, dayTime: 0.32, seed: 1,
  money: 250, health: 100, maxHealth: 100, armour: 0, maxArmour: 100,
  wanted: 0, highestWanted: 0, lastCrime: -999, decayTimer: 0, policeSpawnTimer: 0,
  weapon: 'pistol', ammo: 12, reserveAmmo: 96,
  smgAmmo: 0, smgReserve: 0, smgUnlocked: false,
  reloading: 0, punchTimer: 0, punchCooldown: 0, aimAngle: 0,
  rp: 0,
  rep: { 'OLD TOWN': 50, DOWNTOWN: 50, 'MARINA DISTRICT': 50, 'HARBOR DISTRICT': 50 },
  crew: {
    rico: { recruited: false, cd: 0, uses: 0 },
    lena: { recruited: false, cd: 0, uses: 0 },
    captain: { recruited: false, cd: 0, uses: 0 },
  },
  anchorsFound: 0, anchors: [],
  ratings: {}, racesWon: 0, racesDone: [], race: null,
  jumpsDone: 0, jumpsFound: [], exportsDone: 0, exportsDelivered: [], exportTarget: null,
  dialogue: null, radioStation: 0, waypoint: null, eyesOutTimer: 0, heli: null,
  missionDamage: 0, missionStartTime: 0, playtime: 0, saveSlot: 0, pauseTab: 'map',
  _lastRpGain: null, _timeScale: 1, lowQ: false,
  player: null, cars: [], peds: [], cops: [], gunmen: [],
  bullets: [], particles: [], pickups: [],
  mission: null, missionsDone: [], storyDone: false,
  missionCard: null, toast: null, missionListOpen: false,
  cam: { yaw: 0, pitch: 0.42, dist: 26, off: 0 },
  shake: 0,
  keys: new Set(), pressed: new Set(),
  mouse: { x: 0, y: 0, down: false, clicked: false, dx: 0, dy: 0 },
  vw: 1280, vh: 720, world: null, shot: null, muted: false,
  scene: null, renderer: null, cam3: null,
  stats: {
    shotsFired: 0, carsStolen: 0, pedsDown: 0, copsDown: 0, gunmenDown: 0,
    copsEscaped: 0, highestWanted: 0, distanceDriven: 0, longestJump: 0,
    crewAbilitiesUsed: 0, hiddenByLocals: 0,
  },
};

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
export function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
export function fmtClock(dayTime) {
  const mins = Math.floor((((dayTime * 24 + 12) % 24) * 60 + 0.5));
  return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
}
export const addShake = (n) => { G.shake = Math.min(26, G.shake + n); };
export const toast = (text, seconds = 3) => { G.toast = { text, t: seconds }; };
export const wx = (x) => (x - CFG.WORLD_W / 2) * CFG.SCALE;
export const wz = (y) => (y - CFG.WORLD_H / 2) * CFG.SCALE;
export const lx = (w) => w / CFG.SCALE + CFG.WORLD_W / 2;
export const lz = (w) => w / CFG.SCALE + CFG.WORLD_H / 2;
