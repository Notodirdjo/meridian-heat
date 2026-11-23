import { CFG, G, clamp, dist, fmtMoney, toast, wx, wz } from './config.js';
import { spawnGunman, clearGunmen, addWanted } from './combat.js';
import { makeCar, removeCar, CAR_MODELS } from './vehicles.js';
import { spawnParticles, makeBeacon, districtAt, nearestRoadPoint } from './world.js';
import { sfx } from './radio.js';
import { awardRp, addRep, rateMission, RANKS } from './progression.js';
import { spawnPickup } from './depth.js';

export const MISSIONS = [
  {
    slug: 'first-delivery', num: 1, title: 'First Delivery', contact: 'Rico',
    payout: 500, timeLimit: 120, parTime: 90, rp: 200, repDistrict: 'HARBOR DISTRICT',
    brief: "Rico needs a package run across town. Three drops, one clock. Drive fast, don't stop for anyone.",
    lines: ['Rico: "Vex. First job. Three drops, two minutes."', 'Vex: "Two minutes? You\'re funny."', 'Rico: "Clock\'s already running, kid."'],
    stages: ['THE PICKUP', 'DROP 2 — MARINA', 'DROP 3 — HARBOR'],
    dialogue: {
      0: ['Rico', "Drop one, Downtown. Don't keep them waiting."],
      1: ['Rico', "One down — Marina next. Clock's ticking."],
      2: ['Rico', 'Last drop, Harbor. Bring it home, Vex.'],
    },
    spot: 'firstDelivery',
  },
  {
    slug: 'hot-wheels', num: 2, title: 'Hot Wheels', contact: 'Lena',
    payout: 900, parTime: 150, rp: 250, repDistrict: 'MARINA DISTRICT',
    brief: 'Lena spotted a gold Comet Sport parked uptown. Lift it, shake the heat, and bring it to the safehouse.',
    lines: ['Lena: "Gold Comet, uptown lot. Worth a fortune."', 'Vex: "And the cops?"', 'Lena: "That\'s the fun part. Lose them, then come home."'],
    stages: ['LIFT THE COMET', 'BRING IT HOME'],
    dialogue: {
      0: ['Lena', "The Comet's in the uptown lot. Gold. Can't miss it."],
      1: ['Lena', 'You got it! Now bring her home — and try not to scratch the paint.'],
    },
    spot: 'hotWheels',
  },
  {
    slug: 'dockside-pickup', num: 3, title: 'Dockside Pickup', contact: 'Rico',
    payout: 1500, parTime: 240, rp: 300, repDistrict: 'MARINA DISTRICT',
    brief: "A case is waiting on the docks, but the crew guarding it doesn't want to let it go. Take it. Deliver it to Lena.",
    lines: ['Rico: "The case is on the pier. Four of Marlow\'s boys."', 'Vex: "Four? Bring a bigger boat."', 'Rico: "Just bring the case back, Vex."'],
    stages: ['REACH THE DOCKS', 'CLEAR THE CREW', 'GRAB THE CASE', 'DELIVER TO LENA'],
    dialogue: {
      0: ['Rico', "Four of Marlow's boys on the pier. Make it quick."],
      1: ['Rico', "They know you're here now. No going back."],
      2: ['Rico', "Crew's down. Grab the case and move."],
      3: ['Rico', "Case is yours. Lena's waiting uptown."],
    },
    spot: 'dockside',
  },
  {
    slug: 'harbor-showdown', num: 4, title: 'Harbor Showdown', contact: 'The Captain',
    payout: 4000, parTime: 300, rp: 400, repDistrict: 'HARBOR DISTRICT',
    brief: "The Captain wants the harbour back. Three waves of Marlow's crew stand between you and the whole city. End it.",
    lines: ['Captain: "Tonight the harbour changes hands."', 'Vex: "Three waves, one Vex. Fair odds."', 'Captain: "Walk out of there and Port Meridian is yours."'],
    stages: ['REACH THE WAREHOUSE', 'HOLD THE HARBOUR', 'ESCAPE NORTH'],
    dialogue: {
      0: ['Captain', 'The harbour changes hands tonight.'],
      1: ['Captain', "Here they come. Hold the line, Vex."],
      2: ['Captain', "It's yours. Get out of there — clean."],
    },
    spot: 'showdown',
  },
  {
    slug: 'meridian-gp', num: 5, title: 'Meridian GP', contact: 'Lena',
    payout: 2000, timeLimit: 170, parTime: 150, rp: 350, repDistrict: 'OLD TOWN',
    brief: 'Lena entered you in the Meridian GP — six gates across the whole city, one clock, no brakes. Win it and every racer in Port Meridian knows your name.',
    lines: ['Lena: "Meridian GP. Six gates, one clock."', 'Vex: "Racing? I thought we were criminals."', 'Lena: "Same thing, faster. Go win it."'],
    stages: ['TO THE START LINE', 'RACE THE CITY', 'FINAL STRETCH'],
    dialogue: {
      0: ['Lena', "Start line's at the Old Town gate. Get there."],
      1: ['Lena', 'Six gates, one clock. Show them what that car can do.'],
      2: ['Lena', "Halfway! You're flying — keep it clean."],
    },
    spot: 'grandPrix',
  },
  {
    slug: 'the-last-drop', num: 6, title: 'The Last Drop', contact: 'The Captain',
    payout: 5000, parTime: 300, rp: 500, repDistrict: 'HARBOR DISTRICT',
    brief: "Marlow's last hauler is loading at the compound. Breach it, wreck the hauler, and vanish. After tonight, Port Meridian answers to you.",
    lines: ['Captain: "One hauler left. Wreck it and Marlow is finished."', 'Vex: "And if the whole crew is there?"', 'Captain: "Then it\'s a short war."'],
    stages: ['BREACH THE COMPOUND', 'WRECK THE HAULER', 'VANISH'],
    dialogue: {
      0: ['Captain', 'Marlow\'s hauler is the last thing between you and this city.'],
      1: ['Captain', "The hauler's armoured. Hit it till it burns."],
      2: ['Captain', "Hauler's down. The docks are yours. Vanish."],
    },
    spot: 'lastDrop',
  },
];

