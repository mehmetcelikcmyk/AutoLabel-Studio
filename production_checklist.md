# 🚀 YOLO Editor — Canlıya Alma (Production Deployment) Kılavuzu

Bu kılavuz, uygulamanızı kendi kiraladığınız bir Linux VPS sunucusunda (Hetzner, DigitalOcean, AWS, Linode vb.) Docker ve ücretsiz SSL ile 15 dakika içinde yayına almanızı sağlar.

---

## 📋 Hazırlık & Gereksinimler

1. **Bir Linux Sunucu (VPS):**
   - **Tavsiye:** Hetzner Cloud (CPX21 veya CX31) ya da DigitalOcean Droplet.
   - **İşletim Sistemi:** Ubuntu 22.04 veya 24.04 LTS.
   - **Özellikler:** En az 2 vCPU, 4 GB RAM (YOLO modelleri için 8 GB RAM idealdir).
2. **Bir Alan Adı (Domain):**
   - Örneğin: `etiketleme.sirketiniz.com` veya `yolo.sirketiniz.com`.

---

## 🛠️ Adım 1: Alan Adınızı (DNS) Sunucuya Yönlendirin

1. Alan adı sağlayıcınızın (Cloudflare, GoDaddy, Namecheap vb.) DNS yönetimine girin.
2. Yeni bir **A Kaydı (A Record)** ekleyin:
   - **Tür (Type):** `A`
   - **Ad (Name):** `etiketleme` (veya `yolo` veya ana domain için `@`)
   - **Değer (IPv4 Address):** Sunucunuzun IP adresi (Örn: `159.65.120.45`)
   - **TTL:** Otomatik veya 5 dakika.

---

## ⚡ Adım 2: Sunucuda Docker'ı Kurun

Sunucunuza SSH ile bağlanın (`ssh root@SUNUCU_IP`):
```bash
# Sistemi güncelleyin
sudo apt update && sudo apt upgrade -y

# Docker ve Docker Compose'u resmi script ile kurun
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh

# Docker'ın çalıştığını doğrulayın
docker --version
docker compose version
```

---

## 📦 Adım 3: Projeyi Sunucuya Aktarın

Sunucunuzda bir klasör açın ve dosyaları aktarın:
```bash
mkdir -p /opt/yolo-editor
cd /opt/yolo-editor
```
*Dosyaları Git ile aktarabilirsiniz:*
```bash
git clone <sizin-repo-adresiniz> .
```
*(Veya FileZilla / WinSCP / SCP kullanarak bilgisayarınızdaki proje klasörünü sunucuya yükleyebilirsiniz).*

---

## ⚙️ Adım 4: Canlı Ortam Dosyasını (`.env`) Oluşturun

Sunucuda `.env.example` dosyasını `.env` olarak kopyalayın ve düzenleyin:
```bash
cp .env.example .env
nano .env
```

Aşağıdaki alanları kendi canlı bilgilerinize göre doldurun:
```env
HOST=0.0.0.0
PORT=8000
ALLOWED_ORIGINS="https://etiketleme.sirketiniz.com"

# 64 karakterli rastgele güvenli anahtar (Terminalde: openssl rand -hex 32)
JWT_SECRET_KEY=b8f3c7e492a819d924f7e2a912c01994e6d782194fbcde7192a01

# Gmail SMTP Bilgileri (Kayıt ve şifre sıfırlama mailleri için)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=ornek_hesap@gmail.com
SMTP_PASSWORD=gmail_16_haneli_uygulama_sifresi
SMTP_FROM="YOLO Platformu <ornek_hesap@gmail.com>"

# Cloudflare D1 ve R2 (Kullanıyorsanız)
CLOUDFLARE_API_TOKEN=sizin_tokeniniz
CLOUDFLARE_ACCOUNT_ID=sizin_account_id
CLOUDFLARE_D1_DATABASE_ID=sizin_d1_id
CLOUDFLARE_R2_BUCKET_NAME=sizin_r2_bucket
```
Kaydetmek için `CTRL+O`, çıkmak için `CTRL+X` tuşlarına basın.

---

## 🚀 Adım 5: Uygulamayı Başlatın (Docker)

```bash
docker compose up -d --build
```
Logları kontrol edin:
```bash
docker compose logs -f
```
`YOLO Editor v2.0 - Sunucu baslatiliyor → http://localhost:8000` yazısını gördüğünüzde uygulama çalışıyor demektir!

---

## 🔒 Adım 6: Ücretsiz SSL (HTTPS) Kurulumu (Caddy veya Nginx)

Sitenizi `https://` ile güvenli yapmak için en pratik ve modern araç **Caddy**'dir (Otomatik SSL sağlar):

```bash
# Caddy'yi kurun
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y
```

Caddy yapılandırma dosyasını açın:
```bash
sudo nano /etc/caddy/Caddyfile
```
İçine sadece şu 4 satırı yazın (Kendi domain adresinizi yazınız):
```caddy
etiketleme.sirketiniz.com {
    reverse_proxy 127.0.0.1:8000
}
```
Kaydedin ve Caddy'yi yeniden başlatın:
```bash
sudo systemctl restart caddy
```

🎉 **TEBRİKLER!**
Artık tarayıcınızdan `https://etiketleme.sirketiniz.com` adresine girdiğinizde yeşil kilitli (SSL'li), çok kullanıcılı ve AI destekli YOLO Editor sisteminiz canlıda hizmet vermektedir!

---

## 🔄 Bakım ve Yönetim Komutları

| İşlem | Komut |
|---|---|
| **Canlı Logları İzleme** | `docker compose logs -f` |
| **Uygulamayı Durdurma** | `docker compose down` |
| **Uygulamayı Yeniden Başlatma** | `docker compose restart` |
| **Kod Güncellemesi Sonrası Yenileme** | `git pull && docker compose up -d --build` |
| **Disk ve Bellek Durumu** | `docker stats` |
