/**
 * AutoLabel Studio - EditorCore Module
 * ================================
 * Editor yuklemesi, kategori/gorsel listeleme, batch ops, dataset yonetimi, class config.
 *
 * DatasetEditor.prototype uzerine guvenli ES6 sinif genisletme kalibiyla enjekte edilir.
 */

(function installEditorCore(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    console.error('[EditorCore] DatasetEditor henuz yuklenmedi!');
    return;
  }

  class _EditorCoreExtension {
  async showEditor(categoryId, pushHistory = true, initialFilter = null, targetFilename = null, batchFilenamesFilter = null, batchId = null, batchName = null) {
  const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  if (!token || !this.currentUser) {
    this.showLoading(false);
    this.showAuth('login', true);
    return;
  }
  const isAdmin = !!(this.currentUser?.is_admin || this.currentUser?.role === 'admin');
  if (categoryId && Array.isArray(this.projects) && this.projects.length > 0 && !isAdmin) {
    const canAccess = this.projects.some(p => p.id === categoryId || p.id.toLowerCase() === String(categoryId).toLowerCase());
    if (!canAccess) {
      this.showLoading(false);
      this.showToast('Bu projeye erişim yetkiniz bulunmuyor veya proje mevcut değil.', 'error');
      await this.showAppShell('projects', true);
      return;
    }
  }
  // Butona tıklandığı İLK MİLİSANİYEDE yükleme göstergesini anında aç (boş ekranı önler)
  this.showLoading(true, 'Görseller ve Çalışma Alanı Hazırlanıyor...', 'Lütfen bekleyiniz, proje verileri yükleniyor...');

  // Bu görselleri açmadan önceki tam URL'yi kaydet
  if (window.location.href && !window.location.href.includes('editor=')) {
    sessionStorage.setItem('editor_return_url', window.location.href);
  } else if (document.referrer && !document.referrer.includes('editor=')) {
    sessionStorage.setItem('editor_return_url', document.referrer);
  }

  this.currentView = 'editor';
  if (pushHistory) {
    this.navigateTo('editor', { projectId: categoryId });
  }
  this.hideAllViews();
  if (this.editorView) this.editorView.style.display = 'flex';

  if (this.isLeftCollapsed) this.mainLayout?.classList.add('left-collapsed');
  if (this.isRightCollapsed) this.mainLayout?.classList.add('right-collapsed');

  this.currentBatchFilenamesFilter = (batchFilenamesFilter && Array.isArray(batchFilenamesFilter) && batchFilenamesFilter.length > 0) ? batchFilenamesFilter : null;
  this.activeBatchId = batchId || null;
  this.activeBatchName = batchName || (batchId ? 'Yığın / Job' : 'Tüm Proje');

  if (initialFilter) {
    if (this.filterSelect) this.filterSelect.value = initialFilter;
    this.currentFilter = initialFilter;
  }

  const catLoaded = await this.loadCategories(categoryId);
  if (catLoaded === false) {
    return;
  }
  this.applyFilter();

  // Update Header Job Badge & Add to Dataset Action
  const jobNameEl = document.getElementById('editorJobName');
  const jobCountEl = document.getElementById('editorJobCountBadge');
  const addToDatasetBtn = document.getElementById('editorAddToDatasetBtn');

  if (jobNameEl) jobNameEl.textContent = this.activeBatchName;
  if (jobCountEl) {
    const activeCount = this.filteredImages ? this.filteredImages.length : (batchFilenamesFilter ? batchFilenamesFilter.length : 0);
    jobCountEl.textContent = `${activeCount.toLocaleString()} Resim`;
  }
  // Kullanıcının geldiği sekmeyi kaydet (varsayılan: annotate / etiketleme ekranı)
  if (this.activeHubTab && this.activeHubTab !== 'upload') {
    this.editorReturnTab = this.activeHubTab;
  } else if (!this.editorReturnTab) {
    this.editorReturnTab = 'annotate';
  }

  // Geri butonunun metnini projeye göre dinamik güncelle
  const backBtnText = document.getElementById('backToDashBtnText');
  if (backBtnText) {
    const curProj = (this.projects || []).find(p => p.id === categoryId);
    const pTitle = curProj?.display_name || this.currentBlueprint?.display_name || 'Projeye Dön';
    backBtnText.textContent = pTitle.length > 20 ? `${pTitle.slice(0, 18)}...` : pTitle;
    backBtnText.parentElement?.setAttribute('title', `${pTitle} etiketleme ekranına dön`);
  }

    if (targetFilename && this.filteredImages && this.filteredImages.length > 0) {
      const idx = this.filteredImages.findIndex(i => i.filename === targetFilename);
      if (idx !== -1) {
        this.goToIndex(idx);
      }
    } else if (!targetFilename && this.filteredImages && this.filteredImages.length > 0) {
      if (!this.currentImage) {
        this.goToIndex(0);
      }
    } else {
      this.showLoading(false);
    }

    // Rol bazlı canlı editör buton koruması
    const userRole = (this.currentUser?.role || 'admin').toLowerCase();
    const resetPoolBtn = document.getElementById('resetToUnlabeledBtn');
    if (userRole === 'annotator') {
      // Annotator veri setine doğrudan onaylayamaz veya onaylıyı havuza iade edemez
      if (addToDatasetBtn) addToDatasetBtn.style.display = 'none';
      if (resetPoolBtn) resetPoolBtn.style.display = 'none';
    } else {
      if (addToDatasetBtn) addToDatasetBtn.style.display = 'inline-flex';
      if (resetPoolBtn) resetPoolBtn.style.display = 'inline-flex';
    }
}



  // =====================================================
  // DASHBOARD DATA & RENDERING
  // =====================================================

  async loadDashboardProjects() {
  if (!this.projectsGrid) return;
  this.projectsGrid.innerHTML = '<div class="dash-loading-card">Projeler taranıyor ve yükleniyor...</div>';

  try {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || localStorage.getItem('yolo_auth_token') || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const wsParam = this.activeWorkspaceId ? `?workspace_id=${encodeURIComponent(this.activeWorkspaceId)}` : '';
    const res = await fetch(`/api/projects${wsParam}`, { headers });
    const data = await res.json();
    this.projects = data.projects || [];
    this.projectsList = this.projects;
    this.classes = data.classes || {};

    let totalImages = 0;
    let totalLabeled = 0;
    this.projects.forEach(p => {
      totalImages += p.image_count || 0;
      totalLabeled += p.label_count || 0;
    });

    const globalPct = totalImages > 0 ? (totalLabeled / totalImages * 100).toFixed(1) : 0;
    if (this.dashGlobalSummary) {
      this.dashGlobalSummary.textContent = `${this.projects.length} Proje • ${totalLabeled} / ${totalImages} Etiketli (%${globalPct})`;
    }

    // Dashboard Rol ve Karşılama Alanını Güncelle
    const user = this.currentUser || {};
    const role = (user.role || 'admin').toLowerCase();
    const userName = user.name || user.username || user.email?.split('@')[0] || 'Geliştirici';
    
    const greetingNameEl = document.getElementById('dashGreetingUserName');
    const roleBadgeEl = document.getElementById('dashUserRoleBadge');
    const greetingSubEl = document.getElementById('dashGreetingSub');
    const roleAvatarEl = document.getElementById('dashRoleAvatar');
    const createProjBtn = document.getElementById('openCreateProjectBtn');

    if (greetingNameEl) greetingNameEl.textContent = `Hoş Geldiniz, ${userName}`;
    if (roleAvatarEl) roleAvatarEl.textContent = userName.charAt(0).toUpperCase();

    if (roleBadgeEl) {
      roleBadgeEl.style.display = 'none'; // Başlıktaki gereksiz rol kalabalığını gizle
    }
    if (greetingSubEl) {
      greetingSubEl.textContent = 'Çalışma alanınızdaki veri seti ve etiketleme projeleri.';
    }
    if (createProjBtn) {
      createProjBtn.style.display = role === 'annotator' || role === 'reviewer' ? 'none' : 'inline-flex';
    }

    const hasProjects = (this.projects && this.projects.length > 0);
    const quickStats = document.getElementById('dashQuickStatsRow');
    if (quickStats) quickStats.style.display = hasProjects ? 'flex' : 'none';
    const dashToolbar = document.querySelector('.dash-toolbar');
    if (dashToolbar) dashToolbar.style.display = hasProjects ? 'flex' : 'none';

    const totProjStat = document.getElementById('dashStatTotalProjects');
    const globPctStat = document.getElementById('dashStatGlobalPct');
    if (totProjStat) totProjStat.textContent = this.projects.length;
    const totImgStat = document.getElementById('dashStatTotalImages');
    const pendingStat = document.getElementById('dashStatPendingReviews');
    if (totImgStat) totImgStat.textContent = totalImages.toLocaleString('tr-TR');
    if (globPctStat) globPctStat.textContent = `%${globalPct}`;
    if (pendingStat) pendingStat.textContent = 0;

    const pCountEl = document.getElementById('wsNavProjectsCount');
    if (pCountEl) pCountEl.textContent = this.projects.length;

    // Filtre tab event listener bağlama (bir kez)
    if (!this._hasBoundDashRoleFilter) {
      this._hasBoundDashRoleFilter = true;
      const tabBtns = document.querySelectorAll('#dashRoleFilterTabs .dash-tab-btn');
      tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
          tabBtns.forEach(b => {
            b.classList.remove('active');
            b.style.background = 'transparent';
            b.style.color = '#94a3b8';
            b.style.border = 'none';
          });
          btn.classList.add('active');
          btn.style.background = 'rgba(59,130,246,0.2)';
          btn.style.color = '#60a5fa';
          btn.style.border = '1px solid rgba(59,130,246,0.3)';
          this._currentDashFilter = btn.dataset.filter || 'all';
          this.renderDashboardProjects();
        });
      });
    }

    this.renderDashboardProjects();
  } catch (err) {
    console.error(err);
    this.projectsGrid.innerHTML = '<div class="empty-state">Projeler yüklenirken hata oluştu.</div>';
  }
}

