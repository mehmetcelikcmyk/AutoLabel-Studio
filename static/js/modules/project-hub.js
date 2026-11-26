/**
 * AutoLabel Studio - ProjectHub Module
 * ================================
 * Proje hub: yukle, kanban, inceleme, egitim, kalite analizi, istatistikler, export studio.
 *
 * DatasetEditor.prototype uzerine guvenli ES6 sinif genisletme kalibiyla enjekte edilir.
 */

(function installProjectHub(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    console.error('[ProjectHub] DatasetEditor henuz yuklenmedi!');
    return;
  }

  class _ProjectHubExtension {
  async renderAnnotateKanban() {
  const cat = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || new URLSearchParams(location.search).get('category') || 'bag';
  this.activeHubProjectId = cat;
  if (!cat) return;
  const unassignedList = document.getElementById('kanbanUnassignedList');
  const annotatingList = document.getElementById('kanbanAnnotatingList');
  const completedList = document.getElementById('kanbanCompletedList');

  if (this.isLoadingHubData) {
    if (unassignedList) unassignedList.innerHTML = '<div style="text-align:center; padding:30px 10px; color:#94a3b8; font-size:0.85rem;"><div class="loading-spinner-ring" style="width:28px; height:28px; margin:0 auto 8px;"></div>Yükleniyor...</div>';
    if (annotatingList) annotatingList.innerHTML = '<div style="text-align:center; padding:30px 10px; color:#94a3b8; font-size:0.85rem;"><div class="loading-spinner-ring" style="width:28px; height:28px; margin:0 auto 8px;"></div>Yükleniyor...</div>';
    if (completedList) completedList.innerHTML = '<div style="text-align:center; padding:30px 10px; color:#94a3b8; font-size:0.85rem;"><div class="loading-spinner-ring" style="width:28px; height:28px; margin:0 auto 8px;"></div>Yükleniyor...</div>';
  }

  // Listener'lar — _wiredProject guard ile çoklu eklemeyi ve stale listener'ı önle
  const uploadMoreBtn = document.getElementById('roboflowUploadMoreBtn');
  if (uploadMoreBtn && uploadMoreBtn._wiredProject !== cat) {
    uploadMoreBtn._wiredProject = cat;
    uploadMoreBtn.onclick = () => this.switchProjectTab('upload');
  }
  const viewUnassignedBtn = document.getElementById('roboflowViewUnassignedBtn');
  if (viewUnassignedBtn && viewUnassignedBtn._wiredProject !== cat) {
    viewUnassignedBtn._wiredProject = cat;
    viewUnassignedBtn.onclick = () => {
      const sel = document.getElementById('datasetFilterStatus');
      const allImgs = this.currentHubImages || [];
      const hasUnlabeled = allImgs.some(i => !i.has_label_file || i.box_count === 0);
      if (sel) {
        if (hasUnlabeled) {
          sel.value = 'unlabeled';
        } else {
          sel.value = 'all';
          if (allImgs.length > 0) {
            this.showToast('Bu projedeki tüm görseller etiketli, tüm veri seti listeleniyor', 'info');
          }
        }
      }
      this.switchProjectTab('dataset');
    };
  }

  try {
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
    const headers = this.getAuthHeaders ? this.getAuthHeaders() : (token ? { 'Authorization': `Bearer ${token}` } : {});
    const res = await fetch(`/api/projects/batches?category=${encodeURIComponent(this.activeHubProjectId)}${tokenQuery}`, { headers });
    const data = await res.json();
    const batches = data.batches || [];

    // Kopya dosyaları kümesi (önbellekten)
    const dupData = (this.cachedDuplicateData && this.cachedDuplicateData[cat]) || null;
    const duplicateFilenames = new Set();
    if (dupData && dupData.duplicate_groups) {
      dupData.duplicate_groups.forEach(g => {
        (g.duplicates || []).forEach(d => duplicateFilenames.add(d));
      });
    }

    // Helper: Batch kart thumbnail strip (ilk N görseli önizle)
    const thumbStrip = (filenames, maxShow = 4) => {
      const items = (filenames || []).filter(Boolean).slice(0, maxShow);
      if (!items.length) return '';
      const extraCount = (filenames?.length || 0) - items.length;
      const extraEl = extraCount > 0
        ? `<div style="flex:1;min-width:0;background:rgba(15,23,42,0.85);display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700;color:#475569;border-radius:4px;">+${extraCount}</div>`
        : '';
      return `<div style="display:flex;gap:3px;margin-top:10px;border-radius:6px;overflow:hidden;height:52px;">
        ${items.map(fn => `<div style="flex:1;min-width:0;background:#040d1a;overflow:hidden;position:relative;border-radius:4px;"><div style="position:absolute;inset:0;background:#0d1b2e;"></div><img src="/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(fn)}${tokenQuery}" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity 0.25s ease;" onload="this.previousElementSibling.style.display='none';this.style.opacity='1';" onerror="this.style.display='none';"></div>`).join('')}
        ${extraEl}
      </div>`;
    };

    // Her batch'in ait olduğu gerçek sütunu belirle
    const getBatchColumn = (b) => {
      // Backend'in belirlediği kesin aşama (split-batch mimarisi) önceliklidir:
      if (b.status === 'completed') return 'completed';
      if (b.status === 'unassigned') return 'unassigned';
      if (b.status === 'annotating') return 'annotating';

      const total = b.total_count || b.images?.length || 0;
      const approved = b.approved_count || b.approved_filenames?.length || 0;
      const annotated = b.annotated_count || b.annotated_filenames?.length || 0;

      if (total > 0 && approved >= total) {
        return 'completed';
      }
      if (approved > 0 || annotated > 0) {
        return 'annotating';
      }
      return 'unassigned';
    };

    // Hızlı Filtre Tabları & Arama Dinleyicisi
    if (!this._hasBoundKanbanFilters) {
      this._hasBoundKanbanFilters = true;
      const kFilterBtns = document.querySelectorAll('#kanbanFilterTabs .kanban-filter-btn');
      kFilterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          kFilterBtns.forEach(b => {
            b.classList.remove('active');
            b.style.background = 'transparent';
            b.style.color = '#94a3b8';
            b.style.border = 'none';
          });
          btn.classList.add('active');
          btn.style.background = 'rgba(59,130,246,0.2)';
          btn.style.color = '#60a5fa';
          btn.style.border = '1px solid rgba(59,130,246,0.3)';
          this._currentKanbanFilter = btn.dataset.kfilter || 'all';
          this.renderAnnotateKanban();
        });
      });
      document.getElementById('kanbanBatchSearchInput')?.addEventListener('input', () => {
        this.renderAnnotateKanban();
      });
    }

    const kFilter = this._currentKanbanFilter || 'all';
    const kSearch = (document.getElementById('kanbanBatchSearchInput')?.value || '').trim().toLowerCase();
    const currentEmail = (this.currentUser?.email || '').toLowerCase();
    const userRole = (this.currentUser?.role || 'admin').toLowerCase();

    // Filtreleme ve arama fonksiyonu
    const passesFilter = (b) => {
      if (kSearch && !(b.name || '').toLowerCase().includes(kSearch) && !(b.tags || '').toLowerCase().includes(kSearch)) {
        return false;
      }
      if (kFilter === 'mine') {
        return b.is_mine || (b.assigned_to && b.assigned_to.toLowerCase() === currentEmail);
      }
      if (kFilter === 'dups') {
        const bFilenames = b.filenames || b.annotated_filenames || b.unassigned_filenames || b.images || [];
        return bFilenames.some(fn => duplicateFilenames.has(fn));
      }
      if (kFilter === 'progress') {
        const approved = b.approved_count || b.approved_filenames?.length || 0;
        const annotated = b.annotated_count || b.annotated_filenames?.length || 0;
        return (approved + annotated) > 0;
      }
      return true;
    };

    const filteredBatches = batches.filter(passesFilter);

    const unassignedBatches = filteredBatches.filter(b => getBatchColumn(b) === 'unassigned');
    const annotatingBatches = filteredBatches.filter(b => getBatchColumn(b) === 'annotating');
    const completedBatches = filteredBatches.filter(b => getBatchColumn(b) === 'completed');

    let totalUnassigned = 0;
    unassignedBatches.forEach(b => { totalUnassigned += (b.total_count || b.images?.length || 0); });

    let totalAnnotating = 0;
    annotatingBatches.forEach(b => { totalAnnotating += (b.total_count || b.images?.length || 0); });

    let totalCompleted = 0;
    completedBatches.forEach(b => { totalCompleted += (b.total_count || b.images?.length || 0); });

    // Update Column Badges
    const uBadge = document.getElementById('kanbanUnassignedBadge');
    if (uBadge) uBadge.textContent = `${unassignedBatches.length} Yığın (${totalUnassigned} Resim)`;

    const aBadge = document.getElementById('kanbanAnnotatingBadge');
    if (aBadge) aBadge.textContent = annotatingBatches.length > 0 ? `${annotatingBatches.length} Yığın (${totalAnnotating} Resim)` : `0 Yığın (0/0)`;

    const cBadge = document.getElementById('kanbanCompletedBadge');
    if (cBadge) cBadge.textContent = `${completedBatches.length} Yığın (${totalCompleted} Resim)`;

    // 1. Unassigned Batches
    if (unassignedList) {
      if (unassignedBatches.length === 0) {
        const hasImgs = (this.currentHubImages && this.currentHubImages.length > 0);
        unassignedList.innerHTML = `
            <div class="kanban-batch-card">
              <div class="k-card-title">Ana Ham Resim Havuzu</div>
              <div class="k-card-meta" style="color:var(--accent-success); font-weight:600;">${hasImgs ? 'Tüm ham resimler etiketlendi (' + this.currentHubImages.length + ' Görsel)' : 'Henüz atanmamış görsel yok'}</div>
              ${hasImgs ? `
              <button class="btn-primary btn-sm" id="kanbanOpenEditorDirectBtn" style="width:100%; margin-top:10px; justify-content:center; font-weight:700; padding:8px 12px; background:linear-gradient(135deg,#0284c7,#2563eb);">
                🖼️ Görselleri İncele &amp; Düzenle ➔
              </button>` : ''}
            </div>
          `;
        document.getElementById('kanbanOpenEditorDirectBtn')?.addEventListener('click', () => {
          this.showEditor(cat);
        });
      } else {
        unassignedList.innerHTML = unassignedBatches.map(b => {
          const isTeamTask = !!b.is_team_task;
          const total = b.total_count || b.images?.length || 0;
          const bFilenames = b.unassigned_filenames || b.filenames || b.unassigned_files || b.images || [];
          const bDups = bFilenames.filter(fn => duplicateFilenames.has(fn)).length;
          const taskBadge = isTeamTask
            ? `<div style="display:inline-flex;align-items:center;gap:5px;background:linear-gradient(135deg,rgba(14,165,233,0.18),rgba(99,102,241,0.22));border:1px solid rgba(56,189,248,0.35);color:#38bdf8;font-size:0.73rem;font-weight:700;padding:2px 8px;border-radius:6px;margin-bottom:6px;">
                <span>${b.is_mine ? '👤 Size Atanan Görev' : '👑 Takım Görevi'}</span>
                <span style="color:#94a3b8;font-weight:400;">(@${b.assigned_to})</span>
              </div>`
            : '';

          return `
            <div class="kanban-batch-card ${isTeamTask ? 'kanban-team-task-card' : ''}" data-batch-id="${b.id}" style="margin-bottom:12px;cursor:pointer;${isTeamTask ? 'border-color:rgba(56,189,248,0.3);background:rgba(15,23,42,0.65);' : ''}">
              ${taskBadge}
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="flex:1;min-width:0;padding-right:6px;">
                  <div class="k-card-title" style="${isTeamTask ? 'color:#f8fafc;font-weight:700;' : ''}overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.name}">${b.name}</div>
                  <span style="font-size:0.72rem;color:var(--text-dim);">${b.created_at || ''}</span>
                </div>
                ${!isTeamTask ? `<button class="btn-batch-dots" data-batch-id="${b.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:2px 6px;font-size:1.2rem;line-height:1;border-radius:4px;flex-shrink:0;" title="İşlemler">⋮</button>` : ''}
              </div>
              ${thumbStrip(bFilenames)}
              <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;gap:6px;flex-wrap:wrap;">
                <div class="k-card-meta">${total.toLocaleString()} ham görsel</div>
                <div style="display:flex;align-items:center;gap:4px;">
                  ${bDups > 0 ? `<span style="font-size:0.68rem;background:rgba(239,68,68,0.18);color:#f87171;padding:2px 6px;border-radius:4px;font-weight:700;border:1px solid rgba(239,68,68,0.3);" title="Bu yığında ${bDups} kopya görsel tespit edildi">⚠️ ${bDups} Kopya</span>` : ''}
                  ${b.tags ? `<span style="font-size:0.7rem;color:var(--accent-primary);flex-shrink:0;">🏷️ ${b.tags}</span>` : ''}
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
                <button class="btn-primary btn-sm btn-start-batch" data-batch-id="${b.id}" style="width:100%;justify-content:center;font-weight:700;padding:8px 12px;${isTeamTask || userRole === 'annotator' ? 'background:linear-gradient(135deg,#0284c7,#2563eb);border:none;box-shadow:0 2px 10px rgba(2,132,199,0.3);' : ''}">
                  ${isTeamTask || userRole === 'annotator' ? '🎯 Görevi Başlat &amp; Etiketle ➔' : 'Etiketlemeye Başla ➔'}
                </button>
                ${userRole === 'admin' ? `
                <button class="btn-secondary btn-sm btn-batch-ai" data-batch-id="${b.id}" style="width:100%;justify-content:center;background:linear-gradient(135deg,rgba(139,92,246,0.25),rgba(59,130,246,0.25));border:1px solid rgba(139,92,246,0.5);color:#c4b5fd;font-weight:700;padding:7px 12px;font-size:0.82rem;display:inline-flex;align-items:center;gap:6px;" title="Bu yığındaki resimleri AI ile otomatik etiketle">
                  ✨ Yapay Zeka ile Toplu Etiketle
                </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('');

        unassignedList.querySelectorAll('.kanban-batch-card').forEach(card => {
          const bId = card.dataset.batchId;
          const targetBatch = batches.find(b => b.id === bId);
          const currentProj = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'bag';
          card.querySelector('.btn-batch-dots')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (targetBatch) this.openBatchContextMenu(targetBatch, e);
          });
          card.querySelector('.btn-start-batch')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (targetBatch) {
              this.showLoading(true, 'Yığın ve Çalışma Alanı Hazırlanıyor...', 'Lütfen bekleyiniz...');
              // Yığını 'annotating' (Etiketleniyor) aşamasına taşı
              try {
                await fetch('/api/projects/move-batch-stage', {
                  method: 'POST',
                  headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
                  body: JSON.stringify({ category: currentProj, batch_id: targetBatch.id, target_stage: 'annotating' })
                });
                targetBatch.status = 'annotating';
              } catch (_) {}

              const batchFiles = (targetBatch.filenames && targetBatch.filenames.length > 0)
                ? targetBatch.filenames
                : (targetBatch.unassigned_filenames && targetBatch.unassigned_filenames.length > 0)
                  ? targetBatch.unassigned_filenames
                  : (targetBatch.images && targetBatch.images.length > 0)
                    ? targetBatch.images
                    : (targetBatch.unassigned_files || []);
              this.showEditor(currentProj, true, null, null, batchFiles, targetBatch.id, targetBatch.name);
            }
          });
          card.querySelector('.btn-batch-ai')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (targetBatch) {
              this.openBatchModal(currentProj, targetBatch.id, targetBatch.name, targetBatch.unassigned_files || targetBatch.images);
            }
          });
          card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            this.openBatchReview(bId, 'unannotated');
          });
        });
      }
    }

    // 2. Annotating Batches (Jobs in Progress)
    if (annotatingList) {
      if (annotatingBatches.length === 0) {
        annotatingList.innerHTML = `
            <div class="kanban-batch-card">
              <div class="k-card-title">Aktif Oturum &amp; İlerleme</div>
              <div class="k-card-meta">Henüz etiketleme aşamasında olan resim yok</div>
            </div>
          `;
      } else {
        annotatingList.innerHTML = annotatingBatches.map(b => {
          const total = b.total_count || b.images?.length || 0;
          const approved = b.approved_count || b.approved_filenames?.length || 0;
          const annotated = b.annotated_count || b.annotated_filenames?.length || 0;
          const labeled = approved + annotated;
          const pct = total > 0 ? Math.round((labeled / total) * 100) : 0;
          const isTeamTask = !!b.is_team_task;
          const bFilenames = b.filenames || b.annotated_filenames || b.unassigned_filenames || b.images || [];
          const bDups = bFilenames.filter(fn => duplicateFilenames.has(fn)).length;
          const taskBadge = isTeamTask
            ? `<div style="display:inline-flex;align-items:center;gap:5px;background:linear-gradient(135deg,rgba(14,165,233,0.18),rgba(99,102,241,0.22));border:1px solid rgba(56,189,248,0.35);color:#38bdf8;font-size:0.73rem;font-weight:700;padding:2px 8px;border-radius:6px;margin-bottom:6px;">
                <span>${b.is_mine ? '👤 Size Atanan Görev' : '👑 Takım Görevi'}</span>
                <span style="color:#94a3b8;font-weight:400;">(@${b.assigned_to})</span>
              </div>`
            : '';

          // Rol bazlı onay butonu: sadece admin ve reviewer onaylayabilir
          const canApprove = userRole === 'admin' || userRole === 'reviewer';

          return `
              <div class="kanban-batch-card ${isTeamTask ? 'kanban-team-task-card' : ''}" data-batch-id="${b.id}" style="margin-bottom:12px;cursor:pointer;${isTeamTask ? 'border-color:rgba(56,189,248,0.3);background:rgba(15,23,42,0.65);' : ''}">
                ${taskBadge}
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                  <div style="flex:1;min-width:0;padding-right:6px;">
                    <div class="k-card-title" style="${isTeamTask ? 'color:#f8fafc;font-weight:700;' : ''}overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.name}">${b.name}</div>
                    <span style="font-size:0.72rem;color:var(--text-dim);">${b.created_at || ''}</span>
                  </div>
                  ${!isTeamTask ? `<button class="btn-batch-dots" data-batch-id="${b.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:2px 6px;font-size:1.2rem;line-height:1;border-radius:4px;flex-shrink:0;" title="İşlemler">⋮</button>` : ''}
                </div>
                ${thumbStrip(bFilenames)}
                <div style="margin-top:8px;">
                  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                    <span class="k-card-meta">${labeled.toLocaleString()} / ${total.toLocaleString()} etiketlendi</span>
                    <div style="display:flex;align-items:center;gap:4px;">
                      ${bDups > 0 ? `<span style="font-size:0.68rem;background:rgba(239,68,68,0.18);color:#f87171;padding:2px 6px;border-radius:4px;font-weight:700;border:1px solid rgba(239,68,68,0.3);" title="Bu yığında ${bDups} kopya görsel tespit edildi">⚠️ ${bDups} Kopya</span>` : ''}
                      <span style="font-size:0.72rem;font-weight:700;color:${pct >= 100 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#94a3b8'};">%${pct}</span>
                    </div>
                  </div>
                  <div class="stat-progress-track">
                    <div class="stat-progress-fill" style="width:${pct}%;${isTeamTask ? 'background:linear-gradient(90deg,#38bdf8,#6366f1);' : ''}"></div>
                  </div>
                  ${approved > 0 ? `<div style="font-size:0.7rem;color:#10b981;margin-top:4px;font-weight:600;">✓ ${approved.toLocaleString()} onaylandı</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-top:10px;">
                  ${canApprove && !isTeamTask ? `
                  <button class="btn-primary btn-sm btn-approve-batch" data-batch-id="${b.id}" style="width:100%;justify-content:center;background:linear-gradient(135deg,#10b981,#059669);border:none;color:#fff;font-weight:700;padding:8px 12px;font-size:0.83rem;box-shadow:0 2px 10px rgba(16,185,129,0.3);display:inline-flex;align-items:center;gap:6px;" title="Tüm etiketleri onayla ve Veri Setine aktar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>Veri Setine Ekle (Onayla)</span>
                  </button>
                  ` : ''}
                  <button class="btn-secondary btn-sm btn-continue-batch" data-batch-id="${b.id}" style="width:100%;justify-content:center;font-weight:700;padding:8px 12px;${isTeamTask || userRole === 'annotator' ? 'background:linear-gradient(135deg,#0284c7,#2563eb);color:#fff;border:none;box-shadow:0 2px 10px rgba(2,132,199,0.3);' : ''}">
                    ${isTeamTask || userRole === 'annotator' ? '🎯 Göreve Devam Et &amp; Etiketle ➔' : 'Yığını İncele &amp; Etiketle ➔'}
                  </button>
                  ${userRole === 'admin' && b.unassigned_count > 0 ? `
                    <button class="btn-secondary btn-sm btn-batch-ai" data-batch-id="${b.id}" style="width:100%;justify-content:center;background:linear-gradient(135deg,rgba(139,92,246,0.25),rgba(59,130,246,0.25));border:1px solid rgba(139,92,246,0.5);color:#c4b5fd;font-weight:700;padding:7px 12px;font-size:0.82rem;display:inline-flex;align-items:center;gap:6px;" title="Kalan resimleri AI ile tamamla">
                      ✨ Kalanları AI ile Tamamla (${b.unassigned_count.toLocaleString()})
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
        }).join('');

        annotatingList.querySelectorAll('.kanban-batch-card').forEach(card => {
          const bId = card.dataset.batchId;
          const targetBatch = batches.find(b => b.id === bId);
          const currentProj = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'bag';
          card.querySelector('.btn-batch-dots')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (targetBatch) this.openBatchContextMenu(targetBatch, e);
          });
          card.querySelector('.btn-approve-batch')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (targetBatch) {
              const totalCount = targetBatch.total_count || targetBatch.images?.length || 0;
              const confirmed = await this.showConfirm({
                title: 'Veri Setine Aktar & Onayla',
                subtitle: 'Yığın Onayı',
                message: `"${targetBatch.name}" yığınındaki ${totalCount} görsel onaylanıp Dataset (Tamamlanan Veri Seti) sütununa eklensin mi?`,
                confirmText: 'Evet, Veri Setine Ekle',
                cancelText: 'Vazgeç',
                type: 'info'
              });
              if (!confirmed) return;

              this.showLoading(true, 'Veri Setine Aktarılıyor...', 'Etiketler onaylanıyor');
              try {
                const res = await fetch('/api/projects/approve-batch', {
                  method: 'POST',
                  headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
                  body: JSON.stringify({ category: currentProj, batch_id: targetBatch.id })
                });
                const resData = await res.json();
                if (res.ok) {
                  this.showToast(`"${targetBatch.name}" başarıyla Veri Setine aktarıldı!`, 'success');
                  await this.loadHubProjectData();
                } else {
                  throw new Error(resData.detail || 'Onaylama başarısız.');
                }
              } catch (err) {
                this.showToast(`Hata: ${err.message}`, 'error');
              } finally {
                this.showLoading(false);
              }
            }
          });
          card.querySelector('.btn-continue-batch')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (targetBatch) {
              const batchFiles = (targetBatch.filenames && targetBatch.filenames.length > 0)
                ? targetBatch.filenames
                : (targetBatch.images || []);
              this.showEditor(currentProj, true, null, null, batchFiles, targetBatch.id, targetBatch.name);
            }
          });
          card.querySelector('.btn-batch-ai')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (targetBatch) {
              this.openBatchModal(currentProj, targetBatch.id, targetBatch.name, targetBatch.unassigned_files || targetBatch.images);
            }
          });
          card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            this.openBatchReview(bId, 'annotated');
          });
        });
      }
    }

    // 3. Dataset Completed Batches (Approved / Verified)
    if (completedList) {
      if (completedBatches.length === 0) {
        completedList.innerHTML = '<div class="empty-state">Henüz onaylanan etiket yok.</div>';
      } else {
        completedList.innerHTML = completedBatches.map(b => {
          const approvedCnt = b.approved_count ?? (b.approved_filenames?.length ?? 0);
          const annotatedCnt = b.annotated_count ?? (b.annotated_filenames?.length ?? 0);
          const verifiedCount = approvedCnt || annotatedCnt;
          const total = b.total_count || b.images?.length || verifiedCount || 0;
          const bFilenames = b.approved_filenames || b.filenames || b.images || [];
          return `
            <div class="kanban-batch-card" data-batch-id="${b.id}" style="margin-bottom:12px;border-left:3px solid var(--accent-success);cursor:pointer;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="flex:1;min-width:0;padding-right:6px;">
                  <div class="k-card-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${b.name}">${b.name}</div>
                  <span style="font-size:0.72rem;color:var(--text-dim);">${b.created_at || ''}</span>
                </div>
                ${userRole === 'admin' ? `<button class="btn-batch-dots" data-batch-id="${b.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;padding:2px 6px;font-size:1.2rem;line-height:1;border-radius:4px;flex-shrink:0;" title="İşlemler">⋮</button>` : ''}
              </div>
              ${thumbStrip(bFilenames)}
              <div style="margin-top:8px;">
                <div class="k-card-meta" style="color:var(--accent-success);font-weight:600;">✓ ${verifiedCount.toLocaleString()} / ${total.toLocaleString()} Görsel Onaylandı</div>
                <div class="stat-progress-track" style="margin-top:5px;">
                  <div class="stat-progress-fill" style="width:100%;background:var(--accent-success);"></div>
                </div>
              </div>
              <div style="display:flex;gap:8px;margin-top:10px;">
                <button class="btn-secondary btn-sm btn-gallery-batch" data-batch-id="${b.id}" style="flex:1;justify-content:center;">Yığını İncele ➔</button>
                <button class="btn-primary btn-sm btn-export-batch" data-batch-id="${b.id}" style="flex:1;justify-content:center;">Dışa Aktar ➔</button>
              </div>
            </div>
          `;
        }).join('');

        completedList.querySelectorAll('.kanban-batch-card').forEach(card => {
          const bId = card.dataset.batchId;
          const targetBatch = batches.find(b => b.id === bId);
          card.querySelector('.btn-batch-dots')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (targetBatch) this.openBatchContextMenu(targetBatch, e);
          });
          card.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            this.openBatchReview(bId, 'approved');
          });
        });

        completedList.querySelectorAll('.btn-gallery-batch').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const bId = btn.dataset.batchId;
            this.openBatchReview(bId, 'approved');
          });
        });
        completedList.querySelectorAll('.btn-export-batch').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openExportModal(this.activeHubProjectId);
          });
        });
      }
    }

  } catch (err) {
    console.error('Error rendering Kanban batches:', err);
  }
}

  async openBatchContextMenu(batch, event) {
  event.stopPropagation();
  event.preventDefault();

  const currentProj = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'accessory_detection_project';

  const existing = document.getElementById('batchContextMenuPopup');
  if (existing) existing.remove();

  // Hangi sütunda olduğunu tespit et
  const currentStage = batch.status || (batch.approved_count > 0 ? 'completed' : 'unassigned');
  const isCompleted = currentStage === 'completed';
  const isAnnotating = currentStage === 'annotating';
  const isUnassigned = currentStage === 'unassigned';

  const menu = document.createElement('div');
  menu.id = 'batchContextMenuPopup';
  menu.style.cssText = `
      position: fixed;
      top: ${Math.min(event.clientY + 5, window.innerHeight - 340)}px;
      left: ${Math.min(event.clientX, window.innerWidth - 280)}px;
      background: #0f172a;
      border: 1px solid rgba(255,255,255,0.14);
      border-radius: 12px;
      box-shadow: 0 14px 35px rgba(0,0,0,0.6);
      padding: 8px;
      z-index: 9999;
      min-width: 260px;
      font-size: 0.85rem;
    `;

  let stageMoveButtons = '';

  if (isCompleted) {
    // 3. Sütunda (Dataset / Tamamlanan) -> 2'ye veya 1'e taşıyabilir
    stageMoveButtons = `
        <div style="padding:4px 8px; font-size:0.72rem; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.06); margin-bottom:4px;">
          Adım Değiştir (Şuraya Taşı)
        </div>
        <button class="menu-item" id="btnMoveAnnotating" style="width:100%; text-align:left; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.25); color:#fbbf24; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px; margin-bottom:4px; font-weight:600;">
          ⬅️ 2. Sütuna Taşı (Etiketleniyor)
        </button>
        <button class="menu-item" id="btnMoveUnassigned" style="width:100%; text-align:left; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:#cbd5e1; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px; margin-bottom:6px; font-weight:600;">
          ⏪ 1. Sütuna Taşı (Atanmamışlara Sıfırla)
        </button>
      `;
  } else if (isAnnotating) {
    // 2. Sütunda (Annotating / Etiketleniyor) -> 3'e veya 1'e taşıyabilir
    stageMoveButtons = `
        <div style="padding:4px 8px; font-size:0.72rem; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.06); margin-bottom:4px;">
          Adım Değiştir (Şuraya Taşı)
        </div>
        <button class="menu-item" id="btnMoveCompleted" style="width:100%; text-align:left; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); color:#34d399; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px; margin-bottom:4px; font-weight:600;">
          ➡️ 3. Sütuna Taşı (Veri Setine Onayla)
        </button>
        <button class="menu-item" id="btnMoveUnassigned" style="width:100%; text-align:left; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:#cbd5e1; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px; margin-bottom:6px; font-weight:600;">
          ⬅️ 1. Sütuna Taşı (Atanmamışlara Geri Al)
        </button>
      `;
  } else {
    // 1. Sütunda (Unassigned / Atanmamış) -> 2'ye veya doğrudan 3'e taşıyabilir
    stageMoveButtons = `
        <div style="padding:4px 8px; font-size:0.72rem; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.06); margin-bottom:4px;">
          Adım Değiştir (Şuraya Taşı)
        </div>
        <button class="menu-item" id="btnMoveAnnotating" style="width:100%; text-align:left; background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.25); color:#fbbf24; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px; margin-bottom:4px; font-weight:600;">
          ➡️ 2. Sütuna Taşı (Etiketleme Aşamasına Al)
        </button>
        <button class="menu-item" id="btnMoveCompleted" style="width:100%; text-align:left; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); color:#34d399; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px; margin-bottom:6px; font-weight:600;">
          ⏩ 3. Sütuna Taşı (Doğrudan Veri Setine Ekle)
        </button>
      `;
  }

  // Bağlam menüsüüni oluştur
  // Member için yönetim seçenekleri gizlenir
  const canManage = this.currentProjectCanManage === true;

  menu.innerHTML = `
      ${canManage ? stageMoveButtons : ''}
      ${canManage ? '<div style="height:1px; background:rgba(255,255,255,0.08); margin:4px 0;"></div>' : ''}
      ${canManage ? `<button class="menu-item" id="menuRename" style="width:100%; text-align:left; background:none; border:none; color:#e2e8f0; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;">
        ✏️ Yığını Yeniden Adlandır
      </button>` : ''}
      ${canManage ? `<button class="menu-item" id="menuTag" style="width:100%; text-align:left; background:none; border:none; color:#e2e8f0; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;">
        🏷️ Etiket / Not Ekle
      </button>` : ''}
      <button class="menu-item" id="menuDownload" style="width:100%; text-align:left; background:none; border:none; color:#e2e8f0; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;">
        📥 Yığını İndir (ZIP)
      </button>
      ${canManage ? '<div style="height:1px; background:rgba(255,255,255,0.08); margin:4px 0;"></div>' : ''}
      ${canManage ? `<button class="menu-item" id="menuDelete" style="width:100%; text-align:left; background:none; border:none; color:#ef4444; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;">
        🗑️ Yığını Sil
      </button>` : ''}
    `;

  document.body.appendChild(menu);

  const closeMenu = () => menu.remove();
  setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 10);

  const handleMove = async (targetStage, stageTitle) => {
    closeMenu();
    try {
      const res = await fetch('/api/projects/move-batch-stage', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ category: currentProj, batch_id: batch.id, target_stage: targetStage })
      });
      if (res.ok) {
        this.showToast(`Yığın başarıyla "${stageTitle}" sütununa taşındı.`, 'success');
        await this.loadHubProjectData();
        this.renderAnnotateKanban();
      } else {
        this.showToast('Taşıma işlemi başarısız oldu.', 'error');
      }
    } catch (e) {
      console.error(e);
      this.showToast('Taşıma sırasında hata oluştu.', 'error');
    }
  };

  // Dinamik Taşıma Dinleyicileri
  menu.querySelector('#btnMoveUnassigned')?.addEventListener('click', () => {
    handleMove('unassigned', 'Atanmamış');
  });

  menu.querySelector('#btnMoveAnnotating')?.addEventListener('click', () => {
    handleMove('annotating', 'Etiketleniyor');
  });

  menu.querySelector('#btnMoveCompleted')?.addEventListener('click', () => {
    handleMove('completed', 'Dataset (Tamamlanan)');
  });

  // 1. Rename
  menu.querySelector('#menuRename').onclick = async () => {
    closeMenu();
    const newName = await this.showPrompt({
      title: 'Yığını Yeniden Adlandır',
      subtitle: 'Yığın Yönetimi',
      message: 'Yeni yığın adını giriniz:',
      defaultValue: batch.name,
      placeholder: 'Örn: Mehmet Job 1',
      confirmText: 'Yeniden Adlandır'
    });
    if (newName && newName.trim() && newName.trim() !== batch.name) {
      await fetch('/api/projects/rename-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: currentProj, batch_id: batch.id, new_name: newName.trim() })
      });
      this.showToast(`Yığın adı güncellendi: "${newName.trim()}"`, 'success');
      this.renderAnnotateKanban();
    }
  };

  // 2. Tag
  menu.querySelector('#menuTag').onclick = async () => {
    closeMenu();
    const tags = await this.showPrompt({
      title: 'Yığın Etiketi / Notu',
      subtitle: 'Etiketleme',
      message: 'Yığın için açıklayıcı etiket/not giriniz:',
      defaultValue: batch.tags || '',
      placeholder: 'Örn: batch_v1, acil...',
      confirmText: 'Etiketi Kaydet'
    });
    if (tags !== null) {
      await fetch('/api/projects/update-batch-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: currentProj, batch_id: batch.id, tags: tags.trim() })
      });
      this.showToast('Yığın etiketi güncellendi.', 'success');
      this.renderAnnotateKanban();
    }
  };

  // 3. Download
  menu.querySelector('#menuDownload').onclick = async () => {
    closeMenu();
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const safeBatchName = (batch.name || 'batch').replace(/[^a-zA-Z0-9_\-]/g, '_');
    this.showToast(`"${batch.name || 'Yığın'}" ZIP paketi hazırlanıyor, lütfen bekleyiniz...`, 'info');
    
    try {
      const url = `/api/projects/export-zip?category=${encodeURIComponent(currentProj)}&batch_id=${encodeURIComponent(batch.id)}${token ? '&token=' + encodeURIComponent(token) : ''}`;
      const res = await fetch(url, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        this.showToast(err.detail || 'ZIP oluşturulamadı.', 'error');
        return;
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${safeBatchName}_dataset.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      this.showToast(`✓ "${batch.name || 'Yığın'}" ZIP olarak indirildi.`, 'success');
    } catch (e) {
      console.error('Batch ZIP download error:', e);
      this.showToast('ZIP indirilirken bağlantı hatası oluştu.', 'error');
    }
  };

  // 4. Delete
  menu.querySelector('#menuDelete').onclick = async () => {
    closeMenu();
    const confirmed = await this.showConfirm({
      title: 'Yığını Sil',
      subtitle: 'Yığın Yönetimi',
      message: `"${batch.name}" yığınını ve içerdiği tüm görselleri kalıcı olarak silmek istediğinize emin misiniz?`,
      confirmText: 'Evet, Yığını ve Görselleri Sil',
      cancelText: 'Vazgeç',
      type: 'danger'
    });
    if (confirmed) {
      try {
        this.showLoading(true, 'Yığın ve görseller siliniyor...');
        const headers = this.getAuthHeaders({ 'Content-Type': 'application/json' });

        const res = await fetch('/api/projects/delete-batch', {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            category: currentProj,
            batch_id: batch.id,
            delete_images: true
          })
        });
        const resData = await res.json();
        if (res.ok && resData.status === 'ok') {
          this.showToast(resData.message || 'Yığın başarıyla silindi.', 'success');
          await this.loadHubProjectData();
          this.renderAnnotateKanban();
        } else {
          this.showToast(resData.detail || 'Yığın silinemedi.', 'error');
        }
      } catch (err) {
        console.error('Delete batch error:', err);
        this.showToast('Yığın silinirken bir bağlantı hatası oluştu.', 'error');
      } finally {
        this.showLoading(false);
      }
    }
  };
}

  async openBatchReview(batchId, filterTab = 'unannotated', page = 1, pushHistory = true) {
  const cat = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || new URLSearchParams(location.search).get('category') || 'bag';
  this.activeHubProjectId = cat;
  if (!cat) return;

  this.activeHubTab = 'batch_review';

  // Highlight Annotate in project sidebar
  document.querySelectorAll('.proj-nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ptab === 'annotate');
  });

  document.querySelectorAll('.hub-tab-panel').forEach(panel => {
    panel.classList.remove('active');
    panel.style.display = 'none';
  });
  const p = document.getElementById('hubTabBatchReview');
  if (p) { p.classList.add('active'); p.style.display = 'block'; }

  // Update URL & Browser History
  if (pushHistory) {
    try {
      const curUrl = new URL(window.location);
      const curTab = curUrl.searchParams.get('tab');
      const curBatch = curUrl.searchParams.get('batch_id');
      const curFilter = curUrl.searchParams.get('filter');
      const isSame = curTab === 'batch_review' && curBatch === String(batchId) && curFilter === filterTab;

      const newUrl = `/?project=${encodeURIComponent(cat)}&tab=batch_review&batch_id=${encodeURIComponent(batchId || 'batch_default')}&filter=${encodeURIComponent(filterTab)}`;
      const stateObj = { view: 'project', params: { projectId: cat, tab: 'batch_review', batch_id: batchId, filter: filterTab } };
      if (!isSame) {
        window.history.pushState(stateObj, '', newUrl);
      }
    } catch (e) { }
  }

  this.showLoading(true, 'Yığın İçeriği Yükleniyor...', 'Lütfen bekleyiniz, görseller ve etiket verileri taranıyor...');

  try {
    const authHeaders = this.getAuthHeaders ? this.getAuthHeaders() : {};

    // Paralel fetch: images cache'de yoksa veya proje degistiyse yenile, batches her zaman cek
    const needsImageRefresh = !this.currentHubImages?.length || this._lastImageFetchCat !== cat;
    const fetchPromises = [
      needsImageRefresh
        ? fetch(`/api/images?category=${encodeURIComponent(cat)}`, { headers: authHeaders }).then(r => r.json())
        : Promise.resolve({ images: this.currentHubImages }),
      fetch(`/api/projects/batches?category=${encodeURIComponent(cat)}`, { headers: authHeaders }).then(r => r.json())
    ];
    const [imgData, batchData] = await Promise.all(fetchPromises);

    if (needsImageRefresh) {
      this.currentHubImages = imgData.images || [];
      this._lastImageFetchCat = cat;
    }
    this.currentHubBatches = batchData.batches || []; // state'e cache'le

    const batches = this.currentHubBatches;
    const batch = batches.find(b => b.id === batchId) || batches[0] || {
      id: 'batch_default',
      name: 'Ana Görsel Havuzu',
      created_at: '',
      total_count: this.currentHubImages.length,
      unassigned_count: this.currentHubImages.filter(i => !i.has_label_file || i.box_count === 0).length,
      annotated_count: this.currentHubImages.filter(i => i.has_label_file && i.box_count > 0).length,
      approved_count: 0
    };

    this.activeBatchReviewId = batch.id;
    this.activeBatchReviewTab = filterTab;
    this.rfBatchCurrentPage = page || 1;
    this.rfSelectedBatchFilenames = this.rfSelectedBatchFilenames || new Set();

    // Populate batch selector dropdown
    const batchSelect = document.getElementById('rfBatchSelectDropdown');
    if (batchSelect && batches.length > 0) {
      batchSelect.innerHTML = batches.map(b => `
          <option value="${b.id}" ${b.id === batch.id ? 'selected' : ''}>Yığın: ${b.name}</option>
        `).join('');
      batchSelect.onchange = () => this.openBatchReview(batchSelect.value, this.activeBatchReviewTab, 1, true);
    }

    // Header info (Roboflow style)
    const titleEl = document.getElementById('batchReviewTitle');
    if (titleEl) {
      titleEl.textContent = filterTab === 'unannotated' ? 'Etiket Bekleyen Görseller' : (filterTab === 'annotated' ? 'Etiketlenen Görseller' : 'Onaylanan Görseller');
    }

    const subName = document.getElementById('batchReviewNameSub');
    if (subName) subName.textContent = `Yığın: ${batch.name}`;

    const timelineEl = document.getElementById('batchReviewTimeline');
    if (timelineEl) {
      timelineEl.textContent = `Oluşturulma: ${batch.created_at || 'Bilinmiyor'} • Toplam: ${batch.total_count || batch.images?.length || 0} Görsel`;
    }

    // Tab buttons & counters — ID'ler HTML ile hizalı
    const uTabBtn = document.getElementById('batchReviewTabUnannotated');
    const aTabBtn = document.getElementById('batchReviewTabAnnotated');
    const appTabBtn = document.getElementById('batchReviewTabApproved');

    const uCnt = batch.unassigned_count ?? (batch.unassigned_filenames ? batch.unassigned_filenames.length : 0);
    const aCnt = batch.annotated_count ?? (batch.annotated_filenames ? batch.annotated_filenames.length : 0);
    const appCnt = batch.approved_count ?? (batch.approved_filenames ? batch.approved_filenames.length : 0);

    // Tab buttons active class toggle & counts
    [uTabBtn, aTabBtn, appTabBtn].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });

    if (uTabBtn) {
      if (filterTab === 'unannotated') uTabBtn.classList.add('active');
      const badge = document.getElementById('batchUnannotatedCountBadge');
      if (badge) badge.textContent = uCnt.toLocaleString();
      uTabBtn.onclick = () => this.openBatchReview(batch.id, 'unannotated', 1, true);
    }
    if (aTabBtn) {
      if (filterTab === 'annotated') aTabBtn.classList.add('active');
      const badge = document.getElementById('batchAnnotatedCountBadge');
      if (badge) badge.textContent = aCnt.toLocaleString();
      aTabBtn.onclick = () => this.openBatchReview(batch.id, 'annotated', 1, true);
    }
    if (appTabBtn) {
      if (filterTab === 'approved') appTabBtn.classList.add('active');
      const badge = document.getElementById('batchApprovedCountBadge');
      if (badge) badge.textContent = appCnt.toLocaleString();
      appTabBtn.onclick = () => this.openBatchReview(batch.id, 'approved', 1, true);
    }

    // Rename Button
    // Upload More Button
    const uploadMoreBtn = document.getElementById('batchUploadMoreBtn') || document.getElementById('rfUploadMoreBatchBtn');
    if (uploadMoreBtn) {
      uploadMoreBtn.onclick = () => {
        this.switchProjectTab('upload');
        const input = document.getElementById('uploadBatchNameInput');
        if (input) input.value = batch.name;
      };
    }

    // Rename Button
    const renameBtn = document.getElementById('batchRenameBtn') || document.getElementById('rfRenameBatchBtn');
    if (renameBtn) {
      renameBtn.onclick = async () => {
        const newName = await this.showPrompt({
          title: 'Yığını Yeniden Adlandır',
          message: 'Lütfen bu yığın için yeni bir isim giriniz:',
          defaultValue: batch.name,
          confirmText: 'Kaydet'
        });
        if (newName && newName.trim() && newName.trim() !== batch.name) {
          try {
            const headers = this.getAuthHeaders({ 'Content-Type': 'application/json' });
            const rRes = await fetch('/api/projects/rename-batch', {
              method: 'POST',
              headers: headers,
              body: JSON.stringify({ category: this.activeHubProjectId, batch_id: batch.id, new_name: newName.trim() })
            });
            if (rRes.ok) {
              this.showToast('Yığın başarıyla yeniden adlandırıldı.', 'success');
              this.openBatchReview(batch.id, filterTab, page);
            }
          } catch (err) {
            this.showToast('Yeniden adlandırma başarısız oldu.', 'error');
          }
        }
      };
    }

    const deleteCurrentBtn = document.getElementById('batchDeleteCurrentBtn') || document.getElementById('rfDeleteCurrentBatchBtn');
    if (deleteCurrentBtn) {
      deleteCurrentBtn.onclick = async () => {
        const confirmed = await this.showConfirm({
          title: 'Yığını Sil',
          subtitle: 'Kalıcı Silme İşlemi',
          message: `"${batch.name}" yığınını ve bu yığına ait tüm görselleri kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`,
          confirmText: 'Evet, Yığını ve Görselleri Sil',
          cancelText: 'Vazgeç',
          type: 'danger'
        });
        if (confirmed) {
          try {
            this.showLoading(true, 'Yığın ve içerisindeki görseller siliniyor...');
            const headers = this.getAuthHeaders({ 'Content-Type': 'application/json' });

            const res = await fetch('/api/projects/delete-batch', {
              method: 'POST',
              headers: headers,
              body: JSON.stringify({
                category: this.activeHubProjectId,
                batch_id: batch.id,
                delete_images: true
              })
            });
            const resData = await res.json();
            if (res.ok && resData.status === 'ok') {
              this.showToast(resData.message || 'Yığın başarıyla silindi.', 'success');
              await this.loadHubProjectData();
              this.switchProjectTab('annotate');
            } else {
              this.showToast(resData.detail || 'Yığın silinemedi.', 'error');
            }
          } catch (err) {
            console.error('Delete batch error:', err);
            this.showToast('Yığın silinirken bir bağlantı hatası oluştu.', 'error');
          } finally {
            this.showLoading(false);
          }
        }
      };
    }

    const backBtn = document.getElementById('batchReviewBackBtn');
    if (backBtn) backBtn.onclick = () => this.switchProjectTab('annotate');

    // 3. Robust Target Filenames Resolution
    let poolImages = [];
    const imageMap = new Map((this.currentHubImages || []).map(img => [img.filename, img]));

    if (filterTab === 'unannotated') {
      if (batch.unassigned_filenames && batch.unassigned_filenames.length > 0) {
        poolImages = batch.unassigned_filenames.map(fn => imageMap.get(fn) || { filename: fn, has_label_file: false, box_count: 0 });
      } else {
        poolImages = this.currentHubImages.filter(i => !i.has_label_file || i.box_count === 0);
      }
    } else if (filterTab === 'annotated') {
      if (batch.annotated_filenames && batch.annotated_filenames.length > 0) {
        poolImages = batch.annotated_filenames.map(fn => imageMap.get(fn) || { filename: fn, has_label_file: true, box_count: 1 });
      } else {
        poolImages = this.currentHubImages.filter(i => i.has_label_file && i.box_count > 0);
      }
    } else {
      // Approved: batch'te approved_filenames yoksa tüm etiketli görselleri fallback olarak goster
      if (batch.approved_filenames && batch.approved_filenames.length > 0) {
        poolImages = batch.approved_filenames.map(fn => imageMap.get(fn) || { filename: fn, has_label_file: true, box_count: 1 });
      } else {
        poolImages = this.currentHubImages.filter(i => i.has_label_file && i.box_count > 0);
      }
    }

    const startAnnotatingBtn = document.getElementById('batchStartAnnotatingBtn');
    if (startAnnotatingBtn) {
      startAnnotatingBtn.onclick = () => {
        const mode = filterTab === 'unannotated' ? 'unlabeled' : 'all';
        const batchFiles = (poolImages && poolImages.length > 0) ? poolImages.map(img => img.filename) : (batch.filenames || batch.images || []);
        this.showEditor(this.activeHubProjectId, true, mode, null, batchFiles, batch.id, batch.name);
      };
    }

    // Filter by Search Query
    const query = (document.getElementById('rfBatchSearchInput')?.value || '').trim().toLowerCase();
    if (query) {
      poolImages = poolImages.filter(i => i.filename.toLowerCase().includes(query));
    }

    // Sort
    const sortBy = document.getElementById('rfBatchSortSelect')?.value || 'newest';
    if (sortBy === 'name') {
      poolImages.sort((a, b) => a.filename.localeCompare(b.filename));
    } else if (sortBy === 'oldest') {
      poolImages.reverse();
    }

    // Search and Sort event wiring — _wiredProject ile proje degisince re-wire zorla
    const searchInput = document.getElementById('rfBatchSearchInput');
    if (searchInput && (!searchInput._wired || searchInput._wiredProject !== cat)) {
      searchInput._wired = true;
      searchInput._wiredProject = cat;
      searchInput.addEventListener('input', () => this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, 1));
    }
    const sortSelect = document.getElementById('rfBatchSortSelect');
    if (sortSelect && (!sortSelect._wired || sortSelect._wiredProject !== cat)) {
      sortSelect._wired = true;
      sortSelect._wiredProject = cat;
      sortSelect.addEventListener('change', () => this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, 1));
    }

    // Pagination — rfPerPageSelect HTML ID ile hizalı, _wiredProject guard
    const perPageSelect = document.getElementById('rfPerPageSelect');
    const perPage = perPageSelect ? parseInt(perPageSelect.value, 10) || 50 : 50;
    if (perPageSelect && (!perPageSelect._wired || perPageSelect._wiredProject !== cat)) {
      perPageSelect._wired = true;
      perPageSelect._wiredProject = cat;
      perPageSelect.addEventListener('change', () => this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, 1));
    }

    const totalItems = poolImages.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    const currentPage = Math.min(Math.max(1, page), totalPages);

    const startIndex = (currentPage - 1) * perPage;
    const displaySlice = poolImages.slice(startIndex, startIndex + perPage);

    // Render Pagination Bar — HTML ID'leri ile tam hizalı
    const pagBar = document.getElementById('rfBatchPaginationBar');
    if (pagBar) {
      pagBar.style.display = totalItems > 0 ? 'flex' : 'none';

      // rfPaginationInfo: "1 - 50 of 2,456" formatında goster
      const pagInfo = document.getElementById('rfPaginationInfo');
      if (pagInfo) {
        const fromItem = totalItems > 0 ? startIndex + 1 : 0;
        const toItem = Math.min(startIndex + perPage, totalItems);
        pagInfo.textContent = `${fromItem.toLocaleString()} - ${toItem.toLocaleString()} of ${totalItems.toLocaleString()}`;
      }

      // rfPaginationControls: prev/next butonlarını inject et (bir kez)
      const pagControls = document.getElementById('rfPaginationControls');
      if (pagControls) {
        if (!pagControls._wired) {
          pagControls._wired = true;
          pagControls.innerHTML = `
            <button id="rfPagPrevBtn" style="padding:5px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:7px; color:#cbd5e1; font-size:0.84rem; cursor:pointer; transition:all 0.15s ease;" onmouseover="if(!this.disabled)this.style.background='rgba(139,92,246,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">&#9664; Önceki</button>
            <button id="rfPagNextBtn" style="padding:5px 12px; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:7px; color:#cbd5e1; font-size:0.84rem; cursor:pointer; transition:all 0.15s ease;" onmouseover="if(!this.disabled)this.style.background='rgba(139,92,246,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'">Sonraki &#9654;</button>
          `;
          // onClick'ler her zaman this.rfBatchCurrentPage'i okudugundan kapanım sorunu yok
          pagControls.querySelector('#rfPagPrevBtn').addEventListener('click', () => {
            if (this.rfBatchCurrentPage > 1)
              this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, this.rfBatchCurrentPage - 1);
          });
          pagControls.querySelector('#rfPagNextBtn').addEventListener('click', () => {
            // totalPages'i her tıklamada yeniden hesapla (state'den okuma)
            const pp = parseInt(document.getElementById('rfPerPageSelect')?.value || '50', 10);
            const tp = Math.max(1, Math.ceil((this._lastRfTotalItems || 0) / pp));
            if (this.rfBatchCurrentPage < tp)
              this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, this.rfBatchCurrentPage + 1);
          });
        }
        // Her render'da buton durumlarını güncelle
        this._lastRfTotalItems = totalItems; // totalItems'i state'e kaydet
        const prevBtn = document.getElementById('rfPagPrevBtn');
        const nextBtn = document.getElementById('rfPagNextBtn');
        if (prevBtn) {
          prevBtn.disabled = currentPage <= 1;
          prevBtn.style.opacity = currentPage <= 1 ? '0.4' : '1';
          prevBtn.style.cursor = currentPage <= 1 ? 'not-allowed' : 'pointer';
        }
        if (nextBtn) {
          nextBtn.disabled = currentPage >= totalPages;
          nextBtn.style.opacity = currentPage >= totalPages ? '0.4' : '1';
          nextBtn.style.cursor = currentPage >= totalPages ? 'not-allowed' : 'pointer';
        }
      }
    }

    // Toggle annotations checkbox \u2014 rfToggleAnnotationsCheck HTML ID ile hizal\u0131, _wiredProject guard
    const toggleCheck = document.getElementById('rfToggleAnnotationsCheck');
    const showBoxes = toggleCheck ? toggleCheck.checked : true;
    if (toggleCheck && (!toggleCheck._wired || toggleCheck._wiredProject !== cat)) {
      toggleCheck._wired = true;
      toggleCheck._wiredProject = cat;
      toggleCheck.addEventListener('change', () => this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, this.rfBatchCurrentPage));
    }

    // Render Grid Cards with Loading Skeleton & Direct URLs
    const grid = document.getElementById('batchReviewThumbGrid');
    if (grid) {
      if (displaySlice.length === 0) {
        grid.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1; padding: 60px 20px; text-align: center; color: #94a3b8; font-size: 0.95rem; background:rgba(15,23,42,0.4); border:1px dashed rgba(255,255,255,0.12); border-radius:14px;">
              <h3 style="color:#fff; font-size:1.15rem; margin-bottom:8px;">Görsel Bulunamadı</h3>
              <p style="margin:0 auto 16px; max-width:400px;">Seçili sekmede ve filtrede gösterilecek görsel bulunmuyor.</p>
              ${filterTab === 'unannotated' ? '<button class="btn-primary btn-sm" onclick="window._yoloEditor && window._yoloEditor.switchProjectTab(\'upload\')">Görsel Yükle</button>' : ''}
            </div>
          `;
      } else {
        const currentTok = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
        const tokParam = currentTok ? `&token=${encodeURIComponent(currentTok)}` : '';
        const approvedSet = new Set(batch.approved_filenames || []);

        grid.innerHTML = displaySlice.map(img => {
          const isSel = this.rfSelectedBatchFilenames.has(img.filename);
          const imgSrc = (showBoxes && img.has_label_file && img.box_count > 0)
            ? `/api/preview-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}${tokParam}`
            : `/api/image-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}${tokParam}`;
          const fullImgUrl = `${window.location.origin}/api/image-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}`;

          const isApproved = approvedSet.has(img.filename);
          const isLabeled = img.has_label_file && img.box_count > 0;
          const statusBadge = isApproved
            ? `<span style="background:rgba(16,185,129,0.15); color:#34d399; font-size:0.68rem; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid rgba(16,185,129,0.3);">✓ Onaylandı</span>`
            : (isLabeled
              ? `<span style="background:rgba(56,189,248,0.15); color:#38bdf8; font-size:0.68rem; font-weight:700; padding:2px 6px; border-radius:4px; border:1px solid rgba(56,189,248,0.3);">🏷️ ${img.box_count} Kutu</span>`
              : `<span style="background:rgba(148,163,184,0.15); color:#94a3b8; font-size:0.68rem; font-weight:600; padding:2px 6px; border-radius:4px;">⚪ Ham Görsel</span>`);

          return `
              <div class="rf-image-card ${isSel ? 'selected' : ''}" data-filename="${img.filename}" data-full-url="${fullImgUrl}" style="background:rgba(15,23,42,0.85); border:1px solid ${isSel ? '#7c3aed' : 'rgba(255,255,255,0.08)'}; border-radius:12px; overflow:hidden; cursor:pointer; transition:all 0.18s ease; display:flex; flex-direction:column; position:relative;">
                <div style="position:absolute; top:8px; left:8px; z-index:5;">
                  <input type="checkbox" class="rf-card-checkbox" data-filename="${img.filename}" ${isSel ? 'checked' : ''} style="width:17px; height:17px; accent-color:#7c3aed; cursor:pointer;">
                </div>
                
                <!-- URL Kopyalama Butonu -->
                <button class="rf-copy-url-btn" data-url="${fullImgUrl}" style="position:absolute; top:8px; right:8px; z-index:5; background:rgba(0,0,0,0.65); border:1px solid rgba(255,255,255,0.15); color:#94a3b8; width:26px; height:26px; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.15s ease;" title="Görsel URL Bağlantısını Kopyala">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                </button>

                <!-- Görsel Alanı (Tam Yüklenene Kadar Skeleton/Yükleniyor Göstergesi) -->
                <div style="position:relative; aspect-ratio:4/3; background:#020617; display:flex; align-items:center; justify-content:center; overflow:hidden; padding:4px;">
                  <div class="rf-card-loader" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; color:#64748b; font-size:0.75rem; background:#040711;">
                    <div class="spinner" style="width:20px; height:20px; border-width:2px;"></div>
                    <span>Yükleniyor...</span>
                  </div>
                  <img src="${imgSrc}" alt="${img.filename}" loading="lazy" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:6px; opacity:0; transition:opacity 0.22s ease;" onload="this.previousElementSibling.style.display='none'; this.style.opacity='1';" onerror="this.previousElementSibling.innerHTML='<span style=\\'color:#f87171; font-size:0.75rem;\\'>Yüklenemedi</span>';">
                </div>

                <div style="padding:10px 12px; background:rgba(30,41,59,0.4); border-top:1px solid rgba(255,255,255,0.05); display:flex; flex-direction:column; gap:4px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                    <div style="font-size:0.8rem; font-weight:600; color:#f1f5f9; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; flex:1;" title="${img.filename}">
                      ${img.filename}
                    </div>
                  </div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:2px;">
                    ${statusBadge}
                    <span style="font-size:0.68rem; color:#64748b; font-family:monospace;">${img.filename.split('.').pop().toUpperCase()}</span>
                  </div>
                </div>
              </div>
            `;
        }).join('');

        // Wire Card Events & Checkbox Selection
        grid.querySelectorAll('.rf-card-checkbox').forEach(cb => {
          cb.addEventListener('click', (e) => e.stopPropagation());
          cb.addEventListener('change', (e) => {
            const fname = cb.dataset.filename;
            if (cb.checked) {
              this.rfSelectedBatchFilenames.add(fname);
              cb.closest('.rf-image-card')?.classList.add('selected');
            } else {
              this.rfSelectedBatchFilenames.delete(fname);
              cb.closest('.rf-image-card')?.classList.remove('selected');
            }
            this.updateRfFloatingActionBar();
          });
        });

        grid.querySelectorAll('.rf-image-card').forEach(card => {
          card.addEventListener('click', (e) => {
            if (e.target.classList.contains('rf-card-checkbox')) return;
            const fname = card.dataset.filename;
            const mode = filterTab === 'unannotated' ? 'unlabeled' : 'all';
            const batchFiles = (poolImages && poolImages.length > 0) ? poolImages.map(img => img.filename) : (batch.filenames || batch.images || []);
            this.showEditor(this.activeHubProjectId, true, mode, fname, batchFiles, batch.id, batch.name);
          });
        });
      }
    }

    this.updateRfFloatingActionBar();

    // Wire URL copy buttons
    grid && grid.querySelectorAll('.rf-copy-url-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.url;
        if (!url) return;
        navigator.clipboard.writeText(url).then(() => {
          const orig = btn.innerHTML;
          btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
          btn.style.borderColor = 'rgba(52,211,153,0.4)';
          setTimeout(() => { btn.innerHTML = orig; btn.style.borderColor = 'rgba(255,255,255,0.15)'; }, 1500);
        }).catch(() => this.showToast && this.showToast('URL kopyalanamadı.', 'error'));
      });
    });

  } catch (e) {
    console.error('Error opening batch review:', e);
    this.showToast && this.showToast('Yığın yüklenirken hata oluştu.', 'error');
  } finally {
    this.showLoading(false);
  }
}

selectAllBatchImages() {
  const grid = document.getElementById('batchReviewThumbGrid');
  if (!grid) return;
  this.rfSelectedBatchFilenames = this.rfSelectedBatchFilenames || new Set();
  grid.querySelectorAll('.rf-card-checkbox').forEach(cb => {
    const fname = cb.dataset.filename;
    if (fname) {
      cb.checked = true;
      this.rfSelectedBatchFilenames.add(fname);
      cb.closest('.rf-image-card')?.classList.add('selected');
    }
  });
  this.updateRfFloatingActionBar();
}

clearBatchSelection() {
  this.rfSelectedBatchFilenames = this.rfSelectedBatchFilenames || new Set();
  this.rfSelectedBatchFilenames.clear();
  const grid = document.getElementById('batchReviewThumbGrid');
  if (grid) {
    grid.querySelectorAll('.rf-card-checkbox').forEach(cb => {
      cb.checked = false;
      cb.closest('.rf-image-card')?.classList.remove('selected');
    });
  }
  this.updateRfFloatingActionBar();
}

updateRfFloatingActionBar() {
  const bar = document.getElementById('rfFloatingActionBar');
  const countEl = document.getElementById('rfSelectedCountTxt');
  const count = (this.rfSelectedBatchFilenames || new Set()).size;

  if (bar && countEl) {
    countEl.textContent = count;
    bar.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  // Toolbar Quick Select-All / Deselect toggle
  const toolbarBtn = document.getElementById('rfToolbarSelectAllBtn');
  const toolbarTxt = document.getElementById('rfToolbarSelectAllTxt');
  const grid = document.getElementById('batchReviewThumbGrid');
  const totalVisible = grid ? grid.querySelectorAll('.rf-card-checkbox').length : 0;
  if (toolbarBtn && toolbarTxt) {
    if (totalVisible > 0 && count >= totalVisible) {
      toolbarTxt.textContent = 'Seçimi Kaldır';
      toolbarBtn.onclick = (e) => {
        e.preventDefault();
        this.clearBatchSelection();
      };
    } else {
      toolbarTxt.textContent = 'Tümünü Seç';
      toolbarBtn.onclick = (e) => {
        e.preventDefault();
        this.selectAllBatchImages();
      };
    }
  }

  // Floating Bar: Tümünü Seç
  const selectAllBtn = document.getElementById('rfBatchSelectAllVisibleBtn');
  if (selectAllBtn) {
    selectAllBtn.onclick = (e) => {
      e.preventDefault();
      this.selectAllBatchImages();
    };
  }

  // Floating Bar: Seçimi Kaldır
  const clearBtn = document.getElementById('rfBatchClearSelectionBtn');
  if (clearBtn) {
    clearBtn.onclick = (e) => {
      e.preventDefault();
      this.clearBatchSelection();
    };
  }

  // Floating Bar: Sil
  const deleteBtn = document.getElementById('rfBatchActionDeleteBtn');
  if (deleteBtn) {
    deleteBtn.onclick = async (e) => {
      e.preventDefault();
      const confirmed = await this.showConfirm({
        title: 'Seçili Görselleri Sil',
        subtitle: 'Toplu Silme',
        message: `Seçili ${count} görseli ve etiketlerini kalıcı olarak silmek istediğinize emin misiniz?`,
        confirmText: 'Evet, Sil',
        cancelText: 'Vazgeç',
        type: 'danger'
      });
      if (confirmed) {
        this.showLoading(true, 'Görseller siliniyor...');
        try {
          const authHeaders = this.getAuthHeaders ? this.getAuthHeaders({ 'Content-Type': 'application/json' }) : { 'Content-Type': 'application/json' };

          for (const fn of Array.from(this.rfSelectedBatchFilenames)) {
            await fetch('/api/delete-image', {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({ category: this.activeHubProjectId, filename: fn })
            });
          }
          this.showToast(`${count} görsel başarıyla silindi.`, 'success');
          this.clearBatchSelection();
          await this.loadHubProjectData();
          this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, this.rfBatchCurrentPage);
        } catch (err) {
          console.error('Batch delete error:', err);
          this.showToast('Görseller silinirken bir hata oluştu.', 'error');
        } finally {
          this.showLoading(false);
        }
      }
    };
  }
}

renderDatasetGallery() {
  const grid = document.getElementById('datasetGalleryGrid');
  if (!grid) return;

  if (this.isLoadingHubData) {
    grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: #94a3b8;">
          <div style="position:relative; width:44px; height:44px; margin:0 auto 16px;">
            <div style="position:absolute; inset:0; border:3px solid rgba(56,189,248,0.15); border-top-color:#38bdf8; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
          </div>
          <div style="font-size:1.02rem; font-weight:600; color:#f8fafc;">Görseller Yükleniyor...</div>
          <div style="font-size:0.8rem; color:#64748b; margin-top:4px;">Lütfen bekleyiniz</div>
        </div>
      `;
    return;
  }

  const query = (document.getElementById('datasetSearchInput')?.value || '').trim().toLowerCase();
  const filter = document.getElementById('datasetFilterStatus')?.value || 'all';
  const classFilter = document.getElementById('datasetFilterClass')?.value || 'all';
  const showBoxes = document.getElementById('toggleAnnotationsCheck')?.checked ?? true;

  // Dinamik Sınıf Filtresi Dropdown'ını Doldur
  const classSelect = document.getElementById('datasetFilterClass');
  if (classSelect && this._lastPopulatedCat !== this.activeHubProjectId) {
    this._lastPopulatedCat = this.activeHubProjectId;
    const projClasses = this.classes?.[this.activeHubProjectId] || [];
    classSelect.innerHTML = '<option value="all">Tüm Sınıflar (Hepsi)</option>' +
      projClasses.map(c => `<option value="${c.id}">[${c.id}] ${this._escapeHtml(c.name)}</option>`).join('');
    
    if (!classSelect._wired) {
      classSelect._wired = true;
      classSelect.addEventListener('change', () => {
        this.datasetCurrentPage = 1;
        this.renderDatasetGallery();
      });
    }
  }

  const allImages = this.currentHubImages || [];
  const totalAll = allImages.length;
  const totalLabeled = allImages.filter(i => i.has_label_file && i.box_count > 0).length;
  const totalUnlabeled = totalAll - totalLabeled;
  const labeledPct = totalAll > 0 ? Math.round((totalLabeled / totalAll) * 100) : 0;

  // Projedeki kopya verileri (önbellekten)
  const currentCat = this.activeHubProjectId || 'bag';
  const dupData = (this.cachedDuplicateData && this.cachedDuplicateData[currentCat]) || null;
  const duplicateFilenames = new Set();
  if (dupData && dupData.duplicate_groups) {
    dupData.duplicate_groups.forEach(g => {
      (g.duplicates || []).forEach(d => duplicateFilenames.add(d));
    });
  }
  const totalDups = duplicateFilenames.size;

  // Dataset istatistik bari — toolbar ile grid arasinda dinamik goster
  let statsBar = document.getElementById('datasetStatsBar');
  if (!statsBar) {
    statsBar = document.createElement('div');
    statsBar.id = 'datasetStatsBar';
    statsBar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding:10px 14px;background:rgba(15,23,42,0.5);border:1px solid rgba(255,255,255,0.07);border-radius:10px;';
    grid.parentNode.insertBefore(statsBar, grid);
  }
  const dupBadgeHtml = totalDups > 0
    ? `<span id="datasetStatsDupBadge" style="font-size:0.77rem;font-weight:700;color:#f87171;padding:3px 10px;background:rgba(239,68,68,0.12);border-radius:20px;border:1px solid rgba(239,68,68,0.3);cursor:pointer;" title="Kopya Tespiti sekmesine git">⚠️ ${totalDups.toLocaleString()} Kopya</span>`
    : '';

  statsBar.innerHTML = `
    <span style="font-size:0.78rem;color:#475569;font-weight:600;margin-right:2px;">Veri Seti:</span>
    <span style="font-size:0.77rem;font-weight:700;color:#f1f5f9;padding:3px 10px;background:rgba(255,255,255,0.06);border-radius:20px;border:1px solid rgba(255,255,255,0.1);">📁 ${totalAll.toLocaleString()} Toplam</span>
    <span style="font-size:0.77rem;font-weight:700;color:#38bdf8;padding:3px 10px;background:rgba(56,189,248,0.1);border-radius:20px;border:1px solid rgba(56,189,248,0.2);">🏷️ ${totalLabeled.toLocaleString()} Etiketli (${labeledPct}%)</span>
    <span style="font-size:0.77rem;font-weight:700;color:#64748b;padding:3px 10px;background:rgba(100,116,139,0.08);border-radius:20px;border:1px solid rgba(100,116,139,0.15);">⚪ ${totalUnlabeled.toLocaleString()} Etiketsiz</span>
    ${dupBadgeHtml}
    ${(filter !== 'all' || query || classFilter !== 'all') ? `<span style="font-size:0.77rem;font-weight:600;color:#a78bfa;padding:3px 10px;background:rgba(139,92,246,0.1);border-radius:20px;border:1px solid rgba(139,92,246,0.2);">↳ Filtre aktif</span>` : ''}
  `;

  document.getElementById('datasetStatsDupBadge')?.addEventListener('click', () => {
    this.switchProjectTab('duplicate');
  });

  const selectedClassId = classFilter !== 'all' ? parseInt(classFilter, 10) : null;

  let images = allImages.filter(img => {
    if (query && !img.filename.toLowerCase().includes(query)) return false;
    if (filter === 'labeled' && (!img.has_label_file || img.box_count === 0)) return false;
    if (filter === 'unlabeled' && (img.has_label_file && img.box_count > 0)) return false;
    if (filter === 'duplicates' && !duplicateFilenames.has(img.filename)) return false;
    if (selectedClassId !== null) {
      const imgClassIds = img.class_ids || [];
      if (!imgClassIds.includes(selectedClassId)) return false;
    }
    return true;
  });

  if (images.length === 0) {
    const hasAnyImages = (this.currentHubImages || []).length > 0;
    if (hasAnyImages) {
      grid.innerHTML = `
          <div class="empty-state-card" style="grid-column: 1/-1; text-align: center; padding: 50px 20px; background: rgba(15, 23, 42, 0.4); border: 1px dashed rgba(255,255,255,0.12); border-radius: 16px; margin-top: 20px;">
            <h3 style="font-size: 1.2rem; font-weight: 700; color: #fff; margin-bottom: 8px;">Seçili Filtrede Görsel Bulunamadı</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 480px; margin: 0 auto 20px; line-height: 1.5;">
              Projenizde toplam ${this.currentHubImages.length} görsel var ancak <strong>${filter === 'unlabeled' ? 'Etiketsiz (Boş)' : filter === 'duplicates' ? 'Kopya' : 'Seçili'}</strong> filtresine uyan görsel bulunamadı.
            </p>
            <button class="btn-primary" id="datasetResetFilterBtn" style="padding: 10px 24px; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 8px;">
              <span>Tüm Görselleri Göster (${this.currentHubImages.length})</span>
            </button>
          </div>
        `;
      document.getElementById('datasetResetFilterBtn')?.addEventListener('click', () => {
        const sel = document.getElementById('datasetFilterStatus');
        if (sel) sel.value = 'all';
        this.renderDatasetGallery();
      });
    } else {
      grid.innerHTML = `
          <div class="empty-state-card" style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: rgba(15, 23, 42, 0.4); border: 1px dashed rgba(255,255,255,0.12); border-radius: 16px; margin-top: 20px;">
            <h3 style="font-size: 1.25rem; font-weight: 700; color: #fff; margin-bottom: 8px;">Bu Projede Henüz Görsel Yok</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 480px; margin: 0 auto 20px; line-height: 1.5;">
              Projenizi eğitmeye veya etiketlemeye başlamak için bilgisayarınızdan görseller veya hazır YOLO etiket dosyaları yükleyin.
            </p>
            <button class="btn-primary" id="datasetEmptyGoUploadBtn" style="padding: 10px 24px; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 8px;">
              <span>Görsel Yükle (Upload Data)</span>
            </button>
          </div>
        `;
      document.getElementById('datasetEmptyGoUploadBtn')?.addEventListener('click', () => {
        this.switchProjectTab('upload');
      });
    }
    return;
  }

  // Pagination Calculation
  this.datasetCurrentPage = this.datasetCurrentPage || 1;
  const pageSizeEl = document.getElementById('datasetPageSizeSelect');
  const pageSize = pageSizeEl ? parseInt(pageSizeEl.value, 10) : (this.datasetPageSize || 120);
  this.datasetPageSize = pageSize;

  const totalFiltered = images.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  if (this.datasetCurrentPage > totalPages) this.datasetCurrentPage = totalPages;
  if (this.datasetCurrentPage < 1) this.datasetCurrentPage = 1;

  const startIndex = (this.datasetCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFiltered);
  const pagedImages = images.slice(startIndex, endIndex);

  // Update Pagination UI Bar
  const pagBar = document.getElementById('datasetPaginationBar');
  if (pagBar) {
    pagBar.style.display = totalFiltered > 0 ? 'flex' : 'none';
    const totEl = document.getElementById('datasetTotalFilteredCount');
    const rngEl = document.getElementById('datasetCurrentRange');
    const pageInp = document.getElementById('datasetPageInput');
    const totPagesEl = document.getElementById('datasetTotalPagesCount');
    const prevBtn = document.getElementById('datasetPrevPageBtn');
    const nextBtn = document.getElementById('datasetNextPageBtn');

    if (totEl) totEl.textContent = totalFiltered.toLocaleString();
    if (rngEl) rngEl.textContent = totalFiltered > 0 ? `${(startIndex + 1).toLocaleString()} - ${endIndex.toLocaleString()}` : '0 - 0';
    if (pageInp) {
      pageInp.value = this.datasetCurrentPage;
      pageInp.max = totalPages;
    }
    if (totPagesEl) totPagesEl.textContent = totalPages.toLocaleString();
    if (prevBtn) prevBtn.disabled = (this.datasetCurrentPage <= 1);
    if (nextBtn) nextBtn.disabled = (this.datasetCurrentPage >= totalPages);

    if (!this._hasBoundDatasetPagination) {
      this._hasBoundDatasetPagination = true;
      prevBtn?.addEventListener('click', () => {
        if (this.datasetCurrentPage > 1) {
          this.datasetCurrentPage--;
          this.renderDatasetGallery();
          document.getElementById('datasetGalleryGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      nextBtn?.addEventListener('click', () => {
        if (this.datasetCurrentPage < totalPages) {
          this.datasetCurrentPage++;
          this.renderDatasetGallery();
          document.getElementById('datasetGalleryGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
      pageInp?.addEventListener('change', (e) => {
        let p = parseInt(e.target.value, 10) || 1;
        if (p < 1) p = 1;
        if (p > totalPages) p = totalPages;
        this.datasetCurrentPage = p;
        this.renderDatasetGallery();
        document.getElementById('datasetGalleryGrid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      pageSizeEl?.addEventListener('change', () => {
        this.datasetCurrentPage = 1;
        this.renderDatasetGallery();
      });
    }
  }

  grid.innerHTML = '';
  pagedImages.forEach(img => {
    const card = document.createElement('div');
    card.className = `gallery-item-card ${this.selectedDatasetImageFilenames.has(img.filename) ? 'selected' : ''}`;
    card.style.cssText = 'position:relative; display:flex; flex-direction:column; overflow:hidden; border-radius:10px; background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.08); transition:all 0.18s ease;';

    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || '';
    const tokenQ = token ? `&token=${encodeURIComponent(token)}` : '';

    const imgSrc = showBoxes && img.has_label_file && img.box_count > 0
      ? `/api/preview-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}&v=${img.box_count}${tokenQ}`
      : `/api/image-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}${tokenQ}`;

    const isLabeled = img.has_label_file && img.box_count > 0;
    const isDuplicate = duplicateFilenames.has(img.filename);
    const badgeHtml = isLabeled
      ? `<span style="background:rgba(56,189,248,0.15); color:#38bdf8; font-size:0.65rem; font-weight:700; padding:2px 5px; border-radius:4px; border:1px solid rgba(56,189,248,0.3);">🏷️ ${img.box_count}</span>`
      : `<span style="background:rgba(148,163,184,0.1); color:#94a3b8; font-size:0.65rem; font-weight:600; padding:2px 5px; border-radius:4px;">⚪ Ham</span>`;
    const dupBadge = isDuplicate
      ? `<span style="background:rgba(239,68,68,0.18); color:#f87171; font-size:0.63rem; font-weight:700; padding:2px 5px; border-radius:4px; border:1px solid rgba(239,68,68,0.35);" title="Mükerrer veya benzer kopya görsel">⚠️ Kopya</span>`
      : '';

    const shortName = img.filename.length > 18 ? img.filename.substring(0, 15) + '...' : img.filename;
    const ext = img.filename.split('.').pop().toUpperCase();

    card.innerHTML = `
      <input type="checkbox" class="gallery-select-checkbox" data-file="${img.filename}" ${this.selectedDatasetImageFilenames.has(img.filename) ? 'checked' : ''} style="position:absolute; top:7px; left:7px; z-index:5; width:16px; height:16px; accent-color:#7c3aed; cursor:pointer;">
      <div class="ds-card-img-wrap" style="position:relative; aspect-ratio:4/3; background:#020617; overflow:hidden; display:flex; align-items:center; justify-content:center;">
        <div class="ds-card-loader" style="position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; color:#64748b; font-size:0.72rem; background:#040711;">
          <div class="spinner" style="width:18px; height:18px; border-width:2px;"></div>
          <span>Yükleniyor...</span>
        </div>
        <img src="${imgSrc}" loading="lazy" alt="${img.filename}"
          style="max-width:100%; max-height:100%; object-fit:contain; opacity:0; transition:opacity 0.2s ease;"
          onload="this.previousElementSibling.style.display='none'; this.style.opacity='1';"
          onerror="this.previousElementSibling.innerHTML='<span style=\\'color:#f87171; font-size:0.72rem;\\'>Yüklenemedi</span>'; this.style.display='none';"
        >
      </div>
      <div style="padding:7px 9px; background:rgba(30,41,59,0.5); border-top:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center; gap:4px;">
        <span style="font-size:0.75rem; font-weight:600; color:#e2e8f0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;" title="${img.filename}">${shortName}</span>
        <span style="font-size:0.62rem; color:#475569; font-family:monospace; flex-shrink:0;">${ext}</span>
      </div>
      <div style="padding:4px 9px 7px; display:flex; justify-content:space-between; align-items:center; gap:4px;">
        <div style="display:flex; align-items:center; gap:4px;">
          ${badgeHtml}
          ${dupBadge}
        </div>
        ${img.width && img.height ? `<span style="font-size:0.62rem; color:#475569;">${img.width}×${img.height}</span>` : '<span></span>'}
      </div>
    `;

    const checkbox = card.querySelector('.gallery-select-checkbox');
    checkbox?.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    checkbox?.addEventListener('change', (e) => {
      e.stopPropagation();
      if (e.target.checked) {
        this.selectedDatasetImageFilenames.add(img.filename);
        card.classList.add('selected');
        card.style.borderColor = '#7c3aed';
      } else {
        this.selectedDatasetImageFilenames.delete(img.filename);
        card.classList.remove('selected');
        card.style.borderColor = 'rgba(255,255,255,0.08)';
      }
      this.updateDatasetSelectionBar();
    });

    card.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.classList.contains('gallery-select-checkbox')) {
        return;
      }
      this.showEditor(this.activeHubProjectId, true, null, img.filename);
    });

    grid.appendChild(card);
  });

  this.updateDatasetSelectionBar();
}

updateDatasetSelectionBar() {
  const bar = document.getElementById('datasetSelectionBar');
  const countSpan = document.getElementById('selectedImagesCount');
  const count = this.selectedDatasetImageFilenames.size;

  if (bar && countSpan) {
    countSpan.textContent = count;
    bar.style.display = count > 0 ? 'flex' : 'none';
  }

  const userRole = (this.currentUser?.role || 'admin').toLowerCase();
  const deleteSelectedBtn = document.getElementById('batchDeleteSelectedBtn');
  if (deleteSelectedBtn) {
    deleteSelectedBtn.style.display = userRole === 'annotator' ? 'none' : 'inline-block';
  }

  if (deleteSelectedBtn && !deleteSelectedBtn._wired) {
    deleteSelectedBtn._wired = true;
    deleteSelectedBtn.addEventListener('click', async () => {
      if (userRole === 'annotator') {
        this.showToast('Görsel silme yetkiniz bulunmamaktadır.', 'warning');
        return;
      }
      const selectedCount = this.selectedDatasetImageFilenames.size;
      if (selectedCount === 0) return;

      const confirmed = await this.showConfirm({
        title: 'Seçili Görselleri Sil',
        subtitle: 'Kalıcı Silme İşlemi',
        message: `Seçili ${selectedCount} görseli ve etiketlerini kalıcı olarak silmek istediğinize emin misiniz?`,
        confirmText: 'Evet, Sil',
        cancelText: 'Vazgeç',
        type: 'danger'
      });
      if (confirmed) {
        this.showLoading(true, 'Görseller siliniyor...');
        try {
          const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || '';
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          for (const fn of Array.from(this.selectedDatasetImageFilenames)) {
            await fetch('/api/delete-image', {
              method: 'POST',
              headers,
              body: JSON.stringify({ category: this.activeHubProjectId, filename: fn })
            });
          }
          this.showToast(`${selectedCount} görsel başarıyla silindi.`, 'success');
          this.selectedDatasetImageFilenames.clear();
          await this.loadHubProjectData();
          this.renderDatasetGallery();
        } catch (err) {
          console.error('Dataset gallery bulk delete error:', err);
          this.showToast('Görseller silinirken bir hata oluştu.', 'error');
        } finally {
          this.showLoading(false);
        }
      }
    });
  }

  const aiSelectedBtn = document.getElementById('batchAiSelectedBtn');
  if (aiSelectedBtn && !aiSelectedBtn._wired) {
    aiSelectedBtn._wired = true;
    aiSelectedBtn.addEventListener('click', () => {
      const selectedCount = this.selectedDatasetImageFilenames.size;
      if (selectedCount === 0) {
        this.showToast('Lütfen en az bir görsel seçin.', 'info');
        return;
      }
      const files = Array.from(this.selectedDatasetImageFilenames);
      this.showEditor(this.activeHubProjectId, true, 'all', files[0], files, null, 'Seçili Görseller');
    });
  }
}

  async renderHubSettings() {
  if (!this.activeHubProjectId) return;
  try {
    const res = await fetch(`/api/project-settings?category=${encodeURIComponent(this.activeHubProjectId)}`);
    if (res.ok) {
      this.currentHubMeta = await res.json();
    }
  } catch (err) {
    console.error('Project settings load error:', err);
  }
  if (!this.currentHubMeta) return;

  const nameEl = document.getElementById('hubSettingsDisplayName');
  if (nameEl) nameEl.value = this.currentHubMeta.display_name || '';

  const descEl = document.getElementById('hubSettingsDesc');
  if (descEl) descEl.value = this.currentHubMeta.description || '';

  const visEl = document.getElementById('hubSettingsVisibilitySelect');
  if (visEl) {
    visEl.value = (this.currentHubMeta.visibility || 'private').toLowerCase();
  }

  const modelEl = document.getElementById('hubSettingsModelSelect');
  if (modelEl && this.currentHubMeta.model_key) modelEl.value = this.currentHubMeta.model_key;

  const list = document.getElementById('hubSettingsClassesList');
  if (list) {
    list.innerHTML = '';
    const classes = (this.currentHubMeta.classes && this.currentHubMeta.classes.length > 0)
      ? this.currentHubMeta.classes
      : [{ id: 0, name: this.activeHubProjectId.replace('_', ' ').toUpperCase(), color: '#10b981', prompts: [this.activeHubProjectId.toLowerCase(), 'çanta', 'bag'] }];

    classes.forEach((c, idx) => {
      const row = document.createElement('div');
      row.className = 'cls-row-pill modern-cls-card';
      row.dataset.originalId = (c.id !== undefined) ? c.id : idx;
      row.style.cssText = 'display:flex; align-items:center; gap:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px 12px; transition:all 0.2s ease;';
      row.innerHTML = `
          <div class="cls-reorder-group" style="display:flex; align-items:center; gap:5px; width:68px;">
            <div class="cls-reorder-btns" style="display:flex; flex-direction:column; gap:2px;">
              <button type="button" class="btn-cls-up" title="Yukarı Taşı" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); color:#94a3b8; border-radius:4px; padding:2px 5px; font-size:0.62rem; cursor:pointer; line-height:1; display:flex; align-items:center; justify-content:center;">▲</button>
              <button type="button" class="btn-cls-down" title="Aşağı Taşı" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); color:#94a3b8; border-radius:4px; padding:2px 5px; font-size:0.62rem; cursor:pointer; line-height:1; display:flex; align-items:center; justify-content:center;">▼</button>
            </div>
            <div class="cls-badge-idx" style="flex:1; text-align:center; font-weight:800; font-size:0.8rem; color:#818cf8; background:rgba(129,140,248,0.1); border-radius:6px; padding:3px 0;">#${idx}</div>
          </div>
          <div class="cls-color-wrapper" style="width:38px; display:flex; justify-content:center;">
            <input type="color" class="cls-color-input hub-c-color" value="${c.color || '#3b82f6'}" title="Sınıf Rengi" style="width:28px; height:28px; border:none; border-radius:50%; cursor:pointer; background:none;">
          </div>
          <div class="cls-input-group" style="flex:1;">
            <input type="text" class="cls-name-input hub-c-name modern-input" value="${c.name || ''}" placeholder="Sınıf Adı (örn: çanta)" style="width:100%; padding:8px 12px; background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; font-size:0.88rem; outline:none;">
          </div>
          <div class="cls-input-group" style="flex:2;">
            <input type="text" class="cls-prompts-input hub-c-prompts modern-input" value="${(c.prompts || []).join(', ')}" placeholder="Yapay Zeka Anahtar Kelimeleri (örn: bag, handbag, backpack)" style="width:100%; padding:8px 12px; background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; font-size:0.88rem; outline:none;">
          </div>
          <button type="button" class="cls-del-btn hub-c-del" title="Sınıfı Sil" style="width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:none; border:none; color:#94a3b8; cursor:pointer; border-radius:8px; transition:all 0.15s ease;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
          </button>
        `;

      row.querySelector('.btn-cls-up')?.addEventListener('click', () => {
        const prev = row.previousElementSibling;
        if (prev) {
          list.insertBefore(row, prev);
          this.updateSettingsClassBadges();
        }
      });

      row.querySelector('.btn-cls-down')?.addEventListener('click', () => {
        const next = row.nextElementSibling;
        if (next) {
          list.insertBefore(next, row);
          this.updateSettingsClassBadges();
        }
      });

      row.querySelector('.hub-c-del')?.addEventListener('click', () => {
        if (list.children.length <= 1) {
          this.showToast('Projede en az 1 sınıf bulunmalıdır. Son sınıf silinemez!', 'warning');
          return;
        }
        row.remove();
        this.updateSettingsClassBadges();
      });
      list.appendChild(row);
    });
    this.updateSettingsClassBadges();

    // Add Class Button handler
    const addBtn = document.getElementById('hubSettingsAddClassBtn');
    if (addBtn && !addBtn._wired) {
      addBtn._wired = true;
      addBtn.addEventListener('click', () => {
        const newIdx = list.children.length;
        const defaultColors = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#f97316"];
        const newColor = defaultColors[newIdx % defaultColors.length];

        const newRow = document.createElement('div');
        newRow.className = 'cls-row-pill modern-cls-card';
        newRow.dataset.originalId = newIdx;
        newRow.style.cssText = 'display:flex; align-items:center; gap:12px; background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px 12px; transition:all 0.2s ease;';
        newRow.innerHTML = `
            <div class="cls-reorder-group" style="display:flex; align-items:center; gap:5px; width:68px;">
              <div class="cls-reorder-btns" style="display:flex; flex-direction:column; gap:2px;">
                <button type="button" class="btn-cls-up" title="Yukarı Taşı" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); color:#94a3b8; border-radius:4px; padding:2px 5px; font-size:0.62rem; cursor:pointer; line-height:1; display:flex; align-items:center; justify-content:center;">▲</button>
                <button type="button" class="btn-cls-down" title="Aşağı Taşı" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); color:#94a3b8; border-radius:4px; padding:2px 5px; font-size:0.62rem; cursor:pointer; line-height:1; display:flex; align-items:center; justify-content:center;">▼</button>
              </div>
              <div class="cls-badge-idx" style="flex:1; text-align:center; font-weight:800; font-size:0.8rem; color:#818cf8; background:rgba(129,140,248,0.1); border-radius:6px; padding:3px 0;">#${newIdx}</div>
            </div>
            <div class="cls-color-wrapper" style="width:38px; display:flex; justify-content:center;">
              <input type="color" class="cls-color-input hub-c-color" value="${newColor}" title="Sınıf Rengi" style="width:28px; height:28px; border:none; border-radius:50%; cursor:pointer; background:none;">
            </div>
            <div class="cls-input-group" style="flex:1;">
              <input type="text" class="cls-name-input hub-c-name modern-input" placeholder="Sınıf Adı (örn: etiket)" style="width:100%; padding:8px 12px; background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; font-size:0.88rem; outline:none;">
            </div>
            <div class="cls-input-group" style="flex:2;">
              <input type="text" class="cls-prompts-input hub-c-prompts modern-input" placeholder="Yapay Zeka Anahtar Kelimeleri (virgülle ayırın)" style="width:100%; padding:8px 12px; background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.1); border-radius:8px; color:#fff; font-size:0.88rem; outline:none;">
            </div>
            <button type="button" class="cls-del-btn hub-c-del" title="Sınıfı Sil" style="width:36px; height:36px; display:flex; align-items:center; justify-content:center; background:none; border:none; color:#94a3b8; cursor:pointer; border-radius:8px; transition:all 0.15s ease;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path></svg>
            </button>
          `;

        newRow.querySelector('.btn-cls-up')?.addEventListener('click', () => {
          const prev = newRow.previousElementSibling;
          if (prev) {
            list.insertBefore(newRow, prev);
            this.updateSettingsClassBadges();
          }
        });

        newRow.querySelector('.btn-cls-down')?.addEventListener('click', () => {
          const next = newRow.nextElementSibling;
          if (next) {
            list.insertBefore(next, newRow);
            this.updateSettingsClassBadges();
          }
        });

        newRow.querySelector('.hub-c-del')?.addEventListener('click', () => {
          if (list.children.length <= 1) {
            this.showToast('Projede en az 1 sınıf bulunmalıdır. Son sınıf silinemez!', 'warning');
            return;
          }
          newRow.remove();
          this.updateSettingsClassBadges();
        });
        list.appendChild(newRow);
        this.updateSettingsClassBadges();
        newRow.querySelector('.hub-c-name')?.focus();
      });
    }
  }
}

updateSettingsClassBadges() {
  const list = document.getElementById('hubSettingsClassesList');
  if (!list) return;
  const badge = document.getElementById('hubSettingsClassCountBadge');
  const count = list.children.length;
  if (badge) badge.textContent = `${count} Sınıf`;

  Array.from(list.children).forEach((row, idx) => {
    const idxEl = row.querySelector('.cls-badge-idx');
    if (idxEl) idxEl.textContent = `#${idx}`;

    const btnUp = row.querySelector('.btn-cls-up');
    const btnDown = row.querySelector('.btn-cls-down');

    if (btnUp) {
      if (idx === 0) {
        btnUp.style.opacity = '0.25';
        btnUp.style.cursor = 'not-allowed';
        btnUp.disabled = true;
      } else {
        btnUp.style.opacity = '1';
        btnUp.style.cursor = 'pointer';
        btnUp.disabled = false;
      }
    }

    if (btnDown) {
      if (idx === count - 1) {
        btnDown.style.opacity = '0.25';
        btnDown.style.cursor = 'not-allowed';
        btnDown.disabled = true;
      } else {
        btnDown.style.opacity = '1';
        btnDown.style.cursor = 'pointer';
        btnDown.disabled = false;
      }
    }

    const delBtn = row.querySelector('.hub-c-del');
    if (delBtn) {
      if (count <= 1) {
        delBtn.style.opacity = '0.35';
        delBtn.style.cursor = 'not-allowed';
        delBtn.title = 'En az 1 sınıf kalmalıdır (Silinemez)';
      } else {
        delBtn.style.opacity = '1';
        delBtn.style.cursor = 'pointer';
        delBtn.title = 'Sınıfı Sil';
      }
    }
  });
}

setupTrainingStudio() {
  // 0. Smart Hardware Detection & Dynamic Dataset Counts
  this.loadTrainingHardwareRecommendation();

  // 1. Model variant card selection
  const cards = document.querySelectorAll('#modelArchCardsContainer .model-arch-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => {
        c.classList.remove('selected');
        c.style.borderColor = 'rgba(255,255,255,0.1)';
        c.style.background = 'rgba(255,255,255,0.02)';
      });
      card.classList.add('selected');
      card.style.borderColor = '#3b82f6';
      card.style.background = 'rgba(59,130,246,0.12)';
    });
  });

  // Architecture family changer updates card texts
  document.getElementById('trainModelFamilySelect')?.addEventListener('change', (e) => {
    const fam = e.target.value;
    const cardTitles = document.querySelectorAll('#modelArchCardsContainer .arch-card-title');
    if (fam === 'rtdetr') {
      if (cardTitles[0]) cardTitles[0].textContent = 'RT-DETR-L (Large)';
      if (cardTitles[1]) cardTitles[1].textContent = 'RT-DETR-x (X-Large)';
      if (cardTitles[2]) cardTitles[2].textContent = 'RT-DETR-v2 (Medium)';
      if (cardTitles[3]) cardTitles[3].textContent = 'RT-DETR-ResNet50';
    } else if (fam === 'yolo11') {
      if (cardTitles[0]) cardTitles[0].textContent = 'YOLO11 Nano (11n)';
      if (cardTitles[1]) cardTitles[1].textContent = 'YOLO11 Small (11s)';
      if (cardTitles[2]) cardTitles[2].textContent = 'YOLO11 Medium (11m)';
      if (cardTitles[3]) cardTitles[3].textContent = 'YOLO11 X-Large (11x)';
    } else {
      if (cardTitles[0]) cardTitles[0].textContent = 'Nano Model (n)';
      if (cardTitles[1]) cardTitles[1].textContent = 'Small Model (s)';
      if (cardTitles[2]) cardTitles[2].textContent = 'Medium Model (m)';
      if (cardTitles[3]) cardTitles[3].textContent = 'Large / X-Large (x)';
    }
  });

  // 2. Batch size option pills
  const batchBtns = document.querySelectorAll('.batch-opt-btn');
  batchBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      batchBtns.forEach(b => {
        b.classList.remove('active');
        b.style.borderColor = 'rgba(255,255,255,0.1)';
        b.style.background = 'rgba(255,255,255,0.03)';
        b.style.color = '#94a3b8';
      });
      btn.classList.add('active');
      btn.style.borderColor = 'rgba(59,130,246,0.5)';
      btn.style.background = 'rgba(59,130,246,0.15)';
      btn.style.color = '#60a5fa';
    });
  });

  // 3. Clear log console
  document.getElementById('clearTrainLogBtn')?.addEventListener('click', () => {
    const consoleEl = document.getElementById('trainTerminalLogConsole');
    if (consoleEl) consoleEl.innerHTML = '<span style="color:#64748b;">[*] Konsol temizlendi.</span>';
  });

  // 4. Start / Stop Training
  const trainBtn = document.getElementById('executeModelTrainBtn');
  if (!trainBtn) return;

  let isTrainingActive = false;
  let pollInterval = null;

  trainBtn.addEventListener('click', async () => {
    const projId = this.activeHubProjectId || 'bag_detection_project';

    if (isTrainingActive) {
      // Stop training
      await fetch('/api/train/stop', {
        method: 'POST',
        headers: this.getAuthHeaders()
      });
      trainBtn.textContent = 'Model Eğitimini Başlat & Metrikleri Takip Et';
      trainBtn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
      isTrainingActive = false;
      if (pollInterval) clearInterval(pollInterval);
      return;
    }

    // Collect config
    const selectedModelCard = document.querySelector('#modelArchCardsContainer .model-arch-card.selected');
    const variant = selectedModelCard?.dataset.model || 'small';
    const family = document.getElementById('trainModelFamilySelect')?.value || 'yolov8';
    const modelKey = `${family}${variant[0]}`; // e.g. yolov8s

    const epochs = parseInt(document.getElementById('trainEpochRange')?.value || '50', 10);
    const activeBatchBtn = document.querySelector('.batch-opt-btn.active');
    const batchSize = activeBatchBtn?.dataset.batch || 'auto';
    const imgsz = parseInt(document.getElementById('trainImgszSelect')?.value || '640', 10);
    const optimizer = document.getElementById('trainOptimizerSelect')?.value || 'auto';

    try {
      const res = await fetch('/api/train/start', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          project: projId,
          model: modelKey,
          epochs: epochs,
          batch_size: batchSize,
          imgsz: imgsz,
          optimizer: optimizer
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        isTrainingActive = true;
        trainBtn.textContent = 'Eğitimi Durdur (Cancel Training)';
        trainBtn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';

        const badge = document.getElementById('trainStatusBadge');
        if (badge) {
          badge.textContent = 'Eğitiliyor...';
          badge.style.background = 'rgba(59,130,246,0.2)';
          badge.style.color = '#60a5fa';
        }

        // Start polling live metrics
        pollInterval = setInterval(async () => {
          try {
            const stRes = await fetch('/api/train/status', {
              headers: this.getAuthHeaders()
            });
            const st = await stRes.json();

            // Update metrics
            const m50 = document.getElementById('metricMap50');
            const m5095 = document.getElementById('metricMap5095');
            const bLoss = document.getElementById('metricBoxLoss');
            const cLoss = document.getElementById('metricClsLoss');
            if (m50) m50.textContent = `%${st.map50 || 0}`;
            if (m5095) m5095.textContent = `%${st.map5095 || 0}`;
            if (bLoss) bLoss.textContent = st.box_loss || '--';
            if (cLoss) cLoss.textContent = st.cls_loss || '--';

            // Progress bar
            const pct = st.total_epochs > 0 ? Math.round((st.epoch / st.total_epochs) * 100) : 0;
            const fill = document.getElementById('trainProgressBarFill');
            const progTxt = document.getElementById('trainEpochProgressTxt');
            const pctTxt = document.getElementById('trainPctTxt');
            if (fill) fill.style.width = `${pct}%`;
            if (progTxt) progTxt.textContent = `İlerleme: Epoch ${st.epoch} / ${st.total_epochs}`;
            if (pctTxt) pctTxt.textContent = `%${pct}`;

            // Terminal Logs
            const consoleEl = document.getElementById('trainTerminalLogConsole');
            if (consoleEl && st.logs) {
              consoleEl.innerHTML = st.logs.map(line => {
                let color = '#e2e8f0';
                if (line.includes('[*]')) color = '#38bdf8';
                else if (line.includes('[✓]')) color = '#34d399';
                else if (line.includes('[!]')) color = '#f87171';
                return `<span style="color:${color};">${line}</span>`;
              }).join('');
              consoleEl.scrollTop = consoleEl.scrollHeight;
            }

            if (st.status === 'completed') {
              clearInterval(pollInterval);
              isTrainingActive = false;
              trainBtn.textContent = 'Model Eğitimini Başlat & Metrikleri Takip Et';
              trainBtn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
              if (badge) {
                badge.textContent = 'Tamamlandı';
                badge.style.background = 'rgba(16,185,129,0.2)';
                badge.style.color = '#34d399';
              }
              this.showToast('Model eğitimi başarıyla tamamlandı! En iyi ağırlık kaydedildi.', 'success');
            } else if (st.status === 'idle') {
              clearInterval(pollInterval);
              isTrainingActive = false;
              trainBtn.textContent = 'Model Eğitimini Başlat & Metrikleri Takip Et';
              trainBtn.style.background = 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)';
            }
          } catch (err) {
            console.error('Training status poll error:', err);
          }
        }, 1000);
      } else {
        this.showToast(data.message || 'Eğitim başlatılamadı.', 'error');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Eğitim servisiyle bağlantı kurulamadı.', 'error');
    }
  });
}

  async loadTrainingHardwareRecommendation() {
  const cat = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || (this.projects && this.projects[0] ? this.projects[0].id : 'bag_detection_project');
  try {
    const res = await fetch(`/api/system/hardware-recommendation?category=${encodeURIComponent(cat)}`, {
      headers: this.getAuthHeaders()
    });
    if (!res.ok) return;
    const data = await res.json();

    // 1. Update Hardware Badge in Header
    const hwBadge = document.getElementById('trainDeviceBadge');
    if (hwBadge && data.hardware_badge) {
      hwBadge.textContent = data.hardware_badge.replace('Donanım: ', '');
    }

    // 2. Update Smart Recommendation Banner
    const recTitle = document.getElementById('hardwareRecTitle');
    const recDesc = document.getElementById('hardwareRecDesc');
    if (recTitle) recTitle.textContent = `Donanımınıza Göre Önerilen Model: ${data.recommended_model_name}`;
    if (recDesc) recDesc.textContent = data.recommendation_reason;

    // 3. Update Dataset Options dynamically (Fixing 93 Görsel hardcoded issue)
    const optAll = document.getElementById('optDatasetAll');
    const optApp = document.getElementById('optDatasetApproved');
    const tot = data.project_total_images || 0;
    const app = data.project_approved_images || 0;
    if (optAll) optAll.textContent = `Tüm Proje Veri Seti (${tot.toLocaleString()} Görsel)`;
    if (optApp) optApp.textContent = `Sadece Onaylı Yığınlar (${app.toLocaleString()} Görsel)`;

    // 4. Automatically select recommended variant card & architecture
    const famSelect = document.getElementById('trainModelFamilySelect');
    if (famSelect && data.recommended_family) {
      famSelect.value = data.recommended_family;
    }

    const cards = document.querySelectorAll('#modelArchCardsContainer .model-arch-card');
    cards.forEach(c => {
      c.classList.remove('selected');
      c.style.borderColor = 'rgba(255,255,255,0.1)';
      c.style.background = 'rgba(255,255,255,0.02)';
      const oldTag = c.querySelector('.hw-rec-tag');
      if (oldTag) oldTag.remove();
    });

    const targetVariant = data.recommended_variant || 'nano';
    const recCard = document.querySelector(`#modelArchCardsContainer .model-arch-card[data-model="${targetVariant}"]`);
    if (recCard) {
      recCard.classList.add('selected');
      recCard.style.borderColor = '#3b82f6';
      recCard.style.background = 'rgba(59,130,246,0.08)';

      const tag = document.createElement('span');
      tag.className = 'hw-rec-tag';
      tag.textContent = 'ÖNERİLEN';
      tag.style.cssText = 'font-size:0.65rem; background:rgba(56,189,248,0.15); color:#38bdf8; font-weight:700; padding:1px 6px; border-radius:4px; margin-left:6px; border:1px solid rgba(56,189,248,0.25);';
      recCard.querySelector('.arch-card-title')?.appendChild(tag);
    }

  } catch (err) {
    console.error('Failed to load hardware recommendation:', err);
  }
}

