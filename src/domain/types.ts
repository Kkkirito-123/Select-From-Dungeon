import type {
  FloorNumber,
  RoomGraph,
  RoomReward,
  RoomType,
  RunLessonId,
} from "./runGraph";
import type { MazeFloor } from "./mazeGenerator";
import type { WorldActor } from "./monsterRoaming";

export type LessonId = RunLessonId;

export type LessonStageId =
  | "select-name"
  | "select-weakness"
  | "where-target"
  | "where-weakness"
  | "null-target"
  | "null-name"
  | "group-signals"
  | "having-shield"
  | "having-core"
  | "practice-select"
  | "practice-where"
  | "practice-null"
  | "practice-group"
  | "order-peak"
  | "order-top-two"
  | "distinct-status"
  | "inner-join-room"
  | "inner-join-sector"
  | "left-join-unarmed"
  | "join-boss-groups"
  | "join-boss-core"
  | "practice-order"
  | "practice-distinct"
  | "practice-inner-join"
  | "practice-left-join";

export type PlayMode =
  | "explore"
  | "combat"
  | "reward"
  | "transition"
  | "victory"
  | "defeat";

export type MonsterKind =
  | "projection-slime"
  | "filter-hound"
  | "null-ghost"
  | "aggregate-golem"
  | "sort-drake"
  | "distinct-mimic"
  | "join-spider"
  | "left-join-wraith"
  | "relation-titan";

export type QueryFeature =
  | "select"
  | "from"
  | "where"
  | "and"
  | "is-null"
  | "count"
  | "group-by"
  | "having"
  | "order-by"
  | "limit"
  | "distinct"
  | "join"
  | "on"
  | "left-join";

export interface Position {
  x: number;
  y: number;
}

export interface Monster extends Position {
  floor: FloorNumber;
  id: number;
  lessonId: LessonId;
  roomId: number;
  name: string;
  species: string;
  kind: MonsterKind;
  hp: number;
  maxHp: number;
  armor: number;
  damage: number;
  attackName: string;
  status: string;
  weakness: string | null;
  masterId: number | null;
  isBoss: boolean;
  rank: "normal" | "elite" | "boss";
  encounterType: "curriculum" | "ambush";
}

export interface Weapon {
  id:
    | "data-blade"
    | "filter-bow"
    | "null-lantern"
    | "aggregate-hammer"
    | "sort-saber"
    | "join-chain";
  name: string;
  damage: number;
  heatReduction: number;
  description: string;
}

export interface Relic {
  id: "cache-chip" | "schema-eye" | "rollback-heart" | "query-lens";
  name: string;
  description: string;
  heatReduction: number;
}

export interface PlayerState extends Position {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  heat: number;
  weapon: Weapon;
}

export interface LessonStageDefinition {
  id: LessonStageId;
  objective: string;
  queryTemplate: string;
  hints: string[];
  locks: string[];
  requiredFeatures: QueryFeature[];
  attackTargetIds: number[];
}

export interface LessonDefinition {
  id: LessonId;
  concept: string;
  title: string;
  intro: string;
  schema: string[];
  primaryMonsterId: number;
  stages: LessonStageDefinition[];
}

export interface LootDrop extends Position {
  weapon: Weapon;
}

export interface CombatState {
  targetId: number;
  kind: "curriculum" | "ambush";
  round: number;
  successStep: number;
  intent: {
    name: string;
    damage: number;
    locks: string[];
  };
}

export interface ClaimableReward {
  id: RoomReward;
  name: string;
  description: string;
  kind: "heal" | "cool" | "relic" | "weapon" | "key" | "event";
}

export interface GroundItem extends Position {
  id: string;
  sourceRoomId: string;
  name: string;
  description: string;
  kind: "weapon" | "relic" | "heal" | "event" | "key";
  collection: "touch" | "interact";
  rewardId: RoomReward | null;
  weapon?: Weapon;
}

