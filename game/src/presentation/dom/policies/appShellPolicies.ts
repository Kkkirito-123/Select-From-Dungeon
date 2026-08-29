import {
  NARRATIVE_ENDINGS,
  NARRATIVE_FLOORS,
  type NarrativeBeat,
  type NarrativeEndingStep,
} from "../../../content/narrative/narrativeContent";
import { finalMigrationStageNarrative } from "../../../content/narrative/finalMigrationSequence";
import { LESSONS, practiceStagesFor } from "../../../content/curriculum/mvpLevel";
import { LEVEL_XP_THRESHOLDS } from "../../../features/game-session/GameSession";
import { narrativeFloorFor } from "../../../domain/progression/narrative";
import {
  floorStoryProgress,
  storyEvidenceIdFromMarker,
  type FloorStoryMoment,
  type FloorStoryPresentation,
} from "../../../domain/progression/floorStory";
import { finalMigrationProgress } from "../../../domain/progression/finalMigration";
import { redactUndiscoveredMonsterIdentityText } from "../../../domain/progression/monsterIdentity";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { ExperienceSettlement } from "../../../contracts/game/results";
import { parseSchemaLines } from "../sqlAutocomplete";

/**
 * AppShell 的纯展示策略。
 * 这些函数把快照转换为标题、可见性、遮罩和摘要，不能修改 GameSession，
 * 也不应在这里执行 SQL 或读取浏览器存储。
 */
export function inspectionDialogCopy(message: string): {
  title: string;
  body: string;
} {
  // 带“说话者：正文”的作者文案拆成标题和正文，其余消息使用稳定兜底标题。
  const speaker = message.match(/^([^：]{1,12})：\s*(.+)$/s);
  if (speaker) {
    return { title: speaker[1], body: speaker[2] };
  }
  if (message.startsWith("档案水轮")) {
    return { title: "档案水轮", body: message };
  }
  if (message.startsWith("无名宿舍")) {
    return { title: "无名宿舍", body: message };
  }
  return { title: "现场调查", body: message };
}

export function redactSnapshotMonsterIdentity(
  value: string,
  snapshot: Pick<GameSnapshot, "monsters" | "profile">,
): string {
  // 展示层再次脱敏，防止旧快照或远程文案间接露出尚未回收的怪物名字。
  return redactUndiscoveredMonsterIdentityText(
    value,
    snapshot.monsters,
    snapshot.profile.discoveredMonsterIds,
  );
}

export function canOpenCombatTerminal(
  mode: GameSnapshot["mode"] | null | undefined,
  busy: boolean,
): boolean {
  // busy 期间禁止重复打开终端，避免两个提交按钮同时驱动同一回合。
  return mode === "combat" && !busy;
}

export function isInspectionPrimaryKey(
  event: Pick<KeyboardEvent, "code" | "key" | "repeat">,
): boolean {
  // Enter 与 E 都可确认调查，但长按 repeat 必须忽略，避免重复打开对话框。
  if (event.repeat) return false;
  return event.code === "KeyE" || event.key.toLowerCase() === "e" ||
    event.key === "Enter";
}

export function inspectionEscapeCanClose(
  recordKind: string | undefined,
  activePresentation: FloorStoryPresentation | null | undefined,
): boolean {
  // MIGRATE 阶段的阻塞叙事不能被 ESC 跳过，普通调查则允许退出。
  return recordKind !== "migration" && activePresentation !== "blocking";
}

export function shouldDismissTransientCard(
  shownAtMove: number | null,
  currentTotalMoves: number,
): boolean {
  // 移动满三步后自动收起拾取/结算卡，让它不会长期遮挡地图。
  return shownAtMove !== null && currentTotalMoves - shownAtMove >= 3;
}

export function narrativeMomentUsesRecordOverlay(
  presentation: FloorStoryPresentation,
): boolean {
  // blocking/inspect 需要记录式遮罩；banner 等轻量展示不抢占主交互。
  return presentation === "blocking" || presentation === "inspect";
}

const FINAL_MIGRATION_STORY_SOURCE_ID = "f8-story-migrate";
const NARRATIVE_EVIDENCE_TITLES = new Map(
  NARRATIVE_FLOORS.flatMap((floor) =>
    floor.lostNameEvidence.map((evidence) => [evidence.id, evidence.title] as const)
  ),
);

export function isFinalMigrationStoryMoment(
  moment: Pick<FloorStoryMoment, "floor" | "sourceId">,
): boolean {
  // 终局来源 ID 是内容契约的一部分，不能仅凭 floor=8 推断。
  return moment.floor === 8 && moment.sourceId === FINAL_MIGRATION_STORY_SOURCE_ID;
}

