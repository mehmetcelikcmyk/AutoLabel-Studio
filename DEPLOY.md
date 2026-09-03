# 🚀 YOLO Editor — Canlıya Alma (Deployment) Rehberi

Bu rehber, YOLO Editor uygulamasını **Docker** kullanarak herhangi bir bulut sunucuda (Hetzner, DigitalOcean, AWS, vb.) canlıya alma adımlarını içerir.

---

## 🛠️ 1. Sunucu Gereksinimleri
* **İşletim Sistemi:** Ubuntu 22.04 / 24.04 LTS (veya Debian)
* **Önerilen Donanım:** 4 vCPU, 8 GB RAM (Aylık ~5-8€)
* **Yazılım:** Docker & Docker Compose

---

## ⚡ 2. Hızlı Kurulum (Tek Komutla)

### Adım 1: Sunucuda Docker'ı Kurun (Eğer kurulu değilse)
Sunucunuza SSH ile bağlanıp şu komutu çalıştırın:
```bash
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh
```

### Adım 2: Proje Dosyalarını Sunucuya Yükleyin
Proje klasörünüzü sunucuya atın (Git clone veya SCP/FileZilla ile).

### Adım 3: Uygulamayı Başlatın
Proje klasörünün içine girip tek bir komut verin:
```bash
docker compose up -d --build
```

🎉 **Tebrikler!** Uygulamanız canlıda. Tarayıcınızdan:
`http://SUNUCU_IP_ADRESINIZ:8000` adresine girerek hemen kullanabilirsiniz.

---

## 🔄 3. Faydalı Docker Komutları

| İşlem | Komut |
|---|---|
| **Logları Canlı İzleme** | `docker compose logs -f` |
| **Uygulamayı Durdurma** | `docker compose down` |
| **Uygulamayı Yeniden Başlatma** | `docker compose restart` |
| **Güncelleme Sonrası Yeniden Derleme** | `docker compose up -d --build` |

---

## 🔒 4. Çoklu Kullanıcı & Güvenlik Tavsiyeleri
* **Domain & SSL (https):** Nginx Proxy Manager veya Caddy kullanarak `https://etiketleme.sirketiniz.com` şeklinde SSL'li alan adı bağlayabilirsiniz.
* **Yedekleme:** Sunucudaki proje klasörünüz (`project_config.json` ve `[kategori]_labeled` klasörleri) volume olarak bağlı olduğu için verileriniz konteyner kapansa bile asla kaybolmaz.
