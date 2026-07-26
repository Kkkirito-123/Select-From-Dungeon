import type { FloorNumber } from "../domain/runGraph";

export const NARRATIVE_BEAT_KINDS = [
  "floor-entry",
  "midpoint-evidence",
  "campfire",
  "boss",
  "floor-end",
] as const;

export type NarrativeBeatKind = (typeof NARRATIVE_BEAT_KINDS)[number];

export const NARRATIVE_EVENT_KINDS = [
  "floor-entered",
  "required-progress",
  "campfire-rested",
  "boss-encountered",
  "floor-completed",
] as const;

export type NarrativeEventKind = (typeof NARRATIVE_EVENT_KINDS)[number];

export type LostNameEvidenceChannel =
  | "query-result"
  | "environment"
  | "scribe"
  | "relic"
  | "boss-feedback";

export interface NarrativeTrigger {
  event: NarrativeEventKind;
  floor: FloorNumber;
  /**
   * 触发所需的最低必修完成数。它只表达进度，不绑定课程名称或顺序。
   */
  completedRequiredCount: number;
}

export interface NarrativeBeat {
  id: string;
  floor: FloorNumber;
  kind: NarrativeBeatKind;
  title: string;
  lines: readonly string[];
  trigger: NarrativeTrigger;
  evidenceIds: readonly string[];
  endingId?: "MIGRATE";
}

export interface LostNameEvidence {
  id: string;
  floor: FloorNumber;
  title: string;
  channel: LostNameEvidenceChannel;
  fieldLabel: string;
  /**
   * null 表示玩家已经查询并确认字段值为 NULL。
   * 尚未获得的状态由领域层显示为 ???，不能与 null 混用。
   */
  resolvedValue: string | null;
  finding: string;
}

export interface AscentFacility {
  id: string;
  fromFloor: FloorNumber;
  toFloor: FloorNumber;
  name: string;
  arrival: string;
  transitionLine: string;
}

export interface FloorNarrative {
  floor: FloorNumber;
  regionName: string;
  requiredCount: number;
  beats: readonly NarrativeBeat[];
  lostNameEvidence: readonly LostNameEvidence[];
  ascent: AscentFacility | null;
}

export interface NarrativeEndingStep {
  id:
    | "snapshot"
    | "audit"
    | "preserve-history"
    | "build-isolated"
    | "validate"
    | "switch"
    | "keep-rollback";
  title: string;
  description: string;
}

export interface NarrativeEnding {
  id: "MIGRATE";
  title: string;
  summary: string;
  steps: readonly NarrativeEndingStep[];
  finalLine: string;
}

const EXPECTED_BEAT_EVENT: Readonly<Record<NarrativeBeatKind, NarrativeEventKind>> = {
  "floor-entry": "floor-entered",
  "midpoint-evidence": "required-progress",
  campfire: "campfire-rested",
  boss: "boss-encountered",
  "floor-end": "floor-completed",
};

function beat(
  floor: FloorNumber,
  kind: NarrativeBeatKind,
  completedRequiredCount: number,
  title: string,
  lines: readonly string[],
  evidenceIds: readonly string[] = [],
  endingId?: "MIGRATE",
): NarrativeBeat {
  return {
    id: `narrative:f${floor}:${kind}`,
    floor,
    kind,
    title,
    lines,
    trigger: {
      event: EXPECTED_BEAT_EVENT[kind],
      floor,
      completedRequiredCount,
    },
    evidenceIds,
    ...(endingId ? { endingId } : {}),
  };
}

function evidence(
  floor: FloorNumber,
  suffix: string,
  title: string,
  channel: LostNameEvidenceChannel,
  fieldLabel: string,
  resolvedValue: string | null,
  finding: string,
): LostNameEvidence {
  return {
    id: `lost-name:f${floor}:${suffix}`,
    floor,
    title,
    channel,
    fieldLabel,
    resolvedValue,
    finding,
  };
}

function ascent(
  fromFloor: Exclude<FloorNumber, 8>,
  toFloor: FloorNumber,
  name: string,
  arrival: string,
  transitionLine: string,
): AscentFacility {
  return {
    id: `ascent:f${fromFloor}:f${toFloor}`,
    fromFloor,
    toFloor,
    name,
    arrival,
    transitionLine,
  };
}

