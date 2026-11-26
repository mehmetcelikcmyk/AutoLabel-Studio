/**
 * AutoLabel Studio - ExploreAgent Module
 * ==================================
 * Kesfet paneli, topluluk veri setleri, AI Agent chat arayuzu, oturum yonetimi.
 *
 * DatasetEditor.prototype uzerine guvenli ES6 sinif genisletme kalibiyla enjekte edilir.
 */

(function installExploreAgent(DatasetEditor) {
  if (!DatasetEditor || !DatasetEditor.prototype) {
    console.error('[ExploreAgent] DatasetEditor henuz yuklenmedi!');
    return;
  }

  class _ExploreAgentExtension {
  async loadExploreProjects() {
  // 1. Fetch public community projects (Read-only security model)
  const publicGrid = document.getElementById('explorePublicProjectsGrid');
  const countBadge = document.getElementById('explorePublicCountBadge');
  if (publicGrid) {
    try {
      const res = await fetch('/api/projects/public');
      const data = await res.json();
      const projects = data.projects || [];
      if (countBadge) countBadge.textContent = `${projects.length} Proje`;

      if (projects.length === 0) {
        publicGrid.innerHTML = `
            <div style="grid-column: 1 / -1; padding:28px; text-align:center; color:#94a3b8; font-size:0.86rem; background:rgba(255,255,255,0.02); border:1px dashed rgba(255,255,255,0.1); border-radius:14px;">
              <div style="font-size:1.5rem; margin-bottom:6px;">🌐</div>
              Henüz herkese açık (public) olarak paylaşılan topluluk veri seti bulunmuyor.
            </div>
          `;
      } else {
        publicGrid.innerHTML = projects.map(p => {
          const pId = p.id || p.folder_name;
          const pName = p.name || p.display_name || pId;
          const classesHtml = (p.classes || []).slice(0, 4).map(c => {
            const cName = typeof c === 'string' ? c : (c.name || c.display_name || 'Nesne');
            const cColor = (typeof c === 'object' && c.color) ? c.color : '#3b82f6';
            return `
              <span class="class-tag-pill" style="border-left: 3px solid ${cColor}; font-size:0.75rem; padding:3px 8px;">
                <span style="color:${cColor}">●</span> ${this._escapeHtml(cName)}
              </span>
            `;
          }).join('');

          const ownerText = p.owner_email ? p.owner_email.split('@')[0] : 'topluluk';

          return `
              <div class="project-card explore-public-card" data-project-id="${pId}" style="cursor:pointer; display:flex; flex-direction:column; justify-content:space-between; border:1px solid rgba(59,130,246,0.25); background:rgba(15,23,42,0.8); border-radius:14px; padding:18px; transition:all 0.25s ease;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                    <span style="font-size:0.72rem; font-weight:700; color:#60a5fa; background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.25); padding:3px 8px; border-radius:6px;">
                      ${this._escapeHtml((p.project_type || 'DETECTION').toUpperCase())}
                    </span>
                    <span style="font-size:0.75rem; color:#94a3b8; display:flex; align-items:center; gap:4px;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                      @${this._escapeHtml(ownerText)}
                    </span>
                  </div>
                  <h3 style="font-size:1.08rem; font-weight:700; color:#f8fafc; margin:0 0 6px 0;">${this._escapeHtml(pName)}</h3>
                  <p style="font-size:0.83rem; color:#94a3b8; line-height:1.45; margin-bottom:14px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                    ${this._escapeHtml(p.description || 'Topluluk tarafından paylaşılan açık veri seti.')}
                  </p>
                  <div style="display:flex; justify-content:space-between; font-size:0.76rem; color:#cbd5e1; margin-bottom:10px; background:rgba(255,255,255,0.03); padding:6px 10px; border-radius:8px;">
                    <span>Görseller: <strong>${p.image_count || 0}</strong></span>
                    <span>Etiketli: <strong>${p.label_count || 0}</strong></span>
                    <span>Oran: <strong style="color:#34d399;">%${p.percent || 0}</strong></span>
                  </div>
                  <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:14px;">
                    ${classesHtml}
                    ${(p.classes || []).length > 4 ? `<span style="font-size:0.72rem; color:#64748b; align-self:center;">+${p.classes.length - 4}</span>` : ''}
                  </div>
                </div>
                <button type="button" class="btn-secondary btn-sm explore-inspect-public-btn" data-pid="${pId}" style="width:100%; justify-content:center; gap:8px; padding:9px 12px; background:rgba(59,130,246,0.12); border-color:rgba(59,130,246,0.3); color:#93c5fd;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                  <span>Veri Setini İncele &amp; İndir</span>
                </button>
              </div>
            `;
        }).join('');

        // Wire up inspect button on public cards to open secure preview modal
        publicGrid.querySelectorAll('.explore-inspect-public-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const pid = btn.dataset.pid;
            if (pid) this.openPublicDatasetModal(pid);
          });
        });
        publicGrid.querySelectorAll('.explore-public-card').forEach(card => {
          card.addEventListener('click', () => {
            const pid = card.dataset.projectId;
            if (pid) this.openPublicDatasetModal(pid);
          });
        });
      }
    } catch (err) {
      console.error('Failed to load public projects:', err);
    }
  }

  // 2. Fetch admin-approved active templates with demo data from Cloudflare D1
  const templatesGrid = document.getElementById('exploreTemplatesGrid');
  if (templatesGrid) {
    try {
      const res = await fetch('/api/templates/active');
      const data = await res.json();
      const activeTemplates = data.templates || [];

      if (activeTemplates.length > 0) {
        window._activeExploreTemplates = activeTemplates;
        templatesGrid.innerHTML = activeTemplates.map(t => {
          const classPills = (t.classes || []).map(c => `
              <span class="explore-class-pill"><i style="background:${c.color || '#3b82f6'}"></i> ${this._escapeHtml(c.name)}</span>
            `).join('');

          const demoCount = (t.sample_images || []).length;

          return `
              <div class="explore-card" data-tmpl="${t.id}" data-category="${t.category}">
                <div class="explore-card-banner ${t.banner_cls || 'banner-safety'}">
                  <span class="explore-banner-pill">${this._escapeHtml(t.pill_text || 'Önceden Eğitilmiş')}</span>
                </div>
                <div class="explore-card-body">
                  <div class="explore-card-meta">
                    <span class="explore-badge ${t.badge_cls || 'badge-safety'}">${this._escapeHtml(t.badge_title || 'Sektörel')}</span>
                    <span class="explore-type-tag">${this._escapeHtml(t.task_type || 'Nesne Tespiti')}</span>
                  </div>
                  <h3>${this._escapeHtml(t.title)}</h3>
                  <p>${this._escapeHtml(t.description || '')}</p>
                  
                  <div style="margin:6px 0 10px 0; display:flex; align-items:center; gap:6px; font-size:0.75rem; color:#34d399;">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                    <span>${demoCount > 0 ? `${demoCount} adet hazır etiketli demo görsel` : 'Hazır etiket seti'}</span>
                  </div>

                  <div class="explore-class-tags">
                    ${classPills}
                  </div>
                  <div class="explore-card-footer" style="display:flex; gap:8px; align-items:center;">
                    <button class="btn-secondary btn-sm explore-preview-tpl-btn" data-tmpl="${t.id}" style="padding:6px 10px; font-size:0.75rem; border-color:rgba(168,85,247,0.3); color:#c084fc;">
                      <span>Önizle</span>
                    </button>
                    <button class="explore-use-btn" data-tmpl="${t.id}" style="flex:1;">
                      <span>Şablonu Başlat</span>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                  </div>
                </div>
              </div>
            `;
        }).join('');

        // Wire template preview buttons
        templatesGrid.querySelectorAll('.explore-preview-tpl-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tmplId = btn.dataset.tmpl;
            if (tmplId) this.openTemplatePreviewModal(tmplId);
          });
        });

        // Wire template use buttons to open modal for direct launch
        templatesGrid.querySelectorAll('.explore-use-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tmplId = btn.dataset.tmpl;
            if (tmplId) this.openTemplatePreviewModal(tmplId);
          });
        });
      }

      // D1'den hiç aktif şablon gelmediyse anlamlı mesaj göster
      if (activeTemplates.length === 0 && templatesGrid) {
        templatesGrid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:40px 20px; background:rgba(168,85,247,0.05); border:1px dashed rgba(168,85,247,0.2); border-radius:14px;">
              <div style="font-size:2rem; margin-bottom:10px;">&#129329;</div>
              <p style="color:#94a3b8; font-size:0.9rem;">Henüz admin tarafından aktive edilmiş şablon bulunmuyor.</p>
              <p style="color:#64748b; font-size:0.8rem; margin-top:4px;">Admin panelinden şablonları aktif ederek burada görüntüleyebilirsiniz.</p>
            </div>
          `;
      }
    } catch (err) {
      console.error('Failed to load active explore templates:', err);
      if (templatesGrid) {
        templatesGrid.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:40px 20px; background:rgba(239,68,68,0.05); border:1px dashed rgba(239,68,68,0.2); border-radius:14px;">
              <div style="font-size:2rem; margin-bottom:10px;">&#9888;&#65039;</div>
              <p style="color:#94a3b8; font-size:0.9rem;">Şablonlar yüklenirken bir hata oluştu.</p>
              <p style="color:#64748b; font-size:0.8rem; margin-top:4px;">Lütfen sayfayı yenileyerek tekrar deneyin.</p>
            </div>
          `;
      }
    }
  }
}

  async openPublicDatasetModal(projectId, isAdmin = false) {
  const modal = document.getElementById('publicDatasetModal');
  if (!modal) return;

  try {
    this.showLoading(true, isAdmin ? 'Kullanıcı projesi ve görselleri inceleniyor...' : 'Açık veri seti inceleniyor...');
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/public-summary?limit=500`, {
      headers
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || 'Veri seti bilgileri alınamadı.');

    const p = data.project;
    this._activePublicProject = p;

    const titleEl = document.getElementById('publicDatasetTitle');
    if (titleEl) {
      titleEl.textContent = isAdmin ? `${p.display_name} (Yönetici İnceleme - Salt Okunur)` : p.display_name;
    }
    document.getElementById('publicDatasetTypeBadge').textContent = (p.project_type || 'DETECTION').toUpperCase();

    const ownerEl = document.getElementById('publicDatasetOwner');
    if (ownerEl) {
      const ownerEmail = p.owner_email || 'admin';
      const visLabel = (p.visibility || 'private').toUpperCase();
      ownerEl.innerHTML = `<strong>Sahip:</strong> <span style="color:#60a5fa;">${this._escapeHtml(ownerEmail)}</span> · <strong>Görünürlük:</strong> <span style="color:${p.visibility === 'public' ? '#34d399' : '#fbbf24'};">${this._escapeHtml(visLabel)}</span> · <strong>Lisans:</strong> ${this._escapeHtml(p.license || 'CC BY 4.0')}`;
    }

    document.getElementById('publicDatasetDesc').textContent = p.description || 'Bu proje için henüz bir açıklama eklenmemiş.';
    document.getElementById('publicDatasetTotalImages').textContent = p.total_images || 0;
    document.getElementById('publicDatasetLabeledCount').textContent = p.total_labeled || 0;
    document.getElementById('publicDatasetClassCount').textContent = (p.classes || []).length;

    // Classes Wrap
    const classesWrap = document.getElementById('publicDatasetClassesWrap');
    if (classesWrap) {
      classesWrap.innerHTML = (p.classes || []).map(c => `
          <span class="class-tag-pill" style="border-left: 3px solid ${c.color || '#3b82f6'}; font-size:0.8rem; padding:4px 10px; background:rgba(255,255,255,0.04); border-radius:6px; color:#f8fafc;">
            <span style="color:${c.color || '#3b82f6'}">●</span> ${this._escapeHtml(c.name)}
          </span>
        `).join('') || '<span style="color:#64748b; font-size:0.8rem;">Tanımlı sınıf bulunamadı.</span>';
    }

    // Sample Gallery with Bounding Boxes (Shows all project images up to 500)
    const gallery = document.getElementById('publicDatasetGallery');
    if (gallery) {
      if (!p.samples || p.samples.length === 0) {
        gallery.innerHTML = '<div style="grid-column:1/-1; padding:16px; text-align:center; color:#64748b; font-size:0.82rem;">Önizlenebilir görsel bulunmuyor.</div>';
      } else {
        gallery.innerHTML = p.samples.map(s => {
          const hasBoxes = s.boxes && s.boxes.length > 0;
          return `
              <div style="position:relative; background:#020617; border:1px solid rgba(255,255,255,0.1); border-radius:10px; overflow:hidden; aspect-ratio:4/3; display:flex; align-items:center; justify-content:center;">
                <img src="${s.preview_url}" alt="${s.filename}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">
                <div style="position:absolute; bottom:6px; left:6px; right:6px; background:rgba(15,23,42,0.85); backdrop-filter:blur(4px); padding:4px 8px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; font-size:0.7rem; color:#cbd5e1;">
                  <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:90px;" title="${this._escapeHtml(s.filename)}">${this._escapeHtml(s.filename)}</span>
                  <span style="color:${hasBoxes ? '#34d399' : '#94a3b8'}; font-weight:700;">${hasBoxes ? `${s.boxes.length} Kutu` : 'Ham'}</span>
                </div>
              </div>
            `;
        }).join('');
      }
    }

    // Wire Modal Buttons
    const closeBtn = document.getElementById('closePublicDatasetModalBtn');
    if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };

    const zipBtn = document.getElementById('publicDatasetDownloadZipBtn');
    if (zipBtn) {
      zipBtn.onclick = async () => {
        try {
          this.showToast('YOLOv8 ZIP paketi hazırlanıyor...', 'info');
          const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
          const headers = { 'Content-Type': 'application/json' };
          if (token) headers['Authorization'] = `Bearer ${token}`;

          const expRes = await fetch('/api/projects/export-zip', {
            method: 'POST',
            headers,
            body: JSON.stringify({ category: p.id, train_ratio: 0.8 })
          });
          const expData = await expRes.json();
          if (expRes.ok && expData.download_url) {
            window.location.href = expData.download_url;
            this.showToast('Veri seti ZIP indirme işlemi başladı!', 'success');
          } else {
            throw new Error(expData.detail || 'Dışa aktarma başarısız oldu.');
          }
        } catch (err) {
          this.showToast(err.message || 'ZIP indirilemedi.', 'error');
        }
      };
    }

    const forkBtn = document.getElementById('publicDatasetForkBtn');
    if (forkBtn) {
      if (isAdmin) {
        forkBtn.style.display = 'none'; // Admin inspect modunda fork yerine sadece inceleme
      } else {
        forkBtn.style.display = 'inline-flex';
        forkBtn.onclick = async () => {
          const userToken = localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
          if (!userToken) {
            this.showToast('Projeyi klonlamak için lütfen önce giriş yapınız.', 'error');
            this.showAuth('login');
            return;
          }

          try {
            forkBtn.disabled = true;
            forkBtn.innerHTML = '<span>Klonlanıyor...</span>';
            const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` };
            const fRes = await fetch('/api/projects/fork', {
              method: 'POST',
              headers,
              body: JSON.stringify({ source_project_id: p.id })
            });
            const fData = await fRes.json();
            if (!fRes.ok) throw new Error(fData.detail || 'Klonlama başarısız oldu.');

            this.showToast(fData.message || 'Proje başarıyla çalışma alanınıza klonlandı!', 'success');
            modal.style.display = 'none';
            await this.loadDashboardProjects();
            this.switchWorkspaceTab('projects');
          } catch (fErr) {
            this.showToast(fErr.message || 'Klonlama işlemi sırasında hata oluştu.', 'error');
          } finally {
            forkBtn.disabled = false;
            forkBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="18" cy="18" r="3"></circle><circle cx="6" cy="6" r="3"></circle><path d="M6 21V9a9 9 0 0 0 9 9"></path></svg><span>Çalışma Alanıma Klonla (Fork)</span>`;
          }
        };
      }
    }

    modal.style.display = 'flex';
  } catch (err) {
    this.showToast(err.message || 'Açık proje yüklenirken hata oluştu.', 'error');
  } finally {
    this.showLoading(false);
  }
}

openTemplatePreviewModal(templateId) {
  const modal = document.getElementById('templatePreviewModal');
  if (!modal) return;

  const templates = window._activeExploreTemplates || [];
  const t = templates.find(x => x.id === templateId);
  if (!t) {
    this.showToast('Şablon bilgileri bulunamadı.', 'error');
    return;
  }

  this._activeTemplateToLaunch = t;
  document.getElementById('tplPreviewTitle').textContent = t.title;
  document.getElementById('tplPreviewBadge').textContent = t.badge_title || 'Sektörel Şablon';
  document.getElementById('tplPreviewHint').textContent = t.recommended_model ? `Önerilen Model: ${t.recommended_model}` : 'Önerilen: YOLOv8';
  document.getElementById('tplPreviewDesc').textContent = t.description || '';

  // Render classes
  const classesWrap = document.getElementById('tplPreviewClassesWrap');
  if (classesWrap) {
    classesWrap.innerHTML = (t.classes || []).map(c => `
        <span class="explore-class-pill" style="font-size:0.8rem; padding:4px 10px;">
          <i style="background:${c.color || '#3b82f6'}; width:8px; height:8px; border-radius:50%; display:inline-block;"></i>
          ${this._escapeHtml(c.name)}
        </span>
      `).join('') || '<span style="color:#64748b; font-size:0.8rem;">Sınıf tanımlanmamış.</span>';
  }

  // Render Demo Images with Bounding Box SVG overlays
  const demoCountEl = document.getElementById('tplDemoCount');
  const demoGallery = document.getElementById('tplDemoGallery');
  const demoSamples = t.sample_images || [];
  if (demoCountEl) demoCountEl.textContent = demoSamples.length;

  if (demoGallery) {
    if (demoSamples.length === 0) {
      demoGallery.innerHTML = '<div style="grid-column:1/-1; padding:20px; text-align:center; color:#64748b; font-size:0.82rem;">Bu şablon için henüz demo görsel tanımlanmadı.</div>';
    } else {
      demoGallery.innerHTML = demoSamples.map((sample, sIdx) => {
        const boxes = sample.boxes || [];
        const boxSvgs = boxes.map(b => {
          const bx = (b.x * 100).toFixed(1);
          const by = (b.y * 100).toFixed(1);
          const bw = (b.w * 100).toFixed(1);
          const bh = (b.h * 100).toFixed(1);
          const color = b.color || '#3b82f6';
          return `
              <div style="position:absolute; left:${bx}%; top:${by}%; width:${bw}%; height:${bh}%; border:2px solid ${color}; background:${color}22; pointer-events:none; border-radius:2px;">
                <span style="position:absolute; top:-18px; left:0; background:${color}; color:#fff; font-size:9px; font-weight:700; padding:1px 4px; border-radius:2px; white-space:nowrap;">
                  ${this._escapeHtml(b.class_name)}
                </span>
              </div>
            `;
        }).join('');

        return `
            <div style="background:#020617; border:1px solid rgba(255,255,255,0.1); border-radius:12px; overflow:hidden; display:flex; flex-direction:column;">
              <div style="position:relative; width:100%; aspect-ratio:4/3; background:#090d16; overflow:hidden;">
                <img src="${sample.image_url}" alt="${sample.title}" style="width:100%; height:100%; object-fit:cover;" loading="lazy">
                ${boxSvgs}
              </div>
              <div style="padding:8px 12px; background:rgba(15,23,42,0.9); border-top:1px solid rgba(255,255,255,0.06); display:flex; justify-content:space-between; align-items:center; font-size:0.78rem;">
                <span style="color:#cbd5e1; font-weight:600;">${this._escapeHtml(sample.title || `Demo Görsel #${sIdx + 1}`)}</span>
                <span style="color:#34d399; font-weight:700;">${boxes.length} Etiket</span>
              </div>
            </div>
          `;
      }).join('');
    }
  }

  // Modal Close
  const closeBtn = document.getElementById('closeTemplatePreviewModalBtn');
  if (closeBtn) closeBtn.onclick = () => { modal.style.display = 'none'; };
  const closeTplBtn = document.getElementById('closeTplBtn');
  if (closeTplBtn) closeTplBtn.onclick = () => { modal.style.display = 'none'; };

  // Launch Project Button
  const launchBtn = document.getElementById('launchTplProjectBtn');
  if (launchBtn) {
    launchBtn.onclick = async () => {
      try {
        launchBtn.disabled = true;
        launchBtn.innerHTML = '<span>Proje Hazırlanıyor...</span>';
        const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const includeDemo = document.getElementById('tplIncludeDemoCheckbox')?.checked ?? true;

        const res = await fetch('/api/templates/launch-project', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            template_id: t.id,
            include_demo_data: includeDemo
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Proje oluşturulamadı.');

        modal.style.display = 'none';
        this.showToast(data.message || `'${t.title}' projesi oluşturuldu!`, 'success');
        await this.loadDashboardProjects();
        if (data.project_id) {
          this.openProject(data.project_id, 'dataset');
        }
      } catch (lErr) {
        this.showToast(lErr.message || 'Şablon başlatılırken hata oluştu.', 'error');
      } finally {
        launchBtn.disabled = false;
        launchBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Bu Şablonla Proje Başlat</span>`;
      }
    };
  }

  modal.style.display = 'flex';
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

