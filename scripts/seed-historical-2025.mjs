import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_PATH = path.join(ROOT, 'data', 'db.json');
const CONFIG_PATH = path.join(ROOT, 'config.json');

function seededRandom(seed = 20250210) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = s * 16807 % 2147483647) / 2147483647;
}

const rand = seededRandom(20250210);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sortByRound(a, b) {
  return Number(a.round) - Number(b.round);
}

function pickWithChance(actualId, candidates, hitChance, usedSet) {
  const cleanCandidates = candidates.filter(Boolean);

  if (actualId && !usedSet.has(actualId) && rand() < hitChance) {
    usedSet.add(actualId);
    return actualId;
  }

  const shuffled = cleanCandidates
    .map((id) => ({ id, roll: rand() }))
    .sort((a, b) => a.roll - b.roll)
    .map((row) => row.id);

  for (const id of shuffled) {
    if (!usedSet.has(id) && id !== actualId) {
      usedSet.add(id);
      return id;
    }
  }

  for (const id of shuffled) {
    if (!usedSet.has(id)) {
      usedSet.add(id);
      return id;
    }
  }

  return actualId || cleanCandidates[0] || null;
}

function scorePrediction(pred, actual, raceResultsByRound, wildcardRule = 'top10') {
  let scoreP1 = actual?.p1_driver_id && pred.p1_driver_id === actual.p1_driver_id ? 1 : 0;
  let scoreP2 = actual?.p2_driver_id && pred.p2_driver_id === actual.p2_driver_id ? 1 : 0;
  let scoreP3 = actual?.p3_driver_id && pred.p3_driver_id === actual.p3_driver_id ? 1 : 0;
  const scorePole = actual?.pole_driver_id && pred.pole_driver_id === actual.pole_driver_id ? 1 : 0;
  const scoreFastest = actual?.fastest_lap_driver_id && pred.fastest_lap_driver_id === actual.fastest_lap_driver_id ? 1 : 0;

  const podiumExact = scoreP1 && scoreP2 && scoreP3 ? 1 : 0;
  if (podiumExact) {
    scoreP1 = 2;
    scoreP2 = 2;
    scoreP3 = 2;
  }

  let scoreWildcard = 0;
  if (pred.wildcard_driver_id && wildcardRule === 'top10') {
    const raceRows = raceResultsByRound.get(pred.round) || [];
    const row = raceRows.find((r) => r.driverId === pred.wildcard_driver_id);
    if (row && row.position !== null && row.position !== undefined && Number(row.position) <= 10) {
      scoreWildcard = 1;
    }
  }

  const lockMap = {
    p1: scoreP1,
    p2: scoreP2,
    p3: scoreP3,
    pole: scorePole,
    fastestLap: scoreFastest
  };
  const scoreLock = pred.lock_field && lockMap[pred.lock_field] > 0 ? 1 : 0;

  return {
    score_p1: scoreP1,
    score_p2: scoreP2,
    score_p3: scoreP3,
    score_pole: scorePole,
    score_fastest_lap: scoreFastest,
    score_wildcard: scoreWildcard,
    score_lock: scoreLock,
    podium_exact: podiumExact,
    score_total: scoreP1 + scoreP2 + scoreP3 + scorePole + scoreFastest + scoreWildcard + scoreLock
  };
}

