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

function renderDriverStats(rows) {
  if (!driverStats) return;
  const items = rows.map((r, idx) => `
    <li class="standing-item team-tone-card" style="${teamToneVars(r.team)}">
      <span class="standing-rank">${idx + 1}</span>
      <div class="standing-main">
        <div class="standing-name team-tone-text" style="${teamToneVars(r.team)}">${r.driverName}</div>
        <div class="standing-sub">${logoFor(r.team)}${r.team}</div>
      </div>
      <div class="standing-points">${r.picks}<span>picks</span></div>
    </li>
  `).join('');

  driverStats.innerHTML = `
    <div class="standings-board stats-board-single">
      <section class="standings-panel">
        <header class="standings-header">
          <h3>Driver Pick Frequency</h3>
          <span class="chip">All drivers</span>
        </header>
        <ol class="standings-list">${items}</ol>
      </section>
    </div>
  `;
}

function renderMostPickedWinners(rows) {
  if (!mostPickedWinners) return;
  const items = rows.map((r, idx) => `
    <li class="standing-item team-tone-card" style="${teamToneVars(r.team)}">
      <span class="standing-rank">${idx + 1}</span>
      <div class="standing-main">
        <div class="standing-name team-tone-text" style="${teamToneVars(r.team)}">${r.driverName}</div>
        <div class="standing-sub">${logoFor(r.team)}${r.team}</div>
      </div>
      <div class="standing-points">${r.picks}<span>P1 picks</span></div>
    </li>
  `).join('');

  mostPickedWinners.innerHTML = `
    <div class="standings-board stats-board-single" style="margin-top:12px;">
      <section class="standings-panel">
        <header class="standings-header">
          <h3>Most Picked Winners</h3>
          <span class="chip">Top 5</span>
        </header>
        <ol class="standings-list">${items}</ol>
      </section>
    </div>
  `;
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
    p1: 'P1',
    p2: 'P2',
    p3: 'P3',
    pole: 'Pole Position',
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
  const sideBets = picks.sideBets || {};
  const points = userRow.points || {};
  const topLine = [
    pickChip('P1', driverName(nameMap, picks.p1)),
    pickChip('P2', driverName(nameMap, picks.p2)),
    pickChip('P3', driverName(nameMap, picks.p3))
  ].join('');
  const supportLine = [
    pickChip('Pole', driverName(nameMap, picks.pole)),
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
        <span>Picks ${points.p1} · ${points.p2} · ${points.p3} · Pole ${points.pole} · FL ${points.fastestLap} · WC ${points.wildcard || 0}</span>
        <span>Side bets ${points.sideBets || 0} pts · Stable ${points.sideBetStable || 0} · Chaos ${points.sideBetChaos || 0}</span>
      </div>
      <div class="round-pick-strip">${topLine}</div>
      <div class="round-pick-strip round-pick-strip-secondary">${supportLine}</div>
      <div class="round-user-flags">
        <span class="chip">${(userRow.accuracy * 100).toFixed(1)}% accuracy</span>
        <span class="chip ${userRow.podium_exact ? 'red' : ''}">${userRow.podium_exact ? 'Podium exact' : 'No podium exact'}</span>
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
  const actualPodium = actual.p1
    ? `${driverName(nameMap, actual.p1)} / ${driverName(nameMap, actual.p2)} / ${driverName(nameMap, actual.p3)}`
    : 'No official results yet';
  const actualQuali = actual.pole ? driverName(nameMap, actual.pole) : 'No pole data yet';
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
            <span class="round-section-label">Actual podium</span>
            <strong>${actualPodium}</strong>
          </div>
          <div class="round-actual-item">
            <span class="round-section-label">Pole</span>
            <strong>${actualQuali}</strong>
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
  renderMostPickedWinners(stats.mostPickedWinners);

  const drivers = await fetchJson('/api/drivers');
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
