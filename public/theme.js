const THEME_STORAGE_KEY = 'f1-theme';
const NAV_STYLE_STORAGE_KEY = 'f1-nav-style';
const NAV_STYLES = ['pills', 'underline', 'segmented'];
const root = document.documentElement;

function getPreferredTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return 'light';
}

function getPreferredNavStyle() {
  const saved = localStorage.getItem(NAV_STYLE_STORAGE_KEY);
  if (NAV_STYLES.includes(saved)) return saved;
  return 'pills';
}

function applyTheme(theme) {
  root.setAttribute('data-theme', theme);
}

function applyNavStyle(style) {
  const resolved = NAV_STYLES.includes(style) ? style : 'pills';
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
  const host = document.querySelector('.app-header .header-actions');
  if (!host) return null;

  let group = host.querySelector('.nav-style-switch');
  if (group) return group;

  group = document.createElement('div');
  group.className = 'nav-style-switch';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Navigation style');

  const styles = [
    { key: 'pills', label: 'A', title: 'Pill tabs' },
    { key: 'underline', label: 'B', title: 'Underline tabs' },
    { key: 'segmented', label: 'C', title: 'Segmented tabs' }
  ];

  for (const item of styles) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-style-btn';
    btn.dataset.navStyle = item.key;
    btn.textContent = item.label;
    btn.title = item.title;
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('click', () => {
      applyNavStyle(item.key);
      localStorage.setItem(NAV_STYLE_STORAGE_KEY, item.key);
      syncNavStyleButtons(group);
    });
    group.appendChild(btn);
  }

  host.appendChild(group);
  return group;
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
  const group = buildNavStylePicker();
  syncNavStyleButtons(group);
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
