const body = document.body;

const userSelect = document.getElementById('userSelect');
const seasonSelect = document.getElementById('seasonSelect');
const roundSelect = document.getElementById('roundSelect');
const predForm = document.getElementById('predictionForm');
const predResults = document.getElementById('predResults');
const statsTable = document.getElementById('statsTable');
const statsHighlights = document.getElementById('statsHighlights');
const updateDataBtn = document.getElementById('updateDataBtn');
const weekendFocus = document.getElementById('weekendFocus');
const reviewPanel = document.getElementById('reviewPanel');
const userFocus = document.getElementById('userFocus');


const predictionTitle = document.getElementById('predictionTitle');

const stepButtons = [...document.querySelectorAll('.step-btn')];
const stepPanels = [...document.querySelectorAll('.stage')];
const stepActions = document.getElementById('stepActions');
const stepPrevBtn = document.getElementById('stepPrevBtn');
const stepNextBtn = document.getElementById('stepNextBtn');

const HYBRID_MODE_ID = 'hybrid-1-3';
const HYBRID_MODE_TITLE = 'Guided Prediction';

let currentStep = 1;
let statsByDriver = new Map();

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  return res.json();
}

function getSavedPin(user) {
  return localStorage.getItem(`pin:${user}`) || '';
}

async function requirePin(user) {
  const saved = getSavedPin(user);
  const pin = window.prompt(`Enter PIN for ${user}`, saved || '');
  if (pin === null) return null;
  localStorage.setItem(`pin:${user}`, pin);
  return pin;
}

function option(label, value) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function formatRange(start, end) {
  if (!start || !end) return '';
  if (start === end) return start;
  const s = new Date(start);
  const e = new Date(end);
  const sameMonth = s.getMonth() === e.getMonth();
  const month = s.toLocaleString('en-US', { month: 'short' });
  const endMonth = e.toLocaleString('en-US', { month: 'short' });
  const year = s.getFullYear();

  if (sameMonth) {
    return `${month} ${String(s.getDate()).padStart(2, '0')}–${String(e.getDate()).padStart(2, '0')}, ${year}`;
  }
  return `${month} ${String(s.getDate()).padStart(2, '0')} – ${endMonth} ${String(e.getDate()).padStart(2, '0')}, ${year}`;
}

function selectedText(select) {
  if (!select || !select.options.length) return '';
  return select.options[select.selectedIndex]?.textContent || '';
}

function setStep(step) {
  currentStep = Math.max(1, Math.min(3, Number(step) || 1));

  stepButtons.forEach(btn => {
    const isActive = Number(btn.dataset.step) === currentStep;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-current', isActive ? 'step' : 'false');
  });

  stepPanels.forEach(panel => {
    const panelStep = Number(panel.dataset.stepPanel || 0);
    panel.classList.toggle('is-hidden', panelStep !== currentStep);
  });

  if (stepActions) stepActions.classList.remove('is-hidden');
  if (stepPrevBtn) stepPrevBtn.disabled = currentStep <= 1;
  if (stepNextBtn) {
    stepNextBtn.textContent = currentStep >= 3 ? 'Review Ready' : 'Continue';
    stepNextBtn.disabled = currentStep >= 3;
  }
}

