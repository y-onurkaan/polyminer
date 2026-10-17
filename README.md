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

- 4 biyom: Üst Kabuk, Kuvars Mağaraları, Bazalt & Gaz Katmanı, Magma Çekirdeği
- Yakıt, gövde hasarı, düşme hasarı ve ısınma yönetimi
- Dükkân: matkap, gövde, yakıt deposu, radyatör vb. geliştirmeler
- Sarf malzemeleri: yedek yakıt, tamir kiti, ışınlayıcı, dinamit, asansör rayı
- Asansör rayı ile yakıtsız ve otomatik yukarı/aşağı seyir
- Düşen kayalar, gizli sandıklar ve fosil müzesi
- Sis (fog of war) ve radar
- Otomatik kayıt (`localStorage`)
- Mobil uyumlu dokunmatik kontroller

## Kontroller

| Tuş | İşlev |
|---|---|
| `W` `A` `S` `D` / Ok tuşları | Hareket, roket itkisi, kazma |
| `R` | Yedek yakıt |
| `T` | Tamir kiti |
| `Q` | Yüzeye ışınlan |
| `X` | Sismik dinamit |
| `C` | Asansör rayı döşe (basılı tut) |
| `2x W` / `2x S` | Raydayken otomatik yukarı / aşağı (durdur: `Boşluk`) |
| `H` | Nasıl oynanır |

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
