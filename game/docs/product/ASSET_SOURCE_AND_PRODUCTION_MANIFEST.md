# 第一、二层素材来源与生产清单

> 文档版本：`v0.1`
>
> 状态：`SOURCE_VERIFIED / RUNTIME_BUNDLED`
>
> 范围：第一层地下余烬档案、第二层潮汐群岛
>
> 最近更新：`2026-07-26`

## 1. 目标

建立可以复查、替换和重新生产的素材链：

```text
作者官方来源
→ 原始压缩包和哈希
→ 包内许可证复查
→ 按来源解压
→ 选择需要的文件
→ 可复现裁切 / 改色 / 合图
→ 楼层运行时图集
→ ATTRIBUTIONS 与构建检查
```

禁止直接把下载目录整包扔进 `public/`。

## 2. 目录契约

```text
assets/
  vendor/
    0x72-dungeontileset-ii/
      original/
      selected/
      derived/
      LICENSE-CC0-1.0.txt
      source.json
    shade-puny-world/
      original/
      selected/
      derived/
      LICENSE-CC0-1.0.txt
      source.json
    foozle-scallywag-water-islands/
      original/
      selected/
      derived/
      LICENSE-CC0-1.0.txt
      source.json
    kenney-tiny-dungeon/
    kenney-tiny-town/
    open-audio/
  manifest.json

public/
  assets/
    floors/
      01-ember-archive/
      02-tidal-archipelago/
```

职责：

- `original/`：作者原包或原始下载文件，不编辑；
- `selected/`：从原包挑出的源图；
- `derived/`：裁切、改色、补帧和合图的中间结果；
- `public/assets/floors/`：游戏实际加载的最终图集；
- `source.json`：来源、许可、哈希和处理记录；
- `manifest.json`：跨来源总索引。

## 3. 来源候选

### 3.1 0x72 DungeonTileset II

| 项 | 内容 |
|---|---|
| 用途 | 第一层主素材 |
| 官方页 | <https://0x72.itch.io/dungeontileset-ii> |
| 作者 | 0x72 / Robert |
| 网格 | 16×16；部分高墙和角色为 16×32 |
| 页面文件 | `0x72_DungeonTilesetII_v1.7.zip`，页面约 406 KB |
| 页面许可 | Creative Commons Zero v1.0 Universal |
| 当前状态 | `VENDORED_VERIFIED / F1_RUNTIME_BUNDLED` |

计划选取：

- 石地面；
- 石墙与墙顶；
- 门、栅栏和开关；
- 陷阱和地牢道具；
- 史莱姆基础角色；
- 火焰或火把基础帧。

需要定制：

- 档案柜、账本桌；
- 排水沟、水轮与唯一水阀；
- 抄写员；
- 铜印登记官；
- 湿墙姓名高度线；
- 名字恢复特效。

风险：

- 16×32 高墙不能按普通单 Tile 裁切；
- 扩展包与社区改图不能自动继承主包许可；
- 只接入原作者主包中已复核文件。

### 3.2 Shade Puny World

| 项 | 内容 |
|---|---|
| 用途 | 第二层基础地形 |
| 官方页 | <https://merchant-shade.itch.io/16x16-puny-world> |
| 作者 | Shade |
| 网格 | 16×16 |
| 页面文件 | `PUNY_WORLD_v1.zip`，页面约 109 KB |
| 页面许可 | Creative Commons Zero v1.0 Universal |
| 当前状态 | `VENDORED_VERIFIED / F2_RUNTIME_BUNDLED` |

计划选取：

- 草地和沙地；
- 路径；
- 高低差；
- 河流和海水；
- 建筑；
- 树、石和资源节点。

风险：

- 与第一层和 Scallywag 色板不同；
- 示例 Tiled 地图不是运行时依赖；
- 只选择必要地形，避免把完整示例地图打包。

### 3.3 Foozle Scallywag — Water and Islands

| 项 | 内容 |
|---|---|
| 用途 | 第二层水面、岸线和岛屿补充 |
| 官方页 | <https://foozlecc.itch.io/scallywag-water-islands> |
| 作者 | Pixel Carvel，Foozle 分发 |
| 网格 | 页面未明确，下载后测量 |
| 页面文件 | `Foozle_2DT0014_Scallywag_WaterAndIslands.zip`，页面约 136 KB |
| 页面许可 | Creative Commons Zero v1.0 Universal |
| 当前状态 | `VENDORED_VERIFIED / F2_RUNTIME_BUNDLED` |

计划选取：

- 动态岸线；
- 水面帧；
- 岛屿碎片；
- 漂浮物；
- 宝箱。

风险：

- 网格尺寸需下载后验证；
- `.ase` 文件只作为可编辑来源，运行时使用导出的 PNG；
- 需要重新调色以匹配 Puny World。

### 3.4 Kenney Tiny Dungeon / Tiny Town

