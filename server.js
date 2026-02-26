import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.join(ROOT_DIR, 'data');
const DATA_DIR = process.env.DATA_DIR || DEFAULT_DATA_DIR;
const DB_PATH = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_DB_BACKUPS_RAW = Number.parseInt(process.env.MAX_DB_BACKUPS || '60', 10);
const MAX_DB_BACKUPS = Number.isFinite(MAX_DB_BACKUPS_RAW)
  ? Math.max(10, Math.min(500, MAX_DB_BACKUPS_RAW))
  : 60;
const SNAPSHOT_FILE_RE = /^db-[a-z0-9T:\-\.]+(?:--[a-z0-9\-]+)?\.json$/i;
const IMPORT_AUDIT_PATH = path.join(DATA_DIR, 'import_audit.json');
const MAX_IMPORT_AUDIT_ROWS = 500;
const SCHEDULE_PATH = path.join(DATA_DIR, 'schedule_2026.json');
const GRID_PATH = path.join(DATA_DIR, 'current_grid.json');
const SCHEDULE_FALLBACK_PATH = path.join(DEFAULT_DATA_DIR, 'schedule_2026.json');
const GRID_FALLBACK_PATH = path.join(DEFAULT_DATA_DIR, 'current_grid.json');
const SCHEDULE_FILE_RE = /^schedule_(\d{4})\.json$/;
const OPENF1_BASE_URL = process.env.OPENF1_BASE_URL || 'https://api.openf1.org/v1';
const OPENF1_TIMEOUT_PARSED = Number.parseInt(process.env.OPENF1_TIMEOUT_MS || '20000', 10);
const OPENF1_TIMEOUT_MS = Number.isFinite(OPENF1_TIMEOUT_PARSED) ? OPENF1_TIMEOUT_PARSED : 20000;
const PICKS_LOCK_TIME_ZONE = process.env.PICKS_LOCK_TIME_ZONE || 'America/Chicago';
const RAILWAY_ENVIRONMENT_NAME = String(process.env.RAILWAY_ENVIRONMENT_NAME || '').trim();
const IS_RAILWAY_RUNTIME = Boolean(
  process.env.RAILWAY_PROJECT_ID ||
  process.env.RAILWAY_ENVIRONMENT_ID ||
  process.env.RAILWAY_SERVICE_ID ||
  process.env.RAILWAY_STATIC_URL
);
const IS_PRODUCTION_RUNTIME =
  String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production' ||
  RAILWAY_ENVIRONMENT_NAME.toLowerCase() === 'production';
const ENFORCE_PERSISTENT_DATA_DIR = toBool(process.env.ENFORCE_PERSISTENT_DATA_DIR || process.env.DEPLOY_WALL_ENFORCE_PERSISTENT_DATA_DIR);
const ALLOW_DEMO_ENDPOINTS = process.env.ALLOW_DEMO_ENDPOINTS === undefined
  ? !IS_PRODUCTION_RUNTIME
  : toBool(process.env.ALLOW_DEMO_ENDPOINTS);
const PICKS_LOCK_DATE_OVERRIDES = {
  2026: '2026-03-06'
};

const DRIVER_TEAM_ORDER_BY_SEASON = {
  2025: [
    'McLaren',
    'Mercedes',
    'Red Bull Racing',
    'Ferrari',
    'Williams',
    'Racing Bulls',
    'Aston Martin',
    'Haas F1 Team',
    'Kick Sauber',
    'Alpine'
  ],
  2026: [
    'McLaren',
    'Mercedes',
    'Red Bull Racing',
    'Ferrari',
    'Williams',
    'Racing Bulls',
    'Aston Martin',
    'Haas F1 Team',
    'Audi',
    'Alpine',
    'Cadillac'
  ]
};

const DEFAULT_DRIVER_TEAM_ORDER = DRIVER_TEAM_ORDER_BY_SEASON[2026];

const SIDE_BET_DEFS = {
  poleConverts: { pickField: 'sidebet_pole_converts', scoreField: 'score_sidebet_pole_converts', points: 1, bucket: 'stable' },
  frontRowWinner: { pickField: 'sidebet_front_row_winner', scoreField: 'score_sidebet_front_row_winner', points: 1, bucket: 'stable' },
  anyDnf: { pickField: 'sidebet_any_dnf', scoreField: 'score_sidebet_any_dnf', points: 1, bucket: 'stable' },
  redFlag: { pickField: 'sidebet_red_flag', scoreField: 'score_sidebet_red_flag', points: 2, bucket: 'chaos' },
  bigMover: { pickField: 'sidebet_big_mover', scoreField: 'score_sidebet_big_mover', points: 2, bucket: 'chaos' },
  other7Podium: { pickField: 'sidebet_other7_podium', scoreField: 'score_sidebet_other7_podium', points: 2, bucket: 'chaos' }
};

const SIDE_BET_KEYS = Object.keys(SIDE_BET_DEFS);
const SIDE_BET_PICK_FIELDS = SIDE_BET_KEYS.map((key) => SIDE_BET_DEFS[key].pickField);
const SIDE_BET_SCORE_FIELDS = SIDE_BET_KEYS.map((key) => SIDE_BET_DEFS[key].scoreField);
const TOP4_TEAMS = new Set(['McLaren', 'Mercedes', 'Red Bull Racing', 'Ferrari']);

const SEASON_STANDINGS_SCORING = Object.freeze({
  wdcExact: 5,
  wdcWithin1: 3,
  wdcWithin3: 1,
  wccExact: 6
});

const WEEKLY_PICK_SCORING = Object.freeze({
  p1: 1,
  p2: 1,
  p3: 1,
  pole: 1,
  fastestLap: 1,
  wildcardTop10: 1,
  lockBonus: 1,
  podiumExactPerSlot: 2
});

const SEASON_NON_STANDING_FIELD_POINTS = Object.freeze({
  'wdc_bonus.wins': 4,
  'wdc_bonus.poles': 4,
  'wdc_bonus.margin': 4,
  'wdc_bonus.before': 4,

  'wcc_bonus.margin': 4,
  'wcc_bonus.over': 4,
  'wcc_bonus.under': 4,

  'out_of_box.podium': 4,
  'out_of_box.improved': 4,
  'out_of_box.rookie': 4,
  'out_of_box.wet': 4,
  'out_of_box.meme': 4,

  'chaos.tp': 10,
  'chaos.swap': 10,
  'chaos.upgrade': 4,
  'chaos.weekend': 4,
  'chaos.quote': 4,

  'big_brain.nails': 4,
  'big_brain.wrong': 4,
  'big_brain.bestStrat': 4,
  'big_brain.worstStrat': 4,

  'bingo.winners': 4,
  'bingo.podiums': 4,
  'bingo.sc': 4,
  'bingo.rf': 4,

  'curses.unlucky': 4,
  'curses.lucky': 4,
  'curses.rakes': 4
});

const SEASON_NON_STANDING_FIELDS = Object.freeze([
  'wdc_bonus.wins',
  'wdc_bonus.poles',
  'wdc_bonus.margin',
  'wdc_bonus.before',
  'wcc_bonus.margin',
  'wcc_bonus.over',
  'wcc_bonus.under',
  'out_of_box.podium',
  'out_of_box.improved',
  'out_of_box.rookie',
  'out_of_box.wet',
  'out_of_box.meme',
  'chaos.tp',
  'chaos.swap',
  'chaos.upgrade',
  'chaos.weekend',
  'chaos.quote',
  'big_brain.nails',
  'big_brain.wrong',
  'big_brain.bestStrat',
  'big_brain.worstStrat',
  'bingo.winners',
  'bingo.podiums',
  'bingo.sc',
  'bingo.rf',
  'curses.unlucky',
  'curses.lucky',
  'curses.rakes'
]);

const MISSING_SEASON_POINT_FIELDS = SEASON_NON_STANDING_FIELDS.filter(
  (field) => !Object.prototype.hasOwnProperty.call(SEASON_NON_STANDING_FIELD_POINTS, field)
);
if (MISSING_SEASON_POINT_FIELDS.length) {
  throw new Error(`Missing season point mapping for fields: ${MISSING_SEASON_POINT_FIELDS.join(', ')}`);
}

const SEASON_NON_STANDING_FIELD_LABELS = Object.freeze({
  'wdc_bonus.wins': "Champion's total wins",
  'wdc_bonus.poles': "Champion's total poles",
  'wdc_bonus.margin': 'Title margin (closest without going over)',
  'wdc_bonus.before': 'Gets a win before ____ happens',
  'wcc_bonus.margin': 'Dominant team wins by (points)',
  'wcc_bonus.over': 'Biggest overperformer team',
  'wcc_bonus.under': 'Biggest underperformer team',
  'out_of_box.podium': 'Unexpected podium finisher',
  'out_of_box.improved': 'Most improved driver vs prior season',
  'out_of_box.rookie': 'Rookie moment of the year',
  'out_of_box.wet': 'Best wet-weather drive',
  'out_of_box.meme': 'Top driver meme',
  'chaos.tp': 'First team principal firing',
  'chaos.swap': 'First driver swap (mid-season)',
  'chaos.upgrade': 'First major upgrade that changes everything',
  'chaos.weekend': 'Most chaotic weekend',
  'chaos.quote': 'Team radio quote of the year',
  'big_brain.nails': 'One team nails the regs early',
  'big_brain.wrong': 'One team gets it wrong until mid-season',
  'big_brain.bestStrat': 'Best strategist team',
  'big_brain.worstStrat': 'Most painful strategy team',
  'bingo.winners': 'Different race winners',
  'bingo.podiums': 'First-time podiums',
  'bingo.sc': 'Safety cars (season)',
  'bingo.rf': 'Red flags (season)',
  'curses.unlucky': 'Unluckiest driver',
  'curses.lucky': 'Luckiest driver',
  'curses.rakes': 'Cannot stop stepping on rakes award'
});

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(ROOT_DIR, 'public')));

