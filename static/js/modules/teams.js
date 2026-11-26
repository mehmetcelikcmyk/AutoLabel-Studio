/**
 * AutoLabel Studio - Teams & Collaboration Module
 */

function installTeamsModule(DatasetEditor) {
  const proto = DatasetEditor.prototype;

  // OWASP XSS Koruması: Kullanıcı kaynaklı tüm dinamik verileri sanitize eder
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Email-first takım kaptanlığı doğrulama. captain alanı DAIMA email içeriyor.
  // Username / displayName fallback: eski kayıtlar için backward-compat.
  proto.isUserCaptainOfTeam = function(team) {
    if (!team) return false;
    const curEmail = (this.currentUser?.email || '').toLowerCase().trim();
    const curUsername = (this.currentUser?.username || curEmail.split('@')[0] || '').toLowerCase().trim();
    const cap = (team.captain || '').toLowerCase().trim();

    // 1. Birincil: captain alanı email ile eşleşmesi (yeni format)
    if (cap && curEmail && cap === curEmail) return true;

    // 2. Fallback: captain alanı username veya display_name ile saklanmış (eski kayıtlar)
    if (cap && curUsername && cap === curUsername) return true;

    // 3. Üye kaydında role=captain veya role=owner
    const myMemberRecord = (team.members || []).find(m => {
      const mEmail = (m.email || '').toLowerCase().trim();
      const mUser = (m.username || '').toLowerCase().trim();
      return (mEmail && curEmail && mEmail === curEmail) ||
             (mUser && curUsername && mUser === curUsername);
    });
    return !!(myMemberRecord && (myMemberRecord.role === 'captain' || myMemberRecord.role === 'owner'));
  };

  // Takımda denetçi (reviewer) veya kaptan olup olmadığını kontrol eder
  proto.isUserReviewerOfTeam = function(team) {
    if (!team) return false;
    if (this.isUserCaptainOfTeam(team)) return true;
    const curEmail = (this.currentUser?.email || '').toLowerCase().trim();
    const curUsername = (this.currentUser?.username || curEmail.split('@')[0] || '').toLowerCase().trim();
    const myMemberRecord = (team.members || []).find(m => {
      const mEmail = (m.email || '').toLowerCase().trim();
      const mUser = (m.username || '').toLowerCase().trim();
      return (mEmail && curEmail && mEmail === curEmail) ||
             (mUser && curUsername && mUser === curUsername);
    });
    return !!(myMemberRecord && myMemberRecord.role === 'reviewer');
  };

  proto.getEffectiveCategory = function(explicitCat) {
    if (explicitCat && explicitCat !== 'accessory_detection_project') return explicitCat;
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlProj = urlParams.get('project') || urlParams.get('category');
      if (urlProj && urlProj !== 'accessory_detection_project') return urlProj;
    } catch (e) {}
    if (this.isProjectContext) {
      if (this.currentCategory && this.currentCategory !== 'accessory_detection_project') return this.currentCategory;
      if (this.activeHubProjectId && this.activeHubProjectId !== 'accessory_detection_project') return this.activeHubProjectId;
    }
    return '';
  };

  proto.loadTeamSyncHub = async function() {
  const cat = this.getEffectiveCategory();
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
    const [tRes, pRes] = await Promise.all([
      fetch(`/api/teams/list${wsParam}`, { headers: this.getAuthHeaders() }),
      (!this.projectsList || this.projectsList.length === 0) ? fetch(`/api/projects${wsParam}`, { headers: this.getAuthHeaders() }) : Promise.resolve(null)
    ]);
    const tData = await tRes.json();
    this.cachedTeams = tData.teams || [];
    const myInvites = tData.my_invitations || [];

    if (pRes && pRes.ok) {
      try {
        const pData = await pRes.json();
        this.projectsList = pData.projects || [];
      } catch (e) {}
    }

    // ─── BEKLEYEN DAVETLER BÖLÜMÜ (Henüz kabul edilmemiş takımlar) ───────────
    const invContainer = document.getElementById('teamInvitationsContainer');
    if (invContainer) {
      if (myInvites.length === 0) {
        invContainer.style.display = 'none';
        invContainer.innerHTML = '';
      } else {
        invContainer.style.display = 'block';
        invContainer.innerHTML = `
          <div style="background:linear-gradient(135deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98)); border:1px solid rgba(56, 189, 248, 0.35); border-radius:14px; padding:18px 20px; box-shadow:0 10px 25px rgba(0,0,0,0.5), 0 0 20px rgba(56,189,248,0.1); animation:fadeIn 0.25s ease;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:1.15rem;">📩</span>
                <h4 style="color:#f8fafc; font-size:0.96rem; font-weight:800; margin:0; letter-spacing:-0.01em;">
                  Bekleyen Takım Davetleriniz <span style="background:rgba(56,189,248,0.18); color:#38bdf8; font-size:0.75rem; font-weight:700; padding:2px 8px; border-radius:10px; margin-left:4px;">${myInvites.length}</span>
                </h4>
              </div>
              <span style="font-size:0.75rem; color:#94a3b8;">Takıma katılabilmek için daveti onaylamanız gerekmektedir</span>
            </div>

            <div style="display:flex; flex-direction:column; gap:10px;">
              ${myInvites.map(inv => {
                const safeTName = escapeHtml(inv.team_name);
                const safeInvitedBy = escapeHtml(inv.invited_by || inv.captain || 'Yönetici');
                const safeRole = escapeHtml(inv.role || 'annotator');
                const safeExpiresAt = escapeHtml(inv.expires_at || '7 Gün');
                const roleLabels = {
                  captain: 'Kaptan Yardımcısı',
                  reviewer: 'Denetçi (QA)',
                  annotator: 'Etiketleyici'
                };
                const roleBadgeTxt = roleLabels[safeRole] || safeRole;

                return `
                  <div style="background:rgba(11,17,32,0.7); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
                    <div>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <strong style="color:#f8fafc; font-size:0.92rem;">${safeTName}</strong>
                        <span style="background:rgba(56,189,248,0.12); color:#38bdf8; border:1px solid rgba(56,189,248,0.25); font-size:0.7rem; font-weight:700; padding:2px 8px; border-radius:5px;">
                          ${roleBadgeTxt}
                        </span>
                      </div>
                      <div style="font-size:0.75rem; color:#94a3b8; margin-top:4px;">
                        Davet Eden: <span style="color:#cbd5e1; font-weight:600;">@${safeInvitedBy}</span> • Son Geçerlilik: <span style="color:#fbbf24;">${safeExpiresAt}</span>
                      </div>
                    </div>

                    <div style="display:flex; align-items:center; gap:8px;">
                      <button type="button" class="accept-my-invite-btn" data-token="${escapeHtml(inv.token)}" style="background:linear-gradient(135deg,#059669,#10b981); color:#ffffff; font-size:0.78rem; font-weight:700; padding:7px 16px; border:none; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(16,185,129,0.3);">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                        <span>Daveti Kabul Et</span>
                      </button>
                      <button type="button" class="decline-my-invite-btn" data-token="${escapeHtml(inv.token)}" style="background:transparent; color:#94a3b8; font-size:0.75rem; font-weight:600; padding:6px 12px; border:1px solid rgba(255,255,255,0.12); border-radius:8px; cursor:pointer;">
                        Reddet
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }
    }

    const cardsGrid = document.getElementById('teamsCardsGrid');
    const teamListView = document.getElementById('teamListView');
    const teamDetailView = document.getElementById('teamDetailView');
    const teamDetailTitle = document.getElementById('teamDetailTitle');

    if (cardsGrid) {
      if (this.cachedTeams.length === 0) {
        this.selectedTeamId = null;
        if (teamDetailView) teamDetailView.style.display = 'none';
        if (teamListView) teamListView.style.display = 'block';
        cardsGrid.innerHTML = `
          <div style="grid-column:1/-1; background:#0f172a; border:1px dashed rgba(255,255,255,0.12); border-radius:14px; padding:40px 20px; text-align:center;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5" style="margin-bottom:12px; display:inline-block;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            <h4 style="color:#f1f5f9; font-size:1rem; margin-bottom:6px;">Henüz Takım Bulunmuyor</h4>
            <p style="color:#64748b; font-size:0.8rem; margin:0 0 16px 0;">Çalışma alanınızda işbirliği yapmak ve görev dağıtmak için bir takım oluşturun.</p>
            <button class="btn-primary btn-sm" onclick="document.getElementById('createTeamBtn').click()">+ İlk Takımı Oluştur</button>
          </div>
        `;
      } else {
        cardsGrid.innerHTML = this.cachedTeams.map(t => {
          const memberCount = (t.members || []).length;
          const projs = t.projects || [];
          const isSelected = t.id === this.selectedTeamId;
          const captainName = t.captain || 'admin';
          const safeName = escapeHtml(t.name);
          const safeCaptain = escapeHtml(captainName);
          const projTags = projs.length > 0
            ? projs.map(p => `<span class="team-card-proj-pill">${escapeHtml(p)}</span>`).join('')
            : '<span style="color:#64748b; font-size:0.72rem;">Bağlı proje yok</span>';

          return `
            <div class="team-card" data-team-id="${escapeHtml(t.id)}" style="${isSelected ? 'border-color:rgba(56,189,248,0.5); background:rgba(15,23,42,0.9);' : ''}">
              <div>
                <div class="team-card-header">
                  <div class="team-card-avatar">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                  </div>
                  <div style="flex:1; min-width:0;">
                    <h4 class="team-card-title">${safeName}</h4>
                    <div class="team-card-meta">
                      <span>👑 ${safeCaptain}</span>
                      <span>•</span>
                      <span>${memberCount} Üye</span>
                    </div>
                  </div>
                </div>

                <div class="team-card-body">
                  <div class="team-card-stats">
                    <div class="team-stat-item">
                      <span class="team-stat-label">Personel</span>
                      <span class="team-stat-val">${memberCount}</span>
                    </div>
                    <div class="team-stat-item">
                      <span class="team-stat-label">Projeler</span>
                      <span class="team-stat-val">${projs.length}</span>
                    </div>
                  </div>

                  <div style="font-size:0.72rem; color:#94a3b8; font-weight:600; margin-bottom:6px; text-transform:uppercase;">Erişilebilen Projeler</div>
                  <div class="team-card-projects">
                    ${projTags}
                  </div>
                </div>
              </div>

              <div class="team-card-footer">
                <span style="font-size:0.74rem; color:#64748b;">${escapeHtml(t.created_at || 'Aktif')}</span>
                <button class="btn-team-detail" data-team-id="${t.id}">
                  <span>Detayları Yönet</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </button>
              </div>
            </div>
          `;
        }).join('');

        // Delegate Click on Team Cards to open Detail View
        cardsGrid.querySelectorAll('.btn-team-detail, .team-card').forEach(el => {
          el.addEventListener('click', (e) => {
            const teamId = el.dataset.teamId;
            if (teamId) {
              this.selectedTeamId = teamId;
              if (teamListView) teamListView.style.display = 'none';
              if (teamDetailView) teamDetailView.style.display = 'block';
              this.loadTeamSyncHub();
            }
          });
        });
      }
    }

    if (teamSelect && this.cachedTeams.length > 0) {
      // Aktif projeye atanmış takımı öncelikle bul
      const projAssignedTeam = cat ? this.cachedTeams.find(t => Array.isArray(t.projects) && t.projects.includes(cat)) : null;

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

      if (teamDetailTitle) {
        teamDetailTitle.textContent = activeTeam.name;
      }

      if (captainBadge) {
        captainBadge.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> <span>Takım Kaptanı: <strong style="color:#f8fafc;">${this._escapeHtml(activeTeam.captain || 'admin')}</strong></span>`;
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

      // Yetki Kontrolü: YALNIZCA o takımın Kaptanı üye davet edebilir, davet listesini görebilir ve yönetebilir!
      // Sistem yöneticisi dahi olsa, takım üyesi ise takım içerisindeki resmi rolüne tabidir.
      const isCaptain = this.isUserCaptainOfTeam(activeTeam);
      const curEmail = (this.currentUser?.email || '').toLowerCase().trim();
      const curUsername = (this.currentUser?.username || this.currentUser?.display_name || '').toLowerCase().trim();
      const myMemberRecord = (activeTeam.members || []).find(m => {
        const mEmail = (m.email || '').toLowerCase().trim();
        const mUser = (m.username || '').toLowerCase().trim();
        return (curEmail && mEmail === curEmail) || (curUsername && mUser === curUsername) || (curEmail && mUser === curEmail);
      });
      const isMember = !!myMemberRecord;
      const memberRole = myMemberRecord ? myMemberRecord.role : null;
      const isReviewer = memberRole === 'reviewer' || this.isUserReviewerOfTeam(activeTeam);
      const isAnnotator = memberRole === 'annotator';
      const isSystemAdmin = (this.currentUser?.role === 'admin' || this.currentUser?.role === 'super_admin');

      const isCaptainOnly = isCaptain;
      // Takımı Sil: Yalnızca kaptan silebilir, sistem yöneticisi normal ekrandan başkasının takımını silemez
      const canDeleteTeam = isCaptain;
      // Görev dağıtımı ve onay: Etiketleyici kullanıcı sistem admini dahi olsa görev dağıtımını görmemeli, sadece Atanan Görevlerim'i görmeli
      const canReviewOrDispatch = isCaptain || isReviewer || (isSystemAdmin && !isMember);

      if (captainBadge) {
        let userStatusBadge = '';
        if (isCaptain) {
          userStatusBadge = `<span style="margin-left:10px; background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.35); font-size:0.72rem; padding:3px 9px; border-radius:20px; font-weight:700;">👑 Takım Kaptanısınız</span>`;
        } else if (isReviewer) {
          userStatusBadge = `<span style="margin-left:10px; background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.35); font-size:0.72rem; padding:3px 9px; border-radius:20px; font-weight:700;">🔍 Denetçisiniz (Reviewer)</span>`;
        } else if (isAnnotator) {
          userStatusBadge = `<span style="margin-left:10px; background:rgba(56,189,248,0.1); color:#38bdf8; border:1px solid rgba(56,189,248,0.25); font-size:0.72rem; padding:3px 9px; border-radius:20px; font-weight:600;">👤 Etiketleyicisiniz (Annotator)</span>`;
        } else if (isSystemAdmin) {
          userStatusBadge = `<span style="margin-left:10px; background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.35); font-size:0.72rem; padding:3px 9px; border-radius:20px; font-weight:700;">🛡️ Süper Yönetici (Gözlemci)</span>`;
        } else {
          userStatusBadge = `<span style="margin-left:10px; background:rgba(148,163,184,0.1); color:#94a3b8; border:1px solid rgba(148,163,184,0.25); font-size:0.72rem; padding:3px 9px; border-radius:20px; font-weight:600;">👤 Etiketleyicisiniz (Annotator)</span>`;
        }
        captainBadge.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg> <span>Takım Kaptanı: <strong style="color:#f8fafc;">${this._escapeHtml(activeTeam.captain || 'admin')}</strong></span> ${userStatusBadge}`;
      }

      // 1. Üye Davet Formu & Sekmeler (Normal üyede tamamen gizlenir)
      const inviteForm = document.getElementById('inviteTeamMemberForm');
      if (inviteForm) {
        inviteForm.style.setProperty('display', isCaptainOnly ? 'flex' : 'none', 'important');
      }

      const tabToggleWrap = document.getElementById('teamMembersTabToggleWrap');
      if (tabToggleWrap) {
        tabToggleWrap.style.setProperty('display', isCaptainOnly ? 'flex' : 'none', 'important');
      }

      const pendingTabBtn = document.getElementById('memberViewPendingBtn');
      const activeTabBtn = document.getElementById('memberViewActiveBtn');
      if (pendingTabBtn) {
        pendingTabBtn.style.display = isCaptainOnly ? 'inline-block' : 'none';
        if (!isCaptainOnly && activeTabBtn) {
          activeTabBtn.click(); // Daima üyeler sekmesinde kal
        }
      }

      // Sol Kart Başlıkları (Normal üye ayrımı)
      const membersCardTitle = document.getElementById('teamMembersCardTitle');
      const membersCardDesc = document.getElementById('teamMembersCardDesc');
      if (membersCardTitle) {
        membersCardTitle.textContent = isCaptainOnly ? 'Takım Üyeleri ve Davetler' : 'Takım Arkadaşlarım';
      }
      if (membersCardDesc) {
        membersCardDesc.textContent = isCaptainOnly ? 'GitHub gibi kullanıcı adı veya e-posta ile davet gönderin' : 'Bu takımda birlikte çalıştığınız üyeler';
      }

      // 2. Proje Erişim Yetkisi Kartı (Normal üyede yetki verme formu gizlenir, başlık bilgilendirici olur)
      const assignProjRow = document.getElementById('assignProjectRow') || document.getElementById('assignProjectToTeamBtn')?.parentElement;
      if (assignProjRow) {
        assignProjRow.style.setProperty('display', isCaptainOnly ? 'flex' : 'none', 'important');
      }

      const projectPermTitle = document.getElementById('teamProjectPermTitle');
      const projectPermDesc = document.getElementById('teamProjectPermDesc');
      if (projectPermTitle) {
        projectPermTitle.textContent = isCaptainOnly ? 'Proje Erişim Yetkisi' : 'Erişilebilen Projeler';
      }
      if (projectPermDesc) {
        projectPermDesc.textContent = isCaptainOnly ? 'Bu takımın erişebileceği veri setlerini yapılandırın.' : 'Takımınızın erişim iznine sahip olduğu projeler.';
      }

      // 3. "Yeni Takım Oluştur" butonu yetkilendirmesi
      const createTeamBtn = document.getElementById('createTeamBtn');
      if (createTeamBtn) {
        createTeamBtn.style.setProperty('display', isCaptainOnly ? 'inline-flex' : 'none', 'important');
      }

      // 3.1 "Takımı Sil" butonu yetkilendirmesi (Yalnızca Takım Kaptanı)
      const deleteCurrentTeamBtn = document.getElementById('deleteCurrentTeamBtn');
      if (deleteCurrentTeamBtn) {
        deleteCurrentTeamBtn.style.setProperty('display', canDeleteTeam ? 'inline-flex' : 'none', 'important');
        deleteCurrentTeamBtn.dataset.team = activeTeam.id;
        deleteCurrentTeamBtn.dataset.name = activeTeam.name;
      }

      // 4. Üst Subnav Sekmeleri: Normal üyeye senkronizasyon gizlenir, Denetçi ve Kaptana onay paneli açılır
      const syncSubnavBtn = document.querySelector('.team-subnav-btn[data-subtab="teamSync"]');
      if (syncSubnavBtn) {
        syncSubnavBtn.style.setProperty('display', canReviewOrDispatch ? 'inline-flex' : 'none', 'important');
      }
      const dispatchSubnavBtn = document.querySelector('.team-subnav-btn[data-subtab="teamDispatch"]');
      if (dispatchSubnavBtn) {
        const spanTxt = dispatchSubnavBtn.querySelector('span');
        if (spanTxt) {
          spanTxt.textContent = canReviewOrDispatch ? 'Görev Dağıtımı ve Onay' : '🎯 Atanan Görevlerim';
        }
      }

      // 5. Görev Panelleri İzolasyonu: Normal etiketleyiciye yönetici atama formu ve onay bekleyenler gizlenir, Reviewer ve Kaptana görünür!
      const adminDispatchGrid = document.getElementById('teamAdminDispatchGrid');
      if (adminDispatchGrid) {
        adminDispatchGrid.style.setProperty('display', canReviewOrDispatch ? 'grid' : 'none', 'important');
      }

      // Render Active Members (Normal üyede silme butonu gösterilmez)
      if (membersList) {
        if (members.length === 0) {
          membersList.innerHTML = '<div style="color:#64748b; font-size:0.8rem; text-align:center; padding:20px;">Bu takımda henüz kayıtlı personel bulunmuyor.</div>';
        } else {
          membersList.innerHTML = members.map(m => {
            const rawUser = m.username || 'U';
            const safeDisplayName = escapeHtml(m.display_name || m.username);
            const safeEmail = m.email ? escapeHtml(m.email) : '@' + escapeHtml(m.username);
            const initial = escapeHtml(rawUser[0].toUpperCase());
            // Silme butonu için email birincil kimlik; eksikse username fallback
            const memberIdentifier = m.email ? escapeHtml(m.email) : escapeHtml(m.username);
            const isCaptainMember = (m.email && m.email.toLowerCase() === (activeTeam.captain || '').toLowerCase())
              || (m.username && m.username.toLowerCase() === (activeTeam.captain || '').toLowerCase());

            return `
              <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:10px;">
                  <div style="width:28px; height:28px; border-radius:50%; background:#1e293b; border:1px solid rgba(255,255,255,0.12); display:flex; align-items:center; justify-content:center; font-weight:600; font-size:0.78rem; color:#cbd5e1;">
                    ${initial}
                  </div>
                  <div>
                    <strong style="color:#f8fafc; font-size:0.82rem; display:block;">${safeDisplayName}</strong>
                    <span style="font-size:0.72rem; color:#64748b;">${safeEmail}</span>
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  ${roleBadges[m.role] || roleBadges.annotator}
                  ${isCaptainOnly && !isCaptainMember ? `
                    <!-- Rol Değiştir Butonu -->
                    <select class="change-role-select"
                      data-team="${escapeHtml(activeTeam.id)}"
                      data-email="${memberIdentifier}"
                      style="background:#0f172a; border:1px solid rgba(255,255,255,0.12); border-radius:5px; color:#94a3b8; font-size:0.7rem; padding:2px 4px; cursor:pointer;"
                      title="Rol Değiştir"
                    >
                      <option value="annotator" ${m.role==='annotator'?'selected':''}>Etiketleyici</option>
                      <option value="reviewer" ${m.role==='reviewer'?'selected':''}>Denetçi</option>
                      <option value="captain" ${m.role==='captain'?'selected':''}>Kaptan (Yard.)</option>
                    </select>
                    <!-- Kaptan Yap Butonu -->
                    <button class="transfer-captain-btn"
                      data-team="${escapeHtml(activeTeam.id)}"
                      data-email="${memberIdentifier}"
                      data-name="${safeDisplayName}"
                      style="background:rgba(234,179,8,0.08); border:1px solid rgba(234,179,8,0.25); border-radius:5px; color:#eab308; font-size:0.7rem; font-weight:600; padding:2px 7px; cursor:pointer;"
                      title="Bu Üyeye Kapta nlığı Devret"
                    >⭐
                    </button>
                    <!-- Takımdan Çıkar Butonu -->
                    <button class="remove-member-btn"
                      data-team="${escapeHtml(activeTeam.id)}"
                      data-email="${memberIdentifier}"
                      data-name="${safeDisplayName}"
                      style="background:none; border:none; color:#94a3b8; font-size:1.1rem; cursor:pointer; padding:2px 6px; transition:color 0.15s ease;"
                      onmouseover="this.style.color='#ef4444'"
                      onmouseout="this.style.color='#94a3b8'"
                      title="Takımdan Çıkar"
                    >&times;</button>
                  ` : ''}
                </div>
              </div>
            `;
          }).join('');
        }
      }

      // Render Pending Invites (Sadece Kaptan görebilir)
      if (pendingInvitesList) {
        if (!isCaptainOnly) {
          pendingInvitesList.innerHTML = '';
          pendingInvitesList.style.display = 'none';
        } else if (pendingInvites.length === 0) {
          pendingInvitesList.innerHTML = '<div style="color:#64748b; font-size:0.8rem; text-align:center; padding:20px;">Bekleyen davet bulunmamaktadır.</div>';
        } else {
          pendingInvitesList.innerHTML = pendingInvites.map(inv => {
            const isDeclined = inv.status === 'declined';
            const isExpired = inv.is_expired || inv.status === 'expired';
            const safeInvitee = escapeHtml(inv.invitee || inv.email);
            const safeRole = escapeHtml(inv.role || 'annotator');
            const safeInvitedAt = escapeHtml(inv.invited_at || '');
            const safeDeclinedAt = escapeHtml(inv.declined_at || '');
            const safeExpiresAt = escapeHtml(inv.expires_at || '');

            let badgeHtml = '';
            let cardBorder = '';
            let timeInfo = '';

            if (isDeclined) {
              badgeHtml = `<span style="background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.35); font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#ef4444;"></span>Daveti Reddetti</span>`;
              cardBorder = 'border:1px solid rgba(239,68,68,0.3); background:rgba(239,68,68,0.04);';
              timeInfo = `Rol: <span style="color:#cbd5e1;">${safeRole}</span> • <span style="color:#f87171;">Reddedildi: ${safeDeclinedAt}</span>`;
            } else if (isExpired) {
              badgeHtml = `<span style="background:rgba(239,68,68,0.12); color:#fca5a5; border:1px solid rgba(239,68,68,0.3); font-size:0.68rem; font-weight:700; padding:2px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#ef4444;"></span>Süresi Doldu (7 Gün)</span>`;
              cardBorder = 'border:1px dashed rgba(239,68,68,0.35); background:rgba(239,68,68,0.03);';
              timeInfo = `Rol: <span style="color:#cbd5e1;">${safeRole}</span> • <span style="color:#fca5a5;">Süre Doldu: ${safeExpiresAt}</span>`;
            } else {
              badgeHtml = `<span style="background:rgba(245,158,11,0.12); color:#fbbf24; border:1px solid rgba(245,158,11,0.25); font-size:0.68rem; font-weight:600; padding:2px 8px; border-radius:4px; display:inline-flex; align-items:center; gap:4px;"><span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#f59e0b;"></span>Davet Edildi (Bekliyor)</span>`;
              cardBorder = 'border:1px dashed rgba(245,158,11,0.3); background:rgba(255,255,255,0.02);';
              timeInfo = `Rol: <span style="color:#cbd5e1;">${safeRole}</span> • Davet: ${safeInvitedAt} • Son: ${safeExpiresAt}`;
            }

            const canCopy = !isDeclined && !isExpired;

            return `
              <div style="${cardBorder} border-radius:8px; padding:10px 12px; display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <strong style="color:#f8fafc; font-size:0.84rem;">${safeInvitee}</strong>
                    ${badgeHtml}
                  </div>
                  <div style="font-size:0.72rem; color:#64748b; margin-top:3px;">${timeInfo}</div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                  ${canCopy ? `
                    <button class="copy-invite-link-btn" data-link="${escapeHtml(inv.invite_link)}" style="background:rgba(56,189,248,0.1); border:1px solid rgba(56,189,248,0.25); border-radius:5px; color:#38bdf8; font-size:0.72rem; padding:4px 9px; cursor:pointer;" title="Davet Bağlantısını Kopyala">Linki Kopyala</button>
                  ` : `
                    <button class="reinvite-btn" data-email="${escapeHtml(inv.email || inv.invitee)}" data-role="${safeRole}" style="background:rgba(59,130,246,0.12); border:1px solid rgba(59,130,246,0.3); border-radius:5px; color:#60a5fa; font-size:0.72rem; font-weight:600; padding:4px 9px; cursor:pointer;" title="Yeni Bir 7 Günlük Davet Bağlantısı Gönder">Yeniden Davet Et</button>
                  `}
                  <button class="cancel-invite-btn" data-team="${escapeHtml(activeTeam.id)}" data-inv="${escapeHtml(inv.invite_id)}" style="background:none; border:none; color:#ef4444; font-size:1.2rem; cursor:pointer; padding:2px 6px; line-height:1;" title="Listeden Kaldır">&times;</button>
                </div>
              </div>
            `;
          }).join('');
        }
      }



      if (assignedProjectsList) {
        const projs = activeTeam.projects || [];
        if (projs.length === 0) {
          assignedProjectsList.innerHTML = '<span style="color:#64748b; font-size:0.76rem;">Bu takıma atanmış bir proje yok.</span>';
        } else {
          assignedProjectsList.innerHTML = projs.map(p => `
              <span style="background:rgba(56,189,248,0.08); border:1px solid rgba(56,189,248,0.2); border-radius:6px; padding:3px 8px; font-size:0.75rem; color:#cbd5e1; display:inline-flex; align-items:center; gap:6px;">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                <span>${p}</span>
                ${isCaptainOnly ? `
                  <button class="unassign-proj-btn" data-team="${activeTeam.id}" data-proj="${p}" style="background:none; border:none; color:#64748b; cursor:pointer; padding:0; font-size:0.85rem; line-height:1;" onmouseover="this.style.color='#ef4444'" onmouseout="this.style.color='#64748b'" title="Yetkiyi Kaldır">&times;</button>
                ` : ''}
              </span>
            `).join('');
        }
      }

      // Populate Project Select (Defaults to current active project)
      if (projectSelect) {
        const availableProjs = (this.projectsList && this.projectsList.length > 0)
          ? this.projectsList.map(p => p.id || p.category)
          : (cat ? [cat] : []);

        if (availableProjs.length > 0) {
          projectSelect.innerHTML = availableProjs.map(p =>
            `<option value="${p}" ${p === cat ? 'selected' : ''}>${p}</option>`
          ).join('');
        } else {
          projectSelect.innerHTML = '<option value="">Erişilebilir proje bulunamadı</option>';
        }
      }

      // ─── 3. ÇALIŞMA MASASI MİMARİSİ (Seçenek A + B Birleşimi) ─────────────
      // Yöneticiler için: Yalnızca kendi adlarına atanmış aktif görev varsa görünür, yoksa gizlenir.
      // Normal üyeler için: Kendi görevleri her zaman bu alanda gösterilir.
      const userSelect = document.getElementById('currentUserRoleSelect');
      const userSelectWrap = userSelect?.closest('.user-select-wrap') || userSelect?.parentElement;
      const workbenchCard = document.getElementById('myTaskWorkbenchCard');

      // Takım üyeleri arasından aktif oturum sahibi kullanıcının gerçek username kaydını bul
      const matchedMember = (activeTeam.members || []).find(m => 
        (m.email && m.email.toLowerCase() === curEmail) ||
        (m.username && (m.username.toLowerCase() === curEmail || curEmail.startsWith(m.username.toLowerCase())))
      );

      const myUsername = matchedMember?.username || this.currentUser?.username || curEmail.split('@')[0];

      if (userSelectWrap) {
        // Başka personelleri seçme dropdown'ını tamamen kaldır; çalışma masası her zaman sadece aktif oturum sahibinindir
        userSelectWrap.style.display = 'none';
      }

      if (userSelect) {
        const safeUser = this._escapeHtml(myUsername);
        userSelect.innerHTML = `<option value="${safeUser}">@${safeUser}</option>`;
        userSelect.value = myUsername;
        userSelect.disabled = true;
      }

      // Aktif kullanıcının kendi görevini yükle; eğer yönetici ise ve görevi yoksa kartı gizle
      const isTeamManager = isCaptainOnly || (isSystemAdmin && !isMember);
      this.loadMyActiveTask(myUsername, isTeamManager);
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
    try {
      const bRes = await fetch(`/api/projects/batches?category=${encodeURIComponent(cat)}`, { headers: this.getAuthHeaders() });
      if (bRes.ok) {
        const bData = await bRes.json();
        if (bData.batches && batchSelect) {
          batchSelect.innerHTML = bData.batches.map(b =>
            `<option value="${b.id}">${b.name} (${b.images ? b.images.length : 0} Resim)</option>`
          ).join('');
        }
      }
    } catch (e) {
      console.warn('Batches fetch error:', e);
    }

    // 3. Sync Status & Central Locks
    try {
      const sRes = await fetch(`/api/team/sync-status?category=${encodeURIComponent(cat)}`, { headers: this.getAuthHeaders() });
      if (sRes.ok) {
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
    } catch (e) {
      console.warn('Sync status fetch error:', e);
    }

    // 4. Pending Reviews & Admin Dispatch Engine
    let prData = { status: 'ok', pending_count: 0, all_tasks: [] };
    try {
      const prRes = await fetch('/api/team/pending-reviews', { headers: this.getAuthHeaders() });
      if (prRes.ok) {
        prData = await prRes.json();
      }
    } catch (e) {
      console.warn('Pending reviews fetch error:', e);
    }
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

        prList.innerHTML = tasks.map(t => {
          const safeTitle = escapeHtml(t.title);
          const safeAssignedTo = escapeHtml(t.assigned_to);
          const safeCreatedAt = escapeHtml(t.created_at || '');
          const safeNote = t.user_note ? escapeHtml(t.user_note) : '';

          return `
            <div style="background:rgba(255,255,255,0.02); border:1px solid ${t.status === 'submitted' ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}; border-radius:8px; padding:10px 12px; display:flex; flex-direction:column; gap:6px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="color:#f8fafc; font-size:0.82rem;">${safeTitle}</strong>
                ${statusBadges[t.status] || statusBadges.assigned}
              </div>
              <div style="font-size:0.74rem; color:#64748b; display:flex; justify-content:space-between;">
                <span>Atanan: <strong style="color:#cbd5e1;">@${safeAssignedTo}</strong></span>
                <span>${safeCreatedAt}</span>
              </div>
              ${safeNote ? `<div style="font-size:0.72rem; color:#94a3b8; background:rgba(0,0,0,0.25); padding:4px 8px; border-radius:5px; border-left:2px solid #38bdf8;">Not: ${safeNote}</div>` : ''}
              
              ${t.status === 'submitted' ? `
                <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap;">
                  <button class="review-inspect-btn btn-secondary" data-task="${t.id}" data-category="${t.category || ''}" data-author="${t.assigned_to || ''}" data-title="${t.title || ''}" data-images="${encodeURIComponent(JSON.stringify(t.images || []))}" style="flex:1; padding:6px 10px; font-size:0.75rem; font-weight:600; border-radius:6px; display:flex; justify-content:center; align-items:center; gap:5px; color:#38bdf8; border-color:rgba(56,189,248,0.3);" title="Etiketleri tuval üzerinde aç ve incele">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                    <span>Görselleri İncele</span>
                  </button>
                  <button class="review-approve-btn btn-primary" data-task="${t.id}" style="flex:1.2; padding:6px 10px; font-size:0.75rem; font-weight:700; border-radius:6px; display:flex; justify-content:center; align-items:center; gap:5px; background:#10b981; border:none;" title="Onayla ve Ana Projeye Birleştir (Merge)">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    <span>Onayla ve Birleştir</span>
                  </button>
                  <button class="review-reject-btn btn-secondary" data-task="${t.id}" style="flex:0.9; padding:6px 8px; font-size:0.75rem; font-weight:600; color:#f87171; border-color:rgba(239,68,68,0.25); border-radius:6px; display:flex; justify-content:center; align-items:center; gap:4px;" title="Düzeltme Talep Et">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                    <span>Revizyon İste</span>
                  </button>
                </div>
              ` : ''}
            </div>
          `;
        }).join('');
      }
    }

    // ── Workspace Sidebar Rol Label Senkronizasyonu ─────────────────────────
    // Takım verisi başarıyla yüklendi; ana sidebar'daki wsUserRole label'ını
    // kullanıcının bu takımdaki gerçek rolüne göre güncelle.
    if (typeof this._syncWorkspaceSidebarRole === 'function') {
      this._syncWorkspaceSidebarRole();
    }

  } catch (e) {
    console.error(e);
  }
}

