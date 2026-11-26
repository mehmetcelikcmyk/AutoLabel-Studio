/**
 * AutoLabel Studio - WorkspaceUI Module
 */

(function installWorkspaceUI(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    return;
  }

  class _WorkspaceUIExtension {
  navigateTo(view, params = {}, push = true) {
    if (push) {
      try {
        const state = { view, params };
        const url = this.getUrlForState(view, params);
        window.history.pushState(state, '', url);
      } catch (err) {
        console.warn('History pushState bypassed:', err);
      }
    }
  }

  getUrlForState(view, params) {
    if (view === 'landing') return '/';
    if (view === 'auth') return '/?auth=' + (params.tab || 'login');
    if (view === 'workspace') return '/?tab=' + (params.tab || 'agent');
    if (view === 'create_project') return '/?create=1';
    if (view === 'project') {
      let u = '/?project=' + encodeURIComponent(params.projectId || '') + '&tab=' + encodeURIComponent(params.tab || 'upload');
      if (params.batch_id) u += '&batch_id=' + encodeURIComponent(params.batch_id);
      if (params.filter) u += '&filter=' + encodeURIComponent(params.filter);
      if (params.subtab) u += '&subtab=' + encodeURIComponent(params.subtab);
      return u;
    }
    if (view === 'editor') return '/?editor=' + encodeURIComponent(params.projectId || '');
    return '/';
  }

  handlePopState(state) {
    const p = new URLSearchParams(window.location.search);
    const editorProject = p.get('editor');
    const project = p.get('project');
    const pTab = p.get('tab');
    const pSubtab = p.get('subtab');
    const auth = p.get('auth');
    const create = p.get('create');

    if (!state || !state.view) {
      if (editorProject) {
        this.showEditor(editorProject, false);
      } else if (project) {
        if (this.activeHubProjectId === project && this.isProjectContext) {
          this.switchProjectTab(pTab || 'upload', false);
          if (pTab === 'team' && pSubtab) this.switchTeamSubtab(pSubtab, false);
        } else {
          this.openProject(project, pTab || 'upload', false).then(() => {
            if (pTab === 'team' && pSubtab) this.switchTeamSubtab(pSubtab, false);
          });
        }
      } else if (create) {
        this.showCreateProject(false);
      } else if (pTab === 'privacy' || p.get('view') === 'privacy') {
        this.showPrivacy('landing', false);
      } else if (pTab) {
        if (this.isProjectContext) this.closeProjectToWorkspace(false);
        this.showAppShell(pTab, false);
      } else if (auth) {
        this.showAuth(auth, false);
      } else {
        const token = localStorage.getItem('yolo_auth_token');
        if (token) {
          if (this.isProjectContext) this.closeProjectToWorkspace(false);
          this.showAppShell('agent', false);
        } else {
          this.showLanding(null, false);
        }
      }
      return;
    }

    if (state.view === 'landing') {
      this.showLanding(null, false);
    } else if (state.view === 'auth') {
      this.showAuth(state.params?.tab || 'login', false);
    } else if (state.view === 'privacy') {
      this.showPrivacy(state.fromView || 'landing', false);
    } else if (state.view === 'workspace') {
      if (this.isProjectContext) this.closeProjectToWorkspace(false);
      this.showAppShell(state.params?.tab || pTab || 'agent', false);
    } else if (state.view === 'create_project') {
      this.showCreateProject(false);
    } else if (state.view === 'project' || project) {
      const pid = project || state?.params?.projectId;
      const targetTab = pTab || state?.params?.tab || 'upload';
      const targetSubtab = pSubtab || state?.params?.subtab;

      if (this.activeHubProjectId === pid && this.isProjectContext) {
        if (targetTab === 'batch_review') {
          const bId = p.get('batch_id') || state?.params?.batch_id || 'batch_default';
          const bFlt = p.get('filter') || state?.params?.filter || 'unannotated';
          this.openBatchReview(bId, bFlt, 1, false);
        } else {
          this.switchProjectTab(targetTab, false);
          if (targetTab === 'team') {
            this.switchTeamSubtab(targetSubtab || 'org', false);
          }
        }
      } else {
        this.openProject(pid, targetTab, false).then(() => {
          if (targetTab === 'batch_review') {
            const bId = p.get('batch_id') || state?.params?.batch_id || 'batch_default';
            const bFlt = p.get('filter') || state?.params?.filter || 'unannotated';
            this.openBatchReview(bId, bFlt, 1, false);
          } else if (targetTab === 'team') {
            this.switchTeamSubtab(targetSubtab || 'org', false);
          }
        });
      }
    } else if (state.view === 'editor' || editorProject) {
      this.showEditor(editorProject || state?.params?.projectId, false);
    }
  }



  // =====================================================
  // AUTH SYSTEM
  // =====================================================

  async checkAuth(authError = null) {
    const urlParams = new URLSearchParams(window.location.search);
    const googleTokenFromUrl = urlParams.get('google_token');
    const token = googleTokenFromUrl || localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

    if (token) {
      if (typeof this.showLoading === 'function' && !urlParams.get('auth')) {
        this.showLoading(true, 'Bilgiler Getiriliyor...', 'Kullanıcı verileri ve çalışma alanı hazırlanıyor...');
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          this.currentUser = data.user;
          this._updateHeaderUser(data.user);

          // Synchronize token across all storage keys
          localStorage.setItem('yolo_auth_token', token);
          localStorage.setItem('authToken', token);
          sessionStorage.setItem('authToken', token);

          const savedName = localStorage.getItem('yolo_user_name') || (urlParams.get('display_name') ? decodeURIComponent(urlParams.get('display_name')) : '');
          if (savedName) {
            this.showToast(`Hoş geldiniz, ${savedName}`, 'success');
            localStorage.removeItem('yolo_user_name');
          }

          // Explicitly hide marketing landing view and remove active class
          const lv = document.getElementById('landingView');
          if (lv) {
            lv.style.display = 'none';
            lv.classList.remove('active');
          }
          const av = document.getElementById('authView');
          if (av) {
            av.style.display = 'none';
            av.classList.remove('active');
          }

          // Show workspace analysis loader
          const hasExplicitTab = urlParams.get('tab') || urlParams.get('project') || urlParams.get('editor');
          if (googleTokenFromUrl) {
            this._showAuthAnalysis('Google ile Giriş Yapıldı', 'Çalışma alanı taranıyor ve analiz ediliyor...');
          } else if (!hasExplicitTab) {
            this._showAuthAnalysis('Hesap Doğrulandı', 'Çalışma alanı taranıyor ve analiz ediliyor...');
          }

          // Fetch workspaces before routing
          let hasWorkspace = false;
          let userWorkspaces = [];
          try {
            const wsRes = await fetch('/api/workspaces', {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            if (wsRes.ok) {
              const wsData = await wsRes.json();
              hasWorkspace = wsData.has_workspace;
              userWorkspaces = wsData.workspaces || [];
            }
          } catch (e) {
            console.warn('Workspace fetch error in checkAuth:', e);
          }

          const isAdmin = !!(this.currentUser?.is_admin || this.currentUser?.role === 'admin');

          if (googleTokenFromUrl || !hasExplicitTab) {
            if (hasWorkspace || isAdmin) {
              this._updateAuthAnalysisStep('workspace_done', 'Çalışma alanı doğrulandı, stüdyo açılıyor...');
              this._updateAuthAnalysisStep('redirect_done', 'Yönlendiriliyorsunuz...');
            } else {
              this._updateAuthAnalysisStep('workspace_done', 'Çalışma alanı bulunamadı, sihirbaz başlatılıyor...');
            }
            await new Promise(r => setTimeout(r, 600));
            this._hideAuthAnalysis();
          }

          // If user has NO workspace yet and is not admin, show the 4-step onboarding wizard!
          if (!hasWorkspace && !isAdmin) {
            this.openWorkspaceOnboarding();
            return;
          }

          // Load user workspaces into the switcher
          await this.loadUserWorkspaces();

          // Fetch projects before routing
          await this.fetchProjects();

          // Route according to URL parameters
          const editorProject = urlParams.get('editor');
          const project = urlParams.get('project');
          const pTab = urlParams.get('tab');
          const create = urlParams.get('create');
          const isGoogleAuth = !!googleTokenFromUrl;

          if (editorProject) {
            await this.showEditor(editorProject, false);
          } else if (project) {
            await this.openProject(project, pTab || 'upload', false);
          } else if (create) {
            this.showCreateProject(false);
          } else if (pTab === 'privacy' || urlParams.get('view') === 'privacy') {
            this.showPrivacy('workspace', false);
          } else if (pTab) {
            await this.showAppShell(pTab, true);
          } else {
            // Admin kullanıcısı doğrudan admin paneli ile karşılansın
            const defaultInitialTab = (this.currentUser?.is_admin || this.currentUser?.role === 'admin') ? 'admin' : 'agent';
            await this.showAppShell(defaultInitialTab, true);
          }

          // If coming from Google OAuth callback, clean the query params now that the app shell is loaded
          if (isGoogleAuth) {
            const targetInitialTab = (this.currentUser?.is_admin || this.currentUser?.role === 'admin') ? 'admin' : 'agent';
            window.history.replaceState({ view: 'workspace', params: { tab: targetInitialTab } }, '', `/?tab=${targetInitialTab}`);
          }
          if (typeof this.showLoading === 'function') this.showLoading(false);
          return;
        }
      } catch (e) { }
      localStorage.removeItem('yolo_auth_token');
      localStorage.removeItem('authToken');
      sessionStorage.removeItem('authToken');
    }

    // If there was an auth error from Google callback, clean URL
    if (window.location.search.includes('auth_error')) {
      window.history.replaceState({}, '', '/');
    }

    // No valid token → check urlParams before defaulting to landing
    const unauthParams = new URLSearchParams(window.location.search);
    const uProject = unauthParams.get('project');
    const uEditor = unauthParams.get('editor');
    const uTab = unauthParams.get('tab');
    const uAuth = unauthParams.get('auth');

    if (uEditor) {
      await this.showEditor(uEditor, false);
      if (typeof this.showLoading === 'function') this.showLoading(false);
      return;
    }
    if (uProject) {
      await this.openProject(uProject, uTab || 'annotate', false);
      if (typeof this.showLoading === 'function') this.showLoading(false);
      return;
    }
    if (uTab === 'privacy' || unauthParams.get('view') === 'privacy') {
      this.showPrivacy('landing', false);
    } else if (uAuth) {
      this.showAuth(uAuth, false);
    } else {
      this.showLanding(authError, false);
    }
  }



  async fetchProjects() {
    const grid = document.getElementById('projectsGrid');
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const activeWs = this.activeWorkspaceId || localStorage.getItem('activeWorkspaceId') || '';
      const wsParam = activeWs ? `?workspace_id=${encodeURIComponent(activeWs)}` : '';
      const res = await fetch(`/api/projects${wsParam}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const data = await res.json();
        this.projectsList = data.projects || [];
        this.projects = this.projectsList;

        let totalImages = 0;
        let totalLabeled = 0;
        let pendingReviews = 0;
        this.projectsList.forEach(p => {
          totalImages += (Number(p.image_count) || 0);
          totalLabeled += (Number(p.label_count) || 0);
          if (p.pending_review_count) pendingReviews += Number(p.pending_review_count);
        });

        const globalPct = totalImages > 0 ? Math.round((totalLabeled / totalImages) * 100) : 0;

        const pCountEl = document.getElementById('wsNavProjectsCount');
        const totProjEl = document.getElementById('dashStatTotalProjects');
        const totImgEl = document.getElementById('dashStatTotalImages');
        const globPctEl = document.getElementById('dashStatGlobalPct');
        const pendingEl = document.getElementById('dashStatPendingReviews');

        if (pCountEl) pCountEl.textContent = this.projectsList.length;
        if (totProjEl) totProjEl.textContent = this.projectsList.length;
        if (totImgEl) totImgEl.textContent = totalImages.toLocaleString('tr-TR');
        if (globPctEl) globPctEl.textContent = `%${globalPct}`;
        if (pendingEl) pendingEl.textContent = pendingReviews;

        this.renderProjectsGrid(this.projectsList);
      }
    } catch (e) {
      if (grid) grid.innerHTML = '<div class="empty-state">Projeler yüklenemedi.</div>';
    }
  }

  renderProjectsGrid(projects) {
    const grid = document.getElementById('projectsGrid');
    if (!grid) return;
    if (!projects || projects.length === 0) {
      grid.innerHTML = `
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
            <div class="dash-onboard-card highlight" id="wsEmptyCardCreate">
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

            <div class="dash-onboard-card" id="wsEmptyCardAgent">
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

            <div class="dash-onboard-card" id="wsEmptyCardTemplates">
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
      document.getElementById('wsEmptyCardCreate')?.addEventListener('click', () => this.showCreateProject());
      document.getElementById('wsEmptyCardAgent')?.addEventListener('click', () => this.switchWorkspaceTab('agent'));
      document.getElementById('wsEmptyCardTemplates')?.addEventListener('click', () => this.switchWorkspaceTab('explore'));
      return;
    }

    grid.innerHTML = projects.map(p => `
      <div class="project-card" data-project-id="${p.id}" style="cursor: pointer; background: rgba(15,23,42,0.6); border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; transition: transform 0.15s, border-color 0.15s;">
        <div class="proj-card-thumb" style="height: 130px; background: #1e293b; position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center;">
          ${p.sample_image
        ? `<img src="${p.sample_image}" style="width: 100%; height: 100%; object-fit: cover;" alt="${p.name}">`
        : `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`
      }
          <span style="position: absolute; top: 10px; right: 10px; background: rgba(15,23,42,0.85); font-size: 0.72rem; padding: 3px 8px; border-radius: 4px; font-weight: 700; color: #93c5fd;">
            ${p.project_type === 'classification' ? 'Sınıflandırma' : 'Nesne Tespiti'}
          </span>
        </div>
        <div class="proj-card-body" style="padding: 16px;">
          <h3 style="font-size: 1.05rem; font-weight: 800; margin-bottom: 4px; color: var(--text-main);">${p.name}</h3>
          <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4; height: 36px; overflow: hidden;">${p.description || ''}</p>
          
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 0.78rem; margin-bottom: 6px;">
            <span style="color: var(--text-muted);">${p.label_count} / ${p.image_count} Etiketli</span>
            <span style="font-weight: 700; color: #10b981;">%${p.percent}</span>
          </div>

          <div style="height: 5px; background: rgba(255,255,255,0.06); border-radius: 99px; overflow: hidden; margin-bottom: 14px;">
            <div style="width: ${p.percent}%; height: 100%; background: #10b981; border-radius: 99px;"></div>
          </div>

          <div style="display: flex; gap: 8px; margin-top: 10px;">
            <button class="btn-secondary btn-sm open-proj-btn" data-id="${p.id}" style="flex: 1; justify-content: center;">
              Projeyi Aç
            </button>
            <button class="btn-icon-danger btn-sm delete-proj-btn" data-id="${p.id}" title="Delete Project" style="padding: 6px 10px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 6px; color: #ef4444; cursor: pointer;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `).join('');

    // Attach click listeners
    grid.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.delete-proj-btn')) {
          e.stopPropagation();
          const id = e.target.closest('.delete-proj-btn').dataset.id;
          this.deleteProject(id);
          return;
        }
        const id = card.dataset.projectId;
        if (id) this.openProject(id);
      });
    });
  }


  async loadWorkspaceStats() {
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const res = await fetch('/api/workspace/stats', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const stats = await res.json();
        const pCountEl = document.getElementById('wsNavProjectsCount');
        if (pCountEl) pCountEl.textContent = stats.total_projects || 0;
        const totalProjEl = document.getElementById('dashTotalProjects');
        if (totalProjEl) totalProjEl.textContent = stats.total_projects || 0;
        const totalImgEl = document.getElementById('dashTotalImages');
        if (totalImgEl) totalImgEl.textContent = stats.total_images || 0;
        const totalLblEl = document.getElementById('dashTotalLabeled');
        if (totalLblEl) totalLblEl.textContent = stats.total_labeled || 0;

        // Dynamic Storage & Quota Widget Updates (Roboflow Style)
        const totalImages = stats.total_images || 0;
        const creditMax = 30; // Standart plan aylık kredi eşiği
        const usedCredits = stats.credits_used !== undefined ? stats.credits_used : Math.min(Math.round(totalImages / 10), creditMax);
        const percent = Math.min(Math.round((usedCredits / creditMax) * 100), 100);

        const quotaPctEl = document.getElementById('wsQuotaPercent');
        if (quotaPctEl) quotaPctEl.textContent = `${usedCredits} / ${creditMax} Kredi`;
        const quotaFillEl = document.getElementById('wsQuotaFill');
        if (quotaFillEl) quotaFillEl.style.width = `${Math.max(percent, 5)}%`;
        const quotaImagesEl = document.getElementById('wsQuotaImagesCount');
        if (quotaImagesEl) quotaImagesEl.textContent = "1 Ekim'de Sıfırlanır";

        // Flyout (Kompakt Popover) güncellemesi
        const flyoutCountEl = document.getElementById('wsFlyoutCreditCount');
        if (flyoutCountEl) flyoutCountEl.textContent = `${usedCredits} / ${creditMax} Kredi`;
        const flyoutFillEl = document.getElementById('wsFlyoutCreditFill');
        if (flyoutFillEl) flyoutFillEl.style.width = `${Math.max(percent, 5)}%`;

        // Proje içi alt kota barını da güncelle
        if (this.activeHubProjectId) {
          const curProj = (this.projectsList || []).find(p => p.id === this.activeHubProjectId);
          if (curProj) {
            const pImgs = curProj.total_images || curProj.image_count || 0;
            const pLbls = curProj.total_labeled || curProj.label_count || 0;
            const pPct = pImgs > 0 ? Math.round((pLbls / pImgs) * 100) : 0;
            const projCountEl = document.getElementById('projQuotaCount');
            if (projCountEl) projCountEl.textContent = `${pImgs} Görsel`;
            const projPctEl = document.getElementById('projQuotaPercent');
            if (projPctEl) projPctEl.textContent = `%${pPct} Etiketli`;
            const projFillEl = document.getElementById('projQuotaFill');
            if (projFillEl) projFillEl.style.width = `${pPct}%`;
          }
        }
      }
    } catch (e) { }
  }


  logout() {
    localStorage.removeItem('yolo_auth_token');
    localStorage.removeItem('authToken');
    sessionStorage.removeItem('authToken');
    localStorage.removeItem('yolo_user_name');
    this.currentUser = null;
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => { });
    if (typeof this.clearUserState === 'function') {
      this.clearUserState();
    }
    this.showLanding();
    this.showToast('Oturum kapatıldı.', 'info');
  }

  showLanding(authError = null, pushHistory = true) {
    if (pushHistory) {
      this.navigateTo('landing');
    }
    this.hideAllViews();
    window.scrollTo(0, 0);
    const lv = document.getElementById('landingView');
    if (lv) {
      lv.style.display = 'block';
      lv.scrollTop = 0;
    }


    if (authError) {
      const msgs = {
        'google_denied': 'Google girişi iptal edildi.',
        'google_no_email': 'Google hesabından e-posta alınamadı.',
        'google_failed': 'Google OAuth bağlantısı başarısız. Lütfen tekrar deneyin.',
        'email_exists_local': 'Bu e-posta zaten şifre ile kayıtlıdır. Lütfen e-posta/şifre ile giriş yapın.',
      };
      const msg = msgs[authError] || 'Giriş sırasında bir hata oluştu.';
      setTimeout(() => {
        this.showAuth('login');
        this._authAlert(msg, 'error');
      }, 300);
    }

    // Animate stats counters
    this._animateStats();

    // Trigger/Reset Hero demo slider animations
    if (typeof window.triggerHeroDemoSlide === 'function') {
      setTimeout(() => window.triggerHeroDemoSlide(0), 100);
    }
    // Reset landing deck to page 0
    if (typeof window.goToLandingPage === 'function') {
      setTimeout(() => window.goToLandingPage(0), 50);
    }
  }

  _animateStats() {
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

  showPrivacy(fromView = 'landing', pushHistory = true) {
    this.hideAllViews();
    this.privacyFromView = fromView;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const pv = document.getElementById('privacyView');
    if (pv) {
      pv.classList.add('active');
      pv.style.display = 'block';
      pv.scrollTop = 0;
    }
    if (pushHistory && window.history && window.history.pushState) {
      const url = new URL(window.location);
      url.searchParams.set('tab', 'privacy');
      window.history.pushState({ view: 'privacy', fromView }, '', url);
    }
  }

  showAuth(mode = 'login', pushHistory = true) {
    if (window.location.hash) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (e) { }
    }
    if (pushHistory) {
      this.navigateTo('auth', { tab: mode });
    }
    this.hideAllViews();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const av = document.getElementById('authView');
    if (av) {
      av.classList.add('active');
      av.style.display = 'flex';
      av.scrollTop = 0;
    }
    const right = document.querySelector('.auth-right');
    if (right) right.scrollTop = 0;
    const loginPw = document.getElementById('loginPassword');
    if (loginPw) loginPw.value = '';
    const regPw = document.getElementById('registerPassword');
    if (regPw) regPw.value = '';
    this._switchAuthMode(mode, false);
  }




  _switchAuthMode(mode, updateUrl = true) {
    document.getElementById('authLoginMode').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('authRegisterMode').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('authForgotMode').style.display = mode === 'forgot' ? 'block' : 'none';
    this._authAlertClear();

    if (updateUrl) {
      try {
        const url = new URL(window.location);
        url.searchParams.set('auth', mode);
        window.history.replaceState({ view: 'auth', params: { tab: mode } }, '', url);
      } catch (e) { }
    }
  }

  _authAlert(msg, type = 'error') {
    const el = document.getElementById('authAlert');
    const card = document.getElementById('authFormCard');

    // Aynı anda sağ üstten Toast bildirimi de fırlat
    if (this.showToast) {
      this.showToast(msg, type);
    }

    // Hata durumunda formu hafifçe salla (Shake)
    if (card && type === 'error') {
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
      setTimeout(() => card.classList.remove('shake'), 450);
    }

    if (!el) return;
    const icon = type === 'error'
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`
      : (type === 'success'
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`);

    el.innerHTML = `${icon} <span>${msg}</span>`;
    el.className = `auth-alert alert-${type}`;
    el.style.display = 'flex';
  }

  _authAlertClear() {
    const el = document.getElementById('authAlert');
    if (el) { el.style.display = 'none'; el.innerHTML = ''; }
  }

  _showAuthAnalysis(title = 'Hesap Doğrulandı', sub = 'Çalışma alanı analiz ediliyor...') {
    const overlay = document.getElementById('authAnalysisOverlay');
    if (!overlay) return;
    const titleEl = document.getElementById('authAnalysisTitle');
    const subEl = document.getElementById('authAnalysisSub');
    if (titleEl) titleEl.textContent = title;
    if (subEl) subEl.textContent = sub;

    // Reset steps
    const stepUser = document.getElementById('authStepUser');
    const stepWs = document.getElementById('authStepWorkspace');
    const stepRedir = document.getElementById('authStepRedirect');
    if (stepUser) { stepUser.className = 'auth-analysis-step done'; }
    if (stepWs) { stepWs.className = 'auth-analysis-step active'; }
    if (stepRedir) { stepRedir.className = 'auth-analysis-step'; }

    overlay.style.display = 'flex';
  }

  _updateAuthAnalysisStep(stepName, subText) {
    const subEl = document.getElementById('authAnalysisSub');
    if (subEl && subText) subEl.textContent = subText;

    const stepUser = document.getElementById('authStepUser');
    const stepWs = document.getElementById('authStepWorkspace');
    const stepRedir = document.getElementById('authStepRedirect');

    if (stepName === 'workspace_done') {
      if (stepWs) { stepWs.className = 'auth-analysis-step done'; }
      if (stepRedir) { stepRedir.className = 'auth-analysis-step active'; }
    } else if (stepName === 'redirect_done') {
      if (stepRedir) { stepRedir.className = 'auth-analysis-step done'; }
    }
  }

  _hideAuthAnalysis() {
    const overlay = document.getElementById('authAnalysisOverlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }




  _checkPasswordStrength(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  }

  setupAuthCanvas() {
    const canvas = document.getElementById('authCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const resize = () => {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', resize);

    // Mouse tracking for interactive targeting reticle
    let mouse = { x: -1000, y: -1000, active: false };
    const authView = document.getElementById('authView');
    if (authView) {
      authView.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
        mouse.active = true;
      });
      authView.addEventListener('mouseleave', () => {
        mouse.active = false;
      });
    }

    // AI Detection Labels definition with distinctive colors
    const classes = [
      { name: 'vehicle', color: '#38bdf8' },
      { name: 'pedestrian', color: '#10b981' },
      { name: 'traffic_light', color: '#f43f5e' },
      { name: 'license_plate', color: '#eab308' },
      { name: 'segment_mask', color: '#818cf8' },
      { name: 'bicycle', color: '#fb923c' },
      { name: 'helmet', color: '#06b6d4' },
      { name: 'stop_sign', color: '#ec4899' }
    ];

    // Generate floating AI bounding boxes
    const boxes = [];
    const numBoxes = Math.max(8, Math.floor(window.innerWidth / 160));
    for (let i = 0; i < numBoxes; i++) {
      const cls = classes[i % classes.length];
      boxes.push({
        x: Math.random() * (width - 240) + 40,
        y: Math.random() * (height - 180) + 40,
        w: 110 + Math.random() * 110,
        h: 75 + Math.random() * 85,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        cls: cls.name,
        color: cls.color,
        conf: (0.89 + Math.random() * 0.1).toFixed(2),
        pulse: Math.random() * Math.PI,
        isPolygon: i % 3 === 0,
        keypoints: i % 4 === 1
      });
    }

    // Laser scan beam position & speed
    let scanY = 0;
    const scanSpeed = 1.1;

    const render = () => {
      // If authView is hidden, skip drawing to save CPU/GPU
      if (!authView || authView.style.display === 'none') {
        requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      // 1. Draw Laser Detection Sweep
      scanY += scanSpeed;
      if (scanY > height) scanY = 0;

      const grad = ctx.createLinearGradient(0, scanY - 35, 0, scanY + 35);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0)');
      grad.addColorStop(0.5, 'rgba(56, 189, 248, 0.07)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, scanY - 35, width, 70);

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 6]);
      ctx.moveTo(0, scanY);
      ctx.lineTo(width, scanY);
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Draw Floating Bounding Boxes & Polygons
      boxes.forEach(b => {
        b.x += b.vx;
        b.y += b.vy;
        b.pulse += 0.025;

        // Bounce gently off screen boundaries
        if (b.x < 15 || b.x + b.w > width - 15) b.vx *= -1;
        if (b.y < 20 || b.y + b.h > height - 20) b.vy *= -1;

        if (b.isPolygon) {
          // Polygon Segmentation Simulation
          const points = [
            { x: b.x + b.w * 0.2, y: b.y },
            { x: b.x + b.w * 0.85, y: b.y + b.h * 0.15 },
            { x: b.x + b.w, y: b.y + b.h * 0.7 },
            { x: b.x + b.w * 0.65, y: b.y + b.h },
            { x: b.x + b.w * 0.1, y: b.y + b.h * 0.85 }
          ];

          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let p = 1; p < points.length; p++) {
            ctx.lineTo(points[p].x, points[p].y);
          }
          ctx.closePath();
          ctx.fillStyle = b.color + '15';
          ctx.fill();
          ctx.strokeStyle = b.color + '88';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Handle dots
          points.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.strokeStyle = b.color;
            ctx.lineWidth = 1;
            ctx.stroke();
          });

          // Tag Pill
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x + b.w * 0.2, b.y - 17, 88, 17);
          ctx.fillStyle = '#090d16';
          ctx.font = 'bold 9.5px monospace';
          ctx.fillText(`polygon ${b.conf}`, b.x + b.w * 0.2 + 5, b.y - 5);

        } else {
          // Standard Bounding Box
          ctx.fillStyle = b.color + '0a';
          ctx.fillRect(b.x, b.y, b.w, b.h);

          // Box border
          ctx.strokeStyle = b.color + '44';
          ctx.lineWidth = 1;
          ctx.strokeRect(b.x, b.y, b.w, b.h);

          // Corner Reticles (L brackets)
          const retLen = 12;
          ctx.strokeStyle = b.color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          // Top-left
          ctx.moveTo(b.x, b.y + retLen); ctx.lineTo(b.x, b.y); ctx.lineTo(b.x + retLen, b.y);
          // Top-right
          ctx.moveTo(b.x + b.w - retLen, b.y); ctx.lineTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w, b.y + retLen);
          // Bottom-left
          ctx.moveTo(b.x, b.y + b.h - retLen); ctx.lineTo(b.x, b.y + b.h); ctx.lineTo(b.x + retLen, b.y + b.h);
          // Bottom-right
          ctx.moveTo(b.x + b.w - retLen, b.y + b.h); ctx.lineTo(b.x + b.w, b.y + b.h); ctx.lineTo(b.x + b.w, b.y + b.h - retLen);
          ctx.stroke();

          // Center crosshair
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          ctx.strokeStyle = b.color + '33';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(cx - 5, cy); ctx.lineTo(cx + 5, cy);
          ctx.moveTo(cx, cy - 5); ctx.lineTo(cx, cy + 5);
          ctx.stroke();

          // Label Pill
          const tagText = `${b.cls} ${b.conf}`;
          ctx.font = 'bold 10px monospace';
          const textWidth = ctx.measureText(tagText).width;
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x, b.y - 17, textWidth + 10, 17);
          ctx.fillStyle = '#090d16';
          ctx.fillText(tagText, b.x + 5, b.y - 5);

          // Keypoints / Pose skeleton simulation
          if (b.keypoints) {
            const kps = [
              { x: cx, y: b.y + b.h * 0.25 },
              { x: cx - b.w * 0.2, y: b.y + b.h * 0.45 },
              { x: cx + b.w * 0.2, y: b.y + b.h * 0.45 },
              { x: cx, y: b.y + b.h * 0.55 },
              { x: cx - b.w * 0.22, y: b.y + b.h * 0.85 },
              { x: cx + b.w * 0.22, y: b.y + b.h * 0.85 }
            ];
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(kps[0].x, kps[0].y); ctx.lineTo(kps[3].x, kps[3].y);
            ctx.moveTo(kps[1].x, kps[1].y); ctx.lineTo(kps[2].x, kps[2].y);
            ctx.moveTo(kps[3].x, kps[3].y); ctx.lineTo(kps[4].x, kps[4].y);
            ctx.moveTo(kps[3].x, kps[3].y); ctx.lineTo(kps[5].x, kps[5].y);
            ctx.stroke();

            kps.forEach(kp => {
              ctx.beginPath();
              ctx.arc(kp.x, kp.y, 2, 0, Math.PI * 2);
              ctx.fillStyle = '#38bdf8';
              ctx.fill();
            });
          }
        }
      });

      // 3. Interactive Mouse Reticle
      if (mouse.active) {
        ctx.save();
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        ctx.beginPath();
        ctx.moveTo(mouse.x - 22, mouse.y); ctx.lineTo(mouse.x + 22, mouse.y);
        ctx.moveTo(mouse.x, mouse.y - 22); ctx.lineTo(mouse.x, mouse.y + 22);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(mouse.x, mouse.y, 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(`X:${Math.round(mouse.x)} Y:${Math.round(mouse.y)} [AUTO_ROI]`, mouse.x + 18, mouse.y - 10);
        ctx.restore();
      }

      requestAnimationFrame(render);
    };

    render();
  }

  setupAuthEvents() {
    this.setupAuthCanvas();
    // Landing nav buttons
    document.getElementById('landingSignInBtn')?.addEventListener('click', () => this.showAuth('login'));
    document.getElementById('landingGetStartedBtn')?.addEventListener('click', () => this.showAuth('register'));
    document.getElementById('heroGetStartedBtn')?.addEventListener('click', () => this.showAuth('register'));
    document.getElementById('heroWatchDemoBtn')?.addEventListener('click', () => {
      document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('finalGetStartedBtn')?.addEventListener('click', () => this.showAuth('register'));
    document.getElementById('finalSignInBtn')?.addEventListener('click', () => this.showAuth('login'));
    document.getElementById('pricingGetStartedBtn')?.addEventListener('click', () => this.showAuth('register'));

    // Auth back to demo / landing
    document.getElementById('authBrandLogoArea')?.addEventListener('click', () => {
      this.showLanding();
      setTimeout(() => {
        const demoMockup = document.querySelector('.hero-demo-mockup') || document.getElementById('features');
        if (demoMockup) {
          demoMockup.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    });
    document.getElementById('authBackLandingBtn')?.addEventListener('click', () => this.showLanding());

    // Terms & Privacy Modal Logic
    const openTermsModal = (activeTab = 'terms') => {
      const modal = document.getElementById('termsModal');
      if (!modal) return;
      modal.style.display = 'flex';
      switchTermsTab(activeTab);
    };

    const closeTermsModal = () => {
      const modal = document.getElementById('termsModal');
      if (modal) modal.style.display = 'none';
    };

    const switchTermsTab = (tab) => {
      const isTerms = tab === 'terms';
      const termsPanel = document.getElementById('termsContentPanel');
      const privacyPanel = document.getElementById('privacyContentPanel');
      if (termsPanel) termsPanel.style.display = isTerms ? 'block' : 'none';
      if (privacyPanel) privacyPanel.style.display = isTerms ? 'none' : 'block';

      const tabTerms = document.getElementById('tabBtnTerms');
      const tabPriv = document.getElementById('tabBtnPrivacy');
      if (tabTerms && tabPriv) {
        if (isTerms) {
          tabTerms.classList.add('active');
          tabTerms.style.color = '#38bdf8';
          tabTerms.style.borderBottomColor = '#38bdf8';
          tabPriv.classList.remove('active');
          tabPriv.style.color = '#94a3b8';
          tabPriv.style.borderBottomColor = 'transparent';
        } else {
          tabPriv.classList.add('active');
          tabPriv.style.color = '#38bdf8';
          tabPriv.style.borderBottomColor = '#38bdf8';
          tabTerms.classList.remove('active');
          tabTerms.style.color = '#94a3b8';
          tabTerms.style.borderBottomColor = 'transparent';
        }
      }
    };

    document.getElementById('authTermsLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      openTermsModal('terms');
    });
    document.getElementById('authPrivacyLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showPrivacy('auth');
    });
    document.getElementById('loginTermsLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      openTermsModal('terms');
    });
    document.getElementById('loginPrivacyLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showPrivacy('auth');
    });
    document.getElementById('footerTermsLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      openTermsModal('terms');
    });
    document.getElementById('footerPrivacyLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      this.showPrivacy('landing');
    });

    document.getElementById('tabBtnTerms')?.addEventListener('click', () => switchTermsTab('terms'));
    document.getElementById('tabBtnPrivacy')?.addEventListener('click', () => switchTermsTab('privacy'));

    document.getElementById('termsModalCloseBtn')?.addEventListener('click', closeTermsModal);
    document.getElementById('termsModalCloseActionBtn')?.addEventListener('click', closeTermsModal);

    document.getElementById('termsModalAcceptActionBtn')?.addEventListener('click', () => {
      const termsCheck = document.getElementById('registerTerms');
      if (termsCheck) termsCheck.checked = true;
      const termsRow = document.querySelector('.auth-terms-row');
      if (termsRow) termsRow.classList.remove('has-error');
      const alertBox = document.getElementById('authAlert');
      if (alertBox && alertBox.textContent.includes('kullanım koşulları')) {
        this._authAlertClear();
      }
      closeTermsModal();
      this.showToast('Hizmet Şartları ve Gizlilik Politikası kabul edildi.', 'success');
    });

    document.getElementById('termsModal')?.addEventListener('click', (e) => {
      if (e.target.id === 'termsModal') closeTermsModal();
    });

    // Privacy View Events
    document.getElementById('privacyBackBtn')?.addEventListener('click', () => {
      if (this.privacyFromView === 'auth') {
        this.showAuth('register');
      } else {
        this.showLanding();
      }
    });

    document.getElementById('privacyLogoHomeBtn')?.addEventListener('click', () => {
      this.showLanding();
    });

    document.getElementById('privacyTermsSwitchBtn')?.addEventListener('click', () => {
      openTermsModal('terms');
    });

    document.getElementById('privacyPrintBtn')?.addEventListener('click', () => {
      window.print();
    });

    document.getElementById('privacyContactBtn')?.addEventListener('click', () => {
      window.location.href = 'mailto:celikcelik156@gmail.com?subject=YOLO%20Editor%20Gizlilik%20Talebi';
    });

    // Smooth scroll for privacy navigation links
    document.querySelectorAll('.privacy-nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('href');
        const targetEl = document.querySelector(targetId);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          document.querySelectorAll('.privacy-nav-link').forEach(l => l.classList.remove('active'));
          link.classList.add('active');
        }
      });
    });

    // Google OAuth Sign-in & Register
    const handleGoogleLogin = () => {
      window.location.href = '/api/auth/google';
    };

    const handleGoogleRegister = () => {
      const termsInput = document.getElementById('registerTerms');
      const termsRow = document.querySelector('.auth-terms-row');
      if (!termsInput || !termsInput.checked) {
        if (termsRow) {
          termsRow.classList.add('has-error');
          setTimeout(() => termsRow.classList.remove('has-error'), 2500);
        }
        this._authAlert('Google ile kayıt olmadan önce Kullanım Koşulları ve Gizlilik Politikasını onaylamalısınız.', 'error');
        termsInput?.focus();
        return;
      }
      window.location.href = '/api/auth/google';
    };

    document.getElementById('loginGoogleBtn')?.addEventListener('click', handleGoogleLogin);
    document.getElementById('registerGoogleBtn')?.addEventListener('click', handleGoogleRegister);

    // When terms checkbox is checked, clear error
    document.getElementById('registerTerms')?.addEventListener('change', (e) => {
      const termsRow = document.querySelector('.auth-terms-row');
      if (e.target.checked && termsRow) {
        termsRow.classList.remove('has-error');
        const alertBox = document.getElementById('authAlert');
        if (alertBox && alertBox.textContent.includes('kullanım koşulları')) {
          this._authAlertClear();
        }
      }
    });

    // Auth mode switches
    document.getElementById('goRegisterBtn')?.addEventListener('click', () => this._switchAuthMode('register'));

    document.getElementById('goLoginBtn')?.addEventListener('click', () => this._switchAuthMode('login'));
    document.getElementById('goForgotBtn')?.addEventListener('click', () => this._switchAuthMode('forgot'));
    document.getElementById('forgotBackBtn')?.addEventListener('click', () => this._switchAuthMode('login'));

    // Password eye toggle (SVG state)
    document.querySelectorAll('.auth-eye-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const inp = document.getElementById(targetId);
        if (!inp) return;
        const isCurrentlyPassword = inp.type === 'password';
        inp.type = isCurrentlyPassword ? 'text' : 'password';
        btn.innerHTML = isCurrentlyPassword ? `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        ` : `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
        `;
      });
    });

    // Password strength meter
    document.getElementById('registerPassword')?.addEventListener('input', (e) => {
      const fill = document.getElementById('pwStrengthFill');
      const label = document.getElementById('pwStrengthLabel');
      const score = this._checkPasswordStrength(e.target.value);
      const pct = (score / 5) * 100;
      const colors = ['#ef4444', '#f59e0b', '#f59e0b', '#10b981', '#10b981'];
      const labels = ['', 'Çok Zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok Güçlü'];
      const labelColors = ['', '#fca5a5', '#fcd34d', '#fcd34d', '#6ee7b7', '#6ee7b7'];
      if (fill) { fill.style.width = pct + '%'; fill.style.background = colors[score - 1] || '#ef4444'; }
      if (label) { label.textContent = e.target.value ? labels[score] : ''; label.style.color = labelColors[score] || ''; }
    });

    // Input real-time error clearing and Enter key submission
    ['loginEmail', 'loginPassword'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        el.classList.remove('input-error');
        const errEl = document.getElementById(`${id}Error`);
        if (errEl) errEl.textContent = '';
        this._authAlertClear();
      });
      el?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('loginSubmitBtn')?.click();
        }
      });
    });

    ['registerName', 'registerEmail', 'registerPassword', 'registerPasswordConfirm'].forEach(id => {
      const el = document.getElementById(id);
      el?.addEventListener('input', () => {
        el.classList.remove('input-error');
        const errEl = document.getElementById(`${id}Error`);
        if (errEl) errEl.textContent = '';
        this._authAlertClear();
      });
      el?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          document.getElementById('registerSubmitBtn')?.click();
        }
      });
    });

    // LOGIN Submit
    document.getElementById('loginSubmitBtn')?.addEventListener('click', async () => {
      const emailInput = document.getElementById('loginEmail');
      const passwordInput = document.getElementById('loginPassword');
      const email = emailInput?.value.trim();
      const password = passwordInput?.value;
      const emailError = document.getElementById('loginEmailError');
      const passwordError = document.getElementById('loginPasswordError');

      this._authAlertClear();
      emailInput?.classList.remove('input-error');
      passwordInput?.classList.remove('input-error');
      if (emailError) emailError.textContent = '';
      if (passwordError) passwordError.textContent = '';

      let hasError = false;
      if (!email) {
        if (emailError) emailError.textContent = 'Lütfen e-posta adresinizi girin.';
        emailInput?.classList.add('input-error');
        emailInput?.focus();
        hasError = true;
      } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        if (emailError) emailError.textContent = 'Geçerli bir e-posta adresi girin.';
        emailInput?.classList.add('input-error');
        if (!hasError) emailInput?.focus();
        hasError = true;
      }

      if (!password) {
        if (passwordError) passwordError.textContent = 'Lütfen şifrenizi girin.';
        passwordInput?.classList.add('input-error');
        if (!hasError) passwordInput?.focus();
        hasError = true;
      }

      if (hasError) {
        this._authAlert('Lütfen eksik alanları doldurunuz.', 'error');
        return;
      }

      const btn = document.getElementById('loginSubmitBtn');
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Giriş yapılıyor...';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (res.ok && data.token) {
          localStorage.setItem('yolo_auth_token', data.token);
          localStorage.setItem('authToken', data.token);
          sessionStorage.setItem('authToken', data.token);
          this.currentUser = data.user;
          this._updateHeaderUser(data.user);

          // 1. Ekranı hemen açmak yerine "Çalışma alanı analiz ediliyor..." göstergesini aç
          this._showAuthAnalysis('Hesap Doğrulandı', 'Çalışma alanı taranıyor ve analiz ediliyor...');

          // 2. Analiz & Workspace kontrolü
          let hasWorkspace = true;
          try {
            const wsRes = await fetch('/api/workspaces', {
              headers: { 'Authorization': `Bearer ${data.token}` }
            });
            if (wsRes.ok) {
              const wsData = await wsRes.json();
              hasWorkspace = wsData.has_workspace;
            }
          } catch (e) { }

          // Kısa bir geçiş animasyonu (analizin net hissedilmesi için)
          await new Promise(r => setTimeout(r, 650));

          if (!hasWorkspace && !(data.user?.is_admin || data.user?.role === 'admin')) {
            this._updateAuthAnalysisStep('workspace_done', 'Çalışma alanı bulunamadı, sihirbaz başlatılıyor...');
            await new Promise(r => setTimeout(r, 450));
            this._hideAuthAnalysis();
            this.openWorkspaceOnboarding();
          } else {
            this._updateAuthAnalysisStep('workspace_done', 'Çalışma alanları doğrulandı, stüdyo açılıyor...');
            await this.loadUserWorkspaces();
            const targetInitialTab = (data.user?.is_admin || data.user?.role === 'admin') ? 'admin' : 'agent';
            this._updateAuthAnalysisStep('redirect_done', 'Yönlendiriliyorsunuz...');
            await new Promise(r => setTimeout(r, 350));
            this._hideAuthAnalysis();
            this.showToast(`Hoş geldiniz, ${data.user.display_name}!`, 'success');
            await this.showAppShell(targetInitialTab);
          }
        } else {
          this._hideAuthAnalysis();
          const errMsg = data.detail || 'E-posta veya şifre hatalı. Lütfen tekrar deneyin.';
          passwordInput?.classList.add('input-error');
          if (passwordError) passwordError.textContent = errMsg;
          passwordInput?.focus();
          passwordInput?.select();
          this._authAlert(errMsg, 'error');
        }
      } catch (e) {
        this._hideAuthAnalysis();
        this._authAlert('Sunucuya bağlanılamadı. Lütfen internet bağlantınızı veya sunucuyu kontrol edin.', 'error');
      } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Giriş Yap';
      }
    });

    // REGISTER Submit
    document.getElementById('registerSubmitBtn')?.addEventListener('click', async () => {
      const nameInput = document.getElementById('registerName');
      const emailInput = document.getElementById('registerEmail');
      const passwordInput = document.getElementById('registerPassword');
      const confirmInput = document.getElementById('registerPasswordConfirm');
      const termsInput = document.getElementById('registerTerms');

      const name = nameInput?.value.trim();
      const email = emailInput?.value.trim();
      const password = passwordInput?.value;
      const confirm = confirmInput?.value;
      const terms = termsInput?.checked;

      this._authAlertClear();

      // Clear previous error states
      [nameInput, emailInput, passwordInput, confirmInput].forEach(inp => inp?.classList.remove('input-error'));
      ['registerNameError', 'registerEmailError', 'registerPasswordError', 'registerConfirmError'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
      });

      let hasError = false;
      if (!name) {
        document.getElementById('registerNameError').textContent = 'Lütfen adınızı ve soyadınızı girin.';
        nameInput?.classList.add('input-error');
        if (!hasError) nameInput?.focus();
        hasError = true;
      }
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        document.getElementById('registerEmailError').textContent = 'Geçerli bir e-posta adresi girin.';
        emailInput?.classList.add('input-error');
        if (!hasError) emailInput?.focus();
        hasError = true;
      }
      if (!password || password.length < 8) {
        document.getElementById('registerPasswordError').textContent = 'Şifreniz en az 8 karakter olmalıdır.';
        passwordInput?.classList.add('input-error');
        if (!hasError) passwordInput?.focus();
        hasError = true;
      }
      if (password !== confirm) {
        document.getElementById('registerConfirmError').textContent = 'Şifreler birbiriyle eşleşmiyor.';
        confirmInput?.classList.add('input-error');
        if (!hasError) confirmInput?.focus();
        hasError = true;
      }
      const termsRow = document.querySelector('.auth-terms-row');
      if (termsRow) termsRow.classList.remove('has-error');

      if (!terms) {
        if (termsRow) {
          termsRow.classList.add('has-error');
          setTimeout(() => termsRow.classList.remove('has-error'), 2500);
        }
        this._authAlert('Kayıt olmak için Kullanım Koşulları ve Gizlilik Politikasını onaylamalısınız.', 'error');
        hasError = true;
      }

      if (hasError) {
        if (terms) this._authAlert('Lütfen formdaki hataları düzeltin.', 'error');
        return;
      }

      const btn = document.getElementById('registerSubmitBtn');
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Kayıt yapılıyor...';

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, display_name: name, password })
        });
        const data = await res.json();
        if (res.status === 409) {
          // Email already exists
          emailInput?.classList.add('input-error');
          document.getElementById('registerEmailError').textContent = 'Bu e-posta adresiyle zaten kayıtlı bir hesap var.';
          this._authAlert('Bu e-posta adresi zaten kayıtlı. Lütfen giriş yapın.', 'error');
        } else if (res.ok) {
          this._switchAuthMode('login');
          const loginEmailInput = document.getElementById('loginEmail');
          if (loginEmailInput) loginEmailInput.value = email;
          const loginPasswordInput = document.getElementById('loginPassword');
          if (loginPasswordInput) {
            loginPasswordInput.value = '';
            loginPasswordInput.focus();
          }
          this._authAlert('Hesabınız başarıyla oluşturuldu! Lütfen şifrenizle giriş yapın.', 'success');
          this.showToast('Kayıt başarılı! Lütfen giriş yapın.', 'success');
        } else {
          this._authAlert(data.detail || 'Kayıt işlemi tamamlanamadı.', 'error');
        }
      } catch (e) {
        this._authAlert('Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edin.', 'error');
      } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Hesap Oluştur';
      }
    });

    // FORGOT PASSWORD - Send Code (Step 1)
    document.getElementById('forgotSendBtn')?.addEventListener('click', async () => {
      const email = document.getElementById('forgotEmail')?.value.trim();
      const errEl = document.getElementById('forgotEmailError');
      if (errEl) errEl.textContent = '';
      this._authAlertClear();

      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        if (errEl) errEl.textContent = 'Lütfen geçerli bir e-posta adresi girin.';
        return;
      }

      const btn = document.getElementById('forgotSendBtn');
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Kod Gönderiliyor...';

      try {
        const res = await fetch('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (res.ok) {
          document.getElementById('forgotStep1').style.display = 'none';
          document.getElementById('forgotStep2').style.display = 'block';

          const disp = document.getElementById('forgotCodeDisplay');
          if (disp) {
            disp.style.display = 'block';
            if (data.email_sent) {
              disp.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                  <span style="color:#10b981; font-size:1.3rem;">✉️</span>
                  <div>
                    E-posta: <strong>${email}</strong><br>
                    <span style="color:#38bdf8; font-weight:600;">6 haneli doğrulama kodu e-postanıza gönderildi!</span><br>
                    <span style="color:#94a3b8; font-size:0.8rem;">Lütfen gelen kutunuzu (ve spam klasörünü) kontrol edin.</span>
                  </div>
                </div>
              `;
            } else {
              disp.innerHTML = `E-posta: <strong>${email}</strong><br>` +
                (data.reset_code ? `Sıfırlama Kodu: <strong style="font-size:1.3rem;color:#3b82f6;letter-spacing:0.15em;">${data.reset_code}</strong>` : 'Sıfırlama kodunuz oluşturuldu.');
            }
          }

          if (data.reset_code) {
            const codeInput = document.getElementById('forgotCode');
            if (codeInput && !codeInput.value) codeInput.value = data.reset_code;
          }
          this.showToast(data.message || 'Sıfırlama kodu gönderildi.', 'success');
        } else {
          this._authAlert(data.detail || 'İşlem başarısız.', 'error');
        }
      } catch (e) {
        this._authAlert('Sunucu bağlantı hatası.', 'error');
      } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Sıfırlama Kodu Gönder';
      }
    });

    // FORGOT PASSWORD - Reset Password (Step 2)
    document.getElementById('forgotResetBtn')?.addEventListener('click', async () => {
      const email = document.getElementById('forgotEmail')?.value.trim();
      const code = document.getElementById('forgotCode')?.value.trim();
      const newPassword = document.getElementById('forgotNewPassword')?.value;
      const confirmPassword = document.getElementById('forgotNewPasswordConfirm')?.value;

      ['forgotCodeError', 'forgotNewPasswordError', 'forgotNewPasswordConfirmError'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
      });
      this._authAlertClear();

      let hasError = false;
      if (!code || code.length < 6) {
        const el = document.getElementById('forgotCodeError');
        if (el) el.textContent = '6 haneli kodu giriniz.';
        hasError = true;
      }
      if (!newPassword || newPassword.length < 8) {
        const el = document.getElementById('forgotNewPasswordError');
        if (el) el.textContent = 'Şifre en az 8 karakter olmalıdır.';
        hasError = true;
      }
      if (newPassword !== confirmPassword) {
        const el = document.getElementById('forgotNewPasswordConfirmError');
        if (el) el.textContent = 'Şifreler eşleşmiyor.';
        hasError = true;
      }
      if (hasError) return;

      const btn = document.getElementById('forgotResetBtn');
      btn.disabled = true;
      btn.querySelector('span').textContent = 'Şifre Güncelleniyor...';

      try {
        const res = await fetch('/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code, new_password: newPassword })
        });
        const data = await res.json();
        if (res.ok) {
          this.showToast('Şifreniz başarıyla güncellendi! Giriş yapabilirsiniz.', 'success');
          this._switchAuthMode('login');
          const loginEmailInput = document.getElementById('loginEmail');
          if (loginEmailInput) loginEmailInput.value = email;
          const loginPasswordInput = document.getElementById('loginPassword');
          if (loginPasswordInput) {
            loginPasswordInput.value = '';
            loginPasswordInput.focus();
          }
          // Reset steps back
          document.getElementById('forgotStep1').style.display = 'block';
          document.getElementById('forgotStep2').style.display = 'none';
        } else {
          this._authAlert(data.detail || 'Şifre sıfırlama başarısız.', 'error');
        }
      } catch (e) {
        this._authAlert('Sunucu bağlantı hatası.', 'error');
      } finally {
        btn.disabled = false;
        btn.querySelector('span').textContent = 'Şifreyi Güncelle ve Giriş Yap';
      }
    });
  }

  setupWorkspaceEvents() {
    // Sol menü (Global Sidebar) çalışma alanı sekmeleri (Agent, Projeler, Şablonlar, Model Eğit, Modeller, Ekip vb.)
    document.querySelectorAll('.ws-nav-item[data-wstab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.wstab;
        if (this.isProjectContext) {
          this.closeProjectToWorkspace(false);
        }
        if (tab === 'agent') {
          if (typeof this.resetAgentToHero === 'function') {
            this.resetAgentToHero();
          }
        }
        this.switchWorkspaceTab(tab);
      });
    });

    // Rail logo tıklandığında ana ekrana dön
    document.querySelector('.ws-brand-row')?.addEventListener('click', () => {
      if (this.isProjectContext) this.closeProjectToWorkspace(false);
      this.switchWorkspaceTab('agent');
    });

    // Proje İç Yan Menü - Geri Dön Butonları
    document.getElementById('projBackToWorkspaceBtn')?.addEventListener('click', () => {
      this.closeProjectToWorkspace(true);
    });
    document.getElementById('hubBackToDashBtn')?.addEventListener('click', () => {
      this.closeProjectToWorkspace(true);
    });

    // Proje Yan Menü (Project Sidebar) Sekme Butonları (Veri Yükle, Etiketle, Galeri, Sınıflar, Kalite Analizi vb.)
    document.querySelectorAll('.proj-nav-item[data-ptab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchProjectTab(btn.dataset.ptab);
      });
    });

    // Hub Sidebar Butonları
    document.querySelectorAll('.hub-nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchProjectTab(btn.dataset.tab);
      });
    });

    // Stüdyo Başlat Butonları
    const handleLaunchStudio = () => {
      if (this.activeHubProjectId) {
        this.showEditor(this.activeHubProjectId);
      }
    };
    document.getElementById('projLaunchStudioBtn')?.addEventListener('click', handleLaunchStudio);
    document.getElementById('hubLaunchStudioBtn')?.addEventListener('click', handleLaunchStudio);
    document.getElementById('hubQuickStartAnnotateBtn')?.addEventListener('click', handleLaunchStudio);

    // Kanban Yükle & Atanmamışları İncele Butonları
    document.getElementById('kanbanUploadMoreImagesBtn')?.addEventListener('click', () => {
      this.switchProjectTab('upload');
    });
    document.getElementById('kanbanViewUnassignedImagesBtn')?.addEventListener('click', () => {
      this.switchProjectTab('dataset');
      const filterSelect = document.getElementById('datasetFilterStatus');
      if (filterSelect) filterSelect.value = 'unlabeled';
      this.renderDatasetGallery();
    });

    // Hub Dataset Toolbar
    document.getElementById('datasetSearchInput')?.addEventListener('input', () => this.renderDatasetGallery());
    document.getElementById('datasetFilterStatus')?.addEventListener('change', () => this.renderDatasetGallery());
    document.getElementById('toggleAnnotationsCheck')?.addEventListener('change', () => this.renderDatasetGallery());

    // Hub Dışa Aktarma ve AI
    document.getElementById('hubExportZipBtn')?.addEventListener('click', () => {
      if (this.activeHubProjectId) this.openExportModal(this.activeHubProjectId);
    });
    document.getElementById('hubBatchAiBtn')?.addEventListener('click', () => {
      if (this.activeHubProjectId) this.showEditor(this.activeHubProjectId);
    });
    document.getElementById('hubDeleteProjectBtn')?.addEventListener('click', () => {
      if (this.activeHubProjectId) {
        this.deleteProject(this.activeHubProjectId, true);
      }
    });

    this.setupWorkspaceSwitcherEvents();
    this.setupWorkspaceOnboardingEvents();
    this.setupCreditWidgetEvents();
    this.setupUserMenuEvents();
    this.setupSettingsSubnav();
  }

  setupWorkspaceSwitcherEvents() {
    const selectorBox = document.getElementById('wsSelectorBox');
    const dropdown = document.getElementById('wsWorkspaceDropdown');
    const createBtn = document.getElementById('wsCreateNewBtn');

    const toggleDropdown = (e) => {
      e.stopPropagation();
      if (!dropdown) return;
      const isOpen = dropdown.style.display === 'flex';
      dropdown.style.display = isOpen ? 'none' : 'flex';
      // Close other popovers if open
      const userPop = document.getElementById('wsUserPopover');
      if (userPop && !isOpen) userPop.style.display = 'none';
      const flyout = document.getElementById('wsCreditFlyout');
      if (flyout && !isOpen) flyout.style.display = 'none';
    };

    selectorBox?.addEventListener('click', toggleDropdown);

    document.addEventListener('click', (e) => {
      if (dropdown && !dropdown.contains(e.target) && !e.target.closest('#wsSelectorBox')) {
        dropdown.style.display = 'none';
      }
    });

    const handleOpenOnboarding = (e) => {
      e.stopPropagation();
      if (dropdown) dropdown.style.display = 'none';
      this.openWorkspaceOnboarding();
    };

    createBtn?.addEventListener('click', handleOpenOnboarding);
    document.getElementById('wsCreateNewActionBtn')?.addEventListener('click', handleOpenOnboarding);

    document.getElementById('wsObCloseBtn')?.addEventListener('click', () => {
      const obScreen = document.getElementById('workspaceOnboardingScreen');
      if (obScreen) {
        obScreen.style.display = 'none';
        obScreen.classList.remove('active');
      }
      this.showAppShell('projects', false);
    });

    // Delegated click for default / static workspace items
    const wsList = document.getElementById('wsWorkspaceList');
    wsList?.addEventListener('click', (e) => {
      const item = e.target.closest('.ws-item');
      if (!item) return;
      const wsName = item.querySelector('.ws-item-name')?.textContent || 'Workspace';
      const wsSub = item.querySelector('.ws-item-sub')?.textContent || '';

      wsList.querySelectorAll('.ws-item').forEach(i => {
        i.classList.remove('active');
        const check = i.querySelector('.ws-item-check');
        if (check) check.remove();
      });
      item.classList.add('active');
      item.insertAdjacentHTML('beforeend', `
        <svg class="ws-item-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `);

      const titleEl = document.getElementById('wsTitle');
      if (titleEl) {
        titleEl.textContent = wsName;
        titleEl.title = wsName;
      }
      const badgeEl = document.querySelector('.ws-plan-badge');
      if (badgeEl && wsSub) badgeEl.textContent = wsSub;

      if (dropdown) dropdown.style.display = 'none';
      this.showToast(`${wsName} çalışma alanına geçildi.`, 'info');
      if (this.isProjectContext) this.closeProjectToWorkspace(false);
      this.switchWorkspaceTab('projects');
    });
  }

  // =====================================================
  // ROBOFLOW-STYLE WORKSPACE ONBOARDING (4-STEP WIZARD)
  // =====================================================
  setupWorkspaceOnboardingEvents() {
    if (this._wsObEventsBound) return;
    this._wsObEventsBound = true;

    this.currentObStep = 1;
    this.obData = {
      name: '',
      plan: 'premium_trial',
      vision_goal: '',
      output_target: '',
      data_sources: ''
    };

    const obScreen = document.getElementById('workspaceOnboardingScreen');
    if (!obScreen) return;

    // 1. Direct and reliable plan card click listeners
    const planCards = obScreen.querySelectorAll('.ws-ob-plan-card');
    planCards.forEach(card => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        planCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.obData.plan = card.dataset.plan || 'premium_trial';
      });
    });

    // 2. Direct Continue Button listener
    const contBtn = document.getElementById('wsObContinueBtn');
    contBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      await this.handleOnboardingContinue();
    });

    // 3. Direct Back Button listener
    const backBtn = document.getElementById('wsObBackBtn');
    backBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.currentObStep > 1) {
        this.goToOnboardingStep(this.currentObStep - 1);
      }
    });

    // 4. Delegated handler as additional safeguard
    obScreen.addEventListener('click', async (e) => {
      // Plan Card Selection fallback
      const planCard = e.target.closest('.ws-ob-plan-card');
      if (planCard) {
        planCards.forEach(c => c.classList.remove('selected'));
        planCard.classList.add('selected');
        this.obData.plan = planCard.dataset.plan || 'premium_trial';
        return;
      }

      // Preset Example Item Clicks
      const exampleItem = e.target.closest('.ws-ob-example-item');
      if (exampleItem) {
        const text = exampleItem.dataset.fill;
        if (!text) return;
        if (this.currentObStep === 2) {
          const inp = document.getElementById('wsObVisionGoalInput');
          if (inp) { inp.value = text; inp.focus(); }
        } else if (this.currentObStep === 3) {
          const inp = document.getElementById('wsObOutputTargetInput');
          if (inp) { inp.value = text; inp.focus(); }
        } else if (this.currentObStep === 4) {
          const inp = document.getElementById('wsObDataSourcesInput');
          if (inp) { inp.value = text; inp.focus(); }
        }
        return;
      }

      // Fallback Back Button
      if (e.target.closest('#wsObBackBtn')) {
        if (this.currentObStep > 1) {
          this.goToOnboardingStep(this.currentObStep - 1);
        }
        return;
      }

      // Fallback Continue Button
      if (e.target.closest('#wsObContinueBtn')) {
        await this.handleOnboardingContinue();
        return;
      }
    });
  }

  async handleOnboardingContinue() {
    if (this.currentObStep === 1) {
      const nameInp = document.getElementById('wsObNameInput');
      const name = nameInp?.value.trim();
      if (!name) {
        this.showToast('Lütfen çalışma alanınız için bir ad girin.', 'error');
        nameInp?.focus();
        return;
      }
      this.obData.name = name;
      this.goToOnboardingStep(2);
    } else if (this.currentObStep === 2) {
      this.obData.vision_goal = document.getElementById('wsObVisionGoalInput')?.value.trim() || '';
      this.goToOnboardingStep(3);
    } else if (this.currentObStep === 3) {
      this.obData.output_target = document.getElementById('wsObOutputTargetInput')?.value.trim() || '';
      this.goToOnboardingStep(4);
    } else if (this.currentObStep === 4) {
      this.obData.data_sources = document.getElementById('wsObDataSourcesInput')?.value.trim() || '';
      await this.submitWorkspaceOnboarding();
    }
  }

  openWorkspaceOnboarding() {
    this.hideAllViews();
    this.setupWorkspaceOnboardingEvents();
    const obScreen = document.getElementById('workspaceOnboardingScreen');
    if (obScreen) {
      obScreen.style.display = 'flex';
      obScreen.classList.add('active');
    }
    this.currentObStep = 1;
    // Default name if user exists
    const nameInp = document.getElementById('wsObNameInput');
    if (nameInp && !nameInp.value) {
      const uName = this.currentUser?.display_name || this.currentUser?.email?.split('@')[0] || 'My';
      nameInp.value = `${uName}'s Workspace`;
    }
    this.goToOnboardingStep(1);
    if (typeof this.showLoading === 'function') this.showLoading(false);
  }

  goToOnboardingStep(stepNumber) {
    this.currentObStep = stepNumber;

    // Progress Indicator & Bars
    const ind = document.getElementById('wsObStepIndicator');
    if (ind) ind.textContent = `Adım ${stepNumber} / 4`;

    for (let i = 1; i <= 4; i++) {
      const bar = document.getElementById(`wsObBar${i}`);
      if (bar) bar.classList.toggle('active', i <= stepNumber);
      const page = document.getElementById(`wsObStep${i}`);
      if (page) page.style.display = (i === stepNumber) ? 'block' : 'none';
    }

    // Back Button Visibility
    const backBtn = document.getElementById('wsObBackBtn');
    if (backBtn) {
      backBtn.style.visibility = (stepNumber === 1) ? 'hidden' : 'visible';
    }

    // Continue Button Text
    const contBtn = document.getElementById('wsObContinueBtn');
    if (contBtn) {
      const span = contBtn.querySelector('span');
      if (span) {
        span.textContent = (stepNumber === 4) ? 'Çalışma Alanını Başlat' : 'Devam Et';
      }
    }

    // Dynamic right side label update
    const previewLbl = document.getElementById('wsObPreviewLabel');
    if (previewLbl) {
      if (stepNumber === 1) previewLbl.textContent = 'YOLO-World v2 · %98.4';
      else if (stepNumber === 2) previewLbl.textContent = 'Hedef Model Yapılandırılıyor';
      else if (stepNumber === 3) previewLbl.textContent = 'Entegrasyon Hazır';
      else if (stepNumber === 4) previewLbl.textContent = 'Veri Akışı Bağlanıyor';
    }
  }

  async submitWorkspaceOnboarding() {
    const contBtn = document.getElementById('wsObContinueBtn');
    if (contBtn) {
      contBtn.disabled = true;
      contBtn.querySelector('span').textContent = 'Oluşturuluyor...';
    }

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken');
      const res = await fetch('/api/workspaces/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(this.obData)
      });

      const data = await res.json();
      if (res.ok && data.workspace) {
        this.showToast(`'${data.workspace.name}' çalışma alanınız başarıyla oluşturuldu!`, 'success');

        // Hide onboarding screen
        const obScreen = document.getElementById('workspaceOnboardingScreen');
        if (obScreen) {
          obScreen.style.display = 'none';
          obScreen.classList.remove('active');
        }

        // Add to active workspace and list
        await this.loadUserWorkspaces(data.workspace.id);

        // Transition to Agent view with AI prompt filled if vision_goal was provided
        if (this.obData.vision_goal) {
          const promptInput = document.getElementById('agentPromptInput');
          if (promptInput) promptInput.value = this.obData.vision_goal;
        }

        await this.showAppShell('agent', true);
      } else {
        this.showToast(data.detail || 'Çalışma alanı oluşturulamadı.', 'error');
      }
    } catch (err) {
      this.showToast('Bağlantı hatası oluştu. Lütfen tekrar deneyin.', 'error');
    } finally {
      if (contBtn) {
        contBtn.disabled = false;
        contBtn.querySelector('span').textContent = 'Çalışma Alanını Başlat';
      }
    }
  }

  async loadUserWorkspaces(preferredWsId = null) {
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken');
      if (!token) return;

      const res = await fetch('/api/workspaces', {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!res.ok) return;
      const data = await res.json();
      const list = document.getElementById('wsWorkspaceList');
      if (!list) return;

      if (!data.has_workspace) {
        const isAdmin = !!(this.currentUser?.is_admin || this.currentUser?.role === 'admin');
        if (!isAdmin) {
          // Kullanıcının henüz bir workspace'i yok! Doğrudan Roboflow sihirbazını aç
          this.openWorkspaceOnboarding();
          return;
        }
      }

      // Var olan workspace'leri listeye doldur
      list.innerHTML = '';
      this.userWorkspaces = data.workspaces || [];
      const savedWsId = preferredWsId || localStorage.getItem('activeWorkspaceId');
      let activeWs = this.userWorkspaces.find(w => w.id === savedWsId);
      if (!activeWs && this.userWorkspaces.length > 0) {
        activeWs = this.userWorkspaces[0];
      }
      if (activeWs) {
        this.activeWorkspaceId = activeWs.id;
        localStorage.setItem('activeWorkspaceId', activeWs.id);
      }

      data.workspaces.forEach((ws, idx) => {
        const isActive = activeWs ? (ws.id === activeWs.id) : (idx === 0);
        const initials = this._getInitials(ws.name);
        const planText = ws.plan === 'premium_trial' ? 'Premium Plan · 14 Gün' : 'Açık Kaynak Plan';

        const item = document.createElement('div');
        item.className = `ws-item ${isActive ? 'active' : ''}`;
        item.dataset.wsid = ws.id;
        item.innerHTML = `
          <div class="ws-item-left">
            <div class="ws-item-avatar" style="background:linear-gradient(135deg,#6366f1,#a855f7);">${initials}</div>
            <div class="ws-item-info">
              <span class="ws-item-name" title="${this._escapeHtml(ws.name)}">${this._escapeHtml(ws.name)}</span>
              <span class="ws-item-sub">${planText}</span>
            </div>
          </div>
          ${isActive ? `
            <svg class="ws-item-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          ` : ''}
        `;

        item.addEventListener('click', async () => {
          document.querySelectorAll('.ws-item').forEach(i => {
            i.classList.remove('active');
            const check = i.querySelector('.ws-item-check');
            if (check) check.remove();
          });
          item.classList.add('active');
          item.insertAdjacentHTML('beforeend', `
            <svg class="ws-item-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          `);

          this.activeWorkspaceId = ws.id;
          localStorage.setItem('activeWorkspaceId', ws.id);

          const titleEl = document.getElementById('wsTitle');
          if (titleEl) {
            titleEl.textContent = ws.name;
            titleEl.title = ws.name;
          }
          const badgeEl = document.querySelector('.ws-plan-badge');
          if (badgeEl) badgeEl.textContent = planText;

          const dropdown = document.getElementById('wsWorkspaceDropdown');
          if (dropdown) dropdown.style.display = 'none';

          this.showToast(`${ws.name} çalışma alanına geçildi.`, 'info');
          if (this.isProjectContext) this.closeProjectToWorkspace(false);
          await this.fetchProjects();
          this.switchWorkspaceTab('projects');
        });

        list.appendChild(item);

        if (isActive) {
          const titleEl = document.getElementById('wsTitle');
          if (titleEl) {
            titleEl.textContent = ws.name;
            titleEl.title = ws.name;
          }
          const badgeEl = document.querySelector('.ws-plan-badge');
          if (badgeEl) badgeEl.textContent = planText;
        }
      });

    } catch (err) {
      console.warn('Workspaces fetch error:', err);
    }
  }

  setupCreditWidgetEvents() {
  const compactBtn = document.getElementById('wsCreditCompactBtn');
  const flyout = document.getElementById('wsCreditFlyout');
  const upgradeBtn = document.getElementById('wsCreditUpgradeBtn');
  const usageLink = document.getElementById('wsFlyoutUsageLink');

  const toggleFlyout = (e) => {
    e.stopPropagation();
    if (!flyout) return;
    const isOpen = flyout.style.display === 'flex';
    flyout.style.display = isOpen ? 'none' : 'flex';
    // Kullanıcı popover'ı açıksa kapat
    const userPopover = document.getElementById('wsUserPopover');
    if (userPopover && !isOpen) userPopover.style.display = 'none';
  };

  compactBtn?.addEventListener('click', toggleFlyout);

  // Dışarı tıklanınca flyout'u kapat
  document.addEventListener('click', (e) => {
    if (flyout && !flyout.contains(e.target) && !e.target.closest('#wsCreditCompactBtn')) {
      flyout.style.display = 'none';
    }
  });

  const openUsageSettings = () => {
    if (flyout) flyout.style.display = 'none';
    if (this.isProjectContext) this.closeProjectToWorkspace(false);
    this.switchWorkspaceTab('settings');
  };

  upgradeBtn?.addEventListener('click', openUsageSettings);
  usageLink?.addEventListener('click', openUsageSettings);
}