| 项 | 内容 |
|---|---|
| 用途 | 缺少道具时的备用来源 |
| 官方页 | <https://kenney.nl/assets/tiny-dungeon> / <https://kenney.nl/assets/tiny-town> |
| 作者 | Kenney |
| 网格 | 16×16 |
| 页面许可 | CC0 |
| 当前状态 | `BACKUP / NOT_SELECTED` |

只有主素材确实缺少某类基础道具时才下载，不能为“素材越多越好”引入。

### 3.5 Ninja Adventure

| 项 | 内容 |
|---|---|
| 用途 | 角色、怪物或特效的逐文件参考候选 |
| 官方页 | <https://pixel-boy.itch.io/ninja-adventure-asset-pack> |
| 页面许可 | 整体页面声明 CC0 |
| 包体 | 页面主包约 89 MB |
| 当前状态 | `DEFERRED` |

不整包接入：

- 内容过多；
- 容易造成风格失控；
- 音乐涉及第三方 soundfont，不能随像素图一起默认使用；
- 若后续需要单个角色动作，必须重新核对目标文件和包内说明。

## 4. 音频来源

### 4.1 许可判断

- 作曲家和原作公版，不代表演奏录音公版；
- QQ 音乐、网易云、Spotify、YouTube 和普通唱片不能提取；
- 来源页没有明确单条录音许可时，不进入仓库；
- `free download` 不等于 `CC0` 或 Public Domain；
- MIDI、soundfont 和现代编曲也可能拥有独立版权。

### 4.2 已知可靠候选

| 来源 | 内容 | 许可 | 适用 |
|---|---|---|---|
| <https://opengoldbergvariations.org/> | Kimiko Ishizaka《哥德堡变奏曲》录音 | CC0 | 后续安静、反思场景候选 |
| <https://kimikoishizaka.bandcamp.com/album/bach-well-tempered-clavier-book-1> | 《平均律键盘曲集 I》录音 | 页面需连同 CC0 证据归档 | 后续楼层或系统测试候选 |

当前没有为莫扎特 K.265 和亨德尔《水上音乐》找到足够明确的 CC0 具体录音，因此：

- 第一、第二层本轮不能从普通音乐平台直接替换；
- 优先改进当前自制编配和音色；
- 或后续寻找逐文件明确 CC0 / Public Domain 的演奏；
- 或自行录制 / 委托录制并取得书面许可。

## 5. `source.json` 规范

每个来源至少记录：

```json
{
  "id": "0x72-dungeontileset-ii",
  "title": "16x16 DungeonTileset II",
  "author": "0x72",
  "canonicalUrl": "https://0x72.itch.io/dungeontileset-ii",
  "downloadedAt": "2026-07-25T00:00:00+08:00",
  "version": "1.7",
  "license": "CC0-1.0",
  "licenseEvidenceUrl": "https://0x72.itch.io/dungeontileset-ii",
  "originalFiles": [
    {
      "path": "original/0x72_DungeonTilesetII_v1.7.zip",
      "bytes": 0,
      "sha256": ""
    }
  ],
  "selectedFiles": [],
  "derivedFiles": [],
  "grid": {
    "tileWidth": 16,
    "tileHeight": 16,
    "notes": "部分角色和高墙为 16x32"
  }
}
```

下载完成后禁止保留空哈希和空字节数。

## 6. 生产脚本要求

后续脚本建议：

```text
scripts/assets/
  verify-sources.mjs
  build-floor01-atlas.mjs
  build-floor02-atlas.mjs
  verify-runtime-assets.mjs
```

必须：

- 输入固定来源文件；
- 检查 SHA-256；
- 使用明确裁切坐标；
- 只做整数缩放；
- 输出确定性文件；
- 记录输出尺寸和哈希；
- 失败时不覆盖已有有效图集；
- 检查孤儿文件和未登记运行时文件。

## 7. 楼层运行时预算

### 第一层

| 类别 | 预算 |
|---|---:|
| 地形图集 | ≤ 256 KB |
| 角色与怪物 | ≤ 256 KB |
| 特效与道具 | ≤ 128 KB |
| 音频 | 后续单独预算 |

### 第二层

| 类别 | 预算 |
|---|---:|
| 地形与岸线 | ≤ 384 KB |
| 角色与怪物 | ≤ 320 KB |
| 水面与特效 | ≤ 192 KB |
| 音频 | 后续单独预算 |

预算是初始门槛，不以压缩后文件大小替代解码纹理内存检查。

## 8. 接入验收

- 每个来源独立目录；
- 原包存在 SHA-256；
- 包内许可证与页面声明一致；
- `ATTRIBUTIONS.md` 已更新；
- 最终图集只包含实际使用素材；
- 16×16 / 16×32 裁切无串帧；
- 图片关闭平滑后无半像素；
- 第一层与第二层调色统一但可辨认；
- 不存在来源不明 PNG、WAV、MP3、MIDI 或 soundfont；
- 生产构建不包含 `assets/vendor/original/`；
- 断网可玩；
- 素材加载失败时游戏仍能显示可读降级图形。
