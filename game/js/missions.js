// MERIDIAN HEAT — missions.js: the four story missions plus free roam.
// Missions start only when the player presses E at the marker — never on
// proximity. updateMission() returns 'done' when a mission completes so the
// caller can pay out and save; 'failed' when it is lost; null while running.

import { CFG, G, dist, fmtMoney, toast } from './config.js';
import { spawnGunman, spawnHealthPickup } from './combat.js';
import { addWanted, spawnParticles } from './entities.js';
import { sfx } from './audio.js';

export const MISSIONS = [
  {
    slug: 'first-delivery', num: 1, title: 'First Delivery', contact: 'Rico',
    payout: 500, timeLimit: 120,
    brief: 'Rico needs a package run across town. Three drops, one clock. Drive fast, don\'t stop for anyone.',
    lines: ['Rico: "Vex. First job. Three drops, two minutes."', 'Vex: "Two minutes? You\'re funny."', 'Rico: "Clock\'s already running, kid."'],
    spot: 'firstDelivery',
  },
  {
    slug: 'hot-wheels', num: 2, title: 'Hot Wheels', contact: 'Lena',
    payout: 900,
    brief: 'Lena spotted a gold Comet Sport parked uptown. Lift it, shake the heat, and bring it to the safehouse.',
    lines: ['Lena: "Gold Comet, uptown lot. Worth a fortune."', 'Vex: "And the cops?"', 'Lena: "That\'s the fun part. Lose them, then come home."'],
    spot: 'hotWheels',
  },
  {
    slug: 'dockside-pickup', num: 3, title: 'Dockside Pickup', contact: 'Rico',
    payout: 1500,
    brief: 'A case is waiting on the docks, but the crew guarding it doesn\'t want to let it go. Take it. Deliver it to Lena.',
    lines: ['Rico: "The case is on the pier. Four of Marlow\'s boys."', 'Vex: "Four? Bring a bigger boat."', 'Rico: "Just bring the case back, Vex."'],
    spot: 'dockside',
  },
  {
    slug: 'harbor-showdown', num: 4, title: 'Harbor Showdown', contact: 'The Captain',
    payout: 4000,
    brief: 'The Captain wants the harbour back. Three waves of Marlow\'s crew stand between you and the whole city. End it.',
    lines: ['Captain: "Tonight the harbour changes hands."', 'Vex: "Three waves, one Vex. Fair odds."', 'Captain: "Walk out of there and Port Meridian is yours."'],
    spot: 'showdown',
  },
];

export function nextMissionDef() {
  for (const m of MISSIONS) {
    if (!G.missionsDone.includes(m.slug)) return m;
  }
  return null;
}

export function missionAvailable(def) {
  if (!def || G.missionsDone.includes(def.slug)) return false;
  const idx = MISSIONS.indexOf(def);
  for (let i = 0; i < idx; i++) {
    if (!G.missionsDone.includes(MISSIONS[i].slug)) return false;
  }
  return true;
}

export function startMission(def) {
  const m = {
    def, stage: 0, timer: def.timeLimit || 0,
    checkpoints: [],
    cpIndex: 0,
    caseAt: null, delivered: false,
    wave: 0, waveSpawned: 0, waveTotal: 0,
    objective: '',
  };
  if (def.slug === 'first-delivery') {
    m.checkpoints = [
      { x: 2820, y: 720, name: 'Drop 1 — Downtown' },
      { x: 720, y: 1980, name: 'Drop 2 — Marina' },
      { x: 2820, y: 1980, name: 'Drop 3 — Harbor District' },
    ];
  }
  if (def.slug === 'dockside-pickup') {
    m.crewTotal = 4;
  }
  if (def.slug === 'harbor-showdown') {
    m.waves = [3, 4, 5];
  }
  G.mission = m;
  G.missionCard = {
    title: 'MISSION ' + def.num + ' — ' + def.title.toUpperCase(),
    contact: def.contact,
    lines: def.lines,
    payout: def.payout,
    t: 4,
  };
  sfx.missionStart();
  updateObjective(m);
  return m;
}

