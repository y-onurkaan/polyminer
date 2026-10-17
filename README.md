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
| Altın | Altıgen | 240 | 130 |
| Zümrüt | Yedigen | 520 | 185 |
| Elmas | Sekizgen | 1350 | 225 |
| Kadim Çekirdek | On ikigen | 50000 | 274 |

## Özellikler

- 4 biyom: Üst Kabuk, Kuvars Mağaraları, Bazalt & Gaz Katmanı, Magma Çekirdeği (550m derinlik)
- **Online Co-op (P2P WebRTC / PeerJS):** Sunucusuz, oda koduyla (`POLY-XXXX`) arkadaşlarınla birlikte madencilik yapma, ortak şirket kasası, anlık tünel/ray paylaşımı ve özelleştirilebilir Mecha Pod renkleri
- Gerçekçi düşme hasarı: 1 blok güvenli (0 hasar), 2 blok -30 HP, 3+ blok derin düşüşlerde +%20 ceza, 10 blokta terminal uçurum tavanı
- Yakıt, gövde hasarı, ısı ve hararet yönetimi
- Dükkân: matkap, gövde, yakıt deposu, radyatör vb. geliştirmeler
- Sarf malzemeleri: yedek yakıt, tamir kiti, ışınlayıcı, dinamit, asansör rayı ($25)
- Manyetik asansör rayı ile yakıtsız, hasarsız ve otomatik yukarı/aşağı seyir
- Düşen heyelan kayaları, gizli hazine sandıkları ve Arkeoloji Fosil Müzesi
- Sol kenar dikey derinlik mini-radarı ve sis (fog of war)
- Güvenli otomatik kayıt (`localStorage` - misafir modunda solo kayıt korunur)
- Mobil uyumlu dokunmatik kontroller (D-Pad ve eylem butonları)

## Online Co-op Nasıl Oynanır?

1. Üst bardaki **`[ 🌐 ONLINE CO-OP ]`** butonuna tıkla.
2. Kullanıcı adını ve Mecha Pod şasi rengini seç.
3. **Oda Kur (Host):** Tek tıkla `POLY-XXXX` oda kodu üret ve arkadaşına gönder.
4. **Odaya Katıl (Misafir):** Arkadaşından aldığın kodu girip bağlan.

### Ağ ve Kayıt Mimarisi
- **P2P WebRTC:** Tarayıcılar arasında doğrudan eşler arası (PeerJS genel sunucusu üzerinden sinyalleşme ile) iletişim kurulur. TURN röle sunucusu bulunmadığından katı simetrik NAT/kurumsal güvenlik duvarı arkasındaki bazı ağlarda doğrudan bağlantı kurulamayabilir.
- **Host-Otoriter Ortak Kasa:** Tüm harcama ve maden satışları delta (`changeAmount`) olarak Host'a iletilir ve Host tarafından merkezi olarak doğrulanıp tekil bakiye olarak tüm oyunculara yayınlanır; eşzamanlı satışlarda para kaybı yaşanmaz.
- **Ayrı Kayıt Slotu:** Misafir olarak oynarken ilerleme `polyminer_save_coop_v1` slotuna yazılır; ana solo maden kaydın (`polyminer_save_v1`) kesinlikle korunur. Odadan ayrıldığında veya bağlantı koptuğunda kendi madenine temizce dönersin.

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