function logoFor(team) {
  const slug = String(team || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `<img class="logo" src="/team-logos/${slug}.png" alt="" onerror="this.remove()">`;
}

function trendLabel(formAvg) {
  if (formAvg === null || formAvg === undefined || Number.isNaN(formAvg)) return 'Flat';
  if (formAvg <= 6) return 'Hot';
  if (formAvg <= 10) return 'Stable';
  return 'Cooling';
}

function renderStats(stats) {
  if (!stats.length) {
    statsHighlights.innerHTML = '<div class="muted">No form cards yet. Click Update data.</div>';
    statsTable.textContent = 'No stats yet. Click "Update data".';
    return;
  }

  const topDeck = [...stats]
    .sort((a, b) => (b.form?.points || 0) - (a.form?.points || 0) || (a.avg_finish || 99) - (b.avg_finish || 99))
    .slice(0, 8);

  statsHighlights.innerHTML = topDeck.map(s => {
    const form = s.form?.positions?.length ? s.form.positions.join(' • ') : '—';
    const avg = s.form?.avg_finish ? s.form.avg_finish.toFixed(2) : '—';
    const trend = trendLabel(s.form?.avg_finish ?? null);
    return `
      <article class="driver-form-card-item">
        <header>
          <strong>${s.driverName}</strong>
          <span class="chip">${trend}</span>
        </header>
        <div class="muted">${logoFor(s.team)}${s.team}</div>
        <div class="driver-form-metrics">
          <span><strong>${s.points}</strong><em>pts</em></span>
          <span><strong>${s.wins}</strong><em>wins</em></span>
          <span><strong>${s.podiums}</strong><em>podiums</em></span>
          <span><strong>${avg}</strong><em>form avg</em></span>
        </div>
        <div class="driver-form-trail">${form}</div>
      </article>
    `;
  }).join('');

  const rows = stats.map(s => {
    const form = s.form?.positions?.length ? s.form.positions.join(', ') : '—';
    const formAvg = s.form?.avg_finish ? s.form.avg_finish.toFixed(2) : '—';
    const formPts = s.form?.points ?? '—';
    return `
      <tr>
        <td>${s.driverName}</td>
        <td>${logoFor(s.team)}${s.team}</td>
        <td>${s.points}</td>
        <td>${s.wins}</td>
        <td>${s.podiums}</td>
        <td>${s.poles}</td>
        <td>${s.fastest_laps}</td>
        <td>${s.avg_finish ? s.avg_finish.toFixed(2) : '—'}</td>
        <td>${s.avg_quali ? s.avg_quali.toFixed(2) : '—'}</td>
        <td>${form}</td>
        <td>${formAvg}</td>
        <td>${formPts}</td>
      </tr>
    `;
  }).join('');

  statsTable.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Driver</th>
          <th>Team</th>
          <th>Pts</th>
          <th>Wins</th>
          <th>Podiums</th>
          <th>Poles</th>
          <th>Fastest</th>
          <th>Avg Finish</th>
          <th>Avg Quali</th>
          <th>Form (last 5)</th>
          <th>Form Avg</th>
          <th>Form Pts</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function updatePickInsights() {
  document.querySelectorAll('[data-insight]').forEach(el => {
    const key = el.dataset.insight;
    if (!key) return;

    const pickSelect = document.querySelector(`.driverSelect[data-pick="${key}"]`);
    if (!pickSelect || !pickSelect.value) return;

    const stat = statsByDriver.get(pickSelect.value);
    if (!stat) return;

    const formAvg = stat.form?.avg_finish ? stat.form.avg_finish.toFixed(2) : '—';
    const formPts = stat.form?.points ?? 0;
    el.textContent = `${stat.team} · ${stat.points} pts · form ${formAvg} · last5 ${formPts} pts`;
  });
}

function renderReviewPanel() {
  const pickRows = [
    ['P1', '.driverSelect[data-pick="p1"]'],
    ['P2', '.driverSelect[data-pick="p2"]'],
    ['P3', '.driverSelect[data-pick="p3"]'],
    ['Pole', '.driverSelect[data-pick="pole"]'],
    ['Fastest', '.driverSelect[data-pick="fastestLap"]']
  ].map(([label, selector]) => {
    const select = document.querySelector(selector);
    return { label, value: selectedText(select) || '—' };
  });

  const wildcardText = document.getElementById('wildcardText')?.value?.trim() || '—';
  const lockField = document.getElementById('lockField')?.value || '—';

  reviewPanel.innerHTML = `
    <div class="review-box">
      <h3>Pick Review</h3>
      <div class="review-grid">
        ${pickRows.map(row => `<div><span>${row.label}</span><strong>${row.value}</strong></div>`).join('')}
        <div><span>Wildcard</span><strong>${wildcardText}</strong></div>
        <div><span>Lock</span><strong>${lockField}</strong></div>
      </div>
      <div class="muted">If this looks right, go back to Picks and click Save prediction.</div>
    </div>
  `;
}

function renderWeekendFocus() {
  const roundLabel = selectedText(roundSelect) || 'Select round';
  const season = seasonSelect.value || '2026';

  const raceMatch = roundLabel.match(/^R\d+\s*-\s*(.+?)\s*\(/);
  const roundMatch = roundLabel.match(/^R(\d+)/);
  const roundNum = roundMatch ? roundMatch[1] : '';

  const raceName = (raceMatch ? raceMatch[1] : roundLabel).trim();
  const raceUpper = raceName.toUpperCase();

  let lineA = raceUpper;
  let lineB = '';

  if (raceUpper.includes(' GRAND PRIX')) {
    lineA = raceUpper.replace(' GRAND PRIX', '');
    lineB = 'GRAND PRIX';
  } else if (raceUpper.endsWith(' GP')) {
    lineA = raceUpper.slice(0, -3);
    lineB = 'GP';
  }

  weekendFocus.innerHTML =   `
    <div class="weekend-focus-grid weekend-focus-hero">
      <article>
        <div class="round-logo-meta">
          <span class="eyebrow">Active Weekend</span>
          <span class="chip">${roundNum ? `Round ${roundNum}` : 'Round'}</span>
        </div>
        <div class="round-logo-block">
          <div class="round-logo-topline">
            <span class="round-speedmark" aria-hidden="true"><i></i><i></i><i></i></span>
            <span>FORMULA 1 • WORLD CHAMPIONSHIP</span>
          </div>
          <div class="round-logo-sponsor" aria-label="Sponsor line">
            <span>QATAR</span><small>AIRWAYS</small>
          </div>
          <div class="round-logo-mainline">
            <span class="round-wing left" aria-hidden="true"></span>
            <div class="round-logo-title">
              <h2 class="round-logo-line-a">${lineA}</h2>
              ${lineB ? `<h2 class="round-logo-line-b">${lineB}</h2>` : ''}
              <div class="round-logo-year">${season}</div>
            </div>
            <span class="round-wing right" aria-hidden="true"></span>
          </div>
        </div>
        <p class="muted">Your picks and scoring for this week are anchored to this round.</p>
      </article>
    </div>
  `;
}

function renderUserFocus() {
  if (!userFocus) return;

  const user = userSelect.value || 'No user selected';
  const lock = document.getElementById('lockField')?.value || 'None';

  userFocus.innerHTML = `
    <div class="user-focus-row">
      <div>
        <span class="eyebrow">Current User</span>
        <strong>${user}</strong>
      </div>
      <div class="right">
        <span class="eyebrow">Lock Pick</span>
        <strong>${lock}</strong>
      </div>
    </div>
  `;
}

async function loadConfig() {
  const config = await fetchJson('/api/config');
  userSelect.innerHTML = '';
  userSelect.appendChild(option('Select user', ''));
  config.users.forEach(u => {
    const name = typeof u === 'string' ? u : u?.name;
    if (name) userSelect.appendChild(option(name, name));
  });
}

async function loadSeasons() {
  const seasons = await fetchJson('/api/seasons');
  seasonSelect.innerHTML = '';
  seasons.forEach(s => seasonSelect.appendChild(option(String(s), s)));
}

async function loadRounds() {
  const season = seasonSelect.value;
  const races = await fetchJson(`/api/races?season=${season}`);
  roundSelect.innerHTML = '';
  races.forEach(r => {
    const range = formatRange(r.start_date, r.end_date);
    const label = `R${r.round} - ${r.raceName} (${range})`;
    roundSelect.appendChild(option(label, r.round));
  });
}

async function loadDrivers() {
  const drivers = await fetchJson('/api/drivers');
  document.querySelectorAll('.driverSelect').forEach(select => {
    const prev = select.value;
    select.innerHTML = '';
    select.appendChild(option('—', ''));
    drivers.forEach(d => {
      const label = `${d.driverName} — ${d.team}`;
      select.appendChild(option(label, d.driverId));
    });
    if (prev) select.value = prev;
  });
}

async function loadStats() {
  const season = seasonSelect.value;
  const stats = await fetchJson(`/api/stats?season=${season}`);
  statsByDriver = new Map(stats.map(s => [s.driverId, s]));
  renderStats(stats);
  updatePickInsights();
}

async function loadPredictions() {
  const season = seasonSelect.value;
  const round = roundSelect.value;
  if (!season || !round) return;

  const preds = await fetchJson(`/api/predictions?season=${season}&round=${round}`);
  if (!preds.length) {
    predResults.innerHTML = '<span class="chip">No predictions yet for this round</span>';
    return;
  }

  predResults.innerHTML = preds.map(p => {
    return `<span class="chip ${p.score_total > 0 ? 'dark' : ''}">${p.user}: ${p.score_total || 0} pts</span>`;
  }).join(' ');
}

async function savePrediction(e) {
  e.preventDefault();

  const picks = {};
  document.querySelectorAll('.driverSelect').forEach(select => {
    picks[select.dataset.pick] = select.value || null;
  });
  const wildcardText = document.getElementById('wildcardText');
  picks.wildcardText = wildcardText ? wildcardText.value.trim() : '';
  const lockField = document.getElementById('lockField');
  picks.lockField = lockField ? lockField.value : '';

  const pin = await requirePin(userSelect.value);
  if (pin === null) return;

  await fetchJson('/api/predictions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: userSelect.value,
      season: Number(seasonSelect.value),
      round: Number(roundSelect.value),
      picks,
      pin
    })
  });

  await loadPredictions();
  renderReviewPanel();
  renderWeekendFocus();
  renderUserFocus();
  setStep(3);
}

