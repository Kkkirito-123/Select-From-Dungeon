import {
  NARRATIVE_ENDINGS,
  NARRATIVE_FLOORS,
  type NarrativeEndingStep,
} from "./narrativeContent";

export const FINAL_MIGRATION_STAGE_IDS = [
  "f8-final-snapshot",
  "f8-final-deadlock",
  "f8-final-anomaly",
  "f8-final-route",
  "f8-final-security",
] as const;

export type FinalMigrationStageId =
  (typeof FINAL_MIGRATION_STAGE_IDS)[number];

export interface FinalHistoryPage {
  floor: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  evidenceId: string;
  conclusion: string;
}

export interface FinalMigrationStageNarrative {
  stageId: FinalMigrationStageId;
  archivistArgument: string;
  playerConclusion: string;
  evidenceIds: readonly string[];
  migrationStepIds: readonly NarrativeEndingStep["id"][];
}

export const FINAL_HISTORY_PAGES: readonly FinalHistoryPage[] = [
  {
    floor: 1,
    evidenceId: "lost-name:f1:restore-permission",
    conclusion: "0 行只能说明当前没有匹配记录，不能否定仍然有效的历史与恢复许可。",
  },
  {
    floor: 2,
    evidenceId: "lost-name:f2:shared-trace",
    conclusion: "相似值可以共享轨迹，却仍然来自不同地点；来源不能被粗暴合并。",
  },
  {
    floor: 3,
    evidenceId: "lost-name:f3:relic-links",
    conclusion: "名字缺失之后，跨表关系与遗物仍能共同作证。",
  },
  {
    floor: 4,
    evidenceId: "lost-name:f4:unfinished-state",
    conclusion: "长期 OPEN 是一个可查询状态，不是必须永远维持的命运。",
  },
  {
    floor: 5,
    evidenceId: "lost-name:f5:overlap",
    conclusion: "处理顺序会伤人；排序应被审计，而不是改写事实。",
  },
  {
    floor: 6,
    evidenceId: "lost-name:f6:undo-origin",
    conclusion: "改变可以先在隔离副本中验证，并保留局部撤销的路径。",
  },
  {
    floor: 7,
    evidenceId: "lost-name:f7:scan-proof",
    conclusion: "访问路径只改变代价；没被当前路径找到的记录仍可能真实存在。",
  },
] as const;

export const FINAL_MIGRATION_STAGE_NARRATIVES:
  readonly FinalMigrationStageNarrative[] = [
    {
      stageId: "f8-final-snapshot",
      archivistArgument: "当前快照之外的一切都不可靠。",
      playerConclusion: "第一层已经证明：当前 0 行不能否定仍然有效的历史。",
      evidenceIds: ["lost-name:f1:restore-permission"],
      migrationStepIds: ["snapshot"],
    },
    {
      stageId: "f8-final-deadlock",
      archivistArgument: "相同记录应当被合并，只留下一个答案。",
      playerConclusion: "第二层保留来源，第三层保留关系；相似不能抹去来路。",
      evidenceIds: [
        "lost-name:f2:shared-trace",
        "lost-name:f3:relic-links",
      ],
      migrationStepIds: ["audit", "preserve-history"],
    },
    {
      stageId: "f8-final-anomaly",
      archivistArgument: "依赖与顺序已经太复杂，迁移只会制造更多伤害。",
      playerConclusion: "第四层暴露依赖，第五层审计顺序；复杂性需要被记录和隔离。",
      evidenceIds: [
        "lost-name:f4:unfinished-state",
        "lost-name:f5:overlap",
      ],
      migrationStepIds: ["build-isolated"],
    },
    {
      stageId: "f8-final-route",
      archivistArgument: "任何修改都会污染唯一还存在的世界。",
      playerConclusion: "第六层验证回滚，第七层验证路径；改变可以先证明，再切换。",
      evidenceIds: [
        "lost-name:f6:undo-origin",
        "lost-name:f7:scan-proof",
      ],
      migrationStepIds: ["validate"],
    },
    {
      stageId: "f8-final-security",
      archivistArgument: "永远保持 OPEN，才不会失去任何一个人。",
      playerConclusion: "身份是可审计的历史集合；我们可以迁移，并明确保留返回路径。",
      evidenceIds: ["lost-name:f8:identity-set"],
      migrationStepIds: ["switch", "keep-rollback"],
    },
  ] as const;

export function finalMigrationStageNarrative(
  stageId: string,
): FinalMigrationStageNarrative | null {
  return FINAL_MIGRATION_STAGE_NARRATIVES.find(
    (entry) => entry.stageId === stageId,
  ) ?? null;
}

export function validateFinalMigrationSequence(): string[] {
  const errors: string[] = [];
  const evidenceIds = new Set(
    NARRATIVE_FLOORS.flatMap((floor) =>
      floor.lostNameEvidence.map((evidence) => evidence.id)
    ),
  );
  const endingStepIds = NARRATIVE_ENDINGS[0]?.steps.map((step) => step.id) ?? [];
  const referencedStepIds = FINAL_MIGRATION_STAGE_NARRATIVES.flatMap(
    (stage) => stage.migrationStepIds,
  );

  if (
    FINAL_MIGRATION_STAGE_NARRATIVES.map((stage) => stage.stageId).join("|") !==
      FINAL_MIGRATION_STAGE_IDS.join("|")
  ) {
    errors.push("档案王五阶段叙事顺序与课程阶段不一致。");
  }
  if (
    FINAL_HISTORY_PAGES.map((page) => page.floor).join("|") !==
      "1|2|3|4|5|6|7"
  ) {
    errors.push("终局七页史证必须按第一至第七层各保留一页。");
  }
  [...FINAL_HISTORY_PAGES, ...FINAL_MIGRATION_STAGE_NARRATIVES.flatMap(
    (stage) => stage.evidenceIds.map((evidenceId) => ({ evidenceId })),
  )].forEach(({ evidenceId }) => {
    if (!evidenceIds.has(evidenceId)) {
      errors.push(`终局引用了不存在的证据 ${evidenceId}。`);
    }
  });
  if (
    referencedStepIds.join("|") !== endingStepIds.join("|") ||
    new Set(referencedStepIds).size !== endingStepIds.length
  ) {
    errors.push("档案王五阶段必须恰好覆盖七个 MIGRATE 步骤一次。");
  }
  return errors;
}
