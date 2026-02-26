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
const isRailway = Boolean(
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_ENVIRONMENT_ID ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_STATIC_URL
);
const railwayEnv = String(process.env.RAILWAY_ENVIRONMENT_NAME || '').trim().toLowerCase();
const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production' || railwayEnv === 'production';
const deployWallEnabled = process.env.DEPLOY_WALL === undefined
  ? isProduction
  : ['1', 'true', 'yes', 'y'].includes(String(process.env.DEPLOY_WALL || '').trim().toLowerCase());
const deployWallAllowUnsafeDataDir =
  ['1', 'true', 'yes', 'y'].includes(String(process.env.DEPLOY_WALL_ALLOW_UNSAFE_DATA_DIR || '').trim().toLowerCase());
const deployWallAllowEmptyDb =
  ['1', 'true', 'yes', 'y'].includes(String(process.env.DEPLOY_WALL_ALLOW_EMPTY_DB || '').trim().toLowerCase());
const enforcePersistentDataDir =
  ['1', 'true', 'yes', 'y'].includes(String(process.env.ENFORCE_PERSISTENT_DATA_DIR || process.env.DEPLOY_WALL_ENFORCE_PERSISTENT_DATA_DIR || '').trim().toLowerCase());

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

const resolvedRoot = path.resolve(root);
const resolvedDefaultData = path.resolve(defaultDataDir);
const resolvedData = path.resolve(dataDir);
const usesRecommendedVolumePath = resolvedData === '/data' || resolvedData.startsWith('/data/');
const insideAppDir = resolvedData === resolvedRoot || resolvedData.startsWith(resolvedRoot + path.sep);
const likelyEphemeralOnRailway = isRailway && (resolvedData === resolvedDefaultData || insideAppDir) && !usesRecommendedVolumePath;

if (likelyEphemeralOnRailway) {
  const msg = [
    '[preflight] WARNING: DATA_DIR appears to be on ephemeral Railway app storage.',
    `[preflight] DATA_DIR=${dataDir}`,
    '[preflight] To protect saved picks, mount a Railway volume at /data and set DATA_DIR=/data.'
  ].join('\n');

  if ((deployWallEnabled && !deployWallAllowUnsafeDataDir) || enforcePersistentDataDir) {
    throw new Error(
      `${msg}\n[preflight] Startup blocked by deploy wall (or ENFORCE_PERSISTENT_DATA_DIR=1). ` +
      'Temporary override: DEPLOY_WALL_ALLOW_UNSAFE_DATA_DIR=1'
    );
  }

  if (isProduction) {
    console.warn(msg);
  }
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
  if (deployWallEnabled && isProduction && !deployWallAllowEmptyDb) {
    throw new Error(
      `[preflight] Refusing to create a new production DB at ${dbPath}. ` +
      'This prevents a silent blank database boot after a bad deploy or volume issue. ' +
      'Restore data first, or set DEPLOY_WALL_ALLOW_EMPTY_DB=1 for an intentional first boot.'
    );
  }
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

if (deployWallEnabled && isProduction) {
  console.log(`[preflight] Deploy wall active (DATA_DIR=${dataDir})`);
}

const major = Number(process.versions.node.split('.')[0]);
if (major !== 20) {
  console.warn(`[preflight] Recommended Node 20.x for stability. Current: ${process.version}`);
  console.warn('[preflight] Run: nvm use 20');
}

console.log('[preflight] OK');
