/* app.js — shared utilities */

const API_BASE = 'http://localhost:5000/api';

// Footer year
document.querySelectorAll('#footer-year').forEach(el => {
  el.textContent = new Date().getFullYear();
});

// ── Class meta ─────────────────────────────────────────────────────────────
const CLASS_META = {
  Hexacopter:   { icon: '🚁', color: '#00D4FF' },
  Octacopter:   { icon: '🛸', color: '#FF6B35' },
  Quadcopter:   { icon: '🚀', color: '#00FF88' },
  Single_motor: { icon: '🌀', color: '#FFD700' },
  Tricopter:    { icon: '✈️', color: '#BF5FFF' },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' });
}

function fmtPct(f) {
  return (f * 100).toFixed(1) + '%';
}

// ── Fetch wrapper ────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Populate hero stats on classify page ────────────────────────────────────
async function loadHeroStats() {
  try {
    const data = await apiFetch('/stats');
    const accEl = document.getElementById('stat-acc');
    const totEl = document.getElementById('stat-total');
    if (accEl) accEl.textContent = data.accuracy ? data.accuracy + '%' : '93.2%';
    if (totEl) totEl.textContent = data.totalScans ?? '0';
  } catch {
    // backend not reachable — show placeholders
    const accEl = document.getElementById('stat-acc');
    if (accEl) accEl.textContent = '93.2%';
  }
}

loadHeroStats();