export const NARRATIVE_FLOORS: readonly FloorNarrative[] = [
  {
    floor: 1,
    regionName: "地下余烬档案",
    requiredCount: 5,
    beats: [
      beat(1, "floor-entry", 0, "火记得你", [
        "CURRENT RECORD：0 ROWS。",
        "RESTORE PERMISSION：VALID。",
      ]),
      beat(1, "midpoint-evidence", 3, "空白不是没看见", [
        "床牌已经从 ??? 变为 NULL：这里确实没有当前值。",
        "当前登记册没有你，水轮、权限与恢复痕迹却仍然承认你。",
      ], ["lost-name:f1:current-record"]),
      beat(1, "campfire", 3, "余烬旁的复盘页", [
        "已确认：当前记录缺失，恢复权限有效。",
        "待回答：是谁留下了这条恢复权限？",
      ]),
      beat(1, "boss", 4, "0 行不等于不存在", [
        "ID #005 只承认一行完整记录，正在注销你的恢复权限。",
        "不要向它索求名字；证明这条规则漏掉了仍可恢复的历史。",
      ], ["lost-name:f1:restore-permission"]),
      beat(1, "floor-end", 5, "《失名录》第一页", [
        "登记规则已接受恢复轨迹；0 行不再自动等于不存在。",
        "抄写员保留空白页，档案升降机在潮声中亮起。",
      ]),
    ],
    lostNameEvidence: [
      evidence(
        1,
        "current-record",
        "当前居民查询",
        "query-result",
        "匹配记录",
        "0 ROWS",
        "当前居民表里没有能够单独代表玩家的记录。",
      ),
      evidence(
        1,
        "restore-permission",
        "恢复权限回执",
        "boss-feedback",
        "恢复权限",
        "VALID",
        "没有当前记录的玩家仍携带有效的恢复权限。",
      ),
    ],
    ascent: ascent(
      1,
      2,
      "档案升降机",
      "潮汐码头",
      "余烬低音没有消失，海面的六拍律动从升降井上方传来。",
    ),
  },
  {
    floor: 2,
    regionName: "潮汐群岛",
    requiredCount: 5,
    beats: [
      beat(2, "floor-entry", 0, "潮声有顺序", [
        "同一段恢复轨迹从七个来源归来。",
        "抄写员把七张湿纸分开压住：先不要把相似叫作重复。",
      ]),
      beat(2, "midpoint-evidence", 3, "关系必须说明两端", [
        "排序只决定航线优先级，去重也没有删除任何来源。",
        "INNER JOIN 把记录分别连回具体房间与区域。",
      ], ["lost-name:f2:identity-count"]),
      beat(2, "campfire", 3, "避风岛的复盘页", [
        "已确认：共同轨迹中存在不同频道和地点。",
        "待回答：每条记录分别来自哪里？",
      ]),
      beat(2, "boss", 4, "只照亮多数", [
        "ID #014 正把出现最多的记录标成唯一答案。",
        "证明多个来源都可靠，阻止其余六页被覆盖。",
      ], ["lost-name:f2:shared-trace"]),
      beat(2, "floor-end", 5, "七页，不是一个答案", [
        "灯塔同时照亮七个来源，没有一页被写成你的真名。",
        "北岸渡船驶向白霜；下一问是它们怎样彼此相连。",
      ]),
    ],
    lostNameEvidence: [
      evidence(
        2,
        "identity-count",
        "冲突标识计数",
        "query-result",
        "旧标识数量",
        "7",
        "多条旧身份记录同时与玩家有关，无法安全合并成单一记录。",
      ),
      evidence(
        2,
        "shared-trace",
        "跨岛恢复轨迹",
        "environment",
        "轨迹归组",
        "SAME GROUP",
        "不同岛屿上的身份信号共享同一段恢复轨迹。",
      ),
    ],
    ascent: ascent(
      2,
      3,
      "北岸渡船",
      "白霜墓原",
      "船靠上冻岸，流动的海面音型逐渐凝成稀疏长音。",
    ),
  },
  {
    floor: 3,
    regionName: "白霜墓原",
    requiredCount: 6,
    beats: [
      beat(3, "floor-entry", 0, "没有主人的遗物", [
        "墓碑、遗物和王家档案各自保存了一部分关系。",
        "单看任何一张表，都只会得到残缺的人。",
      ]),
      beat(3, "midpoint-evidence", 3, "相同的旧物", [
        "多名死者的遗物记录都指向玩家正在携带的旧编号。",
        "连接关系互相矛盾，但没有一条可以直接丢弃。",
      ], ["lost-name:f3:relic-links"]),
      beat(3, "campfire", 3, "守墓人的问题", [
        "事实：墓籍已经确认一件遗物的当前主人为 NULL。",
        "疑点：没有当前主人，是否等于它从未属于任何人？",
      ]),
      beat(3, "boss", 5, "冰下的见证", [
        "墓主要求档案给出唯一继承人，查询却返回多条可靠关系。",
        "冰层下的人没有被当前表承认，他们的遗物仍记得玩家。",
      ], ["lost-name:f3:current-owner"]),
      beat(3, "floor-end", 6, "葬火井", [
        "墓门从内部打开，避风营地重新出现在身后。",
        "葬火井点燃，向下接入山腹的巨大升炉。",
      ]),
    ],
    lostNameEvidence: [
      evidence(
        3,
        "relic-links",
        "遗物关系联查",
        "query-result",
        "关联死者",
        "MULTIPLE",
        "多个死者的可靠遗物关系同时指向玩家。",
      ),
      evidence(
        3,
        "current-owner",
        "墓籍当前主人",
        "relic",
        "current_owner",
        null,
        "该字段已被查询并确认是 NULL，不是尚未查询。",
      ),
    ],
    ascent: ascent(
      3,
      4,
      "葬火井",
      "元素升炉底层",
      "冰冷长音被低频机械脉冲接管，井壁后方开始出现熔炉光。",
    ),
  },
  {
    floor: 4,
    regionName: "元素升炉",
    requiredCount: 6,
    beats: [
      beat(4, "floor-entry", 0, "同一次命令", [
        "火、冰、雷三个炉区看似互不相关。",
        "每个异常却都依赖同一个更早的结果。",
      ]),
      beat(4, "midpoint-evidence", 3, "嵌套的源头", [
        "沿依赖链向内查询，所有异常都回到同一批全城更新。",
        "命令没有完成，也没有被撤销。",
      ], ["lost-name:f4:command-batch"]),
      beat(4, "campfire", 3, "升炉旁的复盘", [
        "事实：三种异常共享同一个未结束的命令批次。",
        "疑点：是谁让一次临时更新持续了数百年？",
      ]),
      beat(4, "boss", 5, "炉心的执行记录", [
        "炉心守卫把每个故障描述成独立事故。",
        "完整依赖链证明，它们只是同一次命令的不同后果。",
      ], ["lost-name:f4:unfinished-state"]),
      beat(4, "floor-end", 6, "穿过云层", [
        "升炉完成最后一段校验，带着玩家冲出城墙地基。",
        "远处第一次出现完整夕阳，王城仍在更高处。",
      ]),
    ],
    lostNameEvidence: [
      evidence(
        4,
        "command-batch",
        "全城更新批次",
        "query-result",
        "命令批次",
        "ROYAL-UPDATE-01",
        "所有地区异常都依赖同一批全城更新。",
      ),
      evidence(
        4,
        "unfinished-state",
        "炉心执行状态",
        "boss-feedback",
        "事务状态",
        "OPEN",
        "全城更新既未提交，也未回滚。",
      ),
    ],
    ascent: ascent(
      4,
      5,
      "垂直升炉",
      "黑铁外城",
      "升炉越过云层，大调和弦第一次随夕阳照进城墙。",
    ),
  },
  {
    floor: 5,
    regionName: "黑铁外城",
    requiredCount: 6,
    beats: [
      beat(5, "floor-entry", 0, "被排序的人", [
        "外城把居民分区、编号，再按王室需要重新排序。",
        "城墙上的肖像顺序与档案中的历史顺序并不相同。",
      ]),
      beat(5, "midpoint-evidence", 3, "多个历史位置", [
        "玩家的恢复痕迹同时出现在多个分区和多个历史位置。",
        "这些位置前后相连，却不属于同一个人的连续生平。",
      ], ["lost-name:f5:history-positions"]),
      beat(5, "campfire", 3, "城墙上的复盘", [
        "事实：玩家在同一历史序列中拥有多个互相重叠的位置。",
        "疑点：若顺序可以被重写，哪一个位置才算原本的你？",
      ]),
      beat(5, "boss", 5, "竞技场的唯一名次", [
        "外城统领要求为玩家选出唯一的第一名记录。",
        "窗口中的前后版本证明，任何单选都会截断其余历史。",
      ], ["lost-name:f5:overlap"]),
      beat(5, "floor-end", 6, "吊桥向上", [
        "外城吊桥落下，来时的海在夕阳中缩成一条银线。",
        "桥的另一端，是龙脊上的王室工坊。",
      ]),
    ],
    lostNameEvidence: [
      evidence(
        5,
        "history-positions",
        "历史位置窗口",
        "query-result",
        "出现位置",
        "MULTIPLE WINDOWS",
        "玩家痕迹分布在多个相互重叠的历史顺序中。",
      ),
      evidence(
        5,
        "overlap",
        "城墙肖像重影",
        "environment",
        "版本重叠",
        "CONFIRMED",
        "多个旧轮廓会在玩家经过时同时与其重合。",
      ),
    ],
    ascent: ascent(
      5,
      6,
      "黑铁吊桥",
      "龙脊上城",
      "吊桥跨过云海，低音增加一个八度，远处工坊开始应答。",
    ),
  },
  {
    floor: 6,
    regionName: "龙脊上城",
    requiredCount: 6,
    beats: [
      beat(6, "floor-entry", 0, "可以撤销的工坊", [
        "王室工坊允许写入，但所有练习都发生在隔离副本。",
        "这里第一次要求玩家改变记录，也要求玩家学会撤销。",
      ]),
      beat(6, "midpoint-evidence", 3, "撤销链中的轮廓", [
        "工坊的撤销历史保存着大量已经不在当前表中的旧记录。",
        "它们的残片与玩家的动作逐一对应。",
      ], ["lost-name:f6:undo-origin"]),
      beat(6, "campfire", 3, "写入前的复盘", [
        "事实：玩家的轮廓来自多段被删除、覆盖和回滚的历史。",
        "疑点：由许多旧记录组成的人，能否拥有一次新的选择？",
      ]),
      beat(6, "boss", 5, "龙王的提交权", [
        "龙王只承认不可撤销的写入，拒绝保留任何失败版本。",
        "事务沙箱证明：能回滚的改变，比盲目的提交更可靠。",
      ], ["lost-name:f6:write-carrier"]),
      beat(6, "floor-end", 6, "王室升降台", [
        "工坊把一枚写权限标记交给玩家，但没有授予最终提交权。",
        "升降台驶向云海上的残照王苑。",
      ]),
    ],
    lostNameEvidence: [
      evidence(
        6,
        "undo-origin",
        "撤销历史来源",
        "query-result",
        "实体来源",
        "UNDO HISTORY",
        "玩家由多段已经撤销的旧记录残片共同形成。",
      ),
      evidence(
        6,
        "write-carrier",
        "工坊写入载体",
        "relic",
        "写入资格",
        "CONDITIONAL",
        "玩家可以在可回滚环境写入，但尚无最终提交权。",
      ),
    ],
    ascent: ascent(
      6,
      7,
      "王室升降台",
      "残照王苑",
      "鼓点逐渐退去，宽阔和弦托住升降台穿过最后一层云。",
    ),
  },
  {
    floor: 7,
    regionName: "残照王苑",
    requiredCount: 6,
    beats: [
      beat(7, "floor-entry", 0, "看不见不等于不存在", [
        "王苑把最常访问的记录放在最短路径上。",
        "旧记录仍在远处，只是不再被当前路径优先找到。",
      ]),
      beat(7, "midpoint-evidence", 3, "被绕开的历史", [
        "执行路径没有找到玩家，完整扫描却找到了仍然存在的历史页。",
        "系统不是删除了它们，而是学会了绕开它们。",
      ], ["lost-name:f7:hidden-history"]),
      beat(7, "campfire", 3, "残照下的复盘", [
        "事实：不可达的旧记录仍然存在于王家档案中。",
        "疑点：如果系统永远不再寻找它们，这与删除有何不同？",
      ]),
      beat(7, "boss", 5, "索引树心", [
        "树心坚持最快的路径就是唯一正确的路径。",
        "对照计划证明：路径只改变寻找方式，不能改变事实本身。",
      ], ["lost-name:f7:scan-proof"]),
      beat(7, "floor-end", 6, "高堂长阶", [
        "晶体捷径全部点亮，原本遥远的道路仍被保留。",
        "最后一段夕阳落在金色长阶上，高堂大门随之打开。",
      ]),
    ],
    lostNameEvidence: [
      evidence(
        7,
        "hidden-history",
        "当前访问路径",
        "query-result",
        "玩家记录",
        "NOT REACHED",
        "当前访问路径没有抵达玩家对应的历史记录。",
      ),
      evidence(
        7,
        "scan-proof",
        "完整扫描证明",
        "boss-feedback",
        "历史记录",
        "STILL PRESENT",
        "完整扫描证明旧记录仍在，访问路径不等于事实本身。",
      ),
    ],
    ascent: ascent(
      7,
      8,
      "金色长阶",
      "黑金高堂",
      "A 大调主题第一次完整出现，高窗只剩最后一道残晖。",
    ),
  },
  {
    floor: 8,
    regionName: "黑金高堂",
    requiredCount: 7,
    beats: [
      beat(8, "floor-entry", 0, "仍未结束的王国", [
        "七个知识翼围绕同一场未完成的全城更新。",
        "王座前没有军队，只有仍在等待决定的历史版本。",
      ]),
      beat(8, "midpoint-evidence", 4, "众名集合", [
        "历史版本逐一还原，没有任何单条记录能够完整解释玩家。",
        "只有保留整个集合，玩家的行动才保持连续。",
      ], ["lost-name:f8:identity-set"]),
      beat(8, "campfire", 4, "最后一次复盘", [
        "事实：玩家不是一条遗失记录，而是众多旧记录形成的集合。",
        "疑点：取得写权限之后，怎样避免再次替所有人作出不可逆决定？",
      ]),
      beat(8, "boss", 6, "最后的档案官", [
        "魔王就是拒绝最终提交、并与王座守护系统融合的档案官。",
        "她保存了可恢复的历史，也让整个王国停滞了数百年。",
        "她要求玩家证明自己会验证、回滚，而不只是写入。",
      ], ["lost-name:f8:archivist-verdict"]),
      beat(8, "floor-end", 7, "最后一次迁移", [
        "玩家拒绝在损坏的现在与被抹去的过去之间直接二选一。",
        "只读快照、审计、隔离构建与验证依次完成。",
        "新版本接管王城，旧历史和明确的回滚路径仍被保留。",
      ], [], "MIGRATE"),
    ],
    lostNameEvidence: [
      evidence(
        8,
        "identity-set",
        "身份版本集合",
        "query-result",
        "玩家身份",
        "SET OF HISTORIES",
        "只有旧记录的完整集合能够解释玩家持续存在的行动。",
      ),
      evidence(
        8,
        "archivist-verdict",
        "档案官最终审计",
        "boss-feedback",
        "写权限判断",
        "READY TO MIGRATE",
        "玩家已证明自己能够查询、验证、计划并保留回滚路径。",
      ),
    ],
    ascent: null,
  },
] as const;

