import { fillDriverSelect, sortDriversForDropdown } from './driver-order.js';
import { bindMetricHelpTooltips } from './metric-help.js';
import { teamToneVars, teamLogoPath } from './team-colors.js';

const body = document.body;

const userSelect = document.getElementById('userSelect');
const seasonSelect = document.getElementById('seasonSelect');
const roundSelect = document.getElementById('roundSelect');
const predForm = document.getElementById('predictionForm');
const randomPicksBtn = document.getElementById('randomPicksBtn');
const predResults = document.getElementById('predResults');
const statsTable = document.getElementById('statsTable');
const statsHighlights = document.getElementById('statsHighlights');
const weekendFocus = document.getElementById('weekendFocus');
const reviewPanel = document.getElementById('reviewPanel');
const userFocus = document.getElementById('userFocus');
const restDriverSelect = document.getElementById('restDriverSelect');
const restDriverCard = document.getElementById('restDriverCard');
const layoutSwitches = document.getElementById('layoutSwitches');
const layoutModeNote = document.getElementById('layoutModeNote');

const predictionTitle = document.getElementById('predictionTitle');

const stepButtons = [...document.querySelectorAll('.step-btn')];
const stepPanels = [...document.querySelectorAll('.stage')];
const stepActions = document.getElementById('stepActions');
const stepPrevBtn = document.getElementById('stepPrevBtn');
const stepNextBtn = document.getElementById('stepNextBtn');

const LAYOUT_MODES = [
  {
    id: 'race-battle',
    label: 'Race Control',
    title: 'Race Control',
    note: ''
  }
];

const DEFAULT_LAYOUT_ID = 'race-battle';

let currentStep = 1;
let statsByDriver = new Map();
let draftSubmitted = false;
const reviewProjectionCache = new Map();
let reviewRenderToken = 0;

const REQUIRED_PICK_KEYS = ['p1', 'p2', 'p3', 'pole', 'fastestLap'];
const SIDE_BET_FIELDS = [
  { key: 'poleConverts', elementId: 'sidebetPoleConverts' },
  { key: 'frontRowWinner', elementId: 'sidebetFrontRowWinner' },
  { key: 'anyDnf', elementId: 'sidebetAnyDnf' },
  { key: 'redFlag', elementId: 'sidebetRedFlag' },
  { key: 'bigMover', elementId: 'sidebetBigMover' },
  { key: 'other7Podium', elementId: 'sidebetOther7Podium' }
];

const LOCK_FIELD_LABELS = {
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

function parseYesNoValue(value) {
  if (value === true || value === false) return value;
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'yes' || raw === 'true' || raw === '1') return true;
  if (raw === 'no' || raw === 'false' || raw === '0') return false;
  return null;
}

function collectSideBetSelections() {
  const sideBets = {};
  for (const field of SIDE_BET_FIELDS) {
    const el = document.getElementById(field.elementId);
    sideBets[field.key] = parseYesNoValue(el?.value);
  }
  return sideBets;
}

function pickRandomOption(select, { allowBlank = false } = {}) {
  if (!select) return '';
  const options = [...select.options].filter((opt) => allowBlank || opt.value);
  if (!options.length) return '';
  const choice = options[Math.floor(Math.random() * options.length)];
  select.value = choice.value;
  return choice.value;
}

function shuffled(values) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomWildcardToken() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function randomizeDraftPicks() {
  const driverSelects = REQUIRED_PICK_KEYS
    .map((key) => document.querySelector(`.driverSelect[data-pick="${key}"]`))
    .filter(Boolean);

  const availableDriverIds = [...new Set(
    driverSelects.flatMap((select) => [...select.options].map((opt) => opt.value).filter(Boolean))
  )];

  if (availableDriverIds.length >= driverSelects.length) {
    const randomOrder = shuffled(availableDriverIds).slice(0, driverSelects.length);
    driverSelects.forEach((select, idx) => {
      select.value = randomOrder[idx];
    });
  } else {
    driverSelects.forEach((select) => {
      pickRandomOption(select);
    });
  }

  const sidebetOptions = ['yes', 'no'];
  document.querySelectorAll('[data-sidebet]').forEach((select) => {
    select.value = sidebetOptions[Math.floor(Math.random() * sidebetOptions.length)];
  });

  pickRandomOption(document.getElementById('lockField'), { allowBlank: true });

  const wildcardText = document.getElementById('wildcardText');
  if (wildcardText) {
    wildcardText.value = `Random call ${randomWildcardToken()}`;
  }
}