export function nextMissionDef() {
  for (const m of MISSIONS) if (!G.missionsDone.includes(m.slug)) return m;
  return null;
}

export function missionAvailable(def) {
  if (!def || G.missionsDone.includes(def.slug)) return false;
  const idx = MISSIONS.indexOf(def);
  for (let i = 0; i < idx; i++) if (!G.missionsDone.includes(MISSIONS[i].slug)) return false;
  return true;
}

export function showDialogue(name, line, seconds = 5) {
  G.dialogue = { name, line, t: seconds };
}

function stageDialogue(m, stage) {
  const d = m.def.dialogue && m.def.dialogue[stage];
  if (d) showDialogue(d[0], d[1]);
}

function setStage(m, stage) {
  if (m.stage === stage) return;
  m.stage = stage;
  stageDialogue(m, stage);
  updateObjective(m);
}

export function startMission(def) {
  const m = {
    def, stage: 0, timer: def.timeLimit || 0,
    checkpoints: [], cpIndex: 0, caseAt: null,
    wave: 0, waves: [], hauler: null, objective: '',
  };
  if (def.slug === 'first-delivery') {
    m.checkpoints = [
      { x: 2820, y: 720, name: 'Drop 1 — Downtown' },
      { x: 720, y: 1980, name: 'Drop 2 — Marina' },
      { x: 2820, y: 1980, name: 'Drop 3 — Harbor District' },
    ];
  }
  if (def.slug === 'hot-wheels') {
    if (!G.cars.find((c) => c.name === 'Comet Sport')) {
      const s = G.world.missionSpots.hotWheels;
      const model = CAR_MODELS.find((c) => c.name === 'Comet Sport');
      makeCar(s.x, s.y, Math.PI / 2, 'parked', null, { name: 'Comet Sport', model });
    }
  }
  if (def.slug === 'dockside-pickup') m.crewTotal = 4;
  if (def.slug === 'harbor-showdown') m.waves = [3, 4, 5];
  if (def.slug === 'meridian-gp') {
    m.checkpoints = [
      { x: 1560, y: 300, name: 'Gate 1 — North Road' },
      { x: 2820, y: 720, name: 'Gate 2 — Downtown' },
      { x: 2820, y: 1980, name: 'Gate 3 — Harbor' },
      { x: 1560, y: 2400, name: 'Gate 4 — The Docks' },
      { x: 720, y: 1560, name: 'Gate 5 — Marina' },
      { x: 300, y: 300, name: 'Gate 6 — Old Town' },
    ];
  }
  G.mission = m;
  G.missionDamage = 0;
  G.missionStartTime = G.time;
  G.missionCard = {
    title: 'MISSION ' + def.num + ' — ' + def.title.toUpperCase(),
    contact: def.contact, lines: def.lines, payout: def.payout, t: 4,
  };
  sfx.missionStart();
  stageDialogue(m, 0);
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
      m.objective = m.stage === 0 ? 'Steal the gold Comet Sport uptown' : 'Reach the safehouse';
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
    case 'meridian-gp': {
      if (m.stage === 0) m.objective = 'Reach the start line at the Old Town gate';
      else {
        const cp = m.checkpoints[m.cpIndex];
        m.objective = cp ? 'Race: ' + cp.name + ' (' + (m.cpIndex + 1) + '/6)' : '';
      }
      break;
    }
    case 'the-last-drop':
      m.objective = m.stage === 0 ? 'Breach the Marlow compound'
        : m.stage === 1 ? (m.hauler ? 'Wreck the armored hauler (' + Math.max(0, Math.round(m.hauler.hp)) + ' HP)' : 'Wreck the armored hauler')
        : 'Escape to the north gate';
      break;
    default: m.objective = '';
  }
}