renderDashboardProjects() {
  if (!this.projectsGrid) return;
  const query = (this.projectSearchInput?.value || '').trim().toLowerCase();
  const sortBy = this.projectSortSelect?.value || 'name';
  const roleFilter = this._currentDashFilter || 'all';
  const currentEmail = (this.currentUser?.email || '').toLowerCase();
  const userRole = (this.currentUser?.role || 'admin').toLowerCase();

  let list = this.projects.filter(p => {
    // 1. Text Search
    if (query && !p.name.toLowerCase().includes(query) && !p.id.toLowerCase().includes(query)) {
      return false;
    }
    // 2. Tab Filter
    if (roleFilter === 'team' && !p.is_team_project) return false;
    if (roleFilter === 'completed' && p.percent < 100) return false;
    if (roleFilter === 'assigned') {
      const isMine = p.is_team_project && (
        (p.assigned_users && p.assigned_users.includes(currentEmail)) ||
        (p.team_captain && p.team_captain.toLowerCase() === currentEmail)
      );
      if (!isMine) return false;
    }
    return true;
  });

  list.sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'images_desc') return b.image_count - a.image_count;
    if (sortBy === 'percent_desc') return b.percent - a.percent;
    if (sortBy === 'percent_asc') return a.percent - b.percent;
    return 0;
  });

  // Eğer çalışma alanında hiç proje yoksa kullanıcı dostu 3 kartlı başlangıç sun
  if (!this.projects || this.projects.length === 0) {
    this.projectsGrid.innerHTML = `
      <div class="dash-empty-onboarding">
        <div class="dash-onboarding-hero">
          <div class="dash-onboarding-icon">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              <line x1="12" y1="11" x2="12" y2="17"></line>
              <line x1="9" y1="14" x2="15" y2="14"></line>
            </svg>
          </div>
          <h2>Henüz bir proje oluşturmadınız</h2>
          <p>Kendi görsellerinizi yükleyip hemen etiketlemeye başlayabilir veya hazır şablonları deneyebilirsiniz.</p>
        </div>

        <div class="dash-onboard-cards-grid">
          <div class="dash-onboard-card highlight" id="onboardCardCreate">
            <div class="dash-onboard-icon-box blue">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>
            <div class="dash-onboard-info">
              <h3>Sıfırdan Proje Başlat</h3>
              <p>Kendi görsel ve etiketlerinizi yükleyin, nesne tespiti veya sınıflandırma veri seti kurun.</p>
            </div>
            <button class="btn-primary btn-sm">Proje Oluştur →</button>
          </div>

          <div class="dash-onboard-card" id="onboardCardAgent">
            <div class="dash-onboard-icon-box purple">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </div>
            <div class="dash-onboard-info">
              <h3>AI Asistan ile Tasarla</h3>
              <p>Yapay zekaya ne tespit etmek istediğinizi söyleyin, sınıfları ve veri seti planını hazırlasın.</p>
            </div>
            <button class="btn-secondary btn-sm">Asistana Git →</button>
          </div>

          <div class="dash-onboard-card" id="onboardCardTemplates">
            <div class="dash-onboard-icon-box amber">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
              </svg>
            </div>
            <div class="dash-onboard-info">
              <h3>Hazır Örnek Şablonlar</h3>
              <p>Şişe kusuru veya trafik tespiti gibi hazır veri setleriyle platformu hemen test edin.</p>
            </div>
            <button class="btn-secondary btn-sm">Şablonları İncele →</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('onboardCardCreate')?.addEventListener('click', () => this.showCreateProject());
    document.getElementById('onboardCardAgent')?.addEventListener('click', () => this.switchWorkspaceTab('agent'));
    document.getElementById('onboardCardTemplates')?.addEventListener('click', () => this.switchWorkspaceTab('explore'));
    return;
  }

  // Proje var ama filtre veya arama eşleşmediyse
  if (list.length === 0) {
    this.projectsGrid.innerHTML = `
      <div class="empty-state-modern" style="grid-column: 1 / -1;">
        <div class="empty-state-icon-wrap">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
        <h3>Eşleşen Proje Bulunamadı</h3>
        <p>${query ? `"${this._escapeHtml(query)}" aramasına uygun herhangi bir proje bulunamadı.` : 'Seçili filtreye uygun proje bulunamadı.'}</p>
        <button class="btn-secondary btn-sm" id="emptyClearFiltersBtn" style="margin-top:14px;">Tüm Projeleri Göster</button>
      </div>
    `;
    document.getElementById('emptyClearFiltersBtn')?.addEventListener('click', () => {
      if (this.projectSearchInput) this.projectSearchInput.value = '';
      this._currentDashFilter = 'all';
      document.querySelectorAll('#dashRoleFilterTabs .dash-tab-btn').forEach(btn => {
        const isAll = btn.dataset.filter === 'all';
        btn.classList.toggle('active', isAll);
        btn.style.background = isAll ? 'rgba(59,130,246,0.2)' : 'transparent';
        btn.style.color = isAll ? '#60a5fa' : '#94a3b8';
        btn.style.border = isAll ? '1px solid rgba(59,130,246,0.3)' : 'none';
      });
      this.renderDashboardProjects();
    });
    return;
  }

  this.projectsGrid.innerHTML = '';
  list.forEach(proj => {
    const card = document.createElement('div');
    card.className = 'project-card';

    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || '';
    const sampleImgUrl = proj.sample_image ? (proj.sample_image + (token ? `&token=${encodeURIComponent(token)}` : '')) : null;
    const coverHtml = sampleImgUrl
      ? `<img src="${sampleImgUrl}" alt="${proj.name}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<svg width=\\'32\\' height=\\'32\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'rgba(255,255,255,0.2)\\' stroke-width=\\'2\\'><path d=\\'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\\'/></svg>';">`
      : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;

    const classesHtml = (proj.classes || []).map(c => `
        <span class="class-tag-pill" style="border-left: 3px solid ${c.color || '#3b82f6'};">
          <span style="color:${c.color || '#3b82f6'}">●</span> ${c.name || proj.name}
        </span>
      `).join('');

    const visBadge = proj.visibility === 'private'
      ? `<span class="proj-meta-badge badge-private">Özel</span>`
      : `<span class="proj-meta-badge badge-public">Herkese Açık</span>`;

    const typeBadge = proj.project_type === 'classification'
      ? `<span class="proj-meta-badge badge-type-cls">Sınıflandırma</span>`
      : `<span class="proj-meta-badge badge-type-det">Nesne Tespiti</span>`;

    const teamBadge = proj.is_team_project
      ? `<span class="proj-meta-badge" style="background:rgba(99,102,241,0.15); color:#818cf8; border:1px solid rgba(99,102,241,0.3); font-weight:700;">👥 ${this._escapeHtml(proj.team_name || 'Takım Projesi')}</span>`
      : '';

    const isOwner = proj.owner_email && (proj.owner_email.toLowerCase() === currentEmail);
    const isProjectCaptain = proj.team_captain && (proj.team_captain.toLowerCase() === currentEmail);
    const canDelete = isOwner || isProjectCaptain || (!proj.is_team_project && userRole === 'admin');

    const deleteBtnHtml = canDelete ? `
            <button class="btn-card-tool btn-card-del" data-action="delete" data-id="${proj.id}" title="Projeyi Sil">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>` : '';

    // Rol bazlı ana eylem butonu metni
    const openBtnText = userRole === 'annotator' ? 'Etiketlemeye Başla' : userRole === 'reviewer' ? 'İncele & Onayla' : 'Stüdyoyu Aç';

    card.innerHTML = `
        <div class="project-card-cover">
          ${coverHtml}
          <div class="project-pct-badge" style="${proj.percent === 100 ? 'background:rgba(16,185,129,0.85);' : ''}">%${proj.percent} Etiketli</div>
        </div>
        <div class="project-card-body">
          <div class="project-title-row">
            <h3 class="project-card-title">${proj.name}</h3>
          </div>
          <div class="proj-meta-badges-row">${teamBadge}${visBadge}${typeBadge}</div>
          <p class="project-card-desc">${proj.description || `${proj.name} nesne tespit seti`}</p>

          <div class="project-progress-block">
            <div class="project-progress-meta">
              <span>İlerleme Durumu</span>
              <strong>${proj.label_count} / ${proj.image_count} Görsel</strong>
            </div>
            <div class="project-progress-track">
              <div class="project-progress-fill" style="width: ${proj.percent}%; ${proj.percent === 100 ? 'background:#10b981;' : ''}"></div>
            </div>
          </div>

          <div class="project-classes-row">
            ${classesHtml}
          </div>

          <div class="project-card-actions">
            <button class="btn-card-open" data-action="open" data-id="${proj.id}" style="${userRole === 'annotator' ? 'background:linear-gradient(135deg,#0284c7,#2563eb);' : ''}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>${openBtnText}</span>
            </button>
            ${userRole === 'admin' ? `
            <button class="btn-card-tool" data-action="batch" data-id="${proj.id}" title="Toplu Otomatik AI Etiketle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg>
            </button>
            <button class="btn-card-tool" data-action="config" data-id="${proj.id}" title="Sınıf & Proje Ayarları">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>` : ''}
            ${deleteBtnHtml}
          </div>
        </div>
      `;

    card.querySelector('[data-action="open"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const targetTab = userRole === 'annotator' ? 'annotate' : userRole === 'reviewer' ? 'review_queue' : 'upload';
      this.showProjectHub(proj.id, targetTab);
    });
    card.querySelector('.project-card-cover')?.addEventListener('click', (e) => { e.stopPropagation(); this.showProjectHub(proj.id, 'dataset'); });
    card.querySelector('.project-card-title')?.addEventListener('click', (e) => { e.stopPropagation(); this.showProjectHub(proj.id, 'dataset'); });
    card.querySelector('[data-action="batch"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openBatchModal(proj.id);
    });
    card.querySelector('[data-action="config"]')?.addEventListener('click', (e) => { e.stopPropagation(); this.showProjectHub(proj.id, 'settings'); });
    card.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => { e.stopPropagation(); this.deleteProject(proj.id); });

    this.projectsGrid.appendChild(card);
  });
}


// =====================================================
// MODAL HANDLERS & ROBOFLOW WORKSPACE EVENTS
// =====================================================

setupModalEvents() {
  // Universal modal close buttons
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.getAttribute('data-close');
      const m = document.getElementById(modalId);
      if (m) {
        m.style.display = 'none';
        m.classList.remove('active');
        m.style.opacity = '0';
        m.style.pointerEvents = 'none';
      }
      if (this.batchPollTimer) clearInterval(this.batchPollTimer);
    });
  });

  // 1. Open Full Create Project View (Roboflow Style)
  const openCreateProjectBtn = document.getElementById('openCreateProjectBtn');
  openCreateProjectBtn?.addEventListener('click', () => {
    this.showCreateProject();
  });

  document.getElementById('agentQuickCreateBtn')?.addEventListener('click', () => {
    this.showCreateProject();
  });

  document.getElementById('cancelCreateProjectBtn')?.addEventListener('click', () => this.closeProjectToWorkspace());
  document.getElementById('cancelCreateProjectBtn2')?.addEventListener('click', () => this.closeProjectToWorkspace());
  document.getElementById('hubBackToDashBtn')?.addEventListener('click', () => this.closeProjectToWorkspace());

  // 2. Hub Sidebar Navigation Tabs
  document.querySelectorAll('.hub-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab) this.switchHubTab(tab);
    });
  });


  // Launch Studio button from Hub
  document.getElementById('hubLaunchStudioBtn')?.addEventListener('click', () => {
    if (this.activeHubProjectId) this.showEditor(this.activeHubProjectId);
  });

  document.getElementById('hubQuickStartAnnotateBtn')?.addEventListener('click', () => {
    if (this.activeHubProjectId) {
      this.openBatchReview(this.activeBatchReviewId || 'batch_initial', 'unannotated');
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // 3. Create Project — Public / Private visibility toggle
  // ─────────────────────────────────────────────────────────────────────
  document.querySelectorAll('.radio-pill-group .pill-btn[data-vis]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.radio-pill-group .pill-btn[data-vis]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // 4. Create Project — Project Type card selection (non-disabled cards)
  // ─────────────────────────────────────────────────────────────────────
  document.querySelectorAll('.project-types-grid .type-card:not(.disabled)').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.project-types-grid .type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');

      // Show / hide AI prompts column based on project type
      const projType = card.dataset.type;
      const promptCols = document.querySelectorAll('.cls-prompts-input');
      promptCols.forEach(inp => {
        inp.closest('.cls-row-pill') && (inp.style.display = projType === 'classification' ? 'none' : '');
      });

      // Update the section label for clarity
      const sectionLabel = document.querySelector('.annotation-group-section .section-label');
      if (sectionLabel) {
        sectionLabel.textContent = projType === 'classification'
          ? 'Image Classes (Her Görüntüye Atanacak Kategoriler)'
          : 'Annotation Classes (Etiketlenecek Sınıflar)';
      }
    });
  });

  // Cancel / Close Create Project
  ['cancelCreateProjectBtn', 'cancelCreateProjectBtn2', 'closeCreateProjectBtn'].forEach(btnId => {
    document.getElementById(btnId)?.addEventListener('click', (e) => {
      e.preventDefault();
      this.closeProjectToWorkspace(true);
    });
  });

  // Project Type Card Selection (.type-card-modern)
  document.querySelectorAll('.type-card-modern').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.type-card-modern').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  // Full Create Project - Add Class
  document.getElementById('fullAddClassBtn')?.addEventListener('click', () => {
    const cList = document.getElementById('fullClassesListContainer');
    if (!cList) return;
    const count = cList.querySelectorAll('.cls-row-pill-modern, .cls-row-pill').length;
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#ef4444'];
    const color = colors[count % colors.length];

    const row = document.createElement('div');
    row.className = 'cls-row-pill-modern';
    row.dataset.idx = count;
    row.innerHTML = `
        <div class="cls-drag-indicator">⋮⋮</div>
        <div class="cls-input-group flex-1">
          <input type="text" class="cls-name-input-modern" placeholder="Sınıf adı (ör: Class_${count + 1})">
        </div>
        <div class="cls-color-picker-wrap" title="Sınıf Rengi">
          <input type="color" class="cls-color-input-modern" value="${color}">
        </div>
        <div class="cls-input-group flex-2">
          <input type="text" class="cls-prompts-input-modern" placeholder="AI arama promptları (virgülle ayırın)">
        </div>
        <button type="button" class="cls-del-btn-modern" title="Sınıfı Sil">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      `;
    row.querySelector('.cls-del-btn-modern')?.addEventListener('click', () => row.remove());
    cList.appendChild(row);
    row.querySelector('.cls-name-input-modern')?.focus();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Full Create Project - Submit  (visibility + license + project_type)
  // ─────────────────────────────────────────────────────────────────────
  document.getElementById('submitFullCreateProjectBtn')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('fullNewProjName');
    const rawName = (nameInput?.value || '').trim();
    const errSpan = document.getElementById('projNameError');

    if (!rawName) {
      if (errSpan) errSpan.style.display = 'block';
      if (nameInput) nameInput.focus();
      return;
    }
    if (errSpan) errSpan.style.display = 'none';

    const folderName = rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').trim();

    // Read visibility (Public / Private pill)
    const activeVisPill = document.querySelector('.radio-pill-group .pill-btn.active[data-vis]');
    const visibility = activeVisPill?.dataset.vis || 'public';

    // Read license dropdown
    const licenseSelect = document.getElementById('fullNewProjLicense');
    const license = licenseSelect?.value || 'CC BY 4.0';

    // Read selected project type
    const selectedTypeCard = document.querySelector('.project-types-grid .type-card-modern.selected, .project-types-grid .type-card.selected');
    const projectType = selectedTypeCard?.dataset.type || 'detection';

    const cRows = document.querySelectorAll('#fullClassesListContainer .cls-row-pill-modern, #fullClassesListContainer .cls-row-pill');
    const classes = [];
    cRows.forEach((r, idx) => {
      const cName = (r.querySelector('.cls-name-input-modern, .cls-name-input')?.value || '').trim() || `Class_${idx}`;
      const cColor = r.querySelector('.cls-color-input-modern, .cls-color-input')?.value || '#3b82f6';
      const pRaw = (r.querySelector('.cls-prompts-input-modern, .cls-prompts-input')?.value || '').trim() || cName.toLowerCase();
      const prompts = pRaw.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
      classes.push({ id: idx, name: cName, color: cColor, prompts });
    });

    if (classes.length === 0) {
      classes.push({ id: 0, name: rawName, color: '#3b82f6', prompts: [rawName.toLowerCase()] });
    }

    const typeLabel = projectType === 'classification' ? 'görüntü sınıflandırma' : 'nesne tespit';
    this.showLoading(true, 'Proje oluşturuluyor...');
    try {
      const token = localStorage.getItem('yolo_auth_token') || '';
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          folder_name: folderName,
          display_name: rawName,
          description: `${rawName} ${typeLabel} projesi`,
          classes: classes,
          visibility: visibility,
          license: license,
          project_type: projectType,
          workspace_id: this.activeWorkspaceId || localStorage.getItem('activeWorkspaceId') || null,
        })
      });
      const result = await res.json();
      if (res.ok && result.status === 'ok') {
        this.showToast(`Proje başarıyla oluşturuldu. (${visibility === 'private' ? 'Özel' : 'Herkese Açık'} · ${projectType === 'classification' ? 'Classification' : 'Detection'})`, 'success');
        await this.fetchProjects();
        await this.showProjectHub(folderName, 'upload');

      } else {
        this.showToast(result.detail || 'Proje oluşturulamadı.', 'error');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Sunucu bağlantı hatası.', 'error');
    } finally {

      this.showLoading(false);
    }
  });

  // ─────────────────────────────────────────────────────────────────────
  // TEAM MEMBER TO LEAD TASK & IMAGE DELIVERY HANDLERS
  // ─────────────────────────────────────────────────────────────────────
  const openTeamDeliveryModal = (scope = 'auto') => {
    const modal = document.getElementById('teamDeliveryModal');
    if (!modal) return;
    const projNameEl = document.getElementById('deliveryProjName');
    const countBadge = document.getElementById('deliveryImageCountBadge');
    const currentCat = this.currentCategory || this.activeHubProjectId || 'Proje';

    if (projNameEl) projNameEl.textContent = currentCat;

    // Determine images to deliver
    let targetImages = [];
    const selectedSet = this.selectedDatasetImageFilenames || new Set();

    if (scope === 'selected' || (scope === 'auto' && selectedSet.size > 0)) {
      targetImages = Array.from(selectedSet);
      const radioCur = document.getElementById('scopeRadioCurrent');
      if (radioCur) radioCur.checked = true;
    } else if (this.currentImage) {
      targetImages = [this.currentImage];
      const radioCur = document.getElementById('scopeRadioCurrent');
      if (radioCur) radioCur.checked = true;
    } else {
      targetImages = (this.images || []).map(img => typeof img === 'string' ? img : img.name);
      const radioAll = document.getElementById('scopeRadioAll');
      if (radioAll) radioAll.checked = true;
    }

    if (countBadge) {
      countBadge.textContent = `${targetImages.length} Görsel`;
    }
    modal.style.display = 'flex';
  };

  const closeTeamDeliveryModal = () => {
    const modal = document.getElementById('teamDeliveryModal');
    if (modal) modal.style.display = 'none';
  };

  document.getElementById('editorSubmitLeadBtn')?.addEventListener('click', () => openTeamDeliveryModal('auto'));
  document.getElementById('batchSubmitLeadBtn')?.addEventListener('click', () => openTeamDeliveryModal('selected'));
  document.getElementById('closeTeamDeliveryBtn')?.addEventListener('click', closeTeamDeliveryModal);
  document.getElementById('cancelTeamDeliveryBtn')?.addEventListener('click', closeTeamDeliveryModal);

  // Delivery Status Radio selection visual
  document.querySelectorAll('.delivery-status-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.delivery-status-card').forEach(c => {
        c.classList.remove('selected');
        c.style.borderColor = 'rgba(255,255,255,0.1)';
        c.style.background = 'rgba(30,41,59,0.5)';
      });
      card.classList.add('selected');
      card.style.borderColor = '#0284c7';
      card.style.background = 'rgba(14,165,233,0.12)';
      const radio = card.querySelector('input[type="radio"]');
      if (radio) radio.checked = true;
    });
  });

  // Submit Work to Lead
  document.getElementById('submitTeamDeliveryBtn')?.addEventListener('click', async () => {
    const submitBtn = document.getElementById('submitTeamDeliveryBtn');
    const noteInput = document.getElementById('deliveryNoteInput');
    const note = (noteInput?.value || '').trim();
    const statusRadio = document.querySelector('input[name="deliveryStatusRadio"]:checked');
    const status = statusRadio?.value || 'needs_review';
    const scopeRadio = document.querySelector('input[name="deliveryScopeRadio"]:checked');
    const scope = scopeRadio?.value || 'all_labeled';
    const currentCat = this.currentCategory || this.activeHubProjectId;

    if (!currentCat) {
      this.showToast('Lütfen önce bir proje açın.', 'error');
      return;
    }

    let fileList = [];
    if (scope === 'current') {
      if (this.selectedDatasetImageFilenames && this.selectedDatasetImageFilenames.size > 0) {
        fileList = Array.from(this.selectedDatasetImageFilenames);
      } else if (this.currentImage) {
        fileList = [this.currentImage];
      }
    } else {
      fileList = (this.images || []).map(i => typeof i === 'string' ? i : i.name);
    }

    if (!fileList || fileList.length === 0) {
      this.showToast('Teslim edilecek görsel bulunamadı.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Gönderiliyor...';

    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      let sentCount = 0;
      for (const fname of fileList) {
        await fetch('/api/projects/mark-review', {
          method: 'POST',
          headers,
          body: JSON.stringify({ category: currentCat, filename: fname, status, note })
        });
        sentCount++;
      }

      this.showToast(`${sentCount} görsel takım kaptanına başarıyla iletildi!`, 'success');
      closeTeamDeliveryModal();
      if (noteInput) noteInput.value = '';
    } catch (err) {
      this.showToast('Teslim sırasında hata oluştu: ' + (err.message || ''), 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = 'Kaptana Gönder';
    }
  });
  const hubFileInput = document.getElementById('hubFileInput');
  const hubFolderInput = document.getElementById('hubFolderInput');
  const hubPickFilesBtn = document.getElementById('hubPickFilesBtn');
  const hubPickFolderBtn = document.getElementById('hubPickFolderBtn');
  hubPickFilesBtn?.addEventListener('click', () => hubFileInput?.click());
  hubPickFolderBtn?.addEventListener('click', () => hubFolderInput?.click());
  const hubLargeDropzone = document.getElementById('hubLargeDropzone');
  const hubStagedSummaryRow = document.getElementById('hubStagedSummaryRow');
  const hubStagedCountText = document.getElementById('hubStagedCountText');
  const hubConfirmUploadBtn = document.getElementById('hubConfirmUploadBtn');

  // 3'lü Kaynak Kartları Etkileşimi
  const srcCardLocal = document.getElementById('srcCardLocal');
  const srcCardScraper = document.getElementById('srcCardScraper');
  const srcCardVideo = document.getElementById('srcCardVideo');
  const webScraperModal = document.getElementById('webScraperModal');
  const videoExtractModal = document.getElementById('videoExtractModal');
  const hubClearStagedBtn = document.getElementById('hubClearStagedBtn');

  srcCardLocal?.addEventListener('click', () => {
    hubFileInput?.click();
  });

  srcCardScraper?.addEventListener('click', () => {
    if (webScraperModal) {
      webScraperModal.style.display = 'flex';
      webScraperModal.classList.add('active');
    }
  });

  srcCardVideo?.addEventListener('click', () => {
    if (videoExtractModal) {
      videoExtractModal.style.display = 'flex';
      videoExtractModal.classList.add('active');
    }
  });

  const hubAddFolderBtn = document.getElementById('hubAddFolderBtn');
  const hubAddFilesBtn = document.getElementById('hubAddFilesBtn');
  hubAddFolderBtn?.addEventListener('click', () => hubFolderInput?.click());
  hubAddFilesBtn?.addEventListener('click', () => hubFileInput?.click());

  hubClearStagedBtn?.addEventListener('click', () => {
    this.stagedUploadFiles = [];
    if (hubStagedSummaryRow) hubStagedSummaryRow.style.display = 'none';
    if (hubFileInput) hubFileInput.value = '';
    if (hubFolderInput) hubFolderInput.value = '';
    this.showToast('Seçili dosyalar temizlendi.', 'info');
  });

  // Web Scraper tetikleyici
  document.getElementById('startWebScraperBtn')?.addEventListener('click', async () => {
    const kw = document.getElementById('scraperKeywordsInput')?.value.trim();
    if (!kw) {
      this.showToast('Lütfen arama terimi giriniz.', 'warning');
      return;
    }
    const limit = parseInt(document.getElementById('scraperLimitInput')?.value || '25', 10);
    const progressArea = document.getElementById('scraperProgressArea');
    const startBtn = document.getElementById('startWebScraperBtn');
    if (progressArea) progressArea.style.display = 'block';
    if (startBtn) startBtn.disabled = true;

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || '';
      const res = await fetch('/api/projects/scrape-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          category: this.activeHubProjectId || 'bag',
          keywords: kw,
          limit: limit
        })
      });
      const resData = await res.json();
      if (res.ok && resData.status === 'ok') {
        this.showToast(`${resData.downloaded || limit} görsel başarıyla indirildi ve projeye eklendi!`, 'success');
        if (webScraperModal) {
          webScraperModal.style.display = 'none';
          webScraperModal.classList.remove('active');
        }
        await this.loadHubProjectData();
      } else {
        throw new Error(resData.detail || 'Kazıma tamamlanamadı.');
      }
    } catch (e) {
      this.showToast(`Hata: ${e.message}`, 'error');
    } finally {
      if (progressArea) progressArea.style.display = 'none';
      if (startBtn) startBtn.disabled = false;
    }
  });

  const updateStagedUploadFiles = (newFiles) => {
    const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.txt'];
    const incoming = Array.from(newFiles || []).filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return validExts.includes(ext);
    });

    if (incoming.length === 0) return;

    if (!Array.isArray(this.stagedUploadFiles)) {
      this.stagedUploadFiles = [];
    }

    const previousCount = this.stagedUploadFiles.length;
    // Tekrarlı dosya eklemeyi önlemek için anahtar kümesi oluştur (relative path veya isim + boyut)
    const existingKeys = new Set();
    this.stagedUploadFiles.forEach(f => {
      existingKeys.add(`${f.webkitRelativePath || f.name}__${f.size}`);
    });

    let newlyAdded = 0;
    incoming.forEach(f => {
      const key = `${f.webkitRelativePath || f.name}__${f.size}`;
      if (!existingKeys.has(key)) {
        existingKeys.add(key);
        this.stagedUploadFiles.push(f);
        newlyAdded++;
      }
    });

    // Klasör seçim inputlarının değerini sıfırla ki ardışık klasör seçimlerinde change tetiklensin
    if (hubFileInput) hubFileInput.value = '';
    if (hubFolderInput) hubFolderInput.value = '';

    if (previousCount > 0 && newlyAdded > 0) {
      this.showToast(`${newlyAdded} yeni dosya listeye eklendi. Toplam ${this.stagedUploadFiles.length} dosya hazır.`, 'info');
    }

    if (hubStagedSummaryRow && hubStagedCountText) {
      if (this.stagedUploadFiles.length > 0) {
        hubStagedSummaryRow.style.display = 'flex';
        const imgs = this.stagedUploadFiles.filter(f => !f.name.toLowerCase().endsWith('.txt')).length;
        const lbls = this.stagedUploadFiles.filter(f => f.name.toLowerCase().endsWith('.txt')).length;
        hubStagedCountText.textContent = `✓ ${imgs} görsel ve ${lbls} etiket dosyası seçildi`;
        const detailsEl = document.getElementById('hubStagedDetailsText') || document.getElementById('hubStagedDetailsDetails');
        if (detailsEl) detailsEl.textContent = `Yüklemeye hazır. Toplam boyut: ${(this.stagedUploadFiles.reduce((a, b) => a + (b.size || 0), 0) / (1024 * 1024)).toFixed(1)} MB`;
      } else {
        hubStagedSummaryRow.style.display = 'none';
      }
    }
  };

  hubFileInput?.addEventListener('change', (e) => updateStagedUploadFiles(e.target.files));
  hubFolderInput?.addEventListener('change', (e) => updateStagedUploadFiles(e.target.files));

  hubLargeDropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    hubLargeDropzone.classList.add('dragover');
  });
  hubLargeDropzone?.addEventListener('dragleave', () => {
    hubLargeDropzone.classList.remove('dragover');
  });
  hubLargeDropzone?.addEventListener('drop', async (e) => {
    e.preventDefault();
    hubLargeDropzone.classList.remove('dragover');
    const files = await this.getFilesFromDataTransfer(e.dataTransfer);
    updateStagedUploadFiles(files);
  });

  if (hubConfirmUploadBtn && !hubConfirmUploadBtn._uploadWired) {
    hubConfirmUploadBtn._uploadWired = true;
    hubConfirmUploadBtn.addEventListener('click', async () => {
      if (!this.stagedUploadFiles || this.stagedUploadFiles.length === 0) {
        this.showToast('Lütfen önce dosya seçiniz.', 'warning');
        return;
      }
      if (!this.activeHubProjectId) return;

      // Etiket .txt dosyalarını önce sırala, böylece görseller yüklendiğinde etiketler diskte hazır olsun
      this.stagedUploadFiles.sort((a, b) => {
        const aIsTxt = a.name.toLowerCase().endsWith('.txt') ? 1 : 0;
        const bIsTxt = b.name.toLowerCase().endsWith('.txt') ? 1 : 0;
        return bIsTxt - aIsTxt;
      });

      const totalFiles = this.stagedUploadFiles.length;
      const splitOpt = document.getElementById('uploadAutoBatchSplitSelect')?.value || '500';
      const splitSize = splitOpt === 'none' ? 1000 : parseInt(splitOpt, 10);
      const CHUNK_SIZE = Math.min(1000, splitSize);
      const bName = document.getElementById('uploadBatchNameInput')?.value.trim() || '';
      const bTags = document.getElementById('uploadTagsInput')?.value.trim() || '';
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';

      this.showLoading(true, {
        title: 'Görseller Yükleniyor ve Doğrulanıyor...',
        text: 'Lütfen bekleyiniz, dosyalar taranıp yerel depoya aktarılıyor...',
        status: 'Yükleme başlatılıyor',
        progress: { pct: 0, current: 0, total: totalFiles }
      });

      let totalBytesAll = this.stagedUploadFiles.reduce((acc, f) => acc + (f.size || 0), 0) || 1;
      let totalBytesUploaded = 0;
      let uploadedFilesCount = 0;

      const convertToWebp = (document.getElementById('uploadWebpConvertSelect')?.value || 'auto') === 'auto';

      try {
        const totalChunks = Math.ceil(totalFiles / CHUNK_SIZE);
        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
          let chunkFiles = this.stagedUploadFiles.slice(chunkIdx * CHUNK_SIZE, (chunkIdx + 1) * CHUNK_SIZE);

          if (convertToWebp) {
            this.showLoading(true, {
              title: `Görseller WebP Formatına Dönüştürülüyor (${chunkIdx + 1}/${totalChunks})...`,
              text: 'Donanım hızlandırmalı WebP sıkıştırması uygulanıyor (%85 boyut tasarrufu)...',
              status: 'Hızlı WebP dönüştürme',
              progress: { pct: Math.round((chunkIdx / totalChunks) * 100), current: uploadedFilesCount, total: totalFiles }
            });
            chunkFiles = await this.batchConvertFilesToWebp(chunkFiles, (done, count) => {
              if (this.isLoadingMinimized) {
                this.updateFloatingUploadWidget(
                  Math.round((chunkIdx / totalChunks) * 100),
                  uploadedFilesCount + done,
                  totalFiles,
                  bName || 'WebP Optimizasyonu'
                );
              }
            });
          }

          const formData = new FormData();
          formData.append('category', this.activeHubProjectId);
          if (bName) formData.append('batch_name', totalChunks > 1 ? `${bName} (Part ${chunkIdx + 1}/${totalChunks})` : bName);
          if (bTags) formData.append('batch_tags', bTags);
          chunkFiles.forEach(f => formData.append('files', f));

          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/projects/upload-images');
            if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

            let previousChunkLoaded = 0;
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const chunkDelta = e.loaded - previousChunkLoaded;
                previousChunkLoaded = e.loaded;
                totalBytesUploaded += chunkDelta;

                const overallPct = Math.min(99, Math.round((totalBytesUploaded / totalBytesAll) * 100));
                const loadedMB = (totalBytesUploaded / (1024 * 1024)).toFixed(1);
                const totalMB = (totalBytesAll / (1024 * 1024)).toFixed(1);
                const estimatedFiles = Math.min(totalFiles, uploadedFilesCount + Math.round((e.loaded / e.total) * chunkFiles.length));

                this.showLoading(true, {
                  title: `Görseller Yükleniyor... (%${overallPct})`,
                  text: `Paket ${chunkIdx + 1} / ${totalChunks} — ${loadedMB} MB / ${totalMB} MB aktarıldı.`,
                  status: 'YOLO formatı ve görsel bütünlüğü kontrol ediliyor',
                  progress: {
                    pct: overallPct,
                    current: estimatedFiles,
                    total: totalFiles
                  }
                });
              }
            };

            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                uploadedFilesCount += chunkFiles.length;
                resolve();
              } else {
                try {
                  const errJson = JSON.parse(xhr.responseText);
                  reject(new Error(errJson.detail || `HTTP ${xhr.status}`));
                } catch (e) {
                  reject(new Error(`Hata HTTP ${xhr.status}`));
                }
              }
            };
            xhr.timeout = 300000;
            xhr.ontimeout = () => reject(new Error('Sunucu yanıt verme zaman aşımına uğradı.'));
            xhr.onerror = () => reject(new Error('Ağ bağlantı hatası oluştu.'));
            xhr.send(formData);
          });
        }

        this.showLoading(true, {
          title: 'Yükleme Başarıyla Tamamlandı!',
          text: `${totalFiles} dosya sisteme eklendi ve doğrulandı.`,
          status: 'İşlem tamamlandı',
          progress: {
            pct: 100,
            current: totalFiles,
            total: totalFiles
          }
        });
        this.showToast(`${totalFiles} dosya başarıyla yüklendi!`, 'success');

        setTimeout(async () => {
          this.showLoading(false);
          this.stagedUploadFiles = [];
          const hubStagedSummaryRow = document.getElementById('hubStagedSummaryRow');
          if (hubStagedSummaryRow) hubStagedSummaryRow.style.display = 'none';

          // Refresh all project hub data, images and live badge counters
          await this.loadHubProjectData();

          // Switch to annotate tab and show newly uploaded batch
          this.switchProjectTab('annotate');
        }, 800);

      } catch (err) {
        console.error(err);
        this.showLoading(false);
        this.showToast(err.message || 'Yükleme başarısız oldu.', 'error');
      }
    });
  }

  // Hub Tab: Dataset Export and Batch AI buttons
  document.getElementById('hubExportZipBtn')?.addEventListener('click', () => {
    if (this.activeHubProjectId) this.openExportModal(this.activeHubProjectId);
  });

  document.getElementById('hubHealthCheckBtn')?.addEventListener('click', () => {
    if (this.activeHubProjectId) this.openHealthModal(this.activeHubProjectId);
  });

  document.getElementById('hubAugmentationBtn')?.addEventListener('click', () => {
    if (this.activeHubProjectId) this.openAugmentationModal(this.activeHubProjectId);
  });

  document.getElementById('hubBatchAiBtn')?.addEventListener('click', () => {
    if (this.activeHubProjectId) this.openBatchModal(this.activeHubProjectId);
  });

  document.getElementById('datasetFilterStatus')?.addEventListener('change', () => {
    this.renderDatasetGallery();
  });

  document.getElementById('datasetSearchInput')?.addEventListener('input', () => {
    this.renderDatasetGallery();
  });

  document.getElementById('toggleAnnotationsCheck')?.addEventListener('change', () => {
    this.renderDatasetGallery();
  });

  // Hub Settings Save & Delete
  document.getElementById('hubSaveSettingsBtn')?.addEventListener('click', async () => {
    if (!this.activeHubProjectId) return;
    const dName = document.getElementById('hubSettingsDisplayName')?.value.trim() || this.activeHubProjectId;
    const dDesc = document.getElementById('hubSettingsDesc')?.value.trim() || '';
    const dVis = document.getElementById('hubSettingsVisibilitySelect')?.value || 'private';
    const dModel = document.getElementById('hubSettingsModelSelect')?.value || 'yolov8s-worldv2';

    const cRows = document.querySelectorAll('#hubSettingsClassesList .cls-row-pill');
    const classes = [];
    cRows.forEach((r, idx) => {
      const cName = r.querySelector('.hub-c-name')?.value.trim() || `Class_${idx}`;
      const cColor = r.querySelector('.hub-c-color')?.value || '#3b82f6';
      const pRaw = r.querySelector('.hub-c-prompts')?.value.trim() || cName.toLowerCase();
      const prompts = pRaw.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
      const origId = r.dataset.originalId !== undefined ? parseInt(r.dataset.originalId) : idx;
      classes.push({ id: idx, original_id: origId, name: cName, color: cColor, prompts });
    });

    if (classes.length === 0) {
      this.showToast('Projede en az 1 sınıf bulunmalıdır! Lütfen bir sınıf ekleyiniz.', 'warning');
      return;
    }

    // Check if class order (IDs) has changed
    const hasIdChanged = classes.some(c => c.original_id !== undefined && c.original_id !== c.id);
    let remapLabels = false;

    if (hasIdChanged) {
      const ans = await this.showConfirm({
        title: 'Sınıf ID ve Etiket Senkronizasyonu',
        subtitle: 'Akıllı Etiket Güncelleme',
        message: "Sınıf sıralaması veya ID numaraları değiştirildi!\n\nProjedeki mevcut etiket dosyalarındaki kutu ID'leri de yeni sıralamaya göre otomatik olarak dönüştürülsün mü?\n\n• [Evet, Dönüştür]: Etiketler bozulmadan yeni sınıf numaralarına güncellenir (Önerilen).\n• [Sadece Listeyi Kaydet]: Yalnızca sınıf listesi sırası kaydedilir, mevcut etiketler korunur.",
        confirmText: 'Evet, Dönüştür',
        cancelText: 'Sadece Listeyi Kaydet',
        type: 'warning'
      });
      if (ans) {
        remapLabels = true;
      }
    }

    this.showLoading(true, remapLabels ? 'Sınıflar kaydediliyor ve etiketler dönüştürülüyor...' : 'Ayarlar kaydediliyor...');
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/project-settings/save', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          category: this.activeHubProjectId,
          display_name: dName,
          description: dDesc,
          visibility: dVis,
          model_key: dModel,
          classes: classes,
          remap_labels: remapLabels
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (data.remapped_files && data.remapped_files > 0) {
          this.showToast(`🎉 Sınıf ayarları kaydedildi ve ${data.remapped_files} etiket dosyasındaki ID'ler başarıyla güncellendi! ✓`, 'success');
        } else {
          this.showToast('Sınıflar ve proje ayarları başarıyla kaydedildi! ✓', 'success');
        }
        await Promise.all([
          this.loadHubProjectData(),
          this.loadDashboardProjects(),
          this.loadCategories(this.activeHubProjectId)
        ]);
        await this.renderHubSettings();
        if (this.currentView === 'editor' && this.currentCategory === this.activeHubProjectId) {
          this.render();
          this.updateBoxesList();
        }
      } else {
        const errMsg = data && data.detail ? data.detail : 'Kaydedilemedi.';
        this.showToast(errMsg, 'error');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Bağlantı hatası.', 'error');
    } finally {
      this.showLoading(false);
    }
  });

  // Wire Training & Export Studio Events (hubDeleteProjectBtn is already wired in workspace-ui.js)
  this.setupTrainingStudio();
  this.setupExportStudio();

  document.getElementById('pageRefreshQualityBtn')?.addEventListener('click', () => {
    this.loadQualityAnalysis(true);
    this.showToast('Veri seti kalite analizi güncelleniyor...', 'info');
  });

  document.getElementById('pageRefreshStatsBtn')?.addEventListener('click', () => {
    this.loadLabelingStats(true);
    this.showToast('Etiketleme istatistikleri güncelleniyor...', 'info');
  });

  document.getElementById('pageRefreshReviewQueueBtn')?.addEventListener('click', () => {
    this.loadReviewQueue(true);
    this.showToast('İnceleme kuyruğu güncelleniyor...', 'info');
  });

  document.getElementById('scanDuplicatesBtn')?.addEventListener('click', () => {
    this.runDuplicateScan(true);
    this.showToast('Kopya görsel taraması başlatıldı...', 'info');
  });

  document.getElementById('pageApproveAllBtn')?.addEventListener('click', async () => {
    const cat = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'accessory_detection_project';
    const queueCountTxt = document.getElementById('pageRqQueueCount')?.textContent || '';

    const confirmed = await this.showConfirm({
      title: 'Tüm İncelemeleri Onayla',
      subtitle: 'Toplu Kalite Onayı',
      message: `Projedeki tüm inceleme bekleyen görseller (${queueCountTxt}) tek seferde ONAYLANACAK.\n\nTüm etiketlerin doğruluğunu onaylıyor musunuz?`,
      confirmText: 'Evet, Hepsini Onayla',
      cancelText: 'Vazgeç',
      type: 'info'
    });
    if (!confirmed) return;

    this.showLoading(true, 'Tüm görseller onaylanıyor ve kaydediliyor...');
    try {
      const res = await fetch('/api/projects/approve-all-reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, scope: 'all' })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(`🎉 ${data.approved_count.toLocaleString()} görselin tamamı başarıyla onaylandı! ✓`, 'success');
        await this.loadReviewQueue();
      } else {
        this.showToast(data.detail || 'Toplu onaylama başarısız oldu.', 'error');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Sunucu bağlantı hatası oluştu.', 'error');
    } finally {
      this.showLoading(false);
    }
  });



  // Legacy modal cleanup (redirected to full view)
  document.getElementById('submitCreateProjectBtn')?.addEventListener('click', () => {
    const m = document.getElementById('createProjectModal');
    if (m) m.style.display = 'none';
    this.showCreateProject();
  });

  // Sidebar Image & Folder Upload Buttons & Inputs
  const uploadImagesSidebarBtn = document.getElementById('uploadImagesSidebarBtn');
  const uploadFolderSidebarBtn = document.getElementById('uploadFolderSidebarBtn');
  const sidebarUploadFileInput = document.getElementById('sidebarUploadFileInput');
  const sidebarUploadFolderInput = document.getElementById('sidebarUploadFolderInput');

  const validDatasetExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.txt'];

  uploadImagesSidebarBtn?.addEventListener('click', () => sidebarUploadFileInput?.click());
  sidebarUploadFileInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []).filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return validDatasetExts.includes(ext);
    });
    if (files.length > 0 && this.currentCategory) {
      await this.uploadImagesToCategory(this.currentCategory, files);
      sidebarUploadFileInput.value = '';
    }
  });

  uploadFolderSidebarBtn?.addEventListener('click', () => sidebarUploadFolderInput?.click());
  sidebarUploadFolderInput?.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []).filter(f => {
      const ext = '.' + f.name.split('.').pop().toLowerCase();
      return validDatasetExts.includes(ext);
    });
    if (files.length > 0 && this.currentCategory) {
      await this.uploadImagesToCategory(this.currentCategory, files);
      sidebarUploadFolderInput.value = '';
    }
  });

  // Delete Project in Project Settings Modal
  document.getElementById('deleteProjectBtn')?.addEventListener('click', () => {
    if (this.activeSettingsCategory) {
      this.deleteProject(this.activeSettingsCategory);
    }
  });

  // Project search & sort in dashboard
  this.projectSearchInput?.addEventListener('input', () => this.renderDashboardProjects());
  this.projectSortSelect?.addEventListener('change', () => this.renderDashboardProjects());

  // Back to Dashboard button in editor header — handled in setupEventListeners via openProject()


  // Global sayfa yenileme / sekme kapatma koruma uyarısı
  if (!this._globalBeforeUnloadInstalled) {
    this._globalBeforeUnloadInstalled = true;
    window.addEventListener('beforeunload', (e) => {
      const hasActiveBatch = Boolean(this._isBatchActive || this.batchPollTimer);
      const hasActiveSingleAi = Boolean(this.isAiProcessing);
      const hasUnsavedCanvas = Boolean(this.isDirty);
      if (hasActiveBatch || hasActiveSingleAi || hasUnsavedCanvas) {
        e.preventDefault();
        e.returnValue = 'Devam eden işlem veya kaydedilmemiş etiket değişiklikleri var. Sayfayı yenilerseniz veriler kaybolabilir.';
        return e.returnValue;
      }
    });
  }

  // Batch Auto-Labeling Modal
  document.getElementById('batchConfRange')?.addEventListener('input', (e) => {
    const pct = Math.round(parseFloat(e.target.value) * 100);
    const confVal = document.getElementById('batchConfVal');
    if (confVal) confVal.textContent = `%${pct}`;
  });

  document.getElementById('batchStartExecutionBtn')?.addEventListener('click', () => {
    this.startBatchAutoLabel();
  });

  document.getElementById('batchMinimizeBtn')?.addEventListener('click', () => {
    const m = document.getElementById('batchAutoLabelModal');
    if (m) {
      m.style.display = 'none';
      m.classList.remove('active');
    }
    const fw = document.getElementById('batchFloatingWidget');
    if (fw) fw.style.display = 'flex';
  });

  const openFromWidget = () => {
    const fw = document.getElementById('batchFloatingWidget');
    if (fw) fw.style.display = 'none';
    const m = document.getElementById('batchAutoLabelModal');
    if (m) {
      m.style.display = 'flex';
      m.classList.add('active');
      m.style.opacity = '1';
      m.style.pointerEvents = 'auto';
      const cStep = document.getElementById('batchConfigStep');
      const pStep = document.getElementById('batchProgressStep');
      if (cStep) cStep.style.display = 'none';
      if (pStep) pStep.style.display = 'flex';
      if (this._lastBatchStatusData) {
        this._applyBatchProgressUI(this._lastBatchStatusData);
      }
      this.pollBatchStatus();
    }
  };

  document.getElementById('batchFloatingWidget')?.addEventListener('click', openFromWidget);
  document.getElementById('floatWidgetExpandBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openFromWidget();
  });

  document.getElementById('stopBatchBtn')?.addEventListener('click', () => this.stopBatchAutoLabel());

  // Export ZIP Modal
  document.getElementById('splitRatioRange')?.addEventListener('input', (e) => {
    const r = parseFloat(e.target.value);
    const trainPct = Math.round(r * 100);
    const valPct = 100 - trainPct;
    document.getElementById('splitRatioText').textContent = `%${trainPct} Train / %${valPct} Val`;
  });

  document.getElementById('generateZipBtn')?.addEventListener('click', () => this.generateDatasetZip());

  // Class Config Save
  document.getElementById('submitClassConfigBtn')?.addEventListener('click', () => this.saveClassConfig());

  // Few-Shot Context Menu item
  document.getElementById('ctxFindSimilar')?.addEventListener('click', () => {
    this.hideContextMenu();
    this.findSimilarForSelectedBox();
  });
}


