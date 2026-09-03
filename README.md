# 🤖 YOLO Editor v2.0
**AI Destekli Veri Seti Etiketleme Platformu**

YOLO Editor, nesne tespiti (object detection) için veri seti hazırlamayı kolaylaştıran, web tabanlı profesyonel bir etiketleme aracıdır. YOLOv8-World AI ile tek tıklamayla otomatik etiketleme yapabilir, manuel olarak bounding box çizebilir ve YOLO formatında dışa aktarabilirsiniz.

---

## ⚡ Hızlı Başlangıç

### 1. Gereksinimleri Kur (İlk Kez)
```
kur.bat dosyasına çift tıklayın
```
Bu script:
- Python kurulumunu kontrol eder
- Tüm bağımlılıkları otomatik kurar
- YOLO model dosyalarını indirir

### 2. Uygulamayı Başlat
```
baslat.bat dosyasına çift tıklayın
```
Uygulama otomatik olarak tarayıcınızda açılır (`http://localhost:8000`).

---

## 🔧 Manuel Kurulum (Terminal ile)

```bash
# 1. Python bağımlılıklarını kur
pip install -r requirements.txt

# 2. Uygulamayı başlat
python app.py

# 3. Farklı port ile başlat
python app.py --port 8080

# 4. Tarayıcı açmadan başlat
python app.py --no-browser
```

---

## 📋 Sistem Gereksinimleri

| Gereksinim | Versiyon |
|---|---|
| Python | 3.10 veya üzeri |
| RAM | Minimum 4 GB (8 GB önerilir) |
| Disk | 2 GB boş alan (modeller için) |
| Tarayıcı | Chrome, Firefox, Edge (güncel) |

---

## 🎯 Özellikler

| Özellik | Açıklama |
|---|---|
| **Proje Yönetimi** | Birden fazla veri seti projesi oluştur/düzenle/sil |
| **Görsel Yükleme** | Sürükle-bırak ile toplu görsel ve .txt etiket yükleme |
| **Manuel Etiketleme** | Canvas üzerinde bounding box çizimi |
| **AI Otomatik Etiketleme** | YOLOv8-World ile tek görsel AI tahmini |
| **Toplu AI Etiketleme** | Arka planda tüm veri setini AI ile etiketle |
| **Sınıf Yönetimi** | Her proje için özel sınıf, renk ve AI prompt tanımla |
| **Benzerlik Arama** | Template matching ile benzer nesneleri bul |
| **Dışa Aktarma** | Train/Val split + data.yaml ile YOLO ZIP paketi |
| **İstatistik** | Etiketleme yüzdesi, box dağılımı takibi |

---

## 📁 Klasör Yapısı

```
yolo-editor/
├── 📄 README.md           ← Bu dosya
├── 📄 requirements.txt    ← Python bağımlılıkları
├── 🦇 kur.bat             ← Kurulum scripti (çift tık ile çalıştır)
├── 🦇 baslat.bat          ← Başlatıcı (çift tık ile çalıştır)
├── 🐍 app.py              ← FastAPI backend
├── 📄 project_config.json ← Proje ve sınıf ayarları
├── 📁 static/             ← Web arayüzü
│   ├── index.html
│   ├── editor.js
│   ├── style.css
│   └── logo.png
├── 🤖 yolov8n.pt          ← Küçük YOLO modeli
└── 🤖 yolov8s-worldv2.pt  ← YOLOWorld modeli (open-vocab AI)
```

---

## 🖥️ Kullanım Kılavuzu

### Yeni Proje Oluşturma
1. Dashboard'da **"+ Yeni Proje / Klasör"** butonuna tıklayın
2. Proje adını ve sınıf bilgilerini doldurun
3. Görselleri sürükleyip bırakarak yükleyin

### Manuel Etiketleme
1. Sol panelden bir görsel seçin
2. Kanvasta bounding box çizmek için tıklayıp sürükleyin
3. Sağ tık menüsünden sınıf değiştirebilirsiniz
4. **Ctrl+S** veya Oto-Kaydet ile kaydedin

### AI Otomatik Etiketleme
1. Görsele sağ tıklayın → **"🤖 AI ile Otomatik Çiz"**
2. Ya da üst menüden **Batch AI** ile tüm seti etiketleyin
3. Sonuçları gözden geçirip düzeltebilirsiniz

### Dışa Aktarma
1. Dashboard'da projeyi seçin → **Proje Ayarları**
2. **"ZIP İndir (YOLO Format)"** butonuna tıklayın
3. Train/Val split otomatik yapılır, `data.yaml` dahil edilir

---

## ⌨️ Klavye Kısayolları

| Kısayol | Eylem |
|---|---|
| `A` / `←` | Önceki görsel |
| `D` / `→` | Sonraki görsel |
| `Ctrl+S` | Manuel kaydet |
| `Ctrl+I` | AI otomatik etiketle |
| `Delete` | Seçili kutuyu sil |
| `Ctrl+Z` | Geri al |
| `X` | Görseli işaretle (flag) |
| `F` | Tam ekran / Zen modu |
| `[` / `]` | Sol/Sağ paneli gizle/göster |

---

## 🌐 Başka Bilgisayarda Kullanım

Uygulamayı başka bir bilgisayara taşımak için:

1. Tüm klasörü kopyalayın (`.pt` model dosyaları dahil)
2. Hedef bilgisayarda Python 3.10+ kurulu olduğundan emin olun
3. `kur.bat` çalıştırarak bağımlılıkları kurun
4. `baslat.bat` ile başlatın

> **Not**: `yolov8s-worldv2.pt` (~25MB) ve `yolov8n.pt` (~6MB) dosyaları ağır olduğundan, klasörle birlikte taşımanız önerilir. Yoksa ilk çalıştırmada otomatik indirilir (internet gerektirir).

---

## ❓ Sorun Giderme

**"Python bulunamadı" hatası:**
→ https://www.python.org/downloads/ adresinden Python 3.10+ indirin, kurulum sırasında "Add to PATH" seçeneğini işaretleyin.

**"Port kullanımda" hatası:**
→ `baslat.bat` otomatik olarak boş port arar (8000–8010). Ya da manuel: `python app.py --port 8080`

**Modeller yüklenmiyor:**
→ İnternet bağlantısını kontrol edin, `kur.bat` dosyasını yeniden çalıştırın.

**Görsel açılmıyor:**
→ Dosya adında Türkçe karakter veya boşluk varsa sorun çıkabilir. Dosya adını düzeltmeyi deneyin.

---

## 📜 Lisans
MIT License — özgürce kullanabilir, değiştirebilir ve paylaşabilirsiniz.
