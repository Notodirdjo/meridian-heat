// MERIDIAN HEAT — the entrypoint for the gta6-01 bounty (Node 22, stdlib only).
// It hands the game in: copies game/ and screenshots/ from beside this file
// to /output (or MAKEFUN_OUTPUT_DIR outside the grader) and writes
// /output/dossier.json with the vendored make.fun library, the summary the
// judge reads. Run it from the repository root:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// The program is deterministic: two runs write the same bytes.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from a clean output directory so stale files can never leak in.
// Only the directory's contents are removed, never the directory itself:
// the grader mounts /output as a volume and removing a mount point fails
// with EBUSY ("Device or resource busy").
mkdirSync(out, { recursive: true });
for (const entry of readdirSync(out)) {
  rmSync(join(out, entry), { recursive: true, force: true });
}
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's caps (reference/gate.json): text_max_bytes shapes the
// dossier's bytes; the others refuse an entry the scorer would refuse
// (more than 4 screenshots or one over 256 KiB; more than 993 files in
// game/ or 48 MiB of game files in all, or a path under game/ over
// 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
