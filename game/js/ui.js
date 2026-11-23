import * as THREE from '../vendor/three.module.min.js';
import { CFG, G, clamp, dist, fmtMoney, fmtTime, fmtClock, toast, wx, wz } from './config.js';
import { districtAt } from './world.js';
import { nearestCar } from './vehicles.js';
import { STATIONS } from './radio.js';
import { slotInfo } from './save.js';
import { RANKS, rankFor, nextRankRp, repStatus, repColor, completionParts, completionPct, ratingColor, careerStats, fmtPlaytime } from './progression.js';
import { CREW_DEFS } from './crew.js';
import { MISSIONS, nextMissionDef, missionAvailable, missionMarkerPos } from './missions.js';
import { policeUnits, policeChatter } from './police.js';
import { ammoFor } from './combat.js';

const $ = (id) => document.getElementById(id);
// The shell styles some overlays with display:flex, which overrides the
// hidden attribute — so set both the attribute and the inline display.
const show = (id, on) => { const e = $(id); if (e) { e.hidden = !on; e.style.display = on ? '' : 'none'; } };
const txt = (id, s) => { const e = $(id); if (e && e.textContent !== s) e.textContent = s; };

let lastCrewHtml = '', lastTab = null, pauseWasOpen = false;
const projV = new THREE.Vector3();

