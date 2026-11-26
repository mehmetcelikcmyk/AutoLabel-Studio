/**
 * AutoLabel Studio - ProjectSettings Module
 * =====================================
 * Proje ayarlari modali, sinif dagilimi, upload, sil, AI ops, saglik kontrolu.
 *
 * DatasetEditor.prototype uzerine guvenli ES6 sinif genisletme kalibiyla enjekte edilir.
 */

(function installProjectSettings(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    console.error('[ProjectSettings] DatasetEditor henuz yuklenmedi!');
    return;
  }

  class _ProjectSettingsExtension {
  async openProjectSettingsModal(cat = null) {
  const category = cat || this.currentCategory;
  if (!category) {
    this.showToast('Lütfen önce bir proje seçin.', 'warning');
    return;
  }

  this.activeSettingsCategory = category;
  this.showLoading(true, 'Proje ayarları yükleniyor...');

  try {
    const res = await fetch(`/api/project-settings?category=${encodeURIComponent(category)}`, {
      headers: this.getAuthHeaders()
    });
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
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
  }

  // Metotlari ve getter/setter'lari DatasetEditor.prototype'a kopyala
  const proto = _ProjectSettingsExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }
})(window.DatasetEditor);
