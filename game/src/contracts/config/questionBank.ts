/** 题库父级契约：内容生成器与运行时加载器共享，且不读取环境。 */
export const QUESTION_BANK_TIERS = ["L1", "L2", "L3"] as const;

export type PracticeQuestionTier = typeof QUESTION_BANK_TIERS[number];

export const QUESTION_BANK_CONFIG = {
  version: "question-bank-v2",
  schemaVersion: 2,
  firstFloor: 1,
  floorCount: 8,
  variantsPerFamily: 8,
  familiesPerFloor: 15,
  familiesPerTier: {
    L1: 8,
    L2: 5,
    L3: 2,
  } satisfies Record<PracticeQuestionTier, number>,
  reviewFamiliesPerFloor: 3,
  reviewStartsAtFloor: 2,
  reviewTier: "L1" as PracticeQuestionTier,
  questionsPerFloor: 120,
  totalQuestions: 960,
  manifestUrl: "data/question-bank-manifest.json",
  databaseUrl: "data/question-bank-v2.sqlite",
  drawInspectionMultiplier: 4,
  drawCountInspectionMultiplier: 8,
  generationDomainValueLimit: 24,
  generationLimitMaximum: 8,
  generationVariantSearchLimit: 2_048,
  planEvidenceFloor: 7,
} as const;
