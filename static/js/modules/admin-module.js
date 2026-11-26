/**
 * AutoLabel Studio - AdminModule Module
 * =================================
 * Superuser admin paneli: kullanici, model, log, template, proje, Cloudflare altyapi yonetimi.
 *
 * DatasetEditor.prototype uzerine guvenli ES6 sinif genisletme kalibiyla enjekte edilir.
 */

(function installAdminModule(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    console.error('[AdminModule] DatasetEditor henuz yuklenmedi!');
    return;
  }

  class _AdminModuleExtension {
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

  // Reset default active subtab to overview if none active
  const activeBtn = document.querySelector('.admin-tab-btn.active');
  if (!activeBtn) {
    const firstBtn = document.querySelector('.admin-tab-btn[data-atab="overview"]');
    if (firstBtn) firstBtn.classList.add('active');
    const firstPanel = document.getElementById('adminPanelOverview');
    if (firstPanel) {
      firstPanel.classList.add('active');
      firstPanel.style.display = 'block';
    }
  }

  await Promise.all([
    this.loadAdminOverview(),
    this.loadAdminUsers(),
    this.loadAdminProjects(),
    this.loadAdminModels(),
    this.loadAdminLogs(),
    this.loadAdminTemplates()
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
      } else if (targetTab === 'projects') {
        const p = document.getElementById('adminPanelProjects');
        if (p) { p.classList.add('active'); p.style.display = 'block'; }
        this.loadAdminProjects();
      } else if (targetTab === 'models') {
        const p = document.getElementById('adminPanelModels');
        if (p) { p.classList.add('active'); p.style.display = 'block'; }
        this.loadAdminModels();
      } else if (targetTab === 'logs') {
        const p = document.getElementById('adminPanelLogs');
        if (p) { p.classList.add('active'); p.style.display = 'block'; }
        this.loadAdminLogs();
      } else if (targetTab === 'templates') {
        const p = document.getElementById('adminPanelTemplates');
        if (p) { p.classList.add('active'); p.style.display = 'block'; }
        this.loadAdminTemplates();
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

  // Template filters
  const filterAdminTemplates = () => {
    const q = document.getElementById('adminTemplateSearchInput')?.value.toLowerCase().trim() || '';
    const cat = document.getElementById('adminTemplateCategoryFilter')?.value || 'all';
    const status = document.getElementById('adminTemplateStatusFilter')?.value || 'all';

    document.querySelectorAll('#adminTemplatesTableBody tr').forEach(tr => {
      const trCat = tr.dataset.category || '';
      const trActive = tr.dataset.active === 'true';
      const trText = tr.textContent.toLowerCase();

      const matchQ = !q || trText.includes(q);
      const matchCat = (cat === 'all' || trCat === cat);
      const matchStatus = (status === 'all' || (status === 'active' && trActive) || (status === 'inactive' && !trActive));

      tr.style.display = (matchQ && matchCat && matchStatus) ? '' : 'none';
    });
  };

  document.getElementById('adminTemplateSearchInput')?.addEventListener('input', filterAdminTemplates);
  document.getElementById('adminTemplateCategoryFilter')?.addEventListener('change', filterAdminTemplates);
  document.getElementById('adminTemplateStatusFilter')?.addEventListener('change', filterAdminTemplates);

  // Admin Şablon Ekleme Butonu
  document.getElementById('adminOpenCreateTemplateBtn')?.addEventListener('click', () => {
    const modal = document.getElementById('createCustomTemplateModal');
    if (modal) {
      document.getElementById('tplTitleInput').value = '';
      document.getElementById('tplCategorySelect').value = 'industry';
      document.getElementById('tplModelSelect').value = 'yolov8s-worldv2';
      document.getElementById('tplDescInput').value = '';
      const tplContainer = document.getElementById('tplClassesRowsContainer');
      if (tplContainer) {
        tplContainer.innerHTML = '';
        const addRow = (name, color, prompt) => {
          const div = document.createElement('div');
          div.className = 'tpl-class-row';
          div.style.cssText = 'display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.03); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);';
          div.innerHTML = `
              <input type="color" class="tpl-cls-color" value="${color}" style="width:32px; height:32px; border:none; border-radius:6px; cursor:pointer; background:transparent;">
              <input type="text" class="tpl-cls-name form-input" placeholder="Sınıf Adı" value="${name}" style="flex:1; padding:6px 10px; background:#0b0f19; border:1px solid rgba(255,255,255,0.14); border-radius:6px; color:#fff; font-size:0.82rem;">
              <input type="text" class="tpl-cls-prompt form-input" placeholder="AI Arama Promptu" value="${prompt}" style="flex:1.5; padding:6px 10px; background:#0b0f19; border:1px solid rgba(255,255,255,0.14); border-radius:6px; color:#fff; font-size:0.82rem;">
              <button type="button" class="tpl-del-row-btn" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:1.1rem; padding:4px;">✕</button>
            `;
          div.querySelector('.tpl-del-row-btn')?.addEventListener('click', () => div.remove());
          tplContainer.appendChild(div);
        };
        addRow('Kusurlu Parça', '#ef4444', 'defective damaged industrial part');
        addRow('Sağlam Parça', '#10b981', 'perfect clean industrial product');
      }
      modal.style.display = 'flex';
    }
  });

  // Admin Şablon Modal Kapat / Sınıf Ekle / Kaydet Bağlantıları
  const closeCustomTplModal = () => {
    const m = document.getElementById('createCustomTemplateModal');
    if (m) m.style.display = 'none';
  };
  document.getElementById('closeCreateTemplateModalBtn')?.addEventListener('click', closeCustomTplModal);
  document.getElementById('cancelCreateTplBtn')?.addEventListener('click', closeCustomTplModal);
  document.getElementById('tplAddClassRowBtn')?.addEventListener('click', () => {
    const tplContainer = document.getElementById('tplClassesRowsContainer');
    if (!tplContainer) return;
    const div = document.createElement('div');
    div.className = 'tpl-class-row';
    div.style.cssText = 'display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.03); padding:8px 10px; border-radius:8px; border:1px solid rgba(255,255,255,0.06);';
    div.innerHTML = `
      <input type="color" class="tpl-cls-color" value="#3b82f6" style="width:32px; height:32px; border:none; border-radius:6px; cursor:pointer; background:transparent;">
      <input type="text" class="tpl-cls-name form-input" placeholder="Sınıf Adı" value="" style="flex:1; padding:6px 10px; background:#0b0f19; border:1px solid rgba(255,255,255,0.14); border-radius:6px; color:#fff; font-size:0.82rem;">
      <input type="text" class="tpl-cls-prompt form-input" placeholder="AI Arama Promptu" value="" style="flex:1.5; padding:6px 10px; background:#0b0f19; border:1px solid rgba(255,255,255,0.14); border-radius:6px; color:#fff; font-size:0.82rem;">
      <button type="button" class="tpl-del-row-btn" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:1.1rem; padding:4px;">✕</button>
    `;
    div.querySelector('.tpl-del-row-btn')?.addEventListener('click', () => div.remove());
    tplContainer.appendChild(div);
  });
  document.getElementById('submitCreateTplBtn')?.addEventListener('click', async () => {
    const title = (document.getElementById('tplTitleInput')?.value || '').trim();
    const category = document.getElementById('tplCategorySelect')?.value || 'industry';
    const model = document.getElementById('tplModelSelect')?.value || 'yolov8s-worldv2';
    const description = (document.getElementById('tplDescInput')?.value || '').trim();
    const rows = Array.from(document.querySelectorAll('#tplClassesRowsContainer .tpl-class-row'));
    const classes = rows.map((r, idx) => ({
      id: idx,
      name: (r.querySelector('.tpl-cls-name')?.value || '').trim(),
      color: r.querySelector('.tpl-cls-color')?.value || '#3b82f6',
      prompts: [(r.querySelector('.tpl-cls-prompt')?.value || '').trim()].filter(Boolean)
    })).filter(c => c.name);
    if (!title || classes.length === 0) {
      this.showToast('Şablon adı ve en az bir sınıf gereklidir.', 'warning');
      return;
    }
    try {
      const res = await fetch('/api/templates/custom', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ title, category, model, description, classes })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.status === 'ok') {
        this.showToast('Özel şablon başarıyla oluşturuldu.', 'success');
        closeCustomTplModal();
        if (typeof this.loadAdminTemplates === 'function') this.loadAdminTemplates();
      } else {
        this.showToast(data.detail || 'Şablon oluşturulamadı.', 'error');
      }
    } catch (_) {
      this.showToast('Şablon kaydedilirken bağlantı hatası oluştu.', 'error');
    }
  });

  // Admin Yeni Kullanıcı Ekleme Butonu & Modalı
  const userModal = document.getElementById('adminCreateUserModal');
  const openUserModal = () => {
    if (userModal) {
      document.getElementById('adminNewUserDisplayName').value = '';
      document.getElementById('adminNewUserEmail').value = '';
      document.getElementById('adminNewUserPassword').value = '';
      document.getElementById('adminNewUserRole').value = 'user';
      userModal.style.display = 'flex';
    }
  };
  const closeUserModal = () => {
    if (userModal) userModal.style.display = 'none';
  };

  document.getElementById('adminOpenCreateUserModalBtn')?.addEventListener('click', openUserModal);
  document.getElementById('closeAdminCreateUserModalBtn')?.addEventListener('click', closeUserModal);
  document.getElementById('cancelAdminCreateUserBtn')?.addEventListener('click', closeUserModal);

  document.getElementById('submitAdminCreateUserBtn')?.addEventListener('click', async () => {
    const name = document.getElementById('adminNewUserDisplayName')?.value.trim();
    const email = document.getElementById('adminNewUserEmail')?.value.trim();
    const password = document.getElementById('adminNewUserPassword')?.value;
    const role = document.getElementById('adminNewUserRole')?.value || 'user';

    if (!name) {
      this.showToast('Lütfen kullanıcının adını ve soyadını giriniz.', 'error');
      return;
    }
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      this.showToast('Lütfen geçerli bir e-posta adresi giriniz.', 'error');
      return;
    }
    if (!password || password.length < 8) {
      this.showToast('Şifre en az 8 karakter olmalıdır.', 'error');
      return;
    }

    const submitBtn = document.getElementById('submitAdminCreateUserBtn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Oluşturuluyor...</span>';
    }

    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const res = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ display_name: name, email, password, role })
      });
      const data = await res.json();
      if (res.ok) {
        this.showToast(data.message || 'Kullanıcı başarıyla oluşturuldu!', 'success');
        closeUserModal();
        await this.loadAdminUsers();
      } else {
        this.showToast(data.detail || 'Kullanıcı oluşturulamadı.', 'error');
      }
    } catch (err) {
      this.showToast('Bağlantı hatası oluştu.', 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline></svg>
            <span>Kullanıcıyı Kaydet</span>
          `;
      }
    }
  });
}

  async loadAdminOverview() {
  try {
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const res = await fetch('/api/admin/overview', {
      headers: { 'Authorization': `Bearer ${token}` }
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
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
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
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const res = await fetch('/api/admin/update-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
      console.error(e);
      this.showToast('İşlem sırasında ağ hatası oluştu.', 'error');
    }
  }

  async deleteUserAccount(email) {
    try {
      const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
      const res = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
      console.error(e);
      this.showToast('İşlem sırasında ağ hatası oluştu.', 'error');
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

  async loadAdminTemplates() {
  try {
    const res = await fetch('/api/admin/templates', {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const templates = data.templates || [];
    const tbody = document.getElementById('adminTemplatesTableBody');
    const badge = document.getElementById('adminTemplatesTotalBadge');
    if (badge) badge.textContent = `${templates.length} Şablon`;
    if (!tbody) return;

    if (templates.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:32px; color:#94a3b8;">Henüz kayıtlı şablon bulunmuyor.</td></tr>';
      return;
    }

    const categoryLabels = {
      safety: 'İş Güvenliği & KKD',
      traffic: 'Trafik & Ulaşım',
      industry: 'Endüstriyel Üretim',
      retail: 'Perakende & Lojistik',
      agriculture: 'Tarım & Orman',
      drone: 'Drone & Savunma',
      medical: 'Sağlık & Medikal',
      sports_security: 'Spor & Asayiş'
    };

    tbody.innerHTML = templates.map(t => {
      const catLabel = categoryLabels[t.category] || t.category || 'Genel';
      const classesBadges = (t.classes || []).map(c => `
          <span style="display:inline-flex; align-items:center; gap:4px; background:rgba(255,255,255,0.06); padding:2px 7px; border-radius:6px; font-size:0.75rem; margin:2px;">
            <span style="width:7px; height:7px; border-radius:50%; background:${c.color || '#3b82f6'};"></span>
            ${this._escapeHtml(c.name)}
          </span>
        `).join('');

      const isActive = t.is_active;

      return `
          <tr data-id="${t.id}" data-category="${t.category}" data-active="${isActive ? 'true' : 'false'}" style="border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.2s ease;">
            <td style="padding:14px 16px;">
              <div style="font-weight:700; color:#f8fafc; font-size:0.9rem; margin-bottom:3px;">${this._escapeHtml(t.title)}</div>
              <div style="font-size:0.78rem; color:#94a3b8; max-width:320px; line-height:1.4;">${this._escapeHtml(t.description || '')}</div>
            </td>
            <td style="padding:14px 16px; white-space:nowrap;">
              <span class="fmt-pill" style="font-size:0.75rem; padding:3px 9px;">${this._escapeHtml(catLabel)}</span>
            </td>
            <td style="padding:14px 16px;">
              <div style="display:flex; flex-wrap:wrap; max-width:280px;">${classesBadges}</div>
            </td>
            <td style="padding:14px 16px; font-size:0.8rem; color:#cbd5e1; white-space:nowrap;">
              ${this._escapeHtml(t.recommended_model || 'YOLOv8s')}
            </td>
            <td style="padding:14px 16px; text-align:center;">
              <label class="admin-switch" style="position:relative; display:inline-block; width:44px; height:24px; cursor:pointer;">
                <input type="checkbox" class="admin-template-toggle" data-tid="${t.id}" ${isActive ? 'checked' : ''} style="opacity:0; width:0; height:0;">
                <span class="admin-switch-slider" style="position:absolute; cursor:pointer; top:0; left:0; right:0; bottom:0; background-color:${isActive ? '#10b981' : '#334155'}; transition:0.3s; border-radius:24px;"></span>
                <span class="admin-switch-knob" style="position:absolute; height:18px; width:18px; left:${isActive ? '22px' : '3px'}; bottom:3px; background-color:white; transition:0.3s; border-radius:50%;"></span>
              </label>
            </td>
          </tr>
        `;
    }).join('');

    // Attach switch toggle listeners
    tbody.querySelectorAll('.admin-template-toggle').forEach(chk => {
      chk.addEventListener('change', async (e) => {
        const tid = chk.dataset.tid;
        const newStatus = chk.checked;
        const slider = chk.parentElement.querySelector('.admin-switch-slider');
        const knob = chk.parentElement.querySelector('.admin-switch-knob');
        if (slider) slider.style.backgroundColor = newStatus ? '#10b981' : '#334155';
        if (knob) knob.style.left = newStatus ? '22px' : '3px';

        const tr = chk.closest('tr');
        if (tr) tr.dataset.active = newStatus ? 'true' : 'false';

        await this.toggleAdminTemplateStatus(tid, newStatus);
      });
    });

  } catch (e) {
    console.error('Error loading admin templates:', e);
  }
}

  async toggleAdminTemplateStatus(templateId, isActive) {
  try {
    const res = await fetch('/api/admin/templates/toggle-status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('yolo_auth_token') || ''}`
      },
      body: JSON.stringify({
        template_id: templateId,
        is_active: isActive
      })
    });
    const data = await res.json();
    if (res.ok) {
      this.showToast(data.message || 'Şablon durumu güncellendi.', 'success');
    } else {
      this.showToast(data.detail || 'Durum değiştirilemedi.', 'error');
      await this.loadAdminTemplates();
    }
  } catch (e) {
    this.showToast('Bağlantı hatası.', 'error');
  }
}

  // =====================================================
  // ADMIN USER PROJECTS MANAGEMENT
  // =====================================================

  async loadAdminProjects() {
  const tbody = document.getElementById('adminProjectsTableBody');
  const badge = document.getElementById('adminProjectsTotalBadge');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:#94a3b8;">Kullanıcı projeleri Cloudflare ve yerel depolamadan taranıyor...</td></tr>';

  try {
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const res = await fetch('/api/admin/projects', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:#ef4444;">Projeler yüklenirken hata oluştu (Yetkisiz veya Sunucu Hatası).</td></tr>';
      return;
    }

    const data = await res.json();
    const projects = data.projects || [];
    if (badge) badge.textContent = `${projects.length} Proje`;

    if (projects.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:#94a3b8;">Henüz kayıtlı bir kullanıcı projesi bulunmuyor.</td></tr>';
      return;
    }

    tbody.innerHTML = projects.map(p => {
      const isPub = (p.visibility || 'private').toLowerCase() === 'public';
      const typeLabel = p.project_type === 'classification' ? 'Sınıflandırma' : 'Nesne Tespiti';
      const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Bilinmiyor';

      return `
          <tr data-pid="${p.id}" data-visibility="${p.visibility}" data-type="${p.project_type}" style="border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.2s ease;">
            <td style="padding:8px 10px;">
              <div style="font-weight:700; color:#f8fafc; font-size:0.82rem; margin-bottom:2px; display:flex; align-items:center; gap:6px;">
                <span>${this._escapeHtml(p.display_name || p.id)}</span>
                <span style="font-size:0.68rem; opacity:0.6; font-family:monospace;">${this._escapeHtml(p.id)}</span>
              </div>
              <div style="font-size:0.72rem; color:#94a3b8; max-width:240px; line-height:1.3; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${this._escapeHtml(p.description || 'Açıklama yok')}
              </div>
            </td>
            <td style="padding:8px 10px; white-space:nowrap;">
              <div style="display:flex; align-items:center; gap:4px;">
                <span style="color:#38bdf8; font-size:0.76rem; font-weight:600;">${this._escapeHtml(p.owner_email || 'admin')}</span>
              </div>
            </td>
            <td style="padding:8px 10px; white-space:nowrap;">
              <span class="fmt-pill ${isPub ? 'green' : 'blue'}" style="font-size:0.7rem; padding:2px 6px; font-weight:600; text-transform:uppercase;">
                ${isPub ? '🌐 Public' : '🔒 Private'}
              </span>
            </td>
            <td style="padding:8px 10px; font-size:0.75rem; color:#cbd5e1; white-space:nowrap;">
              <div>${typeLabel}</div>
              <span style="font-size:0.68rem; opacity:0.7;">${this._escapeHtml(p.license || 'CC BY 4.0')}</span>
            </td>
            <td style="padding:8px 10px; white-space:nowrap;">
              <div style="font-size:0.76rem; font-weight:600; color:#f1f5f9;">
                ${p.total_labeled} / ${p.total_images} <span style="font-size:0.68rem; color:#34d399;">(%${p.percent})</span>
              </div>
              <div style="width:60px; height:3px; background:rgba(255,255,255,0.08); border-radius:99px; margin-top:3px; overflow:hidden;">
                <div style="width:${Math.min(p.percent, 100)}%; height:100%; background:#10b981; border-radius:99px;"></div>
              </div>
            </td>
            <td style="padding:8px 10px; font-size:0.72rem; color:#94a3b8; white-space:nowrap;">
              ${dateStr}
            </td>
            <td style="padding:8px 10px; text-align:right; white-space:nowrap;">
              <button class="btn-secondary btn-sm admin-proj-open-btn" data-pid="${p.id}" style="margin-right:4px; display:inline-flex; align-items:center; gap:4px; padding:4px 8px; font-size:0.72rem;" title="Tüm görselleri ve sahip detaylarını salt okunur incele">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <span>İncele</span>
              </button>
              <button class="btn-secondary btn-sm admin-proj-toggle-vis-btn" data-pid="${p.id}" data-vis="${p.visibility}" style="margin-right:4px; padding:4px 8px; font-size:0.72rem;" title="Görünürlüğü Değiştir">
                ${isPub ? '🔒 Private' : '🌐 Public'}
              </button>
              <button class="admin-action-btn danger admin-proj-delete-btn" data-pid="${p.id}" data-name="${this._escapeHtml(p.display_name || p.id)}" style="padding:4px 8px; font-size:0.72rem;" title="Projeyi Sil">
                Sil
              </button>
            </td>
          </tr>
        `;
    }).join('');

    // Open Project action - READ ONLY INSPECT MODAL (Admin cannot edit user projects)
    tbody.querySelectorAll('.admin-proj-open-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        if (pid) this.openPublicDatasetModal(pid, true);
      });
    });

    // Toggle Visibility action
    tbody.querySelectorAll('.admin-proj-toggle-vis-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        const currentVis = btn.dataset.vis;
        const targetVis = currentVis === 'public' ? 'private' : 'public';
        btn.disabled = true;
        await this.adminToggleProjectVisibility(pid, targetVis);
        btn.disabled = false;
      });
    });

    // Delete Project action
    tbody.querySelectorAll('.admin-proj-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const pid = btn.dataset.pid;
        const name = btn.dataset.name;
        const confirmed = await this.showConfirm({
          title: 'Kullanıcı Projesini Sil',
          subtitle: 'Yönetici Kalıcı İşlemi',
          message: `'${name}' (${pid}) projesini ve tüm görsel/etiket verilerini sistemden kalıcı olarak silmek istediğinize emin misiniz?`,
          confirmText: 'Evet, Projeyi Kalıcı Sil',
          cancelText: 'Vazgeç',
          type: 'danger'
        });
        if (confirmed) {
          await this.adminDeleteProject(pid);
        }
      });
    });

    // Filter input listeners
    const filterProjects = () => {
      const q = document.getElementById('adminProjectSearchInput')?.value.toLowerCase().trim() || '';
      const vis = document.getElementById('adminProjectVisibilityFilter')?.value || 'all';
      const typ = document.getElementById('adminProjectTypeFilter')?.value || 'all';

      tbody.querySelectorAll('tr').forEach(tr => {
        const trVis = tr.dataset.visibility || '';
        const trTyp = tr.dataset.type || '';
        const trText = tr.textContent.toLowerCase();

        const matchQ = !q || trText.includes(q);
        const matchVis = (vis === 'all' || trVis === vis);
        const matchTyp = (typ === 'all' || trTyp === typ);

        tr.style.display = (matchQ && matchVis && matchTyp) ? '' : 'none';
      });
    };

    document.getElementById('adminProjectSearchInput')?.addEventListener('input', filterProjects);
    document.getElementById('adminProjectVisibilityFilter')?.addEventListener('change', filterProjects);
    document.getElementById('adminProjectTypeFilter')?.addEventListener('change', filterProjects);

  } catch (e) {
    console.error('Error loading admin projects:', e);
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:32px; color:#ef4444;">Projeler yüklenirken bir hata oluştu.</td></tr>';
  }
}

  async adminToggleProjectVisibility(projectId, targetVisibility) {
  try {
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const res = await fetch('/api/admin/projects/visibility', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ project_id: projectId, visibility: targetVisibility })
    });
    const data = await res.json();
    if (res.ok) {
      this.showToast(data.message || 'Proje görünürlüğü güncellendi.', 'success');
      await this.loadAdminProjects();
    } else {
      this.showToast(data.detail || 'Görünürlük güncellenemedi.', 'error');
    }
  } catch (e) {
    this.showToast('Görünürlük güncellenirken bağlantı hatası oluştu.', 'error');
  }
}

  async adminDeleteProject(projectId) {
  try {
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const res = await fetch(`/api/admin/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (res.ok) {
      this.showToast(data.message || 'Proje kalıcı olarak silindi.', 'success');
      await this.loadAdminProjects();
      await this.fetchProjects();
    } else {
      this.showToast(data.detail || 'Proje silinemedi.', 'error');
    }
  } catch (e) {
    this.showToast('Proje silinirken bağlantı hatası oluştu.', 'error');
  }
}


  }

  // Metotlari ve getter/setter'lari DatasetEditor.prototype'a kopyala
  const proto = _AdminModuleExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }
})(window.DatasetEditor);