export interface ProfileProgress {
  version: 2;
  masteredLessons: LessonId[];
  attempts: Record<LessonId, number>;
  victories: number;
  bestRunQueries: number | null;
}

export interface GameSnapshot {
  mode: PlayMode;
  lessonId: LessonId;
  lessonStageId: LessonStageId;
  lessonStageIndex: number;
  player: PlayerState;
  monsters: Monster[];
  combat: CombatState | null;
  focusMonsterId: number | null;
  roomGraph: RoomGraph;
  mazeFloor: MazeFloor;
  worldActors: WorldActor[];
  groundItems: GroundItem[];
  discoveredCells: string[];
  currentRoomId: string;
  currentRoomTitle: string;
  currentRoomType: RoomType;
  visitedRoomIds: string[];
  completedRoomIds: string[];
  availableRoomIds: string[];
  completedLessons: LessonId[];
  relics: Relic[];
  profile: ProfileProgress;
  availableLoot: LootDrop | null;
  claimableReward: ClaimableReward | null;
  runSeed: string;
  floor: FloorNumber;
  queryCount: number;
  stepsSinceEncounter: number;
  safeStepsRemaining: number;
  hintLevel: number;
  missionTitle: string;
  missionBody: string;
  lessonIntro: string;
  schema: string[];
  queryTemplate: string;
  hints: string[];
  locks: string[];
  banner: string;
  interactionPrompt: string;
}

export interface SavedRun {
  version: 4;
  generatorVersion: 4;
  floor: FloorNumber;
  graph: RoomGraph;
  mazeFloor: MazeFloor;
  worldActors: WorldActor[];
  groundItems: GroundItem[];
  discoveredCells: string[];
  mode: PlayMode;
  currentRoomId: string;
  player: PlayerState;
  monsters: Monster[];
  combat: CombatState | null;
  visitedRoomIds: string[];
  completedRoomIds: string[];
  completedLessons: LessonId[];
  relics: Relic[];
  availableLoot: LootDrop | null;
  claimableReward: ClaimableReward | null;
  queryCount: number;
  totalMoves: number;
  stepsSinceEncounter: number;
  safeStepsRemaining: number;
  hintLevel: number;
  banner: string;
}

export type SavedGame = SavedRun;

export interface MoveResolution {
  ok: boolean;
  moved: boolean;
  from: Position;
  to: Position;
  encounterId: number | null;
  pickedItemIds: string[];
  blockedBy: "none" | "wall" | "gate" | "mode";
  message: string;
}

export interface PatrolMove {
  monsterId: number;
  from: Position;
  to: Position;
  moved: boolean;
}

export interface PatrolBatchResolution {
  moves: PatrolMove[];
  encounterId: number | null;
}

export interface InteractionResolution {
  ok: boolean;
  kind: "none" | "combat" | "loot" | "reward";
  message: string;
}

export interface TravelResolution {
  ok: boolean;
  roomId: string;
  message: string;
}

export interface SqlQueryResult {
  sql: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  targetIds: number[];
  plan: string[];
  baseHeat: number;
  features: QueryFeature[];
}

export interface QueryEvaluation {
  accepted: boolean;
  kind: "exact" | "wrong-result" | "missing-concept";
  message: string;
  locksBroken: string[];
  locksRemaining: string[];
  attackTargetIds: number[];
}

export interface CombatEvent {
  type: "query-cast" | "player-hit" | "enemy-hit" | "death" | "loot-drop";
  sourceId?: number;
  targetId?: number;
  amount?: number;
}

export interface TurnResolution {
  accepted: boolean;
  message: string;
  queryTargetIds: number[];
  attackTargetIds: number[];
  hpUpdates: Array<{ id: number; hp: number }>;
  killedIds: number[];
  playerDamage: number;
  heatAdded: number;
  locksBroken: string[];
  locksRemaining: string[];
  events: CombatEvent[];
  mode: PlayMode;
  stageAdvanced: boolean;
  lessonCompleted: LessonId | null;
}