openClassConfigModal(catId) {
  this.activeModalCategory = catId;
  const meta = this.classes[catId.toLowerCase()] || { id: 0, name: catId.capitalize(), color: '#3b82f6', prompts: [catId.toLowerCase()] };

  const container = document.getElementById('classConfigRows');
  if (container) {
    container.innerHTML = `
        <div class="form-group">
          <label>Sınıf ID & Adı:</label>
          <div class="class-inline-row">
            <input type="number" id="cfgClassId" value="${meta.id ?? 0}" style="width:70px;" min="0">
            <input type="text" id="cfgClassName" value="${meta.name || catId.capitalize()}" style="flex:1;">
            <input type="color" id="cfgClassColor" value="${meta.color || '#3b82f6'}">
          </div>
        </div>
      `;
  }

  const promptInput = document.getElementById('classPromptsInput');
  if (promptInput) {
    const promptsArr = meta.prompts || [catId.toLowerCase()];
    promptInput.value = promptsArr.join(', ');
  }

  const m = document.getElementById('classConfigModal');
  if (m) m.style.display = 'flex';
}

  async saveClassConfig() {
  if (!this.activeModalCategory) return;
  const id = parseInt(document.getElementById('cfgClassId')?.value || '0');
  const name = document.getElementById('cfgClassName')?.value.trim() || this.activeModalCategory;
  const color = document.getElementById('cfgClassColor')?.value || '#3b82f6';
  const prompts = (document.getElementById('classPromptsInput')?.value || '').split(',').map(s => s.trim()).filter(Boolean);

  try {
    const res = await fetch('/api/projects/update-classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: this.activeModalCategory,
        classes: [{ id, name, color, prompts }]
      })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      this.showToast('Sınıf ve AI prompt ayarları kaydedildi!', 'success');
      document.getElementById('classConfigModal').style.display = 'none';
      this.loadDashboardProjects();
    }
  } catch (e) {
    this.showToast('Ayarlar kaydedilemedi', 'error');
  }
}

  async openBatchModal(catId, batchId = null, batchName = null, batchFiles = null, forceProgress = false) {
  const finalCatId = catId || this.activeHubProjectId || new URLSearchParams(location.search).get('project') || new URLSearchParams(location.search).get('category') || 'bag';
  this.activeModalCategory = finalCatId;
  this.activeModalBatchId = batchId || null;
  this.activeModalBatchName = batchName || null;
  this.activeModalBatchFiles = batchFiles || null;

  const openSeq = (this._batchModalOpenSeq = (this._batchModalOpenSeq || 0) + 1);

  const cStep = document.getElementById('batchConfigStep');
  const pStep = document.getElementById('batchProgressStep');
  const descEl = document.getElementById('batchConfigTargetDesc');
  const m = document.getElementById('batchAutoLabelModal');
  const startBtn = document.getElementById('batchStartExecutionBtn');

  if (startBtn) startBtn.disabled = Boolean(this._isStartingBatch);

  // Açılış anında 0 ms tepki: bekleme yapmadan modalı hemen ekrana getir
  const knownRunningSameCat = Boolean(
    this._isBatchActive &&
    this._lastBatchStatusData &&
    this._lastBatchStatusData.status === 'running' &&
    (!this._lastBatchStatusData.category || this._lastBatchStatusData.category === finalCatId)
  );

  if (m) {
    m.style.display = 'flex';
    m.classList.add('active');
    m.style.opacity = '1';
    m.style.pointerEvents = 'auto';
  }

  if (knownRunningSameCat) {
    if (cStep) cStep.style.display = 'none';
    if (pStep) pStep.style.display = 'flex';
    this._applyBatchProgressUI(this._lastBatchStatusData);
    this.pollBatchStatus();
    return;
  }

  if (cStep) cStep.style.display = 'flex';
  if (pStep) pStep.style.display = 'none';
  if (descEl) {
    descEl.textContent = batchName
      ? `"${batchName}" yığınındaki görseller seçilen model ve ayarlarla otomatik etiketlenecektir.`
      : `"${finalCatId}" projesindeki görseller seçilen model ve ayarlarla otomatik etiketlenecektir.`;
  }
  this.loadModelHub();

  // Arka planda sunucuda zaten çalışan bir iş varsa canlı ilerlemeye geçir
  try {
    const chkController = new AbortController();
    const chkTimeout = setTimeout(() => chkController.abort(), 8000);
    const chk = await fetch(`/api/projects/batch-status?category=${encodeURIComponent(finalCatId)}`, {
      headers: this.getAuthHeaders(),
      signal: chkController.signal
    });
    clearTimeout(chkTimeout);
    if (openSeq !== this._batchModalOpenSeq || this._isStartingBatch) return;
    if (m && m.style.display === 'none') return;
    if (chk.ok) {
      const cData = await chk.json();
      if (cData && cData.status === 'running') {
        this._isBatchActive = true;
        if (cStep) cStep.style.display = 'none';
        if (pStep) pStep.style.display = 'flex';
        this._applyBatchProgressUI(cData);
        this.pollBatchStatus();
      }
    }
  } catch (e) { }
}

  async startBatchAutoLabel() {
  if (!this.activeModalCategory || this._isStartingBatch) return;
  this._isStartingBatch = true;
  this._isBatchActive = true;
  this._lastBatchStatusData = null;

  const startBtn = document.getElementById('batchStartExecutionBtn');
  if (startBtn) startBtn.disabled = true;

  // Read chosen options from Stage 1 Form
  const modelKey = document.getElementById('batchModelSelect')?.value || 'yolov8s-worldv2';
  const conf = parseFloat(document.getElementById('batchConfRange')?.value || '0.15');
  const scopeVal = document.querySelector('input[name="batchScopeRadio"]:checked')?.value || 'empty_only';
  const overwrite = (scopeVal === 'all');
  const emptyOnly = (scopeVal === 'empty_only');

  // Transition directly to Stage 2: Progress Step
  const cStep = document.getElementById('batchConfigStep');
  const pStep = document.getElementById('batchProgressStep');
  if (cStep) cStep.style.display = 'none';
  if (pStep) pStep.style.display = 'flex';

  const statusTitle = document.getElementById('batchStatusTitle');
  const statusSub = document.getElementById('batchStatusSub');
  const statusDetail = document.getElementById('batchStatusDetail');
  const processedEl = document.getElementById('batchProcessedCount');
  const remainingEl = document.getElementById('batchRemainingCount');
  const newEl = document.getElementById('batchNewCount');
  const pBar = document.getElementById('batchProgressBar');
  const pPct = document.getElementById('batchProgressPct');

  if (statusTitle) statusTitle.textContent = 'Yapay zeka nesneleri tespit ediyor...';
  if (statusSub) statusSub.textContent = this.activeModalBatchName ? `Yığın: ${this.activeModalBatchName}` : 'Lütfen bekleyiniz.';
  if (statusDetail) statusDetail.textContent = 'Görseller taranıyor ve hazırlanıyor...';
  if (pBar) pBar.style.width = '0%';
  if (pPct) pPct.textContent = '%0.0';
  if (processedEl) processedEl.textContent = 'Taranıyor ve hazırlanıyor...';
  if (remainingEl) remainingEl.textContent = 'Kalan: Hesaplanıyor...';
  if (newEl) newEl.textContent = '+0 yeni etiketlendi';

  try {
    const res = await fetch('/api/projects/batch-auto-label', {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        category: this.activeModalCategory,
        conf_threshold: conf,
        overwrite_existing: overwrite,
        empty_only: emptyOnly,
        model_key: modelKey,
        batch_id: this.activeModalBatchId,
        target_filenames: this.activeModalBatchFiles
      })
    });
    const data = await res.json();
    if (res.ok && (data.status === 'started' || data.status === 'already_running')) {
      this._isBatchActive = true;
      this.pollBatchStatus();
    } else {
      this._isBatchActive = false;
      this.showToast(data.detail || data.message || 'İşlem başlatılamadı', 'error');
      // Başlatılamazsa config adımına geri döndür
      if (cStep) cStep.style.display = 'flex';
      if (pStep) pStep.style.display = 'none';
      if (this.batchPollTimer) {
        clearInterval(this.batchPollTimer);
        this.batchPollTimer = null;
      }
    }
  } catch (e) {
    this._isBatchActive = false;
    this.showToast('Toplu etiketleme başlatılamadı: ' + (e.message || ''), 'error');
    if (cStep) cStep.style.display = 'flex';
    if (pStep) pStep.style.display = 'none';
    if (this.batchPollTimer) {
      clearInterval(this.batchPollTimer);
      this.batchPollTimer = null;
    }
  } finally {
    this._isStartingBatch = false;
    if (startBtn) startBtn.disabled = false;
  }
}

