import type { FloorNumber, RunLessonId } from "../../domain/runGraph";

export type FloorExperienceId =
  | "floor-01-ember-archive"
  | "floor-02-tidal-archipelago";

export type FloorAssetKind =
  | "tileset"
  | "actor"
  | "setpiece"
  | "ui"
  | "music"
  | "ambient"
  | "sfx";

export interface FloorAssetReference {
  key: string;
  kind: FloorAssetKind;
  path: string;
  fallback: string;
}

export interface FloorAssetPackDefinition {
  id: string;
  version: number;
  manifestPath: string;
  assets: readonly FloorAssetReference[];
}

export interface NormalizedPosition {
  x: number;
  y: number;
}

export interface FloorAnchorDefinition {
  roomNodeId: string;
  position: NormalizedPosition;
  facing: "north" | "east" | "south" | "west";
  clearance: { width: number; height: number };
}

export interface FloorRegionDefinition {
  id: string;
  name: string;
  purpose: string;
  lessonIds: readonly RunLessonId[];
  material: string;
  ambience: string;
  landmarkIds: readonly string[];
}

export type FloorLandmarkKind =
  | "spawn-anchor"
  | "campfire"
  | "story"
  | "world-machine"
  | "shortcut"
  | "transit"
  | "boss-arena"
  | "vista";

export interface FloorLandmarkDefinition {
  id: string;
  name: string;
  kind: FloorLandmarkKind;
  regionId: string;
  anchor: FloorAnchorDefinition;
  assetKey: string;
  fallback: string;
  interaction: string | null;
  stateKeys: readonly string[];
  minimapIcon: string;
}

export interface FloorNpcPlacement {
  id: string;
  name: string;
  role: string;
  regionId: string;
  anchor: FloorAnchorDefinition;
  assetKey: string;
  alwaysShowName: boolean;
}

export type StoryAction =
  | { type: "banner"; text: string }
  | { type: "dialogue"; speaker: string; lines: readonly string[] }
  | { type: "world-effect"; effect: string }
  | { type: "camera-focus"; landmarkId: string }
  | { type: "evidence"; evidenceId: string }
  | { type: "music-state"; state: string };

export interface StoryEventDefinition {
  id: string;
  title: string;
  trigger: string;
  repeat: "once" | "repeatable";
  priority: number;
  actions: readonly StoryAction[];
  completionFact: string | null;
}

export interface FloorEnvironmentRuleDefinition {
  id: string;
  when: string;
  state: string;
  visibleResult: string;
}

export interface FloorAdminPreset {
  id: string;
  label: string;
  completedLessonIds: readonly RunLessonId[];
  defeatedMonsterIds: readonly number[];
  openedGateIds: readonly string[];
  collectedKeyItems: readonly string[];
  focusLandmarkId: string;
}

export interface FloorExperienceDefinition {
  id: FloorExperienceId;
  floor: Extract<FloorNumber, 1 | 2>;
  title: string;
  subtitle: string;
  version: number;
  signature: string;
  assetPack: FloorAssetPackDefinition;
  regions: readonly FloorRegionDefinition[];
  landmarks: readonly FloorLandmarkDefinition[];
  npcPlacements: readonly FloorNpcPlacement[];
  storyEvents: readonly StoryEventDefinition[];
  environmentRules: readonly FloorEnvironmentRuleDefinition[];
  adminPresets: readonly FloorAdminPreset[];
}
