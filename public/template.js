import { fillDriverSelect, sortDriversForDropdown, sortTeamsForDropdown } from './driver-order.js';

const userSelect = document.getElementById('userSelect');
const seasonSelect = document.getElementById('seasonSelect');
const driverChampion = document.getElementById('driverChampion');
const constructorChampion = document.getElementById('constructorChampion');
const templateForm = document.getElementById('templateForm');
const saveTemplateBtn = templateForm?.querySelector('button[type="submit"]');
const picksStatus = document.getElementById('picksStatus');
const wdcGrid = document.getElementById('wdcGrid');
const wccGrid = document.getElementById('wccGrid');

const WDC_SIZE = 22;
const WCC_SIZE = 11;

let seasonLockState = { locked: false, lockDate: null, timezone: 'America/Chicago' };
let wdcBaseOptions = [];
let wccBaseOptions = [];

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

function parseApiErrorMessage(err) {
  const raw = String(err?.message || 'Request failed');
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.error;
    }
  } catch {
    // Keep raw message when body is plain text.
  }
  return raw;
}

function lockStatusLabel(lock) {
  if (!lock?.lockDate) return 'Championship picks are locked.';
  const tz = lock.timezone || 'local time';
  return `Championship picks are locked as of ${lock.lockDate} (${tz}).`;
}

function applySeasonLock(lock) {
  seasonLockState = lock || { locked: false, lockDate: null, timezone: 'America/Chicago' };
  const locked = Boolean(seasonLockState.locked);

  templateForm.querySelectorAll('input, select, textarea').forEach((el) => {
    el.disabled = locked;
  });

  if (saveTemplateBtn) {
    saveTemplateBtn.disabled = locked;
    saveTemplateBtn.textContent = locked ? 'Locked' : 'Save full template';
  }
}

function option(label, value) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
}

function rebuildRankChain(prefix, size, baseOptions) {
  const used = new Set();

  for (let i = 1; i <= size; i += 1) {
    const select = document.getElementById(`${prefix}_${i}`);
    if (!select) continue;

    const current = select.value;
    const available = baseOptions.filter((opt) => !used.has(opt.value) || opt.value === current);

    select.innerHTML = '';
    select.appendChild(option('—', ''));
    available.forEach((opt) => select.appendChild(option(opt.label, opt.value)));

    if (current && available.some((opt) => opt.value === current)) {
      select.value = current;
    } else {
      select.value = '';
    }

    if (select.value) used.add(select.value);
  }
}

function enforceUniqueRankChains() {
  rebuildRankChain('wdc', WDC_SIZE, wdcBaseOptions);
  rebuildRankChain('wcc', WCC_SIZE, wccBaseOptions);
}