function handleRandomPicks() {
  randomizeDraftPicks();
  draftSubmitted = false;
  updatePickInsights();
  refreshReviewAvailability();
  renderWeekendFocus();
  renderUserFocus();
  renderReviewPanel();
  setStep(2);
  predResults.innerHTML = '<span class="chip">Random picks loaded. Review, then save.</span>';
}

function lockFieldLabel(value) {
  const key = String(value || '').trim();
  if (!key) return 'None';
  return LOCK_FIELD_LABELS[key] || key;
}

function findLayoutMode(layoutId) {
  return LAYOUT_MODES.find((mode) => mode.id === layoutId) || LAYOUT_MODES[0];
}

function renderLayoutSwitches(activeLayoutId) {
  if (!layoutSwitches) return;

  layoutSwitches.innerHTML = LAYOUT_MODES.map((mode) => {
    const active = mode.id === activeLayoutId;
    return '<button class="btn ghost layout-btn ' + (active ? 'active' : '') + '" data-layout="' + mode.id + '" type="button" role="tab" aria-selected="' + (active ? 'true' : 'false') + '">' + mode.label + '</button>';
  }).join('');

  for (const btn of layoutSwitches.querySelectorAll('.layout-btn')) {
    btn.addEventListener('click', () => {
      setLayoutMode(btn.dataset.layout, { persist: true });
    });
  }
}

function setLayoutMode(layoutId, { persist = true } = {}) {
  const mode = findLayoutMode(layoutId);

  body.dataset.weeklyLayout = mode.id;
  if (predictionTitle) predictionTitle.textContent = mode.title;
  if (layoutModeNote) layoutModeNote.textContent = mode.note;

  renderLayoutSwitches(mode.id);

  if (persist) {
    localStorage.setItem('weekly-layout', mode.id);
  }
}

function getStepBounds() {
  const steps = stepButtons
    .map(btn => Number(btn.dataset.step))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  if (!steps.length) return { min: 1, max: 1 };
  return { min: steps[0], max: steps[steps.length - 1] };
}

function isDraftComplete() {
  if (!userSelect.value || !seasonSelect.value || !roundSelect.value) return false;
  return REQUIRED_PICK_KEYS.every((key) => {
    const select = document.querySelector(`.driverSelect[data-pick="${key}"]`);
    return Boolean(select?.value);
  });
}

function canShowReviewTab() {
  return isDraftComplete() && !draftSubmitted;
}

function refreshReviewAvailability() {
  const reviewBtn = stepButtons.find(btn => Number(btn.dataset.step) === 3);
  if (!reviewBtn) return;

  const canShow = canShowReviewTab();
  reviewBtn.classList.toggle('is-hidden', !canShow);
  reviewBtn.toggleAttribute('hidden', !canShow);
  reviewBtn.disabled = !canShow;

  if (!canShow && currentStep === 3) {
    setStep(2);
  }
}

function setStep(step) {
  const bounds = getStepBounds();
  currentStep = Math.max(bounds.min, Math.min(bounds.max, Number(step) || bounds.min));

  if (currentStep === 3 && !canShowReviewTab()) {
    currentStep = 2;
  }

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
  if (stepPrevBtn) stepPrevBtn.disabled = currentStep <= bounds.min;
  if (stepNextBtn) {
    stepNextBtn.textContent = currentStep >= bounds.max ? 'Review Ready' : 'Continue';
    stepNextBtn.disabled = currentStep >= bounds.max;
  }
}

function logoFor(team) {
  return `<img class="logo" src="${teamLogoPath(team)}" alt="" onerror="this.remove()">`;
}

function trendLabel(formAvg) {
  if (formAvg === null || formAvg === undefined || Number.isNaN(formAvg)) return 'Flat';
  if (formAvg <= 6) return 'Hot';
  if (formAvg <= 10) return 'Stable';
  return 'Cooling';
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

function formatSigned(value, digits = 2, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}${suffix}`;
}

function formatPct(value, digits = 0) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${(Number(value) * 100).toFixed(digits)}%`;
}

