import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const defaultDataDir = path.join(root, 'data');
const dataDir = process.env.DATA_DIR || defaultDataDir;
const dbPath = path.join(dataDir, 'db.json');
const schedulePath = path.join(dataDir, 'schedule_2026.json');
const gridPath = path.join(dataDir, 'current_grid.json');
const sourceSchedulePath = path.join(defaultDataDir, 'schedule_2026.json');
const sourceGridPath = path.join(defaultDataDir, 'current_grid.json');

const requiredRootFiles = [
  path.join(root, 'config.json')
];

for (const p of requiredRootFiles) {
  if (!fs.existsSync(p)) {
    throw new Error(`[preflight] Missing required file: ${p}`);
  }
}

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Seed schedule/grid into mounted DATA_DIR on first cloud boot.
if (!fs.existsSync(schedulePath)) {
  if (!fs.existsSync(sourceSchedulePath)) {
    throw new Error(`[preflight] Missing schedule source file: ${sourceSchedulePath}`);
  }
  fs.copyFileSync(sourceSchedulePath, schedulePath);
  console.log(`[preflight] Seeded schedule_2026.json into ${dataDir}`);
}

if (!fs.existsSync(gridPath)) {
  if (!fs.existsSync(sourceGridPath)) {
    throw new Error(`[preflight] Missing grid source file: ${sourceGridPath}`);
  }
  fs.copyFileSync(sourceGridPath, gridPath);
  console.log(`[preflight] Seeded current_grid.json into ${dataDir}`);
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
