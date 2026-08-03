import type { GameSnapshot } from "../../src/domain/types";

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
  return JSON.stringify(hook);
}
