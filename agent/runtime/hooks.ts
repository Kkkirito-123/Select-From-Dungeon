/**
 * Agent 语义 Hook 判定。
 * Hook 面向“需要新内容”的状态变化，而不是每一帧或每一步移动。
 */
import type { GameSnapshot } from "../../src/domain/types";

/** 四种触发分别对应开场、路线、精英解锁复盘和楼层收尾。 */
export type AgentHook =
  | {
      type: "floor-start";
      phase: "opening";
      floor: GameSnapshot["floor"];
    }
  | {
      type: "route-guidance";
      phase: "route";
      floor: GameSnapshot["floor"];
      objectiveRoomId: string | null;
      objectiveTitle: string | null;
      level: GameSnapshot["navigationGuidance"]["level"];
      direction: GameSnapshot["navigationGuidance"]["direction"];
      distance: number | null;
    }
  | {
      type: "elite-defeated";
      phase: "route";
      floor: GameSnapshot["floor"];
      monsterId: number;
    }
  | {
      type: "floor-end";
      phase: "ending";
      floor: GameSnapshot["floor"];
      mode: "transition" | "victory";
    };

function routeHook(snapshot: GameSnapshot): AgentHook {
  // 路线 Hook 只携带当前导航目标，不把地图几何交给 Agent。
  const guidance = snapshot.navigationGuidance;
  return {
    type: "route-guidance",
    phase: "route",
    floor: snapshot.floor,
    objectiveRoomId: guidance.objectiveRoomId,
    objectiveTitle: guidance.objectiveTitle,
    level: guidance.level,
    direction: guidance.direction,
    distance: guidance.distance,
  };
}

export function displayHook(snapshot: GameSnapshot): AgentHook {
  // 为 UI 当前读取状态选择最合适的展示阶段；楼层结束优先级最高。
  if (snapshot.mode === "transition" || snapshot.mode === "victory") {
    return {
      type: "floor-end",
      phase: "ending",
      floor: snapshot.floor,
      mode: snapshot.mode,
    };
  }
  if (snapshot.navigationGuidance.level > 0) return routeHook(snapshot);
  const elite = snapshot.monsters.find(
    (monster) => monster.floor === snapshot.floor && monster.rank === "elite" && monster.hp <= 0,
  );
  if (elite) {
    return {
      type: "elite-defeated",
      phase: "route",
      floor: snapshot.floor,
      monsterId: elite.id,
    };
  }
  return {
    type: "floor-start",
    phase: "opening",
    floor: snapshot.floor,
  };
}

export function detectAgentHook(
  previous: GameSnapshot | null,
  current: GameSnapshot,
): AgentHook | null {
  // 对比相邻快照，只在楼层、精英生命或导航目标发生语义变化时触发。
  if (!previous || previous.floor !== current.floor) {
    return displayHook(current);
  }

  if (
    (current.mode === "transition" || current.mode === "victory") &&
    previous.mode !== current.mode
  ) {
    return {
      type: "floor-end",
      phase: "ending",
      floor: current.floor,
      mode: current.mode,
    };
  }

  const previousMonsters = new Map(previous.monsters.map((monster) => [monster.id, monster]));
  const defeatedElite = current.monsters.find((monster) => {
    const before = previousMonsters.get(monster.id);
    return monster.floor === current.floor &&
      monster.rank === "elite" &&
      monster.hp <= 0 &&
      (before?.hp ?? monster.maxHp) > 0;
  });
  if (defeatedElite) {
    return {
      type: "elite-defeated",
      phase: "route",
      floor: current.floor,
      monsterId: defeatedElite.id,
    };
  }

  const beforeGuidance = previous.navigationGuidance;
  const nextGuidance = current.navigationGuidance;
  const objectiveChanged = beforeGuidance.objectiveRoomId !== nextGuidance.objectiveRoomId;
  const guidanceEscalated = nextGuidance.level > beforeGuidance.level;
  if ((objectiveChanged || guidanceEscalated) && nextGuidance.level > 0) {
    return routeHook(current);
  }

  return null;
}

export function hookKey(hook: AgentHook): string {
  // 稳定序列化 Hook，供上层去重和调试使用。
  return JSON.stringify(hook);
}
