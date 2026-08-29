import { describe, expect, it } from "vitest";
import {
  NarrativeCoordinator,
  type NarrativeCoordinatorPorts,
} from "../src/features/narrative/NarrativeCoordinator";
import type { FloorStoryMoment } from "../src/domain/progression/floorStory";

function moment(): FloorStoryMoment {
  return {
    id: "moment:test",
    floor: 1,
    kind: "entry",
    presentation: "blocking",
    kicker: "TEST",
    title: "测试记录",
    lines: ["line"],
    archiveLine: "archive",
    actions: [
      { type: "music-state", state: "memory" },
      { type: "world-effect", effect: "embers" },
      { type: "evidence", evidenceId: "evidence:test" },
    ],
    unlock: { type: "floor-entered" },
    sourceId: "source:test",
    inspectLandmarkId: null,
    query: null,
  } as FloorStoryMoment;
}

function ports() {
  const calls = {
    focus: 0,
    sound: 0,
    music: "",
    effect: "",
    evidence: [] as string[],
    dispatch: 0,
  };
  const value: NarrativeCoordinatorPorts = {
    audio: {
      setFocus: () => { calls.focus += 1; },
      playStageClear: () => { calls.sound += 1; },
    },
    setMusicState: (state) => { calls.music = state; },
    setWorldEffect: (effect) => { calls.effect = effect; },
    recordEvidence: (evidenceId) => {
      calls.evidence.push(evidenceId);
      return true;
    },
    dispatchStoryActions: () => { calls.dispatch += 1; },
  };
  return { value, calls };
}

describe("NarrativeCoordinator", () => {
  it("展示动作不提前写入证据", () => {
    const { value, calls } = ports();
    new NarrativeCoordinator(value).executeStoryMomentActions(moment(), false);

    expect(calls.music).toBe("memory");
    expect(calls.effect).toBe("embers");
    expect(calls.focus).toBe(1);
    expect(calls.sound).toBe(1);
    expect(calls.evidence).toEqual([]);
    expect(calls.dispatch).toBe(1);
  });

  it("只有确认动作才逐项提交证据", () => {
    const { value, calls } = ports();
    new NarrativeCoordinator(value).executeStoryMomentActions(moment(), true);

    expect(calls.evidence).toEqual(["evidence:test"]);
    expect(calls.dispatch).toBe(1);
  });
});
