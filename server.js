import express from 'express';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const MAX_DB_BACKUPS = 25;
const SCHEDULE_PATH = path.join(DATA_DIR, 'schedule_2026.json');
const GRID_PATH = path.join(DATA_DIR, 'current_grid.json');

const DATA_SOURCES = {
  drivers: 'https://raw.githubusercontent.com/muharsyad/formula-one-datasets/main/drivers.csv',
  races: 'https://raw.githubusercontent.com/muharsyad/formula-one-datasets/main/races.csv',
  qualifying: 'https://raw.githubusercontent.com/muharsyad/formula-one-datasets/main/qualifying_results.csv',
  results: 'https://raw.githubusercontent.com/muharsyad/formula-one-datasets/main/race_results.csv'
};

app.use(express.json({ limit: '1mb' }));
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
        fastestLapRank: fastest
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
        lock_field: race.round % 2 === 0 ? 'p1' : 'pole'
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
    race_results,
    race_actuals,
    predictions,
    season_predictions
  };

  saveDb(db);
}

function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    return {
      drivers: [],
      races: [],
      qualifying_results: [],
      race_results: [],
      race_actuals: [],
      predictions: [],
      season_predictions: []
    };
  }
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  const data = JSON.parse(raw);
  if (!data.season_predictions) data.season_predictions = [];
  for (const pred of data.predictions || []) {
    if (!('wildcard_text' in pred)) pred.wildcard_text = '';
    if (!('lock_field' in pred)) pred.lock_field = null;
    if (!('score_lock' in pred)) pred.score_lock = 0;
    if (!('podium_exact' in pred)) pred.podium_exact = 0;
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
  }
  return data;
}

function saveDb(data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, 'db-' + ts + '.json');
    fs.copyFileSync(DB_PATH, backupPath);

    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(name => /^db-.*\.json$/.test(name))
      .sort();

    while (backups.length > MAX_DB_BACKUPS) {
      const oldest = backups.shift();
      fs.unlinkSync(path.join(BACKUP_DIR, oldest));
    }
  }

  const tmpPath = DB_PATH + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, DB_PATH);
}

function loadSchedule() {
  if (!fs.existsSync(SCHEDULE_PATH)) return [];
  return JSON.parse(fs.readFileSync(SCHEDULE_PATH, 'utf8'));
}