setupUserMenuEvents() {
  const popover = document.getElementById('wsUserPopover');
  const userBtn = document.getElementById('wsUserMenuBtn');
  if (!userBtn || !popover) return;

  if (userBtn._boundUserMenu) return;
  userBtn._boundUserMenu = true;

  const togglePopover = (e) => {
    e.stopPropagation();
    const isOpen = popover.style.display === 'block';
    popover.style.display = isOpen ? 'none' : 'block';
    // Kredi flyout'u açıksa kapat
    const flyout = document.getElementById('wsCreditFlyout');
    if (flyout && !isOpen) flyout.style.display = 'none';
  };

  userBtn.addEventListener('click', togglePopover);

  document.addEventListener('click', (e) => {
    if (popover && popover.style.display === 'block' && !popover.contains(e.target) && !e.target.closest('#wsUserMenuBtn')) {
      popover.style.display = 'none';
    }
  });

  // Popover item actions
  document.getElementById('wsMenuGoSettings')?.addEventListener('click', () => {
    if (popover) popover.style.display = 'none';
    if (this.isProjectContext) this.closeProjectToWorkspace(false);
    this.switchWorkspaceTab('settings');
  });

  document.getElementById('wsMenuGoAdmin')?.addEventListener('click', () => {
    if (popover) popover.style.display = 'none';
    if (this.isProjectContext) this.closeProjectToWorkspace(false);
    this.switchWorkspaceTab('admin');
  });

  document.getElementById('wsMenuTerms')?.addEventListener('click', () => {
    if (popover) popover.style.display = 'none';
    const modal = document.getElementById('termsModal');
    if (modal) modal.style.display = 'flex';
  });

  // Safe Logout Button
  document.getElementById('wsLogoutBtn')?.addEventListener('click', () => {
    if (popover) popover.style.display = 'none';
    if (typeof this.logout === 'function') {
      this.logout();
    }
  });
}

