import { CFG, G, clamp, toast } from './config.js';

export const RANKS = [
  { name: 'ROOKIE', rp: 0, unlock: null },
  { name: 'WHEELMAN', rp: 500, unlock: 'Armour pickups appear around the city' },
  { name: 'FIXER', rp: 1500, unlock: 'SMG unlocked — press 3 to equip it' },
  { name: 'SHOT CALLER', rp: 3500, unlock: 'Crew abilities recharge 25% faster' },
  { name: 'KINGPIN', rp: 7000, unlock: 'The city is yours. Maximum respect.' },
];

export function rankFor(rp) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) if (rp >= RANKS[i].rp) idx = i;
  return idx;
}

export function nextRankRp() {
  const idx = rankFor(G.rp);
  return idx >= RANKS.length - 1 ? null : RANKS[idx + 1].rp;
}

export function awardRp(n, why) {
  const before = rankFor(G.rp);
  G.rp += n;
  if (why) G._lastRpGain = { n, why, t: 3 };
  const after = rankFor(G.rp);
  if (after >= 2 && !G.smgUnlocked) {
    G.smgUnlocked = true;
    G.smgAmmo = CFG.SMG_MAG;
    G.smgReserve = CFG.SMG_RESERVE;
    toast('SMG UNLOCKED — press 3 to equip it.', 4);
  }
  return after > before ? after : -1;
}

export function repStatus(score) {
  if (score >= 70) return 'FRIENDLY';
  if (score >= 40) return 'NEUTRAL';
  return 'WARY';
}
export function repColor(score) {
  if (score >= 70) return '#2ecc71';
  if (score >= 40) return '#f1c40f';
  return '#e74c3c';
}
export function addRep(district, n) {
  if (G.rep[district] === undefined) return;
  G.rep[district] = clamp(Math.round(G.rep[district] + n), 0, 100);
}

export function completionParts() {
  return [
    { label: 'Story missions', done: G.missionsDone.length, total: 6, weight: 30 },
    { label: 'Street races won', done: G.racesWon, total: 3, weight: 10 },
    { label: 'Stunt jumps', done: G.jumpsDone, total: 5, weight: 8 },
    { label: 'Golden Anchors', done: G.anchorsFound, total: 12, weight: 10 },
    { label: 'Districts FRIENDLY', done: Object.values(G.rep).filter((s) => s >= 70).length, total: 4, weight: 10 },
    { label: 'Crew recruited', done: Object.values(G.crew).filter((c) => c.recruited).length, total: 3, weight: 8 },
    { label: 'Gold mission ratings', done: Object.values(G.ratings).filter((r) => r === 'S').length, total: 6, weight: 12 },
    { label: 'Export list', done: G.exportsDone, total: 5, weight: 12 },
  ];
}
export function completionPct() {
  let pct = 0;
  for (const p of completionParts()) pct += (Math.min(p.done, p.total) / p.total) * p.weight;
  return Math.min(100, pct);
}

export function rateMission(def, elapsed, damageTaken) {
  const t = elapsed / (def.parTime || 240);
  if (t <= 0.8 && damageTaken <= 30) return 'S';
  if (t <= 1.2 && damageTaken <= 70) return 'A';
  return 'B';
}
export function ratingColor(r) {
  if (r === 'S') return '#f1c40f';
  if (r === 'A') return '#2ecc71';
  return '#e67e22';
}

export function fmtPlaytime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? h + 'h ' + String(m).padStart(2, '0') + 'm' : m + 'm';
}

export function careerStats() {
  const s = G.stats;
  return [
    { label: 'CARS STOLEN', value: String(s.carsStolen) },
    { label: 'COPS ESCAPED', value: String(s.copsEscaped) },
    { label: 'HIGHEST WANTED', value: '★'.repeat(Math.max(1, s.highestWanted)) },
    { label: 'DISTANCE DRIVEN', value: (s.distanceDriven / 1000).toFixed(1) + ' km' },
    { label: 'PEOPLE TAKEN OUT', value: String(s.pedsDown + s.copsDown + s.gunmenDown) },
    { label: 'LONGEST JUMP', value: Math.round(s.longestJump) + ' m' },
    { label: 'CREW ABILITIES', value: String(s.crewAbilitiesUsed) },
    { label: 'HIDDEN BY LOCALS', value: String(s.hiddenByLocals) },
  ];
}