function updateObjective(m) {
  const w = G.world;
  switch (m.def.slug) {
    case 'first-delivery': {
      const cp = m.checkpoints[m.cpIndex];
      m.objective = cp ? 'Deliver: ' + cp.name + ' (' + (m.cpIndex + 1) + '/3)' : '';
      break;
    }
    case 'hot-wheels':
      m.objective = m.stage === 0 ? 'Steal the gold Comet Sport uptown'
        : m.stage === 1 ? 'Lose the heat, then reach the safehouse'
        : 'Reach the safehouse';
      break;
    case 'dockside-pickup':
      m.objective = m.stage === 0 ? 'Go to the docks'
        : m.stage === 1 ? 'Take out the crew (' + (m.crewTotal - aliveGunmen()) + '/' + m.crewTotal + ')'
        : m.stage === 2 ? 'Grab the case'
        : 'Deliver the case to Lena';
      break;
    case 'harbor-showdown':
      m.objective = m.stage === 0 ? 'Go to the harbour warehouse'
        : m.stage === 1 ? 'Wave ' + m.wave + '/3 — clear the crew'
        : 'Escape to the north gate';
      break;
    default: m.objective = '';
  }
}

function aliveGunmen() {
  return G.gunmen.filter((g) => !g.dead).length;
}

function completeMission(m) {
  G.money += m.def.payout;
  G.missionsDone.push(m.def.slug);
  spawnParticles(G.player.x, G.player.y, 30, ['#f1c40f', '#2ecc71', '#ffffff'], 260, 0.9, 5);
  sfx.cash();
  toast('Mission complete: ' + m.def.title + ' — +' + fmtMoney(m.def.payout));
  G.mission = null;
  if (m.def.slug === 'harbor-showdown') {
    G.storyDone = true;
    G.state = 'story';
  }
  return 'done';
}

function failMission(m, why) {
  G.mission = null;
  G.gunmen.length = 0;
  sfx.missionFail();
  toast('Mission failed: ' + why + ' — press E at the marker to retry.');
  return 'failed';
}

export function missionMarkerPos() {
  const w = G.world;
  if (G.mission) {
    const m = G.mission;
    switch (m.def.slug) {
      case 'first-delivery': {
        const cp = m.checkpoints[m.cpIndex];
        return cp ? { x: cp.x, y: cp.y } : null;
      }
      case 'hot-wheels':
        if (m.stage === 0) return { x: w.missionSpots.hotWheels.x, y: w.missionSpots.hotWheels.y };
        return { x: w.safehouse.x, y: w.safehouse.y };
      case 'dockside-pickup':
        if (m.stage === 0 || m.stage === 1) return { x: w.missionSpots.dockside.x, y: w.missionSpots.dockside.y };
        if (m.stage === 2) return m.caseAt;
        return { x: w.lenaDrop.x, y: w.lenaDrop.y };
      case 'harbor-showdown':
        if (m.stage === 0 || m.stage === 1) return { x: w.missionSpots.showdown.x, y: w.missionSpots.showdown.y };
        return { x: w.escapePoint.x, y: w.escapePoint.y };
      default: return null;
    }
  }
  const next = nextMissionDef();
  if (next && missionAvailable(next)) {
    const s = w.missionSpots[next.spot];
    return { x: s.x, y: s.y };
  }
  return null;
}

