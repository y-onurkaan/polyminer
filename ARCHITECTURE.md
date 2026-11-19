# POLYMINER Mimarisi

## 1. Teknoloji ve Kısıtlar
- Bundler: Vite (Vanilla TS), strict TypeScript
- Çizim: saf HTML5 Canvas 2D, harici oyun motoru yok
- Görsel stil: minimalist geometri. Madenler düzgün çokgendir, kenar sayısı arttıkça değer artar (üçgen → ... → on ikigen).
- Dağıtım: GitHub Actions ile GitHub Pages (`.github/workflows/deploy.yml`)

## 2. Temel Sabitler (`src/constants.ts`)
- `TILE_SIZE = 48`, `GRID_WIDTH = 24`, `GRID_HEIGHT = 280`
- `SURFACE_ROW = 3` (0-2 gökyüzü, 3 yüzey)
- Katman bazlı blok kademesi (`getBlockTier`) ve `UPGRADES` tek kaynak tanımları: `ROCK` ve maden blokları biyom derinliğine göre matkap kademesi gerektirir; yükseltme/kapasite değerleri `UPGRADES` üzerinden türetilir
- `SAFE_LANDING_SPEED = 270`, `FALL_DAMAGE_MAX_BASE = 160`, `FALL_DAMAGE_EXPONENT = 1.20`: 1 blok (`240 px/s`) güvenli; yüksekten düşüşlerde ani basamak olmadan pürüzsüz üstel hasar eğrisi
- `FALL_BRAKE_MULTIPLIER = 1.50`: hızlı düşüşte (`vy > 120`) `[W]` retro-fren itkisi %50 daha güçlü frenler
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
| `events.ts` | Tip güvenli oyun içi olay veri yolu (`GameEventMap`, `emitGameEvent`, `onGameEvent`) |
| `network.ts` | PeerJS P2P WebRTC oda yönetimi (`NetworkManager`), paket doğrulama, XSS arındırma, host otoritesi |
| `types.ts` | `TileType`, `Tile`, `OreDefinition`, `RelicDefinition`, `Particle`, `PlayerState`, `RemotePlayerState` vb. |
| `constants.ts` | Sabitler, biyomlar, maden / fosil / sarf tanımları, `UPGRADES`, düşme hasarı katsayıları |
| `world.ts` | Harita üretimi (`generateWorld`), sis açma (`revealTilesAround`), `getTile`, offscreen mini-radar kirli sürüm takibi (`worldRenderVersion`, `markWorldDirty`) |
| `player.ts` | Fizik, matkap, yakıt/hararet/hasar, asansör rayı, dinamit, sandık, çekme ve ışınlanma (`updatePlayer`) |
| `boulders.ts` | Düşen heyelan kayaları |
| `effects.ts` | Parçacık havuzu (`MAX_PARTICLES`), ekran sarsıntısı (`addScreenShake`), hasar vinyeti (`addDamageFlash`), biyom geçiş bandı, yüzen metinler ve şok dalgaları |
| `renderer.ts` | Dünya, blok dokuları/autotiling, tekli yontulmuş çok yüzlü cevherler (`getOreVisualStyle`, `drawFacetedPolygon`), birleşik yüzey pistleri, aracın seviyeyle görsel evrimi, yumuşak sis, katman çizgili offscreen mini-radar (`renderMiniRadar`) ve viewport vinyetleri (`renderScreenOverlays`) |
| `ui.ts` | Dirty-check önbellekli SVG HUD, `tabular-nums`, tıklanabilir rozetler, çokgenli dükkân/5 parçalı seviye barları (`UPGRADES`), müze, Co-op lobi ve yardım paneli (`UIManager`) |
| `icons.ts` | Minimalist geometrik SVG ikon kütüphanesi (`UI_ICONS`), çok yüzlü maden SVG (`renderPolygonSvg`) ve seviye barı üreticisi (`renderLevelSegmentsHtml`) |
| `save.ts` | Çoklu slot `localStorage` kaydı / yüklemesi (`polyminer_save_v1`, `polyminer_save_coop_v1`), şema sürümü ve migrasyon |
| `audio.ts` | Web Audio ses motoru (`SoundEngine`), dinamik matkap tonu modülasyonu, blok kırılma / yükseltme / biyom geçiş sesleri |
| `style.css` | Ayrıştırılmış HUD, modal panelleri ve dokunmatik kontrol stilleri |

`index.html` HUD ve panel HTML iskeletini içerir (`src/style.css`, `src/main.ts` üzerinden yüklenir).

## 4. Veri Akışı ve Ağ Mimarisi
1. `main.ts` her karede girdiyi toplar ve `updatePlayer` ile oyuncuyu günceller.
2. `player.ts`, `world.ts` içindeki `Tile[][]` gridi üzerinde çarpışma ve kazı yapar. Kazılan bloklar kargoya veya envantere işlenir.
3. `network.ts`:
   - Host `POLY-XXXX` oda kodu ile PeerJS sunucusuna kaydolur. Misafirler host'a doğrudan WebRTC DataChannel ile bağlanır (Host-star/hub topolojisi).
   - 20 Hz durum yayını (`PLAYER_STATE`), anlık blok/ray kazısı (`TILE_UPDATE`), ortak şirket kasası (`WALLET_DELTA_REQUEST` → `SHARED_WALLET_UPDATE`), fosil keşfi (`SHARED_RELIC_UPDATE`) ve zafer ekranı (`VICTORY_EVENT`) senkronize edilir.
   - **Ağ Güvenliği & Bütünlüğü:**
     - **Host-Otoriter Kasa:** İstemciler bakiye değeri gönderemez, yalnızca `{ changeAmount, reason }` deltasını talep eder. Host deltayı sınırlar (`|delta| <= 1e7`), harcamada eksiye düşmeyi engeller ve yeni toplamı otoriter olarak tüm odaya dağıtır.
     - **Paket Doğrulama:** Koordinat (`clamp`), hız, matkap kademesi, para ve fosil verileri sıkı tip denetiminden geçer (`isInt`, `isFiniteNum`, `isValidTileType`).
     - **Harita Bütünlüğü:** `WELCOME_SYNC` paketi 280x24 boyut, geçerli hücre yapısı, kayıtlı cevher ve fosil anahtarları açısından `isValidSavedGrid` ile tam taranır; bozuk veriler haritayı bozmadan düşürülür.
     - **Zafer Kilidi:** Oda oturumu boyunca yalnızca ilk `VICTORY_EVENT` işleme alınır ve Host tarafından otoriter kazanan ismiyle yayınlanır.
     - **XSS & Kimlik Koruması:** İsim ve renkler `sanitizeName` ve `sanitizeColor` ile HTML tag/kontrol karakterlerinden arındırılır; Host, gelen durumlarda sahte kimlik kullanımını önlemek için peer ID'yi doğrular.
4. `save.ts`:
   - **Solo Slot:** `polyminer_save_v1` (varsayılan ve solo oyun için ayrılmış ana kayıt).
   - **Co-op Slot:** `polyminer_save_coop_v1` (misafir modundayken solo kaydın ezilmesini mutlak olarak önleyen izole slot).
   - **Şema & Migrasyon:** Kayıtlar `CURRENT_SAVE_VERSION` ile sürümlenir; `migrateSaveData` eksik alanları güvenle doldurur ve bozuk JSON hatalarını yakalar.

## 5. Notlar
- Dünya her oyunda tohumlanır veya Host'tan `WELCOME_SYNC` ile alınır.
- `vitest run` ile saf doğrulayıcılar, XSS vektörleri ve kayıt migrasyonu CI üzerinde otomatik test edilir.