setupExportStudio() {
  // 1. Export Format Selection cards
  const fmtCards = document.querySelectorAll('.export-format-card');
  const augSection = document.getElementById('augOptionsSection');

  fmtCards.forEach(card => {
    card.addEventListener('click', () => {
      fmtCards.forEach(c => {
        c.classList.remove('selected');
        c.style.borderColor = 'rgba(255,255,255,0.1)';
        c.style.background = 'rgba(255,255,255,0.03)';
      });
      card.classList.add('selected');
      card.style.borderColor = '#3b82f6';
      card.style.background = 'rgba(59,130,246,0.12)';

      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;

      const fmt = card.dataset.fmt;
      if (augSection) {
        augSection.style.display = (fmt === 'augmented') ? 'block' : 'none';
      }
      this.updateExportSummary();
    });
  });

  // 2. Scope Select Change
  document.getElementById('exportScopeSelect')?.addEventListener('change', () => {
    this.updateExportSummary();
  });

  // 3. Export Generation Button
  const genBtn = document.getElementById('generateFmtExportBtnPage');
  if (genBtn && !genBtn._wired) {
    genBtn._wired = true;
    genBtn.addEventListener('click', async () => {
      const projId = this.activeHubProjectId || 'bag_detection_project';
      const activeCard = document.querySelector('.export-format-card.selected');
      const fmt = activeCard?.dataset.fmt || 'yolo';
      const scope = document.getElementById('exportScopeSelect')?.value || 'all';

      const h1 = parseFloat(document.getElementById('fmtTriH1')?.style.left || '80') / 100;
      const h2 = parseFloat(document.getElementById('fmtTriH2')?.style.left || '100') / 100;
      const trainRatio = h1;
      const valRatio = Math.max(0, h2 - h1);
      const testRatio = Math.max(0, 1 - h2);

      genBtn.disabled = true;
      genBtn.textContent = 'ZIP Paketi Hazırlanıyor...';

      try {
        let endpoint = '/api/projects/export-zip';
        let payload = {
          category: projId,
          train_ratio: trainRatio,
          val_ratio: valRatio,
          test_ratio: testRatio,
          scope: scope
        };

        if (fmt === 'coco') {
          endpoint = '/api/projects/export-coco';
        } else if (fmt === 'voc') {
          endpoint = '/api/projects/export-voc';
        } else if (fmt === 'augmented') {
          endpoint = '/api/projects/export-augmented';
          const augCopies = parseInt(document.getElementById('augCopiesRange')?.value || '3', 10);
          const augTypes = Array.from(document.querySelectorAll('input[name="augType"]:checked')).map(cb => cb.value);
          payload.copies = augCopies;
          payload.aug_types = augTypes;
        }

        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('token') || localStorage.getItem('authToken') || this.authToken;
        if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

        const res = await fetch(endpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(payload)
        });

        let data = {};
        try {
          data = await res.json();
        } catch (jsonErr) {
          data = { detail: `Sunucu hatası (${res.status}): İşlem tamamlanamadı.` };
        }

        if (res.ok && (data.r2_download_url || data.download_url || data.zip_url || data.zip_file)) {
          const downloadUrl = data.r2_download_url || data.download_url || data.zip_url || `/api/download-export?file=${encodeURIComponent(data.zip_file)}`;
          const resContainer = document.getElementById('exportFmtResult');
          const msgSpan = document.getElementById('exportFmtResultMsg');
          const dlLink = document.getElementById('exportFmtDownloadLink');

          if (resContainer && dlLink) {
            resContainer.style.display = 'block';
            if (msgSpan) {
              msgSpan.textContent = `${data.total_exported || data.image_count || data.total_images || 'Tüm'} görsel ${fmt.toUpperCase()} formatında başarıyla paketlendi.`;
            }
            dlLink.href = downloadUrl;
            dlLink.download = `${projId}_${fmt}_dataset.zip`;
          }

          // Safe programmatic download
          const tempA = document.createElement('a');
          tempA.href = downloadUrl;
          tempA.download = `${projId}_${fmt}_dataset.zip`;
          document.body.appendChild(tempA);
          tempA.click();
          tempA.remove();

          this.showToast('ZIP paketi hazırlandı ve indirme başlatıldı! ✓', 'success');
        } else {
          this.showToast(data.detail || data.message || 'Dışa aktarma başarısız oldu.', 'error');
        }
      } catch (err) {
        console.error('Export error:', err);
        this.showToast(err.message || 'Dışa aktarma sırasında bir hata oluştu.', 'error');
      } finally {
        genBtn.disabled = false;
        genBtn.textContent = 'ZIP Paketini Oluştur ve İndir';
      }
    });
  }

  this.updateExportSummary();
}

