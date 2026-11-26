/**
 * AutoLabel Studio - CanvasEngine Module
 * ==================================
 * Canvas render, bounding box cizimi, polygon, loupe, zoom/pan, smart segment reticle.
 *
 * DatasetEditor.prototype uzerine guvenli ES6 sinif genisletme kalibiyla enjekte edilir.
 */

(function installCanvasEngine(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    console.error('[CanvasEngine] DatasetEditor henuz yuklenmedi!');
    return;
  }

  class _CanvasEngineExtension {
  async loadCategories(preferredCategory = null) {
  try {
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch('/api/categories', { headers });
    const data = await res.json();
    this.categories = data.categories || [];
    this.classes = data.classes || {};

    const pCountEl = document.getElementById('wsNavProjectsCount');
    if (pCountEl) pCountEl.textContent = this.categories.length;

    if (this.categorySelect) {
      this.categorySelect.innerHTML = '';
      this.categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = `${cat.name} (${cat.image_count} resim)`;
        this.categorySelect.appendChild(opt);
      });
    }

    if (preferredCategory && !this.categories.some(c => c.id === preferredCategory)) {
      this.categories.unshift({ id: preferredCategory, name: preferredCategory.replace(/_/g, ' '), image_count: 0 });
    }

    if (this.categories.length > 0 || preferredCategory) {
      let initialCat = preferredCategory || this.categories[0]?.id;
      if (preferredCategory && this.categories.some(c => c.id === preferredCategory)) {
        initialCat = preferredCategory;
      } else if (!preferredCategory) {
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
  if (!this.imageCache) this.imageCache = typeof LruImageCache !== 'undefined' ? new LruImageCache(160) : new Map();
  if (!this.labelCache) this.labelCache = new Map();
  if (!this._preloadQueue) this._preloadQueue = new Set();
  this.showLoading(true, 'Proje ve Görseller Yükleniyor...', 'Lütfen bekleyiniz, çalışma alanı hazırlanıyor...');

  // Kategori değiştiğinde eski projenin RAM önbelleğini temizle
  if (this.imageCache) this.imageCache.clear();
  if (this.labelCache) this.labelCache.clear();
  if (this._preloadQueue) this._preloadQueue.clear();

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
    if (this.imageListContainer) {
      this.imageListContainer.innerHTML = `
        <div style="padding:28px 16px; text-align:center; color:#f87171; font-size:0.82rem;">
          <div style="width:36px; height:36px; margin:0 auto 10px; border-radius:50%; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); display:flex; align-items:center; justify-content:center;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
          </div>
          <strong style="display:block; margin-bottom:4px;">Görseller Yüklenemedi</strong>
          <span style="color:#94a3b8; display:block; margin-bottom:12px;">Sunucuya bağlanırken bir sorun oluştu.</span>
          <button class="btn-secondary btn-sm" id="retryLoadImagesBtn" style="margin:0 auto;">Yeniden Dene</button>
        </div>
      `;
      document.getElementById('retryLoadImagesBtn')?.addEventListener('click', () => this.loadCategoryImages());
    }
    this.showLoading(false);
  }
}

applyFilter() {
  const filterType = this.filterSelect?.value || this.currentFilter || 'all';
  const query = this.imageSearchInput.value.trim().toLowerCase();

  let baseImages = this.images;
  if (this.currentBatchFilenamesFilter && Array.isArray(this.currentBatchFilenamesFilter) && this.currentBatchFilenamesFilter.length > 0) {
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
    if (total === 0) {
      container.innerHTML = `
        <div style="padding:28px 16px; text-align:center; color:#64748b; font-size:0.8rem; line-height:1.5;">
          <div style="width:36px; height:36px; margin:0 auto 10px; border-radius:50%; background:rgba(56,189,248,0.1); border:1px solid rgba(56,189,248,0.25); display:flex; align-items:center; justify-content:center; color:#38bdf8;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          </div>
          <strong style="color:#cbd5e1; display:block; margin-bottom:4px; font-size:0.84rem;">Atanmış Görev Bekleniyor</strong>
          <span>Takım Kaptanınız size henüz bu projeden görsel atamadı. Görev atandığında görselleriniz burada listelenecektir.</span>
        </div>
      `;
      return;
    }

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

async navigatePrev() {
  if (this.isAiProcessing) return;
  const baseIdx = (this._pendingNavIndex !== null && this._pendingNavIndex !== undefined) ? this._pendingNavIndex : this.currentIndex;
  if (baseIdx > 0) {
    await this.goToIndex(baseIdx - 1);
  }
}

async navigateNext() {
  if (this.isAiProcessing) return;
  const baseIdx = (this._pendingNavIndex !== null && this._pendingNavIndex !== undefined) ? this._pendingNavIndex : this.currentIndex;
  if (baseIdx < this.filteredImages.length - 1) {
    await this.goToIndex(baseIdx + 1);
  }
}

async goToIndex(idx) {
  if (this.isAiProcessing || this.isMouseDown || this.dragAction !== null) return;
  if (idx < 0 || idx >= this.filteredImages.length) return;

  if (this._isNavigating) {
    this._pendingNavIndex = idx;
    return;
  }

  // Bekleyen autoSave timer'ını iptal et ki yarış durumu oluşmasın
  if (this._autoSaveTimer) {
    clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = null;
  }

  this._isNavigating = true;
  try {
    if (this.skipEmpty) {
      const target = this.filteredImages[idx];
      if (target && target.box_count === 0) {
        const direction = idx > this.currentIndex ? 1 : -1;
        const nextIdx = idx + direction;
        if (nextIdx >= 0 && nextIdx < this.filteredImages.length) {
          this._isNavigating = false;
          return await this.goToIndex(nextIdx);
        }
        this._isNavigating = false;
        return;
      }
    }

    // Eğer mevcut resimde etiketler gerçekten DEĞİŞTİRİLDİYSE (isDirty), arka planda sessizce kaydet
    if (!this.currentImage?.is_approved && this.isDirty) {
      this.saveCurrentLabel(false, false).catch(e => console.warn('Background auto-save on nav error:', e));
    }

    this.prevImageBoxes = JSON.parse(JSON.stringify(this.boxes || []));
    this.currentIndex = idx;
    this.currentImage = this.filteredImages[idx];
    if (this.imageIndexInput) this.imageIndexInput.value = idx + 1;

    if (this.currentCategory && this.currentImage) {
      localStorage.setItem('yolo_last_category', this.currentCategory);
      localStorage.setItem(`yolo_last_index_${this.currentCategory}`, idx);
      localStorage.setItem(`yolo_last_file_${this.currentCategory}`, this.currentImage.filename);
    }

    this._scrollListToActive();

    await this.loadImageAndLabels();
    try {
      this.preloadAdjacentImages(idx);
    } catch (e) {
      console.warn('Preload warning:', e);
    }
  } finally {
    this._isNavigating = false;
    if (this._pendingNavIndex !== null && this._pendingNavIndex !== undefined && this._pendingNavIndex !== this.currentIndex) {
      const nextTarget = this._pendingNavIndex;
      this._pendingNavIndex = null;
      this.goToIndex(nextTarget);
    } else {
      this._pendingNavIndex = null;
    }
  }
}

// Önbellek anahtarı kategori ve dosya adından oluşur, böylece farklı kategorilerdeki aynı isimli dosyalar karışmaz
_cacheKey(category, filename) {
  return `${category}::${filename}`;
}

preloadAdjacentImages(currentIdx) {
  if (!this.imageCache) this.imageCache = typeof LruImageCache !== 'undefined' ? new LruImageCache(60) : new Map();
  if (!this.labelCache) this.labelCache = new Map();
  if (!this.filteredImages || this.filteredImages.length === 0 || !this.currentCategory) return;

  try {
    // 8 görsel penceresi: ileriye 6, geriye 2 görsel. Daha geniş pencere yavaş bağlantıda
    // açılmak istenen görselle aynı bant genişliği için yarışıp geçişleri yavaşlatıyordu.
    // Yakınlık önceliği: +1, +2, -1, +3, +4, -2, +5, +6
    const targetIndices = [];
    const maxFwd = 6;
    const maxBack = 2;
    let fwd = 1;
    let back = 1;

    while (fwd <= maxFwd || back <= maxBack) {
      if (fwd <= maxFwd) {
        const next = currentIdx + fwd;
        if (next < this.filteredImages.length) targetIndices.push(next);
        fwd++;
      }
      if (fwd <= maxFwd) {
        const next = currentIdx + fwd;
        if (next < this.filteredImages.length) targetIndices.push(next);
        fwd++;
      }
      if (back <= maxBack) {
        const prev = currentIdx - back;
        if (prev >= 0) targetIndices.push(prev);
        back++;
      }
    }

    // Önbellekte olmayan görselleri sıraya al
    const neededFilenames = targetIndices
      .map(i => this.filteredImages[i]?.filename)
      .filter(fn => {
        if (!fn) return false;
        const key = this._cacheKey(this.currentCategory, fn);
        return !this.imageCache.has(key) || !this.labelCache.has(key);
      });

    this._preloadPendingList = neededFilenames;
    this._triggerPreloadWorker();
  } catch (err) {
    console.warn('preloadAdjacentImages error:', err);
  }
}

async _triggerPreloadWorker() {
  if (this._preloadWorkerRunning) return;
  this._preloadWorkerRunning = true;

  const category = this.currentCategory;
  const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
  const tokenQ = token ? `&token=${encodeURIComponent(token)}` : '';

  try {
    while (this._preloadPendingList && this._preloadPendingList.length > 0) {
      if (this.currentCategory !== category) break;

      // Ağ havuzunu kilitlememek için aynı anda en fazla 2 görseli sırayla yükle
      const batch = this._preloadPendingList.splice(0, 2);
      await Promise.all(batch.map(fn => this.preloadImageAndLabel(fn, category, tokenQ)));
    }
  } catch (_) {
  } finally {
    this._preloadWorkerRunning = false;
  }
}

async preloadImageAndLabel(filename, category = this.currentCategory, tokenQ = '') {
  if (!this.imageCache) this.imageCache = typeof LruImageCache !== 'undefined' ? new LruImageCache(60) : new Map();
  if (!this.labelCache) this.labelCache = new Map();
  if (!this._preloadInFlight) this._preloadInFlight = new Set();
  if (!filename || !category) return;
  const key = this._cacheKey(category, filename);
  if (this._preloadInFlight.has(key)) return;

  const hasImg = this.imageCache.has(key);
  const hasLabel = this.labelCache.has(key);
  if (hasImg && hasLabel) return;

  this._preloadInFlight.add(key);

  try {
    const promises = [];

    // Görsel Önbelleği (GPU decode destekli)
    if (!hasImg) {
      const imgSrc = `/api/image-file?category=${encodeURIComponent(category)}&filename=${encodeURIComponent(filename)}${tokenQ}`;
      promises.push(new Promise((resolve) => {
        const img = new Image();
        const pTimer = setTimeout(() => resolve(null), 5000);
        img.onload = () => {
          clearTimeout(pTimer);
          if (img.decode) {
            img.decode().catch(() => {}).then(() => {
              if (img.naturalWidth) this.imageCache.set(key, img);
              resolve(img);
            });
          } else {
            if (img.naturalWidth) this.imageCache.set(key, img);
            resolve(img);
          }
        };
        img.onerror = () => {
          clearTimeout(pTimer);
          resolve(null);
        };
        img.src = imgSrc;
      }));
    }

    // Etiket Önbelleği
    if (!hasLabel) {
      promises.push(
        fetch(`/api/label-data?category=${encodeURIComponent(category)}&filename=${encodeURIComponent(filename)}`, {
          headers: (typeof this.getAuthHeaders === 'function') ? this.getAuthHeaders() : {}
        })
        .then(res => res.ok ? res.json() : {})
        .then(data => {
          // Kayıt sırasında daha güncel veri yazılmışsa onu ezme
          if (!this.labelCache.has(key)) this.labelCache.set(key, data);
          return data;
        })
        .catch(() => {
          // Ağ hatasında boş etiketi önbelleğe yazmıyoruz, yoksa görsel sonradan etiketsiz görünür
          return { boxes: [] };
        })
      );
    }

    await Promise.all(promises);
  } catch (_) {
  } finally {
    this._preloadInFlight.delete(key);
  }
}

async loadImageAndLabels() {
  if (!this.imageCache) this.imageCache = typeof LruImageCache !== 'undefined' ? new LruImageCache(60) : new Map();
  if (!this.labelCache) this.labelCache = new Map();
  if (!this._preloadQueue) this._preloadQueue = new Set();

  if (!this.currentImage) {
    this.showLoading(false);
    return;
  }
  const filename = this.currentImage.filename;
  const category = this.currentCategory;
  const key = this._cacheKey(category, filename);
  let loadingTimer = null;

  try {
    let loadedImg = this.imageCache ? this.imageCache.get(key) : null;
    let labelData = this.labelCache ? this.labelCache.get(key) : null;

    if (!loadedImg || !labelData) {
      loadingTimer = setTimeout(() => {
        this.showLoading(true, 'Görsel Yükleniyor...', 'Lütfen bekleyiniz, görsel ve etiketler hazırlanıyor...');
      }, 200);
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const tokenQ = token ? `&token=${encodeURIComponent(token)}` : '';
      const imgSrc = `/api/image-file?category=${encodeURIComponent(category)}&filename=${encodeURIComponent(filename)}${tokenQ}`;

      const fetchPromises = [];

      if (!labelData) {
        fetchPromises.push(
          fetch(`/api/label-data?category=${encodeURIComponent(category)}&filename=${encodeURIComponent(filename)}`, {
            headers: (typeof this.getAuthHeaders === 'function') ? this.getAuthHeaders() : {}
          })
          .then(res => res.ok ? res.json() : {})
          .then(data => {
            labelData = data;
            if (this.labelCache) this.labelCache.set(key, data);
            return data;
          })
          .catch(() => {
            // Hata durumunda boş veriyi önbelleğe yazmıyoruz, bir sonraki ziyarette tekrar denenir
            labelData = { boxes: [] };
            return labelData;
          })
        );
      } else {
        fetchPromises.push(Promise.resolve(labelData));
      }

      if (!loadedImg) {
        fetchPromises.push(new Promise((resolve) => {
          const img = new Image();
          const timer = setTimeout(() => {
            resolve(null);
          }, 4500);

          img.onload = () => {
            clearTimeout(timer);
            if (img.naturalWidth && img.naturalHeight) {
              loadedImg = img;
              if (this.imageCache) this.imageCache.set(key, img);
              resolve(img);
            } else {
              resolve(null);
            }
          };
          img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
          };
          img.src = imgSrc;
        }));
      } else {
        fetchPromises.push(Promise.resolve(loadedImg));
      }

      await Promise.all(fetchPromises);
    }

    // Race condition koruması: Kullanıcı beklerken başka görsele geçtiyse bu çizimi iptal et
    if (this.currentImage?.filename !== filename || this.currentCategory !== category) return;

    const rawBoxes = labelData?.boxes || labelData?.annotations || [];
    this.boxes = rawBoxes.map(b => ({
      ...b,
      class_name: (typeof this.getClassName === 'function') ? this.getClassName(b.class_id) : `Class ${b.class_id}`
    }));
    this.savedBoxesSnapshot = JSON.parse(JSON.stringify(this.boxes));
    this.undoStack = [];
    this.redoStack = [];
    if (typeof this.updateHistoryButtons === 'function') this.updateHistoryButtons();
    if (this.selectedBoxIndices) this.selectedBoxIndices.clear();
    if (typeof this.setDirty === 'function') this.setDirty(false);

    if (this.flagBtn) {
      this.flagBtn.classList.toggle('active', this.flaggedImages ? this.flaggedImages.has(this.currentImage.filename) : false);
    }

    this.imageObj = loadedImg;
    if (typeof this.updateMetaDisplay === 'function') this.updateMetaDisplay();
    if (typeof this.fitToViewport === 'function') this.fitToViewport();
    if (typeof this.render === 'function') this.render();
    if (typeof this.updateBoxesList === 'function') this.updateBoxesList();
    if (typeof this.updateProgressBar === 'function') this.updateProgressBar();
  } catch (err) {
    console.error('[loadImageAndLabels Error]:', err);
    this.showToast('Görsel veya etiket hazırlanırken bir sorun oluştu', 'error');
  } finally {
    if (loadingTimer) {
      clearTimeout(loadingTimer);
      loadingTimer = null;
    }
    this.showLoading(false);
  }
}

  async saveCurrentLabel(showFeedback = true, isApproval = false) {
  if (!this.currentCategory || !this.currentImage) return false;

  // Bekleyen autoSave timer'ını sıfırla
  if (this._autoSaveTimer) {
    clearTimeout(this._autoSaveTimer);
    this._autoSaveTimer = null;
  }

  // Kayıt başladığı andaki durumu sabitliyoruz. Cevap gelene kadar kullanıcı başka görsele
  // geçmiş olabilir, bu yüzden sonrasında this.currentImage ya da this.boxes okunmamalı.
  const savedCategory = this.currentCategory;
  const savedImage = this.currentImage;
  const savedIndex = this.currentIndex;
  const savedBoxes = JSON.parse(JSON.stringify(this.boxes || []));
  const key = this._cacheKey(savedCategory, savedImage.filename);

  try {
    const res = await fetch('/api/save-label', {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        category: savedCategory,
        image_filename: savedImage.filename,
        boxes: savedBoxes,
        annotations: savedBoxes,
        update_preview: true,
        is_approved: isApproval
      })
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.error('Kayıt API hatası:', res.status, errData);
      this.showToast(`Kayıt başarısız (${res.status}): ${errData.detail || 'Yetki veya bağlantı hatası'}`, 'error');
      return false;
    }

    const data = await res.json();
    if (data.status === 'ok') {
      const boxCount = savedBoxes.length;
      this.labelCache.set(key, { boxes: savedBoxes });

      // Ekrandaki durumu sadece kullanıcı hâlâ aynı görseldeyse güncelle
      const stillOnSameImage = this.currentImage === savedImage && this.currentCategory === savedCategory;
      if (stillOnSameImage) {
        this.savedBoxesSnapshot = JSON.parse(JSON.stringify(savedBoxes));
        this.setDirty(false);
      }

      savedImage.box_count = boxCount;
      savedImage.has_label_file = (boxCount > 0);
      if (isApproval) {
        savedImage.is_approved = true;
      } else if (boxCount === 0) {
        savedImage.is_approved = false;
      }

      const activeEl = this.currentCategory === savedCategory ? document.getElementById(`img-item-${savedIndex}`) : null;
      if (activeEl) {
        const countEl = activeEl.querySelector('.item-box-count');
        const dotEl = activeEl.querySelector('.item-status-dot');
        if (countEl) countEl.textContent = boxCount;
        if (dotEl) {
          dotEl.className = `item-status-dot ${boxCount > 0 ? 'has-box' : 'no-box'}`;
        }
      }

      this.updateProgressBar();

      if (showFeedback) {
        this.showToast(isApproval ? 'Görsel Onaylandı ve Veri Setine Eklendi! ✓' : `Kaydedildi (${this.boxes.length} kutu)`, 'success');
      }

      if (isApproval) {
        this.handleApprovedImageAdvance();
      }
      return true;
    }
    return false;
  } catch (err) {
    this.showToast('Kayıt sırasında bağlantı hatası oluştu', 'error');
    console.error(err);
    return false;
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
      // Proje ana listesindeki görsel nesnesini de güncelle
      const globalImg = this.images.find(i => i.filename === removedFilename);
      if (globalImg) {
        globalImg.is_approved = true;
        globalImg.box_count = this.boxes ? this.boxes.length : 0;
        globalImg.has_label_file = (globalImg.box_count > 0);
      }
      // currentHubImages cache'ini de güncelle (Batch Review approved sekmesinde doğru görünsün)
      if (this.currentHubImages) {
        const hubImg = this.currentHubImages.find(i => i.filename === removedFilename);
        if (hubImg) {
          hubImg.is_approved = true;
          hubImg.box_count = this.boxes ? this.boxes.length : 0;
          hubImg.has_label_file = (hubImg.box_count > 0);
        }
      }
    }

    // Sayaç ve sol listeyi anında güncelle
    if (this.totalImagesCount) {
      this.totalImagesCount.textContent = this.filteredImages.length;
    }
    const jobCountEl = document.getElementById('editorJobCountBadge');
    if (jobCountEl) {
      jobCountEl.textContent = `${this.filteredImages.length.toLocaleString()} Resim`;
    }

    this.renderImageList();

    if (this.filteredImages.length > 0) {
      const nextIdx = Math.min(this.currentIndex, this.filteredImages.length - 1);
      this.goToIndex(nextIdx);
      // Arka planda kanban/annotate sayaçlarını güncelle (editörde kalınsın ama proje ekranı güncel kalsın)
      this.loadHubProjectData().catch(() => {});
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

  async resetCurrentImageToUnlabeled() {
    if (!this.currentCategory || !this.currentImage) return;

    // splice'dan önce filename'i kopyala — splice sonrası this.currentImage null olabiliyor
    const targetFilename = this.currentImage.filename;

    const confirmed = await this.showConfirm({
      title: 'Havuza İade Et (Sıfırla)',
      subtitle: 'Etiketlenmemiş Durumuna Döndür',
      message: `"${targetFilename}" görselinin tüm etiketleri ve onay durumu tamamen silinip, yeni yüklenmiş / etiketlenmemişler havuzuna iade edilsin mi?`,
      confirmText: 'Evet, Sıfırla ve Havuza Gönder',
      cancelText: 'Vazgeç',
      type: 'warning'
    });
    if (!confirmed) return;

    try {
      this.boxes = [];
      this.selectedBoxIndices.clear();
      this.currentImage.box_count = 0;
      this.currentImage.has_label_file = false;
      this.currentImage.is_approved = false;

      // Backend'e boş etiket gönderildiğinde txt dosyasını diskten siler ve batches.json'dan onayını kaldırır
      await this.saveCurrentLabel(false, false);

      const activeEl = document.getElementById(`img-item-${this.currentIndex}`);
      if (activeEl) {
        const countEl = activeEl.querySelector('.item-box-count');
        const dotEl = activeEl.querySelector('.item-status-dot');
        if (countEl) countEl.textContent = '0';
        if (dotEl) dotEl.className = 'item-status-dot no-box';
      }

      this.render();
      this.updateBoxesList();
      this.updateProgressBar();

      // Proje ana listesindeki görsel durumunu güncelle
      const globalImg = this.images.find(i => i.filename === targetFilename);
      if (globalImg) {
        globalImg.box_count = 0;
        globalImg.has_label_file = false;
        globalImg.is_approved = false;
      }

      // currentHubImages cache'inden de güncelle (Batch Review'ın eski veri göstermemesi için)
      if (this.currentHubImages) {
        const hubImg = this.currentHubImages.find(i => i.filename === targetFilename);
        if (hubImg) {
          hubImg.box_count = 0;
          hubImg.has_label_file = false;
          hubImg.is_approved = false;
        }
      }

      // Sıfırlanan görseli mevcut aktif işleme kuyruğundan çıkar
      const idx = this.filteredImages.findIndex(i => i.filename === targetFilename);
      if (idx !== -1) {
        this.filteredImages.splice(idx, 1);
      }
      if (this.currentBatchFilenamesFilter && Array.isArray(this.currentBatchFilenamesFilter)) {
        const bIdx = this.currentBatchFilenamesFilter.indexOf(targetFilename);
        if (bIdx !== -1) {
          this.currentBatchFilenamesFilter.splice(bIdx, 1);
        }
      }
      if (this.totalImagesCount) this.totalImagesCount.textContent = this.filteredImages.length;
      const jobCountEl = document.getElementById('editorJobCountBadge');
      if (jobCountEl) jobCountEl.textContent = `${this.filteredImages.length.toLocaleString()} Resim`;
      this.renderImageList();

      if (this.filteredImages.length > 0) {
        const nextIdx = Math.min(this.currentIndex, this.filteredImages.length - 1);
        await this.goToIndex(nextIdx);
        // Arka planda kanban sayaçlarını güncelle
        this.loadHubProjectData().catch(() => {});
      } else {
        this.currentImage = null;
        this.boxes = [];
        this.clearCanvas();
        this.showToast('Kuyruktaki tüm görseller işlendi.', 'info');
        // Annotate sekmesine geçmeden veriyi tazele
        this.loadHubProjectData().catch(() => {}).finally(() => {
          this.switchProjectTab('annotate');
        });
      }

      // filename referansını splice öncesi kopyaladığımız değişkenden kullan
      this.showToast(`↺ "${targetFilename}" etiketleri silindi ve işlenmemişler havuzuna iade edildi`, 'info');
    } catch (err) {
      console.error(err);
      this.showToast('Görsel sıfırlanırken hata oluştu', 'error');
    }
  }

// --- Rendering ---

render() {
  this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  if (!this.imageObj) {
    this.ctx.fillStyle = '#0f172a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = '#64748b';
    this.ctx.font = '14px Plus Jakarta Sans, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.fillText('Görsel Yüklenemedi veya Dosya Bulunamadı', this.canvas.width / 2, this.canvas.height / 2);
    return;
  }

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

    // AI Algılama ve Sıkılaştırma Animasyon Halkası
    if (this.recentSnapBox) {
      this.drawSnapBoxAnimation(this.recentSnapBox);
    }
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

  // Akıllı Tıkla (SAM/Smart Segment) hedefleme reticle animasyonu
  if (this.mode === 'smart-segment' && this.cursorPos.x >= 0 && this.cursorPos.y >= 0) {
    this.drawSmartSegmentReticle(this.cursorPos);
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
  const isHovered = (this.hoveredBoxIndex === index);

  // Dynamic stroke width adapted to screen pixels
  const strokeW = Math.max(1.5, ((isSelected || isHovered) ? 3 : 2) / effectiveZoom);

  // Hover and select fill transparency
  const fillAlpha = isSelected ? 0.38 : (isHovered ? 0.28 : 0.15);
  this.ctx.fillStyle = this.hexToRgba(color, fillAlpha);
  this.ctx.fillRect(boxX, boxY, boxW, boxH);

  // Glowing stroke when hovered or selected
  if (isHovered && !isSelected) {
    this.ctx.save();
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = Math.round(12 / effectiveZoom);
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = strokeW + 0.5;
    this.ctx.strokeRect(boxX, boxY, boxW, boxH);
    this.ctx.restore();
  } else {
    this.ctx.strokeStyle = isSelected ? '#ffffff' : color;
    this.ctx.lineWidth = strokeW;
    this.ctx.strokeRect(boxX, boxY, boxW, boxH);
  }

  if (isSelected) {
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = Math.max(1, 1.2 / effectiveZoom);
    const outerOffset = Math.max(2, 3 / effectiveZoom);
    this.ctx.strokeRect(boxX - outerOffset, boxY - outerOffset, boxW + outerOffset * 2, boxH + outerOffset * 2);
  }

  // Dynamic tag size & clearly readable font scaled for screen
  const resolvedName = this.getClassName(box.class_id) || box.class_name || `Sınıf ${box.class_id}`;
  const labelText = `#${index + 1} ${resolvedName}`;
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

drawPolygon(box, isSelected, index) {
  const cW = this.canvas.width;
  const cH = this.canvas.height;
  const rScale = this.renderScale || 1.0;
  const effectiveZoom = this.zoomLevel / rScale;

  const color = this.getClassColor(box.class_id);
  const isHovered = (this.hoveredBoxIndex === index);

  const pts = box.points;
  if (!pts || !Array.isArray(pts) || pts.length < 3) return;

  const screenPts = pts.map(p => ({
    x: p.x * cW,
    y: p.y * cH
  }));

  const strokeW = Math.max(1.6, ((isSelected || isHovered) ? 3.2 : 2.2) / effectiveZoom);
  const fillAlpha = isSelected ? 0.38 : (isHovered ? 0.30 : 0.18);

  this.ctx.save();
  this.ctx.beginPath();
  this.ctx.moveTo(screenPts[0].x, screenPts[0].y);
  for (let i = 1; i < screenPts.length; i++) {
    this.ctx.lineTo(screenPts[i].x, screenPts[i].y);
  }
  this.ctx.closePath();

  // Dolgu
  this.ctx.fillStyle = this.hexToRgba(color, fillAlpha);
  this.ctx.fill();

  // Kenar çizgisi ve parlama
  if (isHovered && !isSelected) {
    this.ctx.shadowColor = color;
    this.ctx.shadowBlur = Math.round(14 / effectiveZoom);
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = strokeW + 0.8;
    this.ctx.stroke();
  } else {
    this.ctx.strokeStyle = isSelected ? '#ffffff' : color;
    this.ctx.lineWidth = strokeW;
    this.ctx.stroke();
  }

  // Seçiliyse köşelere tutamaç çiz
  if (isSelected) {
    const handleR = Math.max(3.5, Math.round(5 / effectiveZoom));
    for (const p of screenPts) {
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, handleR, 0, Math.PI * 2);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fill();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth = Math.max(1.2, 1.8 / effectiveZoom);
      this.ctx.stroke();
    }
  }

  // Etiket rozeti (Tag Badge)
  const resolvedName = this.getClassName(box.class_id) || box.class_name || `Sınıf ${box.class_id}`;
  const labelText = `#${index + 1} ⬡ ${resolvedName}`;
  const fontSize = Math.max(12, Math.round(13 / effectiveZoom));
  this.ctx.font = `bold ${fontSize}px "Plus Jakarta Sans", -apple-system, sans-serif`;
  const textWidth = this.ctx.measureText(labelText).width;
  const tagHeight = Math.round(fontSize * 1.6);
  const tagPadding = Math.round(fontSize * 0.45);
  const totalTagWidth = textWidth + tagPadding * 2;

  let minX = Infinity, minY = Infinity;
  for (const p of screenPts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  let tagY = minY - tagHeight;
  if (tagY < 0) tagY = minY;

  this.ctx.fillStyle = isSelected ? '#2563eb' : color;
  this.ctx.fillRect(minX, tagY, totalTagWidth, tagHeight);

  this.ctx.fillStyle = '#ffffff';
  this.ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  this.ctx.shadowBlur = Math.round(3 / effectiveZoom);
  this.ctx.fillText(labelText, minX + tagPadding, tagY + fontSize * 1.15);

  this.ctx.restore();
}

drawSmartSegmentReticle(pt) {
  const zoom = (this.zoomLevel / (this.renderScale || 1.0)) || 1;
  const time = performance.now() * 0.003;
  const pulse = Math.sin(time) * (4 / zoom);

  const radius = Math.max(16, 24 / zoom) + pulse;
  const outerRadius = Math.max(26, 38 / zoom) + pulse * 1.5;
  const hoverGlowRadius = Math.max(45, 65 / zoom);

  this.ctx.save();

  // 1. Canlı Nesne Vurgu Alanı (Live Object Hover Glow & Color Highlight)
  // Fare nesnenin üzerindeyken nesnenin aydınlanmasını ve renklenmesini sağlar
  const grad = this.ctx.createRadialGradient(pt.x, pt.y, 4, pt.x, pt.y, hoverGlowRadius);
  grad.addColorStop(0, 'rgba(168, 85, 247, 0.42)');
  grad.addColorStop(0.5, 'rgba(192, 132, 252, 0.22)');
  grad.addColorStop(0.85, 'rgba(168, 85, 247, 0.08)');
  grad.addColorStop(1, 'rgba(168, 85, 247, 0)');

  this.ctx.fillStyle = grad;
  this.ctx.beginPath();
  this.ctx.arc(pt.x, pt.y, hoverGlowRadius, 0, Math.PI * 2);
  this.ctx.fill();

  // 2. Glow Filter
  this.ctx.shadowColor = '#c084fc';
  this.ctx.shadowBlur = Math.round(12 / zoom);

  // 3. Dış Kesikli Radar Halkası
  this.ctx.strokeStyle = '#c084fc';
  this.ctx.lineWidth = Math.max(1.5, 2.0 / zoom);
  this.ctx.setLineDash([5 / zoom, 5 / zoom]);
  this.ctx.beginPath();
  this.ctx.arc(pt.x, pt.y, outerRadius, 0, Math.PI * 2);
  this.ctx.stroke();

  // 4. İç Parlak Halka
  this.ctx.setLineDash([]);
  this.ctx.strokeStyle = '#ffffff';
  this.ctx.lineWidth = Math.max(1.8, 2.5 / zoom);
  this.ctx.beginPath();
  this.ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
  this.ctx.stroke();

  // 5. Crosshair Kılavuz Çizgileri
  this.ctx.strokeStyle = '#c084fc';
  this.ctx.lineWidth = Math.max(1.5, 2.0 / zoom);
  this.ctx.beginPath();
  // Yatay
  this.ctx.moveTo(pt.x - outerRadius - 8 / zoom, pt.y);
  this.ctx.lineTo(pt.x - radius + 2 / zoom, pt.y);
  this.ctx.moveTo(pt.x + radius - 2 / zoom, pt.y);
  this.ctx.lineTo(pt.x + outerRadius + 8 / zoom, pt.y);
  // Dikey
  this.ctx.moveTo(pt.x, pt.y - outerRadius - 8 / zoom);
  this.ctx.lineTo(pt.x, pt.y - radius + 2 / zoom);
  this.ctx.moveTo(pt.x, pt.y + radius - 2 / zoom);
  this.ctx.lineTo(pt.x, pt.y + outerRadius + 8 / zoom);
  this.ctx.stroke();

  // 6. Merkez Hedef Noktası
  this.ctx.fillStyle = '#a855f7';
  this.ctx.beginPath();
  this.ctx.arc(pt.x, pt.y, Math.max(3, 4 / zoom), 0, Math.PI * 2);
  this.ctx.fill();

  // 7. Akıllı Yardımcı Etiket (Tıkla & Bölütle)
  const activeClsName = this.getClassName(this.activeClassId || 0) || 'Nesne';
  const hintText = `🪄 Tıkla: ${activeClsName} Bölütle`;
  const fSize = Math.max(11, Math.round(12 / zoom));
  this.ctx.font = `600 ${fSize}px "Plus Jakarta Sans", sans-serif`;
  const hintW = this.ctx.measureText(hintText).width;
  const bH = Math.round(fSize * 1.6);
  const bPad = 6;
  const bX = pt.x - (hintW + bPad * 2) / 2;
  const bY = pt.y - outerRadius - bH - (4 / zoom);

  this.ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  this.ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
  this.ctx.lineWidth = 1;
  this.ctx.beginPath();
  if (this.ctx.roundRect) {
    this.ctx.roundRect(bX, bY, hintW + bPad * 2, bH, 4);
  } else {
    this.ctx.rect(bX, bY, hintW + bPad * 2, bH);
  }
  this.ctx.fill();
  this.ctx.stroke();

  this.ctx.fillStyle = '#f3e8ff';
  this.ctx.fillText(hintText, bX + bPad, bY + fSize * 1.15);

  this.ctx.restore();
}

triggerBoxSnapAnimation(box, color = '#38bdf8') {
  this.recentSnapBox = {
    x_center: box.x_center,
    y_center: box.y_center,
    width: box.width,
    height: box.height,
    color: color,
    startTime: performance.now(),
    duration: 650
  };

  const step = () => {
    if (!this.recentSnapBox) return;
    const elapsed = performance.now() - this.recentSnapBox.startTime;
    if (elapsed > this.recentSnapBox.duration) {
      this.recentSnapBox = null;
      this.render();
      return;
    }
    this.render();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

drawSnapBoxAnimation(snap) {
  const elapsed = performance.now() - snap.startTime;
  const progress = Math.min(1, elapsed / snap.duration);
  const alpha = (1 - progress) * 0.85;

  const cW = this.canvas.width;
  const cH = this.canvas.height;
  const zoom = (this.zoomLevel / (this.renderScale || 1.0)) || 1;

  const boxW = snap.width * cW;
  const boxH = snap.height * cH;
  const boxX = (snap.x_center * cW) - (boxW / 2);
  const boxY = (snap.y_center * cH) - (boxH / 2);

  const expand = (1 - progress) * (20 / zoom);

  this.ctx.save();
  this.ctx.shadowColor = snap.color || '#38bdf8';
  this.ctx.shadowBlur = Math.round((20 * (1 - progress)) / zoom);
  this.ctx.strokeStyle = snap.color || '#38bdf8';
  this.ctx.lineWidth = Math.max(1.5, (3 * (1 - progress * 0.5)) / zoom);

  // Expanding neon bracket/rect
  this.ctx.strokeRect(
    boxX - expand,
    boxY - expand,
    boxW + expand * 2,
    boxH + expand * 2
  );

  // Corner accents
  const cornerLen = Math.min(20, Math.min(boxW, boxH) * 0.3);
  this.ctx.strokeStyle = '#ffffff';
  this.ctx.lineWidth = Math.max(2, 3.5 / zoom);
  // Sol üst
  this.ctx.beginPath();
  this.ctx.moveTo(boxX - expand, boxY - expand + cornerLen);
  this.ctx.lineTo(boxX - expand, boxY - expand);
  this.ctx.lineTo(boxX - expand + cornerLen, boxY - expand);
  // Sağ üst
  this.ctx.moveTo(boxX + boxW + expand - cornerLen, boxY - expand);
  this.ctx.lineTo(boxX + boxW + expand, boxY - expand);
  this.ctx.lineTo(boxX + boxW + expand, boxY - expand + cornerLen);
  // Sol alt
  this.ctx.moveTo(boxX - expand, boxY + boxH + expand - cornerLen);
  this.ctx.lineTo(boxX - expand, boxY + boxH + expand);
  this.ctx.lineTo(boxX - expand + cornerLen, boxY + boxH + expand);
  // Sağ alt
  this.ctx.moveTo(boxX + boxW + expand - cornerLen, boxY + boxH + expand);
  this.ctx.lineTo(boxX + boxW + expand, boxY + boxH + expand);
  this.ctx.lineTo(boxX + boxW + expand, boxY + boxH + expand - cornerLen);
  this.ctx.stroke();

  this.ctx.restore();
}

// Polygon rendering is handled by drawPolygon above


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
    const snapTolerance = Math.max(28, 28 / effectiveZoom);
    if (distToFirst <= snapTolerance) {
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

  this.saveHistory(); // Undo için kaydet

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
  const statusZoomEl = document.getElementById('statusZoomLevelText');
  if (statusZoomEl) statusZoomEl.textContent = `${pct}%`;
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
    const cW = this.canvas.width || 800;
    const cH = this.canvas.height || 600;
    const clickX = Math.max(0, Math.min(1, pt.x / cW));
    const clickY = Math.max(0, Math.min(1, pt.y / cH));
    this.executeSmartSegment(clickX, clickY);
    return;
  }

  // Poligon Çizim Modu (Tıkla köşe ekle, ilk noktaya tıklayarak veya Enter ile kapat)
  if (this.mode === 'polygon') {
    const effectiveZoom = (this.zoomLevel / (this.renderScale || 1.0)) || 1.0;
    // Kullanıcının rahatça tıklayıp kapatabilmesi için manyetik yakalama alanını genişletiyoruz (28px ekran mesafesi)
    const snapDist = Math.max(28, 28 / effectiveZoom);

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
  if (this.currentView && this.currentView !== 'editor') return;
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

  const statusCoordEl = document.getElementById('statusCursorCoords');
  if (statusCoordEl) statusCoordEl.textContent = `X: ${Math.round(pt.x)}, Y: ${Math.round(pt.y)}`;

  if (!this.isMouseDown) {
    const prevHover = this.hoveredBoxIndex;
    this.hoveredBoxIndex = this.findHitBoxIndex(pt);

    if (this.mode === 'polygon' && this.polygonDraftPoints && this.polygonDraftPoints.length > 0) {
      this.polygonHoverPoint = { ...pt };
      this.render();
      return;
    }
    this.updateCursor(pt);
    if (this.showGuideLines || this.isLoupeActive || this.isZPressed || this.mode === 'smart-segment' || prevHover !== this.hoveredBoxIndex) {
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
        const nextXc = Math.min(1.0 - b.width / 2, Math.max(b.width / 2, initial.x_center + dx));
        const nextYc = Math.min(1.0 - b.height / 2, Math.max(b.height / 2, initial.y_center + dy));
        const shiftX = nextXc - initial.x_center;
        const shiftY = nextYc - initial.y_center;
        b.x_center = nextXc;
        b.y_center = nextYc;
        if (b.type === 'polygon' && Array.isArray(initial.points)) {
          b.points = initial.points.map(p => ({
            x: Math.min(1.0, Math.max(0.0, p.x + shiftX)),
            y: Math.min(1.0, Math.max(0.0, p.y + shiftY))
          }));
        }
      }
    });
    this.setDirty(true);
    this.render();
  } else if (this.dragAction === 'resize') {
    if (moveDist > 2) this.hasActuallyDragged = true;
    const singleIdx = Array.from(this.selectedBoxIndices)[0];
    if (this.boxes[singleIdx] && this.initialBoxState) {
      this.handleResize(pt, this.boxes[singleIdx], this.initialBoxState, this.resizeHandle);
      this.setDirty(true);
      this.render();
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

  if (box.type === 'polygon' && Array.isArray(initial.points) && initial.width > 0 && initial.height > 0) {
    const oldX1 = initial.x_center - initial.width / 2;
    const oldY1 = initial.y_center - initial.height / 2;
    const newX1 = box.x_center - box.width / 2;
    const newY1 = box.y_center - box.height / 2;
    box.points = initial.points.map(p => ({
      x: Math.min(1.0, Math.max(0.0, newX1 + ((p.x - oldX1) / initial.width) * box.width)),
      y: Math.min(1.0, Math.max(0.0, newY1 + ((p.y - oldY1) / initial.height) * box.height))
    }));
  }
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
  const effectiveZoom = Math.max(0.25, (this.zoom || 1) * (this._baseScale || 1));
  const hitRadius = (this.HANDLE_SIZE + 6) / effectiveZoom;

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

  }

  // Metotlari ve getter/setter'lari DatasetEditor.prototype'a kopyala
  const proto = _CanvasEngineExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }
})(window.DatasetEditor);
