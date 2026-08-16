/**
 * 应用启动和依赖组装入口。
 *
 * main 只负责创建存储、GameSession、SQL、可选篝火 Agent、UI 和 Phaser，再连接页面生命周期；
 * 游戏规则、存档迁移和界面复盘逻辑分别归属各自模块，不能在这里实现。
 */
import "../presentation/style.css";
import type Phaser from "phaser";
import { ArcadeAudio } from "../infrastructure/audio/ArcadeAudio";
import {
  AGENT_RUNTIME_CONFIG,
  WORLD_RUNTIME_CONFIG,
} from "./config/runtimeConfig";
import { GameSession } from "../domain/session/GameSession";
import { FeedbackDirector } from "../infrastructure/feedback/FeedbackDirector";
import type { BattleScene } from "../presentation/phaser/BattleScene";
import { applyPageVisibilityRuntime } from "./runtime/pageLifecycle";
import { loadBundledQuestionBank } from "./runtime/questionBankLoader";
import { SqlEngine } from "../infrastructure/sql/SqlEngine";
import type { StorageLike } from "../contracts/storage/storageLike";
import { BrowserDataStore } from "../infrastructure/storage/browserDataStore";
import { startProgressPersistence } from "../infrastructure/storage/progressPersistence";
import { LearningLedger, LearningProgressRecorder } from "../infrastructure/storage/learningLedger";
import { AppShell } from "../presentation/dom/AppShell";
import { OnboardingController } from "../presentation/dom/OnboardingController";
import { AgentGateway } from "../infrastructure/agent/AgentGateway";
import { AgentRuntime } from "./agent/AgentRuntime";
import { TriggerBus } from "./triggers/bus";
import {
  createPlaytestStore,
  playtestLaunchFromUrl,
} from "./playtest/mode";
import { installPlaytestAgentPanel } from "./playtest/panel";

function runtimeStorage(): StorageLike {
  try {
    return window.localStorage;
  } catch {
    const values = new Map<string, string>();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
  }
}

function playtestCheckpointStorage(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("缺少应用根节点。 ");
  root.innerHTML = `<div class="boot-screen"><span class="boot-cursor"></span>正在生成魔王城查询计划…</div>`;

  const playtest = import.meta.env.DEV
    ? playtestLaunchFromUrl(new URL(window.location.href), true)
    : null;
  if (playtest) root.dataset.playtestMode = "agent";
  const storage = runtimeStorage();
  const checkpointStorage = playtest ? playtestCheckpointStorage() : null;
  const playtestData = playtest ? createPlaytestStore(checkpointStorage) : null;
  const data = playtestData ?? await BrowserDataStore.open(storage);
  const savedRun = data.loadRun();
  const profile = data.loadProfile();
  const questionBank = await loadBundledQuestionBank(
    import.meta.env.BASE_URL,
    fetch,
    savedRun?.questionBankVersion ?? null,
  );
  let initialRun = savedRun;
  if (playtest && !savedRun && playtest.floor !== 1) {
    // 隔离初始化器先生成目标层数据，再用临时 Session 载入；该数据不会进入正式存储。
    const setup = new GameSession(
      null,
      profile,
      WORLD_RUNTIME_CONFIG.fixedWorldSeed,
      questionBank,
    );
    setup.enableAdminMode();
    setup.adminLoadFloor(playtest.floor);
    initialRun = setup.toSavedRun();
  }
  const session = new GameSession(
    initialRun,
    profile,
    initialRun?.graph.seed ?? WORLD_RUNTIME_CONFIG.fixedWorldSeed,
    questionBank,
  );
  if (playtest?.mode === "agent") {
    session.enableAdminMode();
  }
  const [sql, { createGame }] = await Promise.all([
    SqlEngine.create(session.snapshot().monsters),
    import("../presentation/phaser/createGame"),
  ]);
  const audio = new ArcadeAudio({ mode: "explore", volume: 0.55 });
  const feedback = new FeedbackDirector(audio);
  const onboarding = new OnboardingController(data);
  const learningLedger = new LearningLedger(playtest ? null : undefined);
  const learningRecorder = new LearningProgressRecorder(session, learningLedger);
  const agentRuntime = new AgentRuntime(new AgentGateway({
    ...AGENT_RUNTIME_CONFIG,
    endpoint: playtest ? null : AGENT_RUNTIME_CONFIG.endpoint,
  }));
  const triggerBus = new TriggerBus();
  const unsubscribeAgentEvents = triggerBus.subscribe((event) => agentRuntime.handle(event));
  const disconnectTriggers = triggerBus.connect(session);
  let game: Phaser.Game | null = null;
  let removePlaytestBridge: (() => void) | null = null;
  let removePlaytestPanel: (() => void) | null = null;
  const app = new AppShell(
    root,
    session,
    sql,
    audio,
    feedback,
    onboarding,
    () => {
      if (!game) return null;
      return game.scene.getScene("BattleScene") as BattleScene;
    },
    savedRun ? "restored" : "new",
    agentRuntime,
  );
  try {
    learningRecorder.start();
    app.mount();
    if (playtest) removePlaytestPanel = installPlaytestAgentPanel(root);
    game = createGame(session, audio, feedback);
    if (import.meta.env.DEV && playtest) {
      const { installPlaytestBridge } = await import("./playtest/bridge");
      removePlaytestBridge = installPlaytestBridge({
        root,
        session,
        launch: playtest,
        checkpointStorage,
        checkpointRestored: playtestData?.checkpointState === "restored",
      });
    }
    root.dataset.runtimeState = "active";
  } catch (error) {
    disconnectTriggers();
    unsubscribeAgentEvents();
    agentRuntime.destroy();
    learningRecorder.destroy();
    app.destroy();
    game?.destroy(true);
    removePlaytestBridge?.();
    removePlaytestPanel?.();
    throw error;
  }

  const persistence = playtest
    ? { flush: () => undefined, destroy: () => undefined }
    : startProgressPersistence(session, data, JSON.stringify(profile));

  const pageHideHandler = (): void => persistence.flush();
  const visibilityChangeHandler = (): void => {
    const hidden = document.visibilityState === "hidden";
    void applyPageVisibilityRuntime({
      hidden,
      root,
      loop: game?.loop ?? null,
      audio,
      flushProgress: persistence.flush,
    });
  };
  window.addEventListener("pagehide", pageHideHandler);
  document.addEventListener("visibilitychange", visibilityChangeHandler);

  const beforeUnloadHandler = (): void => {
    persistence.flush();
    persistence.destroy();
    window.removeEventListener("pagehide", pageHideHandler);
    document.removeEventListener("visibilitychange", visibilityChangeHandler);
    disconnectTriggers();
    unsubscribeAgentEvents();
    agentRuntime.destroy();
    learningRecorder.destroy();
    removePlaytestBridge?.();
    removePlaytestPanel?.();
    app.destroy();
    game?.destroy(true);
  };
  window.addEventListener("beforeunload", beforeUnloadHandler);
}

bootstrap().catch((error: unknown) => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;
  root.textContent = error instanceof Error
    ? `魔王城启动失败：${error.message}`
    : "魔王城启动失败。";
  root.className = "fatal-error";
});