_applyBatchProgressUI(data) {
  if (!data || data.status !== 'running') return;
  this._lastBatchStatusData = data;

  const total = data.total || 0;
  const current = data.current || 0;
  const newly = data.newly_labeled || 0;
  const remaining = Math.max(0, total - current);
  const pct = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';

  const pBar = document.getElementById('batchProgressBar');
  const pPct = document.getElementById('batchProgressPct');
  const pCount = document.getElementById('batchProcessedCount');
  const pRemaining = document.getElementById('batchRemainingCount');
  const pNew = document.getElementById('batchNewCount');
  const pTitle = document.getElementById('batchStatusTitle');
  const pSub = document.getElementById('batchStatusSub');
  const pDetail = document.getElementById('batchStatusDetail');

  if (pBar) pBar.style.width = `${pct}%`;
  if (pPct) pPct.textContent = `%${pct}`;
  if (pCount) {
    pCount.textContent = total > 0 ? `${current.toLocaleString()} / ${total.toLocaleString()} Resim İşlendi` : (data.status_message || 'Taranıyor ve hazırlanıyor...');
  }
  if (pRemaining) pRemaining.textContent = total > 0 ? `Kalan: ${remaining.toLocaleString()} resim` : 'Kalan: Hesaplanıyor...';
  if (pNew) pNew.textContent = `+${newly.toLocaleString()} yeni etiketlendi`;
  if (pTitle) pTitle.textContent = 'Yapay zeka nesneleri tespit ediyor...';
  if (pSub) pSub.textContent = this.activeModalBatchName ? `Yığın: ${this.activeModalBatchName}` : 'Lütfen bekleyiniz.';
  if (pDetail) pDetail.textContent = data.eta_str ? `Kalan Süre: ~${data.eta_str} • İşlem devam ediyor` : (data.status_message || 'İşlem devam ediyor');

  const fwTitle = document.getElementById('floatWidgetTitle');
  const fwPct = document.getElementById('floatWidgetPct');
  const fwSub = document.getElementById('floatWidgetSub');
  if (fwTitle) fwTitle.textContent = `${data.category || this.activeModalCategory || 'AI'}`;
  if (fwPct) fwPct.textContent = `%${pct}`;
  if (fwSub) fwSub.textContent = data.eta_str ? `Kalan: ~${data.eta_str} (${current}/${total})` : (current > 0 || total > 0 ? `${current}/${total} işlendi` : (data.status_message || 'Hazırlanıyor...'));
}

