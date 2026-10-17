# POLYMINER Mimarisi

## 1. Teknoloji ve Kısıtlar
- Bundler: Vite (Vanilla TS), strict TypeScript
- Çizim: saf HTML5 Canvas 2D, harici oyun motoru yok
- Görsel stil: minimalist geometri. Madenler düzgün çokgendir, kenar sayısı arttıkça değer artar (üçgen → ... → on ikigen).
- Dağıtım: GitHub Actions ile GitHub Pages (`.github/workflows/deploy.yml`)

## 2. Temel Sabitler (`src/constants.ts`)
- `TILE_SIZE = 48`, `GRID_WIDTH = 24`, `GRID_HEIGHT = 280`
- `SURFACE_ROW = 3` (0-2 gökyüzü, 3 yüzey)
- `ROCK_MIN_DRILL_LEVEL = 4`: kaya için en az matkap seviyesi
- `SAFE_LANDING_SPEED`, `FALL_DAMAGE_FACTOR`: düşme hasarı
- `BIOMES`: Üst Kabuk, Kuvars Mağaraları, Bazalt & Gaz Katmanı, Magma Çekirdeği
- `ORE_DEFINITIONS`: Bakır (3 kenar) → Elmas (8 kenar) ve Kadim Çekirdek (12 kenar)
- `RELIC_DEFINITIONS`: müzede sergilenen fosiller
- `CONSUMABLES`: yedek yakıt, tamir kiti, ışınlayıcı, dinamit, asansör rayı

Güncel sayısal değerler için kaynak olarak bu dosya esastır.

## 3. Modüller (`src/`)

| Dosya | Sorumluluk |
|---|---|
| `main.ts` | Giriş noktası, oyun döngüsü, klavye ve dokunmatik girdi, otomatik kayıt tetikleme |
| `types.ts` | `TileType`, `Tile`, `OreDefinition`, `RelicDefinition`, `PlayerState` vb. tipler |
| `constants.ts` | Sabitler, biyomlar, maden / fosil / sarf tanımları |
| `world.ts` | Harita üretimi (`generateWorld`), sis açma (`revealTilesAround`), `getTile` |
| `player.ts` | Fizik, matkap, yakıt/ısı/hasar, asansör rayı, dinamit, sandık, çekme ve ışınlanma (`updatePlayer`) |
| `boulders.ts` | Düşen kayalar |
| `effects.ts` | Yüzen yazılar ve şok dalgaları |
| `renderer.ts` | Dünya, oyuncu ve çokgen çizimi |
| `ui.ts` | HUD, dükkân, geliştirmeler (`UPGRADES`), müze, yardım paneli (`UIManager`) |
| `save.ts` | `localStorage` kaydı / yüklemesi (`SAVE_KEY`) |
| `audio.ts` | Web Audio ile ses motoru (`SoundEngine`) |

`index.html` stilleri, HUD ve panel iskeletini içerir.

## 4. Veri Akışı
1. `main.ts` her karede girdiyi toplar ve `updatePlayer` ile oyuncuyu günceller.
2. `player.ts`, `world.ts` içindeki `Tile[][]` gridi üzerinde çarpışma ve kazı yapar. Kazılan bloklar kargoya veya envantere işlenir.
3. `boulders.ts` ve `effects.ts` yan sistemleri günceller.
4. `renderer.ts` gridi, oyuncuyu ve efektleri canvas'a çizer. `ui.ts` HUD ve panelleri DOM üzerinden günceller.
5. `save.ts` periyodik olarak ve önemli olaylarda oyuncuyu ve dünyayı serileştirir.

## 5. Notlar
- Dünya her oyunda üretilir. Kaydedilen kazı ve keşif durumu `save.ts` ile geri uygulanır.
- Kayıt anahtarı `polyminer_save_v1`'dir. Şema değişirse sürüm artırılmalıdır.
