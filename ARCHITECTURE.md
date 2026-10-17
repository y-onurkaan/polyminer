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
- `SAFE_LANDING_SPEED = 250`, `FALL_DAMAGE_FACTOR = 0.33`: 1 blok (240 px/s) güvenli, 2 blok 30 HP
- `DEEP_FALL_THRESHOLD_SPEED = 165`, `DEEP_FALL_PENALTY_MULTIPLIER = 1.20`: 3+ blok derin düşüşlerde +%20 hasar cezası
- `MAX_FALL_SPEED = 760`: 10 blokluk uçurum terminal hız tavanı
- `BIOMES`: Üst Kabuk, Kuvars Mağaraları, Bazalt & Gaz Katmanı, Magma Çekirdeği (550m)
- `ORE_DEFINITIONS`: Bakır (3 kenar) → Elmas (8 kenar) ve Kadim Çekirdek (12 kenar)
- `RELIC_DEFINITIONS`: müzede sergilenen fosiller
- `CONSUMABLES`: yedek yakıt, tamir kiti, ışınlayıcı, dinamit, asansör rayı ($25)

Güncel sayısal değerler için kaynak olarak bu dosya esastır.

## 3. Modüller (`src/`)

| Dosya | Sorumluluk |
|---|---|
| `main.ts` | Giriş noktası, oyun döngüsü, klavye ve dokunmatik girdi, güvenli kayıt (`safeSaveGame`) |
| `network.ts` | PeerJS P2P WebRTC oda yönetimi (`NetworkManager`), paket doğrulama, XSS arındırma, host otoritesi |
| `types.ts` | `TileType`, `Tile`, `OreDefinition`, `RelicDefinition`, `PlayerState`, `RemotePlayerState` vb. |
| `constants.ts` | Sabitler, biyomlar, maden / fosil / sarf tanımları, düşme hasarı katsayıları |
| `world.ts` | Harita üretimi (`generateWorld`), sis açma (`revealTilesAround`), `getTile` |
| `player.ts` | Fizik, matkap, yakıt/ısı/hasar, asansör rayı, dinamit, sandık, çekme ve ışınlanma (`updatePlayer`) |
| `boulders.ts` | Düşen heyelan kayaları |
| `effects.ts` | Yüzen hasar/para yazıları ve çarpma şok dalgaları |
| `renderer.ts` | Dünya, oyuncu, çokgenler, sol kenar derinlik mini-radarı ve uzak oyuncuların çizimi |
| `ui.ts` | HUD, dükkân, geliştirmeler (`UPGRADES`), müze, Co-op lobi/roster, yardım paneli (`UIManager`) |
| `save.ts` | `localStorage` kaydı / yüklemesi (`polyminer_save_v1`) |
| `audio.ts` | Web Audio ile ses motoru (`SoundEngine`) |

`index.html` stilleri, HUD ve panel iskeletini içerir.

## 4. Veri Akışı ve Ağ Mimarisi
1. `main.ts` her karede girdiyi toplar ve `updatePlayer` ile oyuncuyu günceller.
2. `player.ts`, `world.ts` içindeki `Tile[][]` gridi üzerinde çarpışma ve kazı yapar. Kazılan bloklar kargoya veya envantere işlenir.
3. `network.ts`:
   - Host `POLY-XXXX` oda kodu ile PeerJS sunucusuna kaydolur. Misafirler host'a doğrudan WebRTC DataChannel ile bağlanır (Host hub topolojisi).
   - 20 Hz durum yayını (`PLAYER_STATE`), anlık blok/ray kazısı (`TILE_UPDATE`), ortak şirket kasası (`SHARED_WALLET_UPDATE`) ve fosil keşfi (`SHARED_RELIC_UPDATE`) senkronize edilir.
   - **Ağ Güvenliği & Bütünlüğü:** Tüm gelen paketler doğrulanır (`clamp`, `isFiniteNum`, `isInt`), isim ve renkler HTML injection/XSS'e karşı arındırılır (`sanitizeName`, `sanitizeColor`, `escapeHtml`). Host, gelen oyuncu durumlarında sahte kimlik kullanımını önlemek için peer ID'yi otoriter olarak yazar.
4. `save.ts`: Solo oyunda ve Host modunda periyodik olarak kaydedilir. **Misafir modundayken solo kaydın ezilmemesi için autosave kilitlenir**; misafir odadan ayrıldığında temiz bir yenilemeyle kendi solo madenine döner.

## 5. Notlar
- Dünya her oyunda üretilir. Kaydedilen kazı ve keşif durumu `save.ts` ile geri uygulanır.
- Kayıt anahtarı `polyminer_save_v1`'dir.