async function updateData() {
  updateDataBtn.disabled = true;
  updateDataBtn.textContent = 'Updating...';
  try {
    await fetchJson('/api/update-data', { method: 'POST' });
    await loadSeasons();
    await loadRounds();
    await loadDrivers();
    await loadStats();
    await loadPredictions();
  } catch (err) {
    alert(err.message);
  } finally {
    updateDataBtn.disabled = false;
    updateDataBtn.textContent = 'Update data';
  }
}

async function autoUpdateOnLoad() {
  try {
    await updateData();
  } catch (err) {
    console.warn('Auto update failed:', err);
  }
}

function bindStepControls() {
  stepButtons.forEach(btn => {
    btn.addEventListener('click', () => setStep(btn.dataset.step));
  });

  if (stepPrevBtn) {
    stepPrevBtn.addEventListener('click', () => setStep(currentStep - 1));
  }

  if (stepNextBtn) {
    stepNextBtn.addEventListener('click', () => setStep(currentStep + 1));
  }
}

function bindInteractionRefresh() {
  userSelect.addEventListener('change', () => {
    renderWeekendFocus();
    renderUserFocus();
    renderReviewPanel();
  });

  roundSelect.addEventListener('change', async () => {
    await loadPredictions();
    renderWeekendFocus();
    renderUserFocus();
    renderReviewPanel();
  });

  seasonSelect.addEventListener('change', async () => {
    await loadRounds();
    await loadPredictions();
    await loadStats();
    renderWeekendFocus();
    renderUserFocus();
    renderReviewPanel();
  });

  document.querySelectorAll('.driverSelect').forEach(select => {
    select.addEventListener('change', () => {
      updatePickInsights();
      renderReviewPanel();
    });
  });

  const wildcardText = document.getElementById('wildcardText');
  const lockField = document.getElementById('lockField');
  if (wildcardText) wildcardText.addEventListener('input', renderReviewPanel);
  if (lockField) {
    lockField.addEventListener('change', () => {
      renderWeekendFocus();
      renderUserFocus();
      renderReviewPanel();
    });
  }
}

predForm.addEventListener('submit', savePrediction);
updateDataBtn.addEventListener('click', updateData);

(async function init() {
  body.dataset.weeklyLayout = HYBRID_MODE_ID;
  if (predictionTitle) predictionTitle.textContent = HYBRID_MODE_TITLE;

  bindStepControls();
  bindInteractionRefresh();

  await loadConfig();
  await loadSeasons();
  await loadRounds();
  await loadDrivers();
  await autoUpdateOnLoad();

  if (seasonSelect.value) {
    await loadStats();
    await loadPredictions();
  }

  setStep(1);
  renderWeekendFocus();
  renderUserFocus();
  renderReviewPanel();
})();
