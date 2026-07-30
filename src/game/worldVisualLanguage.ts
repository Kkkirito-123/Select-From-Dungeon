import type { FloorLandmarkKind } from "../content/floorExperience";

/**
 * World-space color is semantic: gold means the player can act, teal means
 * data/SQL state, red means danger. Passive scenery must stay below actors.
 */
export const WORLD_VISUAL_LANGUAGE = {
  passiveDecorationAlpha: 0.24,
  passiveFeatureAlpha: 0.4,
  zoneWashAlpha: 0.16,
  bossZoneWashAlpha: 0.26,
  interactionGold: 0xe0bd68,
  interactionInk: 0x15130f,
  interactionIdleAlpha: 0.62,
  interactionNearAlpha: 0.94,
} as const;

export function landmarkActionVerb(kind: FloorLandmarkKind): string {
  if (kind === "sql-seal") return "解读";
  if (kind === "transit") return "启动";
  if (kind === "shortcut") return "开启";
  if (kind === "campfire") return "休息";
  return "调查";
}

export function landmarkInteractionLabel(input: {
  name: string;
  kind: FloorLandmarkKind;
  interaction: string | null;
  nearby: boolean;
}): string {
  if (!input.nearby) return input.name;
  if (!input.interaction) return input.name;
  return `E · ${landmarkActionVerb(input.kind)}${input.name}`;
}

export function shouldRenderPassiveFeature(index: number): boolean {
  return index % 2 === 0;
}
