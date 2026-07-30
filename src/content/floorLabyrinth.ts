import type { FloorNumber } from "../domain/runGraph";

export type FloorHazardKind =
  | "archive-cutter"
  | "tidal-current"
  | "frost-crack"
  | "elemental-vent"
  | "alarm-wire"
  | "magma-fissure"
  | "root-snare"
  | "migration-rift";

export interface FloorLabyrinthRouteIntent {
  roomNodeId: string;
  intent: string;
}

export interface FloorLabyrinthBossGate extends FloorLabyrinthRouteIntent {
  gateId: string;
}

export interface FloorLabyrinthShortcut {
  gateId: string;
  intent: string;
}

export interface FloorLabyrinthHiddenArea {
  id: string;
  roomNodeId: string;
  gateId: string;
}

/**
 * Stable, non-persistent navigation contract shared by all eight floors.
 *
 * It intentionally contains content intent rather than generated coordinates or
 * Run state. Runtime systems may resolve the referenced room/gate IDs against
 * the current seeded maze without adding another save-data shape.
 */
export interface FloorLabyrinthContract {
  floor: FloorNumber;
  mazeName: string;
  topologySignature: string;
  regionCount: 3;
  entry: FloorLabyrinthRouteIntent;
  entryPrompt: string;
  exit: FloorLabyrinthRouteIntent;
  bossGate: FloorLabyrinthBossGate;
  shortcut: FloorLabyrinthShortcut;
  hiddenArea: FloorLabyrinthHiddenArea;
  safeRoomIds: readonly [string, string];
  sightRadius: number;
  hazardKind: FloorHazardKind;
  hazardName: string;
  hazardTrigger: string;
  hazardCount: number;
  hazardDamage: number;
}

function contract(
  value: FloorLabyrinthContract,
): FloorLabyrinthContract {
  return value;
}

