const seasonSelect = document.getElementById('seasonSelect');
const rulebookVersion = document.getElementById('rulebookVersion');
const lockSummary = document.getElementById('lockSummary');
const tieBreakersList = document.getElementById('tieBreakersList');
const weeklyScoringRows = document.getElementById('weeklyScoringRows');
const standingsScoringRows = document.getElementById('standingsScoringRows');
const nonStandingsRows = document.getElementById('nonStandingsRows');

const FIELD_GROUP_ORDER = [
  'wdc_bonus',
  'wcc_bonus',
  'out_of_box',
  'chaos',
  'big_brain',
  'bingo',
  'curses'
];

const FIELD_GROUP_LABEL = {
  wdc_bonus: 'WDC bonus',
  wcc_bonus: 'WCC bonus',
  out_of_box: 'Out-of-the-box',
  chaos: 'Chaos & headlines',
  big_brain: 'Big-Brain',
  bingo: 'Results Bingo',
  curses: 'Curses & Blessings'
};

const FIELD_LABEL = {
  'wdc_bonus.wins': "Champion's total wins",
  'wdc_bonus.poles': "Champion's total poles",
  'wdc_bonus.margin': 'Title margin (closest without going over)',
  'wdc_bonus.before': 'Gets a win before ____ happens',
  'wcc_bonus.margin': 'Dominant team wins by (points)',
  'wcc_bonus.over': 'Biggest overperformer team',
  'wcc_bonus.under': 'Biggest underperformer team',
  'out_of_box.podium': 'Unexpected podium finisher',
  'out_of_box.improved': 'Most improved driver',
  'out_of_box.rookie': 'Rookie moment of the year',
  'out_of_box.wet': 'Best wet-weather drive',
  'out_of_box.meme': 'Top driver meme',
  'chaos.tp': 'First team principal firing',
  'chaos.swap': 'First driver swap',
  'chaos.upgrade': 'First major upgrade shift',
  'chaos.weekend': 'Most chaotic weekend',
  'chaos.quote': 'Team radio quote of the year',
  'big_brain.nails': 'Team nails regs early',
  'big_brain.wrong': 'Team gets regs wrong until mid-season',
  'big_brain.bestStrat': 'Best strategist team',
  'big_brain.worstStrat': 'Most painful strategy team',
  'bingo.winners': 'Different race winners',
  'bingo.podiums': 'First-time podiums',
  'bingo.sc': 'Safety cars (season)',
  'bingo.rf': 'Red flags (season)',
  'curses.unlucky': 'Unluckiest driver',
  'curses.lucky': 'Luckiest driver',
  'curses.rakes': 'Stepping on rakes award'
};

const TIE_BREAKER_LABEL = {
  total_points: '1. Total points',
  lock_hit_rate: '2. Lock hit rate',
  podium_exact_hits: '3. Podium exact hits',
  side_bet_points: '4. Side-bet points',
  average_points_per_round: '5. Average points per round',
  latest_round_points: '6. Latest round points'
};

const WEEKLY_ITEM_LABEL = {
  p1: 'Pick: P1',
  p2: 'Pick: P2',
  p3: 'Pick: P3',
  pole: 'Pick: Pole Position',
  fastestLap: 'Pick: Fastest Lap',
  wildcardTop10: 'Pick: Wild card (Top 10)',
  lockBonus: 'Lock bonus',
  podiumExactPerSlot: 'Podium exact bonus (per slot)'
};

const WEEKLY_ITEM_NOTES = {
  p1: 'Base points before podium-exact multiplier.',
  p2: 'Base points before podium-exact multiplier.',
  p3: 'Base points before podium-exact multiplier.',
  pole: 'Correct pole qualifier.',
  fastestLap: 'Correct fastest lap driver.',
  wildcardTop10: 'Hits when wildcard driver finishes top 10.',
  lockBonus: 'Adds on top of the scored locked field.',
  podiumExactPerSlot: 'When P1/P2/P3 are all correct, each becomes 2 pts.'
};

const SIDEBET_LABEL = {
  poleConverts: 'Side bet: Pole converts',
  frontRowWinner: 'Side bet: Front row winner',
  anyDnf: 'Side bet: Any DNF',
  redFlag: 'Side bet: Red flag',
  bigMover: 'Side bet: Big mover (8+ places)',
  other7Podium: 'Side bet: Other 7 podium'
};

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function selectedSeason() {
  return toInt(seasonSelect?.value) || 2026;
}