_applyProjectRoleUI(canManage) {
  const dangerZone = document.getElementById('projectDangerZone');
  const deleteBtn = document.getElementById('hubDeleteProjectBtn') || document.querySelector('.btn-delete-project');
  const manageEls = document.querySelectorAll('.admin-or-manager-only');
  if (dangerZone) dangerZone.style.display = canManage ? 'block' : 'none';
  if (deleteBtn) deleteBtn.style.display = canManage ? 'inline-flex' : 'none';
  manageEls.forEach(el => {
    el.style.display = canManage ? '' : 'none';
  });
}

// =====================================================
// AI AGENT PROMPT, CHAT ROOM & BLUEPRINT ENGINE
// =====================================================
// AI AGENT PROMPT, CHAT ROOM & BLUEPRINT ENGINE
// =====================================================

initCosmicStarsAnimation() {
  const canvas = document.getElementById('agentCosmicCanvas');
  const view = document.getElementById('agentWorkspaceView');
  if (!canvas || !view) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let width = 0;
  let height = 0;
  let dpr = 1;
  let animId = null;
  let stars = [];
  const mouse = { x: -9999, y: -9999, radius: 130, isDown: false };

  // Zarif, sade ve gözü yormayan yumuşak renk paleti
  const starColors = [
    'rgba(255, 255, 255, ',
    'rgba(224, 231, 255, ', // Indigo 100
    'rgba(165, 180, 252, ', // Indigo 300
    'rgba(147, 197, 253, ', // Blue 300
    'rgba(192, 132, 252, '  // Purple 400
  ];

  const resize = () => {
    const parentContainer = document.getElementById('mainWorkspaceContent');
    const scrollH = Math.max(
      view.scrollHeight || 0,
      view.offsetHeight || 0,
      parentContainer ? parentContainer.scrollHeight : 0,
      parentContainer ? parentContainer.offsetHeight : 0,
      window.innerHeight || 0,
      1200
    );
    const scrollW = Math.max(
      view.clientWidth || 0,
      window.innerWidth - 260,
      900
    );
    width = scrollW;
    height = scrollH;
    dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = '100%';
    canvas.style.maxWidth = '100%';
    canvas.style.height = height + 'px';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    initStars();
  };

  const initStars = () => {
    stars = [];
    // Yıldız sayısı (320-440 arası ideal yoğunluk)
    const count = Math.min(440, Math.max(320, Math.floor((width * height) / 2400)));
    for (let i = 0; i < count; i++) {
      const z = Math.random() * 0.75 + 0.25;
      const baseRadius = (Math.random() * 1.5 + 0.7) * z;
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        baseRadius: baseRadius,
        radius: baseRadius,
        vx: 0,
        vy: 0,
        baseSpeedX: (Math.random() - 0.5) * 0.95 * z,
        baseSpeedY: (Math.random() - 0.5) * 0.95 * z,
        colorPrefix: starColors[Math.floor(Math.random() * starColors.length)],
        baseAlpha: Math.random() * 0.40 + 0.40,
        alpha: Math.random() * 0.40 + 0.40,
        pulseSpeed: Math.random() * 0.035 + 0.015,
        pulsePhase: Math.random() * Math.PI * 2,
        z: z
      });
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.clientX - rect.left;
    mouse.y = e.clientY - rect.top;
  };

  const handleMouseLeave = () => {
    mouse.x = -9999;
    mouse.y = -9999;
  };

  const handleClick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    stars.forEach(s => {
      const dx = s.x - cx;
      const dy = s.y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 200 && dist > 0) {
        const force = (1 - dist / 200) * 4;
        s.vx += (dx / dist) * force;
        s.vy += (dy / dist) * force;
      }
    });
  };

  view.removeEventListener('mousemove', handleMouseMove);
  view.removeEventListener('mouseleave', handleMouseLeave);
  view.removeEventListener('click', handleClick);
  window.removeEventListener('resize', resize);

  view.addEventListener('mousemove', handleMouseMove, { passive: true });
  view.addEventListener('mouseleave', handleMouseLeave, { passive: true });
  view.addEventListener('click', handleClick, { passive: true });
  window.addEventListener('resize', resize, { passive: true });

  const parentContainer = document.getElementById('mainWorkspaceContent');
  if (parentContainer) {
    parentContainer.addEventListener('scroll', () => {
      const currentH = Math.max(view.scrollHeight || 0, parentContainer.scrollHeight || 0, 1200);
      if (currentH > height + 80) {
        resize();
      }
    }, { passive: true });
  }

  if (window.ResizeObserver) {
    if (this._cosmicResizeObserver) {
      try { this._cosmicResizeObserver.disconnect(); } catch (e) { }
    }
    this._cosmicResizeObserver = new ResizeObserver(() => {
      const curH = Math.max(view.scrollHeight || 0, 1200);
      if (Math.abs(curH - height) > 80) {
        resize();
      }
    });
    this._cosmicResizeObserver.observe(view);
  }

  resize();

  let time = 0;
  const render = () => {
    const isVisible = view.offsetParent !== null || view.classList.contains('active') || (view.style.display && view.style.display !== 'none');
    if (!document.hidden && isVisible) {
      if (width < 100 || stars.length === 0) {
        resize();
      }
      time += 0.035;
      ctx.clearRect(0, 0, width, height);

      const starCount = stars.length;

      // 1. Zarif ve seyrek takımyıldız çizgileri (bağlar azaltıldı, 70px)
      ctx.lineWidth = 0.65;
      for (let i = 0; i < starCount; i++) {
        const s1 = stars[i];
        for (let j = i + 1; j < starCount; j++) {
          const s2 = stars[j];
          const dx = s1.x - s2.x;
          const dy = s1.y - s2.y;
          const distSq = dx * dx + dy * dy;
          if (distSq < 4900) { // 70px mesafe sınırı
            const dist = Math.sqrt(distSq);
            const lineAlpha = (1 - dist / 70) * 0.16 * s1.z * s2.z;
            ctx.beginPath();
            ctx.strokeStyle = `rgba(165, 180, 252, ${lineAlpha})`;
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            ctx.stroke();
          }
        }
      }

      // 2. Yıldızları hareket ettir, fare ile sadece itme/uzaklaştırma uygula
      for (let i = 0; i < starCount; i++) {
        const s = stars[i];

        // Fare imleci yıldızları yumuşak ve akıcı biçimde uzağa itsin
        if (mouse.x > 0 && mouse.y > 0) {
          const mdx = s.x - mouse.x;
          const mdy = s.y - mouse.y;
          const mDist = Math.sqrt(mdx * mdx + mdy * mdy);

          if (mDist < mouse.radius && mDist > 0) {
            const angle = Math.atan2(mdy, mdx);
            const force = (1 - mDist / mouse.radius) * 2.8;
            s.vx += Math.cos(angle) * force;
            s.vy += Math.sin(angle) * force;
          }
        }

        s.vx *= 0.94;
        s.vy *= 0.94;

        s.x += s.vx + s.baseSpeedX + (Math.sin(time * 0.8 + s.pulsePhase) * 0.35 * s.z);
        s.y += s.vy + s.baseSpeedY + (Math.cos(time * 0.8 + s.pulsePhase) * 0.35 * s.z);

        if (s.x < -15) s.x = width + 15;
        else if (s.x > width + 15) s.x = -15;
        if (s.y < -15) s.y = height + 15;
        else if (s.y > height + 15) s.y = -15;

        const currentAlpha = Math.max(0.20, Math.min(0.92, s.baseAlpha + Math.sin(time * s.pulseSpeed * 20 + s.pulsePhase) * 0.25));

        // Yıldız çekirdeği
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = s.colorPrefix + currentAlpha + ')';
        ctx.fill();

        // Parlak yıldızlar için ince zarif ışıltı
        if (s.radius > 1.1) {
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.radius * 2.0, 0, Math.PI * 2);
          ctx.fillStyle = s.colorPrefix + (currentAlpha * 0.18) + ')';
          ctx.fill();
        }
      }
    }
    animId = requestAnimationFrame(render);
  };

  if (this._cosmicAnimId) {
    cancelAnimationFrame(this._cosmicAnimId);
  }
  animId = requestAnimationFrame(render);
  this._cosmicAnimId = animId;
}

