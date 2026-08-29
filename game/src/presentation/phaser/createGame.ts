/**
 * Phaser 依赖组装入口。
 *
 * 这里只设置渲染器、缩放和场景实例，并把 GameSession、音频和反馈边界
 * 注入场景；场景自身不应在这里重新实现游戏规则。
 */
import Phaser from "phaser";
import type { ArcadeAudio } from "../../infrastructure/audio/ArcadeAudio";
import type { FeedbackDirector } from "../../infrastructure/feedback/FeedbackDirector";
import { MAP_ROWS, TILE_SIZE } from "../../content/curriculum/mvpLevel";
import { GameSession } from "../../features/game-session/GameSession";
import { BattleScene } from "./BattleScene";
import { DungeonScene } from "./DungeonScene";

export function createGame(
  session: GameSession,
  audio: ArcadeAudio,
  feedback: FeedbackDirector,
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-root",
    width: MAP_ROWS[0].length * TILE_SIZE,
    height: MAP_ROWS.length * TILE_SIZE,
    backgroundColor: "#11111f",
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    fps: {
      target: 30,
      limit: 30,
      smoothStep: true,
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [new DungeonScene(session, feedback), new BattleScene(session, audio)],
  });
}