pollBatchStatus() {
  if (this.batchPollTimer) clearInterval(this.batchPollTimer);
  if (!this.activeModalCategory) return;

  let consecutiveErrors = 0;

  const doPoll = async () => {
    if (!this.activeModalCategory) {
      clearInterval(this.batchPollTimer);
      this.batchPollTimer = null;
      return;
    }
    try {
      const res = await fetch(`/api/projects/batch-status?category=${encodeURIComponent(this.activeModalCategory)}`, {
        headers: this.getAuthHeaders()
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 403 || ++consecutiveErrors >= 5) {
          clearInterval(this.batchPollTimer);
          this.batchPollTimer = null;
          const fw = document.getElementById('batchFloatingWidget');
          if (fw) fw.style.display = 'none';
        }
        return;
      }
      consecutiveErrors = 0;
      const data = await res.json();

      const fw = document.getElementById('batchFloatingWidget');

      if (data.status === 'running') {
        this._isBatchActive = true;
        this._applyBatchProgressUI(data);

      } else if (data.status === 'completed') {
        this._isBatchActive = false;
        this._lastBatchStatusData = null;
        const pBar = document.getElementById('batchProgressBar');
        const pPct = document.getElementById('batchProgressPct');
        const pTitle = document.getElementById('batchStatusTitle');
        const pSub = document.getElementById('batchStatusSub');
        const pDetail = document.getElementById('batchStatusDetail');

        if (pBar) pBar.style.width = `100%`;
        if (pPct) pPct.textContent = `%100.0`;
        if (pTitle) pTitle.textContent = 'Toplu Etiketleme Tamamlandı! 🎉';
        if (pSub) pSub.textContent = 'Tüm resimler başarıyla tarandı ve etiketlendi.';
        if (pDetail) pDetail.textContent = 'İşlem tamamlandı.';

        if (fw) fw.style.display = 'none';

        clearInterval(this.batchPollTimer);
        this.batchPollTimer = null;
        setTimeout(() => {
          const m = document.getElementById('batchAutoLabelModal');
          if (m) {
            m.style.display = 'none';
            m.classList.remove('active');
            m.style.opacity = '0';
            m.style.pointerEvents = 'none';
          }
          this.loadHubProjectData();
          if (this.currentView === 'editor') {
            this.loadCategories(this.currentCategory);
          }
        }, 1800);

      } else if (data.status === 'failed' || data.status === 'idle') {
        this._isBatchActive = false;
        this._lastBatchStatusData = null;
        const pTitle = document.getElementById('batchStatusTitle');
        const pSub = document.getElementById('batchStatusSub');
        const pDetail = document.getElementById('batchStatusDetail');
        const isRestart = data.status === 'idle';
        const errTxt = isRestart
          ? 'Sunucu yeniden başlatıldığı için aktif iş oturumu sıfırlandı. Lütfen tekrar başlatın.'
          : (data.error_msg || 'Sunucu tarafında beklenmeyen bir hata oluştu.');

        if (pTitle) pTitle.textContent = isRestart ? 'Oturum Sıfırlandı' : 'İşlem Başarısız Oldu';
        if (pSub) pSub.textContent = errTxt;
        if (pDetail) pDetail.textContent = 'Durduruldu';

        this.showToast(errTxt, 'error');
        if (fw) fw.style.display = 'none';
        clearInterval(this.batchPollTimer);
        this.batchPollTimer = null;

        const cStep = document.getElementById('batchConfigStep');
        const pStep = document.getElementById('batchProgressStep');
        if (cStep) cStep.style.display = 'flex';
        if (pStep) pStep.style.display = 'none';

      } else {
        this._isBatchActive = false;
        this._lastBatchStatusData = null;
        // stopped
        const pTitle = document.getElementById('batchStatusTitle');
        const pSub = document.getElementById('batchStatusSub');
        const pDetail = document.getElementById('batchStatusDetail');

        if (pTitle) pTitle.textContent = 'İşlem Durduruldu';
        if (pSub) pSub.textContent = 'Etiketleme kullanıcı tarafından duraklatıldı.';
        if (pDetail) pDetail.textContent = 'Durduruldu';

        if (fw) fw.style.display = 'none';
        clearInterval(this.batchPollTimer);
        this.batchPollTimer = null;
        
        // Modalı otomatik kapat veya config adımına geri döndür
        const m = document.getElementById('batchAutoLabelModal');
        if (m && m.style.display !== 'none') {
          setTimeout(() => {
            m.style.display = 'none';
            m.classList.remove('active');
            m.style.opacity = '0';
            m.style.pointerEvents = 'none';
            const cStep = document.getElementById('batchConfigStep');
            const pStep = document.getElementById('batchProgressStep');
            if (cStep) cStep.style.display = 'flex';
            if (pStep) pStep.style.display = 'none';
          }, 1200);
        }
      }
    } catch (e) {
      if (++consecutiveErrors >= 5) {
        clearInterval(this.batchPollTimer);
        this.batchPollTimer = null;
      }
    }
  };

  doPoll();
  this.batchPollTimer = setInterval(doPoll, 2000);
}

  async stopBatchAutoLabel() {
  if (!this.activeModalCategory) return;
  try {
    await fetch(`/api/projects/batch-stop?category=${encodeURIComponent(this.activeModalCategory)}`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    this._isBatchActive = false;
    this._lastBatchStatusData = null;
    this.showToast('Etiketleme durduruldu.', 'info');
    if (this.batchPollTimer) {
      clearInterval(this.batchPollTimer);
      this.batchPollTimer = null;
    }
    const fw = document.getElementById('batchFloatingWidget');
    if (fw) fw.style.display = 'none';
    const cStep = document.getElementById('batchConfigStep');
    const pStep = document.getElementById('batchProgressStep');
    if (cStep) cStep.style.display = 'flex';
    if (pStep) pStep.style.display = 'none';
  } catch (e) { }
}

  async checkRunningBatchStatus(categoryId) {
  const cat = categoryId || this.activeHubProjectId || this.currentCategory;
  if (!cat) return;
  try {
    const res = await fetch(`/api/projects/batch-status?category=${encodeURIComponent(cat)}`, {
      headers: this.getAuthHeaders()
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.status === 'running') {
      this._isBatchActive = true;
      this.activeModalCategory = cat;
      const fw = document.getElementById('batchFloatingWidget');
      const fwTitle = document.getElementById('floatWidgetTitle');
      const fwPct = document.getElementById('floatWidgetPct');
      const fwSub = document.getElementById('floatWidgetSub');

      const total = data.total || 0;
      const current = data.current || 0;
      const pct = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';

      if (fw) {
        fw.style.display = 'flex';
        fw.onclick = () => {
          fw.style.display = 'none';
          const m = document.getElementById('batchAutoLabelModal');
          const cStep = document.getElementById('batchConfigStep');
          const pStep = document.getElementById('batchProgressStep');
          if (m && cStep && pStep) {
            cStep.style.display = 'none';
            pStep.style.display = 'flex';
            m.style.display = 'flex';
            m.classList.add('active');
            m.style.opacity = '1';
            m.style.pointerEvents = 'all';
            if (this._lastBatchStatusData) {
              this._applyBatchProgressUI(this._lastBatchStatusData);
            }
            this.pollBatchStatus();
          }
        };
      }
      this._applyBatchProgressUI(data);

      this.showToast(`Arka planda devam eden otomatik etiketleme algılandı (%${pct}) ⚡`, 'info');
      this.pollBatchStatus();
    }
  } catch (e) {
    console.warn('Batch status check failed:', e);
  }
}

openExportModal(catId) {
  this.activeModalCategory = catId;
  document.getElementById('exportResultArea').style.display = 'none';
  document.getElementById('generateZipBtn').style.display = 'inline-flex';

  const m = document.getElementById('exportZipModal');
  if (m) m.style.display = 'flex';
}

  async generateDatasetZip() {
  if (!this.activeModalCategory) return;
  const ratio = parseFloat(document.getElementById('splitRatioRange')?.value || '0.80');
  const btn = document.getElementById('generateZipBtn');
  if (btn) btn.textContent = 'Paketleniyor...';

  try {
    const res = await fetch('/api/projects/export-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: this.activeModalCategory, train_ratio: ratio })
    });
    const data = await res.json();
    if (data.status === 'ok') {
      const link = document.getElementById('downloadZipLink');
      if (link) {
        link.href = data.r2_download_url || data.download_url;
        link.setAttribute('download', `${this.activeModalCategory}_dataset.zip`);
      }
      document.getElementById('exportResultArea').style.display = 'block';
      if (btn) btn.style.display = 'none';
      this.showToast(`${data.total_exported} resimlik ZIP paketi hazır (${data.file_size_mb} MB)`, 'success');
    } else {
      this.showToast(data.detail || 'Dışa aktarma başarısız', 'error');
    }
  } catch (e) {
    this.showToast('ZIP oluşturulurken hata oluştu', 'error');
  } finally {
    if (btn) btn.textContent = 'Paketle & Oluştur';
  }
}

  // =====================================================
  // FEW-SHOT / VISUAL SIMILARITY MATCHER
  // =====================================================

  async findSimilarForSelectedBox() {
  if (this.selectedBoxIndices.size === 0 || !this.currentImage) {
    this.showToast('Lütfen önce referans alınacak bir kutu seçin.', 'warning');
    return;
  }

  const singleIdx = Array.from(this.selectedBoxIndices)[0];
  const box = this.boxes[singleIdx];
  if (!box) return;

  this.showToast('Görsel benzerlik taranıyor...', 'info');

  try {
    const res = await fetch('/api/find-similar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: this.currentCategory,
        ref_image: this.currentImage.filename,
        box: box,
        min_similarity: 0.65
      })
    });
    const data = await res.json();
    if (data.status === 'ok' && data.matches && data.matches.length > 0) {
      this.lastSimilarMatches = data.matches;
      const grid = document.getElementById('findSimilarResultsGrid');
      if (grid) {
        grid.innerHTML = data.matches.map(m => `
            <div class="similar-match-card">
              <img src="/api/image-file?category=${this.currentCategory}&filename=${m.filename}">
              <strong>${m.filename}</strong>
              <span>Benzerlik: %${Math.round(m.similarity * 100)}</span>
            </div>
          `).join('');
      }
      document.getElementById('findSimilarModal').style.display = 'flex';
      this.showToast(`${data.matches.length} benzer nesne bulundu.`, 'success');
    } else {
      this.showToast('Benzer nesne bulunamadı veya kutu eşik altında kaldı.', 'info');
    }
  } catch (e) {
    this.showToast('Benzerlik tarama hatası', 'error');
  }
}

