import { metricLabelHtml, bindMetricHelpTooltips } from './metric-help.js';
import { teamToneVars, canonicalTeamName, teamLogoPath } from './team-colors.js';
const kpiGrid = document.getElementById('kpiGrid');
const standingsTable = document.getElementById('standingsTable');
const accuracyTable = document.getElementById('accuracyTable');
const timelineChart = document.getElementById('timelineChart');
const picksStatus = document.getElementById('picksStatus');
const seasonSelect = document.getElementById('seasonSelect');
const tieBreakCard = document.getElementById('tieBreakCard');

const USER_COLORS = ['#e10600', '#0f1724', '#1263e6', '#0f9f8f'];
const TIE_BREAK_LABELS = {
  total_points: 'Total points',
  lock_hit_rate: 'Lock hit rate',
  podium_exact_hits: 'Exact podium hits',
  side_bet_points: 'Side-bet points',
  average_points_per_round: 'Avg points/round',
  latest_round_points: 'Latest round points'
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

function avg(values) {
  if (!values || !values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function fixed(value, digits = 2) {
  return Number(value || 0).toFixed(digits);
}

function selectedSeason() {
  return Number(seasonSelect?.value || 2026);
}

function renderTieBreakCard(payload) {
  if (!tieBreakCard) return;
  const rows = Array.isArray(payload?.rows) ? payload.rows : [];
  if (!rows.length) {
    tieBreakCard.innerHTML = '<div class="muted">Tie-break explainer will appear once picks are recorded.</div>';
    return;
  }

  const leader = payload?.leader || rows[0]?.user;
  const runnerUp = payload?.runnerUp || rows[1]?.user || '—';
  const decidedBy = payload?.decidedBy || null;
  const metricLabel = decidedBy ? (TIE_BREAK_LABELS[decidedBy] || decidedBy.replaceAll('_', ' ')) : 'No separation';
  const ranked = rows.slice(0, 2);

  const topRows = ranked.map((row, idx) => {
    const rank = idx + 1;
    return `
      <li>
        <span class="eyebrow">#${rank}</span>
        <strong>${row.user}</strong>
        <span>${Number(row.total_points || 0)} pts</span>
      </li>
    `;
  }).join('');

  tieBreakCard.innerHTML = `
    <div class="tiebreak-head">
      <h3>Tie-Break Explainer</h3>
      <span class="chip">${metricLabel}</span>
    </div>
    <p>${payload?.explanation || 'Tie-break details unavailable.'}</p>
    <div class="tiebreak-grid">
      <div>
        <span class="eyebrow">Leader</span>
        <strong>${leader || '—'}</strong>
      </div>
      <div>
        <span class="eyebrow">Runner-up</span>
        <strong>${runnerUp}</strong>
      </div>
      <div>
        <span class="eyebrow">Rounds tracked</span>
        <strong>${Array.isArray(payload?.rounds) ? payload.rounds.length : 0}</strong>
      </div>
    </div>
    <ol class="tiebreak-list">${topRows}</ol>
  `;
}

async function loadSeasons() {
  if (!seasonSelect) return;
  const seasons = await fetchJson('/api/seasons');
  seasonSelect.innerHTML = '';

  seasons
    .sort((a, b) => b - a)
    .forEach((season) => {
      const opt = document.createElement('option');
      opt.value = String(season);
      opt.textContent = String(season);
      seasonSelect.appendChild(opt);
    });

  if (seasons.includes(2026)) seasonSelect.value = '2026';
  else if (seasons.length) seasonSelect.value = String(seasons[0]);
}

function computeMomentum(timeline) {
  const rows = timeline?.data || [];
  if (!rows.length) return { rounds: [], users: [], byUser: new Map() };

  const rounds = timeline.rounds || rows.map(r => r.round);
  const users = Object.keys(rows[0].totals || {});
  const byUser = new Map();

  for (const user of users) {
    const cumulative = rows.map(r => Number(r.totals?.[user] || 0));
    const perRound = cumulative.map((total, i) => (i === 0 ? total : total - cumulative[i - 1]));
    const last3 = perRound.slice(-3);
    const prev3 = perRound.slice(-6, -3);
    const last3Avg = avg(last3);
    const prev3Avg = avg(prev3);

    byUser.set(user, {
      cumulative,
      perRound,
      total: cumulative[cumulative.length - 1] || 0,
      last3Avg,
      prev3Avg,
      delta: last3Avg - prev3Avg
    });
  }

  return { rounds, users, byUser };
}

function momentumClass(value) {
  if (value > 0.01) return 'up';
  if (value < -0.01) return 'down';
  return 'flat';
}

function momentumLabel(value) {
  if (value > 0.01) return `+${value.toFixed(1)} trend`;
  if (value < -0.01) return `${value.toFixed(1)} trend`;
  return 'Flat trend';
}

function renderTrendCards(weeklyStats, accuracyRows, timeline) {
  const seasonTotals = weeklyStats?.seasonTotals || [];
  if (!seasonTotals.length) {
    kpiGrid.innerHTML = '<div class="muted">No trend data yet.</div>';
    return;
  }

  const momentum = computeMomentum(timeline);
  const accuracyMap = new Map((accuracyRows || []).map(row => [row.user, row]));

  kpiGrid.classList.add('trends-grid');

  const cards = seasonTotals.map((row, idx) => {
    const accuracy = accuracyMap.get(row.user) || { correct: 0, attempted: 0, accuracy: 0 };
    const m = momentum.byUser.get(row.user) || {
      total: row.total || 0,
      last3Avg: 0,
      delta: 0
    };

    return `
      <article class="trend-card">
        <header class="trend-head">
          <div>
            <h3>${row.user}</h3>
            <div class="trend-sub momentum ${momentumClass(m.delta)}">${momentumLabel(m.delta)}</div>
          </div>
          <div class="trend-total" style="--accent:${USER_COLORS[idx % USER_COLORS.length]};">
            <span>Total</span>
            <strong>${row.total} pts</strong>
          </div>
        </header>

        <div class="trend-stats">
          <div class="trend-stat">${metricLabelHtml('Avg pts/round', 'avg_points_round')}<strong>${fixed(row.avg)}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Best streak', 'best_streak')}<strong>${row.bestStreak}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Current streak', 'current_streak')}<strong>${row.currentStreak}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Lock hit rate', 'lock_hit_rate')}<strong>${pct(row.lockRate)}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Side bet pts', 'side_bet_points')}<strong>${row.sideBetPoints || 0}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Stable / Chaos', 'side_bet_split')}<strong>${row.sideBetStablePoints || 0} / ${row.sideBetChaosPoints || 0}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Side bet hit rate', 'side_bet_hit_rate')}<strong>${pct(row.sideBetHitRate)}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Side bet attempts', 'side_bet_attempts')}<strong>${row.sideBetAttempts || 0}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Consistency', 'consistency')}<strong>${fixed(row.consistency)}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Clutch', 'clutch')}<strong>${fixed(row.clutch)}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Accuracy', 'accuracy_rate')}<strong>${pct(accuracy.accuracy)}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Correct / Attempted', 'correct_attempted')}<strong>${accuracy.correct} / ${accuracy.attempted}</strong></div>
          <div class="trend-stat">${metricLabelHtml('Last 3 avg', 'last3_avg_points')}<strong>${fixed(m.last3Avg, 1)} pts</strong></div>
          <div class="trend-stat">${metricLabelHtml('Trend delta', 'trend_delta')}<strong class="momentum ${momentumClass(m.delta)}">${m.delta >= 0 ? '+' : ''}${fixed(m.delta, 1)}</strong></div>
        </div>
      </article>
    `;
  }).join('');

  kpiGrid.innerHTML = cards;
}

function seasonTeamLabel(team, season) {
  const canonical = canonicalTeamName(team);
  if (Number(season) === 2026 && canonical === 'Kick Sauber') return 'Audi';
  return canonical;
}

function applyStandingsDisplayOverride(season, standings) {

  if (Number(season) !== 2025) return standings;
  if (!standings || !Array.isArray(standings.driverStandings)) return standings;

  const drivers = standings.driverStandings.map((row) => ({ ...row }));
  const landoIndex = drivers.findIndex((row) =>
    String(row.driverId || '').toLowerCase() === 'norris' ||
    /lando\s+norris/i.test(String(row.driverName || ''))
  );

  if (landoIndex < 0) return standings;

  const lando = drivers.splice(landoIndex, 1)[0];
  const currentLeaderPoints = drivers.reduce((best, row) => Math.max(best, Number(row.points || 0)), 0);
  const landoPoints = Number(lando.points || 0);

  if (landoPoints <= currentLeaderPoints) {
    lando.points = currentLeaderPoints + 1;
  }

  drivers.push(lando);
  drivers.sort((a, b) => Number(b.points || 0) - Number(a.points || 0) || String(a.driverName || '').localeCompare(String(b.driverName || '')));

  return {
    ...standings,
    driverStandings: drivers
  };
}

async function loadStandings(season) {
  const rawStandings = await fetchJson(`/api/season/standings?season=${season}`);
  const standings = applyStandingsDisplayOverride(season, rawStandings);

  const displayTeam = (team) => seasonTeamLabel(team, season);

  const logoFor = (team) => {
    const label = displayTeam(team);
    return `<img class="logo" src="${teamLogoPath(label)}" alt="${label || ''}" onerror="this.remove()">`;
  };

  const renderDriverItem = (d, idx) => {
    const team = displayTeam(d.team);
    return `
    <li class="standing-item team-tone-card" style="${teamToneVars(team)}">
      <span class="standing-rank">${idx + 1}</span>
      <div class="standing-main">
        <div class="standing-name team-tone-text" style="${teamToneVars(team)}">${d.driverName}</div>
        <div class="standing-sub">${logoFor(team)}${team}</div>
      </div>
      <div class="standing-points">${d.points}<span>pts</span></div>
    </li>
  `;
  };

  const renderTeamItem = (t, idx) => {
    const team = displayTeam(t.team);
    return `
    <li class="standing-item team-tone-card" style="${teamToneVars(team)}">
      <span class="standing-rank">${idx + 1}</span>
      <div class="standing-main">
        <div class="standing-name team-tone-text" style="${teamToneVars(team)}">${logoFor(team)}${team}</div>
        <div class="standing-sub">Constructor</div>
      </div>
      <div class="standing-points">${t.points}<span>pts</span></div>
    </li>
  `;
  };

  const driverLimit = Math.min(22, standings.driverStandings.length || 22);
  const teamLimit = Math.min(11, standings.constructorStandings.length || 11);
  const driverRows = standings.driverStandings.slice(0, driverLimit).map(renderDriverItem).join('');
  const teamRows = standings.constructorStandings.slice(0, teamLimit).map(renderTeamItem).join('');

  standingsTable.innerHTML = `
    <div class="standings-board">
      <section class="standings-panel">
        <header class="standings-header">
          <h3>WDC Standings</h3>
          <span class="chip">1-${driverLimit}</span>
        </header>
        <ol class="standings-list">${driverRows}</ol>
      </section>

      <section class="standings-panel">
        <header class="standings-header">
          <h3>WCC Standings</h3>
          <span class="chip">1-${teamLimit}</span>
        </header>
        <ol class="standings-list">${teamRows}</ol>
      </section>
    </div>
  `;
}

function renderAccuracyMomentum(rows, timeline) {
  if (!rows.length) {
    accuracyTable.textContent = 'No accuracy data yet.';
    return;
  }

  const momentum = computeMomentum(timeline);
  const sortedByAccuracy = [...rows].sort((a, b) => b.accuracy - a.accuracy);
  const leader = sortedByAccuracy[0];

  const userMetrics = sortedByAccuracy.map((row, idx) => {
    const m = momentum.byUser.get(row.user) || {
      cumulative: [],
      perRound: [],
      total: 0,
      last3Avg: 0,
      prev3Avg: 0,
      delta: 0
    };

    return {
      ...row,
      color: USER_COLORS[idx % USER_COLORS.length],
      total: m.total,
      perRound: m.perRound,
      last3Avg: m.last3Avg,
      prev3Avg: m.prev3Avg,
      delta: m.delta
    };
  });

  const hottest = [...userMetrics].sort((a, b) => b.delta - a.delta)[0] || userMetrics[0];

  let gapLabel = 'Gap unavailable';
  if (userMetrics.length >= 2) {
    const [a, b] = userMetrics;
    const diff = a.total - b.total;
    const ahead = diff >= 0 ? a.user : b.user;
    const behind = diff >= 0 ? b.user : a.user;
    gapLabel = `${ahead} +${Math.abs(diff)} vs ${behind}`;
  }

  const summary = `
    <div class="insight-grid">
      <div class="insight-pill">
        ${metricLabelHtml('Accuracy Leader', 'accuracy_leader', 'k')}
        <strong>${leader.user}</strong>
        <span>${(leader.accuracy * 100).toFixed(1)}%</span>
      </div>
      <div class="insight-pill">
        ${metricLabelHtml('Hot Momentum', 'hot_momentum', 'k')}
        <strong>${hottest.user}</strong>
        <span class="momentum ${momentumClass(hottest.delta)}">${momentumLabel(hottest.delta)}</span>
      </div>
      <div class="insight-pill">
        ${metricLabelHtml('Head-to-Head', 'head_to_head_gap', 'k')}
        <strong>${gapLabel}</strong>
        <span>Current cumulative</span>
      </div>
    </div>
  `;

  const cards = userMetrics.map((row) => {
    const pctNum = Number((row.accuracy * 100).toFixed(1));
    const circumference = 2 * Math.PI * 32;
    const progress = Math.max(0, Math.min(circumference, (pctNum / 100) * circumference));

    const maxBar = Math.max(1, ...row.perRound.map(v => Math.abs(v)));
    const bars = row.perRound.map((value, idx) => {
      const h = Math.max(8, Math.round((Math.abs(value) / maxBar) * 42));
      const cls = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
      return `<span class="mini-bar ${cls}" style="height:${h}px" title="R${idx + 1}: ${value} pts"></span>`;
    }).join('');

    return `
      <article class="accuracy-card">
        <header>
          <strong>${row.user}</strong>
          <span class="momentum ${momentumClass(row.delta)}">${momentumLabel(row.delta)}</span>
        </header>
        <div class="accuracy-core">
          <svg class="accuracy-ring" viewBox="0 0 84 84" aria-hidden="true">
            <circle cx="42" cy="42" r="32" class="bg" />
            <circle cx="42" cy="42" r="32" class="fg" style="stroke:${row.color};stroke-dasharray:${progress} ${circumference}" />
            <text x="42" y="44" text-anchor="middle">${pctNum}%</text>
          </svg>
          <div class="accuracy-meta">
            <div>${metricLabelHtml('Correct', 'correct_attempted')}<strong>${row.correct}</strong></div>
            <div>${metricLabelHtml('Attempted', 'correct_attempted')}<strong>${row.attempted}</strong></div>
            <div>${metricLabelHtml('Last 3 avg', 'last3_avg_points')}<strong>${row.last3Avg.toFixed(1)} pts</strong></div>
          </div>
        </div>
        <div class="mini-bars">${bars || '<span class="mini-bars-empty">No rounds yet</span>'}</div>
      </article>
    `;
  }).join('');

  const tableRows = userMetrics.map(row => `
    <tr>
      <td>${row.user}</td>
      <td>${(row.accuracy * 100).toFixed(1)}%</td>
      <td>${row.correct}</td>
      <td>${row.attempted}</td>
      <td>${row.last3Avg.toFixed(1)}</td>
      <td><span class="momentum ${momentumClass(row.delta)}">${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(1)}</span></td>
    </tr>
  `).join('');

  accuracyTable.innerHTML = `
    ${summary}
    <div class="accuracy-cards">${cards}</div>
    <div class="table" style="margin-top:12px;">
      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Accuracy</th>
            <th>Correct</th>
            <th>Attempted</th>
            <th>Last 3 Avg</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;
}

function renderTimeline(data) {
  if (!data || !data.data || !data.data.length) {
    timelineChart.textContent = 'No timeline data yet.';
    return;
  }

  const rounds = data.rounds;
  const users = Object.keys(data.data[0].totals || {});
  const series = users.map(user => data.data.map(d => d.totals[user] || 0));
  const max = Math.max(1, ...series.flat());

  const width = 860;
  const height = 260;
  const padX = 36;
  const padY = 26;

  const xFor = (i) => padX + (i / Math.max(1, rounds.length - 1)) * (width - padX * 2);
  const yFor = (v) => height - padY - (v / max) * (height - padY * 2);

  const grid = [0, 0.25, 0.5, 0.75, 1].map(t => {
    const y = yFor(max * t);
    return `<line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="#d8e0eb" stroke-width="1" />`;
  }).join('');

  const lines = series.map((values, idx) => {
    const color = USER_COLORS[idx % USER_COLORS.length];
    const points = values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(' ');
    const lastX = xFor(values.length - 1);
    const lastY = yFor(values[values.length - 1]);

    return `
      <polyline fill="none" stroke="${color}" stroke-width="3" points="${points}" />
      <circle cx="${lastX}" cy="${lastY}" r="4" fill="${color}" />
    `;
  }).join('');

  const tickLabels = rounds.length
    ? `<text x="${xFor(0)}" y="${height - 6}" fill="#6b7280" font-size="10">R${rounds[0]}</text>
       <text x="${xFor(Math.floor((rounds.length - 1) / 2))}" y="${height - 6}" fill="#6b7280" font-size="10" text-anchor="middle">R${rounds[Math.floor((rounds.length - 1) / 2)]}</text>
       <text x="${xFor(rounds.length - 1)}" y="${height - 6}" fill="#6b7280" font-size="10" text-anchor="end">R${rounds[rounds.length - 1]}</text>`
    : '';

  const labels = users.map((u, idx) => `
    <span><span class="legend-dot" style="background:${USER_COLORS[idx % USER_COLORS.length]};"></span>${u}</span>
  `).join('');

  timelineChart.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:10px;flex-wrap:wrap;">
      <div style="font-size:12px;color:#6b7280;">Cumulative points trajectory by round</div>
      <div class="legend">${labels}</div>
    </div>
    <svg viewBox="0 0 ${width} ${height}" width="100%" height="260" preserveAspectRatio="none">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
      ${grid}
      ${lines}
      ${tickLabels}
    </svg>
  `;
}

async function loadPicksStatus(season) {
  const picks = await fetchJson(`/api/season/picks?season=${season}`);
  if (!picks.length) {
    picksStatus.textContent = 'No season template picks yet.';
    return;
  }

  const badges = picks
    .filter((row) => row?.user)
    .sort((a, b) => String(a.user).localeCompare(String(b.user)))
    .map((row) => {
      const grade = row?.projection_grade || null;
      const gradeText = grade?.grade ? `Championship card grade: ${grade.grade}` : 'Championship card grade: —';
      const roundText = grade?.round ? ` · R${grade.round}` : '';
      return `
        <a class="chip" href="/template.html?season=${season}#projectionGradeCard" title="${gradeText}${roundText}">
          ${row.user}: ${grade?.grade || '—'}${roundText}
        </a>
      `;
    }).join(' ');

  picksStatus.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
      <span>Season template saved.</span>
      ${badges}
    </div>
  `;
}


async function refreshAll() {
  const season = selectedSeason();
  await loadStandings(season);

  const [weeklyStats, accuracyRows, timeline, tieBreak] = await Promise.all([
    fetchJson(`/api/weekly/stats?season=${season}`),
    fetchJson(`/api/season/accuracy?season=${season}`),
    fetchJson(`/api/season/timeline?season=${season}`),
    fetchJson(`/api/season/tiebreak?season=${season}`)
  ]);

  renderTrendCards(weeklyStats, accuracyRows, timeline);
  renderTieBreakCard(tieBreak);
  renderAccuracyMomentum(accuracyRows, timeline);
  renderTimeline(timeline);
  await loadPicksStatus(season);
}


(async function init() {
  bindMetricHelpTooltips(document);
  await loadSeasons();
  if (seasonSelect) seasonSelect.addEventListener('change', refreshAll);
  await refreshAll();
})();
