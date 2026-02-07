import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
const dbPath = path.join(dataDir, 'db.json');

const required = [
  path.join(root, 'config.json'),
  path.join(dataDir, 'schedule_2026.json'),
  path.join(dataDir, 'current_grid.json')
];

for (const p of required) {
  if (!fs.existsSync(p)) {
    throw new Error(`[preflight] Missing required file: ${p}`);
  }
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(dbPath)) {
  const emptyDb = {
    drivers: [],
    races: [],
    qualifying_results: [],
    race_results: [],
    race_actuals: [],
    predictions: [],
    season_predictions: []
  };
  fs.writeFileSync(dbPath, JSON.stringify(emptyDb, null, 2));
  console.log('[preflight] Created missing data/db.json');
}

const major = Number(process.versions.node.split('.')[0]);
if (major !== 20) {
  console.warn(`[preflight] Recommended Node 20.x for stability. Current: ${process.version}`);
  console.warn('[preflight] Run: nvm use 20');
}

console.log('[preflight] OK');