// =====================================================
// EDITOR EVENT LISTENERS & LOGIC
// =====================================================

setupEventListeners() {
  // Back to Project Annotation Screen (Smooth SPA Transition)
  const handleBackToDash = () => {
    const targetProject = this.currentCategory || this.activeHubProjectId || new URLSearchParams(window.location.search).get('editor') || 'giyim_ve_aksesuar_tespiti_projesi';
    const returnTab = this.editorReturnTab || 'annotate';

    // Sayfa yenilemesi olmadan doğrudan projenin Kanban/Annotate ekranına geç
    this.openProject(targetProject, returnTab, true);
  };
  document.getElementById('backToDashBtn')?.addEventListener('click', handleBackToDash);

  // Havuza / Etiketlenmemişler Listesine İade Et Butonu
  document.getElementById('resetToUnlabeledBtn')?.addEventListener('click', () => {
    this.resetCurrentImageToUnlabeled();
  });

  this.setupModelHubEventListeners();
  this.setupTeamSyncEvents();

  // Mode Switches
  this.toolDrawBtn?.addEventListener('click', () => this.setMode('draw'));
  this.toolPolygonBtn?.addEventListener('click', () => this.setMode('polygon'));
  this.toolSelectBtn?.addEventListener('click', () => this.setMode('select'));
  this.toolPanBtn?.addEventListener('click', () => this.setMode('pan'));

  document.getElementById('toolSmartSegmentBtn')?.addEventListener('click', () => {
    this.setMode('smart-segment');
    this.showToast('🪄 Akıllı Tıkla modu: Nesnenin üzerine tek sol tık atınız.', 'info');
  });

  document.getElementById('toolTightenBtn')?.addEventListener('click', (e) => {
    const btn = e.currentTarget;
    btn.style.background = 'linear-gradient(135deg, rgba(56,189,248,0.4), rgba(14,165,233,0.55))';
    btn.style.borderColor = '#38bdf8';
    btn.style.color = '#ffffff';
    btn.style.boxShadow = '0 0 16px rgba(56,189,248,0.8), inset 0 0 8px rgba(255,255,255,0.3)';
    btn.style.transform = 'scale(1.04)';
    setTimeout(() => {
      btn.style.background = 'rgba(56,189,248,0.08)';
      btn.style.borderColor = 'rgba(56,189,248,0.3)';
      btn.style.color = '#38bdf8';
      btn.style.boxShadow = 'none';
      btn.style.transform = 'scale(1)';
    }, 1200);
    this.refineSelectedBoxes();
  });

  // Category Change in editor dropdown
  this.categorySelect.addEventListener('change', (e) => {
    this.currentCategory = e.target.value;
    this.currentIndex = 0;
    this.loadCategoryImages();
  });

  // Filter Change
  this.filterSelect?.addEventListener('change', () => this.applyFilter());

  // Search Input
  this.imageSearchInput.addEventListener('input', () => this.applyFilter());

  // Navigation Buttons
  this.prevBtn.addEventListener('click', () => this.navigatePrev());
  this.nextBtn.addEventListener('click', () => this.navigateNext());

  // Direct Image Number Jump
  this.imageIndexInput.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= this.filteredImages.length) {
      this.goToIndex(val - 1);
    } else {
      e.target.value = this.currentIndex + 1;
    }
  });

  // Auto-Save Toggle & Manual Save
  this.autoSaveToggle.addEventListener('change', (e) => {
    this.autoSave = e.target.checked;
  });
  this.manualSaveBtn.addEventListener('click', () => this.saveCurrentLabel(true));
  document.getElementById('approveAndNextBtn')?.addEventListener('click', async () => {
    await this.saveCurrentLabel(true, true);
  });
  document.getElementById('deleteImageHeaderBtn')?.addEventListener('click', () => {
    this.deleteCurrentImage();
  });

  // Active Class Selector
  this.activeClassSelect.addEventListener('change', (e) => {
    this.activeClassId = parseInt(e.target.value, 10);
    if (this.selectedBoxIndices.size > 0) {
      this.saveHistory();
      this.selectedBoxIndices.forEach(idx => {
        if (this.boxes[idx]) {
          this.boxes[idx].class_id = this.activeClassId;
          this.boxes[idx].class_name = this.getClassName(this.activeClassId);
        }
      });
      this.setDirty(true);
      this.render();
      this.updateBoxesList();
    }
  });

  // Box Actions
  if (this.deleteSelectedBtn && !this.deleteSelectedBtn._wired) {
    this.deleteSelectedBtn._wired = true;
    this.deleteSelectedBtn.addEventListener('click', () => this.deleteSelectedBoxes());
  }
  if (this.deleteBtnLabel && !this.deleteBtnLabel._wired) {
    this.deleteBtnLabel._wired = true;
    this.deleteBtnLabel.addEventListener('click', () => this.deleteSelectedBoxes());
  }
  if (this.selectAllBtn && !this.selectAllBtn._wired) {
    this.selectAllBtn._wired = true;
    this.selectAllBtn.addEventListener('click', () => this.selectAllBoxes());
  }
  if (this.clearAllBtn && !this.clearAllBtn._wired) {
    this.clearAllBtn._wired = true;
    this.clearAllBtn.addEventListener('click', () => this.clearAllBoxes());
  }

  if (this.undoBtn && !this.undoBtn._wired) {
    this.undoBtn._wired = true;
    this.undoBtn.addEventListener('click', () => this.undo());
  }
  if (this.redoBtn && !this.redoBtn._wired) {
    this.redoBtn._wired = true;
    this.redoBtn.addEventListener('click', () => this.redo());
  }
  if (this.revertBtn && !this.revertBtn._wired) {
    this.revertBtn._wired = true;
    this.revertBtn.addEventListener('click', () => this.revertBoxes());
  }

  const deleteCurrentImageBtn = document.getElementById('deleteCurrentImageBtn');
  if (deleteCurrentImageBtn) {
    deleteCurrentImageBtn.addEventListener('click', () => this.deleteCurrentImage());
  }

  if (this.toggleGuideLinesBtn) {
    this.toggleGuideLinesBtn.addEventListener('click', () => {
      this.showGuideLines = !this.showGuideLines;
      this.toggleGuideLinesBtn.classList.toggle('active', this.showGuideLines);
      this.render();
    });
  }

  // AI Auto-Label
  if (this.autoLabelBtn) {
    this.autoLabelBtn.addEventListener('click', () => {
      if (this.selectedBoxIndices.size > 0) {
        this.refineSelectedBoxes();
      } else {
        this.autoLabelCurrent();
      }
    });
  }

  // Auto-Enhance Image
  if (this.autoEnhanceBtn) {
    this.autoEnhanceBtn.addEventListener('click', () => {
      this.autoEnhance = !this.autoEnhance;
      this.autoEnhanceBtn.classList.toggle('active', this.autoEnhance);
      this.showToast(this.autoEnhance ? 'Otomatik Netleştirme: Açık' : 'Otomatik Netleştirme: Kapalı', 'info');
      this.render();
    });
  }

  // Auto-Save Toggle
  if (this.autoSaveToggle) {
    this.autoSave = this.autoSaveToggle.checked;
    this.autoSaveToggle.addEventListener('change', () => {
      this.autoSave = this.autoSaveToggle.checked;
      if (this.autoSave && this.isDirty) {
        this.saveCurrentLabel(false);
      }
      this.showToast(this.autoSave ? 'Otomatik Kaydetme: Açık' : 'Otomatik Kaydetme: Kapalı', 'info');
    });
  }

  // Loupe Lens Tool
  if (this.loupeBtn) {
    this.loupeBtn.addEventListener('click', () => {
      this.isLoupeActive = !this.isLoupeActive;
      this.loupeBtn.classList.toggle('active', this.isLoupeActive);
      if (!this.isLoupeActive && this.loupeCanvas) this.loupeCanvas.style.display = 'none';
      this.render();
    });
  }

  // Flag / Star Image
  if (this.flagBtn) {
    this.flagBtn.addEventListener('click', () => this.toggleFlag());
  }

  // Copy / Paste
  if (this.copyBoxesBtn) this.copyBoxesBtn.addEventListener('click', () => this.copyBoxes());
  if (this.pasteBoxesBtn) this.pasteBoxesBtn.addEventListener('click', () => this.pasteBoxes());
  if (this.copyFromPrevBtn) this.copyFromPrevBtn.addEventListener('click', () => this.copyFromPrevious());
  if (this.skipEmptyBtn) this.skipEmptyBtn.addEventListener('click', () => this.toggleSkipEmpty());

  // Stats Refresh
  if (this.refreshStatsBtn) this.refreshStatsBtn.addEventListener('click', () => {
    this.updateEditorStatisticsTab();
    this.showToast('İstatistikler güncellendi ✓', 'success');
  });

  // Context menu buttons
  if (this.contextMenu) {
    document.getElementById('ctxAutoLabel')?.addEventListener('click', () => {
      this.hideContextMenu();
      if (this.selectedBoxIndices.size > 0) {
        this.refineSelectedBoxes();
      } else {
        this.autoLabelCurrent();
      }
    });
    document.getElementById('ctxCopyBox')?.addEventListener('click', () => {
      this.copyBoxes();
      this.hideContextMenu();
    });
    document.getElementById('ctxDuplicateBox')?.addEventListener('click', () => {
      this.duplicateSelectedBoxes();
      this.hideContextMenu();
    });
    document.getElementById('ctxDeleteBox')?.addEventListener('click', () => {
      this.deleteSelectedBoxes();
      this.hideContextMenu();
    });
    document.getElementById('ctxChangeClass')?.addEventListener('click', () => {
      this.hideContextMenu();
      if (this.activeClassSelect) this.activeClassSelect.focus();
    });

    document.addEventListener('click', (e) => {
      if (!this.contextMenu.contains(e.target)) this.hideContextMenu();
    });

    document.addEventListener('contextmenu', (e) => {
      if (this.currentView !== 'editor') return;
      e.preventDefault();

      // Poligon çizimindeyken sağ tık poligonu hemen kapatır
      if (this.mode === 'polygon' && this.polygonDraftPoints && this.polygonDraftPoints.length >= 3) {
        this.completePolygonDraft();
        return;
      }

      const rect = this.viewport.getBoundingClientRect();
      const isInViewport = (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      );
      if (isInViewport && this.imageObj) {
        const pt = this.getCanvasPoint(e);
        const hitIndex = this.findHitBoxIndex(pt);
        if (hitIndex !== -1) {
          if (!this.selectedBoxIndices.has(hitIndex)) {
            this.selectedBoxIndices.clear();
            this.selectedBoxIndices.add(hitIndex);
            this.activeClassId = this.boxes[hitIndex].class_id;
            this.activeClassSelect.value = this.activeClassId;
            this.render();
            this.updateBoxesList();
          }
          this._contextMenuTarget = hitIndex;
          this.showContextMenu(e.clientX, e.clientY);
        }
      }
    });
  }

  // Zoom Buttons
  this.zoomInBtn = document.getElementById('zoomInBtn');
  this.zoomOutBtn = document.getElementById('zoomOutBtn');
  this.zoomFitBtn = document.getElementById('zoomFitBtn');
  this.zoomInBtn?.addEventListener('click', () => this.zoomAtCenter(1.25));
  this.zoomOutBtn?.addEventListener('click', () => this.zoomAtCenter(0.8));
  this.zoomFitBtn?.addEventListener('click', () => this.fitToViewport());

  // Wheel Zoom
  this.viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = this.viewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    this.zoomAtPoint(mouseX, mouseY, zoomFactor);
  }, { passive: false });

  // Viewport Mouse Events
  this.viewport.addEventListener('mousedown', (e) => this.onMouseDown(e));
  this.viewport.addEventListener('dblclick', (e) => {
    if (this.mode === 'polygon' && this.polygonDraftPoints && this.polygonDraftPoints.length >= 3) {
      e.preventDefault();
      this.completePolygonDraft();
    }
  });
  this.viewport.addEventListener('mouseleave', () => {
    this.cursorPos = { x: -1, y: -1 };
    this.render();
  });

  if (!window._editorGlobalListenersWired) {
    window._editorGlobalListenersWired = true;
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
    window.addEventListener('resize', () => {
      if (this.currentView === 'editor' && this.imageObj) {
        this.fitToViewport();
      }
    });
  }

  // Sidebar Toggles
  this.toggleLeftSidebarHeaderBtn = document.getElementById('toggleLeftSidebarHeaderBtn');
  this.toggleRightSidebarHeaderBtn = document.getElementById('toggleRightSidebarHeaderBtn');
  this.toggleLeftSidebarHeaderBtn?.addEventListener('click', () => this.toggleLeftSidebar());
  this.toggleRightSidebarHeaderBtn?.addEventListener('click', () => this.toggleRightSidebar());

  // Zen Mode
  this.zenModeBtn = document.getElementById('zenModeBtn');
  this.zenModeBtn?.addEventListener('click', () => this.toggleZenMode());

  // Project Settings Modal Open
  this.projectSettingsBtn = document.getElementById('projectSettingsBtn');
  this.projectSettingsBtn?.addEventListener('click', () => this.openProjectSettingsModal());

  // Active Job Renaming
  const renameJobAction = async () => {
    const currentName = this.activeBatchName || 'Yığın / Job';
    const newName = await this.showPrompt({
      title: 'Job / Yığın Adını Düzenle',
      subtitle: 'Etiketleme Görevi',
      message: 'Yığın adını düzenleyin:',
      defaultValue: currentName,
      placeholder: 'Örn: mehmet job1',
      confirmText: 'Kaydet'
    });
    if (newName && newName.trim() && newName.trim() !== currentName) {
      const cleanName = newName.trim();
      this.activeBatchName = cleanName;
      const nameEl = document.getElementById('editorJobName');
      if (nameEl) nameEl.textContent = cleanName;

      if (this.activeBatchId) {
        try {
          await fetch('/api/projects/rename-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              category: this.activeHubProjectId || this.currentCategory,
              batch_id: this.activeBatchId,
              new_name: cleanName
            })
          });
          this.showToast(`Job adı güncellendi: "${cleanName}"`, 'success');
        } catch (e) {
          console.error(e);
        }
      }
    }
  };
  document.getElementById('editorJobRenameBtn')?.addEventListener('click', renameJobAction);
  document.getElementById('editorJobName')?.addEventListener('click', renameJobAction);

  // Add To Dataset (Approve Job / Image) Button
  document.getElementById('editorAddToDatasetBtn')?.addEventListener('click', async () => {
    // Editör açıkken doğrudan mevcut resmi onayla ve veri setine dahil et
    if (this.currentImage) {
      await this.saveCurrentLabel(true, true);
    } else if (this.activeBatchId) {
      const confirmed = await this.showConfirm({
        title: 'Veri Setine Ekle (Tüm Yığını Onayla)',
        subtitle: 'Yığın Onayı',
        message: `"${this.activeBatchName}" yığınındaki tüm etiketler onaylanıp ana veri setine eklensin mi?`,
        confirmText: 'Evet, Veri Setine Ekle',
        cancelText: 'Vazgeç',
        type: 'info'
      });
      if (!confirmed) return;

      try {
        const res = await fetch('/api/projects/complete-batch', {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            category: this.activeHubProjectId || this.currentCategory,
            batch_id: this.activeBatchId
          })
        });
        if (res.ok) {
          this.showToast(`"${this.activeBatchName}" başarıyla veri setine eklendi`, 'success');
          const targetProject = this.currentCategory || this.activeHubProjectId || new URLSearchParams(window.location.search).get('project') || 'modai';
          const returnTab = this.editorReturnTab || 'annotate';
          if (typeof this.openProject === 'function') {
            this.openProject(targetProject, returnTab, true);
          } else {
            this.switchProjectTab(returnTab);
            this.loadHubProjectData();
          }
        } else {
          this.showToast('Veri setine eklenirken hata oluştu', 'error');
        }
      } catch (e) {
        this.showToast('İşlem başarısız', 'error');
      }
    } else {
      this.showToast('İşlenecek görsel bulunamadı', 'warning');
    }
  });

  document.getElementById('saveProjectSettingsBtn')?.addEventListener('click', () => this.saveProjectSettings());
  document.getElementById('addNewClassRowBtn')?.addEventListener('click', () => this.addNewClassRow());

  // Modal Tabs Switching
  document.querySelectorAll('.modal-tabs').forEach(tabGroup => {
    tabGroup.querySelectorAll('.modal-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.getAttribute('data-tab');
        const modalBody = tabGroup.nextElementSibling;
        if (!modalBody) return;

        tabGroup.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
        modalBody.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

        btn.classList.add('active');
        const activePane = document.getElementById(targetTab);
        if (activePane) activePane.classList.add('active');
      });
    });
  });

  // Multi-Select Boxes Checkbox in Sidebar
  this.selectAllBoxesCheckbox = document.getElementById('selectAllBoxesCheckbox');
  this.selectAllBoxesCheckbox?.addEventListener('change', (e) => {
    this.toggleSelectAllBoxes(e.target.checked);
  });

  // Bulk Class Select
  this.bulkClassSelect = document.getElementById('bulkClassSelect');
  this.bulkClassSelect?.addEventListener('change', (e) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      this.batchChangeSelectedClasses(val);
    }
  });

  // Box Header Undo / Redo buttons
  this.undoBoxesBtn = document.getElementById('undoBoxesBtn');
  this.redoBoxesBtn = document.getElementById('redoBoxesBtn');
  this.undoBoxesBtn?.addEventListener('click', () => this.undo());
  this.redoBoxesBtn?.addEventListener('click', () => this.redo());

  // Range input live indicators
  const aiConfRange = document.getElementById('settingsAiConfRange');
  const aiIouRange = document.getElementById('settingsAiIouRange');
  aiConfRange?.addEventListener('input', (e) => {
    const t = document.getElementById('aiConfValText');
    if (t) t.textContent = e.target.value;
  });
  aiIouRange?.addEventListener('input', (e) => {
    const t = document.getElementById('aiIouValText');
    if (t) t.textContent = e.target.value;
  });

  // ══════════════════════════════════════════════════════════════
  // MODERN 3-COLUMN & TABBED PANELS EVENT LISTENERS
  // ══════════════════════════════════════════════════════════════

  // 1. Right Sidebar Tab Switching: [ ÖZELLİKLER ] [ KISAYOLLAR ] [ İSTATİSTİK ]
  document.querySelectorAll('.panel-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetTab = btn.dataset.tab;
      document.querySelectorAll('.panel-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const pProp = document.getElementById('tabContentProperties');
      const pShort = document.getElementById('tabContentShortcuts');
      const pStat = document.getElementById('tabContentStatistics');

      if (pProp) {
        pProp.classList.toggle('active', targetTab === 'properties');
        pProp.style.display = targetTab === 'properties' ? 'flex' : 'none';
      }
      if (pShort) {
        pShort.classList.toggle('active', targetTab === 'shortcuts');
        pShort.style.display = targetTab === 'shortcuts' ? 'flex' : 'none';
      }
      if (pStat) {
        pStat.classList.toggle('active', targetTab === 'statistics');
        pStat.style.display = targetTab === 'statistics' ? 'flex' : 'none';
        if (targetTab === 'statistics') this.updateEditorStatisticsTab();
      }
    });
  });

  // 2. Left Sidebar Quick Filter Tabs: [ Tümü ] [ Etiketliler ] [ Bekleyenler ]
  document.querySelectorAll('#browserFilterPills .filter-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#browserFilterPills .filter-pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const f = btn.dataset.filter || 'all';
      if (this.filterSelect) this.filterSelect.value = f;
      this.currentFilter = f;
      this.applyFilter();
    });
  });
}

