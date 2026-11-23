import { CFG, G, toast } from './config.js';
import { rankFor } from './progression.js';

export const CREW_DEFS = {
  rico: { name: 'Rico', role: 'Driver', key: 'Z', ability: 'SWAP PLATES', desc: 'Drops one wanted star. The plates are clean — for now.' },
  lena: { name: 'Lena', role: 'Mechanic', key: 'X', ability: 'QUICK FIX', desc: 'Fully repairs your car, or patches you up on foot.' },
  captain: { name: 'The Captain', role: 'Lookout', key: 'C', ability: 'EYES OUT', desc: 'Marks every cop and gunman on the minimap for 12s.' },
};

export function crewCooldown(who) {
  const base = CFG.CREW_CD[who];
  return rankFor(G.rp) >= 3 ? base * 0.75 : base;
}

export function useCrewAbility(who) {
  const c = G.crew[who];
  const def = CREW_DEFS[who];
  if (!c || !c.recruited) { toast(def.name + ' is not in your crew yet.', 2); return; }
  if (c.cd > 0) { toast(def.ability + ' not ready — ' + Math.ceil(c.cd) + 's to go.', 2); return; }
  const p = G.player;
  if (who === 'rico') {
    if (G.wanted === 0) { toast('No heat to lose right now.', 2); return; }
    G.wanted = Math.max(0, G.wanted - 1);
    G.lastCrime = G.time - CFG.QUIET_SPELL;
    toast('Rico swapped the plates — heat drops a star.', 3);
  } else if (who === 'lena') {
    if (p && p.car) {
      p.car.hp = p.car.maxHp || 100;
      toast('Lena patched the car up — good as new.', 3);
    } else {
      G.health = Math.min(G.maxHealth, G.health + 40);
      toast('Lena patched you up. +40 health.', 3);
    }
  } else if (who === 'captain') {
    G.eyesOutTimer = 12;
    toast('The Captain has eyes out — every unit marked for 12s.', 3);
  }
  c.cd = crewCooldown(who);
  c.uses++;
  G.stats.crewAbilitiesUsed++;
}

export function updateCrew(dt) {
  for (const key of Object.keys(G.crew)) {
    const c = G.crew[key];
    if (c.cd > 0) c.cd = Math.max(0, c.cd - dt);
  }
  if (G.eyesOutTimer > 0) G.eyesOutTimer = Math.max(0, G.eyesOutTimer - dt);
}