updateExportSummary() {
  const images = this.currentHubImages || [];
  const totalCount = images.length;
  const labeledImgs = images.filter(i => i.has_label_file && i.box_count > 0);
  const labeledCount = labeledImgs.length;
  const totalBoxes = images.reduce((acc, img) => acc + (img.box_count || 0), 0);

  const scope = document.getElementById('exportScopeSelect')?.value || 'all';
  let targetCount = (scope === 'all_raw') ? totalCount : (labeledCount > 0 ? labeledCount : totalCount);

  // Update Scope Select Dropdown text
  const scopeSelect = document.getElementById('exportScopeSelect');
  if (scopeSelect && scopeSelect.options.length >= 3) {
    scopeSelect.options[0].textContent = `Tüm Etiketlenmiş Görseller (${labeledCount.toLocaleString()} Görsel)`;
    scopeSelect.options[1].textContent = `Sadece Tamamlanan Yığınlar (${labeledCount.toLocaleString()} Görsel)`;
    scopeSelect.options[2].textContent = `Tüm Proje Resimleri (${totalCount.toLocaleString()} Görsel)`;
  }

  // Split Calculations
  const h1 = parseFloat(document.getElementById('fmtTriH1')?.style.left || '80') / 100;
  const h2 = parseFloat(document.getElementById('fmtTriH2')?.style.left || '100') / 100;
  const trainPct = Math.round(h1 * 100);
  const valPct = Math.round((h2 - h1) * 100);
  const testPct = Math.round((1 - h2) * 100);

  const trainCount = Math.round(targetCount * (trainPct / 100));
  const testCount = Math.round(targetCount * (testPct / 100));
  const valCount = Math.max(0, targetCount - trainCount - testCount);

  const elTotal = document.getElementById('summaryTotalImgs');
  const elTrain = document.getElementById('summaryTrainImgs');
  const elVal = document.getElementById('summaryValImgs');
  const elTest = document.getElementById('summaryTestImgs');
  const elBoxes = document.getElementById('summaryTotalBoxes');

  if (elTotal) elTotal.textContent = `${targetCount.toLocaleString()} Görsel`;
  if (elTrain) elTrain.textContent = `${trainCount.toLocaleString()} Görsel (%${trainPct})`;
  if (elVal) elVal.textContent = `${valCount.toLocaleString()} Görsel (%${valPct})`;
  if (elTest) elTest.textContent = `${testCount.toLocaleString()} Görsel (%${testPct})`;
  if (elBoxes) elBoxes.textContent = `${totalBoxes.toLocaleString()} Adet`;
}

  async loadQualityAnalysis(force = false) {
    const cat = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'accessory_detection_project';
    if (!this.cachedQualityData) this.cachedQualityData = {};

    // Önbellekte varsa ve kullanıcı zorla yenileme istememişse doğrudan göster
    if (!force && this.cachedQualityData[cat]) {
      this.renderQualityAnalysisData(this.cachedQualityData[cat]);
      return;
    }

    const numEl = document.getElementById('pageQualityScoreNum');
    const titleEl = document.getElementById('pageQualityScoreTitle');
    const descEl = document.getElementById('pageQualityScoreDesc');
    const refreshBtn = document.getElementById('pageRefreshQualityBtn');

    if (!this.cachedQualityData[cat] || force) {
      if (numEl) numEl.textContent = '...';
      if (titleEl) titleEl.textContent = 'Analiz Ediliyor...';
      if (descEl) descEl.textContent = 'Veri setiniz analiz ediliyor, lütfen bekleyiniz.';
    }

    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.style.opacity = '0.65';
    }

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
      const headers = this.getAuthHeaders ? this.getAuthHeaders() : (token ? { 'Authorization': `Bearer ${token}` } : {});
      const res = await fetch(`/api/projects/quality-stats?category=${encodeURIComponent(cat)}${tokenQuery}`, { headers });
      if (!res.ok) throw new Error('Kalite verisi çekilemedi.');
      const data = await res.json();

      this.cachedQualityData[cat] = data;
      this.renderQualityAnalysisData(data);
    } catch (err) {
      console.error('Quality analysis load error:', err);
      if (titleEl) titleEl.textContent = 'Analiz Yapılamadı';
      if (descEl) descEl.textContent = 'Veri seti metrikleri çekilirken hata oluştu.';
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.style.opacity = '1';
      }
    }
  }

