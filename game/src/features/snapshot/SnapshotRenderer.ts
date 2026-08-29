/**
 * 快照渲染前的纯投影。
 *
 * 这里只把前后快照转换成渲染需要的派生值；真正的 DOM/Phaser 更新仍由
 * AppShell 和各自 renderer 完成，因而不会产生第二份规则状态。
 */
import {
  floorMapBlueprint,
  floorTransitPresentation,
} from "../../content/world/floorMapBlueprints";
import { LESSONS } from "../../content/curriculum/mvpLevel";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import type { LessonDefinition, Monster } from "../../domain/shared/types";
import { guidedPickupBetween, pickedItemsBetween } from "../../presentation/phaser/snapshotFeedback";

export interface SnapshotRenderModel {
  floorChanged: boolean;
  pickedItems: ReturnType<typeof pickedItemsBetween>;
  guidedPickup: ReturnType<typeof guidedPickupBetween>;
  room: GameSnapshot["roomGraph"]["nodes"][number] | undefined;
  roomLesson: LessonDefinition | undefined;
  combatLesson: LessonDefinition | undefined;
  roomLabel: string;
  biomeName: string;
  biomeIndex: number;
  routeTransit: ReturnType<typeof floorTransitPresentation>;
  target: Monster | undefined;
  stageChanged: boolean;
  enteredCombat: boolean;
  enteredChallenge: boolean;
  enteredCampfire: boolean;
  enteredInventory: boolean;
  enteredLoot: boolean;
  enteredDefeat: boolean;
  enteredDeathReview: boolean;
  terminalPlaceholder: string;
  musicMode: "explore" | "combat" | "boss";
}
export class SnapshotRenderer {
  project(
    previousSnapshot: GameSnapshot | null,
    snapshot: GameSnapshot,
    lastStageId: GameSnapshot["lessonStageId"] | null,
    lastMode: GameSnapshot["mode"] | null,
  ): SnapshotRenderModel {
    const floorChanged = Boolean(
      previousSnapshot && previousSnapshot.floor !== snapshot.floor,
    );
    const pickedItems = previousSnapshot
      ? pickedItemsBetween(previousSnapshot, snapshot)
      : [];
    const guidedPickup = previousSnapshot
      ? guidedPickupBetween(previousSnapshot, snapshot)
      : null;
    const room = snapshot.roomGraph.nodes.find(
      (node) => node.id === snapshot.currentRoomId,
    );
    const roomLesson = room?.lessonId
      ? LESSONS.find((lesson) => lesson.id === room.lessonId)
      : undefined;
    const combatLesson = snapshot.mode === "combat"
      ? LESSONS.find((lesson) => lesson.id === snapshot.lessonId)
      : undefined;
    const roomLabel = combatLesson?.concept ?? roomLesson?.concept
      ?? (snapshot.mode === "reward" ? "REWARD" : room?.type === "entry" ? "MAZE" : "EXPLORE");
    const biomeName = snapshot.biomePlan.regions.find(
      (region) => region.kind === snapshot.currentBiome,
    )?.name ?? "未知生态";
    const biomeIndex = Math.max(
      0,
      snapshot.biomePlan.regions.findIndex(
        (region) => region.kind === snapshot.currentBiome,
      ),
    );
    const routeTransit = floorTransitPresentation(
      floorMapBlueprint(snapshot.floor).routeTransit,
    );
    const target = snapshot.focusMonsterId === null
      ? undefined
      : snapshot.monsters.find((monster) => monster.id === snapshot.focusMonsterId);
    const stageChanged = snapshot.lessonStageId !== lastStageId;
    const enteredCombat = snapshot.mode === "combat" && lastMode !== "combat";
    const enteredChallenge = snapshot.mode === "challenge" && lastMode !== "challenge";
    const enteredCampfire = snapshot.mode === "campfire" && lastMode !== "campfire";
    const enteredInventory = snapshot.mode === "inventory" && lastMode !== "inventory";
    const enteredLoot = snapshot.mode === "loot" && lastMode !== "loot";
    const enteredDefeat = snapshot.mode === "defeat" && lastMode !== "defeat";
    const enteredDeathReview = snapshot.mode === "death-review" && lastMode !== "death-review";
    const terminalPlaceholder = snapshot.floor === 6
      ? "在这里写出完整的 INSERT / UPDATE / DELETE 或事务脚本；每次执行都使用一次性沙箱。"
      : snapshot.floor === 7
        ? "写出业务 SELECT / WITH；系统自动读取真实 SQLite EXPLAIN QUERY PLAN。"
        : snapshot.floor === 8
          ? "查询固定教学事故表；字段可用 Ctrl + Space 完整补全。"
          : "在这里完整写出 SELECT / WITH 查询；支持 Ctrl + Space 补全。";
    const musicMode = snapshot.mode === "combat"
      ? target?.isBoss ? "boss" : "combat"
      : "explore";
    return {
      floorChanged,
      pickedItems,
      guidedPickup,
      room,
      roomLesson,
      combatLesson,
      roomLabel,
      biomeName,
      biomeIndex,
      routeTransit,
      target,
      stageChanged,
      enteredCombat,
      enteredChallenge,
      enteredCampfire,
      enteredInventory,
      enteredLoot,
      enteredDefeat,
      enteredDeathReview,
      terminalPlaceholder,
      musicMode,
    };
  }
}

export function projectSnapshot(
  previousSnapshot: GameSnapshot | null,
  snapshot: GameSnapshot,
  lastStageId: GameSnapshot["lessonStageId"] | null,
  lastMode: GameSnapshot["mode"] | null,
): SnapshotRenderModel {
  return new SnapshotRenderer().project(
    previousSnapshot,
    snapshot,
    lastStageId,
    lastMode,
  );
}
