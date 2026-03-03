import { displayTeamName, sortDriversForDropdown } from './driver-order.js';
import { metricLabelHtml, bindMetricHelpTooltips } from './metric-help.js';

const seasonSelect = document.getElementById('seasonSelect');
const statsViewSelect = document.getElementById('statsViewSelect');
const roundSelect = document.getElementById('roundSelect');
const roundLabel = document.getElementById('roundLabel');
const syncOpenF1Btn = document.getElementById('syncOpenF1Btn');
const runRehearsalBtn = document.getElementById('runRehearsalBtn');
const openF1SyncStatus = document.getElementById('openF1SyncStatus');
const statsHighlights = document.getElementById('statsHighlights');
const statsTable = document.getElementById('statsTable');
const teamAtlas = document.getElementById('teamAtlas');
const teamDetail = document.getElementById('teamDetail');
const teamAtlasStatus = document.getElementById('teamAtlasStatus');

let raceWeekends = [];
let latestStats = [];
let activeTeamKey = 'McLaren';
let activeDriverId = null;
let compareDriverId = null;

const REHEARSAL_IMPORT_PAYLOAD = {
  qualifying: {
    pole: 'Lando Norris',
    order: ['Oscar Piastri', 'Charles Leclerc', 'George Russell']
  },
  race: {
    p1: 'Oscar Piastri',
    p2: 'Lando Norris',
    p3: 'Charles Leclerc',
    fastestLap: 'George Russell',
    dnfs: ['Lance Stroll'],
    redFlag: true
  }
};

const TEAM_ORDER_BY_SEASON = {
  2025: [
    'McLaren',
    'Mercedes',
    'Red Bull Racing',
    'Ferrari',
    'Williams',
    'Racing Bulls',
    'Aston Martin',
    'Haas F1 Team',
    'Audi',
    'Alpine'
  ],
  2026: [
    'McLaren',
    'Mercedes',
    'Red Bull Racing',
    'Ferrari',
    'Williams',
    'Racing Bulls',
    'Aston Martin',
    'Haas F1 Team',
    'Audi',
    'Alpine',
    'Cadillac'
  ]
};

const STATS_VIEW_MODES = new Set(['season', 'cumulative', 'blended']);

const TEAM_META_BY_SEASON = {
  2025: {
    'McLaren': { officialName: 'McLaren Formula 1 Team', logoSlug: 'mclaren' },
    'Mercedes': { officialName: 'Mercedes-AMG PETRONAS Formula One Team', logoSlug: 'mercedes' },
    'Red Bull Racing': { officialName: 'Oracle Red Bull Racing', logoSlug: 'red-bull' },
    'Ferrari': { officialName: 'Scuderia Ferrari HP', logoSlug: 'ferrari' },
    'Williams': { officialName: 'Williams Racing', logoSlug: 'williams' },
    'Racing Bulls': { officialName: 'Visa Cash App Racing Bulls Formula One Team', logoSlug: 'racing-bulls' },
    'Aston Martin': { officialName: 'Aston Martin Aramco Formula One Team', logoSlug: 'aston-martin' },
    'Haas F1 Team': { officialName: 'MoneyGram Haas F1 Team', logoSlug: 'haas' },
    'Audi': { officialName: 'Audi F1 Team', logoSlug: 'audi' },
    'Alpine': { officialName: 'BWT Alpine F1 Team', logoSlug: 'alpine' }
  },
  2026: {
    'McLaren': { officialName: 'McLaren Mastercard F1 Team', logoSlug: 'mclaren' },
    'Mercedes': { officialName: 'Mercedes-AMG PETRONAS Formula One Team', logoSlug: 'mercedes' },
    'Red Bull Racing': { officialName: 'Oracle Red Bull Racing', logoSlug: 'red-bull' },
    'Ferrari': { officialName: 'Scuderia Ferrari HP', logoSlug: 'ferrari' },
    'Williams': { officialName: 'Atlassian Williams F1 Team', logoSlug: 'williams' },
    'Racing Bulls': { officialName: 'Visa Cash App Racing Bulls Formula One Team', logoSlug: 'racing-bulls' },
    'Aston Martin': { officialName: 'Aston Martin Aramco Formula One Team', logoSlug: 'aston-martin' },
    'Haas F1 Team': { officialName: 'TGR Haas F1 Team', logoSlug: 'haas' },
    'Audi': { officialName: 'Audi Revolut F1 Team', logoSlug: 'audi' },
    'Alpine': { officialName: 'BWT Alpine Formula One Team', logoSlug: 'alpine' },
    'Cadillac': { officialName: 'Cadillac Formula 1 Team', logoSlug: 'cadillac' }
  }
};

const TEAM_COLORS = {
  'McLaren': { primary: '#ff8000', secondary: '#6692ff' },
  'Mercedes': { primary: '#00a19c', secondary: '#c8ccce' },
  'Red Bull Racing': { primary: '#2a4dff', secondary: '#ff004c' },
  'Ferrari': { primary: '#ed1c24', secondary: '#fff200' },
  'Williams': { primary: '#64c4ff', secondary: '#1868d8' },
  'Racing Bulls': { primary: '#6c98ff', secondary: '#000000' },
  'Aston Martin': { primary: '#0c6d5f', secondary: '#cedc00' },
  'Haas F1 Team': { primary: '#da291c', secondary: '#aeaeae' },
  'Kick Sauber': { primary: '#f50538', secondary: '#8a8d8f' },
  'Audi': { primary: '#f50538', secondary: '#8a8d8f' },
  'Alpine': { primary: '#005ba9', secondary: '#fd48c7' },
  'Cadillac': { primary: '#848689', secondary: '#1f262a' }
};

const DRIVER_NUMBERS_BY_ID = new Map([
  ['gasly', 10],
  ['colapinto', 43],
  ['alonso', 14],
  ['stroll', 18],
  ['name:gabriel-bortoleto', 5],
  ['name:nico-hulkenberg', 27],
  ['name:sergio-perez', 11],
  ['bottas', 77],
  ['leclerc', 16],
  ['hamilton', 44],
  ['ocon', 31],
  ['bearman', 87],
  ['norris', 1],
  ['piastri', 81],
  ['name:kimi-antonelli', 12],
  ['russell', 63],
  ['lawson', 30],
  ['name:arvid-lindblad', 41],
  ['max_verstappen', 3],
  ['name:isack-hadjar', 6],
  ['albon', 23],
  ['sainz', 55]
]);

const DRIVER_NUMBERS_BY_NAME = new Map([
  ['pierre gasly', 10],
  ['franco colapinto', 43],
  ['fernando alonso', 14],
  ['lance stroll', 18],
  ['gabriel bortoleto', 5],
  ['nico hulkenberg', 27],
  ['sergio perez', 11],
  ['valtteri bottas', 77],
  ['charles leclerc', 16],
  ['lewis hamilton', 44],
  ['esteban ocon', 31],
  ['oliver bearman', 87],
  ['lando norris', 1],
  ['oscar piastri', 81],
  ['kimi antonelli', 12],
  ['george russell', 63],
  ['liam lawson', 30],
  ['arvid lindblad', 41],
  ['max verstappen', 3],
  ['isack hadjar', 6],
  ['alex albon', 23],
  ['carlos sainz', 55]
]);

function activeSeason() {
  return Number(seasonSelect?.value || 2026);
}

function updateRehearsalButtonState() {
  if (!runRehearsalBtn) return;
  const currentSeason = new Date().getFullYear();
  const enabled = activeSeason() === currentSeason;
  runRehearsalBtn.disabled = !enabled;
  runRehearsalBtn.title = enabled ? '' : `Rehearsal import is only enabled for ${currentSeason}.`;
}

