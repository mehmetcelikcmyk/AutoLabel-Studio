# -*- coding: utf-8 -*-
import sys
import os
sys.path.insert(0, os.path.abspath('.'))
import re
from scripts.generate_templates import templates

with open('static/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

cards_html = []
for t in templates:
    cls_tags = ''.join([f'<span class="explore-class-pill"><i style="background:{c[1]}"></i> {c[0]}</span>' for c in t['classes']])
    card = f'''            <!-- {t["title"]} -->
            <div class="explore-card" data-tmpl="{t['tmpl']}" data-category="{t['cat']}">
              <div class="explore-card-banner {t['banner']}">
                <span class="explore-banner-pill">{t['pill']}</span>
              </div>
              <div class="explore-card-body">
                <div class="explore-card-meta">
                  <span class="explore-badge {t['badge_cls']}">{t['badge']}</span>
                  <span class="explore-type-tag">{t['type']}</span>
                </div>
                <h3>{t['title']}</h3>
                <p>{t['desc']}</p>
                <div class="explore-class-tags">
                  {cls_tags}
                </div>
                <div class="explore-card-footer">
                  <span class="explore-model-hint">{t['hint']}</span>
                  <button class="btn-secondary btn-sm explore-use-btn" data-tmpl="{t['tmpl']}">Şablonu Kullan</button>
                </div>
              </div>
            </div>'''
    cards_html.append(card)

full_grid_html = '\n\n'.join(cards_html)

new_body = f'''        <div class="view-content-body">

          <!-- SECTION 1: PUBLIC / COMMUNITY PROJECTS (Dinamik Açık Projeler) -->
          <div class="explore-section-header" id="explorePublicSectionHeader">
            <div class="explore-section-title-wrap">
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                <span>Açık Topluluk Veri Setleri &amp; Projeleri</span>
                <span class="proj-badge-count" id="explorePublicCountBadge" style="background:rgba(59,130,246,0.15); color:#60a5fa; border:1px solid rgba(59,130,246,0.3); font-size:0.75rem; padding:2px 8px; border-radius:99px; font-weight:700;">0 Proje</span>
              </h3>
              <p>Topluluk ve sistem tarafından herkese açık (public) olarak paylaşılan, doğrudan incelenebilir canlı veri setleri.</p>
            </div>
          </div>

          <div class="explore-public-grid" id="explorePublicProjectsGrid">
            <div class="dash-loading-card" style="grid-column: 1 / -1;">Açık projeler taranıyor...</div>
          </div>

          <!-- SECTION 2: CURATED INDUSTRY TEMPLATES & BLUEPRINTS (45+ Sektörel Şablon) -->
          <div class="explore-section-header" style="margin-top: 40px;">
            <div class="explore-section-title-wrap">
              <h3>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" stroke-width="2.2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                <span>Hazır Başlangıç Şablonları ({len(templates)} Sektörel Model)</span>
              </h3>
              <p>YOLOv8 &amp; YOLOWorld için optimize edilmiş, hazır sınıf etiketleri ve promptları içeren endüstriyel şablonlar.</p>
            </div>
          </div>

          <div class="explore-templates-grid" id="exploreTemplatesGrid">
{full_grid_html}
          </div>
        </div>'''

pattern = re.compile(r'(<section id="exploreView" class="workspace-view">.*?<header.*?</header>\s*)<div class="view-content-body">.*?</div>\s*</section>', re.DOTALL)
m = pattern.search(content)
if not m:
    print('ERROR: exploreView pattern not found')
    sys.exit(1)

new_content = content[:m.start(1)] + m.group(1) + new_body + '\n      </section>' + content[m.end():]

old_select = '''                <option value="all">Tüm Kategoriler</option>
                <option value="safety">İş Güvenliği</option>
                <option value="traffic">Trafik &amp; Ulaşım</option>
                <option value="industry">Endüstriyel Üretim</option>
                <option value="retail">Perakende &amp; Lojistik</option>
                <option value="agriculture">Tarım &amp; Doğa</option>
                <option value="drone">Drone &amp; Hava Gözlem</option>
                <option value="medical">Sağlık &amp; Biyomedikal</option>'''

new_select = '''                <option value="all">Tüm Kategoriler (45+ Şablon)</option>
                <option value="safety">İş Güvenliği &amp; KKD</option>
                <option value="traffic">Trafik &amp; Akıllı Ulaşım</option>
                <option value="industry">Endüstriyel Üretim &amp; Kalite</option>
                <option value="retail">Perakende &amp; Lojistik</option>
                <option value="agriculture">Tarım, Orman &amp; Doğa</option>
                <option value="drone">Drone, Enerji &amp; Savunma</option>
                <option value="medical">Sağlık &amp; Biyomedikal</option>
                <option value="sports">Spor, Ergonomi &amp; Analiz</option>
                <option value="security">Asayiş &amp; Güvenlik</option>'''

if old_select in new_content:
    new_content = new_content.replace(old_select, new_select)
    print('Category filter dropdown options updated.')

with open('static/index.html', 'w', encoding='utf-8') as f:
    f.write(new_content)

print('SUCCESS: static/index.html exploreView updated with', len(templates), 'templates.')