export function aliveGunmen() {
  return G.gunmen.filter((g) => !g.dead).length;
}

function completeMission(m) {
  const elapsed = G.time - G.missionStartTime;
  const rating = rateMission(m.def, elapsed, G.missionDamage);
  G.ratings[m.def.slug] = rating;
  G.money += m.def.payout;
  G.missionsDone.push(m.def.slug);
  addRep(m.def.repDistrict, 8);
  const rankUp = awardRp(m.def.rp, m.def.title);
  const recruit = { 'first-delivery': 'rico', 'hot-wheels': 'lena', 'dockside-pickup': 'captain' }[m.def.slug];
  if (recruit && !G.crew[recruit].recruited) {
    G.crew[recruit].recruited = true;
    const names = { rico: 'Rico', lena: 'Lena', captain: 'The Captain' };
    const abilities = { rico: 'SWAP PLATES (Z)', lena: 'QUICK FIX (X)', captain: 'EYES OUT (C)' };
    toast(names[recruit] + ' joined your crew! Ability: ' + abilities[recruit], 5);
    sfx.cash();
  }
  spawnParticles(G.player.x, G.player.y, 30, ['#f1c40f', '#2ecc71', '#ffffff'], 260, 0.9, 5);
  sfx.cash();
  toast('Mission complete: ' + m.def.title + ' — +' + fmtMoney(m.def.payout) + '  •  Rating ' + rating + '  •  +' + m.def.rp + ' RP', 5);
  if (rankUp >= 0) toast('RANK UP — you are now ' + RANKS[rankUp].name + '! ' + (RANKS[rankUp].unlock || ''), 5);
  G.mission = null;
  if (m.def.slug === 'the-last-drop') {
    G.storyDone = true;
    G.state = 'story';
  }
  return 'done';
}

function failMission(m, why) {
  clearGunmen();
  if (m.hauler) {
    removeCar(m.hauler);
    m.hauler = null;
  }
  G.mission = null;
  sfx.missionFail();
  toast('Mission failed: ' + why + ' — press E at the marker to retry.', 5);
  return 'failed';
}

