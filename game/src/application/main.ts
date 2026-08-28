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
import type {
  DungeonAgentLaunch,
  DungeonAgentStore,
} from "../devtools/dungeon-agent/protocol";

function runtimeStorage(): StorageLike {
  try {
    // localStorage 是正式 Run/Profile 的持久化入口；这里不直接使用 Storage 类型，
    // 是为了让内存回退对象也能满足同一份最小契约。
    return window.localStorage;
  } catch {
    // 隐私模式、浏览器策略或存储配额异常时，游戏仍应能够进入试玩。
    // 这个 Map 只在当前页面有效，刷新后不会留下正式存档。
    const values = new Map<string, string>();
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
  }
}

function dungeonAgentCheckpointStorage(): StorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    // 禁用会话存储时仍可打开试玩页，但维护器必须在 checkpoint() 处明确阻断刷新重放。
    return null;
  }
}

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("缺少应用根节点。 ");
  // 先显示启动占位，避免题库、SQLite WASM 和 Phaser 加载期间出现空白页面。
  root.innerHTML = `<div class="boot-screen"><span class="boot-cursor"></span>正在生成魔王城查询计划…</div>`;

  // 维护器桥只在开发构建中动态加载。生产构建不会把这条调试路径暴露给玩家。
  let dungeonAgentLaunch: DungeonAgentLaunch | null = null;
  let dungeonAgentStore: DungeonAgentStore | null = null;
  let checkpointStorage: StorageLike | null = null;
  if (import.meta.env.DEV) {
    // 动态导入放在 DEV 常量分支内，生产构建会裁掉整条试玩路径和全局桥协议。
    const protocol = await import("../devtools/dungeon-agent/protocol");
    dungeonAgentLaunch = protocol.parseDungeonAgentLaunch(
      new URL(window.location.href),
      true,
    );
    if (dungeonAgentLaunch) {
      root.dataset.playtestMode = "agent";
      checkpointStorage = dungeonAgentCheckpointStorage();
      dungeonAgentStore = protocol.createDungeonAgentStore(checkpointStorage);
    }
  }
  // 试玩模式绝不能打开正式 IndexedDB，也不能读取用户 localStorage 中的 Run/Profile；
  // 因此 DataStore 的选择必须发生在读取 savedRun/profile 之前。
  const data = dungeonAgentStore ?? await BrowserDataStore.open(runtimeStorage());
  const savedRun = data.loadRun();
  const profile = data.loadProfile();
  const questionBank = await loadBundledQuestionBank(
    import.meta.env.BASE_URL,
    fetch,
    savedRun?.questionBankVersion ?? null,
  );
  let initialRun = savedRun;
  if (dungeonAgentLaunch && !initialRun && dungeonAgentLaunch.floor !== 1) {
    const setupSession = new GameSession(
      null,
      profile,
      WORLD_RUNTIME_CONFIG.fixedWorldSeed,
      questionBank,
    );
    setupSession.enableAgentPlaytestMode();
    setupSession.adminLoadFloor(dungeonAgentLaunch.floor);
    initialRun = setupSession.toSavedRun();
  }
  // 使用已保存 Run 的 seed 重建同一张物理地图；没有存档时才使用固定世界 seed。
  const session = new GameSession(
    initialRun,
    profile,
    initialRun?.graph.seed ?? WORLD_RUNTIME_CONFIG.fixedWorldSeed,
    questionBank,
  );
  if (dungeonAgentLaunch) session.enableAgentPlaytestMode();
  // SQL 引擎与 Phaser 彼此独立，可以并行初始化；两者都完成后才挂载可交互界面。
  const [sql, { createGame }] = await Promise.all([
    SqlEngine.create(session.snapshot().monsters),
    import("../presentation/phaser/createGame"),
  ]);
  const audio = new ArcadeAudio({ mode: "explore", volume: 0.55 });
  const feedback = new FeedbackDirector(audio);
  const onboarding = new OnboardingController(data);
  const learningLedger = new LearningLedger(dungeonAgentLaunch ? null : undefined);
  const learningRecorder = new LearningProgressRecorder(session, learningLedger);
  const agentRuntime = new AgentRuntime(new AgentGateway({
    ...AGENT_RUNTIME_CONFIG,
    endpoint: dungeonAgentLaunch ? null : AGENT_RUNTIME_CONFIG.endpoint,
  }));
  const triggerBus = new TriggerBus();
  const unsubscribeAgentEvents = triggerBus.subscribe((event) => agentRuntime.handle(event));
  const disconnectTriggers = triggerBus.connect(session);
  let game: Phaser.Game | null = null;
  let removeDungeonAgentBridge: (() => void) | null = null;
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
    // 先启动学习账本和 DOM，再创建 Phaser 场景，确保 UI 订阅不会错过首个快照。
    learningRecorder.start();
    app.mount();
    game = createGame(session, audio, feedback);
    if (import.meta.env.DEV && dungeonAgentLaunch) {
      const { installDungeonAgentBridge } = await import(
        "../devtools/dungeon-agent/bridge"
      );
      removeDungeonAgentBridge = installDungeonAgentBridge({
        root,
        session,
        launch: dungeonAgentLaunch,
        checkpointStorage,
        checkpointRestored: dungeonAgentStore?.checkpointState === "restored",
      });
    }
    root.dataset.runtimeState = "active";
  } catch (error) {
    disconnectTriggers();
    unsubscribeAgentEvents();
    agentRuntime.destroy();
    learningRecorder.destroy();
    removeDungeonAgentBridge?.();
    app.destroy();
    game?.destroy(true);
    throw error;
  }

  const persistence = dungeonAgentLaunch
    ? { flush: () => undefined, destroy: () => undefined }
    : startProgressPersistence(session, data, JSON.stringify(profile));

  // pagehide 覆盖关闭/跳转，visibilitychange 覆盖切后台；两者共同保证短暂移动
  // 的延迟写入不会在页面被挂起时丢失。
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
    // 销毁顺序与创建顺序相反：先停止持久化和事件源，再拆 UI/Phaser，避免回调
    // 在部分对象已释放时继续访问它们。
    persistence.flush();
    persistence.destroy();
    window.removeEventListener("pagehide", pageHideHandler);
    document.removeEventListener("visibilitychange", visibilityChangeHandler);
    disconnectTriggers();
    unsubscribeAgentEvents();
    agentRuntime.destroy();
    learningRecorder.destroy();
    removeDungeonAgentBridge?.();
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
