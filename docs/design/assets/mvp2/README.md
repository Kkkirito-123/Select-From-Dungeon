# MVP 2.0 角色进化参考图

## 文件

- `character-progression-reference-v1.png`

## 用途

这是 MVP 2.0 的角色视觉参考，不进入运行时 Bundle。运行时仍由 Phaser 几何图元按
`src/content/world/actorVisuals.ts` 与 `src/presentation/phaser/PixelActorFactory.ts` 绘制，以保持低开销、
清晰轮廓和装备即时换色。

## 生成记录

- 模式：项目内参考图驱动的原创图像生成。
- 输入参考：本仓库原创的
  `docs/design/assets/region-01/scribe-character-concept-v1.png`。
- 提示词摘要：制作一张无文字、正交视角、深海军蓝背景的像素角色阵容；从左到右展示
  “无钥者、档案员、迁移者、定史者”四个玩家阶段，以及温柔的抄写员；保持蓝灰到黑金的
  上升色谱、青色与黄铜点缀、清楚轮廓和可转译为 Phaser 几何图元的形状；不得出现品牌、
  Logo 或现有游戏角色。
- 状态：`CONCEPT_ONLY`。

## 运行时转译规则

- 角色进化不是换一张大贴图，而是逐层增加斗篷、长衣、徽记与装备颜色。
- 怪物、玩家与抄写员共用同一套粗边、少色、强轮廓规则。
- 装备必须在角色身上可见；武器与防具变化由实际 `PlayerState` 驱动。
- 生成图只决定方向，运行时几何模型和动画均为本仓库独立实现。
