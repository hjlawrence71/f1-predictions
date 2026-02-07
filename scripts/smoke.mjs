const base = process.env.BASE_URL || 'http://localhost:3000';

const checks = [
  '/health',
  '/api/seasons',
  '/api/races?season=2026',
  '/api/weekly/stats?season=2026'
];

for (const route of checks) {
  const url = `${base}${route}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new Error(`[smoke] ${route} failed with ${res.status}`);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    await res.json();
  } else {
    await res.text();
  }

  console.log(`[smoke] OK ${route}`);
}

console.log('[smoke] All checks passed');