function activeStatsView() {
  const raw = String(statsViewSelect?.value || 'season').toLowerCase();
  return STATS_VIEW_MODES.has(raw) ? raw : 'season';
}

function getTeamOrder(season = activeSeason()) {
  return TEAM_ORDER_BY_SEASON[season] || TEAM_ORDER_BY_SEASON[2026];
}

function getTeamMeta(season = activeSeason()) {
  return TEAM_META_BY_SEASON[season] || TEAM_META_BY_SEASON[2026];
}

function driverAssetToken(driver) {
  const raw = String(driver?.driverName || driver?.driverId || '').trim().toLowerCase();
  const aliasMap = {
    'alexander albon': 'alex albon'
  };
  const canonical = aliasMap[raw] || raw;
  const parts = canonical.replace(/[^a-z0-9 ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts[0] : 'driver';
}

function officialTeamName(teamKeyName, season = activeSeason()) {
  return getTeamMeta(season)[teamKeyName]?.officialName || teamKeyName;
}

function teamLogoPath(teamKeyName, season = activeSeason()) {
  const slug = getTeamMeta(season)[teamKeyName]?.logoSlug || String(teamKeyName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return '/team-logos/' + slug + '.png';
}

function headshotPath(driver) {
  return '/assets/driver-headshots/' + driverAssetToken(driver) + '-headshot.png';
}

function formatDriverDeckName(name) {
  const clean = String(name || '').trim().replace(/\s+/g, ' ');
  if (!clean) return 'Unknown DRIVER';
  const parts = clean.split(' ');
  if (parts.length === 1) return parts[0].toUpperCase();
  const first = parts.slice(0, -1).join(' ');
  const last = parts[parts.length - 1].toUpperCase();
  return first + ' ' + last;
}

function normalizeDriverNameKey(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function driverNumberFor(driver) {
  const driverId = String(driver?.driverId || '').trim();
  if (driverId && DRIVER_NUMBERS_BY_ID.has(driverId)) {
    return DRIVER_NUMBERS_BY_ID.get(driverId);
  }

  const key = normalizeDriverNameKey(driver?.driverName || '');
  if (key && DRIVER_NUMBERS_BY_NAME.has(key)) {
    return DRIVER_NUMBERS_BY_NAME.get(key);
  }

  return null;
}

function driverNumberTag(driver) {
  const number = driverNumberFor(driver);
  if (number === null || number === undefined) return '';
  return `<span class="driver-number-tag">#${number}</span>`;
}

function teamKey(teamName, season = activeSeason()) {
  const raw = String(teamName || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  const normalized = displayTeamName(teamName);
  const order = getTeamOrder(season);

  if (
    raw === 'haas' ||
    raw === 'haas f1 team' ||
    raw === 'moneygram haas f1 team' ||
    raw === 'tgr haas f1 team' ||
    normalized === 'Haas' ||
    normalized === 'Haas F1 Team'
  ) return 'Haas F1 Team';

  if (
    raw === 'kick sauber' ||
    raw === 'stake f1 team kick sauber' ||
    raw === 'stake sauber' ||
    raw === 'sauber' ||
    raw === 'audi' ||
    raw === 'audi revolut f1 team' ||
    normalized === 'Kick Sauber' ||
    normalized === 'Audi' ||
    normalized === 'Sauber'
  ) return 'Audi';

  if (order.includes(normalized)) return normalized;
  return normalized;
}

function byTeamFromStats(stats, season = activeSeason()) {
  const map = new Map();
  for (const key of getTeamOrder(season)) map.set(key, []);

  const ordered = sortDriversForDropdown(stats || []);
  for (const driver of ordered) {
    const key = teamKey(driver.team, season);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(driver);
  }

  return map;
}

function sortedStats(stats) {
  return [...(stats || [])].sort((a, b) => {
    if ((b.points || 0) !== (a.points || 0)) return (b.points || 0) - (a.points || 0);
    const am = a.combined_intel?.momentum_index ?? -999;
    const bm = b.combined_intel?.momentum_index ?? -999;
    if (bm !== am) return bm - am;
    return String(a.driverName || '').localeCompare(String(b.driverName || ''));
  });
}

function findDriver(stats, driverId) {
  if (!driverId) return null;
  return (stats || []).find((row) => row.driverId === driverId) || null;
}

function teamSlug(teamName, season = activeSeason()) {
  const key = teamKey(teamName, season);
  return (getTeamMeta(season)[key]?.logoSlug || String(key || '').toLowerCase().replace(/[^a-z0-9]+/g, '-')).trim();
}

function parseHexToRgb(hex) {
  const raw = String(hex || '').trim().replace(/^#/, '');
  const full = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [225, 6, 0];
  return [
    Number.parseInt(full.slice(0, 2), 16),
    Number.parseInt(full.slice(2, 4), 16),
    Number.parseInt(full.slice(4, 6), 16)
  ];
}

function textColorFor(hex) {
  const [r, g, b] = parseHexToRgb(hex);
  const luminance = (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  return luminance > 156 ? '#0d1623' : '#f6f9ff';
}

function teamColors(teamName, season = activeSeason()) {
  const key = teamKey(teamName, season);
  return TEAM_COLORS[key] || { primary: '#e10600', secondary: '#7f8794' };
}

function teamToneVars(teamName, season = activeSeason()) {
  const { primary, secondary } = teamColors(teamName, season);
  const [pr, pg, pb] = parseHexToRgb(primary);
  const [sr, sg, sb] = parseHexToRgb(secondary);
  const ink = textColorFor(primary);
  const inkAccent = textColorFor(secondary);
  return `--team-primary:${primary};--team-secondary:${secondary};--team-primary-rgb:${pr}, ${pg}, ${pb};--team-secondary-rgb:${sr}, ${sg}, ${sb};--team-ink:${ink};--team-ink-accent:${inkAccent};`;
}

function getAccentTeam(stats) {
  const active = findDriver(stats, activeDriverId);
  const compare = findDriver(stats, compareDriverId);
  const ordered = [active, compare].filter(Boolean);
  return ordered.length ? teamKey(ordered[0].team, activeSeason()) : null;
}

function clearTeamAccentClasses() {
  const classes = [...document.body.classList].filter((name) => name.startsWith('team-accent-'));
  for (const name of classes) document.body.classList.remove(name);
}

function syncTeamAccentState(stats) {
  const accentTeam = getAccentTeam(stats);
  clearTeamAccentClasses();

  if (!accentTeam) {
    document.body.classList.remove('team-accent-active');
    document.body.style.removeProperty('--team-accent-primary');
    document.body.style.removeProperty('--team-accent-secondary');
    document.body.style.removeProperty('--team-accent-primary-rgb');
    document.body.style.removeProperty('--team-accent-secondary-rgb');
    document.body.style.removeProperty('--team-accent-ink');
    return;
  }

  const season = activeSeason();
  const slug = teamSlug(accentTeam, season);
  const { primary, secondary } = teamColors(accentTeam, season);
  const [pr, pg, pb] = parseHexToRgb(primary);
  const [sr, sg, sb] = parseHexToRgb(secondary);

  document.body.classList.add('team-accent-active');
  document.body.classList.add(`team-accent-${slug}`);
  document.body.style.setProperty('--team-accent-primary', primary);
  document.body.style.setProperty('--team-accent-secondary', secondary);
  document.body.style.setProperty('--team-accent-primary-rgb', `${pr}, ${pg}, ${pb}`);
  document.body.style.setProperty('--team-accent-secondary-rgb', `${sr}, ${sg}, ${sb}`);
  document.body.style.setProperty('--team-accent-ink', textColorFor(primary));
}

async function fetchJson(url, options = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        const raw = await res.text();
        let msg = raw;
        try {
          const parsed = JSON.parse(raw);
          msg = parsed?.error || parsed?.message || raw;
        } catch {
          // keep raw message
        }
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
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }

  throw new Error(`Failed to fetch ${url}`);
}

function option(label, value) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function logoFor(team, season = activeSeason()) {
  const key = teamKey(team, season);
  return `<img class="logo" src="${teamLogoPath(key, season)}" alt="${key} logo" onerror="this.remove()">`;
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

function formatDeltaSeconds(value, digits = 3, showPlus = true, suffix = 's') {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const sec = Number(value) / 1000;
  const sign = showPlus && sec > 0 ? '+' : '';
  return `${sign}${sec.toFixed(digits)}${suffix}`;
}

function formatLapTime(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const total = Math.max(0, Math.round(Number(value)));
  const mins = Math.floor(total / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  const millis = total % 1000;
  return `${mins}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}

function averageFinite(values) {
  const nums = (values || []).map(Number).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

function computePaceStatus(deltaMs) {
  const n = Number(deltaMs);
  if (!Number.isFinite(n)) return null;
  if (n <= -180) return { label: 'Elite', tone: 'good' };
  if (n <= 50) return { label: 'Solid', tone: 'warn' };
  return { label: 'Off-pace', tone: 'bad' };
}

function computeConsistencyStatus(consistencyMs) {
  const n = Number(consistencyMs);
  if (!Number.isFinite(n)) return null;
  if (n <= 250) return { label: 'Elite', tone: 'good' };
  if (n <= 500) return { label: 'Solid', tone: 'warn' };
  return { label: 'Off-pace', tone: 'bad' };
}

function statusChip(status) {
  if (!status || !status.label) return '';
  const tone = status.tone || 'muted';
  return `<span class="intel-status-chip ${tone}">${status.label}</span>`;
}

function pickQualiGapMs(qi) {
  const staged = [
    qi?.teammate_gap_by_stage?.q3?.avg_ms,
    qi?.teammate_gap_by_stage?.q2?.avg_ms,
    qi?.teammate_gap_by_stage?.q1?.avg_ms
  ].map(Number).filter(Number.isFinite);
  return staged.length ? staged[0] : null;
}

function formatSeries(series) {
  if (!Array.isArray(series) || !series.length) return '—';
  return series.map((v) => (v === null || v === undefined ? '—' : String(v))).join(' · ');
}

function formatHeadToHead(qi) {
  const wins = Number(qi?.head_to_head?.wins || 0);
  const losses = Number(qi?.head_to_head?.losses || 0);
  return `${wins}:${losses}`;
}
function normalizeTrendDirection(direction) {
  const d = String(direction || 'flat').toLowerCase();
  if (d === 'surging' || d === 'up') return 'improving';
  if (d === 'dropping' || d === 'down') return 'worsening';
  return 'steady';
}

function summarizePositionSeries(series) {
  const nums = (Array.isArray(series) ? series : []).map(Number).filter(Number.isFinite);
  if (!nums.length) return '—';
  if (nums.length === 1) return `P${nums[0]}`;
  return `P${nums[0]}→P${nums[nums.length - 1]}`;
}

function renderMetricTile({
  driverId,
  metricKey,
  rawValue,
  displayValue,
  better = 'higher',
  label,
  secondary = '',
  status = null,
  infoKey = ''
}) {
  const main = metricKey
    ? metricStrong(driverId, metricKey, rawValue, displayValue, better)
    : `<strong>${displayValue}</strong>`;
  const info = infoKey || metricKey || '';

  return `
    <div class="intel-metric-card">
      ${metricLabelHtml(label, info)}
      ${main}
      <em class="intel-metric-sub">${secondary || '&nbsp;'}</em>
      ${statusChip(status)}
    </div>
  `;
}

function renderDetailRow(label, key, value) {
  return `<div><dt>${metricLabelHtml(label, key, 'dl-label')}</dt><dd>${value}</dd></div>`;
}

function renderDetailSection(title, rows) {
  if (!Array.isArray(rows) || !rows.length) return '';
  return `
    <section class="intel-detail-section">
      <div class="intel-subtitle">${title}</div>
      <dl>${rows.join('')}</dl>
    </section>
  `;
}

function formatStageGapCompact(qi) {
  const pieces = ['q1', 'q2', 'q3']
    .map((stage) => {
      const value = qi?.teammate_gap_by_stage?.[stage]?.avg_ms;
      if (!Number.isFinite(Number(value))) return null;
      return `${stage.toUpperCase()} ${formatDeltaSeconds(value, 3, true)}`;
    })
    .filter(Boolean);

  return pieces.length ? pieces.join(' · ') : 'No stage split yet';
}

function formatSampleSizeCompact(sample) {
  const raceStarts = Number(sample?.race_starts || 0);
  const qualiStarts = Number(sample?.quali_starts || 0);
  const compared = Math.max(raceStarts, qualiStarts);

  if (!compared) return '—';
  if (raceStarts && qualiStarts && raceStarts === qualiStarts) {
    return `${raceStarts} round${raceStarts === 1 ? '' : 's'}`;
  }

  const pieces = [];
  if (raceStarts) pieces.push(`${raceStarts} race${raceStarts === 1 ? '' : 's'}`);
  if (qualiStarts) pieces.push(`${qualiStarts} quali`);
  return pieces.join(' · ');
}

function computeRiskProfile(ri, sample) {
  const dnfRate = Number(ri?.dnf_rate);
  const consistency = Number(ri?.lap_pace_consistency_ms);
  const roundSample = Math.max(Number(sample?.race_starts || 0), Number(sample?.quali_starts || 0));

  let score = 0;
  score += Number.isFinite(dnfRate) ? Math.min(1, Math.max(0, dnfRate * 2.5)) * 0.45 : 0.12;
  score += Number.isFinite(consistency) ? Math.min(1, Math.max(0, (consistency - 250) / 900)) * 0.35 : 0.1;
  score += roundSample >= 6 ? 0 : roundSample >= 3 ? 0.1 : 0.22;

  let label = 'Medium';
  let tone = 'warn';
  if (score < 0.28) {
    label = 'Low';
    tone = 'good';
  } else if (score >= 0.55) {
    label = 'High';
    tone = 'bad';
  }

  const dnfText = Number.isFinite(dnfRate) ? `DNF ${formatPct(dnfRate, 0)}` : 'DNF —';
  const sampleText = formatSampleSizeCompact(sample);

  return {
    score,
    label,
    tone,
    secondary: `${dnfText} · ${sampleText}`
  };
}

function renderTeamAtlas(stats) {

  if (!teamAtlas || !teamDetail) return;

  const season = activeSeason();
  const teamOrder = getTeamOrder(season);
  const teamMap = byTeamFromStats(stats, season);
  const teamsWithDrivers = teamOrder.filter((key) => (teamMap.get(key) || []).length > 0);

  if (!activeTeamKey || !teamOrder.includes(activeTeamKey)) {
    activeTeamKey = teamsWithDrivers[0] || teamOrder[0];
  }

  teamAtlas.innerHTML = teamOrder.map((key) => {
    const drivers = teamMap.get(key) || [];
    const chips = drivers.length
      ? drivers.map((d) => `<span class="team-driver-chip team-tone" style="${teamToneVars(d.team, season)}">${formatDriverDeckName(d.driverName)}</span>`).join('')
      : '<span class="team-driver-chip muted">No driver stats yet</span>';

    return `
      <button class="team-master-card team-tone ${activeTeamKey === key ? 'active' : ''}" style="${teamToneVars(key, season)}" data-team-key="${key}" type="button">
        <div class="team-master-head">
          <img class="team-master-logo" src="${teamLogoPath(key, season)}" alt="${key} logo" onerror="this.style.visibility='hidden'" />
          <span class="chip">${drivers.length ? `${drivers.length} drivers` : 'No data'}</span>
        </div>
        <div class="team-master-title">${officialTeamName(key, season)}</div>
        <div class="team-master-drivers">${chips}</div>
      </button>
    `;
  }).join('');

  if (teamAtlasStatus) {
    teamAtlasStatus.textContent = `${teamsWithDrivers.length}/${teamOrder.length} teams loaded`;
  }

  for (const btn of teamAtlas.querySelectorAll('.team-master-card')) {
    btn.addEventListener('click', () => {
      activeTeamKey = btn.getAttribute('data-team-key') || activeTeamKey;
      activeDriverId = null;
      compareDriverId = null;
      renderTeamAtlas(stats);
      renderSelectionAndCards(stats);
      renderTeamDetail(stats);
    });
  }

  renderTeamDetail(stats);
}

function renderTeamDetail(stats) {
  if (!teamDetail) return;

  const season = activeSeason();
  const teamMap = byTeamFromStats(stats, season);
  const drivers = teamMap.get(activeTeamKey) || [];

  if (!drivers.length) {
    teamDetail.innerHTML = `
      <article class="team-drill-card">
        <header>
          <h3>${officialTeamName(activeTeamKey, season)}</h3>
          <p class="muted">No driver stats synced yet for this team.</p>
        </header>
      </article>
    `;
    return;
  }

  const cards = drivers.map((driver) => {
    const qi = driver.qualifying_intel || {};
    const ri = driver.race_intel || {};
    const ci = driver.combined_intel || {};
    const isActive = activeDriverId === driver.driverId;
    const isCompare = compareDriverId === driver.driverId;
    const toneVars = teamToneVars(driver.team, season);

    return `
      <article class="team-driver-card team-tone ${isActive ? 'is-active' : ''} ${isCompare ? 'is-compare' : ''}" style="${toneVars}">
        <div class="team-driver-media">
          <img class="team-driver-headshot" src="${headshotPath(driver)}" alt="${driver.driverName} headshot" onerror="this.onerror=null;this.src='/assets/placeholders/headshot-fallback.png'" />
        </div>
        <div class="team-driver-body">
          <div class="team-driver-head-row">
            <h4 class="team-tone-text" style="${toneVars}">${formatDriverDeckName(driver.driverName)}</h4>
            ${driverNumberTag(driver)}
          </div>
          <p class="muted">${logoFor(driver.team, season)}${officialTeamName(activeTeamKey, season)}</p>
          <div class="team-driver-metrics">
            <span>${metricLabelHtml('Points', 'points', 'mini-label')}<strong>${driver.points || 0}</strong></span>
            <span>${metricLabelHtml('Weekend', 'c_weekend_score', 'mini-label')}<strong>${formatNumber(ci.weekend_score, 1)}</strong></span>
            <span>${metricLabelHtml('Momentum', 'c_momentum', 'mini-label')}<strong>${formatSigned(ci.momentum_index, 2)}</strong></span>
            <span>${metricLabelHtml('Q3', 'q3_appearances', 'mini-label')}<strong>${qi.q3_appearances ?? 0}</strong></span>
            <span>${metricLabelHtml('Avg Race', 'avg_race_finish', 'mini-label')}<strong>${formatNumber(ri.avg_race_finish, 2)}</strong></span>
            <span>${metricLabelHtml('H2H', 'head_to_head', 'mini-label')}<strong>${formatHeadToHead(qi)}</strong></span>
          </div>
          <div class="team-driver-actions">
            <button class="btn ghost team-driver-open-btn ${isActive ? 'active' : ''}" type="button" data-driver-id="${driver.driverId}">View Intelligence</button>
            <button class="btn ghost team-driver-compare-btn ${isCompare ? 'active' : ''}" type="button" data-driver-id="${driver.driverId}">Compare</button>
          </div>
        </div>
      </article>
    `;
  }).join('');

  teamDetail.innerHTML = `
    <article class="team-drill-card">
      <header class="team-drill-head">
        <div>
          <h3>${officialTeamName(activeTeamKey, season)}</h3>
          <p class="muted">Select one driver to open intelligence, optional second for compare.</p>
        </div>
        <img class="team-drill-logo" src="${teamLogoPath(activeTeamKey, season)}" alt="${activeTeamKey} logo" onerror="this.style.visibility='hidden'" />
      </header>
      <div class="team-driver-grid">${cards}</div>
    </article>
  `;

  for (const btn of teamDetail.querySelectorAll('.team-driver-open-btn')) {
    btn.addEventListener('click', () => {
      activeDriverId = btn.getAttribute('data-driver-id');
      compareDriverId = null;
      renderSelectionAndCards(latestStats);
      renderTeamDetail(latestStats);
    });
  }

  for (const btn of teamDetail.querySelectorAll('.team-driver-compare-btn')) {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-driver-id');
      if (!activeDriverId) {
        activeDriverId = id;
        compareDriverId = null;
      } else if (id === activeDriverId) {
        compareDriverId = null;
      } else {
        compareDriverId = id;
      }
      renderSelectionAndCards(latestStats);
      renderTeamDetail(latestStats);
    });
  }
}

function bindExpandButtons() {
  const buttons = statsTable.querySelectorAll('.intel-expand-toggle');
  for (const btn of buttons) {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;
      const panel = document.getElementById(targetId);
      if (!panel) return;

      const isHidden = panel.hasAttribute('hidden');
      if (isHidden) {
        panel.removeAttribute('hidden');
        btn.textContent = 'Hide details';
        btn.setAttribute('aria-expanded', 'true');
      } else {
        panel.setAttribute('hidden', '');
        btn.textContent = 'Expand details';
        btn.setAttribute('aria-expanded', 'false');
      }
    });
  }
}

function metricStrong(driverId, key, rawValue, displayValue, better = 'higher') {
  const hasNumber = Number.isFinite(Number(rawValue));
  const rawAttr = hasNumber ? ` data-raw="${Number(rawValue)}"` : '';
  return `<strong class="metric-value" data-driver-id="${driverId}" data-metric="${key}" data-better="${better}"${rawAttr}>${displayValue}</strong>`;
}

function buildDriverIntelCard(s) {
  const qi = s.qualifying_intel || {};
  const ri = s.race_intel || {};
  const ci = s.combined_intel || {};
  const qTrend = ci.quali_trend_last5 || {};
  const rTrend = ci.race_trend_last5 || {};
  const driverToken = String(s.driverId || 'driver').replace(/[^a-z0-9_-]/gi, '-');
  const toneVars = teamToneVars(s.team, activeSeason());

  const qualMoreId = `qual-more-${driverToken}`;
  const raceMoreId = `race-more-${driverToken}`;
  const combinedMoreId = `combined-more-${driverToken}`;

  const stintRows = Array.isArray(ri.stint_pace_by_compound) ? ri.stint_pace_by_compound : [];
  const stintAverages = stintRows.map((row) => Number(row.avg_lap_ms)).filter(Number.isFinite);
  const racePaceDeltaMs = stintAverages.length > 1 ? (Math.max(...stintAverages) - Math.min(...stintAverages)) : null;

  const qStageAvgGaps = [
    qi?.teammate_gap_by_stage?.q1?.avg_ms,
    qi?.teammate_gap_by_stage?.q2?.avg_ms,
    qi?.teammate_gap_by_stage?.q3?.avg_ms
  ].map(Number).filter(Number.isFinite);
  const bestQualiGapMs = qStageAvgGaps.length ? Math.min(...qStageAvgGaps) : null;
  const avgQualiGapMs = averageFinite(qStageAvgGaps);
  const teammateQualiGapMs = pickQualiGapMs(qi);
  const q3Rate = qi?.stage_survival_rate?.q3;
  const qComparedRounds = Number(qi?.head_to_head?.compared_rounds || 0);

  const qTrendLabel = normalizeTrendDirection(qTrend.direction);
  const rTrendLabel = normalizeTrendDirection(rTrend.direction);
  const qTrendRun = summarizePositionSeries(qTrend.series || []);
  const rTrendRun = summarizePositionSeries(rTrend.series || []);
  const trendSnapshot = `Q ${qTrendRun} · R ${rTrendRun}`;
  const hasOfficialData = Math.max(Number(s.sample?.race_starts || 0), Number(s.sample?.quali_starts || 0)) > 0;
  const preSeasonSecondary = 'No official round data yet';
  const riskProfile = hasOfficialData
    ? computeRiskProfile(ri, s.sample)
    : { score: null, label: '—', tone: 'muted', secondary: preSeasonSecondary };
  const sampleSize = hasOfficialData ? formatSampleSizeCompact(s.sample) : 'No rounds yet';
  const sessionConversionSecondary = hasOfficialData
    ? `${qi.q3_appearances ?? 0} Q3 · ${qi.q1_knockouts ?? 0} Q1 exits`
    : preSeasonSecondary;
  const teammateEdgeSecondary = hasOfficialData
    ? `Best ${formatDeltaSeconds(bestQualiGapMs, 3, true)} · ${formatStageGapCompact(qi)}`
    : preSeasonSecondary;
  const pacePackageSecondary = !hasOfficialData
    ? preSeasonSecondary
    : racePaceDeltaMs === null
      ? 'No compound split yet'
      : `${formatMs(racePaceDeltaMs, 0)} stint spread · ${formatMs(ri.lap_pace_consistency_ms, 0)} sigma`;
  const positionCraftSecondary = hasOfficialData
    ? `Lap 1 ${formatSigned(ri.first_lap_gain_loss, 2)} · Recovery ${formatSigned(ri.recovery_index, 2)}`
    : preSeasonSecondary;
  const formTrendSecondary = hasOfficialData
    ? `${trendSnapshot} · ${qTrendLabel}/${rTrendLabel}`
    : preSeasonSecondary;
  const qHitSecondary = hasOfficialData
    ? `Avg delta ${formatSigned(ci.quali_to_race_conversion?.avg_delta, 2)}`
    : preSeasonSecondary;
  const formSeriesLabel = hasOfficialData ? formatSeries(s.form?.positions || []) : 'Pre-season';

  const stintHtml = stintRows.length
    ? stintRows.map((row) => `<span class="chip">${row.compound}: ${formatLapTime(row.avg_lap_ms)} (${row.laps} laps)</span>`).join('')
    : `<span class="chip">${hasOfficialData ? 'No race timing laps yet' : preSeasonSecondary}</span>`;

  const qualDetails = [
    renderDetailSection('Session Depth', [
      renderDetailRow('Q3 appearances', 'q3_appearances', qi.q3_appearances ?? 0),
      renderDetailRow('Q2 appearances', 'q2_appearances', qi.q2_appearances ?? 0),
      renderDetailRow('Q1 knockouts', 'q1_knockouts', qi.q1_knockouts ?? 0),
      renderDetailRow('Q2 survival rate', 'q2_survival_rate', formatPct(qi.stage_survival_rate?.q2, 1)),
      renderDetailRow('Q3 survival rate', 'q3_survival_rate', formatPct(qi.stage_survival_rate?.q3, 1))
    ]),
    renderDetailSection('Pace Change', [
      renderDetailRow('Q1→Q2 delta', 'q1_q2_delta', `${formatDeltaSeconds(qi.q1_to_q2_improvement_ms, 3, true)} (${formatMs(qi.q1_to_q2_improvement_ms, 0)})`),
      renderDetailRow('Q2→Q3 delta', 'q2_q3_delta', `${formatDeltaSeconds(qi.q2_to_q3_improvement_ms, 3, true)} (${formatMs(qi.q2_to_q3_improvement_ms, 0)})`),
      renderDetailRow('Pole count', 'pole_count', qi.pole_count ?? 0),
      renderDetailRow('Worst grid position', 'worst_grid_position', qi.worst_grid_position ?? '—')
    ]),
    renderDetailSection('Stage Split vs Teammate', [
      renderDetailRow('Teammate gap Q1 avg', 'teammate_gap_q1_avg', `${formatDeltaSeconds(qi.teammate_gap_by_stage?.q1?.avg_ms, 3, true)} (${formatMs(qi.teammate_gap_by_stage?.q1?.avg_ms, 0)})`),
      renderDetailRow('Teammate gap Q2 avg', 'teammate_gap_q2_avg', `${formatDeltaSeconds(qi.teammate_gap_by_stage?.q2?.avg_ms, 3, true)} (${formatMs(qi.teammate_gap_by_stage?.q2?.avg_ms, 0)})`),
      renderDetailRow('Teammate gap Q3 avg', 'teammate_gap_q3_avg', `${formatDeltaSeconds(qi.teammate_gap_by_stage?.q3?.avg_ms, 3, true)} (${formatMs(qi.teammate_gap_by_stage?.q3?.avg_ms, 0)})`),
      renderDetailRow('Teammate gap Q1 median', 'teammate_gap_q1_median', `${formatDeltaSeconds(qi.teammate_gap_by_stage?.q1?.median_ms, 3, true)} (${formatMs(qi.teammate_gap_by_stage?.q1?.median_ms, 0)})`),
      renderDetailRow('Teammate gap Q2 median', 'teammate_gap_q2_median', `${formatDeltaSeconds(qi.teammate_gap_by_stage?.q2?.median_ms, 3, true)} (${formatMs(qi.teammate_gap_by_stage?.q2?.median_ms, 0)})`),
      renderDetailRow('Teammate gap Q3 median', 'teammate_gap_q3_median', `${formatDeltaSeconds(qi.teammate_gap_by_stage?.q3?.median_ms, 3, true)} (${formatMs(qi.teammate_gap_by_stage?.q3?.median_ms, 0)})`)
    ])
  ].join('');

  const raceDetails = [
    renderDetailSection('Position Craft Detail', [
      renderDetailRow('Pit-cycle position delta', 'pit_cycle_position_delta', formatSigned(ri.pit_cycle_position_delta, 2)),
      renderDetailRow('Restart gain/loss', 'restart_gain_loss', formatSigned(ri.restart_gain_loss, 2)),
      renderDetailRow('Recovery index', 'recovery_index', formatSigned(ri.recovery_index, 2)),
      renderDetailRow('First-lap gain/loss', 'first_lap_gain_loss', formatSigned(ri.first_lap_gain_loss, 2))
    ]),
    renderDetailSection('Race Stability', [
      renderDetailRow('Fastest lap count', 'fastest_lap_count', ri.fastest_lap_count ?? 0),
      renderDetailRow('DNF rate', 'dnf_rate', formatPct(ri.dnf_rate, 1))
    ])
  ].join('');

  const combinedDetails = [
    renderDetailSection('Trend Detail', [
      renderDetailRow('Quali trend slope', 'quali_trend_slope', formatSigned(qTrend.slope, 3)),
      renderDetailRow('Quali trend series', 'quali_trend_series', formatSeries(qTrend.series || [])),
      renderDetailRow('Race trend slope', 'race_trend_slope', formatSigned(rTrend.slope, 3)),
      renderDetailRow('Race trend series', 'race_trend_series', formatSeries(rTrend.series || []))
    ]),
    renderDetailSection('Conversion Baseline', [
      renderDetailRow('Quali→race delta', 'quali_race_delta', formatSigned(ci.quali_to_race_conversion?.avg_delta, 2)),
      renderDetailRow('Quali teammate baseline', 'quali_teammate_baseline', `${formatDeltaSeconds(teammateQualiGapMs, 3, true)} (${formatMs(teammateQualiGapMs, 0)})`)
    ])
  ].join('');

  return `
    <article id="intel-driver-${driverToken}" class="intel-driver-card team-tone" style="${toneVars}" data-driver-id="${s.driverId}">
      <header class="intel-driver-head">
        <div>
          <div class="intel-driver-title-row">
            <h3 class="team-tone-text" style="${toneVars}">${s.driverName}</h3>
            ${driverNumberTag(s)}
          </div>
          <p class="muted">${logoFor(s.team)}${s.team}</p>
        </div>
        <div class="intel-scorepack">
          <span class="chip dark">${metricLabelHtml('Pts', 'points', 'chip-label')} ${metricStrong(s.driverId, 'points', s.points || 0, s.points || 0, 'higher')}</span>
          <span class="chip">${metricLabelHtml('Wins', 'wins', 'chip-label')} ${metricStrong(s.driverId, 'wins', s.wins || 0, s.wins || 0, 'higher')}</span>
          <span class="chip">${metricLabelHtml('Podiums', 'podiums', 'chip-label')} ${metricStrong(s.driverId, 'podiums', s.podiums || 0, s.podiums || 0, 'higher')}</span>
          <span class="chip">${metricLabelHtml('Poles', 'poles', 'chip-label')} ${metricStrong(s.driverId, 'poles', s.poles || 0, s.poles || 0, 'higher')}</span>
          <span class="chip">${metricLabelHtml('Fastest', 'fastest_laps', 'chip-label')} ${metricStrong(s.driverId, 'fastest_laps', s.fastest_laps || 0, s.fastest_laps || 0, 'higher')}</span>
        </div>
      </header>

      <section class="intel-strip">
        <span>${metricLabelHtml('Avg finish', 'avg_finish', 'strip-label')}${metricStrong(s.driverId, 'avg_finish', s.avg_finish, formatNumber(s.avg_finish, 2), 'lower')}</span>
        <span>${metricLabelHtml('Avg quali', 'avg_quali', 'strip-label')}${metricStrong(s.driverId, 'avg_quali', s.avg_quali, formatNumber(s.avg_quali, 2), 'lower')}</span>
        <span>${metricLabelHtml('Form avg', 'form_avg', 'strip-label')}${metricStrong(s.driverId, 'form_avg', s.form?.avg_finish, formatNumber(s.form?.avg_finish, 2), 'lower')}</span>
        <span>${metricLabelHtml('Form pts', 'form_points', 'strip-label')}${metricStrong(s.driverId, 'form_points', s.form?.points ?? 0, s.form?.points ?? 0, 'higher')}</span>
        <span>${metricLabelHtml('Form series', 'form_series', 'strip-label')}<strong>${formSeriesLabel}</strong></span>
      </section>

      <div class="intel-grid">
        <section class="intel-panel intel-panel-collapsible">
          <div class="intel-panel-head">
            <h4>Quali Profile</h4>
            <button class="btn ghost intel-expand-toggle" type="button" data-target="${qualMoreId}" aria-expanded="false">Expand details</button>
          </div>
          <div class="intel-core-grid">
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'avg_quali_position',
              rawValue: qi.avg_quali_position,
              displayValue: formatNumber(qi.avg_quali_position, 2),
              better: 'lower',
              label: 'Avg Quali Position',
              secondary: hasOfficialData ? `Over ${sampleSize}` : preSeasonSecondary
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'best_grid_position',
              rawValue: qi.best_grid_position,
              displayValue: qi.best_grid_position ?? '—',
              better: 'lower',
              label: 'Best Grid Position',
              secondary: hasOfficialData ? `Worst ${qi.worst_grid_position ?? '—'}` : preSeasonSecondary
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'final_run_clutch_rank',
              rawValue: qi.final_run_clutch_rank,
              displayValue: formatNumber(qi.final_run_clutch_rank, 2),
              better: 'lower',
              label: 'Final-Run Clutch',
              secondary: hasOfficialData ? `${qComparedRounds} rounds sampled` : preSeasonSecondary
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: null,
              rawValue: null,
              displayValue: formatHeadToHead(qi),
              better: 'higher',
              label: 'Head to Head',
              secondary: hasOfficialData ? `${qComparedRounds} rounds` : preSeasonSecondary,
              infoKey: 'head_to_head'
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'q_avg_delta',
              rawValue: avgQualiGapMs,
              displayValue: formatDeltaSeconds(avgQualiGapMs, 3, true),
              better: 'lower',
              label: 'Teammate Quali Edge',
              secondary: teammateEdgeSecondary,
              status: computePaceStatus(avgQualiGapMs),
              infoKey: 'teammate_qual_edge'
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'q3_rate',
              rawValue: q3Rate,
              displayValue: formatPct(q3Rate, 1),
              better: 'higher',
              label: 'Session Conversion',
              secondary: sessionConversionSecondary,
              infoKey: 'session_conversion'
            })}
          </div>
          <div id="${qualMoreId}" class="intel-expand-content" hidden>
            ${qualDetails}
          </div>
        </section>

        <section class="intel-panel intel-panel-collapsible">
          <div class="intel-panel-head">
            <h4>Race Profile</h4>
            <button class="btn ghost intel-expand-toggle" type="button" data-target="${raceMoreId}" aria-expanded="false">Expand details</button>
          </div>
          <div class="intel-core-grid intel-core-grid-race">
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'avg_race_finish',
              rawValue: ri.avg_race_finish,
              displayValue: formatNumber(ri.avg_race_finish, 2),
              better: 'lower',
              label: 'Avg Race Finish',
              secondary: hasOfficialData ? `Across ${sampleSize}` : preSeasonSecondary
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'points_conversion_rate',
              rawValue: ri.points_conversion_rate,
              displayValue: formatPct(ri.points_conversion_rate, 1),
              better: 'higher',
              label: 'Points Conversion',
              secondary: hasOfficialData ? `DNF ${formatPct(ri.dnf_rate, 1)}` : preSeasonSecondary
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'r_teammate_gap',
              rawValue: ri.teammate_race_pace_gap_ms,
              displayValue: formatDeltaSeconds(ri.teammate_race_pace_gap_ms, 3, true),
              better: 'lower',
              label: 'Teammate Race Gap',
              secondary: hasOfficialData ? formatMs(ri.teammate_race_pace_gap_ms, 0) : preSeasonSecondary,
              status: hasOfficialData ? computePaceStatus(ri.teammate_race_pace_gap_ms) : null
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'r_pace_delta',
              rawValue: racePaceDeltaMs,
              displayValue: formatDeltaSeconds(racePaceDeltaMs, 3, false),
              better: 'lower',
              label: 'Pace Package',
              secondary: pacePackageSecondary,
              status: hasOfficialData ? computeConsistencyStatus(racePaceDeltaMs ?? ri.lap_pace_consistency_ms) : null,
              infoKey: 'pace_package'
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'r_consistency',
              rawValue: ri.lap_pace_consistency_ms,
              displayValue: formatDeltaSeconds(ri.lap_pace_consistency_ms, 3, false, 's σ'),
              better: 'lower',
              label: 'Lap Consistency',
              secondary: hasOfficialData ? formatMs(ri.lap_pace_consistency_ms, 0) : preSeasonSecondary,
              status: hasOfficialData ? computeConsistencyStatus(ri.lap_pace_consistency_ms) : null
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'r_net_positions',
              rawValue: ri.positions_gained_lost,
              displayValue: formatSigned(ri.positions_gained_lost, 2),
              better: 'higher',
              label: 'Position Craft',
              secondary: positionCraftSecondary,
              infoKey: 'position_craft'
            })}
          </div>
          <div id="${raceMoreId}" class="intel-expand-content" hidden>
            ${raceDetails}
            <div class="intel-subtitle">${metricLabelHtml('Stint Pace by Compound', 'stint_pace_compound', 'subtitle-label')}</div>
            <div class="intel-stints">${stintHtml}</div>
          </div>
        </section>

        <section class="intel-panel intel-panel-collapsible">
          <div class="intel-panel-head">
            <h4>Weekend Signal</h4>
            <button class="btn ghost intel-expand-toggle" type="button" data-target="${combinedMoreId}" aria-expanded="false">Expand details</button>
          </div>
          <div class="intel-core-grid intel-core-grid-combined">
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'c_weekend_score',
              rawValue: ci.weekend_score,
              displayValue: formatNumber(ci.weekend_score, 2),
              better: 'higher',
              label: 'Weekend Score',
              secondary: hasOfficialData ? `${sampleSize} in model` : preSeasonSecondary
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'c_momentum',
              rawValue: ci.momentum_index,
              displayValue: formatSigned(ci.momentum_index, 3),
              better: 'higher',
              label: 'Momentum Index',
              secondary: hasOfficialData ? `Quali ${qTrendLabel} · Race ${rTrendLabel}` : preSeasonSecondary
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'c_hit_rate',
              rawValue: ci.quali_to_race_conversion?.hit_rate,
              displayValue: formatPct(ci.quali_to_race_conversion?.hit_rate, 1),
              better: 'higher',
              label: 'Q→R Hit Rate',
              secondary: qHitSecondary
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'c_form_trend',
              rawValue: -((Number(qTrend.slope) || 0) + (Number(rTrend.slope) || 0)),
              displayValue: `${qTrendLabel} / ${rTrendLabel}`,
              better: 'higher',
              label: 'Form Trend',
              secondary: formTrendSecondary,
              infoKey: 'form_trend'
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'c_risk_level',
              rawValue: riskProfile.score,
              displayValue: riskProfile.label,
              better: 'lower',
              label: 'Risk Level',
              secondary: riskProfile.secondary,
              status: { label: riskProfile.label, tone: riskProfile.tone },
              infoKey: 'risk_level'
            })}
            ${renderMetricTile({
              driverId: s.driverId,
              metricKey: 'c_sample_size',
              rawValue: Math.max(Number(s.sample?.race_starts || 0), Number(s.sample?.quali_starts || 0)),
              displayValue: sampleSize,
              better: 'higher',
              label: 'Sample Size',
              secondary: hasOfficialData ? `R ${s.sample?.race_starts ?? 0} · Q ${s.sample?.quali_starts ?? 0}` : preSeasonSecondary,
              infoKey: 'sample_size'
            })}
          </div>
          <div id="${combinedMoreId}" class="intel-expand-content" hidden>
            ${combinedDetails}
          </div>
        </section>
      </div>
    </article>
  `;
}

function applyCompareHighlights(selected) {
  const shell = statsTable?.querySelector('.driver-intel-shell');
  if (!shell || !Array.isArray(selected) || selected.length !== 2) return;

  const [a, b] = selected;
  const els = [...shell.querySelectorAll('.metric-value')];

  for (const el of els) {
    el.classList.remove('metric-better', 'metric-worse', 'metric-even');
  }

  const aMap = new Map();
  const bMap = new Map();

  for (const el of els) {
    const driverId = el.dataset.driverId;
    const key = el.dataset.metric;
    if (!driverId || !key) continue;

    if (driverId === a.driverId) aMap.set(key, el);
    if (driverId === b.driverId) bMap.set(key, el);
  }

  for (const [key, aEl] of aMap.entries()) {
    const bEl = bMap.get(key);
    if (!bEl) continue;

    const aRaw = Number(aEl.dataset.raw);
    const bRaw = Number(bEl.dataset.raw);
    if (!Number.isFinite(aRaw) || !Number.isFinite(bRaw)) continue;

    const better = aEl.dataset.better || bEl.dataset.better || 'higher';
    const equal = Math.abs(aRaw - bRaw) < 1e-9;

    if (equal) {
      aEl.classList.add('metric-even');
      bEl.classList.add('metric-even');
      continue;
    }

    const aIsBetter = better === 'lower' ? aRaw < bRaw : aRaw > bRaw;
    if (aIsBetter) {
      aEl.classList.add('metric-better');
      bEl.classList.add('metric-worse');
    } else {
      aEl.classList.add('metric-worse');
      bEl.classList.add('metric-better');
    }
  }
}

function renderSelectionPanel(stats) {
  if (!statsHighlights) return;

  const active = findDriver(stats, activeDriverId);
  const compare = findDriver(stats, compareDriverId);

  if (!active) {
    statsHighlights.innerHTML = `
      <article class="intel-focus-panel">
        <h3>Intelligence View Locked</h3>
        <p class="muted">No driver cards are shown until you click a team, then click <strong>View Intelligence</strong> on a driver.</p>
      </article>
    `;
    return;
  }

  const compareOptions = sortedStats(stats)
    .filter((d) => d.driverId !== active.driverId)
    .map((d) => `<option value="${d.driverId}" ${compare?.driverId === d.driverId ? 'selected' : ''}>${formatDriverDeckName(d.driverName)} · ${displayTeamName(d.team)}</option>`)
    .join('');

  statsHighlights.innerHTML = `
    <article class="intel-focus-panel">
      <div class="intel-focus-grid">
        <div>
          <span class="intel-focus-label">Primary</span>
          <div class="intel-focus-driver-wrap">
            <div class="intel-focus-driver team-tone-text" style="${teamToneVars(active.team, activeSeason())}">${formatDriverDeckName(active.driverName)}</div>
            ${driverNumberTag(active)}
          </div>
          <div class="muted">${logoFor(active.team)}${displayTeamName(active.team)}</div>
        </div>
        <div>
          <span class="intel-focus-label">Compare</span>
          <select id="compareDriverSelect">
            <option value="">None</option>
            ${compareOptions}
          </select>
          <div class="muted">Optional second card side by side</div>
        </div>
      </div>
      <div class="intel-focus-actions">
        <button class="btn ghost" id="clearCompareBtn" type="button">Clear Compare</button>
        <button class="btn ghost" id="clearFocusBtn" type="button">Clear Focus</button>
      </div>
    </article>
  `;

  const compareSelect = document.getElementById('compareDriverSelect');
  if (compareSelect) {
    compareSelect.addEventListener('change', () => {
      compareDriverId = compareSelect.value || null;
      renderSelectionAndCards(latestStats);
      renderTeamDetail(latestStats);
    });
  }

  const clearCompareBtn = document.getElementById('clearCompareBtn');
  if (clearCompareBtn) {
    clearCompareBtn.addEventListener('click', () => {
      compareDriverId = null;
      renderSelectionAndCards(latestStats);
      renderTeamDetail(latestStats);
    });
  }

  const clearFocusBtn = document.getElementById('clearFocusBtn');
  if (clearFocusBtn) {
    clearFocusBtn.addEventListener('click', () => {
      activeDriverId = null;
      compareDriverId = null;
      renderSelectionAndCards(latestStats);
      renderTeamDetail(latestStats);
    });
  }
}

function renderIntelCards(stats) {
  const active = findDriver(stats, activeDriverId);
  const compare = findDriver(stats, compareDriverId);

  if (!active) {
    statsTable.innerHTML = '<div class="intel-empty-state">Select a team and choose a driver to open intelligence.</div>';
    return;
  }

  const selected = [active];
  if (compare && compare.driverId !== active.driverId) selected.push(compare);

  statsTable.innerHTML = `<div class="driver-intel-shell ${selected.length > 1 ? 'compare-mode' : ''}">${selected.map(buildDriverIntelCard).join('')}</div>`;
  bindExpandButtons();
  applyCompareHighlights(selected);
}

function renderSelectionAndCards(stats) {
  renderSelectionPanel(stats);
  renderIntelCards(stats);
  syncTeamAccentState(stats);
}

function renderStats(stats) {
  latestStats = sortedStats(stats);

  if (!latestStats.length) {
    renderTeamAtlas([]);
    syncTeamAccentState([]);
    statsHighlights.innerHTML = '<div class="muted">No driver intelligence yet. Sync a round from OpenF1 above.</div>';
    statsTable.innerHTML = '<div class="muted" style="padding:12px;">No stats yet.</div>';
    return;
  }

  if (activeDriverId && !findDriver(latestStats, activeDriverId)) {
    activeDriverId = null;
  }
  if (compareDriverId && !findDriver(latestStats, compareDriverId)) {
    compareDriverId = null;
  }
  if (compareDriverId && compareDriverId === activeDriverId) {
    compareDriverId = null;
  }

  renderTeamAtlas(latestStats);
  renderSelectionAndCards(latestStats);
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

async function loadStats() {
  const season = seasonSelect.value;
  const view = activeStatsView();
  const params = new URLSearchParams({ season: String(season), view });
  const stats = await fetchJson(`/api/stats?${params.toString()}`);
  renderStats(stats);
}

function getSelectedRoundMeta() {
  const round = Number(roundSelect?.value || 0);
  return raceWeekends.find((row) => Number(row.round) === round) || null;
}

function renderRoundLabel() {
  if (!roundLabel) return;
  const meta = getSelectedRoundMeta();
  if (!meta) {
    roundLabel.value = '';
    return;
  }

  const start = meta.start_date || meta.dates?.start || '';
  const end = meta.end_date || meta.dates?.end || '';
  roundLabel.value = start && end
    ? `${meta.raceName} (${start} -> ${end})`
    : meta.raceName;
}

async function loadRounds() {
  if (!roundSelect) return;

  const season = Number(seasonSelect.value || 2026);
  const races = await fetchJson(`/api/races?season=${season}`);
  raceWeekends = Array.isArray(races) ? races : [];

  roundSelect.innerHTML = '';
  for (const race of raceWeekends) {
    const label = `R${race.round} · ${race.raceName}`;
    roundSelect.appendChild(option(label, race.round));
  }

  if (!raceWeekends.length) {
    if (openF1SyncStatus) openF1SyncStatus.textContent = 'No rounds found for this season.';
    renderRoundLabel();
    return;
  }

  const now = new Date();
  const completed = raceWeekends
    .filter((race) => {
      const endDate = race.end_date ? new Date(`${race.end_date}T23:59:59Z`) : null;
      return endDate && endDate <= now;
    })
    .sort((a, b) => a.round - b.round);

  const defaultRound = completed.length
    ? completed[completed.length - 1].round
    : raceWeekends[0].round;

  roundSelect.value = String(defaultRound);
  renderRoundLabel();
}

async function syncOpenF1Round() {
  if (!roundSelect || !syncOpenF1Btn) return;

  const season = Number(seasonSelect.value || 2026);
  const round = Number(roundSelect.value || 0);
  if (!round) {
    if (openF1SyncStatus) openF1SyncStatus.textContent = 'Select a round first.';
    return;
  }

  syncOpenF1Btn.disabled = true;
  syncOpenF1Btn.textContent = 'Syncing...';
  if (openF1SyncStatus) openF1SyncStatus.textContent = 'OpenF1 sync in progress...';

  try {
    const result = await fetchJson('/api/openf1/sync-round', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ season, round })
    });

    const imported = result.imported || {};
    const meetingName = result.meeting?.name || 'selected meeting';
    if (openF1SyncStatus) {
      openF1SyncStatus.textContent =
        `Synced ${meetingName}: FP laps ${imported.practiceTiming || 0}, Qualifying ${imported.qualifying || 0}, Race ${imported.race || 0}, Race laps ${imported.raceTiming || 0}.`;
    }

    await loadStats();
  } catch (err) {
    if (openF1SyncStatus) openF1SyncStatus.textContent = `Sync failed: ${err.message}`;
    alert(err.message);
  } finally {
    syncOpenF1Btn.disabled = false;
    syncOpenF1Btn.textContent = 'Sync from OpenF1';
  }
}

async function runRehearsalImportWithChecks() {
  if (!roundSelect || !runRehearsalBtn) return;

  const season = Number(seasonSelect.value || 2026);
  const round = Number(roundSelect.value || 0);
  if (!round) {
    if (openF1SyncStatus) openF1SyncStatus.textContent = 'Select a round first.';
    return;
  }

  const user = String(window.prompt('Run rehearsal as which user?', 'Harrison') || '').trim();
  if (!user) return;

  const pin = String(window.prompt(`Enter ${user}'s PIN to run the rehearsal import.`) || '').trim();
  if (!pin) return;

  runRehearsalBtn.disabled = true;
  runRehearsalBtn.textContent = 'Importing...';
  if (openF1SyncStatus) openF1SyncStatus.textContent = 'Rehearsal import in progress...';

  try {
    const result = await fetchJson('/api/admin/rehearsal/import-round', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user,
        pin,
        season,
        round,
        phase: 'full',
        payload: REHEARSAL_IMPORT_PAYLOAD
      })
    }, 0);

    const [health, weeklyStats, predictions] = await Promise.all([
      fetchJson(`/api/admin/health-check?season=${season}`, {}, 0),
      fetchJson(`/api/weekly/stats?season=${season}`, {}, 0),
      fetchJson(`/api/predictions?season=${season}&round=${round}`, {}, 0)
    ]);

    const roundStats = Array.isArray(weeklyStats?.perRound)
      ? weeklyStats.perRound.find((entry) => Number(entry.round) === round)
      : null;
    const picksSaved = Array.isArray(predictions) ? predictions.length : 0;
    const scoredUsers = Array.isArray(roundStats?.users)
      ? roundStats.users.filter((entry) => !entry.missing).length
      : 0;
    const actualsReady = Boolean(roundStats?.actuals?.p1 && roundStats?.actuals?.pole);
    const checks = [
      health?.ok ? 'health OK' : `health ${health?.counts?.fail || 0} fail`,
      `${picksSaved} pick${picksSaved === 1 ? '' : 's'} loaded`,
      actualsReady ? 'actuals built' : 'actuals missing',
      `${scoredUsers} user${scoredUsers === 1 ? '' : 's'} scored`
    ];

    if (openF1SyncStatus) {
      openF1SyncStatus.textContent =
        `Rehearsal imported for ${result.raceName || `R${round}`}. Checks: ${checks.join(' · ')}.`;
    }

    await loadStats();
  } catch (err) {
    if (openF1SyncStatus) openF1SyncStatus.textContent = `Rehearsal failed: ${err.message}`;
    alert(err.message);
  } finally {
    updateRehearsalButtonState();
    runRehearsalBtn.textContent = 'Import rehearsal + checks';
  }
}

async function handleSeasonChange() {
  await loadRounds();
  updateRehearsalButtonState();
  await loadStats();
}

seasonSelect.addEventListener('change', handleSeasonChange);
if (statsViewSelect) {
  statsViewSelect.addEventListener('change', async () => {
    const view = activeStatsView();
    localStorage.setItem('radar-stats-view', view);
    await loadStats();
  });
}
if (roundSelect) roundSelect.addEventListener('change', renderRoundLabel);
if (syncOpenF1Btn) syncOpenF1Btn.addEventListener('click', syncOpenF1Round);
if (runRehearsalBtn) runRehearsalBtn.addEventListener('click', runRehearsalImportWithChecks);

(async function init() {
  bindMetricHelpTooltips(document);

  if (statsViewSelect) {
    const savedView = String(localStorage.getItem('radar-stats-view') || '').toLowerCase();
    if (STATS_VIEW_MODES.has(savedView)) statsViewSelect.value = savedView;
  }

  await loadSeasons();
  await loadRounds();
  updateRehearsalButtonState();
  await loadStats();
})();