renderQualityAnalysisData(data) {
  const numEl = document.getElementById('pageQualityScoreNum');
  const circleEl = document.getElementById('pageQualityScoreCircle');
  const titleEl = document.getElementById('pageQualityScoreTitle');
  const descEl = document.getElementById('pageQualityScoreDesc');

  const score = data.quality_score ?? 0;
  if (numEl) numEl.textContent = `%${score}`;

  let color = '#ef4444';
  let title = 'Geliştirilmeli (Düşük Doluluk)';
  let desc = 'Veri setinizde etiketleme oranı düşüktür. Sağlıklı model eğitimi için daha fazla etiket önerilir.';

  if (score >= 70) {
    color = '#10b981';
    title = 'Yüksek Kaliteli Veri';
    desc = 'Veri setiniz etiket doluluk oranı ve sınıf dengesi açısından model eğitimine uygundur.';
  } else if (score >= 40) {
    color = '#f59e0b';
    title = 'Orta Kalite Veri';
    desc = 'Veri setiniz temel seviyede etiketlidir, sınıf dengesi ve etiket doluluğu artırılabilir.';
  }

  if (circleEl) {
    circleEl.style.borderColor = color;
    circleEl.style.background = `${color}18`;
  }
  if (numEl) numEl.style.color = color;
  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = desc;

  // KPI Numbers
  const qTot = document.getElementById('pageQTotalImages');
  const qLab = document.getElementById('pageQLabeledCount');
  const qBox = document.getElementById('pageQTotalBoxes');
  const qRat = document.getElementById('pageQLabelRatio');

  if (qTot) qTot.textContent = (data.total_images || 0).toLocaleString();
  if (qLab) qLab.textContent = `${(data.labeled_count || 0).toLocaleString()} (%${data.label_ratio_pct || 0})`;
  if (qBox) qBox.textContent = (data.total_boxes || 0).toLocaleString();
  const avgBoxPerImg = data.total_images > 0 ? ((data.total_boxes || 0) / data.total_images).toFixed(1) : '0.0';
  if (qRat) qRat.textContent = `${avgBoxPerImg} Kutu / Görsel`;

  // Warnings
  const warnCard = document.getElementById('pageQualityWarningsCard');
  const warnList = document.getElementById('pageQualityWarningsList');
  if (warnCard && warnList) {
    if (data.warnings && data.warnings.length > 0) {
      warnList.innerHTML = data.warnings.map(w => `
          <div style="display:flex; align-items:flex-start; gap:8px;">
            <span style="color:#ef4444; font-weight:700;">•</span>
            <span>${w}</span>
          </div>
        `).join('');
      warnCard.style.display = 'block';
    } else {
      warnCard.style.display = 'none';
    }
  }

  // Class Distribution
  const distChart = document.getElementById('pageClassDistChart');
  if (distChart) {
    if (data.class_distribution && data.class_distribution.length > 0) {
      distChart.innerHTML = data.class_distribution.map(c => `
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.86rem; color:#cbd5e1; margin-bottom:4px;">
              <span style="font-weight:600;">${c.name}</span>
              <strong style="color:#60a5fa;">${c.count.toLocaleString()} Kutu (%${c.pct})</strong>
            </div>
            <div style="width:100%; height:8px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
              <div style="width:${c.pct}%; height:100%; background:linear-gradient(90deg, #3b82f6, #60a5fa); border-radius:4px;"></div>
            </div>
          </div>
        `).join('');
    } else {
      distChart.innerHTML = `<span style="color:#94a3b8; font-size:0.86rem;">Henüz etiketlenmiş sınıf verisi bulunmuyor.</span>`;
    }
  }

  // Geometry Averages
  const avgAreaEl = document.getElementById('pageAvgBoxArea');
  const avgWEl = document.getElementById('pageAvgBoxW');
  const avgHEl = document.getElementById('pageAvgBoxH');
  if (avgAreaEl) avgAreaEl.textContent = `%${data.avg_box_area_pct || 0}`;
  if (avgWEl) avgWEl.textContent = `%${data.avg_box_w_pct || 0}`;
  if (avgHEl) avgHEl.textContent = `%${data.avg_box_h_pct || 0}`;
}

  async loadLabelingStats(force = false) {
    const cat = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'accessory_detection_project';
    if (!this.cachedStatsData) this.cachedStatsData = {};

    // Önbellekte varsa anında göster
    if (!force && this.cachedStatsData[cat]) {
      this.renderLabelingStatsData(this.cachedStatsData[cat]);
      return;
    }

    const refreshBtn = document.getElementById('pageRefreshStatsBtn');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.style.opacity = '0.65';
    }

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
      const headers = this.getAuthHeaders ? this.getAuthHeaders() : (token ? { 'Authorization': `Bearer ${token}` } : {});
      const res = await fetch(`/api/projects/labeling-stats?category=${encodeURIComponent(cat)}${tokenQuery}`, { headers });
      if (!res.ok) throw new Error('İstatistikler alınamadı.');
      const data = await res.json();
      this.cachedStatsData[cat] = data; // Önbelleğe kaydet
      this.renderLabelingStatsData(data);
    } catch (err) {
      console.error('Labeling stats load error:', err);
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.style.opacity = '1';
      }
    }
  }