export function canPresentFinalMigrationStoryMoment(
  moment: Pick<FloorStoryMoment, "floor" | "sourceId">,
  snapshot: Pick<GameSnapshot, "floor" | "mode">,
): boolean {
  // 只有第八层 victory 状态才允许打开终局迁移叙事，防止提前展示结局。
  if (!isFinalMigrationStoryMoment(moment)) return true;
  return snapshot.floor === 8 && snapshot.mode === "victory";
}

export interface FinalMigrationRecordCopy {
  kicker: string;
  title: string;
  body: string;
  closeLabel: string;
  stepIndex: number;
  stepTotal: number;
}

export function finalMigrationRecordCopy(
  markerIds: readonly string[],
): FinalMigrationRecordCopy | null {
  // 将已完成 marker 转成当前待执行步骤；完成全部步骤时返回 null，交给终局页处理。
  const ending = NARRATIVE_ENDINGS[0];
  const progress = finalMigrationProgress(markerIds);
  if (!progress.nextStep) return null;
  const stepIndex = progress.completedStepIds.length;
  const stepTotal = ending.steps.length;
  return {
    kicker: `MIGRATE / STEP ${String(stepIndex + 1).padStart(2, "0")} OF ${String(stepTotal).padStart(2, "0")}`,
    title: `${stepIndex + 1} / ${stepTotal} · ${progress.nextStep.title}`,
    body: [
      ending.summary,
      "",
      progress.nextStep.description,
      "",
      `当前进度 · ${stepIndex} / ${stepTotal} 步已写入本地 Run。`,
    ].join("\n"),
    closeLabel: stepIndex + 1 === stepTotal
      ? "E · 执行最后一步"
      : `E · 执行并进入 ${stepIndex + 2} / ${stepTotal}`,
    stepIndex,
    stepTotal,
  };
}

export interface FinalMigrationArgumentCopy {
  argument: string;
  evidence: string;
  conclusion: string;
}

export function finalMigrationArgumentCopy(
  snapshot: {
    lessonId: GameSnapshot["lessonId"];
    lessonStageId: GameSnapshot["lessonStageId"];
    combat: { targetId: number } | null;
  },
): FinalMigrationArgumentCopy | null {
  // 只有与最终 Boss 对战的安全阶段才展示档案王论点，普通战斗不复用终局文案。
  const narrative = (
    snapshot.lessonId === "f8-security" &&
    snapshot.combat?.targetId === 84
  )
    ? finalMigrationStageNarrative(snapshot.lessonStageId)
    : null;
  if (!narrative) return null;
  const evidenceTitles = narrative.evidenceIds.map((evidenceId) =>
    NARRATIVE_EVIDENCE_TITLES.get(evidenceId) ?? evidenceId
  );
  return {
    argument: `ID #084：${narrative.archivistArgument}`,
    evidence: `调用证据：${evidenceTitles.join("、")}`,
    conclusion: `玩家结论：${narrative.playerConclusion}`,
  };
}

export function finalVictoryPortalReady(
  snapshot: {
    floor: GameSnapshot["floor"];
    mode: GameSnapshot["mode"];
    openedGateIds: readonly string[];
  },
): boolean {
  // 第八层还要额外完成 MIGRATE；前七层 victory 只需到达胜利状态即可过渡。
  if (snapshot.mode !== "victory") return false;
  return snapshot.floor !== 8 ||
    finalMigrationProgress(snapshot.openedGateIds).complete;
}

export function storyMomentRecordBody(moment: FloorStoryMoment): string {
  // 有 SQL 证据时追加查询、行数和目的；纯对白拍保持原有行顺序。
  if (!moment.query) return moment.lines.join("\n");
  const fields = moment.query.expectedColumns.length > 0
    ? moment.query.expectedColumns.join(" · ")
    : "无返回字段";
  return [
    ...moment.lines,
    "",
    `SQL 证据 · ${moment.query.title}`,
    moment.query.sql,
    `真实结果 · ${moment.query.expectedRowCount} 行 · ${fields}`,
    moment.query.purpose,
  ].join("\n");
}

export function canPresentQueuedNarrativeMoment(
  mode: GameSnapshot["mode"] | undefined,
  busy: boolean,
  combatSettlementVisible: boolean,
  blockingOverlayOpen: boolean,
): boolean {
  // 结算卡、阻塞遮罩或异步动作期间暂缓队列，避免两个弹层争夺焦点。
  if (busy || combatSettlementVisible || blockingOverlayOpen) return false;
  return mode === "explore" || mode === "transition" || mode === "victory";
}

export type SchemaTaskRole = "primary" | "related";

