# 🎵 Alkan Player

Modern, şık ve güçlü bir masaüstü müzik oynatıcı. Yerel ses dosyalarını oynatabilir, YouTube'dan müzik indirebilir ve YouTube Music entegrasyonu ile çevrimiçi müzik keyfini yaşayabilirsiniz.

![Electron](https://img.shields.io/badge/Electron-28-47848F?logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)
![Version](https://img.shields.io/badge/Version-1.4.0-blue)

---

## ✨ Özellikler

### 🎶 Yerel Müzik Oynatma
- **Desteklenen formatlar:** MP3, FLAC, WAV, OGG, M4A, AAC, WMA, OPUS, AIFF
- Klasör tarama ile toplu müzik ekleme
- ID3 metadata okuma (şarkı adı, sanatçı, albüm, kapak resmi)
- Kütüphane yönetimi ve kalıcı saklama

### 📥 YouTube İndirme
- YouTube videolarından MP3 formatında müzik indirme
- Otomatik ID3 tag yazma (başlık, sanatçı, kapak resmi)
- Özelleştirilebilir indirme klasörü
- `yt-dlp` ile yüksek kaliteli ses çıkarma

### 🎧 YouTube Music Entegrasyonu
- Google hesabınızla YouTube Music'e giriş yapma
- Ana sayfa önerileri ve kişiselleştirilmiş içerik
- YouTube Music'te şarkı arama
- Çalma listelerini görüntüleme ve oynatma
- Doğrudan akış ile şarkı önizleme

### 🎛️ Equalizer
- 10 bantlı parametrik equalizer (60Hz – 16kHz)
- Gerçek zamanlı ses işleme (Web Audio API)
- Stereo VU metre ve spektrum analizi

### 🎨 Kullanıcı Arayüzü
- Özel çerçevesiz (frameless) pencere tasarımı
- Koyu tema, modern ve minimal arayüz
- Sidebar navigasyon (Kütüphane, Çalma Listeleri, YouTube, YT Music, Equalizer, Ayarlar)
- Şarkı arama ve filtreleme
- Sürükle-bırak desteği

### 📋 Çalma Listeleri
- Özel çalma listeleri oluşturma ve yönetme
- Çalma listelerini kalıcı olarak saklama
- Karıştırma (shuffle) ve tekrar (repeat) modları

---

## 🚀 Kurulum

### Gereksinimler
- [Node.js](https://nodejs.org/) (v18 veya üzeri)
- [Git](https://git-scm.com/) (opsiyonel)

### Adımlar

```bash
# Repoyu klonlayın
git clone https://github.com/kullaniciadi/alkan-player.git
cd alkan-player

# Bağımlılıkları yükleyin
npm install

# Uygulamayı başlatın
npm start
```

---

## 🛠️ Geliştirme

```bash
# Geliştirici modunda çalıştırma (DevTools açık)
npm run dev

# Windows için kurulum dosyası oluşturma (NSIS installer)
npm run build

# Windows için taşınabilir (portable) sürüm oluşturma
npm run build:portable
```

---

## 📁 Proje Yapısı

```
alkan-player/
├── main.js            # Electron ana süreç (pencere, IPC, dosya işlemleri)
├── preload.js         # Renderer ile ana süreç arasındaki köprü (contextBridge)
├── ytmusic.js         # YouTube Music Internal API istemcisi
├── package.json       # Proje yapılandırması ve bağımlılıklar
├── src/
│   ├── index.html     # Ana HTML arayüzü
│   ├── renderer.js    # Renderer süreci (UI mantığı, ses motoru, equalizer)
│   ├── styles.css     # Uygulama stilleri
│   └── assets/        # İkonlar ve görseller
│       ├── icon.png
│       └── icon.ico
├── downloads/         # İndirilen müzik dosyaları
└── dist/              # Build çıktıları
```

---

## ⚙️ Nasıl Çalışır?

### Mimari
Uygulama, Electron'un **ana süreç** (main process) ve **renderer süreç** mimarisi üzerine kuruludur:

1. **Ana Süreç (`main.js`):** Pencere yönetimi, dosya sistemi işlemleri, diyalog kutuları, metadata okuma, YouTube indirme ve YouTube Music API isteklerini yönetir.

2. **Preload (`preload.js`):** `contextBridge` ile güvenli bir şekilde ana süreç API'lerini renderer sürecine açar. `contextIsolation` aktif olduğu için doğrudan Node.js erişimi yoktur.

3. **Renderer (`src/renderer.js`):** Kullanıcı arayüzü mantığı, Web Audio API ile ses oynatma, equalizer, spektrum analizi ve VU metre görselleştirmesi burada çalışır.

4. **YouTube Music İstemcisi (`ytmusic.js`):** YouTube Music'in dahili API'sine (`WEB_REMIX` client) HTTPS istekleri göndererek ana sayfa, arama ve çalma listesi verilerini çeker. Kimlik doğrulama için Electron webview oturum çerezlerini kullanır.

### Ses İşleme Zinciri
```
Ses Kaynağı → EQ Filtreleri (10 bant) → Analyser → Hoparlör Çıkışı
                                           ↓
                                    Spektrum / VU Metre
```

### Veri Akışı
- **Kütüphane & Çalma Listeleri:** `userData` klasöründe JSON dosyaları olarak saklanır
- **Ayarlar:** `settings.json` olarak kalıcı saklanır
- **Metadata:** `music-metadata` kütüphanesi ile ses dosyalarından okunur
- **ID3 Tagları:** `node-id3` ile indirilen dosyalara yazılır

---

## 📦 Bağımlılıklar

| Paket | Açıklama |
|-------|----------|
| `electron` | Masaüstü uygulama çatısı |
| `electron-builder` | Windows installer oluşturucu |
| `music-metadata` | Ses dosyası metadata okuyucu |
| `node-id3` | MP3 ID3 tag okuma/yazma |
| `youtube-dl-exec` | YouTube'dan ses indirme (yt-dlp) |

---

## 📄 Lisans

Bu proje [MIT](LICENSE) lisansı ile lisanslanmıştır.

---

**Alkan Player** ile müziğin keyfini çıkarın! 🎶