initAgentChat() {
  this.chatMessages = this.chatMessages || [];
  this.currentChatAttachment = null;
  this.activeAgentSessionId = this.activeAgentSessionId || ('session_' + Date.now());

  if (this._agentChatInitialized) {
    this.loadAgentChatHistory();
    return;
  }
  this._agentChatInitialized = true;

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

  // Quick Action Pills
  document.querySelectorAll('.quick-action-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const task = pill.dataset.task || pill.dataset.action;
      const taskPrompts = {
        detection: 'Fabrika sahasında veya şantiyede nesne tespiti için YOLO veri seti kuralı ve sınıf mimarisi oluştur',
        segmentation: 'Tıbbi görüntülerde veya endüstriyel parçalarda poligon segmentasyon veri seti kuralı oluştur',
        classification: 'Görsellerde kalite kontrol ve kusur analizi için sınıflandırma veri seti mimarisi oluştur',
        keypoint: 'İnsan hareketleri veya ergonomi analizi için iskelet ve anahtar nokta poz kestirimi veri seti hazırla',
        plan: 'Şantiyede baret, reflektif yelek ve iş güvenliği tespiti için veri seti oluştur',
        batch: 'Fabrika bandındaki şişelerin doluluk seviyesi, kapak ve kusur kontrolü tespiti',
        traffic: 'Otoyol araç, kamyon, motosiklet ve yaya tespiti ve hız analizi'
      };
      const pText = taskPrompts[task] || (pill.textContent.trim() + ' için yapay zeka veri seti mimarisi ve sınıfları hazırla');
      this.startAgentConversation(pText);
    });
  });

  // Example Project Cards
  document.querySelectorAll('.example-proj-card').forEach(card => {
    card.addEventListener('click', () => {
      const tmpl = card.dataset.template;
      const tmplPrompts = {
        bottle: 'İçecek fabrikasında şişe, kapak, sıvı seviyesi ve kırık şişe tespiti için YOLO veri seti mimarisi',
        pcb: 'Elektronik PCB devre kartlarında lehim köprüsü, eksik parça ve kusur tespiti projesi oluştur',
        traffic: 'Trafik kavşağında otomobil, kamyonet, otobüs, motosiklet ve yaya yoğunluğu analizi için veri seti mimarisi'
      };
      const pText = tmplPrompts[tmpl] || `${card.querySelector('h4')?.textContent || 'Örnek Proje'} için yapay zeka veri seti planı`;
      this.startAgentConversation(pText);
    });
  });

  document.getElementById('agentSeeAllExamplesBtn')?.addEventListener('click', () => {
    this.switchWorkspaceTab('explore');
  });

  // Bind In-Chat Input Submission
  const sendChatMessage = () => {
    const chatInput = document.getElementById('agentChatInput');
    const text = chatInput?.value.trim();
    const attachment = this.currentChatAttachment;

    if (!text && !attachment) return;

    chatInput.value = '';
    chatInput.style.height = 'auto';
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

  const heroList = document.getElementById('agentHeroHistoryList');
  const heroCount = document.getElementById('agentHeroHistoryCount');
  const drawerList = document.getElementById('agentHistoryList');

  // If we already have cached sessions, render them immediately to eliminate any blank gap
  if (this._cachedAgentSessions && this._cachedAgentSessions.length > 0) {
    this._renderAgentHistoryUI(this._cachedAgentSessions);
  } else {
    // If elements are completely empty or still show static text, inject animated skeletons
    const skeletonHtml = `
      <div class="agent-history-skeleton-item"><div class="agent-history-skeleton-line long"></div><div class="agent-history-skeleton-line short"></div></div>
      <div class="agent-history-skeleton-item"><div class="agent-history-skeleton-line long" style="width:65%;"></div><div class="agent-history-skeleton-line short" style="width:40%;"></div></div>
      <div class="agent-history-skeleton-item"><div class="agent-history-skeleton-line long" style="width:75%;"></div><div class="agent-history-skeleton-line short" style="width:35%;"></div></div>
    `;
    if (heroList && (!heroList.children.length || heroList.textContent.includes('Henüz kayıtlı'))) {
      heroList.innerHTML = skeletonHtml;
    }
    if (drawerList && (!drawerList.children.length || drawerList.textContent.includes('Henüz geçmiş'))) {
      drawerList.innerHTML = skeletonHtml;
    }
  }

  try {
    const res = await fetch('/api/agent/history', { headers });
    const data = await res.json();
    const sessions = data.sessions || [];
    this._cachedAgentSessions = sessions;
    this._renderAgentHistoryUI(sessions);
  } catch (e) {
    console.error('Error loading AI history:', e);
    if (!this._cachedAgentSessions) {
      if (heroList) heroList.innerHTML = `<div style="padding:16px; text-align:center; color:#64748b; font-size:0.85rem;">Geçmiş sohbetler yüklenemedi.</div>`;
      if (drawerList) drawerList.innerHTML = `<div style="padding:12px; text-align:center; color:#64748b; font-size:0.82rem;">Geçmiş sohbetler yüklenemedi.</div>`;
    }
  }
}

