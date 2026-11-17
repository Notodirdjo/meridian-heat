// MERIDIAN HEAT — ui.js: HUD, minimap, title/pause/wasted/busted/story
// screens, mission list, toasts and the off-screen objective arrow.

import { CFG, G, clamp, dist, angleTo, fmtMoney, fmtTime } from './config.js';
import { MISSIONS, missionMarkerPos, nextMissionDef } from './missions.js';
import { currentDistrictName } from './render.js';

let ctx = null;
export function setCtx(c) { ctx = c; }

function panel(x, y, w, h, alpha = 0.72) {
  ctx.fillStyle = `rgba(8,10,18,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

export function drawHUD() {
  const p = G.player;
  if (!p) return;
  // Health + money, top-left.
  panel(14, 12, 250, 64);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('VEX MARLOWE', 26, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(26, 40, 150, 10);
  ctx.fillStyle = G.health > 40 ? '#2ecc71' : '#e74c3c';
  ctx.fillRect(26, 40, 150 * clamp(G.health / 100, 0, 1), 10);
  ctx.fillStyle = '#2ecc71';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText(fmtMoney(G.money), 186, 52);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px sans-serif';
  ctx.fillText(currentDistrictName(), 26, 68);

  // Wanted stars, top-centre.
  const starY = 34;
  ctx.font = '26px sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < G.wanted ? '#ffd700' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', G.vw / 2 - 60 + i * 30, starY);
  }
  if (G.wanted > 0) {
    ctx.fillStyle = '#ff5a5a';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('WANTED', G.vw / 2, starY + 20);
  }

  // Weapon / ammo, bottom-left.
  panel(14, G.vh - 58, 210, 44);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PISTOL', 26, G.vh - 36);
  ctx.fillStyle = G.reloading > 0 ? '#f39c12' : '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText(G.reloading > 0 ? 'RELOADING…' : G.ammo + ' / ' + G.reserveAmmo, 110, G.vh - 36);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px sans-serif';
  ctx.fillText('F punch   •   click shoot', 26, G.vh - 20);

  // Speed, bottom-right (only while driving).
  if (p.car) {
    const kmh = Math.round(Math.abs(p.car.speed) * 0.38);
    panel(G.vw - 150, G.vh - 76, 136, 62);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(kmh), G.vw - 46, G.vh - 40);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = '11px sans-serif';
    ctx.fillText('km/h', G.vw - 24, G.vh - 40);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(p.car.name || 'STOLEN CAR', G.vw - 82, G.vh - 22);
    // Car health.
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(G.vw - 136, G.vh - 66, 108, 5);
    ctx.fillStyle = p.car.hp > 40 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(G.vw - 136, G.vh - 66, 108 * clamp(p.car.hp / 100, 0, 1), 5);
  }

  // Mission objective, bottom-centre.
  if (G.mission) {
    const m = G.mission;
    panel(G.vw / 2 - 260, G.vh - 96, 520, 54);
    ctx.fillStyle = '#f1c40f';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('MISSION ' + m.def.num + ' — ' + m.def.title.toUpperCase(), G.vw / 2 - 246, G.vh - 76);
    ctx.fillStyle = '#fff';
    ctx.font = '13px sans-serif';
    ctx.fillText(m.objective, G.vw / 2 - 246, G.vh - 56);
    if (m.def.timeLimit) {
      ctx.fillStyle = m.timer < 20 ? '#ff5a5a' : '#fff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(fmtTime(m.timer), G.vw / 2 + 246, G.vh - 62);
    }
  } else {
    const next = nextMissionDef();
    if (next && !G.storyDone) {
      panel(G.vw / 2 - 260, G.vh - 58, 520, 40);
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('◆  NEXT: ' + next.title.toUpperCase() + ' — press E at the gold marker  •  M for missions', G.vw / 2, G.vh - 33);
    }
  }

  // Toast.
  if (G.toast && G.toast.t > 0) {
    ctx.font = 'bold 15px sans-serif';
    const tw = ctx.measureText(G.toast.text).width + 32;
    panel(G.vw / 2 - tw / 2, 64, tw, 34, 0.8);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(G.toast.text, G.vw / 2, 86);
  }

  // Off-screen objective arrow with distance.
  const marker = missionMarkerPos();
  if (marker && G.state === 'playing') {
    const dx = marker.x - p.x, dy = marker.y - p.y;
    const d = Math.hypot(dx, dy);
    const sx = p.x + (dx / d) * 0; // screen-space check below
    const camX = G.camera.x - G.vw / 2, camY = G.camera.y - G.vh / 2;
    const mx = marker.x - camX, my = marker.y - camY;
    if (mx < 40 || mx > G.vw - 40 || my < 40 || my > G.vh - 40) {
      const a = Math.atan2(dy, dx);
      const ax = G.vw / 2 + Math.cos(a) * (G.vw / 2 - 70);
      const ay = G.vh / 2 + Math.sin(a) * (G.vh / 2 - 70);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(a);
      ctx.fillStyle = '#f1c40f';
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(-10, -10); ctx.lineTo(-10, 10);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#f1c40f';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(d) + 'm', ax, ay + 28);
    }
  }

  drawMinimap();
}

export function drawMinimap() {
  const mw = 210, mh = 164;
  const mx = G.vw - mw - 14, my = 14;
  const sx = mw / CFG.WORLD_W, sy = mh / CFG.WORLD_H;
  panel(mx - 6, my - 6, mw + 12, mh + 12, 0.8);
  ctx.save();
  ctx.beginPath();
  ctx.rect(mx, my, mw, mh);
  ctx.clip();
  // Water + ground.
  ctx.fillStyle = '#0e3a5c';
  ctx.fillRect(mx, my + G.world.water.y * sy, mw, mh - G.world.water.y * sy);
  ctx.fillStyle = '#232a38';
  ctx.fillRect(mx, my, mw, G.world.water.y * sy);
  // Park.
  ctx.fillStyle = '#2d5a34';
  ctx.fillRect(mx + G.world.park.x * sx, my + G.world.park.y * sy, G.world.park.w * sx, G.world.park.h * sy);
  // Roads.
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 3;
  for (const rx of G.world.roadsV) {
    ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + mh); ctx.stroke();
  }
  for (const ry of G.world.roadsH) {
    ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke();
  }
  // Safehouse.
  ctx.fillStyle = '#2ecc71';
  ctx.fillRect(mx + G.world.safehouse.x * sx - 3, my + G.world.safehouse.y * sy - 3, 6, 6);
  // Mission marker (pulsing).
  const marker = missionMarkerPos();
  if (marker) {
    const pulse = 3 + Math.sin(G.time * 6) * 1.5;
    ctx.fillStyle = '#f1c40f';
    ctx.beginPath(); ctx.arc(mx + marker.x * sx, my + marker.y * sy, pulse + 3, 0, Math.PI * 2); ctx.fill();
  }
  // Police (flashing).
  const flash = Math.floor(G.time * 4) % 2 === 0;
  ctx.fillStyle = flash ? '#ff2d55' : '#2d7dff';
  for (const c of G.cars) {
    if (c.kind === 'police') {
      ctx.beginPath(); ctx.arc(mx + c.x * sx, my + c.y * sy, 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (const cop of G.cops) {
    ctx.beginPath(); ctx.arc(mx + cop.x * sx, my + cop.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow.
  const p = G.player;
  if (p) {
    ctx.save();
    ctx.translate(mx + p.x * sx, my + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('PORT MERIDIAN', mx + 2, my + mh + 22);
}

// ---- full screens ------------------------------------------------------
function dim(alpha = 0.62) {
  ctx.fillStyle = `rgba(5,6,14,${alpha})`;
  ctx.fillRect(0, 0, G.vw, G.vh);
}
function bigTitle(text, y, size = 64, color = '#fff') {
  ctx.font = `bold ${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(text, G.vw / 2 + 3, y + 3);
  ctx.fillStyle = color;
  ctx.fillText(text, G.vw / 2, y);
}
function centerText(text, y, size = 16, color = '#fff', bold = false) {
  ctx.font = `${bold ? 'bold ' : ''}${size}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, G.vw / 2, y);
}
function button(label, y, w = 300) {
  const x = G.vw / 2 - w / 2;
  const hover = G.mouse.x >= x && G.mouse.x <= x + w && G.mouse.y >= y - 26 && G.mouse.y <= y + 14;
  ctx.fillStyle = hover ? '#f1c40f' : '#e8b64c';
  ctx.beginPath(); ctx.roundRect(x, y - 26, w, 40, 8); ctx.fill();
  ctx.fillStyle = '#14141c';
  ctx.font = 'bold 17px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(label, G.vw / 2, y + 2);
  return { x, y: y - 26, w, h: 40, hover };
}

export function drawTitle(hasSave) {
  dim(0.45);
  // Neon title.
  ctx.save();
  ctx.shadowColor = '#ff2d78';
  ctx.shadowBlur = 26;
  bigTitle('MERIDIAN HEAT', 150, 72, '#fff');
  ctx.restore();
  centerText('AN ORIGINAL OPEN-WORLD CRIME STORY  •  PORT MERIDIAN', 188, 16, '#f1c40f', true);
  centerText('Vex Marlowe is back in town — broke, wanted, and owed a favour by Rico.', 232, 16, '#e8e8e8');
  centerText('Steal cars. Outrun the law. Run four story missions and take the harbour.', 258, 16, '#e8e8e8');
  centerText('WASD / arrows — move & drive      E — enter / exit car      Mouse — aim, click — shoot', 316, 15, '#cfd8e3');
  centerText('F — punch      Space — handbrake      M — missions      P — pause      R — restart', 340, 15, '#cfd8e3');
  const b1 = button(hasSave ? 'CONTINUE' : 'START GAME', 420, 320);
  const b2 = hasSave ? button('NEW GAME', 472, 320) : null;
  centerText('No Rockstar content — every street, name and sound is original.', 560, 13, 'rgba(255,255,255,0.55)');
  centerText('v1.0  •  sound on for the synthwave', 584, 13, 'rgba(255,255,255,0.55)');
  return { start: b1, newGame: b2 };
}

export function drawPaused() {
  dim(0.6);
  bigTitle('PAUSED', 200, 56);
  centerText('Port Meridian waits for no one. Except now.', 240, 16, '#cfd8e3');
  const b1 = button('RESUME  (P)', 320, 300);
  const b2 = button('RESTART RUN  (R)', 372, 300);
  const b3 = button('SAVE & QUIT TO TITLE', 424, 300);
  centerText('Progress auto-saves after every mission.', 480, 13, 'rgba(255,255,255,0.6)');
  return { resume: b1, restart: b2, quit: b3 };
}

export function drawWasted() {
  dim(0.55);
  bigTitle('WASTED', 260, 84, '#ff3b30');
  centerText('Vex Marlowe went down in ' + currentDistrictName() + '.', 310, 17, '#fff');
  centerText('Press R or click to start over. Your saved missions are kept.', 340, 15, '#cfd8e3');
  const b = button('TRY AGAIN  (R)', 420, 300);
  return { again: b };
}

export function drawBusted() {
  dim(0.55);
  bigTitle('BUSTED', 260, 84, '#2d7dff');
  centerText('The Port Meridian PD finally got their cuffs on Vex.', 310, 17, '#fff');
  centerText('Bail cost you $200. Press R or click to get back out there.', 340, 15, '#cfd8e3');
  const b = button('BACK ON THE STREETS  (R)', 420, 320);
  return { again: b };
}

export function drawStoryComplete() {
  dim(0.5);
  ctx.save();
  ctx.shadowColor = '#f1c40f';
  ctx.shadowBlur = 24;
  bigTitle('THE HARBOUR IS YOURS', 180, 52, '#f1c40f');
  ctx.restore();
  centerText('All four missions complete. Vex Marlowe owns Port Meridian.', 232, 17, '#fff');
  centerText('Final take: ' + fmtMoney(G.money) + '   •   Cars stolen: ' + G.stats.carsStolen + '   •   Shots fired: ' + G.stats.shotsFired, 264, 15, '#cfd8e3');
  centerText('Free roam continues — keep the city, lose the cops, live the legend.', 296, 15, '#cfd8e3');
  const b = button('KEEP PLAYING  (free roam)', 380, 340);
  return { roam: b };
}

export function drawMissionList() {
  dim(0.65);
  bigTitle('MISSIONS', 120, 44);
  let y = 180;
  for (const m of MISSIONS) {
    const done = G.missionsDone.includes(m.slug);
    const active = G.mission && G.mission.def.slug === m.slug;
    const locked = !done && !active && nextMissionDef() !== m && !MISSIONS.slice(0, MISSIONS.indexOf(m)).every((x) => G.missionsDone.includes(x.slug));
    panel(G.vw / 2 - 330, y, 660, 64);
    ctx.fillStyle = done ? '#2ecc71' : active ? '#f1c40f' : locked ? 'rgba(255,255,255,0.4)' : '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(m.num + '. ' + m.title + '  —  ' + m.contact, G.vw / 2 - 310, y + 26);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '13px sans-serif';
    ctx.fillText(m.brief, G.vw / 2 - 310, y + 48);
    ctx.fillStyle = done ? '#2ecc71' : active ? '#f1c40f' : '#f1c40f';
    ctx.font = 'bold 15px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(done ? 'DONE ✓' : active ? 'ACTIVE' : locked ? 'LOCKED' : fmtMoney(m.payout), G.vw / 2 + 310, y + 26);
    y += 78;
  }
  centerText('Press M or Esc to close  •  go to the gold ◆ marker and press E to start the next mission', y + 10, 14, '#cfd8e3');
}

export function drawMissionCard() {
  const c = G.missionCard;
  if (!c) return;
  dim(0.45);
  panel(G.vw / 2 - 340, G.vh / 2 - 150, 680, 300, 0.92);
  ctx.fillStyle = '#f1c40f';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(c.title, G.vw / 2, G.vh / 2 - 108);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px sans-serif';
  ctx.fillText('FROM: ' + c.contact.toUpperCase() + '    •    PAYOUT: ' + fmtMoney(c.payout), G.vw / 2, G.vh / 2 - 76);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.moveTo(G.vw / 2 - 300, G.vh / 2 - 60); ctx.lineTo(G.vw / 2 + 300, G.vh / 2 - 60); ctx.stroke();
  let y = G.vh / 2 - 28;
  for (const line of c.lines) {
    ctx.fillStyle = '#e8e8e8';
    ctx.font = 'italic 15px sans-serif';
    ctx.fillText(line, G.vw / 2, y);
    y += 28;
  }
  centerText('Press E or click to go  •  M for the mission list', G.vh / 2 + 118, 13, 'rgba(255,255,255,0.65)');
}

export function drawHintBar() {
  const p = G.player;
  if (!p || G.state !== 'playing' || G.missionCard) return;
  let hint = null;
  if (!p.car) {
    const car = G._nearCar;
    if (car) hint = 'Press E to steal the ' + (car.name || 'car');
    const next = nextMissionDef();
    if (next && G._nearMarker) hint = 'Press E to start: ' + next.title + ' (' + fmtMoney(next.payout) + ')';
  } else {
    hint = 'E — exit car    •    Space — handbrake';
  }
  if (hint) {
    ctx.font = 'bold 14px sans-serif';
    const tw = ctx.measureText(hint).width + 30;
    panel(G.vw / 2 - tw / 2, G.vh - 130, tw, 30, 0.8);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(hint, G.vw / 2, G.vh - 110);
  }
}
