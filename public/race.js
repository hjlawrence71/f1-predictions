function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const season = Number(qs('season') || 2026);
const round = Number(qs('round') || 1);
const raceNameFromQuery = qs('race') || '';

const backToHistoricalBtn = document.getElementById('backToHistoricalBtn');
const weekendSelect = document.getElementById('weekendSelect');
const openWeekendBtn = document.getElementById('openWeekendBtn');
const wildcardStatus = document.getElementById('wildcardStatus');
const wildcardScoring = document.getElementById('wildcardScoring');

function shortDate(iso) {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function navigateToRound(roundValue, raceName) {
  window.location.href = `/race.html?season=${season}&round=${roundValue}&race=${encodeURIComponent(raceName || '')}`;
}

function driverName(nameMap, driverId) {
  return nameMap.get(driverId) || '—';
}

function wildcardStateLabel(value) {
  if (value === true) return 'Hit';
  if (value === false) return 'Miss';
  return 'Pending';
}

function wildcardStateTone(value) {
  if (value === true) return 'dark';
  if (value === false) return 'red';
  return '';
}

async function promptForScorer(defaultUser) {
  const cached = localStorage.getItem('f1-wildcard-score-user') || defaultUser || 'Harrison';
  const user = String(window.prompt('Score wildcard as which user?', cached) || '').trim();
  if (!user) return null;

  const pin = String(window.prompt(`Enter ${user}'s PIN to save wildcard scoring.`) || '').trim();
  if (!pin) return null;

  localStorage.setItem('f1-wildcard-score-user', user);
  return { user, pin };
}

function renderWildcardControls(preds, nameMap) {
  if (!wildcardScoring) return;

  const rows = preds.filter((row) => row.wildcard_text || row.wildcard_driver_id);
  if (!rows.length) {
    wildcardScoring.innerHTML = '<div class="muted">No wildcard picks saved for this weekend.</div>';
    if (wildcardStatus) wildcardStatus.innerHTML = '<span class="chip">Waiting for wildcard picks</span>';
    return;
  }

  if (wildcardStatus) {
    const resolved = rows.filter((row) => row.wildcard_result === true || row.wildcard_result === false).length;
    wildcardStatus.innerHTML = `<span class="chip ${resolved === rows.length ? 'dark' : ''}">${resolved}/${rows.length} scored</span>`;
  }

  wildcardScoring.innerHTML = rows.map((row) => {
    const statusLabel = wildcardStateLabel(row.wildcard_result);
    const statusTone = wildcardStateTone(row.wildcard_result);
    const scoredMeta = row.wildcard_scored_by
      ? `<div class="muted">Scored by ${row.wildcard_scored_by}${row.wildcard_scored_at ? ` · ${new Date(row.wildcard_scored_at).toLocaleString()}` : ''}</div>`
      : '<div class="muted">Not scored yet.</div>';

    return `
      <article class="wildcard-score-card">
        <header class="wildcard-score-head">
          <div>
            <strong>${row.user}</strong>
            <div class="muted">Wildcard</div>
          </div>
          <div class="wildcard-score-points">
            <span class="chip ${statusTone}">${statusLabel}</span>
            <span class="chip ${row.score_wildcard ? 'dark' : ''}">${row.score_wildcard || 0} pt</span>
          </div>
        </header>
        <div class="wildcard-score-body">
          <div class="wildcard-score-text">${row.wildcard_text || driverName(nameMap, row.wildcard_driver_id)}</div>
          ${scoredMeta}
        </div>
        <div class="wildcard-score-actions">
          <button class="btn" type="button" data-wildcard-score="true" data-target-user="${row.user}">Hit</button>
          <button class="btn ghost" type="button" data-wildcard-score="false" data-target-user="${row.user}">Miss</button>
          <button class="btn ghost" type="button" data-wildcard-score="clear" data-target-user="${row.user}">Clear</button>
        </div>
      </article>
    `;
  }).join('');

  wildcardScoring.querySelectorAll('[data-wildcard-score]').forEach((button) => {
    button.addEventListener('click', async () => {
      const targetUser = button.getAttribute('data-target-user');
      const scoreValue = button.getAttribute('data-wildcard-score');
      const scorer = await promptForScorer(targetUser);
      if (!scorer) return;

      button.disabled = true;
      if (wildcardStatus) wildcardStatus.innerHTML = '<span class="chip">Saving wildcard score…</span>';

      try {
        await fetchJson('/api/predictions/wildcard-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user: scorer.user,
            pin: scorer.pin,
            targetUser,
            season,
            round,
            hit: scoreValue === 'clear' ? null : scoreValue === 'true'
          })
        });
        await load();
      } catch (err) {
        if (wildcardStatus) wildcardStatus.innerHTML = `<span class="chip red">${err.message}</span>`;
        alert(err.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderPicksTable(preds, nameMap) {
  const actuals = preds[0]?.actuals || {};
  const actualQual = [
    actuals.qual_p1_driver_id,
    actuals.qual_p2_driver_id,
    actuals.qual_p3_driver_id,
    actuals.qual_p4_driver_id,
    actuals.qual_p5_driver_id
  ];
  const actualRace = [
    actuals.race_p1_driver_id,
    actuals.race_p2_driver_id,
    actuals.race_p3_driver_id,
    actuals.race_p4_driver_id,
    actuals.race_p5_driver_id
  ];

  const pickRows = preds.map((p) => `
    <tr>
      <td>${p.user}</td>
      <td>${driverName(nameMap, p.qual_p1_driver_id)}</td>
      <td>${driverName(nameMap, p.qual_p2_driver_id)}</td>
      <td>${driverName(nameMap, p.qual_p3_driver_id)}</td>
      <td>${driverName(nameMap, p.qual_p4_driver_id)}</td>
      <td>${driverName(nameMap, p.qual_p5_driver_id)}</td>
      <td>${driverName(nameMap, p.race_p1_driver_id)}</td>
      <td>${driverName(nameMap, p.race_p2_driver_id)}</td>
      <td>${driverName(nameMap, p.race_p3_driver_id)}</td>
      <td>${driverName(nameMap, p.race_p4_driver_id)}</td>
      <td>${driverName(nameMap, p.race_p5_driver_id)}</td>
      <td>${driverName(nameMap, p.fastest_lap_driver_id)}</td>
      <td>${p.wildcard_text || driverName(nameMap, p.wildcard_driver_id)}</td>
      <td><span class="chip ${wildcardStateTone(p.wildcard_result)}">${wildcardStateLabel(p.wildcard_result)}</span></td>
      <td>${p.score_total || 0}</td>
    </tr>
  `).join('');

  document.getElementById('picksTable').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>User</th>
          <th>Q1</th>
          <th>Q2</th>
          <th>Q3</th>
          <th>Q4</th>
          <th>Q5</th>
          <th>R1</th>
          <th>R2</th>
          <th>R3</th>
          <th>R4</th>
          <th>R5</th>
          <th>Fastest</th>
          <th>Wildcard</th>
          <th>Wildcard score</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        <tr class="actuals-row">
          <td>Actual</td>
          <td>${driverName(nameMap, actualQual[0])}</td>
          <td>${driverName(nameMap, actualQual[1])}</td>
          <td>${driverName(nameMap, actualQual[2])}</td>
          <td>${driverName(nameMap, actualQual[3])}</td>
          <td>${driverName(nameMap, actualQual[4])}</td>
          <td>${driverName(nameMap, actualRace[0])}</td>
          <td>${driverName(nameMap, actualRace[1])}</td>
          <td>${driverName(nameMap, actualRace[2])}</td>
          <td>${driverName(nameMap, actualRace[3])}</td>
          <td>${driverName(nameMap, actualRace[4])}</td>
          <td>${driverName(nameMap, actuals.fastest_lap_driver_id)}</td>
          <td>Manual review</td>
          <td>—</td>
          <td>—</td>
        </tr>
        ${pickRows}
      </tbody>
    </table>
  `;
}

async function load() {
  const races = await fetchJson(`/api/races?season=${season}`);
  const race = races.find(r => r.round === round);
  const raceName = raceNameFromQuery || race?.raceName || 'Race';

  document.getElementById('raceTitle').textContent =
    `${raceName} (Round ${round}${race?.start_date ? `, ${race.start_date}` : ''})`;

  if (backToHistoricalBtn) {
    backToHistoricalBtn.href = `/season.html?season=${season}&round=${round}#historicalSection`;
  }

  if (weekendSelect) {
    weekendSelect.innerHTML = '';
    races.forEach(r => {
      const option = document.createElement('option');
      option.value = String(r.round);
      option.dataset.raceName = r.raceName || '';
      option.textContent = `R${r.round} · ${r.raceName} (${shortDate(r.start_date)})`;
      weekendSelect.appendChild(option);
    });

    weekendSelect.value = String(round);
  }

  if (openWeekendBtn) {
    openWeekendBtn.onclick = () => {
      if (!weekendSelect) return;
      const selected = weekendSelect.options[weekendSelect.selectedIndex];
      const selectedRound = Number(weekendSelect.value);
      navigateToRound(selectedRound, selected?.dataset?.raceName || '');
    };
  }

  const [drivers, quali, raceResults, preds] = await Promise.all([
    fetchJson('/api/drivers'),
    fetchJson(`/api/qualifying?season=${season}&round=${round}`),
    fetchJson(`/api/results?season=${season}&round=${round}`),
    fetchJson(`/api/predictions?season=${season}&round=${round}`)
  ]);

  const nameMap = new Map(drivers.map(d => [d.driverId, d.driverName]));

  const qualiRows = quali.slice(0, 10).map((q, i) => `
    <tr><td>${i + 1}</td><td>${driverName(nameMap, q.driverId)}</td></tr>
  `).join('');

  const raceRows = raceResults.slice(0, 10).map((r, i) => `
    <tr><td>${i + 1}</td><td>${driverName(nameMap, r.driverId)}</td><td>${r.points || 0}</td></tr>
  `).join('');

  document.getElementById('qualiTable').innerHTML = `
    <table><thead><tr><th>#</th><th>Driver</th></tr></thead><tbody>${qualiRows}</tbody></table>
  `;
  document.getElementById('raceTable').innerHTML = `
    <table><thead><tr><th>#</th><th>Driver</th><th>Pts</th></tr></thead><tbody>${raceRows}</tbody></table>
  `;

  renderPicksTable(preds, nameMap);
  renderWildcardControls(preds, nameMap);
}

load().catch(err => {
  document.getElementById('picksTable').textContent = err.message;
  if (wildcardStatus) wildcardStatus.innerHTML = `<span class="chip red">${err.message}</span>`;
});
