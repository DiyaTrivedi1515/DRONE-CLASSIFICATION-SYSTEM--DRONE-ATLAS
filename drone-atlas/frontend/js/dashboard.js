/* dashboard.js — history table, KPIs, chart */

(function () {
  if (!document.getElementById('scanTableBody')) return;

  const PAGE_SIZE   = 10;
  let   allRecords  = [];
  let   filtered    = [];
  let   currentPage = 1;

  const tbody      = document.getElementById('scanTableBody');
  const pagination = document.getElementById('pagination');
  const searchIn   = document.getElementById('searchInput');
  const classFilter= document.getElementById('classFilter');
  const sortFilter = document.getElementById('sortFilter');
  const refreshBtn = document.getElementById('refreshBtn');

  // ── Boot ─────────────────────────────────────────────────────────────────
  loadData();

  refreshBtn.addEventListener('click', loadData);
  searchIn.addEventListener('input',   applyFilters);
  classFilter.addEventListener('change', applyFilters);
  sortFilter.addEventListener('change',  applyFilters);

  // ── Fetch ────────────────────────────────────────────────────────────────
  async function loadData() {
    tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading…</td></tr>';
    try {
      const data = await apiFetch('/classifications?limit=500');
      allRecords  = data.records || data;
      renderKPIs(allRecords);
      renderChart(allRecords);
      applyFilters();
    } catch {
      // Demo data when backend is offline
      allRecords = generateDemoData(42);
      renderKPIs(allRecords);
      renderChart(allRecords);
      applyFilters();
    }
  }

  // ── Filters & sort ───────────────────────────────────────────────────────
  function applyFilters() {
    const q   = searchIn.value.trim().toLowerCase();
    const cls = classFilter.value;
    const srt = sortFilter.value;

    filtered = allRecords.filter(r => {
      if (cls && r.predictedClass !== cls) return false;
      if (q && !(r.filename || '').toLowerCase().includes(q)) return false;
      return true;
    });

    filtered.sort((a, b) => {
      if (srt === 'newest')    return new Date(b.scannedAt) - new Date(a.scannedAt);
      if (srt === 'oldest')    return new Date(a.scannedAt) - new Date(b.scannedAt);
      if (srt === 'conf-desc') return b.confidence - a.confidence;
      if (srt === 'conf-asc')  return a.confidence - b.confidence;
      return 0;
    });

    currentPage = 1;
    renderTable();
    renderPagination();
  }

  // ── Table ────────────────────────────────────────────────────────────────
  function renderTable() {
    const start   = (currentPage - 1) * PAGE_SIZE;
    const slice   = filtered.slice(start, start + PAGE_SIZE);

    if (!slice.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No records found.</td></tr>';
      return;
    }

    tbody.innerHTML = slice.map((r, i) => {
      const meta = CLASS_META[r.predictedClass] || { color: '#00D4FF' };
      const pct  = (r.confidence * 100).toFixed(1);
      return `
        <tr>
          <td style="color:var(--text-dim);font-family:var(--font-mono);font-size:.75rem">${start + i + 1}</td>
          <td style="font-family:var(--font-mono);font-size:.75rem;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.filename || '—'}">${r.filename || '—'}</td>
          <td><span class="class-pill ${r.predictedClass}">${r.predictedClass.replace('_',' ')}</span></td>
          <td class="conf-cell" style="color:${meta.color}">${pct}%</td>
          <td class="ts-cell">${fmtDate(r.scannedAt)}</td>
          <td><button class="detail-btn" data-id="${r._id || i}">Detail</button></td>
        </tr>
      `;
    }).join('');

    // Detail button
    tbody.querySelectorAll('.detail-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => showModal(filtered[start + i]));
    });
  }

  // ── Pagination ────────────────────────────────────────────────────────────
  function renderPagination() {
    const total = Math.ceil(filtered.length / PAGE_SIZE);
    if (total <= 1) { pagination.innerHTML = ''; return; }
    pagination.innerHTML = Array.from({ length: total }, (_, i) => `
      <button class="page-btn ${i+1 === currentPage ? 'active' : ''}" data-page="${i+1}">${i+1}</button>
    `).join('');
    pagination.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentPage = parseInt(btn.dataset.page);
        renderTable();
        renderPagination();
      });
    });
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  function renderKPIs(records) {
    const today = new Date().toDateString();
    const todayCount = records.filter(r => new Date(r.scannedAt).toDateString() === today).length;
    const avgConf = records.length ? (records.reduce((s,r) => s + r.confidence, 0) / records.length * 100).toFixed(1) + '%' : '—';

    const classCounts = {};
    records.forEach(r => { classCounts[r.predictedClass] = (classCounts[r.predictedClass] || 0) + 1; });
    const topClass = Object.entries(classCounts).sort((a,b) => b[1]-a[1])[0]?.[0]?.replace('_',' ') || '—';

    document.getElementById('kpi-total').textContent    = records.length;
    document.getElementById('kpi-today').textContent    = todayCount;
    document.getElementById('kpi-avg-conf').textContent = avgConf;
    document.getElementById('kpi-top-class').textContent= topClass;
  }

  // ── Chart ─────────────────────────────────────────────────────────────────
  function renderChart(records) {
    const colors = { Hexacopter:'#00D4FF', Octacopter:'#FF6B35', Quadcopter:'#00FF88', Single_motor:'#FFD700', Tricopter:'#BF5FFF' };
    const counts = {};
    records.forEach(r => { counts[r.predictedClass] = (counts[r.predictedClass] || 0) + 1; });
    const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
    const max    = sorted[0]?.[1] || 1;

    const container = document.getElementById('barChart');
    container.innerHTML = sorted.map(([cls, cnt]) => `
      <div class="chart-row">
        <span class="chart-label">${cls.replace('_',' ')}</span>
        <div class="chart-bar-bg">
          <div class="chart-bar-fill" style="width:${(cnt/max*100).toFixed(1)}%;background:${colors[cls]||'#00D4FF'}">
            <span class="chart-bar-count">${cnt}</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  // ── Modal ─────────────────────────────────────────────────────────────────
  const overlay   = document.getElementById('modalOverlay');
  const modalBody = document.getElementById('modalBody');
  const modalClose= document.getElementById('modalClose');

  function showModal(r) {
    const meta = CLASS_META[r.predictedClass] || { icon: '🤖', color: '#00D4FF' };
    const probs = r.allProbabilities
      ? Object.entries(r.allProbabilities).sort((a,b)=>b[1]-a[1])
          .map(([c,p]) => `<div class="modal-row"><span class="modal-key">${c.replace('_',' ')}</span><span class="modal-val">${(p*100).toFixed(2)}%</span></div>`).join('')
      : '<div class="modal-row"><span class="modal-key">—</span></div>';

    modalBody.innerHTML = `
      <div class="modal-row"><span class="modal-key">Filename</span><span class="modal-val">${r.filename || '—'}</span></div>
      <div class="modal-row"><span class="modal-key">Predicted</span><span class="modal-val" style="color:${meta.color}">${meta.icon} ${r.predictedClass.replace('_',' ')}</span></div>
      <div class="modal-row"><span class="modal-key">Confidence</span><span class="modal-val">${(r.confidence*100).toFixed(2)}%</span></div>
      <div class="modal-row"><span class="modal-key">Scanned At</span><span class="modal-val">${fmtDate(r.scannedAt)}</span></div>
      <div style="margin-top:1rem;font-size:.65rem;letter-spacing:.12em;color:var(--text-dim);margin-bottom:.5rem">ALL PROBABILITIES</div>
      ${probs}
    `;
    overlay.style.display = 'flex';
  }

  modalClose.addEventListener('click', () => { overlay.style.display = 'none'; });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });

  // ── Demo data generator ──────────────────────────────────────────────────
  function generateDemoData(n) {
    const classes = ['Hexacopter','Octacopter','Quadcopter','Single_motor','Tricopter'];
    return Array.from({ length: n }, (_, i) => {
      const cls   = classes[Math.floor(Math.random() * classes.length)];
      const conf  = 0.5 + Math.random() * 0.49;
      const probs = classes.map(() => Math.random());
      const sum   = probs.reduce((a,b)=>a+b,0);
      const norm  = Object.fromEntries(classes.map((c,j) => [c, probs[j]/sum]));
      const date  = new Date(Date.now() - Math.random() * 7 * 86400000);
      return { _id: String(i), filename: `drone_${i+1}.jpg`, predictedClass: cls, confidence: conf, allProbabilities: norm, scannedAt: date.toISOString() };
    });
  }
})();
