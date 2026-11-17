// MERIDIAN HEAT — render.js: camera, city, cars, people and effects.
// All art is drawn in code on one canvas. Neon-dusk palette with a
// day/night cycle: the world darkens toward night and building windows
// light up.

import { CFG, G, clamp, lerp } from './config.js';
import { districtAt } from './world.js';

let ctx = null;

export function setCtx(c) { ctx = c; }

function drawCar(c, t) {
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(c.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(-24, -12, 48, 26);
  // Body.
  ctx.fillStyle = c.color;
  roundRect(-24, -13, 48, 26, 7);
  ctx.fill();
  // Cabin + windshield.
  ctx.fillStyle = 'rgba(20,24,40,0.9)';
  roundRect(-6, -10, 18, 20, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,200,255,0.75)';
  ctx.fillRect(10, -9, 3, 18);
  // Wheels.
  ctx.fillStyle = '#111';
  ctx.fillRect(-18, -15, 10, 4); ctx.fillRect(-18, 11, 10, 4);
  ctx.fillRect(10, -15, 10, 4); ctx.fillRect(10, 11, 10, 4);
  // Headlights.
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(22, -10, 3, 5); ctx.fillRect(22, 5, 3, 5);
  // Police livery + light bar.
  if (c.kind === 'police') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-24, -13, 48, 26);
    ctx.fillStyle = '#1f3a93';
    ctx.fillRect(-8, -13, 16, 26);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, -16);
    const flash = Math.floor(t * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2d55' : '#2d7dff';
    ctx.beginPath(); ctx.arc(-4, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = flash ? '#2d7dff' : '#ff2d55';
    ctx.beginPath(); ctx.arc(6, 0, 5, 0, Math.PI * 2); ctx.fill();
  }
  if (c.name === 'Comet Sport' || c.kind === 'gold') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('COMET', 0, 22);
  }
  ctx.restore();
  // Health bar for damaged cars.
  if (c.hp < 100 && c.kind !== 'parked') {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(c.x - 22, c.y - 30, 44, 5);
    ctx.fillStyle = c.hp > 40 ? '#2ecc71' : '#e74c3c';
    ctx.fillRect(c.x - 21, c.y - 29, 42 * (c.hp / 100), 3);
  }
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPed(ped, t) {
  if (ped.state === 'down') {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5d0a9';
    ctx.beginPath(); ctx.arc(14, 0, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(t * 9 + ped.x) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(ped.x, ped.y + 8, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.color;
  ctx.beginPath(); ctx.arc(ped.x, ped.y + bob * 0.3, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f5d0a9';
  ctx.beginPath(); ctx.arc(ped.x + Math.cos(ped.angle) * 4, ped.y + Math.sin(ped.angle) * 4 - 4, 6, 0, Math.PI * 2); ctx.fill();
}

function drawCop(cop, t) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(cop.x, cop.y + 8, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1f3a93';
  ctx.beginPath(); ctx.arc(cop.x, cop.y, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f5d0a9';
  ctx.beginPath(); ctx.arc(cop.x + Math.cos(cop.angle) * 4, cop.y + Math.sin(cop.angle) * 4 - 4, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0f1e4d';
  ctx.fillRect(cop.x - 6, cop.y - 14, 12, 4);
  if (cop.hold > 0) {
    // Arrest progress ring.
    ctx.strokeStyle = '#ff2d55';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cop.x, cop.y, 18, -Math.PI / 2, -Math.PI / 2 + (cop.hold / 1.4) * Math.PI * 2);
    ctx.stroke();
  }
}

function drawGunman(g, t) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(g.x, g.y + 8, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = g.flash > 0 ? '#ffffff' : '#7b2d26';
  ctx.beginPath(); ctx.arc(g.x, g.y, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f5d0a9';
  ctx.beginPath(); ctx.arc(g.x + Math.cos(g.angle) * 4, g.y + Math.sin(g.angle) * 4 - 4, 6, 0, Math.PI * 2); ctx.fill();
  // Gun.
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(g.x + Math.cos(g.angle) * 10, g.y + Math.sin(g.angle) * 10);
  ctx.lineTo(g.x + Math.cos(g.angle) * 22, g.y + Math.sin(g.angle) * 22);
  ctx.stroke();
  // Health bar.
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(g.x - 16, g.y - 26, 32, 5);
  ctx.fillStyle = g.hp > 40 ? '#e74c3c' : '#f39c12';
  ctx.fillRect(g.x - 15, g.y - 25, 30 * (g.hp / g.maxHp), 3);
}

function drawPlayer(p, t) {
  const bob = p.car ? 0 : Math.sin(t * 10) * 1.2;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(0, 8, 10, 4, 0, 0, Math.PI * 2); ctx.fill();
  if (!p.car) {
    ctx.rotate(p.angle);
    ctx.fillStyle = '#e8b64c';
    ctx.beginPath(); ctx.arc(0, bob * 0.3, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5d0a9';
    ctx.beginPath(); ctx.arc(4, -3 + bob * 0.3, 6, 0, Math.PI * 2); ctx.fill();
    // Pistol in hand.
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(8, 0); ctx.lineTo(20, 0);
    ctx.stroke();
    // Punch arc.
    if (G.punchTimer > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 34, -0.7, 0.7);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function renderWorld() {
  const w = G.world;
  const cam = G.camera;
  const t = G.time;
  const shakeX = (Math.random() - 0.5) * G.shake;
  const shakeY = (Math.random() - 0.5) * G.shake;
  const vx = cam.x - G.vw / 2 + shakeX;
  const vy = cam.y - G.vh / 2 + shakeY;

  ctx.save();
  ctx.translate(-vx, -vy);

  // Ground.
  ctx.fillStyle = '#232a38';
  ctx.fillRect(0, 0, CFG.WORLD_W, CFG.WORLD_H);

  // District tint.
  for (const d of w.districts) {
    ctx.fillStyle = d.c;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.globalAlpha = 1;
  }

  // Water (harbour).
  const waterGrad = ctx.createLinearGradient(0, w.water.y, 0, CFG.WORLD_H);
  waterGrad.addColorStop(0, '#0e3a5c');
  waterGrad.addColorStop(1, '#082a44');
  ctx.fillStyle = waterGrad;
  ctx.fillRect(w.water.x, w.water.y, w.water.w, w.water.h);
  ctx.strokeStyle = 'rgba(120,200,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const wx = ((t * 24 + i * 430) % CFG.WORLD_W);
    ctx.beginPath();
    ctx.moveTo(wx, w.water.y + 26 + i * 22);
    ctx.lineTo(wx + 60, w.water.y + 26 + i * 22);
    ctx.stroke();
  }
  // Docks / piers.
  ctx.fillStyle = '#6b543a';
  for (const d of w.docks) ctx.fillRect(d.x, d.y, d.w, d.h);
  ctx.fillStyle = '#8a6f4d';
  for (const d of w.docks) {
    for (let x = d.x + 10; x < d.x + d.w; x += 34) ctx.fillRect(x, d.y, 3, d.h);
  }

  // Park.
  ctx.fillStyle = '#2d5a34';
  ctx.fillRect(w.park.x, w.park.y, w.park.w, w.park.h);
  ctx.fillStyle = '#356b3d';
  ctx.beginPath(); ctx.ellipse(w.park.x + w.park.w / 2, w.park.y + w.park.h / 2, w.park.w / 2.4, w.park.h / 2.6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c9a86a';
  ctx.beginPath(); ctx.ellipse(w.park.x + w.park.w / 2, w.park.y + w.park.h / 2, 42, 26, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7ec8e3';
  ctx.beginPath(); ctx.ellipse(w.park.x + w.park.w / 2, w.park.y + w.park.h / 2, 30, 17, 0, 0, Math.PI * 2); ctx.fill();

  // Roads.
  ctx.fillStyle = '#161a22';
  for (const rx of w.roadsV) ctx.fillRect(rx - CFG.ROAD_W / 2, 0, CFG.ROAD_W, CFG.WORLD_H);
  for (const ry of w.roadsH) ctx.fillRect(0, ry - CFG.ROAD_W / 2, CFG.WORLD_W, CFG.ROAD_W);
  // Lane dashes.
  ctx.strokeStyle = 'rgba(240,200,90,0.55)';
  ctx.lineWidth = 3;
  ctx.setLineDash([26, 30]);
  for (const rx of w.roadsV) {
    ctx.beginPath(); ctx.moveTo(rx, 0); ctx.lineTo(rx, CFG.WORLD_H); ctx.stroke();
  }
  for (const ry of w.roadsH) {
    ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(CFG.WORLD_W, ry); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (const rx of w.roadsV) {
    for (const ry of w.roadsH) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx + i * 12 - 4, ry - CFG.ROAD_W / 2 + 8, 8, 14);
        ctx.fillRect(rx + i * 12 - 4, ry + CFG.ROAD_W / 2 - 22, 8, 14);
      }
    }
  }

  // Safehouse.
  const sh = w.safehouse;
  ctx.fillStyle = '#2ecc71';
  ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#2ecc71';
  ctx.beginPath(); ctx.arc(sh.x, sh.y, sh.r + 10 + Math.sin(t * 3) * 5, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#1e8449';
  ctx.fillRect(sh.x - 34, sh.y - 26, 68, 52);
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.moveTo(sh.x - 40, sh.y - 26); ctx.lineTo(sh.x, sh.y - 48); ctx.lineTo(sh.x + 40, sh.y - 26);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SAFEHOUSE', sh.x, sh.y + 66);

  // Buildings with lit windows at night.
  const night = nightFactor();
  for (const b of w.buildings) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(b.x + 5, b.y + 7, b.w, b.h);
    ctx.fillStyle = b.c;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(b.x, b.y, b.w, 6);
    // Windows.
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const lit = ((i * 7 + j * 13 + Math.floor(b.hgt)) % 5) < 2;
        ctx.fillStyle = night > 0.4 && lit ? '#ffd76a' : 'rgba(10,14,24,0.55)';
        ctx.fillRect(b.x + 8 + i * ((b.w - 16) / cols), b.y + 8 + j * ((b.h - 16) / rows), 10, 12);
      }
    }
  }

  // Trees.
  for (const tr of w.trees) {
    ctx.fillStyle = '#1e4d2a';
    ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f7a3d';
    ctx.beginPath(); ctx.arc(tr.x - 3, tr.y - 3, tr.r * 0.65, 0, Math.PI * 2); ctx.fill();
  }

  // District labels.
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('OLD TOWN', 760, 420);
  ctx.fillText('DOWNTOWN', 2720, 420);
  ctx.fillText('MARINA DISTRICT', 760, 1300);
  ctx.fillText('HARBOR DISTRICT', 2720, 1300);
  ctx.fillText('MERIDIAN PARK', w.park.x + w.park.w / 2, w.park.y + w.park.h / 2 + 8);
  ctx.fillStyle = 'rgba(140,210,255,0.5)';
  ctx.fillText('PORT MERIDIAN HARBOUR', CFG.WORLD_W / 2, 2700);

  // Skid marks.
  for (const s of G.skidmarks) {
    ctx.fillStyle = `rgba(10,10,12,${0.5 * (s.life / s.maxLife)})`;
    ctx.beginPath(); ctx.ellipse(s.x, s.y, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
  }

  // Health pickups.
  for (const pk of G.pickups) {
    const pulse = 1 + Math.sin(t * 5 + pk.x) * 0.15;
    ctx.fillStyle = '#2ecc71';
    ctx.beginPath(); ctx.arc(pk.x, pk.y, 14 * pulse, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(pk.x - 3, pk.y - 9, 6, 18);
    ctx.fillRect(pk.x - 9, pk.y - 3, 18, 6);
  }

  // Mission marker (pulsing).
  const marker = G._markerPos;
  if (marker) {
    const pulse = 1 + Math.sin(t * 5) * 0.2;
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#f1c40f';
    ctx.fillRect(-11 * pulse, -11 * pulse, 22 * pulse, 22 * pulse);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(-11 * pulse, -11 * pulse, 22 * pulse, 22 * pulse);
    ctx.restore();
    ctx.fillStyle = 'rgba(241,196,15,0.25)';
    ctx.beginPath(); ctx.arc(marker.x, marker.y, 34 + Math.sin(t * 5) * 6, 0, Math.PI * 2); ctx.fill();
  }

  // Cars, peds, cops, gunmen, player.
  for (const c of G.cars) drawCar(c, t);
  for (const ped of G.peds) drawPed(ped, t);
  for (const cop of G.cops) drawCop(cop, t);
  for (const g of G.gunmen) drawGunman(g, t);
  if (G.player) drawPlayer(G.player, t);

  // Bullets.
  ctx.strokeStyle = '#ffe066';
  ctx.lineWidth = 3;
  for (const b of G.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Particles.
  for (const p of G.particles) {
    ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Aim line + crosshair when on foot.
  if (G.player && !G.player.car && G.state === 'playing') {
    const p = G.player;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(G.aimAngle) * 90, p.y + Math.sin(G.aimAngle) * 90);
    ctx.stroke();
    const mx = G.mouse.wx, my = G.mouse.wy;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(mx - 13, my); ctx.lineTo(mx - 5, my);
    ctx.moveTo(mx + 5, my); ctx.lineTo(mx + 13, my);
    ctx.moveTo(mx, my - 13); ctx.lineTo(mx, my - 5);
    ctx.moveTo(mx, my + 5); ctx.lineTo(mx, my + 13);
    ctx.stroke();
  }

  ctx.restore();

  // Day/night tint over everything.
  const nf = nightFactor();
  if (nf > 0.02) {
    ctx.fillStyle = `rgba(8,10,48,${(nf * 0.42).toFixed(3)})`;
    ctx.fillRect(0, 0, G.vw, G.vh);
  }
  if (G.dayTime > 0.2 && G.dayTime < 0.45) {
    // Neon dusk wash.
    ctx.fillStyle = 'rgba(255,110,60,0.05)';
    ctx.fillRect(0, 0, G.vw, G.vh);
  }
  // Danger vignette when hurt or wanted.
  const danger = G.state === 'playing' && (G.health < 35 || G.wanted >= 3) ? 1 : 0;
  if (danger || G.health < 60) {
    const a = G.health < 35 ? 0.5 : G.health < 60 ? 0.25 : 0.35;
    const grad = ctx.createRadialGradient(G.vw / 2, G.vh / 2, G.vh * 0.42, G.vw / 2, G.vh / 2, G.vh * 0.78);
    grad.addColorStop(0, 'rgba(200,0,0,0)');
    grad.addColorStop(1, `rgba(200,0,0,${a})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, G.vw, G.vh);
  }
}

export function nightFactor() {
  // dayTime 0..1: 0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight.
  const d = G.dayTime;
  if (d < 0.45) return 0;
  if (d < 0.55) return (d - 0.45) / 0.1; // dusk -> night
  if (d < 0.85) return 1;
  if (d < 0.95) return 1 - (d - 0.85) / 0.1;
  return 0;
}

export function currentDistrictName() {
  return G.player ? districtAt(G.player.x, G.player.y) : 'PORT MERIDIAN';
}