export const FLOOR_LABYRINTHS = {
  1: contract({
    floor: 1,
    mazeName: "双岸失名档案",
    topologySignature: "looped-keep:dual-bank-continuous",
    regionCount: 3,
    entry: { roomNodeId: "floor-1-entry", intent: "在余烬书房确认身份缺口并准备进入失名迷宫" },
    entryPrompt: "离开余烬书房后视野会缩小；穿过水闸调查档案，并记住可返回的安全区。",
    exit: { roomNodeId: "floor-1-boss", intent: "击败登记官后乘档案升降机上行" },
    bossGate: {
      roomNodeId: "floor-1-boss",
      gateId: "gate:floor-1-boss",
      intent: "以聚合审计解除登记厅封印",
    },
    shortcut: { gateId: "shortcut:1:return", intent: "让登记前哨直接回接余烬书房" },
    hiddenArea: {
      id: "f1-hidden-sealed-vault",
      roomNodeId: "floor-1-treasure",
      gateId: "gate:floor-1-treasure",
    },
    safeRoomIds: ["floor-1-entry", "floor-1-rest"],
    sightRadius: 3,
    hazardKind: "archive-cutter",
    hazardName: "档案切纸轮",
    hazardTrigger: "从暗槽中弹出并高速切过",
    hazardCount: 2,
    hazardDamage: 1,
  }),
  2: contract({
    floor: 2,
    mazeName: "月潮群岛船闸环线",
    topologySignature: "aggregate-hub:archipelago-lock-loop",
    regionCount: 3,
    entry: { roomNodeId: "floor-2-entry", intent: "从潮汐浅滩辨认航标并选择第一段航线" },
    entryPrompt: "暗潮陷阱散布在岸线；先读取航标，再沿渡口连接湖区、沼泽与灯塔。",
    exit: { roomNodeId: "floor-2-boss", intent: "校准月潮灯塔后乘北岸渡船离开" },
    bossGate: {
      roomNodeId: "floor-2-boss",
      gateId: "gate:floor-2-boss",
      intent: "以关系查询校准灯塔船闸",
    },
    shortcut: { gateId: "shortcut:2:return", intent: "开放码头与灯塔之间的短航线" },
    hiddenArea: {
      id: "f2-hidden-wreck-ledger",
      roomNodeId: "floor-2-treasure",
      gateId: "gate:floor-2-treasure",
    },
    safeRoomIds: ["floor-2-entry", "floor-2-rest"],
    sightRadius: 4,
    hazardKind: "tidal-current",
    hazardName: "暗潮回流",
    hazardTrigger: "卷起一股逆向回流",
    hazardCount: 2,
    hazardDamage: 1,
  }),
  3: contract({
    floor: 3,
    mazeName: "白霜墓原回环",
    topologySignature: "relational-islands:reverse-grave-loop",
    regionCount: 3,
    entry: { roomNodeId: "floor-3-entry", intent: "从冻岸石冢逆向追查墓碑之间的关系" },
    entryPrompt: "白霜遮住远处墓碑；沿骨桥核对关系，孤立记录可能通向无主遗物室。",
    exit: { roomNodeId: "floor-3-lesson-6", intent: "完成继承审计后点燃葬火井" },
    bossGate: {
      roomNodeId: "floor-3-lesson-6",
      gateId: "gate:floor-3-lesson-6",
      intent: "以三表审计解除王座墓门",
    },
    shortcut: { gateId: "shortcut:3:return", intent: "把幽火地宫回接冻岸石冢" },
    hiddenArea: {
      id: "f3-hidden-reliquary",
      roomNodeId: "floor-3-treasure",
      gateId: "gate:floor-3-treasure",
    },
    safeRoomIds: ["floor-3-entry", "floor-3-rest"],
    sightRadius: 3,
    hazardKind: "frost-crack",
    hazardName: "冻土裂隙",
    hazardTrigger: "在脚下迸开冰棱",
    hazardCount: 2,
    hazardDamage: 1,
  }),
  4: contract({
    floor: 4,
    mazeName: "三炉垂直升环",
    topologySignature: "nested-chambers:vertical-three-forge",
    regionCount: 3,
    entry: { roomNodeId: "floor-4-entry", intent: "从葬火接收炉追踪火、冰、雷三路依赖" },
    entryPrompt: "三相管线会依次接通；先确认命令来源，再沿依赖脊柱进入雷晶核心。",
    exit: { roomNodeId: "floor-4-lesson-6", intent: "闭合递归执行环后启动垂直升炉" },
    bossGate: {
      roomNodeId: "floor-4-lesson-6",
      gateId: "gate:floor-4-lesson-6",
      intent: "以 CTE 审计解除执行环侧门",
    },
    shortcut: { gateId: "shortcut:4:return", intent: "让雷晶核心回接葬火接收炉" },
    hiddenArea: {
      id: "f4-hidden-ember-echo",
      roomNodeId: "floor-4-treasure",
      gateId: "gate:floor-4-treasure",
    },
    safeRoomIds: ["floor-4-entry", "floor-4-rest"],
    sightRadius: 4,
    hazardKind: "elemental-vent",
    hazardName: "三相泄压口",
    hazardTrigger: "喷出失控的三相气流",
    hazardCount: 3,
    hazardDamage: 1,
  }),
  5: contract({
    floor: 5,
    mazeName: "黑铁城墙双环",
    topologySignature: "partition-rings:double-rampart",
    regionCount: 3,
    entry: { roomNodeId: "floor-5-entry", intent: "从云上吊桥观察外城轮值与双环城防" },
    entryPrompt: "内外城守军分布在两条环线；比较长短两环，找到不必重复穿过的回返路线。",
    exit: { roomNodeId: "floor-5-lesson-6", intent: "重排黑铁军钟后通过上行桥" },
    bossGate: {
      roomNodeId: "floor-5-lesson-6",
      gateId: "gate:floor-5-lesson-6",
      intent: "以窗口军阵解除内城侧门",
    },
    shortcut: { gateId: "shortcut:5:return", intent: "贯通外城与军钟内环" },
    hiddenArea: {
      id: "f5-hidden-silent-roster",
      roomNodeId: "floor-5-treasure",
      gateId: "gate:floor-5-treasure",
    },
    safeRoomIds: ["floor-5-entry", "floor-5-rest"],
    sightRadius: 5,
    hazardKind: "alarm-wire",
    hazardName: "警戒绊铃",
    hazardTrigger: "骤然绷紧并敲响军铃",
    hazardCount: 3,
    hazardDamage: 1,
  }),
  6: contract({
    floor: 6,
    mazeName: "龙脊工坊折线",
    topologySignature: "rollback-nest:ridge-zigzag",
    regionCount: 3,
    entry: { roomNodeId: "floor-6-entry", intent: "从矿车站进入一次性孵化副本并保留原始状态" },
    entryPrompt: "工坊允许预演写入，但永久世界只接受验证后的结果；在提交前找到回滚路线。",
    exit: { roomNodeId: "floor-6-lesson-6", intent: "验证保存点后启动王室升降台" },
    bossGate: {
      roomNodeId: "floor-6-lesson-6",
      gateId: "gate:floor-6-lesson-6",
      intent: "以只读分区预演解除龙巢侧门",
    },
    shortcut: { gateId: "shortcut:6:return", intent: "把回滚峰顶接回矿车工坊" },
    hiddenArea: {
      id: "f6-hidden-uncommitted-rookery",
      roomNodeId: "floor-6-treasure",
      gateId: "gate:floor-6-treasure",
    },
    safeRoomIds: ["floor-6-entry", "floor-6-rest"],
    sightRadius: 3,
    hazardKind: "magma-fissure",
    hazardName: "熔岩裂缝",
    hazardTrigger: "迸出灼热熔流",
    hazardCount: 3,
    hazardDamage: 2,
  }),
  7: contract({
    floor: 7,
    mazeName: "残照索引王苑",
    topologySignature: "btree-branches:scan-index-fork",
    regionCount: 3,
    entry: { roomNodeId: "floor-7-entry", intent: "从残照晶门比较扫描长路与索引短路" },
    entryPrompt: "路径快慢不改变事实；保留可走的扫描路，再验证索引为何缩短访问。",
    exit: { roomNodeId: "floor-7-lesson-6", intent: "证明最优访问路径后登上金色长阶" },
    bossGate: {
      roomNodeId: "floor-7-lesson-6",
      gateId: "gate:floor-7-lesson-6",
      intent: "以执行计划解除树心侧门",
    },
    shortcut: { gateId: "shortcut:7:return", intent: "把索引树心回接完整扫描长路" },
    hiddenArea: {
      id: "f7-hidden-blind-garden",
      roomNodeId: "floor-7-treasure",
      gateId: "gate:floor-7-treasure",
    },
    safeRoomIds: ["floor-7-entry", "floor-7-rest"],
    sightRadius: 5,
    hazardKind: "root-snare",
    hazardName: "纠根陷阱",
    hazardTrigger: "从石缝中收紧根须",
    hazardCount: 3,
    hazardDamage: 2,
  }),
  8: contract({
    floor: 8,
    mazeName: "黑金七翼王座轴",
    topologySignature: "throne-ascent:seven-wing-axis",
    regionCount: 3,
    entry: { roomNodeId: "floor-8-entry", intent: "从黑金王门读取七层历史并排序本层事故" },
    entryPrompt: "七扇证据窗通向同一条迁移轴；先诊断事故侧翼，再决定哪些历史能够提交。",
    exit: { roomNodeId: "floor-8-lesson-7", intent: "进入最终迁移王座并完成 MIGRATE" },
    bossGate: {
      roomNodeId: "floor-8-lesson-7",
      gateId: "gate:floor-8-lesson-7",
      intent: "以事故响应审计解除最终王令",
    },
    shortcut: { gateId: "shortcut:8:return", intent: "让迁移王座回接版本长廊" },
    hiddenArea: {
      id: "f8-hidden-zero-row-chapel",
      roomNodeId: "floor-8-treasure",
      gateId: "gate:floor-8-treasure",
    },
    safeRoomIds: ["floor-8-entry", "floor-8-rest"],
    sightRadius: 4,
    hazardKind: "migration-rift",
    hazardName: "迁移裂隙",
    hazardTrigger: "撕开一道错位裂口",
    hazardCount: 4,
    hazardDamage: 2,
  }),
} as const satisfies Record<FloorNumber, FloorLabyrinthContract>;

