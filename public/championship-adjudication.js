const seasonSelect = document.getElementById('seasonSelect');
const reloadBtn = document.getElementById('reloadBtn');
const adjudicationStatus = document.getElementById('adjudicationStatus');
const adjudicationCards = document.getElementById('adjudicationCards');

let driverNameById = new Map();
let adjudicationCache = null;

function setStatus(message) {
  adjudicationStatus.textContent = message;
}

function selectedSeason() {
  return Number(seasonSelect?.value || 2026);
}

function option(label, value) {
  const el = document.createElement('option');
  el.value = value;
  el.textContent = label;
  return el;
}

function normalizeStatusValue(value) {
  if (value === true) return 'hit';
  if (value === false) return 'miss';
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'hit' || raw === 'true' || raw === '1' || raw === 'yes') return 'hit';
  if (raw === 'miss' || raw === 'false' || raw === '0' || raw === 'no') return 'miss';
  return '';
}

function statusToBoolean(value) {
  if (value === 'hit') return true;
  if (value === 'miss') return false;
  return null;
}

function getSavedPin(user) {
  return localStorage.getItem(`pin:${user}`) || '';
}

async function requirePin(user, label = 'save adjudication') {
  const current = getSavedPin(user);
  const pin = window.prompt(`Enter PIN for ${user} to ${label}`, current || '');
  if (pin === null) return null;
  localStorage.setItem(`pin:${user}`, pin);
  return pin;
}

async function fetchJson(url, options = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

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
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw new Error(`Failed to fetch ${url}`);
}

function parseErrorMessage(err) {
  const raw = String(err?.message || 'Request failed');
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return parsed.error;
  } catch {
    // Non-JSON message, use raw.
  }
  return raw;
}

function toReadablePick(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (driverNameById.has(value)) return driverNameById.get(value);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function renderSummaryCard(summary) {
  const nonStanding = summary?.nonStanding || {};
  const standings = summary?.standings || {};

  return `
    <div class="adj-summary-grid">
      <div><span class="eyebrow">Non-standings points</span><strong>${nonStanding.points || 0} / ${nonStanding.max || 0}</strong></div>
      <div><span class="eyebrow">Hits / Misses / Pending</span><strong>${nonStanding.hits || 0} / ${nonStanding.misses || 0} / ${nonStanding.pending || 0}</strong></div>
      <div><span class="eyebrow">Standings points</span><strong>${standings.points || 0}</strong></div>
      <div><span class="eyebrow">Total points</span><strong>${summary?.totalPoints || 0}</strong></div>
    </div>
  `;
}

function renderRowStatusSelect(user, field, status, hasPick) {
  if (!hasPick) return '<span class="muted">No pick</span>';
  const selected = normalizeStatusValue(status);
  return `
    <select class="adj-status-select" data-user="${user}" data-field="${field}">
      <option value="" ${selected === '' ? 'selected' : ''}>Pending</option>
      <option value="hit" ${selected === 'hit' ? 'selected' : ''}>Hit</option>
      <option value="miss" ${selected === 'miss' ? 'selected' : ''}>Miss</option>
    </select>
  `;
}

function renderAdjudicationCards(payload) {
  adjudicationCache = payload;
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];

  if (!rows.length) {
    adjudicationCards.innerHTML = '<div class="muted">No championship picks to adjudicate yet.</div>';
    return;
  }

  adjudicationCards.innerHTML = rows.map((entry) => {
    const summary = entry?.summary || {};
    const nonStandingRows = summary?.nonStanding?.rows || [];

    const rowsHtml = nonStandingRows.map((row) => {
      const hasPick = !(row.pickValue === null || row.pickValue === undefined || String(row.pickValue).trim() === '');
      const status = normalizeStatusValue(row.status);
      const rowClass = status === 'hit' ? 'is-hit' : (status === 'miss' ? 'is-miss' : 'is-pending');
      const scored = hasPick ? Number(row.scoredPoints || 0) : 0;
      const maxPts = hasPick ? Number(row.points || 0) : 0;

      return `
        <tr class="${rowClass}">
          <td>${row.label || row.field}</td>
          <td>${toReadablePick(row.pickValue)}</td>
          <td>${maxPts}</td>
          <td>${renderRowStatusSelect(entry.user, row.field, row.status, hasPick)}</td>
          <td>${scored}</td>
        </tr>
      `;
    }).join('');

    return `
      <article class="health-card">
        <header>
          <h3>${entry.user}</h3>
          <button class="btn ghost adj-save-btn" type="button" data-user="${entry.user}">Save ${entry.user}</button>
        </header>
        ${renderSummaryCard(summary)}
        <div class="table" style="margin-top:10px;">
          <table>
            <thead>
              <tr>
                <th>Field</th>
                <th>Pick</th>
                <th>Max</th>
                <th>Status</th>
                <th>Scored</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </article>
    `;
  }).join('');
}

function collectUserAdjudication(user) {
  const selects = [...document.querySelectorAll(`.adj-status-select[data-user="${user}"]`)];
  const out = {};
  for (const select of selects) {
    const field = select.getAttribute('data-field');
    if (!field) continue;
    out[field] = statusToBoolean(select.value);
  }
  return out;
}

async function saveUserAdjudication(user) {
  if (!user) return;
  const pin = await requirePin(user);
  if (pin === null) {
    setStatus(`Save canceled for ${user}.`);
    return;
  }

  const adjudication = collectUserAdjudication(user);
  setStatus(`Saving adjudication for ${user}...`);

  try {
    await fetchJson('/api/season/adjudication', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user,
        season: selectedSeason(),
        adjudication,
        pin
      })
    });
    await loadAdjudication();
    setStatus(`Saved adjudication for ${user}.`);
  } catch (err) {
    setStatus(`Save failed for ${user}: ${parseErrorMessage(err)}`);
  }
}

async function loadDriverMap() {
  const season = selectedSeason();
  const drivers = await fetchJson(`/api/drivers?season=${season}`);
  driverNameById = new Map((drivers || []).map((row) => [row.driverId, row.driverName]));
}

async function loadSeasons() {
  const seasons = await fetchJson('/api/seasons');
  const seasonParam = Number(new URLSearchParams(window.location.search).get('season'));
  seasonSelect.innerHTML = '';
  seasons
    .slice()
    .sort((a, b) => b - a)
    .forEach((season) => seasonSelect.appendChild(option(String(season), season)));

  if (seasonParam && seasons.includes(seasonParam)) seasonSelect.value = String(seasonParam);
  else if (seasons.includes(2026)) seasonSelect.value = '2026';
}

async function loadAdjudication() {
  setStatus('Loading championship adjudication...');
  try {
    await loadDriverMap();
    const payload = await fetchJson(`/api/season/adjudication?season=${selectedSeason()}`);
    renderAdjudicationCards(payload);
    setStatus(`Loaded adjudication for season ${selectedSeason()}.`);
  } catch (err) {
    adjudicationCards.innerHTML = `<div class="muted">Failed to load adjudication: ${parseErrorMessage(err)}</div>`;
    setStatus(`Adjudication load failed: ${parseErrorMessage(err)}`);
  }
}

reloadBtn.addEventListener('click', loadAdjudication);
seasonSelect.addEventListener('change', loadAdjudication);
adjudicationCards.addEventListener('click', (event) => {
  const button = event.target.closest('.adj-save-btn');
  if (!button) return;
  const user = button.getAttribute('data-user');
  if (!user) return;
  saveUserAdjudication(user);
});

(async function init() {
  await loadSeasons();
  await loadAdjudication();
})();