export function updateMission(dt) {
  const m = G.mission;
  if (!m) return null;
  const p = G.player;
  const w = G.world;
  updateObjective(m);

  if (m.def.timeLimit) {
    m.timer -= dt;
    if (m.timer <= 0) return failMission(m, 'out of time');
  }

  switch (m.def.slug) {
    case 'first-delivery': {
      const cp = m.checkpoints[m.cpIndex];
      if (cp && dist(p.x, p.y, cp.x, cp.y) < 90) {
        spawnParticles(cp.x, cp.y, 16, ['#2ecc71', '#ffffff'], 180, 0.6, 4);
        sfx.pickup();
        m.cpIndex++;
        if (m.cpIndex >= m.checkpoints.length) return completeMission(m);
        toast('Drop ' + m.cpIndex + '/3 done — next: ' + m.checkpoints[m.cpIndex].name);
      }
      break;
    }
    case 'hot-wheels': {
      if (m.stage === 0) {
        const gold = G.cars.find((c) => c.name === 'Comet Sport');
        if (!gold) return failMission(m, 'the Comet was destroyed');
        if (p.car && p.car.name === 'Comet Sport') {
          m.stage = 1;
          while (G.wanted < 2) addWanted(1);
          toast('The Comet is yours! Lose 2 stars, then reach the safehouse.');
        }
      } else if (m.stage === 1) {
        if (!p.car || p.car.name !== 'Comet Sport') {
          // Lost the car — back to stealing it.
          m.stage = 0;
          toast('You lost the Comet! Steal it again.');
        } else if (dist(p.x, p.y, w.safehouse.x, w.safehouse.y) < 130) {
          G.wanted = 0;
          return completeMission(m);
        }
      }
      break;
    }
    case 'dockside-pickup': {
      if (m.stage === 0) {
        if (dist(p.x, p.y, w.missionSpots.dockside.x, w.missionSpots.dockside.y) < 120) {
          m.stage = 1;
          const base = w.missionSpots.dockside;
          const spots = [[-90, -40], [60, -70], [-40, 60], [110, 30]];
          for (let i = 0; i < 4; i++) {
            spawnGunman(base.x + spots[i][0], base.y + spots[i][1], { hp: 80 });
          }
          toast('Four crew guarding the case. Take them out!');
        }
      } else if (m.stage === 1) {
        if (aliveGunmen() === 0) {
          m.stage = 2;
          m.caseAt = { x: w.missionSpots.dockside.x, y: w.missionSpots.dockside.y + 40 };
          spawnHealthPickup(w.missionSpots.dockside.x - 60, w.missionSpots.dockside.y);
          toast('Crew down. Grab the case!');
        }
      } else if (m.stage === 2) {
        if (m.caseAt && dist(p.x, p.y, m.caseAt.x, m.caseAt.y) < 60) {
          m.stage = 3;
          m.caseAt = null;
          sfx.pickup();
          toast('Case secured. Deliver it to Lena.');
        }
      } else if (m.stage === 3) {
        if (dist(p.x, p.y, w.lenaDrop.x, w.lenaDrop.y) < 120) return completeMission(m);
      }
      break;
    }
    case 'harbor-showdown': {
      if (m.stage === 0) {
        if (dist(p.x, p.y, w.missionSpots.showdown.x, w.missionSpots.showdown.y) < 140) {
          m.stage = 1;
          m.wave = 1;
          spawnWave(m, 3);
          toast('Wave 1 of 3 — they\'re coming!');
        }
      } else if (m.stage === 1) {
        if (aliveGunmen() === 0) {
          if (m.wave < 3) {
            m.wave++;
            spawnWave(m, m.waves[m.wave - 1]);
            spawnHealthPickup(p.x + 60, p.y - 40);
            toast('Wave ' + m.wave + ' of 3!');
          } else {
            m.stage = 2;
            toast('Harbour is yours. Escape to the north gate!');
          }
        }
      } else if (m.stage === 2) {
        if (dist(p.x, p.y, w.escapePoint.x, w.escapePoint.y) < 130) return completeMission(m);
      }
      break;
    }
    default: break;
  }
  return null;
}

function spawnWave(m, count) {
  const base = G.world.missionSpots.showdown;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const r = 160 + Math.random() * 120;
    spawnGunman(base.x + Math.cos(a) * r, base.y + Math.sin(a) * r, { hp: 80 + (m.wave - 1) * 20, wave: m.wave });
  }
}
