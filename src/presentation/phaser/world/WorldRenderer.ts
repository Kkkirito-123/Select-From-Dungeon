/**
 * 世界拓扑渲染协调器。
 *
 * 世界是否需要重建只由楼层和保存迷宫拓扑决定；本模块不生成地图，也不
 * 修改快照。它把这个生命周期判断从 DungeonScene 的快照订阅中抽出来。
 */
import type { GameSnapshot } from "../../../contracts/game/snapshots";

export class WorldRenderer {
  shouldRebuild(previous: GameSnapshot, next: GameSnapshot): boolean {
    return previous.floor !== next.floor ||
      previous.mazeFloor.topologyHash !== next.mazeFloor.topologyHash;
  }
}
