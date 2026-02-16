function qs(name) {
  return new URLSearchParams(window.location.search).get(name);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const season = Number(qs('season') || 2026);
const round = Number(qs('round') || 1);
const raceNameFromQuery = qs('race') || '';

const backToHistoricalBtn = document.getElementById('backToHistoricalBtn');
const weekendSelect = document.getElementById('weekendSelect');
const openWeekendBtn = document.getElementById('openWeekendBtn');

function shortDate(iso) {
  if (!iso) return '';
  const date = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function navigateToRound(roundValue, raceName) {
  window.location.href = `/race.html?season=${season}&round=${roundValue}&race=${encodeURIComponent(raceName || '')}`;
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
    <tr><td>${i + 1}</td><td>${nameMap.get(q.driverId) || q.driverId}</td></tr>
  `).join('');

  const raceRows = raceResults.slice(0, 10).map((r, i) => `
    <tr><td>${i + 1}</td><td>${nameMap.get(r.driverId) || r.driverId}</td><td>${r.points || 0}</td></tr>
  `).join('');

  document.getElementById('qualiTable').innerHTML = `
    <table><thead><tr><th>#</th><th>Driver</th></tr></thead><tbody>${qualiRows}</tbody></table>
  `;
  document.getElementById('raceTable').innerHTML = `
    <table><thead><tr><th>#</th><th>Driver</th><th>Pts</th></tr></thead><tbody>${raceRows}</tbody></table>
  `;

  const pickRows = preds.map(p => `
    <tr>
      <td>${p.user}</td>
      <td>${nameMap.get(p.p1_driver_id) || '—'}</td>
      <td>${nameMap.get(p.p2_driver_id) || '—'}</td>
      <td>${nameMap.get(p.p3_driver_id) || '—'}</td>
      <td>${nameMap.get(p.pole_driver_id) || '—'}</td>
      <td>${nameMap.get(p.fastest_lap_driver_id) || '—'}</td>
      <td>${p.score_total || 0}</td>
    </tr>
  `).join('');

  document.getElementById('picksTable').innerHTML = `
    <table>
      <thead>
        <tr>
          <th>User</th><th>P1</th><th>P2</th><th>P3</th><th>Pole</th><th>Fastest</th><th>Total</th>
        </tr>
      </thead>
      <tbody>${pickRows}</tbody>
    </table>
  `;
}

load().catch(err => {
  document.getElementById('picksTable').textContent = err.message;
});
