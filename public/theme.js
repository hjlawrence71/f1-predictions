const THEME_STORAGE_KEY = 'f1-theme';
const NAV_STYLE_STORAGE_KEY = 'f1-nav-style';
const NAV_STYLES = ['pills', 'underline', 'segmented'];
const FIXED_NAV_STYLE = 'underline';
const root = document.documentElement;

function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'light';
}

function getPreferredNavStyle() {
  return FIXED_NAV_STYLE;
}

function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
}

function applyNavStyle(style) {
  const resolved = NAV_STYLES.includes(style) ? style : FIXED_NAV_STYLE;
  root.setAttribute('data-nav-style', resolved);
}

function syncToggleButton(btn) {
  const isDark = root.getAttribute('data-theme') === 'dark';
  btn.setAttribute('aria-label', 'Toggle theme');
  btn.setAttribute('aria-pressed', String(isDark));
  btn.classList.toggle('is-dark', isDark);
}

function syncNavStyleButtons(group) {
  if (!group) return;
  const active = root.getAttribute('data-nav-style') || 'pills';
  for (const btn of group.querySelectorAll('button[data-nav-style]')) {
    const selected = btn.dataset.navStyle === active;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-pressed', String(selected));
  }
}

function buildNavStylePicker() {
  const existing = document.querySelector('.app-header .header-actions .nav-style-switch');
  if (existing) existing.remove();
  return null;
}

function wireToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;

  syncToggleButton(btn);

  btn.addEventListener('click', () => {
    const now = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(now);
    localStorage.setItem(THEME_STORAGE_KEY, now);
    syncToggleButton(btn);
  });
}

function wireNavStylePicker() {
  localStorage.setItem(NAV_STYLE_STORAGE_KEY, FIXED_NAV_STYLE);
  buildNavStylePicker();
}

applyTheme(getPreferredTheme());
applyNavStyle(getPreferredNavStyle());

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    wireToggle();
    wireNavStylePicker();
  });
} else {
  wireToggle();
  wireNavStylePicker();
}
