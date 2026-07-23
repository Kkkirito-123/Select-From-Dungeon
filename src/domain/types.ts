import type {
  FloorNumber,
  RoomGraph,
  RoomReward,
  RoomType,
  RunLessonId,
} from "./runGraph";
import type { MazeFloor } from "./mazeGenerator";
import type { GuidedMapPlan } from "./guidedMap";
import type { WorldActor } from "./monsterRoaming";
import type { CampaignProgress } from "./campaign";

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
  | "campfire"
  | "inventory"
  | "loot"
  | "death-review"
  | "challenge"
  | "combat"
  | "reward"
  | "transition"
  | "victory"
  | "defeat";

export type GateChallengeId = "aggregate-breach" | "relation-breach";

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

export type CampfirePhase = "front" | "middle" | "rear";

export interface Campfire extends Position {
  id: string;
  phase: CampfirePhase;
  roomNodeId: string;
  restPosition: Position;
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
    | "join-chain"
    | "bone-blade";
  name: string;
  damage: number;
  heatReduction: number;
  description: string;
}

export interface Armor {
  id: "slime-vest" | "vine-armor";
  name: string;
  maxArmor: number;
  description: string;
}

export interface EquipmentItem {
  instanceId: string;
  kind: "weapon" | "armor";
  protected: boolean;
  weapon?: Weapon;
  armor?: Armor;
  armorHp?: number;
}

export interface Consumable {
  id: "slime-gel" | "water-drop" | "forest-fruit" | "whetstone" | "repair-shard";
  name: string;
  description: string;
  effect: "heal-hp" | "heal-armor" | "heal-both";
  amount: number;
}

export interface ConsumableStack {
  item: Consumable;
  quantity: number;
}

export interface LootItem {
  dropId: string;
  itemId: string;
  kind: "weapon" | "armor" | "consumable" | "reward";
  name: string;
  description: string;
  guaranteed: boolean;
  probability: number;
  protected: boolean;
  weapon?: Weapon;
  armor?: Armor;
  armorHp?: number;
  consumable?: Consumable;
  rewardId?: RoomReward;
}

export interface LootBundle extends Position {
  id: string;
  sourceMonsterId: number | null;
  sourceRoomId: string;
  floor: FloorNumber;
  items: LootItem[];
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
  armor: Armor | null;
  armorHp: number;
}

export interface LessonStageDefinition {
  id: LessonStageId;
  objective: string;
  queryTemplate: string;
  answerSql: string;
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

export interface GateChallengeBrief {
  id: GateChallengeId;
  gateId: string;
  title: string;
  objective: string;
  schema: string[];
  hints: string[];
}

export type AnswerResult =
  | "correct"
  | "missing-concept"
  | "wrong-result"
  | "syntax-error";

export type BattleOutcome = "hit" | "countered" | "victory" | "defeat";

export const MAX_ANSWER_HISTORY = 200;

export interface AnswerAttemptRecord {
  id: number;
  battleId: number;
  floor: FloorNumber;
  monsterId: number;
  monsterName: string;
  lessonId: LessonId;
  stageId: LessonStageId;
  stageObjective: string;
  round: number;
  sql: string;
  answerSql: string;
  result: AnswerResult;
  outcome: BattleOutcome;
  feedback: string;
  hintLevel: number;
}

export interface GameSnapshot {
  mode: PlayMode;
  campaign: CampaignProgress;
  lessonId: LessonId;
  lessonStageId: LessonStageId;
  lessonStageIndex: number;
  player: PlayerState;
  monsters: Monster[];
  combat: CombatState | null;
  focusMonsterId: number | null;
  roomGraph: RoomGraph;
  mazeFloor: MazeFloor;
  guidedMap: GuidedMapPlan;
  campfires: Campfire[];
  activeCampfireId: string | null;
  respawnCampfireId: string | null;
  activeLootBundleId: string | null;
  inSafeZone: boolean;
  worldActors: WorldActor[];
  groundItems: GroundItem[];
  lootBundles: LootBundle[];
  equipmentInventory: EquipmentItem[];
  consumables: ConsumableStack[];
  keyItems: string[];
  acquiredUniqueItemIds: string[];
  discoveredCells: string[];
  currentRoomId: string;
  currentRoomTitle: string;
  currentRoomType: RoomType;
  visitedRoomIds: string[];
  completedRoomIds: string[];
  availableRoomIds: string[];
  completedLessons: LessonId[];
  challengeGateId: string;
  openedGateIds: string[];
  activeGateChallenge: GateChallengeBrief | null;
  relics: Relic[];
  profile: ProfileProgress;
  availableLoot: LootDrop | null;
  claimableReward: ClaimableReward | null;
  runSeed: string;
  floor: FloorNumber;
  queryCount: number;
  totalMoves: number;
  stepsSinceEncounter: number;
  safeStepsRemaining: number;
  hintLevel: number;
  battleReview: AnswerAttemptRecord[];
  floorReview: AnswerAttemptRecord[];
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
  version: 9;
  generatorVersion: 4;
  campaign: CampaignProgress;
  floor: FloorNumber;
  graph: RoomGraph;
  mazeFloor: MazeFloor;
  campfires: Campfire[];
  activeCampfireId: string | null;
  respawnCampfireId: string | null;
  activeLootBundleId: string | null;
  worldActors: WorldActor[];
  groundItems: GroundItem[];
  lootBundles: LootBundle[];
  equipmentInventory: EquipmentItem[];
  consumables: ConsumableStack[];
  keyItems: string[];
  acquiredUniqueItemIds: string[];
  discoveredCells: string[];
  mode: PlayMode;
  currentRoomId: string;
  player: PlayerState;
  monsters: Monster[];
  combat: CombatState | null;
  visitedRoomIds: string[];
  completedRoomIds: string[];
  completedLessons: LessonId[];
  openedGateIds: string[];
  activeGateChallengeId: GateChallengeId | null;
  relics: Relic[];
  availableLoot: LootDrop | null;
  claimableReward: ClaimableReward | null;
  queryCount: number;
  totalMoves: number;
  stepsSinceEncounter: number;
  safeStepsRemaining: number;
  hintLevel: number;
  answerHistory: AnswerAttemptRecord[];
  battleSequence: number;
  reviewBattleId: number | null;
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
  blockedBy: "none" | "wall" | "gate" | "campfire" | "mode";
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
  kind:
    | "none"
    | "campfire"
    | "challenge"
    | "combat"
    | "loot"
    | "reward"
    | "loot-bundle"
    | "shortcut";
  message: string;
}

export interface InventoryResolution {
  ok: boolean;
  message: string;
  remainingItemIds: string[];
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

export interface ExperienceSettlement {
  monsterId: number;
  monsterName: string;
  gained: number;
  previousXp: number;
  currentXp: number;
  previousLevel: number;
  currentLevel: number;
  previousMaxHp: number;
  currentMaxHp: number;
}

export interface TurnResolution {
  accepted: boolean;
  message: string;
  queryTargetIds: number[];
  attackTargetIds: number[];
  hpUpdates: Array<{ id: number; hp: number }>;
  killedIds: number[];
  playerDamage: number;
  armorDamage: number;
  heatAdded: number;
  locksBroken: string[];
  locksRemaining: string[];
  events: CombatEvent[];
  mode: PlayMode;
  stageAdvanced: boolean;
  lessonCompleted: LessonId | null;
  experience: ExperienceSettlement | null;
}

export interface GateChallengeResolution {
  accepted: boolean;
  opened: boolean;
  gateId: string;
  message: string;
  playerDamage: number;
  armorDamage: number;
  mode: PlayMode;
}