export const NARRATIVE_ENDINGS: readonly NarrativeEnding[] = [
  {
    id: "MIGRATE",
    title: "最后一次迁移",
    summary: "不覆盖现在，也不抹去过去；先建立一个可验证、可恢复的新版本。",
    steps: [
      {
        id: "snapshot",
        title: "保存只读快照",
        description: "冻结当前事实，避免迁移过程中继续漂移。",
      },
      {
        id: "audit",
        title: "审计冲突与缺失",
        description: "记录重复、覆盖、空值和无法关联的历史。",
      },
      {
        id: "preserve-history",
        title: "保留历史版本",
        description: "不以清理之名删除仍可能被恢复的人。",
      },
      {
        id: "build-isolated",
        title: "隔离构建新结构",
        description: "所有写入先发生在不会污染当前王国的副本中。",
      },
      {
        id: "validate",
        title: "验证新版本",
        description: "核对数量、关系、约束和访问路径。",
      },
      {
        id: "switch",
        title: "切换到新版本",
        description: "只有全部检查通过后，才让新结构接管王城。",
      },
      {
        id: "keep-rollback",
        title: "保留回滚方案",
        description: "迁移完成后仍保留明确、可执行的返回路径。",
      },
    ],
    finalLine: "没有一个名字被选作唯一答案；众名第一次共同拥有了明天。",
  },
] as const;
