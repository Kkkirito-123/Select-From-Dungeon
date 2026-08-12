# 第一层概念素材索引

> `CONCEPT_ONLY` · 2026-07-24 · 不进入运行时 Bundle
> 音频状态：`REJECTED_REFERENCE`，因尖锐和噪声感被淘汰；角色与地图概念图状态不变。

## 文件

| 文件 | 用途 | 是否可直接投产 |
|---|---|---|
| `scribe-character-concept-v1.png` | 抄写员视觉、配色与情绪参考 | 否，需人工重绘为 32 × 40 px Sprite |
| `floor1-region-concept-v1.png` | 第一层材质、地标密度与空间气质参考 | 否，需先做 Tilemap 灰盒 |
| `scribe-ember-archive-preview-v1.wav` | 已淘汰的抄写员／篝火试听对照 | 否，不进入正式方向 |
| `floor1-wetwall-circuit-preview-v1.wav` | 已淘汰的第一层探索试听对照 | 否，不进入正式方向 |
| `audio-preview-manifest.json` | 音频参数、Seed 与 SHA-256 | 生成证据 |

对应规范：
[抄写员、第一层区域与音乐素材 Brief](../../SCRIBE_REGION_ASSET_BRIEF.md)

新的音乐权威方向：
[音乐与地图上升设计圣经](../../MUSIC_MAP_ASCENT_BIBLE.md)

## 重新生成音频

在项目根目录执行：

```bash
node scripts/generate-concept-audio.mjs docs/design/assets/region-01
```

生成器不下载依赖，不使用采样、SoundFont 或第三方录音。固定 Seed 和声明式音符数据用于保证结果
可复现。WAV 只用于设计试听，正式游戏继续采用低负载程序化 Web Audio。

## 角色概念图提示词

基础生成：

```text
Use case: stylized-concept
Asset type: original game character concept sheet for a later 32x32 pixel sprite
Primary request: Design an original female archive scribe NPC for a Chinese browser pixel RPG about learning SQL. She is a saved record-personality that materializes beside a campfire checkpoint and helps the player review mistakes and calibrate upgrades.
Scene/backdrop: clean flat very dark navy backdrop, no environment scene, no floor plane
Subject: one consistent character shown in three full-body views/poses: front neutral pose, three-quarter pose holding a compact floating ledger, and a materialization pose with subtle horizontal scanline fragments. Face fully visible. Short asymmetric archivist coat, practical boots, small paper-tab details, cursor-shaped hairpin, a few floating rectangular record cards. Calm, kind, precise, slightly melancholy. Adult, non-sexualized.
Style/medium: crisp high-quality 16-bit pixel-art character concept, limited palette, clean hard-edged clusters, readable silhouette, suitable as source reference for a tiny in-game sprite; each pose displayed at the same scale
Composition/framing: orderly horizontal lineup with generous spacing, character fully visible, no cropped limbs
Lighting/mood: soft teal record glow with a restrained warm ember rim light
Color palette: ivory paper, pale teal/cyan, muted indigo, small warm gold/ember accents, deep navy; no dominant black
Constraints: entirely original design; no text, no labels, no logos, no watermark; consistent face, clothing and proportions across all poses
Avoid: black hooded robe, blindfold, crown, long gothic dress, Dark Souls or Fire Keeper resemblance, photorealism, anime glamour, exaggerated weapons, sexualized costume, isometric environment, anti-aliased blurry pixel art
```

根据“她是唯一稳定的温暖”修订：

```text
Edit this existing original pixel-art character concept sheet while preserving the same character identity, three-pose layout, crisp 16-bit pixel technique, visible face, cursor-shaped hairpin, short archivist coat, floating ledger, dark navy background, and consistent proportions.

Make her visibly gentler and establish her as the one reliable source of warmth in an otherwise cold ruined dungeon. Soften her eyes and eyebrows, give her a calm almost-smile rather than sadness, relax her shoulders and hands, and make her body language quietly welcoming. Shift the coat and face toward warmer aged-ivory and add restrained campfire-gold rim light on all three poses. Let the pale teal record glow remain secondary. Reduce the amount and visual harshness of horizontal scanline corruption: keep only a few subtle fragments at one coat hem and on the floating record cards, enough to hint that she may be a preserved record-personality without making her ghostly or unstable.

In the center pose, have her hold the compact floating ledger slightly open toward the player, like inviting a review rather than judging. In the materialization pose, make the emerging silhouette feel safe and familiar, not eerie. Keep her mature, restrained, practical, non-sexualized, and original. She must feel kind but honest—not bubbly, cute-idol-like, romantic, maternal, holy, or submissive.

Do not add text, labels, UI, logos, watermark, hearts, flowers, halo, religious imagery, black hood, blindfold, long gothic robe, prayer pose, weapon, lantern staff, crown, photorealism, blur, gradients, or resemblance to any existing commercial-game character.
```

