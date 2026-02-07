const STORAGE_KEY = 'f1-theme';
const root = document.documentElement;

function getPreferredTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'light';
}

function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
}

function syncToggleButton(btn) {
  const isDark = root.getAttribute('data-theme') === 'dark';
  btn.setAttribute('aria-label', 'Toggle theme');
  btn.setAttribute('aria-pressed', String(isDark));
  btn.classList.toggle('is-dark', isDark);
}

function wireToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;

  syncToggleButton(btn);

  btn.addEventListener('click', () => {
    const now = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(now);
    localStorage.setItem(STORAGE_KEY, now);
    syncToggleButton(btn);
  });
}

applyTheme(getPreferredTheme());

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireToggle);
} else {
  wireToggle();
}
