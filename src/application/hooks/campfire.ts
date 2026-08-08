/**
 * 篝火复盘 Hook。
 *
 * Hook 只在当前层精英已击败、当前层存在作答记录且玩家首次进入篝火两格
 * 圆形范围时调用 Agent。结果按证据 key 保存在当前页面内，新的作答会使
 * 状态回到 dirty；请求失败则记录 fallback，直到证据变化前不重试。
 */
import type {
  CampfireAgentOutput,
  CampfireAgentPort,
} from "../../contracts/agent/campfireReview";
import type { GameSnapshot } from "../../contracts/game/snapshots";
import { buildCampfireReview, campfireReviewInput } from "../../domain/learning/campfireReview";
import { campfireAgentEvidenceKey } from "../../infrastructure/agent/CampfireAgentClient";
import type { Hook } from "./registry";
import { AnswerHook } from "./answer";
import type { Trigger } from "../triggers/events";
import { inCampfireRange } from "../triggers/policy";

export type CampfireHookStatus = "idle" | "dirty" | "requesting" | "ready" | "fallback";

export interface CampfireHookState {
  status: CampfireHookStatus;
  evidenceKey: string | null;
  output: CampfireAgentOutput | null;
}

export class CampfireHook implements Hook {
  private readonly cache = new Map<string, CampfireAgentOutput | null>();
  private readonly dirtyFloors = new Set<number>();
  private readonly listeners = new Set<(state: CampfireHookState) => void>();
  private latest: GameSnapshot | null = null;
  private state: CampfireHookState = {
    status: "idle",
    evidenceKey: null,
    output: null,
  };

  constructor(
    private readonly answers: AnswerHook,
    private readonly client: CampfireAgentPort | null,
  ) {}

  subscribe(listener: (state: CampfireHookState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  outputFor(snapshot: GameSnapshot): CampfireAgentOutput | null {
    const key = campfireAgentEvidenceKey(snapshot);
    return this.state.evidenceKey === key && this.state.status === "ready"
      ? this.state.output
      : null;
  }

  getState(): CampfireHookState {
    return this.state;
  }

  handle(event: Trigger): void {
    this.latest = event.snapshot;
    if (event.type === "answer") {
      this.dirtyFloors.add(event.snapshot.floor);
      this.setState({
        status: "dirty",
        evidenceKey: campfireAgentEvidenceKey(event.snapshot),
        output: null,
      });
      if (event.snapshot.campfires.some((campfire) => inCampfireRange(event.snapshot, campfire.id))) {
        this.prepare(event.snapshot);
      }
      return;
    }
    if (event.type === "floor") {
      this.setState({ status: "idle", evidenceKey: null, output: null });
      return;
    }
    if (event.type === "campfire") {
      this.prepare(event.snapshot);
    }
  }

  destroy(): void {
    this.latest = null;
    this.dirtyFloors.clear();
    this.cache.clear();
    this.listeners.clear();
  }

  private prepare(snapshot: GameSnapshot): void {
    if (!this.client || (
      !this.answers.isDirty(snapshot.floor) &&
      !this.dirtyFloors.has(snapshot.floor)
    )) return;
    const local = buildCampfireReview(campfireReviewInput(snapshot));
    if (!local.available || snapshot.floorReview.every((attempt) => attempt.floor !== snapshot.floor)) {
      return;
    }
    const key = campfireAgentEvidenceKey(snapshot);
    if (this.state.evidenceKey === key && (
      this.state.status === "requesting" ||
      this.state.status === "ready" ||
      this.state.status === "fallback"
    )) return;

    const cached = this.cache.get(key) ?? null;
    if (this.cache.has(key)) {
      this.setState({
        status: cached ? "ready" : "fallback",
        evidenceKey: key,
        output: cached,
      });
      return;
    }

    this.setState({ status: "requesting", evidenceKey: key, output: null });
    void this.client.review(snapshot)
      .then((output) => {
        this.cache.set(key, output);
        if (!this.latest || campfireAgentEvidenceKey(this.latest) !== key) return;
        this.setState({
          status: output ? "ready" : "fallback",
          evidenceKey: key,
          output,
        });
      })
      .catch(() => {
        this.cache.set(key, null);
        if (!this.latest || campfireAgentEvidenceKey(this.latest) !== key) return;
        this.setState({ status: "fallback", evidenceKey: key, output: null });
      });
  }

  private setState(state: CampfireHookState): void {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }
}