export function missionMarkerPos() {
  const w = G.world;
  if (G.race) {
    const cp = G.race.def.checkpoints[G.race.cpIndex];
    return cp ? { x: cp.x, y: cp.y } : null;
  }
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
      case 'meridian-gp':
        if (m.stage === 0) return { x: w.missionSpots.grandPrix.x, y: w.missionSpots.grandPrix.y };
        {
          const cp = m.checkpoints[m.cpIndex];
          return cp ? { x: cp.x, y: cp.y } : null;
        }
      case 'the-last-drop':
        if (m.stage === 0 || m.stage === 1) return { x: w.missionSpots.lastDrop.x, y: w.missionSpots.lastDrop.y };
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

let beacon = null;
export function updateBeacon(dt) {
  const pos = missionMarkerPos();
  if (!pos) {
    if (beacon) beacon.visible = false;
    return;
  }
  if (!beacon) {
    beacon = makeBeacon(0xf5c542);
    G.scene.add(beacon);
  }
  beacon.visible = true;
  beacon.position.set(wx(pos.x), 0, wz(pos.y));
  beacon.rotation.y += dt * 0.8;
  const s = 1 + Math.sin(G.time * 3) * 0.08;
  beacon.scale.set(s, 1, s);
}

function spawnWave(m, count) {
  const base = G.world.missionSpots.showdown;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
    const r = 160 + Math.random() * 120;
    spawnGunman(
      clamp(base.x + Math.cos(a) * r, 60, CFG.WORLD_W - 60),
      clamp(base.y + Math.sin(a) * r, 60, 2540),
      { hp: 80 + (m.wave - 1) * 20, wave: m.wave }
    );
  }
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
      while (m.cpIndex < m.checkpoints.length) {
        const cp = m.checkpoints[m.cpIndex];
        if (dist(p.x, p.y, cp.x, cp.y) >= 90) break;
        spawnParticles(cp.x, cp.y, 16, ['#2ecc71', '#ffffff'], 180, 0.6, 4);
        sfx.pickup();
        m.cpIndex++;
        if (m.cpIndex >= m.checkpoints.length) return completeMission(m);
        setStage(m, m.cpIndex);
        toast('Drop ' + m.cpIndex + '/3 done — next: ' + m.checkpoints[m.cpIndex].name);
      }
      break;
    }
    case 'hot-wheels': {
      if (m.stage === 0) {
        const gold = G.cars.find((c) => c.name === 'Comet Sport');
        if (!gold) return failMission(m, 'the Comet was destroyed');
        if (p.car && p.car.name === 'Comet Sport') {
          setStage(m, 1);
          while (G.wanted < 2) addWanted(1);
          toast('The Comet is yours! Lose 2 stars, then reach the safehouse.');
        }
      } else if (m.stage === 1) {
        if (!p.car || p.car.name !== 'Comet Sport') {
          setStage(m, 0);
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
          setStage(m, 1);
          const base = w.missionSpots.dockside;
          const spots = [[-90, -40], [60, -70], [-40, 60], [110, 30]];
          for (let i = 0; i < 4; i++) spawnGunman(base.x + spots[i][0], base.y + spots[i][1], { hp: 80 });
          toast('Four crew guarding the case. Take them out!');
        }
      } else if (m.stage === 1) {
        if (aliveGunmen() === 0) {
          setStage(m, 2);
          m.caseAt = { x: w.missionSpots.dockside.x, y: w.missionSpots.dockside.y + 40 };
          spawnPickup(w.missionSpots.dockside.x - 60, w.missionSpots.dockside.y, 'health', 0);
          toast('Crew down. Grab the case!');
        }
      } else if (m.stage === 2) {
        if (m.caseAt && dist(p.x, p.y, m.caseAt.x, m.caseAt.y) < 60) {
          setStage(m, 3);
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
          setStage(m, 1);
          m.wave = 1;
          spawnWave(m, 3);
          toast('Wave 1 of 3 — they\'re coming!');
        }
      } else if (m.stage === 1) {
        if (aliveGunmen() === 0) {
          if (m.wave < 3) {
            m.wave++;
            spawnWave(m, m.waves[m.wave - 1]);
            spawnPickup(p.x + 60, p.y - 40, 'health', 0);
            toast('Wave ' + m.wave + ' of 3!');
          } else {
            setStage(m, 2);
            toast('Harbour is yours. Escape to the north gate!');
          }
        }
      } else if (m.stage === 2) {
        if (dist(p.x, p.y, w.escapePoint.x, w.escapePoint.y) < 130) return completeMission(m);
      }
      break;
    }
    case 'meridian-gp': {
      if (m.stage === 0) {
        if (dist(p.x, p.y, w.missionSpots.grandPrix.x, w.missionSpots.grandPrix.y) < 110) {
          setStage(m, 1);
          toast('Green light! Six gates — go!');
        }
      } else {
        while (m.cpIndex < m.checkpoints.length) {
          const cp = m.checkpoints[m.cpIndex];
          if (dist(p.x, p.y, cp.x, cp.y) >= 100) break;
          spawnParticles(cp.x, cp.y, 16, ['#f1c40f', '#ffffff'], 180, 0.6, 4);
          sfx.pickup();
          m.cpIndex++;
          if (m.cpIndex >= m.checkpoints.length) return completeMission(m);
          if (m.cpIndex === 3) setStage(m, 2);
          toast('Gate ' + m.cpIndex + '/6 — next: ' + m.checkpoints[m.cpIndex].name);
        }
      }
      break;
    }
    case 'the-last-drop': {
      if (m.stage === 0) {
        if (dist(p.x, p.y, w.missionSpots.lastDrop.x, w.missionSpots.lastDrop.y) < 150) {
          setStage(m, 1);
          const base = w.missionSpots.lastDrop;
          const spots = [[-80, -50], [70, -60], [-30, 70], [100, 40]];
          for (let i = 0; i < 4; i++) spawnGunman(base.x + spots[i][0], base.y + spots[i][1], { hp: 90 });
          m.hauler = makeCar(base.x + 40, base.y + 110, 0, 'hauler', 0x2c3e50, { name: 'Marlow Hauler', hp: 300, driver: null });
          m.hauler.w = 54;
          toast('The hauler is armoured — hit it till it burns!');
        }
      } else if (m.stage === 1) {
        if (!m.hauler || !G.cars.includes(m.hauler)) {
          setStage(m, 2);
          toast('Hauler destroyed! Vanish — north gate, now.');
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

export function nearestRaceStart(maxD = 110) {
  if (G.mission || G.race) return null;
  const p = G.player;
  let best = null, bd = maxD;
  for (const r of G.world.races) {
    const d = dist(p.x, p.y, r.start.x, r.start.y);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

export function startRace(def) {
  const p = G.player;
  if (!p.car) {
    toast('You need a car to race. Steal one first!');
    return null;
  }
  G.race = { def, cpIndex: 0, timer: 0 };
  sfx.missionStart();
  toast(def.name + ' — ' + def.checkpoints.length + ' checkpoints, par ' + def.par + 's. Go!');
  return G.race;
}

export function updateRace(dt) {
  const r = G.race;
  if (!r) return null;
  const p = G.player;
  r.timer += dt;
  while (r.cpIndex < r.def.checkpoints.length) {
    const cp = r.def.checkpoints[r.cpIndex];
    if (dist(p.x, p.y, cp.x, cp.y) >= 100) break;
    spawnParticles(cp.x, cp.y, 16, ['#f1c40f', '#ffffff'], 180, 0.6, 4);
    sfx.pickup();
    r.cpIndex++;
    if (r.cpIndex >= r.def.checkpoints.length) {
      const won = r.timer <= r.def.par;
      const name = r.def.name;
      G.race = null;
      if (won) {
        G.money += r.def.payout;
        if (!G.racesDone.includes(r.def.slug)) {
          G.racesDone.push(r.def.slug);
          G.racesWon++;
        }
        const rankUp = awardRp(150, name);
        sfx.cash();
        toast(name + ' WON in ' + Math.round(r.timer) + 's! +' + fmtMoney(r.def.payout) + '  •  +150 RP', 5);
        if (rankUp >= 0) toast('RANK UP — ' + RANKS[rankUp].name + '!', 4);
        addRep(districtAt(p.x, p.y), 3);
        return 'won';
      }
      toast(name + ' finished in ' + Math.round(r.timer) + 's — par is ' + r.def.par + 's. Try again!');
      return 'lost';
    }
    toast('Checkpoint ' + r.cpIndex + '/' + r.def.checkpoints.length);
  }
  return null;
}

export const EXPORT_CARS = ['Rukan Pelo GT', 'Meridian Comet', 'Koral Sunburst', 'Terrace GT', 'Night Owl'];

export function pickExportTarget(preferredName) {
  const remaining = EXPORT_CARS.filter((n) => !G.exportsDelivered.includes(n));
  if (remaining.length === 0) { G.exportTarget = null; return null; }
  const name = (preferredName && remaining.includes(preferredName)) ? preferredName : remaining[0];
  G.exportTarget = { name };
  const np = nearestRoadPoint(300 + Math.random() * 3000, 300 + Math.random() * 2000);
  const along = np.axis === 'v';
  const off = (Math.random() > 0.5 ? 1 : -1) * (CFG.ROAD_W / 2 - 16);
  const x = along ? np.x + off : np.x + (Math.random() - 0.5) * 200;
  const y = along ? np.y + (Math.random() - 0.5) * 200 : np.y + off;
  makeCar(x, y, along ? Math.PI / 2 : 0, 'parked', null, { name, driver: null });
  return G.exportTarget;
}

export function updateExports() {
  const p = G.player;
  if (!p || !p.car || !G.exportTarget) return;
  if (p.car.name !== G.exportTarget.name) return;
  const dock = G.world.exportDock;
  if (dist(p.x, p.y, dock.x, dock.y) < 130) {
    const name = G.exportTarget.name;
    const car = p.car;
    p.car = null;
    removeCar(car);
    p.x = dock.x - 60; p.y = dock.y - 40;
    p.rig.group.visible = true;
    p.rig.group.position.set(wx(p.x), 0, wz(p.y));
    G.exportsDelivered.push(name);
    G.exportsDone++;
    G.money += 800;
    const rankUp = awardRp(100, 'Export: ' + name);
    sfx.cash();
    spawnParticles(p.x, p.y, 24, ['#2ecc71', '#f1c40f'], 200, 0.8, 4);
    toast('Exported the ' + name + '! +$800  •  +100 RP  •  ' + G.exportsDone + '/' + CFG.EXPORT_TOTAL + ' on the list', 5);
    if (rankUp >= 0) toast('RANK UP — ' + RANKS[rankUp].name + '!', 4);
    pickExportTarget();
    if (G.exportTarget) toast('Next on the list: a ' + G.exportTarget.name, 4);
  }
}