toggleLeftSidebar() {
  this.isLeftCollapsed = !this.isLeftCollapsed;
  this.mainLayout.classList.toggle('left-collapsed', this.isLeftCollapsed);
  localStorage.setItem('yolo_left_collapsed', this.isLeftCollapsed);
  if (this.toggleLeftSidebarHeaderBtn) {
    this.toggleLeftSidebarHeaderBtn.classList.toggle('active', !this.isLeftCollapsed);
  }
  this.smoothRecenter();
}

toggleRightSidebar() {
  this.isRightCollapsed = !this.isRightCollapsed;
  this.mainLayout.classList.toggle('right-collapsed', this.isRightCollapsed);
  localStorage.setItem('yolo_right_collapsed', this.isRightCollapsed);
  if (this.toggleRightSidebarHeaderBtn) {
    this.toggleRightSidebarHeaderBtn.classList.toggle('active', !this.isRightCollapsed);
  }
  this.smoothRecenter();
}

toggleZenMode() {
  const isZen = this.mainLayout.classList.contains('zen-mode');
  if (isZen) {
    this.mainLayout.classList.remove('zen-mode');
    this.isLeftCollapsed = localStorage.getItem('yolo_left_collapsed') === 'true';
    this.isRightCollapsed = localStorage.getItem('yolo_right_collapsed') === 'true';
    this.mainLayout.classList.toggle('left-collapsed', this.isLeftCollapsed);
    this.mainLayout.classList.toggle('right-collapsed', this.isRightCollapsed);
  } else {
    this.mainLayout.classList.add('zen-mode');
    this.mainLayout.classList.add('left-collapsed');
    this.mainLayout.classList.add('right-collapsed');
  }
  if (this.zenModeBtn) {
    this.zenModeBtn.classList.toggle('active', !isZen);
  }
  this.smoothRecenter();
}