_renderAgentHistoryUI(sessions) {
  const heroList = document.getElementById('agentHeroHistoryList');
  const heroCount = document.getElementById('agentHeroHistoryCount');
  const drawerList = document.getElementById('agentHistoryList');

  if (heroCount) heroCount.textContent = `${sessions.length} Sohbet Kayıtlı`;

  // 1. Update Hero History List
  if (heroList) {
    if (sessions.length === 0) {
      heroList.innerHTML = `<div style="padding:16px; text-align:center; color:#64748b; font-size:0.85rem;">Henüz kayıtlı sohbet geçmişiniz bulunmuyor.</div>`;
    } else {
      heroList.innerHTML = sessions.map(s => {
        const dateStr = s.updated_at ? new Date(s.updated_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        const isAct = s.id === this.activeAgentSessionId;
        return `
            <div class="agent-history-item ${isAct ? 'active' : ''}" data-session-id="${s.id}" style="margin-bottom:6px;">
              <div class="agent-history-item-content">
                <div class="agent-history-item-title" title="${this._escapeHtml(s.title)}">${this._escapeHtml(s.title)}</div>
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
  if (drawerList) {
    if (sessions.length === 0) {
      drawerList.innerHTML = `<div style="padding:12px; text-align:center; color:#64748b; font-size:0.82rem;">Henüz geçmiş sohbet yok.</div>`;
    } else {
      drawerList.innerHTML = sessions.map(s => {
        const isAct = s.id === this.activeAgentSessionId;
        const dateStr = s.updated_at ? new Date(s.updated_at).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
        return `
            <div class="agent-history-item ${isAct ? 'active' : ''}" data-session-id="${s.id}">
              <div class="agent-history-item-content">
                <div class="agent-history-item-title" title="${this._escapeHtml(s.title)}">${this._escapeHtml(s.title)}</div>
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
}

async openAgentSession(sessionId) {
  if (this._agentAbortController) {
    try { this._agentAbortController.abort(); } catch (e) { }
    this._agentAbortController = null;
  }
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
    const view = document.getElementById('agentWorkspaceView');
    const mainContent = document.getElementById('mainWorkspaceContent');

    if (view) view.classList.add('in-chat-mode');
    if (mainContent) mainContent.scrollTop = 0;
    if (hero) hero.style.display = 'none';
    if (chat) {
      chat.style.display = 'flex';
    }

    // Ensure history sidebar is visible when resuming an existing conversation
    const sidebar = document.getElementById('agentChatHistorySidebar');
    if (sidebar) sidebar.classList.remove('collapsed');

    // Restore send/stop buttons if an aborted query left stop visible
    const sendBtn = document.getElementById('agentChatSendBtn');
    const stopBtn = document.getElementById('agentChatStopBtn');
    if (sendBtn) sendBtn.style.display = 'flex';
    if (stopBtn) stopBtn.style.display = 'none';

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
                  <button class="btn-primary btn-sm chat-launch-blueprint-btn" style="display:inline-flex; align-items:center; gap:8px;" onclick="(window.editorApp || window._yoloEditor)?.createProjectFromBlueprint(this)">
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
  if (this.activeAgentSessionId === sessionId && this._agentAbortController) {
    try { this._agentAbortController.abort(); } catch (e) { }
    this._agentAbortController = null;
  }
  const token = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || localStorage.getItem('yolo_auth_token') || '';
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  // Optimistically remove session from UI immediately for lightning-fast feedback
  document.querySelectorAll(`.agent-history-item[data-session-id="${sessionId}"]`).forEach(el => el.remove());

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
    this.loadAgentChatHistory();
  }
}

resetAgentToHero() {
  if (this._agentAbortController) {
    try { this._agentAbortController.abort(); } catch (e) { }
    this._agentAbortController = null;
  }
  const hero = document.getElementById('agentHeroContainer');
  const chat = document.getElementById('agentChatContainer');
  const view = document.getElementById('agentWorkspaceView');
  if (view) view.classList.remove('in-chat-mode');
  if (hero) hero.style.display = 'block';
  if (chat) chat.style.display = 'none';
  this.chatMessages = [];
  this.currentChatAttachment = null;
  this.activeAgentSessionId = 'session_' + Date.now();
  const container = document.getElementById('agentChatMessages');
  if (container) container.innerHTML = '';
  const sendBtn = document.getElementById('agentChatSendBtn');
  const stopBtn = document.getElementById('agentChatStopBtn');
  if (sendBtn) sendBtn.style.display = 'flex';
  if (stopBtn) stopBtn.style.display = 'none';
  this.loadAgentChatHistory();
}

startAgentConversation(initialPrompt) {
  if (this._agentAbortController) {
    try { this._agentAbortController.abort(); } catch (e) { }
    this._agentAbortController = null;
  }
  this.activeAgentSessionId = 'session_' + Date.now();
  const hero = document.getElementById('agentHeroContainer');
  const chat = document.getElementById('agentChatContainer');
  const view = document.getElementById('agentWorkspaceView');
  const mainContent = document.getElementById('mainWorkspaceContent');

  if (view) view.classList.add('in-chat-mode');
  if (mainContent) mainContent.scrollTop = 0;
  if (hero) hero.style.display = 'none';
  if (chat) {
    chat.style.display = 'flex';
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

  // Track which session initiated this request
  const targetSessionId = this.activeAgentSessionId;

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
      session_id: targetSessionId
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

    // If user navigated away to another chat session while this request was running, do NOT touch DOM
    if (this.activeAgentSessionId !== targetSessionId) {
      this.loadAgentChatHistory();
      return;
    }

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

      const launchBtnId = 'chatLaunchProjectBtn_' + Date.now();
      const replyHtml = `
          <div>
            <p style="margin-bottom:12px; font-weight:600; color:#f8fafc;">İsteğinizi analiz ettim ve projeniz için uygun veri seti mimarisini hazırladım:</p>
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
              <button class="btn-primary btn-sm chat-launch-blueprint-btn" id="${launchBtnId}" style="display:inline-flex; align-items:center; gap:8px;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>Bu Projeyi Şimdi Oluştur & Başlat</span>
              </button>
            </div>
            <p style="font-size:0.82rem; color:#94a3b8; margin-top:8px;">Başka bir sınıf eklememi veya farklı bir veri türü planlamamı ister misiniz?</p>
          </div>
        `;

      this.appendChatMessage('assistant', replyHtml, true);
      const launchBtnEl = document.getElementById(launchBtnId);
      launchBtnEl?.addEventListener('click', () => {
        this.currentBlueprint = bp;
        this.createProjectFromBlueprint(launchBtnEl);
      });

    } else {
      this.appendChatMessage('assistant', data.message || 'Üzgünüm, isteğinizi anlayamadım. Size nasıl yardımcı olabilirim?');
    }

    this.loadAgentChatHistory();
  } catch (e) {
    document.getElementById(typingId)?.remove();
    if (this.activeAgentSessionId !== targetSessionId) return;
    if (e.name === 'AbortError') {
      this.appendChatMessage('assistant', '<em style="color:#94a3b8;">Yanıt durduruldu.</em>', true);
    } else {
      this.appendChatMessage('assistant', 'Bağlantı hatası oluştu. Lütfen ağ bağlantınızı kontrol edin.');
    }
  } finally {
    // Restore send/stop buttons if still on the same target session
    if (this.activeAgentSessionId === targetSessionId) {
      if (sendBtn) sendBtn.style.display = 'flex';
      if (stopBtn) stopBtn.style.display = 'none';
    }
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
      }).catch(() => { });
    });
  }

  messagesContainer.appendChild(msgEl);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

  async handleAgentPrompt(promptText) {
  this.startAgentConversation(promptText);
}

  async createProjectFromBlueprint(triggerBtn = null) {
  if (!this.currentBlueprint) {
    this.showToast('Oluşturulacak proje taslağı bulunamadı.', 'warning');
    return;
  }
  const bp = this.currentBlueprint;
  const btn = triggerBtn || document.querySelector('.chat-launch-blueprint-btn') || document.getElementById('blueprintLaunchBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Oluşturuluyor...'; }

  try {
    const res = await fetch('/api/projects/create', {
      method: 'POST',
      headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        folder_name: bp.folder,
        display_name: bp.name,
        description: bp.description,
        classes: bp.classes,
        visibility: 'private',
        license: 'CC BY 4.0',
        project_type: bp.type || 'detection',
        workspace_id: this.activeWorkspaceId || localStorage.getItem('activeWorkspaceId') || null
      })
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.status === 'ok') {
      this.showToast(`'${bp.name}' projesi başarıyla oluşturuldu.`, 'success');
      await this.fetchProjects();
      const createdId = data.project_id || bp.folder;
      await this.openProject(createdId, 'upload');

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
    const activeWs = this.activeWorkspaceId || (this.userWorkspaces && this.userWorkspaces[0] ? this.userWorkspaces[0].id : null);
    const query = new URLSearchParams({
      filter_status: status,
      search: search,
      ...(activeWs ? { workspace_id: activeWs } : {}),
      ...(proj ? { category: proj } : {})
    });
    const res = await fetch(`/api/workspace/assets?${query.toString()}`, {
      headers: this.getAuthHeaders()
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
    try {
      const url = new URL(window.location);
      url.searchParams.set('create', '1');
      window.history.pushState({ view: 'create_project' }, '', url.pathname + '?' + url.searchParams.toString());
    } catch (_) { }
  }
  this.hideAllViews();
  if (this.createProjectView) {
    this.createProjectView.style.display = 'flex';
    this.createProjectView.classList.add('active');
  }

  const wsNameEl = document.getElementById('createProjWsName');
  if (wsNameEl) {
    wsNameEl.textContent = this.activeWorkspace?.name || 'Varsayılan Çalışma Alanı';
  }


  // Esc tuşu ile çıkış desteği
  if (!this._hasCreateEscListener) {
    this._hasCreateEscListener = true;
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.createProjectView && this.createProjectView.style.display === 'flex') {
        this.closeProjectToWorkspace(true);
      }
    });
  }

  // Reset inputs
  const nameInput = document.getElementById('fullNewProjName');
  if (nameInput) {
    nameInput.value = '';
    setTimeout(() => nameInput.focus(), 150);
  }
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
  const cat = this.activeHubProjectId;
  this.isLoadingHubData = true;
  this.showProjectLoading();

  try {
    const headers = this.getAuthHeaders();
    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const tokenQuery = token ? `&token=${encodeURIComponent(token)}` : '';

    const bust = `&_t=${Date.now()}`;
    const res = await fetch(`/api/project-settings?category=${encodeURIComponent(this.activeHubProjectId)}${tokenQuery}${bust}`, { headers, cache: 'no-store' });
    const data = await res.json();
    this.currentHubMeta = data;
    // Projedeki rol ve yönetim yetkisi (backend'den gelir)
    this.currentProjectCanManage = data.can_manage === true;
    this.currentProjectRole = data.project_role || 'member';

    // Member için hassas UI öğelerini gizle
    if (typeof this._applyProjectRoleUI === 'function') {
      this._applyProjectRoleUI(this.currentProjectCanManage);
    }

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

    // Fetch full image list (cache-busted so delete/upload changes appear immediately)
    const imgRes = await fetch(`/api/images?category=${encodeURIComponent(this.activeHubProjectId)}${tokenQuery}&_t=${Date.now()}`, { headers, cache: 'no-store' });
    const imgData = await imgRes.json();
    this.currentHubImages = imgData.images || [];
    this._lastImageFetchCat = cat; // openBatchReview cache kontrolü için senkronize et

    // Ensure live accurate badge counts from fetched image list (including 0 when all batches deleted)
    if (Array.isArray(this.currentHubImages)) {
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

    // Yükleme sekmesi rol yetki bildirimi ve görünürlük kontrolü
    const userRole = (this.currentUser?.role || 'admin').toLowerCase();
    const uploadNotice = document.getElementById('hubUploadRoleNotice');
    const scraperCard = document.getElementById('srcCardScraper');
    const videoCard = document.getElementById('srcCardVideo');
    if (uploadNotice) {
      if (userRole === 'annotator') {
        uploadNotice.textContent = '👤 Etiketleyici Modu · Yalnızca Tekil/Grup Dosya Yükleme';
        uploadNotice.style.background = 'rgba(168,85,247,0.1)';
        uploadNotice.style.color = '#c084fc';
        uploadNotice.style.borderColor = 'rgba(168,85,247,0.25)';
        if (scraperCard) scraperCard.style.display = 'none'; // Annotator web kazıma yapamaz
        if (videoCard) videoCard.style.display = 'none'; // Annotator video parçalayamaz
      } else {
        uploadNotice.textContent = '🛡️ Yönetici Modu · Tam Yetkili Veri Aktarımı';
        uploadNotice.style.background = 'rgba(56,189,248,0.1)';
        uploadNotice.style.color = '#38bdf8';
        uploadNotice.style.borderColor = 'rgba(56,189,248,0.25)';
        if (scraperCard) scraperCard.style.display = 'block';
        if (videoCard) videoCard.style.display = 'block';
      }
    }

    this.renderAnnotateKanban();
    this.renderDatasetGallery();
    this.updateExportSummary();
    this.checkRunningBatchStatus(cat);

    // Arka planda sessiz kopya tarama önbelleği (force=false: kullanıcıyı bloke etmeden varsa veya ilk açılışta önbelleğe al)
    if (!this.cachedDuplicateData) this.cachedDuplicateData = {};
    if (!this.cachedDuplicateData[cat]) {
      fetch(`/api/projects/scan-duplicates?category=${encodeURIComponent(cat)}`, {
        headers: this.getAuthHeaders ? this.getAuthHeaders() : {}
      }).then(r => r.ok ? r.json() : null).then(dupRes => {
        if (dupRes && dupRes.duplicate_groups) {
          this.cachedDuplicateData[cat] = dupRes;
          // Eğer kullanıcı hala aynı projede ise Kanban ve Dataset'i rozetlerle güncelle
          if (this.activeHubProjectId === cat) {
            this.renderAnnotateKanban();
            this.renderDatasetGallery();
          }
        }
      }).catch(() => {});
    }
  } catch (err) {
    console.error('Error loading hub project data:', err);
  } finally {
    this.isLoadingHubData = false;
    this.hideProjectLoading();
  }
}

  }

  // Metotlari ve getter/setter'lari DatasetEditor.prototype'a kopyala
  const proto = _ExploreAgentExtension.prototype;
  const descriptors = Object.getOwnPropertyDescriptors(proto);
  for (const name of Object.keys(descriptors)) {
    if (name !== 'constructor') {
      Object.defineProperty(DatasetEditor.prototype, name, descriptors[name]);
    }
  }

  // Eger sayfa zaten yuklendiyse ve agent gorunumu aktifse aninda baslat
  setTimeout(() => {
    if (window.editorApp) {
      if (typeof window.editorApp.initCosmicStarsAnimation === 'function') {
        window.editorApp.initCosmicStarsAnimation();
      }
      if (typeof window.editorApp.initAgentChat === 'function') {
        window.editorApp.initAgentChat();
      }
    }
  }, 250);
})(window.DatasetEditor);
