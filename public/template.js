const userSelect = document.getElementById('userSelect');
const seasonSelect = document.getElementById('seasonSelect');
const driverChampion = document.getElementById('driverChampion');
const constructorChampion = document.getElementById('constructorChampion');
const templateForm = document.getElementById('templateForm');
const picksStatus = document.getElementById('picksStatus');
const updateDataBtn = document.getElementById('updateDataBtn');
const wdcGrid = document.getElementById('wdcGrid');
const wccGrid = document.getElementById('wccGrid');

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  return res.json();
}

function option(label, value) {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
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
  seasons.forEach(s => seasonSelect.appendChild(option(String(s), s)));
}

async function loadDriverAndTeams() {
  const drivers = await fetchJson('/api/drivers');
  const teams = [...new Set(drivers.map(d => d.team))].sort();

  driverChampion.innerHTML = '';
  constructorChampion.innerHTML = '';

  driverChampion.appendChild(option('—', ''));
  constructorChampion.appendChild(option('—', ''));

  drivers.forEach(d => {
    driverChampion.appendChild(option(`${d.driverName} — ${d.team}`, d.driverId));
  });

  teams.forEach(t => constructorChampion.appendChild(option(t, t)));

  renderWdcWccInputs(drivers, teams);
  renderTemplateDropdowns(drivers, teams);
}

function renderWdcWccInputs(drivers, teams) {
  wdcGrid.innerHTML = '<strong>WDC — 1 to 22</strong>';
  wccGrid.innerHTML = '<strong>WCC — 1 to 11</strong>';

  for (let i = 1; i <= 22; i += 1) {
    const label = document.createElement('label');
    label.textContent = `P${i}`;
    const select = document.createElement('select');
    select.id = `wdc_${i}`;
    select.appendChild(option('—', ''));
    drivers.forEach(d => select.appendChild(option(d.driverName, d.driverId)));
    label.appendChild(select);
    wdcGrid.appendChild(label);
  }

  for (let i = 1; i <= 11; i += 1) {
    const label = document.createElement('label');
    label.textContent = `P${i}`;
    const select = document.createElement('select');
    select.id = `wcc_${i}`;
    select.appendChild(option('—', ''));
    teams.forEach(t => select.appendChild(option(t, t)));
    label.appendChild(select);
    wccGrid.appendChild(label);
  }
}

function fillSelect(el, options, includeBlank = true) {
  el.innerHTML = '';
  if (includeBlank) el.appendChild(option('—', ''));
  options.forEach(o => el.appendChild(option(o.label, o.value)));
}

function renderTemplateDropdowns(drivers, teams) {
  const driverOpts = drivers.map(d => ({ label: d.driverName, value: d.driverId }));
  const teamOpts = teams.map(t => ({ label: t, value: t }));
  const numberOpts = Array.from({ length: 40 }, (_, i) => ({ label: String(i + 1), value: String(i + 1) }));

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
  for (let i = 1; i <= 22; i += 1) {
    const val = document.getElementById(`wdc_${i}`)?.value || '';
    wdcOrder.push(val || null);
  }
  const wccOrder = [];
  for (let i = 1; i <= 11; i += 1) {
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
  if (!pick) return;
  (pick.wdc_order || []).forEach((val, idx) => {
    const el = document.getElementById(`wdc_${idx + 1}`);
    if (el) el.value = val || '';
  });
  (pick.wcc_order || []).forEach((val, idx) => {
    const el = document.getElementById(`wcc_${idx + 1}`);
    if (el) el.value = val || '';
  });

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

function renderPicksStatus(picks) {
  if (!picks.length) {
    picksStatus.textContent = 'No season picks yet.';
    return;
  }
  const row = picks.find(p => p.user === userSelect.value);
  if (!row) {
    picksStatus.textContent = 'No season picks yet.';
    return;
  }
  picksStatus.textContent = 'Template loaded.';
}

async function saveTemplate(e) {
  e.preventDefault();
  const pin = await requirePin(userSelect.value);
  if (pin === null) return;
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

  await refreshAll();
}

async function updateData() {
  updateDataBtn.disabled = true;
  updateDataBtn.textContent = 'Updating...';
  try {
    await fetchJson('/api/update-data', { method: 'POST' });
    await refreshAll();
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

async function refreshAll() {
  await loadDriverAndTeams();
  const picks = await loadSeasonPicks();
  renderPicksStatus(picks);
  const userPick = picks.find(p => p.user === userSelect.value);
  applyTemplatePicks(userPick);
}

seasonSelect.addEventListener('change', refreshAll);
userSelect.addEventListener('change', refreshAll);
templateForm.addEventListener('submit', saveTemplate);
updateDataBtn.addEventListener('click', updateData);

(async function init() {
  await loadConfig();
  await loadSeasons();
  await autoUpdateOnLoad();
  await refreshAll();
})();