smoothRecenter() {
  if (!this.imageObj) return;
  const start = performance.now();
  const duration = 260;

  const animate = (now) => {
    const elapsed = now - start;
    const vW = this.viewport.clientWidth;
    const vH = this.viewport.clientHeight;
    const imgW = this.imageObj.naturalWidth || 800;
    const imgH = this.imageObj.naturalHeight || 600;
    const topToolbarClearance = 68;
    const bottomMargin = 24;
    const availableH = Math.max(100, vH - topToolbarClearance - bottomMargin);

    this.panX = (vW - imgW * this.zoomLevel) / 2;
    this.panY = topToolbarClearance + (availableH - imgH * this.zoomLevel) / 2;
    this.applyTransform();

    if (elapsed < duration) {
      requestAnimationFrame(animate);
    }
  };
  requestAnimationFrame(animate);
}

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/\'/g, '&#039;');
  }

  async convertFileToWebp(file, maxDimension = 1920, quality = 0.88) {
    if (!file || typeof file.name !== 'string') return file;
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.txt') || lowerName.endsWith('.webp')) return file;
    if (!/\.(jpe?g|png|bmp)$/i.test(lowerName)) return file;

    try {
      const bitmap = await createImageBitmap(file);
      let { width, height } = bitmap;
      if (Math.max(width, height) > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.max(1, Math.round(width * scale));
        height = Math.max(1, Math.round(height * scale));
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { alpha: false });
      ctx.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
      if (!blob) return file;

      const baseName = file.name.replace(/\.[^/.]+$/, '');
      return new File([blob], `${baseName}.webp`, { type: 'image/webp', lastModified: file.lastModified || Date.now() });
    } catch (e) {
      console.warn('WebP conversion fallback to original file:', file.name, e);
      return file;
    }
  }

  async batchConvertFilesToWebp(files, progressCb) {
    if (!Array.isArray(files) || files.length === 0) return files;
    const CONCURRENCY = 6;
    const converted = new Array(files.length);
    let completed = 0;
    const queue = files.map((f, i) => ({ file: f, index: i }));

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        converted[item.index] = await this.convertFileToWebp(item.file);
        completed++;
        if (progressCb) progressCb(completed, files.length);
      }
    };

    const workers = [];
    for (let i = 0; i < Math.min(CONCURRENCY, files.length); i++) {
      workers.push(worker());
    }
    await Promise.all(workers);
    return converted;
  }

  }

  // Metotlari ve getter/setter'lari DatasetEditor.prototype'a kopyala
  const proto = _EditorCoreExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }
})(window.DatasetEditor);