function bindRankChainListeners(prefix, size, baseOptions) {
  for (let i = 1; i <= size; i += 1) {
    const select = document.getElementById(`${prefix}_${i}`);
    if (!select) continue;
    select.addEventListener('change', () => rebuildRankChain(prefix, size, baseOptions));
  }
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

async function loadDriverAndTeams() {
  const drivers = sortDriversForDropdown(await fetchJson('/api/drivers'));
  const teams = sortTeamsForDropdown(drivers.map(d => d.team));

  driverChampion.innerHTML = '';
  constructorChampion.innerHTML = '';

  fillDriverSelect(driverChampion, drivers, {
    includeBlank: true,
    includeTeamInOption: false
  });

  constructorChampion.appendChild(option('—', ''));
  teams.forEach(t => constructorChampion.appendChild(option(t.label, t.value)));

  renderWdcWccInputs(drivers, teams);
  renderTemplateDropdowns(drivers, teams);
}

function renderWdcWccInputs(drivers, teams) {
  wdcGrid.innerHTML = '<strong>WDC — 1 to 22</strong>';
  wccGrid.innerHTML = '<strong>WCC — 1 to 11</strong>';

  wdcBaseOptions = drivers.map((d) => ({ label: d.driverName, value: d.driverId }));
  wccBaseOptions = teams.map((t) => ({ label: t.label, value: t.value }));

  for (let i = 1; i <= WDC_SIZE; i += 1) {
    const label = document.createElement('label');
    label.textContent = `P${i}`;
    const select = document.createElement('select');
    select.id = `wdc_${i}`;
    select.appendChild(option('—', ''));
    wdcBaseOptions.forEach((entry) => select.appendChild(option(entry.label, entry.value)));
    label.appendChild(select);
    wdcGrid.appendChild(label);
  }

  for (let i = 1; i <= WCC_SIZE; i += 1) {
    const label = document.createElement('label');
    label.textContent = `P${i}`;
    const select = document.createElement('select');
    select.id = `wcc_${i}`;
    select.appendChild(option('—', ''));
    wccBaseOptions.forEach((entry) => select.appendChild(option(entry.label, entry.value)));
    label.appendChild(select);
    wccGrid.appendChild(label);
  }

  bindRankChainListeners('wdc', WDC_SIZE, wdcBaseOptions);
  bindRankChainListeners('wcc', WCC_SIZE, wccBaseOptions);
  enforceUniqueRankChains();
}

function fillSelect(el, options, includeBlank = true) {
  el.innerHTML = '';
  if (includeBlank) el.appendChild(option('—', ''));
  options.forEach(o => el.appendChild(option(o.label, o.value)));
}

function renderTemplateDropdowns(drivers, teams) {
  const driverOpts = drivers.map(d => ({ label: d.driverName, value: d.driverId }));
  const teamOpts = teams.map(t => ({ label: t.label, value: t.value }));
  const numberOpts = Array.from({ length: 40 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }));
  const champWinsPolesOpts = Array.from({ length: 24 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }));
  const titleMarginOpts = Array.from({ length: 150 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }));

  fillSelect(document.getElementById('wdcWins'), champWinsPolesOpts, false);
  fillSelect(document.getElementById('wdcPoles'), champWinsPolesOpts, false);
  fillSelect(document.getElementById('wdcMargin'), titleMarginOpts, false);

  fillSelect(document.getElementById('boxPodium'), driverOpts);
  fillSelect(document.getElementById('boxImproved'), driverOpts);
  fillSelect(document.getElementById('boxRookie'), driverOpts);
  fillSelect(document.getElementById('boxWet'), driverOpts);

  fillSelect(document.getElementById('brainNails'), teamOpts);
  fillSelect(document.getElementById('brainWrong'), teamOpts);
  fillSelect(document.getElementById('brainBestStrat'), teamOpts);
  fillSelect(document.getElementById('brainWorstStrat'), teamOpts);

  fillSelect(document.getElementById('wccOver'), teamOpts);
  fillSelect(document.getElementById('wccUnder'), teamOpts);
  fillSelect(document.getElementById('chaosUpgrade'), teamOpts);

  fillSelect(document.getElementById('bingoWinners'), numberOpts, false);
  fillSelect(document.getElementById('bingoPodiums'), numberOpts, false);
  fillSelect(document.getElementById('bingoSC'), numberOpts, false);
  fillSelect(document.getElementById('bingoRF'), numberOpts, false);

  // Dominant team wins by points (1-40)
  fillSelect(document.getElementById('wccMargin'), numberOpts, false);

  // Curses & Blessings (drivers)
  fillSelect(document.getElementById('curseUnlucky'), driverOpts);
  fillSelect(document.getElementById('curseLucky'), driverOpts);
  fillSelect(document.getElementById('curseRakes'), driverOpts);

  // Auto-fill rookie moment as Lindblad if present
  const lindblad = drivers.find(d => d.driverName.toLowerCase().includes('lindblad'));
  if (lindblad) document.getElementById('boxRookie').value = lindblad.driverId;
}

function collectTemplatePicks() {
  const wdcOrder = [];
  for (let i = 1; i <= WDC_SIZE; i += 1) {
    const val = document.getElementById(`wdc_${i}`)?.value || '';
    wdcOrder.push(val || null);
  }
  const wccOrder = [];
  for (let i = 1; i <= WCC_SIZE; i += 1) {
    const val = document.getElementById(`wcc_${i}`)?.value || '';
    wccOrder.push(val || null);
  }

  const wdcBonus = {
    wins: document.getElementById('wdcWins').value || '',
    poles: document.getElementById('wdcPoles').value || '',
    margin: document.getElementById('wdcMargin').value || '',
    before: document.getElementById('wdcBefore').value || ''
  };

  const wccBonus = {
    margin: document.getElementById('wccMargin').value || '',
    over: document.getElementById('wccOver').value || '',
    under: document.getElementById('wccUnder').value || ''
  };

  const outOfBox = {
    podium: document.getElementById('boxPodium').value || '',
    improved: document.getElementById('boxImproved').value || '',
    rookie: document.getElementById('boxRookie').value || '',
    wet: document.getElementById('boxWet').value || '',
    meme: document.getElementById('boxMeme').value || ''
  };

  const chaos = {
    tp: document.getElementById('chaosTP').value || '',
    swap: document.getElementById('chaosSwap').value || '',
    upgrade: document.getElementById('chaosUpgrade').value || '',
    weekend: document.getElementById('chaosWeekend').value || '',
    quote: document.getElementById('chaosQuote').value || ''
  };

  const bigBrain = {
    nails: document.getElementById('brainNails').value || '',
    wrong: document.getElementById('brainWrong').value || '',
    bestStrat: document.getElementById('brainBestStrat').value || '',
    worstStrat: document.getElementById('brainWorstStrat').value || ''
  };

  const bingo = {
    winners: document.getElementById('bingoWinners').value || '',
    podiums: document.getElementById('bingoPodiums').value || '',
    sc: document.getElementById('bingoSC').value || '',
    rf: document.getElementById('bingoRF').value || ''
  };

  const curses = {
    unlucky: document.getElementById('curseUnlucky').value || '',
    lucky: document.getElementById('curseLucky').value || '',
    rakes: document.getElementById('curseRakes').value || ''
  };

  return { wdcOrder, wccOrder, wdcBonus, wccBonus, outOfBox, chaos, bigBrain, bingo, curses };
}