function drawMap(ctx, w, h, big) {
  const sx = w / CFG.WORLD_W, sy = h / CFG.WORLD_H;
  const X = (x) => x * sx, Y = (y) => y * sy;
  const wd = G.world;
  ctx.fillStyle = '#1a2433';
  ctx.fillRect(0, 0, w, h);
  if (big) {
    for (const d of wd.districts) {
      ctx.fillStyle = d.c;
      ctx.fillRect(X(d.x), Y(d.y), d.w * sx, d.h * sy);
    }
  }
  ctx.fillStyle = '#14707f';
  ctx.fillRect(0, Y(2560), w, h - Y(2560));
  ctx.fillStyle = '#2f7a3d';
  ctx.fillRect(X(wd.park.x), Y(wd.park.y), wd.park.w * sx, wd.park.h * sy);
  if (big) {
    ctx.fillStyle = '#232d3d';
    for (const b of wd.buildings) ctx.fillRect(X(b.x), Y(b.y), Math.max(2, b.w * sx), Math.max(2, b.h * sy));
  }
  ctx.strokeStyle = '#5a6675';
  ctx.lineWidth = Math.max(1, 100 * sx * 0.8);
  for (const rx of wd.roadsV) { ctx.beginPath(); ctx.moveTo(X(rx), 0); ctx.lineTo(X(rx), Y(2560)); ctx.stroke(); }
  for (const ry of wd.roadsH) { ctx.beginPath(); ctx.moveTo(0, Y(ry)); ctx.lineTo(w, Y(ry)); ctx.stroke(); }
  const p = G.player;
  if (big) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'center';
    for (const d of wd.districts) {
      const rep = G.rep[d.name] ?? 50;
      ctx.fillText(d.name + ' · ' + repStatus(rep) + ' ' + rep, X(d.x + d.w / 2), Y(d.y + d.h / 2));
    }
  }
  const marker = missionMarkerPos();
  const target = marker || G.waypoint;
  if (p && target) {
    ctx.strokeStyle = marker ? '#f5c542' : '#9b59b6';
    ctx.lineWidth = big ? 2.5 : 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(X(p.x), Y(p.y));
    ctx.lineTo(X(target.x), Y(target.y));
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (G.waypoint) {
    ctx.fillStyle = '#e74c3c';
    ctx.beginPath();
    ctx.arc(X(G.waypoint.x), Y(G.waypoint.y), big ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (marker) {
    ctx.fillStyle = '#f5c542';
    const mx = X(marker.x), my = Y(marker.y), r = big ? 7 : 4;
    ctx.beginPath();
    ctx.moveTo(mx, my - r); ctx.lineTo(mx + r, my); ctx.lineTo(mx, my + r); ctx.lineTo(mx - r, my);
    ctx.closePath();
    ctx.fill();
  }
  if (big) {
    for (const r of wd.races) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px Arial';
      ctx.fillText('R', X(r.start.x), Y(r.start.y));
    }
    ctx.fillStyle = '#2ecc71';
    ctx.font = 'bold 13px Arial';
    ctx.fillText('H', X(wd.safehouse.x), Y(wd.safehouse.y));
    ctx.fillText('E', X(wd.exportDock.x), Y(wd.exportDock.y));
  }
  for (const a of G.anchors) {
    if (a.found) continue;
    if (!big && p && dist(p.x, p.y, a.x, a.y) > 600) continue;
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath();
    ctx.arc(X(a.x), Y(a.y), big ? 3.5 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of G.cars) {
    if (c.kind !== 'police') continue;
    ctx.fillStyle = '#3498db';
    ctx.beginPath();
    ctx.arc(X(c.x), Y(c.y), big ? 4 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const cop of G.cops) {
    ctx.fillStyle = '#5dade2';
    ctx.fillRect(X(cop.x) - 2, Y(cop.y) - 2, 4, 4);
  }
  if (G.eyesOutTimer > 0) {
    for (const g of G.gunmen) {
      if (g.dead) continue;
      ctx.fillStyle = '#e74c3c';
      ctx.beginPath();
      ctx.arc(X(g.x), Y(g.y), big ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (G.heli) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + (big ? 13 : 10) + 'px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('H', X(G.heli.x), Y(G.heli.y));
  }
  if (p) {
    ctx.save();
    ctx.translate(X(p.x), Y(p.y));
    ctx.rotate(p.angle + Math.PI / 2);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(0, big ? -8 : -6);
    ctx.lineTo(big ? 5 : 4, big ? 6 : 5);
    ctx.lineTo(0, big ? 3 : 2);
    ctx.lineTo(big ? -5 : -4, big ? 6 : 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawMinimap() {
  const c = $('minimap');
  if (!c) return;
  drawMap(c.getContext('2d'), c.width, c.height, false);
}

function updateObjectiveArrow() {
  const el = $('objective-arrow');
  if (!el) return;
  const target = missionMarkerPos() || G.waypoint;
  const p = G.player;
  if (!target || !p || G.state !== 'playing' || !G.cam3) { el.hidden = true; return; }
  projV.set(wx(target.x), 2, wz(target.y)).project(G.cam3);
  let nx = projV.x, ny = projV.y;
  if (projV.z < 1 && Math.abs(nx) < 0.9 && Math.abs(ny) < 0.85) { el.hidden = true; return; }
  if (projV.z > 1) { nx = -nx; ny = -ny; }
  const len = Math.hypot(nx, ny) || 1;
  const dx = nx / len, dy = -ny / len;
  const r = Math.min(G.vw, G.vh) * 0.32;
  el.hidden = false;
  el.style.left = (G.vw / 2 + dx * r - 13) + 'px';
  el.style.top = (G.vh / 2 + dy * r - 13) + 'px';
  el.style.transform = 'rotate(' + (Math.atan2(dx, -dy) * 180 / Math.PI) + 'deg)';
  el.title = Math.round(dist(p.x, p.y, target.x, target.y) / 4) + ' m';
}

function updateHints() {
  const p = G.player;
  if (!p) return;
  let hint = 'Mouse aim · Click shoot · F punch · R reload · 1/2/3 weapons · Z/X/C crew · P pause';
  const next = nextMissionDef();
  if (!G.mission && next && missionAvailable(next)) {
    const s = G.world.missionSpots[next.spot];
    if (dist(p.x, p.y, s.x, s.y) < 130) hint = 'E — start mission: ' + next.title + ' (' + next.contact + ')';
  }
  if (G.race) hint = 'Race: ' + G.race.def.name + ' — hit every checkpoint before par ' + G.race.def.par + 's';
  else if (p.car) {
    hint = 'WASD drive · SPACE handbrake · E exit car · M missions · P pause';
  } else if (nearestCar(p.x, p.y, 90)) {
    hint = 'E — enter car · M missions · P pause';
  }
  txt('hint-bar', hint);
}

export function updateHUD(dt) {
  const p = G.player;
  if (G.dialogue) {
    G.dialogue.t -= dt;
    if (G.dialogue.t <= 0) G.dialogue = null;
  }
  if (G.toast) {
    G.toast.t -= dt;
    if (G.toast.t <= 0) G.toast = null;
  }
  if (G.missionCard) {
    G.missionCard.t -= dt;
    if (G.missionCard.t <= 0) G.missionCard = null;
  }
  if (!p) return;
  const hp = $('health-fill');
  if (hp) hp.style.width = clamp(G.health / G.maxHealth * 100, 0, 100) + '%';
  txt('health-num', String(Math.round(G.health)));
  const af = $('armour-fill');
  if (af) af.style.width = clamp(G.armour / G.maxArmour * 100, 0, 100) + '%';
  txt('armour-num', String(Math.round(G.armour)));
  const d = districtAt(p.x, p.y);
  const rep = G.rep[d] ?? 50;
  txt('district-line', d + ' · ' + rep + ' ' + repStatus(rep));
  const dl = $('district-line');
  if (dl) dl.style.color = repColor(rep);
  const ri = rankFor(G.rp);
  txt('rank-name', 'RANK ' + (ri + 1) + ' · ' + RANKS[ri].name);
  const next = nextRankRp();
  const rf = $('rp-fill');
  if (rf) rf.style.width = next === null ? '100%' : clamp((G.rp - RANKS[ri].rp) / (next - RANKS[ri].rp) * 100, 0, 100) + '%';
  txt('rp-num', next === null ? G.rp + ' RP · MAX' : G.rp + ' / ' + next + ' RP');
  txt('clock', fmtClock(G.dayTime));
  txt('money', fmtMoney(G.money));
  txt('stars', '★'.repeat(G.wanted) + '☆'.repeat(5 - G.wanted));
  const units = policeUnits();
  show('kpd-panel', G.wanted > 0);
  if (G.wanted > 0) {
    txt('kpd-title', 'KPD RESPONSE · ' + units.length + ' UNIT' + (units.length === 1 ? '' : 'S') + (G.wanted >= 4 ? ' · AIR UNIT DEPLOYED' : ''));
    const lines = units.slice(0, 4).map((u) => u.name + ' · ' + u.role + ' · ' + Math.round(u.dist / 4) + ' m');
    if (units.length > 4) lines.push('+' + (units.length - 4) + ' more');
    const ku = $('kpd-units');
    if (ku) ku.innerHTML = lines.join('<br>');
    txt('kpd-chatter', policeChatter());
  }
  show('hud-radio', G.radioStation !== 0);
  if (G.radioStation !== 0) txt('hud-radio', '♪ ' + STATIONS[G.radioStation].name);
  const crewHtml = ['rico', 'lena', 'captain'].map((k) => {
    const def = CREW_DEFS[k];
    const c = G.crew[k];
    const cd = c.cd > 0 ? ' · ' + Math.ceil(c.cd) + 's' : '';
    return '<div class="crew-chip' + (c.recruited ? '' : ' locked') + '"><b>' + def.key + '</b><br>' + def.ability + '<br>' + def.name + cd + '</div>';
  }).join('');
  if (crewHtml !== lastCrewHtml) {
    lastCrewHtml = crewHtml;
    const cp = $('crew-panel');
    if (cp) cp.innerHTML = crewHtml;
  }
  const slots = [['wslot-1', 'fists', '∞'], ['wslot-2', 'pistol', null], ['wslot-3', 'smg', null]];
  for (const [id, w, fixed] of slots) {
    const e = $(id);
    if (!e) continue;
    e.classList.toggle('active', G.weapon === w);
    if (w === 'smg') e.classList.toggle('locked', !G.smgUnlocked);
    const ammoEl = e.querySelector('.wammo');
    if (ammoEl) {
      if (w === 'fists') ammoEl.textContent = '∞';
      else if (w === 'smg' && !G.smgUnlocked) ammoEl.textContent = '—';
      else {
        const a = ammoFor(w);
        ammoEl.textContent = a.ammo + '/' + a.reserve;
      }
    }
    if (w === 'smg') {
      const nm = e.querySelector('.wname');
      if (nm) nm.textContent = G.smgUnlocked ? 'SMG' : 'SMG 🔒';
    }
  }
  show('hud-speed', !!p.car);
  if (p.car) {
    txt('speed-num', String(Math.round(Math.abs(p.car.speed) * 0.36)));
    txt('car-name', p.car.name);
    txt('car-damage', 'DAMAGE ' + Math.max(0, Math.round(100 - (p.car.hp / (p.car.maxHp || 100)) * 100)) + '%');
  }
  const m = G.mission;
  const r = G.race;
  show('mission-banner', !!(m || r));
  if (m) {
    txt('mission-title', 'MISSION ' + m.def.num + ' · ' + m.def.title.toUpperCase());
    txt('mission-timer', m.def.timeLimit ? fmtTime(m.timer) : fmtTime(G.time - G.missionStartTime));
    txt('mission-stage', 'STAGE ' + (m.stage + 1) + '/' + m.def.stages.length + ' ' + m.def.stages[m.stage]);
    txt('mission-objective', m.objective);
    txt('mission-next', m.stage + 1 < m.def.stages.length ? 'NEXT ' + m.def.stages[m.stage + 1] : 'FINAL STAGE');
  } else if (r) {
    txt('mission-title', 'STREET RACE · ' + r.def.name.toUpperCase());
    txt('mission-timer', fmtTime(r.timer));
    txt('mission-stage', 'CHECKPOINT ' + (r.cpIndex + 1) + '/' + r.def.checkpoints.length + ' · PAR ' + r.def.par + 's');
    txt('mission-objective', 'Reach checkpoint ' + (r.cpIndex + 1));
    txt('mission-next', r.cpIndex + 1 < r.def.checkpoints.length ? 'NEXT checkpoint ' + (r.cpIndex + 2) : 'FINAL CHECKPOINT');
  }
  show('dialogue-box', !!G.dialogue);
  if (G.dialogue) {
    txt('dialogue-name', G.dialogue.name + ':');
    txt('dialogue-line', G.dialogue.line);
  }
  show('toast', !!G.toast);
  if (G.toast) txt('toast', G.toast.text);
  show('mission-card', !!G.missionCard);
  if (G.missionCard) {
    txt('mission-card-title', G.missionCard.title);
    txt('mission-card-contact', 'Contact: ' + G.missionCard.contact);
    const lines = $('mission-card-lines');
    if (lines) lines.innerHTML = G.missionCard.lines.map((l) => '<div>' + l + '</div>').join('');
    txt('mission-card-payout', 'PAYOUT ' + fmtMoney(G.missionCard.payout));
  }
  show('mission-list', G.state === 'missionlist');
  if (G.state === 'missionlist') renderMissionList();
  show('crosshair', G.state === 'playing' && !p.car && G.weapon !== 'fists');
  if (G.waypoint && dist(p.x, p.y, G.waypoint.x, G.waypoint.y) < 60) G.waypoint = null;
  updateHints();
  updateObjectiveArrow();
  if (G.state === 'playing' || G.state === 'missionlist') drawMinimap();
}

function renderMissionList() {
  const box = $('mission-list-items');
  if (!box) return;
  box.innerHTML = MISSIONS.map((d) => {
    const done = G.missionsDone.includes(d.slug);
    const avail = missionAvailable(d);
    const status = done
      ? '<span class="done">DONE · ' + (G.ratings[d.slug] || '—') + '</span>'
      : avail ? '<span>AVAILABLE</span>' : '<span>LOCKED</span>';
    return '<div class="ml-row"><span>' + d.num + '. ' + d.title + ' — ' + d.contact + '</span>' + status + '</div>';
  }).join('');
}

function renderStoryTab() {
  return MISSIONS.map((d) => {
    const done = G.missionsDone.includes(d.slug);
    const avail = missionAvailable(d);
    const rating = G.ratings[d.slug];
    const head = d.num + '. ' + d.title.toUpperCase() + ' — ' + d.contact;
    const status = done
      ? '<span style="color:#2ecc71">DONE' + (rating ? ' · RATING ' + rating : '') + '</span>'
      : avail ? '<span style="color:#f5c542">AVAILABLE</span>' : '<span style="color:#888">LOCKED</span>';
    return '<div class="crew-card"><b>' + head + '</b> ' + status + '<div style="font-size:13px;color:#cfc4bc;margin-top:4px">' + d.brief + '</div><div style="font-size:12px;color:#7fb8d8;margin-top:4px">Payout ' + fmtMoney(d.payout) + ' · +' + d.rp + ' RP · ' + d.stages.length + ' stages</div></div>';
  }).join('');
}

function renderStatsTab() {
  const pct = completionPct();
  const parts = completionParts().map((p) =>
    '<div class="row"><span>' + p.label + '</span><span>' + Math.min(p.done, p.total) + '/' + p.total + '</span></div>' +
    '<div class="pbar"><div style="width:' + Math.round(Math.min(p.done, p.total) / p.total * 100) + '%"></div></div>'
  ).join('');
  const ri = rankFor(G.rp);
  const next = nextRankRp();
  const ratings = MISSIONS.map((d) => {
    const r = G.ratings[d.slug];
    return '<span style="color:' + (r ? ratingColor(r) : '#555') + ';font-weight:800;margin-right:10px">' + d.num + ':' + (r || '—') + '</span>';
  }).join('');
  const career = careerStats().map((s) => '<div class="row"><span>' + s.label + '</span><b>' + s.value + '</b></div>').join('');
  const reps = Object.keys(G.rep).map((d) => {
    const v = G.rep[d];
    return '<div class="row"><span>' + d + '</span><span style="color:' + repColor(v) + '">' + repStatus(v) + ' · ' + v + '</span></div>' +
      '<div class="pbar"><div style="width:' + v + '%;background:' + repColor(v) + '"></div></div>';
  }).join('');
  return '<div class="stat-grid">' +
    '<div class="stat-card"><h3>COMPLETION — ' + pct.toFixed(1) + '%</h3>' + parts + '</div>' +
    '<div class="stat-card"><h3>RANK ' + (ri + 1) + ' · ' + RANKS[ri].name + '</h3>' +
    '<div class="row"><span>Reputation</span><b>' + G.rp + ' RP</b></div>' +
    '<div class="row"><span>Next rank</span><b>' + (next === null ? 'MAX' : RANKS[ri + 1].name + ' at ' + next + ' RP') + '</b></div>' +
    '<div class="row"><span>Unlock</span><b>' + (RANKS[ri].unlock || '—') + '</b></div>' +
    '<h3 style="margin-top:12px">MISSION RATINGS</h3><div>' + ratings + '</div>' +
    '<h3 style="margin-top:12px">PLAYTIME</h3><div class="row"><span>Time in Port Meridian</span><b>' + fmtPlaytime(G.playtime) + '</b></div></div>' +
    '<div class="stat-card"><h3>CAREER</h3>' + career + '</div>' +
    '<div class="stat-card"><h3>DISTRICT REPUTATION</h3>' + reps + '</div>' +
    '</div>';
}

function renderCrewTab() {
  return ['rico', 'lena', 'captain'].map((k) => {
    const def = CREW_DEFS[k];
    const c = G.crew[k];
    const status = c.recruited
      ? '<span style="color:#2ecc71">RECRUITED</span> · uses: ' + c.uses + (c.cd > 0 ? ' · cooldown ' + Math.ceil(c.cd) + 's' : ' · ready')
      : '<span style="color:#888">NOT RECRUITED YET</span>';
    return '<div class="crew-card"><b>' + def.name + ' · ' + def.role + ' [' + def.key + ']</b> ' + status +
      '<div style="font-size:13px;color:#cfc4bc;margin-top:4px"><b>' + def.ability + '</b> — ' + def.desc + '</div></div>';
  }).join('') + '<div class="crew-card">Recruit the crew through the story: Rico joins after Mission 1, Lena after Mission 2, The Captain after Mission 3.</div>';
}

function renderSaveTab() {
  let html = '';
  for (let s = 1; s <= 3; s++) {
    const info = slotInfo(s);
    const label = info
      ? 'SLOT ' + s + ' · ' + fmtMoney(info.money) + ' · ' + info.missions + '/6 missions · ' + info.district + ' · ' + fmtPlaytime(info.playtime)
      : 'SLOT ' + s + ' · EMPTY';
    html += '<div class="save-row"><span>' + label + '</span><span>' +
      '<button data-save="' + s + '">SAVE</button> ' +
      (info ? '<button class="ghost" data-load="' + s + '">LOAD</button> <button class="ghost" data-del="' + s + '">DELETE</button>' : '') +
      '</span></div>';
  }
  const auto = slotInfo(0);
  html += '<div class="save-row"><span>AUTOSAVE' + (auto ? ' · ' + fmtMoney(auto.money) + ' · ' + auto.missions + '/6 missions' : ' · none yet — saves every 20s while playing') + '</span><span>' +
    (auto ? '<button class="ghost" data-load="0">LOAD</button>' : '') + '</span></div>';
  html += '<div class="save-row"><span>Back to the city, or start fresh.</span><span>' +
    '<button data-resume="1">RESUME</button> <button class="ghost" data-restart="1">RESTART RUN</button></span></div>';
  return html;
}

function renderMapTab() {
  const marker = missionMarkerPos();
  const label = marker
    ? 'Objective ' + Math.round(dist(G.player.x, G.player.y, marker.x, marker.y) / 4) / 10 + ' km away — click the map to set a waypoint'
    : 'Free roam — click the map to set a waypoint';
  return '<canvas id="pause-map" width="876" height="681"></canvas><div style="text-align:center;font-size:13px;color:#9a8a92;margin-top:8px">' + label + '</div>';
}

export function renderPauseTab() {
  const box = $('pause-content');
  if (!box) return;
  const tab = G.pauseTab;
  if (tab === 'map') {
    box.innerHTML = renderMapTab();
    const c = $('pause-map');
    if (c) {
      drawMap(c.getContext('2d'), c.width, c.height, true);
      c.addEventListener('click', (ev) => {
        const r = c.getBoundingClientRect();
        const x = (ev.clientX - r.left) / r.width * CFG.WORLD_W;
        const y = (ev.clientY - r.top) / r.height * CFG.WORLD_H;
        G.waypoint = { x: clamp(Math.round(x), 0, CFG.WORLD_W), y: clamp(Math.round(y), 0, CFG.WORLD_H) };
        toast('Waypoint set — follow the purple line.', 2);
        drawMap(c.getContext('2d'), c.width, c.height, true);
      });
    }
  } else if (tab === 'story') box.innerHTML = renderStoryTab();
  else if (tab === 'stats') box.innerHTML = renderStatsTab();
  else if (tab === 'crew') box.innerHTML = renderCrewTab();
  else if (tab === 'save') box.innerHTML = renderSaveTab();
  document.querySelectorAll('.ptab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  lastTab = tab;
}

export function updatePause() {
  const open = G.state === 'paused';
  show('pause-overlay', open);
  if (!open) { pauseWasOpen = false; return; }
  txt('pause-money', fmtMoney(G.money) + ' · ' + G.rp + ' RP');
  if (!pauseWasOpen || G.pauseTab !== lastTab) {
    renderPauseTab();
    pauseWasOpen = true;
  }
}

export function updateEndScreens() {
  show('screen-wasted', G.state === 'wasted');
  show('screen-busted', G.state === 'busted');
  show('screen-story', G.state === 'story');
}

export function renderTitleSlots() {
  const chips = $('slot-chips');
  let anySave = false;
  for (let s = 0; s <= 3; s++) if (slotInfo(s)) anySave = true;
  show('btn-continue', anySave);
  if (!chips) return;
  let html = '';
  for (let s = 1; s <= 3; s++) {
    const info = slotInfo(s);
    html += info
      ? '<button class="slot-chip" data-slot="' + s + '">SLOT ' + s + '<br>' + fmtMoney(info.money) + ' · ' + info.missions + '/6 · ' + info.district + '<br>' + fmtPlaytime(info.playtime) + '</button>'
      : '<button class="slot-chip empty" data-slot="' + s + '">SLOT ' + s + '<br>EMPTY — new game</button>';
  }
  chips.innerHTML = html;
}

export function initUI(actions) {
  $('btn-start').addEventListener('click', () => actions.onStart());
  $('btn-continue').addEventListener('click', () => actions.onContinue());
  $('btn-retry-wasted').addEventListener('click', () => actions.onRetry());
  $('btn-retry-busted').addEventListener('click', () => actions.onRetry());
  $('btn-continue-story').addEventListener('click', () => actions.onStoryContinue());
  document.querySelectorAll('.ptab').forEach((b) => {
    b.addEventListener('click', () => { G.pauseTab = b.dataset.tab; renderPauseTab(); });
  });
  $('pause-content').addEventListener('click', (ev) => {
    const t = ev.target.closest('button');
    if (!t) return;
    if (t.dataset.save) actions.onSave(Number(t.dataset.save));
    else if (t.dataset.load) actions.onLoad(Number(t.dataset.load));
    else if (t.dataset.del) actions.onDelete(Number(t.dataset.del));
    else if (t.dataset.resume) actions.onResume();
    else if (t.dataset.restart) actions.onRestart();
  });
  $('slot-chips').addEventListener('click', (ev) => {
    const t = ev.target.closest('.slot-chip');
    if (t) actions.onChip(Number(t.dataset.slot));
  });
  const mm = $('minimap');
  if (mm) mm.addEventListener('click', (ev) => {
    const r = mm.getBoundingClientRect();
    const x = (ev.clientX - r.left) / r.width * CFG.WORLD_W;
    const y = (ev.clientY - r.top) / r.height * CFG.WORLD_H;
    G.waypoint = { x: clamp(Math.round(x), 0, CFG.WORLD_W), y: clamp(Math.round(y), 0, CFG.WORLD_H) };
    toast('Waypoint set — follow the purple line.', 2);
  });
}
