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
    this.mode = 'draw'; // 'draw', 'select', 'pan'
    this.isDirty = false;
    this.autoSave = true;
    this.showGuideLines = true;
    this.clipboard = [];        // Copied boxes (Ctrl+C / Ctrl+V)
    this.prevImageBoxes = [];   // Previous image's boxes (Ctrl+Shift+V)
    this.skipEmpty = false;     // Skip images without boxes when navigating
    this._contextMenuTarget = null; // Right-click target box index

    // Advanced Quality & Interaction State
    this.autoEnhance = true;    // Auto-contrast & clarity filter on canvas
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

    // Handle Google OAuth callback params
    const urlParams = new URLSearchParams(window.location.search);
    const googleToken = urlParams.get('google_token');
    const authError = urlParams.get('auth_error');
    const displayName = urlParams.get('display_name');

    if (googleToken) {
      localStorage.setItem('yolo_auth_token', googleToken);
      if (displayName) localStorage.setItem('yolo_user_name', decodeURIComponent(displayName));
      // Clean URL
      window.history.replaceState({}, '', '/');
    }
    if (authError) {
      window.history.replaceState({}, '', '/');
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
    if (view === 'project') return '/?project=' + encodeURIComponent(params.projectId || '') + '&tab=' + (params.tab || 'upload');
    if (view === 'editor') return '/?editor=' + encodeURIComponent(params.projectId || '');
    return '/';
  }

  handlePopState(state) {
    if (!state) {
      // Check current URL params
      const p = new URLSearchParams(window.location.search);
      const editorProject = p.get('editor');
      const project = p.get('project');
      const pTab = p.get('tab');
      const auth = p.get('auth');
      const create = p.get('create');

      if (editorProject) {
        this.showEditor(editorProject, false);
      } else if (project) {
        this.openProject(project, pTab || 'upload', false);
      } else if (create) {
        this.showCreateProject(false);
      } else if (pTab) {
        this.showAppShell(pTab, false);
      } else if (auth) {
        this.showAuth(auth, false);
      } else {
        const token = localStorage.getItem('yolo_auth_token');
        if (token) {
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
    } else if (state.view === 'workspace') {
      this.showAppShell(state.params?.tab || 'agent', false);
    } else if (state.view === 'create_project') {
      this.showCreateProject(false);
    } else if (state.view === 'project') {
      this.openProject(state.params?.projectId, state.params?.tab || 'upload', false);
    } else if (state.view === 'editor') {
      this.showEditor(state.params?.projectId, false);
    }
  }



  // =====================================================
  // AUTH SYSTEM
  // =====================================================

  async checkAuth(authError = null) {
    const token = localStorage.getItem('yolo_auth_token');
    if (token) {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          this.currentUser = data.user;
          this._updateHeaderUser(data.user);
          const savedName = localStorage.getItem('yolo_user_name');
          if (savedName) {
            this.showToast(`Hoş geldiniz, ${savedName}`, 'success');
            localStorage.removeItem('yolo_user_name');
          }

          // Fetch projects before routing
          await this.fetchProjects();

          // Route according to URL parameters
          const urlParams = new URLSearchParams(window.location.search);
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
          } else if (pTab) {
            await this.showAppShell(pTab, false);
          } else {
            await this.showAppShell('agent', false);
          }
          return;
        }
      } catch (e) { }
      localStorage.removeItem('yolo_auth_token');
    }

    // No valid token → show landing
    this.showLanding(authError, false);
  }



  hideAllViews() {
    const views = ['landingView', 'authView', 'mainAppShell', 'appContainer', 'hubViewContainer', 'dashboardView'];
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
  }


  switchWorkspaceTab(tabName, pushHistory = true) {
    const tabs = {
      'agent': 'agentWorkspaceView',
      'projects': 'dashboardView',
      'assets': 'assetLibraryView',
      'explore': 'exploreView',
      'settings': 'settingsWorkspaceView'
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

    if (tabName === 'assets') {
      this.loadAssetLibrary();
    } else if (tabName === 'projects') {
      this.fetchProjects();
    }
  }


  async fetchProjects() {
    const grid = document.getElementById('projectsGrid');
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        this.projectsList = data.projects || [];
        const pCountEl = document.getElementById('wsNavProjectsCount');
        if (pCountEl) pCountEl.textContent = this.projectsList.length;
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
      const res = await fetch('/api/workspace/stats');
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
      const res = await fetch('/api/workspace/assets');
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
    const confirmed = confirm(`'${categoryId}' projesini ve ilişkili tüm verileri silmek istediğinizden emin misiniz?`);
    if (!confirmed) return;

    try {
      const res = await fetch('/api/projects/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  showAuth(mode = 'login') {
    if (window.location.hash) {
      try {
        history.replaceState(null, '', window.location.pathname + window.location.search);
      } catch (e) { }
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
    this._switchAuthMode(mode);
  }




  _switchAuthMode(mode) {
    document.getElementById('authLoginMode').style.display = mode === 'login' ? 'block' : 'none';
    document.getElementById('authRegisterMode').style.display = mode === 'register' ? 'block' : 'none';
    document.getElementById('authForgotMode').style.display = mode === 'forgot' ? 'block' : 'none';
    this._authAlertClear();
  }

  _authAlert(msg, type = 'error') {
    const el = document.getElementById('authAlert');
    if (!el) return;
    el.textContent = msg;
    el.className = `auth-alert alert-${type}`;
    el.style.display = 'block';
  }

  _authAlertClear() {
    const el = document.getElementById('authAlert');
    if (el) { el.style.display = 'none'; el.textContent = ''; }
  }

  _updateHeaderUser(user) {
    if (!user) return;
    const name = user.display_name || user.email.split('@')[0];
    const nameEl = document.getElementById('dashUserName');
    const wsUserEl = document.getElementById('wsUserName');
    const agentGreeting = document.getElementById('agentUserNameGreeting');
    const avatarEl = document.getElementById('dashUserAvatar');
    const wsAvatarEl = document.getElementById('wsUserAvatar');
    const dropNameEl = document.getElementById('dashUserDropdownName');
    const dropEmailEl = document.getElementById('dashUserDropdownEmail');

    if (nameEl) nameEl.textContent = name;
    if (wsUserEl) wsUserEl.textContent = name;
    if (agentGreeting) agentGreeting.textContent = name;

    const avatarUrl = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=3b82f6&color=fff&size=64`;
    if (avatarEl) { avatarEl.src = avatarUrl; avatarEl.onerror = () => { avatarEl.style.display = 'none'; }; }
    if (wsAvatarEl) { wsAvatarEl.src = avatarUrl; wsAvatarEl.onerror = () => { wsAvatarEl.style.display = 'none'; }; }
    if (dropNameEl) dropNameEl.textContent = name;
    if (dropEmailEl) dropEmailEl.textContent = user.email || '';

    // Populate Safe User Settings
    const prefName = document.getElementById('userPrefDisplayName');
    const prefEmail = document.getElementById('userPrefEmail');
    if (prefName) prefName.value = name;
    if (prefEmail) prefEmail.value = user.email || '';

    // Admin Access Control
    const isAdmin = user.is_admin || user.role === 'admin';
    const adminNavBtn = document.getElementById('wsNavAdmin');
    if (adminNavBtn) {
      adminNavBtn.style.display = isAdmin ? 'flex' : 'none';
    }

    const wsUserRole = document.querySelector('.ws-user-role');
    if (wsUserRole) {
      wsUserRole.textContent = isAdmin ? 'Süper Yönetici' : 'Workspace Üyesi';
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

  setupAuthEvents() {
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

    // Auth back to landing (Top button, Bottom button, and Brand Logo)
    document.getElementById('authTopBackBtn')?.addEventListener('click', () => this.showLanding());
    document.getElementById('authBrandLogoArea')?.addEventListener('click', () => this.showLanding());
    document.getElementById('authBackLandingBtn')?.addEventListener('click', () => this.showLanding());

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

    // LOGIN Submit
    document.getElementById('loginSubmitBtn')?.addEventListener('click', async () => {
      const email = document.getElementById('loginEmail')?.value.trim();
      const password = document.getElementById('loginPassword')?.value;
      this._authAlertClear();

      if (!email) { document.getElementById('loginEmailError').textContent = 'E-posta gerekli.'; return; }
      if (!password) { document.getElementById('loginPasswordError').textContent = 'Şifre gerekli.'; return; }
      document.getElementById('loginEmailError').textContent = '';
      document.getElementById('loginPasswordError').textContent = '';

      const btn = document.getElementById('loginSubmitBtn');
      btn.disabled = true; btn.querySelector('span').textContent = 'Giriş yapılıyor...';
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

          this._authAlert(data.detail || 'Giriş başarısız.', 'error');
        }
      } catch (e) {
        this._authAlert('Sunucu bağlantı hatası.', 'error');
      } finally {
        btn.disabled = false; btn.querySelector('span').textContent = 'Giriş Yap';
      }
    });

    // REGISTER Submit
    document.getElementById('registerSubmitBtn')?.addEventListener('click', async () => {
      const name = document.getElementById('registerName')?.value.trim();
      const email = document.getElementById('registerEmail')?.value.trim();
      const password = document.getElementById('registerPassword')?.value;
      const confirm = document.getElementById('registerPasswordConfirm')?.value;
      const terms = document.getElementById('registerTerms')?.checked;
      this._authAlertClear();

      // Clear errors
      ['registerNameError', 'registerEmailError', 'registerPasswordError', 'registerConfirmError'].forEach(id => {
        const el = document.getElementById(id); if (el) el.textContent = '';
      });

      let hasError = false;
      if (!name) { document.getElementById('registerNameError').textContent = 'Ad Soyad gerekli.'; hasError = true; }
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { document.getElementById('registerEmailError').textContent = 'Geçerli bir e-posta girin.'; hasError = true; }
      if (password.length < 8) { document.getElementById('registerPasswordError').textContent = 'Şifre en az 8 karakter olmalı.'; hasError = true; }
      if (password !== confirm) { document.getElementById('registerConfirmError').textContent = 'Şifreler eşleşmiyor.'; hasError = true; }
      if (!terms) { this._authAlert('Kullanım koşullarını kabul etmelisiniz.', 'error'); hasError = true; }
      if (hasError) return;

      const btn = document.getElementById('registerSubmitBtn');
      btn.disabled = true; btn.querySelector('span').textContent = 'Kayıt yapılıyor...';
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, display_name: name, password })
        });
        const data = await res.json();
        if (res.status === 409) {
          // Email already exists
          this._authAlert('Bu e-posta zaten kayıtlı. Lütfen giriş yapın.', 'error');
          document.getElementById('registerEmailError').textContent = 'Bu e-posta ile kayıt mevcut.';
        } else if (res.ok) {
          // Switch to login mode, pre-fill email, show success message
          this._switchAuthMode('login');
          const loginEmailInput = document.getElementById('loginEmail');
          if (loginEmailInput) {
            loginEmailInput.value = email;
          }
          const loginPasswordInput = document.getElementById('loginPassword');
          if (loginPasswordInput) {
            loginPasswordInput.value = '';
            loginPasswordInput.focus();
          }
          this._authAlert('Hesabınız başarıyla oluşturuldu! Lütfen şifrenizle giriş yapın.', 'success');
          this.showToast('Kayıt başarılı! Lütfen giriş yapın.', 'success');
        } else {
          this._authAlert(data.detail || 'Kayıt başarısız.', 'error');
        }
      } catch (e) {
        this._authAlert('Sunucu bağlantı hatası.', 'error');
      } finally {
        btn.disabled = false; btn.querySelector('span').textContent = 'Hesap Oluştur';
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
    if (this.mainAppShell) this.mainAppShell.style.display = 'none';
    if (this.createProjectView) this.createProjectView.style.display = 'none';
    if (this.projectHubView) this.projectHubView.style.display = 'none';
    if (this.editorView) this.editorView.style.display = 'none';
    const lv = document.getElementById('landingView');
    const av = document.getElementById('authView');
    if (lv) lv.style.display = 'none';
    if (av) av.style.display = 'none';
  }

  async showAppShell(wstab = 'agent', pushHistory = true) {
    this.currentView = 'workspace';
    this.hideAllViews();
    if (this.mainAppShell) this.mainAppShell.style.display = 'flex';
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

    // Hide all workspace subviews
    [
      this.agentWorkspaceView,
      this.dashboardView,
      this.assetLibraryView,
      this.exploreView,
      this.settingsWorkspaceView,
      this.adminWorkspaceView
    ].forEach(v => { if (v) v.classList.remove('active'); });

    // Show selected view
    if (tabName === 'agent') {
      if (this.agentWorkspaceView) this.agentWorkspaceView.classList.add('active');
    } else if (tabName === 'projects') {
      if (this.dashboardView) this.dashboardView.classList.add('active');
      await this.loadDashboardProjects();
    } else if (tabName === 'assets') {
      if (this.assetLibraryView) this.assetLibraryView.classList.add('active');
      await this.loadAssetLibrary();
    } else if (tabName === 'explore') {
      if (this.exploreView) this.exploreView.classList.add('active');
    } else if (tabName === 'settings') {
      if (this.settingsWorkspaceView) this.settingsWorkspaceView.classList.add('active');
    } else if (tabName === 'admin') {
      if (this.adminWorkspaceView) this.adminWorkspaceView.classList.add('active');
      await this.loadAdminConsoleData();
    }
  }

  async openProject(projectId, defaultTab = 'upload', pushHistory = true) {
    this.isProjectContext = true;
    this.activeHubProjectId = projectId;
    this.activeHubTab = defaultTab;

    if (pushHistory) {
      this.navigateTo('project', { projectId, tab: defaultTab });
    }

    // Ensure app shell is open
    this.hideAllViews();
    if (this.mainAppShell) this.mainAppShell.style.display = 'flex';

    // Transition global sidebar to compact icon rail mode
    if (this.globalSidebar) this.globalSidebar.classList.add('compact');

    // Slide in contextual project sidebar
    if (this.projectSidebar) this.projectSidebar.style.display = 'flex';

    // Show project hub view
    if (this.projectHubView) {
      this.projectHubView.style.display = 'flex';
      this.projectHubView.classList.add('active');
    }

    // Hide all workspace views
    [
      this.agentWorkspaceView,
      this.dashboardView,
      this.assetLibraryView,
      this.exploreView,
      this.settingsWorkspaceView
    ].forEach(v => { if (v) v.classList.remove('active'); });

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

    // Load Project Data and activate tab
    await this.loadHubProjectData();
    this.switchProjectTab(defaultTab);
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

  switchProjectTab(tabName) {
    this.activeHubTab = tabName;

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
    } else if (tabName === 'dataset') {
      const p = document.getElementById('hubTabDataset');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.renderDatasetGallery();
    } else if (tabName === 'classes' || tabName === 'settings') {
      const p = document.getElementById('hubTabSettings');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      this.renderHubSettings();
    } else if (tabName === 'train' || tabName === 'export') {
      const p = document.getElementById('hubTabSettings');
      if (p) { p.classList.add('active'); p.style.display = 'block'; }
      document.getElementById('hubExportSplitCard')?.scrollIntoView({ behavior: 'smooth' });
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

    // Hub Classes & Settings Events
    document.getElementById('hubSettingsAddClassBtn')?.addEventListener('click', () => {
      const list = document.getElementById('hubSettingsClassesList');
      if (list) {
        const row = document.createElement('div');
        row.className = 'cls-row-pill';
        row.innerHTML = `
          <input type="text" class="cls-name-input hub-c-name" value="Yeni Sınıf" placeholder="Sınıf adı">
          <input type="color" class="cls-color-input hub-c-color" value="#10b981">
          <input type="text" class="cls-prompts-input hub-c-prompts" value="" placeholder="AI Prompts (virgülle ayırın)" style="flex:2;">
          <button type="button" class="cls-del-btn hub-c-del">✕</button>
        `;
        row.querySelector('.hub-c-del')?.addEventListener('click', () => row.remove());
        list.appendChild(row);
      }
    });

    document.getElementById('hubSaveSettingsBtn')?.addEventListener('click', async () => {
      if (!this.activeHubProjectId) return;
      const displayName = document.getElementById('hubSettingsDisplayName')?.value.trim();
      const description = document.getElementById('hubSettingsDesc')?.value.trim();
      const modelKey = document.getElementById('hubSettingsModelSelect')?.value;

      const classes = [];
      document.querySelectorAll('#hubSettingsClassesList .cls-row-pill').forEach(row => {
        const name = row.querySelector('.hub-c-name')?.value.trim();
        const color = row.querySelector('.hub-c-color')?.value;
        const promptsStr = row.querySelector('.hub-c-prompts')?.value.trim();
        const prompts = promptsStr ? promptsStr.split(',').map(p => p.trim()).filter(Boolean) : [];
        if (name) {
          classes.push({ name, color: color || '#3b82f6', prompts });
        }
      });

      try {
        const res = await fetch(`/api/project-settings?category=${encodeURIComponent(this.activeHubProjectId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            display_name: displayName,
            description: description,
            model_key: modelKey,
            classes: classes
          })
        });
        if (res.ok) {
          this.showToast('Proje ayarları kaydedildi! ✓', 'success');
          await this.loadHubProjectData();
        } else {
          this.showToast('Ayarlar kaydedilemedi.', 'error');
        }
      } catch (e) {
        this.showToast('Bağlantı hatası oluştu.', 'error');
      }
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
            <button class="admin-action-btn ${isAdm ? '' : 'make-admin-btn'}" data-email="${u.email}" data-action="toggle-role">
              ${isAdm ? 'Kullanıcı Yap' : 'Admin Yap'}
            </button>
            <button class="admin-action-btn danger" data-email="${u.email}" data-action="delete">
              Sil
            </button>
          </td>
        `;

        // Role toggle action
        tr.querySelector('[data-action="toggle-role"]')?.addEventListener('click', async () => {
          const newRole = isAdm ? 'user' : 'admin';
          if (confirm(`'${u.email}' kullanıcısının rolü '${newRole}' olarak değiştirilsin mi?`)) {
            await this.updateUserRole(u.email, newRole);
          }
        });

        // Delete user action
        tr.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
          if (confirm(`'${u.email}' kullanıcısını kalıcı olarak silmek istediğinizden emin misiniz?`)) {
            await this.deleteUserAccount(u.email);
          }
        });

        tbody.appendChild(tr);
      });
    } catch (e) {
      console.error(e);
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
  }

  resetAgentToHero() {
    const hero = document.getElementById('agentHeroContainer');
    const chat = document.getElementById('agentChatContainer');
    if (hero) hero.style.display = 'block';
    if (chat) chat.style.display = 'none';
    this.chatMessages = [];
    this.currentChatAttachment = null;
    const container = document.getElementById('agentChatMessages');
    if (container) container.innerHTML = '';
  }

  startAgentConversation(initialPrompt) {
    const hero = document.getElementById('agentHeroContainer');
    const chat = document.getElementById('agentChatContainer');
    if (hero) hero.style.display = 'none';
    if (chat) {
      chat.style.display = 'flex';
      chat.scrollIntoView({ behavior: 'smooth' });
    }

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

    // 2. Add Assistant Thinking Bubble
    const typingId = 'typing_' + Date.now();
    const typingEl = document.createElement('div');
    typingEl.id = typingId;
    typingEl.className = 'chat-msg assistant';
    typingEl.innerHTML = `
      <div class="chat-msg-avatar">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path>
        </svg>
      </div>
      <div class="chat-msg-bubble" style="display:flex; align-items:center; gap:8px; color:#94a3b8;">
        <span class="pulse-dot"></span>
        <span>${attachment ? 'Görsel YOLOWorld açık sözlüklü yapay zeka ile taranıyor...' : 'YOLOWorld modeli analizi yürütülüyor ve sınıflar tasarlanıyor...'}</span>
      </div>
    `;
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    try {
      const payload = {
        prompt: promptText,
        image_base64: attachment ? attachment.base64 : null,
        image_name: attachment ? attachment.name : null
      };

      const res = await fetch('/api/agent/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      // Remove typing bubble
      document.getElementById(typingId)?.remove();

      if (res.ok && data.type === 'chat' && data.message) {
        // Natural chat conversation response with Engine Source Badge
        const sourceBadge = data.source ? `<div style="font-size:0.75rem; color:#818cf8; font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:6px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#818cf8;"></span>${data.source}</div>` : '';
        const formattedMsg = sourceBadge + this._escapeHtml(data.message).replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>');
        this.appendChatMessage('assistant', formattedMsg, true);
      } else if (res.ok && data.blueprint) {
        const bp = data.blueprint;
        this.currentBlueprint = bp;
        const sourceBadge = data.source ? `<div style="font-size:0.75rem; color:#818cf8; font-weight:700; margin-bottom:6px; display:flex; align-items:center; gap:6px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#818cf8;"></span>${data.source}</div>` : '';

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
    } catch (e) {
      document.getElementById(typingId)?.remove();
      this.appendChatMessage('assistant', 'Bağlantı hatası oluştu. Lütfen ağ bağlantınızı kontrol edin.');
    }
  }

  appendChatMessage(role, content, isHtml = false) {
    const messagesContainer = document.getElementById('agentChatMessages');
    if (!messagesContainer) return;

    const msgEl = document.createElement('div');
    msgEl.className = `chat-msg ${role}`;

    if (role === 'user') {
      msgEl.innerHTML = `
        <div class="chat-msg-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
        <div class="chat-msg-bubble">${isHtml ? content : this._escapeHtml(content)}</div>
      `;
    } else {
      msgEl.innerHTML = `
        <div class="chat-msg-avatar">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path>
          </svg>
        </div>
        <div class="chat-msg-bubble">${isHtml ? content : this._escapeHtml(content)}</div>
      `;
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
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_name: bp.folder,
          display_name: bp.name,
          description: bp.description,
          classes: bp.classes,
          visibility: 'public',
          license: 'CC BY 4.0',
          project_type: bp.type || 'detection'
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
      const res = await fetch(`/api/workspace/assets?${query.toString()}`);
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
    try {
      const res = await fetch(`/api/project-settings?category=${encodeURIComponent(this.activeHubProjectId)}`);
      const data = await res.json();
      this.currentHubMeta = data;

      // Update Hub Title & Badges
      const titleEl = document.getElementById('hubProjectTitle');
      if (titleEl) titleEl.textContent = data.display_name || this.activeHubProjectId;

      const annBadge = document.getElementById('hubAnnotateBadge');
      if (annBadge) annBadge.textContent = data.empty_images || 0;

      const dsBadge = document.getElementById('hubDatasetBadge');
      if (dsBadge) dsBadge.textContent = data.total_images || 0;

      // Fetch full image list
      const imgRes = await fetch(`/api/images?category=${encodeURIComponent(this.activeHubProjectId)}`);
      const imgData = await imgRes.json();
      this.currentHubImages = imgData.images || [];

    } catch (err) {
      console.error('Error loading hub project data:', err);
    }
  }

  renderAnnotateKanban() {
    const unassignedList = document.getElementById('kanbanUnassignedList');
    const annotatingList = document.getElementById('kanbanAnnotatingList');
    const completedList = document.getElementById('kanbanCompletedList');

    const images = this.currentHubImages || [];
    const emptyCount = images.filter(i => !i.has_label_file || i.box_count === 0).length;
    const labeledCount = images.filter(i => i.has_label_file && i.box_count > 0).length;

    const uBadge = document.getElementById('kanbanUnassignedBadge');
    if (uBadge) uBadge.textContent = `${emptyCount} Resim`;
    const cBadge = document.getElementById('kanbanCompletedBadge');
    if (cBadge) cBadge.textContent = `${labeledCount} Resim`;

    if (unassignedList) {
      if (emptyCount === 0) {
        unassignedList.innerHTML = '<div class="empty-state">Tüm resimler etiketlendi!</div>';
      } else {
        unassignedList.innerHTML = `
          <div class="kanban-batch-card" id="startAnnotateBatchCard">
            <div class="k-card-title">Ana Ham Resim Havuzu</div>
            <div class="k-card-meta">${emptyCount} adet etiket bekleyen görsel var</div>
            <button class="btn-primary btn-sm" style="margin-top:8px;" id="kanbanGoEditorBtn">
              Etiketlemeye Başla ➔
            </button>
          </div>
        `;
        document.getElementById('kanbanGoEditorBtn')?.addEventListener('click', () => {
          this.showEditor(this.activeHubProjectId);
        });
      }
    }

    if (annotatingList) {
      annotatingList.innerHTML = `
        <div class="kanban-batch-card">
          <div class="k-card-title">Oturum / Aktif Kullanıcı</div>
          <div class="k-card-meta">${labeledCount} / ${images.length} (%${images.length > 0 ? (labeledCount / images.length * 100).toFixed(1) : 0}) tamamlandı</div>
        </div>
      `;
    }

    if (completedList) {
      if (labeledCount === 0) {
        completedList.innerHTML = '<div class="empty-state">Henüz onaylanan etiket yok.</div>';
      } else {
        completedList.innerHTML = `
          <div class="kanban-batch-card">
            <div class="k-card-title">Hazır Veri Seti</div>
            <div class="k-card-meta">${labeledCount} görsel YOLO formatında hazır</div>
            <button class="btn-secondary btn-sm" style="margin-top:8px;" id="kanbanExportBtn">
              ZIP Olarak İndir
            </button>
          </div>
        `;
        document.getElementById('kanbanExportBtn')?.addEventListener('click', () => {
          this.openExportModal(this.activeHubProjectId);
        });
      }
    }
  }

  renderDatasetGallery() {
    const grid = document.getElementById('datasetGalleryGrid');
    if (!grid) return;

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
      grid.innerHTML = `
        <div class="empty-state-card" style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: rgba(15, 23, 42, 0.4); border: 1px dashed rgba(255,255,255,0.12); border-radius: 16px; margin-top: 20px;">
          <div style="width: 52px; height: 52px; background: rgba(255,255,255,0.06); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
          </div>
          <h3 style="font-size: 1.25rem; font-weight: 700; color: #fff; margin-bottom: 8px;">Bu Projede Henüz Görsel Yok</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 480px; margin: 0 auto 20px; line-height: 1.5;">
            Projenizi eğitmeye veya etiketlemeye başlamak için bilgisayarınızdan görseller veya hazır YOLO etiket dosyaları yükleyin.
          </p>
          <button class="btn-primary" id="datasetEmptyGoUploadBtn" style="padding: 10px 24px; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <span>Görsel Yükle (Upload Data)</span>
          </button>
        </div>
      `;
      document.getElementById('datasetEmptyGoUploadBtn')?.addEventListener('click', () => {
        this.switchProjectTab('upload');
      });
      return;
    }

    grid.innerHTML = '';
    images.slice(0, 120).forEach(img => {
      const card = document.createElement('div');
      card.className = `gallery-item-card ${this.selectedDatasetImageFilenames.has(img.filename) ? 'selected' : ''}`;

      const imgSrc = showBoxes && img.has_label_file && img.box_count > 0
        ? `/api/preview-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}`
        : `/api/image-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}`;

      card.innerHTML = `
        <input type="checkbox" class="gallery-select-checkbox" data-file="${img.filename}" ${this.selectedDatasetImageFilenames.has(img.filename) ? 'checked' : ''}>
        <img src="${imgSrc}" loading="lazy" alt="${img.filename}" onerror="this.src='/api/image-file?category=${encodeURIComponent(this.activeHubProjectId)}&filename=${encodeURIComponent(img.filename)}'">
        <div class="gallery-item-badge">${img.box_count > 0 ? `${img.box_count} Box` : 'Boş'}</div>
      `;

      card.querySelector('.gallery-select-checkbox')?.addEventListener('change', (e) => {
        e.stopPropagation();
        if (e.target.checked) {
          this.selectedDatasetImageFilenames.add(img.filename);
        } else {
          this.selectedDatasetImageFilenames.delete(img.filename);
        }
        this.updateDatasetSelectionBar();
      });

      card.addEventListener('click', () => {
        this.showEditor(this.activeHubProjectId);
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

  renderHubSettings() {
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
      (this.currentHubMeta.classes || []).forEach((c, idx) => {
        const row = document.createElement('div');
        row.className = 'cls-row-pill';
        row.innerHTML = `
          <input type="text" class="cls-name-input hub-c-name" value="${c.name || ''}" placeholder="Sınıf adı">
          <input type="color" class="cls-color-input hub-c-color" value="${c.color || '#3b82f6'}">
          <input type="text" class="cls-prompts-input hub-c-prompts" value="${(c.prompts || []).join(', ')}" placeholder="AI Prompts (virgülle ayırın)" style="flex:2;">
          <button type="button" class="cls-del-btn hub-c-del">✕</button>
        `;
        row.querySelector('.hub-c-del')?.addEventListener('click', () => row.remove());
        list.appendChild(row);
      });
    }
  }

  async showEditor(categoryId, pushHistory = true) {
    this.currentView = 'editor';
    if (pushHistory) {
      this.navigateTo('editor', { projectId: categoryId });
    }
    this.hideAllViews();
    if (this.editorView) this.editorView.style.display = 'flex';

    if (this.isLeftCollapsed) this.mainLayout?.classList.add('left-collapsed');
    if (this.isRightCollapsed) this.mainLayout?.classList.add('right-collapsed');

    await this.loadCategories(categoryId);
  }



  // =====================================================
  // DASHBOARD DATA & RENDERING
  // =====================================================

  async loadDashboardProjects() {
    if (!this.projectsGrid) return;
    this.projectsGrid.innerHTML = '<div class="dash-loading-card">Projeler taranıyor ve yükleniyor...</div>';

    try {
      const res = await fetch('/api/projects');
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

    if (list.length === 0) {
      if (query) {
        this.projectsGrid.innerHTML = `
          <div class="empty-state-modern" style="grid-column: 1 / -1;">
            <div class="empty-state-icon-wrap">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
            </div>
            <h3>Eşleşen Proje Bulunamadı</h3>
            <p>"${this._escapeHtml(query)}" aramasına uygun herhangi bir proje bulunamadı. Lütfen arama teriminizi kontrol edin.</p>
          </div>
        `;
      } else {
        this.projectsGrid.innerHTML = `
          <div class="empty-state-modern" style="grid-column: 1 / -1;">
            <div class="empty-state-icon-wrap">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h3>Henüz Kayıtlı Proje Bulunmuyor</h3>
            <p>AI Asistan ile sohbet ederek veya sihirbazı kullanarak saniyeler içinde yeni bir veri seti projesi başlatabilirsiniz.</p>
            <button class="btn-primary" id="emptyDashGoAgentBtn" style="margin-top:18px;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
              <span>AI Asistan ile Proje Başlat</span>
            </button>
          </div>
        `;
        document.getElementById('emptyDashGoAgentBtn')?.addEventListener('click', () => this.switchWorkspaceTab('agent'));
      }
      return;
    }

    this.projectsGrid.innerHTML = '';
    list.forEach(proj => {
      const card = document.createElement('div');
      card.className = 'project-card';

      const coverHtml = proj.sample_image
        ? `<img src="${proj.sample_image}" alt="${proj.name}" loading="lazy">`
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
            <button class="btn-card-tool" data-action="export" data-id="${proj.id}" title="YOLO Train/Val ZIP İndir">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            </button>
            <button class="btn-card-tool btn-card-del" data-action="delete" data-id="${proj.id}" title="Projeyi Sil">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
      `;


      card.querySelector('[data-action="open"]')?.addEventListener('click', () => this.showProjectHub(proj.id, 'upload'));
      card.querySelector('.project-card-cover')?.addEventListener('click', () => this.showProjectHub(proj.id, 'dataset'));
      card.querySelector('.project-card-title')?.addEventListener('click', () => this.showProjectHub(proj.id, 'dataset'));
      card.querySelector('[data-action="batch"]')?.addEventListener('click', () => this.openBatchModal(proj.id));
      card.querySelector('[data-action="config"]')?.addEventListener('click', () => this.showProjectHub(proj.id, 'settings'));
      card.querySelector('[data-action="export"]')?.addEventListener('click', () => this.openExportModal(proj.id));
      card.querySelector('[data-action="delete"]')?.addEventListener('click', () => this.deleteProject(proj.id));

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
        if (m) m.style.display = 'none';
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
      if (this.activeHubProjectId) this.showEditor(this.activeHubProjectId);
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
        const res = await fetch('/api/projects/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folder_name: folderName,
            display_name: rawName,
            description: `${rawName} ${typeLabel} projesi`,
            classes: classes,
            visibility: visibility,
            license: license,
            project_type: projectType,
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

    hubConfirmUploadBtn?.addEventListener('click', async () => {
      if (!this.stagedUploadFiles || this.stagedUploadFiles.length === 0) {
        this.showToast('Lütfen önce dosya seçiniz.', 'warning');
        return;
      }
      if (!this.activeHubProjectId) return;

      const overlay = document.getElementById('hubUploadProgressOverlay');
      if (overlay) overlay.style.display = 'flex';

      const formData = new FormData();
      formData.append('category', this.activeHubProjectId);
      this.stagedUploadFiles.forEach(f => formData.append('files', f));

      try {
        const res = await fetch('/api/projects/upload-images', {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (res.ok && data.status === 'ok') {
          this.showToast(`Başarılı! ${data.uploaded_count} görsel ve ${data.uploaded_labels} etiket yüklendi.`, 'success');
          this.stagedUploadFiles = [];
          if (hubStagedSummaryRow) hubStagedSummaryRow.style.display = 'none';
          await this.loadHubProjectData();
          this.switchHubTab('annotate'); // Switch to Annotate board
        } else {
          this.showToast(data.detail || 'Yükleme sırasında hata oluştu.', 'error');
        }
      } catch (err) {
        console.error(err);
        this.showToast('Yükleme başarısız oldu.', 'error');
      } finally {
        if (overlay) overlay.style.display = 'none';
      }
    });

    // Hub Tab: Dataset Export and Batch AI buttons
    document.getElementById('hubExportZipBtn')?.addEventListener('click', () => {
      if (this.activeHubProjectId) this.openExportModal(this.activeHubProjectId);
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
        classes.push({ id: idx, name: cName, color: cColor, prompts });
      });

      this.showLoading(true, 'Ayarlar kaydediliyor...');
      try {
        const res = await fetch('/api/project-settings/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            category: this.activeHubProjectId,
            display_name: dName,
            description: dDesc,
            classes: classes
          })
        });
        if (res.ok) {
          this.showToast('Ayarlar başarıyla güncellendi.', 'success');
          await Promise.all([
            this.loadHubProjectData(),
            this.loadDashboardProjects(),
            this.loadCategories(this.activeHubProjectId)
          ]);
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
      if (confirm(`"${this.activeHubProjectId}" projesini ve tüm resimlerini kalıcı olarak silmek istediğinize emin misiniz?`)) {
        await this.deleteProject(this.activeHubProjectId);
        this.showDashboard();
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

    // Back to Dashboard button in editor header
    this.backToDashBtn?.addEventListener('click', () => {
      this.closeProjectToWorkspace();
    });


    // Batch Auto-Labeling Modal
    document.getElementById('batchConfRange')?.addEventListener('input', (e) => {
      const pct = Math.round(parseFloat(e.target.value) * 100);
      document.getElementById('batchConfVal').textContent = `%${pct}`;
    });

    document.getElementById('startBatchBtn')?.addEventListener('click', () => this.startBatchAutoLabel());
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

  openBatchModal(catId) {
    this.activeModalCategory = catId;
    const proj = this.projects.find(p => p.id === catId);
    document.getElementById('batchProjTitle').textContent = `Proje: ${proj ? proj.name : catId} (${proj ? proj.image_count : 0} resim)`;

    document.getElementById('batchProgressContainer').style.display = 'none';
    document.getElementById('startBatchBtn').style.display = 'inline-flex';
    document.getElementById('stopBatchBtn').style.display = 'none';

    const m = document.getElementById('batchAutoLabelModal');
    if (m) m.style.display = 'flex';
  }

  async startBatchAutoLabel() {
    if (!this.activeModalCategory) return;
    const conf = parseFloat(document.getElementById('batchConfRange')?.value || '0.07');
    const overwrite = document.getElementById('batchOverwriteCheck')?.checked || false;

    try {
      const res = await fetch('/api/projects/batch-auto-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: this.activeModalCategory,
          conf_threshold: conf,
          overwrite_existing: overwrite
        })
      });
      const data = await res.json();
      if (data.status === 'started' || data.status === 'already_running') {
        document.getElementById('batchProgressContainer').style.display = 'block';
        document.getElementById('startBatchBtn').style.display = 'none';
        document.getElementById('stopBatchBtn').style.display = 'inline-flex';
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

        if (data.status === 'running') {
          const pct = data.total > 0 ? ((data.current / data.total) * 100).toFixed(1) : 0;
          document.getElementById('batchProgressBar').style.width = `${pct}%`;
          document.getElementById('batchProgressPct').textContent = `%${pct}`;
          document.getElementById('batchProcessedCount').textContent = `${data.current} / ${data.total} resim`;
          document.getElementById('batchNewCount').textContent = `+${data.newly_labeled} yeni kutu eklendi`;
          document.getElementById('batchStatusText').textContent = 'Yapay zeka etiketliyor...';
        } else if (data.status === 'completed') {
          document.getElementById('batchProgressBar').style.width = `100%`;
          document.getElementById('batchProgressPct').textContent = `100%`;
          document.getElementById('batchStatusText').textContent = 'Toplu etiketleme tamamlandı.';
          document.getElementById('stopBatchBtn').style.display = 'none';
          document.getElementById('startBatchBtn').style.display = 'inline-flex';
          clearInterval(this.batchPollTimer);
          this.loadDashboardProjects();
        } else if (data.status === 'stopped') {
          document.getElementById('batchStatusText').textContent = 'İşlem durduruldu.';
          document.getElementById('stopBatchBtn').style.display = 'none';
          document.getElementById('startBatchBtn').style.display = 'inline-flex';
          clearInterval(this.batchPollTimer);
        }
      } catch (e) {
        clearInterval(this.batchPollTimer);
      }
    }, 800);
  }

  async stopBatchAutoLabel() {
    if (!this.activeModalCategory) return;
    try {
      await fetch(`/api/projects/batch-stop?category=${this.activeModalCategory}`, { method: 'POST' });
    } catch (e) { }
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

    // Mode Switches
    this.toolDrawBtn.addEventListener('click', () => this.setMode('draw'));
    this.toolSelectBtn.addEventListener('click', () => this.setMode('select'));
    this.toolPanBtn.addEventListener('click', () => this.setMode('pan'));

    // Category Change in editor dropdown
    this.categorySelect.addEventListener('change', (e) => {
      this.currentCategory = e.target.value;
      this.currentIndex = 0;
      this.loadCategoryImages();
    });

    // Filter Change
    this.filterSelect.addEventListener('change', () => this.applyFilter());

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
    this.deleteSelectedBtn.addEventListener('click', () => this.deleteSelectedBoxes());
    this.deleteBtnLabel.addEventListener('click', () => this.deleteSelectedBoxes());
    this.selectAllBtn.addEventListener('click', () => this.selectAllBoxes());
    this.clearAllBtn.addEventListener('click', () => this.clearAllBoxes());

    if (this.undoBtn) this.undoBtn.addEventListener('click', () => this.undo());
    if (this.redoBtn) this.redoBtn.addEventListener('click', () => this.redo());
    this.revertBtn.addEventListener('click', () => this.revertBoxes());

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
      this.autoLabelBtn.addEventListener('click', () => this.autoLabelCurrent());
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
        this.autoLabelCurrent();
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
    this.viewport.addEventListener('mouseleave', () => {
      this.cursorPos = { x: -1, y: -1 };
      this.render();
    });

    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Window Resize
    window.addEventListener('resize', () => {
      if (this.currentView === 'editor' && this.imageObj) {
        this.fitToViewport();
      }
    });

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
      const res = await fetch('/api/categories');
      const data = await res.json();
      this.categories = data.categories || [];
      this.classes = data.classes || {};

      this.categorySelect.innerHTML = '';
      this.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = `${cat.name} (${cat.image_count} resim)`;
        this.categorySelect.appendChild(opt);
      });

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
        this.categorySelect.value = initialCat;
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
      const res = await fetch(`/api/images?category=${encodeURIComponent(this.currentCategory)}`);
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
    const filterType = this.filterSelect.value;
    const query = this.imageSearchInput.value.trim().toLowerCase();

    this.filteredImages = this.images.filter(img => {
      if (filterType === 'labeled' && img.box_count === 0) return false;
      if (filterType === 'empty' && img.box_count > 0) return false;
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

  async saveCurrentLabel(showFeedback = true) {
    if (!this.currentCategory || !this.currentImage) return;

    try {
      const res = await fetch('/api/save-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: this.currentCategory,
          image_filename: this.currentImage.filename,
          boxes: this.boxes,
          update_preview: true
        })
      });

      const data = await res.json();
      if (data.status === 'ok') {
        this.savedBoxesSnapshot = JSON.parse(JSON.stringify(this.boxes));
        this.setDirty(false);

        this.currentImage.box_count = this.boxes.length;
        this.currentImage.has_label_file = true;

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
          this.showToast(`Kaydedildi (${this.boxes.length} kutu)`, 'success');
        }
      }
    } catch (err) {
      this.showToast('Kayıt sırasında hata oluştu', 'error');
      console.error(err);
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

    if (this.showGuideLines && this.cursorPos.x >= 0 && this.cursorPos.y >= 0 && this.mode !== 'pan') {
      this.drawCrosshairGuidelines();
    }

    if (this.cursorPos.x >= 0 && this.cursorPos.y >= 0) {
      this.renderLoupe(this.cursorPos);
    }
  }

  drawBox(box, isSelected, index) {
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
      this.autoLabelCurrent();
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
    this.toolDrawBtn.classList.toggle('active', mode === 'draw');
    this.toolSelectBtn.classList.toggle('active', mode === 'select');
    this.toolPanBtn.classList.toggle('active', mode === 'pan');

    const cursors = { draw: 'crosshair', select: 'default', pan: 'grab' };
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

      item.innerHTML = `
        <div class="box-item-header">
          <input type="checkbox" class="box-select-checkbox-item" ${isSelected ? 'checked' : ''} title="Seç">
          <span class="box-color-dot" style="background-color: ${color};"></span>
          <span class="box-class-title">#${idx + 1} - ${box.class_id}: ${name}</span>
          <button class="box-delete-btn" title="Kutuyu Sil">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
        <div class="box-item-coords">
          <span>x:${box.x_center.toFixed(2)} y:${box.y_center.toFixed(2)} w:${box.width.toFixed(2)} h:${box.height.toFixed(2)}</span>
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
    if (!overlay) return;

    if (!show) {
      overlay.classList.remove('active');
      setTimeout(() => {
        if (!overlay.classList.contains('active')) {
          overlay.style.display = 'none';
        }
      }, 250);
      return;
    }

    let opts = {};
    if (typeof titleOrOpts === 'object' && titleOrOpts !== null) {
      opts = titleOrOpts;
    } else {
      opts = { title: titleOrOpts, text: text, progress: progress };
    }

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
      if (progressPct) progressPct.textContent = `%${pct}`;
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

      const res = await fetch('/api/auto-label-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: this.currentCategory,
          image_filename: this.currentImage.filename,
          conf_threshold: 0.08,
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
    const confirmed = confirm(`"${category}" projesini ve içindeki tüm resimleri/etiketleri kalıcı olarak silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz!`);
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

    const confirmMsg = `"${filename}" görselini ve varsa etiket dosyasını kalıcı olarak silmek istiyor musunuz?`;
    if (!confirm(confirmMsg)) return;

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
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.editorApp = new DatasetEditor();
});
