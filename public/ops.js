const seasonSelect = document.getElementById('seasonSelect');
const userSelect = document.getElementById('userSelect');
const runHealthBtn = document.getElementById('runHealthBtn');
const createSnapshotBtn = document.getElementById('createSnapshotBtn');
const refreshSnapshotsBtn = document.getElementById('refreshSnapshotsBtn');
const healthSummary = document.getElementById('healthSummary');
const healthChecksGrid = document.getElementById('healthChecksGrid');
const snapshotDbMeta = document.getElementById('snapshotDbMeta');
const snapshotsBody = document.getElementById('snapshotsBody');
const opsStatus = document.getElementById('opsStatus');

function setStatus(message) {
  opsStatus.textContent = message;
}

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

function selectedSeason() {
  return toInt(seasonSelect?.value) || 2026;
}

function selectedUser() {
  return String(userSelect?.value || '').trim();
}

function getSavedPin(user) {
  return localStorage.getItem(`pin:${user}`) || '';
}

async function requirePin(user, actionLabel = 'continue') {
  if (!user) throw new Error('Select user first.');
  const current = getSavedPin(user);
  const pin = window.prompt(`Enter PIN for ${user} to ${actionLabel}`, current || '');
  if (pin === null) return null;
  localStorage.setItem(`pin:${user}`, pin);
  return pin;
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 ** 2)).toFixed(2)} MB`;
}

async function fetchJson(url, options = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

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

function option(label, value) {
  const el = document.createElement('option');
  el.value = value;
  el.textContent = label;
  return el;
}

function parseErrorMessage(err) {
  const raw = String(err?.message || 'Request failed');
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.error) return parsed.error;
  } catch {
    // Keep raw message for non-JSON responses.
  }
  return raw;
}

async function loadUsers() {
  const config = await fetchJson('/api/config');
  userSelect.innerHTML = '';
  userSelect.appendChild(option('Select user', ''));
  (config.users || []).forEach((user) => userSelect.appendChild(option(user, user)));
}

async function loadSeasons() {
  const seasons = await fetchJson('/api/seasons');
  seasonSelect.innerHTML = '';
  seasons
    .slice()
    .sort((a, b) => b - a)
    .forEach((season) => seasonSelect.appendChild(option(String(season), season)));
  if (seasons.includes(2026)) seasonSelect.value = '2026';
}

function renderHealth(report) {
  const counts = report?.counts || { ok: 0, warn: 0, fail: 0 };
  const statusClass = report?.status || 'ok';
  healthSummary.innerHTML = `
    <span class="chip ${statusClass === 'fail' ? 'red' : ''}">${String(report?.status || 'unknown').toUpperCase()}</span>
    Checked ${report?.checkedAt || '—'} · OK ${counts.ok} · WARN ${counts.warn} · FAIL ${counts.fail}
  `;

  const cards = (report?.checks || []).map((check) => {
    const status = String(check.status || 'ok');
    const details = check.details ? JSON.stringify(check.details, null, 2) : '{}';
    return `
      <article class="health-card ${status}">
        <header>
          <h3>${check.label || check.id}</h3>
          <span class="chip ${status === 'fail' ? 'red' : ''}">${status.toUpperCase()}</span>
        </header>
        <div class="health-message">${check.message || ''}</div>
        <details>
          <summary>Details</summary>
          <pre>${details}</pre>
        </details>
      </article>
    `;
  }).join('');

  healthChecksGrid.innerHTML = cards || '<div class="muted">No checks available.</div>';
}

async function runHealthCheck() {
  setStatus('Running health check...');
  try {
    const report = await fetchJson(`/api/admin/health-check?season=${selectedSeason()}`);
    renderHealth(report);
    setStatus(`Health check complete: ${String(report.status || 'ok').toUpperCase()}.`);
  } catch (err) {
    setStatus(`Health check failed: ${parseErrorMessage(err)}`);
  }
}

function renderSnapshots(payload) {
  const db = payload?.db || {};
  const snapshots = payload?.snapshots || [];

  snapshotDbMeta.textContent = db.exists
    ? `DB: ${db.path} · ${formatBytes(db.sizeBytes)} · updated ${db.updatedAt || '—'}`
    : 'DB missing.';

  snapshotsBody.innerHTML = snapshots.map((row) => `
    <tr>
      <td><code>${row.name}</code></td>
      <td>${row.createdAt || '—'}</td>
      <td>${row.ageHours ?? '—'}</td>
      <td>${formatBytes(row.sizeBytes)}</td>
      <td><code>${String(row.sha256 || '').slice(0, 12)}…</code></td>
      <td class="right">
        <button class="btn ghost rollback-btn" type="button" data-snapshot="${row.name}">Rollback</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6">No snapshots found.</td></tr>';
}

async function loadSnapshots() {
  setStatus('Loading snapshots...');
  try {
    const payload = await fetchJson('/api/admin/snapshots');
    renderSnapshots(payload);
    setStatus(`Loaded ${payload?.snapshots?.length || 0} snapshots.`);
  } catch (err) {
    setStatus(`Snapshot load failed: ${parseErrorMessage(err)}`);
  }
}

async function createSnapshot() {
  const user = selectedUser();
  if (!user) {
    setStatus('Select user to create a snapshot.');
    return;
  }
  const pin = await requirePin(user, 'create snapshot');
  if (pin === null) {
    setStatus('Snapshot canceled.');
    return;
  }

  setStatus('Creating snapshot...');
  try {
    const payload = await fetchJson('/api/admin/snapshots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user,
        pin,
        reason: 'manual-ui'
      })
    });
    setStatus(`Snapshot created: ${payload.snapshot}`);
    await loadSnapshots();
  } catch (err) {
    setStatus(`Create snapshot failed: ${parseErrorMessage(err)}`);
  }
}

async function rollbackSnapshot(snapshot) {
  const user = selectedUser();
  if (!user) {
    setStatus('Select user to rollback.');
    return;
  }

  const confirmText = `Rollback to ${snapshot}? This overwrites current db.json.`;
  if (!window.confirm(confirmText)) return;

  const pin = await requirePin(user, 'rollback');
  if (pin === null) {
    setStatus('Rollback canceled.');
    return;
  }

  setStatus(`Rolling back to ${snapshot}...`);
  try {
    const payload = await fetchJson('/api/admin/snapshots/rollback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user,
        pin,
        snapshot
      })
    });
    setStatus(`Rollback complete: ${payload.restoredSnapshot}. Guard snapshot: ${payload.rollbackGuard || 'none'}.`);
    await Promise.all([loadSnapshots(), runHealthCheck()]);
  } catch (err) {
    setStatus(`Rollback failed: ${parseErrorMessage(err)}`);
  }
}

runHealthBtn.addEventListener('click', runHealthCheck);
createSnapshotBtn.addEventListener('click', createSnapshot);
refreshSnapshotsBtn.addEventListener('click', loadSnapshots);
seasonSelect.addEventListener('change', runHealthCheck);
snapshotsBody.addEventListener('click', (event) => {
  const button = event.target.closest('.rollback-btn');
  if (!button) return;
  const snapshot = button.getAttribute('data-snapshot');
  if (!snapshot) return;
  rollbackSnapshot(snapshot);
});

(async function init() {
  await loadUsers();
  await loadSeasons();
  await Promise.all([runHealthCheck(), loadSnapshots()]);
})();