_getInitials(name = '') {
  if (!name || typeof name !== 'string') return 'U';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

_updateHeaderUser(user) {
  if (!user) return;
  this.currentUser = user;
  const displayName = user.display_name || user.email?.split('@')[0] || 'Kullanıcı';
  const email = user.email || '';
  const isAdmin = user.is_admin || user.role === 'admin';
  const roleText = isAdmin ? 'Süper Yönetici' : 'Workspace Sahibi';
  const initials = this._getInitials(displayName);

  // 1. Sidebar profil alanları
  const userNameEl = document.getElementById('wsUserName');
  if (userNameEl) userNameEl.textContent = displayName;
  const userRoleEl = document.getElementById('wsUserRole');
  if (userRoleEl) userRoleEl.textContent = roleText;

  // Greeting in Agent View
  const greetingEl = document.getElementById('agentUserNameGreeting');
  if (greetingEl) greetingEl.textContent = displayName;

  // Populate Preferences View
  const prefName = document.getElementById('userPrefDisplayName');
  const prefEmail = document.getElementById('userPrefEmail');
  if (prefName) prefName.value = displayName;
  if (prefEmail) prefEmail.value = email;

  // Popover içindeki bilgiler
  const popName = document.getElementById('wsPopoverName');
  if (popName) popName.textContent = displayName;
  const popEmail = document.getElementById('wsPopoverEmail');
  if (popEmail) popEmail.textContent = email;
  const popBadge = document.getElementById('wsPopoverRoleBadge');
  if (popBadge) {
    popBadge.textContent = roleText;
    popBadge.style.color = isAdmin ? '#a855f7' : '#60a5fa';
    popBadge.style.background = isAdmin ? 'rgba(168,85,247,0.18)' : 'rgba(59,130,246,0.18)';
    popBadge.style.borderColor = isAdmin ? 'rgba(168,85,247,0.3)' : 'rgba(59,130,246,0.3)';
  }

  // Admin paneli butonu görünürlüğü
  const adminNavBtn = document.getElementById('wsNavAdmin');
  if (adminNavBtn) {
    adminNavBtn.style.display = isAdmin ? 'flex' : 'none';
  }
  const popoverAdminBtn = document.getElementById('wsMenuGoAdmin');
  if (popoverAdminBtn) {
    popoverAdminBtn.style.display = isAdmin ? 'flex' : 'none';
  }

  // 2. Avatar vs Initials Görünümü
  const updateAvatarElement = (imgId, initId) => {
    const img = document.getElementById(imgId);
    const init = document.getElementById(initId);
    if (!img || !init) return;

    init.textContent = initials;

    if (user.avatar_url && !user.avatar_url.includes('ui-avatars.com')) {
      img.src = user.avatar_url;
      img.onload = () => {
        img.style.display = 'block';
        init.style.display = 'none';
      };
      img.onerror = () => {
        img.style.display = 'none';
        init.style.display = 'flex';
      };
    } else {
      // Profil resmi yoksa baş harfler gradient ile parlasın
      img.style.display = 'none';
      init.style.display = 'flex';
    }
  };

  updateAvatarElement('wsUserAvatar', 'wsUserInitials');
  updateAvatarElement('wsPopoverAvatar', 'wsPopoverInitials');
  this.setupUserMenuEvents();
}

setupSettingsSubnav() {
  const navItems = document.querySelectorAll('.ws-settings-nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tabKey = item.getAttribute('data-settab');
      this.switchSettingsTab(tabKey);
    });
  });

  // Profil güncelle butonu
  document.getElementById('btnSaveProfileInfo')?.addEventListener('click', async () => {
    const name = document.getElementById('userPrefDisplayName')?.value.trim();
    if (!name) return this.showToast('Görünen ad boş olamaz', 'warning');
    try {
      const res = await fetch('/api/user/profile', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ display_name: name })
      });
      if (res.ok) {
        this.showToast('Profil bilgileri başarıyla güncellendi ✓', 'success');
        this.initUserAndCreditState();
      } else {
        this.showToast('Profil güncellenemedi', 'error');
      }
    } catch (e) {
      this.showToast('Bağlantı hatası', 'error');
    }
  });

  // Şifre güncelle butonu
  document.getElementById('btnUpdatePassword')?.addEventListener('click', async () => {
    const cur = document.getElementById('userPrefCurrentPass')?.value;
    const n1 = document.getElementById('userPrefNewPass')?.value;
    const n2 = document.getElementById('userPrefNewPassConfirm')?.value;
    if (!cur || !n1) return this.showToast('Lütfen tüm alanları doldurun', 'warning');
    if (n1 !== n2) return this.showToast('Yeni şifreler uyuşmuyor', 'warning');
    if (n1.length < 6) return this.showToast('Şifre en az 6 karakter olmalıdır', 'warning');

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ current_password: cur, new_password: n1 })
      });
      const data = await res.json();
      if (res.ok) {
        this.showToast('Şifreniz başarıyla değiştirildi ✓', 'success');
        document.getElementById('userPrefCurrentPass').value = '';
        document.getElementById('userPrefNewPass').value = '';
        document.getElementById('userPrefNewPassConfirm').value = '';
      } else {
        this.showToast(data.detail || 'Şifre güncellenemedi', 'error');
      }
    } catch (e) {
      this.showToast('Sunucu hatası', 'error');
    }
  });

  // Kullanıcı Editör ve Etiketleme Tercihlerini Kaydet
  document.getElementById('btnSaveEditorPreferences')?.addEventListener('click', () => {
    const autoSave = document.getElementById('userPrefAutoSave')?.checked ?? true;
    const guideLines = document.getElementById('userPrefGuideLines')?.checked ?? true;
    const autoEnhance = document.getElementById('userPrefAutoEnhance')?.checked ?? true;
    const skipEmpty = document.getElementById('userPrefSkipEmpty')?.checked ?? false;
    const defaultTool = document.getElementById('userPrefDefaultTool')?.value || 'draw';

    localStorage.setItem('yolo_pref_autosave', String(autoSave));
    localStorage.setItem('yolo_pref_guidelines', String(guideLines));
    localStorage.setItem('yolo_pref_autoenhance', String(autoEnhance));
    localStorage.setItem('yolo_pref_skipempty', String(skipEmpty));
    localStorage.setItem('yolo_pref_defaulttool', defaultTool);

    // Aktif editör durumuna da yansıt
    this.autoSave = autoSave;
    this.showGuideLines = guideLines;
    this.autoEnhance = autoEnhance;
    this.skipEmpty = skipEmpty;
    this.mode = defaultTool;

    if (this.autoSaveToggle) this.autoSaveToggle.checked = autoSave;
    if (this.toggleGuideLinesBtn) this.toggleGuideLinesBtn.classList.toggle('active', guideLines);
    if (this.autoEnhanceBtn) this.autoEnhanceBtn.classList.toggle('active', autoEnhance);
    if (this.skipEmptyBtn) this.skipEmptyBtn.classList.toggle('active', skipEmpty);

    this.showToast('Editör ve etiketleme tercihleriniz kaydedildi ✓', 'success');
  });


  // Çalışma alanı adı güncelle butonu
  document.getElementById('btnSaveWorkspaceName')?.addEventListener('click', async () => {
    const name = document.getElementById('wsMgmtWorkspaceName')?.value.trim();
    if (!name) return this.showToast('Çalışma alanı adı boş olamaz', 'warning');
    const wsId = this.activeWorkspaceId || localStorage.getItem('activeWorkspaceId');
    if (!wsId || wsId.startsWith('ws_team_')) {
      return this.showToast('Takım çalışma alanlarının adı Takım Ayarlarından değiştirilir.', 'warning');
    }
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || '';
      const res = await fetch(`/api/workspaces/${encodeURIComponent(wsId)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ name: name })
      });
      const data = await res.json();
      if (res.ok) {
        this.showToast('Çalışma alanı adı başarıyla güncellendi ✓', 'success');
        await this.loadUserWorkspaces(wsId);
      } else {
        this.showToast(data.detail || 'Çalışma alanı güncellenemedi', 'error');
      }
    } catch (e) {
      this.showToast('Bağlantı hatası', 'error');
    }
  });

  // Çalışma alanını sil butonu (Danger Zone)
  document.getElementById('btnDeleteCurrentWorkspace')?.addEventListener('click', async () => {
    const wsId = this.activeWorkspaceId || localStorage.getItem('activeWorkspaceId');
    if (!wsId || wsId.startsWith('ws_team_')) {
      return this.showToast('Takım çalışma alanları bu ekrandan silinemez.', 'warning');
    }
    const ok = confirm('DİKKAT: Bu işlem geri alınamaz! Bu çalışma alanındaki tüm projeler ve etiketler kalıcı olarak silinecektir. Devam etmek istiyor musunuz?');
    if (!ok) return;

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || '';
      const res = await fetch(`/api/workspaces/${encodeURIComponent(wsId)}`, {
        method: 'DELETE',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (res.ok) {
        this.showToast('Çalışma alanı başarıyla silindi ✓', 'success');
        localStorage.removeItem('activeWorkspaceId');
        this.activeWorkspaceId = null;
        await this.loadUserWorkspaces();
        await this.fetchProjects();
        this.switchWorkspaceTab('projects');
      } else {
        this.showToast(data.detail || 'Çalışma alanı silinemedi', 'error');
      }
    } catch (e) {
      this.showToast('Bağlantı hatası', 'error');
    }
  });
}

async loadSettingsViewData() {
  // Kullanıcı editör tercihlerini forma doldur
  const prefAutoSave = document.getElementById('userPrefAutoSave');
  const prefGuideLines = document.getElementById('userPrefGuideLines');
  const prefAutoEnhance = document.getElementById('userPrefAutoEnhance');
  const prefSkipEmpty = document.getElementById('userPrefSkipEmpty');
  const prefDefaultTool = document.getElementById('userPrefDefaultTool');

  if (prefAutoSave) prefAutoSave.checked = localStorage.getItem('yolo_pref_autosave') !== 'false';
  if (prefGuideLines) prefGuideLines.checked = localStorage.getItem('yolo_pref_guidelines') !== 'false';
  if (prefAutoEnhance) prefAutoEnhance.checked = localStorage.getItem('yolo_pref_autoenhance') !== 'false';
  if (prefSkipEmpty) prefSkipEmpty.checked = localStorage.getItem('yolo_pref_skipempty') === 'true';
  if (prefDefaultTool) prefDefaultTool.value = localStorage.getItem('yolo_pref_defaulttool') || 'draw';

  const activeWsId = this.activeWorkspaceId || localStorage.getItem('activeWorkspaceId');
  const wsNameInput = document.getElementById('wsMgmtWorkspaceName');
  if (activeWsId && this.userWorkspaces) {
    const curWs = this.userWorkspaces.find(w => w.id === activeWsId);
    if (curWs && wsNameInput) {
      wsNameInput.value = curWs.name;
    }
  }
  // Gerçek kullanıcı kredi kullanımını ayarlar ekranına yansıt
  const credText = document.getElementById('setUsageCreditText');
  const credFill = document.getElementById('setUsageCreditFill');
  if (this.currentUser) {
    const curCredits = this.currentUser.credits !== undefined ? this.currentUser.credits : 0;
    const maxCredits = this.currentUser.max_credits || 30;
    if (credText) credText.textContent = `${curCredits} / ${maxCredits} Kredi`;
    if (credFill) credFill.style.width = `${Math.min(100, Math.round((curCredits / maxCredits) * 100))}%`;
  }
  // Aktif çalışma alanının gerçek proje ve görsel istatistiklerini çek
  if (activeWsId) {
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || '';
      const res = await fetch(`/api/workspaces/${encodeURIComponent(activeWsId)}/stats`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (res.ok) {
        const stats = await res.json();
        const imgText = document.getElementById('setUsageImagesText');
        const imgFill = document.getElementById('setUsageImagesFill');
        const imgSub = document.getElementById('setUsageImagesSub');
        const totalImg = stats.total_images || 0;
        const labeledImg = stats.total_labeled || 0;
        if (imgText) {
          imgText.textContent = `${labeledImg.toLocaleString('tr-TR')} / ${totalImg.toLocaleString('tr-TR')} Görsel`;
        }
        if (imgFill) {
          const pct = totalImg > 0 ? Math.min(100, Math.round((labeledImg / totalImg) * 100)) : 0;
          imgFill.style.width = `${pct}%`;
        }
        if (imgSub) {
          imgSub.textContent = `Bu çalışma alanındaki ${stats.project_count || 0} projede toplam ${labeledImg} etiketli görsel bulunuyor.`;
        }
      }
    } catch (e) {}
  }
}

switchSettingsTab(tabKey) {
  const tabAliases = {
    'login-security': 'profile-security',
    'plan-billing': 'usage-plan',
    'usage-credits': 'usage-plan',
    'workspace-mgmt': 'usage-plan',
    'datasources-storage': 'editor-preferences',
  };
  const resolvedKey = tabAliases[tabKey] || tabKey;

  const navItems = document.querySelectorAll('.ws-settings-nav-item');
  navItems.forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-settab') === resolvedKey);
  });

  const panels = {
    'profile-security': 'tabSetProfileSecurity',
    'editor-preferences': 'tabSetEditorPreferences',
    'usage-plan': 'tabSetUsagePlan'
  };

  Object.entries(panels).forEach(([key, panelId]) => {
    const panel = document.getElementById(panelId);
    if (panel) {
      panel.classList.toggle('active', key === resolvedKey);
    }
  });
}

buyCreditsPackage(credits, price) {
  this.showToast(`${credits} Kredi Paketi ($${price}) için ödeme ekranı açılıyor...`, 'info');
}

// =====================================================
// CLEAR ALL USER-SPECIFIC STATE (called on logout / user switch)
// =====================================================
clearUserState() {
  localStorage.removeItem('yolo_auth_token');
  localStorage.removeItem('authToken');
  sessionStorage.removeItem('authToken');
  localStorage.removeItem('yolo_user_name');
  this.currentUser = null;

  // Projects & workspace
  this.projectsList = [];
  this.projects = [];
  this.classes = {};

  // Hub / project context
  this.activeHubProjectId = null;
  this.activeHubTab = 'upload';
  this.currentHubImages = [];
  this.isProjectContext = false;
  this.selectedDatasetImageFilenames = new Set();
  this.stagedUploadFiles = [];

  // Clear UI elements
  const grid = document.getElementById('projectsGrid');
  if (grid) grid.innerHTML = '';
  const agentRecent = document.getElementById('agentRecentProjectsList');
  if (agentRecent) agentRecent.innerHTML = '';
  const userNameEl = document.getElementById('wsUserName');
  if (userNameEl) userNameEl.textContent = '';
  const avatarEl = document.getElementById('wsUserAvatar');
  if (avatarEl) { avatarEl.src = ''; avatarEl.style.display = 'none'; }
  const initialsEl = document.getElementById('wsUserInitials');
  if (initialsEl) { initialsEl.textContent = 'U'; initialsEl.style.display = 'flex'; }
}

// =====================================================
// DUAL-SIDEBAR WORKSPACE & PROJECT NAVIGATION
// =====================================================

hideAllViews() {
  const viewIds = ['landingView', 'authView', 'privacyView', 'workspaceOnboardingScreen', 'mainAppShell', 'createProjectView', 'projectHubView', 'editorView', 'appContainer'];
  viewIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.style.display = 'none';
      el.classList.remove('active');
    }
  });
  if (this.mainAppShell) {
    this.mainAppShell.style.display = 'none';
    this.mainAppShell.classList.remove('active');
  }
}

  async showAppShell(wstab = 'agent', pushHistory = true) {
  this.currentView = 'workspace';
  this.hideAllViews();

  const av = document.getElementById('authView');
  if (av) {
    av.style.display = 'none';
    av.classList.remove('active');
  }
  const lv = document.getElementById('landingView');
  if (lv) {
    lv.style.display = 'none';
    lv.classList.remove('active');
  }

  const shell = document.getElementById('mainAppShell') || this.mainAppShell;
  if (shell) {
    shell.classList.add('active');
    shell.style.display = 'flex';
    shell.scrollTop = 0;
  }

  this.closeProjectToWorkspace(false);
  await this.switchWorkspaceTab(wstab, pushHistory);
    if (typeof this.showLoading === 'function') this.showLoading(false);
}

  async switchWorkspaceTab(tabName, pushHistory = true) {
    this.activeWorkspaceTab = tabName;

    // Lazy module loader
    // Each module is injected via <script> tag the first time it is needed.
    // Subsequent visits use the browser cache, no re-download occurs.
    if (!this._loadedModules) this._loadedModules = new Set();
    const _lazyLoad = (src) => new Promise((resolve, reject) => {
      if (this._loadedModules.has(src) || document.querySelector(`script[src*="${src}"]`)) {
        this._loadedModules.add(src);
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = src;
      s.onload  = () => { this._loadedModules.add(src); resolve(); };
      s.onerror = () => reject(new Error('Module load failed: ' + src));
      document.head.appendChild(s);
    });
    const _moduleMap = {
      agent:    'js/modules/explore-agent.js',
      explore:  'js/modules/explore-agent.js',
      admin:    'js/modules/admin-module.js',
      team:     'js/modules/teams.js',
      train:    'js/modules/project-hub.js',
      models:   'js/modules/project-hub.js',
      hub:      'js/modules/project-hub.js',
      projects: 'js/modules/project-hub.js',
    };
    const _needed = _moduleMap[tabName];
    if (_needed && !this._loadedModules.has(_needed)) {
      try {
        if (typeof this.showLoading === 'function') this.showLoading(true, 'Yukleniyor...', '');
        await _lazyLoad(_needed);
      } catch (e) {
        console.error('[LazyLoad]', e);
        if (typeof this.showLoading === 'function') this.showLoading(false);
        return;
      }
    }

    // Ensure main app shell is active and visible
    const shell = document.getElementById('mainAppShell') || this.mainAppShell;
    if (shell) {
      shell.classList.add('active');
      shell.style.display = 'flex';
    }

    if (pushHistory) {
      this.navigateTo('workspace', { tab: tabName });
    }

    // Update global sidebar active states
    document.querySelectorAll('.ws-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.wstab === tabName);
    });

    const hubView = document.getElementById('projectHubView') || this.projectHubView;

    // Hide all workspace subviews strictly and exit chat mode if switching away
    document.querySelectorAll('.workspace-view').forEach(v => {
      v.classList.remove('active');
      v.classList.remove('in-chat-mode');
      v.style.setProperty('display', 'none', 'important');
    });

    // Show only selected view
    let targetView = null;
    if (tabName === 'agent') {
      targetView = document.getElementById('agentWorkspaceView') || this.agentWorkspaceView;
    } else if (tabName === 'projects') {
      targetView = document.getElementById('dashboardView') || this.dashboardView;
      await this.loadDashboardProjects();
    } else if (tabName === 'assets') {
      targetView = document.getElementById('assetLibraryView') || this.assetLibraryView;
      await this.loadAssetLibrary();
    } else if (tabName === 'explore') {
      targetView = document.getElementById('exploreView') || this.exploreView;
      if (targetView) {
        targetView.classList.add('active');
        targetView.style.display = 'flex';
      }
      try {
        if (typeof this.loadExploreProjects === 'function') {
          await this.loadExploreProjects();
        }
      } catch (err) {
        console.error('loadExploreProjects error:', err);
      }
    } else if (tabName === 'train') {
      // Show Training Studio at Workspace Level
      if (hubView) {
        hubView.classList.add('active');
        hubView.style.setProperty('display', 'flex', 'important');
      }
      document.querySelectorAll('.hub-tab-panel').forEach(p => {
        p.classList.remove('active');
        p.style.setProperty('display', 'none', 'important');
      });
      const p = document.getElementById('hubTabTrain');
      if (p) {
        p.classList.add('active');
        p.style.setProperty('display', 'block', 'important');
      }
      if (typeof this.loadTrainingHardwareRecommendation === 'function') {
        this.loadTrainingHardwareRecommendation();
      }
      if (typeof this.showLoading === 'function') this.showLoading(false);
      return;
    } else if (tabName === 'models') {
      // Show BYOM Model Hub at Workspace Level
      if (hubView) {
        hubView.classList.add('active');
        hubView.style.setProperty('display', 'flex', 'important');
      }
      document.querySelectorAll('.hub-tab-panel').forEach(p => {
        p.classList.remove('active');
        p.style.setProperty('display', 'none', 'important');
      });
      const p = document.getElementById('hubTabModels');
      if (p) {
        p.classList.add('active');
        p.style.setProperty('display', 'block', 'important');
      }
      if (typeof this.loadModelHub === 'function') {
        this.loadModelHub();
      }
      if (typeof this.showLoading === 'function') this.showLoading(false);
      return;
    } else if (tabName === 'team') {
      // Show Team & Collaboration Hub at Workspace Level
      if (hubView) {
        hubView.classList.add('active');
        hubView.style.setProperty('display', 'flex', 'important');
      }
      document.querySelectorAll('.hub-tab-panel').forEach(p => {
        p.classList.remove('active');
        p.style.setProperty('display', 'none', 'important');
      });
      const p = document.getElementById('hubTabTeam');
      if (p) {
        p.classList.add('active');
        p.style.setProperty('display', 'block', 'important');
      }
      if (typeof this.loadTeamSyncHub === 'function') {
        this.loadTeamSyncHub();
      }
      const currentSubtab = new URLSearchParams(window.location.search).get('subtab') || 'org';
      if (typeof this.switchTeamSubtab === 'function') {
        this.switchTeamSubtab(currentSubtab, false);
      }
      if (typeof this.showLoading === 'function') this.showLoading(false);
      return;
    } else if (tabName === 'settings') {
      targetView = document.getElementById('settingsWorkspaceView') || this.settingsWorkspaceView;
      if (typeof this.loadSettingsViewData === 'function') {
        await this.loadSettingsViewData();
      }
    } else if (tabName === 'admin') {
      targetView = document.getElementById('adminWorkspaceView') || this.adminWorkspaceView;
      if (typeof this.loadAdminConsoleData === 'function') {
        await this.loadAdminConsoleData();
      }
    }

    if (targetView) {
      targetView.classList.add('active');
      targetView.style.setProperty('display', 'flex', 'important');
    }

    if (tabName === 'agent') {
      if (typeof this.initCosmicStarsAnimation === 'function') {
        this.initCosmicStarsAnimation();
      }
      if (typeof this.initAgentChat === 'function') {
        this.initAgentChat();
      }
    }

    // Çalışma alanı görünümü geçişi tamamlandığında açılış yükleme ekranını kapat
    if (typeof this.showLoading === 'function') {
      this.showLoading(false);
    }
  }
  }

  const proto = _WorkspaceUIExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }

  if (window.editorApp && typeof window.editorApp.setupWorkspaceSwitcherEvents === 'function') {
    window.editorApp.setupWorkspaceSwitcherEvents();
  }
})(window.DatasetEditor);