export function floorLabyrinth(floor: FloorNumber): FloorLabyrinthContract {
  return FLOOR_LABYRINTHS[floor];
}

export function validateFloorLabyrinths(
  contracts: readonly FloorLabyrinthContract[],
): string[] {
  const errors: string[] = [];
  const expectedFloors = new Set<FloorNumber>([1, 2, 3, 4, 5, 6, 7, 8]);
  const seenFloors = new Set<FloorNumber>();
  const mazeNames = new Set<string>();
  const topologySignatures = new Set<string>();
  const hazardKinds = new Set<FloorHazardKind>();

  contracts.forEach((entry) => {
    if (!expectedFloors.has(entry.floor) || seenFloors.has(entry.floor)) {
      errors.push(`迷宫契约楼层 ${entry.floor} 缺失或重复。`);
    }
    seenFloors.add(entry.floor);
    if (!entry.mazeName.trim() || mazeNames.has(entry.mazeName)) {
      errors.push(`第 ${entry.floor} 层迷宫名称为空或重复。`);
    }
    mazeNames.add(entry.mazeName);
    if (
      !/^[a-z0-9-]+:[a-z0-9-]+$/u.test(entry.topologySignature) ||
      topologySignatures.has(entry.topologySignature)
    ) {
      errors.push(`第 ${entry.floor} 层拓扑签名无效或重复。`);
    }
    topologySignatures.add(entry.topologySignature);
    if (entry.regionCount !== 3) {
      errors.push(`第 ${entry.floor} 层物理导航区域必须为 3。`);
    }
    if (!entry.entryPrompt.trim() || !entry.entry.intent.trim() || !entry.exit.intent.trim()) {
      errors.push(`第 ${entry.floor} 层缺少入口提示或路线意图。`);
    }

    const roomPrefix = `floor-${entry.floor}-`;
    const roomIds = [
      entry.entry.roomNodeId,
      entry.exit.roomNodeId,
      entry.bossGate.roomNodeId,
      entry.hiddenArea.roomNodeId,
      ...entry.safeRoomIds,
    ];
    if (roomIds.some((roomId) => !roomId.startsWith(roomPrefix))) {
      errors.push(`第 ${entry.floor} 层引用了其他楼层的房间。`);
    }
    if (
      entry.safeRoomIds.length !== 2 ||
      new Set(entry.safeRoomIds).size !== 2 ||
      !entry.safeRoomIds.includes(entry.entry.roomNodeId)
    ) {
      errors.push(`第 ${entry.floor} 层安全房必须是包含入口的两个不同房间。`);
    }
    if (entry.exit.roomNodeId !== entry.bossGate.roomNodeId) {
      errors.push(`第 ${entry.floor} 层出口与首领门必须位于同一终段房间。`);
    }
    if (entry.bossGate.gateId !== `gate:${entry.bossGate.roomNodeId}`) {
      errors.push(`第 ${entry.floor} 层首领门 ID 与房间不一致。`);
    }
    if (entry.shortcut.gateId !== `shortcut:${entry.floor}:return`) {
      errors.push(`第 ${entry.floor} 层捷径 ID 不符合稳定格式。`);
    }
    if (
      entry.hiddenArea.gateId !== `gate:${entry.hiddenArea.roomNodeId}` ||
      entry.safeRoomIds.includes(entry.hiddenArea.roomNodeId) ||
      entry.hiddenArea.roomNodeId === entry.bossGate.roomNodeId
    ) {
      errors.push(`第 ${entry.floor} 层隐藏区门或房间边界无效。`);
    }
    if (!Number.isInteger(entry.sightRadius) || entry.sightRadius < 2 || entry.sightRadius > 6) {
      errors.push(`第 ${entry.floor} 层视野半径必须为 2–6 的整数。`);
    }
    if (hazardKinds.has(entry.hazardKind)) {
      errors.push(`第 ${entry.floor} 层危险类型与其他楼层重复。`);
    }
    hazardKinds.add(entry.hazardKind);
    if (
      !entry.hazardName.trim() ||
      !entry.hazardTrigger.trim() ||
      !Number.isInteger(entry.hazardCount) ||
      entry.hazardCount < 1 ||
      entry.hazardCount > 4 ||
      !Number.isInteger(entry.hazardDamage) ||
      entry.hazardDamage < 1 ||
      entry.hazardDamage > 2
    ) {
      errors.push(`第 ${entry.floor} 层危险名称、数量或伤害无效。`);
    }
  });

  if (seenFloors.size !== expectedFloors.size) {
    errors.push("迷宫契约必须恰好覆盖 F1–F8。");
  }
  return errors;
}
