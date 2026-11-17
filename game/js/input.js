// MERIDIAN HEAT — input.js: keyboard and mouse state.
// Listeners only RECORD input. The game loop reads G.keys / G.pressed /
// G.mouse.clicked during update() and clears the edge-triggered sets AFTER
// update() has run — never before — so no key press is ever swallowed
// before gameplay sees it.

import { G } from './config.js';

const GAME_KEYS = [
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyE', 'KeyF', 'KeyM', 'KeyP', 'KeyR', 'Space', 'Enter', 'Escape', 'ShiftLeft', 'ShiftRight',
];

export function initInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (!e.repeat) G.pressed.add(e.code);
    G.keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => {
    G.keys.delete(e.code);
  });
  window.addEventListener('blur', () => {
    G.keys.clear();
  });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    G.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    G.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      G.mouse.down = true;
      G.mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) G.mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Edge-triggered helpers, read by update() only.
export function wasPressed(code) { return G.pressed.has(code); }
export function isDown(code) { return G.keys.has(code); }
export function moveAxis() {
  let x = 0, y = 0;
  if (isDown('KeyA') || isDown('ArrowLeft')) x -= 1;
  if (isDown('KeyD') || isDown('ArrowRight')) x += 1;
  if (isDown('KeyW') || isDown('ArrowUp')) y -= 1;
  if (isDown('KeyS') || isDown('ArrowDown')) y += 1;
  return { x, y };
}
