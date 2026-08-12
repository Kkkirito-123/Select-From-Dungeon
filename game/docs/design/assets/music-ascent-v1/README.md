# 音乐上升方向第三版试听

> 状态：`CANDIDATE_V3`
> 用途：主观试听与设计评审，不进入运行时 Bundle
> 权威设计：[音乐与地图上升设计圣经](../../MUSIC_MAP_ASCENT_BIBLE.md)

## 试听目标

| 文件 | 验证问题 |
|---|---|
| `floor1-underground-hearth-exploration-preview-v3.wav` | A 小调地下之家是否温暖、连续、不尖锐 |
| `floor1-underground-hearth-battle-preview-v3.wav` | 战斗是否急促、不断底，又不依赖噪声和高频 |
| `floor8-sunset-high-hall-preview-v2.wav` | 大提琴和圆号能否让 A 大调高堂辉煌、庄严但仍有凄凉 |
| `audio-preview-manifest.json` | 参数、设计状态、替代关系与 SHA-256 |

## 与第一版的区别

- 删除 25% Pulse 主旋律；
- 删除白噪声帽音和余烬噪点；
- 所有旋律使用正弦、三角或只包含前三个谐波的暖音色；
- 旋律控制在中音区；
- 音乐总线经过两次低成本单极低通；
- 第一层探索峰值降低到 `-8 dBFS`；
- 战斗中间四小节模拟 SQL 思考状态，减少低音密度、和弦重音和鼓点；
- 第八层以和弦、八度和副旋律制造大编制感，不使用采样库。
- 和弦、低音与叙述声部跨越小节边界，不再在每个乐句后完全释放；
- 三首加入循环式短房间反射，尾音不会被小节线切断；
- 高堂加入程序化大提琴持续线和程序化圆号主题；
- 循环边缘使用 8 ms 对称收束，首尾采样连续，不产生点击。

## 当前技术测量

| 试听 | 时长 | 综合响度 | 动态范围 | 峰值 |
|---|---:|---:|---:|---:|
| 第一层探索 V3 | 31.76 秒 | `-20.6 LUFS` | `3.7 LU` | `-8.0 dBFS` |
| 第一层战斗 V3 | 32.54 秒 | `-19.4 LUFS` | `4.6 LU` | `-6.0 dBFS` |
| 第八层高堂 V2 | 30.00 秒 | `-21.4 LUFS` | `3.4 LU` | `-7.0 dBFS` |

这些是 `ffmpeg ebur128` 的工程测量，不替代耳机、扬声器和连续战斗的主观疲劳测试。

## 重新生成

在项目根目录执行：

```bash
node scripts/generate-music-ascent-previews.mjs docs/design/assets/music-ascent-v1
```

生成器不下载依赖，不读取外部音频或 MIDI。相同脚本和参数应生成相同 SHA-256。

## 试听评审

请依次回答：

1. 第一层探索听起来是否像黑暗里可以休息的地方？
2. 第一层战斗是否有推进感，但不会让人急着退出 SQL 输入框？
3. 第八层是否明显比第一层规模更大？
4. 第八层是否仍然像空王城，而不是胜利庆典？
5. 连续听战斗 30 秒后，是否出现耳朵发紧或高频疲劳？

任何一项失败都只调整乐谱和音色，不直接接入运行时。

## 淘汰 / 被替代试听

以下文件保留用于 A/B 对照，不再代表当前方向：

- `floor1-underground-hearth-exploration-preview-v2.wav`
- `floor1-underground-hearth-battle-preview-v2.wav`
- `floor8-sunset-high-hall-preview-v1.wav`
- `../region-01/scribe-ember-archive-preview-v1.wav`
- `../region-01/floor1-wetwall-circuit-preview-v1.wav`
