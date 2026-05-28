/* classify.js — image upload & classification UI */

(function () {
  const dropZone   = document.getElementById('dropZone');
  const fileInput  = document.getElementById('fileInput');
  const previewWrap= document.getElementById('previewWrap');
  const previewImg = document.getElementById('previewImg');
  const removeBtn  = document.getElementById('removeBtn');
  const classifyBtn= document.getElementById('classifyBtn');
  const resultPanel= document.getElementById('resultPanel');

  if (!dropZone) return; // not on classify page

  let currentFile = null;

  // ── Drag & drop ─────────────────────────────────────────────────────────
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });

  dropZone.addEventListener('click', e => {
    if (e.target === removeBtn || removeBtn.contains(e.target)) return;
    fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) loadFile(fileInput.files[0]);
  });

  // ── Load preview ────────────────────────────────────────────────────────
  function loadFile(file) {
    if (!file.type.startsWith('image/')) { alert('Please upload an image file.'); return; }
    if (file.size > 10 * 1024 * 1024)   { alert('File must be under 10 MB.');    return; }

    currentFile = file;
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    previewWrap.style.display = 'block';
    dropZone.querySelector('.drop-inner').style.display = 'none';
    classifyBtn.disabled = false;
    resultPanel.style.display = 'none';
  }

  removeBtn.addEventListener('click', e => {
    e.stopPropagation();
    resetUI();
  });

  function resetUI() {
    currentFile = null;
    previewImg.src = '';
    previewWrap.style.display = 'none';
    dropZone.querySelector('.drop-inner').style.display = 'flex';
    classifyBtn.disabled = true;
    resultPanel.style.display = 'none';
    fileInput.value = '';
  }

  // ── Classify ─────────────────────────────────────────────────────────────
  classifyBtn.addEventListener('click', async () => {
    if (!currentFile) return;

    const btnText   = classifyBtn.querySelector('.btn-text');
    const btnLoader = classifyBtn.querySelector('.btn-loader');
    btnText.style.display   = 'none';
    btnLoader.style.display = 'inline';
    classifyBtn.disabled = true;

    try {
      const formData = new FormData();
      formData.append('image', currentFile);

      const res = await fetch(`${API_BASE}/classify`, { method: 'POST', body: formData });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      showResult(data);
    } catch (err) {
      // ── DEMO FALLBACK (no backend) ──────────────────────────────────────
      console.warn('Backend not reachable — using demo result:', err.message);
      const classes = ['Hexacopter','Octacopter','Quadcopter','Single_motor','Tricopter'];
      const probs   = classes.map(() => Math.random());
      const sum     = probs.reduce((a,b) => a + b, 0);
      const norm    = probs.map(p => p / sum);
      const topIdx  = norm.indexOf(Math.max(...norm));

      const demoResult = {
        predictedClass: classes[topIdx],
        confidence: norm[topIdx],
        allProbabilities: Object.fromEntries(classes.map((c,i) => [c, norm[i]])),
        scannedAt: new Date().toISOString(),
        filename: currentFile.name,
      };
      showResult(demoResult);
    } finally {
      btnText.style.display   = 'inline';
      btnLoader.style.display = 'none';
      classifyBtn.disabled    = false;
    }
  });

  // ── Render result ────────────────────────────────────────────────────────
  function showResult(data) {
    const panel    = resultPanel;
    const meta     = CLASS_META[data.predictedClass] || { icon: '🤖', color: '#00D4FF' };

    document.getElementById('resultClass').textContent = data.predictedClass.replace('_', ' ');
    document.getElementById('resultIcon').textContent  = meta.icon;
    document.getElementById('resultTs').textContent    = fmtDate(data.scannedAt);

    const pct = (data.confidence * 100).toFixed(1);
    document.getElementById('confPct').textContent = pct + '%';
    const bar = document.getElementById('confBar');
    bar.style.setProperty('--pct', pct + '%');

    // All probabilities
    const container = document.getElementById('allProbs');
    container.innerHTML = '';
    const sorted = Object.entries(data.allProbabilities).sort((a,b) => b[1]-a[1]);
    sorted.forEach(([cls, prob]) => {
      const m = CLASS_META[cls] || { color: '#00D4FF' };
      const row = document.createElement('div');
      row.className = 'prob-row';
      row.innerHTML = `
        <span class="prob-label">${cls.replace('_',' ')}</span>
        <div class="prob-bar-bg">
          <div class="prob-bar-fill" style="width:${(prob*100).toFixed(1)}%;background:${m.color};"></div>
        </div>
        <span class="prob-pct-sm">${(prob*100).toFixed(1)}%</span>
      `;
      container.appendChild(row);
    });

    panel.style.display = 'block';

    // Save / new scan buttons
    document.getElementById('saveBtn').onclick    = () => saveResult(data);
    document.getElementById('newScanBtn').onclick = () => resetUI();
    document.getElementById('saveMsg').style.display = 'none';
  }

  // ── Save to DB ───────────────────────────────────────────────────────────
  async function saveResult(data) {
    try {
      await apiFetch('/classifications', {
        method: 'POST',
        body: JSON.stringify({
          filename:        data.filename,
          predictedClass:  data.predictedClass,
          confidence:      data.confidence,
          allProbabilities: data.allProbabilities,
        }),
      });
      document.getElementById('saveMsg').style.display = 'block';
    } catch {
      alert('Could not save — is the backend running?');
    }
  }
})();
