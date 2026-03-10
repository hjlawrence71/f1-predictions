import { teamToneVars, teamLogoPath } from './team-colors.js';
const raceSelect = document.getElementById('raceSelect');
const goRoundBtn = document.getElementById('goRoundBtn');
const driverStats = document.getElementById('driverStats');
const mostPickedWinners = document.getElementById('mostPickedWinners');
const explorerRoundDetails = document.getElementById('explorerRoundDetails');

const query = new URLSearchParams(window.location.search);
const preselectedRound = Number(query.get('round') || 0);
const preselectedSeason = Number(query.get('season') || 0);
const seasonSelect = document.getElementById('seasonSelect');

let perRoundCache = [];
let nameMapCache = new Map();

async function fetchJson(url, options = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || `Request failed: ${res.status}`);
      }

      return res.json();
    } catch (err) {
      clearTimeout(timeout);
      if (attempt >= retries) {
        const message = err?.name === 'AbortError'
          ? `Request timeout for ${url}`
          : (err?.message || `Failed to fetch ${url}`);
        throw new Error(message);
      }
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }

  throw new Error(`Failed to fetch ${url}`);
}

function logoFor(team) {
  return `<img class="logo" src="${teamLogoPath(team)}" alt="" onerror="this.remove()">`;
}

function selectedSeason() {
  const picked = Number(seasonSelect?.value || preselectedSeason || 2026);
  return Number.isFinite(picked) && picked > 0 ? picked : 2026;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCompactHistoryCard(target, config) {
  if (!target) return;
  const rows = Array.isArray(config.rows) ? config.rows : [];
  const topRows = rows.slice(0, 3);
  const units = config.units || 'picks';

  if (!rows.length) {
    target.innerHTML = `
      <article class="history-picks-card">
        <header class="history-picks-head">
          <h3>${escapeHtml(config.title)}</h3>
          <span class="chip">${escapeHtml(config.subtitle || 'Top 3')}</span>
        </header>
        <div class="muted">No picks yet.</div>
      </article>
    `;
    return;
  }

  const rowHtml = (row, idx) => `
    <li class="history-picks-row">
      <span class="history-picks-rank">#${idx + 1}</span>
      <div class="history-picks-driver">
        <strong class="team-tone-text" style="${teamToneVars(row.team)}">${escapeHtml(row.driverName)}</strong>
        <span class="history-picks-team">${logoFor(row.team)}${escapeHtml(row.team)}</span>
      </div>
      <span class="history-picks-value">${Number(row.picks || 0)} ${escapeHtml(units)}</span>
    </li>
  `;

  target.innerHTML = `
    <article class="history-picks-card">
      <header class="history-picks-head">
        <h3>${escapeHtml(config.title)}</h3>
        <span class="chip">${escapeHtml(config.subtitle || 'Top 3')}</span>
      </header>

      <ol class="history-picks-toplist">
        ${topRows.map((row, idx) => rowHtml(row, idx)).join('')}
      </ol>

      <details class="history-picks-expand">
        <summary>Expand full grid</summary>
        <ol class="history-picks-fulllist">
          ${rows.map((row, idx) => rowHtml(row, idx)).join('')}
        </ol>
      </details>
    </article>
  `;
}

function renderDriverStats(rows) {
  renderCompactHistoryCard(driverStats, {
    title: 'Most Picked Drivers',
    subtitle: 'Top 3 overall',
    rows,
    units: 'picks'
  });
}

function renderMostPickedWinners(rows) {
  renderCompactHistoryCard(mostPickedWinners, {
    title: 'Most Picked Winners',
    subtitle: 'Top 3 P1 calls',
    rows,
    units: 'P1'
  });
}

function driverNameMap(stats) {
  const map = new Map();
  stats.forEach(d => map.set(d.driverId, { name: d.driverName, team: d.team }));
  return map;
}

function shortDate(iso) {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function driverName(nameMap, id) {
  if (!id) return '—';
  return nameMap.get(id)?.name || id;
}

function yesNoLabel(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return '—';
}

function lockFieldLabel(value) {
  const map = {
    qualP1: 'Quali P1',
    qualP2: 'Quali P2',
    qualP3: 'Quali P3',
    qualP4: 'Quali P4',
    qualP5: 'Quali P5',
    raceP1: 'Race P1',
    raceP2: 'Race P2',
    raceP3: 'Race P3',
    raceP4: 'Race P4',
    raceP5: 'Race P5',
    p1: 'Race P1',
    p2: 'Race P2',
    p3: 'Race P3',
    pole: 'Quali P1',
    fastestLap: 'Fastest Lap',
    sidebetPoleConverts: 'Pole Converts',
    sidebetFrontRowWinner: 'Front Row Winner',
    sidebetAnyDnf: 'Any DNF',
    sidebetRedFlag: 'Red Flag',
    sidebetBigMover: 'Big Mover',
    sidebetOther7Podium: 'Other 7 Podium'
  };
  const key = String(value || '').trim();
  if (!key) return '—';
  return map[key] || key;
}

function pickChip(label, value, tone = '') {
  const displayValue = value === null || value === undefined || value === '' ? '—' : value;
  return `
    <span class="round-pick-chip ${tone}">
      <span class="round-pick-label">${label}</span>
      <span class="round-pick-value">${displayValue}</span>
    </span>
  `;
}

function yesNoChip(label, value) {
  const normalized = yesNoLabel(value);
  const tone = normalized === 'Yes' ? 'is-yes' : normalized === 'No' ? 'is-no' : '';
  return pickChip(label, normalized, tone);
}

function renderUserRoundCard(userRow, nameMap) {
  if (userRow.missing) {
    return `
      <div class="round-user round-user-empty">
        <div class="round-user-head">
          <strong>${userRow.user}</strong>
          <span class="chip">Waiting</span>
        </div>
        <div class="muted">No picks saved yet.</div>
      </div>
    `;
  }

  const picks = userRow.picks || {};
  const qualPicks = picks.qual || {};
  const racePicks = picks.race || {};
  const sideBets = picks.sideBets || {};
  const points = userRow.points || {};
  const qualiLine = [
    pickChip('Q1', driverName(nameMap, qualPicks.p1)),
    pickChip('Q2', driverName(nameMap, qualPicks.p2)),
    pickChip('Q3', driverName(nameMap, qualPicks.p3)),
    pickChip('Q4', driverName(nameMap, qualPicks.p4)),
    pickChip('Q5', driverName(nameMap, qualPicks.p5))
  ].join('');
  const raceLine = [
    pickChip('R1', driverName(nameMap, racePicks.p1)),
    pickChip('R2', driverName(nameMap, racePicks.p2)),
    pickChip('R3', driverName(nameMap, racePicks.p3)),
    pickChip('R4', driverName(nameMap, racePicks.p4)),
    pickChip('R5', driverName(nameMap, racePicks.p5))
  ].join('');
  const supportLine = [
    pickChip('FL', driverName(nameMap, picks.fastestLap)),
    pickChip('Lock', lockFieldLabel(userRow.lock)),
    pickChip('Wildcard', picks.wildcardText || '—')
  ].join('');
  const sideBetLine = [
    yesNoChip('Pole converts', sideBets.poleConverts),
    yesNoChip('Front row winner', sideBets.frontRowWinner),
    yesNoChip('Any DNF', sideBets.anyDnf),
    yesNoChip('Red flag', sideBets.redFlag),
    yesNoChip('Big mover', sideBets.bigMover),
    yesNoChip('Other 7 podium', sideBets.other7Podium)
  ].join('');

  return `
    <div class="round-user">
      <div class="round-user-head">
        <strong>${userRow.user}</strong>
        <span class="chip ${points.total > 0 ? 'dark' : ''}">${points.total} pts</span>
      </div>
      <div class="round-user-metrics">
        <span>Quali ${points.qualTotal || 0} · Race ${points.raceTotal || 0} · Podium bonus ${points.podiumBonus || 0}</span>
        <span>FL ${points.fastestLap || 0} · WC ${points.wildcard || 0}</span>
        <span>Side bets ${points.sideBets || 0} pts · Stable ${points.sideBetStable || 0} · Chaos ${points.sideBetChaos || 0}</span>
      </div>
      <div class="round-section-label">Qualifying picks</div>
      <div class="round-pick-strip">${qualiLine}</div>
      <div class="round-section-label">Race picks</div>
      <div class="round-pick-strip">${raceLine}</div>
      <div class="round-pick-strip round-pick-strip-secondary">${supportLine}</div>
      <div class="round-user-flags">
        <span class="chip">${(userRow.accuracy * 100).toFixed(1)}% accuracy</span>
        <span class="chip ${userRow.podium_exact ? 'red' : ''}">${
          userRow.podium_exact ? 'Podium exact' : userRow.podium_match_count === 3 ? 'Podium 3/3' : userRow.podium_match_count === 2 ? 'Podium 2/3' : 'No podium bonus'
        }</span>
        <span class="chip">Lock bonus ${points.lock || 0}</span>
        <span class="chip ${userRow.wildcardResult === true ? 'dark' : userRow.wildcardResult === false ? 'red' : ''}">${
          userRow.wildcardResult === true ? 'Wildcard hit' : userRow.wildcardResult === false ? 'Wildcard miss' : 'Wildcard pending'
        }</span>
      </div>
      <div class="round-sidebets-block">
        <div class="round-section-label">Y/N picks</div>
        <div class="round-pick-strip round-pick-strip-secondary">${sideBetLine}</div>
      </div>
    </div>
  `;
}

function renderRoundDetails(roundData, nameMap) {
  const actual = roundData.actuals || {};
  const actualRaceTop5 = actual.race?.p1
    ? [actual.race.p1, actual.race.p2, actual.race.p3, actual.race.p4, actual.race.p5].map((id) => driverName(nameMap, id)).join(' / ')
    : 'No official results yet';
  const actualQualiTop5 = actual.qual?.p1
    ? [actual.qual.p1, actual.qual.p2, actual.qual.p3, actual.qual.p4, actual.qual.p5].map((id) => driverName(nameMap, id)).join(' / ')
    : 'No qualifying data yet';
  const actualPole = actual.pole ? driverName(nameMap, actual.pole) : 'No pole data yet';
  const actualFastest = actual.fastestLap ? driverName(nameMap, actual.fastestLap) : 'No fastest lap data yet';
  const actualSide = actual.sideBets || {};
  const actualSideSummary = [
    yesNoChip('Pole converts', actualSide.poleConverts),
    yesNoChip('Front row winner', actualSide.frontRowWinner),
    yesNoChip('Any DNF', actualSide.anyDnf),
    yesNoChip('Red flag', actualSide.redFlag),
    yesNoChip('Big mover', actualSide.bigMover),
    yesNoChip('Other 7 podium', actualSide.other7Podium)
  ].join('');

  const usersHtml = roundData.users.map((row) => renderUserRoundCard(row, nameMap)).join('');

  return `
    <div class="round-card round-focus-card">
      <header>
        <div>
          <strong>R${roundData.round}</strong> · ${roundData.raceName}
          <div class="muted">${shortDate(roundData.dates.start)}${roundData.dates.end ? ` to ${shortDate(roundData.dates.end)}` : ''}</div>
        </div>
        <div class="legend">
          <span><span class="legend-dot" style="background:#e10600;"></span> Bonus</span>
          <span><span class="legend-dot" style="background:#111111;"></span> Total</span>
        </div>
      </header>
      <div class="round-actuals">
        <div class="round-actuals-grid">
          <div class="round-actual-item">
            <span class="round-section-label">Actual race top 5</span>
            <strong>${actualRaceTop5}</strong>
          </div>
          <div class="round-actual-item">
            <span class="round-section-label">Actual qualifying top 5</span>
            <strong>${actualQualiTop5}</strong>
          </div>
          <div class="round-actual-item">
            <span class="round-section-label">Pole</span>
            <strong>${actualPole}</strong>
          </div>
          <div class="round-actual-item">
            <span class="round-section-label">Fastest lap</span>
            <strong>${actualFastest}</strong>
          </div>
        </div>
        <div class="round-sidebets-block">
          <div class="round-section-label">Y/N outcomes</div>
          <div class="round-pick-strip round-pick-strip-secondary">${actualSideSummary}</div>
        </div>
      </div>
      <div class="round-users">
        ${usersHtml}
      </div>
    </div>
  `;
}

function paintExplorerRoundDetails() {
  if (!explorerRoundDetails) return;
  if (!perRoundCache.length) {
    explorerRoundDetails.textContent = 'No round data yet.';
    return;
  }

  const selectedRoundNum = Number(raceSelect?.value || 0);
  const selectedRound = perRoundCache.find(r => r.round === selectedRoundNum) || perRoundCache[0];
  explorerRoundDetails.innerHTML = renderRoundDetails(selectedRound, nameMapCache);
}

function setupExplorerRoundDetails(perRound, nameMap) {
  perRoundCache = perRound;
  nameMapCache = nameMap;

  if (!perRoundCache.length) {
    if (explorerRoundDetails) explorerRoundDetails.textContent = 'No round data yet.';
    return;
  }

  const latestWithActual = [...perRoundCache].reverse().find(r => r.actuals);
  const selectedNow = Number(raceSelect?.value || 0);
  const fromQuery = preselectedRound && perRoundCache.some(r => r.round === preselectedRound) ? preselectedRound : null;
  const selectedValid = selectedNow && perRoundCache.some(r => r.round === selectedNow) ? selectedNow : null;
  const initialRound = selectedValid || fromQuery || latestWithActual?.round || perRoundCache[0].round;

  if (raceSelect) {
    raceSelect.value = String(initialRound);
  }

  paintExplorerRoundDetails();
}

function goToSelectedWeekend() {
  if (!raceSelect) return;
  const season = selectedSeason();
  const round = raceSelect.value;
  const selected = raceSelect.options[raceSelect.selectedIndex];
  const raceName = selected?.dataset?.raceName || '';
  window.location.href = `/race.html?season=${season}&round=${round}&race=${encodeURIComponent(raceName)}`;
}

async function loadAll() {
  const season = selectedSeason();
  const races = await fetchJson(`/api/races?season=${season}`);

  if (raceSelect) {
    const previouslySelected = Number(raceSelect.value || 0);
    raceSelect.innerHTML = '';

    races.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.round;
      opt.dataset.raceName = r.raceName || '';
      opt.textContent = `${r.raceName} (${shortDate(r.start_date)})`;
      raceSelect.appendChild(opt);
    });

    if (preselectedRound && races.some(r => r.round === preselectedRound)) {
      raceSelect.value = String(preselectedRound);
    } else if (previouslySelected && races.some(r => r.round === previouslySelected)) {
      raceSelect.value = String(previouslySelected);
    }
  }

  const stats = await fetchJson(`/api/weekly/stats?season=${season}`);
  renderDriverStats(stats.pickFrequency);
  renderMostPickedWinners(stats.winnerFrequency || stats.mostPickedWinners || []);

  const drivers = await fetchJson(`/api/drivers?season=${season}`);
  const map = driverNameMap(drivers);
  setupExplorerRoundDetails(stats.perRound, map);
}

if (goRoundBtn) {
  goRoundBtn.addEventListener('click', goToSelectedWeekend);
}

if (raceSelect) {
  raceSelect.addEventListener('change', paintExplorerRoundDetails);
}

if (seasonSelect) {
  seasonSelect.addEventListener('change', () => {
    loadAll().catch(err => {
      console.error(err);
      alert(err.message);
    });
  });
}

loadAll().catch(err => {
  console.error(err);
  alert(err.message);
});
