const kpiGrid = document.getElementById('kpiGrid');
const standingsTable = document.getElementById('standingsTable');
const updateDataBtn = document.getElementById('updateDataBtn');
const accuracyTable = document.getElementById('accuracyTable');
const timelineChart = document.getElementById('timelineChart');
const picksStatus = document.getElementById('picksStatus');

const USER_COLORS = ['#e10600', '#0f1724', '#1263e6', '#0f9f8f'];

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  return res.json();
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
          <div class="trend-stat"><span>Avg pts/round</span><strong>${fixed(row.avg)}</strong></div>
          <div class="trend-stat"><span>Best streak</span><strong>${row.bestStreak}</strong></div>
          <div class="trend-stat"><span>Current streak</span><strong>${row.currentStreak}</strong></div>
          <div class="trend-stat"><span>Lock hit rate</span><strong>${pct(row.lockRate)}</strong></div>
          <div class="trend-stat"><span>Consistency</span><strong>${fixed(row.consistency)}</strong></div>
          <div class="trend-stat"><span>Clutch</span><strong>${fixed(row.clutch)}</strong></div>
          <div class="trend-stat"><span>Accuracy</span><strong>${pct(accuracy.accuracy)}</strong></div>
          <div class="trend-stat"><span>Correct / Attempted</span><strong>${accuracy.correct} / ${accuracy.attempted}</strong></div>
          <div class="trend-stat"><span>Last 3 avg</span><strong>${fixed(m.last3Avg, 1)} pts</strong></div>
          <div class="trend-stat"><span>Trend delta</span><strong class="momentum ${momentumClass(m.delta)}">${m.delta >= 0 ? '+' : ''}${fixed(m.delta, 1)}</strong></div>
        </div>
      </article>
    `;
  }).join('');

  kpiGrid.innerHTML = cards;
}

async function loadStandings() {
  const standings = await fetchJson('/api/season/standings?season=2026');

  const logoFor = (team) => {
    const slug = String(team || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return `<img class="logo" src="/team-logos/${slug}.png" alt="${team || ''}" onerror="this.remove()">`;
  };

  const renderDriverItem = (d, idx) => `
    <li class="standing-item">
      <span class="standing-rank">${idx + 1}</span>
      <div class="standing-main">
        <div class="standing-name">${d.driverName}</div>
        <div class="standing-sub">${logoFor(d.team)}${d.team}</div>
      </div>
      <div class="standing-points">${d.points}<span>pts</span></div>
    </li>
  `;

  const renderTeamItem = (t, idx) => `
    <li class="standing-item">
      <span class="standing-rank">${idx + 1}</span>
      <div class="standing-main">
        <div class="standing-name">${logoFor(t.team)}${t.team}</div>
        <div class="standing-sub">Constructor</div>
      </div>
      <div class="standing-points">${t.points}<span>pts</span></div>
    </li>
  `;

  const driverRows = standings.driverStandings.slice(0, 22).map(renderDriverItem).join('');
  const teamRows = standings.constructorStandings.slice(0, 11).map(renderTeamItem).join('');

  standingsTable.innerHTML = `
    <div class="standings-board">
      <section class="standings-panel">
        <header class="standings-header">
          <h3>WDC Standings</h3>
          <span class="chip">1-22</span>
        </header>
        <ol class="standings-list">${driverRows}</ol>
      </section>

      <section class="standings-panel">
        <header class="standings-header">
          <h3>WCC Standings</h3>
          <span class="chip">1-11</span>
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
        <span class="k">Accuracy Leader</span>
        <strong>${leader.user}</strong>
        <span>${(leader.accuracy * 100).toFixed(1)}%</span>
      </div>
      <div class="insight-pill">
        <span class="k">Hot Momentum</span>
        <strong>${hottest.user}</strong>
        <span class="momentum ${momentumClass(hottest.delta)}">${momentumLabel(hottest.delta)}</span>
      </div>
      <div class="insight-pill">
        <span class="k">Head-to-Head</span>
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
            <div><span>Correct</span><strong>${row.correct}</strong></div>
            <div><span>Attempted</span><strong>${row.attempted}</strong></div>
            <div><span>Last 3 avg</span><strong>${row.last3Avg.toFixed(1)} pts</strong></div>
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

async function loadPicksStatus() {
  const picks = await fetchJson('/api/season/picks?season=2026');
  if (!picks.length) {
    picksStatus.textContent = 'No season template picks yet.';
    return;
  }
  picksStatus.textContent = 'Season template saved.';
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
  await loadStandings();

  const [weeklyStats, accuracyRows, timeline] = await Promise.all([
    fetchJson('/api/weekly/stats?season=2026'),
    fetchJson('/api/season/accuracy?season=2026'),
    fetchJson('/api/season/timeline?season=2026')
  ]);

  renderTrendCards(weeklyStats, accuracyRows, timeline);
  renderAccuracyMomentum(accuracyRows, timeline);
  renderTimeline(timeline);
  await loadPicksStatus();
}

updateDataBtn.addEventListener('click', updateData);

(async function init() {
  await autoUpdateOnLoad();
  await refreshAll();
})();
