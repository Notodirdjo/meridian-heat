// MERIDIAN HEAT 3D — entrypoint: builds /output (game/ + screenshots/ +
// dossier.json) from this repository. Run with `node main.ts`.
import { buildDossier } from './vendor/makefun-game.ts';
import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const out = '/output';

mkdirSync(out, { recursive: true });
// Clean the CONTENTS of /output only — never the directory itself.
for (const entry of readdirSync(out)) {
  rmSync(join(out, entry), { recursive: true, force: true });
}
cpSync(join(root, 'game'), join(out, 'game'), { recursive: true });
cpSync(join(root, 'screenshots'), join(out, 'screenshots'), { recursive: true });
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
}));
console.log('MERIDIAN HEAT 3D: /output built (game/ + screenshots/ + dossier.json)');
