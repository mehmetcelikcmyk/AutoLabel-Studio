/**
 * YOLO AI Dataset Hub & Bounding Box Editor
 * Fast, Interactive HTML5 Canvas Annotation & Dataset Management Platform
 */

class DatasetEditor {
  constructor() {
    // Current Active View ('dashboard' or 'editor')
    this.currentView = 'dashboard';

    // State
    this.categories = [];
    this.projects = [];
    this.classes = {};
    this.currentCategory = null;
    this.images = [];
    this.filteredImages = [];
    this.currentIndex = 0;
    this.currentImage = null;
    this.imageObj = null;

    this.boxes = [];
    this.savedBoxesSnapshot = [];
    this.undoStack = [];
    this.redoStack = [];
    this.selectedBoxIndices = new Set();
    this.activeClassId = 0;
    this.mode = localStorage.getItem('yolo_pref_defaulttool') || 'draw';
    this.polygonDraftPoints = []; // [{x, y}, ...] canvas pixel coords for drawing polygon
    this.polygonHoverPoint = null;
    this.selectedPolygonVertex = null; // {boxIndex, vertexIndex}
    this.isDirty = false;
    this.autoSave = localStorage.getItem('yolo_pref_autosave') !== 'false';
    this.showGuideLines = localStorage.getItem('yolo_pref_guidelines') !== 'false';
    this.clipboard = [];        // Copied boxes (Ctrl+C / Ctrl+V)
    this.prevImageBoxes = [];   // Previous image's boxes (Ctrl+Shift+V)
    this.skipEmpty = localStorage.getItem('yolo_pref_skipempty') === 'true';
    this._contextMenuTarget = null; // Right-click target box index

    // Image & Label Caches
    this.imageCache = typeof LruImageCache !== 'undefined' ? new LruImageCache(160) : new Map();
    this.labelCache = new Map();
    this._preloadQueue = new Set();

    // Advanced Quality & Interaction State
    this.autoEnhance = localStorage.getItem('yolo_pref_autoenhance') !== 'false';    // Auto-contrast & clarity filter on canvas
    this.isLoupeActive = false; // Magnifier tool toggle
    this.isZPressed = false;    // Magnifier keyhold (Z)
    this.isHPressed = false;    // Hide boxes keyhold (H)
    this.flaggedImages = new Set(JSON.parse(localStorage.getItem('yolo_flagged_images') || '[]'));

    // Collapsible Layout State
    this.isLeftCollapsed = localStorage.getItem('yolo_left_collapsed') === 'true';
    this.isRightCollapsed = localStorage.getItem('yolo_right_collapsed') === 'true';

    // Layouts & Sidebars
    this.mainAppShell = document.getElementById('mainAppShell');
    this.globalSidebar = document.getElementById('globalSidebar');
    this.projectSidebar = document.getElementById('projectSidebar');

    // Views
    this.agentWorkspaceView = document.getElementById('agentWorkspaceView');
    this.dashboardView = document.getElementById('dashboardView');
    this.assetLibraryView = document.getElementById('assetLibraryView');
    this.exploreView = document.getElementById('exploreView');
    this.settingsWorkspaceView = document.getElementById('settingsWorkspaceView');
    this.adminWorkspaceView = document.getElementById('adminWorkspaceView');
    this.createProjectView = document.getElementById('createProjectView');
    this.projectHubView = document.getElementById('projectHubView');
    this.editorView = document.getElementById('editorView');
    this.backToDashBtn = document.getElementById('backToDashBtn');

    // Active Workspace & Project State
    this.activeWorkspaceTab = 'agent';
    this.isProjectContext = false;
    this.currentBlueprint = null;
    this.activeHubProjectId = null;
    this.activeHubTab = 'upload';
    this.selectedDatasetImageFilenames = new Set();
    this.stagedUploadFiles = [];

    // Dashboard Elements
    this.projectsGrid = document.getElementById('projectsGrid');
    this.dashGlobalSummary = document.getElementById('dashGlobalSummary');
    this.projectSearchInput = document.getElementById('projectSearchInput');
    this.projectSortSelect = document.getElementById('projectSortSelect');
    this.openCreateProjectBtn = document.getElementById('openCreateProjectBtn');


    // Canvas & Viewport
    this.canvas = document.getElementById('mainCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.loupeCanvas = document.getElementById('loupeCanvas');
    this.loupeCtx = this.loupeCanvas ? this.loupeCanvas.getContext('2d') : null;
    if (this.loupeCanvas) {
      this.loupeCanvas.width = 280;
      this.loupeCanvas.height = 280;
    }
    this.viewport = document.getElementById('canvasViewport');
    this.container = document.getElementById('canvasContainer');
    this.mainLayout = document.getElementById('mainLayout');

    // Pan & Zoom State
    this.zoomLevel = 1.0;
    this.fitScale = 1.0;
    this.panX = 0;
    this.panY = 0;
    this.isPanning = false;
    this.isSpacePressed = false;
    this.lastPanMouse = { x: 0, y: 0 };

    // Interaction & Cursor Tracking
    this.isMouseDown = false;
    this.cursorPos = { x: -1, y: -1 };
    this.dragStart = { x: 0, y: 0 };
    this.dragCurrent = { x: 0, y: 0 };
    this.dragAction = null; // 'draw', 'move', 'resize', 'pan'
    this.resizeHandle = null;
    this.initialBoxStates = new Map();
    this.initialBoxState = null;

    this.HANDLE_SIZE = 8; // Screen pixels

    // Editor DOM Elements
    this.categorySelect = document.getElementById('categorySelect');
    this.filterSelect = document.getElementById('filterSelect');
    this.imageSearchInput = document.getElementById('imageSearchInput');
    this.imageListContainer = document.getElementById('imageListContainer');
    this.imageIndexInput = document.getElementById('imageIndexInput');
    this.totalImagesCount = document.getElementById('totalImagesCount');
    this.categoryStatsBadge = document.getElementById('categoryStatsBadge');

    this.prevBtn = document.getElementById('prevBtn');
    this.nextBtn = document.getElementById('nextBtn');
    this.autoSaveToggle = document.getElementById('autoSaveToggle');
    this.manualSaveBtn = document.getElementById('manualSaveBtn');
    this.saveStatusIndicator = document.getElementById('saveStatusIndicator');

    this.toolDrawBtn = document.getElementById('toolDrawBtn');
    this.toolPolygonBtn = document.getElementById('toolPolygonBtn');
    this.toolSelectBtn = document.getElementById('toolSelectBtn');
    this.toolPanBtn = document.getElementById('toolPanBtn');
    this.autoLabelBtn = document.getElementById('autoLabelBtn');
    this.autoEnhanceBtn = document.getElementById('autoEnhanceBtn');
    this.loupeBtn = document.getElementById('loupeBtn');
    this.flagBtn = document.getElementById('flagBtn');
    this.activeClassSelect = document.getElementById('activeClassSelect');
    this.deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    this.deleteBtnLabel = document.getElementById('deleteBtnLabel');
    this.selectAllBtn = document.getElementById('selectAllBtn');
    this.clearAllBtn = document.getElementById('clearAllBtn');
    this.undoBtn = document.getElementById('undoBtn');
    this.redoBtn = document.getElementById('redoBtn');
    this.revertBtn = document.getElementById('revertBtn');
    this.toggleGuideLinesBtn = document.getElementById('toggleGuideLinesBtn');
    this.copyBoxesBtn = document.getElementById('copyBoxesBtn');
    this.pasteBoxesBtn = document.getElementById('pasteBoxesBtn');
    this.copyFromPrevBtn = document.getElementById('copyFromPrevBtn');
    this.skipEmptyBtn = document.getElementById('skipEmptyBtn');
    this.progressBarFill = document.getElementById('progressBarFill');
    this.statsContainer = document.getElementById('statsContainer');
    this.refreshStatsBtn = document.getElementById('refreshStatsBtn');
    this.contextMenu = document.getElementById('contextMenu');

    // Batch & Export Modals State
    this.activeModalCategory = null;
    this.batchPollTimer = null;
    this.lastSimilarMatches = [];

    // Initialize Application
    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.setupModalEvents();
    this.setupAuthEvents();
    this.setupWorkspaceEvents();
    this.setupUserMenuEvents();
    this.setupWorkspaceSwitcherEvents();

    // Handle Google OAuth callback params (destek: hem hash fragment hem query string)
    const urlHash = window.location.hash;
    const hashParams = new URLSearchParams(urlHash.startsWith('#') ? urlHash.slice(1) : urlHash);
    const urlParams = new URLSearchParams(window.location.search);
    const googleToken = hashParams.get('google_token') || urlParams.get('google_token');
    const authError = hashParams.get('auth_error') || urlParams.get('auth_error');
    const displayName = hashParams.get('display_name') || urlParams.get('display_name');

    if (googleToken) {
      localStorage.setItem('yolo_auth_token', googleToken);
      localStorage.setItem('authToken', googleToken);
      sessionStorage.setItem('authToken', googleToken);
      if (displayName) localStorage.setItem('yolo_user_name', decodeURIComponent(displayName));
      // Hash ve callback parametrelerini URL'den temizle
      window.history.replaceState({}, '', window.location.pathname + (urlParams.get('tab') ? `?tab=${urlParams.get('tab')}` : ''));
    }
    if (authError) {
      window.history.replaceState({}, '', window.location.pathname);
      // auth_error türüne göre kullanıcıya anlamlı mesaj hazırla
      const _authErrorMessages = {
        google_denied: 'Google ile giriş iptal edildi.',
        google_no_email: 'Google hesabından e-posta adresi alınamadı. Hesap izinlerini kontrol edin.',
        google_session_failed: 'Oturum oluşturulurken sunucu hatası oluştu. Lütfen tekrar deneyin.',
        google_failed: 'Google ile giriş sırasında bir hata oluştu. Lütfen tekrar deneyin.',
      };
      this._pendingAuthError = _authErrorMessages[authError] || `Giriş başarısız (${authError}). Lütfen tekrar deneyin.`;
    }

    // Handle browser back/forward navigation
    window.addEventListener('popstate', (e) => {
      this.handlePopState(e.state);
    });

    // Auth flow: check token → landing or workspace
    await this.checkAuth(authError);
  }

  // =====================================================
  // NAVIGATION & BROWSER HISTORY MANAGEMENT
  // =====================================================

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

    if (!state) {
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
      this.showAppShell(state.params?.tab || 'agent', false);
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
    const urlHash = window.location.hash;
    const hashParams = new URLSearchParams(urlHash.startsWith('#') ? urlHash.slice(1) : urlHash);
    const urlParams = new URLSearchParams(window.location.search);
    const googleToken = hashParams.get('google_token') || urlParams.get('google_token');
    if (googleToken) {
      localStorage.setItem('yolo_auth_token', googleToken);
      localStorage.setItem('authToken', googleToken);
      sessionStorage.setItem('authToken', googleToken);
    }

    const token = googleToken || localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    if (token) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          this.currentUser = data.user;
          this._updateHeaderUser(data.user);
          const savedName = localStorage.getItem('yolo_user_name') || (hashParams.get('display_name') ? decodeURIComponent(hashParams.get('display_name')) : '');
          if (savedName) {
            this.showToast(`Hoş geldiniz, ${savedName}`, 'success');
            localStorage.removeItem('yolo_user_name');
          }

          // Fetch projects before routing
          await this.fetchProjects();

          // Route according to URL parameters
          const editorProject = urlParams.get('editor');
          const project = urlParams.get('project');
          const pTab = urlParams.get('tab');
          const create = urlParams.get('create');

          if (editorProject) {
            await this.showEditor(editorProject, false);
          } else if (project) {
            await this.openProject(project, pTab || 'upload', false);
          } else if (create) {
            this.showCreateProject(false);
          } else if (pTab === 'privacy' || urlParams.get('view') === 'privacy') {
            this.showPrivacy('workspace', false);
          } else if (pTab) {
            await this.showAppShell(pTab, false);
          } else {
            const defaultInitialTab = (this.currentUser?.is_admin || this.currentUser?.role === 'admin') ? 'admin' : 'agent';
            await this.showAppShell(defaultInitialTab, false);
          }
          return;
        }
      } catch (e) {
        // fetch hatası (ağ kesintisi vb.) — token geçersiz say
        console.warn('[checkAuth] /api/auth/me fetch error:', e);
      }
      // Token geçersiz — storage temizle ve kullanıcıya bildir
      const staleToken = googleToken; // Google'dan yeni gelen token geçersizse özellikle belirt
      localStorage.removeItem('yolo_auth_token');
      localStorage.removeItem('authToken');
      sessionStorage.removeItem('authToken');
      if (staleToken) {
        // Geçici bir hata mesajı hazırla (pendingAuthError yoksa)
        this._pendingAuthError = this._pendingAuthError || 'Google ile giriş doğrulanamadı. Sunucu hatası olabilir, lütfen tekrar deneyin.';
      }
    }

    // No valid token → check urlParams before defaulting to landing
    const unauthParams = new URLSearchParams(window.location.search);
    const uTab = unauthParams.get('tab');
    const uAuth = unauthParams.get('auth');

    // Bekleyen auth hata mesajını göster ve login formunu aç
    if (this._pendingAuthError) {
      const errMsg = this._pendingAuthError;
      this._pendingAuthError = null;
      // Login ekranını aç, ardından hata toast'u tetikle
      this.showAuth('login', false);
      setTimeout(() => {
        if (typeof this.showToast === 'function') this.showToast(errMsg, 'error');
        const alertEl = document.getElementById('authAlert');
        if (alertEl) { alertEl.textContent = errMsg; alertEl.style.display = 'block'; }
      }, 300);
      return;
    }

    if (uTab === 'privacy' || unauthParams.get('view') === 'privacy') {
      this.showPrivacy('landing', false);
    } else if (uAuth === 'login' || uAuth === 'register') {
      this.showAuth(uAuth, false);
    } else {
      this.showLanding(authError, false);
    }
  }



  hideAllViews() {
    const views = ['landingView', 'authView', 'privacyView', 'mainAppShell', 'appContainer', 'hubViewContainer', 'dashboardView'];
    views.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('active');
        el.style.display = 'none';
      }
    });
  }


  async showAppShell(defaultTab = 'agent', pushHistory = true) {
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
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    const shell = document.getElementById('mainAppShell');
    if (shell) {
      shell.classList.add('active');
      shell.style.display = 'flex';
      shell.scrollTop = 0;
    }
    const mainContent = document.getElementById('mainWorkspaceContent');
    if (mainContent) mainContent.scrollTop = 0;

    // Reset project context sidebars
    this.isProjectContext = false;
    const gSidebar = document.getElementById('globalSidebar');
    const pSidebar = document.getElementById('projectSidebar');
    if (gSidebar) gSidebar.classList.remove('compact');
    if (pSidebar) pSidebar.style.display = 'none';

    // Switch to desired workspace tab
    this.switchWorkspaceTab(defaultTab, pushHistory);

    // Refresh projects list & workspace stats
    await this.fetchProjects();
    this.loadWorkspaceStats();

    // Açılış yükleme overlay'ini kapat — showAppShell tamamlandığında loadingOverlay gizlenmeli
    this.showLoading(false);
  }


  switchWorkspaceTab(tabName, pushHistory = true) {
    const tabs = {
      'agent': 'agentWorkspaceView',
      'projects': 'dashboardView',
      'assets': 'assetLibraryView',
      'explore': 'exploreView',
      'settings': 'settingsWorkspaceView',
      'admin': 'adminWorkspaceView'
    };

    if (pushHistory) {
      this.navigateTo('workspace', { tab: tabName });
    }

    // Update active class on nav buttons
    document.querySelectorAll('.ws-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.wstab === tabName);
    });

    // Hide all view screens inside shell, show selected
    Object.values(tabs).forEach(viewId => {
      const el = document.getElementById(viewId);
      if (el) {
        el.classList.remove('active');
        el.style.display = 'none';
      }
    });

    const targetViewId = tabs[tabName] || 'agentWorkspaceView';
    const targetEl = document.getElementById(targetViewId);
    if (targetEl) {
      targetEl.classList.add('active');
      targetEl.style.display = 'flex';
    }

    if (tabName === 'agent') {
      if (typeof this.initCosmicStarsAnimation === 'function') {
        this.initCosmicStarsAnimation();
      }
    } else if (tabName === 'assets') {
      this.loadAssetLibrary();
    } else if (tabName === 'projects') {
      this.fetchProjects();
    } else if (tabName === 'explore') {
      if (typeof this.loadExploreProjects === 'function') {
        this.loadExploreProjects();
      }
    }
  }


  async fetchProjects() {
    const grid = document.getElementById('projectsGrid');
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const res = await fetch('/api/projects', {
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
        <div class="empty-state-modern" style="grid-column: 1 / -1;">
          <div class="empty-state-icon-wrap">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <h3>Henüz Kayıtlı Proje Bulunmuyor</h3>
          <p>AI Asistan veya proje oluşturma sihirbazını kullanarak hemen ilk veri seti projenizi başlatın.</p>
          <button class="btn-primary" id="emptyGoAgentBtn" style="margin-top:16px;">AI Asistanı Başlat</button>
        </div>
      `;
      document.getElementById('emptyGoAgentBtn')?.addEventListener('click', () => this.switchWorkspaceTab('agent'));
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
      }
    } catch (e) { }
  }


  async loadAssetLibrary() {
    const grid = document.getElementById('assetLibraryGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="loading-spinner">Görseller yükleniyor...</div>';
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const res = await fetch('/api/workspace/assets', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();
      if (!data.assets || data.assets.length === 0) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Henüz görsel yüklenmemiş.</div>';
        return;
      }
      grid.innerHTML = data.assets.map(a => `
        <div class="asset-card" data-project="${a.project_id}" data-file="${a.filename}">
          <img src="${a.url}" loading="lazy" alt="${a.filename}">
          <div class="asset-meta">
            <span class="asset-name" title="${a.filename}">${a.filename}</span>
            <span class="asset-tag ${a.box_count > 0 ? 'labeled' : 'unlabeled'}">
              ${a.box_count > 0 ? `${a.box_count} kutu` : 'Etiketsiz'}
            </span>
          </div>
        </div>
      `).join('');
    } catch (e) {
      grid.innerHTML = '<div class="empty-state" style="grid-column: 1/-1;">Görseller yüklenemedi.</div>';
    }
  }




  async handleAgentPrompt(promptText) {
    if (!promptText || !promptText.trim()) return;
    const prompt = promptText.trim();
    const btn = document.getElementById('agentPromptSubmitBtn');
    const card = document.getElementById('agentBlueprintCard');
    if (btn) { btn.disabled = true; btn.textContent = 'Analiz Ediliyor...'; }

    try {
      const res = await fetch('/api/agent/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (res.ok && data.blueprint) {
        this.currentAgentBlueprint = data.blueprint;
        this.renderAgentBlueprint(data.blueprint, data.source);
        if (card) { card.style.display = 'block'; card.scrollIntoView({ behavior: 'smooth' }); }
      }
    } catch (e) {
      this.showToast('AI Asistan yanıt veremedi.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Oluştur'; }
    }
  }

  // Helper to escape HTML to prevent XSS
  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  renderAgentBlueprint(bp, source = '') {
    const titleEl = document.getElementById('bpTitle');
    const descEl = document.getElementById('bpDesc');
    const classesEl = document.getElementById('bpClassesList');
    const sourceEl = document.getElementById('bpSourceBadge');

    if (titleEl) titleEl.textContent = bp.name || 'Önerilen Proje';
    if (descEl) descEl.textContent = bp.description || '';
    if (sourceEl && source) sourceEl.textContent = `Powered by ${source}`;

    if (classesEl && bp.classes) {
      classesEl.innerHTML = bp.classes.map(c => `
        <div class="bp-class-pill" style="border-left: 4px solid ${c.color || '#3b82f6'};">
          <strong>${c.name}</strong>
          <small>${(c.prompts || []).slice(0, 3).join(', ')}</small>
        </div>
      `).join('');
    }
  }

  async createProjectFromBlueprint(bp) {
    const folderName = (bp.folder || bp.name || 'new_project').toLowerCase().replace(/[^a-z0-9_]/g, '_');
    try {
      const res = await fetch('/api/create-project-full', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_name: folderName,
          display_name: bp.name,
          description: bp.description,
          project_type: bp.type || bp.project_type || 'detection',
          classes: bp.classes || []
        })
      });
      const data = await res.json();
      if (res.ok) {
        this.showToast(`'${bp.name}' projesi oluşturuldu.`, 'success');
        await this.openProject(data.category || folderName);
      } else {
        this.showToast(data.detail || 'Proje oluşturulamadı.', 'error');
      }
    } catch (e) {
      this.showToast('Proje oluşturulurken hata oluştu.', 'error');
    }
  }



  async deleteProject(categoryId, deleteFiles = true) {
    if (!categoryId) return;
    const confirmed = await this.showConfirm({
      title: 'Projeyi Kalıcı Olarak Sil',
      subtitle: 'Kritik İşlem',
      message: `'${categoryId}' projesini ve ilişkili tüm verileri silmek istediğinizden emin misiniz?\n\nBu işlem geri alınamaz!`,
      confirmText: 'Evet, Projeyi Sil',
      cancelText: 'Vazgeç',
      type: 'danger'
    });
    if (!confirmed) return;

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/projects/delete', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          category: categoryId,
          delete_files: deleteFiles
        })
      });
      const data = await res.json();
      if (res.ok) {
        this.showToast(`'${categoryId}' projesi silindi.`, 'success');
        this.closeProjectToWorkspace();
        await this.fetchProjects();
      } else {
        this.showToast(data.detail || 'Proje silinemedi.', 'error');
      }
    } catch (e) {
      this.showToast('Proje silinirken hata oluştu.', 'error');
    }
  }

  logout() {

    localStorage.removeItem('yolo_auth_token');
    localStorage.removeItem('yolo_user_name');
    this.currentUser = null;
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => { });
    this.showLanding();
    this.showToast('Oturum kapatıldı.', 'info');
  }

  showLanding(authError = null, pushHistory = true) {
    // Açılış yükleme overlay'ini kapat
    this.showLoading(false);

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
        'google_session_failed': 'Oturum oluşturulurken sunucu hatası oluştu. Lütfen tekrar deneyin.',
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
      } catch (e) {}
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
    const name = user.display_name || user.email?.split('@')[0] || 'Kullanıcı';
    const email = user.email || '';
    const isAdmin = user.is_admin || user.role === 'admin';
    const roleText = isAdmin ? 'Süper Yönetici' : 'Workspace Üyesi';
    const initials = this._getInitials(name);

    const nameEl = document.getElementById('dashUserName');
    const wsUserEl = document.getElementById('wsUserName');
    const wsUserRole = document.getElementById('wsUserRole');
    const agentGreeting = document.getElementById('agentUserNameGreeting');
    const wsInitialsEl = document.getElementById('wsUserInitials');
    const wsAvatarEl = document.getElementById('wsUserAvatar');

    if (nameEl) nameEl.textContent = name;
    if (wsUserEl) wsUserEl.textContent = name;
    if (wsUserRole) wsUserRole.textContent = roleText;
    if (agentGreeting) agentGreeting.textContent = name;
    if (wsInitialsEl) wsInitialsEl.textContent = initials;

    // Popover alanlarını güncelle
    const popName = document.getElementById('wsPopoverName');
    const popEmail = document.getElementById('wsPopoverEmail');
    const popBadge = document.getElementById('wsPopoverRoleBadge');
    const popInitials = document.getElementById('wsPopoverInitials');
    const popAvatar = document.getElementById('wsPopoverAvatar');

    if (popName) popName.textContent = name;
    if (popEmail) popEmail.textContent = email;
    if (popBadge) popBadge.textContent = roleText;
    if (popInitials) popInitials.textContent = initials;

    const avatarUrl = user.avatar_url;
    if (avatarUrl && !avatarUrl.includes('ui-avatars.com')) {
      if (wsAvatarEl) {
        wsAvatarEl.src = avatarUrl;
        wsAvatarEl.style.display = 'block';
        if (wsInitialsEl) wsInitialsEl.style.display = 'none';
        wsAvatarEl.onerror = () => {
          wsAvatarEl.style.display = 'none';
          if (wsInitialsEl) wsInitialsEl.style.display = 'flex';
        };
      }
      if (popAvatar) {
        popAvatar.src = avatarUrl;
        popAvatar.style.display = 'block';
        if (popInitials) popInitials.style.display = 'none';
        popAvatar.onerror = () => {
          popAvatar.style.display = 'none';
          if (popInitials) popInitials.style.display = 'flex';
        };
      }
    } else {
      if (wsAvatarEl) wsAvatarEl.style.display = 'none';
      if (wsInitialsEl) wsInitialsEl.style.display = 'flex';
      if (popAvatar) popAvatar.style.display = 'none';
      if (popInitials) popInitials.style.display = 'flex';
    }

    // Populate Safe User Settings
    const prefName = document.getElementById('userPrefDisplayName');
    const prefEmail = document.getElementById('userPrefEmail');
    if (prefName) prefName.value = name;
    if (prefEmail) prefEmail.value = email;

    // Admin Access Control
    const adminNavBtn = document.getElementById('wsNavAdmin');
    if (adminNavBtn) {
      adminNavBtn.style.display = isAdmin ? 'flex' : 'none';
    }
    const popoverAdminBtn = document.getElementById('wsMenuGoAdmin');
    if (popoverAdminBtn) {
      popoverAdminBtn.style.display = isAdmin ? 'flex' : 'none';
    }

    // Menü listener'larının bağlı olduğundan emin ol
    this.setupUserMenuEvents();
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
    };

    userBtn.addEventListener('click', togglePopover);

    document.addEventListener('click', (e) => {
      if (popover && popover.style.display === 'block' && !popover.contains(e.target) && !e.target.closest('#wsUserMenuBtn')) {
        popover.style.display = 'none';
      }
    });

    document.getElementById('wsMenuGoSettings')?.addEventListener('click', () => {
      popover.style.display = 'none';
      if (this.isProjectContext) this.closeProjectToWorkspace(false);
      this.switchWorkspaceTab('settings');
    });

    document.getElementById('wsMenuGoAdmin')?.addEventListener('click', () => {
      popover.style.display = 'none';
      if (this.isProjectContext) this.closeProjectToWorkspace(false);
      this.switchWorkspaceTab('admin');
    });

    document.getElementById('wsMenuTerms')?.addEventListener('click', () => {
      popover.style.display = 'none';
      const modal = document.getElementById('termsModal');
      if (modal) modal.style.display = 'flex';
    });

    document.getElementById('wsLogoutBtn')?.addEventListener('click', () => {
      popover.style.display = 'none';
      this.logout();
    });
  }

  toggleWorkspaceDropdown(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const dropdown = document.getElementById('wsWorkspaceDropdown');
    if (!dropdown) return;
    const isFlex = dropdown.style.display === 'flex';
    dropdown.style.display = isFlex ? 'none' : 'flex';
    const userPop = document.getElementById('wsUserPopover');
    if (userPop && !isFlex) userPop.style.display = 'none';
    const flyout = document.getElementById('wsCreditFlyout');
    if (flyout && !isFlex) flyout.style.display = 'none';
  }

  setupWorkspaceSwitcherEvents() {
    const selectorBox = document.getElementById('wsSelectorBox');
    const dropdown = document.getElementById('wsWorkspaceDropdown');
    const createBtn = document.getElementById('wsCreateNewBtn');
    const createActionBtn = document.getElementById('wsCreateNewActionBtn');
    const closeObBtn = document.getElementById('wsObCloseBtn');

    if (!selectorBox) return;
    if (selectorBox._boundWsSwitcher) return;
    selectorBox._boundWsSwitcher = true;

    selectorBox.addEventListener('click', (e) => this.toggleWorkspaceDropdown(e));

    document.addEventListener('click', (e) => {
      if (dropdown && dropdown.style.display === 'flex' && !dropdown.contains(e.target) && !e.target.closest('#wsSelectorBox')) {
        dropdown.style.display = 'none';
      }
    });

    const handleOpenOnboarding = (e) => {
      e.stopPropagation();
      if (dropdown) dropdown.style.display = 'none';
      this.openWorkspaceOnboarding();
    };

    createBtn?.addEventListener('click', handleOpenOnboarding);
    createActionBtn?.addEventListener('click', handleOpenOnboarding);

    closeObBtn?.addEventListener('click', () => {
      const obScreen = document.getElementById('workspaceOnboardingScreen');
      if (obScreen) {
        obScreen.style.display = 'none';
        obScreen.classList.remove('active');
      }
      this.showAppShell('projects', false);
    });

    // Delegated click for workspace items
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
      if (titleEl) titleEl.textContent = wsName;
      const badgeEl = document.querySelector('.ws-plan-badge');
      if (badgeEl && wsSub) badgeEl.textContent = wsSub;

      if (dropdown) dropdown.style.display = 'none';
      this.showToast(`${wsName} çalışma alanına geçildi.`, 'info');
      if (this.isProjectContext) this.closeProjectToWorkspace(false);
      this.switchWorkspaceTab('projects');
    });
  }

  openWorkspaceOnboarding() {
    if (typeof this.hideAllViews === 'function') this.hideAllViews();
    const mainShell = document.getElementById('mainAppShell');
    if (mainShell) {
      mainShell.style.display = 'none';
      mainShell.classList.remove('active');
    }
    if (typeof this.setupWorkspaceOnboardingEvents === 'function') {
      this.setupWorkspaceOnboardingEvents();
    }
    const obScreen = document.getElementById('workspaceOnboardingScreen');
    if (obScreen) {
      obScreen.style.display = 'flex';
      obScreen.classList.add('active');
    }
    this.currentObStep = 1;
    const nameInp = document.getElementById('wsObNameInput');
    if (nameInp && !nameInp.value) {
      const uName = this.currentUser?.display_name || this.currentUser?.email?.split('@')[0] || 'My';
      nameInp.value = `${uName}'s Workspace`;
    }
    if (typeof this.goToOnboardingStep === 'function') {
      this.goToOnboardingStep(1);
    }
    if (typeof this.showLoading === 'function') this.showLoading(false);
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
    const handleGoogleAuth = () => {
      window.location.href = '/api/auth/google';
    };
    document.getElementById('loginGoogleBtn')?.addEventListener('click', handleGoogleAuth);
    document.getElementById('registerGoogleBtn')?.addEventListener('click', handleGoogleAuth);

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
          this.currentUser = data.user;
          this._updateHeaderUser(data.user);
          this.showToast(`Hoş geldiniz, ${data.user.display_name}!`, 'success');
          await this.showAppShell('agent');
        } else {
          const errMsg = data.detail || 'E-posta veya şifre hatalı. Lütfen tekrar deneyin.';
          passwordInput?.classList.add('input-error');
          if (passwordError) passwordError.textContent = errMsg;
          passwordInput?.focus();
          passwordInput?.select();
          this._authAlert(errMsg, 'error');
        }
      } catch (e) {
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
      if (!terms) {
        this._authAlert('Devam etmek için kullanım koşullarını kabul etmelisiniz.', 'error');
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

    // Dashboard & Workspace Logout
    [document.getElementById('dashLogoutBtn'), document.getElementById('wsLogoutBtn')].forEach(btn => {
      btn?.addEventListener('click', async () => {
        const token = localStorage.getItem('yolo_auth_token');
        if (token) {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(() => { });
        }
        this.clearUserState();
        this.showLanding();
        this.showToast('Oturumunuz kapatıldı.', 'info');
      });
    });
  }

  // =====================================================
  // CLEAR ALL USER-SPECIFIC STATE (called on logout / user switch)
  // =====================================================
  clearUserState() {
    localStorage.removeItem('yolo_auth_token');
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

    // Editor state
    this.currentCategory = null;
    this.images = [];
    this.filteredImages = [];
    this.boxes = [];
    this.undoStack = [];
    this.redoStack = [];
    this.currentIndex = 0;
    this.currentImage = null;
    this.isDirty = false;
    this.currentBlueprint = null;

    // Clear UI elements that show user-specific data
    const grid = document.getElementById('projectsGrid');
    if (grid) grid.innerHTML = '';
    const agentRecent = document.getElementById('agentRecentProjectsList');
    if (agentRecent) agentRecent.innerHTML = '';
    const userNameEl = document.getElementById('wsUserName');
    if (userNameEl) userNameEl.textContent = '';
    const avatarEl = document.getElementById('wsUserAvatar');
    if (avatarEl) avatarEl.src = '';
  }

  // =====================================================
  // DUAL-SIDEBAR WORKSPACE & PROJECT NAVIGATION
  // =====================================================

  hideAllViews() {
    const viewIds = ['landingView', 'authView', 'privacyView', 'mainAppShell', 'createProjectView', 'projectHubView', 'editorView', 'appContainer'];
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
  }

  async switchWorkspaceTab(tabName, pushHistory = true) {
    this.activeWorkspaceTab = tabName;

    if (pushHistory) {
      this.navigateTo('workspace', { tab: tabName });
    }

    // Update global sidebar active states
    document.querySelectorAll('.ws-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.wstab === tabName);
    });

    // Ensure project hub view is strictly closed
    if (this.projectHubView) {
      this.projectHubView.classList.remove('active');
      this.projectHubView.style.display = 'none';
    }

    // Hide all workspace subviews strictly with both display:none and class removal
    document.querySelectorAll('.workspace-view').forEach(v => {
      if (v !== this.projectHubView) {
        v.classList.remove('active');
        v.style.display = 'none';
      }
    });

    // Show only selected view
    let targetView = null;
    if (tabName === 'agent') {
      targetView = this.agentWorkspaceView;
      if (typeof this.initCosmicStarsAnimation === 'function') {
        this.initCosmicStarsAnimation();
      }
    } else if (tabName === 'projects') {
      targetView = this.dashboardView;
      await this.loadDashboardProjects();
    } else if (tabName === 'assets') {
      targetView = this.assetLibraryView;
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
      if (this.projectHubView) {
        this.projectHubView.style.display = 'flex';
        this.projectHubView.classList.add('active');
      }
      document.querySelectorAll('.hub-tab-panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });
      const p = document.getElementById('hubTabTrain');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.loadTrainingHardwareRecommendation();
      return;
    } else if (tabName === 'models') {
      // Show BYOM Model Hub at Workspace Level
      if (this.projectHubView) {
        this.projectHubView.style.display = 'flex';
        this.projectHubView.classList.add('active');
      }
      document.querySelectorAll('.hub-tab-panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });
      const p = document.getElementById('hubTabModels');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.loadModelHub();
      return;
    } else if (tabName === 'team') {
      // Show Team & Collaboration Hub at Workspace Level
      if (this.projectHubView) {
        this.projectHubView.style.display = 'flex';
        this.projectHubView.classList.add('active');
      }
      document.querySelectorAll('.hub-tab-panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
      });
      const p = document.getElementById('hubTabTeam');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.loadTeamSyncHub();
      const currentSubtab = new URLSearchParams(window.location.search).get('subtab') || 'org';
      this.switchTeamSubtab(currentSubtab, false);
      return;
    } else if (tabName === 'settings') {
      targetView = this.settingsWorkspaceView;
    } else if (tabName === 'admin') {
      targetView = this.adminWorkspaceView;
      await this.loadAdminConsoleData();
    }

    if (targetView) {
      targetView.classList.add('active');
      targetView.style.display = 'flex';
    }
  }

  async openProject(projectId, defaultTab = 'upload', pushHistory = true) {
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
    if (!token || !this.currentUser) {
      if (typeof this.showLoading === 'function') this.showLoading(false);
      this.showAuth('login', true);
      return;
    }
    if (!document.querySelector('script[src*="project-hub.js"]') && typeof this._lazyLoadModule === 'function') {
      try {
        await this._lazyLoadModule('/js/modules/project-hub.js');
      } catch (err) {
        console.error('[openProject] project-hub yukleme hatasi:', err);
      }
    }
    // Resolve alias: bag <-> bag_detection_project
    if (projectId === 'bag' && !this.projects.some(p => p.id === 'bag')) {
      const match = this.projects.find(p => p.id === 'bag_detection_project' || p.id.includes('bag'));
      if (match) projectId = match.id;
    }
    const isAdmin = !!(this.currentUser?.is_admin || this.currentUser?.role === 'admin');
    if (Array.isArray(this.projects) && this.projects.length > 0 && !isAdmin) {
      const found = this.projects.find(p => p.id === projectId || p.id.toLowerCase() === String(projectId).toLowerCase());
      if (!found) {
        if (typeof this.showLoading === 'function') this.showLoading(false);
        this.showToast('Bu projeye erişim yetkiniz bulunmuyor veya proje mevcut değil.', 'error');
        await this.showAppShell('projects', true);
        return;
      }
      projectId = found.id;
    }

    this.isProjectContext = true;
    this.activeHubProjectId = projectId;
    this.activeHubTab = defaultTab;

    if (pushHistory) {
      this.navigateTo('project', { projectId, tab: defaultTab });
    }

    // Ensure app shell is open and dismiss global loading overlay
    if (typeof this.showLoading === 'function') this.showLoading(false);
    this.hideAllViews();
    if (this.mainAppShell) this.mainAppShell.style.display = 'flex';

    // Transition global sidebar to compact icon rail mode
    if (this.globalSidebar) this.globalSidebar.classList.add('compact');

    // Slide in contextual project sidebar
    if (this.projectSidebar) this.projectSidebar.style.display = 'flex';

    // Strictly hide all workspace views so AI Agent view NEVER leaks into project view
    document.querySelectorAll('.workspace-view').forEach(v => {
      v.classList.remove('active');
      v.style.display = 'none';
    });

    // Show ONLY project hub view
    if (this.projectHubView) {
      this.projectHubView.style.display = 'flex';
      this.projectHubView.classList.add('active');
    }

    // Update Project Sidebar Header Info
    const proj = this.projects.find(p => p.id === projectId) || { name: projectId, project_type: 'detection' };
    const nameEl = document.getElementById('projSidebarName');
    const typeEl = document.getElementById('projSidebarType');
    const coverEl = document.getElementById('projSidebarCover');
    if (nameEl) nameEl.textContent = proj.name || projectId;
    if (typeEl) typeEl.textContent = proj.project_type === 'classification' ? 'Classification' : 'Object Detection';
    if (coverEl) {
      if (proj.sample_image) {
        coverEl.innerHTML = `<img src="${proj.sample_image}" alt="Cover">`;
      } else {
        coverEl.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
      }
    }

    // Show loading overlay while project data is fetching
    this.showProjectLoading(proj.name || projectId);

    try {
      // If direct tab is quality or stats, switch to it immediately so analysis starts without delay
      if (defaultTab === 'quality' || defaultTab === 'stats') {
        this.switchProjectTab(defaultTab, false);
      }
      // Load Project Data
      await this.loadHubProjectData();
      this.switchProjectTab(defaultTab, false);
    } finally {
      this.hideProjectLoading();
    }
  }

  showProjectLoading(projectName = '') {
    const overlay = document.getElementById('projectLoadingOverlay');
    const titleEl = document.getElementById('projectLoadingTitle');
    if (overlay) {
      if (titleEl && projectName) {
        titleEl.textContent = `"${projectName}" Yükleniyor...`;
      }
      overlay.style.opacity = '1';
      overlay.style.display = 'flex';
    }
  }

  hideProjectLoading() {
    const overlay = document.getElementById('projectLoadingOverlay');
    if (overlay) {
      overlay.style.opacity = '0';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 250);
    }
  }

  closeProjectToWorkspace(showProjectsTab = true) {
    this.isProjectContext = false;
    this.activeHubProjectId = null;

    // Restore full global sidebar
    if (this.globalSidebar) this.globalSidebar.classList.remove('compact');

    // Hide project contextual sidebar
    if (this.projectSidebar) this.projectSidebar.style.display = 'none';

    // Hide project hub view
    if (this.projectHubView) {
      this.projectHubView.style.display = 'none';
      this.projectHubView.classList.remove('active');
    }

    if (showProjectsTab) {
      this.switchWorkspaceTab('projects');
    }
  }

  switchProjectTab(tabName, pushHistory = true) {
    this.activeHubTab = tabName;
    if (this.activeHubProjectId) {
      try {
        const currentUrl = new URL(window.location);
        const curProj = currentUrl.searchParams.get('project');
        const curTab = currentUrl.searchParams.get('tab');
        const isSameState = curProj === this.activeHubProjectId && curTab === tabName;

        const newUrl = `/?project=${encodeURIComponent(this.activeHubProjectId)}&tab=${encodeURIComponent(tabName)}`;
        const stateObj = { view: 'project', params: { projectId: this.activeHubProjectId, tab: tabName } };

        if (pushHistory && !isSameState) {
          window.history.pushState(stateObj, '', newUrl);
        }
      } catch (e) {}
    }

    // Update project sidebar active items
    document.querySelectorAll('.proj-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ptab === tabName);
    });

    // Update hub sidebar items as well if present
    document.querySelectorAll('.hub-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Show Project Hub container if not visible
    if (this.projectHubView) {
      this.projectHubView.style.display = 'flex';
      this.projectHubView.classList.add('active');
    }

    // Hide all hub tab panels
    document.querySelectorAll('.hub-tab-panel').forEach(panel => {
      panel.classList.remove('active');
      panel.style.display = 'none';
    });

    // Show selected panel
    if (tabName === 'upload') {
      const p = document.getElementById('hubTabUpload');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      const now = new Date();
      const timeStr = `Uploaded on ${now.toLocaleDateString('tr-TR')} at ${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
      const bInput = document.getElementById('uploadBatchNameInput');
      if (bInput) bInput.value = timeStr;
    } else if (tabName === 'annotate') {
      const p = document.getElementById('hubTabAnnotate');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.renderAnnotateKanban();
    } else if (tabName === 'batch_review') {
      const p = document.getElementById('hubTabBatchReview');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      const batchId = new URLSearchParams(location.search).get('batch_id') || this.activeBatchReviewId || 'batch_default';
      const filter = new URLSearchParams(location.search).get('filter') || this.activeBatchReviewTab || 'unannotated';
      this.openBatchReview(batchId, filter, 1, pushHistory);
    } else if (tabName === 'dataset') {
      const p = document.getElementById('hubTabDataset');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.renderDatasetGallery();
    } else if (tabName === 'classes' || tabName === 'settings') {
      const p = document.getElementById('hubTabSettings');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.renderHubSettings();
    } else if (tabName === 'train') {
      const p = document.getElementById('hubTabTrain');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.loadTrainingHardwareRecommendation();
    } else if (tabName === 'models') {
      const p = document.getElementById('hubTabModels');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.loadModelHub();
    } else if (tabName === 'export') {
      const p = document.getElementById('hubTabExport');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
    } else if (tabName === 'team') {
      const p = document.getElementById('hubTabTeam');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.loadTeamSyncHub();
      const currentSubtab = new URLSearchParams(window.location.search).get('subtab') || 'org';
      this.switchTeamSubtab(currentSubtab, false);
    } else if (tabName === 'quality') {
      const p = document.getElementById('hubTabQuality');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.loadQualityAnalysis();
      if (typeof _loadQualityStats === 'function') _loadQualityStats();
    } else if (tabName === 'stats') {
      const p = document.getElementById('hubTabStats');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.loadLabelingStats();
      if (typeof _loadLabelStats === 'function') _loadLabelStats();
    } else if (tabName === 'review') {
      const p = document.getElementById('hubTabReview');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.loadReviewQueue();
      if (typeof _loadReviewQueue === 'function') _loadReviewQueue();
    } else if (tabName === 'finetune') {
      this.switchProjectTab('train');
      return;
    } else if (tabName === 'duplicate') {
      const p = document.getElementById('hubTabDuplicate');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.runDuplicateScan();
    } else if (tabName === 'shortcuts') {
      const p = document.getElementById('hubTabShortcuts');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
    }
  }


  // =====================================================
  // WORKSPACE EVENT LISTENERS (Dual Sidebar, Agent, Assets)
  // =====================================================

  setupWorkspaceEvents() {
    // Global Sidebar Workspace Tabs
    document.querySelectorAll('.ws-nav-item[data-wstab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.wstab;
        if (this.isProjectContext) {
          this.closeProjectToWorkspace(false);
        }
        this.switchWorkspaceTab(tab);
      });
    });

    // Compact rail logo click: return to agent home
    document.querySelector('.ws-brand-row')?.addEventListener('click', () => {
      if (this.isProjectContext) this.closeProjectToWorkspace(false);
      this.switchWorkspaceTab('agent');
    });

    // Project Sidebar Back to Workspace button
    document.getElementById('projBackToWorkspaceBtn')?.addEventListener('click', () => {
      this.closeProjectToWorkspace(true);
    });
    document.getElementById('hubBackToDashBtn')?.addEventListener('click', () => {
      this.closeProjectToWorkspace(true);
    });

    // Project Sidebar navigation buttons
    document.querySelectorAll('.proj-nav-item[data-ptab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchProjectTab(btn.dataset.ptab);
      });
    });

    // Hub Sidebar navigation buttons
    document.querySelectorAll('.hub-nav-item[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.switchProjectTab(btn.dataset.tab);
      });
    });

    // Project Sidebar & Hub Launch Studio buttons
    const handleLaunchStudio = () => {
      if (this.activeHubProjectId) {
        this.showEditor(this.activeHubProjectId);
      }
    };
    document.getElementById('projLaunchStudioBtn')?.addEventListener('click', handleLaunchStudio);
    document.getElementById('hubLaunchStudioBtn')?.addEventListener('click', handleLaunchStudio);
    document.getElementById('hubQuickStartAnnotateBtn')?.addEventListener('click', handleLaunchStudio);

    document.getElementById('kanbanUploadMoreImagesBtn')?.addEventListener('click', () => {
      this.switchProjectTab('upload');
    });

    document.getElementById('kanbanViewUnassignedImagesBtn')?.addEventListener('click', () => {
      this.switchProjectTab('dataset');
      const filterSelect = document.getElementById('datasetFilterStatus');
      if (filterSelect) filterSelect.value = 'unlabeled';
      this.renderDatasetGallery();
    });

    // Hub Dataset Toolbar Events
    document.getElementById('datasetSearchInput')?.addEventListener('input', () => this.renderDatasetGallery());
    document.getElementById('datasetFilterStatus')?.addEventListener('change', () => this.renderDatasetGallery());
    document.getElementById('toggleAnnotationsCheck')?.addEventListener('change', () => this.renderDatasetGallery());

    // Hub Export ZIP & AI Auto-Label
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

    // Initialize AI Agent Interactive Chat System
    this.initAgentChat();

    // Quick Action Pills
    document.querySelectorAll('.quick-action-pill[data-action]').forEach(pill => {
      pill.addEventListener('click', () => {
        const act = pill.dataset.action;
        const promptMap = {
          'plan': 'Şantiyede baret, reflektif yelek ve iş güvenliği tespiti için veri seti oluştur',
          'batch': 'Fabrika bandındaki şişelerin doluluk seviyesi, kapak ve kusur kontrolü tespiti',
          'traffic': 'Otoyol araç, kamyon, motosiklet ve yaya tespiti ve hız analizi'
        };
        if (promptMap[act]) {
          this.startAgentConversation(promptMap[act]);
        }
      });
    });

    // Example Project Cards
    document.querySelectorAll('.example-proj-card[data-template]').forEach(card => {
      card.addEventListener('click', () => {
        const tmpl = card.dataset.template;
        const prompts = {
          'bottle': 'Şişe doluluk seviyesi, kapak ve kusur kontrolü',
          'traffic': 'Otoyol araç, kamyon, motosiklet ve yaya tespiti',
          'ppe': 'Şantiye baret, reflektif yelek ve iş güvenliği tespiti'
        };
        if (promptInput && prompts[tmpl]) {
          promptInput.value = prompts[tmpl];
          this.handleAgentPrompt(prompts[tmpl]);
        }
      });
    });

    // Explore Templates Use Button
    document.querySelectorAll('.explore-use-btn[data-tmpl]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tmpl = btn.dataset.tmpl;
        const prompts = {
          'bottle': 'Şişe doluluk seviyesi ve kalite denetimi',
          'traffic': 'Trafik akışı ve araç sınıflandırması',
          'ppe': 'İş güvenliği baret ve yelek tespiti'
        };
        if (prompts[tmpl]) {
          this.switchWorkspaceTab('agent');
          if (promptInput) {
            promptInput.value = prompts[tmpl];
            this.handleAgentPrompt(prompts[tmpl]);
          }
        }
      });
    });

    // Explore Templates Live Search & Category Filter
    const handleExploreFilter = () => {
      const q = document.getElementById('exploreSearchInput')?.value.toLowerCase().trim() || '';
      const cat = document.getElementById('exploreCategoryFilter')?.value || 'all';
      const cards = document.querySelectorAll('#exploreTemplatesGrid .explore-card');
      let visibleCount = 0;

      cards.forEach(card => {
        const cardCat = card.dataset.category || 'all';
        const cardText = card.textContent.toLowerCase();
        const matchesCat = (cat === 'all' || cardCat === cat);
        const matchesQuery = (!q || cardText.includes(q));

        if (matchesCat && matchesQuery) {
          card.style.display = 'block';
          visibleCount++;
        } else {
          card.style.display = 'none';
        }
      });

      let emptyEl = document.getElementById('exploreEmptyState');
      const grid = document.getElementById('exploreTemplatesGrid');
      if (visibleCount === 0) {
        if (!emptyEl && grid) {
          emptyEl = document.createElement('div');
          emptyEl.id = 'exploreEmptyState';
          emptyEl.className = 'empty-state-modern';
          emptyEl.style.gridColumn = '1 / -1';
          emptyEl.innerHTML = `
            <div class="empty-state-icon-wrap">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <h3>Eşleşen Şablon Bulunamadı</h3>
            <p>Arama kriterlerinize veya seçtiğiniz kategoriye uygun hazır şablon bulunamadı.</p>
          `;
          grid.appendChild(emptyEl);
        }
      } else if (emptyEl) {
        emptyEl.remove();
      }
    };

    document.getElementById('exploreSearchInput')?.addEventListener('input', handleExploreFilter);
    document.getElementById('exploreCategoryFilter')?.addEventListener('change', handleExploreFilter);

    // Asset Library Filters
    document.getElementById('assetFilterStatus')?.addEventListener('change', () => this.loadAssetLibrary());
    document.getElementById('assetFilterProject')?.addEventListener('change', () => this.loadAssetLibrary());
    document.getElementById('assetSearchInput')?.addEventListener('input', () => this.loadAssetLibrary());

    // Project Dashboard Filters & Search
    const handleProjectFilter = () => {
      const q = document.getElementById('projectSearchInput')?.value.toLowerCase().trim() || '';
      const sort = document.getElementById('projectSortSelect')?.value || 'name';
      let filtered = [...(this.projectsList || [])];

      if (q) {
        filtered = filtered.filter(p =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.id && p.id.toLowerCase().includes(q)) ||
          (p.description && p.description.toLowerCase().includes(q))
        );
      }

      if (sort === 'name') {
        filtered.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
      } else if (sort === 'images_desc') {
        filtered.sort((a, b) => (b.image_count || 0) - (a.image_count || 0));
      } else if (sort === 'percent_desc') {
        filtered.sort((a, b) => (b.percent || 0) - (a.percent || 0));
      } else if (sort === 'percent_asc') {
        filtered.sort((a, b) => (a.percent || 0) - (b.percent || 0));
      }

      const grid = document.getElementById('projectsGrid');
      if (filtered.length === 0 && q) {
        if (grid) {
          grid.innerHTML = `
            <div class="empty-state-modern" style="grid-column: 1 / -1;">
              <div class="empty-state-icon-wrap">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
              </div>
              <h3>Eşleşen Proje Bulunamadı</h3>
              <p>"${this._escapeHtml(q)}" aramasına uygun herhangi bir proje bulunamadı. Lütfen arama teriminizi kontrol edin.</p>
            </div>
          `;
        }
      } else {
        this.renderProjectsGrid(filtered);
      }
    };

    document.getElementById('projectSearchInput')?.addEventListener('input', handleProjectFilter);
    document.getElementById('projectSortSelect')?.addEventListener('change', handleProjectFilter);

    // Workspace Google OAuth Save Button
    document.getElementById('wsSaveGoogleSettingsBtn')?.addEventListener('click', async () => {
      const clientId = document.getElementById('wsSettingGoogleClientId')?.value.trim();
      const clientSecret = document.getElementById('wsSettingGoogleClientSecret')?.value.trim();
      if (!clientId) { this.showToast('Google Client ID is required.', 'error'); return; }
      try {
        const res = await fetch('/api/auth/google-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ google_client_id: clientId, google_client_secret: clientSecret })
        });
        if (res.ok) this.showToast('Google OAuth settings saved.', 'success');
      } catch (e) {
        this.showToast('Connection error.', 'error');
      }
    });

    // Cloudflare Save Button
    document.getElementById('saveCfSettingsBtn')?.addEventListener('click', async () => {
      const accountId = document.getElementById('cfAccountId')?.value.trim();
      const apiToken = document.getElementById('cfApiToken')?.value.trim();
      const databaseId = document.getElementById('cfDatabaseId')?.value.trim();
      const r2Bucket = document.getElementById('cfR2Bucket')?.value.trim() || 'yolo-editor';

      if (!accountId || !apiToken || !databaseId) {
        this.showToast('Please fill in Account ID, API Token and Database ID.', 'error');
        return;
      }
      const btn = document.getElementById('saveCfSettingsBtn');
      if (btn) btn.querySelector('span').textContent = 'Saving...';
      try {
        const res = await fetch('/api/settings/cloudflare', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}`
          },
          body: JSON.stringify({
            cloudflare_account_id: accountId,
            cloudflare_api_token: apiToken,
            cloudflare_database_id: databaseId,
            cloudflare_r2_bucket: r2Bucket,
            use_cloudflare: true
          })
        });
        if (res.ok) {
          this.showToast('Cloudflare settings saved. Cloud sync is now active.', 'success');
        } else {
          const data = await res.json();
          this.showToast(data.detail || 'Failed to save settings.', 'error');
        }
      } catch (e) {
        this.showToast('Connection error while saving settings.', 'error');
      } finally {
        if (btn) btn.querySelector('span').textContent = 'Save Cloudflare Settings';
      }
    });

    // Cloudflare Test Connection Button
    document.getElementById('testCfConnectionBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('testCfConnectionBtn');
      if (btn) btn.querySelector('span').textContent = 'Testing...';
      try {
        const res = await fetch('/api/settings/cloudflare/test', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}` }
        });
        const data = await res.json();
        if (data.connected) {
          this.showToast('Cloudflare D1 connection successful.', 'success');
        } else {
          this.showToast(data.detail || 'Cloudflare connection failed. Check your credentials.', 'error');
        }
      } catch (e) {
        this.showToast('Connection test failed. Verify credentials.', 'error');
      } finally {
        if (btn) btn.querySelector('span').textContent = 'Test Connection';
      }
    });

    // Load existing Cloudflare settings into the form on tab open
    document.querySelector('.ws-nav-item[data-wstab="settings"]')?.addEventListener('click', () => {
      this._loadCfSettingsIntoForm();
    });

    // Initialize Sleek Custom Glassmorphism Dropdowns
    this.initCustomDropdowns();
  }

  initCustomDropdowns() {
    ['projectSortSelect', 'assetFilterStatus', 'assetFilterProject', 'exploreCategoryFilter'].forEach(id => {
      const select = document.getElementById(id);
      if (select) this.upgradeSelectToCustomDropdown(select);
    });

    // Close any open custom dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.custom-dropdown-wrap')) {
        document.querySelectorAll('.custom-dropdown-btn.open').forEach(btn => btn.classList.remove('open'));
        document.querySelectorAll('.custom-dropdown-menu.show').forEach(menu => menu.classList.remove('show'));
      }
    });
  }

  upgradeSelectToCustomDropdown(selectEl) {
    if (!selectEl || selectEl.classList.contains('custom-upgraded')) return;
    selectEl.classList.add('custom-upgraded');

    const parent = selectEl.closest('.filter-pill-select, .dash-sort-group');
    const labelText = parent?.querySelector('label')?.textContent || '';

    // Create wrapper
    const wrap = document.createElement('div');
    wrap.className = 'custom-dropdown-wrap';

    const btn = document.createElement('div');
    btn.className = 'custom-dropdown-btn';

    const selectedOption = selectEl.options[selectEl.selectedIndex] || selectEl.options[0];
    const valText = selectedOption ? selectedOption.text : '';

    btn.innerHTML = `
      ${labelText ? `<span class="custom-dropdown-label">${labelText}</span>` : ''}
      <span class="custom-dropdown-val">${this._escapeHtml(valText)}</span>
      <span class="custom-dropdown-arrow">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </span>
    `;

    const menu = document.createElement('div');
    menu.className = 'custom-dropdown-menu';

    const renderItems = () => {
      menu.innerHTML = '';
      Array.from(selectEl.options).forEach((opt, idx) => {
        const item = document.createElement('div');
        item.className = 'custom-dropdown-item' + (selectEl.value === opt.value ? ' active' : '');
        item.dataset.value = opt.value;
        item.innerHTML = `
          <span>${this._escapeHtml(opt.text)}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        `;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          btn.querySelector('.custom-dropdown-val').textContent = opt.text;
          btn.classList.remove('open');
          menu.classList.remove('show');
          renderItems();
        });
        menu.appendChild(item);
      });
    };

    renderItems();

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = btn.classList.contains('open');
      document.querySelectorAll('.custom-dropdown-btn.open').forEach(b => b.classList.remove('open'));
      document.querySelectorAll('.custom-dropdown-menu.show').forEach(m => m.classList.remove('show'));

      if (!isOpen) {
        renderItems();
        btn.classList.add('open');
        menu.classList.add('show');
      }
    });

    // Observer to re-render if options dynamically change (e.g. Project selector)
    const observer = new MutationObserver(() => {
      const cur = selectEl.options[selectEl.selectedIndex];
      if (cur) btn.querySelector('.custom-dropdown-val').textContent = cur.text;
      renderItems();
    });
    observer.observe(selectEl, { childList: true });

    wrap.appendChild(btn);
    wrap.appendChild(menu);

    if (parent) {
      // Hide the legacy label since it's now inside the custom-dropdown-btn
      const lbl = parent.querySelector('label');
      if (lbl) lbl.style.display = 'none';
      parent.style.background = 'transparent';
      parent.style.border = 'none';
      parent.style.padding = '0';
      parent.style.boxShadow = 'none';
      parent.appendChild(wrap);
    } else {
      selectEl.parentNode.insertBefore(wrap, selectEl.nextSibling);
    }
  }

  async _loadCfSettingsIntoForm() {
    try {
      const res = await fetch('/api/settings/cloudflare', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el && val) el.value = val;
      };
      setVal('cfAccountId', data.cloudflare_account_id);
      setVal('cfDatabaseId', data.cloudflare_database_id);
      setVal('cfR2Bucket', data.cloudflare_r2_bucket);
      setVal('wsSettingGoogleClientId', data.google_client_id);
      // Don't pre-fill secrets/tokens for security
    } catch (e) { }
  }

  // =====================================================
  // SUPER ADMIN CONSOLE LOGIC & DATA MANAGEMENT
  // =====================================================

  async loadAdminConsoleData() {
    this.setupAdminEventsOnce();
    await Promise.all([
      this.loadAdminOverview(),
      this.loadAdminUsers(),
      this.loadAdminModels(),
      this.loadAdminLogs()
    ]);
    this._loadCfSettingsIntoForm();
  }

  setupAdminEventsOnce() {
    if (this._adminEventsInitialized) return;
    this._adminEventsInitialized = true;

    // Sub-tab switching
    document.querySelectorAll('.admin-tab-btn[data-atab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetTab = btn.dataset.atab;
        document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        document.querySelectorAll('.admin-tab-panel').forEach(p => {
          p.classList.remove('active');
          p.style.display = 'none';
        });

        if (targetTab === 'overview') {
          const p = document.getElementById('adminPanelOverview');
          if (p) { p.classList.add('active'); p.style.display = 'block'; }
          this.loadAdminOverview();
        } else if (targetTab === 'users') {
          const p = document.getElementById('adminPanelUsers');
          if (p) { p.classList.add('active'); p.style.display = 'block'; }
          this.loadAdminUsers();
        } else if (targetTab === 'models') {
          const p = document.getElementById('adminPanelModels');
          if (p) { p.classList.add('active'); p.style.display = 'block'; }
          this.loadAdminModels();
        } else if (targetTab === 'logs') {
          const p = document.getElementById('adminPanelLogs');
          if (p) { p.classList.add('active'); p.style.display = 'block'; }
          this.loadAdminLogs();
        } else if (targetTab === 'infrastructure') {
          const p = document.getElementById('adminPanelInfra');
          if (p) { p.classList.add('active'); p.style.display = 'block'; }
          this._loadCfSettingsIntoForm();
        }
      });
    });

    // Refresh all button
    document.getElementById('adminRefreshAllBtn')?.addEventListener('click', () => {
      this.loadAdminConsoleData();
      this.showToast('Yönetici verileri güncellendi.', 'success');
    });

    // User search filter
    document.getElementById('adminUserSearchInput')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      document.querySelectorAll('#adminUsersTableBody tr').forEach(tr => {
        const text = tr.textContent.toLowerCase();
        tr.style.display = text.includes(q) ? '' : 'none';
      });
    });
  }

  async loadAdminOverview() {
    try {
      const res = await fetch('/api/admin/overview', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const s = data.stats || {};

      const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
      setText('admTotalUsers', s.total_users || 0);
      setText('admActiveSessions', `${s.active_sessions || 0} aktif oturum`);
      setText('admDevice', s.active_device || 'CPU');
      setText('admCpuCores', `${s.cpu_cores || 1} CPU Çekirdeği`);
      setText('admModelCount', s.registered_models_count || 0);
      setText('admCachedModels', `${s.cached_models_count || 0} bellek önbelleğinde`);
      setText('admTotalImages', `${s.total_images || 0} görsel`);
      setText('admCompletionRate', `%${s.completion_rate || 0} etiketli`);
      setText('admOsName', s.os_name || 'Bilinmiyor');
      setText('admPyVersion', `Python ${s.python_version || ''}`);
    } catch (e) {
      console.error(e);
    }
  }

  async loadAdminUsers() {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const users = data.users || [];
      const tbody = document.getElementById('adminUsersTableBody');
      const countEl = document.getElementById('adminUserListCount');
      if (countEl) countEl.textContent = `${users.length} kayıtlı kullanıcı`;
      if (!tbody) return;

      tbody.innerHTML = '';
      users.forEach(u => {
        const tr = document.createElement('tr');
        const isAdm = u.role === 'admin';
        const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

        tr.innerHTML = `
          <td>
            <div class="admin-user-cell">
              <img src="${u.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.display_name)}&background=3b82f6&color=fff&size=32`}" alt="Avatar">
              <strong>${this._escapeHtml(u.display_name)}</strong>
            </div>
          </td>
          <td style="font-family:var(--font-mono); font-size:0.82rem;">${this._escapeHtml(u.email)}</td>
          <td><span class="fmt-pill" style="padding:2px 8px; font-size:0.75rem;">${u.auth_provider === 'google' ? 'Google OAuth' : 'Yerel / Şifre'}</span></td>
          <td style="font-size:0.8rem; color:var(--text-muted);">${dateStr}</td>
          <td>
            <span class="admin-role-badge ${isAdm ? 'admin' : 'user'}">${isAdm ? 'Yönetici' : 'Standart'}</span>
          </td>
          <td>
            <span class="admin-status-pill">
              <span class="admin-status-dot ${u.is_online ? 'online' : ''}"></span>
              ${u.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}
            </span>
          </td>
          <td>
            <button class="admin-action-btn" data-email="${u.email}" data-action="change-pw" style="color:var(--primary); font-weight:600;">
              Şifre Değiştir
            </button>
            <button class="admin-action-btn ${isAdm ? '' : 'make-admin-btn'}" data-email="${u.email}" data-action="toggle-role">
              ${isAdm ? 'Kullanıcı Yap' : 'Admin Yap'}
            </button>
            <button class="admin-action-btn danger" data-email="${u.email}" data-action="delete">
              Sil
            </button>
          </td>
        `;

        // Change password action
        tr.querySelector('[data-action="change-pw"]')?.addEventListener('click', async () => {
          const newPw = await this.showPrompt({
            title: 'Şifre Değiştir',
            subtitle: 'Kullanıcı Yönetimi',
            message: `'${u.email}' kullanıcısı için yeni şifre belirleyin (en az 8 karakter):`,
            placeholder: 'Yeni şifre giriniz...',
            confirmText: 'Şifreyi Güncelle'
          });
          if (!newPw) return;
          if (newPw.length < 8) {
            this.showToast('Şifre en az 8 karakter olmalıdır.', 'error');
            return;
          }
          await this.adminChangeUserPassword(u.email, newPw);
        });

        // Role toggle action
        tr.querySelector('[data-action="toggle-role"]')?.addEventListener('click', async () => {
          const newRole = isAdm ? 'user' : 'admin';
          const confirmed = await this.showConfirm({
            title: 'Kullanıcı Rolünü Güncelle',
            subtitle: 'Yetkilendirme',
            message: `'${u.email}' kullanıcısının rolü '${newRole.toUpperCase()}' olarak değiştirilsin mi?`,
            confirmText: 'Rolü Değiştir',
            cancelText: 'Vazgeç',
            type: 'warning'
          });
          if (confirmed) {
            await this.updateUserRole(u.email, newRole);
          }
        });

        // Delete user action
        tr.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
          const confirmed = await this.showConfirm({
            title: 'Kullanıcı Hesabını Sil',
            subtitle: 'Kalıcı İşlem',
            message: `'${u.email}' kullanıcısını sistemden kalıcı olarak silmek istediğinizden emin misiniz?`,
            confirmText: 'Evet, Hesabı Sil',
            cancelText: 'Vazgeç',
            type: 'danger'
          });
          if (confirmed) {
            await this.deleteUserAccount(u.email);
          }
        });

        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
    }
  }

  async adminChangeUserPassword(email, newPassword) {
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const res = await fetch('/api/admin/users/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ email, new_password: newPassword })
      });
      const data = await res.json();
      if (res.ok) {
        this.showToast(data.message || 'Şifre başarıyla güncellendi.', 'success');
      } else {
        this.showToast(data.detail || 'Şifre güncellenemedi.', 'error');
      }
    } catch (e) {
      this.showToast('Şifre değiştirilirken bağlantı hatası oluştu.', 'error');
    }
  }

  async updateUserRole(email, role) {
    try {
      const res = await fetch('/api/admin/update-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}`
        },
        body: JSON.stringify({ email, role })
      });
      const data = await res.json();
      if (res.ok) {
        this.showToast(data.message, 'success');
        await this.loadAdminUsers();
      } else {
        this.showToast(data.detail || 'Rol güncellenemedi.', 'error');
      }
    } catch (e) {
      this.showToast('İşlem sırasında hata oluştu.', 'error');
    }
  }

  async deleteUserAccount(email) {
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}`
        },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (res.ok) {
        this.showToast(data.message, 'success');
        await this.loadAdminUsers();
        await this.loadAdminOverview();
      } else {
        this.showToast(data.detail || 'Kullanıcı silinemedi.', 'error');
      }
    } catch (e) {
      this.showToast('İşlem sırasında hata oluştu.', 'error');
    }
  }

  async loadAdminModels() {
    try {
      const res = await fetch('/api/admin/models', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const models = data.models || [];
      const container = document.getElementById('adminModelsListContainer');
      if (!container) return;

      container.innerHTML = '';
      models.forEach(m => {
        const card = document.createElement('div');
        card.className = 'admin-model-card';
        card.innerHTML = `
          <div class="admin-model-head">
            <div>
              <div class="admin-model-title">${this._escapeHtml(m.name)}</div>
              <div class="admin-model-fname">${this._escapeHtml(m.filename)} (${m.size_mb} MB)</div>
            </div>
            <span class="fmt-pill ${m.exists ? 'green' : 'red'}" style="font-size:0.75rem;">
              ${m.exists ? 'Dosya Hazır' : 'İndirilmeli'}
            </span>
          </div>
          <div class="admin-model-meta-row">
            <span>Tip: <strong>${m.type}</strong></span>
            <span>Hız: <strong>${m.speed}</strong></span>
            <span>Doğruluk: <strong>${m.accuracy}</strong></span>
          </div>
          <div class="admin-model-meta-row" style="justify-content:space-between; border-top:1px solid var(--border-color); padding-top:12px; margin-top:4px;">
            <span class="admin-status-pill">
              <span class="admin-status-dot ${m.is_cached_in_memory ? 'online' : ''}"></span>
              ${m.is_cached_in_memory ? 'RAM Önbelleğinde Aktif' : 'Beklemede'}
            </span>
            <button class="btn-secondary btn-sm preload-btn" data-key="${m.key}">
              Önbelleğe Yükle
            </button>
          </div>
        `;

        card.querySelector('.preload-btn')?.addEventListener('click', async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = 'Yükleniyor...';
          try {
            const pres = await fetch('/api/admin/models/preload', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}`
              },
              body: JSON.stringify({ model_key: m.key })
            });
            const pdata = await pres.json();
            if (pres.ok) {
              this.showToast(pdata.message, 'success');
              await this.loadAdminModels();
            } else {
              this.showToast(pdata.detail || 'Model yüklenemedi.', 'error');
            }
          } catch (err) {
            this.showToast('Model yükleme hatası.', 'error');
          } finally {
            btn.disabled = false;
            btn.textContent = 'Önbelleğe Yükle';
          }
        });

        container.appendChild(card);
      });
    } catch (e) {
      console.error(e);
    }
  }

  async loadAdminLogs() {
    try {
      const res = await fetch('/api/admin/logs', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      const logs = data.logs || [];
      const body = document.getElementById('adminLogsBody');
      if (!body) return;

      body.innerHTML = '';
      logs.forEach(log => {
        const row = document.createElement('div');
        row.className = 'admin-log-row';
        const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('tr-TR') : '--:--';
        row.innerHTML = `
          <span class="admin-log-time">[${timeStr}]</span>
          <span class="admin-log-cat">${log.category}</span>
          <span class="admin-log-msg">${this._escapeHtml(log.message)}</span>
        `;
        body.appendChild(row);
      });
    } catch (e) {
      console.error(e);
    }
  }

  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }



  // =====================================================
  // AI AGENT PROMPT, CHAT ROOM & BLUEPRINT ENGINE
  // =====================================================
  // AI AGENT PROMPT, CHAT ROOM & BLUEPRINT ENGINE
  // =====================================================

  initAgentChat() {
    this.chatMessages = this.chatMessages || [];
    this.currentChatAttachment = null;
    this.activeAgentSessionId = this.activeAgentSessionId || ('session_' + Date.now());
    
    // File input and attachment trigger
    const fileInput = document.getElementById('agentChatFileInput');
    const attachBtn = document.getElementById('agentChatAttachBtn');
    const previewBox = document.getElementById('agentChatAttachmentPreview');
    const previewImg = document.getElementById('agentChatAttachedImg');
    const previewName = document.getElementById('agentChatAttachedName');
    const removeAttachBtn = document.getElementById('agentChatRemoveAttachBtn');

    attachBtn?.addEventListener('click', () => fileInput?.click());

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        this.showToast('Lütfen yalnızca geçerli bir görsel dosyası seçin.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onload = (re) => {
        this.currentChatAttachment = {
          name: file.name,
          base64: re.target.result
        };
        if (previewImg) previewImg.src = re.target.result;
        if (previewName) previewName.textContent = file.name;
        if (previewBox) previewBox.style.display = 'inline-flex';
      };
      reader.readAsDataURL(file);
    });

    removeAttachBtn?.addEventListener('click', () => {
      this.currentChatAttachment = null;
      if (fileInput) fileInput.value = '';
      if (previewBox) previewBox.style.display = 'none';
    });

    // Bind Hero Prompt Box Submission
    const submitPrompt = () => {
      const input = document.getElementById('agentPromptInput');
      const text = input?.value.trim();
      if (!text) return;
      input.value = '';
      this.startAgentConversation(text);
    };

    document.getElementById('agentPromptSubmitBtn')?.addEventListener('click', submitPrompt);
    document.getElementById('agentPromptInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitPrompt();
      }
    });

    // Bind In-Chat Input Submission
    const sendChatMessage = () => {
      const chatInput = document.getElementById('agentChatInput');
      const text = chatInput?.value.trim();
      const attachment = this.currentChatAttachment;

      if (!text && !attachment) return;
      
      chatInput.value = '';
      chatInput.style.height = 'auto'; // Reset auto-expanded height back to default single line
      this.currentChatAttachment = null;
      if (fileInput) fileInput.value = '';
      if (previewBox) previewBox.style.display = 'none';

      this.sendAgentChatMessage(text || 'Bu görseli analiz et ve nesneleri tespit et.', attachment);
    };

    document.getElementById('agentChatSendBtn')?.addEventListener('click', sendChatMessage);
    document.getElementById('agentChatInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });

    // New Chat Button
    document.getElementById('agentNewChatBtn')?.addEventListener('click', () => {
      this.resetAgentToHero();
    });

    // Toggle Chat History Sidebar (right side)
    document.getElementById('agentHistoryToggleBtn')?.addEventListener('click', () => {
      const sidebar = document.getElementById('agentChatHistorySidebar');
      if (sidebar) {
        sidebar.classList.toggle('collapsed');
        if (!sidebar.classList.contains('collapsed')) this.loadAgentChatHistory();
      }
    });

    // Textarea auto-resize
    const textarea = document.getElementById('agentChatInput');
    if (textarea) {
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        const newH = Math.min(textarea.scrollHeight, 180);
        textarea.style.height = newH + 'px';
      });
    }

    // Load initial user chat history
    this.loadAgentChatHistory();
  }

  async loadAgentChatHistory() {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || localStorage.getItem('yolo_auth_token') || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const res = await fetch('/api/agent/history', { headers });
      const data = await res.json();
      const sessions = data.sessions || [];

      // 1. Update Hero History List
      const heroList = document.getElementById('agentHeroHistoryList');
      const heroCount = document.getElementById('agentHeroHistoryCount');
      if (heroCount) heroCount.textContent = `${sessions.length} Sohbet Kayıtlı`;

      if (heroList) {
        if (sessions.length === 0) {
          heroList.innerHTML = `<div style="padding:16px; text-align:center; color:#64748b; font-size:0.85rem;">Henüz kayıtlı sohbet geçmişiniz bulunmuyor.</div>`;
        } else {
          heroList.innerHTML = sessions.slice(0, 5).map(s => {
            const dateStr = s.updated_at ? new Date(s.updated_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            return `
              <div class="agent-history-item" data-session-id="${s.id}" style="margin-bottom:6px;">
                <div>
                  <div class="agent-history-item-title">${this._escapeHtml(s.title)}</div>
                  <div class="agent-history-item-date">${dateStr} · ${s.message_count} mesaj</div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <button class="agent-history-del-btn" data-del-id="${s.id}" title="Sil">✕</button>
                </div>
              </div>
            `;
          }).join('');

          heroList.querySelectorAll('.agent-history-item').forEach(item => {
            const sid = item.dataset.sessionId;
            item.querySelector('.agent-history-del-btn')?.addEventListener('click', (e) => {
              e.stopPropagation();
              this.deleteAgentSession(sid);
            });
            item.addEventListener('click', (e) => {
              if (e.target.classList.contains('agent-history-del-btn')) return;
              this.openAgentSession(sid);
            });
          });
        }
      }

      // 2. Update Drawer History List
      const drawerList = document.getElementById('agentHistoryList');
      if (drawerList) {
        if (sessions.length === 0) {
          drawerList.innerHTML = `<div style="padding:12px; text-align:center; color:#64748b; font-size:0.82rem;">Henüz geçmiş sohbet yok.</div>`;
        } else {
          drawerList.innerHTML = sessions.map(s => {
            const isAct = s.id === this.activeAgentSessionId;
            const dateStr = s.updated_at ? new Date(s.updated_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            return `
              <div class="agent-history-item ${isAct ? 'active' : ''}" data-session-id="${s.id}">
                <div>
                  <div class="agent-history-item-title">${this._escapeHtml(s.title)}</div>
                  <div class="agent-history-item-date">${dateStr} · ${s.message_count} mesaj</div>
                </div>
                <button class="agent-history-del-btn" data-del-id="${s.id}" title="Sil">✕</button>
              </div>
            `;
          }).join('');

          drawerList.querySelectorAll('.agent-history-item').forEach(item => {
            const sid = item.dataset.sessionId;
            item.querySelector('.agent-history-del-btn')?.addEventListener('click', (e) => {
              e.stopPropagation();
              this.deleteAgentSession(sid);
            });
            item.addEventListener('click', (e) => {
              if (e.target.classList.contains('agent-history-del-btn')) return;
              this.openAgentSession(sid);
            });
          });
        }
      }

    } catch (e) {
      console.error('Error loading AI history:', e);
    }
  }

  async openAgentSession(sessionId) {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || localStorage.getItem('yolo_auth_token') || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      const res = await fetch(`/api/agent/history?session_id=${encodeURIComponent(sessionId)}`, { headers });
      const data = await res.json();
      const sess = data.session;
      if (!sess) return;

      this.activeAgentSessionId = sess.id;
      const hero = document.getElementById('agentHeroContainer');
      const chat = document.getElementById('agentChatContainer');
      if (hero) hero.style.display = 'none';
      if (chat) {
        chat.style.display = 'flex';
        chat.scrollIntoView({ behavior: 'smooth' });
      }

      // Close history drawer if open
      const drawer = document.getElementById('agentHistoryDrawer');
      if (drawer) drawer.style.display = 'none';

      // Clear & render messages
      const messagesContainer = document.getElementById('agentChatMessages');
      if (messagesContainer) messagesContainer.innerHTML = '';

      (sess.messages || []).forEach(msg => {
        if (msg.role === 'user') {
          let userMsgContent = this._escapeHtml(msg.content);
          if (msg.image_name) {
            userMsgContent = `
              <div style="font-size:0.75rem; color:#93c5fd; margin-bottom:4px;">📎 ${this._escapeHtml(msg.image_name)}</div>
              <div>${this._escapeHtml(msg.content)}</div>
            `;
          }
          this.appendChatMessage('user', userMsgContent, true);
        } else {
          if (msg.type === 'blueprint' && msg.blueprint) {
            const bp = msg.blueprint;
            this.currentBlueprint = bp;
            const classBadges = (bp.classes || []).map(c => `
              <span style="display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); padding:4px 10px; border-radius:8px; font-size:0.82rem; margin:3px;">
                <span style="width:10px; height:10px; border-radius:50%; background:${c.color};"></span>
                <strong>${c.name}</strong>
              </span>
            `).join('');

            const replyHtml = `
              <div>
                <p style="margin-bottom:12px; font-weight:600; color:#f8fafc;">İsteğinizi analiz ettim ve projeniz için uygun veri seti mimarisini hazırladım:</p>
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:16px; margin:10px 0;">
                  <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                    <strong style="font-size:1.05rem; color:#60a5fa;">${this._escapeHtml(bp.name)}</strong>
                    <span style="font-size:0.75rem; background:#3b82f6; color:#fff; padding:2px 8px; border-radius:99px; font-weight:700;">${(bp.type || 'DETECTION').toUpperCase()}</span>
                  </div>
                  <p style="font-size:0.85rem; color:#cbd5e1; margin-bottom:12px;">${this._escapeHtml(bp.description || '')}</p>
                  <div style="margin-bottom:14px;">
                    <div style="font-size:0.78rem; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:6px;">Önerilen Algılama Sınıfları (${(bp.classes || []).length}):</div>
                    <div style="display:flex; flex-wrap:wrap; gap:4px;">${classBadges}</div>
                  </div>
                  <button class="btn-primary btn-sm" style="display:inline-flex; align-items:center; gap:8px;" onclick="window._yoloEditor && window._yoloEditor.createProjectFromBlueprint()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>Bu Projeyi Şimdi Oluştur & Başlat</span>
                  </button>
                </div>
              </div>
            `;
            this.appendChatMessage('assistant', replyHtml, true);
          } else {
            const formattedMsg = this._escapeHtml(msg.message || '').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
            this.appendChatMessage('assistant', formattedMsg, true);
          }
        }
      });

      this.loadAgentChatHistory();
    } catch (e) {
      console.error('Error opening session:', e);
    }
  }

  async deleteAgentSession(sessionId) {
    const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || localStorage.getItem('yolo_auth_token') || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};

    try {
      await fetch(`/api/agent/history?session_id=${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
        headers
      });
      if (this.activeAgentSessionId === sessionId) {
        this.resetAgentToHero();
      }
      this.loadAgentChatHistory();
    } catch (e) {
      console.error('Error deleting session:', e);
    }
  }

  resetAgentToHero() {
    const hero = document.getElementById('agentHeroContainer');
    const chat = document.getElementById('agentChatContainer');
    if (hero) hero.style.display = 'block';
    if (chat) chat.style.display = 'none';
    this.chatMessages = [];
    this.currentChatAttachment = null;
    this.activeAgentSessionId = 'session_' + Date.now();
    const container = document.getElementById('agentChatMessages');
    if (container) container.innerHTML = '';
    this.loadAgentChatHistory();
  }

  startAgentConversation(initialPrompt) {
    this.activeAgentSessionId = 'session_' + Date.now();
    const hero = document.getElementById('agentHeroContainer');
    const chat = document.getElementById('agentChatContainer');
    if (hero) hero.style.display = 'none';
    if (chat) {
      chat.style.display = 'flex';
      chat.scrollIntoView({ behavior: 'smooth' });
    }
    // Start with sidebar collapsed until user toggles it
    const sidebar = document.getElementById('agentChatHistorySidebar');
    if (sidebar) sidebar.classList.add('collapsed');

    // Append welcome & initial message
    this.sendAgentChatMessage(initialPrompt);
  }

  async sendAgentChatMessage(promptText, attachment = null) {
    const messagesContainer = document.getElementById('agentChatMessages');
    if (!messagesContainer) return;

    // 1. Add User Message (with image thumbnail if present)
    let userMsgContent = this._escapeHtml(promptText);
    if (attachment && attachment.base64) {
      userMsgContent = `
        <div style="margin-bottom:8px;">
          <img src="${attachment.base64}" style="max-width:220px; max-height:160px; border-radius:10px; border:1px solid rgba(255,255,255,0.2); object-fit:cover; display:block;">
        </div>
        <div>${this._escapeHtml(promptText)}</div>
      `;
      this.appendChatMessage('user', userMsgContent, true);
    } else {
      this.appendChatMessage('user', userMsgContent, false);
    }

    // 2. Add Assistant Thinking Row — orbital spinner runs directly inside the avatar!
    const typingId = 'typing_' + Date.now();
    const typingEl = document.createElement('div');
    typingEl.id = typingId;
    typingEl.className = 'chat-msg assistant';
    typingEl.innerHTML = `
      <div class="chat-msg-avatar is-thinking" title="Yapay zeka düşünüyor...">
        <div class="mini-orb-spinner" style="width:32px; height:32px;">
          <div class="m-ring m-ring-1"></div>
          <div class="m-ring m-ring-2"></div>
          <div class="m-core" style="width:14px; height:14px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:8px; height:8px;">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4"></path>
            </svg>
          </div>
        </div>
      </div>
      <div class="chat-msg-bubble" style="opacity:0.6; font-style:italic; font-size:0.85rem; color:#94a3b8; display:flex; align-items:center; gap:8px;">
        <span class="pulse-dot"></span> Yanıt hazırlanıyor...
      </div>
    `;
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // 3. Show stop button, hide send button
    const sendBtn = document.getElementById('agentChatSendBtn');
    const stopBtn = document.getElementById('agentChatStopBtn');
    if (sendBtn) sendBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'flex';

    // AbortController for cancel support
    this._agentAbortController = new AbortController();
    let aborted = false;
    if (stopBtn) {
      stopBtn._stopHandler = () => {
        aborted = true;
        this._agentAbortController.abort();
      };
      stopBtn.addEventListener('click', stopBtn._stopHandler, { once: true });
    }

    try {
      const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || localStorage.getItem('yolo_auth_token') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const payload = {
        prompt: promptText,
        image_base64: attachment ? attachment.base64 : null,
        image_name: attachment ? attachment.name : null,
        session_id: this.activeAgentSessionId
      };

      const res = await fetch('/api/agent/suggest', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: this._agentAbortController.signal
      });
      const data = await res.json();
      
      // Remove typing bubble
      document.getElementById(typingId)?.remove();

      if (aborted) {
        this.appendChatMessage('assistant', '<em style="color:#94a3b8;">Yanıt durduruldu.</em>', true);
      } else if (res.ok && data.type === 'chat' && data.message) {
        const formattedMsg = this._escapeHtml(data.message).replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
        this.appendChatMessage('assistant', formattedMsg, true);
      } else if (res.ok && data.blueprint) {
        const bp = data.blueprint;
        this.currentBlueprint = bp;

        const classBadges = bp.classes.map(c => `
          <span style="display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); padding:4px 10px; border-radius:8px; font-size:0.82rem; margin:3px;">
            <span style="width:10px; height:10px; border-radius:50%; background:${c.color};"></span>
            <strong>${c.name}</strong>
            <small style="color:#94a3b8;">(${c.prompts.slice(0, 2).join(', ')})</small>
          </span>
        `).join('');

        const replyHtml = `
          <div>
            <p style="margin-bottom:12px; font-weight:600; color:#f8fafc;">Harika bir fikir! İsteğinizi analiz ettim ve projeniz için uygun veri seti mimarisini hazırladım:</p>
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:16px; margin:10px 0;">
              <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <strong style="font-size:1.05rem; color:#60a5fa;">${this._escapeHtml(bp.name)}</strong>
                <span style="font-size:0.75rem; background:#3b82f6; color:#fff; padding:2px 8px; border-radius:99px; font-weight:700;">${bp.type.toUpperCase()}</span>
              </div>
              <p style="font-size:0.85rem; color:#cbd5e1; margin-bottom:12px;">${this._escapeHtml(bp.description)}</p>
              <div style="margin-bottom:14px;">
                <div style="font-size:0.78rem; font-weight:700; color:#94a3b8; text-transform:uppercase; margin-bottom:6px;">Önerilen Algılama Sınıfları (${bp.classes.length}):</div>
                <div style="display:flex; flex-wrap:wrap; gap:4px;">${classBadges}</div>
              </div>
              <button class="btn-primary btn-sm" id="chatLaunchProjectBtn" style="display:inline-flex; align-items:center; gap:8px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Bu Projeyi Şimdi Oluştur & Başlat</span>
              </button>
            </div>
            <p style="font-size:0.82rem; color:#94a3b8; margin-top:8px;">Başka bir sınıf eklememi veya farklı bir veri türü planlamamı ister misiniz?</p>
          </div>
        `;

        this.appendChatMessage('assistant', replyHtml, true);
        document.getElementById('chatLaunchProjectBtn')?.addEventListener('click', () => {
          this.createProjectFromBlueprint();
        });

      } else {
        this.appendChatMessage('assistant', data.message || 'Üzgünüm, isteğinizi anlayamadım. Size nasıl yardımcı olabilirim?');
      }

      this.loadAgentChatHistory();
    } catch (e) {
      document.getElementById(typingId)?.remove();
      if (e.name === 'AbortError') {
        this.appendChatMessage('assistant', '<em style="color:#94a3b8;">Yanıt durduruldu.</em>', true);
      } else {
        this.appendChatMessage('assistant', 'Bağlantı hatası oluştu. Lütfen ağ bağlantınızı kontrol edin.');
      }
    } finally {
      // Restore send/stop buttons
      if (sendBtn) sendBtn.style.display = 'flex';
      if (stopBtn) stopBtn.style.display = 'none';
      this._agentAbortController = null;
    }
  }


  appendChatMessage(role, content, isHtml = false) {
    const messagesContainer = document.getElementById('agentChatMessages');
    if (!messagesContainer) return;

    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${role}`;

    const copyBtn = `
      <button class="chat-msg-copy-btn" title="Kopyala">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="9" y="9" width="13" height="13" rx="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Kopyala
      </button>
    `;

    if (role === 'user') {
      msgEl.innerHTML = `
        <div class="chat-msg-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div class="chat-msg-bubble">${isHtml ? content : this._escapeHtml(content)}${copyBtn}</div>
      `;
    } else {
      msgEl.innerHTML = `
        <div class="chat-msg-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path>
          </svg>
        </div>
        <div class="chat-msg-bubble">${isHtml ? content : this._escapeHtml(content)}${copyBtn}</div>
      `;
    }

    // Wire copy button
    const copyBtnEl = msgEl.querySelector('.chat-msg-copy-btn');
    if (copyBtnEl) {
      copyBtnEl.addEventListener('click', () => {
        const bubble = copyBtnEl.closest('.chat-msg-bubble');
        const text = bubble ? (bubble.innerText || bubble.textContent || '').replace('Kopyala', '').trim() : '';
        navigator.clipboard.writeText(text).then(() => {
          copyBtnEl.classList.add('copied');
          copyBtnEl.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> Kopyalandı`;
          setTimeout(() => {
            copyBtnEl.classList.remove('copied');
            copyBtnEl.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg> Kopyala`;
          }, 2000);
        }).catch(() => {});
      });
    }

    messagesContainer.appendChild(msgEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  async handleAgentPrompt(promptText) {
    this.startAgentConversation(promptText);
  }

  async createProjectFromBlueprint() {
    if (!this.currentBlueprint) return;
    const bp = this.currentBlueprint;
    const btn = document.getElementById('chatLaunchProjectBtn') || document.getElementById('blueprintLaunchBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Oluşturuluyor...'; }

    try {
      const token = localStorage.getItem('yolo_auth_token') || '';
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          folder_name: bp.folder,
          display_name: bp.name,
          description: bp.description,
          classes: bp.classes,
          visibility: 'public',
          license: 'CC BY 4.0',
          project_type: bp.type || 'detection',
          workspace_id: this.activeWorkspaceId || localStorage.getItem('activeWorkspaceId') || null
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(`'${bp.name}' projesi başarıyla oluşturuldu.`, 'success');
        await this.fetchProjects();
        await this.openProject(bp.folder, 'upload');
      } else {
        this.showToast(data.detail || 'Proje oluşturulamadı.', 'error');
      }
    } catch (e) {
      this.showToast('Bağlantı hatası.', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Bu Projeyi Şimdi Oluştur & Başlat'; }
    }
  }

  // =====================================================
  // ASSET LIBRARY LOADER & RENDERER
  // =====================================================

  async loadAssetLibrary() {
    const grid = document.getElementById('assetsGrid');
    const projSelect = document.getElementById('assetFilterProject');
    const status = document.getElementById('assetFilterStatus')?.value || 'all';
    const search = document.getElementById('assetSearchInput')?.value.trim() || '';
    const proj = projSelect?.value || '';

    if (grid) grid.innerHTML = '<div class="empty-state">Yükleniyor...</div>';

    try {
      const query = new URLSearchParams({
        filter_status: status,
        search: search,
        ...(proj ? { category: proj } : {})
      });
      const token = localStorage.getItem('yolo_auth_token') || '';
      const res = await fetch(`/api/workspace/assets?${query.toString()}`, {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      const data = await res.json();

      if (res.ok && data.assets) {
        // Populate project selector options if empty
        if (projSelect && projSelect.options.length <= 1 && this.projects.length > 0) {
          projSelect.innerHTML = '<option value="">Tüm Projeler</option>' +
            this.projects.map(p => `<option value="${p.id}">${p.name || p.id}</option>`).join('');
        }

        if (data.assets.length === 0) {
          if (grid) grid.innerHTML = `
            <div class="empty-state-modern" style="grid-column: 1 / -1;">
              <div class="empty-state-icon-wrap">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </div>
              <h3>Görsel Havuzunda Henüz Medya Yok</h3>
              <p>Çalışma alanınızdaki projelere görsel eklediğinizde veya içe aktardığınızda otomatik olarak burada listelenecektir.</p>
            </div>
          `;
          return;
        }

        if (grid) {
          grid.innerHTML = data.assets.map(a => `
            <div class="asset-card" data-proj="${a.project_id}" data-file="${a.filename}">
              <img src="${a.preview_url || a.image_url}" alt="${a.filename}" loading="lazy">
              ${a.has_labels ? `<span class="asset-card-badge">${a.box_count} Box</span>` : ''}
              <span class="asset-card-proj-tag">${a.project_name}</span>
            </div>
          `).join('');

          // Click on asset card to open that project's dataset
          grid.querySelectorAll('.asset-card').forEach(c => {
            c.addEventListener('click', () => {
              const pid = c.dataset.proj;
              if (pid) this.openProject(pid, 'dataset');
            });
          });
        }
      }
    } catch (e) {
      if (grid) grid.innerHTML = '<div class="empty-state">Görseller yüklenirken hata oluştu.</div>';
    }
  }

  showCreateProject(pushHistory = true) {
    this.currentView = 'create_project';
    if (pushHistory) {
      this.navigateTo('create_project');
    }
    this.hideAllViews();
    if (this.createProjectView) this.createProjectView.style.display = 'flex';

    // Reset inputs
    const nameInput = document.getElementById('fullNewProjName');
    if (nameInput) nameInput.value = '';
    const errSpan = document.getElementById('projNameError');

    if (errSpan) errSpan.style.display = 'none';

    // Reset classes container to 1 default class
    const clsContainer = document.getElementById('fullClassesListContainer');
    if (clsContainer) {
      clsContainer.innerHTML = `
        <div class="cls-row-pill" data-idx="0">
          <input type="text" class="cls-name-input" value="Object" placeholder="Sınıf adı (ör: Car, Person, Bag)">
          <input type="color" class="cls-color-input" value="#3b82f6" title="Sınıf Rengi">
          <input type="text" class="cls-prompts-input" placeholder="AI arama promptları (virgülle ayırın)" style="flex:2;">
          <button type="button" class="cls-del-btn" title="Sil" disabled>✕</button>
        </div>
      `;
    }
  }

  async showProjectHub(projectId, defaultTab = 'upload') {
    await this.openProject(projectId, defaultTab);
  }

  switchHubTab(tabName) {
    this.switchProjectTab(tabName);
  }

  async loadHubProjectData() {
    if (!this.activeHubProjectId) return;
    this.isLoadingHubData = true;
    this.showProjectLoading();

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';

      const res = await fetch(`/api/project-settings?category=${encodeURIComponent(this.activeHubProjectId)}${tokenQuery}`, { headers });
      const data = await res.json();
      this.currentHubMeta = data;

      // Update Hub Title & Sidebar Badges
      const titleEl = document.getElementById('hubProjectTitle');
      if (titleEl) titleEl.textContent = data.display_name || this.activeHubProjectId;

      const annBadge = document.getElementById('projAnnotateBadge') || document.getElementById('hubAnnotateBadge');
      const dsBadge = document.getElementById('projDatasetBadge') || document.getElementById('hubDatasetBadge');

      if (annBadge) annBadge.textContent = data.empty_images !== undefined ? data.empty_images : 0;
      if (dsBadge) dsBadge.textContent = data.total_images !== undefined ? data.total_images : 0;

      // Default Batch Name
      const batchInput = document.getElementById('uploadBatchNameInput');
      if (batchInput && !batchInput.value) {
        const dtStr = new Date().toLocaleDateString('tr-TR');
        const timeStr = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
        batchInput.value = `Uploaded on ${dtStr} at ${timeStr}`;
      }

      // Fetch full image list
      const imgRes = await fetch(`/api/images?category=${encodeURIComponent(this.activeHubProjectId)}${tokenQuery}`, { headers });
      const imgData = await imgRes.json();
      this.currentHubImages = imgData.images || [];

      // Ensure live accurate badge counts from fetched image list
      if (this.currentHubImages && this.currentHubImages.length > 0) {
        const totalCount = this.currentHubImages.length;
        const emptyCount = this.currentHubImages.filter(i => !i.has_label_file || i.box_count === 0).length;
        
        if (annBadge) annBadge.textContent = emptyCount;
        if (dsBadge) dsBadge.textContent = totalCount;

        // Update Training Studio Dataset Selector options dynamically
        const trainVerSelect = document.getElementById('trainDatasetVersionSelect');
        if (trainVerSelect) {
          const labeledCount = totalCount - emptyCount;
          trainVerSelect.innerHTML = `
            <option value="all">Tüm Proje Veri Seti (${totalCount.toLocaleString()} Görsel)</option>
            <option value="approved">Etiketli Veri Seti (${labeledCount.toLocaleString()} Görsel)</option>
            <option value="augmented">Artırılmış Veri Seti (Augmented)</option>
          `;
        }
      }
      this.renderAnnotateKanban();
      this.renderDatasetGallery();
      this.updateExportSummary();
      this.checkRunningBatchStatus(cat);
    } catch (err) {
      console.error('Error loading hub project data:', err);
    } finally {
      this.isLoadingHubData = false;
      this.hideProjectLoading();
    }
  }

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

    document.getElementById('roboflowUploadMoreBtn')?.addEventListener('click', () => {
      this.switchProjectTab('upload');
    });
    document.getElementById('roboflowViewUnassignedBtn')?.addEventListener('click', () => {
      const sel = document.getElementById('datasetFilterStatus');
      if (sel) sel.value = 'unlabeled';
      this.switchProjectTab('dataset');
    });

    try {
      const res = await fetch(`/api/projects/batches?category=${encodeURIComponent(this.activeHubProjectId)}`);
      const data = await res.json();
      const batches = data.batches || [];

      // Her batch'in ait olduğu gerçek sütunu belirle
      const getBatchColumn = (b) => {
        if (b.status === 'unassigned') return 'unassigned';
        if (b.status === 'annotating') return 'annotating';
        if (b.status === 'completed') return 'completed';
        
        // Geriye dönük uyumluluk:
        if (b.approved_count > 0 || (b.unassigned_count === 0 && b.total_count > 0)) {
          return 'completed';
        }
        if (b.annotated_count > 0 && b.unassigned_count > 0) {
          return 'annotating';
        }
        return 'unassigned';
      };

      const unassignedBatches = batches.filter(b => getBatchColumn(b) === 'unassigned');
      const annotatingBatches = batches.filter(b => getBatchColumn(b) === 'annotating');
      const completedBatches = batches.filter(b => getBatchColumn(b) === 'completed');

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
          unassignedList.innerHTML = `
            <div class="kanban-batch-card">
              <div class="k-card-title">Ana Ham Resim Havuzu</div>
              <div class="k-card-meta" style="color:var(--accent-success); font-weight:600;">Tüm ham resimler etiketlendi!</div>
            </div>
          `;
        } else {
          unassignedList.innerHTML = unassignedBatches.map(b => `
            <div class="kanban-batch-card" data-batch-id="${b.id}" style="margin-bottom:12px; cursor:pointer;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div class="k-card-title">${b.name}</div>
                  <span style="font-size:0.75rem; color:var(--text-dim);">${b.created_at || ''}</span>
                </div>
                <button class="btn-batch-dots" data-batch-id="${b.id}" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px 6px; font-size:1.2rem; line-height:1; border-radius:4px;" title="İşlemler">⋮</button>
              </div>
              <div class="k-card-meta" style="margin-top:4px;">${b.total_count || b.images?.length || 0} etiket bekleyen ham görsel</div>
              ${b.tags ? `<div style="font-size:0.74rem; color:var(--accent-primary); margin-top:4px;">🏷️ ${b.tags}</div>` : ''}
              <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
                <button class="btn-primary btn-sm btn-start-batch" data-batch-id="${b.id}" style="width:100%; justify-content:center; font-weight:700; padding:8px 12px;">
                  Etiketlemeye Başla ➔
                </button>
                <button class="btn-secondary btn-sm btn-batch-ai" data-batch-id="${b.id}" style="width:100%; justify-content:center; background:linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.25)); border:1px solid rgba(139,92,246,0.5); color:#c4b5fd; font-weight:700; padding:7px 12px; font-size:0.82rem; display:inline-flex; align-items:center; gap:6px;" title="Bu yığındaki resimleri AI ile otomatik etiketle">
                  ✨ Yapay Zeka ile Toplu Etiketle
                </button>
              </div>
            </div>
          `).join('');

          unassignedList.querySelectorAll('.kanban-batch-card').forEach(card => {
            const bId = card.dataset.batchId;
            const targetBatch = batches.find(b => b.id === bId);
            const currentProj = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'bag';
            card.querySelector('.btn-batch-dots')?.addEventListener('click', (e) => {
              e.stopPropagation();
              if (targetBatch) this.openBatchContextMenu(targetBatch, e);
            });
            card.querySelector('.btn-start-batch')?.addEventListener('click', (e) => {
              e.stopPropagation();
              if (targetBatch) {
                const batchFiles = targetBatch.unassigned_files || targetBatch.images || [];
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
            const pct = b.total_count > 0 ? (b.annotated_count / b.total_count * 100).toFixed(1) : 0;
            return `
              <div class="kanban-batch-card" data-batch-id="${b.id}" style="margin-bottom:12px; cursor:pointer;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                  <div>
                    <div class="k-card-title">${b.name}</div>
                    <span style="font-size:0.75rem; color:var(--text-dim);">${b.created_at || ''}</span>
                  </div>
                  <button class="btn-batch-dots" data-batch-id="${b.id}" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px 6px; font-size:1.2rem; line-height:1; border-radius:4px;" title="İşlemler">⋮</button>
                </div>
                <div class="k-card-meta" style="margin-top:4px;">${b.annotated_count} etiketli görsel (İncelemede %${pct})</div>
                <div class="stat-progress-track" style="margin-top:6px;">
                  <div class="stat-progress-fill" style="width:${pct}%;"></div>
                </div>
                <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
                  <button class="btn-primary btn-sm btn-approve-batch" data-batch-id="${b.id}" style="width:100%; justify-content:center; background:linear-gradient(135deg, #10b981, #059669); border:none; color:#fff; font-weight:700; padding:8px 12px; font-size:0.83rem; box-shadow:0 2px 10px rgba(16,185,129,0.3); display:inline-flex; align-items:center; gap:6px;" title="Bu yığındaki tüm etiketleri onaylayıp doğrudan Veri Setine aktar">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>Veri Setine Ekle (Onayla)</span>
                  </button>
                  <button class="btn-secondary btn-sm btn-continue-batch" data-batch-id="${b.id}" style="width:100%; justify-content:center; font-weight:700; padding:8px 12px;">
                    Yığını İncele &amp; Etiketle ➔
                  </button>
                  ${b.unassigned_count > 0 ? `
                    <button class="btn-secondary btn-sm btn-batch-ai" data-batch-id="${b.id}" style="width:100%; justify-content:center; background:linear-gradient(135deg, rgba(139,92,246,0.25), rgba(59,130,246,0.25)); border:1px solid rgba(139,92,246,0.5); color:#c4b5fd; font-weight:700; padding:7px 12px; font-size:0.82rem; display:inline-flex; align-items:center; gap:6px;" title="Kalan resimleri AI ile tamamla">
                      ✨ Kalanları AI ile Tamamla (${b.unassigned_count})
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
                const confirmed = await this.showConfirm({
                  title: 'Veri Setine Aktar & Onayla',
                  subtitle: 'Yığın Onayı',
                  message: `"${targetBatch.name}" yığınındaki ${targetBatch.annotated_count} etiketli görsel onaylanıp Veri Setine (Dataset) eklensin mi?`,
                  confirmText: 'Evet, Veri Setine Ekle',
                  cancelText: 'Vazgeç',
                  type: 'info'
                });
                if (!confirmed) return;
                try {
                  const res = await fetch('/api/projects/complete-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ category: currentProj, batch_id: targetBatch.id })
                  });
                  if (res.ok) {
                    this.showToast(`🎉 "${targetBatch.name}" başarıyla Veri Setine eklendi!`, 'success');
                    await this.loadHubProjectData();
                  } else {
                    this.showToast('Veri setine eklenemedi', 'error');
                  }
                } catch (err) {
                  this.showToast('İşlem başarısız', 'error');
                }
              }
            });
            card.querySelector('.btn-continue-batch')?.addEventListener('click', (e) => {
              e.stopPropagation();
              if (targetBatch) {
                const batchFiles = targetBatch.images || [];
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
          completedList.innerHTML = completedBatches.map(b => `
            <div class="kanban-batch-card" data-batch-id="${b.id}" style="margin-bottom:12px; border-left:3px solid var(--accent-success); cursor:pointer;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                  <div class="k-card-title">${b.name}</div>
                  <span style="font-size:0.75rem; color:var(--text-dim);">${b.created_at || ''}</span>
                </div>
                <button class="btn-batch-dots" data-batch-id="${b.id}" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding:2px 6px; font-size:1.2rem; line-height:1; border-radius:4px;" title="İşlemler">⋮</button>
              </div>
              <div class="k-card-meta" style="margin-top:4px; color:var(--accent-success); font-weight:600;">
                ✓ ${b.approved_count || b.annotated_count} Görsel Veri Setine Eklendi
              </div>
              <div class="stat-progress-track" style="margin-top:6px;">
                <div class="stat-progress-fill" style="width:100%; background:var(--accent-success);"></div>
              </div>
              <div style="display:flex; gap:8px; margin-top:12px;">
                <button class="btn-secondary btn-sm btn-gallery-batch" data-batch-id="${b.id}" style="flex:1; justify-content:center;">
                  Yığını İncele ➔
                </button>
                <button class="btn-primary btn-sm btn-export-batch" data-batch-id="${b.id}" style="flex:1; justify-content:center;">
                  Dışa Aktar ➔
                </button>
              </div>
            </div>
          `).join('');

          completedList.querySelectorAll('.kanban-batch-card').forEach(card => {
            const bId = card.dataset.batchId;
            const targetBatch = batches.find(b => b.id === bId);
            card.querySelector('.btn-batch-dots')?.addEventListener('click', (e) => {
              if (targetBatch) this.openBatchContextMenu(targetBatch, e);
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
    const isCompleted = (batch.status === 'completed') || (batch.approved_count > 0 && batch.unassigned_count === 0) || (batch.total_count > 0 && batch.unassigned_count === 0 && batch.status !== 'unassigned' && batch.status !== 'annotating');
    const isAnnotating = (batch.status === 'annotating') || (batch.annotated_count > 0 && batch.unassigned_count > 0);
    const isUnassigned = (batch.status === 'unassigned') || (batch.unassigned_count > 0 && batch.annotated_count === 0);

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

    menu.innerHTML = `
      ${stageMoveButtons}
      <div style="height:1px; background:rgba(255,255,255,0.08); margin:4px 0;"></div>
      <button class="menu-item" id="menuRename" style="width:100%; text-align:left; background:none; border:none; color:#e2e8f0; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;">
        ✏️ Yığını Yeniden Adlandır
      </button>
      <button class="menu-item" id="menuTag" style="width:100%; text-align:left; background:none; border:none; color:#e2e8f0; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;">
        🏷️ Etiket / Not Ekle
      </button>
      <button class="menu-item" id="menuDownload" style="width:100%; text-align:left; background:none; border:none; color:#e2e8f0; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;">
        📥 Yığını İndir (ZIP)
      </button>
      <div style="height:1px; background:rgba(255,255,255,0.08); margin:4px 0;"></div>
      <button class="menu-item" id="menuDelete" style="width:100%; text-align:left; background:none; border:none; color:#ef4444; padding:8px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:8px;">
        🗑️ Yığını Sil
      </button>
    `;

    document.body.appendChild(menu);

    const closeMenu = () => menu.remove();
    setTimeout(() => document.addEventListener('click', closeMenu, { once: true }), 10);

    const handleMove = async (targetStage, stageTitle) => {
      closeMenu();
      try {
        const res = await fetch('/api/projects/move-batch-stage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: currentProj, batch_id: batch.id, target_stage: targetStage })
        });
        if (res.ok) {
          this.showToast(`Yığın başarıyla "${stageTitle}" sütununa taşındı.`, 'success');
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
    menu.querySelector('#menuDownload').onclick = () => {
      closeMenu();
      window.location.href = `/api/projects/export-zip?category=${encodeURIComponent(currentProj)}`;
    };

    // 4. Delete
    menu.querySelector('#menuDelete').onclick = async () => {
      closeMenu();
      const confirmed = await this.showConfirm({
        title: 'Yığını Sil',
        subtitle: 'Yığın Yönetimi',
        message: `"${batch.name}" yığınını silmek istediğinize emin misiniz?`,
        confirmText: 'Evet, Yığını Sil',
        cancelText: 'Vazgeç',
        type: 'danger'
      });
      if (confirmed) {
        await fetch('/api/projects/delete-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: currentProj, batch_id: batch.id })
        });
        this.showToast('Yığın başarıyla silindi.', 'success');
        this.renderAnnotateKanban();
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
      } catch (e) {}
    }

    try {
      // 1. Ensure hub images are loaded
      if (!this.currentHubImages || this.currentHubImages.length === 0) {
        const imgRes = await fetch(`/api/images?category=${encodeURIComponent(cat)}`);
        const imgData = await imgRes.json();
        this.currentHubImages = imgData.images || [];
      }

      // 2. Fetch batches
      const res = await fetch(`/api/projects/batches?category=${encodeURIComponent(cat)}`);
      const data = await res.json();
      const batches = data.batches || [];
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
          <option value="${b.id}" ${b.id === batch.id ? 'selected' : ''}>Batch: ${b.name}</option>
        `).join('');
        batchSelect.onchange = () => this.openBatchReview(batchSelect.value, this.activeBatchReviewTab, 1, true);
      }

      // Header info (Roboflow style)
      const titleEl = document.getElementById('batchReviewTitle');
      if (titleEl) {
        titleEl.textContent = filterTab === 'unannotated' ? 'Unassigned Media' : (filterTab === 'annotated' ? 'Annotated Media' : 'Approved Media');
      }

      const subName = document.getElementById('batchReviewNameSub');
      if (subName) subName.textContent = `Batch: ${batch.name}`;

      const timelineEl = document.getElementById('batchReviewTimeline');
      if (timelineEl) timelineEl.textContent = batch.created_at ? `Uploaded ${batch.created_at}` : `Toplam ${batch.total_count || this.currentHubImages.length} Görsel`;

      // Live counts calculation
      const unannotatedTotal = batch.unassigned_count !== undefined ? batch.unassigned_count : this.currentHubImages.filter(i => !i.has_label_file || i.box_count === 0).length;
      const annotatedTotal = batch.annotated_count !== undefined ? batch.annotated_count : this.currentHubImages.filter(i => i.has_label_file && i.box_count > 0).length;
      const approvedTotal = batch.approved_count || 0;

      const uBadge = document.getElementById('batchUnannotatedCountBadge');
      if (uBadge) uBadge.textContent = unannotatedTotal.toLocaleString();

      const aBadge = document.getElementById('batchAnnotatedCountBadge');
      if (aBadge) aBadge.textContent = annotatedTotal.toLocaleString();

      const appBadge = document.getElementById('batchApprovedCountBadge');
      if (appBadge) appBadge.textContent = approvedTotal.toLocaleString();

      // Filter Tabs (Status Buttons)
      const uTabBtn = document.getElementById('batchReviewTabUnannotated');
      const aTabBtn = document.getElementById('batchReviewTabAnnotated');
      const appTabBtn = document.getElementById('batchReviewTabApproved');
      [uTabBtn, aTabBtn, appTabBtn].forEach(btn => btn?.classList.remove('active'));
      
      if (uTabBtn) {
        if (filterTab === 'unannotated') uTabBtn.classList.add('active');
        uTabBtn.onclick = () => this.openBatchReview(batch.id, 'unannotated', 1, true);
      }
      if (aTabBtn) {
        if (filterTab === 'annotated') aTabBtn.classList.add('active');
        aTabBtn.onclick = () => this.openBatchReview(batch.id, 'annotated', 1, true);
      }
      if (appTabBtn) {
        if (filterTab === 'approved') appTabBtn.classList.add('active');
        appTabBtn.onclick = () => this.openBatchReview(batch.id, 'approved', 1, true);
      }

      // Actions
      const uploadMoreBtn = document.getElementById('batchUploadMoreBtn');
      if (uploadMoreBtn) {
        uploadMoreBtn.onclick = () => {
          this.switchProjectTab('upload');
          const input = document.getElementById('uploadBatchNameInput');
          if (input) input.value = batch.name;
        };
      }

      const renameBtn = document.getElementById('batchRenameBtn');
      if (renameBtn) {
        renameBtn.onclick = async () => {
          const newName = await this.showPrompt({
            title: 'Yığını Yeniden Adlandır',
            subtitle: 'Yığın Bilgisi',
            message: 'Yeni yığın adını giriniz:',
            defaultValue: batch.name,
            placeholder: 'Yığın adı...',
            confirmText: 'Kaydet'
          });
          if (newName && newName.trim() && newName.trim() !== batch.name) {
            await fetch('/api/projects/rename-batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ category: this.activeHubProjectId, batch_id: batch.id, new_name: newName.trim() })
            });
            this.showToast('Yığın adı güncellendi! ✓', 'success');
            this.openBatchReview(batch.id, filterTab, page);
          }
        };
      }

      const startAnnotatingBtn = document.getElementById('batchStartAnnotatingBtn');
      if (startAnnotatingBtn) {
        startAnnotatingBtn.onclick = () => {
          const mode = filterTab === 'unannotated' ? 'unlabeled' : 'all';
          this.showEditor(this.activeHubProjectId, true, mode);
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
          // Reliable Fallback: Get all unannotated images from currentHubImages!
          poolImages = this.currentHubImages.filter(i => !i.has_label_file || i.box_count === 0);
        }
      } else if (filterTab === 'annotated') {
        if (batch.annotated_filenames && batch.annotated_filenames.length > 0) {
          poolImages = batch.annotated_filenames.map(fn => imageMap.get(fn) || { filename: fn, has_label_file: true, box_count: 1 });
        } else {
          poolImages = this.currentHubImages.filter(i => i.has_label_file && i.box_count > 0);
        }
      } else {
        if (batch.approved_filenames && batch.approved_filenames.length > 0) {
          poolImages = batch.approved_filenames.map(fn => imageMap.get(fn) || { filename: fn, has_label_file: true, box_count: 1 });
        } else {
          poolImages = [];
        }
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

      // Search and Sort event wiring (wire once)
      const searchInput = document.getElementById('rfBatchSearchInput');
      if (searchInput && !searchInput._wired) {
        searchInput._wired = true;
        searchInput.addEventListener('input', () => this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, 1));
      }
      const sortSelect = document.getElementById('rfBatchSortSelect');
      if (sortSelect && !sortSelect._wired) {
        sortSelect._wired = true;
        sortSelect.addEventListener('change', () => this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, 1));
      }

      // 4. Pagination
      const perPageSelect = document.getElementById('rfPerPageSelect');
      const perPage = perPageSelect ? parseInt(perPageSelect.value, 10) || 50 : 50;
      if (perPageSelect && !perPageSelect._wired) {
        perPageSelect._wired = true;
        perPageSelect.addEventListener('change', () => this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, 1));
      }

      const totalItems = poolImages.length;
      const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
      const currentPage = Math.min(Math.max(1, page), totalPages);
      const startIndex = (currentPage - 1) * perPage;
      const displaySlice = poolImages.slice(startIndex, startIndex + perPage);

      // Update Pagination Bar Text
      const pagInfo = document.getElementById('rfPaginationInfo');
      if (pagInfo) {
        if (totalItems === 0) {
          pagInfo.textContent = '0 of 0';
        } else {
          pagInfo.textContent = `${startIndex + 1} - ${Math.min(startIndex + perPage, totalItems)} of ${totalItems.toLocaleString()}`;
        }
      }

      // Render Pagination Buttons
      const pagControls = document.getElementById('rfPaginationControls');
      if (pagControls) {
        pagControls.innerHTML = `
          <button class="btn-secondary btn-sm" id="rfPagPrevBtn" ${currentPage <= 1 ? 'disabled style="opacity:0.4; pointer-events:none;"' : ''}>&lt;</button>
          <span style="padding:0 8px; font-weight:700; color:#fff;">${currentPage} / ${totalPages}</span>
          <button class="btn-secondary btn-sm" id="rfPagNextBtn" ${currentPage >= totalPages ? 'disabled style="opacity:0.4; pointer-events:none;"' : ''}>&gt;</button>
        `;
        document.getElementById('rfPagPrevBtn')?.addEventListener('click', () => this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, currentPage - 1));
        document.getElementById('rfPagNextBtn')?.addEventListener('click', () => this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, currentPage + 1));
      }

      // Toggle annotations checkbox
      const showBoxes = document.getElementById('rfToggleAnnotationsCheck')?.checked ?? true;
      const toggleCheck = document.getElementById('rfToggleAnnotationsCheck');
      if (toggleCheck && !toggleCheck._wired) {
        toggleCheck._wired = true;
        toggleCheck.addEventListener('change', () => this.openBatchReview(this.activeBatchReviewId, this.activeBatchReviewTab, this.rfBatchCurrentPage));
      }

      // 5. Render Roboflow Style Cards Grid
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
          grid.innerHTML = displaySlice.map(img => {
            const isSel = this.rfSelectedBatchFilenames.has(img.filename);
            const imgSrc = (showBoxes && img.has_label_file && img.box_count > 0)
              ? `/api/preview-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}`
              : `/api/image-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}`;

            return `
              <div class="rf-image-card ${isSel ? 'selected' : ''}" data-filename="${img.filename}" style="background:rgba(15,23,42,0.85); border:1px solid ${isSel ? '#7c3aed' : 'rgba(255,255,255,0.08)'}; border-radius:12px; overflow:hidden; cursor:pointer; transition:all 0.18s ease; display:flex; flex-direction:column; position:relative;">
                <div style="position:absolute; top:8px; left:8px; z-index:5;">
                  <input type="checkbox" class="rf-card-checkbox" data-filename="${img.filename}" ${isSel ? 'checked' : ''} style="width:17px; height:17px; accent-color:#7c3aed; cursor:pointer;">
                </div>
                <div style="aspect-ratio:4/3; background:#020617; display:flex; align-items:center; justify-content:center; overflow:hidden; padding:4px;">
                  <img src="${imgSrc}" alt="${img.filename}" loading="lazy" style="max-width:100%; max-height:100%; object-fit:contain; border-radius:6px;" onerror="this.src='/api/image-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}'">
                </div>
                <div style="padding:10px 12px; background:rgba(30,41,59,0.4); border-top:1px solid rgba(255,255,255,0.05); text-align:center;">
                  <div style="font-size:0.8rem; font-weight:600; color:#f1f5f9; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;" title="${img.filename}">
                    ${img.filename}
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
              this.showEditor(this.activeHubProjectId, true, mode, fname);
            });
          });
        }
      }

      this.updateRfFloatingActionBar();

    } catch (e) {
      console.error('Error opening batch review:', e);
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
    const showBoxes = document.getElementById('toggleAnnotationsCheck')?.checked ?? true;

    let images = (this.currentHubImages || []).filter(img => {
      if (query && !img.filename.toLowerCase().includes(query)) return false;
      if (filter === 'labeled' && (!img.has_label_file || img.box_count === 0)) return false;
      if (filter === 'unlabeled' && (img.has_label_file && img.box_count > 0)) return false;
      return true;
    });

    if (images.length === 0) {
      const hasAnyImages = (this.currentHubImages || []).length > 0;
      if (hasAnyImages) {
        grid.innerHTML = `
          <div class="empty-state-card" style="grid-column: 1/-1; text-align: center; padding: 50px 20px; background: rgba(15, 23, 42, 0.4); border: 1px dashed rgba(255,255,255,0.12); border-radius: 16px; margin-top: 20px;">
            <h3 style="font-size: 1.2rem; font-weight: 700; color: #fff; margin-bottom: 8px;">Seçili Filtrede Görsel Bulunamadı</h3>
            <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 480px; margin: 0 auto 20px; line-height: 1.5;">
              Projenizde toplam ${this.currentHubImages.length} görsel var ancak <strong>${filter === 'unlabeled' ? 'Etiketsiz (Boş)' : 'Seçili'}</strong> filtresine uyan ham görsel kalmadı. Tüm görseller etiketlenmiş olabilir! 🎉
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

      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || '';
      const tokenQ = token ? `&token=${encodeURIComponent(token)}` : '';

      const imgSrc = showBoxes && img.has_label_file && img.box_count > 0
        ? `/api/preview-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}&v=${img.box_count}${tokenQ}`
        : `/api/image-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}${tokenQ}`;

      card.innerHTML = `
        <input type="checkbox" class="gallery-select-checkbox" data-file="${img.filename}" ${this.selectedDatasetImageFilenames.has(img.filename) ? 'checked' : ''}>
        <img src="${imgSrc}" loading="lazy" alt="${img.filename}" onerror="this.onerror=null; this.src='/api/image-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}${tokenQ}'">
        <div class="gallery-item-badge">${img.box_count > 0 ? `${img.box_count} Box` : 'Boş'}</div>
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
        } else {
          this.selectedDatasetImageFilenames.delete(img.filename);
          card.classList.remove('selected');
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
          const defaultColors = ["#3b82f6","#10b981","#f59e0b","#ec4899","#8b5cf6","#06b6d4","#f97316"];
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
        await fetch('/api/train/stop', { method: 'POST' });
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
          headers: { 'Content-Type': 'application/json' },
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
              const stRes = await fetch('/api/train/status');
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
    const cat = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'bag_detection_project';
    try {
      const res = await fetch(`/api/system/hardware-recommendation?category=${encodeURIComponent(cat)}`);
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

          if (res.ok && (data.download_url || data.zip_url || data.zip_file)) {
            const downloadUrl = data.download_url || data.zip_url || `/api/download-export?file=${encodeURIComponent(data.zip_file)}`;
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

    // 1. Eğer önbellekte veri varsa ve kullanıcı zorla yenileme istememişse ANINDA göster!
    if (!force && this.cachedQualityData[cat]) {
      this.renderQualityAnalysisData(this.cachedQualityData[cat]);
      return;
    }

    const numEl = document.getElementById('pageQualityScoreNum');
    const titleEl = document.getElementById('pageQualityScoreTitle');
    const descEl = document.getElementById('pageQualityScoreDesc');

    // Sadece ilk açılışta veya zorla yenilemede yükleniyor göster
    if (!this.cachedQualityData[cat]) {
      if (numEl) numEl.textContent = '...';
      if (titleEl) titleEl.textContent = 'Analiz Ediliyor...';
      if (descEl) descEl.textContent = 'Veri setiniz analiz ediliyor, lütfen bekleyiniz.';
    }

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';
      const headers = this.getAuthHeaders ? this.getAuthHeaders() : (token ? { 'Authorization': `Bearer ${token}` } : {});
      const res = await fetch(`/api/projects/quality-stats?category=${encodeURIComponent(cat)}${tokenQuery}`, { headers });
      if (!res.ok) throw new Error('Kalite verisi çekilemedi.');
      const data = await res.json();
      
      // Önbelleğe kaydet
      this.cachedQualityData[cat] = data;
      this.renderQualityAnalysisData(data);
    } catch (err) {
      console.error('Quality analysis load error:', err);
      if (titleEl) titleEl.textContent = 'Analiz Yapılamadı';
      if (descEl) descEl.textContent = 'Veri seti metrikleri çekilirken hata oluştu.';
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
      const res = await fetch(`/api/projects/review-queue?category=${encodeURIComponent(cat)}`);
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

  async runDuplicateScan(force = false) {
    const cat = this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'accessory_detection_project';
    if (!this.cachedDuplicateData) this.cachedDuplicateData = {};

    // Önbellekte varsa ANINDA göster!
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
      const res = await fetch(`/api/projects/scan-duplicates?category=${encodeURIComponent(cat)}`);
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
        riskEl.textContent = 'Çok Düşük (Güvenli)';
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
          <div style="text-align:center; padding:36px 20px;">
            <div style="width:56px; height:56px; border-radius:50%; background:rgba(16,185,129,0.15); color:#34d399; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:1.8rem;">✓</div>
            <strong style="color:#34d399; font-size:1.2rem; display:block; margin-bottom:6px;">0 Mükerrer Görsel Tespit Edildi</strong>
            <p style="color:#94a3b8; font-size:0.9rem; max-width:540px; margin:0 auto; line-height:1.5;">
              Veri setinizdeki taranan tüm <strong>${totalScanned.toLocaleString()}</strong> görsel birbirinden benzersizdir. Modelinizin ezberlemesini (overfitting) tetikleyecek herhangi bir kopya veya aşırı örtüşen görsel bulunamadı.
            </p>
          </div>
        `;
      } else {
        const displayedGroups = data.duplicate_groups.slice(0, 50);
        const remainingCount = data.duplicate_groups.length - displayedGroups.length;

        contentEl.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px; flex-wrap:wrap; gap:12px;">
            <div>
              <strong style="color:#f87171; font-size:1.05rem;">Tespit Edilen Benzer &amp; Kopya Görsel Kümeleri (${data.duplicate_groups.length} Grup)</strong>
              <p style="color:#94a3b8; font-size:0.84rem; margin-top:4px;">Aşağıdaki görseller görsel olarak %90+ oranda birbirine benzemektedir veya birebir kopyadır. Model doğruluğunu artırmak için kopyaları silebilirsiniz.</p>
            </div>
            <div style="display:flex; align-items:center; gap:10px;">
              <button id="deleteAllDuplicatesBtn" class="btn-danger" style="background:#ef4444; color:#fff; border:none; padding:8px 16px; border-radius:8px; font-size:0.82rem; font-weight:700; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(239,68,68,0.35); transition:all 0.2s ease;">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                <span>Tüm Kopyaları Otomatik Temizle (${dupCount} Kopya)</span>
              </button>
              <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.25); border-radius:8px; padding:6px 12px; font-size:0.8rem; color:#fca5a5;">
                Toplam <strong>${dupCount}</strong> adet mükerrer dosya
              </div>
            </div>
          </div>
          <div id="duplicateGroupsContainer" style="display:flex; flex-direction:column; gap:16px;">
            ${displayedGroups.map(g => `
              <div class="duplicate-group-card" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                  <span style="font-size:0.84rem; font-weight:700; color:#cbd5e1;">Orijinal: <span style="color:#38bdf8;">${g.original}</span></span>
                  <span style="font-size:0.75rem; background:rgba(239,68,68,0.15); color:#f87171; padding:3px 8px; border-radius:6px; font-weight:700;">%${g.similarity_pct} Benzerlik (${g.type === 'exact' ? 'Birebir Kopya' : 'Görsel Benzer'})</span>
                </div>
                <div class="duplicate-items-wrap" style="display:flex; gap:14px; flex-wrap:wrap;">
                  <div style="width:140px; background:#000; border-radius:8px; overflow:hidden; border:1px solid rgba(59,130,246,0.5);">
                    <img src="/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(g.original)}" style="width:100%; aspect-ratio:1; object-fit:cover;" loading="lazy">
                    <div style="padding:4px 6px; font-size:0.72rem; color:#60a5fa; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${g.original}">${g.original}</div>
                  </div>
                  ${g.duplicates.map(dup => `
                    <div class="duplicate-single-item" style="width:140px; background:#000; border-radius:8px; overflow:hidden; border:1px solid rgba(239,68,68,0.5); display:flex; flex-direction:column;">
                      <img src="/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(dup)}" style="width:100%; aspect-ratio:1; object-fit:cover;" loading="lazy">
                      <div style="padding:4px 6px; font-size:0.72rem; color:#f87171; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${dup}">${dup}</div>
                      <button class="btn-secondary" style="padding:4px; font-size:0.75rem; color:#ef4444; border:none; background:rgba(239,68,68,0.15); border-radius:0; cursor:pointer;" onclick="window._yoloEditor && window._yoloEditor.deleteDuplicateFile('${cat}', '${dup}', this)">
                        🗑️ Kopyayı Sil
                      </button>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
          ${remainingCount > 0 ? `
            <div style="text-align:center; margin-top:20px;">
              <button id="loadMoreDuplicatesBtn" class="btn-secondary" style="padding:10px 24px; font-size:0.85rem; font-weight:600; border-radius:8px;">
                Daha Fazla Göster (+${Math.min(50, remainingCount)} / Kalan ${remainingCount})
              </button>
            </div>
          ` : ''}
        `;

        // Bulk Delete Event Listener
        document.getElementById('deleteAllDuplicatesBtn')?.addEventListener('click', async () => {
          const allDups = data.duplicate_groups.flatMap(g => g.duplicates);
          if (allDups.length === 0) return;

          const confirmed = await this.showConfirm({
            title: 'Mükerrer Kopyaları Temizle',
            subtitle: 'Toplu Kalıcı Silme',
            message: `Tespit edilen ${allDups.length.toLocaleString()} adet mükerrer kopya görsel ve etiket dosyaları kalıcı olarak silinecektir.\n\nBu işlem geri alınamaz. Devam etmek istiyor musunuz?`,
            confirmText: 'Evet, Tüm Kopyaları Sil',
            cancelText: 'Vazgeç',
            type: 'danger'
          });
          if (!confirmed) return;

          const delBtn = document.getElementById('deleteAllDuplicatesBtn');
          if (delBtn) {
            delBtn.disabled = true;
            delBtn.innerHTML = `<span class="spinner" style="width:14px; height:14px; border-width:2px; display:inline-block; margin-right:6px;"></span> Temizleniyor...`;
          }

          this.showLoading(true, 'Kopya Görseller Temizleniyor...', `${allDups.length} adet mükerrer dosya siliniyor, lütfen bekleyiniz...`);

          try {
            const res = await fetch('/api/projects/delete-duplicates-bulk', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ category: cat, filenames: allDups })
            });
            const resData = await res.json();
            if (res.ok && resData.status === 'ok') {
              this.showToast(`${resData.deleted_count || allDups.length} adet kopya görsel başarıyla silindi!`, 'success');
              
              // Arayüzü 0 kopya durumuna güncelle
              if (countEl) countEl.textContent = '0 Kopya';
              if (totalEl && totalScanned) totalEl.textContent = `${(totalScanned - (resData.deleted_count || allDups.length)).toLocaleString()} Görsel`;
              if (riskEl) {
                riskEl.textContent = 'Çok Düşük (Güvenli)';
                riskEl.style.color = '#34d399';
              }
              contentEl.innerHTML = `
                <div style="text-align:center; padding:36px 20px;">
                  <div style="width:56px; height:56px; border-radius:50%; background:rgba(16,185,129,0.15); color:#34d399; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; font-size:1.8rem;">✓</div>
                  <strong style="color:#34d399; font-size:1.2rem; display:block; margin-bottom:6px;">Tüm Kopyalar Başarıyla Temizlendi!</strong>
                  <p style="color:#94a3b8; font-size:0.9rem; max-width:540px; margin:0 auto; line-height:1.5;">
                    Toplam <strong>${(resData.deleted_count || allDups.length).toLocaleString()}</strong> mükerrer dosya başarıyla silindi. Veri setinizdeki overfitting riski ortadan kaldırıldı.
                  </p>
                </div>
              `;
            } else {
              this.showToast(resData.detail || 'Toplu silme başarısız oldu.', 'error');
              if (delBtn) {
                delBtn.disabled = false;
                delBtn.innerHTML = `<span>Tüm Kopyaları Otomatik Temizle</span>`;
              }
            }
          } catch (e) {
            console.error(e);
            this.showToast('Toplu silme sırasında bir hata oluştu.', 'error');
            if (delBtn) {
              delBtn.disabled = false;
              delBtn.innerHTML = `<span>Tüm Kopyaları Otomatik Temizle</span>`;
            }
          } finally {
            this.showLoading(false);
          }
        });

        if (remainingCount > 0) {
          let currentOffset = 50;
          document.getElementById('loadMoreDuplicatesBtn')?.addEventListener('click', (e) => {
            const nextBatch = data.duplicate_groups.slice(currentOffset, currentOffset + 50);
            currentOffset += nextBatch.length;
            const container = document.getElementById('duplicateGroupsContainer');
            if (container) {
              const html = nextBatch.map(g => `
                <div class="duplicate-group-card" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:16px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:0.84rem; font-weight:700; color:#cbd5e1;">Orijinal: <span style="color:#38bdf8;">${g.original}</span></span>
                    <span style="font-size:0.75rem; background:rgba(239,68,68,0.15); color:#f87171; padding:3px 8px; border-radius:6px; font-weight:700;">%${g.similarity_pct} Benzerlik</span>
                  </div>
                  <div class="duplicate-items-wrap" style="display:flex; gap:14px; flex-wrap:wrap;">
                    <div style="width:140px; background:#000; border-radius:8px; overflow:hidden; border:1px solid rgba(59,130,246,0.5);">
                      <img src="/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(g.original)}" style="width:100%; aspect-ratio:1; object-fit:cover;" loading="lazy">
                      <div style="padding:4px 6px; font-size:0.72rem; color:#60a5fa; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${g.original}</div>
                    </div>
                    ${g.duplicates.map(dup => `
                      <div class="duplicate-single-item" style="width:140px; background:#000; border-radius:8px; overflow:hidden; border:1px solid rgba(239,68,68,0.5); display:flex; flex-direction:column;">
                        <img src="/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(dup)}" style="width:100%; aspect-ratio:1; object-fit:cover;" loading="lazy">
                        <div style="padding:4px 6px; font-size:0.72rem; color:#f87171; text-align:center; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${dup}</div>
                        <button class="btn-secondary" style="padding:4px; font-size:0.75rem; color:#ef4444; border:none; background:rgba(239,68,68,0.15); border-radius:0; cursor:pointer;" onclick="window._yoloEditor && window._yoloEditor.deleteDuplicateFile('${cat}', '${dup}', this)">
                          🗑️ Kopyayı Sil
                        </button>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `).join('');
              container.insertAdjacentHTML('beforeend', html);
            }
            if (currentOffset >= data.duplicate_groups.length) {
              e.target.style.display = 'none';
            } else {
              e.target.textContent = `Daha Fazla Göster (+${Math.min(50, data.duplicate_groups.length - currentOffset)} / Kalan ${data.duplicate_groups.length - currentOffset})`;
            }
          });
        }
      }
  }

  async deleteDuplicateFile(cat, filename, btnEl) {
    const confirmed = await this.showConfirm({
      title: 'Kopya Görseli Sil',
      subtitle: 'Tekli Silme',
      message: `"${filename}" kopyasını kalıcı olarak silmek istediğinize emin misiniz?`,
      confirmText: 'Kopyayı Sil',
      cancelText: 'Vazgeç',
      type: 'danger'
    });
    if (!confirmed) return;
    
    btnEl.disabled = true;
    const oldText = btnEl.innerHTML;
    btnEl.innerHTML = 'Siliniyor...';

    try {
      const res = await fetch('/api/delete-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: cat, filename: filename })
      });
      if (res.ok) {
        this.showToast(`"${filename}" başarıyla silindi.`, 'success');
        const itemCard = btnEl.closest('.duplicate-single-item');
        const groupCard = btnEl.closest('.duplicate-group-card');
        
        if (itemCard) {
          itemCard.style.transition = 'all 0.2s ease';
          itemCard.style.opacity = '0';
          itemCard.style.transform = 'scale(0.8)';
          setTimeout(() => {
            itemCard.remove();
            // Eğer grupta başka kopya kalmadıysa grubu da kaldır
            if (groupCard && groupCard.querySelectorAll('.duplicate-single-item').length === 0) {
              groupCard.remove();
            }
          }, 200);
        }

        // Sayaçları güncelle
        const countEl = document.getElementById('dupCountBadge');
        if (countEl) {
          const current = parseInt(countEl.textContent.replace(/\D/g, ''), 10) || 0;
          if (current > 1) {
            countEl.textContent = `${(current - 1).toLocaleString()} Kopya`;
          } else {
            countEl.textContent = '0 Kopya';
          }
        }
      } else {
        btnEl.disabled = false;
        btnEl.innerHTML = oldText;
        this.showToast('Dosya silinemedi.', 'error');
      }
    } catch (err) {
      console.error(err);
      btnEl.disabled = false;
      btnEl.innerHTML = oldText;
      this.showToast('Silme işlemi sırasında hata oluştu.', 'error');
    }
  }

  async showEditor(categoryId, pushHistory = true, initialFilter = null, targetFilename = null, batchFilenamesFilter = null, batchId = null, batchName = null) {
    this.currentView = 'editor';
    if (pushHistory) {
      this.navigateTo('editor', { projectId: categoryId });
    }
    this.hideAllViews();
    if (this.editorView) this.editorView.style.display = 'flex';

    if (this.isLeftCollapsed) this.mainLayout?.classList.add('left-collapsed');
    if (this.isRightCollapsed) this.mainLayout?.classList.add('right-collapsed');

    this.currentBatchFilenamesFilter = batchFilenamesFilter || null;
    this.activeBatchId = batchId || null;
    this.activeBatchName = batchName || (batchId ? 'Yığın / Job' : 'Tüm Proje');

    if (initialFilter) {
      if (this.filterSelect) this.filterSelect.value = initialFilter;
      this.currentFilter = initialFilter;
    }

    await this.loadCategories(categoryId);
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
    if (addToDatasetBtn) {
      addToDatasetBtn.style.display = this.activeBatchId ? 'inline-flex' : 'none';
    }

    if (targetFilename && this.filteredImages) {
      const idx = this.filteredImages.findIndex(i => i.filename === targetFilename);
      if (idx !== -1) {
        this.goToIndex(idx);
      }
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
      const res = await fetch('/api/projects', { headers });
      const data = await res.json();
      this.projects = data.projects || [];
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

      // Rol ve karşılama alanını sadeleştir
      const roleBadgeEl = document.getElementById('dashUserRoleBadge');
      if (roleBadgeEl) roleBadgeEl.style.display = 'none';

      const hasProjects = (this.projects && this.projects.length > 0);
      const quickStats = document.getElementById('dashQuickStatsRow');
      if (quickStats) quickStats.style.display = hasProjects ? 'flex' : 'none';
      const dashToolbar = document.querySelector('.dash-toolbar');
      if (dashToolbar) dashToolbar.style.display = hasProjects ? 'flex' : 'none';

      const totProjStat = document.getElementById('dashStatTotalProjects');
      if (totProjStat) totProjStat.textContent = this.projects.length;
      const totImgStat = document.getElementById('dashStatTotalImages');
      if (totImgStat) totImgStat.textContent = totalImages.toLocaleString('tr-TR');
      const globPctStat = document.getElementById('dashStatGlobalPct');
      if (globPctStat) globPctStat.textContent = `%${globalPct}`;

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

    let list = this.projects.filter(p => {
      if (!query) return true;
      return p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query);
    });

    list.sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'images_desc') return b.image_count - a.image_count;
      if (sortBy === 'percent_desc') return b.percent - a.percent;
      if (sortBy === 'percent_asc') return a.percent - b.percent;
      return 0;
    });

    // Çalışma alanında hiç proje yoksa 3 kartlı başlangıç sun
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
        </div>
      `;
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

      const licBadge = proj.license
        ? `<span class="proj-meta-badge badge-license">${proj.license}</span>`
        : '';

      card.innerHTML = `
        <div class="project-card-cover">
          ${coverHtml}
          <div class="project-pct-badge">%${proj.percent} Etiketli</div>
        </div>
        <div class="project-card-body">
          <div class="project-title-row">
            <h3 class="project-card-title">${proj.name}</h3>
          </div>
          <div class="proj-meta-badges-row">${visBadge}${typeBadge}${licBadge}</div>
          <p class="project-card-desc">${proj.description || `${proj.name} nesne tespit seti`}</p>

          <div class="project-progress-block">
            <div class="project-progress-meta">
              <span>Etiket Durumu</span>
              <strong>${proj.label_count} / ${proj.image_count}</strong>
            </div>
            <div class="project-progress-track">
              <div class="project-progress-fill" style="width: ${proj.percent}%;"></div>
            </div>
          </div>

          <div class="project-classes-row">
            ${classesHtml}
          </div>

          <div class="project-card-actions">
            <button class="btn-card-open" data-action="open" data-id="${proj.id}">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
              <span>Editörde Aç</span>
            </button>
            <button class="btn-card-tool" data-action="batch" data-id="${proj.id}" title="Toplu Otomatik AI Etiketle">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg>
            </button>
            <button class="btn-card-tool" data-action="config" data-id="${proj.id}" title="Sınıf & Prompt Ayarları">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
            </button>
            <button class="btn-card-tool btn-card-del" data-action="delete" data-id="${proj.id}" title="Projeyi Sil">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;


      card.querySelector('[data-action="open"]')?.addEventListener('click', (e) => { e.stopPropagation(); this.showProjectHub(proj.id, 'upload'); });
      card.querySelector('.project-card-cover')?.addEventListener('click', (e) => { e.stopPropagation(); this.showProjectHub(proj.id, 'dataset'); });
      card.querySelector('.project-card-title')?.addEventListener('click', (e) => { e.stopPropagation(); this.showProjectHub(proj.id, 'dataset'); });
      card.querySelector('[data-action="batch"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openBatchModal(proj.id);
      });
      card.querySelector('[data-action="config"]')?.addEventListener('click', (e) => { e.stopPropagation(); this.showProjectHub(proj.id, 'settings'); });
      card.querySelector('[data-action="delete"]')?.addEventListener('click', (e) => { e.stopPropagation(); this.deleteProject(proj.id); });

      const classesRow = card.querySelector('.project-classes-row');
      classesRow?.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
          e.preventDefault();
          classesRow.scrollLeft += e.deltaY;
        }
      }, { passive: false });

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

    // Full Create Project - Add Class
    document.getElementById('fullAddClassBtn')?.addEventListener('click', () => {
      const cList = document.getElementById('fullClassesListContainer');
      if (!cList) return;
      const count = cList.querySelectorAll('.cls-row-pill').length;
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#ef4444'];
      const color = colors[count % colors.length];

      // Check current project type to decide if prompts column shows
      const selectedType = document.querySelector('.project-types-grid .type-card.selected')?.dataset.type || 'detection';

      const row = document.createElement('div');
      row.className = 'cls-row-pill';
      row.dataset.idx = count;
      row.innerHTML = `
        <input type="text" class="cls-name-input" placeholder="Sınıf adı (ör: Class_${count})">
        <input type="color" class="cls-color-input" value="${color}" title="Sınıf Rengi">
        <input type="text" class="cls-prompts-input" placeholder="AI arama promptları (virgülle ayırın)" style="flex:2;${selectedType === 'classification' ? 'display:none;' : ''}">
        <button type="button" class="cls-del-btn" title="Sil">✕</button>
      `;
      row.querySelector('.cls-del-btn')?.addEventListener('click', () => row.remove());
      cList.appendChild(row);
      row.querySelector('.cls-name-input')?.focus();
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
      const selectedTypeCard = document.querySelector('.project-types-grid .type-card.selected');
      const projectType = selectedTypeCard?.dataset.type || 'detection';

      const cRows = document.querySelectorAll('#fullClassesListContainer .cls-row-pill');
      const classes = [];
      cRows.forEach((r, idx) => {
        const cName = r.querySelector('.cls-name-input')?.value.trim() || `Class_${idx}`;
        const cColor = r.querySelector('.cls-color-input')?.value || '#3b82f6';
        const pRaw = r.querySelector('.cls-prompts-input')?.value.trim() || cName.toLowerCase();
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

    // Hub Tab: Upload Files & Folder Handlers
    const hubFileInput = document.getElementById('hubFileInput');
    const hubFolderInput = document.getElementById('hubFolderInput');
    const hubPickFilesBtn = document.getElementById('hubPickFilesBtn');
    const hubPickFolderBtn = document.getElementById('hubPickFolderBtn');
    const hubLargeDropzone = document.getElementById('hubLargeDropzone');
    const hubStagedSummaryRow = document.getElementById('hubStagedSummaryRow');
    const hubStagedCountText = document.getElementById('hubStagedCountText');
    const hubConfirmUploadBtn = document.getElementById('hubConfirmUploadBtn');

    hubPickFilesBtn?.addEventListener('click', () => hubFileInput?.click());
    hubPickFolderBtn?.addEventListener('click', () => hubFolderInput?.click());

    const updateStagedUploadFiles = (files) => {
      this.stagedUploadFiles = Array.from(files || []).filter(f => {
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.txt'].includes(ext);
      });

      if (hubStagedSummaryRow && hubStagedCountText) {
        if (this.stagedUploadFiles.length > 0) {
          hubStagedSummaryRow.style.display = 'flex';
          const imgs = this.stagedUploadFiles.filter(f => !f.name.toLowerCase().endsWith('.txt')).length;
          const lbls = this.stagedUploadFiles.filter(f => f.name.toLowerCase().endsWith('.txt')).length;
          hubStagedCountText.textContent = `✓ ${imgs} görsel ve ${lbls} etiket dosyası yüklenecek`;
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

    const convertFileToWebp = async (file, maxDimension = 1920, quality = 0.88) => {
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
    };

    const batchConvertFilesToWebp = async (files, progressCb) => {
      if (!Array.isArray(files) || files.length === 0) return files;
      const CONCURRENCY = 6;
      const converted = new Array(files.length);
      let completed = 0;
      const queue = files.map((f, i) => ({ file: f, index: i }));

      const worker = async () => {
        while (queue.length > 0) {
          const item = queue.shift();
          if (!item) break;
          converted[item.index] = await convertFileToWebp(item.file);
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
    };

    if (hubConfirmUploadBtn && !hubConfirmUploadBtn._uploadWired) {
      hubConfirmUploadBtn._uploadWired = true;
      hubConfirmUploadBtn.addEventListener('click', async () => {
      if (!this.stagedUploadFiles || this.stagedUploadFiles.length === 0) {
        this.showToast('Lütfen önce dosya seçiniz.', 'warning');
        return;
      }
      if (!this.activeHubProjectId) return;

      const totalFiles = this.stagedUploadFiles.length;
      const splitOpt = document.getElementById('uploadAutoBatchSplitSelect')?.value || '500';
      const splitSize = splitOpt === 'none' ? 1000 : parseInt(splitOpt, 10);
      const CHUNK_SIZE = Math.min(1000, splitSize);
      const convertToWebp = (document.getElementById('uploadWebpConvertSelect')?.value || 'auto') === 'auto';
      const totalChunks = Math.ceil(totalFiles / CHUNK_SIZE);
      const bName = document.getElementById('uploadBatchNameInput')?.value.trim() || '';
      const bTags = document.getElementById('uploadTagsInput')?.value.trim() || '';
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';

      this.showLoading(true, {
        title: convertToWebp ? 'Görseller WebP ile Optimize Ediliyor...' : 'Görseller Yükleniyor ve Doğrulanıyor...',
        text: convertToWebp ? 'Donanım hızlandırmalı WebP sıkıştırması başlatılıyor (%85 boyut tasarrufu)...' : 'Lütfen bekleyiniz, dosyalar aktarılıyor.',
        status: 'Yükleme başlatılıyor',
        progress: {
          pct: 0,
          current: 0,
          total: totalFiles
        }
      });

      let uploadedFilesCount = 0;
      let totalBytesUploaded = 0;
      // Eğer WebP dönüştürme aktifse tahmini sıkıştırılmış boyutu baz al (ortalama %85 tasarruf)
      const rawBytes = this.stagedUploadFiles.reduce((acc, f) => acc + (f.size || 0), 0) || 1;
      let totalBytesAll = convertToWebp ? Math.round(rawBytes * 0.15) : rawBytes;

      try {
        for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
          let chunkFiles = this.stagedUploadFiles.slice(chunkIdx * CHUNK_SIZE, (chunkIdx + 1) * CHUNK_SIZE);

          if (convertToWebp) {
            this.showLoading(true, {
              title: `Görseller WebP Formatına Sıkıştırılıyor (${chunkIdx + 1}/${totalChunks})...`,
              text: 'Donanım hızlandırmalı WebP optimizasyonu uygulanıyor (%85 boyut tasarrufu)...',
              status: 'Hızlı WebP dönüştürme',
              progress: { pct: Math.round((chunkIdx / totalChunks) * 100), current: uploadedFilesCount, total: totalFiles }
            });
            chunkFiles = await batchConvertFilesToWebp(chunkFiles, (done, count) => {
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

                const overallPct = Math.min(99, Math.round((uploadedFilesCount + Math.round((e.loaded / e.total) * chunkFiles.length)) / totalFiles * 100));
                const loadedMB = (totalBytesUploaded / (1024 * 1024)).toFixed(1);
                const totalMB = (Math.max(totalBytesUploaded, totalBytesAll) / (1024 * 1024)).toFixed(1);
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
            xhr.onerror = () => reject(new Error('Ağ hatası oluştu.'));
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

        setTimeout(() => {
          this.showLoading(false);
          this.stagedUploadFiles = [];
          const hubStagedSummaryRow = document.getElementById('hubStagedSummaryRow');
          if (hubStagedSummaryRow) hubStagedSummaryRow.style.display = 'none';
          // Refresh all project hub data so new images appear immediately
          this.fetchProjectHubData(this.activeHubProjectId).then(() => {
            this.renderDatasetGallery?.();
            this.renderAnnotateKanban?.();
          });
          this.switchProjectTab('annotate');
        }, 900);

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
        const res = await fetch('/api/project-settings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: this.activeHubProjectId,
            display_name: dName,
            description: dDesc,
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
          this.showToast('Kaydedilemedi.', 'error');
        }
      } catch (err) {
        console.error(err);
        this.showToast('Bağlantı hatası.', 'error');
      } finally {
        this.showLoading(false);
      }
    });

    document.getElementById('hubDeleteProjectBtn')?.addEventListener('click', async () => {
      if (!this.activeHubProjectId) return;
      await this.deleteProject(this.activeHubProjectId);
      this.showDashboard();
    });

    // Wire Training & Export Studio Events
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

    document.getElementById('scanDuplicatesBtn')?.addEventListener('click', () => {
      this.runDuplicateScan();
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

    // Back to Dashboard button in editor header
    this.backToDashBtn?.addEventListener('click', () => {
      this.closeProjectToWorkspace();
    });


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
        const cStep = document.getElementById('batchConfigStep');
        const pStep = document.getElementById('batchProgressStep');
        if (cStep) cStep.style.display = 'none';
        if (pStep) pStep.style.display = 'flex';
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

    let imgCount = 0;
    if (batchFiles && Array.isArray(batchFiles)) {
      imgCount = batchFiles.length;
    } else {
      const proj = this.projects?.find(p => p.id === finalCatId);
      imgCount = proj ? (proj.image_count || 0) : 0;
    }

    const cStep = document.getElementById('batchConfigStep');
    const pStep = document.getElementById('batchProgressStep');
    const descEl = document.getElementById('batchConfigTargetDesc');
    const m = document.getElementById('batchAutoLabelModal');

    // Check if job is currently running on backend
    let isRunning = false;
    try {
      const chk = await fetch(`/api/projects/batch-status?category=${encodeURIComponent(finalCatId)}`);
      if (chk.ok) {
        const cData = await chk.json();
        if (cData && cData.status === 'running') {
          isRunning = true;
        }
      }
    } catch (e) {}

    if (m) {
      m.style.display = 'flex';
      m.classList.add('active');
      m.style.opacity = '1';
      m.style.pointerEvents = 'auto';
    }

    // Only show live progress step if there is an ACTUALLY RUNNING background job!
    // If no job is running, ALWAYS show the Model Selection & Configuration Step!
    if (isRunning) {
      if (cStep) cStep.style.display = 'none';
      if (pStep) pStep.style.display = 'flex';
      this.pollBatchStatus();
    } else {
      if (cStep) cStep.style.display = 'flex';
      if (pStep) pStep.style.display = 'none';
      this.loadModelHub();
      if (descEl) {
        descEl.textContent = batchName
          ? `"${batchName}" yığınındaki görseller seçilen model ve ayarlarla otomatik etiketlenecektir.`
          : `"${finalCatId}" projesindeki görseller seçilen model ve ayarlarla otomatik etiketlenecektir.`;
      }
    }
  }

  async startBatchAutoLabel() {
    if (!this.activeModalCategory) return;
    
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
        headers: { 'Content-Type': 'application/json' },
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
      if (data.status === 'started' || data.status === 'already_running') {
        this.pollBatchStatus();
      } else {
        this.showToast(data.message || 'İşlem başlatıldı', 'info');
        this.pollBatchStatus();
      }
    } catch (e) {
      this.showToast('Toplu etiketleme başlatılamadı', 'error');
    }
  }

  pollBatchStatus() {
    if (this.batchPollTimer) clearInterval(this.batchPollTimer);
    this.batchPollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/batch-status?category=${this.activeModalCategory}`);
        const data = await res.json();

        const fw = document.getElementById('batchFloatingWidget');
        const fwTitle = document.getElementById('floatWidgetTitle');
        const fwPct = document.getElementById('floatWidgetPct');
        const fwSub = document.getElementById('floatWidgetSub');

        if (data.status === 'running') {
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
            pCount.textContent = total > 0 ? `${current.toLocaleString()} / ${total.toLocaleString()} Resim İşlendi` : 'Taranıyor ve hazırlanıyor...';
          }
          if (pRemaining) pRemaining.textContent = `Kalan: ${remaining.toLocaleString()} resim`;
          if (pNew) pNew.textContent = `+${newly.toLocaleString()} yeni etiketlendi`;
          if (pTitle) pTitle.textContent = 'Yapay zeka nesneleri tespit ediyor...';
          if (pSub) pSub.textContent = 'Lütfen bekleyiniz.';
          if (pDetail) pDetail.textContent = data.eta_str ? `Kalan Süre: ~${data.eta_str} • İşlem devam ediyor` : 'İşlem devam ediyor';

          // Update floating widget
          if (fwTitle) fwTitle.textContent = `${this.activeModalCategory}`;
          if (fwPct) fwPct.textContent = `%${pct}`;
          if (fwSub) fwSub.textContent = data.eta_str ? `Kalan: ~${data.eta_str} (${current}/${total})` : `${current}/${total} işlendi`;

        } else if (data.status === 'completed') {
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

        } else if (data.status === 'stopped') {
          const pTitle = document.getElementById('batchStatusTitle');
          const pSub = document.getElementById('batchStatusSub');
          const pDetail = document.getElementById('batchStatusDetail');

          if (pTitle) pTitle.textContent = 'İşlem Durduruldu';
          if (pSub) pSub.textContent = 'Etiketleme kullanıcı tarafından duraklatıldı.';
          if (pDetail) pDetail.textContent = 'Durduruldu';

          if (fw) fw.style.display = 'none';
          clearInterval(this.batchPollTimer);
        }
      } catch (e) {
      }
    }, 1500);
  }

  async stopBatchAutoLabel() {
    if (!this.activeModalCategory) return;
    try {
      await fetch(`/api/projects/batch-stop?category=${this.activeModalCategory}`, { method: 'POST' });
      this.showToast('Etiketleme durduruldu.', 'info');
      if (this.batchPollTimer) clearInterval(this.batchPollTimer);
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
      const res = await fetch(`/api/projects/batch-status?category=${encodeURIComponent(cat)}`);
      const data = await res.json();
      if (data && data.status === 'running') {
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
            }
          };
        }
        if (fwTitle) fwTitle.textContent = `${cat}`;
        if (fwPct) fwPct.textContent = `%${pct}`;
        if (fwSub) fwSub.textContent = data.eta_str ? `Kalan: ~${data.eta_str} (${current}/${total})` : `${current}/${total} işlendi`;

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
          link.href = data.download_url;
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
    // Back to Dashboard / Projects Navigation
    const handleBackToDash = () => {
      if (this.currentCategory) {
        this.openProject(this.currentCategory, 'dataset');
      } else {
        this.showAppShell('projects');
      }
    };
    document.getElementById('backToDashBtn')?.addEventListener('click', handleBackToDash);

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
    if (this.refreshStatsBtn) this.refreshStatsBtn.addEventListener('click', () => this.loadStats());

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

    // Add To Dataset (Approve Job) Button
    document.getElementById('editorAddToDatasetBtn')?.addEventListener('click', async () => {
      if (!this.activeBatchId) return;
      const confirmed = await this.showConfirm({
        title: 'Veri Setine Ekle (Onayla)',
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
          headers: { 'Content-Type': 'application/json' },
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

  // --- Categories & Images Loading ---

  async loadCategories(preferredCategory = null) {
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch('/api/categories', { headers });
      const data = await res.json();
      this.categories = data.categories || [];
      this.classes = data.classes || {};

      if (this.categorySelect) {
        this.categorySelect.innerHTML = '';
        this.categories.forEach(cat => {
          const opt = document.createElement('option');
          opt.value = cat.id;
          opt.textContent = `${cat.name} (${cat.image_count} resim)`;
          this.categorySelect.appendChild(opt);
        });
      }

      if (this.categories.length > 0) {
        let initialCat = this.categories[0].id;
        if (preferredCategory && this.categories.some(c => c.id === preferredCategory)) {
          initialCat = preferredCategory;
        } else {
          const saved = localStorage.getItem('yolo_last_category');
          if (saved && this.categories.some(c => c.id === saved)) {
            initialCat = saved;
          }
        }
        if (this.categorySelect) this.categorySelect.value = initialCat;
        this.currentCategory = initialCat;
        this.updateActiveClassOptions();
        await this.loadCategoryImages();
      }
    } catch (err) {
      this.showToast('Kategoriler yüklenemedi', 'error');
      console.error(err);
    }
  }

  getProjectClasses(category = null) {
    const catKey = (category || this.currentCategory || '').toLowerCase();
    const raw = this.classes[catKey];
    if (Array.isArray(raw) && raw.length > 0) {
      return raw;
    } else if (raw && typeof raw === 'object' && typeof raw.id === 'number') {
      return [raw];
    }
    return [{ id: 0, name: (category || this.currentCategory || 'Sınıf 0'), color: '#3b82f6', prompts: [catKey] }];
  }

  updateActiveClassOptions() {
    if (!this.activeClassSelect) return;
    this.activeClassSelect.innerHTML = '';
    const projClasses = this.getProjectClasses();

    projClasses.forEach(cls => {
      const opt = document.createElement('option');
      opt.value = cls.id;
      opt.textContent = `${cls.id}: ${cls.name}`;
      this.activeClassSelect.appendChild(opt);
    });

    if (this.activeClassSelect.options.length > 0) {
      if (!projClasses.some(c => c.id === this.activeClassId)) {
        this.activeClassId = projClasses[0].id;
      }
      this.activeClassSelect.value = this.activeClassId;
    }

    // Also update bulk class select in right sidebar
    const bulkSelect = document.getElementById('bulkClassSelect');
    if (bulkSelect) {
      bulkSelect.innerHTML = '';
      projClasses.forEach(cls => {
        const opt = document.createElement('option');
        opt.value = cls.id;
        opt.textContent = `${cls.id}: ${cls.name}`;
        bulkSelect.appendChild(opt);
      });
    }
  }

  async loadCategoryImages() {
    if (!this.currentCategory) return;
    this.showLoading(true, 'Görseller taranıyor...');

    // Always ensure class options match the active category
    this.updateActiveClassOptions();

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      const res = await fetch(`/api/images?category=${encodeURIComponent(this.currentCategory)}`, { headers });
      const data = await res.json();
      this.images = data.images || [];

      const projClasses = this.getProjectClasses();
      if (projClasses.length > 0 && !projClasses.some(c => c.id === this.activeClassId)) {
        this.activeClassId = projClasses[0].id;
        this.activeClassSelect.value = this.activeClassId;
      }

      this.categoryStatsBadge.textContent = `${data.labeled_count}/${data.total_images} etiketli`;
      this.applyFilter();
    } catch (err) {
      this.showToast('Resim listesi yüklenemedi', 'error');
      console.error(err);
      this.showLoading(false);
    }
  }

  applyFilter() {
    const filterType = this.filterSelect?.value || this.currentFilter || 'all';
    const query = this.imageSearchInput.value.trim().toLowerCase();

    let baseImages = this.images;
    if (this.currentBatchFilenamesFilter && Array.isArray(this.currentBatchFilenamesFilter)) {
      const bSet = new Set(this.currentBatchFilenamesFilter);
      baseImages = baseImages.filter(img => bSet.has(img.filename));
    }

    this.filteredImages = baseImages.filter(img => {
      const isLabeled = img.has_label_file && img.box_count > 0;
      if ((filterType === 'labeled' || filterType === 'annotated') && !isLabeled) return false;
      if ((filterType === 'empty' || filterType === 'unlabeled') && isLabeled) return false;
      if (filterType === 'flagged' && !this.flaggedImages.has(img.filename)) return false;
      if (query && !img.filename.toLowerCase().includes(query)) return false;
      return true;
    });

    this.totalImagesCount.textContent = this.filteredImages.length;
    this.renderImageList();

    if (this.filteredImages.length > 0) {
      let targetIndex = 0;
      const savedFile = localStorage.getItem(`yolo_last_file_${this.currentCategory}`);
      const savedIdx = parseInt(localStorage.getItem(`yolo_last_index_${this.currentCategory}`));

      if (savedFile) {
        const foundIdx = this.filteredImages.findIndex(img => img.filename === savedFile);
        if (foundIdx !== -1) targetIndex = foundIdx;
      } else if (!isNaN(savedIdx) && savedIdx >= 0 && savedIdx < this.filteredImages.length) {
        targetIndex = savedIdx;
      }

      this.goToIndex(targetIndex);
    } else {
      this.currentImage = null;
      this.boxes = [];
      this.clearCanvas();
      this.updateMetaDisplay();
      this.updateBoxesList();
      this.updateProgressBar();
      this.showLoading(false);
    }
  }

  renderImageList() {
    const ITEM_H = 40;
    const BUFFER = 12;
    const container = this.imageListContainer;
    const total = this.filteredImages.length;

    if (this._listScrollHandler) {
      container.removeEventListener('scroll', this._listScrollHandler);
    }

    const renderVisible = () => {
      const scrollTop = container.scrollTop;
      const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_H) - BUFFER);
      const visible = Math.ceil(container.clientHeight / ITEM_H);
      const endIdx = Math.min(total - 1, startIdx + visible + BUFFER * 2);

      container.innerHTML = '';
      if (total === 0) return;

      if (startIdx > 0) {
        const top = document.createElement('div');
        top.style.height = `${startIdx * ITEM_H}px`;
        top.style.flexShrink = '0';
        container.appendChild(top);
      }

      for (let idx = startIdx; idx <= endIdx; idx++) {
        container.appendChild(this._createListItem(idx));
      }

      const remaining = total - endIdx - 1;
      if (remaining > 0) {
        const bot = document.createElement('div');
        bot.style.height = `${remaining * ITEM_H}px`;
        bot.style.flexShrink = '0';
        container.appendChild(bot);
      }
    };

    this._listScrollHandler = () => renderVisible();
    container.addEventListener('scroll', this._listScrollHandler);
    renderVisible();
  }

  _createListItem(idx) {
    const img = this.filteredImages[idx];
    const item = document.createElement('div');
    item.className = `image-list-item ${idx === this.currentIndex ? 'active' : ''}`;
    item.id = `img-item-${idx}`;

    const hasBoxes = img.box_count > 0;
    const isFlagged = this.flaggedImages.has(img.filename);
    const flagBadge = isFlagged ? '<span class="item-flag-badge" title="İşaretlenmiş Görsel"><svg width="12" height="12" viewBox="0 0 24 24" fill="#f59e0b" stroke="currentColor" stroke-width="1.5"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg></span>' : '';

    item.innerHTML = `
      <div class="item-left">
        <span class="item-status-dot ${hasBoxes ? 'has-box' : 'no-box'}" title="${hasBoxes ? `${img.box_count} kutu var` : 'Kutu yok'}"></span>
        <span title="${img.filename}">${img.filename}</span>
        ${flagBadge}
      </div>
      <span class="item-box-count">${img.box_count}</span>
      <button class="btn-img-item-del" title="Bu görseli ve etiketini sil">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
      </button>
    `;

    const delBtn = item.querySelector('.btn-img-item-del');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteImage(img.filename, idx);
      });
    }

    item.addEventListener('click', () => {
      if (idx !== this.currentIndex) {
        this.goToIndex(idx);
      }
    });

    return item;
  }

  _scrollListToActive() {
    const ITEM_H = 40;
    const container = this.imageListContainer;
    const targetScroll = this.currentIndex * ITEM_H - container.clientHeight / 2 + ITEM_H / 2;
    container.scrollTop = Math.max(0, targetScroll);
    container.dispatchEvent(new Event('scroll'));
  }

  navigatePrev() {
    if (this.isAiProcessing) return;
    if (this.currentIndex > 0) {
      this.goToIndex(this.currentIndex - 1);
    }
  }

  navigateNext() {
    if (this.isAiProcessing) return;
    if (this.currentIndex < this.filteredImages.length - 1) {
      this.goToIndex(this.currentIndex + 1);
    }
  }

  async goToIndex(idx) {
    if (this.isAiProcessing || this.isMouseDown || this.dragAction !== null) return;
    if (idx < 0 || idx >= this.filteredImages.length) return;

    if (this.skipEmpty) {
      const target = this.filteredImages[idx];
      if (target && target.box_count === 0) {
        const direction = idx > this.currentIndex ? 1 : -1;
        const nextIdx = idx + direction;
        if (nextIdx >= 0 && nextIdx < this.filteredImages.length) {
          return this.goToIndex(nextIdx);
        }
        return;
      }
    }

    if (this.isDirty && this.autoSave) {
      await this.saveCurrentLabel(false);
    }

    this.prevImageBoxes = JSON.parse(JSON.stringify(this.boxes));
    this.currentIndex = idx;
    this.currentImage = this.filteredImages[idx];
    this.imageIndexInput.value = idx + 1;

    if (this.currentCategory && this.currentImage) {
      localStorage.setItem('yolo_last_category', this.currentCategory);
      localStorage.setItem(`yolo_last_index_${this.currentCategory}`, idx);
      localStorage.setItem(`yolo_last_file_${this.currentCategory}`, this.currentImage.filename);
    }

    this._scrollListToActive();
    await this.loadImageAndLabels();
  }

  async loadImageAndLabels() {
    if (!this.currentImage) return;
    this.showLoading(true);

    try {
      const labelRes = await fetch(`/api/label-data?category=${encodeURIComponent(this.currentCategory)}&filename=${encodeURIComponent(this.currentImage.filename)}`);
      const labelData = await labelRes.json();
      this.boxes = JSON.parse(JSON.stringify(labelData.boxes || []));
      this.savedBoxesSnapshot = JSON.parse(JSON.stringify(this.boxes));
      this.undoStack = [];
      this.redoStack = [];
      this.updateHistoryButtons();
      this.selectedBoxIndices.clear();
      this.setDirty(false);

      if (this.flagBtn) {
        this.flagBtn.classList.toggle('active', this.flaggedImages.has(this.currentImage.filename));
      }

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `/api/image-file?category=${encodeURIComponent(this.currentCategory)}&filename=${encodeURIComponent(this.currentImage.filename)}`;

      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
      });

      this.imageObj = img;
      this.updateMetaDisplay();
      this.fitToViewport();
      this.render();
      this.updateBoxesList();
      this.updateProgressBar();
      this.showLoading(false);
    } catch (err) {
      this.showToast('Resim veya etiket yüklenirken hata oluştu', 'error');
      console.error(err);
      this.showLoading(false);
    }
  }

  async saveCurrentLabel(showFeedback = true, isApproval = false) {
    if (!this.currentCategory || !this.currentImage) return;

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/save-label', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          category: this.currentCategory,
          image_filename: this.currentImage.filename,
          boxes: this.boxes,
          annotations: this.boxes,
          update_preview: true,
          is_approved: isApproval
        })
      });

      const data = await res.json();
      if (data.status === 'ok') {
        this.savedBoxesSnapshot = JSON.parse(JSON.stringify(this.boxes));
        this.setDirty(false);

        this.currentImage.box_count = this.boxes.length;
        this.currentImage.has_label_file = true;
        if (isApproval) {
          this.currentImage.is_approved = true;
        }

        const activeEl = document.getElementById(`img-item-${this.currentIndex}`);
        if (activeEl) {
          const countEl = activeEl.querySelector('.item-box-count');
          const dotEl = activeEl.querySelector('.item-status-dot');
          if (countEl) countEl.textContent = this.boxes.length;
          if (dotEl) {
            dotEl.className = `item-status-dot ${this.boxes.length > 0 ? 'has-box' : 'no-box'}`;
          }
        }

        this.updateProgressBar();

        if (showFeedback) {
          this.showToast(isApproval ? 'Görsel Onaylandı ve Veri Setine Eklendi! ✓' : `Kaydedildi (${this.boxes.length} kutu)`, 'success');
        }

        if (isApproval) {
          this.handleApprovedImageAdvance();
        }
      }
    } catch (err) {
      this.showToast('Kayıt sırasında hata oluştu', 'error');
      console.error(err);
    }
  }

  handleApprovedImageAdvance() {
    const removedFilename = this.currentImage?.filename;
    if (removedFilename) {
      const idx = this.filteredImages.findIndex(i => i.filename === removedFilename);
      if (idx !== -1) {
        this.filteredImages.splice(idx, 1);
      }
      if (this.currentBatchFilenamesFilter && Array.isArray(this.currentBatchFilenamesFilter)) {
        const bIdx = this.currentBatchFilenamesFilter.indexOf(removedFilename);
        if (bIdx !== -1) {
          this.currentBatchFilenamesFilter.splice(bIdx, 1);
        }
      }
      const globalImg = this.images.find(i => i.filename === removedFilename);
      if (globalImg) {
        globalImg.is_approved = true;
        globalImg.box_count = this.boxes ? this.boxes.length : 0;
        globalImg.has_label_file = (globalImg.box_count > 0);
      }
    }

    if (this.totalImagesCount) {
      this.totalImagesCount.textContent = this.filteredImages.length;
    }
    const jobCountEl = document.getElementById('editorJobCountBadge');
    if (jobCountEl) {
      jobCountEl.textContent = `${this.filteredImages.length.toLocaleString()} Resim`;
    }

    this.renderLeftSidebarList();

    if (this.filteredImages.length > 0) {
      const nextIdx = Math.min(this.currentIndex, this.filteredImages.length - 1);
      this.goToIndex(nextIdx);
      if (typeof this.loadHubProjectData === 'function') {
        this.loadHubProjectData().catch(() => {});
      }
    } else {
      this.currentImage = null;
      this.boxes = [];
      this.clearCanvas();
      this.showToast('Görevdeki tüm görseller onaylandı ve Veri Setine aktarıldı', 'success');
      const targetProject = this.currentCategory || this.activeHubProjectId || new URLSearchParams(window.location.search).get('project') || 'modai';
      const returnTab = this.editorReturnTab || 'annotate';
      if (typeof this.openProject === 'function') {
        this.openProject(targetProject, returnTab, true);
      } else {
        this.switchProjectTab(returnTab);
      }
    }
  }

  // --- Rendering ---

  render() {
    if (!this.imageObj) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const isTinyOrEnlarged = (this.renderScale > 1) || (this.zoomLevel >= 3.0);
    this.ctx.imageSmoothingEnabled = !isTinyOrEnlarged;
    if (!this.ctx.imageSmoothingEnabled) {
      this.ctx.imageSmoothingQuality = 'low';
    }

    if (this.autoEnhance) {
      this.ctx.filter = 'contrast(1.15) brightness(1.04) saturate(1.12)';
    } else {
      this.ctx.filter = 'none';
    }

    this.ctx.drawImage(this.imageObj, 0, 0, this.canvas.width, this.canvas.height);
    this.ctx.filter = 'none';
    this.ctx.imageSmoothingEnabled = true;

    if (!this.isHPressed) {
      const sortedIndices = this.boxes.map((b, i) => ({
        index: i,
        area: b.width * b.height,
        isSelected: this.selectedBoxIndices.has(i)
      })).sort((a, b) => {
        if (a.isSelected !== b.isSelected) return a.isSelected ? 1 : -1;
        return b.area - a.area;
      });

      sortedIndices.forEach(item => {
        this.drawBox(this.boxes[item.index], item.isSelected, item.index);
      });
    }

    if (this.dragAction === 'draw' && this.isMouseDown) {
      this.drawCreationPreview();
    }

    // Poligon taslağını çiz (Roboflow Interactive Polygon Canvas)
    if (this.polygonDraftPoints && this.polygonDraftPoints.length > 0) {
      this.drawPolygonDraft();
    }

    if (this.showGuideLines && this.cursorPos.x >= 0 && this.cursorPos.y >= 0 && this.mode !== 'pan') {
      this.drawCrosshairGuidelines();
    }

    if (this.cursorPos.x >= 0 && this.cursorPos.y >= 0) {
      this.renderLoupe(this.cursorPos);
    }
  }

  drawBox(box, isSelected, index) {
    if ((box.type === 'polygon' || box.points) && Array.isArray(box.points) && box.points.length >= 3) {
      this.drawPolygon(box, isSelected, index);
      return;
    }

    const cW = this.canvas.width;
    const cH = this.canvas.height;
    const rScale = this.renderScale || 1.0;
    const effectiveZoom = this.zoomLevel / rScale;

    const boxW = box.width * cW;
    const boxH = box.height * cH;
    const boxX = (box.x_center * cW) - (boxW / 2);
    const boxY = (box.y_center * cH) - (boxH / 2);

    const color = this.getClassColor(box.class_id);

    // Dynamic stroke width adapted to screen pixels
    const strokeW = Math.max(1.5, (isSelected ? 3 : 2) / effectiveZoom);

    this.ctx.fillStyle = isSelected ? this.hexToRgba(color, 0.35) : this.hexToRgba(color, 0.15);
    this.ctx.fillRect(boxX, boxY, boxW, boxH);

    this.ctx.strokeStyle = isSelected ? '#ffffff' : color;
    this.ctx.lineWidth = strokeW;
    this.ctx.strokeRect(boxX, boxY, boxW, boxH);

    if (isSelected) {
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = Math.max(1, 1.2 / effectiveZoom);
      const outerOffset = Math.max(2, 3 / effectiveZoom);
      this.ctx.strokeRect(boxX - outerOffset, boxY - outerOffset, boxW + outerOffset * 2, boxH + outerOffset * 2);
    }

    // Dynamic tag size & clearly readable font scaled for screen
    const labelText = `#${index + 1} [${box.class_id}] ${box.class_name || this.getClassName(box.class_id)}`;
    const fontSize = Math.max(12, Math.round(13 / effectiveZoom));
    this.ctx.font = `bold ${fontSize}px "Plus Jakarta Sans", -apple-system, sans-serif`;
    const textWidth = this.ctx.measureText(labelText).width;
    const tagHeight = Math.round(fontSize * 1.6);
    const tagPadding = Math.round(fontSize * 0.45);
    const totalTagWidth = textWidth + tagPadding * 2;

    let tagY = boxY - tagHeight;
    if (tagY < 0) tagY = boxY;

    // Tag background badge
    this.ctx.fillStyle = isSelected ? '#2563eb' : color;
    this.ctx.fillRect(boxX, tagY, totalTagWidth, tagHeight);

    // Tag text with shadow for maximum readability
    this.ctx.fillStyle = '#ffffff';
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    this.ctx.shadowBlur = Math.round(2 / effectiveZoom);
    this.ctx.fillText(labelText, boxX + tagPadding, tagY + fontSize * 1.15);
    this.ctx.shadowBlur = 0;

    if (isSelected && this.selectedBoxIndices.size === 1) {
      this.drawResizeHandles(boxX, boxY, boxW, boxH);
    }
  }

  drawResizeHandles(x, y, w, h) {
    const zoom = (this.zoomLevel / (this.renderScale || 1.0)) || 1;
    const handleSize = Math.max(6, Math.round(9 / zoom));
    const halfH = handleSize / 2;
    const points = this.getHandlePoints(x, y, w, h);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.strokeStyle = '#0f172a';
    this.ctx.lineWidth = Math.max(1, 1.5 / zoom);

    for (const p of Object.values(points)) {
      this.ctx.fillRect(p.x - halfH, p.y - halfH, handleSize, handleSize);
      this.ctx.strokeRect(p.x - halfH, p.y - halfH, handleSize, handleSize);
    }
  }

  getHandlePoints(x, y, w, h) {
    return {
      nw: { x: x, y: y },
      n: { x: x + w / 2, y: y },
      ne: { x: x + w, y: y },
      e: { x: x + w, y: y + h / 2 },
      se: { x: x + w, y: y + h },
      s: { x: x + w / 2, y: y + h },
      sw: { x: x, y: y + h },
      w: { x: x, y: y + h / 2 }
    };
  }

  drawPolygon(poly, isSelected, index) {
    const cW = this.canvas.width;
    const cH = this.canvas.height;
    const rScale = this.renderScale || 1.0;
    const effectiveZoom = this.zoomLevel / rScale;
    const color = this.getClassColor(poly.class_id);

    const pts = poly.points.map(p => ({
      x: p.x * cW,
      y: p.y * cH
    }));
    if (pts.length < 3) return;

    this.ctx.save();

    // 1. Poligon Gövdesini Doldur (Yarı Saydam)
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      this.ctx.lineTo(pts[i].x, pts[i].y);
    }
    this.ctx.closePath();

    this.ctx.fillStyle = isSelected ? this.hexToRgba(color, 0.40) : this.hexToRgba(color, 0.22);
    this.ctx.fill();

    // 2. Poligon Dış Çizgisi
    this.ctx.strokeStyle = isSelected ? '#ffffff' : color;
    this.ctx.lineWidth = Math.max(1.5, (isSelected ? 3 : 2) / effectiveZoom);
    this.ctx.stroke();

    if (isSelected) {
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = Math.max(1, 1.2 / effectiveZoom);
      this.ctx.stroke();
    }

    // 3. Köşe Noktaları (Vertex Handles)
    const handleRadius = Math.max(3.5, 5 / effectiveZoom);
    pts.forEach((pt) => {
      this.ctx.beginPath();
      this.ctx.arc(pt.x, pt.y, handleRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = isSelected ? '#ffffff' : color;
      this.ctx.fill();
      this.ctx.strokeStyle = '#0f172a';
      this.ctx.lineWidth = Math.max(1, 1.5 / effectiveZoom);
      this.ctx.stroke();
    });

    // 4. Etiket Badge'i
    const labelText = `#${index + 1} [POLY] ${poly.class_name || this.getClassName(poly.class_id)}`;
    const fontSize = Math.max(12, Math.round(13 / effectiveZoom));
    this.ctx.font = `bold ${fontSize}px "Plus Jakarta Sans", -apple-system, sans-serif`;
    const textWidth = this.ctx.measureText(labelText).width;
    const tagHeight = Math.round(fontSize * 1.6);
    const tagPadding = Math.round(fontSize * 0.45);
    const totalTagWidth = textWidth + tagPadding * 2;

    const firstPt = pts[0];
    let tagY = firstPt.y - tagHeight - 4;
    if (tagY < 0) tagY = firstPt.y + 6;

    this.ctx.fillStyle = isSelected ? '#2563eb' : color;
    this.ctx.fillRect(firstPt.x, tagY, totalTagWidth, tagHeight);

    this.ctx.fillStyle = '#ffffff';
    this.ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    this.ctx.shadowBlur = Math.round(2 / effectiveZoom);
    this.ctx.fillText(labelText, firstPt.x + tagPadding, tagY + fontSize * 1.15);
    this.ctx.shadowBlur = 0;

    this.ctx.restore();
  }

  drawPolygonDraft() {
    const pts = this.polygonDraftPoints;
    if (!pts || pts.length === 0) return;

    const rScale = this.renderScale || 1.0;
    const effectiveZoom = this.zoomLevel / rScale;
    const color = this.getClassColor(this.activeClassId) || '#10b981';

    this.ctx.save();

    // Çizilmiş çizgiler
    this.ctx.beginPath();
    this.ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      this.ctx.lineTo(pts[i].x, pts[i].y);
    }

    // İmlece giden canlı elastik çizgi (rubber-band)
    if (this.polygonHoverPoint) {
      this.ctx.lineTo(this.polygonHoverPoint.x, this.polygonHoverPoint.y);
    }

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = Math.max(2, 2.5 / effectiveZoom);
    this.ctx.stroke();

    // Doldurma önizlemesi
    if (pts.length >= 2 && this.polygonHoverPoint) {
      this.ctx.beginPath();
      this.ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) {
        this.ctx.lineTo(pts[i].x, pts[i].y);
      }
      this.ctx.lineTo(this.polygonHoverPoint.x, this.polygonHoverPoint.y);
      this.ctx.closePath();
      this.ctx.fillStyle = this.hexToRgba(color, 0.15);
      this.ctx.fill();
    }

    // Köşe noktaları (Vertices)
    const handleRadius = Math.max(4, 6 / effectiveZoom);
    pts.forEach((pt, idx) => {
      this.ctx.beginPath();
      this.ctx.arc(pt.x, pt.y, handleRadius, 0, Math.PI * 2);
      this.ctx.fillStyle = (idx === 0 && pts.length >= 3) ? '#22c55e' : '#ffffff';
      this.ctx.fill();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = Math.max(1.5, 2 / effectiveZoom);
      this.ctx.stroke();
    });

    // İlk noktaya manyetik yaklaşma ipucu (Snap indicator)
    if (pts.length >= 3 && this.polygonHoverPoint) {
      const distToFirst = Math.hypot(this.polygonHoverPoint.x - pts[0].x, this.polygonHoverPoint.y - pts[0].y);
      if (distToFirst <= 16 / effectiveZoom) {
        this.ctx.beginPath();
        this.ctx.arc(pts[0].x, pts[0].y, handleRadius * 1.8, 0, Math.PI * 2);
        this.ctx.strokeStyle = '#22c55e';
        this.ctx.lineWidth = 3 / effectiveZoom;
        this.ctx.stroke();

        // Kapat ipucu yazısı
        this.ctx.font = `bold ${Math.max(11, Math.round(12 / effectiveZoom))}px sans-serif`;
        this.ctx.fillStyle = '#22c55e';
        this.ctx.fillText('Halkayı Kapat (Tıkla)', pts[0].x + handleRadius * 2, pts[0].y + 4);
      }
    }

    this.ctx.restore();
  }

  completePolygonDraft() {
    if (!this.polygonDraftPoints || this.polygonDraftPoints.length < 3) {
      this.showToast('Poligon için en az 3 nokta gereklidir.', 'warning');
      return;
    }

    const cW = this.canvas.width;
    const cH = this.canvas.height;

    // Koordinatları normalize et [0..1]
    const normalizedPoints = this.polygonDraftPoints.map(p => ({
      x: Math.max(0, Math.min(1, p.x / cW)),
      y: Math.max(0, Math.min(1, p.y / cH))
    }));

    const xs = normalizedPoints.map(p => p.x);
    const ys = normalizedPoints.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    this.saveState(); // Undo için kaydet

    const newPolygon = {
      type: 'polygon',
      class_id: this.activeClassId,
      class_name: this.getClassName(this.activeClassId),
      points: normalizedPoints,
      x_center: (minX + maxX) / 2.0,
      y_center: (minY + maxY) / 2.0,
      width: Math.max(0.001, maxX - minX),
      height: Math.max(0.001, maxY - minY)
    };

    this.boxes.push(newPolygon);
    this.selectedBoxIndices.clear();
    this.selectedBoxIndices.add(this.boxes.length - 1);

    this.polygonDraftPoints = [];
    this.polygonHoverPoint = null;

    this.setDirty(true);
    this.render();
    this.updateBoxesList();
    this.showToast(`Poligon eklendi (#${this.boxes.length} [${this.getClassName(this.activeClassId)}])`, 'success');
  }

  drawCreationPreview() {
    const start = this.dragStart;
    const curr = this.dragCurrent;
    const x = Math.min(start.x, curr.x);
    const y = Math.min(start.y, curr.y);
    const w = Math.abs(curr.x - start.x);
    const h = Math.abs(curr.y - start.y);

    const zoom = (this.zoomLevel / (this.renderScale || 1.0)) || 1;
    const color = this.getClassColor(this.activeClassId);

    this.ctx.fillStyle = this.hexToRgba(color, 0.28);
    this.ctx.fillRect(x, y, w, h);

    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = Math.max(2, 2.5 / zoom);
    this.ctx.setLineDash([6 / zoom, 4 / zoom]);
    this.ctx.strokeRect(x, y, w, h);
    this.ctx.setLineDash([]);

    // Live dimension tag while drawing
    if (w > 10 && h > 10) {
      const dimText = `${Math.round(w / (this.renderScale || 1))} × ${Math.round(h / (this.renderScale || 1))} px`;
      const fontSize = Math.max(11, Math.round(12 / zoom));
      this.ctx.font = `bold ${fontSize}px "Plus Jakarta Sans", sans-serif`;
      const txtWidth = this.ctx.measureText(dimText).width;
      const tagH = Math.round(fontSize * 1.5);
      const tagW = txtWidth + Math.round(fontSize * 0.8);

      let tagX = x + w - tagW;
      let tagY = y + h + 4;
      if (tagY + tagH > this.canvas.height) tagY = y - tagH - 4;

      this.ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      this.ctx.fillRect(tagX, tagY, tagW, tagH);
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = Math.max(1, 1 / zoom);
      this.ctx.strokeRect(tagX, tagY, tagW, tagH);

      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillText(dimText, tagX + Math.round(fontSize * 0.4), tagY + fontSize * 1.1);
    }
  }

  drawCrosshairGuidelines() {
    const isDrawing = this.dragAction === 'draw' && this.isMouseDown;
    const x = isDrawing ? this.dragCurrent.x : this.cursorPos.x;
    const y = isDrawing ? this.dragCurrent.y : this.cursorPos.y;
    if (x < 0 || y < 0 || x > this.canvas.width || y > this.canvas.height) return;

    this.ctx.save();

    const zoom = (this.zoomLevel / (this.renderScale || 1.0)) || 1;
    // Exactly 1 physical screen pixel - ultra thin, elegant and non-intrusive
    const lineWidth = 1 / zoom;
    const dashLength = 4 / zoom;
    const gapLength = 3 / zoom;

    // Color: Active class color when drawing, refined theme blue (#60a5fa) when hovering
    const guideColor = isDrawing
      ? (this.getClassColor(this.activeClassId) || '#60a5fa')
      : '#60a5fa';

    // 1. Delicate dark shadow underneath for visibility on white background
    this.ctx.strokeStyle = 'rgba(0, 0, 0, 0.4)';
    this.ctx.lineWidth = lineWidth * 1.8;
    this.ctx.setLineDash([]);

    this.ctx.beginPath();
    this.ctx.moveTo(0, y);
    this.ctx.lineTo(this.canvas.width, y);
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, this.canvas.height);
    this.ctx.stroke();

    // 2. Crisp 1px thin guideline
    this.ctx.strokeStyle = guideColor;
    this.ctx.lineWidth = lineWidth;
    this.ctx.setLineDash([dashLength, gapLength]);

    this.ctx.beginPath();
    this.ctx.moveTo(0, y);
    this.ctx.lineTo(this.canvas.width, y);
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, this.canvas.height);
    this.ctx.stroke();

    // 3. Crisp precision cross mark at the cursor center
    const crossSize = 5 / zoom;
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = Math.max(1, 1.2 / zoom);
    this.ctx.setLineDash([]);
    this.ctx.beginPath();
    this.ctx.moveTo(x - crossSize, y);
    this.ctx.lineTo(x + crossSize, y);
    this.ctx.moveTo(x, y - crossSize);
    this.ctx.lineTo(x, y + crossSize);
    this.ctx.stroke();

    this.ctx.restore();
  }

  // --- Pan & Zoom Viewport Controls ---

  fitToViewport() {
    if (!this.imageObj) return;
    const vW = this.viewport.clientWidth;
    const vH = this.viewport.clientHeight;

    const imgW = this.imageObj.naturalWidth || 800;
    const imgH = this.imageObj.naturalHeight || 600;

    // Allocate breathing room and clearance for top floating toolbar
    const topToolbarClearance = 68;
    const bottomMargin = 24;
    const sideMargin = 32;

    const availableW = Math.max(100, vW - sideMargin * 2);
    const availableH = Math.max(100, vH - topToolbarClearance - bottomMargin);

    const scaleX = availableW / imgW;
    const scaleY = availableH / imgH;

    // Fit image cleanly to screen: shrink large images, enlarge tiny images (up to 15x)
    const scale = Math.min(scaleX, scaleY);

    this.fitScale = Math.max(0.05, Math.min(15.0, scale));
    this.zoomLevel = this.fitScale;

    // Ensure canvas has adequate internal resolution (at least 800px) so labels & handles are NEVER blurry
    const minCanvasDim = 800;
    const maxImgDim = Math.max(imgW, imgH);
    this.renderScale = maxImgDim < minCanvasDim ? Math.min(12, minCanvasDim / maxImgDim) : 1.0;

    const targetW = Math.round(imgW * this.renderScale);
    const targetH = Math.round(imgH * this.renderScale);

    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }

    // Horizontally centered
    this.panX = (vW - imgW * this.zoomLevel) / 2;
    // Vertically placed with full clearance below the top toolbar
    this.panY = topToolbarClearance + (availableH - imgH * this.zoomLevel) / 2;

    this.applyTransform();
    this.render();
  }

  zoomAtPoint(viewportX, viewportY, factor) {
    const minZoom = this.fitScale * 0.25;
    const maxZoom = this.fitScale * 8.0;

    const newZoom = Math.min(maxZoom, Math.max(minZoom, this.zoomLevel * factor));
    if (newZoom === this.zoomLevel) return;

    const canvasX = (viewportX - this.panX) / this.zoomLevel;
    const canvasY = (viewportY - this.panY) / this.zoomLevel;

    this.panX = viewportX - canvasX * newZoom;
    this.panY = viewportY - canvasY * newZoom;
    this.zoomLevel = newZoom;

    this.applyTransform();
  }

  zoomAtCenter(factor) {
    const vW = this.viewport.clientWidth;
    const vH = this.viewport.clientHeight;
    this.zoomAtPoint(vW / 2, vH / 2, factor);
  }

  applyTransform() {
    const cssScale = this.zoomLevel / (this.renderScale || 1.0);
    this.container.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${cssScale})`;
    const pct = Math.round((this.zoomLevel / this.fitScale) * 100);
    const zoomEl = document.getElementById('zoomLevelDisplay');
    if (zoomEl) zoomEl.textContent = `${pct}%`;
  }

  getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cssScale = this.zoomLevel / (this.renderScale || 1.0);
    const x = (e.clientX - rect.left) / cssScale;
    const y = (e.clientY - rect.top) / cssScale;
    return {
      x: Math.max(0, Math.min(this.canvas.width, x)),
      y: Math.max(0, Math.min(this.canvas.height, y))
    };
  }

  // --- Mouse & Keyboard Event Handlers ---

  onMouseDown(e) {
    if (!this.imageObj) return;

    if (e.button === 1 || this.isSpacePressed || this.mode === 'pan') {
      this.isPanning = true;
      this.lastPanMouse = { x: e.clientX, y: e.clientY };
      this.viewport.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return;

    const pt = this.getCanvasPoint(e);

    if (this.mode === 'smart-segment') {
      const imgW = this.imageObj.naturalWidth || 800;
      const imgH = this.imageObj.naturalHeight || 600;
      const clickX = Math.max(0, Math.min(1, pt.x / imgW));
      const clickY = Math.max(0, Math.min(1, pt.y / imgH));
      this.executeSmartSegment(clickX, clickY);
      return;
    }

    // Poligon Çizim Modu (Tıkla köşe ekle, ilk noktaya tıklayarak veya Enter ile kapat)
    if (this.mode === 'polygon') {
      const effectiveZoom = (this.zoomLevel / (this.renderScale || 1.0)) || 1.0;
      const snapDist = 16 / effectiveZoom;

      if (this.polygonDraftPoints && this.polygonDraftPoints.length >= 3) {
        const firstPt = this.polygonDraftPoints[0];
        const distToFirst = Math.hypot(pt.x - firstPt.x, pt.y - firstPt.y);
        if (distToFirst <= snapDist) {
          this.completePolygonDraft();
          return;
        }
      }

      if (!this.polygonDraftPoints) this.polygonDraftPoints = [];
      this.polygonDraftPoints.push({ x: pt.x, y: pt.y });
      this.render();
      return;
    }

    this.isMouseDown = true;
    this.dragStart = { ...pt };
    this.dragCurrent = { ...pt };
    this.beforeDragSnapshot = JSON.stringify(this.boxes);
    this.hasActuallyDragged = false;

    // Check resize handle of the currently active box (works in both draw and select mode)
    if (this.selectedBoxIndices.size === 1) {
      const singleIdx = Array.from(this.selectedBoxIndices)[0];
      const handle = this.findHitHandle(pt, this.boxes[singleIdx]);
      if (handle) {
        this.dragAction = 'resize';
        this.resizeHandle = handle;
        this.initialBoxState = JSON.parse(JSON.stringify(this.boxes[singleIdx]));
        return;
      }
    }

    // In SELECT mode: clicking on boxes selects or moves them
    if (this.mode === 'select') {
      const hitIndex = this.findHitBoxIndex(pt);
      if (hitIndex !== -1) {
        if (e.shiftKey) {
          if (this.selectedBoxIndices.has(hitIndex)) {
            this.selectedBoxIndices.delete(hitIndex);
          } else {
            this.selectedBoxIndices.add(hitIndex);
          }
        } else {
          if (!this.selectedBoxIndices.has(hitIndex)) {
            this.selectedBoxIndices.clear();
            this.selectedBoxIndices.add(hitIndex);
            this.activeClassId = this.boxes[hitIndex].class_id;
            this.activeClassSelect.value = this.activeClassId;
          }
        }

        this.dragAction = 'move';
        this.initialBoxStates.clear();
        this.selectedBoxIndices.forEach(idx => {
          this.initialBoxStates.set(idx, JSON.parse(JSON.stringify(this.boxes[idx])));
        });

        this.render();
        this.updateBoxesList();
        return;
      } else {
        if (!e.shiftKey) {
          this.selectedBoxIndices.clear();
          this.render();
          this.updateBoxesList();
        }
        return;
      }
    }

    // In DRAW mode: clicking anywhere always starts drawing a new box!
    if (this.mode === 'draw') {
      this.selectedBoxIndices.clear();
      this.dragAction = 'draw';
      this.render();
      this.updateBoxesList();
    }
  }

  onMouseMove(e) {
    if (this.isPanning) {
      const dx = e.clientX - this.lastPanMouse.x;
      const dy = e.clientY - this.lastPanMouse.y;
      this.panX += dx;
      this.panY += dy;
      this.lastPanMouse = { x: e.clientX, y: e.clientY };
      this.applyTransform();
      return;
    }

    if (!this.imageObj) return;

    const pt = this.getCanvasPoint(e);
    this.cursorPos = { ...pt };

    if (!this.isMouseDown) {
      if (this.mode === 'polygon' && this.polygonDraftPoints && this.polygonDraftPoints.length > 0) {
        this.polygonHoverPoint = { ...pt };
        this.render();
        return;
      }
      this.updateCursor(pt);
      if (this.showGuideLines || this.isLoupeActive || this.isZPressed) {
        this.render();
      }
      return;
    }

    this.dragCurrent = { ...pt };
    const moveDist = Math.hypot(pt.x - this.dragStart.x, pt.y - this.dragStart.y);

    if (this.dragAction === 'draw') {
      this.render();
    } else if (this.dragAction === 'move') {
      if (moveDist > 2) this.hasActuallyDragged = true;
      const dx = (pt.x - this.dragStart.x) / this.canvas.width;
      const dy = (pt.y - this.dragStart.y) / this.canvas.height;

      this.selectedBoxIndices.forEach(idx => {
        const initial = this.initialBoxStates.get(idx);
        if (initial && this.boxes[idx]) {
          const b = this.boxes[idx];
          b.x_center = Math.min(1.0 - b.width / 2, Math.max(b.width / 2, initial.x_center + dx));
          b.y_center = Math.min(1.0 - b.height / 2, Math.max(b.height / 2, initial.y_center + dy));
        }
      });
      this.setDirty(true);
      this.render();
      this.updateBoxesList();
    } else if (this.dragAction === 'resize') {
      if (moveDist > 2) this.hasActuallyDragged = true;
      const singleIdx = Array.from(this.selectedBoxIndices)[0];
      if (this.boxes[singleIdx] && this.initialBoxState) {
        this.handleResize(pt, this.boxes[singleIdx], this.initialBoxState, this.resizeHandle);
        this.setDirty(true);
        this.render();
        this.updateBoxesList();
      }
    }
  }

  onMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      this.viewport.style.cursor = this.isSpacePressed ? 'grab' : 'default';
      return;
    }

    if (!this.isMouseDown) return;
    this.isMouseDown = false;

    if (this.dragAction === 'draw') {
      const start = this.dragStart;
      const curr = this.dragCurrent;
      const x = Math.min(start.x, curr.x);
      const y = Math.min(start.y, curr.y);
      const w = Math.abs(curr.x - start.x);
      const h = Math.abs(curr.y - start.y);

      if (w >= 6 && h >= 6) {
        this.saveHistory(this.beforeDragSnapshot);
        const cW = this.canvas.width;
        const cH = this.canvas.height;

        const newBox = {
          class_id: this.activeClassId,
          class_name: this.getClassName(this.activeClassId),
          x_center: (x + w / 2) / cW,
          y_center: (y + h / 2) / cH,
          width: w / cW,
          height: h / cH
        };

        this.boxes.push(newBox);
        this.selectedBoxIndices.clear();
        this.selectedBoxIndices.add(this.boxes.length - 1);
        this.setDirty(true);
        this.playFeedbackTone('snap');
      }
    } else if ((this.dragAction === 'move' || this.dragAction === 'resize') && this.hasActuallyDragged) {
      this.saveHistory(this.beforeDragSnapshot);
    }

    this.hasActuallyDragged = false;
    this.dragAction = null;
    this.resizeHandle = null;
    this.render();
    this.updateBoxesList();
  }

  handleResize(pt, box, initial, handle) {
    const cW = this.canvas.width;
    const cH = this.canvas.height;

    let x1 = (initial.x_center - initial.width / 2) * cW;
    let y1 = (initial.y_center - initial.height / 2) * cH;
    let x2 = (initial.x_center + initial.width / 2) * cW;
    let y2 = (initial.y_center + initial.height / 2) * cH;

    if (handle.includes('w')) x1 = Math.min(x2 - 5, Math.max(0, pt.x));
    if (handle.includes('e')) x2 = Math.max(x1 + 5, Math.min(cW, pt.x));
    if (handle.includes('n')) y1 = Math.min(y2 - 5, Math.max(0, pt.y));
    if (handle.includes('s')) y2 = Math.max(y1 + 5, Math.min(cH, pt.y));

    const w = (x2 - x1) / cW;
    const h = (y2 - y1) / cH;
    box.width = Math.max(0.005, Math.min(1.0, w));
    box.height = Math.max(0.005, Math.min(1.0, h));
    box.x_center = ((x1 + x2) / 2) / cW;
    box.y_center = ((y1 + y2) / 2) / cH;
  }

  findHitBoxIndex(pt) {
    const cW = this.canvas.width;
    const cH = this.canvas.height;

    const candidates = [];
    this.boxes.forEach((box, index) => {
      const boxW = box.width * cW;
      const boxH = box.height * cH;
      const boxX = (box.x_center * cW) - (boxW / 2);
      const boxY = (box.y_center * cH) - (boxH / 2);

      if (pt.x >= boxX && pt.x <= boxX + boxW && pt.y >= boxY && pt.y <= boxY + boxH) {
        candidates.push({ index, area: boxW * boxH });
      }
    });

    if (candidates.length === 0) return -1;
    candidates.sort((a, b) => a.area - b.area);
    return candidates[0].index;
  }

  findHitHandle(pt, box) {
    if (!box) return null;
    const cW = this.canvas.width;
    const cH = this.canvas.height;
    const boxW = box.width * cW;
    const boxH = box.height * cH;
    const boxX = (box.x_center * cW) - (boxW / 2);
    const boxY = (box.y_center * cH) - (boxH / 2);

    const points = this.getHandlePoints(boxX, boxY, boxW, boxH);
    const hitRadius = this.HANDLE_SIZE + 4;

    for (const [key, p] of Object.entries(points)) {
      if (Math.abs(pt.x - p.x) <= hitRadius && Math.abs(pt.y - p.y) <= hitRadius) {
        return key;
      }
    }
    return null;
  }

  updateCursor(pt) {
    if (this.isSpacePressed || this.mode === 'pan') {
      this.viewport.style.cursor = 'grab';
      return;
    }

    if (this.selectedBoxIndices.size === 1) {
      const singleIdx = Array.from(this.selectedBoxIndices)[0];
      const handle = this.findHitHandle(pt, this.boxes[singleIdx]);
      if (handle) {
        const cursors = {
          nw: 'nwse-resize', se: 'nwse-resize',
          ne: 'nesw-resize', sw: 'nesw-resize',
          n: 'ns-resize', s: 'ns-resize',
          w: 'ew-resize', e: 'ew-resize'
        };
        this.viewport.style.cursor = cursors[handle] || 'default';
        return;
      }
    }

    if (this.mode === 'draw') {
      this.viewport.style.cursor = 'crosshair';
      return;
    }

    const hit = this.findHitBoxIndex(pt);
    this.viewport.style.cursor = hit !== -1 ? 'move' : 'default';
  }

  onKeyDown(e) {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (this.currentView !== 'editor') return;

    // Lock navigation while AI is searching
    if (this.isAiProcessing) {
      if (['a', 'A', 'd', 'D', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        return;
      }
    }

    // Delete image shortcut (Shift+Delete)
    if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault();
      this.deleteCurrentImage();
      return;
    }

    // Add image to dataset shortcut (Shift+A)
    if (e.shiftKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      this.saveCurrentLabel(true, true);
      return;
    }

    if (this.isMouseDown || this.dragAction === 'draw' || this.dragAction === 'resize' || this.dragAction === 'move') {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.isMouseDown = false;
        this.dragAction = null;
        this.resizeHandle = null;
        this.render();
      }
      return;
    }

    // Poligon Çizimi Kısayolları (Escape: İptal, Backspace: Son Noktayı Sil, Enter: Tamamla)
    if (this.mode === 'polygon') {
      if (e.key === 'Escape' && this.polygonDraftPoints && this.polygonDraftPoints.length > 0) {
        e.preventDefault();
        this.polygonDraftPoints = [];
        this.polygonHoverPoint = null;
        this.render();
        this.showToast('Poligon çizimi iptal edildi.', 'info');
        return;
      }
      if (e.key === 'Backspace' && this.polygonDraftPoints && this.polygonDraftPoints.length > 0) {
        e.preventDefault();
        this.polygonDraftPoints.pop();
        this.render();
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.polygonDraftPoints && this.polygonDraftPoints.length >= 3) {
          this.completePolygonDraft();
        } else {
          this.showToast('Poligon için en az 3 köşe noktası belirleyin.', 'warning');
        }
        return;
      }
    }

    // P Tuşu: Poligon Moduna Geçiş
    if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      this.setMode('polygon');
      this.showToast('🔷 Poligon Modu (Tıkla köşe ekle, Enter ile kapat)', 'info');
      return;
    }

    // C veya W Tuşu: Kutu Çizim Moduna Geçiş
    if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'c' || e.key === 'C' || e.key === 'w' || e.key === 'W')) {
      if (!this.selectedBoxIndices.size && !e.ctrlKey) {
        e.preventDefault();
        this.setMode('draw');
        this.showToast('✏️ Kutu Çizim Modu', 'info');
        return;
      }
    }

    // V veya S Tuşu: Seçim Moduna Geçiş
    if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'v' || e.key === 'V' || e.key === 's' || e.key === 'S')) {
      if (!e.ctrlKey) {
        e.preventDefault();
        this.setMode('select');
        this.showToast('👆 Kutu / Poligon Seçim Modu', 'info');
        return;
      }
    }

    if (e.code === 'Space' && !this.isSpacePressed) {
      this.isSpacePressed = true;
      this.viewport.classList.add('panning');
      this.viewport.style.cursor = 'grab';
    } else if (e.key === '[' || e.code === 'BracketLeft') {
      e.preventDefault();
      this.toggleLeftSidebar();
    } else if (e.key === ']' || e.code === 'BracketRight') {
      e.preventDefault();
      this.toggleRightSidebar();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      this.toggleZenMode();
    } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        this.selectAllBoxes();
      } else {
        e.preventDefault();
        this.navigatePrev();
      }
    } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
      e.preventDefault();
      this.navigateNext();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      this.deleteSelectedBoxes();
    } else if (e.key === 'Escape') {
      this.selectedBoxIndices.clear();
      this.render();
      this.updateBoxesList();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      this.saveCurrentLabel(true);
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) this.redo(); else this.undo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      this.redo();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault();
      if (this.selectedBoxIndices.size > 0) {
        this.refineSelectedBoxes();
      } else {
        this.autoLabelCurrent();
      }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      this.copyBoxes();
    } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      this.copyFromPrevious();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      this.pasteBoxes();
    } else if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'z' || e.key === 'Z')) {
      if (!this.isZPressed) {
        this.isZPressed = true;
        this.render();
      }
    } else if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'h' || e.key === 'H')) {
      if (!this.isHPressed) {
        this.isHPressed = true;
        this.render();
      }
    } else if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      this.autoEnhance = !this.autoEnhance;
      if (this.autoEnhanceBtn) this.autoEnhanceBtn.classList.toggle('active', this.autoEnhance);
      this.showToast(this.autoEnhance ? 'Otomatik Netleştirme: Açık' : 'Otomatik Netleştirme: Kapalı', 'info');
      this.render();
    } else if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'q' || e.key === 'Q')) {
      e.preventDefault();
      const targetMode = (this.mode === 'smart-segment') ? 'draw' : 'smart-segment';
      this.setMode(targetMode);
      this.showToast(targetMode === 'smart-segment' ? '🪄 Akıllı Tıkla modu aktif' : '✏️ Çizim modu aktif', 'info');
    } else if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      this.refineSelectedBoxes();
    } else if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      this.toggleFlag();
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && this.selectedBoxIndices.size > 0 && !e.ctrlKey) {
      e.preventDefault();
      this.nudgeSelectedBoxes(e.key, e.shiftKey, e.altKey);
    } else {
      const numMatch = e.key.match(/^(\d)$/);
      if (numMatch && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const classIdx = parseInt(numMatch[1]) - 1;
        if (classIdx >= 0 && classIdx < Object.keys(this.classes).length) {
          e.preventDefault();
          const classId = parseInt(this.activeClassSelect.options[classIdx]?.value ?? classIdx);
          this.activeClassId = classId;
          this.activeClassSelect.value = classId;
          if (this.selectedBoxIndices.size > 0) {
            this.saveHistory();
            this.selectedBoxIndices.forEach(i => {
              if (this.boxes[i]) {
                this.boxes[i].class_id = classId;
                this.boxes[i].class_name = this.getClassName(classId);
              }
            });
            this.setDirty(true);
            this.render();
            this.updateBoxesList();
            this.showToast(`Sınıf → ${this.getClassName(classId)}`, 'info');
          }
        }
      }
    }
  }

  onKeyUp(e) {
    if (e.code === 'Space') {
      this.isSpacePressed = false;
      if (!this.isPanning && this.mode !== 'pan') {
        this.viewport.classList.remove('panning');
        this.setMode(this.mode);
      }
    } else if (e.key === 'z' || e.key === 'Z') {
      this.isZPressed = false;
      if (this.loupeCanvas && !this.isLoupeActive) this.loupeCanvas.style.display = 'none';
      this.render();
    } else if (e.key === 'h' || e.key === 'H') {
      this.isHPressed = false;
      this.render();
    }
  }

  // --- Multi-Selection & Box Actions ---

  selectAllBoxes() {
    if (this.boxes.length > 0) {
      this.selectedBoxIndices.clear();
      this.boxes.forEach((_, idx) => this.selectedBoxIndices.add(idx));
      this.render();
      this.updateBoxesList();
      this.showToast(`${this.boxes.length} kutu seçildi`, 'info');
    }
  }

  deleteSelectedBoxes() {
    if (this.selectedBoxIndices.size === 0) return;
    this.saveHistory();
    const count = this.selectedBoxIndices.size;
    this.boxes = this.boxes.filter((_, idx) => !this.selectedBoxIndices.has(idx));
    this.selectedBoxIndices.clear();
    this.setDirty(true);
    this.render();
    this.updateBoxesList();
    this.showToast(`${count} kutu silindi`, 'info');
  }

  clearAllBoxes() {
    if (this.boxes.length === 0) return;
    this.saveHistory();
    this.boxes = [];
    this.selectedBoxIndices.clear();
    this.setDirty(true);
    this.render();
    this.updateBoxesList();
    this.showToast('Tüm kutular temizlendi', 'info');
  }

  copyBoxes() {
    if (this.selectedBoxIndices.size === 0) return;
    this.clipboard = Array.from(this.selectedBoxIndices).map(idx => ({ ...this.boxes[idx] }));
    this.flashToolButton(this.copyBoxesBtn);
    this.showToast(`${this.clipboard.length} kutu kopyalandı`, 'info');
  }

  pasteBoxes() {
    if (this.clipboard.length === 0) return;
    this.saveHistory();
    const offset = 0.012;
    const newBoxes = this.clipboard.map(b => ({
      ...JSON.parse(JSON.stringify(b)),
      x_center: Math.min(1 - b.width / 2, Math.max(b.width / 2, b.x_center + offset)),
      y_center: Math.min(1 - b.height / 2, Math.max(b.height / 2, b.y_center + offset)),
    }));

    const startIdx = this.boxes.length;
    this.boxes.push(...newBoxes);
    this.selectedBoxIndices.clear();
    newBoxes.forEach((_, i) => this.selectedBoxIndices.add(startIdx + i));

    this.flashToolButton(this.pasteBoxesBtn);
    this.setDirty(true);
    this.render();
    this.updateBoxesList();
    this.showToast(`${newBoxes.length} kutu yapıştırıldı`, 'success');
  }

  copyFromPrevious() {
    if (this.prevImageBoxes.length === 0) {
      this.showToast('Kopyalanacak önceki resim etiketi bulunamadı', 'warning');
      return;
    }
    this.saveHistory();
    this.boxes = JSON.parse(JSON.stringify(this.prevImageBoxes));
    this.selectedBoxIndices.clear();
    this.setDirty(true);
    this.render();
    this.updateBoxesList();
    this.showToast(`${this.boxes.length} kutu önceki resimden kopyalandı`, 'success');
  }

  duplicateSelectedBoxes() {
    if (this.selectedBoxIndices.size === 0) return;
    this.saveHistory();
    const offset = 0.015;
    const newBoxes = [];
    this.selectedBoxIndices.forEach(idx => {
      if (this.boxes[idx]) {
        const b = this.boxes[idx];
        newBoxes.push({
          ...JSON.parse(JSON.stringify(b)),
          x_center: Math.min(1 - b.width / 2, Math.max(b.width / 2, b.x_center + offset)),
          y_center: Math.min(1 - b.height / 2, Math.max(b.height / 2, b.y_center + offset)),
        });
      }
    });
    const startIdx = this.boxes.length;
    this.boxes.push(...newBoxes);
    this.selectedBoxIndices.clear();
    newBoxes.forEach((_, i) => this.selectedBoxIndices.add(startIdx + i));
    this.setDirty(true);
    this.render();
    this.updateBoxesList();
    this.showToast(`${newBoxes.length} kutu çoğaltıldı`, 'success');
  }

  flashToolButton(btn) {
    if (!btn) return;
    btn.classList.add('flash-success');
    setTimeout(() => btn.classList.remove('flash-success'), 400);
  }

  // --- Undo & Redo History Management ---

  saveHistory(customState = null) {
    const state = customState || JSON.stringify(this.boxes);
    const lastState = this.undoStack[this.undoStack.length - 1];

    // Discard identical duplicate states
    if (lastState && lastState === state) return;

    this.undoStack.push(state);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.updateHistoryButtons();
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(JSON.stringify(this.boxes));
    const prev = JSON.parse(this.undoStack.pop());
    this.boxes = prev;
    this.selectedBoxIndices.clear();
    this.setDirty(true);
    this.render();
    this.updateBoxesList();
    this.updateHistoryButtons();
    this.showToast('Geri alındı', 'info');
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(JSON.stringify(this.boxes));
    const next = JSON.parse(this.redoStack.pop());
    this.boxes = next;
    this.selectedBoxIndices.clear();
    this.setDirty(true);
    this.render();
    this.updateBoxesList();
    this.updateHistoryButtons();
    this.showToast('Yinelendi', 'info');
  }

  revertBoxes() {
    this.saveHistory();
    this.boxes = JSON.parse(JSON.stringify(this.savedBoxesSnapshot));
    this.selectedBoxIndices.clear();
    this.setDirty(false);
    this.render();
    this.updateBoxesList();
    this.showToast('Değişiklikler sıfırlandı', 'info');
  }

  updateHistoryButtons() {
    const canUndo = this.undoStack.length > 0;
    const canRedo = this.redoStack.length > 0;

    if (this.undoBtn) this.undoBtn.disabled = !canUndo;
    if (this.redoBtn) this.redoBtn.disabled = !canRedo;

    const undoBoxesBtn = document.getElementById('undoBoxesBtn');
    const redoBoxesBtn = document.getElementById('redoBoxesBtn');
    if (undoBoxesBtn) undoBoxesBtn.disabled = !canUndo;
    if (redoBoxesBtn) redoBoxesBtn.disabled = !canRedo;
  }

  // --- UI Helpers ---

  setMode(mode) {
    this.mode = mode;
    this.toolDrawBtn?.classList.toggle('active', mode === 'draw');
    this.toolPolygonBtn?.classList.toggle('active', mode === 'polygon');
    this.toolSelectBtn?.classList.toggle('active', mode === 'select');
    this.toolPanBtn?.classList.toggle('active', mode === 'pan');

    // Poligon modundan çıkılırken taslak varsa temizle
    if (mode !== 'polygon' && this.polygonDraftPoints && this.polygonDraftPoints.length > 0) {
      this.polygonDraftPoints = [];
      this.polygonHoverPoint = null;
      this.render();
    }

    const smartBtn = document.getElementById('toolSmartSegmentBtn');
    if (smartBtn) {
      const isSmart = (mode === 'smart-segment');
      smartBtn.classList.toggle('active', isSmart);
      if (isSmart) {
        smartBtn.style.background = 'linear-gradient(135deg, rgba(168,85,247,0.4), rgba(139,92,246,0.55))';
        smartBtn.style.borderColor = '#c084fc';
        smartBtn.style.color = '#ffffff';
        smartBtn.style.boxShadow = '0 0 16px rgba(168,85,247,0.8), inset 0 0 8px rgba(255,255,255,0.3)';
        smartBtn.style.transform = 'scale(1.04)';
      } else {
        smartBtn.style.background = 'rgba(168,85,247,0.08)';
        smartBtn.style.borderColor = 'rgba(168,85,247,0.3)';
        smartBtn.style.color = '#c084fc';
        smartBtn.style.boxShadow = 'none';
        smartBtn.style.transform = 'scale(1)';
      }
    }

    const cursors = { draw: 'crosshair', polygon: 'crosshair', select: 'default', pan: 'grab', 'smart-segment': 'crosshair' };
    this.viewport.style.cursor = cursors[mode] || 'default';
  }

  setDirty(isDirty) {
    this.isDirty = isDirty;
    if (isDirty) {
      this.saveStatusIndicator.className = 'status-badge unsaved';
      this.saveStatusIndicator.querySelector('.status-text').textContent = 'Kaydedilmedi';
      this.debounceAutoSave();
    } else {
      this.saveStatusIndicator.className = 'status-badge saved';
      this.saveStatusIndicator.querySelector('.status-text').textContent = 'Güncel';
    }
  }

  debounceAutoSave() {
    if (!this.autoSave) return;
    if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = setTimeout(() => {
      if (this.isDirty) {
        this.saveCurrentLabel(false);
      }
    }, 450);
  }

  updateMetaDisplay() {
    const metaFilename = document.getElementById('metaFilename');
    const metaDimensions = document.getElementById('metaDimensions');
    const metaBoxCount = document.getElementById('metaBoxCount');

    if (this.currentImage) {
      if (metaFilename) metaFilename.textContent = this.currentImage.filename;
      if (metaDimensions && this.imageObj) {
        metaDimensions.textContent = `${this.imageObj.naturalWidth} x ${this.imageObj.naturalHeight} px`;
      }
      if (metaBoxCount) metaBoxCount.textContent = this.boxes.length;
    } else {
      if (metaFilename) metaFilename.textContent = '-';
      if (metaDimensions) metaDimensions.textContent = '-';
      if (metaBoxCount) metaBoxCount.textContent = '0';
    }
  }

  updateBoxesList() {
    const container = document.getElementById('boxItemsContainer');
    const countEl = document.getElementById('boxListCount');
    const deleteBtnLabel = this.deleteBtnLabel;
    const selectAllCb = document.getElementById('selectAllBoxesCheckbox');
    const bulkActions = document.getElementById('boxBulkActions');
    const selCountBadge = document.getElementById('selectedCountBadge');
    const bulkClassBar = document.getElementById('bulkClassBar');
    const bulkClassSelect = document.getElementById('bulkClassSelect');

    // Always keep meta display and box count badges 100% synchronized in real-time
    this.updateMetaDisplay();
    if (countEl) countEl.textContent = this.boxes.length;

    if (this.currentImage) {
      this.currentImage.box_count = this.boxes.length;
      const activeEl = document.getElementById(`img-item-${this.currentIndex}`);
      if (activeEl) {
        const countBadge = activeEl.querySelector('.item-box-count');
        const dotEl = activeEl.querySelector('.item-status-dot');
        if (countBadge) countBadge.textContent = this.boxes.length;
        if (dotEl) {
          dotEl.className = `item-status-dot ${this.boxes.length > 0 ? 'has-box' : 'no-box'}`;
        }
      }
    }

    const selCount = this.selectedBoxIndices.size;
    this.deleteSelectedBtn.disabled = selCount === 0;

    // Sync select all checkbox state
    if (selectAllCb) {
      selectAllCb.checked = this.boxes.length > 0 && selCount === this.boxes.length;
      selectAllCb.indeterminate = selCount > 0 && selCount < this.boxes.length;
    }

    // Sync bulk action bar
    if (bulkActions) bulkActions.style.display = selCount > 0 ? 'flex' : 'none';
    if (selCountBadge) selCountBadge.textContent = `${selCount} seçili`;
    if (bulkClassBar) bulkClassBar.style.display = selCount > 0 ? 'flex' : 'none';

    if (bulkClassSelect && selCount > 0) {
      bulkClassSelect.innerHTML = `<option value="">Sınıf Seçiniz (${selCount} kutu)...</option>` +
        Object.values(this.classes).map(c => `<option value="${c.id}">${c.id}: ${c.name}</option>`).join('');
    }

    if (this.boxes.length === 0) {
      container.innerHTML = '<div class="empty-state">Bu resimde etiketlenmiş kutu yok.</div>';
      return;
    }

    container.innerHTML = '';
    this.boxes.forEach((box, idx) => {
      const item = document.createElement('div');
      const isSelected = this.selectedBoxIndices.has(idx);
      item.className = `box-item ${isSelected ? 'active' : ''}`;

      const color = this.getClassColor(box.class_id);
      const name = box.class_name || this.getClassName(box.class_id);

      const isPoly = (box.type === 'polygon' || !!box.points);
      const polyBadge = isPoly ? `<span style="font-size:0.65rem; font-weight:700; padding:1px 5px; border-radius:4px; background:rgba(99,102,241,0.2); color:#818cf8; border:1px solid rgba(99,102,241,0.4); margin-right:4px;">POLY</span>` : '';
      const coordText = isPoly
        ? `<span>${(box.points || []).length} köşe noktası • w:${(box.width || 0).toFixed(2)} h:${(box.height || 0).toFixed(2)}</span>`
        : `<span>x:${(box.x_center || 0).toFixed(2)} y:${(box.y_center || 0).toFixed(2)} w:${(box.width || 0).toFixed(2)} h:${(box.height || 0).toFixed(2)}</span>`;

      item.innerHTML = `
        <div class="box-item-header">
          <input type="checkbox" class="box-select-checkbox-item" ${isSelected ? 'checked' : ''} title="Seç">
          <span class="box-color-dot" style="background-color: ${color};"></span>
          <span class="box-class-title">#${idx + 1} ${polyBadge}${box.class_id}: ${name}</span>
          <button class="box-delete-btn" title="Sil">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
        <div class="box-item-coords">
          ${coordText}
        </div>
      `;

      // Checkbox click
      const cb = item.querySelector('.box-select-checkbox-item');
      cb?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.selectedBoxIndices.has(idx)) {
          this.selectedBoxIndices.delete(idx);
        } else {
          this.selectedBoxIndices.add(idx);
        }
        this.render();
        this.updateBoxesList();
      });

      // Item click (Ctrl/Shift supported)
      item.addEventListener('click', (e) => {
        if (e.target.closest('.box-delete-btn') || e.target.closest('.box-select-checkbox-item')) return;
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          if (this.selectedBoxIndices.has(idx)) {
            this.selectedBoxIndices.delete(idx);
          } else {
            this.selectedBoxIndices.add(idx);
          }
        } else {
          this.selectedBoxIndices.clear();
          this.selectedBoxIndices.add(idx);
          this.activeClassId = box.class_id;
          this.activeClassSelect.value = box.class_id;
        }
        this.render();
        this.updateBoxesList();
      });

      const delBtn = item.querySelector('.box-delete-btn');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.saveHistory();
        this.boxes.splice(idx, 1);
        this.selectedBoxIndices.delete(idx);
        this.setDirty(true);
        this.render();
        this.updateBoxesList();
      });

      container.appendChild(item);
    });
  }

  // --- Multi-Select & Box List Handling ---
  toggleSelectAllBoxes(checked) {
    if (checked) {
      this.boxes.forEach((_, idx) => this.selectedBoxIndices.add(idx));
    } else {
      this.selectedBoxIndices.clear();
    }
    this.render();
    this.updateBoxesList();
  }

  batchChangeSelectedClasses(targetClassId) {
    if (this.selectedBoxIndices.size === 0 || isNaN(targetClassId)) return;
    this.saveHistory();
    const className = this.getClassName(targetClassId);
    this.selectedBoxIndices.forEach(idx => {
      if (this.boxes[idx]) {
        this.boxes[idx].class_id = targetClassId;
        this.boxes[idx].class_name = className;
      }
    });
    this.activeClassId = targetClassId;
    if (this.activeClassSelect) this.activeClassSelect.value = targetClassId;
    this.setDirty(true);
    this.render();
    this.updateBoxesList();
    this.showToast(`${this.selectedBoxIndices.size} kutu "${className}" sınıfına güncellendi.`, 'success');
  }

  // --- Project Settings Modal & Class Management ---
  async openProjectSettingsModal(cat = null) {
    const category = cat || this.currentCategory;
    if (!category) {
      this.showToast('Lütfen önce bir proje seçin.', 'warning');
      return;
    }

    this.activeSettingsCategory = category;
    this.showLoading(true, 'Proje ayarları yükleniyor...');

    try {
      const res = await fetch(`/api/project-settings?category=${category}`);
      const data = await res.json();
      this.showLoading(false);

      if (data.status !== 'ok') {
        this.showToast('Ayarlar yüklenemedi.', 'error');
        return;
      }

      this.currentProjectSettings = data;

      // Tab 1: General Info
      const nameEl = document.getElementById('settingsProjName');
      const folderEl = document.getElementById('settingsProjFolder');
      const descEl = document.getElementById('settingsProjDesc');
      if (nameEl) nameEl.value = data.display_name || '';
      if (folderEl) folderEl.value = data.category || '';
      if (descEl) descEl.value = data.description || '';

      document.getElementById('statProjTotalImg').textContent = data.total_images || 0;
      document.getElementById('statProjLabeledImg').textContent = data.labeled_images || 0;
      document.getElementById('statProjEmptyImg').textContent = data.empty_images || 0;
      document.getElementById('statProjTotalBoxes').textContent = data.total_boxes || 0;

      // Tab 2: Class Table
      this.renderClassesSettingsTable(data.classes || []);

      // Tab 3: AI Settings
      const confRange = document.getElementById('settingsAiConfRange');
      const iouRange = document.getElementById('settingsAiIouRange');
      const confText = document.getElementById('aiConfValText');
      const iouText = document.getElementById('aiIouValText');

      if (confRange && confText) {
        confRange.value = data.ai_settings?.conf || 0.25;
        confText.textContent = confRange.value;
      }
      if (iouRange && iouText) {
        iouRange.value = data.ai_settings?.iou || 0.45;
        iouText.textContent = iouRange.value;
      }

      // Tab 4: Class Distribution
      this.renderClassDistributionChart(data.class_distribution || {}, data.classes || [], data.total_boxes || 0);

      // Open Modal
      const modal = document.getElementById('projectSettingsModal');
      if (modal) modal.style.display = 'flex';

    } catch (err) {
      this.showLoading(false);
      this.showToast('Ayarlar alınırken hata oluştu.', 'error');
    }
  }

  renderClassesSettingsTable(classesList) {
    const tbody = document.getElementById('classesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    classesList.forEach((cls) => {
      const tr = document.createElement('tr');
      tr.className = 'class-row-item';
      tr.innerHTML = `
        <td><input type="number" class="cls-id-input" value="${cls.id}"></td>
        <td><input type="text" class="cls-name-input" value="${cls.name || ''}" placeholder="Sınıf Adı"></td>
        <td><input type="color" class="cls-color-input" value="${cls.color || '#3b82f6'}"></td>
        <td><input type="text" class="cls-prompts-input" value="${(cls.prompts || [cls.name || '']).join(', ')}" placeholder="virgülle ayrılmış promptlar"></td>
        <td style="text-align:center;">
          <button class="btn-row-del" title="Sınıfı Sil" ${classesList.length <= 1 ? 'disabled' : ''}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      `;

      tr.querySelector('.btn-row-del')?.addEventListener('click', () => {
        tr.remove();
      });

      tbody.appendChild(tr);
    });
  }

  addNewClassRow() {
    const tbody = document.getElementById('classesTableBody');
    if (!tbody) return;

    const existingRows = tbody.querySelectorAll('tr');
    let nextId = 0;
    existingRows.forEach(r => {
      const val = parseInt(r.querySelector('.cls-id-input')?.value, 10);
      if (!isNaN(val) && val >= nextId) nextId = val + 1;
    });

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'];
    const randomColor = colors[nextId % colors.length];

    const tr = document.createElement('tr');
    tr.className = 'class-row-item';
    tr.innerHTML = `
      <td><input type="number" class="cls-id-input" value="${nextId}"></td>
      <td><input type="text" class="cls-name-input" value="Sınıf ${nextId}" placeholder="Sınıf Adı"></td>
      <td><input type="color" class="cls-color-input" value="${randomColor}"></td>
      <td><input type="text" class="cls-prompts-input" value="" placeholder="virgülle ayrılmış promptlar"></td>
      <td style="text-align:center;">
        <button class="btn-row-del" title="Sınıfı Sil">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>
    `;
    tr.querySelector('.btn-row-del')?.addEventListener('click', () => tr.remove());
    tbody.appendChild(tr);
    tr.querySelector('.cls-name-input')?.focus();
  }

  renderClassDistributionChart(distribution, classesList, totalBoxes) {
    const container = document.getElementById('classDistChart');
    if (!container) return;
    container.innerHTML = '';

    if (totalBoxes === 0) {
      container.innerHTML = '<div class="empty-state">Bu projede henüz kayıtlı etiket kutusu bulunmuyor.</div>';
      return;
    }

    classesList.forEach(cls => {
      const count = distribution[cls.id] || 0;
      const pct = totalBoxes > 0 ? ((count / totalBoxes) * 100).toFixed(1) : 0;

      const row = document.createElement('div');
      row.className = 'class-dist-row';
      row.innerHTML = `
        <div class="class-dist-name">
          <span class="box-color-dot" style="background-color: ${cls.color || '#3b82f6'};"></span>
          <span>[${cls.id}] ${cls.name}</span>
        </div>
        <div class="class-dist-bar-wrap">
          <div class="class-dist-bar-fill" style="width: ${pct}%; background-color: ${cls.color || '#3b82f6'};"></div>
        </div>
        <div class="class-dist-count">${count} (%${pct})</div>
      `;
      container.appendChild(row);
    });
  }

  async saveProjectSettings() {
    if (!this.activeSettingsCategory) return;

    const dispName = document.getElementById('settingsProjName')?.value?.trim();
    const desc = document.getElementById('settingsProjDesc')?.value?.trim() || '';
    const conf = parseFloat(document.getElementById('settingsAiConfRange')?.value || '0.25');
    const iou = parseFloat(document.getElementById('settingsAiIouRange')?.value || '0.45');

    const tbody = document.getElementById('classesTableBody');
    const rows = tbody.querySelectorAll('tr');

    const updatedClasses = [];
    rows.forEach(r => {
      const id = parseInt(r.querySelector('.cls-id-input')?.value, 10);
      const name = r.querySelector('.cls-name-input')?.value?.trim() || `Class ${id}`;
      const color = r.querySelector('.cls-color-input')?.value || '#3b82f6';
      const promptStr = r.querySelector('.cls-prompts-input')?.value || '';
      const prompts = promptStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

      if (!isNaN(id)) {
        updatedClasses.push({
          id: id,
          name: name,
          color: color,
          prompts: prompts.length > 0 ? prompts : [name.toLowerCase()]
        });
      }
    });

    if (updatedClasses.length === 0) {
      this.showToast('Lütfen en az bir sınıf tanımlayınız.', 'warning');
      return;
    }

    this.showLoading(true, 'Ayarlar kaydediliyor...');

    try {
      const res = await fetch('/api/project-settings/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: this.activeSettingsCategory,
          display_name: dispName || this.activeSettingsCategory,
          description: desc,
          classes: updatedClasses,
          ai_conf: conf,
          ai_iou: iou
        })
      });

      const data = await res.json();
      this.showLoading(false);

      if (data.status === 'ok') {
        this.showToast('Proje ve sınıf ayarları başarıyla kaydedildi.', 'success');
        document.getElementById('projectSettingsModal').style.display = 'none';

        // Refresh global categories, dashboard and classes
        await this.loadDashboardProjects();
        await this.loadCategories();
        this.render();
        this.updateBoxesList();
      } else {
        this.showToast(data.detail || 'Ayarlar kaydedilemedi.', 'error');
      }
    } catch (e) {
      this.showLoading(false);
      this.showToast('Kaydetme hatası oluştu.', 'error');
    }
  }

  // =====================================================
  // IN-APP MODERN DIALOG SYSTEM (Confirm, Alert, Prompt)
  // Replaces ugly native browser popups with Glassmorphism modals
  // =====================================================

  showConfirm(options = {}) {
    if (typeof options === 'string') {
      options = { message: options };
    }
    const {
      title = 'Onay Gerekiyor',
      subtitle = 'Sistem Bildirimi',
      message = '',
      confirmText = 'Evet, Onayla',
      cancelText = 'Vazgeç',
      type = 'danger'
    } = (options || {});

    return new Promise((resolve) => {
      const overlay = document.getElementById('appDialogOverlay');
      const card = document.getElementById('appDialogCard');
      const titleEl = document.getElementById('appDialogTitle');
      const subtitleEl = document.getElementById('appDialogSubtitle');
      const messageEl = document.getElementById('appDialogMessage');
      const iconEl = document.getElementById('appDialogIcon');
      const inputGroup = document.getElementById('appDialogInputGroup');
      const cancelBtn = document.getElementById('appDialogCancelBtn');
      const confirmBtn = document.getElementById('appDialogConfirmBtn');

      if (!overlay || !card || !confirmBtn) {
        resolve(window.confirm(message));
        return;
      }

      card.className = `app-dialog-card dialog-${type}`;
      if (titleEl) titleEl.textContent = title;
      if (subtitleEl) subtitleEl.textContent = subtitle;
      if (messageEl) messageEl.textContent = message;
      if (inputGroup) inputGroup.style.display = 'none';

      let iconSvg = '';
      if (type === 'danger') {
        iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/></svg>`;
      } else if (type === 'warning') {
        iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
      } else {
        iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
      }
      if (iconEl) iconEl.innerHTML = iconSvg;

      if (cancelBtn) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.textContent = cancelText;
      }
      if (confirmBtn) {
        confirmBtn.textContent = confirmText;
      }

      overlay.style.display = 'flex';

      const cleanup = () => {
        confirmBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        overlay.onclick = null;
        document.removeEventListener('keydown', keyHandler);
        overlay.style.display = 'none';
      };

      const handleConfirm = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        cleanup();
        resolve(true);
      };

      const handleCancel = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        cleanup();
        resolve(false);
      };

      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel(e);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirm(e);
        }
      };

      confirmBtn.onclick = handleConfirm;
      if (cancelBtn) cancelBtn.onclick = handleCancel;
      overlay.onclick = (e) => {
        if (e.target === overlay) handleCancel(e);
      };
      document.addEventListener('keydown', keyHandler);
      setTimeout(() => confirmBtn.focus(), 50);
    });
  }

  showAlert({
    title = 'Bilgi',
    subtitle = 'Sistem Bildirimi',
    message = '',
    btnText = 'Tamam',
    type = 'info'
  } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('appDialogOverlay');
      const card = document.getElementById('appDialogCard');
      const titleEl = document.getElementById('appDialogTitle');
      const subtitleEl = document.getElementById('appDialogSubtitle');
      const messageEl = document.getElementById('appDialogMessage');
      const iconEl = document.getElementById('appDialogIcon');
      const inputGroup = document.getElementById('appDialogInputGroup');
      const cancelBtn = document.getElementById('appDialogCancelBtn');
      const confirmBtn = document.getElementById('appDialogConfirmBtn');

      if (!overlay || !card) {
        window.alert(message);
        resolve();
        return;
      }

      card.className = `app-dialog-card dialog-${type}`;
      if (titleEl) titleEl.textContent = title;
      if (subtitleEl) subtitleEl.textContent = subtitle;
      if (messageEl) messageEl.textContent = message;
      if (inputGroup) inputGroup.style.display = 'none';
      if (cancelBtn) cancelBtn.style.display = 'none';
      if (confirmBtn) confirmBtn.textContent = btnText;

      let iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
      if (iconEl) iconEl.innerHTML = iconSvg;

      overlay.style.display = 'flex';

      const cleanup = () => {
        overlay.style.display = 'none';
        document.removeEventListener('keydown', keyHandler);
        resolve();
      };

      const keyHandler = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') {
          e.preventDefault();
          cleanup();
        }
      };

      if (confirmBtn) confirmBtn.onclick = cleanup;
      document.addEventListener('keydown', keyHandler);
      if (confirmBtn) confirmBtn.focus();
    });
  }

  showPrompt({
    title = 'Giriş Yapınız',
    subtitle = 'Veri Girişi',
    message = '',
    defaultValue = '',
    placeholder = '',
    confirmText = 'Kaydet',
    cancelText = 'İptal'
  } = {}) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('appDialogOverlay');
      const card = document.getElementById('appDialogCard');
      const titleEl = document.getElementById('appDialogTitle');
      const subtitleEl = document.getElementById('appDialogSubtitle');
      const messageEl = document.getElementById('appDialogMessage');
      const iconEl = document.getElementById('appDialogIcon');
      const inputGroup = document.getElementById('appDialogInputGroup');
      const input = document.getElementById('appDialogInput');
      const cancelBtn = document.getElementById('appDialogCancelBtn');
      const confirmBtn = document.getElementById('appDialogConfirmBtn');

      if (!overlay || !card) {
        resolve(window.prompt(message, defaultValue));
        return;
      }

      card.className = `app-dialog-card dialog-primary`;
      if (titleEl) titleEl.textContent = title;
      if (subtitleEl) subtitleEl.textContent = subtitle;
      if (messageEl) messageEl.textContent = message;
      if (inputGroup) inputGroup.style.display = 'block';
      if (input) {
        input.value = defaultValue || '';
        input.placeholder = placeholder || '';
      }
      if (cancelBtn) {
        cancelBtn.style.display = 'inline-block';
        cancelBtn.textContent = cancelText;
      }
      if (confirmBtn) confirmBtn.textContent = confirmText;

      let iconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
      if (iconEl) iconEl.innerHTML = iconSvg;

      overlay.style.display = 'flex';
      setTimeout(() => {
        if (input) {
          input.focus();
          input.select();
        }
      }, 60);

      const cleanup = () => {
        confirmBtn.onclick = null;
        if (cancelBtn) cancelBtn.onclick = null;
        overlay.onclick = null;
        document.removeEventListener('keydown', keyHandler);
        overlay.style.display = 'none';
      };

      const handleConfirm = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        const val = input ? input.value : '';
        cleanup();
        resolve(val);
      };

      const handleCancel = (e) => {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        cleanup();
        resolve(null);
      };

      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel(e);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirm(e);
        }
      };

      confirmBtn.onclick = handleConfirm;
      if (cancelBtn) cancelBtn.onclick = handleCancel;
      overlay.onclick = (e) => {
        if (e.target === overlay) handleCancel(e);
      };
      document.addEventListener('keydown', keyHandler);
    });
  }

  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'toastOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  showLoading(show, titleOrOpts = 'Lütfen Bekleyiniz...', text = 'İşlem gerçekleştiriliyor...', progress = null) {
    const overlay = document.getElementById('loadingOverlay');
    const floatingWidget = document.getElementById('floatingUploadWidget');

    if (!this._hasBoundMinimizeListeners) {
      this._hasBoundMinimizeListeners = true;
      document.getElementById('loadingMinimizeBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.minimizeLoading();
      });
      floatingWidget?.addEventListener('click', () => {
        this.maximizeLoading();
      });
    }

    if (!show) {
      if (this._uploadBeforeUnloadHandler) {
        window.removeEventListener('beforeunload', this._uploadBeforeUnloadHandler);
        this._uploadBeforeUnloadHandler = null;
      }

      if (this.isUploadMinimized && floatingWidget && floatingWidget.style.display !== 'none') {
        const spinner = document.getElementById('floatingUploadSpinner');
        const doneIcon = document.getElementById('floatingUploadDoneIcon');
        const fTitle = document.getElementById('floatingUploadTitle');
        const fMeta = document.getElementById('floatingUploadMeta');
        const fBar = document.getElementById('floatingUploadBar');
        const fPct = document.getElementById('floatingUploadPct');

        if (spinner) spinner.style.display = 'none';
        if (doneIcon) doneIcon.style.display = 'block';
        if (fTitle) fTitle.textContent = 'Yükleme Tamamlandı!';
        if (fMeta) fMeta.textContent = 'Tüm dosyalar başarıyla aktarıldı.';
        if (fBar) fBar.style.width = '100%';
        if (fPct) fPct.textContent = '%100';

        setTimeout(() => {
          if (floatingWidget) floatingWidget.style.display = 'none';
          if (spinner) spinner.style.display = 'block';
          if (doneIcon) doneIcon.style.display = 'none';
          this.isUploadMinimized = false;
        }, 3500);
      } else {
        if (floatingWidget) floatingWidget.style.display = 'none';
        this.isUploadMinimized = false;
      }

      if (!overlay) return;
      overlay.classList.remove('active');
      overlay.style.display = 'none';
      return;
    }

    let opts = {};
    if (typeof titleOrOpts === 'object' && titleOrOpts !== null) {
      opts = titleOrOpts;
    } else {
      opts = { title: titleOrOpts, text: text, progress: progress };
    }
    this.lastLoadingOpts = opts;

    if (opts.progress && !this._uploadBeforeUnloadHandler) {
      this._uploadBeforeUnloadHandler = (e) => {
        e.preventDefault();
        e.returnValue = 'Yükleme işlemi arka planda devam ediyor. Sayfadan ayrılırsanız işlem yarıda kalabilir.';
        return e.returnValue;
      };
      window.addEventListener('beforeunload', this._uploadBeforeUnloadHandler);
    }

    const minRow = document.getElementById('loadingMinimizeRow');
    if (minRow) {
      minRow.style.display = opts.progress ? 'block' : 'none';
    }

    if (this.isUploadMinimized) {
      if (overlay) {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
      }
      const tasksContainer = document.getElementById('floatingTasksContainer');
      if (tasksContainer) tasksContainer.style.display = 'flex';
      if (floatingWidget) {
        floatingWidget.style.display = 'block';
        const fTitle = document.getElementById('floatingUploadTitle');
        const fPct = document.getElementById('floatingUploadPct');
        const fMeta = document.getElementById('floatingUploadMeta');
        const fBar = document.getElementById('floatingUploadBar');

        const pct = Math.max(0, Math.min(100, Math.round(opts.progress?.pct || 0)));
        if (fTitle) fTitle.textContent = opts.title || 'Arka Planda Yükleniyor...';
        if (fPct) fPct.textContent = `${pct}%`;
        if (fBar) fBar.style.width = `${pct}%`;
        if (fMeta && opts.progress && opts.progress.current !== undefined && opts.progress.total !== undefined) {
          fMeta.textContent = `${opts.progress.current.toLocaleString()} / ${opts.progress.total.toLocaleString()} Dosya`;
        }
      }
      return;
    }

    if (!overlay) return;

    const titleEl = document.getElementById('loadingTitle');
    const textEl = document.getElementById('loadingText');
    const progressWrap = document.getElementById('loadingProgressWrap');
    const progressBar = document.getElementById('loadingProgressBar');
    const progressCount = document.getElementById('loadingProgressCount');
    const progressPct = document.getElementById('loadingProgressPct');
    const statusPill = document.getElementById('loadingStatusPill');

    if (titleEl) titleEl.textContent = opts.title || 'İşlem Yapılıyor';
    if (textEl) textEl.textContent = opts.text || 'Lütfen bekleyiniz...';
    if (statusPill) statusPill.textContent = opts.status || 'İşlem devam ediyor';

    if (opts.progress && typeof opts.progress === 'object') {
      if (progressWrap) progressWrap.style.display = 'block';
      const pct = Math.max(0, Math.min(100, Math.round(opts.progress.pct || 0)));
      if (progressBar) progressBar.style.width = `${pct}%`;
      if (progressPct) progressPct.textContent = `${pct}%`;
      if (progressCount && opts.progress.current !== undefined && opts.progress.total !== undefined) {
        progressCount.textContent = `${opts.progress.current.toLocaleString()} / ${opts.progress.total.toLocaleString()} Dosya`;
      }
    } else {
      if (progressWrap) progressWrap.style.display = 'none';
    }

    overlay.style.display = 'flex';
    requestAnimationFrame(() => {
      overlay.classList.add('active');
    });
  }

  minimizeLoading() {
    this.isUploadMinimized = true;
    const overlay = document.getElementById('loadingOverlay');
    const floatingWidget = document.getElementById('floatingUploadWidget');
    const tasksContainer = document.getElementById('floatingTasksContainer');
    if (tasksContainer) tasksContainer.style.display = 'flex';
    if (overlay) {
      overlay.classList.remove('active');
      setTimeout(() => {
        if (overlay) overlay.style.display = 'none';
      }, 200);
    }
    if (floatingWidget) {
      floatingWidget.style.display = 'block';
      if (this.lastLoadingOpts) {
        const opts = this.lastLoadingOpts;
        const fTitle = document.getElementById('floatingUploadTitle');
        const fPct = document.getElementById('floatingUploadPct');
        const fMeta = document.getElementById('floatingUploadMeta');
        const fBar = document.getElementById('floatingUploadBar');
        const pct = Math.max(0, Math.min(100, Math.round(opts.progress?.pct || 0)));
        if (fTitle) fTitle.textContent = opts.title || 'Arka Planda Yükleniyor...';
        if (fPct) fPct.textContent = `${pct}%`;
        if (fBar) fBar.style.width = `${pct}%`;
        if (fMeta && opts.progress && opts.progress.current !== undefined && opts.progress.total !== undefined) {
          fMeta.textContent = `${opts.progress.current.toLocaleString()} / ${opts.progress.total.toLocaleString()} Dosya`;
        }
      }
    }
    this.showToast('Yükleme arka plana alındı. Durumu sağ alttan takip edebilirsiniz.', 'info');
  }

  maximizeLoading() {
    this.isUploadMinimized = false;
    const overlay = document.getElementById('loadingOverlay');
    const floatingWidget = document.getElementById('floatingUploadWidget');
    if (floatingWidget) {
      floatingWidget.style.display = 'none';
    }
    if (overlay && this.lastLoadingOpts) {
      this.showLoading(true, this.lastLoadingOpts);
    }
  }

  async autoLabelCurrent() {
    if (!this.currentCategory || !this.currentImage || this.isAiProcessing) return;

    this.isAiProcessing = true;
    this.showLoading(true, {
      title: 'Yapay Zeka Nesneleri Tespit Ediyor',
      text: `"${this.currentImage.filename}" taranıyor ve YOLO kutuları çiziliyor...`,
      status: 'YOLOWorld AI Modeli Aktif'
    });

    try {
      const projClasses = this.getProjectClasses();
      const allPrompts = [];
      projClasses.forEach(c => {
        if (c.prompts && Array.isArray(c.prompts)) {
          c.prompts.forEach(p => { if (p && !allPrompts.includes(p)) allPrompts.push(p); });
        } else if (c.name) {
          allPrompts.push(c.name.toLowerCase());
        }
      });

      // Projenin kayıtlı model_key'ini oku (proje ayarlarında seçilen model)
      const currentProj = this.projects.find(p => p.id === this.currentCategory);
      const projModelKey = currentProj && currentProj.model_key ? currentProj.model_key : null;

      const res = await fetch('/api/auto-label-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: this.currentCategory,
          image_filename: this.currentImage.filename,
          conf_threshold: 0.08,
          model_key: projModelKey,
          prompts: allPrompts.length > 0 ? allPrompts : null
        })
      });

      const data = await res.json();
      this.showLoading(false);
      this.isAiProcessing = false;

      if (data.status === 'ok' && Array.isArray(data.boxes)) {
        this.saveHistory();
        this.boxes = data.boxes;
        this.selectedBoxIndices.clear();
        this.setDirty(true);
        this.render();
        this.updateBoxesList();
        this.showToast(`AI ${data.boxes.length} nesne tespit etti.`, 'success');
      } else {
        this.showToast(data.detail || 'Yapay zeka nesne tespit edemedi.', 'warning');
      }
    } catch (e) {
      this.showLoading(false);
      this.isAiProcessing = false;
      console.error(e);
      this.showToast('Yapay zeka işlemi sırasında sunucu hatası oluştu.', 'error');
    }
  }

  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  getClassColor(classId) {
    const projClasses = this.getProjectClasses();
    const match = projClasses.find(c => c.id === classId);
    if (match && match.color) return match.color;
    const fallbackColors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#ef4444'];
    return fallbackColors[classId % fallbackColors.length];
  }

  getClassName(classId) {
    const projClasses = this.getProjectClasses();
    const match = projClasses.find(c => c.id === classId);
    if (match && match.name) return match.name;
    return `Sınıf ${classId}`;
  }

  async deleteProject(category) {
    if (!category) return;
    const confirmed = await this.showConfirm({
      title: 'Projeyi Kalıcı Olarak Sil',
      subtitle: 'Kritik İşlem',
      message: `"${category}" projesini ve içindeki tüm resimleri/etiketleri kalıcı olarak silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`,
      confirmText: 'Evet, Projeyi Sil',
      cancelText: 'Vazgeç',
      type: 'danger'
    });
    if (!confirmed) return;

    this.showLoading(true, 'Proje siliniyor...');
    try {
      const res = await fetch('/api/projects/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: category, delete_files: true })
      });
      const data = await res.json();
      this.showLoading(false);
      if (data.status === 'ok') {
        this.showToast(`"${category}" projesi başarıyla silindi.`, 'success');
        const settingsModal = document.getElementById('projectSettingsModal');
        if (settingsModal) settingsModal.style.display = 'none';

        // Full UI refresh
        await this.loadDashboardProjects();
        await this.loadCategories();

        if (this.currentView === 'editor') {
          if (this.currentCategory === category) {
            if (this.categories.length > 0) {
              this.currentCategory = this.categories[0].id;
              this.categorySelect.value = this.currentCategory;
              await this.loadCategoryImages();
            } else {
              this.showDashboard();
            }
          }
        } else {
          this.showDashboard();
        }
      } else {
        this.showToast(data.detail || 'Proje silinemedi.', 'error');
      }
    } catch (e) {
      this.showLoading(false);
      this.showToast('Silme işlemi sırasında hata oluştu.', 'error');
    }
  }

  async getFilesFromDataTransfer(dataTransfer) {
    const files = [];
    const validExts = ['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.txt'];

    async function readAllDirectoryEntries(dirReader) {
      const entries = [];
      let readResults = await new Promise((resolve) => {
        dirReader.readEntries(res => resolve(res || []), () => resolve([]));
      });
      while (readResults && readResults.length > 0) {
        entries.push(...readResults);
        readResults = await new Promise((resolve) => {
          dirReader.readEntries(res => resolve(res || []), () => resolve([]));
        });
      }
      return entries;
    }

    async function traverseEntry(entry) {
      if (!entry) return;
      if (entry.isFile) {
        await new Promise((resolve) => {
          entry.file(f => {
            const ext = '.' + f.name.split('.').pop().toLowerCase();
            if (validExts.includes(ext)) {
              files.push(f);
            }
            resolve();
          }, () => resolve());
        });
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries = await readAllDirectoryEntries(dirReader);
        for (const child of entries) {
          await traverseEntry(child);
        }
      }
    }

    if (dataTransfer.items && dataTransfer.items.length > 0) {
      const items = Array.from(dataTransfer.items);
      for (const item of items) {
        if (item.webkitGetAsEntry) {
          const entry = item.webkitGetAsEntry();
          if (entry) await traverseEntry(entry);
        } else if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            const ext = '.' + file.name.split('.').pop().toLowerCase();
            if (validExts.includes(ext)) files.push(file);
          }
        }
      }
    } else if (dataTransfer.files) {
      for (const file of Array.from(dataTransfer.files)) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        if (validExts.includes(ext)) files.push(file);
      }
    }

    return files;
  }

  async autoDetectClassesFromFiles(files, targetContainer = null) {
    if (!files || files.length === 0) return [];

    let detectedClassNames = [];

    // 1. Search for classes.txt, data.yaml, or dataset.yaml in uploaded files
    for (const f of files) {
      const fname = f.name.toLowerCase();
      if (fname === 'classes.txt' || fname === 'labels.txt' || fname === 'names.txt') {
        try {
          const text = await f.text();
          const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
          if (lines.length > 0) {
            detectedClassNames = lines.map(l => l.replace(/^\d+[\s:.-]+/, '').trim()).filter(Boolean);
            break;
          }
        } catch (e) { }
      } else if (fname === 'data.yaml' || fname === 'dataset.yaml') {
        try {
          const text = await f.text();
          const namesMatch = text.match(/names:\s*(\[[^\]]+\]|\{[^\}]+\})/s);
          if (namesMatch) {
            const raw = namesMatch[1];
            if (raw.startsWith('[')) {
              detectedClassNames = raw.replace(/[\[\]'"]/g, '').split(',').map(s => s.trim()).filter(Boolean);
            } else {
              const matches = Array.from(raw.matchAll(/:\s*['"]?([a-zA-Z0-9_\-\s]+)['"]?/g));
              detectedClassNames = matches.map(m => m[1].trim()).filter(Boolean);
            }
            break;
          }
        } catch (e) { }
      }
    }

    // 2. If not found in metadata files, analyze image filename prefixes (e.g. bag_0001.jpg, belt_0002.jpg)
    if (detectedClassNames.length === 0) {
      const prefixCounts = {};
      const imgFiles = files.filter(f => !f.name.toLowerCase().endsWith('.txt'));

      for (const f of imgFiles) {
        const stem = f.name.substring(0, f.name.lastIndexOf('.')) || f.name;
        // Match prefix before separator: e.g. "bag_0001" -> "bag", "belt-01" -> "belt"
        const m = stem.match(/^([a-zA-ZçğıöşüÇĞİÖŞÜ]+)[_\-\s0-9]/);
        if (m) {
          const prefix = m[1].toLowerCase().trim();
          prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
        }
      }

      const candidatePrefixes = Object.keys(prefixCounts).filter(p => prefixCounts[p] >= 2);
      if (candidatePrefixes.length >= 1) {
        detectedClassNames = candidatePrefixes.sort();
      }
    }

    // 3. Auto-populate classes container if provided
    if (detectedClassNames.length > 0 && targetContainer) {
      targetContainer.innerHTML = '';
      const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#ef4444', '#6366f1'];

      detectedClassNames.forEach((name, idx) => {
        const color = colors[idx % colors.length];
        const row = document.createElement('div');
        row.className = 'class-inline-row new-proj-cls-row';
        row.dataset.id = idx;
        row.innerHTML = `
          <input type="number" class="new-cls-id" value="${idx}" style="width:50px;">
          <input type="text" class="new-cls-name" value="${name.charAt(0).toUpperCase() + name.slice(1)}" placeholder="Sınıf Adı" style="flex:1;">
          <input type="color" class="new-cls-color" value="${color}">
          <button type="button" class="btn-row-del" title="Sil">&times;</button>
        `;
        row.querySelector('.btn-row-del')?.addEventListener('click', () => row.remove());
        targetContainer.appendChild(row);
      });

      this.showToast(`${detectedClassNames.length} adet sınıf otomatik algılandı: (${detectedClassNames.join(', ')})`, 'success');
    }

    return detectedClassNames;
  }

  async uploadImagesInChunks(category, files, progressCallback = null) {
    if (!category || !files || files.length === 0) return 0;

    const CHUNK_SIZE = 80; // 80 files per HTTP request for optimal speed and reliability
    const totalFiles = files.length;
    let uploadedCount = 0;

    for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE);
      const formData = new FormData();
      formData.append('category', category);
      for (const file of chunk) {
        formData.append('files', file);
      }

      const res = await fetch('/api/projects/upload-images', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        throw new Error(`Yükleme sırasında hata oluştu (HTTP ${res.status})`);
      }

      const data = await res.json();
      uploadedCount += (data.uploaded_count || chunk.length);

      if (progressCallback) {
        const pct = Math.min(100, Math.round((uploadedCount / totalFiles) * 100));
        progressCallback(uploadedCount, totalFiles, pct);
      }
    }

    return uploadedCount;
  }

  async uploadImagesToCategory(category, files) {
    if (!category || !files || files.length === 0) return;
    this.showLoading(true, {
      title: 'Görseller Projeye Yükleniyor',
      text: `Dosyalar diske aktarılıyor...`,
      status: 'Yükleme İşlemi Aktif',
      progress: { current: 0, total: files.length, pct: 0 }
    });

    try {
      const uploaded = await this.uploadImagesInChunks(category, files, (current, total, pct) => {
        this.showLoading(true, {
          title: 'Görseller Projeye Yükleniyor',
          text: `Dosyalar diske aktarılıyor...`,
          status: 'Yükleme İşlemi Aktif',
          progress: { current, total, pct }
        });
      });

      this.showLoading(false);
      this.showToast(`${uploaded} görsel başarıyla yüklendi.`, 'success');
      await this.loadDashboardProjects();
      await this.loadCategories(category);
      if (this.currentCategory === category) {
        await this.loadCategoryImages();
      }
    } catch (e) {
      this.showLoading(false);
      console.error(e);
      this.showToast(e.message || 'Görseller yüklenirken hata oluştu.', 'error');
    }
  }

  hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length === 3) {
      hex = hex.split('').map(c => c + c).join('');
    }
    const r = parseInt(hex.substring(0, 2), 16) || 0;
    const g = parseInt(hex.substring(2, 4), 16) || 0;
    const b = parseInt(hex.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  toggleSkipEmpty() {
    this.skipEmpty = !this.skipEmpty;
    if (this.skipEmptyBtn) this.skipEmptyBtn.classList.toggle('active', this.skipEmpty);
    this.showToast(this.skipEmpty ? 'Boş resimler atlanıyor' : 'Normal gezinme modu', 'info');
  }

  showContextMenu(x, y) {
    if (!this.contextMenu) return;
    this.contextMenu.style.display = 'block';
    const menuW = 200;
    const menuH = 180;
    const safeX = Math.min(x, window.innerWidth - menuW - 8);
    const safeY = Math.min(y, window.innerHeight - menuH - 8);
    this.contextMenu.style.left = `${Math.max(0, safeX)}px`;
    this.contextMenu.style.top = `${Math.max(0, safeY)}px`;
  }

  hideContextMenu() {
    if (this.contextMenu) this.contextMenu.style.display = 'none';
  }

  updateProgressBar() {
    if (!this.progressBarFill) return;
    const total = this.filteredImages.length;
    if (total === 0) {
      this.progressBarFill.style.width = '0%';
      if (this.categoryStatsBadge) this.categoryStatsBadge.textContent = '0/0';
      return;
    }
    const currentNum = this.currentIndex + 1;
    const progressPct = ((currentNum / total) * 100).toFixed(1);
    this.progressBarFill.style.width = `${progressPct}%`;
    this.progressBarFill.title = `Konum: ${currentNum} / ${total} (%${progressPct})`;

    const labeled = this.filteredImages.filter(img => img.box_count > 0).length;
    const labeledPct = ((labeled / total) * 100).toFixed(1);
    if (this.categoryStatsBadge) {
      this.categoryStatsBadge.textContent = `${labeled}/${total} (%${Math.round(labeledPct)})`;
      this.categoryStatsBadge.title = `${labeled} / ${total} resim etiketlendi (%${labeledPct})`;
    }
  }

  async loadStats() {
    if (!this.statsContainer) return;
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      this.renderStats(data.stats, data.classes);
    } catch (e) {
      if (this.statsContainer) {
        this.statsContainer.innerHTML = '<div class="empty-state">İstatistikler yüklenemedi.</div>';
      }
    }
  }

  renderStats(stats, classes) {
    if (!this.statsContainer) return;
    if (!stats || stats.length === 0) {
      this.statsContainer.innerHTML = '<div class="empty-state">Veri yok.</div>';
      return;
    }

    this.statsContainer.innerHTML = '';
    stats.forEach(cat => {
      const pct = cat.image_count > 0 ? (cat.label_count / cat.image_count * 100).toFixed(1) : 0;
      const row = document.createElement('div');
      row.className = 'stat-row';
      row.innerHTML = `
        <div class="stat-row-header">
          <span class="stat-cat-name">
            <span class="stat-dot" style="background:${cat.color};"></span>
            ${cat.name}
          </span>
          <span class="stat-numbers">${cat.label_count}/${cat.image_count} <span style="color:var(--text-dim)">(%${pct})</span></span>
        </div>
        <div class="stat-progress-track">
          <div class="stat-progress-fill" style="width:${pct}%; background:${cat.color};"></div>
        </div>
        <div class="stat-box-count">${cat.label_count} etiketli görsel</div>
      `;
      this.statsContainer.appendChild(row);
    });
  }

  async refineSelectedBoxes() {
    const cat = this.currentCategory || this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'accessory_detection_project';
    const fname = (typeof this.currentImage === 'string' ? this.currentImage : this.currentImage?.filename) || document.getElementById('metaFilename')?.textContent.trim();
    if (!fname || this.isAiProcessing) return;

    if (this.selectedBoxIndices.size === 0) {
      return this.autoLabelCurrent();
    }

    this.isAiProcessing = true;
    if (this.autoLabelBtn) this.autoLabelBtn.classList.add('loading');
    this.showLoading(true, 'AI seçili kutuyu nesne sınırlarına tam oturtuyor... Lütfen bekleyiniz.');

    const targetIndices = Array.from(this.selectedBoxIndices);
    const targetBoxes = targetIndices.map(i => this.boxes[i]);

    try {
      const res = await fetch('/api/refine-bounding-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: cat,
          image_filename: fname,
          boxes: targetBoxes
        })
      });
      const data = await res.json();

      if (data.status === 'ok' && data.boxes && data.boxes.length > 0) {
        this.saveHistory();
        data.boxes.forEach((newBox, idx) => {
          const originalIndex = targetIndices[idx];
          if (originalIndex !== undefined && this.boxes[originalIndex]) {
            this.boxes[originalIndex] = {
              ...this.boxes[originalIndex],
              x_center: newBox.x_center,
              y_center: newBox.y_center,
              width: newBox.width,
              height: newBox.height,
              class_id: newBox.class_id !== undefined ? newBox.class_id : this.boxes[originalIndex].class_id
            };
          }
        });
        this.setDirty(true);
        this.render();
        this.updateBoxesList();
        this.playFeedbackTone('snap');
        this.showToast(`AI ${data.boxes.length} adet kutuyu nesne sınırlarına tam oturttu. ✓`, 'success');
      } else {
        this.showToast('Kutu sınırları sıkılaştırılmadı.', 'warning');
      }
    } catch (e) {
      console.error(e);
      this.showToast('AI servisine bağlanılamadı.', 'error');
    } finally {
      this.isAiProcessing = false;
      if (this.autoLabelBtn) this.autoLabelBtn.classList.remove('loading');
      this.showLoading(false);
    }
  }

  async autoLabelCurrent() {
    if (!this.currentImage || !this.currentCategory || this.isAiProcessing) return;
    this.isAiProcessing = true;
    if (this.autoLabelBtn) this.autoLabelBtn.classList.add('loading');
    if (this.prevBtn) this.prevBtn.disabled = true;
    if (this.nextBtn) this.nextBtn.disabled = true;

    this.showLoading(true, 'Yapay zeka nesneleri tespit ediyor... Lütfen bekleyiniz.');

    try {
      const res = await fetch('/api/auto-label-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: this.currentCategory,
          image_filename: this.currentImage.filename,
          conf_threshold: 0.07
        })
      });
      const data = await res.json();
      if (data.status === 'ok') {
        if (data.boxes && data.boxes.length > 0) {
          this.saveHistory();
          this.boxes = data.boxes;
          this.selectedBoxIndices.clear();
          this.boxes.forEach((_, i) => this.selectedBoxIndices.add(i));
          this.setDirty(true);
          this.render();
          this.updateBoxesList();
          this.showToast(`AI ${data.boxes.length} adet nesne tespit etti.`, 'success');
        } else {
          this.showToast('AI bu görselde belirgin nesne tespit edemedi.', 'info');
        }
      } else {
        this.showToast('AI etiketleme başarısız oldu.', 'error');
      }
    } catch (e) {
      console.error(e);
      this.showToast('AI etiketleme servisine bağlanılamadı.', 'error');
    } finally {
      this.isAiProcessing = false;
      if (this.autoLabelBtn) this.autoLabelBtn.classList.remove('loading');
      this.showLoading(false);
      if (this.prevBtn) this.prevBtn.disabled = this.currentIndex <= 0;
      if (this.nextBtn) this.nextBtn.disabled = this.currentIndex >= this.filteredImages.length - 1;
    }
  }

  async deleteCurrentImage() {
    if (!this.currentImage || !this.currentCategory) return;
    await this.deleteImage(this.currentImage.filename, this.currentIndex);
  }

  async deleteImage(filename, targetIdx) {
    if (!filename || !this.currentCategory) return;

    const confirmed = await this.showConfirm({
      title: 'Görseli Kalıcı Olarak Sil',
      subtitle: 'Kalıcı İşlem',
      message: `"${filename}" görselini ve varsa etiket dosyasını kalıcı olarak silmek istiyor musunuz?`,
      confirmText: 'Evet, Görseli Sil',
      cancelText: 'Vazgeç',
      type: 'danger'
    });
    if (!confirmed) return;

    this.showLoading(true, 'Görsel siliniyor...');
    try {
      const res = await fetch('/api/delete-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: this.currentCategory,
          filename: filename
        })
      });

      const data = await res.json();
      this.showLoading(false);

      if (data.status === 'ok') {
        this.showToast(`"${filename}" başarıyla silindi.`, 'success');

        // Remove from memory
        this.images = this.images.filter(img => img.filename !== filename);
        this.filteredImages = this.filteredImages.filter(img => img.filename !== filename);
        if (this.totalImagesCount) {
          this.totalImagesCount.textContent = this.filteredImages.length;
        }

        // Update category stats count
        const catObj = this.categories.find(c => c.id === this.currentCategory);
        if (catObj && catObj.image_count > 0) {
          catObj.image_count -= 1;
        }

        if (this.filteredImages.length === 0) {
          this.currentImage = null;
          this.boxes = [];
          this.clearCanvas();
          this.updateMetaDisplay();
          this.renderImageList();
          this.updateProgressBar();
          this.showToast('Bu projede hiç görsel kalmadı.', 'info');
        } else {
          const nextIdx = Math.min(targetIdx, this.filteredImages.length - 1);
          this.renderImageList();
          await this.goToIndex(nextIdx);
        }

        // Background sync dashboard stats
        this.loadDashboardProjects();
      } else {
        this.showToast(data.detail || 'Görsel silinemedi.', 'error');
      }
    } catch (e) {
      this.showLoading(false);
      console.error(e);
      this.showToast('Görsel silinirken sunucu hatası oluştu.', 'error');
    }
  }

  toggleFlag() {
    if (!this.currentImage) return;
    const fname = this.currentImage.filename;
    if (this.flaggedImages.has(fname)) {
      this.flaggedImages.delete(fname);
      this.showToast('İşaret kaldırıldı', 'info');
    } else {
      this.flaggedImages.add(fname);
      this.showToast('Resim işaretlendi', 'info');
    }
    localStorage.setItem('yolo_flagged_images', JSON.stringify(Array.from(this.flaggedImages)));
    if (this.flagBtn) this.flagBtn.classList.toggle('active', this.flaggedImages.has(fname));
    this.renderImageList();
  }

  nudgeSelectedBoxes(key, isShift, isAlt) {
    if (this.selectedBoxIndices.size === 0) return;
    this.saveHistory();
    const cW = this.canvas.width;
    const cH = this.canvas.height;
    const step = isShift ? 10 : (isAlt ? 2 : 1);
    const dx = step / cW;
    const dy = step / cH;

    this.selectedBoxIndices.forEach(idx => {
      const b = this.boxes[idx];
      if (!b) return;
      if (isAlt) {
        if (key === 'ArrowRight') b.width = Math.min(1.0, b.width + dx * 2);
        if (key === 'ArrowLeft') b.width = Math.max(0.005, b.width - dx * 2);
        if (key === 'ArrowDown') b.height = Math.min(1.0, b.height + dy * 2);
        if (key === 'ArrowUp') b.height = Math.max(0.005, b.height - dy * 2);
      } else {
        if (key === 'ArrowRight') b.x_center = Math.min(1.0 - b.width / 2, b.x_center + dx);
        if (key === 'ArrowLeft') b.x_center = Math.max(b.width / 2, b.x_center - dx);
        if (key === 'ArrowDown') b.y_center = Math.min(1.0 - b.height / 2, b.y_center + dy);
        if (key === 'ArrowUp') b.y_center = Math.max(b.height / 2, b.y_center - dy);
      }
    });

    this.setDirty(true);
    this.render();
    this.updateBoxesList();
  }

  renderLoupe(pt) {
    if (!this.loupeCanvas || !this.loupeCtx || !this.imageObj) return;
    if (!this.isLoupeActive && !this.isZPressed) {
      this.loupeCanvas.style.display = 'none';
      return;
    }
    if (pt.x < 0 || pt.y < 0 || pt.x > this.canvas.width || pt.y > this.canvas.height) {
      this.loupeCanvas.style.display = 'none';
      return;
    }

    this.loupeCanvas.style.display = 'block';
    this.loupeCanvas.style.left = `${pt.x}px`;
    this.loupeCanvas.style.top = `${pt.y}px`;

    const lW = this.loupeCanvas.width;
    const lH = this.loupeCanvas.height;
    const mag = 3.2; // 3.2x high-resolution magnification

    this.loupeCtx.clearRect(0, 0, lW, lH);
    this.loupeCtx.save();

    // Smooth circular clipping
    this.loupeCtx.beginPath();
    this.loupeCtx.arc(lW / 2, lH / 2, lW / 2 - 2, 0, Math.PI * 2);
    this.loupeCtx.clip();

    const srcW = lW / mag;
    const srcH = lH / mag;
    const srcX = pt.x - srcW / 2;
    const srcY = pt.y - srcH / 2;

    this.loupeCtx.imageSmoothingEnabled = true;
    this.loupeCtx.imageSmoothingQuality = 'high';
    this.loupeCtx.drawImage(this.canvas, srcX, srcY, srcW, srcH, 0, 0, lW, lH);

    // Crosshair backing line for contrast
    this.loupeCtx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    this.loupeCtx.lineWidth = 3;
    this.loupeCtx.beginPath();
    this.loupeCtx.moveTo(lW / 2 - 22, lH / 2);
    this.loupeCtx.lineTo(lW / 2 + 22, lH / 2);
    this.loupeCtx.moveTo(lW / 2, lH / 2 - 22);
    this.loupeCtx.lineTo(lW / 2, lH / 2 + 22);
    this.loupeCtx.stroke();

    // Laser crosshair inside loupe
    this.loupeCtx.strokeStyle = '#60a5fa';
    this.loupeCtx.lineWidth = 1.5;
    this.loupeCtx.beginPath();
    this.loupeCtx.moveTo(lW / 2 - 22, lH / 2);
    this.loupeCtx.lineTo(lW / 2 + 22, lH / 2);
    this.loupeCtx.moveTo(lW / 2, lH / 2 - 22);
    this.loupeCtx.lineTo(lW / 2, lH / 2 + 22);
    this.loupeCtx.stroke();

    // Center precision reticle
    this.loupeCtx.fillStyle = '#60a5fa';
    this.loupeCtx.beginPath();
    this.loupeCtx.arc(lW / 2, lH / 2, 3, 0, Math.PI * 2);
    this.loupeCtx.fill();

    this.loupeCtx.restore();
  }

  navigatePrev() {
    if (this.currentIndex > 0) this.goToIndex(this.currentIndex - 1);
  }

  navigateNext() {
    if (this.currentIndex < this.filteredImages.length - 1) this.goToIndex(this.currentIndex + 1);
  }

  // =========================================================================
  // 1. SMART SEGMENT (CLICK-TO-SEGMENT)
  // =========================================================================
  async executeSmartSegment(clickX, clickY) {
    const cat = this.currentCategory || this.activeHubProjectId || new URLSearchParams(location.search).get('project') || 'accessory_detection_project';
    const fname = (typeof this.currentImage === 'string' ? this.currentImage : this.currentImage?.filename) || document.getElementById('metaFilename')?.textContent.trim();
    if (!fname || this.isAiProcessing) return;

    this.isAiProcessing = true;
    this.showLoading(true, '🪄 AI nesne sınırlarını algılıyor...');

    try {
      const res = await fetch('/api/smart-segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: cat,
          image_filename: fname,
          click_x: clickX,
          click_y: clickY,
          class_id: (this.currentClassId !== undefined && this.currentClassId !== null) ? this.currentClassId : 0
        })
      });
      const data = await res.json();
      if (data.status === 'ok' && data.box) {
        this.saveHistory();
        this.boxes.push({
          x_center: data.box.x_center,
          y_center: data.box.y_center,
          width: data.box.width,
          height: data.box.height,
          class_id: data.box.class_id !== undefined ? data.box.class_id : (this.currentClassId || 0)
        });
        this.selectedBoxIndices.clear();
        this.selectedBoxIndices.add(this.boxes.length - 1);
        this.setDirty(true);
        this.render();
        this.updateBoxesList();
        this.playFeedbackTone('success');
        this.showToast('🪄 AI nesneyi algıladı ve kutuyu başarıyla oturttu. ✓', 'success');
      } else {
        this.showToast('Nesne algılanamadı, lütfen nesnenin merkezine tıklayınız.', 'warning');
      }
    } catch (err) {
      console.error(err);
      this.showToast('Akıllı bölütleme servisine bağlanılamadı.', 'error');
    } finally {
      this.isAiProcessing = false;
      this.showLoading(false);
    }
  }

  // =========================================================================
  // 2. DATASET HEALTH DOCTOR
  // =========================================================================
  async openHealthModal(projectId) {
    const modal = document.getElementById('datasetHealthModal');
    if (!modal) return;
    modal.style.display = 'flex';

    const loadingBox = document.getElementById('healthLoadingBox');
    const contentBox = document.getElementById('healthContentBox');
    if (loadingBox) loadingBox.style.display = 'block';
    if (contentBox) contentBox.style.display = 'none';

    try {
      const res = await fetch(`/api/projects/health-check?category=${encodeURIComponent(projectId)}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        if (loadingBox) loadingBox.style.display = 'none';
        if (contentBox) contentBox.style.display = 'flex';

        const scoreEl = document.getElementById('healthScoreTxt');
        const badgeEl = document.getElementById('healthScoreBadge');
        if (scoreEl) scoreEl.textContent = data.health_score;
        if (badgeEl) {
          if (data.health_score >= 85) {
            badgeEl.textContent = 'Mükemmel';
            badgeEl.style.color = '#34d399';
            badgeEl.style.background = 'rgba(16,185,129,0.15)';
          } else if (data.health_score >= 65) {
            badgeEl.textContent = 'İyi (Düzeltilebilir)';
            badgeEl.style.color = '#fbbf24';
            badgeEl.style.background = 'rgba(245,158,11,0.15)';
          } else {
            badgeEl.textContent = 'Kritik Kusurlar Var';
            badgeEl.style.color = '#f87171';
            badgeEl.style.background = 'rgba(239,68,68,0.15)';
          }
        }

        document.getElementById('healthTotalImgs').textContent = (data.total_images || 0).toLocaleString();
        document.getElementById('healthLabeledImgs').textContent = (data.labeled_images || 0).toLocaleString();
        document.getElementById('healthTotalBoxes').textContent = (data.total_boxes || 0).toLocaleString();
        document.getElementById('healthMicroCount').textContent = data.micro_boxes_count || 0;
        document.getElementById('healthDupCount').textContent = data.duplicate_boxes_count || 0;

        const barsList = document.getElementById('healthClassBarsList');
        if (barsList) {
          barsList.innerHTML = '';
          const dist = data.class_distribution || [];
          dist.forEach(c => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:10px; font-size:0.75rem;';
            row.innerHTML = `
              <span style="width:75px; color:#f8fafc; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.name}</span>
              <div style="flex:1; height:6px; background:rgba(255,255,255,0.06); border-radius:3px; overflow:hidden;">
                <div style="width:${Math.min(100, c.percentage * 2)}%; height:100%; background:#38bdf8; border-radius:3px;"></div>
              </div>
              <span style="width:40px; text-align:right; color:#94a3b8; font-weight:600;">${c.count}</span>
              <span style="width:40px; text-align:right; color:#38bdf8; font-weight:700;">%${c.percentage}</span>
            `;
            barsList.appendChild(row);
          });
        }

        const fixMicroBtn = document.getElementById('healthFixMicroBtn');
        if (fixMicroBtn) {
          fixMicroBtn.onclick = async () => {
            fixMicroBtn.disabled = true;
            fixMicroBtn.textContent = 'Temizleniyor...';
            await fetch('/api/projects/health-fix', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ category: projectId, fix_micro_boxes: true, fix_duplicates: false })
            });
            this.showToast('🧹 Mikro kutular temizlendi!', 'success');
            this.openHealthModal(projectId);
          };
        }

        const fixDupBtn = document.getElementById('healthFixDupBtn');
        if (fixDupBtn) {
          fixDupBtn.onclick = async () => {
            fixDupBtn.disabled = true;
            fixDupBtn.textContent = 'Ayıklanıyor...';
            await fetch('/api/projects/health-fix', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ category: projectId, fix_micro_boxes: false, fix_duplicates: true })
            });
            this.showToast('✂️ Çakışan kutular başarıyla ayıklandı!', 'success');
            this.openHealthModal(projectId);
          };
        }

      }
    } catch (err) {
      console.error(err);
      this.showToast('Sağlık kontrolü yapılamadı.', 'error');
    }
  }

  // =========================================================================
  // 3. AUGMENTATION STUDIO (LIVE PREVIEW)
  // =========================================================================
  openAugmentationModal(projectId) {
    const modal = document.getElementById('augmentationStudioModal');
    if (!modal) return;
    modal.style.display = 'flex';

    this.renderAugmentationCanvasPreview();

    ['augFlipCheck', 'augBrightRange', 'augBlurRange', 'augRotateRange'].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => {
        const brightVal = document.getElementById('augBrightRange')?.value;
        const blurVal = document.getElementById('augBlurRange')?.value;
        const rotVal = document.getElementById('augRotateRange')?.value;
        if (document.getElementById('augBrightVal')) document.getElementById('augBrightVal').textContent = (brightVal > 0 ? '+' : '') + brightVal + '%';
        if (document.getElementById('augBlurVal')) document.getElementById('augBlurVal').textContent = blurVal + ' px';
        if (document.getElementById('augRotateVal')) document.getElementById('augRotateVal').textContent = rotVal + '°';
        this.renderAugmentationCanvasPreview();
      });
    });

    document.getElementById('augGenerateBtn')?.addEventListener('click', () => {
      this.showToast('🚀 Veri çoğaltma paketi hazırlanıyor, indirme başlayacak...', 'info');
      this.openExportModal(projectId);
      modal.style.display = 'none';
    });
  }

  renderAugmentationCanvasPreview() {
    const canvas = document.getElementById('augPreviewCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const cW = canvas.width;
    const cH = canvas.height;
    ctx.clearRect(0, 0, cW, cH);

    const isFlip = document.getElementById('augFlipCheck')?.checked ?? true;
    const bright = parseInt(document.getElementById('augBrightRange')?.value || 15);
    const blur = parseInt(document.getElementById('augBlurRange')?.value || 0);
    const rotDeg = parseInt(document.getElementById('augRotateRange')?.value || -6);

    ctx.save();
    ctx.translate(cW / 2, cH / 2);
    ctx.rotate((rotDeg * Math.PI) / 180);
    if (isFlip) ctx.scale(-1, 1);

    ctx.filter = `brightness(${100 + bright}%) blur(${blur}px)`;

    if (this.imageObj && this.imageObj.complete) {
      const scale = Math.min((cW * 0.8) / this.imageObj.naturalWidth, (cH * 0.8) / this.imageObj.naturalHeight);
      const drawW = this.imageObj.naturalWidth * scale;
      const drawH = this.imageObj.naturalHeight * scale;
      ctx.drawImage(this.imageObj, -drawW / 2, -drawH / 2, drawW, drawH);

      ctx.filter = 'none';
      (this.boxes || []).forEach(b => {
        const bx = (-drawW / 2) + (b.x_center - b.width / 2) * drawW;
        const by = (-drawH / 2) + (b.y_center - b.height / 2) * drawH;
        const bw = b.width * drawW;
        const bh = b.height * drawH;

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        ctx.fillStyle = 'rgba(56,189,248,0.2)';
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
      });
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(-150, -100, 300, 200);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.fillText('Örnek Görsel Yükleniyor...', -70, 0);
    }
    ctx.restore();
  }

  // =========================================================================
  // 4. LIVE METRICS TRAINING CHART
  // =========================================================================
  updateLiveTrainingChart(epoch, loss, map50) {
    if (!this.trainHistory) this.trainHistory = [];
    this.trainHistory.push({ epoch, loss: parseFloat(loss) || 0, map: parseFloat(map50) || 0 });

    const canvas = document.getElementById('trainLiveMetricsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let y = 20; y < h; y += 30) {
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(w - 10, y);
      ctx.stroke();
    }

    if (this.trainHistory.length < 2) return;

    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const maxLoss = 3.0;
    this.trainHistory.forEach((pt, i) => {
      const x = 30 + (i / (this.trainHistory.length - 1)) * (w - 45);
      const y = Math.max(10, Math.min(h - 15, h - (pt.loss / maxLoss) * (h - 25)));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    this.trainHistory.forEach((pt, i) => {
      const x = 30 + (i / (this.trainHistory.length - 1)) * (w - 45);
      const y = Math.max(10, Math.min(h - 15, h - pt.map * (h - 25)));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // =========================================================================
  // 6. CUSTOM MODEL HUB & INTERACTIVE PLAYGROUND (BYOM)
  // =========================================================================
  async loadModelHub() {
    const container = document.getElementById('modelCardsContainer');
    const badge = document.getElementById('modelsTotalBadge');
    const pgSelect = document.getElementById('pgModelSelect');
    const batchSelect = document.getElementById('batchModelSelect');

    if (container) container.innerHTML = '<div style="text-align:center; padding:30px; color:#94a3b8; grid-column:1/-1;">Modeller taranıyor...</div>';

    try {
      const res = await fetch('/api/models/list');
      const data = await res.json();
      if (!res.ok || data.status !== 'ok') throw new Error(data.detail || 'Modeller alınamadı');

      const models = data.models || [];
      if (badge) badge.textContent = `${models.length} Model Kullanılabilir`;

      // Update Playground & Batch Select Dropdowns
      if (pgSelect) {
        pgSelect.innerHTML = models.map(m => `<option value="${m.key}">${m.name} (${m.format})</option>`).join('');
      }
      if (batchSelect) {
        const curVal = batchSelect.value;
        batchSelect.innerHTML = models.map(m => {
          const isWorld = (m.key === 'yolov8s-worldv2');
          const isSelected = (curVal ? m.key === curVal : isWorld) ? 'selected' : '';
          const tag = isWorld ? '[Önerilen]' : (m.type === 'custom' ? '[Özel Model]' : '[Standart]');
          return `<option value="${m.key}" ${isSelected}>${tag} ${m.name}</option>`;
        }).join('');
      }

      if (!container) return;
      container.innerHTML = '';

      models.forEach(m => {
        const card = document.createElement('div');
        card.className = 'model-hub-card';
        card.style.cssText = 'background:rgba(15,23,42,0.85); border:1px solid rgba(255,255,255,0.09); border-radius:14px; padding:20px; display:flex; flex-direction:column; gap:14px; transition:all 0.2s ease; position:relative; box-shadow:0 4px 16px rgba(0,0,0,0.25);';

        const isCustom = (m.type === 'custom');
        const isBuiltIn = (m.type === 'built_in');
        const badgeColor = isCustom ? '#c084fc' : (isBuiltIn ? '#38bdf8' : '#34d399');
        const badgeBg = isCustom ? 'rgba(168,85,247,0.12)' : (isBuiltIn ? 'rgba(56,189,248,0.12)' : 'rgba(16,185,129,0.12)');
        const badgeTxt = isCustom ? 'Özel Yüklenen Model' : (isBuiltIn ? 'Sistem Modeli' : 'Eğitilmiş Model');

        let classesHtml = '';
        if (Array.isArray(m.classes) && m.classes.length > 0) {
          const displayClasses = m.classes.slice(0, 6);
          classesHtml = displayClasses.map(c => `<span style="font-size:0.72rem; background:rgba(255,255,255,0.06); color:#cbd5e1; padding:2px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">${c}</span>`).join('');
          if (m.classes.length > 6) {
            classesHtml += `<span style="font-size:0.72rem; color:#94a3b8; padding:2px 6px; font-weight:600;">+${m.classes.length - 6} daha</span>`;
          }
        }

        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.72rem; font-weight:700; color:${badgeColor}; background:${badgeBg}; padding:3px 10px; border-radius:8px; border:1px solid ${badgeColor}35;">
              ${badgeTxt}
            </span>
            <span style="font-size:0.75rem; color:#64748b; font-weight:600;">${m.file_size_mb} MB</span>
          </div>
          <div>
            <strong style="color:#f8fafc; font-size:1.05rem; display:block; margin-bottom:4px; letter-spacing:-0.01em;">${m.name}</strong>
            <p style="color:#94a3b8; font-size:0.8rem; margin:0; line-height:1.45;">${m.description || ''}</p>
          </div>
          <div style="margin-top:auto; padding-top:12px; border-top:1px solid rgba(255,255,255,0.06);">
            <div style="font-size:0.75rem; color:#cbd5e1; font-weight:700; margin-bottom:8px;">Tanıdığı Sınıflar (${m.class_count}):</div>
            <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:14px;">
              ${classesHtml}
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button class="btn-primary test-in-pg-btn" style="flex:1; padding:8px 12px; font-size:0.82rem; font-weight:700; justify-content:center; background:#0284c7; display:flex; align-items:center; gap:6px; border:none; border-radius:8px; box-shadow:0 2px 8px rgba(2,132,199,0.3);">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span>Canlı Test</span>
              </button>
              <button class="btn-secondary use-in-batch-btn" style="padding:8px 12px; font-size:0.82rem; font-weight:600; color:#38bdf8; display:flex; align-items:center; gap:5px; border-radius:8px;" title="Toplu Etiketlemede Seç">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Seç</span>
              </button>
              <button class="btn-secondary get-api-code-btn" style="padding:8px 10px; font-size:0.82rem; font-weight:600; color:#cbd5e1; display:flex; align-items:center; gap:5px; border-radius:8px;" title="Inference REST API Kodunu Al">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                <span>API</span>
              </button>
              ${m.can_delete ? `
                <button class="btn-secondary delete-model-btn" style="padding:8px 10px; font-size:0.82rem; color:#f87171; border-color:rgba(239,68,68,0.3); border-radius:8px; display:flex; align-items:center; justify-content:center;" title="Modeli Sil">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              ` : ''}
            </div>
          </div>
        `;

        card.querySelector('.get-api-code-btn')?.addEventListener('click', () => {
          this.showApiCodeModal(m);
        });

        card.querySelector('.test-in-pg-btn')?.addEventListener('click', () => {
          if (pgSelect) pgSelect.value = m.key;
          document.getElementById('pgImageFileInput')?.click();
        });

        card.querySelector('.use-in-batch-btn')?.addEventListener('click', () => {
          const cat = this.activeHubProjectId || 'accessory_detection_project';
          this.openBatchModal(cat);
          setTimeout(() => {
            const bSel = document.getElementById('batchModelSelect');
            if (bSel) bSel.value = m.key;
          }, 200);
          this.showToast(`"${m.name}" otomatik etiketleme için seçildi. ✓`, 'success');
        });

        card.querySelector('.delete-model-btn')?.addEventListener('click', async () => {
          const confirmed = await this.showConfirm({
            title: 'Modeli Kalıcı Olarak Sil',
            subtitle: 'Model Havuzu',
            message: `"${m.name}" modelini kalıcı olarak silmek istediğinize emin misiniz?`,
            confirmText: 'Evet, Modeli Sil',
            cancelText: 'Vazgeç',
            type: 'danger'
          });
          if (!confirmed) return;
          try {
            const delRes = await fetch(`/api/models/${encodeURIComponent(m.key)}`, { method: 'DELETE' });
            const delData = await delRes.json();
            if (delRes.ok && delData.status === 'ok') {
              this.showToast(delData.message, 'success');
              this.loadModelHub();
            } else {
              this.showToast(delData.detail || 'Model silinemedi', 'error');
            }
          } catch (e) {
            this.showToast('Silme hatası', 'error');
          }
        });

        container.appendChild(card);
      });
    } catch (err) {
      console.error(err);
      if (container) container.innerHTML = `<div style="color:#f87171; text-align:center; padding:20px; grid-column:1/-1;">Modeller yüklenemedi: ${err.message}</div>`;
    }
  }

  showApiCodeModal(model) {
    let modal = document.getElementById('apiCodeSnippetModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'apiCodeSnippetModal';
      modal.className = 'modal-backdrop';
      modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(6px); z-index:9999; align-items:center; justify-content:center;';
      modal.innerHTML = `
        <div style="background:#0f172a; border:1px solid rgba(255,255,255,0.15); border-radius:18px; width:90%; max-width:640px; padding:24px; box-shadow:0 20px 40px rgba(0,0,0,0.6);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
              <h3 style="font-size:1.15rem; font-weight:800; color:#f8fafc; margin:0;">Canlı REST API Entegrasyonu</h3>
            </div>
            <button onclick="document.getElementById('apiCodeSnippetModal').style.display='none'" style="background:none; border:none; color:#94a3b8; font-size:1.3rem; cursor:pointer;">✕</button>
          </div>
          <p style="color:#94a3b8; font-size:0.85rem; margin-bottom:16px;">Bu modeli kendi Python betiklerinizden, web sitelerinizden veya mobil uygulamanızdan çağırmak için aşağıdaki kodu kullanabilirsiniz:</p>
          
          <div style="display:flex; gap:8px; margin-bottom:12px;">
            <button id="apiTabPythonBtn" class="btn-primary" style="padding:6px 14px; font-size:0.8rem;">Python (requests)</button>
            <button id="apiTabCurlBtn" class="btn-secondary" style="padding:6px 14px; font-size:0.8rem;">cURL (Terminal)</button>
          </div>

          <div style="position:relative;">
            <pre id="apiCodeBlock" style="background:#020617; border:1px solid rgba(255,255,255,0.1); border-radius:10px; padding:16px; font-size:0.82rem; color:#38bdf8; font-family:monospace; overflow-x:auto; max-height:260px;"></pre>
            <button id="apiCopyCodeBtn" style="position:absolute; top:10px; right:10px; padding:6px 12px; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.15); border-radius:6px; color:#fff; font-size:0.75rem; cursor:pointer; display:flex; align-items:center; gap:5px;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Kopyala</span>
            </button>
          </div>

          <div style="margin-top:20px; text-align:right;">
            <button onclick="document.getElementById('apiCodeSnippetModal').style.display='none'" class="btn-secondary" style="padding:8px 18px; border-radius:10px;">Kapat</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }

    const host = window.location.origin || 'http://localhost:8000';
    const pyCode = `import requests

url = "${host}/api/predict"
with open("test_image.jpg", "rb") as f:
    files = {"file": f}
    data = {
        "model_key": "${model.key}",
        "conf": 0.25
    }
    response = requests.post(url, files=files, data=data)
    print("Tespitler:", response.json())`;

    const curlCode = `curl -X POST "${host}/api/predict" \\
  -F "model_key=${model.key}" \\
  -F "conf=0.25" \\
  -F "file=@test_image.jpg"`;

    let activeSnippet = pyCode;
    const pre = document.getElementById('apiCodeBlock');
    if (pre) pre.textContent = pyCode;

    const pyBtn = document.getElementById('apiTabPythonBtn');
    const curlBtn = document.getElementById('apiTabCurlBtn');
    if (pyBtn && curlBtn) {
      pyBtn.onclick = () => {
        pyBtn.className = 'btn-primary';
        curlBtn.className = 'btn-secondary';
        activeSnippet = pyCode;
        if (pre) pre.textContent = pyCode;
      };
      curlBtn.onclick = () => {
        curlBtn.className = 'btn-primary';
        pyBtn.className = 'btn-secondary';
        activeSnippet = curlCode;
        if (pre) pre.textContent = curlCode;
      };
    }

    const copyBtn = document.getElementById('apiCopyCodeBtn');
    if (copyBtn) {
      copyBtn.onclick = () => {
        navigator.clipboard.writeText(activeSnippet).then(() => {
          this.showToast('API Kodu panoya kopyalandı. ✓', 'success');
        });
      };
    }

    modal.style.display = 'flex';
  }

  playFeedbackTone(type = 'success') {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12); // A5
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'snap') {
        osc.frequency.setValueAtTime(750, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      }
    } catch (e) {}
  }

  setupModelHubEventListeners() {
    const uploadCard = document.getElementById('modelUploadCard');
    document.getElementById('openUploadModelBtn')?.addEventListener('click', () => {
      if (uploadCard) uploadCard.style.display = 'block';
    });
    document.getElementById('closeModelUploadCardBtn')?.addEventListener('click', () => {
      if (uploadCard) uploadCard.style.display = 'none';
    });
    document.getElementById('cancelModelUploadBtn')?.addEventListener('click', () => {
      if (uploadCard) uploadCard.style.display = 'none';
    });
    document.getElementById('refreshModelsBtn')?.addEventListener('click', () => {
      this.loadModelHub();
    });

    document.getElementById('modelUploadForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fileInput = document.getElementById('modelFileInput');
      const nameInput = document.getElementById('modelNameInput');
      const descInput = document.getElementById('modelDescInput');
      const submitBtn = document.getElementById('submitModelUploadBtn');

      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        this.showToast('Lütfen bir .pt veya .onnx model dosyası seçiniz.', 'warning');
        return;
      }

      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model_name', nameInput?.value.trim() || file.name);
      formData.append('description', descInput?.value.trim() || '');

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>⏳ Model doğrulanıyor...</span>';
      }
      this.showLoading(true, 'Model taranıyor ve sınıfları algılanıyor...');

      try {
        const res = await fetch('/api/models/upload', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(`🎉 ${data.message}`, 'success');
          if (uploadCard) uploadCard.style.display = 'none';
          fileInput.value = '';
          if (nameInput) nameInput.value = '';
          if (descInput) descInput.value = '';
          await this.loadModelHub();
        } else {
          this.showToast(data.detail || 'Model yükleme başarısız.', 'error');
        }
      } catch (err) {
        console.error(err);
        this.showToast('Sunucu bağlantı hatası', 'error');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<span>⬆ Modeli Yükle ve Doğrula</span>';
        }
        this.showLoading(false);
      }
    });

    const pgUploadBtn = document.getElementById('pgUploadBtn');
    const pgImageFileInput = document.getElementById('pgImageFileInput');
    const pgConfRange = document.getElementById('pgConfRange');
    const pgConfVal = document.getElementById('pgConfVal');

    if (pgConfRange && pgConfVal) {
      pgConfRange.addEventListener('input', (e) => {
        pgConfVal.textContent = `%${Math.round(parseFloat(e.target.value) * 100)}`;
      });
    }

    pgUploadBtn?.addEventListener('click', () => pgImageFileInput?.click());

    pgImageFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const modelKey = document.getElementById('pgModelSelect')?.value || 'yolov8s-worldv2';
      const conf = parseFloat(pgConfRange?.value || '0.20');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('model_key', modelKey);
      formData.append('conf', conf);

      this.showLoading(true, 'Yapay zeka görseli tarıyor ve nesneleri tespit ediyor...');

      try {
        const res = await fetch('/api/models/test-predict', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          const resArea = document.getElementById('pgResultArea');
          const resImg = document.getElementById('pgAnnotatedImg');
          const countBadge = document.getElementById('pgDetectionCountBadge');
          const listEl = document.getElementById('pgDetectionsList');

          if (resArea) resArea.style.display = 'block';
          if (resImg) resImg.src = data.image_base64;
          if (countBadge) countBadge.textContent = `${data.total_detections} Nesne Bulundu`;

          if (listEl) {
            if (data.detections.length === 0) {
              listEl.innerHTML = '<div style="color:#94a3b8; font-size:0.85rem; padding:10px; text-align:center;">Bu güven eşiğinde nesne tespit edilemedi. Güven eşiğini (%10) düşürmeyi deneyin.</div>';
            } else {
              listEl.innerHTML = data.detections.map(d => `
                <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                  <strong style="color:#f8fafc; font-size:0.86rem;">${d.class_name}</strong>
                  <span style="font-size:0.8rem; font-weight:700; color:#34d399; background:rgba(16,185,129,0.15); padding:2px 6px; border-radius:6px;">
                    %${Math.round(d.confidence * 100)}
                  </span>
                </div>
              `).join('');
            }
          }
          this.showToast(`Test tamamlandı! ${data.total_detections} adet nesne tespit edildi. ✓`, 'success');
        } else {
          this.showToast(data.detail || 'Test başarısız', 'error');
        }
      } catch (err) {
        console.error(err);
        this.showToast('Test sırasında bağlantı hatası oluştu', 'error');
      } finally {
        this.showLoading(false);
        pgImageFileInput.value = '';
      }
    });
  }

  // =========================================================================
  // 7. TEAM WORKSPACE & GITHUB-STYLE COLLABORATION ENGINE
  // =========================================================================
  async loadTeamSyncHub() {
    const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
    const batchSelect = document.getElementById('teamBatchSelect');
    const locksList = document.getElementById('teamLocksList');
    const snapsList = document.getElementById('teamSnapshotsList');

    const teamSelect = document.getElementById('teamSelectDropdown');
    const captainBadge = document.getElementById('teamCaptainBadge');
    const memberCountBadge = document.getElementById('teamMemberCountBadge');
    const membersList = document.getElementById('teamMembersList');
    const projectSelect = document.getElementById('teamProjectSelect');
    const assignedProjectsList = document.getElementById('teamAssignedProjectsList');

    try {
      // 1. Teams & Organization API
      const activeWs = this.activeWorkspaceId || localStorage.getItem('activeWorkspaceId') || '';
      const wsParam = activeWs ? `?workspace_id=${encodeURIComponent(activeWs)}` : '';
      const tRes = await fetch(`/api/teams/list${wsParam}`);
      const tData = await tRes.json();
      this.cachedTeams = tData.teams || [];

      if (teamSelect && this.cachedTeams.length > 0) {
        // Aktif projeye atanmış takımı öncelikle bul
        const projAssignedTeam = (this.isProjectContext && cat) ? this.cachedTeams.find(t => Array.isArray(t.projects) && t.projects.includes(cat)) : null;
        
        // Eğer seçili takım yoksa veya listede yoksa, öncelikle bu projeye atanmış takımı seç
        if (!this.selectedTeamId || !this.cachedTeams.some(t => t.id === this.selectedTeamId)) {
          this.selectedTeamId = projAssignedTeam ? projAssignedTeam.id : this.cachedTeams[0].id;
        }

        teamSelect.innerHTML = this.cachedTeams.map(t => {
          const isForThisProj = this.isProjectContext && Boolean(cat) && Array.isArray(t.projects) && t.projects.includes(cat);
          const projInfo = isForThisProj 
            ? `(Bu Proje: ${cat})` 
            : (t.projects && t.projects.length > 0 ? `[${t.projects.join(', ')}]` : '(Atanmış Proje Yok)');
          return `<option value="${t.id}" ${t.id === this.selectedTeamId ? 'selected' : ''}>${t.name} ${projInfo}</option>`;
        }).join('');

        const activeTeam = this.cachedTeams.find(t => t.id === this.selectedTeamId) || this.cachedTeams[0];
        
        // Aktif proje izolasyon durumu kontrolü
        let projStatusBanner = document.getElementById('teamProjIsolationBanner');
        const teamHeaderCard = document.querySelector('.team-org-header-card') || teamSelect.closest('.settings-content-card') || teamSelect.parentElement;
        const isTeamAssignedToCurrentProj = Array.isArray(activeTeam.projects) && activeTeam.projects.includes(cat);

        if (!isTeamAssignedToCurrentProj) {
          if (!projStatusBanner && teamHeaderCard) {
            projStatusBanner = document.createElement('div');
            projStatusBanner.id = 'teamProjIsolationBanner';
            teamHeaderCard.insertAdjacentElement('afterend', projStatusBanner);
          }
          if (projStatusBanner) {
            projStatusBanner.style.display = 'flex';
            projStatusBanner.style.cssText = 'background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); border-radius:12px; padding:12px 18px; margin-bottom:20px; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;';
            projStatusBanner.innerHTML = `
              <div style="display:flex; align-items:center; gap:10px; font-size:0.84rem; color:#fcd34d;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                <span><strong>"${activeTeam.name}"</strong> takımı şu anda <strong>"${cat}"</strong> projesine atanmamıştır. Projeler birbirine entegre edilmez ve izole tutulur.</span>
              </div>
              <div style="display:flex; gap:8px;">
                <button id="quickAssignCurrentProjBtn" class="btn-primary" style="padding:6px 14px; font-size:0.78rem; font-weight:700; background:#f59e0b; color:#000; border:none; border-radius:8px;">
                  Bu Projeyi Takıma Dahil Et
                </button>
              </div>
            `;
            projStatusBanner.querySelector('#quickAssignCurrentProjBtn')?.addEventListener('click', async () => {
              await fetch('/api/teams/assign-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ team_id: activeTeam.id, project_category: cat, action: 'add' })
              });
              this.showToast(`"${cat}" projesi "${activeTeam.name}" takımına başarıyla bağlandı. ✓`, 'success');
              this.loadTeamSyncHub();
            });
          }
        } else if (projStatusBanner) {
          projStatusBanner.style.display = 'none';
        }

        if (captainBadge) {
          captainBadge.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> <span>Takım Kaptanı: <strong style="color:#f8fafc;">${activeTeam.captain || 'admin'}</strong></span>`;
        }
        if (memberCountBadge) {
          memberCountBadge.textContent = `${activeTeam.members ? activeTeam.members.length : 0} Üye`;
        }

        const memberTabCount = document.getElementById('memberTabCount');
        const inviteTabCount = document.getElementById('inviteTabCount');
        const pendingInvitesList = document.getElementById('teamPendingInvitesList');

        const roleBadges = {
          captain: '<span style="background:rgba(234,179,8,0.1); color:#eab308; border:1px solid rgba(234,179,8,0.25); font-size:0.72rem; font-weight:600; padding:2px 8px; border-radius:5px;">Kaptan</span>',
          reviewer: '<span style="background:rgba(168,85,247,0.1); color:#c084fc; border:1px solid rgba(168,85,247,0.25); font-size:0.72rem; font-weight:600; padding:2px 8px; border-radius:5px;">Denetçi</span>',
          annotator: '<span style="background:rgba(56,189,248,0.1); color:#38bdf8; border:1px solid rgba(56,189,248,0.25); font-size:0.72rem; font-weight:600; padding:2px 8px; border-radius:5px;">Etiketleyici</span>'
        };

        const members = activeTeam.members || [];
        const pendingInvites = activeTeam.pending_invites || [];

        if (memberTabCount) memberTabCount.textContent = members.length;
        if (inviteTabCount) inviteTabCount.textContent = pendingInvites.length;

        // Render Active Members
        if (membersList) {
          if (members.length === 0) {
            membersList.innerHTML = '<div style="color:#64748b; font-size:0.8rem; text-align:center; padding:20px;">Bu takımda henüz kayıtlı personel bulunmuyor.</div>';
          } else {
            membersList.innerHTML = members.map(m => `
              <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <div style="width:28px; height:28px; border-radius:50%; background:#1e293b; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; font-weight:600; font-size:0.78rem; color:#cbd5e1;">
                    ${(m.username || 'U')[0].toUpperCase()}
                  </div>
                  <div>
                    <strong style="color:#f8fafc; font-size:0.82rem; display:block;">${m.display_name || m.username}</strong>
                    <span style="font-size:0.72rem; color:#64748b;">${m.email ? m.email : '@' + m.username}</span>
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  ${roleBadges[m.role] || roleBadges.annotator}
                  ${m.username !== activeTeam.captain ? `
                    <button class="remove-member-btn" data-team="${activeTeam.id}" data-user="${m.username}" style="background:none; border:none; color:#94a3b8; font-size:1.1rem; cursor:pointer; padding:2px 6px; transition:color 0.15s ease;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#94a3b8'" title="Takımdan Çıkar">&times;</button>
                  ` : ''}
                </div>
              </div>
            `).join('');
          }
        }

        // Render Pending Invites (GitHub Style)
        if (pendingInvitesList) {
          if (pendingInvites.length === 0) {
            pendingInvitesList.innerHTML = '<div style="color:#64748b; font-size:0.8rem; text-align:center; padding:20px;">Bekleyen davet bulunmamaktadır.</div>';
          } else {
            pendingInvitesList.innerHTML = pendingInvites.map(inv => `
              <div style="background:rgba(255,255,255,0.02); border:1px dashed rgba(245,158,11,0.3); border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="color:#f8fafc; font-size:0.82rem;">${inv.invitee}</strong>
                    <span style="background:rgba(245,158,11,0.12); color:#fbbf24; border:1px solid rgba(245,158,11,0.25); font-size:0.68rem; font-weight:600; padding:1px 6px; border-radius:4px;">Davet Edildi (Bekliyor)</span>
                  </div>
                  <div style="font-size:0.7rem; color:#64748b; margin-top:2px;">Rol: ${inv.role} • ${inv.invited_at}</div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                  <button class="copy-invite-link-btn" data-link="${inv.invite_link}" style="background:rgba(56,189,248,0.1); border:1px solid rgba(56,189,248,0.25); border-radius:5px; color:#38bdf8; font-size:0.72rem; padding:3px 8px; cursor:pointer;" title="Davet Bağlantısını Kopyala">Linki Kopyala</button>
                  <button class="cancel-invite-btn" data-team="${activeTeam.id}" data-inv="${inv.invite_id}" style="background:none; border:none; color:#ef4444; font-size:1.1rem; cursor:pointer; padding:2px 6px;" title="Daveti İptal Et">&times;</button>
                </div>
              </div>
            `).join('');
          }
        }

        // Render Assigned Projects (Clean Tags)
        if (assignedProjectsList) {
          const projs = activeTeam.projects || [];
          if (projs.length === 0) {
            assignedProjectsList.innerHTML = '<span style="color:#64748b; font-size:0.76rem;">Bu takıma atanmış bir proje yok.</span>';
          } else {
            assignedProjectsList.innerHTML = projs.map(p => `
              <span style="background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.2); border-radius:6px; padding:3px 8px; font-size:0.75rem; color:#cbd5e1; display:inline-flex; align-items:center; gap:6px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span>${p}</span>
                <button class="unassign-proj-btn" data-team="${activeTeam.id}" data-proj="${p}" style="background:none; border:none; color:#64748b; cursor:pointer; padding:0; font-size:0.85rem; line-height:1;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#64748b'" title="Yetkiyi Kaldır">&times;</button>
              </span>
            `).join('');
          }
        }

        // Populate Project Select (Defaults to current active project)
        if (projectSelect && this.projectsList) {
          const availableProjs = this.projectsList.map(p => p.id || p.category);
          projectSelect.innerHTML = availableProjs.map(p => 
            `<option value="${p}" ${p === cat ? 'selected' : ''}>${p}</option>`
          ).join('');
        }

        // Populate currentUserRoleSelect (Personal Workbench)
        const userSelect = document.getElementById('currentUserRoleSelect');
        if (userSelect) {
          const members = activeTeam.members || [];
          if (members.length > 0) {
            const curVal = userSelect.value || members[0].username;
            userSelect.innerHTML = members.map(m => 
              `<option value="${m.username}" ${m.username === curVal ? 'selected' : ''}>@${m.username} (${m.display_name || m.role})</option>`
            ).join('');
            this.loadMyActiveTask(userSelect.value || members[0].username);
          } else {
            userSelect.innerHTML = '<option value="admin">@admin (Kaptan)</option>';
            this.loadMyActiveTask('admin');
          }
        }
      } else {
        // EMPTY STATE: No teams created yet
        this.selectedTeamId = null;
        if (teamSelect) {
          teamSelect.innerHTML = '<option value="">Henüz bir takım oluşturulmadı</option>';
        }
        if (captainBadge) {
          captainBadge.innerHTML = '<span>Takım Kaptanı: <strong style="color:#f8fafc;">—</strong></span>';
        }
        if (memberCountBadge) {
          memberCountBadge.textContent = '0 Üye';
        }
        if (membersList) {
          membersList.innerHTML = `
            <div style="color:#64748b; font-size:0.82rem; text-align:center; padding:32px 16px;">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="1.5" style="margin-bottom:8px; display:inline-block;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              <div style="color:#94a3b8; font-weight:600; margin-bottom:4px;">Henüz bir takım oluşturulmadı</div>
              <span style="font-size:0.75rem; color:#64748b;">Yukarıdaki "Yeni Takım Oluştur" butonu ile ekibinizi kurabilirsiniz.</span>
            </div>
          `;
        }
        if (assignedProjectsList) {
          assignedProjectsList.innerHTML = '<span style="color:#64748b; font-size:0.76rem;">Henüz bir takım tanımlanmadı.</span>';
        }
        if (projectSelect && this.projectsList) {
          const availableProjs = this.projectsList.map(p => p.id || p.category);
          projectSelect.innerHTML = availableProjs.map(p => 
            `<option value="${p}">${p}</option>`
          ).join('');
        }
      }

      // 2. Batches & Task Locking
      const bRes = await fetch(`/api/projects/batches?category=${encodeURIComponent(cat)}`);
      const bData = await bRes.json();
      if (bRes.ok && bData.batches && batchSelect) {
        batchSelect.innerHTML = bData.batches.map(b => 
          `<option value="${b.id}">${b.name} (${b.images ? b.images.length : 0} Resim)</option>`
        ).join('');
      }

      // 3. Sync Status & Central Locks
      const sRes = await fetch(`/api/team/sync-status?category=${encodeURIComponent(cat)}`);
      const sData = await sRes.json();

      // Populate syncTeamMemberSelect and teamAssigneeSelect from active team
      const syncMemberSelect = document.getElementById('syncTeamMemberSelect');
      const teamAssigneeSelect = document.getElementById('teamAssigneeSelect');
      if (this.cachedTeams && this.cachedTeams.length > 0) {
        const activeT = this.cachedTeams.find(t => t.id === this.selectedTeamId) || this.cachedTeams[0];
        const memberOpts = (activeT.members || []).map(m => 
          `<option value="${m.username}">${m.display_name || m.username} (@${m.username})</option>`
        ).join('');

        if (syncMemberSelect) {
          syncMemberSelect.innerHTML = memberOpts ? `<option value="">(Seçiniz)</option>${memberOpts}` : '<option value="">(Takımda üye yok)</option>';
        }
        if (teamAssigneeSelect) {
          teamAssigneeSelect.innerHTML = memberOpts ? `<option value="">(Personel Seçiniz)</option>${memberOpts}` : '<option value="">(Takımda üye yok)</option>';
        }
      } else {
        if (syncMemberSelect) syncMemberSelect.innerHTML = '<option value="">(Önce takım oluşturunuz)</option>';
        if (teamAssigneeSelect) teamAssigneeSelect.innerHTML = '<option value="">(Önce takım oluşturunuz)</option>';
      }

      if (sRes.ok && sData.status === 'ok') {
        if (locksList) {
          if (!sData.assigned_batches || sData.assigned_batches.length === 0) {
            locksList.innerHTML = '<div style="color:#64748b; font-size:0.78rem; text-align:center; padding:8px;">Kilitli yığın bulunmuyor.</div>';
          } else {
            locksList.innerHTML = sData.assigned_batches.map(ab => `
              <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:6px; padding:7px 10px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                  <strong style="color:#f8fafc; font-size:0.8rem; display:block;">${ab.batch_name}</strong>
                  <span style="font-size:0.72rem; color:#64748b;">${ab.image_count} Görsel</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <div style="text-align:right;">
                    <span style="font-size:0.72rem; font-weight:600; color:#38bdf8; background:rgba(56,189,248,0.1); padding:2px 6px; border-radius:4px; display:inline-block;">
                      ${ab.assigned_to}
                    </span>
                    <div style="font-size:0.66rem; color:#64748b;">Kilit: ${ab.locked_until || '24s'}</div>
                  </div>
                  <button class="unlock-single-batch-btn" data-batch="${ab.batch_id}" style="background:none; border:1px solid rgba(239,68,68,0.25); border-radius:5px; color:#f87171; font-size:0.7rem; padding:3px 7px; cursor:pointer;" title="Kilidi Kaldır">
                    Aç
                  </button>
                </div>
              </div>
            `).join('');
          }
        }

        if (snapsList) {
          if (!sData.recent_backups || sData.recent_backups.length === 0) {
            snapsList.innerHTML = '<div style="color:#64748b; font-size:0.76rem; padding:6px; text-align:center;">Kayıtlı snapshot bulunmuyor.</div>';
          } else {
            snapsList.innerHTML = sData.recent_backups.map(snap => `
              <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.05); border-radius:6px; padding:5px 8px; font-size:0.74rem; color:#cbd5e1; display:flex; justify-content:space-between; align-items:center;">
                <span style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:65%;">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                  <span>${snap}</span>
                </span>
                <button class="restore-single-snap-btn" data-snap="${snap}" style="background:none; border:none; color:#38bdf8; font-size:0.72rem; cursor:pointer; font-weight:600; padding:2px 4px;" title="Bu yedeğe geri dön">
                  Geri Yükle
                </button>
              </div>
            `).join('');
          }
        }
      }

      // 4. Pending Reviews & Admin Dispatch Engine
      const prRes = await fetch('/api/team/pending-reviews');
      const prData = await prRes.json();
      const prList = document.getElementById('pendingTasksList');
      const prBadge = document.getElementById('pendingReviewCountBadge');
      const subnavBadge = document.getElementById('pendingSubnavBadge');
      const dispatchSelect = document.getElementById('dispatchAssigneeSelect');

      if (prData.status === 'ok') {
        const count = prData.pending_count || 0;
        if (prBadge) prBadge.textContent = `${count} Onay Bekleyen`;
        if (subnavBadge) {
          subnavBadge.textContent = count;
          subnavBadge.style.display = count > 0 ? 'inline-block' : 'none';
        }
      }

      // Populate dispatchAssigneeSelect from active team
      if (dispatchSelect) {
        if (this.cachedTeams && this.cachedTeams.length > 0) {
          const activeT = this.cachedTeams.find(t => t.id === this.selectedTeamId) || this.cachedTeams[0];
          const members = activeT.members || [];
          if (members.length > 0) {
            dispatchSelect.innerHTML = members.map(m => 
              `<option value="${m.username}">${m.display_name || m.username} (@${m.username})</option>`
            ).join('');
          } else {
            dispatchSelect.innerHTML = '<option value="">(Bu takımda henüz üye yok)</option>';
          }
        } else {
          dispatchSelect.innerHTML = '<option value="">(Önce bir takım oluşturunuz)</option>';
        }
      }

      // Update Live Dataset Dispatch Metrics (Anti-Overflow & Smart Splits)
      this.updateDatasetDispatchOptions(cat);

      // Load Incoming Sync Packs (Pull Requests from Team Members)
      this.loadIncomingSyncPacks(cat);

      if (prList && prData.status === 'ok') {
        const tasks = prData.all_tasks || [];
        if (tasks.length === 0) {
          prList.innerHTML = '<div style="color:#64748b; font-size:0.8rem; text-align:center; padding:30px 10px;">Onay bekleyen teslimat bulunmamaktadır.</div>';
        } else {
          const statusBadges = {
            assigned: '<span style="background:rgba(56,189,248,0.1); color:#38bdf8; border:1px solid rgba(56,189,248,0.2); font-size:0.72rem; font-weight:600; padding:2px 7px; border-radius:5px;">İşleniyor</span>',
            submitted: '<span style="background:rgba(245,158,11,0.1); color:#fbbf24; border:1px solid rgba(245,158,11,0.25); font-size:0.72rem; font-weight:600; padding:2px 7px; border-radius:5px;">Onay Bekliyor</span>',
            approved: '<span style="background:rgba(16,185,129,0.1); color:#34d399; border:1px solid rgba(16,185,129,0.2); font-size:0.72rem; font-weight:600; padding:2px 7px; border-radius:5px;">Onaylandı</span>'
          };

          prList.innerHTML = tasks.map(t => `
            <div style="background:rgba(255,255,255,0.02); border:1px solid ${t.status === 'submitted' ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}; border-radius:8px; padding:10px 12px; display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:#f8fafc; font-size:0.82rem;">${t.title}</strong>
                ${statusBadges[t.status] || statusBadges.assigned}
              </div>
              <div style="font-size:0.74rem; color:#64748b; display:flex; justify-content:space-between;">
                <span>Atanan: <strong style="color:#cbd5e1;">@${t.assigned_to}</strong></span>
                <span>${t.created_at || ''}</span>
              </div>
              ${t.user_note ? `<div style="font-size:0.72rem; color:#94a3b8; background:rgba(0,0,0,0.25); padding:4px 8px; border-radius:5px; border-left:2px solid #38bdf8;">Not: ${t.user_note}</div>` : ''}
              
              ${t.status === 'submitted' ? `
                <div style="display:flex; gap:8px; margin-top:4px;">
                  <button class="review-approve-btn btn-primary" data-task="${t.id}" style="flex:1; padding:6px 8px; font-size:0.75rem; font-weight:600; border-radius:6px; display:flex; justify-content:center; align-items:center; gap:5px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>Onayla ve Birleştir</span>
                  </button>
                  <button class="review-reject-btn btn-secondary" data-task="${t.id}" style="flex:1; padding:6px 8px; font-size:0.75rem; font-weight:600; color:#f87171; border-color:rgba(239,68,68,0.25); border-radius:6px; display:flex; justify-content:center; align-items:center; gap:5px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                    <span>Revizyon İste</span>
                  </button>
                </div>
              ` : ''}
            </div>
          `).join('');
        }
      }
    } catch (e) {
      console.error(e);
    }
  }

  // =========================================================================
  // MODERN IN-APP DIALOG & CONFIRMATION ENGINE (NO BROWSER POPUPS)
  // =========================================================================
  openAppPrompt({ title = 'Bilgi Girişi', message = '', placeholder = '', defaultValue = '', confirmText = 'Onayla' } = {}) {
    return this.showPrompt({
      title: title,
      subtitle: 'Bilgi Girişi',
      message: message,
      placeholder: placeholder,
      defaultValue: defaultValue,
      confirmText: confirmText
    });
  }

  openAppConfirm({ title = 'İşlem Onayı', message = 'Bu işlemi gerçekleştirmek istediğinize emin misiniz?', confirmText = 'Evet, Onayla', danger = false } = {}) {
    return this.showConfirm({
      title: title,
      subtitle: 'Sistem Bildirimi',
      message: message,
      confirmText: confirmText,
      cancelText: 'Vazgeç',
      type: danger ? 'danger' : 'warning'
    });
  }

  switchTeamSubtab(target, pushHistory = true) {
    const subtabMap = {
      'org': 'teamOrg',
      'teamOrg': 'teamOrg',
      'dispatch': 'teamDispatch',
      'teamDispatch': 'teamDispatch',
      'sync': 'teamSync',
      'teamSync': 'teamSync'
    };
    const activeTarget = subtabMap[target] || 'teamOrg';
    const subtabSlug = activeTarget === 'teamDispatch' ? 'dispatch' : (activeTarget === 'teamSync' ? 'sync' : 'org');

    document.querySelectorAll('.team-subnav-btn').forEach(b => {
      const isMatch = b.dataset.subtab === activeTarget;
      b.classList.toggle('active', isMatch);
      b.style.background = isMatch ? '#1e293b' : 'transparent';
      b.style.color = isMatch ? '#f8fafc' : '#94a3b8';
    });

    const orgPane = document.getElementById('teamSubtabOrg');
    const dispPane = document.getElementById('teamSubtabDispatch');
    const syncPane = document.getElementById('teamSubtabSync');

    if (orgPane) orgPane.style.display = activeTarget === 'teamOrg' ? 'block' : 'none';
    if (dispPane) dispPane.style.display = activeTarget === 'teamDispatch' ? 'block' : 'none';
    if (syncPane) syncPane.style.display = activeTarget === 'teamSync' ? 'block' : 'none';

    if (this.activeHubProjectId) {
      try {
        const url = new URL(window.location);
        const curSubtab = url.searchParams.get('subtab') || 'org';
        url.searchParams.set('subtab', subtabSlug);
        const stateObj = { view: 'project', params: { projectId: this.activeHubProjectId, tab: 'team', subtab: subtabSlug } };
        
        if (pushHistory && curSubtab !== subtabSlug) {
          window.history.pushState(stateObj, '', url);
        }
      } catch (e) {}
    }
  }

  setupTeamSyncEvents() {
    // Sub-Navigation Tab Switching with URL support
    document.querySelectorAll('.team-subnav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.subtab;
        this.switchTeamSubtab(target, true);
      });
    });

    document.getElementById('refreshTeamSyncBtn')?.addEventListener('click', () => {
      this.loadTeamSyncHub();
      this.showToast('Ekip ve senkronizasyon durumu güncellendi.', 'info');
    });

    // 0. Team Selector Switch
    document.getElementById('teamSelectDropdown')?.addEventListener('change', (e) => {
      this.selectedTeamId = e.target.value;
      this.loadTeamSyncHub();
    });

    // 0. Create Team (Custom App Dialog, No Browser Popups)
    document.getElementById('createTeamBtn')?.addEventListener('click', async () => {
      const teamName = await this.openAppPrompt({
        title: 'Yeni Takım Oluştur',
        message: 'Lütfen oluşturmak istediğiniz takımın adını giriniz:',
        placeholder: 'Örn: Bilgisayarlı Görü Takımı',
        confirmText: 'Oluştur'
      });
      if (!teamName || !teamName.trim()) return;

      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      try {
        const res = await fetch('/api/teams/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: teamName.trim(), captain: 'admin', initial_projects: [cat] })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
          this.selectedTeamId = data.team.id;
          this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'Takım oluşturulamadı', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      }
    });

    // 0. Toggle Member vs Pending Invites View (GitHub Style)
    const activeViewBtn = document.getElementById('memberViewActiveBtn');
    const pendingViewBtn = document.getElementById('memberViewPendingBtn');
    const activeList = document.getElementById('teamMembersList');
    const pendingList = document.getElementById('teamPendingInvitesList');

    if (activeViewBtn && pendingViewBtn) {
      activeViewBtn.addEventListener('click', () => {
        activeViewBtn.classList.add('active');
        activeViewBtn.style.background = '#1e293b';
        activeViewBtn.style.color = '#f8fafc';
        pendingViewBtn.classList.remove('active');
        pendingViewBtn.style.background = 'transparent';
        pendingViewBtn.style.color = '#94a3b8';

        if (activeList) activeList.style.display = 'flex';
        if (pendingList) pendingList.style.display = 'none';
      });

      pendingViewBtn.addEventListener('click', () => {
        pendingViewBtn.classList.add('active');
        pendingViewBtn.style.background = '#1e293b';
        pendingViewBtn.style.color = '#f8fafc';
        activeViewBtn.classList.remove('active');
        activeViewBtn.style.background = 'transparent';
        activeViewBtn.style.color = '#94a3b8';

        if (activeList) activeList.style.display = 'none';
        if (pendingList) pendingList.style.display = 'flex';
      });
    }

    // ── Cloudflare D1 Canlı Kullanıcı Arama Autocomplete ──
    const inviteeInput = document.getElementById('inviteeInput');
    const inviteeDropdown = document.getElementById('inviteeDropdown');

    if (inviteeInput && inviteeDropdown) {
      let searchTimeout = null;

      const closeDropdown = () => {
        inviteeDropdown.style.display = 'none';
        inviteeDropdown.innerHTML = '';
      };

      const renderDropdown = (users, query) => {
        if (!users || users.length === 0) {
          inviteeDropdown.innerHTML = `
            <div style="padding:12px 14px; color:#64748b; font-size:0.8rem; text-align:center;">
              ${query ? `"${query}" için kullanıcı bulunamadı` : 'Kayıtlı kullanıcı yok'}
            </div>`;
          inviteeDropdown.style.display = 'block';
          return;
        }

        inviteeDropdown.innerHTML = `
          <div style="padding:6px 10px 4px; font-size:0.68rem; color:#475569; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.05); display:flex; align-items:center; gap:6px;">
            <span style="width:6px; height:6px; border-radius:50%; background:#10b981; display:inline-block; box-shadow:0 0 6px #10b981;"></span>
            Cloudflare D1 · ${users.length} Kullanıcı
          </div>
          ${users.map(u => {
            const name = u.display_name || u.email.split('@')[0];
            const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
            const hasAvatar = u.avatar_url && !u.avatar_url.includes('ui-avatars.com');
            return `
              <div class="user-search-item" data-email="${u.email}" data-name="${name}"
                style="display:flex; align-items:center; gap:10px; padding:9px 12px; cursor:pointer; transition:background 0.15s; border-bottom:1px solid rgba(255,255,255,0.04);">
                <div style="flex-shrink:0; width:32px; height:32px; border-radius:50%; overflow:hidden; border:1.5px solid rgba(59,130,246,0.3); display:flex; align-items:center; justify-content:center; background:rgba(59,130,246,0.15); font-size:0.75rem; font-weight:700; color:#60a5fa;">
                  ${hasAvatar ? `<img src="${u.avatar_url}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"><span style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">${initials}</span>` : initials}
                </div>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:0.82rem; font-weight:600; color:#f1f5f9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                  <div style="font-size:0.73rem; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.email}</div>
                </div>
                <div style="flex-shrink:0; font-size:0.66rem; padding:2px 7px; border-radius:20px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.25); color:#34d399;">D1 ✓</div>
              </div>
            `;
          }).join('')}
        `;
        inviteeDropdown.style.display = 'block';

        // Click handler for each user item
        inviteeDropdown.querySelectorAll('.user-search-item').forEach(item => {
          item.addEventListener('mouseenter', () => item.style.background = 'rgba(59,130,246,0.08)');
          item.addEventListener('mouseleave', () => item.style.background = '');
          item.addEventListener('mousedown', (e) => {
            e.preventDefault(); // prevent blur before click
            inviteeInput.value = item.dataset.email;
            closeDropdown();
            inviteeInput.focus();
          });
        });
      };

      const doSearch = async (q) => {
        try {
          const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&limit=15`);
          if (!res.ok) return;
          const data = await res.json();
          renderDropdown(data.users || [], q);
        } catch (err) {
          console.warn('[User Search]', err);
        }
      };

      // On focus: show all users
      inviteeInput.addEventListener('focus', () => {
        doSearch(inviteeInput.value.trim());
      });

      // On input: debounced search
      inviteeInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          doSearch(inviteeInput.value.trim());
        }, 200);
      });

      // Close on outside click
      document.addEventListener('click', (e) => {
        if (!inviteeInput.contains(e.target) && !inviteeDropdown.contains(e.target)) {
          closeDropdown();
        }
      });

      // Close on Escape
      inviteeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDropdown();
      });
    }

    // 0. GitHub-Style Send Invite to Team (Email or Username)
    document.getElementById('inviteTeamMemberForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const inviteeInput = document.getElementById('inviteeInput');
      const roleInput = document.getElementById('inviteeRole');

      const invitee = inviteeInput?.value.trim();
      const role = roleInput?.value || 'annotator';

      if (!invitee || !this.selectedTeamId) {
        this.showToast('Lütfen bir kullanıcı adı veya e-posta adresi giriniz.', 'warning');
        return;
      }

      this.showLoading(true, `'${invitee}' için davet hazırlanıyor ve e-posta iletiliyor...`);
      try {
        const res = await fetch('/api/teams/invite-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            team_id: this.selectedTeamId,
            invitee: invitee,
            role: role,
            invited_by: 'admin'
          })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
          if (inviteeInput) inviteeInput.value = '';

          // Panoya kopyalama ve kullanıcı bilgilendirme
          if (data.invite_link) {
            navigator.clipboard.writeText(data.invite_link).catch(() => {});
          }

          this.loadTeamSyncHub();
          
          // Bekleyenler sekmesini açalım ki daveti görsün
          if (pendingViewBtn) pendingViewBtn.click();
        } else {
          this.showToast(data.detail || 'Davet gönderilemedi', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      } finally {
        this.showLoading(false);
      }
    });

    // 0. Cancel Pending Invitation & Copy Invite Link
    document.getElementById('teamPendingInvitesList')?.addEventListener('click', async (e) => {
      const copyBtn = e.target.closest('.copy-invite-link-btn');
      const cancelBtn = e.target.closest('.cancel-invite-btn');

      if (copyBtn) {
        const link = copyBtn.dataset.link;
        if (link) {
          await navigator.clipboard.writeText(link);
          this.showToast('Davet bağlantısı panoya kopyalandı.', 'info');
        }
        return;
      }

      if (cancelBtn) {
        const teamId = cancelBtn.dataset.team;
        const inviteId = cancelBtn.dataset.inv;

        const ok = await this.openAppConfirm({
          title: 'Daveti İptal Et',
          message: 'Bu daveti geri çekmek istediğinize emin misiniz? Davet bağlantısı geçersiz kılınacaktır.',
          confirmText: 'Daveti İptal Et',
          danger: true
        });
        if (!ok) return;

        try {
          const res = await fetch('/api/teams/cancel-invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_id: teamId, invite_id: inviteId })
          });
          const data = await res.json();
          if (res.ok && data.status === 'ok') {
            this.showToast(data.message, 'info');
            this.loadTeamSyncHub();
          } else {
            this.showToast(data.detail || 'İptal edilemedi', 'error');
          }
        } catch (err) {
          this.showToast('Bağlantı hatası', 'error');
        }
      }
    });

    // 0. Delegate Remove Member & Unassign Project Click
    document.getElementById('teamMembersList')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.remove-member-btn');
      if (!btn) return;
      const teamId = btn.dataset.team;
      const ok = await this.openAppConfirm({
        title: 'Üye Çıkarma',
        message: `'${username}' kullanıcısını takımdan çıkarmak istediğinize emin misiniz?`,
        confirmText: 'Çıkar',
        danger: true
      });
      if (!ok) return;

      try {
        const res = await fetch('/api/teams/remove-member', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team_id: teamId, username: username })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'info');
          this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'İşlem başarısız', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      }
    });

    // 0. Test SMTP Connection (T-Sistem Engine)
    document.getElementById('testSmtpConnectionBtn')?.addEventListener('click', async () => {
      const email = await this.openAppPrompt({
        title: 'SMTP E-Posta Testi',
        message: 'T-Sistem Gmail SMTP motorunu test etmek için alıcı e-posta adresini giriniz:',
        defaultValue: 'celikcelik156@gmail.com',
        placeholder: 'ornek@gmail.com',
        confirmText: 'Test Maili Gönder'
      });
      if (!email) return;

      this.showLoading(true, `'${email}' adresine test e-postası iletiliyor...`);
      try {
        const res = await fetch('/api/teams/test-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to_email: email.trim() })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
        } else {
          this.showToast(data.detail || 'Test e-postası gönderilemedi', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      } finally {
        this.showLoading(false);
      }
    });

    // 0. Assign Project to Team
    document.getElementById('assignProjectToTeamBtn')?.addEventListener('click', async () => {
      const proj = document.getElementById('teamProjectSelect')?.value;
      if (!proj || !this.selectedTeamId) return;

      try {
        const res = await fetch('/api/teams/assign-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team_id: this.selectedTeamId, project_category: proj, action: 'add' })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
          this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'Yetki verilemedi', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      }
    });

    document.getElementById('teamAssignedProjectsList')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.unassign-proj-btn');
      if (!btn) return;
      const teamId = btn.dataset.team;
      const proj = btn.dataset.proj;

      try {
        const res = await fetch('/api/teams/assign-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ team_id: teamId, project_category: proj, action: 'remove' })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'info');
          this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'Yetki kaldırılamadı', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      }
    });

    // 0. Dynamic Task Type Change & Image Count Sync
    document.getElementById('dispatchTaskType')?.addEventListener('change', () => {
      this.updateDatasetDispatchOptions();
    });

    document.getElementById('dispatchImageCount')?.addEventListener('change', (e) => {
      const customInput = document.getElementById('dispatchCustomCountInput');
      if (customInput && e.target.value) {
        customInput.value = e.target.value;
      }
    });

    // 0. Admin Dispatches Task to Employee (Dataset-Aware & QA Sample Engine)
    document.getElementById('dispatchTaskForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      const assignee = document.getElementById('dispatchAssigneeSelect')?.value;
      const isQA = document.getElementById('dispatchTaskType')?.value === 'qa_review';
      const customCount = parseInt(document.getElementById('dispatchCustomCountInput')?.value);
      const selectCount = parseInt(document.getElementById('dispatchImageCount')?.value);
      const count = customCount || selectCount || 50;
      const note = document.getElementById('dispatchNoteInput')?.value.trim();

      if (!assignee) {
        this.showToast('Lütfen görevin atanacağı personeli seçiniz.', 'warning');
        return;
      }

      if (count <= 0) {
        this.showToast('Atanacak görsel adedi 0 olamaz.', 'warning');
        return;
      }

      const modeText = isQA ? 'denetim/inceleme' : 'etiketleme';
      this.showLoading(true, `Veri seti taranıyor ve ${assignee} personeline ${count} görsel ${modeText} için kilitleniyor...`);
      try {
        const res = await fetch('/api/team/dispatch-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, assigned_to: assignee, count: count, is_qa_review: isQA, note: note })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
          this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'Görev atanamadı', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      } finally {
        this.showLoading(false);
      }
    });

    // 0. Personal Task Workbench: Switch Active User Profile
    document.getElementById('currentUserRoleSelect')?.addEventListener('change', (e) => {
      const username = e.target.value;
      if (username) {
        this.loadMyActiveTask(username);
      }
    });

    // 0. Personal Task Workbench: Start Working on Task (Open assigned images in editor)
    document.getElementById('startWorkingOnTaskBtn')?.addEventListener('click', () => {
      if (!this.currentWorkingTask || !this.currentWorkingTask.images || this.currentWorkingTask.images.length === 0) {
        this.showToast('İşlenecek görsel bulunamadı.', 'warning');
        return;
      }

      const cat = this.currentWorkingTask.category || this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      this.openProject(cat, 'editor');
      this.imageFiles = this.currentWorkingTask.images;
      this.currentImageIndex = 0;
      this.renderGallery();
      this.loadImage(this.imageFiles[0]);
      this.showToast(`Size atanmış ${this.imageFiles.length} görsel çalışma alanına yüklendi.`, 'info');
    });

    // 0. Personal Task Workbench: Submit Task to Admin for Review
    document.getElementById('submitCurrentTaskBtn')?.addEventListener('click', async () => {
      if (!this.currentWorkingTaskId) {
        this.showToast('Teslim edilecek aktif bir görev bulunmuyor.', 'warning');
        return;
      }

      const user = document.getElementById('currentUserRoleSelect')?.value || 'admin';
      const note = await this.openAppPrompt({
        title: 'Görevi Tamamla ve Teslim Et',
        message: 'Yönetici / Takım Kaptanı için teslimat notu ekleyiniz:',
        defaultValue: 'Tüm görseller dikkatle ve standartlara uygun etiketlendi.',
        placeholder: 'Teslimat notu...',
        confirmText: 'Yöneticiye Teslim Et'
      });
      if (note === null) return;

      this.showLoading(true, 'Göreviniz yönetici onay masasına iletiliyor...');
      try {
        const res = await fetch('/api/team/submit-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: this.currentWorkingTaskId, user_name: user, user_note: note })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast('Göreviniz yöneticiye başarıyla teslim edildi. Onay bekleniyor.', 'success');
          this.currentWorkingTaskId = null;
          this.currentWorkingTask = null;
          this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'Teslim işlemi başarısız', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      } finally {
        this.showLoading(false);
      }
    });

    // 0. Admin Reviews (Approve / Reject) Submissions
    document.getElementById('pendingTasksList')?.addEventListener('click', async (e) => {
      const appBtn = e.target.closest('.review-approve-btn');
      const rejBtn = e.target.closest('.review-reject-btn');
      if (!appBtn && !rejBtn) return;

      const taskId = (appBtn || rejBtn).dataset.task;
      const action = appBtn ? 'approve' : 'reject';
      let feedback = '';

      if (action === 'reject') {
        feedback = await this.openAppPrompt({
          title: 'Revizyon Talebi',
          message: 'Personel için düzeltme / revizyon talimatını yazınız:',
          defaultValue: 'Bazı etiketler eksik veya gevşek çizilmiş, lütfen düzeltiniz.',
          placeholder: 'Düzeltme talimatı...',
          confirmText: 'Revizyona Gönder'
        });
        if (feedback === null) return;
      }

      try {
        const res = await fetch('/api/team/review-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task_id: taskId, action: action, feedback: feedback })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, action === 'approve' ? 'success' : 'warning');
          this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'İşlem başarısız', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      }
    });

    // 1. Export Sync Pack
    document.getElementById('exportSyncPackBtn')?.addEventListener('click', async () => {
      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      const selUser = document.getElementById('syncTeamMemberSelect')?.value;
      const inputUser = document.getElementById('syncUserNameInput')?.value.trim();
      const userName = selUser || inputUser || 'Ekip_Uyesi';

      this.showLoading(true, 'Etiket paketi (.syncpack) hazırlanıyor...');
      try {
        const res = await fetch('/api/team/export-sync-pack', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, user_name: userName })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
          const a = document.createElement('a');
          a.href = data.download_url;
          a.download = data.pack_filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else {
          this.showToast(data.detail || 'Paket hazırlanamadı.', 'error');
        }
      } catch (err) {
        console.error(err);
        this.showToast('Sunucu bağlantı hatası', 'error');
      } finally {
        this.showLoading(false);
      }
    });

    // 2. Drag & Drop Zone for Sync Pack
    const dropzone = document.getElementById('syncDropzone');
    const fileInput = document.getElementById('mergeFileInput');
    const nameBadge = document.getElementById('selectedPackNameBadge');
    const nameText = document.getElementById('selectedPackNameText');

    if (dropzone && fileInput) {
      dropzone.addEventListener('click', () => fileInput.click());

      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = '#38bdf8';
        dropzone.style.background = 'rgba(56,189,248,0.08)';
      });

      const resetDropzoneStyle = () => {
        dropzone.style.borderColor = 'rgba(255,255,255,0.18)';
        dropzone.style.background = 'rgba(0,0,0,0.2)';
      };

      dropzone.addEventListener('dragleave', resetDropzoneStyle);

      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        resetDropzoneStyle();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          fileInput.files = e.dataTransfer.files;
          const file = e.dataTransfer.files[0];
          if (nameBadge && nameText) {
            nameText.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            nameBadge.style.display = 'inline-block';
          }
        }
      });

      fileInput.addEventListener('change', () => {
        if (fileInput.files && fileInput.files.length > 0) {
          const file = fileInput.files[0];
          if (nameBadge && nameText) {
            nameText.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            nameBadge.style.display = 'inline-block';
          }
        }
      });
    }

    // 3. Merge Sync Pack (Smart Conflict-Free Merge)
    document.getElementById('mergeSyncPackForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
        this.showToast('Lütfen bir .syncpack veya .zip dosyası seçiniz.', 'warning');
        return;
      }

      const file = fileInput.files[0];
      const formData = new FormData();
      formData.append('category', cat);
      formData.append('imported_by', 'Ekip Arkadaşı');
      formData.append('file', file);

      this.showLoading(true, 'Paket analiz ediliyor ve çakışmasız birleştiriliyor (Git Merge)...');
      try {
        const res = await fetch('/api/team/merge-sync-pack', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
          const resBox = document.getElementById('mergeResultBox');
          const resDet = document.getElementById('mergeResultDetails');
          if (resBox) resBox.style.display = 'block';
          if (resDet) {
            resDet.innerHTML = `
              <div>• Yeni Eklenen Etiket: <strong>${data.merged_new}</strong></div>
              <div>• Güncellenen / İyileştirilen: <strong>${data.updated_better}</strong></div>
              <div>• Çakışma / Kontrol Edilen: <strong>${data.conflicts_count}</strong></div>
            `;
          }
          fileInput.value = '';
          if (nameBadge) nameBadge.style.display = 'none';
          this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'Birleştirme başarısız', 'error');
        }
      } catch (err) {
        console.error(err);
        this.showToast('Birleştirme sırasında bağlantı hatası', 'error');
      } finally {
        this.showLoading(false);
      }
    });

    // 3.1. Incoming Sync Packs / Pull Requests (Merge into Main & Inspect)
    document.getElementById('incomingPacksList')?.addEventListener('click', async (e) => {
      const mergeBtn = e.target.closest('.quick-merge-pack-btn');
      const inspectBtn = e.target.closest('.inspect-pack-images-btn');
      if (!mergeBtn && !inspectBtn) return;

      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';

      if (mergeBtn) {
        const taskId = mergeBtn.dataset.task;
        const author = mergeBtn.dataset.author || 'Ekip Arkadaşı';
        const count = mergeBtn.dataset.count || '0';

        const ok = await this.openAppConfirm({
          title: 'Paketi Ana Projeye Birleştir (Merge)',
          message: `'${author}' tarafından teslim edilen ${count} görseli ana projeye (${cat}) birleştirmek istediğinize emin misiniz? İşlem öncesi otomatik güvenlik yedeği (snapshot) alınacaktır.`,
          confirmText: 'Çakışmasız Birleştir (Merge)'
        });
        if (!ok) return;

        this.showLoading(true, `'${author}' etiket paketi ana projeye birleştiriliyor (Git Merge)...`);
        try {
          const res = await fetch('/api/team/quick-merge-task', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, task_id: taskId })
          });
          const data = await res.json();
          if (res.ok && data.status === 'ok') {
            this.showToast(data.message, 'success');
            this.loadTeamSyncHub();
            if (this.currentCategory) this.loadCategoryImages();
          } else {
            this.showToast(data.detail || 'Birleştirme başarısız', 'error');
          }
        } catch (err) {
          this.showToast('Bağlantı hatası', 'error');
        } finally {
          this.showLoading(false);
        }
      }

      if (inspectBtn) {
        const taskId = inspectBtn.dataset.task;
        const imgsJson = inspectBtn.dataset.images;
        let imgList = [];
        try { imgList = JSON.parse(imgsJson); } catch (err) { imgList = []; }

        const previewList = imgList.slice(0, 15).map(img => `• ${img}`).join('\n');
        const moreCount = imgList.length > 15 ? `\n... ve ${imgList.length - 15} görsel daha` : '';

        await this.openAppPrompt({
          title: 'Paket Kapsamı & Görseller',
          message: `Bu paket toplam ${imgList.length} etiketlenmiş görsel içeriyor:`,
          defaultValue: `${previewList}${moreCount}`,
          confirmText: 'Kapat'
        });
      }
    });

    // 4. Batch Assignment
    document.getElementById('teamAssignBtn')?.addEventListener('click', async () => {
      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      const batchId = document.getElementById('teamBatchSelect')?.value;
      const assignee = document.getElementById('teamAssigneeSelect')?.value;

      if (!batchId || !assignee) {
        this.showToast('Lütfen bir hedef yığın ve atanacak personeli seçiniz.', 'warning');
        return;
      }

      try {
        const res = await fetch('/api/team/assign-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, batch_id: batchId, assigned_user: assignee, lock_hours: 24 })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
          this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'Atama yapılamadı', 'error');
        }
      } catch (err) {
        this.showToast('Hata oluştu', 'error');
      }
    });

    // 5. Quick Claim Count Switcher (25 / 50 / 100)
    let selectedClaimCount = 25;
    document.querySelectorAll('.claim-count-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.claim-count-btn').forEach(b => {
          b.classList.remove('active');
          b.style.borderColor = 'rgba(255,255,255,0.1)';
          b.style.background = 'transparent';
          b.style.color = '#94a3b8';
        });
        btn.classList.add('active');
        btn.style.borderColor = '#38bdf8';
        btn.style.background = '#1e293b';
        btn.style.color = '#38bdf8';

        selectedClaimCount = parseInt(btn.dataset.count) || 25;
        const lbl = document.getElementById('claimCountLabel');
        if (lbl) lbl.textContent = selectedClaimCount;
      });
    });

    // 6. Claim Next Batch
    document.getElementById('claimNext50Btn')?.addEventListener('click', async () => {
      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      const selUser = document.getElementById('syncTeamMemberSelect')?.value;
      const inputUser = document.getElementById('syncUserNameInput')?.value.trim();
      const userName = selUser || inputUser || 'Ekip_Uyesi';

      this.showLoading(true, `Sıradaki ${selectedClaimCount} boş görsel taranıyor ve adınıza kilitleniyor...`);
      try {
        const res = await fetch('/api/team/claim-next-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, user_name: userName, count: selectedClaimCount, lock_hours: 24 })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
          this.loadTeamSyncHub();

          if (data.images && data.images.length > 0) {
            this.openProject(cat, 'editor');
            this.imageFiles = data.images;
            this.currentImageIndex = 0;
            this.renderGallery();
            this.loadImage(this.imageFiles[0]);
            this.showToast(`Size özel ${data.images.length} görsel yüklendi.`, 'info');
          }
        } else {
          this.showToast(data.message || data.detail || 'Görsel kilitlenemedi', 'warning');
        }
      } catch (err) {
        console.error(err);
        this.showToast('Bağlantı hatası', 'error');
      } finally {
        this.showLoading(false);
      }
    });

    // 7. Unlock Batch Actions (Single & All)
    document.getElementById('unlockAllBatchesBtn')?.addEventListener('click', async () => {
      const ok = await this.openAppConfirm({
        title: 'Tüm Kilitleri Serbest Bırak',
        message: 'Mevcut tüm yığın kilitlerini kaldırmak istediğinize emin misiniz? Diğer personellerin kilitleri de açılacaktır.',
        confirmText: 'Kilitleri Aç',
        danger: true
      });
      if (!ok) return;

      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      try {
        const res = await fetch('/api/team/unlock-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, unlock_all: true })
        });
        const data = await res.json();
        if (res.ok) {
          this.showToast(data.message, 'info');
          this.loadTeamSyncHub();
        }
      } catch (err) {
        this.showToast('Kilitler kaldırılamadı', 'error');
      }
    });

    document.getElementById('teamLocksList')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.unlock-single-batch-btn');
      if (!btn) return;
      const batchId = btn.dataset.batch;
      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';

      try {
        const res = await fetch('/api/team/unlock-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, batch_id: batchId })
        });
        const data = await res.json();
        if (res.ok) {
          this.showToast(data.message, 'info');
          this.loadTeamSyncHub();
        }
      } catch (err) {
        this.showToast('Kilit kaldırılamadı', 'error');
      }
    });

    // 8. Manual Snapshot Creation
    document.getElementById('createManualSnapshotBtn')?.addEventListener('click', async () => {
      const note = await this.openAppPrompt({
        title: 'Güvenlik Yedeği (Snapshot) Al',
        message: 'Yedek için açıklayıcı bir not giriniz:',
        defaultValue: 'manuel_yedek',
        placeholder: 'Örn: etiketleme_oncesi',
        confirmText: 'Yedek Oluştur'
      });
      if (note === null) return;

      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      this.showLoading(true, 'Güvenlik yedeği alınıyor...');
      try {
        const res = await fetch('/api/team/create-snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, note: note })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
          this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'Yedek alınamadı', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      } finally {
        this.showLoading(false);
      }
    });

    // 9. Snapshot Restore (Single & Quick)
    document.getElementById('teamSnapshotsList')?.addEventListener('click', async (e) => {
      const btn = e.target.closest('.restore-single-snap-btn');
      if (!btn) return;
      const snapName = btn.dataset.snap;

      const ok = await this.openAppConfirm({
        title: 'Yedeğe Geri Dön',
        message: `'${snapName}' güvenlik yedeğine dönmek istediğinize emin misiniz?`,
        confirmText: 'Yedeği Yükle',
        danger: true
      });
      if (!ok) return;

      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      this.showLoading(true, 'Yedek geri yükleniyor...');
      try {
        const res = await fetch('/api/projects/rollback-snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat, snapshot_id: snapName })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(data.message, 'success');
          this.loadTeamSyncHub();
          if (this.currentCategory) this.loadCategoryImages();
        } else {
          this.showToast(data.detail || 'Geri yükleme başarısız', 'error');
        }
      } catch (err) {
        this.showToast('Hata oluştu', 'error');
      } finally {
        this.showLoading(false);
      }
    });

    const handleRollback = async () => {
      const ok = await this.openAppConfirm({
        title: 'Güvenli Yedeğe Geri Dön',
        message: 'Mevcut etiketleri son otomatik güvenlik yedeğine (snapshot) geri döndürmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
        confirmText: 'Yedeğe Geri Dön',
        danger: true
      });
      if (!ok) return;

      const cat = this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      this.showLoading(true, 'Etiketler önceki yedeğe geri yükleniyor...');
      try {
        const res = await fetch('/api/projects/rollback-snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: cat })
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast('Etiketler önceki yedeğe başarıyla geri alındı.', 'success');
          this.loadTeamSyncHub();
          if (this.currentCategory) this.loadCategoryImages();
        } else {
          this.showToast(data.detail || 'Geri alma başarısız', 'error');
        }
      } catch (err) {
        this.showToast('Geri alma hatası', 'error');
      } finally {
        this.showLoading(false);
      }
    };

    document.getElementById('quickRollbackBtn')?.addEventListener('click', handleRollback);
    document.getElementById('batchRollbackBtn')?.addEventListener('click', handleRollback);

    // Auto-check URL for Invitation Link (?accept_invite=TOKEN)
    const urlParams = new URLSearchParams(window.location.search);
    const inviteToken = urlParams.get('accept_invite');
    if (inviteToken) {
      this.handleAcceptInvite(inviteToken);
    }
  }

  async handleAcceptInvite(token) {
    try {
      const res = await fetch('/api/teams/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(data.message, 'success');
        const cleanUrl = window.location.pathname + '?tab=team';
        window.history.replaceState({}, document.title, cleanUrl);
        if (data.team_id) this.selectedTeamId = data.team_id;
        this.loadTeamSyncHub();
      } else {
        this.showToast(data.detail || 'Davet kabul edilemedi', 'error');
      }
    } catch (e) {
      console.error(e);
    }
  }

  async loadMyActiveTask(username) {
    if (!username) return;
    const statusTxt = document.getElementById('activeTaskStatusTxt');
    const wrap = document.getElementById('activeTaskDetailsWrap');
    const title = document.getElementById('activeTaskTitle');
    const meta = document.getElementById('activeTaskMeta');
    const noteText = document.getElementById('activeTaskNoteText');
    const badge = document.getElementById('activeTaskBadge');

    try {
      const res = await fetch(`/api/team/my-tasks?username=${encodeURIComponent(username)}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        const tasks = data.tasks || [];
        const active = tasks.find(t => t.status === 'assigned') || tasks.find(t => t.status === 'submitted') || tasks[tasks.length - 1];
        if (active) {
          this.currentWorkingTask = active;
          this.currentWorkingTaskId = active.id;
          if (statusTxt) statusTxt.style.display = 'none';
          if (wrap) wrap.style.display = 'block';
          if (title) title.textContent = active.title || 'Aktif Görev';
          if (meta) meta.textContent = `Proje: ${active.category} • Toplam ${active.images ? active.images.length : 0} Görsel`;
          if (noteText) noteText.textContent = active.note || 'Özel talimat belirtilmedi.';
          
          // Live Progress Bar & Percentage
          const progText = document.getElementById('activeTaskProgressText');
          const progBar = document.getElementById('activeTaskProgressBar');
          const lCount = active.labeled_count !== undefined ? active.labeled_count : 0;
          const tCount = active.total_count || (active.images ? active.images.length : 0);
          const percent = active.progress_percent !== undefined ? active.progress_percent : (tCount > 0 ? Math.round((lCount / tCount) * 100) : 0);

          if (progText) progText.textContent = `${lCount} / ${tCount} Görsel (%${percent})`;
          if (progBar) progBar.style.width = `${percent}%`;

          // Button Controls & Feedback Box
          const startBtn = document.getElementById('startWorkingOnTaskBtn');
          const submitBtn = document.getElementById('submitCurrentTaskBtn');
          const feedbackBox = document.getElementById('activeTaskFeedbackBox');
          const feedbackTxt = document.getElementById('activeTaskFeedbackText');

          if (active.status === 'submitted') {
            if (badge) {
              badge.textContent = 'Onay Bekliyor';
              badge.style.color = '#fbbf24';
              badge.style.background = 'rgba(245,158,11,0.15)';
              badge.style.border = '1px solid rgba(245,158,11,0.3)';
            }
            if (feedbackBox) {
              feedbackBox.style.display = 'block';
              feedbackBox.style.background = 'rgba(245,158,11,0.1)';
              feedbackBox.style.borderColor = 'rgba(245,158,11,0.25)';
              feedbackBox.style.color = '#fbbf24';
              if (feedbackTxt) feedbackTxt.textContent = 'Göreviniz tamamlandı ve yönetici onayına sunuldu. İnceleme bekleniyor.';
            }
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.innerHTML = '<span>✓ Yöneticiye Teslim Edildi</span>';
              submitBtn.style.opacity = '0.7';
            }
            if (startBtn) {
              startBtn.disabled = false;
            }
          } else if (active.status === 'approved') {
            if (badge) {
              badge.textContent = 'Onaylandı ✓';
              badge.style.color = '#34d399';
              badge.style.background = 'rgba(16,185,129,0.15)';
              badge.style.border = '1px solid rgba(16,185,129,0.3)';
            }
            if (feedbackBox) {
              feedbackBox.style.display = 'block';
              feedbackBox.style.background = 'rgba(16,185,129,0.1)';
              feedbackBox.style.borderColor = 'rgba(16,185,129,0.25)';
              feedbackBox.style.color = '#34d399';
              if (feedbackTxt) feedbackTxt.textContent = active.admin_feedback || 'Göreviniz başarıyla onaylandı ve ana veri setine birleştirildi!';
            }
            if (submitBtn) {
              submitBtn.disabled = true;
              submitBtn.innerHTML = '<span>✓ Onaylandı & Birleştirildi</span>';
              submitBtn.style.opacity = '0.6';
            }
          } else {
            // Normal Assigned or Revision
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Görevi Tamamla ve Admine Teslim Et</span>';
              submitBtn.style.opacity = '1';
            }
            if (active.admin_feedback && active.admin_feedback !== 'Onaylandı') {
              if (feedbackBox) {
                feedbackBox.style.display = 'block';
                feedbackBox.style.background = 'rgba(239,68,68,0.1)';
                feedbackBox.style.borderColor = 'rgba(239,68,68,0.25)';
                feedbackBox.style.color = '#fca5a5';
                if (feedbackTxt) feedbackTxt.textContent = active.admin_feedback;
              }
              if (badge) {
                badge.textContent = 'Revizyon Talebi';
                badge.style.color = '#f87171';
                badge.style.background = 'rgba(239,68,68,0.15)';
                badge.style.border = '1px solid rgba(239,68,68,0.3)';
              }
            } else {
              if (feedbackBox) feedbackBox.style.display = 'none';
              if (badge) {
                badge.textContent = 'İşleniyor';
                badge.style.color = '#38bdf8';
                badge.style.background = 'rgba(56,189,248,0.12)';
                badge.style.border = '1px solid rgba(56,189,248,0.25)';
              }
            }
          }
        } else {
          this.currentWorkingTask = null;
          this.currentWorkingTaskId = null;
          if (wrap) wrap.style.display = 'none';
          if (statusTxt) {
            statusTxt.style.display = 'block';
            statusTxt.innerHTML = `<strong>@${username}</strong> üzerine atanmış aktif bir görev bulunmuyor. Yönetici size yeni bir görev atadığında burada görünecektir.`;
          }
        }
      }
    } catch (e) {
      console.error('Kişisel görev yüklenemedi:', e);
    }
  }

  async updateDatasetDispatchOptions(cat) {
    cat = cat || this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
    const bannerAvail = document.getElementById('dispatchAvailableCount');
    const bannerTotal = document.getElementById('dispatchTotalMeta');
    const countSelect = document.getElementById('dispatchImageCount');
    const customInput = document.getElementById('dispatchCustomCountInput');
    const taskTypeSelect = document.getElementById('dispatchTaskType');

    try {
      const res = await fetch(`/api/team/dataset-dispatch-stats?category=${encodeURIComponent(cat)}&team_id=${encodeURIComponent(this.selectedTeamId || '')}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.datasetDispatchStats = data;
        const isQA = taskTypeSelect?.value === 'qa_review';

        if (bannerAvail) {
          bannerAvail.textContent = `${data.available_unlabeled.toLocaleString()} Görsel`;
          bannerAvail.style.color = data.available_unlabeled > 0 ? '#38bdf8' : '#f87171';
        }
        if (bannerTotal) {
          bannerTotal.textContent = `Toplam: ${data.total_images.toLocaleString()} • Etiketli: ${data.labeled_count.toLocaleString()}`;
        }

        if (countSelect) {
          if (isQA) {
            const qaSample = data.suggestions.qa_sample;
            countSelect.innerHTML = `
              <option value="${qaSample}">Rastgele Kalite Örneklemi (%10 - ${qaSample} Görsel)</option>
              <option value="20">Hızlı Denetim Havuzu (20 Görsel)</option>
              <option value="50">Kapsamlı Denetim Havuzu (50 Görsel)</option>
              <option value="${data.labeled_count}">Tüm Etiketliler (${data.labeled_count} Görsel)</option>
            `;
            if (customInput) {
              customInput.max = data.labeled_count;
              customInput.value = qaSample || Math.min(20, data.labeled_count);
            }
          } else {
            const s = data.suggestions;
            const options = [];
            if (s.equal_share > 0) {
              options.push(`<option value="${s.equal_share}">Eşit Dağıt: ${s.equal_share} Görsel / Kişi (${data.team_members_count} Üye)</option>`);
            }
            if (s.percent_10 > 0) options.push(`<option value="${s.percent_10}">%10 Dilim (${s.percent_10} Görsel)</option>`);
            if (s.percent_25 > 0) options.push(`<option value="${s.percent_25}">%25 Dilim (${s.percent_25} Görsel)</option>`);
            if (s.percent_50 > 0) options.push(`<option value="${s.percent_50}">%50 Dilim (${s.percent_50} Görsel)</option>`);
            if (data.available_unlabeled >= 50) options.push(`<option value="50">Standart 50 Görsel</option>`);
            if (data.available_unlabeled >= 100) options.push(`<option value="100">Geniş 100 Görsel</option>`);
            if (s.all_remaining > 0) options.push(`<option value="${s.all_remaining}">Kalanın Tamamı (${s.all_remaining} Görsel)</option>`);

            countSelect.innerHTML = options.length > 0 ? options.join('') : '<option value="0">Boşta ham görsel kalmadı</option>';
            if (customInput) {
              customInput.max = data.available_unlabeled;
              customInput.value = s.equal_share || Math.min(50, data.available_unlabeled);
            }
          }
        }
      }
    } catch (e) {
      console.error('Dispatch metrikleri yüklenemedi:', e);
    }
  }

  async loadIncomingSyncPacks(cat) {
    cat = cat || this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
    const listEl = document.getElementById('incomingPacksList');
    const badgeEl = document.getElementById('incomingPacksBadge');
    if (!listEl) return;

    try {
      const res = await fetch(`/api/team/incoming-packs?category=${encodeURIComponent(cat)}`);
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        const packs = data.incoming_packs || [];
        if (badgeEl) badgeEl.textContent = `${packs.length} Paket`;

        if (packs.length === 0) {
          listEl.innerHTML = '<div style="color:#64748b; font-size:0.8rem; text-align:center; padding:24px 10px;">Henüz teslim edilmiş bir senkronizasyon paketi bulunmamaktadır.</div>';
        } else {
          listEl.innerHTML = packs.map(p => {
            const previewImgs = (p.preview_images || []).map(img => 
              `<span style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); padding:1px 6px; border-radius:4px; font-size:0.68rem; color:#94a3b8; font-family:monospace;">${img}</span>`
            ).join(' ');
            const imgsJson = JSON.stringify(p.all_images || []).replace(/"/g, '&quot;');

            return `
              <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(56,189,248,0.25); border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:8px;">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                  <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:26px; height:26px; border-radius:50%; background:#1e293b; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; font-size:0.75rem; font-weight:700; color:#38bdf8;">
                      ${(p.author || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <strong style="color:#f8fafc; font-size:0.84rem;">@${p.author}</strong>
                      <span style="font-size:0.7rem; color:#64748b; margin-left:6px;">${p.submitted_at || ''}</span>
                    </div>
                  </div>
                  <span style="background:rgba(16,185,129,0.12); color:#34d399; border:1px solid rgba(16,185,129,0.25); font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:6px;">
                    ${p.image_count} Görsel Teslim Edildi
                  </span>
                </div>

                ${p.user_note ? `
                  <div style="font-size:0.75rem; color:#cbd5e1; background:rgba(0,0,0,0.3); padding:6px 10px; border-radius:6px; border-left:3px solid #10b981;">
                    <strong>Personel Notu:</strong> ${p.user_note}
                  </div>
                ` : ''}

                <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap;">
                  <span style="font-size:0.68rem; color:#64748b; margin-right:4px;">Kapsam:</span>
                  ${previewImgs}
                  ${p.image_count > 6 ? `<span style="font-size:0.68rem; color:#64748b;">+${p.image_count - 6} görsel</span>` : ''}
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05);">
                  <button class="inspect-pack-images-btn btn-secondary" data-task="${p.pack_id}" data-images="${imgsJson}" style="padding:6px 10px; font-size:0.75rem; font-weight:600; border-radius:6px; display:flex; align-items:center; gap:5px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <span>Görselleri Gör</span>
                  </button>
                  <button class="quick-merge-pack-btn btn-primary" data-task="${p.pack_id}" data-author="${p.author}" data-count="${p.image_count}" style="padding:6px 12px; font-size:0.75rem; font-weight:700; background:#10b981; border:none; border-radius:6px; display:flex; align-items:center; gap:5px;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>Ana Projeye Birleştir (Merge)</span>
                  </button>
                </div>
              </div>
            `;
          }).join('');
        }
      }
    } catch (e) {
      console.error('Gelen paketler yüklenemedi:', e);
    }
  }
}

// Export class globally for modular extensions
window.DatasetEditor = DatasetEditor;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.editorApp = new DatasetEditor();
});
