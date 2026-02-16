const TEAM_DISPLAY_ORDER = [
  'McLaren',
  'Mercedes',
  'Red Bull Racing',
  'Ferrari',
  'Williams',
  'Racing Bulls',
  'Aston Martin',
  'Haas F1 Team',
  'Kick Sauber',
  'Alpine'
];

const TEAM_ALIASES = new Map([
  ['mclaren', 'McLaren'],
  ['mercedes', 'Mercedes'],
  ['red bull', 'Red Bull Racing'],
  ['red bull racing', 'Red Bull Racing'],
  ['ferrari', 'Ferrari'],
  ['williams', 'Williams'],
  ['racing bulls', 'Racing Bulls'],
  ['rb', 'Racing Bulls'],
  ['aston martin', 'Aston Martin'],
  ['haas', 'Haas F1 Team'],
  ['haas f1 team', 'Haas F1 Team'],
  ['kick sauber', 'Kick Sauber'],
  ['sauber', 'Kick Sauber'],
  ['audi', 'Kick Sauber'],
  ['alpine', 'Alpine']
]);

function normalizeTeamKey(team) {
  return String(team || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function displayTeamName(team) {
  const key = normalizeTeamKey(team);
  return TEAM_ALIASES.get(key) || String(team || '').trim() || 'Unknown Team';
}

function teamRank(team) {
  const display = displayTeamName(team);
  const idx = TEAM_DISPLAY_ORDER.indexOf(display);
  return idx >= 0 ? idx : TEAM_DISPLAY_ORDER.length + 50;
}

export function sortTeamsForDropdown(teams) {
  const unique = [...new Set((teams || []).filter(Boolean))];
  return unique
    .sort((a, b) => {
      const rankDelta = teamRank(a) - teamRank(b);
      if (rankDelta !== 0) return rankDelta;
      const displayDelta = displayTeamName(a).localeCompare(displayTeamName(b));
      if (displayDelta !== 0) return displayDelta;
      return String(a).localeCompare(String(b));
    })
    .map((team) => ({ value: team, label: displayTeamName(team) }));
}

export function sortDriversForDropdown(drivers) {
  return [...(drivers || [])].sort((a, b) => {
    const rankDelta = teamRank(a.team) - teamRank(b.team);
    if (rankDelta !== 0) return rankDelta;
    const teamDelta = displayTeamName(a.team).localeCompare(displayTeamName(b.team));
    if (teamDelta !== 0) return teamDelta;
    return String(a.driverName || '').localeCompare(String(b.driverName || ''));
  });
}

export function groupDriversForDropdown(drivers) {
  const grouped = new Map();
  for (const driver of sortDriversForDropdown(drivers)) {
    const teamLabel = displayTeamName(driver.team);
    if (!grouped.has(teamLabel)) grouped.set(teamLabel, []);
    grouped.get(teamLabel).push(driver);
  }

  const orderedLabels = [...grouped.keys()].sort((a, b) => {
    const rankDelta = teamRank(a) - teamRank(b);
    if (rankDelta !== 0) return rankDelta;
    return a.localeCompare(b);
  });

  return orderedLabels.map((teamLabel) => ({
    teamLabel,
    drivers: grouped.get(teamLabel) || []
  }));
}

export function fillDriverSelect(select, drivers, options = {}) {
  if (!select) return;

  const {
    includeBlank = true,
    blankLabel = '—',
    includeTeamInOption = false
  } = options;

  const previous = select.value;
  select.innerHTML = '';

  if (includeBlank) {
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = blankLabel;
    select.appendChild(blank);
  }

  const groups = groupDriversForDropdown(drivers);
  for (const group of groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group.teamLabel;

    for (const driver of group.drivers) {
      const opt = document.createElement('option');
      opt.value = driver.driverId;
      opt.textContent = includeTeamInOption
        ? `${driver.driverName} — ${group.teamLabel}`
        : driver.driverName;
      optgroup.appendChild(opt);
    }

    select.appendChild(optgroup);
  }

  if (previous && [...select.options].some((opt) => opt.value === previous)) {
    select.value = previous;
  }
}
