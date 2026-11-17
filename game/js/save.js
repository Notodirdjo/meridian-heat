// MERIDIAN HEAT — save.js: localStorage save / continue.
// Saves money, completed missions, health and position. A save survives a
// page reload; Continue on the title screen restores it.

import { CFG, G } from './config.js';

export function saveGame() {
  const p = G.player;
  if (!p) return false;
  try {
    const data = {
      v: 1,
      money: G.money,
      health: Math.max(1, Math.round(G.health)),
      missionsDone: G.missionsDone.slice(),
      storyDone: G.storyDone,
      x: Math.round(p.x),
      y: Math.round(p.y),
      wanted: G.wanted,
      stats: G.stats,
      savedAt: Date.now(),
    };
    localStorage.setItem(CFG.SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(CFG.SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(CFG.SAVE_KEY); } catch (e) { /* ignore */ }
}

export function applySave(data) {
  G.money = data.money;
  G.health = data.health;
  G.missionsDone = data.missionsDone.slice();
  G.storyDone = !!data.storyDone;
  G.wanted = 0;
  G.stats = data.stats || G.stats;
  if (G.player) {
    G.player.x = data.x;
    G.player.y = data.y;
    G.player.hp = data.health;
  }
}