## 第一层地图概念图提示词

```text
Use case: stylized-concept
Asset type: top-down pixel-art game environment concept and level-layout reference
Primary request: Create one single continuous compact first-floor dungeon for an original Chinese SQL-learning roguelite. Show the entire environment from a strict 90-degree top-down orthographic view. It must communicate three physically connected regions, exactly three campfires, exactly two loop-opening shortcuts, and one clear route from entrance to boss. Environment only, absolutely no text.
Scene/topology: Main route begins at a broad lower-left entrance courtyard: old city gate and registration hall -> arched drainage channels -> irregular luminous green slime pool with solid walkable perimeter and short bridges -> ember warehouse plaza -> deep underground archive -> semicircular boss judgment hall -> small dormant portal chamber behind the boss. One continuous map, no scene transitions.
Shortcut 1: a huge closed rusted iron water gate is visibly adjacent to the entrance from the beginning, but blocks direct travel to the warehouse. The long route reaches the warehouse and a rear mechanism opens the gate back to the entrance. Depict the gate closed.
Shortcut 2: a square archive cargo elevator connects the deep archive back to the middle warehouse campfire; show shaft and both platforms as a practical return route, not a portal.
Fixed landmarks: monumental blue-gray registration stele with one blank erased rectangular recess but no readable symbol; massive closed iron water gate; large drainage waterwheel and stone sluice; one irregular glowing slime pool; warehouse plaza with crates, shelf silhouettes, chains and a low ember furnace; archive with ordered stone shelves and aged-paper record blocks; semicircular boss hall with central dais and exactly five dim braziers; dormant portal behind the boss; exactly three physical campfires at entrance, warehouse/elevator junction, and immediately before boss gate. Include a small empty calm alcove beside each fire for a future guide NPC, but no character.
Spatial proportions: main paths 2-4 tile widths; entrance, warehouse and boss spaces 5-8 tile widths; broad irregular spaces and short loops; no long empty corridor; no meaningless dead end; water gate physically close to entrance; each landmark locally legible.
Style/medium: authentic handcrafted 16-bit-inspired top-down pixel art using a consistent 32x32 tile visual grammar, crisp pixel clusters, hard edges, no antialiasing, simple collision-friendly geometry, restrained detail, static low-cost browser-game environment.
Color palette: deep void #08090C; floors #171B22 and #1D222B; blue-gray walls #252A34 with #505766 edges; drainage teal-gray #203138/#364A50/#6D9DA5; slime region #21372F/#344B3D/#70C489; ember/archive #3A2922/#56352A/#D78A4B; sparse safe cyan #78C9B8; old gold #D7AD55; boss ember red #C75248; aged paper #E8DFC7.
Lighting/mood: quiet ruined underground city, safe and readable near entrance, damp around drainage, warmer and more oppressive near archive and boss. Baked pixel-value contrast only.
Constraints: no text, letters, numbers, SQL words, labels, arrows, legend, HUD, minimap, grid overlay, watermark or logo. No characters, monsters, weapons, loot or UI markers. No isometric or oblique camera. No separate floating rooms. No one-tile-wide maze as main route. No excessive dead ends. No later-floor forest, swamp, graveyard, crystal, boat or island imagery. Do not show the water gate open. Do not add secret passages or a third shortcut. Entirely original visual identity.
```

## 已知限制

- 两张 PNG 是概念参考，不是可碰撞、可寻路、可直接拼接的生产资产；
- 角色概念图的像素密度远高于运行时，缩放会失去轮廓，必须重新像素化；
- 地图图像中的火焰既包含三处篝火，也包含 Boss 场景火盆；是否为复活点由地图数据决定；
- 第一层正式路线必须以设计 Brief 的路线图为准，不能依据图片猜测连接关系；
- 图像由项目原创提示词生成并经过人工方向审查；没有输入或复制第三方图片。
