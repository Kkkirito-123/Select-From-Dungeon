/** 创建 Phaser 游戏实例并注入事实会话、音频和事件反馈依赖。 */
import Phaser from "phaser";
import type { ArcadeAudio } from "../audio/ArcadeAudio";
import type { FeedbackDirector } from "../feedback/FeedbackDirector";
import { MAP_ROWS, TILE_SIZE } from "../content/mvpLevel";
import { GameSession } from "../domain/GameSession";
import { BattleScene } from "./BattleScene";
import { DungeonScene } from "./DungeonScene";

export function createGame(
  session: GameSession,
  audio: ArcadeAudio,
  feedback: FeedbackDirector,
): Phaser.Game {
  /** 创建并启动 Phaser 根实例，场景仅通过注入依赖访问游戏事实。 */
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
