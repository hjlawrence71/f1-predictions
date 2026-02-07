const updateDataBtn = document.getElementById('updateDataBtn');
const raceSelect = document.getElementById('raceSelect');
const goRoundBtn = document.getElementById('goRoundBtn');
const driverStats = document.getElementById('driverStats');
const mostPickedWinners = document.getElementById('mostPickedWinners');
const explorerRoundDetails = document.getElementById('explorerRoundDetails');

const query = new URLSearchParams(window.location.search);
const preselectedRound = Number(query.get('round') || 0);

let perRoundCache = [];
let nameMapCache = new Map();

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  return res.json();
}

function logoFor(team) {
  const slug = String(team || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `<img class="logo" src="/team-logos/${slug}.png" alt="" onerror="this.remove()">`;
}

function renderDriverStats(rows) {
  const items = rows.map((r, idx) => `
    <li class="standing-item">
      <span class="standing-rank">${idx + 1}</span>
      <div class="standing-main">
        <div class="standing-name">${r.driverName}</div>
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
  const items = rows.map((r, idx) => `
    <li class="standing-item">
      <span class="standing-rank">${idx + 1}</span>
      <div class="standing-main">
        <div class="standing-name">${r.driverName}</div>
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

function renderUserRoundCard(userRow) {
  if (userRow.missing) {
    return `
      <div class="round-user">
        <strong>${userRow.user}</strong>
        <div class="muted">No picks yet.</div>
      </div>
    `;
  }

  return `
    <div class="round-user">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>${userRow.user}</strong>
        <span class="chip ${userRow.points.total > 0 ? 'dark' : ''}">${userRow.points.total} pts</span>
      </div>
      <div class="muted">P1 ${userRow.points.p1} · P2 ${userRow.points.p2} · P3 ${userRow.points.p3} · Pole ${userRow.points.pole} · FL ${userRow.points.fastestLap} · Lock ${userRow.points.lock}</div>
      <div style="display:flex;gap:6px;margin:8px 0;flex-wrap:wrap;">
        <span class="chip ${userRow.podium_exact ? 'red' : ''}">Podium exact</span>
        <span class="chip">${(userRow.accuracy * 100).toFixed(1)}% accuracy</span>
        <span class="chip">Lock: ${userRow.lock || '—'}</span>
      </div>
      <div class="muted">Wildcard: ${userRow.picks.wildcardText || '—'}</div>
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

  const usersHtml = roundData.users.map(renderUserRoundCard).join('');

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
        <div><strong>Actual podium:</strong> ${actualPodium}</div>
        <div><strong>Pole:</strong> ${actualQuali}</div>
        <div><strong>Fastest lap:</strong> ${actualFastest}</div>
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
  const round = raceSelect.value;
  const selected = raceSelect.options[raceSelect.selectedIndex];
  const raceName = selected?.dataset?.raceName || '';
  window.location.href = `/race.html?season=2026&round=${round}&race=${encodeURIComponent(raceName)}`;
}

async function loadAll() {
  const races = await fetchJson('/api/races?season=2026');

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

  const stats = await fetchJson('/api/weekly/stats?season=2026');
  renderDriverStats(stats.pickFrequency);
  renderMostPickedWinners(stats.mostPickedWinners);

  const drivers = await fetchJson('/api/drivers');
  const map = driverNameMap(drivers);
  setupExplorerRoundDetails(stats.perRound, map);
}

async function updateData() {
  if (updateDataBtn) {
    updateDataBtn.disabled = true;
    updateDataBtn.textContent = 'Updating...';
  }

  try {
    await fetchJson('/api/update-data', { method: 'POST' });
    await loadAll();
  } catch (err) {
    alert(err.message);
  } finally {
    if (updateDataBtn) {
      updateDataBtn.disabled = false;
      updateDataBtn.textContent = 'Update data';
    }
  }
}

if (updateDataBtn) {
  updateDataBtn.addEventListener('click', updateData);
}

if (goRoundBtn) {
  goRoundBtn.addEventListener('click', goToSelectedWeekend);
}

if (raceSelect) {
  raceSelect.addEventListener('change', paintExplorerRoundDetails);
}

loadAll().catch(err => {
  console.error(err);
  alert(err.message);
});
