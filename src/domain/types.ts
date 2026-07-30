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
import type {
  BiomeKind,
} from "../content/biomeContent";
import type { BiomePlan } from "./biome";
import type { FloorHazard } from "./floorLabyrinth";

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
  | "practice-left-join"
  | "practice-group-core"
  | "practice-left-core"
  | "practice-forest-order"
  | "practice-forest-join"
  | "practice-forest-join-core"
  | "lake-boss-scan"
  | "lake-boss-sort"
  | "frog-boss-left"
  | "frog-boss-distinct"
  | "f3-inner-room"
  | "f3-left-unarmed"
  | "f3-self-master"
  | "f3-chain-gear"
  | "f3-union-patrol"
  | "f3-audit-groups"
  | "f3-audit-core"
  | "f4-scalar-first"
  | "f4-in-frost"
  | "f4-exists-gear"
  | "f4-correlated-gear"
  | "f4-cte-armor"
  | "f4-recursive-rooms"
  | "f4-recursive-core"
  | "practice-bone"
  | "practice-zombie"
  | "practice-spirit"
  | "practice-spirit-core"
  | "practice-wraith"
  | "grave-boss-scan"
  | "grave-boss-core"
  | "practice-fire"
  | "practice-ice"
  | "practice-storm"
  | "practice-storm-core"
  | "practice-spark"
  | "forge-boss-scan"
  | "forge-boss-core"
  | "f5-over-count"
  | "f5-row-number-order"
  | "f5-rank-ties"
  | "f5-lag-lead-delta"
  | "f5-frame-running"
  | "f5-top-n-groups"
  | "f5-top-n-core"
  | "practice-goblin"
  | "practice-orc"
  | "practice-knight"
  | "practice-troll"
  | "iron-boss-scan"
  | "iron-boss-core"
  | "f6-insert-row"
  | "f6-update-target"
  | "f6-delete-duplicate"
  | "f6-constraint-ignore"
  | "f6-transaction-rollback"
  | "f6-savepoint-rollback"
  | "f6-savepoint-commit"
  | "practice-hatchling"
  | "practice-wyvern"
  | "practice-thunder-drake"
  | "practice-crystal-drake"
  | "dragon-boss-scan"
  | "dragon-boss-core"
  | "f7-btree-search"
  | "f7-composite-prefix"
  | "f7-covering-read"
  | "f7-invalid-rewrite"
  | "f7-plan-audit"
  | "f7-optimize-top"
  | "f7-optimize-core"
  | "practice-branch"
  | "practice-root"
  | "practice-crystal"
  | "practice-vine"
  | "index-boss-scan"
  | "index-boss-core"
  | "f8-mvcc-visible"
  | "f8-lock-cycle"
  | "f8-isolation-phantom"
  | "f8-modeling-safe"
  | "f8-replication-fresh"
  | "f8-sharding-balance"
  | "f8-final-snapshot"
  | "f8-final-deadlock"
  | "f8-final-anomaly"
  | "f8-final-route"
  | "f8-final-security"
  | "practice-demon"
  | "practice-dark-knight"
  | "practice-lich"
  | "practice-golem"
  | "throne-boss-scan"
  | "throne-boss-core";

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

export type GateChallengeId =
  | "aggregate-breach"
  | "relation-breach"
  | "grave-breach"
  | "forge-breach"
  | "iron-breach"
  | "dragon-breach"
  | "index-breach"
  | "throne-breach";

export type MonsterKind =
  | "projection-slime"
  | "filter-hound"
  | "null-ghost"
  | "aggregate-golem"
  | "sort-drake"
  | "distinct-mimic"
  | "join-spider"
  | "left-join-wraith"
  | "relation-titan"
  | "skeleton"
  | "zombie"
  | "ghost"
  | "necromancer"
  | "fire-spirit"
  | "ice-spirit"
  | "thunder-spirit"
  | "elemental-king"
  | "goblin"
  | "orc"
  | "knight"
  | "troll"
  | "castle-lord"
  | "hatchling"
  | "wyvern"
  | "dragon"
  | "dragon-king"
  | "index-guard"
  | "root-beast"
  | "crystal-spirit"
  | "vine-witch"
  | "index-eye"
  | "index-tree"
  | "demon-soldier"
  | "dark-knight"
  | "lich"
  | "obsidian-golem"
  | "replica-twin"
  | "shard-beast"
  | "demon-king";

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
  | "left-join"
  | "self-join"
  | "union"
  | "subquery"
  | "in"
  | "exists"
  | "cte"
  | "recursive"
  | "over"
  | "partition-by"
  | "row-number"
  | "rank"
  | "dense-rank"
  | "lag"
  | "lead"
  | "window-frame"
  | "insert"
  | "update"
  | "delete"
  | "constraint"
  | "transaction"
  | "savepoint"
  | "rollback"
  | "commit";

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
    | "slime-sword"
    | "hunter-bow"
    | "bone-blade"
    | "rune-staff"
    | "iron-axe"
    | "dragon-spear"
    | "crystal-blade"
    | "royal-sword";
  name: string;
  damage: number;
  heatReduction: number;
  description: string;
}

export interface Armor {
  id:
    | "slime-vest"
    | "vine-armor"
    | "bone-armor"
    | "rune-armor"
    | "ember-echo-robe"
    | "iron-armor"
    | "dragon-armor"
    | "crystal-armor"
    | "royal-armor";
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
  id:
    | "slime-gel"
    | "water-drop"
    | "frog-potion"
    | "forest-fruit"
    | "holy-water"
    | "fire-crystal"
    | "ice-crystal"
    | "repair-plate"
    | "dragon-potion"
    | "crystal-fruit"
    | "black-potion"
    | "full-potion"
    | "whetstone"
    | "repair-shard";
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
  version: 3;
  masteredLessons: LessonId[];
  attempts: Record<LessonId, number>;
  discoveredMonsterIds: number[];
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
  adminMode: boolean;
  adminPanelOpen: boolean;
  regionTransfer: {
    sequence: number;
    fromName: string;
    toName: string;
  } | null;
  campaign: CampaignProgress;
  biomePlan: BiomePlan;
  currentBiome: BiomeKind;
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
  hazards: FloorHazard[];
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
  version: 11;
  generatorVersion: 4 | 5;
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
  blockedBy: "none" | "wall" | "gate" | "campfire" | "threshold" | "mode";
  hazard: {
    id: string;
    name: string;
    playerDamage: number;
    armorDamage: number;
  } | null;
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
    | "inspection"
    | "campfire"
    | "challenge"
    | "combat"
    | "loot"
    | "reward"
    | "loot-bundle"
    | "secret"
    | "shortcut"
    | "region-portal";
  message: string;
  landmarkId?: string;
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
  type:
    | "query-cast"
    | "player-hit"
    | "enemy-hit"
    | "death"
    | "identity-recovered"
    | "loot-drop"
    | "auto-heal";
  sourceId?: number;
  targetId?: number;
  amount?: number;
  itemName?: string;
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

export type QueryResultDisclosure =
  | "shape-only"
  | "safe-values"
  | "full-values";

export interface TurnResolution {
  accepted: boolean;
  resultDisclosure: QueryResultDisclosure;
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
  resultDisclosure: QueryResultDisclosure;
  opened: boolean;
  gateId: string;
  message: string;
  playerDamage: number;
  armorDamage: number;
  mode: PlayMode;
}
