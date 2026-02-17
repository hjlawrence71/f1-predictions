const TEAM_COLORS = {
  'McLaren': { primary: '#ff8000', secondary: '#6692ff' },
  'Mercedes': { primary: '#00a19c', secondary: '#c8ccce' },
  'Red Bull Racing': { primary: '#00174c', secondary: '#ff004c' },
  'Ferrari': { primary: '#ed1c24', secondary: '#fff200' },
  'Williams': { primary: '#64c4ff', secondary: '#1868d8' },
  'Racing Bulls': { primary: '#6c98ff', secondary: '#000000' },
  'Aston Martin': { primary: '#00352f', secondary: '#cedc00' },
  'Haas F1 Team': { primary: '#da291c', secondary: '#aeaeae' },
  'Audi': { primary: '#f50538', secondary: '#8a8d8f' },
  'Alpine': { primary: '#005ba9', secondary: '#fd48c7' },
  'Cadillac': { primary: '#848689', secondary: '#1f262a' }
};

const TEAM_LOGO_SLUGS = {
  'McLaren': 'mclaren',
  'Mercedes': 'mercedes',
  'Red Bull Racing': 'red-bull',
  'Ferrari': 'ferrari',
  'Williams': 'williams',
  'Racing Bulls': 'racing-bulls',
  'Aston Martin': 'aston-martin',
  'Haas F1 Team': 'haas',
  'Audi': 'audi',
  'Alpine': 'alpine',
  'Cadillac': 'cadillac'
};

const TEAM_ALIASES = new Map([
  ['mclaren', 'McLaren'],
  ['mclaren formula 1 team', 'McLaren'],
  ['mclaren mastercard f1 team', 'McLaren'],
  ['mercedes', 'Mercedes'],
  ['mercedes amg petronas formula one team', 'Mercedes'],
  ['red bull', 'Red Bull Racing'],
  ['red bull racing', 'Red Bull Racing'],
  ['oracle red bull racing', 'Red Bull Racing'],
  ['ferrari', 'Ferrari'],
  ['scuderia ferrari hp', 'Ferrari'],
  ['williams', 'Williams'],
  ['atlassian williams f1 team', 'Williams'],
  ['racing bulls', 'Racing Bulls'],
  ['visa cash app racing bulls formula one team', 'Racing Bulls'],
  ['aston martin', 'Aston Martin'],
  ['aston martin aramco formula one team', 'Aston Martin'],
  ['haas', 'Haas F1 Team'],
  ['haas f1 team', 'Haas F1 Team'],
  ['moneygram haas f1 team', 'Haas F1 Team'],
  ['tgr haas f1 team', 'Haas F1 Team'],
  ['kick sauber', 'Audi'],
  ['stake f1 team kick sauber', 'Audi'],
  ['stake sauber', 'Audi'],
  ['sauber', 'Audi'],
  ['audi', 'Audi'],
  ['audi revolut f1 team', 'Audi'],
  ['alpine', 'Alpine'],
  ['bwt alpine formula one team', 'Alpine'],
  ['cadillac', 'Cadillac'],
  ['cadillac formula 1 team', 'Cadillac']
]);

function normalizeTeamKey(team) {
  return String(team || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function canonicalTeamName(team) {
  const key = normalizeTeamKey(team);
  return TEAM_ALIASES.get(key) || String(team || '').trim() || 'Unknown Team';
}

export function teamLogoSlug(team) {
  const canonical = canonicalTeamName(team);
  return TEAM_LOGO_SLUGS[canonical] || String(canonical || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function teamLogoPath(team) {
  return `/team-logos/${teamLogoSlug(team)}.png`;
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

export function teamColors(team) {
  const key = canonicalTeamName(team);
  return TEAM_COLORS[key] || { primary: '#e10600', secondary: '#7f8794' };
}

export function teamToneVars(team) {
  const { primary, secondary } = teamColors(team);
  const [pr, pg, pb] = parseHexToRgb(primary);
  const [sr, sg, sb] = parseHexToRgb(secondary);
  return [
    `--team-primary:${primary}`,
    `--team-secondary:${secondary}`,
    `--team-primary-rgb:${pr}, ${pg}, ${pb}`,
    `--team-secondary-rgb:${sr}, ${sg}, ${sb}`,
    `--team-ink:${textColorFor(primary)}`,
    `--team-ink-accent:${textColorFor(secondary)}`
  ].join(';');
}