function loadCurrentGrid() {
  if (!fs.existsSync(GRID_PATH)) return [];
  return JSON.parse(fs.readFileSync(GRID_PATH, 'utf8'));
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

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${url} (${res.statusCode})`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlink(destPath, () => reject(err));
    });
  });
}

function parseCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    skip_records_with_error: true,
    bom: true,
    trim: true
  });
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

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function resolveGridDrivers(data) {
  const grid = loadCurrentGrid();
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

    if (!driverId) driverId = `name:${slugify(entry.driverName)}`;

    return {
      driverId,
      driverName: entry.driverName,
      team: entry.team
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

    return {
      season: race.season,
      round: race.round,
      pole_driver_id: pole?.driverId || null,
      p1_driver_id: p1?.driverId || null,
      p2_driver_id: p2?.driverId || null,
      p3_driver_id: p3?.driverId || null,
      fastest_lap_driver_id: fastest?.driverId || null,
      updated_at: now
    };
  });

  updateAllPredictionScores(data);
}

function updateAllPredictionScores(data) {
  const { wildcardRule } = loadConfig();
  const now = new Date().toISOString();

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
    if (pred.lock_field) {
      const lockMap = {
        p1: score_p1,
        p2: score_p2,
        p3: score_p3,
        pole: score_pole,
        fastestLap: score_fastest_lap
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
    pred.score_total = score_p1 + score_p2 + score_p3 + score_pole + score_fastest_lap + score_wildcard + score_lock;
    pred.updated_at = now;
  }
}

async function downloadAndImport() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const paths = {
    drivers: path.join(DATA_DIR, 'drivers.csv'),
    races: path.join(DATA_DIR, 'races.csv'),
    qualifying: path.join(DATA_DIR, 'qualifying_results.csv'),
    results: path.join(DATA_DIR, 'race_results.csv')
  };

  await downloadFile(DATA_SOURCES.drivers, paths.drivers);
  await downloadFile(DATA_SOURCES.races, paths.races);
  await downloadFile(DATA_SOURCES.qualifying, paths.qualifying);
  await downloadFile(DATA_SOURCES.results, paths.results);

  const drivers = parseCsv(paths.drivers);
  const races = parseCsv(paths.races);
  const qualifying = parseCsv(paths.qualifying);
  const results = parseCsv(paths.results);

  const data = loadDb();
  data.drivers = drivers.map(d => ({
    driverId: d.driverId,
    driverName: `${d.givenName} ${d.familyName}`,
    code: d.code || null,
    nationality: d.nationality || null
  }));

  data.races = races.map(r => ({
    season: toInt(r.season),
    round: toInt(r.round),
    raceName: r.raceName,
    date: r.date
  }));

  data.qualifying_results = qualifying.map(q => ({
    season: toInt(q.season),
    round: toInt(q.round),
    driverId: q.driverId,
    position: toInt(q.position)
  }));

  data.race_results = results.map(rr => ({
    season: toInt(rr.season),
    round: toInt(rr.round),
    driverId: rr.driverId,
    position: toInt(rr.position),
    points: toFloat(rr.points),
    fastestLapRank: toInt(rr.fastestLapRank)
  }));

  const grid = resolveGridDrivers(data);
  normalizePredictionIds(data, grid);

  rebuildActualsAndScores(data);
  saveDb(data);
}

function getSeasonSchedule(season) {
  const schedule = loadSchedule();
  return schedule.filter(r => r.season === season).sort((a, b) => a.round - b.round);
}

function getSeasonStandings(data, season) {
  const results = data.race_results.filter(r => r.season === season);
  const grid = resolveGridDrivers(data);

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

app.get('/api/config', (req, res) => {
  const cfg = loadConfig();
  res.json({ users: cfg.users.map(u => u.name), wildcardRule: cfg.wildcardRule });
});

app.get('/api/seasons', (req, res) => {
  res.json([2026]);
});

app.get('/api/races', (req, res) => {
  const season = requireSeason(req.query.season);
  const rows = getSeasonSchedule(season);
  res.json(rows);
});

app.get('/api/drivers', (req, res) => {
  const data = loadDb();
  const rows = resolveGridDrivers(data)
    .sort((a, b) => a.team.localeCompare(b.team) || a.driverName.localeCompare(b.driverName));
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
  pred.updated_at = now;

  updateAllPredictionScores(data);
  saveDb(data);
  res.json({ ok: true });
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

  const data = loadDb();
  const results = data.race_results.filter(r => r.season === season);
  const qual = data.qualifying_results.filter(q => q.season === season);
  const races = data.races.filter(r => r.season === season).sort((a, b) => b.round - a.round);
  const recentRounds = races.slice(0, 5).map(r => r.round);

  const grid = resolveGridDrivers(data);

  const stats = grid.map(d => {
    const driverResults = results.filter(r => r.driverId === d.driverId);
    const points = driverResults.reduce((sum, r) => sum + (r.points || 0), 0);
    const wins = driverResults.filter(r => r.position === 1).length;
    const podiums = driverResults.filter(r => r.position !== null && r.position <= 3).length;
    const fastest_laps = driverResults.filter(r => r.fastestLapRank === 1).length;
    const positions = driverResults.map(r => r.position).filter(v => v !== null && v !== undefined);
    const avg_finish = positions.length ? positions.reduce((a, b) => a + b, 0) / positions.length : null;

    const driverQual = qual.filter(q => q.driverId === d.driverId);
    const poles = driverQual.filter(q => q.position === 1).length;
    const avg_quali = driverQual.length
      ? driverQual.reduce((sum, q) => sum + (q.position || 0), 0) / driverQual.length
      : null;

    const last5Rows = driverResults
      .filter(r => recentRounds.includes(r.round))
      .sort((a, b) => b.round - a.round);
    const last5Positions = last5Rows.map(r => r.position).filter(v => v !== null && v !== undefined);
    const last5Avg = last5Positions.length
      ? last5Positions.reduce((a, b) => a + b, 0) / last5Positions.length
      : null;
    const last5Points = last5Rows.reduce((sum, r) => sum + (r.points || 0), 0);

    return {
      driverId: d.driverId,
      driverName: d.driverName,
      team: d.team,
      points,
      wins,
      podiums,
      poles,
      fastest_laps,
      avg_finish,
      avg_quali,
      form: {
        positions: last5Positions,
        avg_finish: last5Avg,
        points: last5Points
      }
    };
  });

  res.json(stats);
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

app.post('/api/season/picks', (req, res) => {
  const { user: userRaw, season: seasonRaw, picks, pin } = req.body || {};
  requireObject(picks, 'picks required');

  const cfg = loadConfig();
  const user = requireKnownUser(cfg, userRaw, pin);
  const season = requireSeason(seasonRaw);

  const data = loadDb();
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
  res.json({ ok: true });
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
          wildcardText: pred.wildcard_text || ''
        },
        points: {
          p1: pred.score_p1 || 0,
          p2: pred.score_p2 || 0,
          p3: pred.score_p3 || 0,
          pole: pred.score_pole || 0,
          fastestLap: pred.score_fastest_lap || 0,
          lock: pred.score_lock || 0,
          wildcard: pred.score_wildcard || 0,
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
        fastestLap: actual.fastest_lap_driver_id
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

    return {
      user,
      total,
      avg,
      bestStreak,
      currentStreak,
      lockRate,
      consistency,
      clutch
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

  const drivers = resolveGridDrivers(data);
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

app.post('/api/update-data', async (req, res, next) => {
  try {
    await downloadAndImport();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post('/api/demo/seed', (req, res) => {
  const roundsRaw = req.body?.rounds;
  const rounds = roundsRaw === undefined || roundsRaw === null ? 8 : toInt(roundsRaw);
  if (!rounds || rounds < 1 || rounds > 24) {
    throw fail('rounds must be between 1 and 24');
  }

  seedDemoData(rounds);
  res.json({ ok: true, rounds });
});

app.get('/health', (req, res) => {
  const ready = fs.existsSync(DB_PATH) && fs.existsSync(path.join(ROOT_DIR, 'config.json'));
  res.status(ready ? 200 : 503).json({
    ok: ready,
    uptimeSec: Math.round(process.uptime()),
    dbPath: DB_PATH,
    configPath: path.join(ROOT_DIR, 'config.json')
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`F1 predictions app running on http://localhost:${PORT}`);
});