function seededRandom(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

function seedDemoData(roundCount = 8) {
  const schedule = loadSchedule();
  const grid = loadCurrentGrid();
  const rand = seededRandom(7);

  const drivers = grid.map(g => ({
    driverId: `drv_${slugify(g.driverName)}`,
    driverName: g.driverName,
    code: null,
    nationality: null
  }));

  const races = schedule.slice(0, roundCount).map(r => ({
    season: 2026,
    round: r.round,
    raceName: r.raceName,
    date: r.start_date
  }));

  const shuffle = (arr) => {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };

  const qualifying_results = [];
  const race_results = [];

  for (const race of races) {
    const order = shuffle(drivers);
    order.forEach((d, idx) => {
      qualifying_results.push({
        season: 2026,
        round: race.round,
        driverId: d.driverId,
        position: idx + 1
      });
    });

    const order2 = shuffle(drivers);
    order2.forEach((d, idx) => {
      let points = 0;
      if (idx === 0) points = 25;
      else if (idx === 1) points = 18;
      else if (idx === 2) points = 15;
      else if (idx === 3) points = 12;
      else if (idx === 4) points = 10;
      else if (idx === 5) points = 8;
      else if (idx === 6) points = 6;
      else if (idx === 7) points = 4;
      else if (idx === 8) points = 2;
      else if (idx === 9) points = 1;
      const fastest = idx === 4 ? 1 : null;
      race_results.push({
        season: 2026,
        round: race.round,
        driverId: d.driverId,
        position: idx + 1,
        points,
        fastestLapRank: fastest,
        grid: idx + 1,
        laps: 58,
        status: 'Finished'
      });
    });
  }

  const race_actuals = races.map(r => {
    const pole = qualifying_results.find(q => q.round === r.round && q.position === 1);
    const p1 = race_results.find(rr => rr.round === r.round && rr.position === 1);
    const p2 = race_results.find(rr => rr.round === r.round && rr.position === 2);
    const p3 = race_results.find(rr => rr.round === r.round && rr.position === 3);
    const fl = race_results.find(rr => rr.round === r.round && rr.fastestLapRank === 1);
    return {
      season: 2026,
      round: r.round,
      pole_driver_id: pole?.driverId || null,
      p1_driver_id: p1?.driverId || null,
      p2_driver_id: p2?.driverId || null,
      p3_driver_id: p3?.driverId || null,
      fastest_lap_driver_id: fl?.driverId || null,
      updated_at: new Date().toISOString()
    };
  });

  const users = getConfiguredUsers();
  const predictions = [];
  let predId = 1;

  for (const race of races) {
    const qual = qualifying_results.filter(q => q.round === race.round).sort((a, b) => a.position - b.position);
    const results = race_results.filter(rr => rr.round === race.round).sort((a, b) => a.position - b.position);
    for (const user of users) {
      const offset = user === users[0] ? 0 : 1;
      const picks = {
        p1_driver_id: qual[(0 + offset) % qual.length].driverId,
        p2_driver_id: qual[(1 + offset) % qual.length].driverId,
        p3_driver_id: qual[(2 + offset) % qual.length].driverId,
        pole_driver_id: qual[0].driverId,
        fastest_lap_driver_id: results[4].driverId,
        wildcard_driver_id: null,
        wildcard_text: 'Demo wildcard',
        lock_field: race.round % 2 === 0 ? 'p1' : 'pole',
        sidebet_pole_converts: rand() > 0.5,
        sidebet_front_row_winner: rand() > 0.5,
        sidebet_any_dnf: rand() > 0.5,
        sidebet_red_flag: rand() > 0.5,
        sidebet_big_mover: rand() > 0.5,
        sidebet_other7_podium: rand() > 0.5
      };

      const actual = race_actuals.find(a => a.round === race.round);
      let s1 = picks.p1_driver_id === actual.p1_driver_id ? 1 : 0;
      let s2 = picks.p2_driver_id === actual.p2_driver_id ? 1 : 0;
      let s3 = picks.p3_driver_id === actual.p3_driver_id ? 1 : 0;
      const sp = picks.pole_driver_id === actual.pole_driver_id ? 1 : 0;
      const sf = picks.fastest_lap_driver_id === actual.fastest_lap_driver_id ? 1 : 0;
      const podium_exact = s1 && s2 && s3 ? 1 : 0;
      if (podium_exact) {
        s1 = 2; s2 = 2; s3 = 2;
      }
      const lock_bonus = (picks.lock_field === 'p1' && s1 > 0) || (picks.lock_field === 'pole' && sp > 0) ? 1 : 0;
      const total = s1 + s2 + s3 + sp + sf + lock_bonus;

      predictions.push({
        id: predId++,
        user,
        season: 2026,
        round: race.round,
        ...picks,
        score_p1: s1,
        score_p2: s2,
        score_p3: s3,
        score_pole: sp,
        score_fastest_lap: sf,
        score_wildcard: 0,
        score_lock: lock_bonus,
        score_sidebet_pole_converts: 0,
        score_sidebet_front_row_winner: 0,
        score_sidebet_any_dnf: 0,
        score_sidebet_red_flag: 0,
        score_sidebet_big_mover: 0,
        score_sidebet_other7_podium: 0,
        score_sidebets_total: 0,
        podium_exact,
        score_total: total,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }
  }

  const season_predictions = users.map((user, idx) => ({
    user,
    season: 2026,
    driver_champion_id: drivers[idx % drivers.length].driverId,
    constructor_champion: grid[idx % grid.length].team,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }));

  const db = {
    drivers,
    races,
    qualifying_results,
    qualifying_timing: [],
    practice_timing: [],
    testing_timing: [],
    race_results,
    race_timing: [],
    race_actuals,
    predictions,
    season_predictions
  };

  updateAllPredictionScores(db);
  saveDb(db);
}

function shuffleWithRand(items, rand) {
  const copy = [...(items || [])];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickWithRand(items, rand, fallback = null) {
  if (!items || !items.length) return fallback;
  const index = Math.floor(rand() * items.length);
  return items[index];
}

function padToLength(items, length, fillValue = null) {
  const out = [...(items || [])];
  while (out.length < length) out.push(fillValue);
  return out.slice(0, length);
}

function seedDemoSeasonPicks(data, season, users = getConfiguredUsers()) {
  const grid = resolveGridDrivers(data, season)
    .filter((row) => row && row.driverId)
    .map((row) => ({
      driverId: row.driverId,
      driverName: row.driverName || row.driverId,
      team: displayTeamName(row.team)
    }));

  if (!grid.length) {
    throw fail('No drivers available for selected season', 400);
  }

  const uniqueDrivers = [...new Map(grid.map((row) => [row.driverId, row])).values()];
  const driverIds = uniqueDrivers.map((row) => row.driverId);
  const teamsInGrid = new Set(uniqueDrivers.map((row) => displayTeamName(row.team)).filter(Boolean));

  const orderedTeams = [];
  for (const team of getDriverTeamOrder(season)) {
    const normalized = displayTeamName(team);
    if (teamsInGrid.has(normalized) && !orderedTeams.includes(normalized)) orderedTeams.push(normalized);
  }

  for (const team of [...teamsInGrid].sort((a, b) => a.localeCompare(b))) {
    if (!orderedTeams.includes(team)) orderedTeams.push(team);
  }

  const rand = seededRandom((season * 97) + 23);
  const now = new Date().toISOString();
  const rookieDriver = uniqueDrivers.find((row) => String(row.driverName).toLowerCase().includes('lindblad')) || uniqueDrivers[0];

  const randomDriverId = () => pickWithRand(uniqueDrivers, rand, uniqueDrivers[0])?.driverId || null;
  const randomTeam = () => pickWithRand(orderedTeams, rand, orderedTeams[0] || null);
  const randomIntString = (max) => String(1 + Math.floor(rand() * max));
  const randomText = (values) => pickWithRand(values, rand, 'Demo call');

  const chaosTp = ['Fred Vasseur', 'Andrea Stella', 'Toto Wolff', 'Christian Horner'];
  const chaosSwap = ['Reserve driver in by Round 5', 'Mid-season rookie promotion', 'Veteran recalled by summer break'];
  const chaosWeekend = ['Monaco', 'Singapore', 'Las Vegas', 'Brazil'];
  const chaosQuote = ['Plan C now', 'Box this lap', 'Push now', 'Tell him to push'];
  const memeLine = ['Tyre whisperer', 'Radio king', 'Chaos merchant', 'Saturday specialist'];
  const beforeLine = ['summer break', 'Monaco', 'round 10', 'European leg'];

  for (const user of users) {
    let row = data.season_predictions.find((item) => item.user === user && item.season === season);
    if (!row) {
      row = { user, season, created_at: now };
      data.season_predictions.push(row);
    }

    const wdcOrder = padToLength(shuffleWithRand(driverIds, rand), 22, null);
    const wccOrder = padToLength(shuffleWithRand(orderedTeams, rand), 11, null);

    row.driver_champion_id = wdcOrder[0] || randomDriverId();
    row.constructor_champion = wccOrder[0] || randomTeam();
    row.wdc_order = wdcOrder;
    row.wcc_order = wccOrder;
    row.wdc_bonus = {
      wins: randomIntString(24),
      poles: randomIntString(24),
      margin: randomIntString(150),
      before: randomText(beforeLine)
    };
    row.wcc_bonus = {
      margin: randomIntString(40),
      over: randomTeam(),
      under: randomTeam()
    };
    row.out_of_box = {
      podium: randomDriverId(),
      improved: randomDriverId(),
      rookie: rookieDriver?.driverId || randomDriverId(),
      wet: randomDriverId(),
      meme: randomText(memeLine)
    };
    row.chaos = {
      tp: randomText(chaosTp),
      swap: randomText(chaosSwap),
      upgrade: randomTeam(),
      weekend: randomText(chaosWeekend),
      quote: randomText(chaosQuote)
    };
    row.big_brain = {
      nails: randomTeam(),
      wrong: randomTeam(),
      bestStrat: randomTeam(),
      worstStrat: randomTeam()
    };
    row.bingo = {
      winners: randomIntString(40),
      podiums: randomIntString(40),
      sc: randomIntString(40),
      rf: randomIntString(40)
    };
    row.curses = {
      unlucky: randomDriverId(),
      lucky: randomDriverId(),
      rakes: randomDriverId()
    };
    row.updated_at = now;
  }

  return users;
}

function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    return {
      drivers: [],
      driver_seasons: [],
      races: [],
      qualifying_results: [],
      qualifying_timing: [],
      practice_timing: [],
      testing_timing: [],
      race_results: [],
      race_timing: [],
      race_actuals: [],
      predictions: [],
      season_predictions: []
    };
  }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!data.qualifying_timing) data.qualifying_timing = [];
  if (!data.practice_timing) data.practice_timing = [];
  if (!data.testing_timing) data.testing_timing = [];
  if (!data.race_timing) data.race_timing = [];
  if (!data.season_predictions) data.season_predictions = [];
  if (!Array.isArray(data.driver_seasons)) data.driver_seasons = [];

  for (const actual of data.race_actuals || []) {
    if (!('red_flag' in actual)) actual.red_flag = null;
    else actual.red_flag = toBoolNullable(actual.red_flag);
  }

  for (const pred of data.predictions || []) {
    if (!('wildcard_text' in pred)) pred.wildcard_text = '';
    if (!('lock_field' in pred)) pred.lock_field = null;
    if (!('score_lock' in pred)) pred.score_lock = 0;
    if (!('podium_exact' in pred)) pred.podium_exact = 0;

    if (!('sidebet_pole_converts' in pred)) pred.sidebet_pole_converts = null;
    if (!('sidebet_front_row_winner' in pred)) pred.sidebet_front_row_winner = null;
    if (!('sidebet_any_dnf' in pred)) pred.sidebet_any_dnf = null;
    if (!('sidebet_red_flag' in pred)) pred.sidebet_red_flag = null;
    if (!('sidebet_big_mover' in pred)) pred.sidebet_big_mover = null;
    if (!('sidebet_other7_podium' in pred)) pred.sidebet_other7_podium = ('sidebet_double_dnf' in pred) ? pred.sidebet_double_dnf : null;

    pred.sidebet_pole_converts = toBoolNullable(pred.sidebet_pole_converts);
    pred.sidebet_front_row_winner = toBoolNullable(pred.sidebet_front_row_winner);
    pred.sidebet_any_dnf = toBoolNullable(pred.sidebet_any_dnf);
    pred.sidebet_red_flag = toBoolNullable(pred.sidebet_red_flag);
    pred.sidebet_big_mover = toBoolNullable(pred.sidebet_big_mover);
    pred.sidebet_other7_podium = toBoolNullable(pred.sidebet_other7_podium);

    if (!('score_sidebet_pole_converts' in pred)) pred.score_sidebet_pole_converts = 0;
    if (!('score_sidebet_front_row_winner' in pred)) pred.score_sidebet_front_row_winner = 0;
    if (!('score_sidebet_any_dnf' in pred)) pred.score_sidebet_any_dnf = 0;
    if (!('score_sidebet_red_flag' in pred)) pred.score_sidebet_red_flag = 0;
    if (!('score_sidebet_big_mover' in pred)) pred.score_sidebet_big_mover = 0;
    if (!('score_sidebet_other7_podium' in pred)) pred.score_sidebet_other7_podium = ('score_sidebet_double_dnf' in pred) ? Number(pred.score_sidebet_double_dnf || 0) : 0;
    if (!('score_sidebets_total' in pred)) pred.score_sidebets_total = 0;
  }
  for (const sp of data.season_predictions || []) {
    if (!('wdc_order' in sp)) sp.wdc_order = [];
    if (!('wcc_order' in sp)) sp.wcc_order = [];
    if (!('wdc_bonus' in sp)) sp.wdc_bonus = {};
    if (!('wcc_bonus' in sp)) sp.wcc_bonus = {};
    if (!('out_of_box' in sp)) sp.out_of_box = {};
    if (!('chaos' in sp)) sp.chaos = {};
    if (!('breakouts' in sp)) sp.breakouts = {};
    if (!('big_brain' in sp)) sp.big_brain = {};
    if (!('bingo' in sp)) sp.bingo = {};
    if (!('curses' in sp)) sp.curses = {};
    if (!('adjudication' in sp)) sp.adjudication = {};
  }
  return data;
}

function ensureStorageDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function snapshotReasonSuffix(reason = 'auto') {
  const normalized = String(reason || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  if (!normalized || normalized === 'auto') return '';
  return '--' + normalized;
}

function buildSnapshotName(reason = 'auto') {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  return `db-${ts}${snapshotReasonSuffix(reason)}.json`;
}

function normalizeSnapshotName(name) {
  const value = String(name || '').trim();
  if (!SNAPSHOT_FILE_RE.test(value) || value.includes('/') || value.includes('\\')) {
    throw fail('Invalid snapshot name', 400);
  }
  return value;
}

function pruneSnapshots() {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter((name) => SNAPSHOT_FILE_RE.test(name))
    .sort();

  while (backups.length > MAX_DB_BACKUPS) {
    const oldest = backups.shift();
    fs.unlinkSync(path.join(BACKUP_DIR, oldest));
  }
}

function createDbSnapshot(reason = 'auto') {
  ensureStorageDirs();
  if (!fs.existsSync(DB_PATH)) return null;

  const snapshotName = buildSnapshotName(reason);
  const snapshotPath = path.join(BACKUP_DIR, snapshotName);
  fs.copyFileSync(DB_PATH, snapshotPath);
  pruneSnapshots();
  return snapshotName;
}

function hashFileSha256(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function listSnapshots() {
  if (!fs.existsSync(BACKUP_DIR)) return [];

  return fs.readdirSync(BACKUP_DIR)
    .filter((name) => SNAPSHOT_FILE_RE.test(name))
    .sort()
    .reverse()
    .map((name) => {
      const fullPath = path.join(BACKUP_DIR, name);
      const stat = fs.statSync(fullPath);
      const createdAt = stat.mtime.toISOString();
      const ageHours = (Date.now() - stat.mtime.getTime()) / 3600000;
      return {
        name,
        sizeBytes: stat.size,
        createdAt,
        ageHours: Number(ageHours.toFixed(2)),
        sha256: hashFileSha256(fullPath)
      };
    });
}

function writeDbRaw(raw) {
  ensureStorageDirs();
  const tmpPath = DB_PATH + '.tmp';
  fs.writeFileSync(tmpPath, raw);
  fs.renameSync(tmpPath, DB_PATH);
}

function restoreDbSnapshot(snapshotName) {
  const name = normalizeSnapshotName(snapshotName);
  const snapshotPath = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(snapshotPath)) throw fail('Snapshot not found', 404);

  const raw = fs.readFileSync(snapshotPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw fail('Snapshot JSON is invalid', 400);
  }

  if (!parsed || typeof parsed !== 'object') {
    throw fail('Snapshot payload is invalid', 400);
  }

  const rollbackGuard = createDbSnapshot('pre-rollback');
  writeDbRaw(JSON.stringify(parsed, null, 2));
  return { restoredSnapshot: name, rollbackGuard };
}

function saveDb(data) {
  ensureStorageDirs();
  createDbSnapshot('auto-save');
  writeDbRaw(JSON.stringify(data, null, 2));
}

function getStorageSafetyStatus() {
  const resolvedRoot = path.resolve(ROOT_DIR);
  const resolvedDefaultData = path.resolve(DEFAULT_DATA_DIR);
  const resolvedData = path.resolve(DATA_DIR);
  const insideAppDir = resolvedData === resolvedRoot || resolvedData.startsWith(resolvedRoot + path.sep);
  const usesRecommendedVolumePath = resolvedData === '/data' || resolvedData.startsWith('/data/');
  const likelyEphemeralOnRailway = IS_RAILWAY_RUNTIME && (resolvedData === resolvedDefaultData || insideAppDir) && !usesRecommendedVolumePath;

  return {
    isRailway: IS_RAILWAY_RUNTIME,
    isProduction: IS_PRODUCTION_RUNTIME,
    railwayEnvironment: RAILWAY_ENVIRONMENT_NAME || null,
    dataDir: DATA_DIR,
    resolvedDataDir: resolvedData,
    dbPath: DB_PATH,
    defaultDataDir: DEFAULT_DATA_DIR,
    usesRecommendedVolumePath,
    likelyEphemeralOnRailway,
    enforcePersistentDataDir: ENFORCE_PERSISTENT_DATA_DIR,
    allowDemoEndpoints: ALLOW_DEMO_ENDPOINTS,
    recommended: {
      dataDir: '/data',
      railwayVolumeMountPath: '/data',
      envVar: 'DATA_DIR=/data'
    }
  };
}

function logStorageSafetyWarningIfNeeded() {
  const storage = getStorageSafetyStatus();
  if (!storage.likelyEphemeralOnRailway) return;

  const message = [
    '[storage] WARNING: DATA_DIR appears to be on ephemeral app storage in Railway.',
    `[storage] Current DATA_DIR: ${storage.dataDir}`,
    '[storage] To protect picks, mount a Railway volume at /data and set DATA_DIR=/data.'
  ].join('\n');

  if (ENFORCE_PERSISTENT_DATA_DIR) {
    throw new Error(`${message}\n[storage] Startup blocked because ENFORCE_PERSISTENT_DATA_DIR=1.`);
  }

  console.warn(message);
}

function buildStoragePersistenceCheck() {
  const storage = getStorageSafetyStatus();

  if (!storage.isRailway) {
    return {
      id: 'storage_persistence',
      label: 'Storage persistence',
      status: 'ok',
      ok: true,
      message: `Local/runtime data path: ${storage.dataDir}`,
      details: storage
    };
  }

  if (storage.likelyEphemeralOnRailway) {
    return {
      id: 'storage_persistence',
      label: 'Storage persistence',
      status: storage.isProduction ? 'fail' : 'warn',
      ok: !storage.isProduction,
      message: 'DATA_DIR looks ephemeral on Railway. Mount a volume at /data and set DATA_DIR=/data.',
      details: storage
    };
  }

  return {
    id: 'storage_persistence',
    label: 'Storage persistence',
    status: 'ok',
    ok: true,
    message: `Persistent data path configured: ${storage.dataDir}`,
    details: storage
  };
}

function createPreWriteSnapshot(reason = 'pre-write') {
  try {
    return createDbSnapshot(reason);
  } catch (error) {
    console.error('[snapshot]', 'pre-write snapshot failed:', error?.message || error);
    return null;
  }
}

function createPostWriteSnapshot(reason = 'post-write') {
  try {
    return createDbSnapshot(reason);
  } catch (error) {
    console.error('[snapshot]', 'post-write snapshot failed:', error?.message || error);
    return null;
  }
}

function assertDemoEndpointsAllowed() {
  if (ALLOW_DEMO_ENDPOINTS) return;
  throw fail('Demo endpoints are disabled in production.', 403);
}

function loadImportAudit() {
  if (!fs.existsSync(IMPORT_AUDIT_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(IMPORT_AUDIT_PATH, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveImportAudit(rows) {
  ensureStorageDirs();
  const trimmed = (Array.isArray(rows) ? rows : []).slice(0, MAX_IMPORT_AUDIT_ROWS);
  const tmpPath = IMPORT_AUDIT_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(trimmed, null, 2));
  fs.renameSync(tmpPath, IMPORT_AUDIT_PATH);
}

function appendImportAudit(entry) {
  const rows = loadImportAudit();
  rows.unshift({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    source: 'unknown',
    action: 'unknown',
    season: null,
    round: null,
    changedRows: {},
    ...entry
  });
  saveImportAudit(rows);
}

function loadSchedule() {
  const searchDirs = [DATA_DIR];
  if (DEFAULT_DATA_DIR !== DATA_DIR) searchDirs.push(DEFAULT_DATA_DIR);

  const rowsByKey = new Map();

  for (const dir of searchDirs) {
    if (!fs.existsSync(dir)) continue;

    const files = fs.readdirSync(dir)
      .filter((name) => SCHEDULE_FILE_RE.test(name))
      .sort();

    for (const file of files) {
      const fullPath = path.join(dir, file);
      let parsed;
      try {
        parsed = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch {
        continue;
      }

      if (!Array.isArray(parsed)) continue;

      const fromName = Number.parseInt((file.match(SCHEDULE_FILE_RE) || [])[1] || '', 10);
      for (const row of parsed) {
        const season = toInt(row && row.season) || (Number.isFinite(fromName) ? fromName : null);
        const round = toInt(row && row.round);
        if (!season || !round) continue;

        rowsByKey.set(season + ':' + round, {
          season,
          round,
          raceName: String((row && (row.raceName || row.meeting_name)) || ('Round ' + round)),
          start_date: String((row && (row.start_date || row.date)) || '').slice(0, 10) || null,
          end_date: String((row && (row.end_date || row.start_date || row.date)) || '').slice(0, 10) || null
        });
      }
    }
  }

  return [...rowsByKey.values()]
    .filter((row) => row.start_date)
    .sort((a, b) => a.season - b.season || a.round - b.round);
}


function dateYmdInTimeZone(date = new Date(), timeZone = PICKS_LOCK_TIME_ZONE) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);

    const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (byType.year && byType.month && byType.day) {
      return `${byType.year}-${byType.month}-${byType.day}`;
    }
  } catch {
    // Fallback to UTC date if timezone conversion is unavailable.
  }

  return date.toISOString().slice(0, 10);
}

function seasonPickLockDate(season) {
  const override = PICKS_LOCK_DATE_OVERRIDES[season] || PICKS_LOCK_DATE_OVERRIDES[String(season)];
  if (override) return String(override).slice(0, 10);

  const firstRace = loadSchedule()
    .filter((row) => row.season === season && row.start_date)
    .sort((a, b) => a.round - b.round)[0];

  return firstRace ? firstRace.start_date : null;
}

function getSeasonPickLockStatus(season, now = new Date()) {
  const lockDate = seasonPickLockDate(season);
  const today = dateYmdInTimeZone(now, PICKS_LOCK_TIME_ZONE);
  const locked = Boolean(lockDate && today >= lockDate);

  return {
    season,
    locked,
    lockDate,
    today,
    timezone: PICKS_LOCK_TIME_ZONE
  };
}

function loadCurrentGrid(season = 2026) {
  const seasonPath = path.join(DATA_DIR, 'current_grid_' + season + '.json');
  const seasonFallbackPath = path.join(DEFAULT_DATA_DIR, 'current_grid_' + season + '.json');

  const candidates = [seasonPath, seasonFallbackPath];
  if (season === 2026) {
    candidates.push(GRID_PATH, GRID_FALLBACK_PATH);
  }

  const candidate = candidates.find((filePath) => fs.existsSync(filePath));
  if (!candidate) return [];

  try {
    const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadConfig() {
  let configPath = path.join(ROOT_DIR, 'config.json');
  if (!fs.existsSync(configPath)) {
    configPath = path.join(process.cwd(), 'config.json');
  }
  if (!fs.existsSync(configPath)) {
    throw fail('config.json not found in project root', 500);
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const cfg = JSON.parse(raw);
  const users = (cfg.users || []).map(u => {
    if (typeof u === 'string') return { name: u, pin: '' };
    return { name: u.name, pin: u.pin || '' };
  }).filter(u => u.name);

  return { ...cfg, users };
}


function toInt(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number.parseInt(val, 10);
  return Number.isNaN(n) ? null : n;
}

function toFloat(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number.parseFloat(val);
  return Number.isNaN(n) ? null : n;
}


function toBool(val) {
  if (val === true || val === false) return val;
  if (val === undefined || val === null) return false;
  const raw = String(val).trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'y';
}

function toBoolNullable(val) {
  if (val === true || val === false) return val;
  if (val === undefined || val === null || val === '') return null;
  const raw = String(val).trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'y') return true;
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'n') return false;
  return null;
}

function parseLapTimeToMs(val) {
  if (val === undefined || val === null || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val) : null;

  const raw = String(val).trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number.parseInt(raw, 10);

  const minuteMatch = raw.match(/^(\d+):(\d{1,2})\.(\d{1,3})$/);
  if (minuteMatch) {
    const min = Number.parseInt(minuteMatch[1], 10);
    const sec = Number.parseInt(minuteMatch[2], 10);
    const ms = Number.parseInt(minuteMatch[3].padEnd(3, '0').slice(0, 3), 10);
    return (min * 60 * 1000) + (sec * 1000) + ms;
  }

  const secMatch = raw.match(/^(\d+)\.(\d{1,3})$/);
  if (secMatch) {
    const sec = Number.parseInt(secMatch[1], 10);
    const ms = Number.parseInt(secMatch[2].padEnd(3, '0').slice(0, 3), 10);
    return (sec * 1000) + ms;
  }

  return null;
}


function stripDiacritics(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeLoose(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function raceNameTokens(value) {
  const cleaned = normalizeLoose(value)
    .replace(/\b(formula|f1|grand|prix|airways|qatar|aramco|crypto|louis|vuitton|microsoft|aws|msc|lenovo)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];
  return cleaned.split(' ').filter((token) => token.length > 1);
}

function overlapRatio(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  let overlap = 0;
  for (const token of aTokens) {
    if (bSet.has(token)) overlap += 1;
  }
  return overlap / aTokens.length;
}

function toEpochMs(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isNaN(ms) ? null : ms;
}

function parseOpenF1SecondsToMs(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 1000);
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const numeric = Number.parseFloat(raw);
  if (Number.isFinite(numeric) && /^[-+]?\d+(?:\.\d+)?$/.test(raw)) {
    return Math.round(numeric * 1000);
  }

  const hms = raw.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (hms) {
    const hours = Number.parseInt(hms[1], 10);
    const minutes = Number.parseInt(hms[2], 10);
    const seconds = Number.parseFloat(hms[3]);
    return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
  }

  return parseLapTimeToMs(raw);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferPositionAtTimestamp(rows, targetEpochMs) {
  if (!Array.isArray(rows) || !rows.length || targetEpochMs === null || targetEpochMs === undefined) {
    return null;
  }

  let latest = null;
  for (const row of rows) {
    if (row.epoch_ms <= targetEpochMs) {
      latest = row.position;
    } else {
      break;
    }
  }

  return latest !== null && latest !== undefined ? latest : (rows[0]?.position ?? null);
}

async function fetchOpenF1(resource, params = {}, retries = 3) {
  const url = new URL(OPENF1_BASE_URL + '/' + resource);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OPENF1_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        const body = await res.text();

        if (res.status === 429 && attempt < retries) {
          await sleep(1000 + (attempt * 800));
          continue;
        }

        throw fail('OpenF1 ' + resource + ' failed (' + res.status + '): ' + (body || 'no response body'), 502);
      }

      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    } catch (error) {
      clearTimeout(timeout);
      if (attempt >= retries) {
        const message = error?.name === 'AbortError'
          ? ('OpenF1 ' + resource + ' timed out')
          : (error?.message || ('OpenF1 ' + resource + ' request failed'));
        throw fail(message, 502);
      }

      await sleep(400 + (attempt * 300));
    }
  }

  throw fail('OpenF1 ' + resource + ' unavailable', 502);
}

function selectOpenF1Meeting(meetings, season, round, scheduleRow) {
  const raceMeetings = (meetings || [])
    .filter((m) => m.year === season)
    .filter((m) => !isTestingMeeting(m))
    .sort((a, b) => toEpochMs(a.date_start) - toEpochMs(b.date_start));

  if (!raceMeetings.length) return null;

  const fallback = raceMeetings[Math.max(0, Math.min(raceMeetings.length - 1, round - 1))] || raceMeetings[0];
  if (!scheduleRow) return fallback;

  const targetDate = toEpochMs(scheduleRow.start_date + 'T00:00:00Z');
  const targetTokens = raceNameTokens(scheduleRow.raceName);

  let best = null;
  let bestScore = -Infinity;

  for (const meeting of raceMeetings) {
    const meetingTokens = raceNameTokens(meeting.meeting_name || meeting.meeting_official_name);
    const overlap = overlapRatio(targetTokens, meetingTokens);
    const nameScore = overlap * 100;

    const meetingDate = toEpochMs(meeting.date_start);
    const dayDiff = (targetDate !== null && meetingDate !== null)
      ? Math.abs(targetDate - meetingDate) / 86400000
      : 30;
    const dateScore = Math.max(0, 40 - (dayDiff * 4));

    const score = nameScore + dateScore;
    if (score > bestScore) {
      bestScore = score;
      best = meeting;
    }
  }

  return best || fallback;
}

function isTestingMeeting(meeting) {
  const label = `${meeting?.meeting_name || ''} ${meeting?.meeting_official_name || ''}`.toLowerCase();
  return /\btest(?:ing)?\b/.test(label);
}

function selectOpenF1TestingMeetings(meetings, season) {
  return (meetings || [])
    .filter((m) => m.year === season)
    .filter((m) => isTestingMeeting(m))
    .sort((a, b) => toEpochMs(a.date_start) - toEpochMs(b.date_start));
}

function selectSessionByType(sessions, targetType) {
  const target = String(targetType || '').toLowerCase();
  const rows = (sessions || []).slice().sort((a, b) => toEpochMs(a.date_start) - toEpochMs(b.date_start));

  const exact = rows.find((s) => String(s.session_type || '').toLowerCase() === target);
  if (exact) return exact;

  const byName = rows.find((s) => String(s.session_name || '').toLowerCase().includes(target));
  return byName || null;
}

function detectPracticeSlot(session, fallbackIndex = 0) {
  const type = String(session?.session_type || '').toLowerCase();
  const name = String(session?.session_name || '').toLowerCase();
  const joined = `${type} ${name}`;

  const explicit = joined.match(/(?:^|\b)(?:fp|practice|free practice)\s*([123])(?:\b|$)/i);
  if (explicit) return `fp${explicit[1]}`;

  const isPractice = type === 'practice' || /(?:^|\b)(?:fp|practice|free practice)(?:\b|$)/i.test(name);
  if (!isPractice) return null;

  const slot = Math.max(1, Math.min(3, fallbackIndex + 1));
  return `fp${slot}`;
}

function selectPracticeSessions(sessions) {
  const rows = (sessions || [])
    .slice()
    .sort((a, b) => toEpochMs(a.date_start) - toEpochMs(b.date_start));

  const seenSlots = new Set();
  let genericIndex = 0;
  const selected = [];

  for (const row of rows) {
    let slot = detectPracticeSlot(row, genericIndex);
    if (!slot) continue;

    if (seenSlots.has(slot)) {
      const next = ['fp1', 'fp2', 'fp3'].find((candidate) => !seenSlots.has(candidate));
      if (!next) continue;
      slot = next;
    }

    seenSlots.add(slot);
    genericIndex += 1;
    selected.push({ ...row, practice_slot: slot });
  }

  return selected;
}

function detectTestingDayIndex(session, fallbackIndex = 0) {
  const name = String(session?.session_name || '');
  const explicit = name.match(/day\s*([123])/i);
  if (explicit) {
    const day = toInt(explicit[1]);
    if (day && day >= 1 && day <= 3) return day;
  }
  const fallback = Math.max(1, Math.min(3, fallbackIndex + 1));
  return fallback;
}

function ensureDriverRecord(data, identity) {
  if (!identity || !identity.driverId) return;
  if (!Array.isArray(data.drivers)) data.drivers = [];

  const existing = data.drivers.find((driver) => driver.driverId === identity.driverId);
  if (existing) {
    if (!existing.driverName && identity.driverName) existing.driverName = identity.driverName;
    if ((!existing.code || existing.code === 'NaN') && identity.code) existing.code = identity.code;
    return;
  }

  data.drivers.push({
    driverId: identity.driverId,
    driverName: identity.driverName || identity.driverId,
    code: identity.code || null,
    nationality: null
  });
}

function ensureSeasonDriverRecord(data, season, identity, teamName) {
  if (!identity || !identity.driverId || !season) return;
  if (!Array.isArray(data.driver_seasons)) data.driver_seasons = [];

  const team = displayTeamName(teamName);
  const now = new Date().toISOString();

  const existing = data.driver_seasons.find((row) => row.season === season && row.driverId === identity.driverId);
  if (existing) {
    if (identity.driverName) existing.driverName = identity.driverName;
    if (team) existing.team = team;
    existing.updated_at = now;
    return;
  }

  data.driver_seasons.push({
    season,
    driverId: identity.driverId,
    driverName: identity.driverName || identity.driverId,
    team,
    updated_at: now
  });
}

function ensureSeasonRaces(data, season) {
  const schedule = getSeasonSchedule(season);
  if (!schedule.length) return;

  if (!Array.isArray(data.races)) data.races = [];

  for (const race of schedule) {
    const exists = data.races.some((row) => row.season === season && row.round === race.round);
    if (exists) continue;
    data.races.push({ season, round: race.round, raceName: race.raceName, date: race.start_date });
  }
}

function buildOpenF1DriverResolver(data, season = 2026) {
  const gridEntries = loadCurrentGrid(season);
  const resolvedGrid = resolveGridDrivers(data, season);
  const fullNameMap = new Map();
  const lastNameMap = new Map();

  const addLastName = (lastName, driverId) => {
    if (!lastName) return;
    if (!lastNameMap.has(lastName)) lastNameMap.set(lastName, new Set());
    lastNameMap.get(lastName).add(driverId);
  };

  for (let i = 0; i < gridEntries.length; i += 1) {
    const entry = gridEntries[i];
    const resolved = resolvedGrid[i] || null;
    if (!entry || !resolved) continue;
    const driverId = resolved.driverId;

    const names = [entry.driverName, ...(entry.aliases || [])].filter(Boolean);
    for (const name of names) {
      const normalized = normalizeLoose(name);
      if (!normalized) continue;
      fullNameMap.set(normalized, driverId);
      const parts = normalized.split(' ').filter(Boolean);
      addLastName(parts[parts.length - 1], driverId);
    }
  }

  const codeMap = new Map();
  for (const driver of data.drivers || []) {
    if (!driver?.driverId) continue;
    const code = String(driver.code || '').trim().toUpperCase();
    if (!code || code === 'NAN') continue;
    if (!resolvedGrid.length || resolvedGrid.some((row) => row.driverId === driver.driverId)) {
      codeMap.set(code, driver.driverId);
    }
  }

  return (meta = {}, fallbackNumber = null) => {
    const code = String(meta.name_acronym || '').trim().toUpperCase() || null;
    const fromParts = [meta.first_name, meta.last_name].filter(Boolean).join(' ').trim();
    const fallbackFull = String(meta.full_name || '').trim();
    const displayName = fromParts || fallbackFull || (fallbackNumber ? ('Driver ' + fallbackNumber) : 'Unknown Driver');

    const candidates = [displayName, meta.full_name, meta.broadcast_name].filter(Boolean);

    for (const rawName of candidates) {
      const normalized = normalizeLoose(rawName);
      if (!normalized) continue;
      if (fullNameMap.has(normalized)) {
        return { driverId: fullNameMap.get(normalized), driverName: displayName, code };
      }
    }

    if (code && codeMap.has(code)) {
      return { driverId: codeMap.get(code), driverName: displayName, code };
    }

    for (const rawName of candidates) {
      const parts = normalizeLoose(rawName).split(' ').filter(Boolean);
      const lastName = parts[parts.length - 1];
      if (!lastName || !lastNameMap.has(lastName)) continue;
      const matches = [...lastNameMap.get(lastName)];
      if (matches.length === 1) {
        return { driverId: matches[0], driverName: displayName, code };
      }
    }

    return {
      driverId: 'name:' + slugify(displayName),
      driverName: displayName,
      code
    };
  };
}

function avg(values) {
  if (!values || !values.length) return null;
  return values.reduce((sum, n) => sum + n, 0) / values.length;
}

function median(values) {
  if (!values || !values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function stddev(values) {
  if (!values || values.length < 2) return null;
  const mean = avg(values);
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function slope(values) {
  if (!values || values.length < 2) return null;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = avg(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = i - xMean;
    num += dx * (values[i] - yMean);
    den += dx * dx;
  }
  if (!den) return null;
  return num / den;
}

function roundTo(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const p = Math.pow(10, digits);
  return Math.round(value * p) / p;
}

function parseStage(stageRaw) {
  const s = String(stageRaw || '').trim().toUpperCase();
  if (s === 'Q1' || s === 'Q2' || s === 'Q3') return s;
  return null;
}

function isDnfResult(row) {
  if (!row) return false;
  if (row.position === null || row.position === undefined) return true;

  const status = String(row.status || '').trim().toLowerCase();
  if (!status) return false;
  if (status.includes('finished')) return false;
  if (status.startsWith('+')) return false;
  return true;
}

function computeRoundSideBetActuals(data, season, round) {
  const raceRows = (data.race_results || []).filter((row) => row.season === season && row.round === round);
  const qualRows = (data.qualifying_results || []).filter((row) => row.season === season && row.round === round);
  const actual = (data.race_actuals || []).find((row) => row.season === season && row.round === round) || null;
  const raceMeta = (data.races || []).find((row) => row.season === season && row.round === round) || null;

  const winnerDriverId = actual?.p1_driver_id || raceRows.find((row) => row.position === 1)?.driverId || null;
  const poleDriverId = actual?.pole_driver_id || qualRows.find((row) => row.position === 1)?.driverId || null;

  let winnerGrid = null;
  if (winnerDriverId) {
    const winnerRace = raceRows.find((row) => row.driverId === winnerDriverId);
    winnerGrid = toInt(winnerRace?.grid);
    if (!winnerGrid) {
      const winnerQual = qualRows.find((row) => row.driverId === winnerDriverId);
      winnerGrid = toInt(winnerQual?.position);
    }
  }

  const hasRaceRows = raceRows.length > 0;
  const poleConverts = poleDriverId && winnerDriverId ? poleDriverId === winnerDriverId : null;
  const frontRowWinner = Number.isFinite(winnerGrid) && winnerGrid > 0 ? winnerGrid <= 2 : null;
  const anyDnf = hasRaceRows ? raceRows.some(isDnfResult) : null;

  const teamByDriver = new Map(
    (resolveGridDrivers(data, season) || []).map((row) => [row.driverId, displayTeamName(row.team)])
  );

  for (const row of data.driver_seasons || []) {
    if (row.season !== season || !row.driverId || !row.team) continue;
    if (!teamByDriver.has(row.driverId)) teamByDriver.set(row.driverId, displayTeamName(row.team));
  }

  const redFlag = toBoolNullable(actual?.red_flag ?? raceMeta?.red_flag ?? null);

  let bigMover = null;
  if (hasRaceRows) {
    const qualiPosByDriver = new Map(
      qualRows
        .filter((row) => row.driverId)
        .map((row) => [row.driverId, toInt(row.position)])
    );

    let comparableRows = 0;
    bigMover = false;

    for (const row of raceRows) {
      const finishPos = toInt(row.position);
      if (!finishPos) continue;

      let startPos = toInt(row.grid);
      if (!startPos && row.driverId) startPos = toInt(qualiPosByDriver.get(row.driverId));
      if (!startPos) continue;

      comparableRows += 1;
      if (startPos - finishPos >= 8) {
        bigMover = true;
        break;
      }
    }

    if (!comparableRows) bigMover = null;
  }

  const podiumDriverIds = [
    actual?.p1_driver_id || raceRows.find((row) => row.position === 1)?.driverId || null,
    actual?.p2_driver_id || raceRows.find((row) => row.position === 2)?.driverId || null,
    actual?.p3_driver_id || raceRows.find((row) => row.position === 3)?.driverId || null
  ];

  let other7Podium = null;
  if (podiumDriverIds.every(Boolean)) {
    let allTeamsKnown = true;
    other7Podium = false;

    for (const driverId of podiumDriverIds) {
      const team = displayTeamName(teamByDriver.get(driverId) || '');
      if (!team) {
        allTeamsKnown = false;
        break;
      }
      if (!TOP4_TEAMS.has(team)) {
        other7Podium = true;
        break;
      }
    }

    if (!allTeamsKnown) other7Podium = null;
  }

  return {
    poleConverts,
    frontRowWinner,
    anyDnf,
    redFlag,
    bigMover,
    other7Podium
  };
}

function scoreSideBetPick(pickValue, actualValue, points) {
  if (pickValue === null || pickValue === undefined) return 0;
  if (actualValue === null || actualValue === undefined) return 0;
  return pickValue === actualValue ? points : 0;
}

function describeTrend(slopeValue, lowerIsBetter = false) {
  if (slopeValue === null || slopeValue === undefined || Number.isNaN(slopeValue)) return 'flat';
  const signal = lowerIsBetter ? -slopeValue : slopeValue;
  if (signal > 0.2) return 'surging';
  if (signal > 0.05) return 'up';
  if (signal < -0.2) return 'dropping';
  if (signal < -0.05) return 'down';
  return 'flat';
}

function upsertByKey(existingRows, incomingRows, keyFn) {
  const map = new Map();
  for (const row of existingRows || []) map.set(keyFn(row), row);
  for (const row of incomingRows || []) map.set(keyFn(row), row);
  return [...map.values()];
}

function teammateMapFromGrid(grid) {
  const byTeam = new Map();
  for (const d of grid) {
    if (!byTeam.has(d.team)) byTeam.set(d.team, []);
    byTeam.get(d.team).push(d.driverId);
  }

  const teammateByDriver = new Map();
  for (const d of grid) {
    const mates = (byTeam.get(d.team) || []).filter(id => id !== d.driverId);
    teammateByDriver.set(d.driverId, mates[0] || null);
  }

  return teammateByDriver;
}

function getBestStageLap(qualTimingByKey, qualByKey, season, round, driverId, stage) {
  const timing = qualTimingByKey.get(`${season}:${round}:${driverId}:${stage}`) || [];
  const clean = timing
    .filter(row => !row.is_deleted && row.lap_time_ms !== null && row.lap_time_ms !== undefined)
    .map(row => row.lap_time_ms);

  if (clean.length) return Math.min(...clean);

  const row = qualByKey.get(`${season}:${round}:${driverId}`);
  if (!row) return null;
  if (stage === 'Q1') return row.q1_ms ?? null;
  if (stage === 'Q2') return row.q2_ms ?? null;
  if (stage === 'Q3') return row.q3_ms ?? null;
  return null;
}

function computeDriverIntelligence(data, season, options = {}) {
  const maxRoundRaw = toInt(options?.maxRound);
  const maxRound = maxRoundRaw && maxRoundRaw > 0 ? maxRoundRaw : Number.POSITIVE_INFINITY;

  const gridOverride = Array.isArray(options?.grid) ? options.grid : null;
  const grid = (gridOverride && gridOverride.length ? gridOverride : resolveGridDrivers(data, season))
    .map((row) => ({
      ...row,
      team: displayTeamName(row.team)
    }));

  const teammateByDriver = teammateMapFromGrid(grid);

  const results = (data.race_results || []).filter((r) => r.season === season && r.round <= maxRound);
  const qual = (data.qualifying_results || []).filter((q) => q.season === season && q.round <= maxRound);
  const qualTiming = (data.qualifying_timing || []).filter((q) => q.season === season && q.round <= maxRound);
  const raceTiming = (data.race_timing || []).filter((r) => r.season === season && r.round <= maxRound);

  const scheduleRaw = Array.isArray(options?.schedule) && options.schedule.length
    ? options.schedule
    : getSeasonSchedule(season, data);

  const schedule = scheduleRaw
    .map((row) => ({
      ...row,
      round: toInt(row.round)
    }))
    .filter((row) => row.round && row.round <= maxRound)
    .sort((a, b) => a.round - b.round);

  const recentRounds = schedule.slice(-5).map((r) => r.round);

  const resultByKey = new Map(results.map(r => [`${r.season}:${r.round}:${r.driverId}`, r]));
  const qualByKey = new Map(qual.map(q => [`${q.season}:${q.round}:${q.driverId}`, q]));

  const qualTimingByKey = new Map();
  for (const row of qualTiming) {
    const stage = parseStage(row.stage);
    if (!stage) continue;
    const key = `${row.season}:${row.round}:${row.driverId}:${stage}`;
    if (!qualTimingByKey.has(key)) qualTimingByKey.set(key, []);
    qualTimingByKey.get(key).push(row);
  }

  const raceTimingByDriverRound = new Map();
  for (const row of raceTiming) {
    const key = `${row.season}:${row.round}:${row.driverId}`;
    if (!raceTimingByDriverRound.has(key)) raceTimingByDriverRound.set(key, []);
    raceTimingByDriverRound.get(key).push(row);
  }

  return grid.map((driver) => {
    const teammateId = teammateByDriver.get(driver.driverId);
    const driverResults = results.filter(r => r.driverId === driver.driverId);
    const driverQual = qual.filter(q => q.driverId === driver.driverId);
    const driverRaceTiming = raceTiming.filter(r => r.driverId === driver.driverId);

    const points = driverResults.reduce((sum, r) => sum + (r.points || 0), 0);
    const wins = driverResults.filter(r => r.position === 1).length;
    const podiums = driverResults.filter(r => r.position !== null && r.position <= 3).length;
    const fastestLaps = driverResults.filter(r => r.fastestLapRank === 1).length;

    const finishPositions = driverResults.map(r => r.position).filter(v => v !== null && v !== undefined);
    const avgFinish = avg(finishPositions);

    const qualiPositions = driverQual.map(q => q.position).filter(v => v !== null && v !== undefined);
    const avgQuali = avg(qualiPositions);
    const poles = driverQual.filter(q => q.position === 1).length;

    const last5Race = driverResults.filter(r => recentRounds.includes(r.round)).sort((a, b) => b.round - a.round);
    const formPositions = last5Race.map(r => r.position).filter(v => v !== null && v !== undefined);
    const formAvgFinish = avg(formPositions);
    const formPoints = last5Race.reduce((sum, r) => sum + (r.points || 0), 0);

    const q3Appearances = driverQual.filter(q => q.position !== null && q.position <= 10).length;
    const q2Appearances = driverQual.filter(q => q.position !== null && q.position <= 15).length;
    const q1Knockouts = driverQual.filter(q => q.position !== null && q.position > 15).length;
    const bestGrid = (() => {
      const grids = driverResults.map(r => r.grid).filter(v => v !== null && v !== undefined);
      if (grids.length) return Math.min(...grids);
      return driverQual.length ? Math.min(...driverQual.map(q => q.position).filter(v => v !== null && v !== undefined)) : null;
    })();
    const worstGrid = (() => {
      const grids = driverResults.map(r => r.grid).filter(v => v !== null && v !== undefined);
      if (grids.length) return Math.max(...grids);
      return driverQual.length ? Math.max(...driverQual.map(q => q.position).filter(v => v !== null && v !== undefined)) : null;
    })();

    const qualiStarts = driverQual.length;
    const stageSurvivalQ2 = qualiStarts ? q2Appearances / qualiStarts : null;
    const stageSurvivalQ3 = qualiStarts ? q3Appearances / qualiStarts : null;

    const q1ToQ2Deltas = [];
    const q2ToQ3Deltas = [];
    const teammateGapByStage = { Q1: [], Q2: [], Q3: [] };
    const clutchRanks = [];
    const headToHead = { wins: 0, losses: 0, ties: 0 };

    if (teammateId) {
      for (const race of schedule) {
        const myPos = qualByKey.get(`${season}:${race.round}:${driver.driverId}`)?.position;
        const matePos = qualByKey.get(`${season}:${race.round}:${teammateId}`)?.position;
        if (myPos === null || myPos === undefined || matePos === null || matePos === undefined) continue;

        if (myPos < matePos) headToHead.wins += 1;
        else if (myPos > matePos) headToHead.losses += 1;
        else headToHead.ties += 1;
      }
    }

    for (const q of driverQual) {
      const round = q.round;

      const bestQ1 = getBestStageLap(qualTimingByKey, qualByKey, season, round, driver.driverId, 'Q1');
      const bestQ2 = getBestStageLap(qualTimingByKey, qualByKey, season, round, driver.driverId, 'Q2');
      const bestQ3 = getBestStageLap(qualTimingByKey, qualByKey, season, round, driver.driverId, 'Q3');

      if (bestQ1 !== null && bestQ2 !== null) q1ToQ2Deltas.push(bestQ2 - bestQ1);
      if (bestQ2 !== null && bestQ3 !== null) q2ToQ3Deltas.push(bestQ3 - bestQ2);

      if (teammateId) {
        for (const stage of ['Q1', 'Q2', 'Q3']) {
          const driverStage = getBestStageLap(qualTimingByKey, qualByKey, season, round, driver.driverId, stage);
          const mateStage = getBestStageLap(qualTimingByKey, qualByKey, season, round, teammateId, stage);
          if (driverStage !== null && mateStage !== null) {
            teammateGapByStage[stage].push(driverStage - mateStage);
          }
        }
      }

      for (const stage of ['Q1', 'Q2', 'Q3']) {
        const stageRows = [];
        for (const g of grid) {
          const lap = getBestStageLap(qualTimingByKey, qualByKey, season, round, g.driverId, stage);
          if (lap === null || lap === undefined) continue;
          stageRows.push({ driverId: g.driverId, lap });
        }

        if (!stageRows.length) continue;
        const ranked = [...stageRows].sort((a, b) => a.lap - b.lap);
        const idx = ranked.findIndex(r => r.driverId === driver.driverId);
        if (idx >= 0) clutchRanks.push(idx + 1);
      }
    }

    const positionsGained = driverResults
      .map((r) => {
        const finish = r.position;
        const gridPos = r.grid !== null && r.grid !== undefined ? r.grid : (qualByKey.get(`${season}:${r.round}:${driver.driverId}`)?.position ?? null);
        if (finish === null || finish === undefined || gridPos === null || gridPos === undefined) return null;
        return gridPos - finish;
      })
      .filter(v => v !== null);

    const cleanRaceLaps = driverRaceTiming
      .filter(r => !r.is_deleted && r.lap_time_ms !== null && r.lap_time_ms !== undefined)
      .map(r => r.lap_time_ms);

    const teammateRaceGap = [];
    if (teammateId) {
      const rounds = [...new Set(driverResults.map(r => r.round))];
      for (const round of rounds) {
        const mine = raceTimingByDriverRound.get(`${season}:${round}:${driver.driverId}`) || [];
        const theirs = raceTimingByDriverRound.get(`${season}:${round}:${teammateId}`) || [];
        const mineAvg = avg(mine.filter(r => !r.is_deleted && r.lap_time_ms !== null).map(r => r.lap_time_ms));
        const theirsAvg = avg(theirs.filter(r => !r.is_deleted && r.lap_time_ms !== null).map(r => r.lap_time_ms));
        if (mineAvg !== null && theirsAvg !== null) teammateRaceGap.push(mineAvg - theirsAvg);
      }
    }

    const firstLapGainLoss = [];
    for (const r of driverResults) {
      const lap1 = (raceTimingByDriverRound.get(`${season}:${r.round}:${driver.driverId}`) || [])
        .find(row => row.lap === 1);
      const start = lap1?.position_start_lap ?? r.grid;
      const end = lap1?.position_end_lap ?? lap1?.position ?? null;
      if (start !== null && start !== undefined && end !== null && end !== undefined) {
        firstLapGainLoss.push(start - end);
      }
    }

    const pitCyclePositionDelta = [];
    const restartGainLoss = [];
    const recoveryIndex = [];

    for (const r of driverResults) {
      const roundRows = (raceTimingByDriverRound.get(`${season}:${r.round}:${driver.driverId}`) || [])
        .filter(row => !row.is_deleted && row.lap_time_ms !== null && row.lap_time_ms !== undefined)
        .sort((a, b) => a.lap - b.lap);

      if (!roundRows.length) continue;

      const lapMsSeries = roundRows.map(row => row.lap_time_ms);
      const lapMedian = median(lapMsSeries);
      const pitLapThreshold = lapMedian !== null ? lapMedian + 12000 : null;
      const slowLapThreshold = lapMedian !== null ? lapMedian + 7000 : null;
      const restartLapThreshold = lapMedian !== null ? lapMedian + 3000 : null;

      let roundPit = 0;
      let roundRestart = 0;

      for (let i = 0; i < roundRows.length; i += 1) {
        const lapRow = roundRows[i];
        const startPos = lapRow.position_start_lap;
        const endPos = lapRow.position_end_lap;
        if (startPos === null || startPos === undefined || endPos === null || endPos === undefined) continue;

        const delta = startPos - endPos;
        const isPitCycleLap = pitLapThreshold !== null && lapRow.lap_time_ms >= pitLapThreshold;

        if (isPitCycleLap) {
          roundPit += delta;
        }

        const prev = i > 0 ? roundRows[i - 1] : null;
        if (
          prev &&
          slowLapThreshold !== null &&
          restartLapThreshold !== null &&
          prev.lap_time_ms >= slowLapThreshold &&
          lapRow.lap_time_ms <= restartLapThreshold
        ) {
          roundRestart += delta;
        }
      }

      pitCyclePositionDelta.push(roundPit);
      restartGainLoss.push(roundRestart);

      const positionTrace = [];
      for (const lapRow of roundRows) {
        if (lapRow.position_start_lap !== null && lapRow.position_start_lap !== undefined) {
          positionTrace.push(lapRow.position_start_lap);
        }
        if (lapRow.position_end_lap !== null && lapRow.position_end_lap !== undefined) {
          positionTrace.push(lapRow.position_end_lap);
        }
      }

      const worstRunningPos = positionTrace.length ? Math.max(...positionTrace) : null;
      const finishPos = r.position ?? null;
      if (worstRunningPos !== null && finishPos !== null && finishPos !== undefined) {
        recoveryIndex.push(worstRunningPos - finishPos);
      }
    }

    const starts = driverResults.length;
    const dnfCount = driverResults.filter(isDnfResult).length;
    const dnfRate = starts ? dnfCount / starts : null;
    const pointsConversionRate = starts ? driverResults.filter(r => (r.points || 0) > 0).length / starts : null;

    const stintByCompound = new Map();
    for (const lap of driverRaceTiming) {
      const compound = String(lap.compound || '').trim().toUpperCase();
      if (!compound) continue;
      if (lap.is_deleted || lap.lap_time_ms === null || lap.lap_time_ms === undefined) continue;
      if (!stintByCompound.has(compound)) stintByCompound.set(compound, []);
      stintByCompound.get(compound).push(lap.lap_time_ms);
    }

    const stintPaceByCompound = [...stintByCompound.entries()]
      .map(([compound, laps]) => ({
        compound,
        laps: laps.length,
        avg_lap_ms: roundTo(avg(laps), 0)
      }))
      .sort((a, b) => b.laps - a.laps || a.compound.localeCompare(b.compound));

    const weekendScores = [];
    const roundPerf = [];
    const conversionDeltas = [];

    for (const round of schedule.map(r => r.round)) {
      const q = qualByKey.get(`${season}:${round}:${driver.driverId}`) || null;
      const rr = resultByKey.get(`${season}:${round}:${driver.driverId}`) || null;

      const qPos = q?.position ?? null;
      const rPos = rr?.position ?? null;
      const pts = rr?.points || 0;

      const qualiScore = qPos !== null && qPos !== undefined ? Math.max(0, 22 - qPos) : 0;
      const raceScore = rPos !== null && rPos !== undefined ? Math.max(0, 22 - rPos) : 0;
      if (q || rr) {
        const weekend = (qualiScore * 0.45) + (raceScore * 0.35) + (pts * 0.2);
        weekendScores.push(weekend);
      }

      if (rr) {
        roundPerf.push((pts * 0.6) + (raceScore * 0.4));
      }

      if (qPos !== null && qPos !== undefined && rPos !== null && rPos !== undefined) {
        conversionDeltas.push(qPos - rPos);
      }
    }

    const last5Quali = driverQual
      .sort((a, b) => a.round - b.round)
      .slice(-5)
      .map(q => q.position)
      .filter(v => v !== null && v !== undefined);

    const last5RacePos = driverResults
      .sort((a, b) => a.round - b.round)
      .slice(-5)
      .map(r => r.position)
      .filter(v => v !== null && v !== undefined);

    const qualiSlope = slope(last5Quali);
    const raceSlope = slope(last5RacePos);
    const momentumSeries = roundPerf.slice(-8);
    const momentumIndex = slope(momentumSeries);

    return {
      driverId: driver.driverId,
      driverName: driver.driverName,
      team: driver.team,
      points,
      wins,
      podiums,
      poles,
      fastest_laps: fastestLaps,
      avg_finish: avgFinish,
      avg_quali: avgQuali,
      form: {
        positions: formPositions,
        avg_finish: formAvgFinish,
        points: formPoints
      },
      qualifying_intel: {
        q3_appearances: q3Appearances,
        q2_appearances: q2Appearances,
        q1_knockouts: q1Knockouts,
        pole_count: poles,
        avg_quali_position: avgQuali,
        best_grid_position: bestGrid,
        worst_grid_position: worstGrid,
        stage_survival_rate: {
          q2: stageSurvivalQ2,
          q3: stageSurvivalQ3
        },
        q1_to_q2_improvement_ms: avg(q1ToQ2Deltas),
        q2_to_q3_improvement_ms: avg(q2ToQ3Deltas),
        head_to_head: {
          wins: headToHead.wins,
          losses: headToHead.losses,
          ties: headToHead.ties,
          compared_rounds: headToHead.wins + headToHead.losses + headToHead.ties
        },
        teammate_gap_by_stage: {
          q1: { avg_ms: avg(teammateGapByStage.Q1), median_ms: median(teammateGapByStage.Q1) },
          q2: { avg_ms: avg(teammateGapByStage.Q2), median_ms: median(teammateGapByStage.Q2) },
          q3: { avg_ms: avg(teammateGapByStage.Q3), median_ms: median(teammateGapByStage.Q3) }
        },
        final_run_clutch_rank: avg(clutchRanks)
      },
      race_intel: {
        avg_race_finish: avgFinish,
        positions_gained_lost: avg(positionsGained),
        pit_cycle_position_delta: avg(pitCyclePositionDelta),
        restart_gain_loss: avg(restartGainLoss),
        recovery_index: avg(recoveryIndex),
        lap_pace_consistency_ms: stddev(cleanRaceLaps),
        teammate_race_pace_gap_ms: avg(teammateRaceGap),
        first_lap_gain_loss: avg(firstLapGainLoss),
        fastest_lap_count: fastestLaps,
        dnf_rate: dnfRate,
        points_conversion_rate: pointsConversionRate,
        stint_pace_by_compound: stintPaceByCompound
      },
      combined_intel: {
        weekend_score: avg(weekendScores),
        quali_trend_last5: {
          slope: qualiSlope,
          direction: describeTrend(qualiSlope, true),
          series: last5Quali
        },
        race_trend_last5: {
          slope: raceSlope,
          direction: describeTrend(raceSlope, true),
          series: last5RacePos
        },
        momentum_index: momentumIndex,
        quali_to_race_conversion: {
          avg_delta: avg(conversionDeltas),
          hit_rate: conversionDeltas.length ? conversionDeltas.filter(v => v >= 0).length / conversionDeltas.length : null
        }
      },
      sample: {
        race_starts: starts,
        quali_starts: qualiStarts,
        schedule_rounds: schedule.length,
        source_season: season
      }
    };
  });
}

const INTEL_HISTORY_BASE_SEASONS = [2023, 2024, 2025];
const INTEL_BLEND_WEIGHTS = {
  2025: 0.5,
  2024: 0.3,
  2023: 0.2
};

const INTEL_COUNT_KEYS = new Set([
  'points',
  'wins',
  'podiums',
  'poles',
  'fastest_laps',
  'q3_appearances',
  'q2_appearances',
  'q1_knockouts',
  'pole_count',
  'fastest_lap_count',
  'race_starts',
  'quali_starts',
  'schedule_rounds',
  'compared_rounds',
  'losses',
  'ties'
]);

function normalizeDriverNameKey(name) {
  return stripDiacritics(String(name || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeStatsView(viewRaw) {
  const view = String(viewRaw || 'season').toLowerCase();
  if (view === 'cumulative' || view === 'blended') return view;
  return 'season';
}

function getHistorySourceSeasons(data, season, options = {}) {
  const includeCurrentSeason = options.includeCurrentSeason !== false;
  const limit = includeCurrentSeason ? season : (season - 1);

  const seasons = INTEL_HISTORY_BASE_SEASONS
    .filter((yr) => yr <= limit)
    .filter((yr) => {
      const hasRace = (data.race_results || []).some((row) => row.season === yr);
      const hasQual = (data.qualifying_results || []).some((row) => row.season === yr);
      return hasRace || hasQual;
    })
    .sort((a, b) => a - b);

  return seasons;
}

function buildDriverIndex(rows) {
  const byId = new Map();
  const byName = new Map();

  for (const row of rows || []) {
    if (row?.driverId) byId.set(row.driverId, row);
    const key = normalizeDriverNameKey(row?.driverName);
    if (key && !byName.has(key)) byName.set(key, row);
  }

  return { byId, byName };
}

function lookupDriverNameById(data, season, driverId) {
  if (!driverId) return null;

  const seasonRow = (data.driver_seasons || []).find((row) => row.season === season && row.driverId === driverId);
  if (seasonRow?.driverName) return seasonRow.driverName;

  const driver = (data.drivers || []).find((row) => row.driverId === driverId);
  if (driver?.driverName) return driver.driverName;

  return null;
}

function buildSeasonDriverRemap(data, sourceSeason, baseById, baseByName) {
  const sourceIds = new Set();

  for (const row of data.race_results || []) {
    if (row.season === sourceSeason && row.driverId) sourceIds.add(row.driverId);
  }
  for (const row of data.qualifying_results || []) {
    if (row.season === sourceSeason && row.driverId) sourceIds.add(row.driverId);
  }
  for (const row of data.race_timing || []) {
    if (row.season === sourceSeason && row.driverId) sourceIds.add(row.driverId);
  }
  for (const row of data.qualifying_timing || []) {
    if (row.season === sourceSeason && row.driverId) sourceIds.add(row.driverId);
  }

  const sourceGrid = resolveGridDrivers(data, sourceSeason);
  const sourceNameById = new Map((sourceGrid || []).map((row) => [row.driverId, row.driverName]));

  for (const row of data.driver_seasons || []) {
    if (row.season !== sourceSeason || !row.driverId || !row.driverName) continue;
    if (!sourceNameById.has(row.driverId)) sourceNameById.set(row.driverId, row.driverName);
  }

  const remap = new Map();
  for (const sourceId of sourceIds) {
    if (!sourceId) continue;

    if (baseById.has(sourceId)) {
      remap.set(sourceId, sourceId);
      continue;
    }

    const sourceName = sourceNameById.get(sourceId) || lookupDriverNameById(data, sourceSeason, sourceId);
    const nameKey = normalizeDriverNameKey(sourceName);
    remap.set(sourceId, nameKey && baseByName.has(nameKey) ? baseByName.get(nameKey) : null);
  }

  return remap;
}

function buildCumulativeIntelDataset(data, baseSeason, sourceSeasons) {
  const seasons = [...new Set((sourceSeasons || []).map((s) => toInt(s)).filter(Boolean))]
    .sort((a, b) => a - b);

  if (!seasons.length) return null;

  const baseGrid = resolveGridDrivers(data, baseSeason).map((row) => ({
    ...row,
    team: displayTeamName(row.team)
  }));

  if (!baseGrid.length) return null;

  const baseById = new Map(baseGrid.map((row) => [row.driverId, row]));
  const baseByName = new Map();
  for (const row of baseGrid) {
    const key = normalizeDriverNameKey(row.driverName);
    if (key && !baseByName.has(key)) baseByName.set(key, row.driverId);
  }

  let roundCursor = 0;
  const seasonRoundMap = new Map();
  const seasonDriverRemap = new Map();
  const syntheticSchedule = [];

  for (const sourceSeason of seasons) {
    const schedule = getSeasonSchedule(sourceSeason, data)
      .map((row) => ({
        ...row,
        round: toInt(row.round)
      }))
      .filter((row) => row.round)
      .sort((a, b) => a.round - b.round);

    if (!schedule.length) continue;

    const remap = buildSeasonDriverRemap(data, sourceSeason, baseById, baseByName);
    seasonDriverRemap.set(sourceSeason, remap);

    const roundMap = new Map();
    for (const race of schedule) {
      roundCursor += 1;
      roundMap.set(race.round, roundCursor);

      const startDate = race.start_date || String(race.date || '').slice(0, 10) || null;
      const endDate = race.end_date || startDate;
      const raceName = race.raceName || `Round ${race.round}`;

      syntheticSchedule.push({
        season: baseSeason,
        round: roundCursor,
        raceName: `${sourceSeason} ${raceName}`,
        start_date: startDate,
        end_date: endDate,
        date: startDate
      });
    }

    seasonRoundMap.set(sourceSeason, roundMap);
  }

  if (!syntheticSchedule.length) return null;

  function remapDriver(sourceSeason, sourceDriverId) {
    const remap = seasonDriverRemap.get(sourceSeason);
    if (!remap) return null;
    return remap.get(sourceDriverId) || null;
  }

  function remapRound(sourceSeason, sourceRound) {
    const roundMap = seasonRoundMap.get(sourceSeason);
    if (!roundMap) return null;
    return roundMap.get(sourceRound) || null;
  }

  function remapRows(rows, dedupeKeyFn = null) {
    const out = [];
    const dedupe = dedupeKeyFn ? new Set() : null;

    for (const row of rows || []) {
      const sourceSeason = toInt(row?.season);
      if (!sourceSeason || !seasonRoundMap.has(sourceSeason)) continue;

      const sourceRound = toInt(row?.round);
      if (!sourceRound) continue;

      const targetRound = remapRound(sourceSeason, sourceRound);
      if (!targetRound) continue;

      const sourceDriverId = row?.driverId;
      if (!sourceDriverId) continue;

      const targetDriverId = remapDriver(sourceSeason, sourceDriverId);
      if (!targetDriverId) continue;

      const mapped = {
        ...row,
        season: baseSeason,
        round: targetRound,
        driverId: targetDriverId
      };

      if (dedupe) {
        const key = dedupeKeyFn(mapped);
        if (dedupe.has(key)) continue;
        dedupe.add(key);
      }

      out.push(mapped);
    }

    return out;
  }

  const syntheticData = {
    drivers: baseGrid.map((row) => ({
      driverId: row.driverId,
      driverName: row.driverName,
      team: row.team,
      code: null,
      nationality: null
    })),
    driver_seasons: baseGrid.map((row) => ({
      season: baseSeason,
      driverId: row.driverId,
      driverName: row.driverName,
      team: row.team
    })),
    races: syntheticSchedule.map((row) => ({
      season: baseSeason,
      round: row.round,
      raceName: row.raceName,
      date: row.start_date
    })),
    qualifying_results: remapRows(data.qualifying_results || [], (row) => `${row.season}:${row.round}:${row.driverId}`),
    qualifying_timing: remapRows(data.qualifying_timing || []),
    race_results: remapRows(data.race_results || [], (row) => `${row.season}:${row.round}:${row.driverId}`),
    race_timing: remapRows(data.race_timing || [])
  };

  return {
    data: syntheticData,
    grid: baseGrid,
    schedule: syntheticSchedule,
    sourceSeasons: seasons
  };
}

function computeCumulativeDriverIntelligence(data, baseSeason, sourceSeasons, options = {}) {
  const built = buildCumulativeIntelDataset(data, baseSeason, sourceSeasons);
  if (!built) return [];

  const intelOptions = {
    ...options,
    grid: built.grid,
    schedule: built.schedule
  };

  if (!options?.applyMaxRoundToCumulative) {
    delete intelOptions.maxRound;
  }

  const rows = computeDriverIntelligence(built.data, baseSeason, intelOptions)
    .map((row) => ({
      ...row,
      sample: {
        ...(row.sample || {}),
        source_season: null,
        history_sources: built.sourceSeasons
      }
    }));

  return rows;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function blendNumbers(currentValue, historyValue, seasonWeight, countLike = false) {
  const c = toFiniteNumber(currentValue);
  const h = toFiniteNumber(historyValue);

  if (c === null && h === null) return null;
  if (c === null) return h;
  if (h === null) return c;

  const weight = Math.max(0, Math.min(1, Number(seasonWeight) || 0));
  const blended = (c * weight) + (h * (1 - weight));
  if (!Number.isFinite(blended)) return null;
  return countLike ? Math.round(blended) : blended;
}

function blendIntelValues(currentValue, historyValue, seasonWeight, path = []) {
  if (currentValue === undefined || currentValue === null) {
    return cloneJson(historyValue);
  }
  if (historyValue === undefined || historyValue === null) {
    return cloneJson(currentValue);
  }

  const key = path.length ? path[path.length - 1] : '';

  if (typeof currentValue === 'number' || typeof historyValue === 'number') {
    return blendNumbers(currentValue, historyValue, seasonWeight, INTEL_COUNT_KEYS.has(key));
  }

  if (Array.isArray(currentValue) || Array.isArray(historyValue)) {
    const cur = Array.isArray(currentValue) ? currentValue : [];
    const hist = Array.isArray(historyValue) ? historyValue : [];
    if (cur.length) return cloneJson(cur);
    return cloneJson(hist);
  }

  if (typeof currentValue === 'object' && typeof historyValue === 'object') {
    const out = {};
    const keys = new Set([...Object.keys(currentValue), ...Object.keys(historyValue)]);

    for (const childKey of keys) {
      out[childKey] = blendIntelValues(
        currentValue[childKey],
        historyValue[childKey],
        seasonWeight,
        [...path, childKey]
      );
    }

    return out;
  }

  if (typeof currentValue === 'string' && String(currentValue).trim()) return currentValue;
  return cloneJson(historyValue);
}

function blendDriverIntelligenceRows(currentRow, historyRow, seasonWeight, extraMeta = {}) {
  if (!currentRow && !historyRow) return null;
  if (!currentRow) {
    const onlyHistory = cloneJson(historyRow);
    if (onlyHistory) {
      onlyHistory.sample = {
        ...(onlyHistory.sample || {}),
        blend_mode: 'history-only',
        season_weight: 0,
        history_weight: 1,
        ...extraMeta
      };
    }
    return onlyHistory;
  }

  if (!historyRow) {
    const onlyCurrent = cloneJson(currentRow);
    if (onlyCurrent) {
      onlyCurrent.sample = {
        ...(onlyCurrent.sample || {}),
        blend_mode: 'season-only',
        season_weight: 1,
        history_weight: 0,
        ...extraMeta
      };
    }
    return onlyCurrent;
  }

  const normalizedWeight = Math.max(0, Math.min(1, Number(seasonWeight) || 0));
  const blended = blendIntelValues(currentRow, historyRow, normalizedWeight, []);

  blended.driverId = currentRow.driverId || historyRow.driverId;
  blended.driverName = currentRow.driverName || historyRow.driverName;
  blended.team = displayTeamName(currentRow.team || historyRow.team);
  blended.sample = {
    ...(historyRow.sample || {}),
    ...(currentRow.sample || {}),
    blend_mode: 'season-history',
    season_weight: roundTo(normalizedWeight, 3),
    history_weight: roundTo(1 - normalizedWeight, 3),
    ...extraMeta
  };

  return blended;
}

function sortIntelRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
    const aFinish = a.avg_finish ?? 999;
    const bFinish = b.avg_finish ?? 999;
    if (aFinish !== bFinish) return aFinish - bFinish;
    return String(a.driverName || '').localeCompare(String(b.driverName || ''));
  });
}

function computeIntelligenceViewRows(data, season, viewRaw = 'season', options = {}) {
  const view = normalizeStatsView(viewRaw);

  if (view === 'season') {
    return computeDriverIntelligence(data, season, options);
  }

  const includeCurrentSeasonInHistory = options.includeCurrentSeasonInHistory !== false;
  const historySeasons = Array.isArray(options.historySeasons)
    ? options.historySeasons
    : getHistorySourceSeasons(data, season, { includeCurrentSeason: includeCurrentSeasonInHistory });

  const cumulativeRows = computeCumulativeDriverIntelligence(data, season, historySeasons, options);
  if (view === 'cumulative') return cumulativeRows;

  const currentRows = computeDriverIntelligence(data, season, options);
  const currentIndex = buildDriverIndex(currentRows);
  const historyIndex = buildDriverIndex(cumulativeRows);

  const baseGrid = (Array.isArray(options.grid) && options.grid.length ? options.grid : resolveGridDrivers(data, season))
    .map((row) => ({
      ...row,
      team: displayTeamName(row.team)
    }));

  const blended = [];

  for (const driver of baseGrid) {
    const current = currentIndex.byId.get(driver.driverId)
      || currentIndex.byName.get(normalizeDriverNameKey(driver.driverName))
      || null;

    const history = historyIndex.byId.get(driver.driverId)
      || historyIndex.byName.get(normalizeDriverNameKey(driver.driverName))
      || null;

    if (!current && !history) continue;

    let seasonWeight = 0;
    if (current && history) {
      const starts = Math.max(
        Number(current.sample?.race_starts || 0),
        Number(current.sample?.quali_starts || 0)
      );
      seasonWeight = Math.max(0.15, Math.min(0.85, starts / 12));
    } else if (current) {
      seasonWeight = 1;
    } else {
      seasonWeight = 0;
    }

    blended.push(
      blendDriverIntelligenceRows(current, history, seasonWeight, {
        history_sources: historySeasons,
        view: 'blended'
      })
    );
  }

  return blended;
}

const PROJECTION_POINTS_TABLE = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

const PROJECTION_MODEL_SPEC = {
  version: '2026.3',
  simulation_runs: 5000,
  championship_simulation_runs_per_round: 600,
  qualifying_weights: {
    qual_pace: 0.27,
    q3_presence: 0.12,
    teammate_qual_edge: 0.08,
    track_fit: 0.14,
    tire_fit: 0.08,
    momentum: 0.09,
    reliability: 0.08,
    practice_signal: 0.14
  },
  race_weights: {
    race_pace: 0.22,
    qualifying_transfer: 0.12,
    strategy_tire_fit: 0.12,
    track_fit: 0.1,
    start_craft: 0.07,
    reliability: 0.11,
    momentum: 0.08,
    form: 0.04,
    practice_signal: 0.14
  },
  fallback_rules: [
    'Only rounds before the selected race are used (no future leakage).',
    'When a driver metric is missing, that feature defaults to neutral 0.50.',
    'Low sample sizes blend harder toward team priors and track fit priors.',
    'Missing stint compound data falls back to team tyre-management prior.',
    'Unknown race profile falls back to a neutral mixed-track profile.',
    'Blended intelligence uses season-to-date signal plus 2023-2025 priors.',
    'Practice signal blends race-weekend FP with pre-season testing when available.',
    'Testing signal carries strongest influence in early rounds, then decays as race data grows.',
    'DNF simulation probability is clamped to avoid unrealistic extremes.'
  ],
  feature_notes: {
    qual_pace: 'Inverse average qualifying position blended with Q3 survival and clutch.',
    race_pace: 'Inverse average race finish blended with conversion, pace gap, and consistency.',
    track_fit: 'Dot-product fit between team car profile and circuit demands.',
    tire_fit: 'Expected-compound fit derived from stint pace by compound.',
    momentum: 'Recent trend and momentum index translated into a 0-1 score.',
    strategy_tire_fit: 'Tyre fit blended with team strategy execution prior.',
    practice_signal: 'FP1-FP3 plus pre-season testing short/long-run pace folded into round-level likelihood.'
  },
  simulation: {
    dnf_probability_floor: 0.02,
    dnf_probability_ceiling: 0.35,
    qualifying_noise_base: 0.045,
    race_noise_base: 0.055
  }
};

const PROJECTION_TEAM_TRAITS_BY_SEASON = {
  2025: {
    McLaren: { high_speed: 0.82, downforce: 0.84, traction: 0.81, degradation: 0.83, braking: 0.8, reliability: 0.87, strategy: 0.84 },
    Mercedes: { high_speed: 0.76, downforce: 0.8, traction: 0.78, degradation: 0.79, braking: 0.79, reliability: 0.84, strategy: 0.8 },
    'Red Bull Racing': { high_speed: 0.87, downforce: 0.82, traction: 0.8, degradation: 0.78, braking: 0.81, reliability: 0.79, strategy: 0.77 },
    Ferrari: { high_speed: 0.84, downforce: 0.79, traction: 0.76, degradation: 0.73, braking: 0.77, reliability: 0.77, strategy: 0.74 },
    Williams: { high_speed: 0.74, downforce: 0.64, traction: 0.65, degradation: 0.69, braking: 0.7, reliability: 0.78, strategy: 0.69 },
    'Racing Bulls': { high_speed: 0.7, downforce: 0.67, traction: 0.68, degradation: 0.66, braking: 0.68, reliability: 0.74, strategy: 0.67 },
    'Aston Martin': { high_speed: 0.68, downforce: 0.7, traction: 0.69, degradation: 0.71, braking: 0.69, reliability: 0.73, strategy: 0.67 },
    'Haas F1 Team': { high_speed: 0.71, downforce: 0.62, traction: 0.64, degradation: 0.63, braking: 0.67, reliability: 0.69, strategy: 0.63 },
    'Kick Sauber': { high_speed: 0.65, downforce: 0.65, traction: 0.63, degradation: 0.67, braking: 0.65, reliability: 0.72, strategy: 0.65 },
    Audi: { high_speed: 0.65, downforce: 0.65, traction: 0.63, degradation: 0.67, braking: 0.65, reliability: 0.72, strategy: 0.65 },
    Alpine: { high_speed: 0.68, downforce: 0.66, traction: 0.67, degradation: 0.68, braking: 0.67, reliability: 0.71, strategy: 0.66 }
  },
  2026: {
    McLaren: { high_speed: 0.8, downforce: 0.83, traction: 0.81, degradation: 0.82, braking: 0.79, reliability: 0.86, strategy: 0.83 },
    Mercedes: { high_speed: 0.76, downforce: 0.8, traction: 0.77, degradation: 0.79, braking: 0.78, reliability: 0.84, strategy: 0.8 },
    'Red Bull Racing': { high_speed: 0.86, downforce: 0.82, traction: 0.79, degradation: 0.77, braking: 0.8, reliability: 0.8, strategy: 0.78 },
    Ferrari: { high_speed: 0.82, downforce: 0.78, traction: 0.75, degradation: 0.72, braking: 0.76, reliability: 0.77, strategy: 0.74 },
    Williams: { high_speed: 0.74, downforce: 0.62, traction: 0.64, degradation: 0.68, braking: 0.69, reliability: 0.79, strategy: 0.69 },
    'Racing Bulls': { high_speed: 0.69, downforce: 0.66, traction: 0.67, degradation: 0.65, braking: 0.67, reliability: 0.74, strategy: 0.66 },
    'Aston Martin': { high_speed: 0.66, downforce: 0.69, traction: 0.68, degradation: 0.7, braking: 0.68, reliability: 0.73, strategy: 0.67 },
    'Haas F1 Team': { high_speed: 0.7, downforce: 0.61, traction: 0.63, degradation: 0.62, braking: 0.66, reliability: 0.68, strategy: 0.63 },
    'Kick Sauber': { high_speed: 0.63, downforce: 0.64, traction: 0.62, degradation: 0.66, braking: 0.65, reliability: 0.72, strategy: 0.64 },
    Audi: { high_speed: 0.63, downforce: 0.64, traction: 0.62, degradation: 0.66, braking: 0.65, reliability: 0.72, strategy: 0.64 },
    Alpine: { high_speed: 0.67, downforce: 0.65, traction: 0.66, degradation: 0.67, braking: 0.66, reliability: 0.71, strategy: 0.65 },
    Cadillac: { high_speed: 0.6, downforce: 0.58, traction: 0.59, degradation: 0.61, braking: 0.61, reliability: 0.64, strategy: 0.6 }
  }
};

const PROJECTION_TRACK_PROFILES = {
  'australian-grand-prix': { high_speed: 0.62, downforce: 0.56, traction: 0.58, degradation: 0.52, braking: 0.55, street: 0.35, expected_compounds: { SOFT: 0.35, MEDIUM: 0.45, HARD: 0.2 } },
  'chinese-grand-prix': { high_speed: 0.66, downforce: 0.63, traction: 0.61, degradation: 0.58, braking: 0.62, street: 0.18, expected_compounds: { SOFT: 0.3, MEDIUM: 0.5, HARD: 0.2 } },
  'japanese-grand-prix': { high_speed: 0.67, downforce: 0.78, traction: 0.71, degradation: 0.64, braking: 0.66, street: 0.05, expected_compounds: { SOFT: 0.25, MEDIUM: 0.5, HARD: 0.25 } },
  'bahrain-grand-prix': { high_speed: 0.64, downforce: 0.57, traction: 0.69, degradation: 0.76, braking: 0.63, street: 0.03, expected_compounds: { SOFT: 0.15, MEDIUM: 0.45, HARD: 0.4 } },
  'saudi-arabian-grand-prix': { high_speed: 0.83, downforce: 0.52, traction: 0.55, degradation: 0.42, braking: 0.58, street: 0.92, expected_compounds: { SOFT: 0.4, MEDIUM: 0.45, HARD: 0.15 } },
  'miami-grand-prix': { high_speed: 0.74, downforce: 0.55, traction: 0.57, degradation: 0.5, braking: 0.6, street: 0.44, expected_compounds: { SOFT: 0.3, MEDIUM: 0.5, HARD: 0.2 } },
  'canadian-grand-prix': { high_speed: 0.72, downforce: 0.49, traction: 0.65, degradation: 0.47, braking: 0.71, street: 0.5, expected_compounds: { SOFT: 0.35, MEDIUM: 0.5, HARD: 0.15 } },
  'monaco-grand-prix': { high_speed: 0.2, downforce: 0.92, traction: 0.9, degradation: 0.45, braking: 0.68, street: 1, expected_compounds: { SOFT: 0.65, MEDIUM: 0.3, HARD: 0.05 } },
  'barcelona-catalunya-grand-prix': { high_speed: 0.55, downforce: 0.84, traction: 0.7, degradation: 0.72, braking: 0.56, street: 0.05, expected_compounds: { SOFT: 0.2, MEDIUM: 0.45, HARD: 0.35 } },
  'spanish-grand-prix': { high_speed: 0.55, downforce: 0.84, traction: 0.7, degradation: 0.72, braking: 0.56, street: 0.05, expected_compounds: { SOFT: 0.2, MEDIUM: 0.45, HARD: 0.35 } },
  'austrian-grand-prix': { high_speed: 0.69, downforce: 0.57, traction: 0.63, degradation: 0.49, braking: 0.74, street: 0.02, expected_compounds: { SOFT: 0.45, MEDIUM: 0.4, HARD: 0.15 } },
  'british-grand-prix': { high_speed: 0.81, downforce: 0.82, traction: 0.68, degradation: 0.59, braking: 0.57, street: 0.03, expected_compounds: { SOFT: 0.25, MEDIUM: 0.5, HARD: 0.25 } },
  'belgian-grand-prix': { high_speed: 0.88, downforce: 0.69, traction: 0.64, degradation: 0.55, braking: 0.6, street: 0.03, expected_compounds: { SOFT: 0.2, MEDIUM: 0.45, HARD: 0.35 } },
  'hungarian-grand-prix': { high_speed: 0.34, downforce: 0.89, traction: 0.84, degradation: 0.67, braking: 0.53, street: 0.04, expected_compounds: { SOFT: 0.35, MEDIUM: 0.45, HARD: 0.2 } },
  'dutch-grand-prix': { high_speed: 0.61, downforce: 0.86, traction: 0.76, degradation: 0.63, braking: 0.55, street: 0.06, expected_compounds: { SOFT: 0.3, MEDIUM: 0.45, HARD: 0.25 } },
  'italian-grand-prix': { high_speed: 0.97, downforce: 0.33, traction: 0.46, degradation: 0.41, braking: 0.66, street: 0.03, expected_compounds: { SOFT: 0.35, MEDIUM: 0.45, HARD: 0.2 } },
  'azerbaijan-grand-prix': { high_speed: 0.92, downforce: 0.41, traction: 0.55, degradation: 0.44, braking: 0.68, street: 0.88, expected_compounds: { SOFT: 0.35, MEDIUM: 0.45, HARD: 0.2 } },
  'singapore-grand-prix': { high_speed: 0.24, downforce: 0.91, traction: 0.9, degradation: 0.69, braking: 0.77, street: 0.96, expected_compounds: { SOFT: 0.45, MEDIUM: 0.4, HARD: 0.15 } },
  'united-states-grand-prix': { high_speed: 0.63, downforce: 0.74, traction: 0.72, degradation: 0.57, braking: 0.59, street: 0.1, expected_compounds: { SOFT: 0.3, MEDIUM: 0.45, HARD: 0.25 } },
  'mexico-city-grand-prix': { high_speed: 0.77, downforce: 0.53, traction: 0.59, degradation: 0.48, braking: 0.57, street: 0.07, expected_compounds: { SOFT: 0.25, MEDIUM: 0.5, HARD: 0.25 } },
  'sao-paulo-grand-prix': { high_speed: 0.6, downforce: 0.72, traction: 0.69, degradation: 0.58, braking: 0.63, street: 0.08, expected_compounds: { SOFT: 0.35, MEDIUM: 0.45, HARD: 0.2 } },
  'las-vegas-grand-prix': { high_speed: 0.95, downforce: 0.31, traction: 0.44, degradation: 0.39, braking: 0.64, street: 0.86, expected_compounds: { SOFT: 0.4, MEDIUM: 0.4, HARD: 0.2 } },
  'qatar-grand-prix': { high_speed: 0.73, downforce: 0.86, traction: 0.66, degradation: 0.66, braking: 0.54, street: 0.04, expected_compounds: { SOFT: 0.2, MEDIUM: 0.5, HARD: 0.3 } },
  'abu-dhabi-grand-prix': { high_speed: 0.58, downforce: 0.6, traction: 0.69, degradation: 0.47, braking: 0.61, street: 0.12, expected_compounds: { SOFT: 0.25, MEDIUM: 0.5, HARD: 0.25 } },
  'emilia-romagna-grand-prix': { high_speed: 0.57, downforce: 0.74, traction: 0.71, degradation: 0.61, braking: 0.57, street: 0.06, expected_compounds: { SOFT: 0.3, MEDIUM: 0.45, HARD: 0.25 } }
};

const PROJECTION_TRACK_PROFILE_ALIASES = {
  'sao-paolo-grand-prix': 'sao-paulo-grand-prix',
  'sao-paulo-gp': 'sao-paulo-grand-prix',
  'cota-grand-prix': 'united-states-grand-prix'
};

function clamp(value, min = 0, max = 1) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeRateScore(value, fallback = 0.5) {
  const n = toFiniteNumber(value);
  if (n === null) return fallback;
  return clamp(n, 0, 1);
}

function canonicalRaceSlug(raceName) {
  return slugify(stripDiacritics(String(raceName || '')));
}

function normalizeCompound(compound) {
  return String(compound || '').trim().toUpperCase();
}

function getProjectionTrackProfile(raceName) {
  const slug = canonicalRaceSlug(raceName);
  const alias = PROJECTION_TRACK_PROFILE_ALIASES[slug] || slug;
  const profile = PROJECTION_TRACK_PROFILES[alias];

  if (profile) {
    return {
      slug: alias,
      source: 'mapped',
      ...profile
    };
  }

  return {
    slug: alias,
    source: 'neutral-fallback',
    high_speed: 0.5,
    downforce: 0.5,
    traction: 0.5,
    degradation: 0.5,
    braking: 0.5,
    street: 0.5,
    expected_compounds: { SOFT: 0.33, MEDIUM: 0.34, HARD: 0.33 }
  };
}

function getProjectionTeamTraitPriors(season) {
  return PROJECTION_TEAM_TRAITS_BY_SEASON[season] || PROJECTION_TEAM_TRAITS_BY_SEASON[2026] || {};
}

function normalizeTeamTraitRow(row = {}) {
  return {
    high_speed: clamp(toFiniteNumber(row.high_speed) ?? 0.6),
    downforce: clamp(toFiniteNumber(row.downforce) ?? 0.6),
    traction: clamp(toFiniteNumber(row.traction) ?? 0.6),
    degradation: clamp(toFiniteNumber(row.degradation) ?? 0.6),
    braking: clamp(toFiniteNumber(row.braking) ?? 0.6),
    reliability: clamp(toFiniteNumber(row.reliability) ?? 0.72),
    strategy: clamp(toFiniteNumber(row.strategy) ?? 0.66)
  };
}

function buildProjectionTeamTraits(data, season, cutoffRound, grid) {
  const priors = getProjectionTeamTraitPriors(season);
  const teamRows = new Map();

  for (const driver of grid || []) {
    const team = displayTeamName(driver.team);
    if (!teamRows.has(team)) {
      teamRows.set(team, normalizeTeamTraitRow(priors[team] || {}));
    }
  }

  const teamPoints = new Map();
  const teamStarts = new Map();
  for (const row of data.race_results || []) {
    if (row.season !== season || row.round > cutoffRound || !row.driverId) continue;
    const driver = (grid || []).find((g) => g.driverId === row.driverId);
    const team = displayTeamName(driver?.team);
    if (!team) continue;
    teamPoints.set(team, (teamPoints.get(team) || 0) + (toFiniteNumber(row.points) || 0));
    teamStarts.set(team, (teamStarts.get(team) || 0) + 1);
  }

  const ppsValues = [...teamRows.keys()].map((team) => {
    const starts = teamStarts.get(team) || 0;
    return starts > 0 ? (teamPoints.get(team) || 0) / starts : null;
  }).filter((v) => v !== null);

  const minPps = ppsValues.length ? Math.min(...ppsValues) : null;
  const maxPps = ppsValues.length ? Math.max(...ppsValues) : null;

  for (const [team, base] of teamRows.entries()) {
    const starts = teamStarts.get(team) || 0;
    const pps = starts > 0 ? (teamPoints.get(team) || 0) / starts : null;
    const perfNorm = (pps !== null && minPps !== null && maxPps !== null && maxPps > minPps)
      ? clamp((pps - minPps) / (maxPps - minPps))
      : 0.5;

    const paceAdjust = (perfNorm - 0.5) * 0.16;
    const reliabilityAdjust = (perfNorm - 0.5) * 0.08;

    teamRows.set(team, {
      high_speed: clamp(base.high_speed + paceAdjust),
      downforce: clamp(base.downforce + paceAdjust),
      traction: clamp(base.traction + paceAdjust),
      degradation: clamp(base.degradation + (paceAdjust * 0.7)),
      braking: clamp(base.braking + (paceAdjust * 0.6)),
      reliability: clamp(base.reliability + reliabilityAdjust),
      strategy: clamp(base.strategy + (paceAdjust * 0.5))
    });
  }

  return teamRows;
}

function invPositionScore(position, fieldSize) {
  const pos = toFiniteNumber(position);
  if (pos === null) return 0.5;
  return clamp(((fieldSize + 1) - pos) / Math.max(fieldSize, 1));
}

function msGapScore(ms, span = 700) {
  const value = toFiniteNumber(ms);
  if (value === null) return 0.5;
  return clamp(0.5 - (value / (span * 2)));
}

function signedScore(value, maxAbs = 5) {
  const n = toFiniteNumber(value);
  if (n === null) return 0.5;
  return clamp((n / maxAbs + 1) / 2);
}

function blendByConfidence(measured, prior, confidence) {
  return clamp((measured * confidence) + (prior * (1 - confidence)));
}

function hashString(value) {
  let hash = 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function randomNormal(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function pickBestQualGapMs(qi) {
  const values = [
    qi?.teammate_gap_by_stage?.q3?.avg_ms,
    qi?.teammate_gap_by_stage?.q2?.avg_ms,
    qi?.teammate_gap_by_stage?.q1?.avg_ms
  ].map(toFiniteNumber).filter((n) => n !== null);

  return values.length ? values[0] : null;
}

function computeTireFitScore(stintRows, expectedCompounds) {
  const rows = Array.isArray(stintRows) ? stintRows : [];
  if (!rows.length) return null;

  const compoundLapMap = new Map();
  for (const row of rows) {
    const compound = normalizeCompound(row.compound);
    const lapMs = toFiniteNumber(row.avg_lap_ms);
    if (!compound || lapMs === null) continue;
    compoundLapMap.set(compound, lapMs);
  }

  const allLaps = [...compoundLapMap.values()];
  if (!allLaps.length) return null;

  const baseline = avg(allLaps);
  let weighted = 0;
  let weightSum = 0;

  for (const [compoundRaw, weightRaw] of Object.entries(expectedCompounds || {})) {
    const weight = toFiniteNumber(weightRaw);
    const compound = normalizeCompound(compoundRaw);
    const lap = compoundLapMap.get(compound);
    if (!weight || lap === undefined) continue;

    const delta = baseline - lap;
    const compScore = clamp(0.5 + (delta / 1400));
    weighted += compScore * weight;
    weightSum += weight;
  }

  if (!weightSum) return null;
  return clamp(weighted / weightSum);
}

const PRACTICE_SLOT_WEIGHTS = {
  fp1: 0.22,
  fp2: 0.33,
  fp3: 0.45
};

function practiceSlotWeight(slot) {
  const key = String(slot || '').toLowerCase();
  return PRACTICE_SLOT_WEIGHTS[key] || 0;
}

function rankScore(value, values, lowerIsBetter = true) {
  const target = toFiniteNumber(value);
  if (target === null) return 0.5;

  const valid = (values || []).map(toFiniteNumber).filter((n) => n !== null);
  if (valid.length < 2) return 0.5;

  let lower = 0;
  let equal = 0;
  for (const n of valid) {
    if (n < target) lower += 1;
    else if (n === target) equal += 1;
  }

  const quantile = (lower + (Math.max(0, equal - 1) * 0.5)) / Math.max(1, valid.length - 1);
  return clamp(lowerIsBetter ? (1 - quantile) : quantile);
}

function buildPracticeSignalsForRound(data, season, round, grid, teamTraits, trackProfile) {
  const practiceRows = (data.practice_timing || [])
    .filter((row) => row.season === season && row.round === round && row.driverId)
    .filter((row) => !row.is_deleted && toFiniteNumber(row.lap_time_ms) !== null)
    .map((row) => ({
      ...row,
      practice_slot: String(row.practice_slot || '').toLowerCase()
    }))
    .filter((row) => row.practice_slot === 'fp1' || row.practice_slot === 'fp2' || row.practice_slot === 'fp3');

  if (!practiceRows.length) return new Map();

  const byDriver = new Map();
  for (const row of practiceRows) {
    if (!byDriver.has(row.driverId)) byDriver.set(row.driverId, new Map());
    const bySlot = byDriver.get(row.driverId);
    if (!bySlot.has(row.practice_slot)) bySlot.set(row.practice_slot, []);
    bySlot.get(row.practice_slot).push(row);
  }

  const raw = [];
  for (const driver of grid) {
    const slotMap = byDriver.get(driver.driverId);
    if (!slotMap) continue;

    const slotSummaries = [];
    const allCompoundRows = [];

    for (const slot of ['fp1', 'fp2', 'fp3']) {
      const rows = (slotMap.get(slot) || [])
        .slice()
        .sort((a, b) => (toInt(a.lap) || 0) - (toInt(b.lap) || 0));

      if (!rows.length) continue;

      const lapSeries = rows
        .map((row) => toFiniteNumber(row.lap_time_ms))
        .filter((n) => n !== null);

      if (!lapSeries.length) continue;

      const sortedFastest = [...lapSeries].sort((a, b) => a - b);
      const shortRunMs = avg(sortedFastest.slice(0, Math.min(3, sortedFastest.length)));
      const longRunMs = median(lapSeries);
      const consistencyMs = stddev(lapSeries);
      const degradationMsPerLap = slope(lapSeries);

      const compoundLapMap = new Map();
      for (const row of rows) {
        const lapMs = toFiniteNumber(row.lap_time_ms);
        if (lapMs === null) continue;
        const compound = normalizeCompound(row.compound);
        if (!compound) continue;
        if (!compoundLapMap.has(compound)) compoundLapMap.set(compound, []);
        compoundLapMap.get(compound).push(lapMs);
      }

      const compoundRows = [...compoundLapMap.entries()].map(([compound, laps]) => ({
        compound,
        avg_lap_ms: roundTo(avg(laps), 0)
      }));

      for (const row of compoundRows) allCompoundRows.push(row);

      slotSummaries.push({
        slot,
        slot_weight: practiceSlotWeight(slot),
        lap_count: lapSeries.length,
        short_run_ms: shortRunMs,
        long_run_ms: longRunMs,
        consistency_ms: consistencyMs,
        degradation_ms_per_lap: degradationMsPerLap,
        compound_fit: computeTireFitScore(compoundRows, trackProfile.expected_compounds)
      });
    }

    if (!slotSummaries.length) continue;

    const weightedMetric = (key) => {
      let sum = 0;
      let weight = 0;
      for (const row of slotSummaries) {
        const value = toFiniteNumber(row[key]);
        const rowWeight = toFiniteNumber(row.slot_weight);
        if (value === null || rowWeight === null || rowWeight <= 0) continue;
        sum += value * rowWeight;
        weight += rowWeight;
      }
      return weight ? (sum / weight) : null;
    };

    const lapCount = slotSummaries.reduce((acc, row) => acc + (toInt(row.lap_count) || 0), 0);
    const compoundFit = computeTireFitScore(allCompoundRows, trackProfile.expected_compounds);

    raw.push({
      driverId: driver.driverId,
      team: displayTeamName(driver.team),
      short_run_ms: weightedMetric('short_run_ms'),
      long_run_ms: weightedMetric('long_run_ms'),
      consistency_ms: weightedMetric('consistency_ms'),
      degradation_ms_per_lap: weightedMetric('degradation_ms_per_lap'),
      lap_count: lapCount,
      slots_seen: slotSummaries.length,
      compound_fit: compoundFit === null ? weightedMetric('compound_fit') : compoundFit
    });
  }

  const shortRunValues = raw.map((row) => row.short_run_ms).filter((n) => toFiniteNumber(n) !== null);
  const longRunValues = raw.map((row) => row.long_run_ms).filter((n) => toFiniteNumber(n) !== null);
  const consistencyValues = raw.map((row) => row.consistency_ms).filter((n) => toFiniteNumber(n) !== null);
  const degradationValues = raw.map((row) => row.degradation_ms_per_lap).filter((n) => toFiniteNumber(n) !== null);
  const lapCountValues = raw.map((row) => row.lap_count).filter((n) => toFiniteNumber(n) !== null);

  const result = new Map();

  for (const row of raw) {
    const shortRunScore = rankScore(row.short_run_ms, shortRunValues, true);
    const longRunScore = rankScore(row.long_run_ms, longRunValues, true);
    const consistencyScore = rankScore(row.consistency_ms, consistencyValues, true);
    const degradationScore = rankScore(row.degradation_ms_per_lap, degradationValues, true);
    const lapCountScore = rankScore(row.lap_count, lapCountValues, false);
    const compoundScore = toFiniteNumber(row.compound_fit) === null ? 0.5 : clamp(row.compound_fit);

    const qualRaw = clamp(
      (shortRunScore * 0.5) +
      (consistencyScore * 0.2) +
      (compoundScore * 0.2) +
      (lapCountScore * 0.1)
    );

    const raceRaw = clamp(
      (longRunScore * 0.38) +
      (degradationScore * 0.22) +
      (consistencyScore * 0.18) +
      (compoundScore * 0.14) +
      (lapCountScore * 0.08)
    );

    const slotCoverage = clamp((toFiniteNumber(row.slots_seen) || 0) / 3);
    const lapCoverage = clamp((toFiniteNumber(row.lap_count) || 0) / 55);
    const metricCoverage = [
      row.short_run_ms,
      row.long_run_ms,
      row.consistency_ms,
      row.degradation_ms_per_lap,
      row.compound_fit
    ].filter((n) => toFiniteNumber(n) !== null).length / 5;

    const confidence = clamp(
      (slotCoverage * 0.35) +
      (lapCoverage * 0.4) +
      (metricCoverage * 0.25)
    );

    const trait = teamTraits.get(row.team) || normalizeTeamTraitRow({});

    const qualPrior = clamp(
      (trait.downforce * 0.32) +
      (trait.traction * 0.2) +
      (trackProfile.downforce * 0.28) +
      (trackProfile.traction * 0.2)
    );

    const racePrior = clamp(
      (trait.high_speed * 0.2) +
      (trait.degradation * 0.26) +
      (trait.strategy * 0.14) +
      (trackProfile.degradation * 0.22) +
      (trackProfile.high_speed * 0.18)
    );

    result.set(row.driverId, {
      qual_signal: blendByConfidence(qualRaw, qualPrior, confidence),
      race_signal: blendByConfidence(raceRaw, racePrior, confidence),
      confidence,
      lap_count: row.lap_count,
      sessions_seen: row.slots_seen
    });
  }

  return result;
}

function testingSeasonDecayFactor(round) {
  const currentRound = Math.max(1, toInt(round) || 1);
  if (currentRound <= 3) return 1;
  if (currentRound >= 12) return 0.35;
  return clamp(1 - (((currentRound - 3) / 9) * 0.65), 0.35, 1);
}

function buildTestingSignalsForSeason(data, season, round, grid, teamTraits, trackProfile) {
  const testingRows = (data.testing_timing || [])
    .filter((row) => row.season === season && row.driverId)
    .filter((row) => !row.is_deleted && toFiniteNumber(row.lap_time_ms) !== null);

  if (!testingRows.length) return new Map();

  const sessionSortKey = (row) => {
    const order = toInt(row.session_order);
    if (order !== null) return order;
    const ts = toEpochMs(row.date_start);
    if (ts !== null) return ts;
    return 0;
  };

  const rowsBySession = new Map();
  for (const row of testingRows) {
    const sessionKey = toInt(row.session_key);
    if (!sessionKey) continue;
    if (!rowsBySession.has(sessionKey)) rowsBySession.set(sessionKey, []);
    rowsBySession.get(sessionKey).push(row);
  }

  const orderedSessionKeys = [...rowsBySession.entries()]
    .sort((a, b) => sessionSortKey(a[1][0]) - sessionSortKey(b[1][0]))
    .map(([sessionKey]) => sessionKey);
  const sessionRankByKey = new Map(orderedSessionKeys.map((sessionKey, idx) => [sessionKey, idx + 1]));
  const maxSessionRank = Math.max(1, orderedSessionKeys.length);
  const seasonDecay = testingSeasonDecayFactor(round);

  const byDriver = new Map();
  for (const row of testingRows) {
    const driverId = row.driverId;
    if (!driverId) continue;
    if (!byDriver.has(driverId)) byDriver.set(driverId, new Map());
    const driverSessions = byDriver.get(driverId);
    const sessionKey = toInt(row.session_key);
    if (!sessionKey) continue;
    if (!driverSessions.has(sessionKey)) driverSessions.set(sessionKey, []);
    driverSessions.get(sessionKey).push(row);
  }

  const raw = [];

  for (const driver of grid) {
    const sessionMap = byDriver.get(driver.driverId);
    if (!sessionMap) continue;

    const sessionSummaries = [];
    const allCompoundRows = [];

    for (const [sessionKey, rows] of sessionMap.entries()) {
      const orderedRows = rows
        .slice()
        .sort((a, b) => (toInt(a.lap) || 0) - (toInt(b.lap) || 0));
      if (!orderedRows.length) continue;

      const lapSeries = orderedRows
        .map((row) => toFiniteNumber(row.lap_time_ms))
        .filter((n) => n !== null);
      if (!lapSeries.length) continue;

      const sortedFastest = [...lapSeries].sort((a, b) => a - b);
      const shortRunMs = avg(sortedFastest.slice(0, Math.min(3, sortedFastest.length)));
      const longRunMs = median(lapSeries);
      const consistencyMs = stddev(lapSeries);
      const degradationMsPerLap = slope(lapSeries);

      const compoundLapMap = new Map();
      for (const row of orderedRows) {
        const lapMs = toFiniteNumber(row.lap_time_ms);
        if (lapMs === null) continue;
        const compound = normalizeCompound(row.compound);
        if (!compound) continue;
        if (!compoundLapMap.has(compound)) compoundLapMap.set(compound, []);
        compoundLapMap.get(compound).push(lapMs);
      }

      const compoundRows = [...compoundLapMap.entries()].map(([compound, laps]) => ({
        compound,
        avg_lap_ms: roundTo(avg(laps), 0)
      }));
      for (const row of compoundRows) allCompoundRows.push(row);

      const rank = sessionRankByKey.get(sessionKey) || 1;
      const recencyWeight = 0.6 + (0.4 * (rank / maxSessionRank));
      const sampleWeight = 0.7 + (0.3 * clamp(lapSeries.length / 50));
      const sessionWeight = recencyWeight * sampleWeight;

      sessionSummaries.push({
        session_key: sessionKey,
        session_weight: sessionWeight,
        lap_count: lapSeries.length,
        short_run_ms: shortRunMs,
        long_run_ms: longRunMs,
        consistency_ms: consistencyMs,
        degradation_ms_per_lap: degradationMsPerLap,
        compound_fit: computeTireFitScore(compoundRows, trackProfile.expected_compounds)
      });
    }

    if (!sessionSummaries.length) continue;

    const weightedMetric = (key) => {
      let sum = 0;
      let weight = 0;
      for (const row of sessionSummaries) {
        const value = toFiniteNumber(row[key]);
        const rowWeight = toFiniteNumber(row.session_weight);
        if (value === null || rowWeight === null || rowWeight <= 0) continue;
        sum += value * rowWeight;
        weight += rowWeight;
      }
      return weight ? (sum / weight) : null;
    };

    const lapCount = sessionSummaries.reduce((acc, row) => acc + (toInt(row.lap_count) || 0), 0);
    const compoundFit = computeTireFitScore(allCompoundRows, trackProfile.expected_compounds);

    raw.push({
      driverId: driver.driverId,
      team: displayTeamName(driver.team),
      short_run_ms: weightedMetric('short_run_ms'),
      long_run_ms: weightedMetric('long_run_ms'),
      consistency_ms: weightedMetric('consistency_ms'),
      degradation_ms_per_lap: weightedMetric('degradation_ms_per_lap'),
      lap_count: lapCount,
      sessions_seen: sessionSummaries.length,
      compound_fit: compoundFit === null ? weightedMetric('compound_fit') : compoundFit
    });
  }

  if (!raw.length) return new Map();

  const shortRunValues = raw.map((row) => row.short_run_ms).filter((n) => toFiniteNumber(n) !== null);
  const longRunValues = raw.map((row) => row.long_run_ms).filter((n) => toFiniteNumber(n) !== null);
  const consistencyValues = raw.map((row) => row.consistency_ms).filter((n) => toFiniteNumber(n) !== null);
  const degradationValues = raw.map((row) => row.degradation_ms_per_lap).filter((n) => toFiniteNumber(n) !== null);
  const lapCountValues = raw.map((row) => row.lap_count).filter((n) => toFiniteNumber(n) !== null);

  const result = new Map();

  for (const row of raw) {
    const shortRunScore = rankScore(row.short_run_ms, shortRunValues, true);
    const longRunScore = rankScore(row.long_run_ms, longRunValues, true);
    const consistencyScore = rankScore(row.consistency_ms, consistencyValues, true);
    const degradationScore = rankScore(row.degradation_ms_per_lap, degradationValues, true);
    const lapCountScore = rankScore(row.lap_count, lapCountValues, false);
    const compoundScore = toFiniteNumber(row.compound_fit) === null ? 0.5 : clamp(row.compound_fit);

    const qualRaw = clamp(
      (shortRunScore * 0.46) +
      (consistencyScore * 0.2) +
      (compoundScore * 0.2) +
      (lapCountScore * 0.14)
    );

    const raceRaw = clamp(
      (longRunScore * 0.36) +
      (degradationScore * 0.21) +
      (consistencyScore * 0.19) +
      (compoundScore * 0.15) +
      (lapCountScore * 0.09)
    );

    const sessionCoverage = clamp((toFiniteNumber(row.sessions_seen) || 0) / 6);
    const lapCoverage = clamp((toFiniteNumber(row.lap_count) || 0) / 220);
    const metricCoverage = [
      row.short_run_ms,
      row.long_run_ms,
      row.consistency_ms,
      row.degradation_ms_per_lap,
      row.compound_fit
    ].filter((n) => toFiniteNumber(n) !== null).length / 5;

    const confidenceBase = clamp(
      (sessionCoverage * 0.4) +
      (lapCoverage * 0.35) +
      (metricCoverage * 0.25)
    );

    const confidence = clamp(confidenceBase * seasonDecay * 0.85, 0, 0.75);
    const trait = teamTraits.get(row.team) || normalizeTeamTraitRow({});

    const qualPrior = clamp(
      (trait.downforce * 0.34) +
      (trait.traction * 0.2) +
      (trackProfile.downforce * 0.28) +
      (trackProfile.traction * 0.18)
    );

    const racePrior = clamp(
      (trait.high_speed * 0.22) +
      (trait.degradation * 0.26) +
      (trait.strategy * 0.14) +
      (trackProfile.degradation * 0.2) +
      (trackProfile.high_speed * 0.18)
    );

    result.set(row.driverId, {
      qual_signal: blendByConfidence(qualRaw, qualPrior, confidence),
      race_signal: blendByConfidence(raceRaw, racePrior, confidence),
      confidence,
      lap_count: row.lap_count,
      sessions_seen: row.sessions_seen,
      season_decay: seasonDecay
    });
  }

  return result;
}

function mergePracticeSignals(weekendSignal, testingSignal) {
  const weekend = weekendSignal || null;
  const testing = testingSignal || null;
  if (!weekend && !testing) return null;

  if (weekend && !testing) {
    return {
      ...weekend,
      source: 'weekend',
      weekend_confidence: clamp(toFiniteNumber(weekend.confidence) ?? 0),
      testing_confidence: 0
    };
  }

  if (!weekend && testing) {
    const testingConfidence = clamp(toFiniteNumber(testing.confidence) ?? 0);
    return {
      ...testing,
      source: 'testing',
      confidence: clamp(testingConfidence * 0.85),
      weekend_confidence: 0,
      testing_confidence: testingConfidence
    };
  }

  const weekendConfidence = clamp(toFiniteNumber(weekend.confidence) ?? 0);
  const testingConfidence = clamp(toFiniteNumber(testing.confidence) ?? 0);
  const testingInfluence = clamp(testingConfidence * (1 - weekendConfidence) * 0.8, 0, 0.45);
  const qualSignal = clamp(((toFiniteNumber(weekend.qual_signal) ?? 0.5) * (1 - testingInfluence)) + ((toFiniteNumber(testing.qual_signal) ?? 0.5) * testingInfluence));
  const raceSignal = clamp(((toFiniteNumber(weekend.race_signal) ?? 0.5) * (1 - testingInfluence)) + ((toFiniteNumber(testing.race_signal) ?? 0.5) * testingInfluence));
  const confidence = clamp(weekendConfidence + (testingConfidence * 0.25 * (1 - weekendConfidence)));

  return {
    qual_signal: qualSignal,
    race_signal: raceSignal,
    confidence,
    lap_count: (toInt(weekend.lap_count) || 0) + (toInt(testing.lap_count) || 0),
    sessions_seen: (toInt(weekend.sessions_seen) || 0) + (toInt(testing.sessions_seen) || 0),
    source: 'weekend+testing',
    weekend_confidence: weekendConfidence,
    testing_confidence: testingConfidence,
    testing_season_decay: toFiniteNumber(testing.season_decay)
  };
}

function buildPracticeSignalSummary(drivers) {
  const summary = {
    weekend_only: 0,
    testing_only: 0,
    blended: 0,
    none: 0,
    average_confidence: 0,
    drivers_with_testing_signal: 0
  };

  if (!Array.isArray(drivers) || !drivers.length) return summary;

  let confidenceSum = 0;

  for (const driver of drivers) {
    const context = driver.practice_context || {};
    const source = context.source || 'none';
    if (source === 'weekend') summary.weekend_only += 1;
    else if (source === 'testing') summary.testing_only += 1;
    else if (source === 'weekend+testing') summary.blended += 1;
    else summary.none += 1;

    if ((toFiniteNumber(context.testing_confidence) || 0) > 0) summary.drivers_with_testing_signal += 1;
    confidenceSum += (toFiniteNumber(context.confidence) || 0);
  }

  summary.average_confidence = drivers.length ? roundTo(confidenceSum / drivers.length, 4) : 0;
  return summary;
}

function buildProjectionDrivers(data, season, round, options = {}) {
  const includeTesting = options.includeTesting !== false;
  const cutoffRound = Math.max(0, round - 1);
  const schedule = getSeasonSchedule(season);
  const race = schedule.find((row) => row.round === round);
  if (!race) throw fail('Race weekend not found for selected season/round', 404);

  const grid = resolveGridDrivers(data, season);
  if (!grid.length) throw fail('No grid available for selected season', 400);

  const trackProfile = getProjectionTrackProfile(race.raceName);
  const intelligence = computeIntelligenceViewRows(data, season, 'blended', {
    maxRound: cutoffRound,
    includeCurrentSeasonInHistory: false
  });
  const intelByDriver = new Map(intelligence.map((row) => [row.driverId, row]));
  const teamTraits = buildProjectionTeamTraits(data, season, cutoffRound, grid);
  const weekendPracticeSignals = buildPracticeSignalsForRound(data, season, round, grid, teamTraits, trackProfile);
  const testingSignals = includeTesting
    ? buildTestingSignalsForSeason(data, season, round, grid, teamTraits, trackProfile)
    : new Map();

  const roundsByDriver = new Map();
  for (const row of data.race_results || []) {
    if (row.season !== season || row.round > cutoffRound || !row.driverId) continue;
    if (!roundsByDriver.has(row.driverId)) roundsByDriver.set(row.driverId, new Set());
    roundsByDriver.get(row.driverId).add(row.round);
  }

  const qualifiers = [];

  for (const driver of grid) {
    const team = displayTeamName(driver.team);
    const trait = teamTraits.get(team) || normalizeTeamTraitRow({});
    const stats = intelByDriver.get(driver.driverId) || {};
    const qi = stats.qualifying_intel || {};
    const ri = stats.race_intel || {};
    const ci = stats.combined_intel || {};
    const weekendPractice = weekendPracticeSignals.get(driver.driverId) || null;
    const testingPractice = testingSignals.get(driver.driverId) || null;
    const practice = mergePracticeSignals(weekendPractice, testingPractice);

    const fieldSize = grid.length;
    const practiceConfidence = clamp(toFiniteNumber(practice?.confidence) ?? 0, 0, 1);
    const practiceQualContribution = clamp(
      ((toFiniteNumber(practice?.qual_signal) ?? 0.5) * practiceConfidence) + (0.5 * (1 - practiceConfidence))
    );
    const practiceRaceContribution = clamp(
      ((toFiniteNumber(practice?.race_signal) ?? 0.5) * practiceConfidence) + (0.5 * (1 - practiceConfidence))
    );

    const q3Rate = toFiniteNumber(qi.stage_survival_rate?.q3);
    const teammateQualGapMs = pickBestQualGapMs(qi);
    const teammateRaceGapMs = toFiniteNumber(ri.teammate_race_pace_gap_ms);

    const headToHeadRounds = toFiniteNumber(qi.head_to_head?.compared_rounds) || 0;
    const h2hWins = toFiniteNumber(qi.head_to_head?.wins) || 0;
    const h2hTies = toFiniteNumber(qi.head_to_head?.ties) || 0;
    const h2hScore = headToHeadRounds > 0
      ? clamp((h2hWins + (0.5 * h2hTies)) / headToHeadRounds)
      : 0.5;

    const qualPace = clamp(
      (invPositionScore(stats.avg_quali, fieldSize) * 0.45) +
      (safeRateScore(q3Rate) * 0.25) +
      (msGapScore(teammateQualGapMs, 700) * 0.2) +
      (invPositionScore(qi.final_run_clutch_rank, fieldSize) * 0.1)
    );

    const consistencyScore = (() => {
      const consistencyMs = toFiniteNumber(ri.lap_pace_consistency_ms);
      if (consistencyMs === null) return 0.5;
      return clamp(1 - (consistencyMs / 1800));
    })();

    const racePace = clamp(
      (invPositionScore(ri.avg_race_finish ?? stats.avg_finish, fieldSize) * 0.34) +
      (safeRateScore(ri.points_conversion_rate) * 0.24) +
      (msGapScore(teammateRaceGapMs, 900) * 0.22) +
      (consistencyScore * 0.2)
    );

    const momentum = clamp(0.5 + ((toFiniteNumber(ci.momentum_index) || 0) / 8));

    const formScore = clamp(
      (invPositionScore(stats.form?.avg_finish, fieldSize) * 0.4) +
      (clamp((toFiniteNumber(stats.form?.points) || 0) / 125) * 0.4) +
      (momentum * 0.2)
    );

    const startCraft = clamp(
      (signedScore(ri.positions_gained_lost, 6) * 0.5) +
      (signedScore(ri.first_lap_gain_loss, 4) * 0.25) +
      (signedScore(ri.recovery_index, 8) * 0.25)
    );

    const reliabilityMeasured = clamp(1 - (toFiniteNumber(ri.dnf_rate) ?? 0.2));
    const reliability = blendByConfidence(reliabilityMeasured, trait.reliability, 0.7);

    let trackFit = clamp(
      ((trait.high_speed * trackProfile.high_speed) +
      (trait.downforce * trackProfile.downforce) +
      (trait.traction * trackProfile.traction) +
      (trait.degradation * trackProfile.degradation) +
      (trait.braking * trackProfile.braking)) / 5
    );

    if (trackProfile.street >= 0.65) {
      const streetBonus = (((trait.traction + trait.downforce) / 2) - 0.5) * 0.12;
      trackFit = clamp(trackFit + streetBonus);
    }

    const tireFitMeasured = computeTireFitScore(ri.stint_pace_by_compound, trackProfile.expected_compounds);
    const tireFit = tireFitMeasured === null
      ? blendByConfidence(0.5, trait.degradation, 0.5)
      : blendByConfidence(tireFitMeasured, trait.degradation, 0.75);

    const strategyFit = clamp((tireFit * 0.55) + (trait.strategy * 0.45));
    const teammateQualEdge = clamp((msGapScore(teammateQualGapMs, 700) * 0.7) + (h2hScore * 0.3));
    const q3Presence = safeRateScore(q3Rate);

    const roundsSeen = (roundsByDriver.get(driver.driverId) || new Set()).size;
    const sampleGoal = Math.max(2, Math.min(cutoffRound, 8));
    const sampleScore = sampleGoal ? clamp(roundsSeen / sampleGoal) : 0;

    const coverageFlags = [
      toFiniteNumber(stats.avg_quali),
      q3Rate,
      teammateQualGapMs,
      toFiniteNumber(ri.avg_race_finish ?? stats.avg_finish),
      toFiniteNumber(ri.points_conversion_rate),
      teammateRaceGapMs,
      toFiniteNumber(ri.lap_pace_consistency_ms),
      tireFitMeasured,
      practiceConfidence > 0 ? practiceConfidence : null
    ];

    const coverage = coverageFlags.filter((v) => v !== null).length / coverageFlags.length;
    const confidence = clamp(0.24 + (0.38 * sampleScore) + (0.24 * coverage) + (0.14 * practiceConfidence), 0.25, 0.98);

    const qualPrior = clamp(
      (trait.downforce * 0.35) +
      (trait.high_speed * 0.2) +
      (trait.traction * 0.15) +
      (trait.strategy * 0.1) +
      (trackFit * 0.2)
    );

    const racePrior = clamp(
      (trait.high_speed * 0.24) +
      (trait.downforce * 0.2) +
      (trait.traction * 0.16) +
      (trait.degradation * 0.16) +
      (trait.strategy * 0.12) +
      (trait.reliability * 0.12)
    );

    const qualifyingWeights = PROJECTION_MODEL_SPEC.qualifying_weights;
    const raceWeights = PROJECTION_MODEL_SPEC.race_weights;

    const qualifyingRaw = clamp(
      (qualPace * qualifyingWeights.qual_pace) +
      (q3Presence * qualifyingWeights.q3_presence) +
      (teammateQualEdge * qualifyingWeights.teammate_qual_edge) +
      (trackFit * qualifyingWeights.track_fit) +
      (tireFit * qualifyingWeights.tire_fit) +
      (momentum * qualifyingWeights.momentum) +
      (reliability * qualifyingWeights.reliability) +
      (practiceQualContribution * qualifyingWeights.practice_signal)
    );

    const raceRaw = clamp(
      (racePace * raceWeights.race_pace) +
      (qualifyingRaw * raceWeights.qualifying_transfer) +
      (strategyFit * raceWeights.strategy_tire_fit) +
      (trackFit * raceWeights.track_fit) +
      (startCraft * raceWeights.start_craft) +
      (reliability * raceWeights.reliability) +
      (momentum * raceWeights.momentum) +
      (formScore * raceWeights.form) +
      (practiceRaceContribution * raceWeights.practice_signal)
    );

    const qualifyingScore = blendByConfidence(qualifyingRaw, qualPrior, confidence);
    const raceScore = blendByConfidence(raceRaw, racePrior, confidence);

    qualifiers.push({
      driverId: driver.driverId,
      driverName: driver.driverName,
      team,
      rounds_seen: roundsSeen,
      confidence,
      reliability,
      qualifying_score: qualifyingScore,
      race_score: raceScore,
      practice_context: {
        source: practice?.source || 'none',
        confidence: practiceConfidence,
        weekend_confidence: toFiniteNumber(practice?.weekend_confidence) || 0,
        testing_confidence: toFiniteNumber(practice?.testing_confidence) || 0,
        testing_season_decay: toFiniteNumber(practice?.testing_season_decay) || null
      },
      metrics: {
        qual_pace: qualPace,
        race_pace: racePace,
        q3_presence: q3Presence,
        teammate_qual_edge: teammateQualEdge,
        teammate_qual_gap_ms: teammateQualGapMs,
        teammate_race_gap_ms: teammateRaceGapMs,
        track_fit: trackFit,
        tire_fit: tireFit,
        strategy_fit: strategyFit,
        momentum,
        form: formScore,
        start_craft: startCraft,
        sample_score: sampleScore,
        coverage,
        head_to_head_score: h2hScore,
        practice_confidence: practiceConfidence
      }
    });
  }

  return {
    cutoffRound,
    race,
    trackProfile,
    includeTesting,
    drivers: qualifiers
  };
}

function runProjectionSimulation(projectionDrivers, season, round, user, options = {}) {
  const runsOverride = toInt(options.runs);
  const runs = Math.max(200, runsOverride || PROJECTION_MODEL_SPEC.simulation_runs);
  const fieldSize = projectionDrivers.length;
  const seedSalt = String(options.seedSalt || '');
  const seed = (season * 1009) + (round * 97) + hashString((user || 'all-users') + ':' + seedSalt + ':' + runs);
  const rng = seededRandom(seed);

  const positionCounts = new Map();
  const qualifyingPositionCounts = new Map();
  const fastestLapCounts = new Map();
  const podiumOrderCounts = new Map();

  const driverById = new Map();
  for (const driver of projectionDrivers) {
    driverById.set(driver.driverId, driver);
    positionCounts.set(driver.driverId, Array(fieldSize + 1).fill(0));
    qualifyingPositionCounts.set(driver.driverId, Array(fieldSize + 1).fill(0));
    fastestLapCounts.set(driver.driverId, 0);
  }

  for (let run = 0; run < runs; run += 1) {
    const qualifyingSamples = projectionDrivers
      .map((driver) => {
        const noise = randomNormal(rng) * (
          PROJECTION_MODEL_SPEC.simulation.qualifying_noise_base + ((1 - driver.confidence) * 0.06)
        );
        const score = driver.qualifying_score + noise + ((driver.metrics.track_fit - 0.5) * 0.03);
        return { driverId: driver.driverId, score };
      })
      .sort((a, b) => b.score - a.score);

    const qualifyingRankByDriver = new Map();
    qualifyingSamples.forEach((row, idx) => {
      const pos = idx + 1;
      qualifyingPositionCounts.get(row.driverId)[pos] += 1;
      qualifyingRankByDriver.set(row.driverId, pos);
    });

    const finishers = [];
    const dnfs = [];

    for (const driver of projectionDrivers) {
      const qRank = qualifyingRankByDriver.get(driver.driverId) || fieldSize;
      const qBoost = (fieldSize - qRank) / Math.max(1, fieldSize - 1);
      const dnfProbability = clamp(
        1 - driver.reliability,
        PROJECTION_MODEL_SPEC.simulation.dnf_probability_floor,
        PROJECTION_MODEL_SPEC.simulation.dnf_probability_ceiling
      );

      const raceNoise = randomNormal(rng) * (
        PROJECTION_MODEL_SPEC.simulation.race_noise_base + ((1 - driver.confidence) * 0.085)
      );

      const raceScore = driver.race_score + (qBoost * 0.12) + (driver.metrics.start_craft * 0.04) + raceNoise;
      const retired = rng() < dnfProbability;

      if (retired) dnfs.push({ driverId: driver.driverId, score: raceScore });
      else finishers.push({ driverId: driver.driverId, score: raceScore });
    }

    finishers.sort((a, b) => b.score - a.score);
    dnfs.sort((a, b) => b.score - a.score);

    const raceOrder = [...finishers, ...dnfs].map((row) => row.driverId);
    raceOrder.forEach((driverId, idx) => {
      const pos = idx + 1;
      positionCounts.get(driverId)[pos] += 1;
    });

    const podiumKey = raceOrder.slice(0, 3).join('|');
    podiumOrderCounts.set(podiumKey, (podiumOrderCounts.get(podiumKey) || 0) + 1);

    const fastestCandidates = finishers.slice(0, Math.min(10, finishers.length));
    if (fastestCandidates.length) {
      let bestDriverId = fastestCandidates[0].driverId;
      let bestScore = -Infinity;

      for (const row of fastestCandidates) {
        const driver = driverById.get(row.driverId);
        const fastestScore =
          (driver.race_score * 0.5) +
          (driver.metrics.tire_fit * 0.25) +
          (driver.reliability * 0.15) +
          (randomNormal(rng) * 0.06);

        if (fastestScore > bestScore) {
          bestScore = fastestScore;
          bestDriverId = row.driverId;
        }
      }

      fastestLapCounts.set(bestDriverId, (fastestLapCounts.get(bestDriverId) || 0) + 1);
    }
  }

  return {
    runs,
    fieldSize,
    positionCounts,
    qualifyingPositionCounts,
    fastestLapCounts,
    podiumOrderCounts
  };
}

function buildChampionshipProjection(data, season, fromRound, includeTesting = true) {
  const schedule = getSeasonSchedule(season)
    .slice()
    .sort((a, b) => a.round - b.round);
  const remainingRounds = schedule.filter((row) => row.round >= fromRound);
  const throughRound = Math.max(0, fromRound - 1);
  const simulationRuns = PROJECTION_MODEL_SPEC.championship_simulation_runs_per_round || 600;

  const grid = resolveGridDrivers(data, season);
  const driverMetaById = new Map();
  const teamByDriverId = new Map();
  for (const row of grid) {
    const driverId = row.driverId;
    const team = displayTeamName(row.team);
    driverMetaById.set(driverId, {
      driverId,
      driverName: row.driverName || driverId,
      team
    });
    teamByDriverId.set(driverId, team);
  }

  const currentPointsByDriver = new Map();
  for (const row of grid) currentPointsByDriver.set(row.driverId, 0);

  for (const row of data.race_results || []) {
    if (row.season !== season) continue;
    if (toInt(row.round) === null || row.round >= fromRound) continue;
    if (!row.driverId) continue;
    const points = toFiniteNumber(row.points) || 0;
    currentPointsByDriver.set(row.driverId, (currentPointsByDriver.get(row.driverId) || 0) + points);
  }

  const futurePointsByDriver = new Map([...currentPointsByDriver.keys()].map((driverId) => [driverId, 0]));
  const projectedWinsByDriver = new Map([...currentPointsByDriver.keys()].map((driverId) => [driverId, 0]));
  const usedRounds = [];

  for (const race of remainingRounds) {
    const projectionBase = buildProjectionDrivers(data, season, race.round, { includeTesting });
    const sim = runProjectionSimulation(projectionBase.drivers, season, race.round, null, {
      runs: simulationRuns,
      seedSalt: 'championship'
    });
    const table = buildProjectionTables(sim, projectionBase.drivers);
    usedRounds.push({
      round: race.round,
      raceName: race.raceName,
      date: race.start_date
    });

    for (const row of table.raceRows || []) {
      futurePointsByDriver.set(row.driverId, (futurePointsByDriver.get(row.driverId) || 0) + (toFiniteNumber(row.expected_points) || 0));
      projectedWinsByDriver.set(row.driverId, (projectedWinsByDriver.get(row.driverId) || 0) + (toFiniteNumber(row.probabilities?.win) || 0));
    }
  }

  const driverRows = [...currentPointsByDriver.keys()].map((driverId) => {
    const meta = driverMetaById.get(driverId) || { driverId, driverName: driverId, team: teamByDriverId.get(driverId) || 'Unknown' };
    const current = toFiniteNumber(currentPointsByDriver.get(driverId)) || 0;
    const future = toFiniteNumber(futurePointsByDriver.get(driverId)) || 0;
    const projectedTotal = current + future;
    return {
      driverId,
      driverName: meta.driverName,
      team: meta.team,
      current_points: roundTo(current, 2),
      projected_points_remaining: roundTo(future, 2),
      projected_total_points: roundTo(projectedTotal, 2),
      projected_wins: roundTo(toFiniteNumber(projectedWinsByDriver.get(driverId)) || 0, 2)
    };
  }).sort((a, b) =>
    (b.projected_total_points - a.projected_total_points) ||
    (b.projected_wins - a.projected_wins) ||
    a.driverName.localeCompare(b.driverName)
  );

  const leaderDriverTotal = driverRows.length ? driverRows[0].projected_total_points : 0;
  driverRows.forEach((row, index) => {
    row.rank = index + 1;
    row.gap_to_leader = roundTo(leaderDriverTotal - row.projected_total_points, 2);
  });

  const constructorCurrent = new Map();
  const constructorFuture = new Map();
  const constructorWins = new Map();

  for (const row of driverRows) {
    const team = displayTeamName(row.team);
    constructorCurrent.set(team, (constructorCurrent.get(team) || 0) + (toFiniteNumber(row.current_points) || 0));
    constructorFuture.set(team, (constructorFuture.get(team) || 0) + (toFiniteNumber(row.projected_points_remaining) || 0));
    constructorWins.set(team, (constructorWins.get(team) || 0) + (toFiniteNumber(row.projected_wins) || 0));
  }

  const constructorRows = [...constructorCurrent.keys()].map((team) => {
    const current = constructorCurrent.get(team) || 0;
    const future = constructorFuture.get(team) || 0;
    const projectedTotal = current + future;
    return {
      team,
      current_points: roundTo(current, 2),
      projected_points_remaining: roundTo(future, 2),
      projected_total_points: roundTo(projectedTotal, 2),
      projected_wins: roundTo(constructorWins.get(team) || 0, 2)
    };
  }).sort((a, b) =>
    (b.projected_total_points - a.projected_total_points) ||
    (b.projected_wins - a.projected_wins) ||
    a.team.localeCompare(b.team)
  );

  const leaderConstructorTotal = constructorRows.length ? constructorRows[0].projected_total_points : 0;
  constructorRows.forEach((row, index) => {
    row.rank = index + 1;
    row.gap_to_leader = roundTo(leaderConstructorTotal - row.projected_total_points, 2);
  });

  return {
    season,
    from_round: fromRound,
    through_round: throughRound,
    to_round: schedule.length ? schedule[schedule.length - 1].round : fromRound,
    rounds_remaining: remainingRounds.length,
    simulation_runs_per_round: simulationRuns,
    include_testing_signal: includeTesting,
    method: 'Current points through previous round + expected points from projected remaining rounds.',
    rounds_used: usedRounds,
    driver_table: driverRows,
    constructor_table: constructorRows
  };
}

function buildProjectionTables(simResult, projectionDrivers) {
  const raceRows = [];
  const qualifyingRows = [];

  for (const driver of projectionDrivers) {
    const raceCounts = simResult.positionCounts.get(driver.driverId) || [];
    const qualCounts = simResult.qualifyingPositionCounts.get(driver.driverId) || [];

    const toProb = (arr, pos) => (arr[pos] || 0) / simResult.runs;
    const sumProb = (arr, from, to) => {
      let total = 0;
      for (let i = from; i <= to; i += 1) total += toProb(arr, i);
      return total;
    };

    let expectedRacePos = 0;
    let expectedQualPos = 0;
    let expectedPoints = 0;

    for (let pos = 1; pos <= simResult.fieldSize; pos += 1) {
      const raceProb = toProb(raceCounts, pos);
      const qualProb = toProb(qualCounts, pos);
      expectedRacePos += raceProb * pos;
      expectedQualPos += qualProb * pos;
      if (pos <= PROJECTION_POINTS_TABLE.length) {
        expectedPoints += raceProb * PROJECTION_POINTS_TABLE[pos - 1];
      }
    }

    const fastestProb = (simResult.fastestLapCounts.get(driver.driverId) || 0) / simResult.runs;
    expectedPoints += fastestProb;

    const raceRow = {
      driverId: driver.driverId,
      driverName: driver.driverName,
      team: driver.team,
      confidence: driver.confidence,
      reliability: driver.reliability,
      expected_position: expectedRacePos,
      expected_points: expectedPoints,
      probabilities: {
        win: toProb(raceCounts, 1),
        podium: sumProb(raceCounts, 1, 3),
        top10: sumProb(raceCounts, 1, Math.min(10, simResult.fieldSize)),
        pole: toProb(qualCounts, 1),
        fastest_lap: fastestProb
      },
      probabilities_by_position: Object.fromEntries(
        Array.from({ length: simResult.fieldSize }, (_, idx) => idx + 1)
          .map((position) => [position, toProb(raceCounts, position)])
      ),
      qualifying_probabilities_by_position: Object.fromEntries(
        Array.from({ length: simResult.fieldSize }, (_, idx) => idx + 1)
          .map((position) => [position, toProb(qualCounts, position)])
      ),
      metrics: driver.metrics,
      scores: {
        qualifying: driver.qualifying_score,
        race: driver.race_score
      },
      rounds_seen: driver.rounds_seen
    };

    const qualRow = {
      driverId: driver.driverId,
      driverName: driver.driverName,
      team: driver.team,
      expected_position: expectedQualPos,
      pole_probability: toProb(qualCounts, 1),
      top3_probability: sumProb(qualCounts, 1, 3),
      top10_probability: sumProb(qualCounts, 1, Math.min(10, simResult.fieldSize)),
      score: driver.qualifying_score
    };

    raceRows.push(raceRow);
    qualifyingRows.push(qualRow);
  }

  raceRows.sort((a, b) => a.expected_position - b.expected_position || b.scores.race - a.scores.race || a.driverName.localeCompare(b.driverName));
  qualifyingRows.sort((a, b) => a.expected_position - b.expected_position || b.score - a.score || a.driverName.localeCompare(b.driverName));

  raceRows.forEach((row, idx) => {
    row.projected_position = idx + 1;
  });

  qualifyingRows.forEach((row, idx) => {
    row.projected_position = idx + 1;
  });

  return { raceRows, qualifyingRows };
}

function evaluatePickLikelihood(data, season, round, user, projectionTable, simResult) {
  if (!user) return null;

  const cfg = loadConfig();
  const userKnown = cfg.users.some((row) => row.name === user);
  if (!userKnown) {
    throw fail('Unknown user for projection picks', 400);
  }

  const prediction = (data.predictions || []).find((row) => row.season === season && row.round === round && row.user === user);
  if (!prediction) {
    return {
      user,
      available: false,
      message: 'No saved picks for this user and round yet.'
    };
  }

  const rowByDriver = new Map((projectionTable.raceRows || []).map((row) => [row.driverId, row]));
  const qualByDriver = new Map((projectionTable.qualifyingRows || []).map((row) => [row.driverId, row]));

  const raceProb = (driverId, position) => {
    const row = rowByDriver.get(driverId);
    if (!row) return 0;
    return Number(row.probabilities_by_position?.[position] || 0);
  };

  const top10Prob = (driverId) => {
    const row = rowByDriver.get(driverId);
    return Number(row?.probabilities?.top10 || 0);
  };

  const poleProb = (driverId) => {
    const row = qualByDriver.get(driverId);
    return Number(row?.pole_probability || 0);
  };

  const fastestProb = (driverId) => {
    const row = rowByDriver.get(driverId);
    return Number(row?.probabilities?.fastest_lap || 0);
  };

  const p1Prob = raceProb(prediction.p1_driver_id, 1);
  const p2Prob = raceProb(prediction.p2_driver_id, 2);
  const p3Prob = raceProb(prediction.p3_driver_id, 3);
  const poleHitProb = poleProb(prediction.pole_driver_id);
  const fastestHitProb = fastestProb(prediction.fastest_lap_driver_id);
  const wildcardHitProb = prediction.wildcard_driver_id ? top10Prob(prediction.wildcard_driver_id) : 0;

  const podiumExactKey = [prediction.p1_driver_id, prediction.p2_driver_id, prediction.p3_driver_id].every(Boolean)
    ? [prediction.p1_driver_id, prediction.p2_driver_id, prediction.p3_driver_id].join('|')
    : null;

  const podiumExactProb = podiumExactKey
    ? (simResult.podiumOrderCounts.get(podiumExactKey) || 0) / simResult.runs
    : 0;

  const lockFieldMap = {
    p1: p1Prob,
    p2: p2Prob,
    p3: p3Prob,
    pole: poleHitProb,
    fastestLap: fastestHitProb
  };

  const lockHitProb = prediction.lock_field ? Number(lockFieldMap[prediction.lock_field] || 0) : 0;

  const expectedPoints =
    (p1Prob + podiumExactProb) +
    (p2Prob + podiumExactProb) +
    (p3Prob + podiumExactProb) +
    poleHitProb +
    fastestHitProb +
    wildcardHitProb +
    lockHitProb;

  const categories = [
    { key: 'p1', driverId: prediction.p1_driver_id, probability: p1Prob },
    { key: 'p2', driverId: prediction.p2_driver_id, probability: p2Prob },
    { key: 'p3', driverId: prediction.p3_driver_id, probability: p3Prob },
    { key: 'pole', driverId: prediction.pole_driver_id, probability: poleHitProb },
    { key: 'fastestLap', driverId: prediction.fastest_lap_driver_id, probability: fastestHitProb },
    { key: 'wildcard', driverId: prediction.wildcard_driver_id, probability: wildcardHitProb }
  ];

  const driverNameById = new Map((data.drivers || []).map((row) => [row.driverId, row.driverName]));

  return {
    user,
    available: true,
    lock_field: prediction.lock_field || null,
    podium_exact_probability: podiumExactProb,
    lock_hit_probability: lockHitProb,
    expected_points: expectedPoints,
    categories: categories.map((row) => ({
      ...row,
      driverName: row.driverId ? (driverNameById.get(row.driverId) || row.driverId) : null
    }))
  };
}

function buildTeamOutlook(raceRows) {
  const byTeam = new Map();

  for (const row of raceRows || []) {
    if (!byTeam.has(row.team)) {
      byTeam.set(row.team, {
        team: row.team,
        driver_count: 0,
        avg_expected_position: 0,
        avg_expected_points: 0,
        win_probability: 0,
        podium_probability: 0,
        top10_expected_drivers: 0
      });
    }

    const bucket = byTeam.get(row.team);
    bucket.driver_count += 1;
    bucket.avg_expected_position += row.expected_position;
    bucket.avg_expected_points += row.expected_points;
    bucket.win_probability += row.probabilities?.win || 0;
    bucket.podium_probability += row.probabilities?.podium || 0;
    bucket.top10_expected_drivers += row.probabilities?.top10 || 0;
  }

  return [...byTeam.values()]
    .map((row) => ({
      ...row,
      avg_expected_position: row.driver_count ? row.avg_expected_position / row.driver_count : null,
      avg_expected_points: row.driver_count ? row.avg_expected_points / row.driver_count : null
    }))
    .sort((a, b) => (b.avg_expected_points || 0) - (a.avg_expected_points || 0));
}

function projectRoundOutcomes(data, season, round, user = null, options = {}) {
  const projectionBase = buildProjectionDrivers(data, season, round, options);
  const simResult = runProjectionSimulation(projectionBase.drivers, season, round, user);
  const projectionTable = buildProjectionTables(simResult, projectionBase.drivers);
  const picks = evaluatePickLikelihood(data, season, round, user, projectionTable, simResult);
  const teamOutlook = buildTeamOutlook(projectionTable.raceRows);
  const practiceSignalSummary = buildPracticeSignalSummary(projectionBase.drivers);
  const championshipProjection = buildChampionshipProjection(data, season, round, projectionBase.includeTesting);

  return {
    season,
    round,
    race_name: projectionBase.race.raceName,
    race_date: projectionBase.race.start_date,
    data_window: {
      through_round: projectionBase.cutoffRound,
      rounds_used: projectionBase.cutoffRound
    },
    model: PROJECTION_MODEL_SPEC,
    practice_signal: {
      includes_testing: projectionBase.includeTesting,
      summary: practiceSignalSummary
    },
    track_profile: projectionBase.trackProfile,
    simulation: {
      runs: simResult.runs,
      field_size: simResult.fieldSize
    },
    race_projection: projectionTable.raceRows,
    qualifying_projection: projectionTable.qualifyingRows,
    team_outlook: teamOutlook,
    championship_projection: championshipProjection,
    pick_likelihood: picks
  };
}

async function importOpenF1TestingSeason({ season, force = false }) {
  const data = loadDb();
  ensureSeasonRaces(data, season);

  const meetings = await fetchOpenF1('meetings', { year: season });
  const testingMeetings = selectOpenF1TestingMeetings(meetings, season);

  if (!testingMeetings.length) {
    throw fail(`OpenF1 testing meetings not found for season ${season}`, 404);
  }

  const existingRows = (data.testing_timing || []).filter((row) => row.season === season);
  const expectedMeetingKeys = new Set(testingMeetings.map((meeting) => toInt(meeting.meeting_key)).filter(Boolean));
  const coveredMeetingKeys = new Set(existingRows.map((row) => toInt(row.meeting_key)).filter(Boolean));
  const hasFullCoverage = existingRows.length > 0 && [...expectedMeetingKeys].every((key) => coveredMeetingKeys.has(key));

  if (!force && hasFullCoverage) {
    return {
      season,
      reused: true,
      imported: { testingTiming: 0 },
      meetings: testingMeetings.map((meeting) => ({
        key: meeting.meeting_key,
        name: meeting.meeting_name || null,
        date_start: meeting.date_start || null
      })),
      totalRows: existingRows.length
    };
  }

  const resolveOpenF1Driver = buildOpenF1DriverResolver(data, season);
  const testingTimingRows = [];
  let sessionOrder = 0;
  let sessionCount = 0;

  for (let meetingIndex = 0; meetingIndex < testingMeetings.length; meetingIndex += 1) {
    const meeting = testingMeetings[meetingIndex];
    const meetingKey = toInt(meeting.meeting_key);
    if (!meetingKey) continue;

    const sessions = await fetchOpenF1('sessions', { meeting_key: meetingKey });
    const testingSessions = selectPracticeSessions(sessions);

    if (!testingSessions.length) continue;

    for (let sessionIndex = 0; sessionIndex < testingSessions.length; sessionIndex += 1) {
      const session = testingSessions[sessionIndex];
      const sessionKey = toInt(session.session_key);
      if (!sessionKey) continue;
      sessionCount += 1;
      sessionOrder += 1;

      await sleep(220);
      const driverRows = await fetchOpenF1('drivers', { session_key: sessionKey });
      const driverMetaByNumber = new Map();
      for (const row of driverRows || []) {
        const driverNumber = toInt(row.driver_number);
        if (!driverNumber) continue;
        driverMetaByNumber.set(driverNumber, row);
      }

      const getIdentity = (driverNumber) => {
        if (!driverNumber) return null;
        const meta = driverMetaByNumber.get(driverNumber) || { driver_number: driverNumber };
        const identity = resolveOpenF1Driver(meta, driverNumber);
        ensureDriverRecord(data, identity);
        ensureSeasonDriverRecord(data, season, identity, meta.team_name);
        return identity;
      };

      await sleep(220);
      const stintRowsRaw = await fetchOpenF1('stints', { session_key: sessionKey });
      const stintByDriverLap = new Map();
      for (const row of stintRowsRaw || []) {
        const driverNumber = toInt(row.driver_number);
        const lapStart = toInt(row.lap_start);
        const lapEnd = toInt(row.lap_end);
        if (!driverNumber || !lapStart || !lapEnd) continue;

        for (let lap = lapStart; lap <= lapEnd; lap += 1) {
          stintByDriverLap.set(`${driverNumber}:${lap}`, {
            stint: toInt(row.stint_number),
            compound: normalizeCompound(row.compound)
          });
        }
      }

      await sleep(220);
      const lapRows = await fetchOpenF1('laps', { session_key: sessionKey });
      const dayIndex = detectTestingDayIndex(session, sessionIndex);

      for (const row of lapRows || []) {
        const driverNumber = toInt(row.driver_number);
        const lap = toInt(row.lap_number);
        const lapMs = parseOpenF1SecondsToMs(row.lap_duration);
        if (!driverNumber || !lap || lapMs === null) continue;
        if (row.is_pit_out_lap) continue;

        const identity = getIdentity(driverNumber);
        if (!identity) continue;

        const stintInfo = stintByDriverLap.get(`${driverNumber}:${lap}`) || {};
        const isDeleted = row.is_lap_valid === false || row.is_deleted === true;

        testingTimingRows.push({
          season,
          meeting_key: meetingKey,
          meeting_name: meeting.meeting_name || null,
          session_key: sessionKey,
          session_name: session.session_name || session.session_type || null,
          session_order: sessionOrder,
          meeting_order: meetingIndex + 1,
          day_index: dayIndex,
          driverId: identity.driverId,
          lap,
          lap_time_ms: lapMs,
          is_deleted: Boolean(isDeleted),
          stint: stintInfo.stint || null,
          compound: stintInfo.compound || normalizeCompound(row.compound),
          date_start: row.date_start || row.date || null
        });
      }
    }
  }

  if (!testingTimingRows.length) {
    throw fail(`OpenF1 testing lap data unavailable for season ${season}`, 409);
  }

  data.testing_timing = (data.testing_timing || []).filter((row) => row.season !== season);
  data.testing_timing.push(...testingTimingRows);
  const preWriteSnapshot = createPreWriteSnapshot(`pre-import-testing-${season}`);
  saveDb(data);
  const postWriteSnapshot = createPostWriteSnapshot(`post-import-testing-${season}`);

  appendImportAudit({
    source: 'openf1',
    action: 'sync-testing',
    season,
    round: null,
    changedRows: {
      testingTiming: testingTimingRows.length,
      meetings: testingMeetings.length,
      sessions: sessionCount
    }
  });

  return {
    season,
    reused: false,
    preWriteSnapshot,
    postWriteSnapshot,
    imported: {
      testingTiming: testingTimingRows.length,
      meetings: testingMeetings.length,
      sessions: sessionCount
    },
    meetings: testingMeetings.map((meeting) => ({
      key: meeting.meeting_key,
      name: meeting.meeting_name || null,
      date_start: meeting.date_start || null
    })),
    totalRows: testingTimingRows.length
  };
}

async function ensureOpenF1TestingData(season) {
  const data = loadDb();
  const existingCount = (data.testing_timing || []).filter((row) => row.season === season).length;
  if (existingCount > 0) {
    return {
      enabled: true,
      reused: true,
      imported_rows: 0,
      total_rows: existingCount
    };
  }

  const result = await importOpenF1TestingSeason({ season, force: false });
  return {
    enabled: true,
    reused: Boolean(result.reused),
    imported_rows: Number(result.imported?.testingTiming || 0),
    total_rows: Number(result.totalRows || 0),
    meetings: result.meetings || []
  };
}


async function importOpenF1Round({ season, round }) {
  const data = loadDb();
  ensureSeasonRaces(data, season);

  const scheduleRow = getSeasonSchedule(season).find((row) => row.round === round) || null;
  const meetings = await fetchOpenF1('meetings', { year: season });
  const meeting = selectOpenF1Meeting(meetings, season, round, scheduleRow);

  if (!meeting) {
    throw fail('OpenF1 meeting not found for season ' + season + ' round ' + round, 404);
  }

  const sessions = await fetchOpenF1('sessions', { meeting_key: meeting.meeting_key });
  const qualifyingSession = selectSessionByType(sessions, 'qualifying');
  const raceSession = selectSessionByType(sessions, 'race');
  const practiceSessions = selectPracticeSessions(sessions);

  if (!qualifyingSession && !raceSession && !practiceSessions.length) {
    throw fail('OpenF1 sessions unavailable for ' + (meeting.meeting_name || ('round ' + round)), 404);
  }

  let qualifyingResultRaw = [];
  let raceResultRaw = [];
  let startingGridRaw = [];
  let qualifyingDriversRaw = [];
  let raceDriversRaw = [];
  let raceLapsRaw = [];
  let raceStintsRaw = [];
  let racePositionsRaw = [];
  let practiceLapsRaw = [];
  let practiceStintsRaw = [];
  let practiceDriversRaw = [];

  if (qualifyingSession) {
    qualifyingResultRaw = await fetchOpenF1('session_result', { session_key: qualifyingSession.session_key });
    await sleep(300);
    startingGridRaw = await fetchOpenF1('starting_grid', { session_key: qualifyingSession.session_key });
    await sleep(300);
    qualifyingDriversRaw = await fetchOpenF1('drivers', { session_key: qualifyingSession.session_key });
  }

  if (raceSession) {
    await sleep(300);
    raceResultRaw = await fetchOpenF1('session_result', { session_key: raceSession.session_key });
    await sleep(300);
    raceDriversRaw = await fetchOpenF1('drivers', { session_key: raceSession.session_key });
    await sleep(300);
    raceLapsRaw = await fetchOpenF1('laps', { session_key: raceSession.session_key });
    await sleep(300);
    raceStintsRaw = await fetchOpenF1('stints', { session_key: raceSession.session_key });
    await sleep(300);
    racePositionsRaw = await fetchOpenF1('position', { session_key: raceSession.session_key });
  }

  for (const practiceSession of practiceSessions) {
    const sessionKey = practiceSession.session_key;
    const sessionName = practiceSession.session_name || practiceSession.session_type || practiceSession.practice_slot;

    await sleep(250);
    const driverRows = await fetchOpenF1('drivers', { session_key: sessionKey });
    for (const row of driverRows) {
      practiceDriversRaw.push({
        ...row,
        __session_key: sessionKey,
        __session_name: sessionName,
        __practice_slot: practiceSession.practice_slot
      });
    }

    await sleep(250);
    const lapRows = await fetchOpenF1('laps', { session_key: sessionKey });
    for (const row of lapRows) {
      practiceLapsRaw.push({
        ...row,
        __session_key: sessionKey,
        __session_name: sessionName,
        __practice_slot: practiceSession.practice_slot
      });
    }

    await sleep(250);
    const stintRows = await fetchOpenF1('stints', { session_key: sessionKey });
    for (const row of stintRows) {
      practiceStintsRaw.push({
        ...row,
        __session_key: sessionKey,
        __session_name: sessionName,
        __practice_slot: practiceSession.practice_slot
      });
    }
  }

  const driverMetaByNumber = new Map();
  const registerDriverMeta = (row) => {
    const driverNumber = toInt(row?.driver_number);
    if (!driverNumber) return;
    const current = driverMetaByNumber.get(driverNumber) || {};
    driverMetaByNumber.set(driverNumber, { ...current, ...row });
  };

  for (const row of qualifyingDriversRaw) registerDriverMeta(row);
  for (const row of raceDriversRaw) registerDriverMeta(row);
  for (const row of practiceDriversRaw) registerDriverMeta(row);

  const resolveOpenF1Driver = buildOpenF1DriverResolver(data, season);
  const identityByNumber = new Map();

  const getIdentity = (driverNumber) => {
    if (!driverNumber) return null;
    if (identityByNumber.has(driverNumber)) return identityByNumber.get(driverNumber);

    const meta = driverMetaByNumber.get(driverNumber) || { driver_number: driverNumber };
    const identity = resolveOpenF1Driver(meta, driverNumber);
    ensureDriverRecord(data, identity);
    ensureSeasonDriverRecord(data, season, identity, meta.team_name);
    identityByNumber.set(driverNumber, identity);
    return identity;
  };

  const gridByNumber = new Map();
  for (const row of startingGridRaw || []) {
    const driverNumber = toInt(row.driver_number);
    const position = toInt(row.position);
    if (!driverNumber || !position) continue;
    gridByNumber.set(driverNumber, position);
  }

  const qualifyingMap = new Map();
  for (const row of qualifyingResultRaw || []) {
    const driverNumber = toInt(row.driver_number);
    const position = toInt(row.position);
    if (!driverNumber || !position) continue;

    const identity = getIdentity(driverNumber);
    if (!identity) continue;

    const durations = Array.isArray(row.duration) ? row.duration : [];
    const payload = {
      season,
      round,
      driverId: identity.driverId,
      position,
      q1_ms: parseOpenF1SecondsToMs(durations[0]),
      q2_ms: parseOpenF1SecondsToMs(durations[1]),
      q3_ms: parseOpenF1SecondsToMs(durations[2])
    };

    const key = payload.driverId;
    const existing = qualifyingMap.get(key);
    if (!existing || payload.position < existing.position) qualifyingMap.set(key, payload);
  }

  if (!qualifyingMap.size && Array.isArray(startingGridRaw) && startingGridRaw.length) {
    for (const row of startingGridRaw) {
      const driverNumber = toInt(row.driver_number);
      const position = toInt(row.position);
      if (!driverNumber || !position) continue;

      const identity = getIdentity(driverNumber);
      if (!identity) continue;

      qualifyingMap.set(identity.driverId, {
        season,
        round,
        driverId: identity.driverId,
        position,
        q1_ms: null,
        q2_ms: null,
        q3_ms: parseOpenF1SecondsToMs(row.lap_duration)
      });
    }
  }

  const qualifyingRows = [...qualifyingMap.values()].sort((a, b) => a.position - b.position);

  const bestLapByNumber = new Map();
  for (const row of raceLapsRaw || []) {
    const driverNumber = toInt(row.driver_number);
    const lapMs = parseOpenF1SecondsToMs(row.lap_duration);
    if (!driverNumber || lapMs === null) continue;
    if (row.is_pit_out_lap) continue;

    const best = bestLapByNumber.get(driverNumber);
    if (best === undefined || lapMs < best) bestLapByNumber.set(driverNumber, lapMs);
  }

  const fastestRankByNumber = new Map();
  [...bestLapByNumber.entries()]
    .sort((a, b) => a[1] - b[1])
    .forEach(([driverNumber], index) => {
      fastestRankByNumber.set(driverNumber, index + 1);
    });

  const raceMap = new Map();
  for (const row of raceResultRaw || []) {
    const driverNumber = toInt(row.driver_number);
    if (!driverNumber) continue;

    const identity = getIdentity(driverNumber);
    if (!identity) continue;

    const position = toInt(row.position);
    let status = 'Finished';
    if (row.dsq) status = 'DSQ';
    else if (row.dns) status = 'DNS';
    else if (row.dnf || position === null) status = 'DNF';

    const payload = {
      season,
      round,
      driverId: identity.driverId,
      position,
      points: toFloat(row.points) || 0,
      fastestLapRank: fastestRankByNumber.get(driverNumber) || null,
      grid: gridByNumber.get(driverNumber) || null,
      laps: toInt(row.number_of_laps),
      status
    };

    raceMap.set(payload.driverId, payload);
  }

  const raceRows = [...raceMap.values()].sort((a, b) => {
    const pa = a.position === null || a.position === undefined ? 999 : a.position;
    const pb = b.position === null || b.position === undefined ? 999 : b.position;
    return pa - pb;
  });

  const stintByDriverLap = new Map();
  for (const row of raceStintsRaw || []) {
    const driverNumber = toInt(row.driver_number);
    const lapStart = toInt(row.lap_start);
    const lapEnd = toInt(row.lap_end);
    if (!driverNumber || !lapStart || !lapEnd) continue;

    for (let lap = lapStart; lap <= lapEnd; lap += 1) {
      stintByDriverLap.set(driverNumber + ':' + lap, {
        stint: toInt(row.stint_number),
        compound: row.compound || null
      });
    }
  }

  const positionsByDriver = new Map();
  for (const row of racePositionsRaw || []) {
    const driverNumber = toInt(row.driver_number);
    const position = toInt(row.position);
    const epochMs = toEpochMs(row.date);
    if (!driverNumber || !position || epochMs === null) continue;

    if (!positionsByDriver.has(driverNumber)) positionsByDriver.set(driverNumber, []);
    positionsByDriver.get(driverNumber).push({ epoch_ms: epochMs, position });
  }

  for (const rows of positionsByDriver.values()) {
    rows.sort((a, b) => a.epoch_ms - b.epoch_ms);
  }

  const raceTimingRows = [];
  for (const row of raceLapsRaw || []) {
    const driverNumber = toInt(row.driver_number);
    const lap = toInt(row.lap_number);
    const lapMs = parseOpenF1SecondsToMs(row.lap_duration);
    if (!driverNumber || !lap || lapMs === null) continue;

    const identity = getIdentity(driverNumber);
    if (!identity) continue;

    const lapStartEpoch = toEpochMs(row.date_start);
    const lapEndEpoch = lapStartEpoch !== null ? lapStartEpoch + lapMs : null;
    const posRows = positionsByDriver.get(driverNumber) || [];

    const stintInfo = stintByDriverLap.get(driverNumber + ':' + lap) || {};

    raceTimingRows.push({
      season,
      round,
      driverId: identity.driverId,
      lap,
      lap_time_ms: lapMs,
      is_deleted: false,
      stint: stintInfo.stint || null,
      compound: stintInfo.compound || null,
      position_start_lap: inferPositionAtTimestamp(posRows, lapStartEpoch),
      position_end_lap: inferPositionAtTimestamp(posRows, lapEndEpoch)
    });
  }

  const practiceStintBySessionDriverLap = new Map();
  for (const row of practiceStintsRaw || []) {
    const sessionKey = toInt(row.__session_key);
    const driverNumber = toInt(row.driver_number);
    const lapStart = toInt(row.lap_start);
    const lapEnd = toInt(row.lap_end);
    if (!sessionKey || !driverNumber || !lapStart || !lapEnd) continue;

    for (let lap = lapStart; lap <= lapEnd; lap += 1) {
      practiceStintBySessionDriverLap.set(`${sessionKey}:${driverNumber}:${lap}`, {
        stint: toInt(row.stint_number),
        compound: row.compound || null,
        practice_slot: row.__practice_slot || null,
        session_name: row.__session_name || null
      });
    }
  }

  const practiceTimingRows = [];
  for (const row of practiceLapsRaw || []) {
    const sessionKey = toInt(row.__session_key);
    const driverNumber = toInt(row.driver_number);
    const lap = toInt(row.lap_number);
    const lapMs = parseOpenF1SecondsToMs(row.lap_duration);
    if (!sessionKey || !driverNumber || !lap || lapMs === null) continue;
    if (row.is_pit_out_lap) continue;

    const identity = getIdentity(driverNumber);
    if (!identity) continue;

    const stintInfo = practiceStintBySessionDriverLap.get(`${sessionKey}:${driverNumber}:${lap}`) || {};
    const compound = stintInfo.compound || row.compound || null;
    const isDeleted = row.is_lap_valid === false || row.is_deleted === true;

    practiceTimingRows.push({
      season,
      round,
      session_key: sessionKey,
      session_name: stintInfo.session_name || row.__session_name || null,
      practice_slot: stintInfo.practice_slot || row.__practice_slot || null,
      driverId: identity.driverId,
      lap,
      lap_time_ms: lapMs,
      is_deleted: Boolean(isDeleted),
      stint: stintInfo.stint || null,
      compound: compound ? normalizeCompound(compound) : null
    });
  }

  if (!qualifyingRows.length && !raceRows.length && !raceTimingRows.length && !practiceTimingRows.length) {
    throw fail('OpenF1 has no published data for ' + (meeting.meeting_name || ('round ' + round)) + ' yet. Try again after sessions complete.', 409);
  }

  if (!data.races.some((row) => row.season === season && row.round === round)) {
    data.races.push({
      season,
      round,
      raceName: scheduleRow?.raceName || meeting.meeting_name || ('Round ' + round),
      date: scheduleRow?.start_date || String(meeting.date_start || '').slice(0, 10)
    });
  }

  if (qualifyingRows.length) {
    data.qualifying_results = (data.qualifying_results || []).filter((row) => !(row.season === season && row.round === round));
    data.qualifying_results.push(...qualifyingRows);

    data.qualifying_timing = (data.qualifying_timing || []).filter((row) => !(row.season === season && row.round === round));
  }

  if (raceRows.length) {
    data.race_results = (data.race_results || []).filter((row) => !(row.season === season && row.round === round));
    data.race_results.push(...raceRows);
  }

  if (raceTimingRows.length) {
    data.race_timing = (data.race_timing || []).filter((row) => !(row.season === season && row.round === round));
    data.race_timing.push(...raceTimingRows);
  }

  if (practiceTimingRows.length) {
    data.practice_timing = (data.practice_timing || []).filter((row) => !(row.season === season && row.round === round));
    data.practice_timing.push(...practiceTimingRows);
  }

  const grid = resolveGridDrivers(data, 2026);
  normalizePredictionIds(data, grid);
  rebuildActualsAndScores(data);
  const preWriteSnapshot = createPreWriteSnapshot(`pre-import-round-${season}-r${round}`);
  saveDb(data);
  const postWriteSnapshot = createPostWriteSnapshot(`post-import-round-${season}-r${round}`);

  const imported = {
    qualifying: qualifyingRows.length,
    race: raceRows.length,
    raceTiming: raceTimingRows.length,
    practiceTiming: practiceTimingRows.length
  };
  appendImportAudit({
    source: 'openf1',
    action: 'sync-round',
    season,
    round,
    changedRows: imported,
    details: {
      meetingKey: meeting.meeting_key,
      meetingName: meeting.meeting_name || null
    }
  });

  return {
    season,
    round,
    meeting: {
      key: meeting.meeting_key,
      name: meeting.meeting_name || null
    },
    sessions: {
      qualifying: qualifyingSession ? qualifyingSession.session_key : null,
      race: raceSession ? raceSession.session_key : null,
      practice: practiceSessions.map((session) => ({
        key: session.session_key,
        slot: session.practice_slot,
        name: session.session_name || null
      }))
    },
    imported,
    preWriteSnapshot,
    postWriteSnapshot
  };
}

function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function requireSeason(value) {
  const season = toInt(value);
  if (!season) throw fail('season required');
  return season;
}

function requireRound(value) {
  const round = toInt(value);
  if (!round) throw fail('round required');
  return round;
}

function requireObject(value, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw fail(message);
  }
}

function getConfiguredUsers() {
  return loadConfig().users.map(u => u.name).filter(Boolean);
}

function requireKnownUser(cfg, userRaw, pin) {
  const user = String(userRaw || '').trim();
  if (!user) throw fail('user required');

  const match = cfg.users.find(u => u.name === user);
  if (!match) throw fail('Unknown user', 403);
  if (match.pin && match.pin !== String(pin || '')) {
    throw fail('Invalid PIN', 403);
  }

  return user;
}

function normalizeTeamKey(team) {
  return String(team || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function displayTeamName(team) {
  const key = normalizeTeamKey(team);

  if (
    key === 'mclaren' ||
    key === 'mclaren formula 1 team' ||
    key === 'mclaren f1 team' ||
    key === 'mclaren mastercard f1 team'
  ) return 'McLaren';

  if (
    key === 'mercedes' ||
    key === 'mercedes amg petronas formula one team' ||
    key === 'mercedes amg petronas f1 team'
  ) return 'Mercedes';

  if (
    key === 'red bull' ||
    key === 'red bull racing' ||
    key === 'oracle red bull racing'
  ) return 'Red Bull Racing';

  if (
    key === 'ferrari' ||
    key === 'scuderia ferrari' ||
    key === 'scuderia ferrari hp'
  ) return 'Ferrari';

  if (key === 'williams' || key === 'williams racing' || key === 'atlassian williams f1 team') return 'Williams';

  if (
    key === 'racing bulls' ||
    key === 'rb' ||
    key === 'visa cash app rb' ||
    key === 'visa cash app racing bulls formula one team'
  ) return 'Racing Bulls';

  if (key === 'aston martin' || key === 'aston martin aramco formula one team') return 'Aston Martin';

  if (
    key === 'haas' ||
    key === 'haas f1 team' ||
    key === 'moneygram haas f1 team' ||
    key === 'tgr haas f1 team'
  ) return 'Haas F1 Team';

  if (
    key === 'kick sauber' ||
    key === 'stake f1 team kick sauber' ||
    key === 'stake sauber' ||
    key === 'sauber' ||
    key === 'audi' ||
    key === 'audi revolut f1 team'
  ) return 'Audi';

  if (key === 'alpine' || key === 'bwt alpine f1 team' || key === 'bwt alpine formula one team') return 'Alpine';
  if (key === 'cadillac' || key === 'cadillac formula 1 team') return 'Cadillac';

  return String(team || '').trim() || 'Unknown Team';
}

function getDriverTeamOrder(season = 2026) {
  return DRIVER_TEAM_ORDER_BY_SEASON[season] || DEFAULT_DRIVER_TEAM_ORDER;
}

function teamSortRank(team, season = 2026) {
  const order = getDriverTeamOrder(season);
  const idx = order.indexOf(displayTeamName(team));
  return idx >= 0 ? idx : order.length + 50;
}

function compareDriversForDropdown(a, b, season = 2026) {
  const rankDelta = teamSortRank(a.team, season) - teamSortRank(b.team, season);
  if (rankDelta !== 0) return rankDelta;

  const teamDelta = displayTeamName(a.team).localeCompare(displayTeamName(b.team));
  if (teamDelta !== 0) return teamDelta;

  return String(a.driverName || '').localeCompare(String(b.driverName || ''));
}

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function resolveGridDrivers(data, season = 2026) {
  if (season !== 2026) {
    const seasonRows = (data.driver_seasons || [])
      .filter((row) => row.season === season && row.driverId)
      .map((row) => ({
        season,
        driverId: row.driverId,
        driverName: row.driverName || row.driverId,
        team: displayTeamName(row.team)
      }));

    const uniqueByDriver = new Map();
    for (const row of seasonRows) uniqueByDriver.set(row.driverId, row);

    const mapped = [...uniqueByDriver.values()];
    if (mapped.length) return mapped.sort((a, b) => compareDriversForDropdown(a, b, season));

    const seasonIds = new Set();
    for (const row of data.race_results || []) if (row.season === season && row.driverId) seasonIds.add(row.driverId);
    for (const row of data.qualifying_results || []) if (row.season === season && row.driverId) seasonIds.add(row.driverId);

    const fallback = [...seasonIds].map((driverId) => {
      const driver = (data.drivers || []).find((d) => d.driverId === driverId) || {};
      return {
        driverId,
        driverName: driver.driverName || driverId,
        team: displayTeamName(driver.team || 'Unknown Team')
      };
    });

    return fallback.sort((a, b) => compareDriversForDropdown(a, b, season));
  }

  const grid = loadCurrentGrid(2026);
  const drivers = data.drivers || [];

  return grid.map(entry => {
    let driverId = entry.driverId || null;

    const tryNames = [entry.driverName, ...(entry.aliases || [])].filter(Boolean);
    if (!driverId) {
      for (const name of tryNames) {
        const exact = drivers.find(d => d.driverName === name);
        if (exact) {
          driverId = exact.driverId;
          break;
        }
      }
    }

    if (!driverId) {
      const [first, ...rest] = entry.driverName.split(' ');
      const last = rest[rest.length - 1];
      const match = drivers.find(d => d.driverName.startsWith(first) && d.driverName.endsWith(last));
      if (match) driverId = match.driverId;
    }

    if (!driverId) {
      const last = entry.driverName.split(' ').slice(-1)[0];
      const matches = drivers.filter(d => d.driverName.endsWith(last));
      if (matches.length === 1) driverId = matches[0].driverId;
    }

    if (!driverId) driverId = 'name:' + slugify(entry.driverName);

    return {
      driverId,
      driverName: entry.driverName,
      team: displayTeamName(entry.team)
    };
  });
}

function normalizePredictionIds(data, resolvedGrid) {
  const map = new Map();
  for (const g of resolvedGrid) {
    map.set(`name:${slugify(g.driverName)}`, g.driverId);
  }

  for (const pred of data.predictions) {
    for (const key of [
      'p1_driver_id',
      'p2_driver_id',
      'p3_driver_id',
      'pole_driver_id',
      'fastest_lap_driver_id',
      'wildcard_driver_id'
    ]) {
      const value = pred[key];
      if (value && map.has(value)) pred[key] = map.get(value);
    }
  }

  for (const sp of data.season_predictions) {
    if (sp.driver_champion_id && map.has(sp.driver_champion_id)) {
      sp.driver_champion_id = map.get(sp.driver_champion_id);
    }
  }
}

function rebuildActualsAndScores(data) {
  const now = new Date().toISOString();
  const existingActualByKey = new Map((data.race_actuals || []).map((row) => [`${row.season}:${row.round}`, row]));
  data.race_actuals = data.races.map(race => {
    const pole = data.qualifying_results.find(
      q => q.season === race.season && q.round === race.round && q.position === 1
    );
    const p1 = data.race_results.find(
      rr => rr.season === race.season && rr.round === race.round && rr.position === 1
    );
    const p2 = data.race_results.find(
      rr => rr.season === race.season && rr.round === race.round && rr.position === 2
    );
    const p3 = data.race_results.find(
      rr => rr.season === race.season && rr.round === race.round && rr.position === 3
    );
    const fastest = data.race_results.find(
      rr => rr.season === race.season && rr.round === race.round && rr.fastestLapRank === 1
    );
    const existing = existingActualByKey.get(`${race.season}:${race.round}`) || null;

    return {
      season: race.season,
      round: race.round,
      pole_driver_id: pole?.driverId || null,
      p1_driver_id: p1?.driverId || null,
      p2_driver_id: p2?.driverId || null,
      p3_driver_id: p3?.driverId || null,
      fastest_lap_driver_id: fastest?.driverId || null,
      red_flag: toBoolNullable(existing?.red_flag ?? race.red_flag ?? null),
      updated_at: now
    };
  });

  updateAllPredictionScores(data);
}

function updateAllPredictionScores(data) {
  const { wildcardRule } = loadConfig();
  const now = new Date().toISOString();
  const sideBetActualCache = new Map();

  const sideBetActualsFor = (season, round) => {
    const key = `${season}:${round}`;
    if (!sideBetActualCache.has(key)) {
      sideBetActualCache.set(key, computeRoundSideBetActuals(data, season, round));
    }
    return sideBetActualCache.get(key);
  };

  for (const pred of data.predictions) {
    const actual = data.race_actuals.find(
      a => a.season === pred.season && a.round === pred.round
    );

    let score_p1 = actual?.p1_driver_id && pred.p1_driver_id === actual.p1_driver_id ? 1 : 0;
    let score_p2 = actual?.p2_driver_id && pred.p2_driver_id === actual.p2_driver_id ? 1 : 0;
    let score_p3 = actual?.p3_driver_id && pred.p3_driver_id === actual.p3_driver_id ? 1 : 0;
    const score_pole = actual?.pole_driver_id && pred.pole_driver_id === actual.pole_driver_id ? 1 : 0;
    const score_fastest_lap =
      actual?.fastest_lap_driver_id && pred.fastest_lap_driver_id === actual.fastest_lap_driver_id ? 1 : 0;

    const podium_exact = score_p1 && score_p2 && score_p3 ? 1 : 0;
    if (podium_exact) {
      score_p1 = 2;
      score_p2 = 2;
      score_p3 = 2;
    }

    let score_wildcard = 0;
    if (pred.wildcard_driver_id && wildcardRule === 'top10') {
      const hit = data.race_results.find(
        rr =>
          rr.season === pred.season &&
          rr.round === pred.round &&
          rr.driverId === pred.wildcard_driver_id &&
          rr.position !== null &&
          rr.position <= 10
      );
      score_wildcard = hit ? 1 : 0;
    }

    let score_lock = 0;

    pred.sidebet_pole_converts = toBoolNullable(pred.sidebet_pole_converts);
    pred.sidebet_front_row_winner = toBoolNullable(pred.sidebet_front_row_winner);
    pred.sidebet_any_dnf = toBoolNullable(pred.sidebet_any_dnf);
    pred.sidebet_red_flag = toBoolNullable(pred.sidebet_red_flag);
    pred.sidebet_big_mover = toBoolNullable(pred.sidebet_big_mover);
    pred.sidebet_other7_podium = toBoolNullable(pred.sidebet_other7_podium);

    const sideBetActuals = sideBetActualsFor(pred.season, pred.round);

    pred.score_sidebet_pole_converts = scoreSideBetPick(
      pred.sidebet_pole_converts,
      sideBetActuals.poleConverts,
      SIDE_BET_DEFS.poleConverts.points
    );
    pred.score_sidebet_front_row_winner = scoreSideBetPick(
      pred.sidebet_front_row_winner,
      sideBetActuals.frontRowWinner,
      SIDE_BET_DEFS.frontRowWinner.points
    );
    pred.score_sidebet_any_dnf = scoreSideBetPick(
      pred.sidebet_any_dnf,
      sideBetActuals.anyDnf,
      SIDE_BET_DEFS.anyDnf.points
    );
    pred.score_sidebet_red_flag = scoreSideBetPick(
      pred.sidebet_red_flag,
      sideBetActuals.redFlag,
      SIDE_BET_DEFS.redFlag.points
    );
    pred.score_sidebet_big_mover = scoreSideBetPick(
      pred.sidebet_big_mover,
      sideBetActuals.bigMover,
      SIDE_BET_DEFS.bigMover.points
    );
    pred.score_sidebet_other7_podium = scoreSideBetPick(
      pred.sidebet_other7_podium,
      sideBetActuals.other7Podium,
      SIDE_BET_DEFS.other7Podium.points
    );

    pred.score_sidebets_total =
      (pred.score_sidebet_pole_converts || 0) +
      (pred.score_sidebet_front_row_winner || 0) +
      (pred.score_sidebet_any_dnf || 0) +
      (pred.score_sidebet_red_flag || 0) +
      (pred.score_sidebet_big_mover || 0) +
      (pred.score_sidebet_other7_podium || 0);

    if (pred.lock_field) {
      const lockMap = {
        p1: score_p1,
        p2: score_p2,
        p3: score_p3,
        pole: score_pole,
        fastestLap: score_fastest_lap,
        sidebetPoleConverts: pred.score_sidebet_pole_converts,
        sidebetFrontRowWinner: pred.score_sidebet_front_row_winner,
        sidebetAnyDnf: pred.score_sidebet_any_dnf,
        sidebetRedFlag: pred.score_sidebet_red_flag,
        sidebetBigMover: pred.score_sidebet_big_mover,
        sidebetOther7Podium: pred.score_sidebet_other7_podium
      };
      if (lockMap[pred.lock_field] && lockMap[pred.lock_field] > 0) score_lock = 1;
    }

    pred.score_p1 = score_p1;
    pred.score_p2 = score_p2;
    pred.score_p3 = score_p3;
    pred.score_pole = score_pole;
    pred.score_fastest_lap = score_fastest_lap;
    pred.score_wildcard = score_wildcard;
    pred.score_lock = score_lock;
    pred.podium_exact = podium_exact;
    pred.score_total =
      score_p1 +
      score_p2 +
      score_p3 +
      score_pole +
      score_fastest_lap +
      score_wildcard +
      score_lock +
      (pred.score_sidebets_total || 0);
    pred.updated_at = now;
  }
}

function getSeasonSchedule(season, data = null) {
  const schedule = loadSchedule()
    .filter((r) => r.season === season)
    .sort((a, b) => a.round - b.round);

  if (schedule.length) return schedule;

  const source = data || loadDb();
  return (source.races || [])
    .filter((r) => r.season === season)
    .map((r) => ({
      season,
      round: toInt(r.round),
      raceName: r.raceName || ('Round ' + r.round),
      start_date: String(r.date || '').slice(0, 10),
      end_date: String(r.date || '').slice(0, 10)
    }))
    .filter((r) => r.round && r.start_date)
    .sort((a, b) => a.round - b.round);
}

function getSeasonStandings(data, season) {
  const results = data.race_results.filter(r => r.season === season);
  const grid = resolveGridDrivers(data, season);

  const driverPoints = new Map();
  for (const g of grid) driverPoints.set(g.driverId, 0);

  for (const r of results) {
    if (driverPoints.has(r.driverId)) {
      driverPoints.set(r.driverId, driverPoints.get(r.driverId) + (r.points || 0));
    }
  }

  const driverStandings = grid
    .map(g => ({
      driverId: g.driverId,
      driverName: g.driverName,
      team: g.team,
      points: driverPoints.get(g.driverId) || 0
    }))
    .sort((a, b) => b.points - a.points || a.driverName.localeCompare(b.driverName));

  const teamPoints = new Map();
  for (const d of driverStandings) {
    teamPoints.set(d.team, (teamPoints.get(d.team) || 0) + d.points);
  }

  const constructorStandings = [...teamPoints.entries()]
    .map(([team, points]) => ({ team, points }))
    .sort((a, b) => b.points - a.points || a.team.localeCompare(b.team));

  return { driverStandings, constructorStandings };
}

function getNestedValue(obj, dottedPath) {
  const parts = String(dottedPath || '').split('.');
  let cursor = obj;
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object') return null;
    cursor = cursor[part];
  }
  if (cursor === undefined) return null;
  return cursor;
}

function normalizeAdjudicationValue(value) {
  if (value === true || value === false) return value;
  if (value === null || value === undefined || value === '') return null;
  const raw = String(value).trim().toLowerCase();
  if (raw === 'hit' || raw === 'yes' || raw === 'true' || raw === '1') return true;
  if (raw === 'miss' || raw === 'no' || raw === 'false' || raw === '0') return false;
  return null;
}

function normalizeAdjudicationMap(input) {
  const out = {};
  const raw = (input && typeof input === 'object' && !Array.isArray(input)) ? input : {};
  for (const field of SEASON_NON_STANDING_FIELDS) {
    out[field] = normalizeAdjudicationValue(raw[field]);
  }
  return out;
}

function buildWdcScoring(actualDriverOrder, predictedOrder) {
  const actualPosByDriver = new Map();
  (actualDriverOrder || []).forEach((driverId, idx) => {
    if (driverId) actualPosByDriver.set(driverId, idx + 1);
  });

  let total = 0;
  const lines = [];
  const picks = Array.isArray(predictedOrder) ? predictedOrder : [];

  for (let idx = 0; idx < picks.length; idx += 1) {
    const driverId = picks[idx];
    if (!driverId) continue;

    const predictedPos = idx + 1;
    const actualPos = actualPosByDriver.get(driverId);
    if (!actualPos) continue;

    const delta = Math.abs(actualPos - predictedPos);
    let points = 0;
    if (delta === 0) points = SEASON_STANDINGS_SCORING.wdcExact;
    else if (delta === 1) points = SEASON_STANDINGS_SCORING.wdcWithin1;
    else if (delta <= 3) points = SEASON_STANDINGS_SCORING.wdcWithin3;

    total += points;
    lines.push({
      driverId,
      predictedPos,
      actualPos,
      delta,
      points
    });
  }

  return { total, lines };
}

function buildWccScoring(actualTeamOrder, predictedOrder) {
  const actualPosByTeam = new Map();
  (actualTeamOrder || []).forEach((team, idx) => {
    if (team) actualPosByTeam.set(displayTeamName(team), idx + 1);
  });

  let total = 0;
  const lines = [];
  const picks = Array.isArray(predictedOrder) ? predictedOrder : [];

  for (let idx = 0; idx < picks.length; idx += 1) {
    const rawTeam = picks[idx];
    if (!rawTeam) continue;
    const team = displayTeamName(rawTeam);
    const predictedPos = idx + 1;
    const actualPos = actualPosByTeam.get(team);
    if (!actualPos) continue;

    const exact = actualPos === predictedPos;
    const points = exact ? SEASON_STANDINGS_SCORING.wccExact : 0;
    total += points;

    lines.push({
      team,
      predictedPos,
      actualPos,
      exact,
      points
    });
  }

  return { total, lines };
}

function buildSeasonAdjudicationSummary(row, standings) {
  const adjudication = normalizeAdjudicationMap(row?.adjudication || {});
  const nonStandingRows = [];
  let nonStandingPoints = 0;
  let nonStandingMax = 0;
  let nonStandingPending = 0;
  let nonStandingHits = 0;
  let nonStandingMisses = 0;

  for (const field of SEASON_NON_STANDING_FIELDS) {
    const pickValue = getNestedValue(row, field);
    const hasPick = !(pickValue === null || pickValue === undefined || String(pickValue).trim() === '');
    const maxPoints = hasPick ? Number(SEASON_NON_STANDING_FIELD_POINTS[field] || 0) : 0;
    const status = hasPick ? adjudication[field] : null;
    const scoredPoints = hasPick && status === true ? maxPoints : 0;

    if (hasPick) {
      nonStandingMax += maxPoints;
      if (status === true) nonStandingHits += 1;
      else if (status === false) nonStandingMisses += 1;
      else nonStandingPending += 1;
    }

    nonStandingPoints += scoredPoints;

    nonStandingRows.push({
      field,
      label: SEASON_NON_STANDING_FIELD_LABELS[field] || field,
      pickValue: hasPick ? pickValue : null,
      points: maxPoints,
      status,
      scoredPoints
    });
  }

  const actualDriverOrder = standings?.driverStandings?.map((rowItem) => rowItem.driverId) || [];
  const actualTeamOrder = standings?.constructorStandings?.map((rowItem) => displayTeamName(rowItem.team)) || [];
  const wdc = buildWdcScoring(actualDriverOrder, row?.wdc_order || []);
  const wcc = buildWccScoring(actualTeamOrder, row?.wcc_order || []);
  const standingsPoints = wdc.total + wcc.total;

  return {
    nonStanding: {
      rows: nonStandingRows,
      points: nonStandingPoints,
      max: nonStandingMax,
      hits: nonStandingHits,
      misses: nonStandingMisses,
      pending: nonStandingPending
    },
    standings: {
      points: standingsPoints,
      wdc,
      wcc
    },
    totalPoints: standingsPoints + nonStandingPoints
  };
}

function buildTieBreakReport(data, season) {
  const users = getConfiguredUsers();
  const preds = (data.predictions || []).filter((row) => row.season === season);
  const rounds = [...new Set(preds.map((row) => row.round).filter(Boolean))].sort((a, b) => a - b);
  const lastRound = rounds.length ? rounds[rounds.length - 1] : null;

  const rows = users.map((user) => {
    const userPreds = preds.filter((row) => row.user === user);
    const totalPoints = userPreds.reduce((sum, row) => sum + Number(row.score_total || 0), 0);
    const lockAttempts = userPreds.filter((row) => row.lock_field).length;
    const lockHits = userPreds.filter((row) => Number(row.score_lock || 0) > 0).length;
    const lockHitRate = lockAttempts ? (lockHits / lockAttempts) : 0;
    const podiumExactHits = userPreds.filter((row) => Number(row.podium_exact || 0) > 0).length;
    const sideBetPoints = userPreds.reduce((sum, row) => sum + Number(row.score_sidebets_total || 0), 0);
    const averagePointsPerRound = rounds.length ? (totalPoints / rounds.length) : 0;
    const latestRoundPoints = lastRound
      ? userPreds.filter((row) => row.round === lastRound).reduce((sum, row) => sum + Number(row.score_total || 0), 0)
      : 0;

    return {
      user,
      total_points: totalPoints,
      lock_hit_rate: lockHitRate,
      podium_exact_hits: podiumExactHits,
      side_bet_points: sideBetPoints,
      average_points_per_round: averagePointsPerRound,
      latest_round_points: latestRoundPoints
    };
  });

  const tieBreakers = [
    'total_points',
    'lock_hit_rate',
    'podium_exact_hits',
    'side_bet_points',
    'average_points_per_round',
    'latest_round_points'
  ];

  const sorted = [...rows].sort((a, b) => {
    for (const key of tieBreakers) {
      const av = Number(a[key] || 0);
      const bv = Number(b[key] || 0);
      if (bv !== av) return bv - av;
    }
    return String(a.user || '').localeCompare(String(b.user || ''));
  });

  const leader = sorted[0] || null;
  const runnerUp = sorted[1] || null;
  let decidedBy = null;
  let explanation = 'No tie-break comparison available yet.';

  if (leader && runnerUp) {
    for (const key of tieBreakers) {
      const av = Number(leader[key] || 0);
      const bv = Number(runnerUp[key] || 0);
      if (av !== bv) {
        decidedBy = key;
        const delta = av - bv;
        explanation = `${leader.user} leads ${runnerUp.user} on ${key.replaceAll('_', ' ')} (${av.toFixed(2)} vs ${bv.toFixed(2)}, +${delta.toFixed(2)}).`;
        break;
      }
    }
    if (!decidedBy) explanation = `${leader.user} and ${runnerUp.user} are fully tied across all tie-breakers.`;
  }

  return {
    season,
    rounds,
    tieBreakers,
    rows: sorted,
    leader: leader ? leader.user : null,
    runnerUp: runnerUp ? runnerUp.user : null,
    decidedBy,
    explanation
  };
}

function parseIsoDate(value) {
  if (!value) return null;
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : null;
}

function latestTimestampForRows(rows, candidateFields = ['updated_at', 'created_at', 'date']) {
  let latest = null;
  for (const row of rows || []) {
    for (const field of candidateFields) {
      const ts = parseIsoDate(row?.[field]);
      if (ts !== null && (latest === null || ts > latest)) latest = ts;
    }
  }
  return latest;
}

function buildDataFreshnessCheck(data, season) {
  const buckets = [
    { id: 'predictions', rows: (data.predictions || []).filter((r) => r.season === season), fields: ['updated_at', 'created_at'] },
    { id: 'season_predictions', rows: (data.season_predictions || []).filter((r) => r.season === season), fields: ['updated_at', 'created_at'] },
    { id: 'race_actuals', rows: (data.race_actuals || []).filter((r) => r.season === season), fields: ['updated_at', 'created_at', 'date'] },
    { id: 'race_results', rows: (data.race_results || []).filter((r) => r.season === season), fields: ['updated_at', 'created_at', 'date'] },
    { id: 'qualifying_results', rows: (data.qualifying_results || []).filter((r) => r.season === season), fields: ['updated_at', 'created_at', 'date'] }
  ];

  const sources = buckets.map((bucket) => {
    const latestTs = latestTimestampForRows(bucket.rows, bucket.fields);
    return {
      source: bucket.id,
      rows: bucket.rows.length,
      latestAt: latestTs === null ? null : new Date(latestTs).toISOString()
    };
  });

  const totalRows = sources.reduce((sum, row) => sum + row.rows, 0);
  const latestAny = sources
    .map((row) => parseIsoDate(row.latestAt))
    .filter((ts) => ts !== null)
    .reduce((best, ts) => (best === null || ts > best ? ts : best), null);

  if (!totalRows) {
    const schedule = getSeasonSchedule(season, data);
    const firstRound = schedule[0] || null;
    const firstRoundStartTs = parseIsoDate(firstRound?.start_date ? `${firstRound.start_date}T00:00:00Z` : null);
    const preSeason = firstRoundStartTs !== null && Date.now() < firstRoundStartTs;

    return {
      id: 'data_freshness',
      label: 'Data freshness',
      status: preSeason ? 'ok' : 'warn',
      ok: true,
      message: preSeason
        ? `No season rows yet (expected pre-season). First round starts ${firstRound?.start_date || 'TBD'}.`
        : `No data rows found yet for season ${season}.`,
      details: { season, totalRows, sources, preSeason, firstRound: firstRound?.round || null, firstRoundStart: firstRound?.start_date || null }
    };
  }

  if (latestAny === null) {
    return {
      id: 'data_freshness',
      label: 'Data freshness',
      status: 'warn',
      ok: true,
      message: 'Data exists but no timestamp fields were found.',
      details: { season, totalRows, sources }
    };
  }

  const ageHours = (Date.now() - latestAny) / 3600000;
  let status = 'ok';
  let ok = true;
  if (ageHours > 720) {
    status = 'fail';
    ok = false;
  } else if (ageHours > 120) {
    status = 'warn';
  }

  const message = status === 'ok'
    ? `Latest season data is ${(ageHours).toFixed(1)}h old.`
    : (status === 'warn'
      ? `Latest season data is ${(ageHours).toFixed(1)}h old (stale warning).`
      : `Latest season data is ${(ageHours).toFixed(1)}h old (stale failure).`);

  return {
    id: 'data_freshness',
    label: 'Data freshness',
    status,
    ok,
    message,
    details: {
      season,
      totalRows,
      latestAt: new Date(latestAny).toISOString(),
      ageHours: Number(ageHours.toFixed(2)),
      sources
    }
  };
}

function buildScheduleValidityCheck(season) {
  const schedule = getSeasonSchedule(season);
  if (!schedule.length) {
    return {
      id: 'schedule_validity',
      label: 'Schedule validity',
      status: 'fail',
      ok: false,
      message: `No schedule loaded for season ${season}.`,
      details: { season, rounds: 0 }
    };
  }

  const issues = [];
  const roundSet = new Set();
  let missingDates = 0;
  let outOfOrder = 0;
  let prevStart = null;

  for (const row of schedule) {
    if (roundSet.has(row.round)) issues.push(`Duplicate round number: ${row.round}`);
    roundSet.add(row.round);
    if (!row.start_date) missingDates += 1;
    const startTs = parseIsoDate(row.start_date ? `${row.start_date}T00:00:00Z` : null);
    if (startTs !== null && prevStart !== null && startTs < prevStart) outOfOrder += 1;
    if (startTs !== null) prevStart = startTs;
  }

  const sortedRounds = [...roundSet].sort((a, b) => a - b);
  const gaps = [];
  if (sortedRounds.length) {
    for (let expected = sortedRounds[0]; expected <= sortedRounds[sortedRounds.length - 1]; expected += 1) {
      if (!roundSet.has(expected)) gaps.push(expected);
    }
  }

  if (missingDates) issues.push(`${missingDates} rounds missing start_date`);
  if (outOfOrder) issues.push(`${outOfOrder} rounds out of chronological order`);
  if (gaps.length) issues.push(`Missing round numbers: ${gaps.join(', ')}`);

  let status = 'ok';
  let ok = true;
  if (missingDates || outOfOrder) {
    status = 'fail';
    ok = false;
  } else if (gaps.length) {
    status = 'warn';
  }

  return {
    id: 'schedule_validity',
    label: 'Schedule validity',
    status,
    ok,
    message: issues.length ? issues.join(' · ') : `Schedule looks valid (${schedule.length} rounds).`,
    details: {
      season,
      rounds: schedule.length,
      firstRound: schedule[0]?.round || null,
      lastRound: schedule[schedule.length - 1]?.round || null,
      gaps,
      missingDates,
      outOfOrder
    }
  };
}

async function buildOpenF1ConnectivityCheck(season) {
  const started = Date.now();
  try {
    const meetings = await fetchOpenF1('meetings', { year: season }, 1);
    const latencyMs = Date.now() - started;
    const status = meetings.length ? 'ok' : 'warn';
    return {
      id: 'openf1_connectivity',
      label: 'OpenF1 connectivity',
      status,
      ok: true,
      message: meetings.length
        ? `Connected in ${latencyMs}ms (${meetings.length} meeting rows).`
        : `Connected in ${latencyMs}ms but received no meeting rows.`,
      details: {
        baseUrl: OPENF1_BASE_URL,
        latencyMs,
        season,
        rows: meetings.length
      }
    };
  } catch (error) {
    return {
      id: 'openf1_connectivity',
      label: 'OpenF1 connectivity',
      status: 'fail',
      ok: false,
      message: error?.message || 'OpenF1 connectivity failed.',
      details: {
        baseUrl: OPENF1_BASE_URL,
        season
      }
    };
  }
}

function buildBackupHealthCheck() {
  const dbExists = fs.existsSync(DB_PATH);
  const dbStat = dbExists ? fs.statSync(DB_PATH) : null;
  const snapshots = listSnapshots();

  if (!dbExists) {
    return {
      id: 'backup_health',
      label: 'DB backup health',
      status: 'fail',
      ok: false,
      message: 'Primary database file is missing.',
      details: { dbPath: DB_PATH, backups: snapshots.length }
    };
  }

  if (!snapshots.length) {
    return {
      id: 'backup_health',
      label: 'DB backup health',
      status: 'warn',
      ok: true,
      message: 'No backup snapshots yet. Create your first snapshot in Ops.',
      details: {
        dbPath: DB_PATH,
        dbSizeBytes: dbStat?.size || 0,
        backups: 0
      }
    };
  }

  const latest = snapshots[0];
  const snapshotPath = path.join(BACKUP_DIR, latest.name);
  let parseOk = true;
  try {
    JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  } catch {
    parseOk = false;
  }

  const ageHours = Number(latest.ageHours || 0);
  let status = 'ok';
  let ok = true;
  if (!parseOk) {
    status = 'fail';
    ok = false;
  } else if (ageHours > 168) {
    status = 'warn';
  }

  const message = !parseOk
    ? `Latest snapshot ${latest.name} failed JSON parse.`
    : (status === 'warn'
      ? `Latest snapshot is ${ageHours.toFixed(1)}h old.`
      : `Latest snapshot ${latest.name} is healthy.`);

  return {
    id: 'backup_health',
    label: 'DB backup health',
    status,
    ok,
    message,
    details: {
      dbPath: DB_PATH,
      dbSizeBytes: dbStat?.size || 0,
      backups: snapshots.length,
      latestSnapshot: latest,
      latestParseOk: parseOk
    }
  };
}

async function buildHealthCheckReport(season) {
  const data = loadDb();
  const checks = [
    buildStoragePersistenceCheck(),
    buildDataFreshnessCheck(data, season),
    await buildOpenF1ConnectivityCheck(season),
    buildScheduleValidityCheck(season),
    buildBackupHealthCheck()
  ];

  const counts = {
    ok: checks.filter((row) => row.status === 'ok').length,
    warn: checks.filter((row) => row.status === 'warn').length,
    fail: checks.filter((row) => row.status === 'fail').length
  };
  const status = counts.fail ? 'fail' : (counts.warn ? 'warn' : 'ok');

  return {
    ok: status !== 'fail',
    status,
    checkedAt: new Date().toISOString(),
    season,
    counts,
    checks
  };
}

app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  res.json({ users: cfg.users.map(u => u.name), wildcardRule: cfg.wildcardRule });
});

app.get('/api/seasons', (req, res) => {
  const scheduled = [...new Set(loadSchedule().map((row) => toInt(row && row.season)).filter(Boolean))]
    .sort((a, b) => a - b);

  if (scheduled.length) {
    res.json(scheduled);
    return;
  }

  const data = loadDb();
  const seasons = new Set();
  for (const group of [
    data.races || [],
    data.qualifying_results || [],
    data.race_results || [],
    data.predictions || [],
    data.season_predictions || [],
    data.driver_seasons || []
  ]) {
    for (const row of group) {
      const season = toInt(row && row.season);
      if (season) seasons.add(season);
    }
  }

  if (!seasons.size) seasons.add(2026);
  res.json([...seasons].sort((a, b) => a - b));
});

app.get('/api/races', (req, res) => {
  const season = requireSeason(req.query.season);
  const rows = getSeasonSchedule(season);
  res.json(rows);
});

app.get('/api/drivers', (req, res) => {
  const data = loadDb();
  const season = toInt(req.query.season) || 2026;
  const rows = resolveGridDrivers(data, season)
    .sort((a, b) => compareDriversForDropdown(a, b, season));
  res.json(rows);
});

app.post('/api/predictions', (req, res) => {
  const { user: userRaw, season: seasonRaw, round: roundRaw, picks, pin } = req.body || {};
  requireObject(picks, 'picks required');

  const cfg = loadConfig();
  const user = requireKnownUser(cfg, userRaw, pin);
  const season = requireSeason(seasonRaw);
  const round = requireRound(roundRaw);

  const data = loadDb();
  const preWriteSnapshot = createPreWriteSnapshot(`pre-weekly-r${round}-${user}`);
  const now = new Date().toISOString();
  let pred = data.predictions.find(p => p.user === user && p.season === season && p.round === round);

  if (!pred) {
    pred = {
      id: data.predictions.length ? Math.max(...data.predictions.map(p => p.id)) + 1 : 1,
      user,
      season,
      round,
      created_at: now
    };
    data.predictions.push(pred);
  }

  pred.p1_driver_id = picks.p1 || null;
  pred.p2_driver_id = picks.p2 || null;
  pred.p3_driver_id = picks.p3 || null;
  pred.pole_driver_id = picks.pole || null;
  pred.fastest_lap_driver_id = picks.fastestLap || null;
  pred.wildcard_driver_id = picks.wildcard || null;
  pred.wildcard_text = String(picks.wildcardText || '');
  pred.lock_field = picks.lockField || null;

  const sideBets = (picks.sideBets && typeof picks.sideBets === 'object') ? picks.sideBets : {};
  pred.sidebet_pole_converts = toBoolNullable(sideBets.poleConverts);
  pred.sidebet_front_row_winner = toBoolNullable(sideBets.frontRowWinner);
  pred.sidebet_any_dnf = toBoolNullable(sideBets.anyDnf);
  pred.sidebet_red_flag = toBoolNullable(sideBets.redFlag);
  pred.sidebet_big_mover = toBoolNullable(sideBets.bigMover);
  pred.sidebet_other7_podium = toBoolNullable(sideBets.other7Podium);

  pred.updated_at = now;

  updateAllPredictionScores(data);
  saveDb(data);
  const postWriteSnapshot = createPostWriteSnapshot(`post-weekly-r${round}-${user}`);
  res.json({ ok: true, preWriteSnapshot, postWriteSnapshot });
});

app.get('/api/predictions', (req, res) => {
  const season = requireSeason(req.query.season);
  const round = requireRound(req.query.round);

  const data = loadDb();
  const rows = data.predictions
    .filter(p => p.season === season && p.round === round)
    .sort((a, b) => String(a.user || '').localeCompare(String(b.user || '')))
    .map(p => {
      const a = data.race_actuals.find(x => x.season === season && x.round === round);
      return {
        ...p,
        pole_driver_id: a?.pole_driver_id || null,
        p1_driver_id: a?.p1_driver_id || null,
        p2_driver_id: a?.p2_driver_id || null,
        p3_driver_id: a?.p3_driver_id || null,
        fastest_lap_driver_id: a?.fastest_lap_driver_id || null
      };
    });

  res.json(rows);
});

app.get('/api/stats', (req, res) => {
  const season = requireSeason(req.query.season);
  const view = normalizeStatsView(req.query.view);
  const data = loadDb();

  const stats = sortIntelRows(computeIntelligenceViewRows(data, season, view, {
    includeCurrentSeasonInHistory: true
  }));

  res.json(stats);
});

app.get('/api/projections', async (req, res, next) => {
  try {
    const season = requireSeason(req.query.season);
    const round = requireRound(req.query.round);
    const userRaw = String(req.query.user || '').trim();
    const user = userRaw || null;
    const includeTesting = !['0', 'false', 'off', 'no'].includes(String(req.query.testing || '').trim().toLowerCase());

    if (user) {
      const known = getConfiguredUsers();
      if (!known.includes(user)) throw fail('Unknown user for projections', 400);
    }

    let testingSync = {
      enabled: includeTesting,
      reused: false,
      imported_rows: 0,
      total_rows: 0,
      error: null
    };

    if (includeTesting) {
      try {
        testingSync = {
          ...testingSync,
          ...(await ensureOpenF1TestingData(season))
        };
      } catch (error) {
        testingSync.error = error?.message || 'Testing sync failed';
      }
    }

    const data = loadDb();
    const payload = projectRoundOutcomes(data, season, round, user, { includeTesting });
    payload.testing_sync = testingSync;
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

app.post('/api/openf1/sync-round', async (req, res, next) => {
  try {
    const season = requireSeason(req.body?.season);
    const round = requireRound(req.body?.round);
    const result = await importOpenF1Round({ season, round });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.post('/api/openf1/sync-testing', async (req, res, next) => {
  try {
    const season = requireSeason(req.body?.season || req.query?.season || 2026);
    const force = toBool(req.body?.force ?? req.query?.force);
    const result = await importOpenF1TestingSeason({ season, force });
    res.json({ ok: true, ...result });
  } catch (error) {
    next(error);
  }
});

app.get('/api/season/standings', (req, res) => {
  const season = requireSeason(req.query.season);
  const data = loadDb();
  const standings = getSeasonStandings(data, season);
  res.json(standings);
});

app.get('/api/season/picks', (req, res) => {
  const season = requireSeason(req.query.season);
  const data = loadDb();
  const picks = data.season_predictions.filter(p => p.season === season);
  res.json(picks);
});

app.get('/api/season/picks-lock', (req, res) => {
  const season = requireSeason(req.query.season);
  res.json(getSeasonPickLockStatus(season));
});

app.get('/api/season/rules', (req, res) => {
  const season = toInt(req.query.season) || 2026;
  const lock = getSeasonPickLockStatus(season);
  const weeklySideBetPoints = Object.fromEntries(
    SIDE_BET_KEYS.map((key) => [key, SIDE_BET_DEFS[key].points])
  );

  res.json({
    version: 'v1',
    season,
    lock,
    weekly: {
      picks: WEEKLY_PICK_SCORING,
      sideBets: weeklySideBetPoints
    },
    standings: SEASON_STANDINGS_SCORING,
    nonStandingFieldPoints: SEASON_NON_STANDING_FIELD_POINTS,
    tieBreakers: [
      'total_points',
      'lock_hit_rate',
      'podium_exact_hits',
      'side_bet_points',
      'average_points_per_round',
      'latest_round_points'
    ]
  });
});

app.get('/api/admin/health-check', async (req, res, next) => {
  try {
    const season = toInt(req.query.season) || 2026;
    const report = await buildHealthCheckReport(season);
    res.status(report.ok ? 200 : 503).json(report);
  } catch (error) {
    next(error);
  }
});

app.get('/api/admin/storage-safety', (req, res) => {
  res.json(getStorageSafetyStatus());
});

app.get('/api/admin/snapshots', (req, res) => {
  const dbExists = fs.existsSync(DB_PATH);
  const dbStat = dbExists ? fs.statSync(DB_PATH) : null;
  const payload = {
    db: {
      exists: dbExists,
      path: DB_PATH,
      sizeBytes: dbStat?.size || 0,
      updatedAt: dbStat ? dbStat.mtime.toISOString() : null,
      sha256: dbExists ? hashFileSha256(DB_PATH) : null
    },
    snapshots: listSnapshots()
  };
  res.json(payload);
});

app.get('/api/admin/export-db', (req, res) => {
  const cfg = loadConfig();
  const user = requireKnownUser(cfg, req.query?.user, req.query?.pin);
  if (!fs.existsSync(DB_PATH)) throw fail('Database file not found.', 404);

  const filename = `f1-picks-db-export-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Exported-By', user);
  res.setHeader('X-Db-Path', DB_PATH);
  res.send(fs.readFileSync(DB_PATH, 'utf8'));
});

app.post('/api/admin/snapshots', (req, res) => {
  const { user: userRaw, pin, reason } = req.body || {};
  const cfg = loadConfig();
  const user = requireKnownUser(cfg, userRaw, pin);
  const snapshot = createDbSnapshot(reason || `manual-${user}`);
  if (!snapshot) throw fail('No database file found to snapshot.', 400);

  res.json({
    ok: true,
    snapshot,
    createdBy: user,
    totalSnapshots: listSnapshots().length
  });
});

app.post('/api/admin/snapshots/rollback', (req, res) => {
  const { user: userRaw, pin, snapshot } = req.body || {};
  const cfg = loadConfig();
  const user = requireKnownUser(cfg, userRaw, pin);
  const result = restoreDbSnapshot(snapshot);
  appendImportAudit({
    source: 'backup',
    action: 'rollback',
    season: null,
    round: null,
    changedRows: {
      restoredSnapshot: result.restoredSnapshot,
      rollbackGuard: result.rollbackGuard || null
    },
    details: {
      restoredBy: user
    }
  });

  res.json({
    ok: true,
    restoredBy: user,
    ...result
  });
});

app.get('/api/admin/import-audit', (req, res) => {
  const limitRaw = toInt(req.query.limit);
  const limit = Math.max(1, Math.min(200, limitRaw || 30));
  const allRows = loadImportAudit();
  const rows = allRows.slice(0, limit);
  const last = rows[0] || null;
  res.json({
    total: allRows.length,
    last,
    rows
  });
});

app.post('/api/season/picks', (req, res) => {
  const { user: userRaw, season: seasonRaw, picks, pin } = req.body || {};
  requireObject(picks, 'picks required');

  const cfg = loadConfig();
  const user = requireKnownUser(cfg, userRaw, pin);
  const season = requireSeason(seasonRaw);
  const lockStatus = getSeasonPickLockStatus(season);
  if (lockStatus.locked) {
    throw fail(`Championship picks are locked for ${season} as of ${lockStatus.lockDate}.`, 423);
  }

  const data = loadDb();
  const preWriteSnapshot = createPreWriteSnapshot(`pre-champ-${season}-${user}`);
  const now = new Date().toISOString();
  let row = data.season_predictions.find(p => p.user === user && p.season === season);

  if (!row) {
    row = { user, season, created_at: now };
    data.season_predictions.push(row);
  }

  row.driver_champion_id = picks.driverChampion || null;
  row.constructor_champion = picks.constructorChampion || null;
  row.wdc_order = Array.isArray(picks.wdcOrder) ? picks.wdcOrder : [];
  row.wcc_order = Array.isArray(picks.wccOrder) ? picks.wccOrder : [];
  row.wdc_bonus = picks.wdcBonus || {};
  row.wcc_bonus = picks.wccBonus || {};
  row.out_of_box = picks.outOfBox || {};
  row.chaos = picks.chaos || {};
  row.breakouts = picks.breakouts || {};
  row.big_brain = picks.bigBrain || {};
  row.bingo = picks.bingo || {};
  row.curses = picks.curses || {};
  row.updated_at = now;

  saveDb(data);
  const postWriteSnapshot = createPostWriteSnapshot(`post-champ-${season}-${user}`);
  res.json({ ok: true, preWriteSnapshot, postWriteSnapshot });
});

app.get('/api/season/summary', (req, res) => {
  const season = requireSeason(req.query.season);
  const data = loadDb();
  const users = getConfiguredUsers();
  const summary = users.map(user => {
    const total = data.predictions
      .filter(p => p.user === user && p.season === season)
      .reduce((sum, p) => sum + (p.score_total || 0), 0);
    return { user, total };
  });
  res.json(summary);
});

app.get('/api/season/tiebreak', (req, res) => {
  const season = requireSeason(req.query.season);
  const data = loadDb();
  res.json(buildTieBreakReport(data, season));
});

app.get('/api/season/adjudication', (req, res) => {
  const season = requireSeason(req.query.season);
  const data = loadDb();
  const standings = getSeasonStandings(data, season);
  const users = getConfiguredUsers();

  const rows = users.map((user) => {
    const pickRow = data.season_predictions.find((entry) => entry.user === user && entry.season === season) || {
      user,
      season,
      wdc_order: [],
      wcc_order: [],
      wdc_bonus: {},
      wcc_bonus: {},
      out_of_box: {},
      chaos: {},
      big_brain: {},
      bingo: {},
      curses: {},
      adjudication: {}
    };
    const summary = buildSeasonAdjudicationSummary(pickRow, standings);

    return {
      user,
      season,
      adjudication: normalizeAdjudicationMap(pickRow.adjudication || {}),
      summary
    };
  });

  res.json({
    season,
    rules: {
      nonStandingFieldPoints: SEASON_NON_STANDING_FIELD_POINTS,
      nonStandingFieldLabels: SEASON_NON_STANDING_FIELD_LABELS,
      standings: SEASON_STANDINGS_SCORING
    },
    standings,
    rows
  });
});

app.post('/api/season/adjudication', (req, res) => {
  const { user: userRaw, season: seasonRaw, adjudication, pin } = req.body || {};
  const cfg = loadConfig();
  const user = requireKnownUser(cfg, userRaw, pin);
  const season = requireSeason(seasonRaw);

  const data = loadDb();
  const preWriteSnapshot = createPreWriteSnapshot(`pre-adjud-${season}-${user}`);
  const now = new Date().toISOString();
  let row = data.season_predictions.find((entry) => entry.user === user && entry.season === season);

  if (!row) {
    row = {
      user,
      season,
      wdc_order: [],
      wcc_order: [],
      wdc_bonus: {},
      wcc_bonus: {},
      out_of_box: {},
      chaos: {},
      big_brain: {},
      bingo: {},
      curses: {},
      created_at: now
    };
    data.season_predictions.push(row);
  }

  row.adjudication = normalizeAdjudicationMap(adjudication);
  row.adjudication_updated_at = now;
  row.updated_at = now;

  saveDb(data);
  const postWriteSnapshot = createPostWriteSnapshot(`post-adjud-${season}-${user}`);

  const standings = getSeasonStandings(data, season);
  const summary = buildSeasonAdjudicationSummary(row, standings);
  res.json({
    ok: true,
    preWriteSnapshot,
    postWriteSnapshot,
    user,
    season,
    adjudication: row.adjudication,
    summary
  });
});

app.get('/api/season/accuracy', (req, res) => {
  const season = requireSeason(req.query.season);
  const data = loadDb();
  const users = getConfiguredUsers();
  const actuals = data.race_actuals.filter(a => a.season === season);

  const rows = users.map(user => {
    const preds = data.predictions.filter(p => p.user === user && p.season === season);
    let correct = 0;
    let attempted = 0;

    for (const pred of preds) {
      const actual = actuals.find(a => a.round === pred.round);
      if (!actual) continue;

      const pairs = [
        ['p1_driver_id', actual.p1_driver_id],
        ['p2_driver_id', actual.p2_driver_id],
        ['p3_driver_id', actual.p3_driver_id],
        ['pole_driver_id', actual.pole_driver_id],
        ['fastest_lap_driver_id', actual.fastest_lap_driver_id]
      ];

      for (const [key, actualId] of pairs) {
        if (pred[key]) attempted += 1;
        if (pred[key] && actualId && pred[key] === actualId) correct += 1;
      }
    }

    const accuracy = attempted ? correct / attempted : 0;
    return { user, correct, attempted, accuracy };
  });

  res.json(rows);
});

app.get('/api/season/timeline', (req, res) => {
  const season = requireSeason(req.query.season);
  const data = loadDb();
  const users = getConfiguredUsers();
  const schedule = getSeasonSchedule(season);

  const rounds = schedule.map(r => r.round);
  const result = rounds.map(round => {
    const entry = { round, totals: {} };
    for (const user of users) {
      const total = data.predictions
        .filter(p => p.user === user && p.season === season && p.round <= round)
        .reduce((sum, p) => sum + (p.score_total || 0), 0);
      entry.totals[user] = total;
    }
    return entry;
  });

  res.json({ rounds, data: result });
});

app.get('/api/weekly/stats', (req, res) => {
  const season = requireSeason(req.query.season);
  const data = loadDb();
  const users = getConfiguredUsers();
  const schedule = getSeasonSchedule(season);

  const rounds = schedule.map(r => r.round);

  const perRound = schedule.map(r => {
    const actual = data.race_actuals.find(a => a.season === season && a.round === r.round);
    const sideBetActuals = computeRoundSideBetActuals(data, season, r.round);
    const userRows = users.map(user => {
      const pred = data.predictions.find(p => p.user === user && p.season === season && p.round === r.round);
      if (!pred) return { user, missing: true };
      const attempted = ['p1_driver_id','p2_driver_id','p3_driver_id','pole_driver_id','fastest_lap_driver_id']
        .reduce((sum, k) => sum + (pred[k] ? 1 : 0), 0);
      const correct = (pred.score_p1 || 0) + (pred.score_p2 || 0) + (pred.score_p3 || 0) + (pred.score_pole || 0) + (pred.score_fastest_lap || 0);
      const accuracy = attempted ? correct / attempted : 0;
      return {
        user,
        picks: {
          p1: pred.p1_driver_id,
          p2: pred.p2_driver_id,
          p3: pred.p3_driver_id,
          pole: pred.pole_driver_id,
          fastestLap: pred.fastest_lap_driver_id,
          wildcardText: pred.wildcard_text || '',
          sideBets: {
            poleConverts: toBoolNullable(pred.sidebet_pole_converts),
            frontRowWinner: toBoolNullable(pred.sidebet_front_row_winner),
            anyDnf: toBoolNullable(pred.sidebet_any_dnf),
            redFlag: toBoolNullable(pred.sidebet_red_flag),
            bigMover: toBoolNullable(pred.sidebet_big_mover),
            other7Podium: toBoolNullable(pred.sidebet_other7_podium)
          }
        },
        points: {
          p1: pred.score_p1 || 0,
          p2: pred.score_p2 || 0,
          p3: pred.score_p3 || 0,
          pole: pred.score_pole || 0,
          fastestLap: pred.score_fastest_lap || 0,
          lock: pred.score_lock || 0,
          wildcard: pred.score_wildcard || 0,
          sideBetPoleConverts: pred.score_sidebet_pole_converts || 0,
          sideBetFrontRowWinner: pred.score_sidebet_front_row_winner || 0,
          sideBetAnyDnf: pred.score_sidebet_any_dnf || 0,
          sideBetRedFlag: pred.score_sidebet_red_flag || 0,
          sideBetBigMover: pred.score_sidebet_big_mover || 0,
          sideBetOther7Podium: pred.score_sidebet_other7_podium || 0,
          sideBetStable:
            (pred.score_sidebet_pole_converts || 0) +
            (pred.score_sidebet_front_row_winner || 0) +
            (pred.score_sidebet_any_dnf || 0),
          sideBetChaos:
            (pred.score_sidebet_red_flag || 0) +
            (pred.score_sidebet_big_mover || 0) +
            (pred.score_sidebet_other7_podium || 0),
          sideBets: pred.score_sidebets_total || 0,
          total: pred.score_total || 0
        },
        lock: pred.lock_field || null,
        podium_exact: pred.podium_exact || 0,
        accuracy
      };
    });

    return {
      round: r.round,
      raceName: r.raceName,
      dates: { start: r.start_date, end: r.end_date },
      actuals: actual ? {
        p1: actual.p1_driver_id,
        p2: actual.p2_driver_id,
        p3: actual.p3_driver_id,
        pole: actual.pole_driver_id,
        fastestLap: actual.fastest_lap_driver_id,
        sideBets: {
          poleConverts: sideBetActuals.poleConverts,
          frontRowWinner: sideBetActuals.frontRowWinner,
          anyDnf: sideBetActuals.anyDnf,
          redFlag: sideBetActuals.redFlag,
          bigMover: sideBetActuals.bigMover,
          other7Podium: sideBetActuals.other7Podium
        }
      } : null,
      users: userRows
    };
  });

  const seasonTotals = users.map(user => {
    const preds = data.predictions.filter(p => p.user === user && p.season === season);
    const total = preds.reduce((sum, p) => sum + (p.score_total || 0), 0);
    const roundsPlayed = preds.length;
    const avg = roundsPlayed ? total / roundsPlayed : 0;

    let currentStreak = 0;
    let bestStreak = 0;
    let tmp = 0;
    const ordered = [...preds].sort((a, b) => a.round - b.round);
    for (const p of ordered) {
      if ((p.score_total || 0) > 0) {
        tmp += 1;
        bestStreak = Math.max(bestStreak, tmp);
        currentStreak = tmp;
      } else {
        tmp = 0;
      }
    }

    const lockAttempts = preds.filter(p => p.lock_field).length;
    const lockHits = preds.filter(p => (p.score_lock || 0) > 0).length;
    const lockRate = lockAttempts ? lockHits / lockAttempts : 0;

    const pointsByRound = rounds.map(r => preds.filter(p => p.round === r).reduce((s, p) => s + (p.score_total || 0), 0));
    const mean = rounds.length ? pointsByRound.reduce((a, b) => a + b, 0) / rounds.length : 0;
    const variance = rounds.length ? pointsByRound.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / rounds.length : 0;
    const consistency = Math.sqrt(variance);

    const last3 = pointsByRound.slice(-3);
    const clutch = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;

    const sideBetPoints = preds.reduce((sum, p) => sum + (p.score_sidebets_total || 0), 0);
    const sideBetStablePoints = preds.reduce(
      (sum, p) => sum + (p.score_sidebet_pole_converts || 0) + (p.score_sidebet_front_row_winner || 0) + (p.score_sidebet_any_dnf || 0),
      0
    );
    const sideBetChaosPoints = preds.reduce(
      (sum, p) => sum + (p.score_sidebet_red_flag || 0) + (p.score_sidebet_big_mover || 0) + (p.score_sidebet_other7_podium || 0),
      0
    );

    const sideBetAttempts = preds.reduce((sum, p) => {
      const picks = [
        p.sidebet_pole_converts,
        p.sidebet_front_row_winner,
        p.sidebet_any_dnf,
        p.sidebet_red_flag,
        p.sidebet_big_mover,
        p.sidebet_other7_podium
      ];
      return sum + picks.filter((value) => value === true || value === false).length;
    }, 0);

    const sideBetHits = preds.reduce((sum, p) => {
      return sum + [
        p.score_sidebet_pole_converts,
        p.score_sidebet_front_row_winner,
        p.score_sidebet_any_dnf,
        p.score_sidebet_red_flag,
        p.score_sidebet_big_mover,
        p.score_sidebet_other7_podium
      ].filter((value) => Number(value || 0) > 0).length;
    }, 0);
    const sideBetHitRate = sideBetAttempts ? sideBetHits / sideBetAttempts : 0;

    return {
      user,
      total,
      avg,
      bestStreak,
      currentStreak,
      lockRate,
      consistency,
      clutch,
      sideBetPoints,
      sideBetStablePoints,
      sideBetChaosPoints,
      sideBetAttempts,
      sideBetHits,
      sideBetHitRate
    };
  });

  const pickCounts = {};
  for (const pred of data.predictions.filter(p => p.season === season)) {
    for (const key of ['p1_driver_id','p2_driver_id','p3_driver_id','pole_driver_id','fastest_lap_driver_id']) {
      const v = pred[key];
      if (!v) continue;
      pickCounts[v] = (pickCounts[v] || 0) + 1;
    }
  }

  const drivers = resolveGridDrivers(data, season);
  const pickFrequency = drivers
    .map(d => ({ driverId: d.driverId, driverName: d.driverName, team: d.team, picks: pickCounts[d.driverId] || 0 }))
    .sort((a, b) => b.picks - a.picks || a.driverName.localeCompare(b.driverName));

  const winnerCounts = {};
  for (const pred of data.predictions.filter(p => p.season === season)) {
    if (pred.p1_driver_id) winnerCounts[pred.p1_driver_id] = (winnerCounts[pred.p1_driver_id] || 0) + 1;
  }
  const mostPickedWinners = drivers
    .map(d => ({ driverId: d.driverId, driverName: d.driverName, team: d.team, picks: winnerCounts[d.driverId] || 0 }))
    .sort((a, b) => b.picks - a.picks || a.driverName.localeCompare(b.driverName))
    .slice(0, 5);

  const delta = {};
  if (seasonTotals.length === 2) {
    delta[seasonTotals[0].user] = seasonTotals[0].total - seasonTotals[1].total;
    delta[seasonTotals[1].user] = seasonTotals[1].total - seasonTotals[0].total;
  }

  res.json({
    perRound,
    seasonTotals,
    pickFrequency,
    mostPickedWinners,
    delta
  });
});


app.get('/api/qualifying', (req, res) => {
  const season = requireSeason(req.query.season);
  const round = requireRound(req.query.round);
  const data = loadDb();
  const rows = data.qualifying_results
    .filter(q => q.season === season && q.round === round)
    .sort((a, b) => a.position - b.position);
  res.json(rows);
});

app.get('/api/results', (req, res) => {
  const season = requireSeason(req.query.season);
  const round = requireRound(req.query.round);
  const data = loadDb();
  const rows = data.race_results
    .filter(r => r.season === season && r.round === round && r.position !== null)
    .sort((a, b) => a.position - b.position);
  res.json(rows);
});

app.post('/api/demo/season-picks', (req, res) => {
  assertDemoEndpointsAllowed();
  const season = requireSeason(req.body?.season || 2026);
  const data = loadDb();
  const users = getConfiguredUsers();

  if (!users.length) {
    throw fail('No configured users available for demo seed', 400);
  }

  const seededUsers = seedDemoSeasonPicks(data, season, users);
  saveDb(data);
  appendImportAudit({
    source: 'demo',
    action: 'seed-season-picks',
    season,
    round: null,
    changedRows: {
      season_predictions: seededUsers.length
    },
    details: {
      users: seededUsers
    }
  });
  res.json({ ok: true, season, seededUsers });
});

app.post('/api/demo/seed', (req, res) => {
  assertDemoEndpointsAllowed();
  const roundsRaw = req.body?.rounds;
  const rounds = roundsRaw === undefined || roundsRaw === null ? 8 : toInt(roundsRaw);
  if (!rounds || rounds < 1 || rounds > 24) {
    throw fail('rounds must be between 1 and 24');
  }

  seedDemoData(rounds);
  appendImportAudit({
    source: 'demo',
    action: 'seed-round-data',
    season: 2026,
    round: null,
    changedRows: {
      rounds
    }
  });
  res.json({ ok: true, rounds });
});

app.get('/health', (req, res) => {
  const ready = fs.existsSync(DB_PATH) && fs.existsSync(path.join(ROOT_DIR, 'config.json'));
  const storage = getStorageSafetyStatus();
  res.status(ready ? 200 : 503).json({
    ok: ready,
    uptimeSec: Math.round(process.uptime()),
    dbPath: DB_PATH,
    configPath: path.join(ROOT_DIR, 'config.json'),
    storage: {
      dataDir: storage.dataDir,
      likelyEphemeralOnRailway: storage.likelyEphemeralOnRailway,
      usesRecommendedVolumePath: storage.usesRecommendedVolumePath
    }
  });
});

app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal server error';

  console.error('[ERROR]', req.method, req.originalUrl, message);

  if (req.path.startsWith('/api/') || req.path === '/health') {
    res.status(status).json({ error: message });
    return;
  }

  res.status(status).send(message);
});

logStorageSafetyWarningIfNeeded();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`F1 predictions app running on http://localhost:${PORT}`);
});