function main() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Missing db file: ${DB_PATH}`);
  }

  const db = readJson(DB_PATH);
  const cfg = fs.existsSync(CONFIG_PATH) ? readJson(CONFIG_PATH) : { users: [] };

  const users = (cfg.users || [])
    .map((u) => (typeof u === 'string' ? u : u?.name))
    .filter(Boolean)
    .filter((name) => ['Harrison', 'Quin'].includes(name));

  const historicalUsers = users.length ? users : ['Harrison', 'Quin'];

  const season = 2025;
  const actuals = (db.race_actuals || [])
    .filter((row) => Number(row.season) === season)
    .sort(sortByRound);

  if (!actuals.length) {
    throw new Error('No 2025 race actuals found.');
  }

  const qualByRound = new Map();
  for (const row of db.qualifying_results || []) {
    if (Number(row.season) !== season) continue;
    if (!qualByRound.has(row.round)) qualByRound.set(row.round, []);
    qualByRound.get(row.round).push(row);
  }
  for (const [round, rows] of qualByRound.entries()) {
    qualByRound.set(round, rows
      .filter((r) => r.position !== null && r.position !== undefined)
      .sort((a, b) => Number(a.position) - Number(b.position)));
  }

  const raceByRound = new Map();
  for (const row of db.race_results || []) {
    if (Number(row.season) !== season) continue;
    if (!raceByRound.has(row.round)) raceByRound.set(row.round, []);
    raceByRound.get(row.round).push(row);
  }
  for (const [round, rows] of raceByRound.entries()) {
    raceByRound.set(round, rows
      .filter((r) => r.position !== null && r.position !== undefined)
      .sort((a, b) => Number(a.position) - Number(b.position)));
  }

  db.predictions = (db.predictions || []).filter(
    (p) => !(Number(p.season) === season && historicalUsers.includes(p.user))
  );

  let nextId = db.predictions.length
    ? Math.max(...db.predictions.map((p) => Number(p.id) || 0)) + 1
    : 1;

  const profiles = {
    Harrison: { p1: 0.62, p2: 0.54, p3: 0.48, pole: 0.57, fastest: 0.42, wildcard: 0.66 },
    Quin: { p1: 0.56, p2: 0.5, p3: 0.43, pole: 0.51, fastest: 0.37, wildcard: 0.61 }
  };

  const lockFields = ['p1', 'pole', 'fastestLap'];
  const now = new Date().toISOString();
  let inserted = 0;

  for (const actual of actuals) {
    const round = Number(actual.round);
    const qualRows = qualByRound.get(round) || [];
    const raceRows = raceByRound.get(round) || [];

    const qualCandidates = qualRows.map((r) => r.driverId).filter(Boolean);
    const raceCandidates = raceRows.map((r) => r.driverId).filter(Boolean);
    const topRaceCandidates = raceRows.slice(0, 10).map((r) => r.driverId).filter(Boolean);

    for (const user of historicalUsers) {
      const profile = profiles[user] || profiles.Harrison;
      const usedPodium = new Set();

      const p1 = pickWithChance(actual.p1_driver_id, [actual.p2_driver_id, actual.p3_driver_id, ...topRaceCandidates], profile.p1, usedPodium);
      const p2 = pickWithChance(actual.p2_driver_id, [actual.p1_driver_id, actual.p3_driver_id, ...topRaceCandidates], profile.p2, usedPodium);
      const p3 = pickWithChance(actual.p3_driver_id, [actual.p1_driver_id, actual.p2_driver_id, ...topRaceCandidates], profile.p3, usedPodium);

      const pole = pickWithChance(actual.pole_driver_id, [actual.p1_driver_id, ...qualCandidates], profile.pole, new Set());
      const fastest = pickWithChance(actual.fastest_lap_driver_id, [actual.p1_driver_id, actual.p2_driver_id, ...topRaceCandidates], profile.fastest, new Set());

      const wildcardPool = [...topRaceCandidates, ...raceCandidates].filter(Boolean);
      const wildcardHit = rand() < profile.wildcard;
      let wildcardDriver = null;

      if (wildcardPool.length) {
        if (wildcardHit) {
          wildcardDriver = wildcardPool[Math.floor(rand() * Math.min(10, wildcardPool.length))] || null;
        } else {
          const offTop10 = raceCandidates.filter((id) => {
            const row = raceRows.find((r) => r.driverId === id);
            return row && Number(row.position) > 10;
          });
          wildcardDriver = (offTop10.length ? offTop10 : wildcardPool)[Math.floor(rand() * (offTop10.length ? offTop10.length : wildcardPool.length))] || null;
        }
      }

      const predBase = {
        id: nextId,
        user,
        season,
        round,
        p1_driver_id: p1,
        p2_driver_id: p2,
        p3_driver_id: p3,
        pole_driver_id: pole,
        fastest_lap_driver_id: fastest,
        wildcard_driver_id: wildcardDriver,
        wildcard_text: `Historical ${season}`,
        lock_field: lockFields[(round + (user === 'Quin' ? 1 : 0)) % lockFields.length]
      };

      const scores = scorePrediction(predBase, actual, raceByRound, 'top10');

      db.predictions.push({
        ...predBase,
        ...scores,
        created_at: now,
        updated_at: now
      });

      nextId += 1;
      inserted += 1;
    }
  }

  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  console.log(`Inserted ${inserted} permanent 2025 predictions for ${historicalUsers.join(', ')}.`);
}

main();