renderLabelingStatsData(data) {
  const pct = data.completion_pct ?? 0;
  const pctEl = document.getElementById('pageStatsCompletionPct');
  const barEl = document.getElementById('pageStatsProgressBar');
  if (pctEl) pctEl.textContent = `%${pct} Tamamlandı`;
  if (barEl) barEl.style.width = `${pct}%`;

  const labEl = document.getElementById('pageStatLabeled');
  const unlabEl = document.getElementById('pageStatUnlabeled');
  const boxEl = document.getElementById('pageStatTotalBoxes');
  const avgBoxEl = document.getElementById('pageStatAvgBoxes');

  if (labEl) labEl.textContent = (data.labeled || 0).toLocaleString();
  if (unlabEl) unlabEl.textContent = (data.unlabeled || 0).toLocaleString();
  if (boxEl) boxEl.textContent = (data.total_boxes || 0).toLocaleString();
  if (avgBoxEl) avgBoxEl.textContent = (data.avg_boxes_per_image || 0).toString();

  // Recent Activity
  const actList = document.getElementById('pageRecentActivityList');
  if (actList) {
    if (data.recent_activity && data.recent_activity.length > 0) {
      actList.innerHTML = data.recent_activity.map(a => `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:10px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
              <div>
                <strong style="color:#f8fafc; font-size:0.88rem; display:block;">${a.filename}</strong>
                <span style="font-size:0.78rem; color:#94a3b8;">${a.box_count} adet bounding box etiketlendi</span>
              </div>
            </div>
            <span style="font-size:0.8rem; color:#64748b; font-weight:500;">${a.time_ago}</span>
          </div>
        `).join('');
    } else {
      actList.innerHTML = `
          <div style="text-align:center; padding:24px; color:#64748b; font-size:0.88rem;">
            Bu projede henüz kaydedilmiş bir etiketleme aktivitesi bulunmuyor.
          </div>
        `;
    }
  }
}

  async loadReviewQueue() {
  const cat = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'bag_detection_project';
  const queueCountEl = document.getElementById('pageRqQueueCount');
  const approvedCountEl = document.getElementById('pageRqApprovedCount');
  const rejectedCountEl = document.getElementById('pageRqRejectedCount');
  const queueCountSubEl = document.getElementById('pageRqQueueCountSub');
  const container = document.getElementById('pageReviewQueueContainer');

  if (container) container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:#94a3b8;">İnceleme kuyruğu taranıyor...</div>';

  try {
    const res = await fetch(`/api/projects/review-queue?category=${encodeURIComponent(cat)}`, {
      headers: this.getAuthHeaders()
    });
    if (!res.ok) throw new Error('İnceleme kuyruğu alınamadı.');
    const data = await res.json();

    if (queueCountEl) queueCountEl.textContent = `${(data.queue_count || 0).toLocaleString()} Görsel`;
    if (approvedCountEl) approvedCountEl.textContent = `${(data.approved || 0).toLocaleString()} Görsel`;
    if (rejectedCountEl) rejectedCountEl.textContent = `${(data.rejected || 0).toLocaleString()} Görsel`;
    if (queueCountSubEl) queueCountSubEl.textContent = `${data.queue_count || 0} görsel doğrulama bekliyor`;

    if (!container) return;

    if (!data.queue || data.queue.length === 0) {
      container.innerHTML = `
          <div style="grid-column:1/-1; text-align:center; padding:48px 20px; background:rgba(16,185,129,0.06); border:1px dashed rgba(16,185,129,0.3); border-radius:14px;">
            <div style="width:52px; height:52px; border-radius:50%; background:rgba(16,185,129,0.15); color:#34d399; display:flex; align-items:center; justify-content:center; margin:0 auto 14px; font-size:1.6rem;">✓</div>
            <strong style="color:#f8fafc; font-size:1.1rem; display:block; margin-bottom:6px;">Tüm Etiketler İncelendi ve Doğrulandı</strong>
            <span style="color:#94a3b8; font-size:0.86rem;">Şu anda onay bekleyen veya şüpheli işaretlenmiş bir görsel bulunmuyor.</span>
          </div>
        `;
      return;
    }

    container.innerHTML = '';
    data.queue.forEach(item => {
      const card = document.createElement('div');
      card.className = 'review-item-card';
      card.style.cssText = 'background:rgba(15,23,42,0.9); border:1px solid rgba(255,255,255,0.1); border-radius:14px; overflow:hidden; display:flex; flex-direction:column; transition:transform 0.2s, border-color 0.2s;';

      const imgSrc = `/api/preview-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(item.filename)}`;

      card.innerHTML = `
          <div style="position:relative; aspect-ratio:4/3; background:#000; overflow:hidden;">
            <img src="${imgSrc}" loading="lazy" style="width:100%; height:100%; object-fit:cover;" onerror="this.src='/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(item.filename)}'">
            <div style="position:absolute; top:8px; right:8px; background:rgba(15,23,42,0.85); color:#60a5fa; font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px; backdrop-filter:blur(6px); border:1px solid rgba(255,255,255,0.1);">
              ${item.box_count} Kutu
            </div>
          </div>
          <div style="padding:14px; display:flex; flex-direction:column; gap:10px; flex:1;">
            <div>
              <strong style="color:#f8fafc; font-size:0.88rem; display:block; word-break:break-all;" title="${item.filename}">${item.filename}</strong>
              <span style="font-size:0.75rem; color:#f59e0b;">${item.note || 'İnceleme bekliyor'}</span>
            </div>
            <div style="margin-top:auto; display:flex; gap:8px; border-top:1px solid rgba(255,255,255,0.06); padding-top:10px;">
              <button class="rq-approve-btn btn-primary" style="flex:1; padding:7px 10px; font-size:0.8rem; font-weight:700; background:#10b981; justify-content:center;">
                ✓ Onayla
              </button>
              <button class="rq-reject-btn btn-secondary" style="flex:1; padding:7px 10px; font-size:0.8rem; font-weight:700; color:#ef4444; border-color:rgba(239,68,68,0.4); justify-content:center;">
                ✗ Reddet
              </button>
              <button class="rq-edit-btn btn-secondary" style="padding:7px 10px; font-size:0.8rem; justify-content:center;" title="Editörde Aç">
                ✏️
              </button>
            </div>
          </div>
        `;

      // Approve action
      card.querySelector('.rq-approve-btn')?.addEventListener('click', async () => {
        await this.markReviewItem(cat, item.filename, 'approved');
        card.style.opacity = '0.4';
        card.style.pointerEvents = 'none';
        setTimeout(() => card.remove(), 300);
      });

      // Reject action
      card.querySelector('.rq-reject-btn')?.addEventListener('click', async () => {
        await this.markReviewItem(cat, item.filename, 'rejected', 'Kullanıcı tarafından reddedildi');
        card.style.opacity = '0.4';
        card.style.pointerEvents = 'none';
        setTimeout(() => card.remove(), 300);
      });

      // Edit action
      card.querySelector('.rq-edit-btn')?.addEventListener('click', () => {
        this.showEditor(cat, true, 'all', item.filename);
      });

      container.appendChild(card);
    });

  } catch (err) {
    console.error('Review queue load error:', err);
    if (container) container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:30px; color:#ef4444;">İnceleme kuyruğu yüklenirken hata oluştu.</div>';
  }
}

  async markReviewItem(category, filename, status, note = '') {
  try {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || localStorage.getItem('yolo_auth_token') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/projects/mark-review', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ category, filename, status, note })
    });
    if (res.ok) {
      this.showToast(`Görsel ${status === 'approved' ? 'onaylandı ✓' : 'reddedildi ✗'}.`, 'success');
      // Update counters
      const qEl = document.getElementById('pageRqQueueCount');
      const appEl = document.getElementById('pageRqApprovedCount');
      const rejEl = document.getElementById('pageRqRejectedCount');
      if (qEl) {
        const curQ = Math.max(0, parseInt(qEl.textContent) - 1);
        qEl.textContent = `${curQ.toLocaleString()} Görsel`;
      }
      if (status === 'approved' && appEl) {
        const curA = parseInt(appEl.textContent) + 1;
        appEl.textContent = `${curA.toLocaleString()} Görsel`;
      } else if (status === 'rejected' && rejEl) {
        const curR = parseInt(rejEl.textContent) + 1;
        rejEl.textContent = `${curR.toLocaleString()} Görsel`;
      }
    }
  } catch (err) {
    console.error('Mark review error:', err);
  }
}

  async runDuplicateScan(force = true) {
  const cat = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'accessory_detection_project';
  if (!this.cachedDuplicateData) this.cachedDuplicateData = {};

  // Sadece force false ise ve önbellek varsa kullan
  if (!force && this.cachedDuplicateData[cat]) {
    this.renderDuplicateScanData(cat, this.cachedDuplicateData[cat]);
    return;
  }

  const totalEl = document.getElementById('dupScannedTotal');
  const countEl = document.getElementById('dupFoundCount');
  const riskEl = document.getElementById('dupRiskLevel');
  const contentEl = document.getElementById('dupResultContent');
  const btn = document.getElementById('scanDuplicatesBtn');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner" style="width:14px; height:14px; border-width:2px; display:inline-block; margin-right:6px;"></span> Taranıyor...`;
  }
  if (contentEl && !this.cachedDuplicateData[cat]) {
    contentEl.innerHTML = '<div style="color:#94a3b8; padding:30px;">Tüm görseller Perceptual Hash ve MD5 algoritmalarıyla taranıyor...</div>';
  }

  try {
    const res = await fetch(`/api/projects/scan-duplicates?category=${encodeURIComponent(cat)}`, {
      headers: this.getAuthHeaders()
    });
    if (!res.ok) throw new Error('Kopya taraması başarısız oldu.');
    const data = await res.json();
    this.cachedDuplicateData[cat] = data; // Önbelleğe al
    this.renderDuplicateScanData(cat, data);
  } catch (err) {
    console.error('Duplicate scan error:', err);
    if (contentEl) contentEl.innerHTML = '<div style="color:#ef4444; padding:30px;">Kopya taraması sırasında hata oluştu.</div>';
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg> <span>Yeniden Tara</span>`;
    }
  }
}

  renderDuplicateScanData(cat, data) {
    const totalEl = document.getElementById('dupScannedTotal');
    const countEl = document.getElementById('dupFoundCount');
    const riskEl = document.getElementById('dupRiskLevel');
    const contentEl = document.getElementById('dupResultContent');

    const totalScanned = data.total_images || 0;
    const dupCount = data.duplicate_count || 0;

    if (totalEl) totalEl.textContent = `${totalScanned.toLocaleString()} Görsel`;
    if (countEl) countEl.textContent = `${dupCount.toLocaleString()} Kopya`;

    if (riskEl) {
      if (dupCount === 0) {
        riskEl.textContent = 'Çok Düşük - Güvenli';
        riskEl.style.color = '#34d399';
      } else if (dupCount <= 10) {
        riskEl.textContent = 'Orta Risk';
        riskEl.style.color = '#f59e0b';
      } else {
        riskEl.textContent = 'Yüksek Overfitting Riski';
        riskEl.style.color = '#ef4444';
      }
    }

    if (!contentEl) return;

    if (dupCount === 0) {
      contentEl.innerHTML = `
        <div style="text-align:center; padding:48px 20px;">
          <div style="width:64px; height:64px; border-radius:50%; background:rgba(16,185,129,0.15); color:#34d399; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:2rem;">✓</div>
          <strong style="color:#34d399; font-size:1.25rem; display:block; margin-bottom:8px;">0 Mükerrer Görsel Bulundu</strong>
          <p style="color:#94a3b8; font-size:0.92rem; max-width:540px; margin:0 auto; line-height:1.6;">
            Veri setinizdeki taranan tüm <strong>${totalScanned.toLocaleString()}</strong> görsel benzersizdir. Modelinizin ezberlemesini tetikleyecek herhangi bir kopya veya aşırı örtüşen görsel bulunmuyor.
          </p>
        </div>
      `;
      return;
    }

    const displayedGroups = data.duplicate_groups.slice(0, 50);
    const remainingCount = data.duplicate_groups.length - displayedGroups.length;

    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const tokParam = token ? `&token=${encodeURIComponent(token)}` : '';

    this._currentDuplicateData = data;
    this._currentDuplicateCat = cat;

    const buildGroupHtml = (g, gIdx) => {
      const origUrl = `/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(g.original)}${tokParam}`;
      const simLabel = g.type === 'exact' ? 'Birebir Kopya' : 'Görsel Benzer';

      return `
        <div class="duplicate-group-card" data-group-index="${gIdx}" style="background:rgba(15,23,42,0.65); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:18px; transition:border-color 0.2s ease;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; flex-wrap:wrap; gap:10px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.86rem; font-weight:700; color:#e2e8f0; user-select:none;">
                <input type="checkbox" class="dup-group-select-all" data-group-idx="${gIdx}" style="accent-color:#38bdf8; width:16px; height:16px; cursor:pointer;">
                <span>Grup ${gIdx + 1}</span>
              </label>
              <span style="font-size:0.82rem; color:#94a3b8;">Orijinal <strong style="color:#38bdf8;">${g.original}</strong></span>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:0.75rem; background:rgba(239,68,68,0.15); color:#f87171; padding:4px 10px; border-radius:20px; font-weight:700; border:1px solid rgba(239,68,68,0.25);">
                %${g.similarity_pct} Benzerlik - ${simLabel}
              </span>
              <button class="btn-secondary dup-inspect-group-btn" data-group-idx="${gIdx}" data-dup-idx="0" style="padding:5px 12px; font-size:0.78rem; font-weight:600; border-radius:8px; display:flex; align-items:center; gap:5px; background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.25); cursor:pointer;">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <span>Yan Yana İncele</span>
              </button>
            </div>
          </div>

          <div class="duplicate-items-wrap" style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-start;">
            <!-- Orijinal Görsel Kartı -->
            <div class="duplicate-original-item" style="width:145px; background:#0f172a; border-radius:10px; overflow:hidden; border:2px solid #38bdf8; box-shadow:0 4px 14px rgba(56,189,248,0.15); display:flex; flex-direction:column;">
              <div style="position:relative; width:100%; aspect-ratio:1; background:#020617; overflow:hidden;">
                <div class="dup-img-placeholder" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:0.75rem;">
                  <span class="spinner" style="width:16px; height:16px; border-width:2px;"></span>
                </div>
                <img src="${origUrl}" style="position:relative; width:100%; height:100%; object-fit:cover; display:block; opacity:0; transition:opacity 0.25s ease;" onload="this.style.opacity='1'; const pl = this.previousElementSibling; if(pl) pl.style.display='none';" onerror="this.style.display='none'; const pl = this.previousElementSibling; if(pl){ pl.style.display='flex'; pl.innerHTML='<span style=\\'color:#ef4444; font-size:0.7rem; padding:4px; text-align:center;\\'>Görsel Yüklenemedi</span>'; }">
                <span style="position:absolute; top:6px; left:6px; background:#38bdf8; color:#0f172a; font-size:0.68rem; font-weight:800; padding:2px 7px; border-radius:4px; box-shadow:0 2px 6px rgba(0,0,0,0.4);">ORİJİNAL</span>
              </div>
              <div style="padding:6px 8px; font-size:0.73rem; color:#38bdf8; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; border-top:1px solid rgba(56,189,248,0.2);" title="${g.original}">${g.original}</div>
            </div>

            <!-- Kopya Görseller -->
            ${g.duplicates.map((dup, dIdx) => {
              const dupUrl = `/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(dup)}${tokParam}`;
              return `
                <div class="duplicate-single-item" data-filename="${dup}" style="width:145px; background:#0f172a; border-radius:10px; overflow:hidden; border:2px solid rgba(239,68,68,0.6); box-shadow:0 4px 14px rgba(239,68,68,0.12); display:flex; flex-direction:column; position:relative;">
                  <div style="position:relative; width:100%; aspect-ratio:1; background:#020617; overflow:hidden;">
                    <label style="position:absolute; top:6px; right:6px; z-index:4; background:rgba(15,23,42,0.85); border-radius:6px; padding:3px; display:flex; align-items:center; justify-content:center; cursor:pointer; border:1px solid rgba(255,255,255,0.15);">
                      <input type="checkbox" class="dup-select-checkbox" data-filename="${dup}" data-group-idx="${gIdx}" style="accent-color:#ef4444; width:15px; height:15px; cursor:pointer;">
                    </label>
                    <span style="position:absolute; top:6px; left:6px; z-index:3; background:#ef4444; color:#fff; font-size:0.68rem; font-weight:800; padding:2px 7px; border-radius:4px; box-shadow:0 2px 6px rgba(0,0,0,0.4);">KOPYA</span>
                    <div class="dup-img-placeholder" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:0.75rem;">
                      <span class="spinner" style="width:16px; height:16px; border-width:2px;"></span>
                    </div>
                    <img src="${dupUrl}" style="position:relative; width:100%; height:100%; object-fit:cover; display:block; opacity:0; transition:opacity 0.25s ease;" onload="this.style.opacity='1'; const pl = this.previousElementSibling; if(pl) pl.style.display='none';" onerror="this.style.display='none'; const pl = this.previousElementSibling; if(pl){ pl.style.display='flex'; pl.innerHTML='<span style=\\'color:#ef4444; font-size:0.7rem; padding:4px; text-align:center;\\'>Görsel Yüklenemedi</span>'; }">
                  </div>
                  <div style="padding:5px 8px; font-size:0.73rem; color:#f87171; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:600; border-top:1px solid rgba(239,68,68,0.2);" title="${dup}">${dup}</div>
                  <div style="display:flex; border-top:1px solid rgba(255,255,255,0.06);">
                    <button class="dup-inspect-btn" data-group-idx="${gIdx}" data-dup-idx="${dIdx}" style="flex:1; padding:6px 4px; font-size:0.72rem; color:#38bdf8; border:none; background:rgba(56,189,248,0.1); cursor:pointer; font-weight:600; transition:background 0.2s;" title="Orijinal ile yan yana karşılaştır">
                      İncele
                    </button>
                    <button class="dup-single-delete-btn" data-category="${cat}" data-filename="${dup}" style="flex:1; padding:6px 4px; font-size:0.72rem; color:#ef4444; border:none; border-left:1px solid rgba(255,255,255,0.06); background:rgba(239,68,68,0.12); cursor:pointer; font-weight:700; transition:background 0.2s;" title="Bu kopyayı kalıcı olarak sil">
                      Sil
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    contentEl.innerHTML = `
      <!-- Üst Eylem ve İstatistik Çubuğu -->
      <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(255,255,255,0.08); border-radius:14px; padding:16px 20px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:14px;">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:#ef4444;"></span>
            <strong style="color:#f87171; font-size:1.05rem;">Tespit Edilen Benzer ve Kopya Görsel Kümeleri - ${data.duplicate_groups.length} Grup</strong>
          </div>
          <p style="color:#94a3b8; font-size:0.85rem; margin-top:4px; margin-bottom:0;">
            Aşağıdaki görseller görsel olarak yüzde 90 üzeri oranda birbirine benzemektedir veya birebir kopyadır. Model doğruluğunu artırmak için kopyaları tek tek veya topluca silebilirsiniz.
          </p>
        </div>

        <!-- Toplu İşlem Düğmeleri -->
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <label style="display:flex; align-items:center; gap:6px; font-size:0.82rem; color:#cbd5e1; cursor:pointer; background:rgba(255,255,255,0.05); padding:7px 12px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); user-select:none;">
            <input type="checkbox" id="selectAllDuplicatesCb" style="accent-color:#38bdf8; width:16px; height:16px; cursor:pointer;">
            <span>Tümünü Seç</span>
          </label>

          <button id="deleteSelectedDuplicatesBtn" class="btn-danger" style="background:#ef4444; color:#fff; border:none; padding:8px 18px; border-radius:8px; font-size:0.84rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 4px 14px rgba(239,68,68,0.35); transition:all 0.2s ease;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            <span id="deleteSelectedBtnTxt">Tüm ${dupCount} Kopyayı Temizle</span>
          </button>
        </div>
      </div>

      <!-- Gruplar Listesi -->
      <div id="duplicateGroupsContainer" style="display:flex; flex-direction:column; gap:16px;">
        ${displayedGroups.map((g, gIdx) => buildGroupHtml(g, gIdx)).join('')}
      </div>

      ${remainingCount > 0 ? `
        <div style="text-align:center; margin-top:20px;">
          <button id="loadMoreDuplicatesBtn" class="btn-secondary" style="padding:10px 24px; font-size:0.85rem; font-weight:600; border-radius:8px;">
            Daha Fazla Göster - Kalan ${remainingCount}
          </button>
        </div>
      ` : ''}
    `;

    // Event Delegasyonu ve Dinleyiciler
    const updateSelectedDeleteButton = () => {
      const checkedBoxes = Array.from(document.querySelectorAll('.dup-select-checkbox:checked'));
      const delSelBtn = document.getElementById('deleteSelectedDuplicatesBtn');
      const delSelTxt = document.getElementById('deleteSelectedBtnTxt');
      const allCb = document.getElementById('selectAllDuplicatesCb');
      const totalVisibleBoxes = document.querySelectorAll('.dup-select-checkbox').length;

      if (!delSelBtn) return;

      if (totalVisibleBoxes === 0) {
        delSelBtn.disabled = true;
        delSelBtn.style.opacity = '0.5';
        delSelBtn.style.cursor = 'not-allowed';
        if (delSelTxt) delSelTxt.textContent = 'Kopya Yok';
        if (allCb) allCb.checked = false;
        return;
      }

      delSelBtn.disabled = false;
      delSelBtn.style.opacity = '1';
      delSelBtn.style.cursor = 'pointer';

      if (checkedBoxes.length > 0) {
        if (checkedBoxes.length === totalVisibleBoxes) {
          if (delSelTxt) delSelTxt.textContent = `Tüm Kopyaları Sil (${checkedBoxes.length})`;
        } else {
          if (delSelTxt) delSelTxt.textContent = `Seçilen ${checkedBoxes.length} Kopyayı Sil`;
        }
      } else {
        if (delSelTxt) delSelTxt.textContent = `Tüm Kopyaları Temizle (${totalVisibleBoxes})`;
      }

      if (allCb && totalVisibleBoxes > 0) {
        allCb.checked = checkedBoxes.length === totalVisibleBoxes;
        allCb.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < totalVisibleBoxes;
      }
    };

    // Tümünü Seç onay kutusu
    document.getElementById('selectAllDuplicatesCb')?.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll('.dup-select-checkbox').forEach(cb => { cb.checked = isChecked; });
      document.querySelectorAll('.dup-group-select-all').forEach(cb => { cb.checked = isChecked; });
      updateSelectedDeleteButton();
    });

    // Grup Bazında Tümünü Seç
    contentEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('dup-group-select-all')) {
        const groupCard = e.target.closest('.duplicate-group-card');
        if (groupCard) {
          groupCard.querySelectorAll('.dup-select-checkbox').forEach(cb => { cb.checked = e.target.checked; });
        }
        updateSelectedDeleteButton();
      } else if (e.target.classList.contains('dup-select-checkbox')) {
        const groupCard = e.target.closest('.duplicate-group-card');
        if (groupCard) {
          const groupBoxes = groupCard.querySelectorAll('.dup-select-checkbox');
          const groupChecked = groupCard.querySelectorAll('.dup-select-checkbox:checked');
          const groupHeaderCb = groupCard.querySelector('.dup-group-select-all');
          if (groupHeaderCb) {
            groupHeaderCb.checked = groupBoxes.length > 0 && groupChecked.length === groupBoxes.length;
            groupHeaderCb.indeterminate = groupChecked.length > 0 && groupChecked.length < groupBoxes.length;
          }
        }
        updateSelectedDeleteButton();
      }
    });

    // İnceleme modalı açma tıklamaları
    contentEl.addEventListener('click', (e) => {
      const inspectBtn = e.target.closest('.dup-inspect-btn, .dup-inspect-group-btn');
      if (inspectBtn) {
        const gIdx = parseInt(inspectBtn.dataset.groupIdx, 10);
        const dIdx = parseInt(inspectBtn.dataset.dupIdx || '0', 10);
        this.openDuplicateCompareModal(cat, gIdx, dIdx);
        return;
      }

      const delBtn = e.target.closest('.dup-single-delete-btn');
      if (delBtn) {
        const fn = delBtn.dataset.filename;
        const c = delBtn.dataset.category;
        this.deleteDuplicateFile(c, fn, delBtn);
      }
    });

    // Tekil ve Toplu Akıllı Kopya Silme Düğmesi
    document.getElementById('deleteSelectedDuplicatesBtn')?.addEventListener('click', async () => {
      const checkedBoxes = Array.from(document.querySelectorAll('.dup-select-checkbox:checked'));
      let filesToDelete = checkedBoxes.map(cb => cb.dataset.filename).filter(Boolean);

      // Eğer hiçbir kutu seçilmediyse buton 'Tüm Kopyaları Temizle' modundadır
      const totalAllDups = data.duplicate_groups.flatMap(g => g.duplicates);
      if (filesToDelete.length === 0) {
        filesToDelete = totalAllDups;
      }
      if (filesToDelete.length === 0) return;

      const isAll = (filesToDelete.length === totalAllDups.length);
      const actionTitle = isAll ? 'Tüm Kopyaları Temizle' : 'Seçilen Kopyaları Sil';
      const actionMessage = isAll
        ? `Tespit edilen ${filesToDelete.length} adet mükerrer kopya görsel ve etiket dosyaları kalıcı olarak silinecektir.\n\nBu işlem geri alınamaz. Devam etmek istiyor musunuz?`
        : `İşaretlenen ${filesToDelete.length} adet kopya görsel ve etiket dosyaları kalıcı olarak silinecektir.\n\nBu işlem geri alınamaz. Devam etmek istiyor musunuz?`;

      const confirmed = await this.showConfirm({
        title: actionTitle,
        subtitle: 'Kalıcı Kopya Temizliği',
        message: actionMessage,
        confirmText: isAll ? 'Evet, Tüm Kopyaları Sil' : 'Evet, Seçilenleri Sil',
        cancelText: 'Vazgeç',
        type: 'danger'
      });
      if (!confirmed) return;

      const btn = document.getElementById('deleteSelectedDuplicatesBtn');
      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner" style="width:14px; height:14px; border-width:2px; display:inline-block; margin-right:6px;"></span> Siliniyor...`;
      }

      // Net kullanıcı bilgilendirmesi ve çoklu tıklamayı engelleyen global yükleme ekranı
      this.showLoading(true, 'Kopya Görseller Temizleniyor...', `${filesToDelete.length} adet mükerrer dosya siliniyor, lütfen bekleyiniz...`);

      try {
        const res = await fetch('/api/projects/delete-duplicates-bulk', {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ category: cat, filenames: filesToDelete })
        });
        const resData = await res.json();
        if (res.ok && resData.status === 'ok') {
          const deletedCount = resData.deleted_count || filesToDelete.length;
          this.showToast(`${deletedCount} adet kopya görsel başarıyla temizlendi`, 'success');

          // Silinen öğeleri DOM'dan kaldır
          filesToDelete.forEach(fn => {
            const itemEl = document.querySelector(`.duplicate-single-item[data-filename="${fn}"]`);
            if (itemEl) {
              const groupCard = itemEl.closest('.duplicate-group-card');
              itemEl.remove();
              if (groupCard && groupCard.querySelectorAll('.duplicate-single-item').length === 0) {
                groupCard.remove();
              }
            }
          });

          // Güncel kopya sayısını ve sayacı tazele
          const currentTotalDups = document.querySelectorAll('.duplicate-single-item').length;
          if (countEl) countEl.textContent = `${currentTotalDups.toLocaleString()} Kopya`;
          if (totalEl && totalScanned) totalEl.textContent = `${(totalScanned - deletedCount).toLocaleString()} Görsel`;

          if (currentTotalDups === 0) {
            if (riskEl) {
              riskEl.textContent = 'Çok Düşük - Güvenli';
              riskEl.style.color = '#34d399';
            }
            contentEl.innerHTML = `
              <div style="text-align:center; padding:48px 20px;">
                <div style="width:64px; height:64px; border-radius:50%; background:rgba(16,185,129,0.15); color:#34d399; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:2rem;">✓</div>
                <strong style="color:#34d399; font-size:1.25rem; display:block; margin-bottom:8px;">Tüm Kopyalar Başarıyla Temizlendi</strong>
                <p style="color:#94a3b8; font-size:0.92rem; max-width:540px; margin:0 auto; line-height:1.6;">
                  Toplam <strong>${deletedCount.toLocaleString()}</strong> mükerrer dosya başarıyla silindi. Veri setinizdeki overfitting riski ortadan kaldırıldı.
                </p>
              </div>
            `;
          } else {
            updateSelectedDeleteButton();
          }

          this.cachedDuplicateData[cat] = null;
          try { await this.loadHubProjectData(); } catch (e) {}
        } else {
          this.showToast(resData.detail || 'Seçilen kopyalar silinemedi.', 'error');
          updateSelectedDeleteButton();
        }
      } catch (err) {
        console.error(err);
        this.showToast('Silme işlemi sırasında hata oluştu.', 'error');
        updateSelectedDeleteButton();
      } finally {
        this.showLoading(false);
      }
    });

    // Sayfalama (Daha Fazla Göster)
    if (remainingCount > 0) {
      let currentOffset = 50;
      document.getElementById('loadMoreDuplicatesBtn')?.addEventListener('click', (e) => {
        const nextBatch = data.duplicate_groups.slice(currentOffset, currentOffset + 50);
        const container = document.getElementById('duplicateGroupsContainer');
        if (container) {
          const html = nextBatch.map((g, idx) => buildGroupHtml(g, currentOffset + idx)).join('');
          container.insertAdjacentHTML('beforeend', html);
        }
        currentOffset += nextBatch.length;
        if (currentOffset >= data.duplicate_groups.length) {
          e.target.style.display = 'none';
        } else {
          e.target.textContent = `Daha Fazla Göster - Kalan ${data.duplicate_groups.length - currentOffset}`;
        }
        updateSelectedDeleteButton();
      });
    }
  }

  openDuplicateCompareModal(cat, groupIndex, dupIndex = 0) {
    const data = this._currentDuplicateData;
    if (!data || !data.duplicate_groups || !data.duplicate_groups[groupIndex]) return;

    const group = data.duplicate_groups[groupIndex];
    const original = group.original;
    const duplicates = group.duplicates || [];
    if (duplicates.length === 0) return;

    const activeDup = duplicates[dupIndex] || duplicates[0];
    const totalGroups = data.duplicate_groups.length;

    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const tokParam = token ? `&token=${encodeURIComponent(token)}` : '';

    const origUrl = `/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(original)}${tokParam}`;
    const dupUrl = `/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(activeDup)}${tokParam}`;

    let modalEl = document.getElementById('dupCompareModal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'dupCompareModal';
      modalEl.style.cssText = 'position:fixed; inset:0; z-index:99999; background:rgba(2,6,23,0.88); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; padding:20px;';
      document.body.appendChild(modalEl);
    }

    const simLabel = group.type === 'exact' ? 'Birebir Kopya' : 'Görsel Benzer';

    modalEl.innerHTML = `
      <div style="background:#0f172a; border:1px solid rgba(255,255,255,0.12); border-radius:18px; width:100%; max-width:1100px; max-height:92vh; display:flex; flex-direction:column; box-shadow:0 24px 60px rgba(0,0,0,0.6); overflow:hidden;">
        <!-- Modal Başlık Çubuğu -->
        <div style="padding:16px 24px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center; background:rgba(15,23,42,0.95);">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:36px; height:36px; border-radius:10px; background:rgba(56,189,248,0.15); color:#38bdf8; display:flex; align-items:center; justify-content:center; font-size:1.1rem;">🔍</div>
            <div>
              <strong style="color:#f8fafc; font-size:1.05rem; display:block;">Kopya Karşılaştırma ve İnceleme</strong>
              <span style="color:#94a3b8; font-size:0.8rem;">Grup ${groupIndex + 1} / ${totalGroups} - ${duplicates.length} adet kopya mevcut</span>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:0.8rem; background:rgba(239,68,68,0.15); color:#f87171; padding:5px 12px; border-radius:20px; font-weight:700; border:1px solid rgba(239,68,68,0.25);">
              %${group.similarity_pct} Benzerlik - ${simLabel}
            </span>
            <button id="closeDupCompareModalBtn" style="background:rgba(255,255,255,0.06); border:none; color:#cbd5e1; width:34px; height:34px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; font-size:1.2rem; transition:all 0.2s;">✕</button>
          </div>
        </div>

        <!-- Yan Yana Karşılaştırma Alanı -->
        <div style="padding:24px; overflow-y:auto; display:grid; grid-template-columns:1fr 1fr; gap:24px; flex:1; align-items:center;">
          <!-- Sol Panel: Orijinal -->
          <div style="background:#020617; border-radius:14px; padding:16px; border:2px solid #38bdf8; display:flex; flex-direction:column; gap:12px; height:100%; justify-content:space-between;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="background:#38bdf8; color:#0f172a; font-size:0.75rem; font-weight:800; padding:4px 10px; border-radius:6px;">ORİJİNAL GÖRSEL</span>
              <span id="origDimBadge" style="font-size:0.75rem; color:#64748b; font-family:monospace;">Çözünürlük alınıyor...</span>
            </div>
            <div style="position:relative; width:100%; aspect-ratio:4/3; background:#000; border-radius:10px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
              <img id="modalOrigImg" src="${origUrl}" style="max-width:100%; max-height:100%; object-fit:contain; display:block;" onload="document.getElementById('origDimBadge').textContent = this.naturalWidth + ' x ' + this.naturalHeight + ' px';">
            </div>
            <div style="background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
              <span style="color:#64748b; font-size:0.75rem; display:block;">Dosya Adı</span>
              <strong style="color:#38bdf8; font-size:0.85rem; word-break:break-all;">${original}</strong>
            </div>
          </div>

          <!-- Sağ Panel: Kopya -->
          <div style="background:#020617; border-radius:14px; padding:16px; border:2px solid #ef4444; display:flex; flex-direction:column; gap:12px; height:100%; justify-content:space-between;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="background:#ef4444; color:#fff; font-size:0.75rem; font-weight:800; padding:4px 10px; border-radius:6px;">KOPYA GÖRSEL</span>
              <span id="dupDimBadge" style="font-size:0.75rem; color:#64748b; font-family:monospace;">Çözünürlük alınıyor...</span>
            </div>
            <div style="position:relative; width:100%; aspect-ratio:4/3; background:#000; border-radius:10px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
              <img id="modalDupImg" src="${dupUrl}" style="max-width:100%; max-height:100%; object-fit:contain; display:block;" onload="document.getElementById('dupDimBadge').textContent = this.naturalWidth + ' x ' + this.naturalHeight + ' px';">
            </div>
            <div style="background:rgba(255,255,255,0.03); padding:10px 14px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);">
              <span style="color:#64748b; font-size:0.75rem; display:block;">Dosya Adı</span>
              <strong style="color:#f87171; font-size:0.85rem; word-break:break-all;">${activeDup}</strong>
            </div>
          </div>
        </div>

        <!-- Alt Gezinme ve Eylem Çubuğu -->
        <div style="padding:16px 24px; border-top:1px solid rgba(255,255,255,0.08); background:rgba(15,23,42,0.95); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <button id="modalPrevPairBtn" ${groupIndex === 0 && dupIndex === 0 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} class="btn-secondary" style="padding:8px 16px; font-size:0.82rem; font-weight:600; border-radius:8px; display:flex; align-items:center; gap:6px;">
              ← Önceki Çift
            </button>
            <button id="modalNextPairBtn" ${groupIndex >= totalGroups - 1 && dupIndex >= duplicates.length - 1 ? 'disabled style="opacity:0.4; cursor:not-allowed;"' : ''} class="btn-secondary" style="padding:8px 16px; font-size:0.82rem; font-weight:600; border-radius:8px; display:flex; align-items:center; gap:6px;">
              Sonraki Çift →
            </button>
            <span style="color:#64748b; font-size:0.8rem; margin-left:8px;">Klavye sol ve sağ ok tuşlarını kullanabilirsiniz</span>
          </div>

          <div style="display:flex; align-items:center; gap:12px;">
            <button id="modalDeleteThisDupBtn" class="btn-danger" style="background:#ef4444; color:#fff; border:none; padding:10px 20px; border-radius:8px; font-size:0.85rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 4px 14px rgba(239,68,68,0.4);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              <span>Bu Kopyayı Kalıcı Sil</span>
            </button>
            <button id="modalCloseActionBtn" class="btn-secondary" style="padding:10px 18px; font-size:0.85rem; font-weight:600; border-radius:8px;">Kapat</button>
          </div>
        </div>
      </div>
    `;

    modalEl.style.display = 'flex';

    const closeModal = () => {
      modalEl.style.display = 'none';
      window.removeEventListener('keydown', keyHandler);
    };

    const keyHandler = (e) => {
      if (e.key === 'Escape') closeModal();
      else if (e.key === 'ArrowLeft') {
        if (dupIndex > 0) this.openDuplicateCompareModal(cat, groupIndex, dupIndex - 1);
        else if (groupIndex > 0) {
          const prevGroup = data.duplicate_groups[groupIndex - 1];
          this.openDuplicateCompareModal(cat, groupIndex - 1, (prevGroup.duplicates || []).length - 1);
        }
      } else if (e.key === 'ArrowRight') {
        if (dupIndex < duplicates.length - 1) this.openDuplicateCompareModal(cat, groupIndex, dupIndex + 1);
        else if (groupIndex < totalGroups - 1) {
          this.openDuplicateCompareModal(cat, groupIndex + 1, 0);
        }
      }
    };

    window.addEventListener('keydown', keyHandler);

    document.getElementById('closeDupCompareModalBtn')?.addEventListener('click', closeModal);
    document.getElementById('modalCloseActionBtn')?.addEventListener('click', closeModal);
    modalEl.onclick = (e) => { if (e.target === modalEl) closeModal(); };

    document.getElementById('modalPrevPairBtn')?.addEventListener('click', () => {
      if (dupIndex > 0) this.openDuplicateCompareModal(cat, groupIndex, dupIndex - 1);
      else if (groupIndex > 0) {
        const prevGroup = data.duplicate_groups[groupIndex - 1];
        this.openDuplicateCompareModal(cat, groupIndex - 1, (prevGroup.duplicates || []).length - 1);
      }
    });

    document.getElementById('modalNextPairBtn')?.addEventListener('click', () => {
      if (dupIndex < duplicates.length - 1) this.openDuplicateCompareModal(cat, groupIndex, dupIndex + 1);
      else if (groupIndex < totalGroups - 1) {
        this.openDuplicateCompareModal(cat, groupIndex + 1, 0);
      }
    });

    document.getElementById('modalDeleteThisDupBtn')?.addEventListener('click', async () => {
      const delBtn = document.getElementById('modalDeleteThisDupBtn');
      if (delBtn) {
        delBtn.disabled = true;
        delBtn.innerHTML = '<span class="spinner" style="width:14px; height:14px; border-width:2px; display:inline-block; margin-right:6px;"></span> Siliniyor...';
      }

      try {
        const res = await fetch('/api/delete-file', {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ category: cat, filename: activeDup })
        });
        if (res.ok) {
          this.showToast(`${activeDup} kopyası başarıyla silindi`, 'success');

          // DOM listesinden kartı kaldır
          const itemEl = document.querySelector(`.duplicate-single-item[data-filename="${activeDup}"]`);
          if (itemEl) {
            const groupCard = itemEl.closest('.duplicate-group-card');
            itemEl.remove();
            if (groupCard && groupCard.querySelectorAll('.duplicate-single-item').length === 0) {
              groupCard.remove();
            }
          }

          // Bellekteki veri yapısını güncelle
          group.duplicates = group.duplicates.filter(d => d !== activeDup);
          data.duplicate_count = Math.max(0, (data.duplicate_count || 1) - 1);

          // Sayacı güncelle
          const countEl = document.getElementById('dupFoundCount');
          if (countEl) countEl.textContent = `${data.duplicate_count.toLocaleString()} Kopya`;

          // Bir sonraki kopyaya veya gruba geç
          if (group.duplicates.length > 0) {
            this.openDuplicateCompareModal(cat, groupIndex, Math.min(dupIndex, group.duplicates.length - 1));
          } else {
            data.duplicate_groups.splice(groupIndex, 1);
            if (data.duplicate_groups.length > 0) {
              this.openDuplicateCompareModal(cat, Math.min(groupIndex, data.duplicate_groups.length - 1), 0);
            } else {
              closeModal();
              this.renderDuplicateScanData(cat, { total_images: data.total_images || 0, duplicate_count: 0, duplicate_groups: [] });
            }
          }

          this.cachedDuplicateData[cat] = null;
          try { await this.loadHubProjectData(); } catch (e) {}
        } else {
          this.showToast('Görsel silinemedi.', 'error');
          if (delBtn) {
            delBtn.disabled = false;
            delBtn.innerHTML = '<span>Bu Kopyayı Kalıcı Sil</span>';
          }
        }
      } catch (err) {
        console.error(err);
        this.showToast('Silme işlemi sırasında hata oluştu.', 'error');
        if (delBtn) {
          delBtn.disabled = false;
          delBtn.innerHTML = '<span>Bu Kopyayı Kalıcı Sil</span>';
        }
      }
    });
  }

  async deleteDuplicateFile(cat, filename, btnEl) {
    const confirmed = await this.showConfirm({
      title: 'Kopya Görseli Sil',
      subtitle: 'Tekli Silme',
      message: `${filename} kopyasını kalıcı olarak silmek istediğinize emin misiniz?`,
      confirmText: 'Kopyayı Sil',
      cancelText: 'Vazgeç',
      type: 'danger'
    });
    if (!confirmed) return;

    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = 'Siliniyor...';
    }

    try {
      const res = await fetch('/api/delete-file', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ category: cat, filename: filename })
      });
      if (res.ok) {
        this.showToast(`${filename} kopyası başarıyla silindi`, 'success');
        const itemCard = btnEl ? btnEl.closest('.duplicate-single-item') : document.querySelector(`.duplicate-single-item[data-filename="${filename}"]`);
        const groupCard = itemCard ? itemCard.closest('.duplicate-group-card') : null;

        if (itemCard) {
          itemCard.style.transition = 'all 0.2s ease';
          itemCard.style.opacity = '0';
          itemCard.style.transform = 'scale(0.8)';
          setTimeout(() => {
            itemCard.remove();
            if (groupCard && groupCard.querySelectorAll('.duplicate-single-item').length === 0) {
              groupCard.remove();
            }
          }, 200);
        }

        const countEl = document.getElementById('dupFoundCount') || document.getElementById('dupCountBadge');
        if (countEl) {
          const current = parseInt(countEl.textContent.replace(/\D/g, ''), 10) || 0;
          if (current > 1) {
            countEl.textContent = `${(current - 1).toLocaleString()} Kopya`;
          } else {
            countEl.textContent = '0 Kopya';
          }
        }

        this.cachedDuplicateData[cat] = null;
        try {
          await this.loadHubProjectData();
        } catch (syncErr) {
          console.warn('[Sync project data after single dup delete]:', syncErr);
        }
      } else {
        if (btnEl) {
          btnEl.disabled = false;
          btnEl.innerHTML = 'Sil';
        }
        this.showToast('Dosya silinemedi.', 'error');
      }
    } catch (err) {
      console.error(err);
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = 'Sil';
      }
      this.showToast('Silme işlemi sırasında hata oluştu.', 'error');
    }
  }

  }

  // Metotlari ve getter/setter'lari DatasetEditor.prototype'a kopyala
  const proto = _ProjectHubExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }
})(window.DatasetEditor);