// =========================================================================
// MODERN IN-APP DIALOG & CONFIRMATION ENGINE (NO BROWSER POPUPS)
// =========================================================================

  proto.switchTeamSubtab = function(target, pushHistory = true) {
  const subtabMap = {
    'org': 'teamOrg',
    'teamOrg': 'teamOrg',
    'dispatch': 'teamDispatch',
    'teamDispatch': 'teamDispatch',
    'sync': 'teamSync',
    'teamSync': 'teamSync'
  };
  let activeTarget = subtabMap[target] || 'teamOrg';

  // Rol kontrolü: Normal üye teamSync sekmesine erişemez
  const activeT = (this.cachedTeams || []).find(t => t.id === this.selectedTeamId) || (this.cachedTeams || [])[0];
  const isCaptain = this.isUserCaptainOfTeam(activeT);
  const isCaptainOnly = isCaptain;

  if (!isCaptainOnly && activeTarget === 'teamSync') {
    activeTarget = 'teamDispatch'; // Normal üyeyi doğrudan görevlerine yönlendir
  }

  const subtabSlug = activeTarget === 'teamDispatch' ? 'dispatch' : (activeTarget === 'teamSync' ? 'sync' : 'org');

  document.querySelectorAll('.team-subnav-btn').forEach(b => {
    const isMatch = b.dataset.subtab === activeTarget;
    b.classList.toggle('active', isMatch);
    b.style.background = isMatch ? '#1e293b' : 'transparent';
    b.style.color = isMatch ? '#f8fafc' : '#94a3b8';
  });

  const membersContent = document.getElementById('teamDetailMembersContent');
  const dispPane = document.getElementById('teamSubtabDispatch');
  const syncPane = document.getElementById('teamSubtabSync');

  if (membersContent) membersContent.style.display = activeTarget === 'teamOrg' ? 'block' : 'none';
  if (dispPane) {
    dispPane.style.display = activeTarget === 'teamDispatch' ? 'block' : 'none';
    if (activeTarget === 'teamDispatch') {
      const curEmail = (this.currentUser?.email || '').toLowerCase().trim();
      const activeTeam = (this.teamsData && this.teamsData.teams) ? this.teamsData.teams.find(t => t.id === this.selectedTeamId) : null;
      const matchedMember = activeTeam ? (activeTeam.members || []).find(m => 
        (m.email && m.email.toLowerCase() === curEmail) ||
        (m.username && (m.username.toLowerCase() === curEmail || curEmail.startsWith(m.username.toLowerCase())))
      ) : null;
      const isMember = !!matchedMember;
      const isAnnotator = matchedMember?.role === 'annotator';
      const isSystemAdmin = (this.currentUser?.role === 'admin' || this.currentUser?.role === 'super_admin');
      const canManageDispatch = !isAnnotator && (isCaptainOnly || matchedMember?.role === 'reviewer' || (isSystemAdmin && !isMember));

      const adminDispatchGrid = document.getElementById('teamAdminDispatchGrid');
      if (adminDispatchGrid) {
        adminDispatchGrid.style.setProperty('display', canManageDispatch ? 'grid' : 'none', 'important');
      }
      // Görev Dağıtımı sekmesine geçildiğinde metrikleri ve bekleyen teslimatları canlı yenile
      const effCat = this.getEffectiveCategory();
      this.updateDatasetDispatchOptions(effCat);
      this.loadIncomingSyncPacks(effCat);

      // Görevlerim sekmesine geçildiğinde üyenin kişisel görev masasını yükle
      const myUsername = matchedMember?.username || this.currentUser?.username || curEmail.split('@')[0] || 'admin';
      const isTeamManager = isCaptainOnly || (isSystemAdmin && !isMember);
      this.loadMyActiveTask(myUsername, isTeamManager);
    }
  }
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
    } catch (e) { }
  }
}

  proto.setupTeamSyncEvents = function() {
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

  // Back to Teams Grid from Team Detail View
  document.getElementById('btnBackToTeamList')?.addEventListener('click', () => {
    const teamListView = document.getElementById('teamListView');
    const teamDetailView = document.getElementById('teamDetailView');
    this.switchTeamSubtab('teamOrg', false);
    if (teamDetailView) teamDetailView.style.display = 'none';
    if (teamListView) teamListView.style.display = 'block';
  });

  // 0. Team Selector Switch
  document.getElementById('teamSelectDropdown')?.addEventListener('change', (e) => {
    this.selectedTeamId = e.target.value;
    const teamListView = document.getElementById('teamListView');
    const teamDetailView = document.getElementById('teamDetailView');
    if (teamListView) teamListView.style.display = 'none';
    if (teamDetailView) teamDetailView.style.display = 'block';
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

    const cat = this.activeHubProjectId || this.currentCategory;
    const myUsername = (this.currentUser?.username || this.currentUser?.email || '').trim();
    try {
      const res = await fetch('/api/teams/create', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        // Aktif workspace ID'sini takımla ilişkilendir
        body: JSON.stringify({
          name: teamName.trim(),
          captain: myUsername,
          initial_projects: cat ? [cat] : [],
          workspace_id: this.activeWorkspaceId || null
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(data.message, 'success');
        this.selectedTeamId = data.team.id;
        const teamListView = document.getElementById('teamListView');
        const teamDetailView = document.getElementById('teamDetailView');
        if (teamListView) teamListView.style.display = 'none';
        if (teamDetailView) teamDetailView.style.display = 'block';
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
  // ── Cloudflare D1 Canlı Kullanıcı Arama Autocomplete ──
  const inviteeInput = document.getElementById('inviteeInput');
  const inviteeDropdown = document.getElementById('inviteeDropdown');
  const inviteeSelectedEmail = document.getElementById('inviteeSelectedEmail');
  const inviteeSelectedName = document.getElementById('inviteeSelectedName');

  if (inviteeInput && inviteeDropdown) {
    let searchTimeout = null;

    const closeDropdown = () => {
      inviteeDropdown.style.display = 'none';
      inviteeDropdown.innerHTML = '';
    };

    const renderDropdown = (users, query) => {
      if (!users || users.length === 0) {
        inviteeDropdown.innerHTML = `
            <div style="padding:12px 14px; color:#94a3b8; font-size:0.8rem; text-align:center;">
              ${query ? `"${query}" ile eşleşen kayıtlı üye bulunamadı.<br><span style="font-size:0.72rem; color:#64748b;">Yalnızca sistemdeki kullanıcılar davet edilebilir.</span>` : 'Sistemde kayıtlı kullanıcı bulunamadı.'}
            </div>`;
        inviteeDropdown.style.display = 'block';
        return;
      }

      inviteeDropdown.innerHTML = `
          <div style="padding:7px 10px 5px; font-size:0.68rem; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; border-bottom:1px solid rgba(255,255,255,0.08); display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span style="width:6px; height:6px; border-radius:50%; background:#10b981; display:inline-block; box-shadow:0 0 6px #10b981;"></span>
              Kayıtlı Kullanıcılar (${users.length})
            </div>
            <span style="font-size:0.65rem; color:#64748b;">Seçmek için dokunun</span>
          </div>
          ${users.map(u => {
        const name = u.display_name || u.email.split('@')[0];
        const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        const hasAvatar = u.avatar_url && !u.avatar_url.includes('ui-avatars.com');
        return `
              <div class="user-search-item" data-email="${u.email}" data-name="${name}"
                style="display:flex; align-items:center; gap:10px; padding:10px 12px; cursor:pointer; transition:background 0.15s; border-bottom:1px solid rgba(255,255,255,0.05);">
                <div style="flex-shrink:0; width:34px; height:34px; border-radius:50%; overflow:hidden; border:1.5px solid rgba(59,130,246,0.35); display:flex; align-items:center; justify-content:center; background:rgba(59,130,246,0.15); font-size:0.75rem; font-weight:700; color:#60a5fa;">
                  ${hasAvatar ? `<img src="${u.avatar_url}" style="width:100%; height:100%; object-fit:cover;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"><span style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">${initials}</span>` : initials}
                </div>
                <div style="flex:1; min-width:0;">
                  <div style="font-size:0.84rem; font-weight:600; color:#f8fafc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                  <div style="font-size:0.73rem; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${u.email}</div>
                </div>
                <div style="flex-shrink:0; font-size:0.68rem; padding:2px 8px; border-radius:12px; background:rgba(16,185,129,0.14); border:1px solid rgba(16,185,129,0.3); color:#34d399; font-weight:600;">Seç ✓</div>
              </div>
            `;
      }).join('')}
        `;
      inviteeDropdown.style.display = 'block';

      // Click / Touch handler for each user item
      inviteeDropdown.querySelectorAll('.user-search-item').forEach(item => {
        item.addEventListener('mouseenter', () => item.style.background = 'rgba(59,130,246,0.12)');
        item.addEventListener('mouseleave', () => item.style.background = '');
        const selectUser = (e) => {
          e.preventDefault();
          const email = item.dataset.email;
          const name = item.dataset.name;
          inviteeInput.value = `${name} (${email})`;
          if (inviteeSelectedEmail) inviteeSelectedEmail.value = email;
          if (inviteeSelectedName) inviteeSelectedName.value = name;
          closeDropdown();
        };
        item.addEventListener('mousedown', selectUser);
        item.addEventListener('touchstart', selectUser, { passive: false });
      });
    };

    const doSearch = async (q) => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}&limit=15`, {
          headers: this.getAuthHeaders()
        });
        if (!res.ok) return;
        const data = await res.json();
        renderDropdown(data.users || [], q);
      } catch (err) {
        console.warn('[User Search]', err);
      }
    };

    // On focus: show users
    inviteeInput.addEventListener('focus', () => {
      // Eğer kullanıcı kutuyu temizleyip baştan arayacaksa
      const val = inviteeSelectedEmail?.value ? '' : inviteeInput.value.trim();
      doSearch(val);
    });

    // On input: arama yap ve seçimi sıfırla
    inviteeInput.addEventListener('input', () => {
      if (inviteeSelectedEmail) inviteeSelectedEmail.value = '';
      if (inviteeSelectedName) inviteeSelectedName.value = '';
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        doSearch(inviteeInput.value.trim());
      }, 200);
    });

    // Close on outside click / tap
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

  // 0. GitHub-Style Send Invite to Team (Registered users only)
  document.getElementById('inviteTeamMemberForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inviteeInput = document.getElementById('inviteeInput');
    const roleInput = document.getElementById('inviteeRole');
    const inviteeSelectedEmail = document.getElementById('inviteeSelectedEmail');

    // Eğer dropdown'dan doğrudan seçilmişse veya yazılan doğrudan geçerli bir email ise
    let invitee = inviteeSelectedEmail?.value || inviteeInput?.value.trim();

    // Parantez içi temizliği: "Mehmet (mehmet@example.com)" formatından email çıkarma
    const match = invitee.match(/\(([^)]+)\)/);
    if (match && match[1]) {
      invitee = match[1].trim();
    }

    const role = roleInput?.value || 'annotator';

    if (!invitee || !this.selectedTeamId) {
      this.showToast('Lütfen listeden sistemde kayıtlı bir kullanıcı seçiniz.', 'warning');
      return;
    }

    this.showLoading(true, `'${invitee}' için davet hazırlanıyor ve gönderiliyor...`);
    try {
      const res = await fetch('/api/teams/invite-member', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          team_id: this.selectedTeamId,
          invitee: invitee,
          role: role,
          // BUG-5: invited_by hardcoded 'admin' yerine gerçek kullanıcı
          invited_by: this.currentUser?.username || this.currentUser?.email || 'admin'
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        const emailSent = data.email_sent;
        const alertMsg = emailSent 
          ? `${data.message} Davet e-postası başarıyla iletildi.` 
          : `${data.message} (E-posta servisi yapılandırılmadığı için davet linki panoya kopyalandı).`;
        
        this.showToast(alertMsg, emailSent ? 'success' : 'info');
        
        if (inviteeInput) inviteeInput.value = '';
        if (inviteeSelectedEmail) inviteeSelectedEmail.value = '';
        if (inviteeSelectedName) inviteeSelectedName.value = '';

        // Panoya kopyalama ve kullanıcı bilgilendirme
        if (data.invite_link) {
          navigator.clipboard.writeText(data.invite_link).catch(() => { });
        }

        await this.loadTeamSyncHub();

        // Bekleyenler sekmesini açalım ki yeni daveti hemen görsün
        const pendingBtn = document.getElementById('memberViewPendingBtn');
        if (pendingBtn) {
          pendingBtn.click();
        }
      } else {
        this.showToast(data.detail || 'Davet gönderilemedi. Kullanıcının sistemde kayıtlı olduğundan emin olunuz.', 'error');
      }
    } catch (err) {
      this.showToast('Bağlantı hatası', 'error');
    } finally {
      this.showLoading(false);
    }
  });

  // Bekleyen Davetler Paneli: Daveti Kabul Et veya Reddet (GitHub Modeli)
  document.getElementById('teamInvitationsContainer')?.addEventListener('click', async (e) => {
    const accBtn = e.target.closest('.accept-my-invite-btn');
    const decBtn = e.target.closest('.decline-my-invite-btn');

    if (accBtn) {
      const token = accBtn.dataset.token;
      if (token && typeof this.showTeamInviteLandingCard === 'function') {
        this.showTeamInviteLandingCard(token);
      }
      return;
    }

    if (decBtn) {
      const token = decBtn.dataset.token;
      if (!token) return;

      const ok = await this.openAppConfirm({
        title: 'Takım Davetini Reddet',
        message: 'Bu takım davetini reddetmek istediğinize emin misiniz? (Daha sonra katılmak isterseniz yöneticinizden yeni davet almanız gerekir.)',
        confirmText: 'Daveti Reddet',
        danger: true
      });
      if (!ok) return;

      this.showLoading(true, 'Davet reddediliyor...');
      try {
        const res = await fetch('/api/teams/decline-invite', {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ token: token })
        });
        const data = await res.json();
        if (res.ok) {
          this.showToast(data.message || 'Davet reddedildi.', 'info');
          await this.loadTeamSyncHub();
        } else {
          this.showToast(data.detail || 'İşlem başarısız.', 'error');
        }
      } catch (err) {
        this.showToast('Bağlantı hatası', 'error');
      } finally {
        this.showLoading(false);
      }
    }
  });

  // 0. Cancel Pending Invitation & Copy Invite Link
  document.getElementById('teamPendingInvitesList')?.addEventListener('click', async (e) => {
    const copyBtn = e.target.closest('.copy-invite-link-btn');
    const cancelBtn = e.target.closest('.cancel-invite-btn');
    const reinviteBtn = e.target.closest('.reinvite-btn');

    if (reinviteBtn) {
      const email = reinviteBtn.dataset.email;
      const role = reinviteBtn.dataset.role || 'annotator';
      const input = document.getElementById('inviteeInput');
      // BUG-6: 'inviteRoleSelect' id mevcut değil → form'daki gerçek id 'inviteeRole'
      const roleSel = document.getElementById('inviteeRole');
      if (input) {
        input.value = email;
        input.focus();
      }
      if (roleSel) {
        roleSel.value = role;
      }
      this.showToast(`'${email}' için form dolduruldu. 'Davet Gönder' butonuna basarak yeni davet iletebilirsiniz.`, 'info');
      return;
    }

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
        title: 'Davet Kaydını Kaldır',
        message: 'Bu davet kaydını listeden kaldırmak istediğinize emin misiniz? (Davet bağlantısı tamamen geçersiz kılınacaktır.)',
        confirmText: 'Listeden Kaldır',
        danger: true
      });
      if (!ok) return;

      try {
        const res = await fetch('/api/teams/cancel-invite', {
          method: 'POST',
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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

  // 0. Delegate Remove Member Click — backend artık email bekliyor
  document.getElementById('teamMembersList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.remove-member-btn');
    if (!btn) return;
    const teamId = btn.dataset.team;
    const memberEmail = btn.dataset.email || '';
    const memberName = btn.dataset.name || memberEmail;
    if (!memberEmail) return;

    const ok = await this.openAppConfirm({
      title: 'Üye Çıkarma',
      message: `'${memberName}' kullanıcısını takımdan çıkarmak istediğinize emin misiniz?`,
      confirmText: 'Çıkar',
      danger: true
    });
    if (!ok) return;

    try {
      const res = await fetch('/api/teams/remove-member', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        // Backend artık "email" alanı bekliyor ("username" değil)
        body: JSON.stringify({ team_id: teamId, email: memberEmail })
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

  // ── Kaptanlık Devret (⭐ butonu) ─────────────────────────────────────────
  document.getElementById('teamMembersList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.transfer-captain-btn');
    if (!btn) return;
    const teamId = btn.dataset.team;
    const newCaptainEmail = btn.dataset.email || '';
    const newCaptainName = btn.dataset.name || newCaptainEmail;
    if (!teamId || !newCaptainEmail) return;

    const ok = await this.openAppConfirm({
      title: 'Kaptanlığı Devret',
      message: `'${newCaptainName}' kullanıcısına takım kaptanlığını devretmek istediğinize emin misiniz?\nBu işlemden sonra siz Denetçi (Reviewer) rolüne geçeceksiniz.`,
      confirmText: 'Evet, Devret',
      danger: false
    });
    if (!ok) return;

    this.showLoading(true, 'Kaptanlık devrediliyor...');
    try {
      const res = await fetch('/api/teams/transfer-captaincy', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ team_id: teamId, new_captain_email: newCaptainEmail })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(data.message || 'Kaptanlık başarıyla devredildi!', 'success');
        await this.loadTeamSyncHub();
      } else {
        this.showToast(data.detail || 'Kaptanlık devredilemedi.', 'error');
      }
    } catch (err) {
      this.showToast('Bağlantı hatası: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  });

  // ── Rol Değiştir (select change) ─────────────────────────────────────────
  document.getElementById('teamMembersList')?.addEventListener('change', async (e) => {
    const sel = e.target.closest('.change-role-select');
    if (!sel) return;
    const teamId = sel.dataset.team;
    const memberEmail = sel.dataset.email || '';
    const newRole = sel.value;
    if (!teamId || !memberEmail || !newRole) return;

    this.showLoading(true, 'Rol güncelleniyor...');
    try {
      const res = await fetch('/api/teams/add-member', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          team_id: teamId,
          username: memberEmail,  // add-member email ile de arama yapıyor
          email: memberEmail,
          role: newRole
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(`Rol '${newRole}' olarak güncellendi.`, 'success');
        await this.loadTeamSyncHub();
      } else {
        this.showToast(data.detail || 'Rol güncellenemedi.', 'error');
      }
    } catch (err) {
      this.showToast('Bağlantı hatası', 'error');
    } finally {
      this.showLoading(false);
    }
  });

  // ── Yeniden Davet Et (reinvite-btn) ──────────────────────────────────────
  document.getElementById('teamPendingInvitesList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.reinvite-btn');
    if (!btn) return;
    const invEmail = btn.dataset.email || '';
    const invRole = btn.dataset.role || 'annotator';
    if (!invEmail || !this.selectedTeamId) return;

    this.showLoading(true, `'${invEmail}' adresine yeni davet gönderiliyor...`);
    try {
      const res = await fetch('/api/teams/invite-member', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          team_id: this.selectedTeamId,
          invitee: invEmail,
          role: invRole,
          invited_by: this.currentUser?.display_name || this.currentUser?.email || 'Kaptan'
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(`'${invEmail}' adresine yeni davet bağlantısı gönderildi. ✓`, 'success');
        await this.loadTeamSyncHub();
      } else {
        this.showToast(data.detail || 'Davet gönderilemedi.', 'error');
      }
    } catch (err) {
      this.showToast('Bağlantı hatası', 'error');
    } finally {
      this.showLoading(false);
    }
  });

  // ── Snapshot Geri Yükle (restore-single-snap-btn) ────────────────────────
  document.getElementById('teamSnapshotsList')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('.restore-single-snap-btn');
    if (!btn) return;
    const snapId = btn.dataset.snap || '';
    const cat = this.getEffectiveCategory();
    if (!snapId) return;

    const ok = await this.openAppConfirm({
      title: 'Yedeği Geri Yükle',
      message: `'${snapId}' yedeğine geri dönmek istediğinize emin misiniz?\nMevcut etiketler bu işlemden önce otomatik olarak yedeklenecektir.`,
      confirmText: 'Geri Yükle',
      danger: true
    });
    if (!ok) return;

    this.showLoading(true, 'Yedek geri yükleniyor...');
    try {
      const res = await fetch('/api/team/restore-snapshot', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ category: cat, snapshot_id: snapId })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast('Yedek başarıyla geri yüklendi! ✓', 'success');
        await this.loadTeamSyncHub();
      } else {
        this.showToast(data.detail || 'Yedek geri yüklenemedi.', 'error');
      }
    } catch (err) {
      this.showToast('Bağlantı hatası: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  });

  // ── Takımı Sil (deleteCurrentTeamBtn) ──────────────────────────────────
  document.getElementById('deleteCurrentTeamBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const teamId = btn.dataset.team;
    const teamName = btn.dataset.name || 'Takım';
    if (!teamId) return;

    const ok = await this.openAppConfirm({
      title: 'Takımı Kalıcı Olarak Sil',
      message: `'${teamName}' takımını kalıcı olarak silmek istediğinize emin misiniz?\nBu işlem geri alınamaz. Takıma ait tüm üyelikler ve proje eşleşmeleri kaldırılacaktır.`,
      confirmText: 'Evet, Takımı Sil',
      danger: true
    });
    if (!ok) return;

    this.showLoading(true, `'${teamName}' takımı siliniyor...`);
    try {
      const res = await fetch('/api/teams/delete-team', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ team_id: teamId })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(data.message || 'Takım başarıyla silindi.', 'success');
        this.selectedTeamId = null;
        // Takım listesi görünümüne geri dön
        document.getElementById('btnBackToTeamList')?.click();
        await this.loadTeamSyncHub();
      } else {
        this.showToast(data.detail || 'Takım silinemedi.', 'error');
      }
    } catch (err) {
      this.showToast('Bağlantı hatası: ' + err.message, 'error');
    } finally {
      this.showLoading(false);
    }
  });


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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
    const cat = this.getEffectiveCategory();
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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

    // Editör üst barında "Görevi Kontrole Gönder" butonunu aktif et
    const submitBtnInEditor = document.getElementById('editorSubmitTaskBtn');
    if (submitBtnInEditor) {
      submitBtnInEditor.style.display = 'inline-flex';
    }

    this.showToast(`Size atanmış ${this.imageFiles.length} görsel çalışma alanına yüklendi. İşiniz bitince üst bardan veya ekrandan 'Kontrole Gönder' yapabilirsiniz.`, 'info');
  });

  // 0. Personal Task Workbench: Submit Task to Admin for Review (Kontrole Gönder)
  document.getElementById('submitCurrentTaskBtn')?.addEventListener('click', async () => {
    if (!this.currentWorkingTaskId) {
      this.showToast('Teslim edilecek aktif bir görev bulunmuyor.', 'warning');
      return;
    }

    const curEmail = (this.currentUser?.email || '').toLowerCase();
    const curUser = this.currentUser?.username || curEmail.split('@')[0] || 'üye';
    const user = document.getElementById('currentUserRoleSelect')?.value || curUser;
    const note = await this.openAppPrompt({
      title: 'Görevi Tamamla ve Kontrole Gönder',
      message: 'Takım Kaptanı / Yönetici incelemesi için teslimat notu veya açıklama ekleyiniz:',
      defaultValue: 'Tüm görseller dikkatle ve standartlara uygun şekilde etiketlendi, kontrole hazırdır.',
      placeholder: 'Teslimat notu / açıklamanız...',
      confirmText: 'Kontrole Gönder (Submit)'
    });
    if (note === null) return;

    this.showLoading(true, 'Göreviniz yönetici onay masasına iletiliyor...');
    try {
      const res = await fetch('/api/team/submit-task', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ task_id: this.currentWorkingTaskId, user_name: user, user_note: note })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(data.message || 'Göreviniz başarıyla kontrole gönderildi! Yönetici onayı bekleniyor.', 'success');
        this.currentWorkingTaskId = null;
        this.currentWorkingTask = null;
        const submitBtnInEditor = document.getElementById('editorSubmitTaskBtn');
        if (submitBtnInEditor) submitBtnInEditor.style.display = 'none';
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

  // 0. Admin Reviews (Inspect / Approve / Reject) Submissions
  document.getElementById('pendingTasksList')?.addEventListener('click', async (e) => {
    const inspBtn = e.target.closest('.review-inspect-btn');
    const appBtn = e.target.closest('.review-approve-btn');
    const rejBtn = e.target.closest('.review-reject-btn');
    if (!inspBtn && !appBtn && !rejBtn) return;

    if (inspBtn) {
      const taskId = inspBtn.dataset.task;
      const cat = inspBtn.dataset.category || this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
      const author = inspBtn.dataset.author || 'üye';
      let imgs = [];
      try {
        imgs = JSON.parse(decodeURIComponent(inspBtn.dataset.images || '[]'));
      } catch (err) {
        imgs = [];
      }

      if (imgs.length === 0) {
        this.showToast('Bu teslime ait incelenecek görsel bulunamadı.', 'warning');
        return;
      }

      this.currentReviewTaskId = taskId;
      this.currentReviewTaskCategory = cat;
      this.currentReviewTaskAuthor = author;

      // Editöre geç ve personelin görev görsellerini tuvale yükle
      this.openProject(cat, 'editor');
      this.imageFiles = imgs;
      this.currentImageIndex = 0;
      this.renderGallery();
      this.loadImage(imgs[0]);

      // Editör üst barındaki inceleme panelini aktif et
      const revBanner = document.getElementById('adminReviewBanner');
      const authorEl = document.getElementById('reviewBannerAuthor');
      if (revBanner) {
        revBanner.style.display = 'inline-flex';
        if (authorEl) authorEl.textContent = `@${author}`;
      }
      this.showToast(`@${author} kullanıcısının teslim ettiği ${imgs.length} görsel inceleme için tuvale yüklendi.`, 'info');
      return;
    }

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

    // OPTIMISTIC UI: Satırı hemen görsel olarak güncelle
    const clickedBtn = appBtn || rejBtn;
    const taskRow = clickedBtn ? clickedBtn.closest('tr') : null;
    const originalRowHtml = taskRow ? taskRow.innerHTML : null;

    if (taskRow) {
      const statusBadge = taskRow.querySelector('.status-badge') || taskRow.querySelector('span[class*="badge"]');
      if (statusBadge) {
        if (action === 'approve') {
          statusBadge.className = 'status-badge status-approved';
          statusBadge.innerHTML = '✓ Onaylandı';
          statusBadge.style.background = 'rgba(34, 197, 94, 0.2)';
          statusBadge.style.color = '#4ade80';
        } else {
          statusBadge.className = 'status-badge status-rejected';
          statusBadge.innerHTML = '↺ Revizyonda';
          statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
          statusBadge.style.color = '#f87171';
        }
      }
      // Butonları geçici devre dışı bırak
      taskRow.querySelectorAll('button').forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
    }

    try {
      this.showLoading(true, action === 'approve' ? 'Teslimat onaylanıyor ve ana veri setine birleştiriliyor...' : 'Revizyon personelin masasına iletiliyor...');
      const res = await fetch('/api/team/review-task', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ task_id: taskId, action: action, feedback: feedback })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(data.message || (action === 'approve' ? 'Teslimat onaylandı.' : 'Revizyon iletildi.'), action === 'approve' ? 'success' : 'warning');
        const revBanner = document.getElementById('adminReviewBanner');
        if (revBanner) revBanner.style.display = 'none';
        this.currentReviewTaskId = null;
        this.loadTeamSyncHub();
      } else {
        // Rollback: Hata durumunda eski satır görünümünü geri yükle
        if (taskRow && originalRowHtml) taskRow.innerHTML = originalRowHtml;
        this.showToast(data.detail || 'İşlem başarısız', 'error');
      }
    } catch (err) {
      if (taskRow && originalRowHtml) taskRow.innerHTML = originalRowHtml;
      this.showToast('Bağlantı hatası', 'error');
    } finally {
      this.showLoading(false);
    }
  });

  // Editör üst barındaki Admin İnceleme & Birleştirme Barı Aksiyonları
  document.getElementById('reviewBannerApproveBtn')?.addEventListener('click', async () => {
    if (!this.currentReviewTaskId) return;
    try {
      this.showLoading(true, 'Teslimat onaylanıyor ve ana veri setine birleştiriliyor (Merge)...');
      const res = await fetch('/api/team/review-task', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ task_id: this.currentReviewTaskId, action: 'approve', feedback: 'Tüm etiketler kontrol edildi, ana projeye birleştirildi.' })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast('✓ Teslimat başarıyla onaylandı ve ana veri setine birleştirildi!', 'success');
        const revBanner = document.getElementById('adminReviewBanner');
        if (revBanner) revBanner.style.display = 'none';
        this.currentReviewTaskId = null;
        this.showAppShell('team', false);
        this.loadTeamSyncHub();
      } else {
        this.showToast(data.detail || 'Onaylama başarısız', 'error');
      }
    } catch (e) {
      this.showToast('Bağlantı hatası', 'error');
    } finally {
      this.showLoading(false);
    }
  });

  document.getElementById('reviewBannerRejectBtn')?.addEventListener('click', async () => {
    if (!this.currentReviewTaskId) return;
    const feedback = await this.openAppPrompt({
      title: 'Revizyon Talebi',
      message: 'Personel için düzeltme / revizyon talimatını yazınız:',
      defaultValue: 'Bazı etiketler eksik veya gevşek çizilmiş, lütfen düzeltiniz.',
      placeholder: 'Düzeltme talimatı...',
      confirmText: 'Revizyona Gönder'
    });
    if (feedback === null) return;

    try {
      this.showLoading(true, 'Revizyon iletiliyor...');
      const res = await fetch('/api/team/review-task', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ task_id: this.currentReviewTaskId, action: 'reject', feedback: feedback })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast('Görev revizyon talebiyle personele geri iletildi.', 'warning');
        const revBanner = document.getElementById('adminReviewBanner');
        if (revBanner) revBanner.style.display = 'none';
        this.currentReviewTaskId = null;
        this.showAppShell('team', false);
        this.loadTeamSyncHub();
      } else {
        this.showToast(data.detail || 'İşlem başarısız', 'error');
      }
    } catch (e) {
      this.showToast('Bağlantı hatası', 'error');
    } finally {
      this.showLoading(false);
    }
  });

  document.getElementById('reviewBannerCloseBtn')?.addEventListener('click', () => {
    const revBanner = document.getElementById('adminReviewBanner');
    if (revBanner) revBanner.style.display = 'none';
    this.currentReviewTaskId = null;
    this.showAppShell('team', false);
  });

  // Editör üst barındaki Üye "Görevi Kontrole Gönder" Butonu
  document.getElementById('editorSubmitTaskBtn')?.addEventListener('click', () => {
    const submitBtn = document.getElementById('submitCurrentTaskBtn');
    if (submitBtn) {
      submitBtn.click();
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getAuthHeaders(),
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
    const scanDupBtn = e.target.closest('.scan-pack-duplicates-btn');
    if (!mergeBtn && !inspectBtn && !scanDupBtn) return;

    const targetBtn = mergeBtn || inspectBtn || scanDupBtn;
    const cat = targetBtn.dataset.category || this.activeHubProjectId || this.currentCategory || localStorage.getItem('yolo_last_category') || 'modai';

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
          headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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

    if (inspectBtn || scanDupBtn) {
      const taskId = (inspectBtn || scanDupBtn).dataset.task;
      const author = (inspectBtn || scanDupBtn).dataset.author || 'Ekip Üyesi';
      const imgsJson = (inspectBtn || scanDupBtn).dataset.images;
      let imgList = [];
      try { imgList = JSON.parse(imgsJson); } catch (err) { imgList = []; }

      const autoScan = !!scanDupBtn;
      this.openPackImagesModal(taskId, cat, author, imgList, autoScan);
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
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

  // Auto-check URL for Invitation Link (?accept_invite=TOKEN or ?invite=TOKEN)
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('accept_invite') || urlParams.get('invite');
  if (inviteToken) {
    this.showTeamInviteLandingCard(inviteToken);
  }
}

  proto.showTeamInviteLandingCard = async function(token) {
    if (!token) return;
    const modal = document.getElementById('teamInviteModal');
    if (!modal) {
      // Fallback
      return this.handleAcceptInvite(token);
    }

    try {
      this.showLoading(true, 'Takım davet detayları alınıyor...');
      const res = await fetch(`/api/teams/invite-info?token=${encodeURIComponent(token)}`);
      const info = await res.json();
      this.showLoading(false);

      if (!res.ok || info.status !== 'ok') {
        window.history.replaceState({}, document.title, window.location.pathname);
        localStorage.removeItem('pending_invite_token');
        this.showToast(info.detail || 'Geçersiz veya süresi dolmuş bir davet bağlantısı.', 'error');
        return;
      }

      // Populate Modal Fields
      const nameEl = document.getElementById('teamInviteName');
      const byEl = document.getElementById('teamInviteBy');
      const roleBadge = document.getElementById('teamInviteRoleBadge');
      const authNotice = document.getElementById('teamInviteAuthNotice');
      const userNotice = document.getElementById('teamInviteUserNotice');
      const userEmailEl = document.getElementById('teamInviteActiveUserEmail');
      const acceptBtn = document.getElementById('teamInviteAcceptBtn');
      const acceptBtnTxt = document.getElementById('teamInviteAcceptBtnTxt');
      const declineBtn = document.getElementById('teamInviteDeclineBtn');

      if (nameEl) nameEl.textContent = info.team_name || 'Takım';
      if (byEl) byEl.textContent = `@${info.invited_by || info.captain || 'Yönetici'}`;
      
      const roleLabels = {
        captain: 'Kaptan Yardımcısı',
        reviewer: 'Denetçi (QA)',
        annotator: 'Etiketleyici (Annotator)'
      };
      if (roleBadge) {
        roleBadge.textContent = roleLabels[info.role] || info.role;
      }

      const expiresEl = document.getElementById('teamInviteExpiresAt');
      if (expiresEl) {
        expiresEl.textContent = info.expires_at ? `${info.expires_at}` : '7 Gün Geçerli';
      }

      // Davetin 7 günlük süresi dolmuşsa bilgilendir ve kilitle
      if (info.is_expired || info.invite_status === 'expired' || info.valid === false) {
        if (authNotice) authNotice.style.display = 'none';
        if (userNotice) {
          userNotice.style.display = 'block';
          userNotice.style.background = 'rgba(239, 68, 68, 0.12)';
          userNotice.style.borderColor = 'rgba(239, 68, 68, 0.35)';
          userNotice.style.color = '#fca5a5';
          userNotice.innerHTML = `
            <div style="font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              <span>⏳ Davet Bağlantısının Süresi Doldu</span>
            </div>
            <div>Bu takım davetinin 7 günlük geçerlilik süresi dolmuştur${info.expires_at ? ' (' + info.expires_at + ')' : ''}. Güvenlik politikası gereği süresi dolan linklerle takıma katılım sağlanamaz. Lütfen takım yöneticinizden yeni bir davet göndermesini isteyiniz.</div>
          `;
        }
        acceptBtn.disabled = true;
        acceptBtn.style.display = 'none';
        if (declineBtn) {
          declineBtn.textContent = 'Pencereyi Kapat';
          declineBtn.onclick = () => {
            modal.style.display = 'none';
            localStorage.removeItem('pending_invite_token');
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          };
        }
        modal.style.display = 'flex';
        return;
      }

      // Davet daha önce reddedilmişse bilgilendir ve kilitle
      if (info.invite_status === 'declined') {
        if (authNotice) authNotice.style.display = 'none';
        if (userNotice) {
          userNotice.style.display = 'block';
          userNotice.style.background = 'rgba(239, 68, 68, 0.12)';
          userNotice.style.borderColor = 'rgba(239, 68, 68, 0.35)';
          userNotice.style.color = '#fca5a5';
          userNotice.innerHTML = `
            <div style="font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              <span>❌ Bu Davet Reddedilmiştir</span>
            </div>
            <div>Bu davet bağlantısı daha önce reddedilmiştir${info.declined_at ? ' (' + info.declined_at + ')' : ''}. Takıma katılmak istiyorsanız lütfen takım kaptanından yeni bir davet talep ediniz.</div>
          `;
        }
        acceptBtn.disabled = true;
        acceptBtn.style.display = 'none';
        if (declineBtn) {
          declineBtn.textContent = 'Pencereyi Kapat';
          declineBtn.onclick = () => {
            modal.style.display = 'none';
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          };
        }
        modal.style.display = 'flex';
        return;
      }

      // Auth Check & Güvenlik Doğrulaması (Hesap Eşleşmesi Kontrolü)
      const curUser = this.currentUser || null;
      const hasToken = !!(localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken'));
      const curEmail = (curUser?.email || '').toLowerCase();
      const curUsername = (curUser?.username || '').toLowerCase();
      const invEmail = (info.email || '').toLowerCase();
      const invUser = (info.invitee || '').toLowerCase().replace(/^@/, '');

      const isMatchingAccount = !hasToken || !curUser || Boolean(
        (curEmail && invEmail && curEmail === invEmail) ||
        (curUsername && invUser && curUsername === invUser) ||
        (curEmail && invUser && curEmail === invUser)
      );

      if (!hasToken || !curUser) {
        // Oturum yok → Kullanıcıya giriş yapması gerektiğini belirt
        if (authNotice) authNotice.style.display = 'block';
        if (userNotice) userNotice.style.display = 'none';
        if (acceptBtnTxt) acceptBtnTxt.textContent = 'Giriş Yap ve Katıl';
        acceptBtn.disabled = false;
        acceptBtn.style.opacity = '1';
        acceptBtn.title = '';
      } else if (!isMatchingAccount) {
        // Oturum var AMA davet edilen hesapla uyuşmuyor! (GÜVENLİK KORUMASI)
        if (authNotice) authNotice.style.display = 'none';
        if (userNotice) {
          userNotice.style.display = 'block';
          userNotice.style.background = 'rgba(239, 68, 68, 0.12)';
          userNotice.style.borderColor = 'rgba(239, 68, 68, 0.35)';
          userNotice.style.color = '#fca5a5';
          const targetAcc = invEmail || invUser;
          userNotice.innerHTML = `
            <div style="font-weight:700; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              <span>⚠️ Hesap Uyuşmazlığı</span>
            </div>
            <div>Bu davet <strong>${targetAcc}</strong> hesabına gönderilmiştir. Şu anda <strong>${curEmail || curUsername}</strong> olarak oturum açtınız.</div>
            <div style="margin-top:10px;">
              <button type="button" id="switchAccountInviteBtn" style="background:#1e293b; border:1px solid rgba(255,255,255,0.2); border-radius:6px; color:#f8fafc; font-size:0.75rem; font-weight:600; padding:5px 12px; cursor:pointer;">
                Farklı Hesapla Giriş Yap (Çıkış Yap)
              </button>
            </div>
          `;
          setTimeout(() => {
            document.getElementById('switchAccountInviteBtn')?.addEventListener('click', () => {
              localStorage.setItem('pending_invite_token', token);
              modal.style.display = 'none';
              if (typeof this.logout === 'function') {
                this.logout();
              } else {
                localStorage.removeItem('yolo_auth_token');
                localStorage.removeItem('authToken');
                sessionStorage.removeItem('authToken');
                window.location.reload();
              }
            });
          }, 50);
        }
        acceptBtn.disabled = true;
        acceptBtn.style.opacity = '0.5';
        acceptBtn.title = 'Davet edilen e-posta hesabıyla oturum açmanız gerekmektedir.';
        if (acceptBtnTxt) acceptBtnTxt.textContent = 'Davet Bu Hesaba Ait Değil';
        if (declineBtn) {
          declineBtn.textContent = 'Pencereyi Kapat';
          declineBtn.title = 'Farklı bir hesaba ait daveti reddedemezsiniz.';
        }
      } else {
        // Oturum var ve hesap doğru!
        if (authNotice) authNotice.style.display = 'none';
        if (userNotice) {
          userNotice.style.display = 'block';
          userNotice.style.background = 'rgba(16,185,129,0.08)';
          userNotice.style.borderColor = 'rgba(16,185,129,0.25)';
          userNotice.style.color = '#a7f3d0';
          userNotice.innerHTML = `Şu an <strong style="color:#ffffff;">${this._escapeHtml(curEmail || curUsername)}</strong> olarak oturum açtınız.`;
        }
        acceptBtn.disabled = false;
        acceptBtn.style.opacity = '1';
        acceptBtn.title = '';
        if (acceptBtnTxt) acceptBtnTxt.textContent = `"${info.team_name}" Takımına Katıl`;
        if (declineBtn) {
          declineBtn.textContent = 'Daveti Reddet';
          declineBtn.title = 'Bu takım davetini reddet';
        }
      }

      // Show Modal
      modal.style.display = 'flex';

      // Arka plana (backdrop) tıklandığında modalın kapanmasını KESİNLİKLE engelle (Static Backdrop)
      modal.onclick = (e) => {
        if (e.target === modal) {
          e.preventDefault();
          e.stopPropagation();
          const card = modal.querySelector('.team-invite-card');
          if (card) {
            card.style.transform = 'scale(1.025)';
            card.style.transition = 'transform 0.12s cubic-bezier(0.16,1,0.3,1)';
            setTimeout(() => { card.style.transform = 'scale(1)'; }, 140);
          }
        }
      };

      // Accept Click Action
      acceptBtn.onclick = async () => {
        if (!hasToken || !curUser) {
          // Oturum yoksa davet token'ını sakla ve login ekranını aç
          localStorage.setItem('pending_invite_token', token);
          modal.style.display = 'none';
          if (typeof this.showAuth === 'function') {
            this.showAuth('login', true);
            this.showToast('Lütfen daveti onaylamak için önce hesabınıza giriş yapın.', 'info');
          }
          return;
        }

        if (!isMatchingAccount) {
          this.showToast('Bu davet sizin hesabınıza ait değil. Lütfen davet edilen e-posta ile giriş yapın.', 'error');
          return;
        }

        // Oturum varsa resmi katılımı tamamla
        modal.style.display = 'none';
        await this.handleAcceptInvite(token);
      };

      // Davet kartındaki doğrudan "Giriş Yap" ve "Kayıt Ol" butonları
      const goLoginBtn = document.getElementById('teamInviteGoLoginBtn');
      if (goLoginBtn) {
        goLoginBtn.onclick = () => {
          localStorage.setItem('pending_invite_token', token);
          modal.style.display = 'none';
          if (typeof this.showAuth === 'function') {
            this.showAuth('login', true);
            this.showToast('Giriş yaptıktan sonra davet onay ekranına yönlendirileceksiniz.', 'info');
          }
        };
      }

      const goRegisterBtn = document.getElementById('teamInviteGoRegisterBtn');
      if (goRegisterBtn) {
        goRegisterBtn.onclick = () => {
          localStorage.setItem('pending_invite_token', token);
          modal.style.display = 'none';
          if (typeof this.showAuth === 'function') {
            this.showAuth('register', true);
            this.showToast('Kayıt olduktan sonra doğrudan takıma katılım ekranına yönlendirileceksiniz.', 'info');
          }
        };
      }

      // Decline Click Action (GÜVENLİ İZOLASYON & HESAP KORUMASI)
      declineBtn.onclick = async () => {
        modal.style.display = 'none';
        localStorage.removeItem('pending_invite_token');
        this.selectedTeamId = null;

        // URL'den davet ve takım parametrelerini tamamen temizle
        window.history.replaceState({}, document.title, '/?tab=agent');

        // GÜVENLİK: Kullanıcı daveti reddettiğinde veya pencereyi kapattığında takım ekranında kalamaz!
        if (typeof this.showAppShell === 'function') {
          await this.showAppShell('agent', false);
        }

        // Eğer hesap eşleşmiyorsa veya oturum yoksa başkasının davetini reddedemez; sadece pencere kapatılır
        if (!hasToken || !curUser || !isMatchingAccount) {
          return;
        }

        // Yalnızca davet edilen hesabın sahibi bu daveti resmi olarak reddedebilir:
        try {
          const dRes = await fetch('/api/teams/decline-invite', {
            method: 'POST',
            headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ token: token })
          });
          const dData = await dRes.json();
          if (dRes.ok) {
            this.showToast(dData.message || 'Davet reddedildi.', 'info');
          } else {
            this.showToast(dData.detail || 'Davet reddedilemedi.', 'error');
          }
        } catch (e) {
          console.error(e);
        }
      };

    } catch (e) {
      this.showLoading(false);
      console.error(e);
      this.showToast('Davet bilgisi yüklenemedi.', 'error');
    }
  }

  proto.handleAcceptInvite = async function(token) {
    try {
      this.showLoading(true, 'Takıma katılımınız onaylanıyor...');
      const res = await fetch('/api/teams/accept-invite', {
        method: 'POST',
        headers: this.getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ token: token })
      });
      const data = await res.json();
      if (res.ok && data.status === 'ok') {
        this.showToast(data.message, 'success');
        
        // URL'den davet parametresini temizle
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        localStorage.removeItem('pending_invite_token');

        if (data.team_id) {
          this.selectedTeamId = data.team_id;
          const teamWsId = `ws_team_${data.team_id}`;
          localStorage.setItem('preferred_workspace_id', teamWsId);
          if (typeof this.loadUserWorkspaces === 'function') {
            await this.loadUserWorkspaces(teamWsId);
          }
        }
        if (typeof this.showAppShell === 'function') {
          await this.showAppShell('team', false);
        }
        if (typeof this.loadTeamSyncHub === 'function') {
          await this.loadTeamSyncHub();
        }
      } else {
        // Davet geçersiz veya süresi dolmuşsa da URL'yi temizle ki kullanıcı döngüde kalmasın
        window.history.replaceState({}, document.title, window.location.pathname);
        localStorage.removeItem('pending_invite_token');
        this.showToast(data.detail || 'Davet kabul edilemedi veya süresi dolmuş.', 'error');
      }
    } catch (e) {
      window.history.replaceState({}, document.title, window.location.pathname);
      localStorage.removeItem('pending_invite_token');
      this.showToast('Bağlantı hatası', 'error');
    } finally {
      this.showLoading(false);
    }
  }

  proto.loadMyActiveTask = async function(username, isCaptainOrAdmin) {
  if (!username) return;
  const workbenchCard = document.getElementById('myTaskWorkbenchCard');
  const statusTxt = document.getElementById('activeTaskStatusTxt');
  const wrap = document.getElementById('activeTaskDetailsWrap');
  const title = document.getElementById('activeTaskTitle');
  const meta = document.getElementById('activeTaskMeta');
  const noteText = document.getElementById('activeTaskNoteText');
  const badge = document.getElementById('activeTaskBadge');

  try {
    const res = await fetch(`/api/team/my-tasks?username=${encodeURIComponent(username)}`, { headers: this.getAuthHeaders() });
    const data = await res.json();
    if (res.ok && data.status === 'ok') {
      const tasks = data.tasks || [];
      const active = tasks.find(t => t.status === 'assigned') || tasks.find(t => t.status === 'submitted') || tasks[tasks.length - 1];

      if (isCaptainOrAdmin && !active) {
        // Seçenek A: Yönetici veya Kaptan ise ve kendisine atanmış görev yoksa kartı tamamen gizle
        if (workbenchCard) workbenchCard.style.display = 'none';
        return;
      }

      // Görev varsa veya normal üye ise kartı göster
      if (workbenchCard) workbenchCard.style.display = 'block';

      if (active) {
        this.currentWorkingTask = active;
        this.currentWorkingTaskId = active.id;
        if (statusTxt) statusTxt.style.display = 'none';
        if (wrap) wrap.style.display = 'block';
        if (title) title.textContent = active.title || 'Aktif Görev';
        if (meta) meta.textContent = `Proje: ${active.category} • Toplam ${active.images ? active.images.length : 0} Görsel`;
        if (noteText) noteText.textContent = active.note || 'Özel talimat belirtilmedi.';

        // Live Progress Bar & Completion Rate
        const ratioText = document.getElementById('activeTaskRatioText');
        const percentBadge = document.getElementById('activeTaskPercentBadge');
        const progBar = document.getElementById('activeTaskProgressBar');
        const lCount = active.labeled_count !== undefined ? active.labeled_count : 0;
        const tCount = active.total_count || (active.images ? active.images.length : 0);
        const percent = active.progress_percent !== undefined ? active.progress_percent : (tCount > 0 ? Math.round((lCount / tCount) * 100) : 0);

        if (ratioText) ratioText.textContent = `${lCount} / ${tCount} Görsel`;
        if (percentBadge) {
          percentBadge.textContent = `%${percent} Tamamlandı`;
          if (percent >= 100) {
            percentBadge.style.color = '#34d399';
            percentBadge.style.background = 'rgba(16,185,129,0.15)';
            percentBadge.style.borderColor = 'rgba(16,185,129,0.3)';
          } else {
            percentBadge.style.color = '#38bdf8';
            percentBadge.style.background = 'rgba(56,189,248,0.12)';
            percentBadge.style.borderColor = 'rgba(56,189,248,0.3)';
          }
        }
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
            submitBtn.innerHTML = '<span>✓ Kontrole Gönderildi (İnceleniyor)</span>';
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
            submitBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Görevi Tamamla ve Kontrole Gönder</span>';
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
          statusTxt.innerHTML = `<strong>@${this._escapeHtml(username)}</strong> üzerine atanmış aktif bir görev bulunmuyor. Yönetici size yeni bir görev atadığında burada görünecektir.`;
        }
      }
    }
  } catch (e) {
    console.error('Kişisel görev yüklenemedi:', e);
  }
}

  proto.updateDatasetDispatchOptions = async function(cat) {
  cat = this.getEffectiveCategory(cat);
  const bannerAvail = document.getElementById('dispatchAvailableCount');
  const bannerTotal = document.getElementById('dispatchTotalMeta');
  const countSelect = document.getElementById('dispatchImageCount');
  const customInput = document.getElementById('dispatchCustomCountInput');
  const taskTypeSelect = document.getElementById('dispatchTaskType');

  try {
    const res = await fetch(`/api/team/dataset-dispatch-stats?category=${encodeURIComponent(cat)}&team_id=${encodeURIComponent(this.selectedTeamId || '')}`, { headers: this.getAuthHeaders() });
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
    } else {
      if (bannerAvail) bannerAvail.textContent = '0 Görsel';
      if (bannerTotal) bannerTotal.textContent = 'Veri seti bilgisi alınamadı';
    }
  } catch (e) {
    console.error('Dispatch metrikleri yüklenemedi:', e);
    if (bannerAvail) bannerAvail.textContent = 'Hata';
    if (bannerTotal) bannerTotal.textContent = 'Bağlantı hatası';
  }
}

  proto.loadIncomingSyncPacks = async function(cat) {
  cat = cat || this.activeHubProjectId || this.currentCategory || 'accessory_detection_project';
  const listEl = document.getElementById('incomingPacksList');
  const badgeEl = document.getElementById('incomingPacksBadge');
  if (!listEl) return;

  try {
    const res = await fetch(`/api/team/incoming-packs?category=${encodeURIComponent(cat)}`, { headers: this.getAuthHeaders() });
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

                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:4px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.05); flex-wrap:wrap;">
                  <button class="scan-pack-duplicates-btn btn-secondary" data-task="${p.pack_id}" data-category="${p.category || cat || ''}" data-author="${p.author}" data-images="${imgsJson}" style="padding:6px 10px; font-size:0.75rem; font-weight:600; border-radius:6px; display:flex; align-items:center; gap:5px; cursor:pointer; color:#fbbf24; border-color:rgba(245,158,11,0.3); background:rgba(245,158,11,0.08);" title="Bu paketteki görseller arasında kopya / benzer olanları analiz et">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>Kopya Tespiti</span>
                  </button>
                  <button class="inspect-pack-images-btn btn-secondary" data-task="${p.pack_id}" data-category="${p.category || cat || ''}" data-author="${p.author}" data-images="${imgsJson}" style="padding:6px 10px; font-size:0.75rem; font-weight:600; border-radius:6px; display:flex; align-items:center; gap:5px; cursor:pointer;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <span>Görselleri Gör</span>
                  </button>
                  <button class="quick-merge-pack-btn btn-primary" data-task="${p.pack_id}" data-category="${p.category || cat || ''}" data-author="${p.author}" data-count="${p.image_count}" style="padding:6px 12px; font-size:0.75rem; font-weight:700; background:#10b981; border:none; border-radius:6px; display:flex; align-items:center; gap:5px; cursor:pointer;">
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
  };

  proto.openPackImagesModal = function(taskId, cat, author, imgList, autoScan = false) {
    const existingModal = document.getElementById('packImagesModal');
    if (existingModal) existingModal.remove();

    const token = localStorage.getItem('yolo_auth_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || '';
    const tokenQ = token ? `&token=${encodeURIComponent(token)}` : '';

    const modal = document.createElement('div');
    modal.id = 'packImagesModal';
    modal.style.cssText = `
      position: fixed; inset: 0; z-index: 100000;
      background: rgba(3, 7, 18, 0.82); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
      display: flex; align-items: center; justify-content: center; padding: 20px;
      animation: fadeIn 0.2s ease;
    `;

    const cardsHtml = imgList.map((fn, idx) => {
      const imgSrc = `/api/image-file?category=${encodeURIComponent(cat)}&filename=${encodeURIComponent(fn)}${tokenQ}`;
      return `
        <div class="pack-img-card" data-filename="${fn}" style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; cursor: pointer; transition: all 0.2s ease; position: relative;">
          <div style="position: relative; width: 100%; height: 110px; background: #090d16; display: flex; align-items: center; justify-content: center; overflow: hidden;">
            <img src="${imgSrc}" loading="lazy" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.25s ease;" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';" />
            <div style="display: none; position: absolute; inset: 0; align-items: center; justify-content: center; color: #64748b; font-size: 0.75rem;">Önizleme Yok</div>
            <span style="position: absolute; bottom: 4px; left: 4px; background: rgba(0,0,0,0.75); color: #38bdf8; font-size: 0.65rem; font-weight: 700; padding: 1px 5px; border-radius: 4px;">#${idx + 1}</span>
          </div>
          <div style="padding: 6px 8px; background: rgba(0,0,0,0.3); border-top: 1px solid rgba(255, 255, 255, 0.05);">
            <div style="color: #cbd5e1; font-size: 0.7rem; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${fn}">${fn}</div>
          </div>
        </div>
      `;
    }).join('');

    modal.innerHTML = `
      <div style="background: linear-gradient(145deg, rgba(22, 30, 52, 0.98), rgba(12, 17, 34, 0.99)); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 16px; box-shadow: 0 25px 60px -15px rgba(0,0,0,0.9), 0 0 40px rgba(56,189,248,0.15); width: 100%; max-width: 960px; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden;">
        
        <!-- Header -->
        <div style="padding: 16px 22px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; align-items: center; justify-content: space-between; background: rgba(255,255,255,0.02); flex-wrap:wrap; gap:10px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(56,189,248,0.12); border: 1px solid rgba(56,189,248,0.3); display: flex; align-items: center; justify-content: center; color: #38bdf8;">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
            </div>
            <div>
              <h3 style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 700; display: flex; align-items: center; gap: 8px;">
                <span>Teslim Edilen Paket Görselleri</span>
                <span style="background: rgba(16,185,129,0.15); color: #34d399; font-size: 0.72rem; padding: 2px 8px; border-radius: 6px; border: 1px solid rgba(16,185,129,0.3);">@${author}</span>
              </h3>
              <p style="margin: 2px 0 0; color: #94a3b8; font-size: 0.78rem;">
                Toplam <strong>${imgList.length}</strong> görsel • Proje: <strong style="color: #38bdf8;">${cat}</strong>
                <span id="packDupSummaryText" style="margin-left:8px; font-weight:600;"></span>
              </p>
            </div>
          </div>
          
          <div style="display: flex; align-items: center; gap: 10px;">
            <button id="packModalScanDuplicatesBtn" style="padding: 8px 14px; background: rgba(245,158,11,0.15); border: 1px solid rgba(245,158,11,0.4); border-radius: 8px; color: #fbbf24; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: all 0.2s ease;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>🛡️ Kopya Tespiti Yap</span>
            </button>
            <button id="packModalOpenEditorBtn" style="padding: 8px 16px; background: linear-gradient(135deg, #0284c7, #2563eb); border: none; border-radius: 8px; color: #ffffff; font-size: 0.8rem; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 14px rgba(37,99,235,0.4); transition: transform 0.15s ease;">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>Editörde İncele (QA / Review)</span>
            </button>
            <button id="packModalCloseBtn" style="width: 32px; height: 32px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #94a3b8; font-size: 1.1rem; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.15s ease;">✕</button>
          </div>
        </div>

        <!-- Grid Body -->
        <div style="padding: 18px 22px; overflow-y: auto; flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px;">
          ${cardsHtml}
        </div>

        <!-- Footer -->
        <div style="padding: 12px 22px; border-top: 1px solid rgba(255, 255, 255, 0.08); background: rgba(0,0,0,0.25); display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; color: #64748b;">
            💡 İpucu: Herhangi bir görsele tıklayarak veya yukarıdaki "Editörde İncele" butonu ile sadece bu paketteki resimleri tuvalde denetleyebilirsiniz.
          </span>
          <button id="packModalCloseBtn2" class="btn-secondary" style="padding: 6px 16px; font-size: 0.78rem; border-radius: 6px; cursor: pointer;">Kapat</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelector('#packModalCloseBtn')?.addEventListener('click', closeModal);
    modal.querySelector('#packModalCloseBtn2')?.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    // Kopya Tespiti Fonksiyonu
    const doScanDuplicates = async () => {
      const dupBtn = modal.querySelector('#packModalScanDuplicatesBtn');
      const summaryText = modal.querySelector('#packDupSummaryText');
      if (dupBtn) {
        dupBtn.disabled = true;
        dupBtn.innerHTML = '<span class="spinner" style="width:12px; height:12px; border-width:2px; display:inline-block; margin-right:4px;"></span> Taranıyor...';
      }
      try {
        const res = await fetch(`/api/projects/scan-duplicates?category=${encodeURIComponent(cat)}&filenames=${encodeURIComponent(imgList.join(','))}`, {
          headers: this.getAuthHeaders()
        });
        const dData = await res.json();
        const groups = dData.duplicate_groups || [];
        const dupFilesMap = new Map();
        groups.forEach(g => {
          const sim = g.similarity_pct || 95;
          (g.duplicates || []).forEach(df => dupFilesMap.set(df, sim));
          if (g.original) dupFilesMap.set(g.original, 100);
        });

        modal.querySelectorAll('.pack-img-card').forEach(card => {
          const fn = card.dataset.filename;
          let oldBadge = card.querySelector('.dup-badge');
          if (oldBadge) oldBadge.remove();

          if (dupFilesMap.has(fn)) {
            card.style.borderColor = '#ef4444';
            card.style.boxShadow = '0 0 14px rgba(239,68,68,0.35)';
            const badge = document.createElement('span');
            badge.className = 'dup-badge';
            badge.style.cssText = 'position:absolute; top:4px; right:4px; background:#ef4444; color:#fff; font-size:0.65rem; font-weight:700; padding:2px 6px; border-radius:4px; z-index:2; box-shadow:0 2px 6px rgba(0,0,0,0.5);';
            badge.textContent = `⚠️ Kopya (%${dupFilesMap.get(fn)})`;
            card.querySelector('div').appendChild(badge);
          } else {
            card.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            card.style.boxShadow = 'none';
          }
        });

        if (dupFilesMap.size === 0) {
          if (summaryText) {
            summaryText.style.color = '#34d399';
            summaryText.textContent = '• ✓ Kopya/mükerrer görsel bulunamadı (Temiz)';
          }
          this.showToast('Tebrikler! Bu pakette hiçbir mükerrer/kopya görsel bulunamadı ✓', 'success');
        } else {
          if (summaryText) {
            summaryText.style.color = '#f87171';
            summaryText.textContent = `• ⚠️ ${dupFilesMap.size} adet kopya/benzer görsel işaretlendi!`;
          }
          this.showToast(`Bu pakette ${dupFilesMap.size} adet muhtemel kopya/benzer görsel tespit edildi!`, 'warning');
        }
      } catch (err) {
        console.error('Pack duplicate scan error:', err);
        this.showToast('Kopya taraması başarısız oldu', 'error');
      } finally {
        if (dupBtn) {
          dupBtn.disabled = false;
          dupBtn.innerHTML = '<span>🛡️ Yeniden Tara</span>';
        }
      }
    };

    modal.querySelector('#packModalScanDuplicatesBtn')?.addEventListener('click', doScanDuplicates);
    if (autoScan) {
      setTimeout(() => doScanDuplicates(), 250);
    }

    // Editörde İncele Butonu
    modal.querySelector('#packModalOpenEditorBtn')?.addEventListener('click', () => {
      closeModal();
      this.currentCategory = cat;
      this.currentBatchFilenamesFilter = imgList;
      this.currentBatchTaskTitle = `@${author} - Teslim Paketi (${imgList.length} Görsel)`;
      this.showEditor(cat);
    });

    // Karta tıklama: Doğrudan editörde o görseli aç
    modal.querySelectorAll('.pack-img-card').forEach(card => {
      card.addEventListener('mouseenter', () => {
        if (!card.querySelector('.dup-badge')) card.style.borderColor = 'rgba(56, 189, 248, 0.6)';
        card.style.transform = 'translateY(-2px)';
        const img = card.querySelector('img');
        if (img) img.style.transform = 'scale(1.05)';
      });
      card.addEventListener('mouseleave', () => {
        if (!card.querySelector('.dup-badge')) card.style.borderColor = 'rgba(255, 255, 255, 0.08)';
        card.style.transform = 'translateY(0)';
        const img = card.querySelector('img');
        if (img) img.style.transform = 'scale(1)';
      });
      card.addEventListener('click', () => {
        const targetFn = card.dataset.filename;
        closeModal();
        this.currentCategory = cat;
        this.currentBatchFilenamesFilter = imgList;
        this.currentBatchTaskTitle = `@${author} - Teslim Paketi (${imgList.length} Görsel)`;
        this.showEditor(cat);
        setTimeout(() => {
          if (this.filteredImages && targetFn) {
            const idx = this.filteredImages.findIndex(img => img.filename === targetFn);
            if (idx !== -1) this.goToIndex(idx);
          }
        }, 300);
      });
    });
  };
}

if (typeof window !== 'undefined') {
  window.installTeamsModule = installTeamsModule;
  if (window.DatasetEditor) {
    installTeamsModule(window.DatasetEditor);
  }
}
