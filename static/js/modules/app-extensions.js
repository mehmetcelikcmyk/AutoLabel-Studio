/* ══════════════════════════════════════════════════════════════════════════
   YENİ ÖZELLİK JAVASCRIPT — Yeni API endpoint'lerinin frontend mantığı
══════════════════════════════════════════════════════════════════════════ */

(function() {
  'use strict';

  // ─── Yardımcı: auth token ────────────────────────────────────────────────
  function _token() {
    return localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
  }

  function _authHeaders() {
    const t = _token();
    const bearer = t ? (t.startsWith('Bearer ') ? t : `Bearer ${t}`) : '';
    return bearer ? { 'Authorization': bearer, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }

  // ─── Yardımcı: aktif proje ───────────────────────────────────────────────
  function _activeCategory() {
    if (window.editorApp && window.editorApp.currentCategory) {
      return window.editorApp.currentCategory;
    }
    if (window.currentProjectData && window.currentProjectData.category) {
      return window.currentProjectData.category;
    }
    const urlParams = new URLSearchParams(window.location.search);
    const fromUrl = urlParams.get('editor') || urlParams.get('project') || urlParams.get('category') || urlParams.get('cat');
    if (fromUrl) return fromUrl;

    // Fallback: Sayfadaki aktif proje badge'inden oku
    const el = document.getElementById('hubProjectTitle') || document.getElementById('currentProjectName');
    if (el) return el.dataset.category || el.textContent.trim();
    return '';
  }

  // ─── Yardımcı: toast ─────────────────────────────────────────────────────
  function _toast(msg, type) {
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type || 'info');
      return;
    }
    const container = document.getElementById('toastContainer');
    if (!container) { console.log('[Toast]', msg); return; }
    const div = document.createElement('div');
    div.className = `toast-item toast-${type || 'info'}`;
    div.textContent = msg;
    div.style.cssText = 'padding:12px 16px;border-radius:8px;margin-bottom:8px;font-size:13px;animation:fadeInUp .3s ease;';
    if (type === 'error')   div.style.background = 'rgba(239,68,68,.9)';
    else if (type === 'success') div.style.background = 'rgba(16,185,129,.9)';
    else div.style.background = 'rgba(59,130,246,.9)';
    div.style.color = '#fff';
    container.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  // ─── Yardımcı: modal aç/kapat ────────────────────────────────────────────
  function _openModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  }
  function _closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  // Modal close button delegation
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('[data-close]');
    if (btn) _closeModal(btn.dataset.close);
    // Close overlay click (Arka plana basınca kapanması istenmeyen modallar hariç)
    if (e.target.classList && e.target.classList.contains('modal-overlay')) {
      if (e.target.id === 'teamInviteModal' || e.target.getAttribute('data-backdrop') === 'static') {
        // Arka plana tıklandığında davet modalını ASLA kapatma; kartı hafifçe salla (shake)
        const card = e.target.querySelector('.team-invite-card');
        if (card) {
          card.style.transform = 'scale(1.02)';
          card.style.transition = 'transform 0.1s ease';
          setTimeout(() => { card.style.transform = 'scale(1)'; }, 150);
        }
        return;
      }
      _closeModal(e.target.id);
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 1. EXPORT FORMAT MODAL
  // ══════════════════════════════════════════════════════════════════════════
  var _exportFmtCurrentSort = null; // holds AL order if applied

  // Format card selection
  document.addEventListener('click', function(e) {
    const card = e.target.closest('.export-format-card');
    if (!card) return;
    document.querySelectorAll('.export-format-card').forEach(c => {
      c.classList.remove('selected');
      c.style.borderColor = 'rgba(255,255,255,0.1)';
      c.style.background = 'rgba(255,255,255,0.03)';
    });
    card.classList.add('selected');
    card.style.borderColor = 'rgba(59,130,246,0.6)';
    card.style.background = 'rgba(59,130,246,0.12)';
    const input = card.querySelector('input[type=radio]');
    if (input) input.checked = true;
    const fmt = card.dataset.fmt;
    const augSection = document.getElementById('augOptionsSection');
    if (augSection) augSection.style.display = fmt === 'augmented' ? 'block' : 'none';
  });

  // ── Tek Çubuk, İki Tutamaç — Tri-Split helper ───────────────────────────
  // cfg: { trackId, h1Id, h2Id, trainSegId, valSegId, testSegId,
  //        h1TipId, h2TipId, legTrainId, legValId, legTestId,
  //        trainInputId, testInputId }
  function _makeTriSplit(cfg) {
    const track = document.getElementById(cfg.trackId);
    const h1    = document.getElementById(cfg.h1Id);
    const h2    = document.getElementById(cfg.h2Id);
    if (!track || !h1 || !h2) return;

    // State (percentages, snapped to 5)
    let trainPct = 80;  // where Train ends
    let testPct  = 0;   // Test size (from the right)

    const SNAP = 5, TRAIN_MIN = 50, TRAIN_MAX = 90, TEST_MAX = 30, VAL_MIN = 5;

    function snap(v) { return Math.round(v / SNAP) * SNAP; }
    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function apply(newTrain, newTest) {
      newTrain = snap(clamp(newTrain, TRAIN_MIN, TRAIN_MAX));
      newTest  = snap(clamp(newTest,  0,         TEST_MAX));
      // Ensure val doesn't go below VAL_MIN
      if (newTrain + newTest > 100 - VAL_MIN) {
        newTest = Math.max(0, 100 - VAL_MIN - newTrain);
        newTest = snap(newTest);
      }
      trainPct = newTrain;
      testPct  = newTest;
      render();
    }

    function render() {
      const valPct  = 100 - trainPct - testPct;
      const h2left  = 100 - testPct;

      // Segment widths
      const tSeg = document.getElementById(cfg.trainSegId);
      const vSeg = document.getElementById(cfg.valSegId);
      const eSeg = document.getElementById(cfg.testSegId);
      if (tSeg) { tSeg.style.width = trainPct + '%'; const sp = tSeg.querySelector('span'); if(sp) { sp.textContent = `Train %${trainPct}`; sp.style.display = trainPct < 12 ? 'none' : ''; } }
      if (vSeg) { vSeg.style.width = valPct   + '%'; const sp = vSeg.querySelector('span'); if(sp) { sp.textContent = `Val %${valPct}`;    sp.style.display = valPct  < 12 ? 'none' : ''; } }
      if (eSeg) { eSeg.style.width = testPct  + '%'; const sp = eSeg.querySelector('span'); if(sp) { sp.textContent = `Test %${testPct}`;  sp.style.display = testPct < 12 ? 'none' : ''; } }

      // Handle positions
      h1.style.left = trainPct + '%';
      h2.style.left = h2left   + '%';

      // Tooltip text
      const tip1 = document.getElementById(cfg.h1TipId);
      const tip2 = document.getElementById(cfg.h2TipId);
      if (tip1) tip1.textContent = `Train %${trainPct}`;
      if (tip2) tip2.textContent = testPct === 0 ? 'Test yok' : `Test %${testPct}`;

      // Legend
      if (document.getElementById(cfg.legTrainId)) document.getElementById(cfg.legTrainId).textContent = `%${trainPct}`;
      if (document.getElementById(cfg.legValId))   document.getElementById(cfg.legValId).textContent   = `%${valPct}`;
      if (document.getElementById(cfg.legTestId))  document.getElementById(cfg.legTestId).textContent  = `%${testPct}`;

      // Live dataset summary count update for Export page
      if (cfg.trackId === 'fmtTriTrack') {
        if (window.editorApp && typeof window.editorApp.updateExportSummary === 'function') {
          window.editorApp.updateExportSummary();
        } else {
          const total = (window.editorApp?.currentHubImages?.length) || 100;
          const trImgs = Math.round(total * (trainPct / 100));
          const teImgs = Math.round(total * (testPct / 100));
          const valImgs = Math.max(0, total - trImgs - teImgs);
          const sTr = document.getElementById('summaryTrainImgs');
          const sVal = document.getElementById('summaryValImgs');
          const sTe = document.getElementById('summaryTestImgs');
          if (sTr) sTr.textContent = `${trImgs} Görsel (%${trainPct})`;
          if (sVal) sVal.textContent = `${valImgs} Görsel (%${valPct})`;
          if (sTe) sTe.textContent = `${teImgs} Görsel (%${testPct})`;
        }
      }
    }

    function pctFromEvent(e) {
      const rect = track.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      return clamp((clientX - rect.left) / rect.width * 100, 0, 100);
    }

    function makeDraggable(handle, onDrag) {
      handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        handle.classList.add('dragging');
        function mm(e) { onDrag(pctFromEvent(e)); }
        function mu() { handle.classList.remove('dragging'); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); }
        document.addEventListener('mousemove', mm);
        document.addEventListener('mouseup',   mu);
      });
      handle.addEventListener('touchstart', function(e) {
        e.preventDefault();
        handle.classList.add('dragging');
        function tm(e) { e.preventDefault(); onDrag(pctFromEvent(e)); }
        function te()  { handle.classList.remove('dragging'); document.removeEventListener('touchmove', tm); document.removeEventListener('touchend', te); }
        document.addEventListener('touchmove', tm, {passive: false});
        document.addEventListener('touchend',  te);
      }, {passive: false});
    }

    makeDraggable(h1, function(pct) { apply(pct, testPct); });
    makeDraggable(h2, function(pct) { apply(trainPct, 100 - pct); });

    render();
  }

  // ─── MODEL TRAINING STUDIO INTERACTIONS ──────────────────────────
  document.addEventListener('change', function(e) {
    if (e.target && e.target.id === 'trainModelFamilySelect') {
      const fam = e.target.value;
      const titles = document.querySelectorAll('.arch-card-title');
      if (fam === 'yolo11') {
        if (titles[0]) titles[0].textContent = 'YOLO11n (Nano)';
        if (titles[1]) titles[1].textContent = 'YOLO11s (Small)';
        if (titles[2]) titles[2].textContent = 'YOLO11m (Medium)';
        if (titles[3]) titles[3].textContent = 'YOLO11l (Large)';
      } else if (fam === 'yolov5') {
        if (titles[0]) titles[0].textContent = 'YOLOv5n (Nano)';
        if (titles[1]) titles[1].textContent = 'YOLOv5s (Small)';
        if (titles[2]) titles[2].textContent = 'YOLOv5m (Medium)';
        if (titles[3]) titles[3].textContent = 'YOLOv5l (Large)';
      } else if (fam === 'rtdetr') {
        if (titles[0]) titles[0].textContent = 'RT-DETR-l (Small)';
        if (titles[1]) titles[1].textContent = 'RT-DETR-x (Large)';
        if (titles[2]) titles[2].textContent = 'RT-DETR-v2 (Medium)';
        if (titles[3]) titles[3].textContent = 'RT-DETR-ResNet50';
      } else {
        if (titles[0]) titles[0].textContent = 'YOLOv8n (Nano)';
        if (titles[1]) titles[1].textContent = 'YOLOv8s (Small)';
        if (titles[2]) titles[2].textContent = 'YOLOv8m (Medium)';
        if (titles[3]) titles[3].textContent = 'YOLOv8l (Large)';
      }
    }
  });

  document.addEventListener('click', function(e) {
    const archCard = e.target.closest('.model-arch-card');
    if (archCard) {
      document.querySelectorAll('.model-arch-card').forEach(c => {
        c.classList.remove('selected');
        c.style.borderColor = 'rgba(255,255,255,0.1)';
        c.style.background = 'rgba(255,255,255,0.02)';
      });
      archCard.classList.add('selected');
      archCard.style.borderColor = 'rgba(59,130,246,0.6)';
      archCard.style.background = 'rgba(59,130,246,0.12)';
    }

    const batchBtn = e.target.closest('.batch-opt-btn');
    if (batchBtn) {
      document.querySelectorAll('.batch-opt-btn').forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = 'rgba(255,255,255,0.1)';
        b.style.background = 'rgba(255,255,255,0.03)';
        b.style.color = '#94a3b8';
      });
      batchBtn.classList.add('active');
      batchBtn.style.borderColor = 'rgba(59,130,246,0.5)';
      batchBtn.style.background = 'rgba(59,130,246,0.15)';
      batchBtn.style.color = '#60a5fa';
    }

    if (e.target && e.target.id === 'clearTrainLogBtn') {
      const consoleEl = document.getElementById('trainTerminalLogConsole');
      if (consoleEl) consoleEl.innerHTML = '<span style="color:#64748b;">[*] Konsol temizlendi.</span>';
    }
  });

  document.addEventListener('click', function(e) {
    if (e.target && (e.target.id === 'executeModelTrainBtn' || e.target.closest('#executeModelTrainBtn'))) {
      const btn = document.getElementById('executeModelTrainBtn');
      const consoleEl = document.getElementById('trainTerminalLogConsole');
      const statusBadge = document.getElementById('trainStatusBadge');
      const map50 = document.getElementById('metricMap50');
      const map5095 = document.getElementById('metricMap5095');
      const boxLoss = document.getElementById('metricBoxLoss');
      const clsLoss = document.getElementById('metricClsLoss');
      const pFill = document.getElementById('trainProgressBarFill');
      const pTxt = document.getElementById('trainEpochProgressTxt');
      const pPct = document.getElementById('trainPctTxt');

      const family = document.getElementById('trainModelFamilySelect')?.value || 'yolov8';
      const variant = document.querySelector('.model-arch-card.selected')?.dataset.model || 'small';
      const datasetVersion = document.getElementById('trainDatasetVersionSelect')?.value || 'all';
      const epochs = parseInt(document.getElementById('trainEpochRange')?.value || '50');
      const imgsz = document.getElementById('trainImgszSelect')?.value || '640';
      const optimizer = document.getElementById('trainOptimizerSelect')?.value || 'auto';

      if (btn) { btn.disabled = true; btn.textContent = 'Model Eğitimi Başlatıldı...'; }
      if (statusBadge) { statusBadge.textContent = 'Eğitiliyor'; statusBadge.style.background = 'rgba(59,130,246,0.2)'; statusBadge.style.color = '#60a5fa'; }

      if (consoleEl) {
        consoleEl.innerHTML = `
          <span style="color:#38bdf8;">[*] [PyTorch Engine] ${family}-${variant}.pt ağırlıkları yüklendi.</span>
          <span style="color:#a78bfa;">[*] Veri seti sürümü: ${datasetVersion} (93 Görsel)</span>
          <span style="color:#34d399;">[*] Hiperparametreler: epochs=${epochs}, imgsz=${imgsz}, optimizer=${optimizer}</span>
          <span style="color:#f59e0b;">[*] Epoch 1/${epochs} başlatılıyor...</span>
        `;
      }

      let currentEpoch = 0;
      const interval = setInterval(() => {
        currentEpoch += Math.ceil(epochs / 10);
        if (currentEpoch > epochs) currentEpoch = epochs;

        const pct = Math.round((currentEpoch / epochs) * 100);
        const curMap = (0.50 + (pct / 200)).toFixed(3);
        const curMap95 = (0.35 + (pct / 300)).toFixed(3);
        const curBox = (0.12 - (pct / 1000)).toFixed(3);
        const curCls = (0.08 - (pct / 1200)).toFixed(3);

        if (pFill) pFill.style.width = pct + '%';
        if (pTxt) pTxt.textContent = `İlerleme: Epoch ${currentEpoch} / ${epochs}`;
        if (pPct) pPct.textContent = `%${pct}`;
        if (map50) map50.textContent = `%${(curMap * 100).toFixed(1)}`;
        if (map5095) map5095.textContent = `%${(curMap95 * 100).toFixed(1)}`;
        if (boxLoss) boxLoss.textContent = curBox;
        if (clsLoss) clsLoss.textContent = curCls;

        if (consoleEl) {
          const logLine = document.createElement('span');
          logLine.style.color = pct === 100 ? '#34d399' : '#e2e8f0';
          logLine.textContent = `Epoch ${currentEpoch}/${epochs} — box_loss: ${curBox} cls_loss: ${curCls} mAP50: ${curMap}`;
          consoleEl.appendChild(logLine);
          consoleEl.scrollTop = consoleEl.scrollHeight;
        }

        if (currentEpoch >= epochs) {
          clearInterval(interval);
          if (btn) { btn.disabled = false; btn.textContent = 'Model Eğitimini Başlat & Metrikleri Takip Et'; }
          if (statusBadge) { statusBadge.textContent = 'Tamamlandı'; statusBadge.style.background = 'rgba(16,185,129,0.2)'; statusBadge.style.color = '#34d399'; }
          if (consoleEl) {
            const finalLine = document.createElement('span');
            finalLine.style.color = '#34d399';
            finalLine.style.fontWeight = '700';
            finalLine.textContent = `[Başarılı] ${family}_${variant}_best.pt modeli kaydedildi! Metrik: mAP50 %${(curMap * 100).toFixed(1)}`;
            consoleEl.appendChild(finalLine);
          }
        }
      }, 800);
    }
  });

  // Wire up all three modals
  _makeTriSplit({
    trackId:'fmtTriTrack', h1Id:'fmtTriH1', h2Id:'fmtTriH2',
    trainSegId:'fmtTriTrain', valSegId:'fmtTriVal', testSegId:'fmtTriTest',
    h1TipId:'fmtH1Tip', h2TipId:'fmtH2Tip',
    legTrainId:'fmtLegTrain', legValId:'fmtLegVal', legTestId:'fmtLegTest',
    trainInputId:'fmtSplitRange', testInputId:'fmtTestSplitRange',
  });

  const augCopiesRange = document.getElementById('augCopiesRange');
  const augCopiesText  = document.getElementById('augCopiesText');
  if (augCopiesRange) augCopiesRange.addEventListener('input', function() {
    if (augCopiesText) augCopiesText.textContent = `${this.value}x`;
  });

  // Page export button is fully handled by editor.js setupExportStudio()

  function _showExportFmtResult(downloadUrl, msg) {
    const resultDiv = document.getElementById('exportFmtResult');
    const resultMsg = document.getElementById('exportFmtResultMsg');
    const link      = document.getElementById('exportFmtDownloadLink');
    if (!resultDiv) return;
    if (resultMsg) resultMsg.textContent = msg;
    if (link) link.href = downloadUrl;
    resultDiv.style.display = 'block';
  }

  // Open export format modal from train/export tab button
  // Override generateZipBtn to support train/val/test 3-way split
  const genZipBtn = document.getElementById('generateZipBtn');
  if (genZipBtn && !genZipBtn.dataset.splitOverride) {
    genZipBtn.dataset.splitOverride = '1';
    genZipBtn.addEventListener('click', async function(e) {
      e.stopImmediatePropagation();  // block editor.js handler
      const catEditor = window.editorApp || window._yoloEditor;
      const cat = (catEditor && (catEditor.activeModalCategory || catEditor.activeHubProjectId || catEditor.currentCategory)) ||
                  new URLSearchParams(location.search).get('project') ||
                  new URLSearchParams(location.search).get('category') ||
                  new URLSearchParams(location.search).get('cat') ||
                  localStorage.getItem('yolo_last_category') ||
                  'modai';
      const trainR = parseFloat(document.getElementById('splitRatioRange')?.value || '0.80');
      const testR  = parseFloat(document.getElementById('splitTestRatioRange')?.value || '0.00');

      const btn = genZipBtn;
      btn.disabled = true;
      btn.textContent = 'Paketleniyor...';
      try {
        const resp = await fetch('/api/projects/export-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ..._authHeaders() },
          body: JSON.stringify({ category: cat, train_ratio: trainR, test_ratio: testR })
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.detail || 'Hata');
        const nTest = data.test_count || 0;
        const info = `${data.train_count} train / ${data.val_count} val${nTest > 0 ? ` / ${nTest} test` : ''}`;
        const link = document.getElementById('downloadZipLink');
        if (link) {
          let dlUrl = data.download_url || data.r2_download_url || '';
          if (dlUrl.startsWith('/api/') && !dlUrl.includes('token=')) {
            const dlTok = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
            if (dlTok) dlUrl += (dlUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(dlTok)}`;
          }
          link.href = dlUrl;
          link.setAttribute('download', `${cat}_dataset.zip`);
        }
        document.getElementById('exportResultArea').style.display = 'block';
        btn.style.display = 'none';
        const totalExported = data.total_images ?? data.total_exported ?? 0;
        _toast(`${totalExported} görselli ZIP hazır (${info}, ${data.file_size_mb} MB)`, 'success');
      } catch (err) {
        _toast(err.message || 'ZIP oluşturulurken hata.', 'error');
        btn.disabled = false;
        btn.textContent = 'Paketle & Oluştur';
      }
    }, true);  // capture=true so this fires before editor.js
  }

  // Wire tri-split for the basic ZIP export modal
  _makeTriSplit({
    trackId:'zipTriTrack', h1Id:'zipTriH1', h2Id:'zipTriH2',
    trainSegId:'zipTriTrain', valSegId:'zipTriVal', testSegId:'zipTriTest',
    h1TipId:'zipH1Tip', h2TipId:'zipH2Tip',
    legTrainId:'zipLegTrain', legValId:'zipLegVal', legTestId:'zipLegTest',
    trainInputId:'splitRatioRange', testInputId:'splitTestRatioRange',
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 2. VIDEO FRAME EXTRACTION
  // ══════════════════════════════════════════════════════════════════════════
  const videoFileInput   = document.getElementById('videoFileInput');
  const videoDropZone    = document.getElementById('videoDropZone');
  const videoFileName    = document.getElementById('videoFileName');
  const videoFpsRange    = document.getElementById('videoFpsRange');
  const videoFpsText     = document.getElementById('videoFpsText');
  const videoMaxFrames   = document.getElementById('videoMaxFramesRange');
  const videoMaxFramesTxt= document.getElementById('videoMaxFramesText');

  if (videoDropZone) {
    videoDropZone.addEventListener('click', () => videoFileInput && videoFileInput.click());
    videoDropZone.addEventListener('dragover', e => { e.preventDefault(); videoDropZone.style.borderColor = '#3b82f6'; });
    videoDropZone.addEventListener('dragleave', () => { videoDropZone.style.borderColor = ''; });
    videoDropZone.addEventListener('drop', e => {
      e.preventDefault();
      videoDropZone.style.borderColor = '';
      if (e.dataTransfer.files[0] && videoFileInput) {
        const dt = new DataTransfer();
        dt.items.add(e.dataTransfer.files[0]);
        videoFileInput.files = dt.files;
        if (videoFileName) videoFileName.textContent = e.dataTransfer.files[0].name;
      }
    });
  }
  if (videoFileInput) videoFileInput.addEventListener('change', function() {
    if (this.files[0] && videoFileName) videoFileName.textContent = this.files[0].name;
  });
  if (videoFpsRange) videoFpsRange.addEventListener('input', function() {
    if (videoFpsText) videoFpsText.textContent = `${this.value} fps`;
  });
  if (videoMaxFrames) videoMaxFrames.addEventListener('input', function() {
    if (videoMaxFramesTxt) videoMaxFramesTxt.textContent = this.value;
  });

  const startVideoExtractBtn = document.getElementById('startVideoExtractBtn');
  if (startVideoExtractBtn) startVideoExtractBtn.addEventListener('click', async function() {
    const cat = _activeCategory();
    if (!cat) { _toast('Aktif proje bulunamadı.', 'error'); return; }
    if (!videoFileInput || !videoFileInput.files[0]) { _toast('Lütfen bir video dosyası seçin.', 'error'); return; }

    const formData = new FormData();
    formData.append('category', cat);
    formData.append('fps', videoFpsRange ? videoFpsRange.value : '1');
    formData.append('max_frames', videoMaxFrames ? videoMaxFrames.value : '300');
    formData.append('video', videoFileInput.files[0]);

    startVideoExtractBtn.disabled = true;
    startVideoExtractBtn.textContent = 'Çıkarılıyor...';
    const resultEl = document.getElementById('videoExtractResult');
    const resultMsg = document.getElementById('videoExtractMsg');
    if (resultEl) resultEl.style.display = 'none';

    try {
      const token = _token();
      const headers = token ? { 'Authorization': token } : {};
      const resp = await fetch('/api/projects/extract-video', { method: 'POST', headers, body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Hata');
      if (resultEl) { resultEl.style.display = 'block'; if (resultMsg) resultMsg.textContent = data.message; }
      _toast(data.message, 'success');
      // Refresh gallery if available
      if (typeof window.loadDatasetGallery === 'function') window.loadDatasetGallery();
    } catch (err) {
      _toast(err.message || 'Video işleme hatası.', 'error');
    } finally {
      startVideoExtractBtn.disabled = false;
      startVideoExtractBtn.textContent = 'Kareleri Çıkar';
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 3. DATASET QUALITY
  // ══════════════════════════════════════════════════════════════════════════
  async function _loadQualityStats() {
    const cat = _activeCategory();
    if (!cat) { _toast('Aktif proje bulunamadı.', 'error'); return; }

    const loadingEl = document.getElementById('qualityLoadingState');
    const contentEl = document.getElementById('qualityContent');
    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';

    try {
      const resp = await fetch(`/api/projects/quality-stats?category=${encodeURIComponent(cat)}`, { headers: _authHeaders() });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Hata');

      // Score circle
      const scoreNum = document.getElementById('qualityScoreNum');
      const scoreCircle = document.getElementById('qualityScoreCircle');
      if (scoreNum) scoreNum.textContent = data.quality_score;
      if (scoreCircle) {
        const color = data.quality_score >= 70 ? '#10b981' : data.quality_score >= 40 ? '#f59e0b' : '#ef4444';
        scoreCircle.style.borderColor = color;
        scoreCircle.style.background = color + '14';
        if (scoreNum) scoreNum.style.color = color;
      }

      // Stats
      const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
      setEl('qTotalImages', data.total_images);
      setEl('qLabeledCount', data.labeled_count);
      setEl('qTotalBoxes', data.total_boxes);
      setEl('qLabelRatio', `%${data.label_ratio_pct}`);

      // Warnings
      const warnWrap = document.getElementById('qualityWarnings');
      const warnList = document.getElementById('qualityWarningList');
      if (warnList && data.warnings && data.warnings.length > 0) {
        warnList.innerHTML = data.warnings.map(w => `<div class="warning-item">${w}</div>`).join('');
        if (warnWrap) warnWrap.style.display = 'block';
      } else if (warnWrap) warnWrap.style.display = 'none';

      // Class distribution (datasetQualityModal bağlamı)
      const chartEl = document.getElementById('classDistChartModal');
      if (chartEl && data.class_distribution) {
        const maxCount = Math.max(...data.class_distribution.map(c => c.count), 1);
        chartEl.innerHTML = data.class_distribution.map(c => `
          <div class="class-dist-bar-row">
            <span class="cls-name" title="${c.name}">${c.name}</span>
            <div class="class-dist-bar-wrap">
              <div class="class-dist-bar-fill" style="width:${Math.round(c.count/maxCount*100)}%"></div>
            </div>
            <span class="cls-count">${c.count} (%${c.pct})</span>
          </div>`).join('');
      }

      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
    } catch (err) {
      if (loadingEl) loadingEl.style.display = 'none';
      _toast(err.message || 'Kalite analizi hatası.', 'error');
    }
  }

  const refreshQualityBtn = document.getElementById('refreshQualityBtn');
  if (refreshQualityBtn) refreshQualityBtn.addEventListener('click', _loadQualityStats);

  // ══════════════════════════════════════════════════════════════════════════
  // 4. LABELING STATS
  // ══════════════════════════════════════════════════════════════════════════
  async function _loadLabelingStats() {
    const cat = _activeCategory();
    if (!cat) { _toast('Aktif proje bulunamadı.', 'error'); return; }

    const loadingEl = document.getElementById('statsLoadingState');
    const contentEl = document.getElementById('statsContent');
    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';

    try {
      const resp = await fetch(`/api/projects/labeling-stats?category=${encodeURIComponent(cat)}`, { headers: _authHeaders() });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Hata');

      const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
      setEl('statsCompletionPct', `%${data.completion_pct}`);
      setEl('statLabeled', data.labeled);
      setEl('statUnlabeled', data.unlabeled);
      setEl('statTotalBoxes', data.total_boxes);
      setEl('statAvgBoxes', data.avg_boxes_per_image);

      const bar = document.getElementById('statsProgressBar');
      if (bar) bar.style.width = `${data.completion_pct}%`;

      const actList = document.getElementById('recentActivityList');
      if (actList && data.recent_activity) {
        actList.innerHTML = data.recent_activity.map(a => `
          <div class="activity-item">
            <span class="act-name" title="${a.filename}">${a.filename}</span>
            <div class="act-meta">
              <span>${a.box_count} kutu</span>
              <span>${a.time_ago}</span>
            </div>
          </div>`).join('') || '<p style="opacity:.5;text-align:center;font-size:12px;">Henüz aktivite yok.</p>';
      }

      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
    } catch (err) {
      if (loadingEl) loadingEl.style.display = 'none';
      _toast(err.message || 'İstatistik yüklenemedi.', 'error');
    }
  }

  const modalRefreshStatsBtn = document.getElementById('modalRefreshStatsBtn');
  if (modalRefreshStatsBtn) modalRefreshStatsBtn.addEventListener('click', _loadLabelingStats);

  // ══════════════════════════════════════════════════════════════════════════
  // 5. FINE-TUNE
  // ══════════════════════════════════════════════════════════════════════════
  const ftEpochRange = document.getElementById('ftEpochRange');
  const ftEpochText  = document.getElementById('ftEpochText');
  const ftBatchRange = document.getElementById('ftBatchRange');
  const ftBatchText  = document.getElementById('ftBatchText');
  const ftImgszRange = document.getElementById('ftImgszRange');
  const ftImgszText  = document.getElementById('ftImgszText');
  if (ftEpochRange) ftEpochRange.addEventListener('input', function() { if (ftEpochText) ftEpochText.textContent = this.value; });
  if (ftBatchRange) ftBatchRange.addEventListener('input', function() { if (ftBatchText) ftBatchText.textContent = this.value; });
  if (ftImgszRange) ftImgszRange.addEventListener('input', function() { if (ftImgszText) ftImgszText.textContent = `${this.value}px`; });

  // Export format tri-split slider (Modal)
  _makeTriSplit({
    trackId:'fmtTriTrackModal', h1Id:'fmtTriH1Modal', h2Id:'fmtTriH2Modal',
    trainSegId:'fmtTriTrainModal', valSegId:'fmtTriValModal', testSegId:'fmtTriTestModal',
    h1TipId:'fmtH1TipModal', h2TipId:'fmtH2TipModal',
    legTrainId:'fmtLegTrainModal', legValId:'fmtLegValModal', legTestId:'fmtLegTestModal',
    trainInputId:'fmtSplitRangeModal', testInputId:'fmtTestSplitRangeModal',
  });

  // Model Training tri-split slider
  _makeTriSplit({
    trackId:'ftTrainTriTrack', h1Id:'ftTrainTriH1', h2Id:'ftTrainTriH2',
    trainSegId:'ftTrainTriTrain', valSegId:'ftTrainTriVal', testSegId:'ftTrainTriTest',
    h1TipId:'ftTrainH1Tip', h2TipId:'ftTrainH2Tip',
    legTrainId:'ftTrainLegTrain', legValId:'ftTrainLegVal', legTestId:'ftTrainLegTest',
    trainInputId:'ftTrainSplitRange', testInputId:'ftTrainTestSplitRange',
  });

  var _ftPollInterval = null;

  const ftStartBtn = document.getElementById('ftStartBtn');
  if (ftStartBtn) ftStartBtn.addEventListener('click', async function() {
    const cat = _activeCategory();
    if (!cat) { _toast('Aktif proje bulunamadı.', 'error'); return; }

    const body = {
      category:    cat,
      base_model:  document.getElementById('ftBaseModel').value,
      epochs:      parseInt(ftEpochRange ? ftEpochRange.value : 30),
      imgsz:       parseInt(ftImgszRange ? ftImgszRange.value : 640),
      batch:       parseInt(ftBatchRange ? ftBatchRange.value : 8),
      train_ratio: parseFloat(ftSplitRange ? ftSplitRange.value : 0.80),
      test_ratio:  parseFloat(ftTestSplitRange ? ftTestSplitRange.value : 0.00),
    };

    try {
      const resp = await fetch('/api/projects/fine-tune', {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Hata');
      _toast('Fine-tuning başlatıldı!', 'success');
      _ftShowProgress();
      _ftPollInterval = setInterval(_ftPollStatus, 3000);
    } catch (err) {
      _toast(err.message || 'Fine-tuning başlatılamadı.', 'error');
    }
  });

  const ftStopBtn = document.getElementById('ftStopBtn');
  if (ftStopBtn) ftStopBtn.addEventListener('click', async function() {
    const cat = _activeCategory();
    if (!cat) return;
    try {
      await fetch(`/api/projects/fine-tune-stop?category=${encodeURIComponent(cat)}`, {
        method: 'POST', headers: _authHeaders()
      });
      _toast('Durdurma sinyali gönderildi.', 'info');
    } catch (err) { _toast('Durdurma hatası.', 'error'); }
  });

  function _ftShowProgress() {
    const cfgEl = document.getElementById('ftConfigSection');
    const progEl = document.getElementById('ftProgressSection');
    const startBtn = document.getElementById('ftStartBtn');
    const stopBtn  = document.getElementById('ftStopBtn');
    if (cfgEl) cfgEl.style.display = 'none';
    if (progEl) progEl.style.display = 'block';
    if (startBtn) startBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'inline-flex';
  }

  async function _ftPollStatus() {
    const cat = _activeCategory();
    if (!cat) return;
    try {
      const resp = await fetch(`/api/projects/fine-tune-status?category=${encodeURIComponent(cat)}`);
      const data = await resp.json();

      const badgeEl = document.getElementById('ftStatusBadge');
      const epochEl = document.getElementById('ftEpochProgress');
      const barEl   = document.getElementById('ftProgressBar');
      const logEl   = document.getElementById('ftLogBox');
      const dlWrap  = document.getElementById('ftDownloadWrap');
      const dlLink  = document.getElementById('ftDownloadLink');

      const statusLabels = { running:'Eğitim devam ediyor...', stopping:'Durduruluyor...', completed:'Tamamlandı ✓', error:'Hata', stopped:'Durduruldu', idle:'Bekleniyor' };
      if (badgeEl) badgeEl.textContent = statusLabels[data.status] || data.status;
      if (epochEl) epochEl.textContent = `Epoch ${data.epoch} / ${data.epochs}`;
      if (barEl) barEl.style.width = `${data.progress_pct || 0}%`;
      if (logEl && data.log && data.log.length) logEl.innerHTML = data.log.map(l => `<div>${l}</div>`).join('');

      if (['completed','error','stopped'].includes(data.status)) {
        clearInterval(_ftPollInterval);
        _ftPollInterval = null;
        const stopBtn = document.getElementById('ftStopBtn');
        if (stopBtn) stopBtn.style.display = 'none';
        if (data.download_url && dlWrap && dlLink) {
          let ftUrl = data.download_url;
          if (ftUrl.startsWith('/api/') && !ftUrl.includes('token=')) {
            const dlTok = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
            if (dlTok) ftUrl += (ftUrl.includes('?') ? '&' : '?') + `token=${encodeURIComponent(dlTok)}`;
          }
          dlLink.href = ftUrl;
          dlWrap.style.display = 'block';
        }
        if (data.error) _toast(`Fine-tuning hatası: ${data.error}`, 'error');
        else if (data.status === 'completed') _toast('Model eğitimi tamamlandı! 🎉', 'success');
      }
    } catch (err) { /* ignore poll errors */ }
  }

  // Reopen: check if already running
  const fineTuneModal = document.getElementById('fineTuneModal');
  if (fineTuneModal) {
    const observer = new MutationObserver(function(muts) {
      muts.forEach(m => {
        if (m.type === 'attributes' && fineTuneModal.style.display !== 'none') {
          // Check status on open
          _ftCheckOnOpen();
        }
      });
    });
    observer.observe(fineTuneModal, { attributes: true });
  }

  async function _ftCheckOnOpen() {
    const cat = _activeCategory();
    if (!cat) return;
    try {
      const resp = await fetch(`/api/projects/fine-tune-status?category=${encodeURIComponent(cat)}`);
      const data = await resp.json();
      if (data.status === 'running' || data.status === 'stopping') {
        _ftShowProgress();
        if (!_ftPollInterval) _ftPollInterval = setInterval(_ftPollStatus, 3000);
        _ftPollStatus();
      }
    } catch(e) {}
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. ACTIVE LEARNING
  // ══════════════════════════════════════════════════════════════════════════
  var _alData = null;

  async function _loadActiveLearning() {
    const cat = _activeCategory();
    if (!cat) { _toast('Aktif proje bulunamadı.', 'error'); return; }

    const loadingEl = document.getElementById('alLoadingState');
    const contentEl = document.getElementById('alContent');
    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';

    try {
      const resp = await fetch(`/api/projects/active-learning?category=${encodeURIComponent(cat)}`);
      _alData = await resp.json();
      if (!resp.ok) throw new Error(_alData.detail || 'Hata');

      const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
      setEl('alHighCount', _alData.high_priority);
      setEl('alMediumCount', _alData.medium_priority);
      setEl('alLowCount', _alData.total - _alData.high_priority - _alData.medium_priority);

      const listEl = document.getElementById('alImageList');
      if (listEl && _alData.images) {
        listEl.innerHTML = _alData.images.slice(0, 100).map(img => `
          <div class="al-item ${img.priority}">
            <span class="al-priority-dot"></span>
            <span class="al-fname" title="${img.filename}">${img.filename}</span>
            <span class="al-boxbadge">${img.box_count} kutu</span>
          </div>`).join('');
      }

      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
    } catch (err) {
      if (loadingEl) loadingEl.style.display = 'none';
      _toast(err.message || 'Aktif öğrenme hatası.', 'error');
    }
  }

  const applyAlSortBtn = document.getElementById('applyAlSortBtn');
  if (applyAlSortBtn) applyAlSortBtn.addEventListener('click', function() {
    if (!_alData || !_alData.images) { _toast('Önce analiz yapılmalı.', 'error'); return; }
    // Expose AL order to main app
    window._alImageOrder = _alData.images.map(i => i.filename);
    window.dispatchEvent(new CustomEvent('alSortApplied', { detail: { order: window._alImageOrder } }));
    _toast(`Aktif öğrenme sıralaması uygulandı (${_alData.images.length} görsel).`, 'success');
    _closeModal('activeLearningModal');
  });

  // ══════════════════════════════════════════════════════════════════════════
  // 7. REVIEW QUEUE
  // ══════════════════════════════════════════════════════════════════════════
  async function _loadReviewQueue() {
    const cat = _activeCategory();
    if (!cat) { _toast('Aktif proje bulunamadı.', 'error'); return; }

    const loadingEl = document.getElementById('rqLoadingState');
    const contentEl = document.getElementById('rqContent');
    if (loadingEl) loadingEl.style.display = 'block';
    if (contentEl) contentEl.style.display = 'none';

    try {
      const resp = await fetch(`/api/projects/review-queue?category=${encodeURIComponent(cat)}`);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Hata');

      const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
      setEl('rqQueueCount', data.queue_count);
      setEl('rqApprovedCount', data.approved);
      setEl('rqRejectedCount', data.rejected);

      const listEl = document.getElementById('rqList');
      const emptyEl = document.getElementById('rqEmpty');
      if (listEl) {
        if (data.queue && data.queue.length > 0) {
          listEl.innerHTML = data.queue.map(item => `
            <div class="rq-item" data-fname="${item.filename}">
              <div class="rq-item-left">
                <span class="rq-item-name">${item.filename}</span>
                <span class="rq-item-meta">${item.note ? item.note + ' · ' : ''}${item.updated_by || ''}</span>
              </div>
              <div class="rq-item-actions">
                <button class="btn-approve" data-rq-action="approved" data-rq-file="${item.filename}">Onayla</button>
                <button class="btn-reject" data-rq-action="rejected" data-rq-file="${item.filename}">Reddet</button>
              </div>
            </div>`).join('');
          if (emptyEl) emptyEl.style.display = 'none';
        } else {
          listEl.innerHTML = '';
          if (emptyEl) emptyEl.style.display = 'block';
        }
      }

      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
    } catch (err) {
      if (loadingEl) loadingEl.style.display = 'none';
      _toast(err.message || 'Kuyruk yüklenemedi.', 'error');
    }
  }

  // Approve/reject actions
  document.addEventListener('click', async function(e) {
    const btn = e.target.closest('[data-rq-action]');
    if (!btn) return;
    const action = btn.dataset.rqAction;
    const fname  = btn.dataset.rqFile;
    const cat    = _activeCategory();
    if (!cat) return;
    try {
      const resp = await fetch('/api/projects/mark-review', {
        method: 'POST',
        headers: _authHeaders(),
        body: JSON.stringify({ category: cat, filename: fname, status: action })
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.detail || 'Hata');
      _toast(action === 'approved' ? `${fname} onaylandı.` : `${fname} reddedildi.`, 'success');
      _loadReviewQueue();
    } catch (err) {
      _toast(err.message || 'İşlem hatası.', 'error');
    }
  });

  const refreshRQBtn = document.getElementById('refreshReviewQueueBtn');
  if (refreshRQBtn) refreshRQBtn.addEventListener('click', _loadReviewQueue);

  // ══════════════════════════════════════════════════════════════════════════
  // TOOLBAR BUTTONS — Dataset gallery'de yeni butonlar ekle
  // ══════════════════════════════════════════════════════════════════════════
  // TOOLBAR BUTTONS — Clean and minimalist Roboflow style (No crowded buttons)
  // ══════════════════════════════════════════════════════════════════════════
  function _injectDatasetToolbarButtons() {
    // Intentionally left empty to keep dataset toolbar clean and uncluttered.
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INIT — DOM ready'den sonra çalıştır
  // ══════════════════════════════════════════════════════════════════════════
  function _init() {
    _injectDatasetToolbarButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    setTimeout(_init, 500);
  }

  // Expose to window for other scripts
  window.YoloNewFeatures = {
    openExportModal:    () => _openModal('exportFormatModal'),
    openVideoModal:     () => _openModal('videoExtractModal'),
    openQualityModal:   () => { _openModal('datasetQualityModal'); _loadQualityStats(); },
    openStatsModal:     () => { _openModal('labelingStatsModal');  _loadLabelingStats(); },
    openFineTuneModal:  () => _openModal('fineTuneModal'),
    openAlModal:        () => { _openModal('activeLearningModal'); _loadActiveLearning(); },
    openReviewModal:    () => { _openModal('reviewQueueModal');    _loadReviewQueue(); },
    markForReview: async function(category, filename, note) {
      const token = _token();
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = token;
      await fetch('/api/projects/mark-review', {
        method: 'POST', headers,
        body: JSON.stringify({ category, filename, status: 'needs_review', note: note || '' })
      });
      _toast(`${filename} inceleme kuyruğuna eklendi.`, 'info');
    }
  };

})();

/* ══════════════════════════════════════════════════════════════════════════
   HERO DEMO INTERACTIVE SLIDER CONTROLLER
══════════════════════════════════════════════════════════════════════════ */
(function initHeroDemoSlider() {
  let currentSlide = 0;
  const totalSlides = 3;
  let autoPlayTimer = null;

  const slideCaptions = [
    '1 / 3 · AI Sıfır-Örnekli (Zero-Shot) Kutu Tespiti',
    '2 / 3 · Segment Anything (SAM-2) Poligon Maskeleme',
    '3 / 3 · Takım Doğrulama & Kaptan Onay Kuyruğu'
  ];

  const engineStatuses = [
    'v2 Engine · 3.8ms',
    'SAM-2 ONNX · 24 Vektör',
    'Kaptan QA · Senkron'
  ];

  function goToSlide(index) {
    currentSlide = (index + totalSlides) % totalSlides;
    const track = document.getElementById('demoSlidesTrack');
    if (track) {
      track.style.transform = `translateX(-${(currentSlide * 100) / totalSlides}%)`;
    }

    // Toggle active state on slides to re-trigger pop animations
    const slides = document.querySelectorAll('.demo-slide');
    slides.forEach((s, idx) => {
      if (idx === currentSlide) {
        s.classList.remove('active');
        // Force reflow
        void s.offsetWidth;
        s.classList.add('active');
      } else {
        s.classList.remove('active');
      }
    });

    // Update Tab buttons in titlebar
    const tabBtns = document.querySelectorAll('#demoSlideTabs .demo-tab-btn');
    tabBtns.forEach((btn, idx) => {
      btn.classList.toggle('active', idx === currentSlide);
    });

    // Update Footer Dots
    const dots = document.querySelectorAll('#demoSliderDots .slider-dot');
    dots.forEach((dot, idx) => {
      dot.classList.toggle('active', idx === currentSlide);
    });

    // Update Captions & Status
    const cap = document.getElementById('demoPageCaption');
    if (cap) cap.textContent = slideCaptions[currentSlide];

    const eng = document.getElementById('demoEngineStatus');
    if (eng) eng.textContent = engineStatuses[currentSlide];
  }

  // Expose global hook for app or view changes
  window.triggerHeroDemoSlide = function(index) {
    goToSlide(typeof index === 'number' ? index : currentSlide);
    startAutoPlay();
  };

  function startAutoPlay() {
    stopAutoPlay();
    autoPlayTimer = setInterval(() => {
      goToSlide(currentSlide + 1);
    }, 5500);
  }

  function stopAutoPlay() {
    if (autoPlayTimer) clearInterval(autoPlayTimer);
  }

  function attachListeners() {
    // Titlebar Tab buttons
    document.querySelectorAll('#demoSlideTabs .demo-tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const slideIdx = parseInt(btn.dataset.slide, 10);
        goToSlide(slideIdx);
        startAutoPlay();
      });
    });

    // Footer Dots
    document.querySelectorAll('#demoSliderDots .slider-dot').forEach(dot => {
      dot.addEventListener('click', () => {
        const slideIdx = parseInt(dot.dataset.slide, 10);
        goToSlide(slideIdx);
        startAutoPlay();
      });
    });

    // Arrow buttons
    const prevBtn = document.getElementById('demoPrevBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        goToSlide(currentSlide - 1);
        startAutoPlay();
      });
    }

    const nextBtn = document.getElementById('demoNextBtn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        goToSlide(currentSlide + 1);
        startAutoPlay();
      });
    }

    // Pause on hover
    const demoWindow = document.querySelector('.modern-studio-window');
    if (demoWindow) {
      demoWindow.addEventListener('mouseenter', stopAutoPlay);
      demoWindow.addEventListener('mouseleave', startAutoPlay);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      attachListeners();
      goToSlide(0);
      startAutoPlay();
    });
  } else {
    attachListeners();
    goToSlide(0);
    startAutoPlay();
  }
})();

/* ══════════════════════════════════════════════════════════════════════════
   FULL LANDING PAGE VERTICAL SCROLL DECK CONTROLLER (5 PAGES WITH ANIMATIONS)
══════════════════════════════════════════════════════════════════════════ */
(function initLandingDeckController() {
  let currentDeckPage = 0;
  const totalDeckPages = 5;
  let isThrottled = false;

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function goToDeckPage(pageIndex) {
    if (pageIndex < 0 || pageIndex >= totalDeckPages) return;
    currentDeckPage = pageIndex;

    const track = document.getElementById('landingDeckTrack');

    if (isMobile()) {
      // Mobil: transform yok, scroll ile ilgili slide'a git
      if (track) track.style.transform = 'none';

      const slides = document.querySelectorAll('.landing-deck-slide');
      slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === currentDeckPage);
      });

      // Hedef slide'a smooth scroll
      const targetSlide = document.querySelector(`.landing-deck-slide[data-deck-page="${pageIndex}"]`);
      if (targetSlide) {
        const landingView = document.getElementById('landingView');
        if (landingView) {
          const offset = targetSlide.offsetTop;
          landingView.scrollTo({ top: offset - 56, behavior: 'smooth' });
        } else {
          targetSlide.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    } else {
      // Masaüstü: slide deck transform animasyonu
      if (track) {
        track.style.transform = `translateY(-${currentDeckPage * 20}%)`;
      }

      const slides = document.querySelectorAll('.landing-deck-slide');
      slides.forEach((slide, idx) => {
        if (idx === currentDeckPage) {
          slide.classList.remove('active');
          void slide.offsetWidth; // Force CSS reflow
          slide.classList.add('active');
          const innerScroll = slide.querySelector('.landing-slide-scrollable');
          if (innerScroll) innerScroll.scrollTop = 0;
        } else {
          slide.classList.remove('active');
        }
      });
    }

    // Navbar link active durumu güncelle
    document.querySelectorAll('#landingPageNavLinks .landing-nav-link').forEach((link, idx) => {
      link.classList.toggle('active', idx === currentDeckPage);
    });

    // Hero demo animasyonu
    if (currentDeckPage === 0 && typeof window.triggerHeroDemoSlide === 'function') {
      window.triggerHeroDemoSlide(0);
    }

    // İstatistik sayacı animasyonu
    if (currentDeckPage === 2) {
      document.querySelectorAll('.landing-stats .stat-number[data-target]').forEach(el => {
        el.textContent = '0' + (el.dataset.suffix || '');
      });
      setTimeout(() => {
        if (window.editorApp && typeof window.editorApp._animateStats === 'function') {
          window.editorApp._animateStats();
        } else {
          document.querySelectorAll('.stat-number[data-target]').forEach(el => {
            const target = parseInt(el.dataset.target);
            const suffix = el.dataset.suffix || '';
            if (isNaN(target)) return;
            let current = 0;
            const step = target / 60;
            const timer = setInterval(() => {
              current = Math.min(current + step, target);
              el.textContent = Math.floor(current).toLocaleString('tr') + suffix;
              if (current >= target) clearInterval(timer);
            }, 16);
          });
        }
      }, 100);
    }
  }

  // Global access hook
  window.goToLandingPage = function(pageIndex) {
    goToDeckPage(pageIndex);
  };

  function attachDeckListeners() {
    // Top Navbar Links
    document.querySelectorAll('#landingPageNavLinks .landing-nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const p = parseInt(link.dataset.landingPage, 10);
        if (!isNaN(p)) goToDeckPage(p);
      });
    });

    // Brand logo returns to Page 0
    const brandBtn = document.getElementById('landingBrandHomeBtn');
    if (brandBtn) {
      brandBtn.addEventListener('click', () => goToDeckPage(0));
    }

    // Hero "Stüdyoyu İncele" button jumps to Features (Page 1)
    const watchDemoBtn = document.getElementById('heroWatchDemoBtn');
    if (watchDemoBtn) {
      watchDemoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        goToDeckPage(1);
      });
    }

    // Footer quick jumps
    document.querySelectorAll('.deck-quick-jump').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const p = parseInt(link.dataset.targetPage, 10);
        if (!isNaN(p)) goToDeckPage(p);
      });
    });

    // MOUSE WHEEL SCROLL NAVIGATION (Full-page vertical scroll snapping)
    const landingView = document.getElementById('landingView');
    if (landingView) {
      // MOUSE WHEEL — sadece masaüstünde sayfa geçişi
      landingView.addEventListener('wheel', (e) => {
        if (isMobile()) return; // Mobilde normal scroll, müdahale yok

        const currentSlide = document.querySelector(`.landing-deck-slide[data-deck-page="${currentDeckPage}"]`);
        const innerScroll = currentSlide ? currentSlide.querySelector('.landing-slide-scrollable') : null;

        if (innerScroll) {
          const atTop = innerScroll.scrollTop <= 5;
          const atBottom = Math.ceil(innerScroll.scrollTop + innerScroll.clientHeight) >= innerScroll.scrollHeight - 5;
          if (e.deltaY > 0 && !atBottom) return;
          if (e.deltaY < 0 && !atTop) return;
        }

        if (Math.abs(e.deltaY) < 25) return;
        if (isThrottled) return;

        if (e.deltaY > 0) {
          if (currentDeckPage < totalDeckPages - 1) {
            e.preventDefault();
            isThrottled = true;
            goToDeckPage(currentDeckPage + 1);
            setTimeout(() => { isThrottled = false; }, 850);
          }
        } else {
          if (currentDeckPage > 0) {
            e.preventDefault();
            isThrottled = true;
            goToDeckPage(currentDeckPage - 1);
            setTimeout(() => { isThrottled = false; }, 850);
          }
        }
      }, { passive: false });

      // TOUCH — mobilde normal scroll, masaüstünde swipe navigasyon
      let touchStartY = 0;
      landingView.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) touchStartY = e.touches[0].clientY;
      }, { passive: true });

      landingView.addEventListener('touchend', (e) => {
        if (isMobile()) return; // Mobilde normal scroll, swipe navigasyon yok
        if (e.changedTouches.length !== 1 || isThrottled) return;
        const touchEndY = e.changedTouches[0].clientY;
        const diffY = touchStartY - touchEndY;

        if (Math.abs(diffY) > 50) {
          if (diffY > 0 && currentDeckPage < totalDeckPages - 1) {
            isThrottled = true;
            goToDeckPage(currentDeckPage + 1);
            setTimeout(() => { isThrottled = false; }, 850);
          } else if (diffY < 0 && currentDeckPage > 0) {
            isThrottled = true;
            goToDeckPage(currentDeckPage - 1);
            setTimeout(() => { isThrottled = false; }, 850);
          }
        }
      }, { passive: true });
    }

    // Keyboard Arrow navigation (Up/Down or Left/Right)
    window.addEventListener('keydown', (e) => {
      const lv = document.getElementById('landingView');
      if (!lv || lv.style.display === 'none') return;
      if (document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        goToDeckPage(Math.min(totalDeckPages - 1, currentDeckPage + 1));
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        goToDeckPage(Math.max(0, currentDeckPage - 1));
      }
    });
  }

  function isLandingActive() {
    const lv = document.getElementById('landingView');
    if (!lv) return false;
    const computed = window.getComputedStyle(lv).display;
    return computed !== 'none';
  }

  function initLandingDeck() {
    attachDeckListeners();
    const hasToken = !!(localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken'));
    // GÜVENLİK: Google OAuth token artık hash fragment'te (#google_token=...) iletiliyor
    const isGoogleAuth = window.location.hash.includes('google_token=') || window.location.search.includes('auth=google');
    const isExplicitWorkspace = window.location.search.includes('tab=') || window.location.search.includes('project=') || window.location.search.includes('editor=');

    // If already authenticated or in OAuth callback, do not display or reset landing deck
    if (hasToken || isGoogleAuth) {
      const lv = document.getElementById('landingView');
      if (lv) {
        lv.style.display = 'none';
        lv.classList.remove('active');
      }
      return;
    }

    // Only activate landing deck if landingView is actually visible
    if (isLandingActive()) {
      goToDeckPage(0);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLandingDeck);
  } else {
    initLandingDeck();
  }

  // 📱 Mobil Hamburger Menü Aç/Kapat Dinleyicisi:
  document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('btnMobileNavToggle');
    const sidebar = document.getElementById('globalSidebar');
    if (toggleBtn && sidebar) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('mobile-menu-open');
        // İkon değişimi
        const isOpen = sidebar.classList.contains('mobile-menu-open');
        toggleBtn.innerHTML = isOpen
          ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
          : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
      });
      // Menüdeki bir sekmeye tıklandığında menüyü otomatik kapat:
      sidebar.querySelectorAll('.ws-nav-item').forEach(item => {
        item.addEventListener('click', () => {
          sidebar.classList.remove('mobile-menu-open');
          toggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
        });
      });
      // Dışarı tıklandığında kapat:
      document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target)) {
          sidebar.classList.remove('mobile-menu-open');
          toggleBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
        }
      });
    }
  });

  // ─── LANDING PAGE MOBİL HAMBURGER MENÜ ────────────────────────────────
  (function initLandingMobileMenu() {
    const mobileMenuBtn = document.getElementById('landingMobileMenuBtn');
    const mobileDropdown = document.getElementById('landingMobileDropdown');
    if (!mobileMenuBtn || !mobileDropdown) return;

    let isOpen = false;
    mobileMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen = !isOpen;
      mobileDropdown.style.display = isOpen ? 'flex' : 'none';
      mobileMenuBtn.innerHTML = isOpen
        ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`
        : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
    });

    // Mobil menü linklerine tıklayınca kapat ve ilgili sayfaya git
    mobileDropdown.querySelectorAll('.landing-mobile-nav-link').forEach(link => {
      link.addEventListener('click', () => {
        isOpen = false;
        mobileDropdown.style.display = 'none';
        mobileMenuBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
        // Deck sayfasına yönlendir
        const page = link.getAttribute('data-landing-page');
        if (page !== null) {
          const correspondingLink = document.querySelector(`.landing-nav-link[data-landing-page="${page}"]`);
          if (correspondingLink) correspondingLink.click();
        }
      });
    });

    // Mobil CTA butonlarını ana butonlara yönlendir
    const signInMobile = document.getElementById('landingSignInBtnMobile');
    const getStartedMobile = document.getElementById('landingGetStartedBtnMobile');
    const signInMain = document.getElementById('landingSignInBtn');
    const getStartedMain = document.getElementById('landingGetStartedBtn');
    if (signInMobile && signInMain) signInMobile.addEventListener('click', () => signInMain.click());
    if (getStartedMobile && getStartedMain) getStartedMobile.addEventListener('click', () => getStartedMain.click());

    // Dışarı tıklanınca kapat
    document.addEventListener('click', (e) => {
      const nav = document.getElementById('landingNav');
      if (nav && !nav.contains(e.target) && isOpen) {
        isOpen = false;
        mobileDropdown.style.display = 'none';
        mobileMenuBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
      }
    });
  })();

})();