function applyTemplatePicks(pick) {
  if (!pick) {
    enforceUniqueRankChains();
    return;
  }
  (pick.wdc_order || []).forEach((val, idx) => {
    const el = document.getElementById(`wdc_${idx + 1}`);
    if (el) el.value = val || '';
  });
  (pick.wcc_order || []).forEach((val, idx) => {
    const el = document.getElementById(`wcc_${idx + 1}`);
    if (el) el.value = val || '';
  });
  enforceUniqueRankChains();

  const wdc = pick.wdc_bonus || {};
  document.getElementById('wdcWins').value = wdc.wins || '';
  document.getElementById('wdcPoles').value = wdc.poles || '';
  document.getElementById('wdcMargin').value = wdc.margin || '';
  document.getElementById('wdcBefore').value = wdc.before || '';

  const wcc = pick.wcc_bonus || {};
  document.getElementById('wccMargin').value = wcc.margin || '';
  document.getElementById('wccOver').value = wcc.over || '';
  document.getElementById('wccUnder').value = wcc.under || '';

  const box = pick.out_of_box || {};
  document.getElementById('boxPodium').value = box.podium || '';
  document.getElementById('boxImproved').value = box.improved || '';
  document.getElementById('boxRookie').value = box.rookie || '';
  document.getElementById('boxWet').value = box.wet || '';
  document.getElementById('boxMeme').value = box.meme || '';

  const chaos = pick.chaos || {};
  document.getElementById('chaosTP').value = chaos.tp || '';
  document.getElementById('chaosSwap').value = chaos.swap || '';
  document.getElementById('chaosUpgrade').value = chaos.upgrade || '';
  document.getElementById('chaosWeekend').value = chaos.weekend || '';
  document.getElementById('chaosQuote').value = chaos.quote || '';

  const brain = pick.big_brain || {};
  document.getElementById('brainNails').value = brain.nails || '';
  document.getElementById('brainWrong').value = brain.wrong || '';
  document.getElementById('brainBestStrat').value = brain.bestStrat || '';
  document.getElementById('brainWorstStrat').value = brain.worstStrat || '';

  const bingo = pick.bingo || {};
  document.getElementById('bingoWinners').value = bingo.winners || '';
  document.getElementById('bingoPodiums').value = bingo.podiums || '';
  document.getElementById('bingoSC').value = bingo.sc || '';
  document.getElementById('bingoRF').value = bingo.rf || '';

  const curses = pick.curses || {};
  document.getElementById('curseUnlucky').value = curses.unlucky || '';
  document.getElementById('curseLucky').value = curses.lucky || '';
  document.getElementById('curseRakes').value = curses.rakes || '';
}

async function loadSeasonPicks() {
  const season = seasonSelect.value;
  const picks = await fetchJson(`/api/season/picks?season=${season}`);
  return picks;
}

async function loadSeasonLock() {
  const season = seasonSelect.value;
  return fetchJson(`/api/season/picks-lock?season=${season}`);
}

function renderPicksStatus(picks) {
  const row = picks.find((p) => p.user === userSelect.value);

  if (seasonLockState.locked) {
    picksStatus.textContent = row
      ? `Template loaded. ${lockStatusLabel(seasonLockState)}`
      : lockStatusLabel(seasonLockState);
    return;
  }

  if (!row) {
    picksStatus.textContent = 'No season picks yet.';
    return;
  }

  picksStatus.textContent = 'Template loaded.';
}

async function saveTemplate(e) {
  e.preventDefault();

  if (seasonLockState.locked) {
    picksStatus.textContent = lockStatusLabel(seasonLockState);
    return;
  }

  const pin = await requirePin(userSelect.value);
  if (pin === null) return;

  try {
    await fetchJson('/api/season/picks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user: userSelect.value,
        season: Number(seasonSelect.value),
        picks: {
          driverChampion: driverChampion.value || null,
          constructorChampion: constructorChampion.value || null,
          ...collectTemplatePicks()
        },
        pin
      })
    });
  } catch (err) {
    const message = parseApiErrorMessage(err);
    picksStatus.textContent = message;
    if (/locked/i.test(message)) {
      seasonLockState = { ...seasonLockState, locked: true };
      applySeasonLock(seasonLockState);
    }
    return;
  }

  await refreshAll();
}


async function refreshAll() {
  await loadDriverAndTeams();
  const [picks, lock] = await Promise.all([loadSeasonPicks(), loadSeasonLock()]);
  applySeasonLock(lock);
  const userPick = picks.find((p) => p.user === userSelect.value);
  applyTemplatePicks(userPick);
  renderPicksStatus(picks);
}

seasonSelect.addEventListener('change', refreshAll);
userSelect.addEventListener('change', refreshAll);
templateForm.addEventListener('submit', saveTemplate);

(async function init() {
  await loadConfig();
  await loadSeasons();
  await refreshAll();
})();
