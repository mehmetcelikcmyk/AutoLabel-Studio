/**
 * AutoLabel Studio - UiUtils Module
 * =============================
 * Modern dialog sistemi (confirm/alert/prompt), toast, loading overlay, model hub.
 *
 * DatasetEditor.prototype uzerine guvenli ES6 sinif genisletme kalibiyla enjekte edilir.
 */

(function installUiUtils(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    console.error('[UiUtils] DatasetEditor henuz yuklenmedi!');
    return;
  }

  class _UiUtilsExtension {

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
  const canvasSkeleton = document.getElementById('canvasAiSkeleton');
  const skeletonText = document.getElementById('canvasAiSkeletonText');
  const floatingWidget = document.getElementById('floatingUploadWidget');

  if (!this._hasBoundMinimizeListeners) {
    this._hasBoundMinimizeListeners = true;
    document.getElementById('loadingMinimizeBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.minimizeLoading();
    });
    floatingWidget?.addEventListener('click', (e) => {
      if (e.target.closest('#floatingUploadCloseBtn')) return;
      this.maximizeLoading();
    });
    document.getElementById('floatingUploadExpandBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.maximizeLoading();
    });
    document.getElementById('floatingUploadCloseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (floatingWidget) floatingWidget.style.display = 'none';
      this.isUploadMinimized = false;
    });
    document.getElementById('floatWidgetCloseBtn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const bfw = document.getElementById('batchFloatingWidget');
      if (bfw) bfw.style.display = 'none';
      if (this.batchPollTimer) {
        clearInterval(this.batchPollTimer);
        this.batchPollTimer = null;
      }
    });
  }

  if (!show) {
    if (canvasSkeleton) canvasSkeleton.classList.remove('active');
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

  if (canvasSkeleton) {
    if (skeletonText) {
      skeletonText.textContent = opts.title || opts.text || 'AI Taraması Yapılıyor...';
    }
    canvasSkeleton.classList.add('active');
  }

  // Eğer kullanıcı arka plana almışsa tam ekran overlay yerine floating widgeti guncelle
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

    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/auto-label-image', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        category: this.currentCategory,
        image_filename: this.currentImage.filename,
        conf_threshold: 0.08,
        model_key: projModelKey,
        prompts: allPrompts.length > 0 ? allPrompts : null
      })
    });

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      data = { detail: `Sunucu yanıtı okunamadı (HTTP ${res.status})` };
    }
    this.showLoading(false);
    this.isAiProcessing = false;

    if (res.ok && data.status === 'ok' && Array.isArray(data.boxes)) {
      this.saveHistory();
      this.boxes = data.boxes;
      this.selectedBoxIndices.clear();
      this.setDirty(true);
      this.render();
      this.updateBoxesList();
      if (data.boxes.length > 0) {
        this.showToast(`AI ${data.boxes.length} nesne tespit etti.`, 'success');
      } else {
        this.showToast('Görselde seçili sınıfa uygun nesne bulunamadı.', 'info');
      }
    } else {
      this.showToast(data.detail || 'Yapay zeka nesne tespit edemedi.', 'warning');
    }
  } catch (e) {
    this.showLoading(false);
    this.isAiProcessing = false;
    console.error('Auto label error:', e);
    this.showToast(e.message || 'Yapay zeka işlemi sırasında bir hata oluştu.', 'error');
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
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/projects/delete', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ category: category, delete_files: true })
    });
    const data = await res.json();
    this.showLoading(false);
    if (data.status === 'ok') {
      this.showToast(`"${category}" projesi başarıyla silindi.`, 'success');
      const settingsModal = document.getElementById('projectSettingsModal');
      if (settingsModal) settingsModal.style.display = 'none';

      // 1. Önbellekten silinen projeyi anında düşür ve proje listelerini yenile
      if (Array.isArray(this.projects)) {
        this.projects = this.projects.filter(p => p.id !== category);
      }
      if (typeof this.renderProjectsGrid === 'function') this.renderProjectsGrid();

      // 2. Eğer silinen proje şu anda açıksa, projeyi hemen kapat ve Projeler sekmesine dön
      if (this.isProjectContext || this.activeHubProjectId === category || this.currentCategory === category) {
        if (typeof this.closeProjectToWorkspace === 'function') {
          this.closeProjectToWorkspace(false);
        }
        if (typeof this.switchWorkspaceTab === 'function') {
          await this.switchWorkspaceTab('projects');
        }
      }

      try {
        if (typeof this.fetchProjects === 'function') await this.fetchProjects();
        if (typeof this.renderProjectsGrid === 'function') this.renderProjectsGrid();
        if (typeof this.loadDashboardProjects === 'function') await this.loadDashboardProjects();
        if (typeof this.loadWorkspaceStats === 'function') await this.loadWorkspaceStats();
        if (typeof this.loadCategories === 'function') await this.loadCategories();
      } catch (refreshErr) {
        console.warn('[deleteProject] Liste yenileme uyarısı:', refreshErr);
      }
    } else {
      this.showToast(data.detail || 'Proje silinemedi.', 'error');
    }
  } catch (e) {
    this.showLoading(false);
    console.error('[deleteProject error]:', e);
    this.showToast('Silme işlemi sırasında sunucu ile iletişim hatası oluştu.', 'error');
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
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch('/api/stats', { headers });
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
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/refine-bounding-box', {
      method: 'POST',
      headers: headers,
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
      if (targetIndices.length > 0 && this.boxes[targetIndices[0]]) {
        this.triggerBoxSnapAnimation(this.boxes[targetIndices[0]], '#10b981');
      } else {
        this.render();
      }
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
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
      // currentHubImages cache'inden de çıkar (Batch Review'ın eski veriyi göstermemesi için)
      if (this.currentHubImages) {
        this.currentHubImages = this.currentHubImages.filter(img => img.filename !== filename);
      }
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
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/smart-segment', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        category: cat,
        image_filename: fname,
        click_x: clickX,
        click_y: clickY,
        class_id: (this.activeClassId !== undefined && this.activeClassId !== null) ? this.activeClassId : 0
      })
    });
    const data = await res.json();
    if (res.ok && data.status === 'ok' && data.box) {
      this.saveHistory();
      const currentProj = this.projects?.find(p => p.id === cat);
      const isDetectionProject = !currentProj || currentProj.project_type === 'detection';
      const wantPolygon = (this.mode === 'polygon') || (!isDetectionProject && this.mode === 'smart-segment');
      const isPolygon = wantPolygon && data.polygon_points && Array.isArray(data.polygon_points) && data.polygon_points.length >= 3;

      const resolvedClassId = (data.box.class_id !== undefined && data.box.class_id !== null) ? data.box.class_id : (this.activeClassId || 0);
      const resolvedClassName = data.box.class_name || this.getClassName(resolvedClassId);

      const newAnnotation = {
        type: isPolygon ? 'polygon' : 'box',
        points: isPolygon ? data.polygon_points : null,
        x_center: data.box.x_center,
        y_center: data.box.y_center,
        width: data.box.width,
        height: data.box.height,
        class_id: resolvedClassId,
        class_name: resolvedClassName
      };

      if (this.activeClassSelect && resolvedClassId !== undefined && resolvedClassId !== null) {
        this.activeClassId = resolvedClassId;
        this.activeClassSelect.value = resolvedClassId;
      }

      this.boxes.push(newAnnotation);
      const newBox = this.boxes[this.boxes.length - 1];
      this.selectedBoxIndices.clear();
      this.selectedBoxIndices.add(this.boxes.length - 1);
      this.setDirty(true);
      this.triggerBoxSnapAnimation(newBox, this.getClassColor(newBox.class_id));
      this.updateBoxesList();
      this.playFeedbackTone('snap');
      this.showToast(`AI nesneyi algıladı: ${resolvedClassName}`, 'success');
    } else {
      this.showToast(data.detail || 'Nesne algılanamadı, lütfen nesnenin merkezine tıklayınız.', 'warning');
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
  const loadingDesc = document.getElementById('healthLoadingDesc');
  const curCount = this.currentHubImages ? this.currentHubImages.length : 0;
  if (loadingDesc) {
    loadingDesc.textContent = curCount > 0 ? `${curCount.toLocaleString()} görsel ve etiket dosyaları inceleniyor...` : 'Görsel ve etiket dosyaları inceleniyor...';
  }

  // Minimize / Arka Planda Devam Et butonu dinleyicileri
  const minimizeModal = () => {
    modal.style.display = 'none';
    this._showHealthFloatingIndicator(projectId);
    this.showToast('Veri Seti Sağlık Taraması arka planda devam ediyor...', 'info');
  };

  const minBtn = document.getElementById('healthMinimizeBtn');
  if (minBtn) minBtn.onclick = minimizeModal;
  const bgLoadingBtn = document.getElementById('healthLoadingBgBtn');
  if (bgLoadingBtn) bgLoadingBtn.onclick = minimizeModal;

  // Eğer zaten tamamlanmış bir sonuç varsa ve henüz açıkken tekrar tıklandıysa göster
  if (this._cachedHealthData && this._cachedHealthData[projectId]) {
    if (loadingBox) loadingBox.style.display = 'none';
    if (contentBox) contentBox.style.display = 'flex';
    this._renderHealthData(projectId, this._cachedHealthData[projectId]);
    return;
  }

  if (loadingBox) loadingBox.style.display = 'block';
  if (contentBox) contentBox.style.display = 'none';

  // Eğer arka planda zaten bu proje için tarama çalışıyorsa mükerrer istek atma
  if (this._healthCheckRunning && this._healthCheckRunning[projectId]) {
    return;
  }

  if (!this._healthCheckRunning) this._healthCheckRunning = {};
  this._healthCheckRunning[projectId] = true;

  try {
    const res = await fetch(`/api/projects/health-check?category=${encodeURIComponent(projectId)}`);
    const data = await res.json();
    this._healthCheckRunning[projectId] = false;

    if (res.ok && data.status === 'ok') {
      if (!this._cachedHealthData) this._cachedHealthData = {};
      this._cachedHealthData[projectId] = data;

      // Arka plan göstergesini kaldır
      this._removeHealthFloatingIndicator();

      // Eğer modal o an ekranda açıksa anında veriyi doldur
      if (modal.style.display === 'flex') {
        if (loadingBox) loadingBox.style.display = 'none';
        if (contentBox) contentBox.style.display = 'flex';
        this._renderHealthData(projectId, data);
      } else {
        // Kullanıcı modalı kapatmış / arka plana atmışsa bildirim göster
        this.showToast(`✅ Veri Seti Sağlık Taraması tamamlandı! (Skor: %${data.health_score})`, 'success');
      }
    } else {
      this._removeHealthFloatingIndicator();
      this.showToast(data.detail || 'Sağlık kontrolü başarısız oldu.', 'error');
    }
  } catch (err) {
    if (this._healthCheckRunning) this._healthCheckRunning[projectId] = false;
    this._removeHealthFloatingIndicator();
    console.error(err);
    this.showToast('Sağlık kontrolü sırasında hata oluştu.', 'error');
  }
}