function option(label, value) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

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
      if (attempt >= retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw new Error('Request failed');
}

async function loadSeasons() {
  const seasons = await fetchJson('/api/seasons');
  seasonSelect.innerHTML = '';

  seasons
    .slice()
    .sort((a, b) => b - a)
    .forEach((season) => seasonSelect.appendChild(option(String(season), season)));

  const fromQuery = toInt(new URLSearchParams(window.location.search).get('season'));
  if (fromQuery && seasons.includes(fromQuery)) seasonSelect.value = String(fromQuery);
  else if (seasons.includes(2026)) seasonSelect.value = '2026';
}

function renderLockSummary(lock) {
  if (!lock) {
    lockSummary.textContent = 'Lock rules unavailable.';
    return;
  }

  const state = lock.locked ? '<span class="chip red">Locked</span>' : '<span class="chip">Open</span>';
  const dateText = lock.lockDate || 'Not configured';
  const zone = lock.timezone || 'Local';
  lockSummary.innerHTML = `${state} Championship picks lock on <strong>${dateText}</strong> (${zone}).`;
}

function renderTieBreakers(items) {
  const rows = (items || [])
    .map((key) => `<li>${TIE_BREAKER_LABEL[key] || key}</li>`)
    .join('');
  tieBreakersList.innerHTML = rows || '<li>No tie-breakers configured.</li>';
}

function renderWeeklyScoring(weekly) {
  const pickRows = Object.entries(weekly?.picks || {}).map(([key, points]) => `
    <tr>
      <td>${WEEKLY_ITEM_LABEL[key] || key}</td>
      <td>${points}</td>
      <td>${WEEKLY_ITEM_NOTES[key] || ''}</td>
    </tr>
  `);

  const sideBetRows = Object.entries(weekly?.sideBets || {}).map(([key, points]) => `
    <tr>
      <td>${SIDEBET_LABEL[key] || key}</td>
      <td>${points}</td>
      <td>Side-bet scoring value.</td>
    </tr>
  `);

  weeklyScoringRows.innerHTML = [...pickRows, ...sideBetRows].join('') || '<tr><td colspan="3">No weekly scoring configured.</td></tr>';
}

function renderStandingsScoring(standings) {
  const rows = [
    ['Exact WDC place', standings?.wdcExact],
    ['Within 1 WDC place', standings?.wdcWithin1],
    ['Within 3 WDC places', standings?.wdcWithin3],
    ['Exact WCC place', standings?.wccExact]
  ].map(([label, points]) => `
    <tr>
      <td>${label}</td>
      <td>${points ?? '—'}</td>
    </tr>
  `);

  standingsScoringRows.innerHTML = rows.join('');
}

function renderNonStandings(pointsMap) {
  const entries = Object.entries(pointsMap || {});
  entries.sort((a, b) => {
    const [aKey] = a;
    const [bKey] = b;
    const aGroup = aKey.split('.')[0];
    const bGroup = bKey.split('.')[0];
    const aGroupIdx = FIELD_GROUP_ORDER.indexOf(aGroup);
    const bGroupIdx = FIELD_GROUP_ORDER.indexOf(bGroup);
    if (aGroupIdx !== bGroupIdx) return aGroupIdx - bGroupIdx;
    return aKey.localeCompare(bKey);
  });

  nonStandingsRows.innerHTML = entries.map(([field, points]) => {
    const group = field.split('.')[0];
    return `
      <tr>
        <td>${FIELD_GROUP_LABEL[group] || group}</td>
        <td>${FIELD_LABEL[field] || field}</td>
        <td>${points}</td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="3">No non-standings mappings configured.</td></tr>';
}

async function loadRulebook() {
  const season = selectedSeason();
  const payload = await fetchJson(`/api/season/rules?season=${season}`);
  rulebookVersion.value = payload.version || 'v1';
  renderLockSummary(payload.lock);
  renderTieBreakers(payload.tieBreakers);
  renderWeeklyScoring(payload.weekly);
  renderStandingsScoring(payload.standings);
  renderNonStandings(payload.nonStandingFieldPoints);
}

seasonSelect.addEventListener('change', loadRulebook);

(async function init() {
  await loadSeasons();
  await loadRulebook();
})();