function formatMs(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toFixed(digits)} ms`;
}

function formatSeries(series) {
  if (!Array.isArray(series) || !series.length) return '—';
  return series.map(v => (v === null || v === undefined ? '—' : String(v))).join(' · ');
}

function renderRestDriverDetail(driver, label = 'Driver') {
  if (!driver || !restDriverCard) return;

  const qi = driver.qualifying_intel || {};
  const ri = driver.race_intel || {};
  const ci = driver.combined_intel || {};

  restDriverCard.innerHTML = `
    <article class="radar-rest-inner radar-rest-redesign" style="${teamToneVars(driver.team)}">
      <header class="radar-rest-hero">
        <div class="radar-rest-identity">
          <span class="radar-rest-kicker">${label}</span>
          <strong class="team-tone-text" style="${teamToneVars(driver.team)}">${driver.driverName}</strong>
          <div class="muted">${logoFor(driver.team)}${driver.team}</div>
        </div>
        <div class="radar-rest-primary-grid">
          <span><em>Points</em><strong>${driver.points || 0}</strong></span>
          <span><em>Momentum</em><strong>${formatSigned(ci.momentum_index, 2)}</strong></span>
          <span><em>Conversion</em><strong>${formatPct(ci.quali_to_race_conversion?.hit_rate, 0)}</strong></span>
        </div>
      </header>
      <div class="radar-rest-metrics radar-rest-metrics-clean">
        <span class="metric-wide"><em>Recent Form</em><strong>${formatSeries(driver.form?.positions || [])}</strong></span>
        <span><em>Q3 Appearances</em><strong>${qi.q3_appearances ?? 0}</strong></span>
        <span><em>Q1 Knockouts</em><strong>${qi.q1_knockouts ?? 0}</strong></span>
        <span><em>Pace Consistency</em><strong>${formatMs(ri.lap_pace_consistency_ms, 0)}</strong></span>
      </div>
    </article>
  `;
}

function renderStats(stats) {
  if (!stats.length) {
    statsHighlights.innerHTML = '<div class="muted">No driver intelligence yet. Sync a round from OpenF1 on the Intelligence page.</div>';
    if (restDriverCard) restDriverCard.innerHTML = '<div class="muted">No driver data available.</div>';
    if (restDriverSelect) restDriverSelect.innerHTML = '';
    return;
  }

  const sorted = [...stats].sort((a, b) => {
    if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
    const am = a.combined_intel?.momentum_index ?? -999;
    const bm = b.combined_intel?.momentum_index ?? -999;
    if (bm !== am) return bm - am;
    return String(a.driverName || '').localeCompare(String(b.driverName || ''));
  });

  const topFive = sorted.slice(0, 5);
  statsHighlights.innerHTML = topFive.map((s, idx) => {
    const ci = s.combined_intel || {};
    const qi = s.qualifying_intel || {};
    const trend = ci.race_trend_last5?.direction || 'n/a';
    return `
      <article class="driver-form-card-item radar-quick-card team-tone-card" style="${teamToneVars(s.team)}">
        <header>
          <strong class="team-tone-text" style="${teamToneVars(s.team)}">#${idx + 1} ${s.driverName}</strong>
          <span class="chip">${trend}</span>
        </header>
        <div class="muted">${logoFor(s.team)}${s.team}</div>
        <div class="driver-form-metrics">
          <span><strong>${s.points || 0}</strong><em>pts</em></span>
          <span><strong>${s.wins || 0}</strong><em>wins</em></span>
          <span><strong>${qi.q3_appearances ?? 0}</strong><em>Q3</em></span>
          <span><strong>${formatSigned(ci.momentum_index, 2)}</strong><em>momentum</em></span>
        </div>
      </article>
    `;
  }).join('');

  if (!restDriverSelect || !restDriverCard) return;

  const restDrivers = sorted.slice(5);
  const selectable = restDrivers.length ? restDrivers : sorted;

  const previous = restDriverSelect.value;
  const orderedSelectable = sortDriversForDropdown(selectable);
  fillDriverSelect(restDriverSelect, orderedSelectable, {
    includeBlank: false,
    includeTeamInOption: true
  });

  if (previous && orderedSelectable.some(d => d.driverId === previous)) {
    restDriverSelect.value = previous;
  }

  const selectedId = restDriverSelect.value || orderedSelectable[0]?.driverId;
  const selectedDriver = sorted.find(d => d.driverId === selectedId) || orderedSelectable[0];
  const label = restDrivers.length ? 'Rest of grid' : 'Full grid';
  renderRestDriverDetail(selectedDriver, label);
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

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, n));
}

function percentileRank(value, values) {
  const n = clamp01(value);
  if (n === null) return null;

  const list = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  if (list.length === 1) return 1;

  let count = 0;
  for (const item of list) {
    if (item <= n + 1e-12) count += 1;
  }

  return Math.max(0, Math.min(1, (count - 1) / (list.length - 1)));
}

function descendingRank(value, values) {
  const n = clamp01(value);
  if (n === null) return null;

  const list = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => b - a);
  if (!list.length) return null;

  const idx = list.findIndex((item) => n >= item - 1e-12);
  return idx >= 0 ? idx + 1 : list.length;
}

function pickLikelihoodDescriptor(percentile) {
  if (percentile === null || percentile === undefined) {
    return 'No model signal';
  }

  if (percentile <= 0.12) return 'Off the wall';
  if (percentile <= 0.3) return 'Long shot';
  if (percentile <= 0.55) return 'Live';
  if (percentile <= 0.8) return 'Strong';
  return 'Very strong';
}

function buildReviewColorStyle(percentile, confidence = 0.65) {
  const p = clamp01(percentile);
  if (p === null) {
    return {
      style: '',
      neutral: true,
      tone: 'No model data'
    };
  }

  const conf = clamp01(confidence) ?? 0.65;
  const hue = Math.round(p * 120);
  const extremity = Math.abs(p - 0.5) * 2;
  const depth = 0.6 + (0.4 * conf);
  const isDarkTheme = document.documentElement?.getAttribute('data-theme') === 'dark';

  if (isDarkTheme) {
    const alpha = 0.24 + (0.56 * extremity * depth);
    const borderAlpha = 0.5 + (0.42 * extremity * depth);
    const glowAlpha = 0.24 + (0.42 * extremity * depth);
    const lightA = 52 - (10 * extremity) - (3 * conf);
    const lightB = 40 - (14 * extremity) - (4 * conf);

    return {
      style: [
        `--review-card-bg: linear-gradient(150deg, hsla(${hue}, 88%, ${Math.max(24, lightA).toFixed(1)}%, ${(alpha + 0.12).toFixed(3)}), hsla(${hue}, 90%, ${Math.max(18, lightB).toFixed(1)}%, ${(alpha + 0.22).toFixed(3)}))`,
        `--review-card-border: hsla(${hue}, 92%, ${Math.max(14, lightB - 8).toFixed(1)}%, ${Math.min(0.96, borderAlpha).toFixed(3)})`,
        `--review-card-shadow: hsla(${hue}, 84%, ${Math.max(10, lightB - 14).toFixed(1)}%, ${Math.min(0.86, glowAlpha).toFixed(3)})`
      ].join('; '),
      neutral: false,
      tone: pickLikelihoodDescriptor(p)
    };
  }

  const alpha = 0.14 + (0.42 * extremity * depth);
  const borderAlpha = 0.3 + (0.5 * extremity * depth);
  const glowAlpha = 0.12 + (0.3 * extremity * depth);
  const lightA = 66 - (16 * extremity) - (4 * conf);
  const lightB = 58 - (20 * extremity) - (6 * conf);

  return {
    style: [
      `--review-card-bg: linear-gradient(150deg, hsla(${hue}, 82%, ${Math.max(30, lightA).toFixed(1)}%, ${(alpha + 0.12).toFixed(3)}), hsla(${hue}, 84%, ${Math.max(24, lightB).toFixed(1)}%, ${(alpha + 0.22).toFixed(3)}))`,
      `--review-card-border: hsla(${hue}, 88%, ${Math.max(22, lightB - 10).toFixed(1)}%, ${borderAlpha.toFixed(3)})`,
      `--review-card-shadow: hsla(${hue}, 80%, ${Math.max(20, lightB - 16).toFixed(1)}%, ${glowAlpha.toFixed(3)})`
    ].join('; '),
    neutral: false,
    tone: pickLikelihoodDescriptor(p)
  };
}

function formatProbability(value) {
  const n = clamp01(value);
  if (n === null) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function getReviewProjectionCacheKey(season, round, user) {
  return `${season}:${round}:${user || 'all'}`;
}

async function fetchReviewProjection(season, round, user) {
  if (!season || !round) return null;

  const key = getReviewProjectionCacheKey(season, round, user);
  if (reviewProjectionCache.has(key)) return reviewProjectionCache.get(key);

  const params = new URLSearchParams({ season: String(season), round: String(round) });
  if (user) params.set('user', user);

  try {
    const payload = await fetchJson(`/api/projections?${params.toString()}`);
    reviewProjectionCache.set(key, payload);
    return payload;
  } catch {
    return null;
  }
}

async function renderReviewPanel() {
  const token = ++reviewRenderToken;

  if (!canShowReviewTab()) {
    reviewPanel.innerHTML = `
      <div class="review-box">
        <h3>Pick Review</h3>
        <div class="muted">Complete P1, P2, P3, Pole, and Fastest Lap to unlock review.</div>
      </div>
    `;
    return;
  }

  const slots = [
    { key: 'p1', label: 'P1', selector: '.driverSelect[data-pick="p1"]' },
    { key: 'p2', label: 'P2', selector: '.driverSelect[data-pick="p2"]' },
    { key: 'p3', label: 'P3', selector: '.driverSelect[data-pick="p3"]' },
    { key: 'pole', label: 'Pole', selector: '.driverSelect[data-pick="pole"]' },
    { key: 'fastestLap', label: 'Fastest', selector: '.driverSelect[data-pick="fastestLap"]' }
  ];

  const selections = slots.map((slot) => {
    const select = document.querySelector(slot.selector);
    return {
      ...slot,
      driverId: select?.value || null,
      value: selectedText(select) || '—'
    };
  });

  const wildcardText = document.getElementById('wildcardText')?.value?.trim() || '—';
  const lockField = document.getElementById('lockField')?.value || '—';
  const season = Number(seasonSelect.value || 0);
  const round = Number(roundSelect.value || 0);
  const user = String(userSelect.value || '').trim();

  reviewPanel.innerHTML = `
    <div class="review-box">
      <h3>Pick Review</h3>
      <div class="muted">Running model context for this round...</div>
    </div>
  `;

  const projection = await fetchReviewProjection(season, round, user);
  if (token !== reviewRenderToken) return;

  const raceRows = projection?.race_projection || [];
  const qualRows = projection?.qualifying_projection || [];
  const raceById = new Map(raceRows.map((row) => [row.driverId, row]));
  const qualById = new Map(qualRows.map((row) => [row.driverId, row]));

  const distributions = {
    p1: raceRows.map((row) => Number(row?.probabilities_by_position?.[1] ?? 0)).filter(Number.isFinite),
    p2: raceRows.map((row) => Number(row?.probabilities_by_position?.[2] ?? 0)).filter(Number.isFinite),
    p3: raceRows.map((row) => Number(row?.probabilities_by_position?.[3] ?? 0)).filter(Number.isFinite),
    pole: qualRows.map((row) => Number(row?.pole_probability ?? 0)).filter(Number.isFinite),
    fastestLap: raceRows.map((row) => Number(row?.probabilities?.fastest_lap ?? 0)).filter(Number.isFinite)
  };

  const getSlotProbability = (slotKey, driverId) => {
    if (!driverId) return null;

    if (slotKey === 'pole') {
      const row = qualById.get(driverId);
      return clamp01(row?.pole_probability ?? null);
    }

    if (slotKey === 'fastestLap') {
      const row = raceById.get(driverId);
      return clamp01(row?.probabilities?.fastest_lap ?? null);
    }

    if (slotKey === 'p1' || slotKey === 'p2' || slotKey === 'p3') {
      const row = raceById.get(driverId);
      const position = slotKey === 'p1' ? 1 : slotKey === 'p2' ? 2 : 3;
      return clamp01(row?.probabilities_by_position?.[position] ?? null);
    }

    return null;
  };

  const slotByKey = new Map();

  const cards = selections.map((slot) => {
    const probability = getSlotProbability(slot.key, slot.driverId);
    const distribution = distributions[slot.key] || [];
    const percentile = percentileRank(probability, distribution);
    const rank = descendingRank(probability, distribution);
    const confidence = raceById.get(slot.driverId)?.confidence ?? null;
    const color = buildReviewColorStyle(percentile, confidence ?? 0.65);

    const meta = rank && distribution.length
      ? `Rank ${rank}/${distribution.length} in ${slot.label}`
      : 'Model data pending';

    slotByKey.set(slot.key, {
      probability,
      percentile,
      distribution,
      confidence,
      tone: color.tone
    });

    return `
      <div class="review-item review-item-likelihood ${color.neutral ? 'is-neutral' : ''}" ${color.style ? `style="${color.style}"` : ''}>
        <span>${slot.label}</span>
        <strong>${slot.value}</strong>
        <em>${formatProbability(probability)}</em>
        <small>${color.tone} · ${meta}</small>
      </div>
    `;
  });

  const lockSelection = lockField !== '—' ? slotByKey.get(lockField) : null;
  const lockPercentile = lockSelection?.percentile ?? null;
  const lockConfidence = lockSelection?.confidence ?? 0.65;
  const lockColor = buildReviewColorStyle(lockPercentile, lockConfidence);
  const lockDisplay = lockField === '—' ? '—' : lockFieldLabel(lockField);

  cards.push(`
    <div class="review-item review-item-likelihood is-neutral">
      <span>Wildcard</span>
      <strong>${wildcardText}</strong>
      <em>Text call</em>
      <small>No numeric probability for free-text wildcard</small>
    </div>
  `);

  cards.push(`
    <div class="review-item review-item-likelihood ${lockColor.neutral ? 'is-neutral' : ''}" ${lockColor.style ? `style="${lockColor.style}"` : ''}>
      <span>Lock</span>
      <strong>${lockDisplay}</strong>
      <em>${formatProbability(lockSelection?.probability ?? null)}</em>
      <small>${lockField === '—' ? 'No lock selected' : (lockSelection?.probability === null || lockSelection?.probability === undefined ? 'Locked yes/no pick' : `${lockColor.tone} lock call`)}</small>
    </div>
  `);

  reviewPanel.innerHTML = `
    <div class="review-box">
      <h3>Pick Review</h3>
      <div class="review-grid review-grid-likelihood">
        ${cards.join('')}
      </div>
      <div class="muted review-legend">Color is model-relative for each slot: off-the-wall picks trend red, strongest picks trend green.</div>
      <div class="muted">Looks good? Submit from the Picks tab.</div>
    </div>
  `;
}


function renderWeekendFocus() {
  const roundLabel = selectedText(roundSelect) || 'Select round';
  const season = seasonSelect.value || '2026';

  const raceMatch = roundLabel.match(/^R\d+\s*-\s*(.+?)(?:\s*\(|$)/);
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
  const lock = lockFieldLabel(document.getElementById('lockField')?.value || '');
  const season = seasonSelect.value || '—';
  const roundLabel = selectedText(roundSelect) || 'No round selected';
  const roundShort = roundLabel.replace(/\s*\([^)]*\)\s*$/, '');

  userFocus.innerHTML = `
    <div class="user-focus-inline">
      <div class="uf-pill"><span>User</span><strong>${user}</strong></div>
      <div class="uf-pill"><span>Lock</span><strong>${lock}</strong></div>
      <div class="uf-meta">${season} · ${roundShort}</div>
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
  seasons.forEach((s) => seasonSelect.appendChild(option(String(s), s)));

  if (seasons.includes(2026)) {
    seasonSelect.value = '2026';
  } else if (seasons.length) {
    seasonSelect.value = String(Math.max(...seasons.map(Number)));
  }
}

