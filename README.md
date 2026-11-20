# POLYMINER

Minimalist 2D bir madencilik oyunu (Motherload tarzı). Matkaplı aracınla yeraltına in, maden topla, yüzeyde sat, aracını geliştir ve en dipteki **Kadim Dodecagon Çekirdeği**'ne ulaş.

**[▶ Oyna](https://y-onurkaan.github.io/polyminer/)**

Saf TypeScript + HTML5 Canvas 2D. Oyun motoru yok. Vite ile derlenir.

## Fikir

Madenler düzgün çokgen olarak çizilir. **Kenar sayısı arttıkça değeri artar.**

| Maden | Şekil | Değer | Başlangıç derinliği |
|---|---|---|---|
| Bakır | Üçgen | 30 | 3 |
| Demir | Kare | 55 | 22 |
| Gümüş | Beşgen | 110 | 65 |
| Altın | Altıgen | 200 | 131 |
| Zümrüt | Yedigen | 420 | 180 |
| Elmas | Sekizgen | 900 | 222 |
| Kadim Çekirdek | On ikigen | 50000 | 274 |

## Özellikler

- 4 biyom: Üst Kabuk, Kuvars Mağaraları, Bazalt & Gaz Katmanı, Magma Çekirdeği (550m derinlik); 3-4. katmanlarda yalnız derin madenler (Altın, Zümrüt ve kanat jeodlarında Elmas) bulunur
- **Damar & Jeod Üretimi + Eksen Dışı Mühürlü Çekirdek:** Zengin damarlar ağırlıklı olarak kanatlara yerleşir; Kadim Çekirdek her oyunda rastgele bir kanatta kırılmaz Temel Kaya (Bedrock) odasında gizlidir ve Radar Sv.4-5 sismik sensörle tespit edilir
- **Online Co-op (P2P WebRTC / PeerJS):** Sunucusuz, oda koduyla (`POLY-XXXXXX`) arkadaşlarınla birlikte madencilik yapma, ortak şirket kasası, anlık tünel/ray paylaşımı ve özelleştirilebilir Mecha Pod renkleri
- Pürüzsüz düşme hasarı ve itici kontrolü: `1` blok düşüş güvenli (`0` hasar), daha yüksek düşüşlerde pürüzsüz üstel hasar eğrisi ve `[W]` ile ekstra `%50` retro-fren yavaşlatması
- Yakıt (`60L` başlangıç deposu, `$1.00/L`), gövde hasarı, derinlik/magma yakınlığı harareti ve radyatör yönetimi
- Dükkân: matkap, gövde, yakıt deposu, tavan uçuş hızını artıran motor, radar ve radyatör geliştirmeleri
- Sarf malzemeleri: yedek yakıt, tamir kiti, ışınlayıcı, dinamit (Bedrock & Çekirdeğe bağışık), asansör rayı ($25; 1-3. katmanda serbest)
- Manyetik asansör rayı ile 1-3. katmanlarda yakıtsız, hasarsız ve otomatik yukarı/aşağı seyir
- Düşen heyelan kayaları, gizli hazine sandıkları ve haritaya gömülü Arkeoloji Fosil Müzesi (Radar Sv.3+ sis altından parlar)
- Sol kenar dikey derinlik mini-radarı ve sis (fog of war)
- Güvenli otomatik kayıt (`localStorage` - misafir modunda solo kayıt korunur)
- Mobil uyumlu dokunmatik kontroller (D-Pad ve eylem butonları)

## Online Co-op Nasıl Oynanır?

1. Üst bardaki **`[ 🌐 ONLINE CO-OP ]`** butonuna tıkla.
2. Kullanıcı adını ve Mecha Pod şasi rengini seç.
3. **Oda Kur (Host):** Tek tıkla `POLY-XXXXXX` oda kodu üret ve arkadaşına gönder.
4. **Odaya Katıl (Misafir):** Arkadaşından aldığın kodu girip bağlan.

### Ağ ve Kayıt Mimarisi
- **P2P WebRTC:** Tarayıcılar arasında doğrudan eşler arası (PeerJS genel sunucusu üzerinden sinyalleşme ile) iletişim kurulur. TURN röle sunucusu bulunmadığından katı simetrik NAT/kurumsal güvenlik duvarı arkasındaki bazı ağlarda doğrudan bağlantı kurulamayabilir.
- **Arkadaş Grubu Co-op ve Kasa Senkronizasyonu:** Hızlı tepki veren P2P oyun deneyimi için tasarlanmıştır (anti-cheat sunucusu değil, arkadaş grubu oturumu). Tüm bakiye değişimleri Host'a iletilir, bakiye/borç limitine (`MAX_DEBT_ALLOWED = -$1000`) göre doğrulanır ve tekil bakiye olarak yayınlanır; reddedilen misafir satın almaları `txId` ile yerelde otomatik geri alınır.
- **Solo Kayıt Koruması:** Misafir olarak oynarken yerel `localStorage` kaydın (`polyminer_save_v1`) kesinlikle ezilmez; dünya ilerlemesi Host'ta tutulur. Odadan ayrıldığında veya bağlantı koptuğunda kendi solo madenine temizce dönersin.

## Kontroller

| Tuş | İşlev |
|---|---|
| `W` `A` `S` `D` / Ok tuşları | Hareket, roket itkisi, kazma |
| `R` | Yedek yakıt kullan |
| `T` | Gövde tamir kiti kullan |
| `Q` | Yüzeye acil durum ışınlanması |
| `X` | Sismik dinamit patlat |
| `C` | Asansör rayı döşe (basılı tut) |
| `2x W` / `2x S` | Raydayken otomatik yukarı / aşağı seyir (durdur: `Boşluk`) |

Mobilde ekrandaki yön ve eylem butonları kullanılır.

## Geliştirme

```bash
npm install
npm run dev      # geliştirme sunucusu (http://localhost:5173)
npm run build    # tsc + vite build -> dist/
npm run preview  # build çıktısını önizle
```

`main` dalına yapılan her push, GitHub Actions ile GitHub Pages'e yayınlanır (`.github/workflows/deploy.yml`).

Mimari için [ARCHITECTURE.md](ARCHITECTURE.md) dosyasına bak.

## Lisans

[MIT](LICENSE)
