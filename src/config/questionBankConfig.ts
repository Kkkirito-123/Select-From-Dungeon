/** 题库支持的三个练习难度；运行时和 SQLite 共用同一组稳定值。 */
export const QUESTION_BANK_TIERS = ["L1", "L2", "L3"] as const;

export type PracticeQuestionTier = typeof QUESTION_BANK_TIERS[number];

/**
 * 题库的可调参数集中在这里，内容生成器、浏览器加载器和抽题目录不得重复定义。
 * 题目正文与判题契约仍由各楼层课程内容负责，不属于运行参数。
 */
export const QUESTION_BANK_CONFIG = {
  /** 当前静态题库版本，同时决定生成文件名和题目 ID 前缀。 */
  version: "question-bank-v2",
  /** SQLite 模式版本；v2 新增显式 tier 列。 */
  schemaVersion: 2,
  /** 题库起始楼层编号。 */
  firstFloor: 1,
  /** 可玩楼层总数。 */
  floorCount: 8,
  /** 每个模板族生成的参数化变体数。 */
  variantsPerFamily: 8,
  /** 每层模板族总数。 */
  familiesPerFloor: 15,
  /** 每层各难度的模板族数量：L1 8 族、L2 5 族、L3 2 族。 */
  familiesPerTier: {
    L1: 8,
    L2: 5,
    L3: 2,
  } satisfies Record<PracticeQuestionTier, number>,
  /** 第二至八层从 L1 中划出的旧知识复习模板族数量。 */
  reviewFamiliesPerFloor: 3,
  /** 从第二层开始加入旧知识复习题；第一层全部为本层题。 */
  reviewStartsAtFloor: 2,
  /** 旧知识复习题只进入 L1，避免高阶题被旧知识占用。 */
  reviewTier: "L1" as PracticeQuestionTier,
  /** 每层题目总数。 */
  questionsPerFloor: 120,
  /** 整个八层题库的题目总数。 */
  totalQuestions: 960,
  /** 浏览器加载的清单路径。 */
  manifestUrl: "data/question-bank-manifest.json",
  /** 当前 SQLite 静态资源路径。 */
  databaseUrl: "data/question-bank-v2.sqlite",
  /** 单次抽题扫描一个 tier 牌组的最大轮数，防止锁定课程导致死循环。 */
  drawInspectionMultiplier: 4,
  /** 小批量抽题时按请求数量保留的最低扫描倍数。 */
  drawCountInspectionMultiplier: 8,
  /** 生成器保留的真实字段值候选上限。 */
  generationDomainValueLimit: 24,
  /** 自动补充 LIMIT 变体时使用的最大行数。 */
  generationLimitMaximum: 8,
  /** 每个参数化变体寻找可执行且不重复内容时的最大尝试次数。 */
  generationVariantSearchLimit: 2_048,
  /** 需要保存 EXPLAIN QUERY PLAN 证据的课程楼层。 */
  planEvidenceFloor: 7,
} as const;