export function schemaRenderSignature(
  snapshot: Pick<
    GameSnapshot,
    | "focusMonsterId"
    | "lessonIntro"
    | "lessonStageId"
    | "locks"
    | "missionBody"
    | "schema"
  > & Partial<Pick<GameSnapshot, "taskBrief">>,
): string {
  // 签名只用于判断是否需要重绘 Schema 面板，不是安全 Hash，也不发送到网络。
  return [
    String(snapshot.focusMonsterId ?? ""),
    snapshot.lessonStageId,
    snapshot.lessonIntro,
    snapshot.missionBody,
    JSON.stringify(snapshot.taskBrief),
    snapshot.locks.join("\u0000"),
    snapshot.schema.join("\u0000"),
  ].join("\u0001");
}

export function schemaTaskTableRoles(
  snapshot: Pick<
    GameSnapshot,
    "focusMonsterId" | "lessonIntro" | "lessonStageId" | "missionBody" | "schema"
  > & Partial<Pick<GameSnapshot, "taskBrief">>,
): ReadonlyMap<string, SchemaTaskRole> {
  // 优先使用 taskBrief 的作者分析；旧快照缺少它时再从答案 SQL 做轻量回退推断。
  if (snapshot.taskBrief?.primaryTable) {
    const roles = new Map<string, SchemaTaskRole>();
    roles.set(snapshot.taskBrief.primaryTable.toLocaleLowerCase(), "primary");
    snapshot.taskBrief.relatedTables.forEach((table) => {
      roles.set(table.toLocaleLowerCase(), "related");
    });
    return roles;
  }
  const authoredStage = LESSONS
    .flatMap((lesson) => lesson.stages)
    .find((stage) => stage.id === snapshot.lessonStageId);
  const encounterStage = snapshot.focusMonsterId === null
    ? undefined
    : practiceStagesFor(snapshot.focusMonsterId)
      .find((stage) => stage.id === snapshot.lessonStageId);
  const answerSql = encounterStage?.answerSql ?? authoredStage?.answerSql ?? "";
  const availableTables = new Set(
    parseSchemaLines(snapshot.schema).map((table) => table.name.toLocaleLowerCase()),
  );
  const references: Array<{
    table: string;
    depth: number;
    index: number;
  }> = [];
  const tableNames = [...availableTables]
    .map((table) => table.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  if (tableNames !== "") {
    const pattern = new RegExp(
      `\\b(?:FROM|JOIN|UPDATE|INTO)\\s+(${tableNames})\\b`,
      "gi",
    );
    for (const match of answerSql.matchAll(pattern)) {
      const index = match.index ?? 0;
      let depth = 0;
      for (let cursor = 0; cursor < index; cursor += 1) {
        if (answerSql[cursor] === "(") depth += 1;
        if (answerSql[cursor] === ")") depth = Math.max(0, depth - 1);
      }
      references.push({
        table: match[1].toLocaleLowerCase(),
        depth,
        index,
      });
    }
  }
  if (references.length === 0) {
    const fallback = `${snapshot.missionBody} ${snapshot.lessonIntro}`.toLocaleLowerCase();
    [...availableTables].forEach((table, index) => {
      if (fallback.includes(table)) {
        references.push({ table, depth: 0, index });
      }
    });
  }
  if (references.length === 0 && availableTables.size === 1) {
    references.push({
      table: [...availableTables][0],
      depth: 0,
      index: 0,
    });
  }
  const shallowestDepth = Math.min(...references.map((reference) => reference.depth));
  const primary = references
    .filter((reference) => reference.depth === shallowestDepth)
    .sort((left, right) => left.index - right.index)[0]?.table;
  const roles = new Map<string, SchemaTaskRole>();
  references.forEach(({ table }) => {
    if (!availableTables.has(table)) return;
    roles.set(table, table === primary ? "primary" : "related");
  });
  return roles;
}

export interface CombatSettlementCopy {
  title: string;
  xp: string;
  progress: string;
  levelUp: string;
  reward: string;
}

export interface NarrativeRuntimeProgress {
  seenBeatIds: readonly string[];
  seenMomentIds: readonly string[];
  unlockedMoments: readonly FloorStoryMoment[];
  discoveredEvidenceIds: readonly string[];
  completedAscentIds: readonly string[];
  completedMigrationStepIds: readonly NarrativeEndingStep["id"][];
  latestBeat: NarrativeBeat | null;
  latestMoment: FloorStoryMoment | null;
  storyMomentTotal: number;
}

export function narrativeProgressForSnapshot(
  snapshot: Pick<
    GameSnapshot,
    | "completedLessons"
    | "completedRoomIds"
    | "floor"
    | "focusMonsterId"
    | "mode"
    | "monsters"
    | "openedGateIds"
    | "respawnCampfireId"
    | "roomGraph"
  >,
): NarrativeRuntimeProgress {
  // 每次从快照重算叙事条件，确保刷新/恢复后不会遗留 UI 自己维护的错误进度。
  const floor = narrativeFloorFor(snapshot.floor);
  const requiredLessonIds = snapshot.roomGraph.nodes
    .filter((node) => node.required && node.lessonId)
    .map((node) => node.lessonId!);
  const completedRequiredCount = requiredLessonIds
    .filter((lessonId) => snapshot.completedLessons.includes(lessonId))
    .length;
  const focusMonster = snapshot.focusMonsterId === null
    ? null
    : snapshot.monsters.find((monster) => monster.id === snapshot.focusMonsterId) ?? null;
  const floorBossLessonId = snapshot.roomGraph.nodes.find(
    (node) => node.id === snapshot.roomGraph.bossId,
  )?.lessonId;
  const bossReached = (
    snapshot.mode === "combat" &&
    focusMonster?.isBoss === true &&
    focusMonster.rank === "boss" &&
    focusMonster.lessonId === floorBossLessonId
  ) || snapshot.completedRoomIds.includes(snapshot.roomGraph.bossId);
  const floorCompleted = snapshot.mode === "transition" || snapshot.mode === "victory";
  const story = floorStoryProgress({
    floor: snapshot.floor,
    mode: snapshot.mode,
    completedLessons: snapshot.completedLessons,
    defeatedMonsterIds: snapshot.monsters
      .filter((monster) => monster.hp <= 0)
      .map((monster) => monster.id),
    openedGateIds: snapshot.openedGateIds,
  });

  const seenBeats = floor.beats.filter((beat) => {
    if (beat.kind === "floor-entry") return true;
    if (completedRequiredCount < beat.trigger.completedRequiredCount) return false;
    if (beat.kind === "midpoint-evidence") return true;
    if (beat.kind === "campfire") return snapshot.respawnCampfireId !== null;
    if (beat.kind === "boss") return bossReached;
    return floorCompleted;
  });
  const completedAscentIds = NARRATIVE_FLOORS.flatMap((entry) => {
    if (!entry.ascent) return [];
    if (
      entry.floor < snapshot.floor ||
      (entry.floor === snapshot.floor && floorCompleted)
    ) return [entry.ascent.id];
    return [];
  });
  const completedMigrationStepIds = snapshot.floor === 8
    ? finalMigrationProgress(snapshot.openedGateIds).completedStepIds
    : [];
  const explicitlyDiscoveredEvidenceIds = snapshot.openedGateIds
    .map(storyEvidenceIdFromMarker)
    .filter((id): id is string => id !== null);
  const hiddenAreaEvidenceIds = story.unlocked.flatMap((moment) => (
    moment.unlock.type === "gate-opened" &&
    snapshot.openedGateIds.includes(moment.unlock.gateId)
      ? moment.actions.flatMap((action) => (
          action.type === "evidence" ? [action.evidenceId] : []
        ))
      : []
  ));

  return {
    seenBeatIds: seenBeats.map((beat) => beat.id),
    seenMomentIds: story.unlockedIds,
    unlockedMoments: story.unlocked,
    discoveredEvidenceIds: [...new Set([
      ...explicitlyDiscoveredEvidenceIds,
      ...hiddenAreaEvidenceIds,
    ])],
    completedAscentIds,
    completedMigrationStepIds,
    latestBeat: seenBeats.at(-1) ?? null,
    latestMoment: story.latest,
    storyMomentTotal: story.total,
  };
}

export function combatSettlementCopy(
  experience: ExperienceSettlement,
  lootDropped: boolean,
  recoveryName?: string,
): CombatSettlementCopy {
  // 结算卡只格式化领域层已经计算好的 XP、等级和掉落信息，不重新判定奖励。
  const nextXp = LEVEL_XP_THRESHOLDS[experience.currentLevel];
  const progress = nextXp === undefined
    ? `LV.${experience.currentLevel} · ${experience.previousXp} → ${experience.currentXp} XP · MAX`
    : `LV.${experience.currentLevel} · ${experience.previousXp} → ${experience.currentXp} / ${nextXp} XP`;
  const levelUp = experience.currentLevel > experience.previousLevel
    ? `LEVEL UP · LV.${experience.previousLevel} → LV.${experience.currentLevel} · 生命上限 ${experience.previousMaxHp} → ${experience.currentMaxHp}`
    : "距离下一等级又近了一步";
  return {
    title: `击败 ${experience.monsterName}`,
    xp: `+${experience.gained} XP`,
    progress,
    levelUp,
    reward: recoveryName
      ? `${recoveryName} 已自动使用 · 不占背包${
        lootDropped ? "；另有战利品包留在战场" : ""
      }`
      : lootDropped
        ? "战利品包已留在战场 · 靠近后按 E 打开"
        : "本次没有物品掉落 · 经验已正常结算",
  };
}
