import type { StoryQueryId } from "../sql/storyQueryCatalog";
import type {
  FloorNumber,
  RunLessonId,
} from "../../domain/progression/runGraph";

interface LandmarkStoryEvidenceRoute {
  queryId: StoryQueryId;
  evidenceId?: string;
  lessonId?: RunLessonId;
  gateId?: string;
}

type CanonicalStorySource =
  | { type: "event"; id: string }
  | { type: "rule"; id: string }
  | { type: "floor-end" };

interface FloorStoryRoute {
  source: CanonicalStorySource;
  kind:
    | "entry"
    | "world-change"
    | "evidence"
    | "secret"
    | "scribe"
    | "boss"
    | "ascent";
  presentation: "blocking" | "ambient" | "inspect";
  inspectLandmarkId?: string;
  queryId?: StoryQueryId;
}

export const LANDMARK_STORY_EVIDENCE: Readonly<
  Record<string, LandmarkStoryEvidenceRoute>
> = {
  "f1-water-wheel": {
    queryId: "f1-current-resident",
    evidenceId: "lost-name:f1:current-record",
  },
  "f1-sealed-vault": {
    queryId: "f1-restore-contradiction",
    gateId: "gate:floor-1-treasure",
  },
  "f2-ranked-beacons": {
    queryId: "f2-seven-source-pages",
    evidenceId: "lost-name:f2:identity-count",
  },
  "f2-wreck-ledger": {
    queryId: "f2-seven-source-summary",
    gateId: "gate:floor-2-treasure",
  },
  "f3-master-steles": {
    queryId: "f3-unarmed-record-preserved",
    lessonId: "f3-left",
  },
  "f3-relic-chain": {
    queryId: "f3-room-relic-chain",
    evidenceId: "lost-name:f3:relic-links",
    lessonId: "f3-chain",
  },
  "f4-source-core": {
    queryId: "f4-three-incident-fronts",
    evidenceId: "lost-name:f4:command-batch",
    lessonId: "f4-scalar",
  },
  "f4-dependency-spine": {
    queryId: "f4-dependency-lineage",
    lessonId: "f4-recursive",
  },
  "f5-muster-board": {
    queryId: "f5-stable-duty-order",
    evidenceId: "lost-name:f5:history-positions",
    lessonId: "f5-row-number",
  },
  "f5-rank-standards": {
    queryId: "f5-ties-preserved",
    lessonId: "f5-rank",
  },
  "f6-cleanup-sluice": {
    queryId: "f6-duplicate-candidates",
    lessonId: "f6-delete",
  },
  "f6-state-bridge": {
    queryId: "f6-baseline-restored",
    evidenceId: "lost-name:f6:undo-origin",
    lessonId: "f6-transaction",
  },
  "f7-index-road": {
    queryId: "f7-all-realms-present",
    evidenceId: "lost-name:f7:hidden-history",
    lessonId: "f7-composite",
  },
  "f7-plan-tree": {
    queryId: "f7-crystal-plan-candidates",
    lessonId: "f7-plan",
  },
  "f8-version-gallery": {
    queryId: "f8-visible-snapshot",
    evidenceId: "lost-name:f8:identity-set",
    lessonId: "f8-mvcc",
  },
  "f8-deadlock-gate": {
    queryId: "f8-deadlock-cycle",
    lessonId: "f8-lock",
  },
};

export const FLOOR_STORY_ROUTES: Readonly<
  Record<FloorNumber, readonly FloorStoryRoute[]>
