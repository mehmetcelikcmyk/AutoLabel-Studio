/**
 * AutoLabel Studio - InputHandler Module
 * ==================================
 * Klavye kisayollari, undo/redo, clipboard, arac secimi, box listesi, navigation.
 *
 * DatasetEditor.prototype uzerine guvenli ES6 sinif genisletme kalibiyla enjekte edilir.
 */

(function installInputHandler(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    console.error('[InputHandler] DatasetEditor henuz yuklenmedi!');
    return;
  }

  class _InputHandlerExtension {
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

  // B veya C Tuşu: Kutu Çizim Moduna Geçiş
  if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'b' || e.key === 'B' || e.key === 'c' || e.key === 'C')) {
    if (!this.selectedBoxIndices.size && !e.ctrlKey) {
      e.preventDefault();
      this.setMode('draw');
      this.showToast('✏️ Kutu Çizim Modu (B)', 'info');
      return;
    }
  }

  // P Tuşu: Poligon Moduna Geçiş
  if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    this.setMode('polygon');
    this.showToast('🔷 Poligon Modu (P) — Tıkla köşe ekle, Enter ile tamamla', 'info');
    return;
  }

  // V veya S Tuşu: Seçim Moduna Geçiş
  if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'v' || e.key === 'V' || e.key === 's' || e.key === 'S')) {
    if (!e.ctrlKey) {
      e.preventDefault();
      this.setMode('select');
      this.showToast('👆 Kutu / Poligon Seçim Modu (V)', 'info');
      return;
    }
  }

  // H Tuşu: El / Tuval Kaydırma Modu
  if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'h' || e.key === 'H')) {
    e.preventDefault();
    this.setMode('pan');
    this.showToast('✋ El / Kaydırma Modu (H)', 'info');
    return;
  }

  // W Tuşu: Akıllı Tıkla (Smart Segment) Modu
  if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'w' || e.key === 'W')) {
    e.preventDefault();
    this.setMode('smart-segment');
    this.showToast('🪄 Akıllı Tık Modu (W) — Nesneye sol tıklayın', 'info');
    return;
  }

  // R Tuşu: Kutu Sıkılaştır (Refine Box)
  if (!e.ctrlKey && !e.altKey && !e.metaKey && (e.key === 'r' || e.key === 'R')) {
    e.preventDefault();
    this.refineSelectedBoxes();
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

  // Alt Bağlamsal Durum Çubuğu Güncellemesi
  const statusToolEl = document.getElementById('statusActiveToolText');
  if (statusToolEl) {
    const modeNames = {
      draw: 'Kutu Çiz (B)',
      polygon: 'Poligon / Segmentasyon (P)',
      select: 'Seç ve Taşı (V)',
      pan: 'Tuvali Kaydır (H)',
      'smart-segment': 'Akıllı Tıkla-Bölütle (W)'
    };
    statusToolEl.innerHTML = `Seçilen Araç: <strong>${modeNames[mode] || mode}</strong>`;
  }
}

setDirty(isDirty) {
  this.isDirty = isDirty;
  if (isDirty) {
    this.saveStatusIndicator.className = 'status-badge-modern unsaved';
    const txt = this.saveStatusIndicator.querySelector('.status-text');
    if (txt) txt.textContent = 'KAYDEDİLMEDİ';
    const statusActEl = document.getElementById('statusRecentActionText');
    if (statusActEl) statusActEl.innerHTML = `Son Eylem: <strong style="color:#fbbf24;">Düzenlendi (Kaydedilmedi)</strong>`;
    this.debounceAutoSave();
  } else {
    this.saveStatusIndicator.className = 'status-badge-modern saved';
    const txt = this.saveStatusIndicator.querySelector('.status-text');
    if (txt) txt.textContent = 'GÜNCEL';
    const statusActEl = document.getElementById('statusRecentActionText');
    if (statusActEl) statusActEl.innerHTML = `Son Eylem: <strong style="color:#10b981;">Kaydedildi ✓</strong>`;
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
  this.updateEditorStatisticsTab();
}

updateEditorStatisticsTab() {
  const total = this.images ? this.images.length : 0;
  let labeled = 0;
  if (this.images) {
    labeled = this.images.filter(i => i.has_label_file && i.box_count > 0).length;
  }
  const pending = Math.max(0, total - labeled);
  const pct = total > 0 ? ((labeled / total) * 100).toFixed(1) : 0;

  const tEl = document.getElementById('statTotalImagesVal');
  const lEl = document.getElementById('statLabeledImagesVal');
  const pEl = document.getElementById('statPendingImagesVal');
  const barEl = document.getElementById('editorProgressFill');

  if (tEl) tEl.textContent = total.toLocaleString();
  if (lEl) lEl.textContent = labeled.toLocaleString();
  if (pEl) pEl.textContent = pending.toLocaleString();
  if (barEl) barEl.style.width = `${pct}%`;

  // Render class stats
  this.loadStats();
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
  if (this.deleteSelectedBtn) this.deleteSelectedBtn.disabled = selCount === 0;
  if (deleteBtnLabel) deleteBtnLabel.disabled = selCount === 0;

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
      const newSelected = new Set();
      this.selectedBoxIndices.forEach(selIdx => {
        if (selIdx < idx) newSelected.add(selIdx);
        else if (selIdx > idx) newSelected.add(selIdx - 1);
      });
      this.selectedBoxIndices = newSelected;
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
  }

  // Metotlari ve getter/setter'lari DatasetEditor.prototype'a kopyala
  const proto = _InputHandlerExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }
})(window.DatasetEditor);
