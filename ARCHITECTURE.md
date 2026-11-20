# POLYMINER Mimarisi

## 1. Teknoloji ve Kısıtlar
- Bundler: Vite (Vanilla TS), strict TypeScript
- Çizim: saf HTML5 Canvas 2D, harici oyun motoru yok
- Görsel stil: minimalist geometri. Madenler düzgün çokgendir, kenar sayısı arttıkça değer artar (üçgen → ... → on ikigen).
- Dağıtım: GitHub Actions ile GitHub Pages (`.github/workflows/deploy.yml`)

## 2. Temel Sabitler (`src/constants.ts`)
- `TILE_SIZE = 48`, `GRID_WIDTH = 24`, `GRID_HEIGHT = 280`
- `SURFACE_ROW = 3` (0-2 gökyüzü, 3 yüzey)
- Katman bazlı blok kademesi (`getBlockTier`) ve `UPGRADES` tek kaynak tanımları: `ROCK` ve maden blokları biyom derinliğine göre matkap kademesi gerektirir; yükseltme/kapasite değerleri ve motor tavan uçuş hızı (`getMaxFlySpeed`) `UPGRADES` üzerinden türetilir
- `SAFE_LANDING_SPEED = 270`, `FALL_DAMAGE_MAX_BASE = 160`, `FALL_DAMAGE_EXPONENT = 1.20`: 1 blok (`240 px/s`) güvenli; yüksekten düşüşlerde ani basamak olmadan pürüzsüz üstel hasar eğrisi
- `FALL_BRAKE_MULTIPLIER = 1.50`: hızlı düşüşte (`vy > 120`) `[W]` retro-fren itkisi %50 daha güçlü frenler
- `MAX_FALL_SPEED = 760`: 10 blokluk uçurum terminal hız tavanı
- `BIOMES`: Üst Kabuk, Kuvars Mağaraları, Bazalt & Gaz Katmanı, Magma Çekirdeği (550m); `MAGMA_NO_RAIL_START_ROW = 206` ile 4. katmanda asansör rayı termal olarak yasaklanır
- `ORE_DEFINITIONS`: Bakır (3 kenar) → Elmas (8 kenar) ve Kadim Çekirdek (12 kenar); 3-4. katmanda Bakır/Demir/Gümüş çıkmaz, Elmas yalnızca 4. katmandaki jeodlarda bulunur
- `RELIC_DEFINITIONS`: haritada önceden gömülü müze fosilleri (%2.5 piyango kaldırıldı, Radar Sv.3+ yaklaşınca sis altından parlar)
- `CONSUMABLES`: yedek yakıt, tamir kiti, ışınlayıcı, dinamit (`BEDROCK` ve `ANCIENT_CORE`'a bağışık), asansör rayı ($25)

Güncel sayısal değerler için kaynak olarak bu dosya esastır.

## 3. Modüller (`src/`)

| Dosya | Sorumluluk |
|---|---|
| `main.ts` | Giriş noktası, oyun döngüsü, klavye ve dokunmatik girdi, güvenli kayıt (`safeSaveGame`) |
| `events.ts` | Tip güvenli oyun içi olay veri yolu (`GameEventMap`, `emitGameEvent`, `onGameEvent`) |
| `network.ts` | PeerJS P2P WebRTC oda yönetimi (`NetworkManager`), `normalizeRoomCode` / çakışma retry'ı, paket doğrulama, `evaluateWalletDelta`, `txId` red geri alma sinyali, Host müze/zafer doğrulaması ve XSS arındırma |
| `types.ts` | `TileType`, `Tile`, `OreDefinition`, `RelicDefinition`, `Particle`, `PlayerState`, `RemotePlayerState` vb. |
| `constants.ts` | Sabitler, biyomlar, maden / fosil / sarf tanımları, `UPGRADES`, düşme hasarı katsayıları |
| `world.ts` | İki bileşenli damar/jeod harita üretimi (`generateWorld`, `placeOreVeins`), eksen dışı `BEDROCK` mühürlü çekirdek (`placeAncientCoreChamber`, `findAncientCoreCoords`), sis açma (`revealTilesAround`), `getTile`, offscreen mini-radar kirli sürüm takibi (`worldRenderVersion`, `markWorldDirty`) |
| `player.ts` | Fizik, ölçekli motor hızı, matkap, yakıt/hararet/Magma yakınlık ısısı/hasar, 1-3. katman asansör rayı, `BEDROCK` korumalı dinamit, sandık, çekme ve ışınlanma (`updatePlayer`) |
| `boulders.ts` | Düşen heyelan kayaları |
| `effects.ts` | Parçacık havuzu (`MAX_PARTICLES`), ekran sarsıntısı (`addScreenShake`), hasar vinyeti (`addDamageFlash`), biyom geçiş bandı, yüzen metinler ve şok dalgaları |
| `renderer.ts` | Dünya, blok/Bedrock dokuları/autotiling, Radar Sv.3+ fosil sis parıltısı, tekli yontulmuş çok yüzlü cevherler (`getOreVisualStyle`, `drawFacetedPolygon`), birleşik yüzey pistleri, aracın seviyeyle görsel evrimi, yumuşak sis, offscreen mini-radar (`renderMiniRadar`) ve sismik çekirdek sensörlü vinyetler (`renderScreenOverlays`) |
| `ui.ts` | Dirty-check önbellekli SVG HUD, `tabular-nums`, tıklanabilir rozetler, çokgenli dükkân/5 parçalı seviye barları (`UPGRADES`), müze, Co-op lobi ve yardım paneli (`UIManager`) |
| `icons.ts` | Minimalist geometrik SVG ikon kütüphanesi (`UI_ICONS`), çok yüzlü maden SVG (`renderPolygonSvg`) ve seviye barı üreticisi (`renderLevelSegmentsHtml`) |
| `save.ts` | `localStorage` kaydı / yüklemesi (`polyminer_save_v1`), şema sürümü, tek kaynak `isValidSavedGrid` grid doğrulaması, `Object.hasOwn` koruması ve migrasyon |
| `audio.ts` | Web Audio ses motoru (`SoundEngine`), dinamik matkap tonu modülasyonu, blok kırılma / yükseltme / biyom geçiş sesleri |
| `style.css` | Ayrıştırılmış HUD, modal panelleri ve dokunmatik kontrol stilleri |

`index.html` HUD ve panel HTML iskeletini içerir (`src/style.css`, `src/main.ts` üzerinden yüklenir).

## 4. Veri Akışı ve Ağ Mimarisi
1. `main.ts` her karede girdiyi toplar ve `updatePlayer` ile oyuncuyu günceller.
2. `player.ts`, `world.ts` içindeki `Tile[][]` gridi üzerinde çarpışma ve kazı yapar. Kazılan bloklar kargoya veya envantere işlenir.
3. `network.ts`:
   - Host `POLY-XXXXXX` oda kodu ile PeerJS sunucusuna kaydolur (`unavailable-id` çakışmasında otomatik yeniden dener). Misafirler `normalizeRoomCode` format doğrulamasından sonra host'a doğrudan WebRTC DataChannel ile bağlanır (Host-star/hub topolojisi).
   - 20 Hz durum yayını (`PLAYER_STATE`), anlık blok/ray kazısı (`TILE_UPDATE`), ortak şirket kasası (`WALLET_DELTA_REQUEST` → `SHARED_WALLET_UPDATE`), fosil keşfi (`SHARED_RELIC_UPDATE`) ve zafer ekranı (`VICTORY_EVENT`) senkronize edilir.
   - **Ağ Güvenliği & Bütünlüğü:**
     - **Ortak Kasa & Geri Alma:** Host bakiye deltalarını `evaluateWalletDelta` ile sınırlar (`|delta| <= 1e7`, istasyon borç limiti `MAX_DEBT_ALLOWED = -1000`), yetersiz bakiyede `rejected: true` + `txId` döner ve istemci `ui.rollbackPendingPurchase` ile yükseltme/sarf/cevheri yerelde geri alır.
     - **Paket Doğrulama:** Koordinat (`clamp`), hız, matkap kademesi, para ve fosil verileri sıkı tip denetiminden geçer (`isInt`, `isFiniteNum`, `isValidTileType`, `Object.hasOwn`).
     - **Harita Bütünlüğü:** `isValidSavedGrid` (`save.ts`) hem `WELCOME_SYNC` paketinde hem yerel `localStorage` yüklemelerinde 280x24 boyut, geçerli `TileType`, `ORE_DEFINITIONS` ve `RELIC_DEFINITIONS` öz-özellik anahtarlarını tam tarar; bozuk veya prototip zincirli veriler reddedilir.
     - **Müze & Zafer Doğrulaması:** `MUSEUM_REWARD_CLAIM_REQUEST` yalnız Host'ta tüm rölikler keşfedilmişse onaylanır; `VICTORY_EVENT` oda başına tekil kilitlenir ve Host haritasında çekirdek durumu (`canAcceptVictory`) kontrol edilir.
     - **XSS & Kimlik Koruması:** İsim ve renkler `sanitizeName` ve `sanitizeColor` ile HTML tag/kontrol karakterlerinden arındırılır; Host, gelen durumlarda sahte kimlik kullanımını önlemek için peer ID'yi doğrular.
4. `save.ts`:
   - **Solo Kayıt:** `polyminer_save_v1` (tekil ve misafir co-op oturumlarında yazıma kapatılarak korunan ana kayıt).
   - **Şema & Migrasyon:** Kayıtlar `CURRENT_SAVE_VERSION` ile sürümlenir; `migrateSaveData` eksik alanları doldurur, bozuk JSON veya geçersiz non-empty grid verisini `null` dönerek güvenli sıfırlama sağlar.

## 5. Notlar
- Dünya her oyunda tohumlanır veya Host'tan `WELCOME_SYNC` ile alınır.
- `vitest run` ile saf doğrulayıcılar, XSS vektörleri ve kayıt migrasyonu CI üzerinde otomatik test edilir.
