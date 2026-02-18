import { displayTeamName } from './driver-order.js';

const seasonSelect = document.getElementById('projectionSeasonSelect');
const roundSelect = document.getElementById('projectionRoundSelect');
const userSelect = document.getElementById('projectionUserSelect');
const runBtn = document.getElementById('projectionRunBtn');
const statusEl = document.getElementById('projectionStatus');
const raceMetaEl = document.getElementById('projectionRaceMeta');
const raceTableEl = document.getElementById('projectionRaceTable');
const trackSourceEl = document.getElementById('projectionTrackSource');
const trackProfileEl = document.getElementById('projectionTrackProfile');
const pickLikelihoodEl = document.getElementById('projectionPickLikelihood');
const teamOutlookEl = document.getElementById('projectionTeamOutlook');
const driverSelect = document.getElementById('projectionDriverSelect');
const driverBreakdownEl = document.getElementById('projectionDriverBreakdown');
const championshipMetaEl = document.getElementById('projectionChampionshipMeta');
const wdcTableEl = document.getElementById('projectionWdcTable');
const wccTableEl = document.getElementById('projectionWccTable');
const modelVersionEl = document.getElementById('projectionModelVersion');
const modelSpecEl = document.getElementById('projectionModelSpec');

let latestProjection = null;
let racesBySeason = [];

function option(label, value) {
  const el = document.createElement('option');
  el.value = value;
  el.textContent = label;
  return el;
}

function clamp(value, min = 0, max = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function formatNumber(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

function formatPercent(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

function pickDefaultRound(races) {
  if (!Array.isArray(races) || !races.length) return null;

  const now = new Date();
  const todayIso = now.toISOString().slice(0, 10);

  const upcoming = races
    .filter((race) => String(race.start_date || '') >= todayIso)
    .sort((a, b) => Number(a.round) - Number(b.round));

  if (upcoming.length) return Number(upcoming[0].round);
  return Number(races[races.length - 1].round);
}

async function fetchJson(url, options = {}, retries = 2, timeoutMs = 15000) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        const raw = await res.text();
        let message = raw;
        try {
          const parsed = JSON.parse(raw);
          message = parsed?.error || parsed?.message || raw;
        } catch {
          // keep raw
        }
        throw new Error(message || `Request failed (${res.status})`);
      }

      return await res.json();
    } catch (error) {
      clearTimeout(timer);
      if (attempt >= retries) {
        const message = error?.name === 'AbortError'
          ? `Request timed out: ${url}`
          : (error?.message || `Failed to fetch ${url}`);
        throw new Error(message);
      }

      await new Promise((resolve) => setTimeout(resolve, 320 * (attempt + 1)));
    }
  }

  throw new Error(`Failed to fetch ${url}`);
}