> = {
  1: [
    {
      source: { type: "event", id: "f1-story-fire-remembers" },
      kind: "entry",
      presentation: "blocking",
      queryId: "f1-current-resident",
    },
    {
      source: { type: "rule", id: "f1-wheel-turning" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f1-water-low" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f1-beds-revealed" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f1-story-sealed-vault" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f1-sealed-vault",
    },
    {
      source: { type: "event", id: "f1-story-shortcut-return" },
      kind: "scribe",
      presentation: "inspect",
      inspectLandmarkId: "npc-scribe-f1",
    },
    {
      source: { type: "rule", id: "f1-receipts-grouped" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f1-restore-contradiction",
    },
    {
      source: { type: "event", id: "f1-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f1-story-first-page" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  2: [
    {
      source: { type: "event", id: "f2-story-seven-wet-pages" },
      kind: "entry",
      presentation: "blocking",
      queryId: "f2-seven-source-pages",
    },
    {
      source: { type: "rule", id: "f2-beacons-ranked" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f2-channels-distinct" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f2-story-wreck-ledger" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f2-wreck-ledger",
    },
    {
      source: { type: "rule", id: "f2-root-linked" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f2-missing-gear" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f2-story-frog-court" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f2-story-low-tide" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f2-story-seven-reflections" },
      kind: "scribe",
      presentation: "inspect",
      inspectLandmarkId: "npc-scribe-f2",
    },
    {
      source: { type: "event", id: "f2-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f2-story-seven-pages" },
      kind: "boss",
      presentation: "blocking",
      queryId: "f2-seven-source-summary",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  3: [
    {
      source: { type: "event", id: "f3-story-no-owner" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f3-bone-linked" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f3-unarmed-kept" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f3-unarmed-record-preserved",
    },
    {
      source: { type: "rule", id: "f3-steles-aliased" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f3-story-reliquary" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f3-reliquary",
    },
    {
      source: { type: "rule", id: "f3-relic-chain" },
      kind: "world-change",
      presentation: "ambient",
      queryId: "f3-room-relic-chain",
    },
    {
      source: { type: "event", id: "f3-story-grave-lord" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f3-witnesses-united" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f3-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f3-story-audit-complete" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  4: [
    {
      source: { type: "event", id: "f4-story-one-command" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f4-source-identified" },
      kind: "world-change",
      presentation: "ambient",
      queryId: "f4-three-incident-fronts",
    },
    {
      source: { type: "rule", id: "f4-frost-selected" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f4-existence-proved" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f4-story-forge-lord" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f4-story-ember-echo" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f4-echo-gate",
    },
    {
      source: { type: "rule", id: "f4-correlations-linked" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f4-cte-named" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f4-recursive-traced" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f4-dependency-lineage",
    },
    {
      source: { type: "event", id: "f4-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f4-story-open-transaction" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  5: [
    {
      source: { type: "event", id: "f5-story-ordered-people" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f5-partitions-visible" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f5-positions-numbered" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f5-stable-duty-order",
    },
    {
      source: { type: "rule", id: "f5-ties-visible" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f5-ties-preserved",
    },
    {
      source: { type: "rule", id: "f5-patrol-linked" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f5-story-barracks-open" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f5-story-silent-roster" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f5-silent-roster",
    },
    {
      source: { type: "event", id: "f5-story-silence-is-order" },
      kind: "scribe",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f5-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f5-story-clock-reordered" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  6: [
    {
      source: { type: "event", id: "f6-story-change-can-return" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f6-row-inserted" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f6-row-updated" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f6-duplicate-targeted" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f6-duplicate-candidates",
    },
    {
      source: { type: "rule", id: "f6-constraint-protected" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f6-story-crystal-cavern-open" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f6-story-rookery" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f6-uncommitted-rookery",
    },
    {
      source: { type: "rule", id: "f6-transaction-rolled-back" },
      kind: "world-change",
      presentation: "ambient",
      queryId: "f6-baseline-restored",
    },
    {
      source: { type: "event", id: "f6-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f6-savepoint-validated" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f6-story-safe-change" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  7: [
    {
      source: { type: "event", id: "f7-story-unreached" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f7-point-search-lit" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f7-composite-lit" },
      kind: "world-change",
      presentation: "ambient",
      queryId: "f7-all-realms-present",
    },
    {
      source: { type: "rule", id: "f7-covering-reflection" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f7-range-root-open" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f7-story-root-cloister-open" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f7-story-blind-garden" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f7-blind-garden",
    },
    {
      source: { type: "rule", id: "f7-plan-explained" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f7-crystal-plan-candidates",
    },
    {
      source: { type: "event", id: "f7-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f7-story-paths-compared" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "blocking",
    },
  ],
  8: [
    {
      source: { type: "event", id: "f8-story-unfinished-kingdom" },
      kind: "entry",
      presentation: "blocking",
    },
    {
      source: { type: "rule", id: "f8-snapshot-visible" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f8-visible-snapshot",
    },
    {
      source: { type: "rule", id: "f8-cycle-exposed" },
      kind: "evidence",
      presentation: "ambient",
      queryId: "f8-deadlock-cycle",
    },
    {
      source: { type: "rule", id: "f8-isolation-wing" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f8-model-wing" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f8-replica-wing" },
      kind: "world-change",
      presentation: "ambient",
    },
    {
      source: { type: "rule", id: "f8-shard-ready" },
      kind: "evidence",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f8-story-void-court-open" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "event", id: "f8-story-zero-row-chapel" },
      kind: "secret",
      presentation: "inspect",
      inspectLandmarkId: "f8-zero-row-chapel",
    },
    {
      source: { type: "event", id: "f8-story-cipher" },
      kind: "secret",
      presentation: "ambient",
    },
    {
      source: { type: "event", id: "f8-story-migrate" },
      kind: "boss",
      presentation: "blocking",
    },
    {
      source: { type: "floor-end" },
      kind: "ascent",
      presentation: "ambient",
    },
  ],
};

export const AREA_BOSS_STORY_MONSTER_IDS: Readonly<
  Record<FloorNumber, number | null>
> = {
  1: null,
  2: 22,
  3: 33,
  4: 44,
  5: 55,
  6: 66,
  7: 77,
  8: 89,
};
