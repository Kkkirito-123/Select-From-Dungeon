/**
 * 叙事动作编排器。
 *
 * 剧情内容只描述动作；本协调器把动作分发给音频、世界标记和 Session
 * 证据端口。它不管理队列 UI，也不直接访问 DOM 或持久化。
 */
import type { FloorStoryMoment } from "../../domain/progression/floorStory";

export interface NarrativeAudioPort {
  setFocus(focus: "resolving"): void;
  playStageClear(): void | Promise<unknown>;
}
export interface NarrativeCoordinatorPorts {
  audio: NarrativeAudioPort;
  setMusicState(state: string): void;
  setWorldEffect(effect: string): void;
  recordEvidence(evidenceId: string): boolean;
  dispatchStoryActions(momentId: string, actions: FloorStoryMoment["actions"]): void;
}

export class NarrativeCoordinator {
  constructor(private readonly ports: NarrativeCoordinatorPorts) {}

  executeStoryMomentActions(
    moment: FloorStoryMoment,
    recordEvidence: boolean,
  ): void {
    const musicState = moment.actions.find(
      (action) => action.type === "music-state",
    );
    const worldEffect = moment.actions.find(
      (action) => action.type === "world-effect",
    );
    if (musicState?.type === "music-state") {
      this.ports.setMusicState(musicState.state);
      this.ports.audio.setFocus("resolving");
      void this.ports.audio.playStageClear();
    }
    if (worldEffect?.type === "world-effect") {
      this.ports.setWorldEffect(worldEffect.effect);
    }
    if (recordEvidence) {
      moment.actions.forEach((action) => {
        if (action.type === "evidence") this.ports.recordEvidence(action.evidenceId);
      });
    }
    this.ports.dispatchStoryActions(moment.id, moment.actions);
  }
}