async function loadRounds() {
  const season = seasonSelect.value;
  const races = await fetchJson(`/api/races?season=${season}`);
  roundSelect.innerHTML = '';
  races.forEach((r) => {
    const range = formatRange(r.start_date, r.end_date);
    const label = `R${r.round} - ${r.raceName}`;
    const opt = option(label, r.round);
    if (range) opt.title = `${label} (${range})`;
    roundSelect.appendChild(opt);
  });
}

async function loadDrivers() {
  const drivers = sortDriversForDropdown(await fetchJson('/api/drivers'));
  document.querySelectorAll('.driverSelect').forEach(select => {
    fillDriverSelect(select, drivers, {
      includeBlank: true,
      includeTeamInOption: false
    });
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

  if (!isDraftComplete()) {
    predResults.innerHTML = '<span class="chip">Complete required pick fields before saving.</span>';
    return;
  }

  const picks = {};
  document.querySelectorAll('.driverSelect').forEach(select => {
    picks[select.dataset.pick] = select.value || null;
  });
  const wildcardText = document.getElementById('wildcardText');
  picks.wildcardText = wildcardText ? wildcardText.value.trim() : '';
  const lockField = document.getElementById('lockField');
  picks.lockField = lockField ? lockField.value : '';
  picks.sideBets = collectSideBetSelections();

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

  draftSubmitted = true;
  refreshReviewAvailability();
  await loadPredictions();
  renderReviewPanel();
  renderWeekendFocus();
  renderUserFocus();
  setStep(2);
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
    draftSubmitted = false;
    refreshReviewAvailability();
    renderWeekendFocus();
    renderUserFocus();
    renderReviewPanel();
    setStep(2);
  });

  roundSelect.addEventListener('change', async () => {
    draftSubmitted = false;
    await loadPredictions();
    refreshReviewAvailability();
    renderWeekendFocus();
    renderUserFocus();
    renderReviewPanel();
    setStep(2);
  });

  seasonSelect.addEventListener('change', async () => {
    draftSubmitted = false;
    await loadRounds();
    await loadPredictions();
    await loadStats();
    refreshReviewAvailability();
    renderWeekendFocus();
    renderUserFocus();
    renderReviewPanel();
    setStep(2);
  });

  document.querySelectorAll('.driverSelect').forEach(select => {
    select.addEventListener('change', () => {
      draftSubmitted = false;
      updatePickInsights();
      refreshReviewAvailability();
      renderReviewPanel();
    });
  });

  const wildcardText = document.getElementById('wildcardText');
  const lockField = document.getElementById('lockField');
  if (restDriverSelect) {
    restDriverSelect.addEventListener('change', () => {
      const selected = statsByDriver.get(restDriverSelect.value);
      renderRestDriverDetail(selected);
    });
  }
  if (wildcardText) {
    wildcardText.addEventListener('input', () => {
      draftSubmitted = false;
      refreshReviewAvailability();
      renderReviewPanel();
    });
  }
  if (lockField) {
    lockField.addEventListener('change', () => {
      draftSubmitted = false;
      refreshReviewAvailability();
      renderWeekendFocus();
      renderUserFocus();
      renderReviewPanel();
    });
  }

  document.querySelectorAll('[data-sidebet]').forEach((select) => {
    select.addEventListener('change', () => {
      draftSubmitted = false;
      renderUserFocus();
      renderReviewPanel();
    });
  });

  if (randomPicksBtn) {
    randomPicksBtn.addEventListener('click', handleRandomPicks);
  }
}

predForm.addEventListener('submit', savePrediction);

(async function init() {
  const savedLayout = localStorage.getItem('weekly-layout');
  setLayoutMode(savedLayout || DEFAULT_LAYOUT_ID, { persist: false });

  bindMetricHelpTooltips(document);
  bindStepControls();
  bindInteractionRefresh();

  await loadConfig();
  await loadSeasons();
  await loadRounds();
  await loadDrivers();

  if (seasonSelect.value) {
    await loadStats();
    await loadPredictions();
  }

  refreshReviewAvailability();
  setStep(2);
  renderWeekendFocus();
  renderUserFocus();
  renderReviewPanel();
})();