function renderRaceTable(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    raceTableEl.innerHTML = '<div class="muted">No projection rows available.</div>';
    return;
  }

  const body = rows.map((row) => {
    const confidence = clamp(row.confidence || 0);
    return `
      <tr>
        <td><span class="position-pill">P${row.projected_position}</span></td>
        <td>
          <div class="proj-driver-cell">
            <strong>${row.driverName}</strong>
            <small>${displayTeamName(row.team)}</small>
          </div>
        </td>
        <td>${formatNumber(row.expected_position, 2)}</td>
        <td>${formatPercent(row.probabilities?.win)}</td>
        <td>${formatPercent(row.probabilities?.podium)}</td>
        <td>${formatPercent(row.probabilities?.top10)}</td>
        <td>${formatPercent(row.probabilities?.pole)}</td>
        <td>${formatNumber(row.expected_points, 2)}</td>
        <td>
          <div class="proj-confidence-track">
            <span style="width:${(confidence * 100).toFixed(1)}%"></span>
          </div>
          <small>${formatPercent(confidence)}</small>
        </td>
      </tr>
    `;
  }).join('');

  raceTableEl.innerHTML = `
    <table class="projection-table">
      <thead>
        <tr>
          <th>Grid</th>
          <th>Driver</th>
          <th>Exp Pos</th>
          <th>Win</th>
          <th>Podium</th>
          <th>Top 10</th>
          <th>Pole</th>
          <th>Exp Pts</th>
          <th>Confidence</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renderTrackProfile(profile) {
  if (!profile) {
    trackProfileEl.innerHTML = '<div class="muted">No track profile loaded.</div>';
    trackSourceEl.textContent = '—';
    return;
  }

  trackSourceEl.textContent = profile.source || 'mapped';

  const metrics = [
    ['High speed', profile.high_speed],
    ['Downforce', profile.downforce],
    ['Traction', profile.traction],
    ['Tyre degradation', profile.degradation],
    ['Braking', profile.braking],
    ['Street circuit', profile.street]
  ];

  const bars = metrics.map(([label, value]) => `
    <div class="track-bar-row">
      <span>${label}</span>
      <div class="track-bar"><i style="width:${(clamp(value) * 100).toFixed(1)}%"></i></div>
      <strong>${formatPercent(value, 0)}</strong>
    </div>
  `).join('');

  const compounds = Object.entries(profile.expected_compounds || {})
    .map(([compound, share]) => `<span class="chip">${compound}: ${formatPercent(share, 0)}</span>`)
    .join('');

  trackProfileEl.innerHTML = `
    <div class="track-bars">${bars}</div>
    <div class="track-compounds">${compounds || '<span class="muted">No expected compound mix</span>'}</div>
  `;
}

function renderPickLikelihood(pick) {
  if (!pick || pick.available === false) {
    const message = pick?.message || 'No user selected.';
    pickLikelihoodEl.innerHTML = `<div class="muted">${message}</div>`;
    return;
  }

  const rows = (pick.categories || []).map((row) => `
    <div class="pick-likelihood-row">
      <span>${row.key}</span>
      <strong>${row.driverName || '—'}</strong>
      <em>${formatPercent(row.probability)}</em>
    </div>
  `).join('');

  pickLikelihoodEl.innerHTML = `
    <div class="pick-likelihood-head">
      <span class="chip dark">${pick.user}</span>
      <span class="chip">Expected points: ${formatNumber(pick.expected_points, 2)}</span>
    </div>
    <div class="pick-likelihood-grid">${rows}</div>
    <div class="pick-likelihood-meta">
      <span>${pick.lock_field ? `Lock: ${pick.lock_field}` : 'Lock: none'}</span>
      <span>Lock hit: ${formatPercent(pick.lock_hit_probability)}</span>
      <span>Podium exact: ${formatPercent(pick.podium_exact_probability)}</span>
    </div>
  `;
}

function renderTeamOutlook(rows) {
  if (!Array.isArray(rows) || !rows.length) {
    teamOutlookEl.innerHTML = '<div class="muted">No team projection available.</div>';
    return;
  }

  teamOutlookEl.innerHTML = rows.map((row) => `
    <div class="team-outlook-row">
      <strong>${displayTeamName(row.team)}</strong>
      <span>Exp pts ${formatNumber(row.avg_expected_points, 2)}</span>
      <span>Win ${formatPercent(row.win_probability)}</span>
      <span>Podium ${formatPercent(row.podium_probability)}</span>
      <span>Top10 drivers ${formatNumber(row.top10_expected_drivers, 2)}</span>
    </div>
  `).join('');
}

function renderChampionshipProjection(payload) {
  const driverRows = payload?.driver_table || [];
  const constructorRows = payload?.constructor_table || [];

  if (!driverRows.length || !constructorRows.length) {
    championshipMetaEl.textContent = 'No championship forecast';
    wdcTableEl.innerHTML = '<div class="muted">No projected WDC rows.</div>';
    wccTableEl.innerHTML = '<div class="muted">No projected WCC rows.</div>';
    return;
  }

  const roundsRemaining = Number(payload?.rounds_remaining || 0);
  const throughRound = Number(payload?.through_round || 0);
  championshipMetaEl.textContent = `Rounds remaining ${roundsRemaining} · through R${throughRound}`;

  const driverBody = driverRows.map((row) => `
    <tr>
      <td><span class="position-pill">P${row.rank}</span></td>
      <td>
        <div class="proj-driver-cell">
          <strong>${row.driverName}</strong>
          <small>${displayTeamName(row.team)}</small>
        </div>
      </td>
      <td>${formatNumber(row.current_points, 1)}</td>
      <td>${formatNumber(row.projected_points_remaining, 1)}</td>
      <td><strong>${formatNumber(row.projected_total_points, 1)}</strong></td>
      <td>${formatNumber(row.gap_to_leader, 1)}</td>
    </tr>
  `).join('');

  const constructorBody = constructorRows.map((row) => `
    <tr>
      <td><span class="position-pill">P${row.rank}</span></td>
      <td><strong>${displayTeamName(row.team)}</strong></td>
      <td>${formatNumber(row.current_points, 1)}</td>
      <td>${formatNumber(row.projected_points_remaining, 1)}</td>
      <td><strong>${formatNumber(row.projected_total_points, 1)}</strong></td>
      <td>${formatNumber(row.gap_to_leader, 1)}</td>
    </tr>
  `).join('');

  wdcTableEl.innerHTML = `
    <table class="projection-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Driver</th>
          <th>Current</th>
          <th>Remaining</th>
          <th>Projected</th>
          <th>Gap</th>
        </tr>
      </thead>
      <tbody>${driverBody}</tbody>
    </table>
  `;

  wccTableEl.innerHTML = `
    <table class="projection-table">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Team</th>
          <th>Current</th>
          <th>Remaining</th>
          <th>Projected</th>
          <th>Gap</th>
        </tr>
      </thead>
      <tbody>${constructorBody}</tbody>
    </table>
  `;
}

function populateDriverSelect(rows) {
  driverSelect.innerHTML = '';
  for (const row of rows || []) {
    driverSelect.appendChild(option(`${row.driverName} · ${displayTeamName(row.team)}`, row.driverId));
  }
}

function renderDriverBreakdown(rows, selectedId) {
  const row = (rows || []).find((item) => item.driverId === selectedId) || null;
  if (!row) {
    driverBreakdownEl.innerHTML = '<div class="muted">Select a driver for metric breakdown.</div>';
    return;
  }

  const metrics = [
    ['Qual pace', row.metrics?.qual_pace],
    ['Race pace', row.metrics?.race_pace],
    ['Track fit', row.metrics?.track_fit],
    ['Tyre fit', row.metrics?.tire_fit],
    ['Strategy fit', row.metrics?.strategy_fit],
    ['Momentum', row.metrics?.momentum],
    ['Form', row.metrics?.form],
    ['Start craft', row.metrics?.start_craft],
    ['Reliability', row.reliability]
  ];

  const bars = metrics.map(([label, value]) => `
    <div class="driver-metric-row">
      <span>${label}</span>
      <div class="driver-metric-track"><i style="width:${(clamp(value) * 100).toFixed(1)}%"></i></div>
      <strong>${formatPercent(value, 0)}</strong>
    </div>
  `).join('');

  driverBreakdownEl.innerHTML = `
    <div class="driver-breakdown-head">
      <strong>${row.driverName}</strong>
      <span>${displayTeamName(row.team)}</span>
      <span class="chip">Rounds seen ${row.rounds_seen || 0}</span>
      <span class="chip">Model confidence ${formatPercent(row.confidence)}</span>
      <span class="chip">Qual score ${formatNumber(row.scores?.qualifying, 3)}</span>
      <span class="chip">Race score ${formatNumber(row.scores?.race, 3)}</span>
    </div>
    <div class="driver-breakdown-bars">${bars}</div>
  `;
}

function renderModelSpec(model) {
  if (!model) {
    modelVersionEl.textContent = '—';
    modelSpecEl.innerHTML = '<div class="muted">No model metadata.</div>';
    return;
  }

  modelVersionEl.textContent = `v${model.version || '—'} · ${model.simulation_runs || 0} runs`;

  const metricLabelOverrides = {
    qual_pace: 'Qualifying pace',
    q3_presence: 'Q3 presence',
    teammate_qual_edge: 'Teammate qualifying edge',
    qualifying_transfer: 'Qualifying transfer',
    strategy_tire_fit: 'Strategy + tyre fit',
    track_fit: 'Track fit',
    tire_fit: 'Tyre fit',
    race_pace: 'Race pace',
    start_craft: 'Start craft',
    reliability: 'Reliability',
    momentum: 'Momentum',
    form: 'Form',
    strategy_fit: 'Strategy fit',
    sample_score: 'Sample confidence',
    coverage: 'Data coverage',
    head_to_head_score: 'Head-to-head score'
  };

  const prettyMetricLabel = (key) => {
    const raw = String(key || '').trim();
    if (!raw) return '—';
    if (metricLabelOverrides[raw]) return metricLabelOverrides[raw];

    return raw
      .split('_')
      .filter(Boolean)
      .map((part) => {
        const lower = part.toLowerCase();
        if (lower === 'q3') return 'Q3';
        if (lower === 'q2') return 'Q2';
        if (lower === 'q1') return 'Q1';
        return part.charAt(0).toUpperCase() + part.slice(1);
      })
      .join(' ');
  };

  const renderWeightBlock = (title, weights) => {
    const rows = Object.entries(weights || {}).map(([key, value]) => `
      <tr>
        <td>${prettyMetricLabel(key)}</td>
        <td>${formatNumber(value, 2)}</td>
      </tr>
    `).join('');

    return `
      <div class="model-weight-block">
        <h4>${title}</h4>
        <table>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  };

  const fallbackItems = (model.fallback_rules || []).map((rule) => `<li>${rule}</li>`).join('');
  const featureRows = Object.entries(model.feature_notes || {}).map(([key, value]) => `
    <tr>
      <td>${prettyMetricLabel(key)}</td>
      <td>${value}</td>
    </tr>
  `).join('');
  modelSpecEl.innerHTML = `
    <div class="model-weights-grid">
      ${renderWeightBlock('Qualifying weights', model.qualifying_weights)}
      ${renderWeightBlock('Race weights', model.race_weights)}
    </div>
    <div class="model-notes-grid">
      <div>
        <h4>Fallback rules</h4>
        <ul class="model-list">${fallbackItems}</ul>
      </div>
      <div>
        <h4>Feature logic</h4>
        <table class="model-feature-table">
          <tbody>${featureRows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function updateRaceMeta(payload) {
  const raceName = payload?.race_name || 'Unknown race';
  const raceDate = payload?.race_date || '—';
  const runs = payload?.simulation?.runs || 0;
  raceMetaEl.textContent = `${raceName} · ${raceDate} · ${runs} sims`;
}

function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value === null || value === undefined || value === '') continue;
    search.set(key, String(value));
  }
  return search.toString();
}

async function fetchProjectionPayload(season, round, user) {
  const primaryQs = queryString({ season, round, user });
  try {
    const payload = await fetchJson(`/api/projections?${primaryQs}`, {}, 2, 45000);
    return { payload, degraded: false, degradedReason: '' };
  } catch (primaryError) {
    const fallbackQs = queryString({ season, round, user, testing: 'off' });
    const payload = await fetchJson(`/api/projections?${fallbackQs}`, {}, 1, 25000);
    return {
      payload,
      degraded: true,
      degradedReason: primaryError?.message || 'Primary projection request failed'
    };
  }
}

async function loadRoundsForSeason(season) {
  racesBySeason = await fetchJson(`/api/races?season=${season}`);
  roundSelect.innerHTML = '';

  for (const race of racesBySeason) {
    roundSelect.appendChild(option(`R${race.round} · ${race.raceName}`, race.round));
  }

  const defaultRound = pickDefaultRound(racesBySeason);
  if (defaultRound) {
    roundSelect.value = String(defaultRound);
  }
}

async function loadBaseControls() {
  const [seasons, config] = await Promise.all([
    fetchJson('/api/seasons'),
    fetchJson('/api/config')
  ]);

  seasonSelect.innerHTML = '';
  for (const season of seasons || []) {
    seasonSelect.appendChild(option(String(season), season));
  }

  if ((seasons || []).includes(2026)) {
    seasonSelect.value = '2026';
  } else if ((seasons || []).length) {
    seasonSelect.value = String(Math.max(...seasons.map(Number)));
  }

  userSelect.innerHTML = '';
  userSelect.appendChild(option('No user filter', ''));
  for (const user of config?.users || []) {
    userSelect.appendChild(option(user, user));
  }

  await loadRoundsForSeason(Number(seasonSelect.value || 2026));
}

async function runProjection() {
  const season = Number(seasonSelect.value || 0);
  const round = Number(roundSelect.value || 0);
  const user = String(userSelect.value || '').trim();

  if (!season || !round) {
    statusEl.textContent = 'Select season and round first.';
    return;
  }

  runBtn.disabled = true;
  runBtn.textContent = 'Running...';
  statusEl.textContent = 'Running projection model...';

  try {
    const result = await fetchProjectionPayload(season, round, user);
    const payload = result.payload;

    latestProjection = payload;
    updateRaceMeta(payload);
    renderRaceTable(payload.race_projection || []);
    renderTrackProfile(payload.track_profile);
    renderPickLikelihood(payload.pick_likelihood);
    renderTeamOutlook(payload.team_outlook || []);
    renderChampionshipProjection(payload.championship_projection);
    renderModelSpec(payload.model);

    populateDriverSelect(payload.race_projection || []);
    if (driverSelect.options.length) {
      driverSelect.value = driverSelect.value || driverSelect.options[0].value;
      renderDriverBreakdown(payload.race_projection, driverSelect.value);
    } else {
      renderDriverBreakdown([], '');
    }

    if (result.degraded) {
      statusEl.textContent = `Model complete with fallback (testing signal off): ${payload.race_name} round ${payload.round}.`;
    } else {
      statusEl.textContent = `Model complete: ${payload.race_name} round ${payload.round}.`;
    }
  } catch (error) {
    statusEl.textContent = `Projection failed: ${error.message}`;
    raceTableEl.innerHTML = `<div class="muted">${error.message}</div>`;
    wdcTableEl.innerHTML = '<div class="muted">Unable to load WDC projection.</div>';
    wccTableEl.innerHTML = '<div class="muted">Unable to load WCC projection.</div>';
    championshipMetaEl.textContent = 'Load failed';
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Run model';
  }
}

seasonSelect.addEventListener('change', async () => {
  await loadRoundsForSeason(Number(seasonSelect.value || 2026));
  await runProjection();
});

roundSelect.addEventListener('change', runProjection);
userSelect.addEventListener('change', runProjection);
runBtn.addEventListener('click', runProjection);
driverSelect.addEventListener('change', () => {
  renderDriverBreakdown(latestProjection?.race_projection || [], driverSelect.value);
});

(async function init() {
  await loadBaseControls();
  await runProjection();
})();
