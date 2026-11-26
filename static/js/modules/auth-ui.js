/**
 * AutoLabel Studio - AuthUI Module
 * ============================
 * Auth canvas animation, login/register/forgot forms, privacy view, password strength, checkAuth.
 *
 * DatasetEditor.prototype uzerine guvenli ES6 sinif genisletme kalibiyla enjekte edilir.
 */

(function installAuthUI(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    console.error('[AuthUI] DatasetEditor henuz yuklenmedi!');
    return;
  }

  class _AuthUIExtension {
  async checkAuth(authError = null) {
    const urlHash = window.location.hash;
    const hashParams = new URLSearchParams(urlHash.startsWith('#') ? urlHash.slice(1) : urlHash);
    const urlParams = new URLSearchParams(window.location.search);
    // Hash'ten oku (güvenli yol) — query string'deki legacy google_token artık gelmez
    const googleTokenFromUrl = hashParams.get('google_token');
    const token = googleTokenFromUrl || localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');

    if (googleTokenFromUrl) {
      // Kısa süreli hash'ten token'ı kalıcı depolamaya taşı ve hash'i temizle
      localStorage.setItem('yolo_auth_token', googleTokenFromUrl);
      localStorage.setItem('authToken', googleTokenFromUrl);
      sessionStorage.setItem('authToken', googleTokenFromUrl);
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    if (token) {
      if (typeof this.showLoading === 'function' && !urlParams.get('auth')) {
        this.showLoading(true, 'Bilgiler Getiriliyor...', 'Kullanıcı verileri ve çalışma alanı hazırlanıyor...');
      }
      // Token varken sayfa açılışında siyah ekran veya login formu sıçramasını engelle
      const preShell = document.getElementById('mainAppShell') || this.mainAppShell;
      if (preShell && !urlParams.get('auth')) {
        preShell.style.display = 'flex';
        preShell.classList.add('active');
      }

      let isTokenValid = false;
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          this.currentUser = data.user;
          this._updateHeaderUser(data.user);
          // DOM elementlerinin tam oturmasını garantiye almak için küçük bir gecikmeyle tekrar tazele
          setTimeout(() => {
            if (this.currentUser) this._updateHeaderUser(this.currentUser);
          }, 50);
          isTokenValid = true;

          // Synchronize token across all storage keys
          localStorage.setItem('yolo_auth_token', token);
          localStorage.setItem('authToken', token);
          sessionStorage.setItem('authToken', token);

          if (typeof this.showLoading === 'function' && !urlParams.get('auth')) {
            this.showLoading(true, 'Bilgiler Getiriliyor...', 'Çalışma alanları ve projeler taranıyor...');
          }

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

          // Workspace analysis loader SADECE ilk kez Google ile oturum açılıp yönlendirildiğinde gösterilsin
          if (googleTokenFromUrl) {
            this._showAuthAnalysis('Google ile Giriş Yapıldı', 'Çalışma alanı taranıyor ve analiz ediliyor...');
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
          const pendingInvite = localStorage.getItem('pending_invite_token') || urlParams.get('accept_invite') || urlParams.get('invite');

          if (googleTokenFromUrl) {
            if (hasWorkspace || isAdmin || pendingInvite) {
              const msg = pendingInvite ? 'Takım daveti bulundu, davet onayına yönlendiriliyorsunuz...' : 'Çalışma alanı doğrulandı, stüdyo açılıyor...';
              this._updateAuthAnalysisStep('workspace_done', msg);
              this._updateAuthAnalysisStep('redirect_done', 'Yönlendiriliyorsunuz...');
            } else {
              this._updateAuthAnalysisStep('workspace_done', 'Çalışma alanı bulunamadı, sihirbaz başlatılıyor...');
            }
            await new Promise(r => setTimeout(r, 450));
            this._hideAuthAnalysis();
          }

          // If user has NO workspace yet AND has NO pending invitation AND is not admin, show onboarding wizard!
          if (!hasWorkspace && !isAdmin && !pendingInvite) {
            this.openWorkspaceOnboarding();
            return;
          }

          // Load user workspaces into the switcher
          try {
            await this.loadUserWorkspaces();
          } catch (e) {
            console.warn('loadUserWorkspaces error:', e);
          }

          // Fetch projects before routing
          try {
            await this.fetchProjects();
          } catch (e) {
            console.warn('fetchProjects error:', e);
          }

          // URL ve path bazli routing
          const cleanPath = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
          const knownTabs = ['settings', 'team', 'projects', 'models', 'train', 'admin', 'explore', 'assets', 'agent'];
          const pathTab = knownTabs.includes(cleanPath) ? cleanPath : null;
          const editorProject = urlParams.get('editor');
          const project = urlParams.get('project');
          const pTab = urlParams.get('tab') || pathTab;
          const create = urlParams.get('create');

          try {
            if (editorProject) {
              await this.showEditor(editorProject, true);
            } else if (project) {
              await this.openProject(project, pTab || 'upload', true);
            } else if (create) {
              if (typeof this.showCreateProjectModal === 'function') await this.showCreateProjectModal();
            } else if (pTab === 'privacy' || urlParams.get('view') === 'privacy') {
              this.showPrivacy('workspace', true);
            } else if (pTab) {
              await this.showAppShell(pTab, true);
            } else {
              const defaultTab = isAdmin ? 'admin' : 'agent';
              await this.showAppShell(defaultTab, true);
            }
          } catch (routeErr) {
            console.warn('[checkAuth] Routing error:', routeErr);
          } finally {
            if (typeof this.showLoading === 'function') this.showLoading(false);
          }
          return;
        }
      } catch (e) {
        console.warn('[checkAuth] /api/auth/me error:', e);
      }

      // Token gecersiz -- storage temizle
      if (typeof this.showLoading === 'function') this.showLoading(false);
      const wasGoogleToken = !!googleTokenFromUrl;
      localStorage.removeItem('yolo_auth_token');
      localStorage.removeItem('authToken');
      sessionStorage.removeItem('authToken');
      if (wasGoogleToken) {
        this._pendingAuthError = this._pendingAuthError ||
          'Google ile giris dogrulanamadi. Sunucu hatasi olabilir, lutfen tekrar deneyin.';
      }
    }

    // Bekleyen hata mesaji varsa login formu ac
    if (this._pendingAuthError) {
      const errMsg = this._pendingAuthError;
      this._pendingAuthError = null;
      this.showAuth('login', false);
      setTimeout(() => { this._authAlert(errMsg, 'error'); }, 350);
      return;
    }

    // auth_error param -- mesaji goster
    const _errMap = {
      google_denied: 'Google ile giris iptal edildi.',
      google_no_email: 'Google hesabindan e-posta alinamadi.',
      google_session_failed: 'Oturum olusturulurken sunucu hatasi olustu. Lutfen tekrar deneyin.',
      google_failed: 'Google ile giris sirasinda bir hata olustu. Lutfen tekrar deneyin.',
    };
    if (authError) {
      const errMsg = _errMap[authError] || ('Giris basarisiz: ' + authError);
      this.showAuth('login', false);
      setTimeout(() => { this._authAlert(errMsg, 'error'); }, 350);
      return;
    }

    // Normal akis -- token yok, landing veya auth ekrani
    const unauthParams = new URLSearchParams(window.location.search);
    const uTab = unauthParams.get('tab');
    const uAuth = unauthParams.get('auth');
    const uEditor = unauthParams.get('editor');
    if (uEditor) {
      try {
        await this.showEditor(uEditor, false);
        return;
      } catch (err) {
        console.warn('Guest editor routing error:', err);
      }
    }

    if (uTab === 'privacy' || unauthParams.get('view') === 'privacy') {
      this.showPrivacy('landing', false);
    } else if (uAuth === 'login' || uAuth === 'register') {
      this.showAuth(uAuth, false);
    } else {
      this.showLanding(authError, false);
    }
    if (typeof window.triggerHeroDemoSlide === 'function') setTimeout(() => window.triggerHeroDemoSlide(0), 100);
    if (typeof window.goToLandingPage === 'function') setTimeout(() => window.goToLandingPage(0), 50);
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
    // Açılış yükleme overlay'ini kapat
    if (typeof this.showLoading === 'function') this.showLoading(false);

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
    if (!this._authCanvasRunning && typeof this.startAuthCanvas === 'function') {
      this.startAuthCanvas();
    }
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
      // If authView is hidden, stop loop to save 100% CPU/GPU resources
      if (!authView || authView.style.display === 'none') {
        this._authCanvasRunning = false;
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

    this.startAuthCanvas = () => {
      if (this._authCanvasRunning) return;
      this._authCanvasRunning = true;
      render();
    };

    this.startAuthCanvas();
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
    document.getElementById('authMobileBrandBtn')?.addEventListener('click', () => this.showLanding());

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
        if (typeof this.showLoading === 'function') {
          this.showLoading(true, 'Bilgiler Getiriliyor...', 'Kullanıcı hesabı ve oturum doğrulanıyor...');
        }
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

          if (typeof this.showLoading === 'function') {
            this.showLoading(true, 'Bilgiler Getiriliyor...', 'Çalışma alanı ve projeler hazırlanıyor...');
          }

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

          // EĞER KULLANICI BİR TAKIM DAVETİ İÇİN GİRİŞ YAPTIYSA DOĞRUDAN DAVET KARTINA DÖN!
          const pendingInvite = localStorage.getItem('pending_invite_token');
          if (pendingInvite && typeof this.showTeamInviteLandingCard === 'function') {
            this._hideAuthAnalysis();
            const authView = document.getElementById('authView');
            if (authView) authView.style.display = 'none';
            await this.showAppShell('agent', false);
            setTimeout(() => {
              this.showTeamInviteLandingCard(pendingInvite);
            }, 150);
            return;
          }

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
            await this.showAppShell(targetInitialTab);
            window.history.replaceState({ view: 'workspace', params: { tab: targetInitialTab } }, '', `/?tab=${targetInitialTab}`);
            this._isAppReady = true;
          }
        } else {
          if (typeof this.showLoading === 'function') this.showLoading(false);
          this._hideAuthAnalysis();
          const errMsg = data.detail || 'E-posta veya şifre hatalı. Lütfen tekrar deneyin.';
          passwordInput?.classList.add('input-error');
          if (passwordError) passwordError.textContent = errMsg;
          passwordInput?.focus();
          passwordInput?.select();
          this._authAlert(errMsg, 'error');
        }
      } catch (e) {
        if (typeof this.showLoading === 'function') this.showLoading(false);
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
          // Başarılı kayıt sonrası otomatik oturum açma
          if (data.token) {
            localStorage.setItem('yolo_auth_token', data.token);
            localStorage.setItem('authToken', data.token);
            sessionStorage.setItem('authToken', data.token);
            this.currentUser = data.user;
            this._updateHeaderUser(data.user);

            const pendingInvite = localStorage.getItem('pending_invite_token');
            if (pendingInvite && typeof this.showTeamInviteLandingCard === 'function') {
              this._hideAuthAnalysis();
              const authView = document.getElementById('authView');
              if (authView) authView.style.display = 'none';
              await this.showAppShell('agent', false);
              setTimeout(() => {
                this.showTeamInviteLandingCard(pendingInvite);
              }, 150);
              return;
            }

            this.showToast(`Kaydınız tamamlandı! Hoş geldiniz, ${data.user.display_name}!`, 'success');
            if (typeof this.loadUserWorkspaces === 'function') {
              await this.loadUserWorkspaces().catch(() => {});
            }
            await this.showAppShell('agent');
            return;
          }

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

  }

  // Metotlari ve getter/setter'lari DatasetEditor.prototype'a kopyala
  const proto = _AuthUIExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }
})(window.DatasetEditor);