_showHealthFloatingIndicator(projectId) {
  let indicator = document.getElementById('healthFloatingIndicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'healthFloatingIndicator';
    indicator.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: rgba(15, 23, 42, 0.95);
      border: 1px solid rgba(56, 189, 248, 0.4);
      box-shadow: 0 10px 30px rgba(0,0,0,0.6), 0 0 20px rgba(56, 189, 248, 0.2);
      border-radius: 12px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 10px;
      z-index: 99998;
      cursor: pointer;
      backdrop-filter: blur(12px);
      transition: all 0.2s ease;
    `;
    indicator.innerHTML = `
      <div style="width:18px; height:18px; border:2px solid rgba(56,189,248,0.3); border-top-color:#38bdf8; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
      <div style="font-size:0.82rem; font-weight:700; color:#f8fafc;">
        Sağlık Taraması Çalışıyor...
        <div style="font-size:0.72rem; color:#94a3b8; font-weight:500;">Sonuçları görmek için tıklayın</div>
      </div>
    `;
    indicator.onclick = () => {
      this.openHealthModal(projectId);
    };
    document.body.appendChild(indicator);
  }
}

_removeHealthFloatingIndicator() {
  const indicator = document.getElementById('healthFloatingIndicator');
  if (indicator) indicator.remove();
}

_renderHealthData(projectId, data) {
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

    const userRole = (this.currentUser?.role || 'admin').toLowerCase();
    const canFixHealth = userRole === 'admin' || userRole === 'reviewer';

    const fixMicroBtn = document.getElementById('healthFixMicroBtn');
    if (fixMicroBtn) {
      fixMicroBtn.style.display = canFixHealth ? 'inline-block' : 'none';
      fixMicroBtn.onclick = async () => {
        if (!canFixHealth) return;
        fixMicroBtn.disabled = true;
        fixMicroBtn.textContent = 'Temizleniyor...';
        await fetch('/api/projects/health-fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: projectId, fix_micro_boxes: true, fix_duplicates: false })
        });
        this.showToast('🧹 Mikro kutular temizlendi!', 'success');
        if (this._cachedHealthData) delete this._cachedHealthData[projectId];
        this.openHealthModal(projectId);
      };
    }

    const fixDupBtn = document.getElementById('healthFixDupBtn');
    if (fixDupBtn) {
      fixDupBtn.style.display = canFixHealth ? 'inline-block' : 'none';
      fixDupBtn.onclick = async () => {
        if (!canFixHealth) return;
        fixDupBtn.disabled = true;
        fixDupBtn.textContent = 'Ayıklanıyor...';
        await fetch('/api/projects/health-fix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: projectId, fix_micro_boxes: false, fix_duplicates: true })
        });
        this.showToast('✂️ Çakışan kutular başarıyla ayıklandı!', 'success');
        if (this._cachedHealthData) delete this._cachedHealthData[projectId];
        this.openHealthModal(projectId);
      };
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
    const res = await fetch('/api/models/list', {
      headers: this.getAuthHeaders()
    });
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
          const delRes = await fetch(`/api/models/${encodeURIComponent(m.key)}`, {
            method: 'DELETE',
            headers: this.getAuthHeaders()
          });
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
  } catch (e) { }
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
        headers: this.getAuthHeaders(),
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
        headers: this.getAuthHeaders(),
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

// Dinamik modül yükleyici: Ağır modülleri ihtiyaç anında DOM'a enjekte eder ve önbelleğe alır
_lazyLoadModule(src) {
  if (!window._loadedDynamicModules) window._loadedDynamicModules = new Set();
  if (window._loadedDynamicModules.has(src)) return Promise.resolve();
  const existing = document.querySelector(`script[src^="${src}"]`);
  if (existing) {
    window._loadedDynamicModules.add(src);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      window._loadedDynamicModules.add(src);
      resolve();
    };
    s.onerror = (err) => reject(new Error('Modül yüklenemedi: ' + src));
    document.head.appendChild(s);
  });
}


  }

  // Metotlari ve getter/setter'lari DatasetEditor.prototype'a kopyala
  const proto = _UiUtilsExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }
})(window.DatasetEditor);
