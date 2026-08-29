/**
 * 浏览器游戏运行时。
 *
 * GameRuntime 是唯一负责“把服务接起来”的功能包：它读取存储、创建
 * GameSession/SQLite/Agent/Phaser/AppShell，并在页面隐藏、离开或部分
 * 初始化失败时按相反顺序释放资源。规则和 DOM 细节仍由各自模块负责。
 */
import type Phaser from "phaser";
import {
  AGENT_RUNTIME_CONFIG,
  PRESENCE_RUNTIME_CONFIG,
  WORLD_RUNTIME_CONFIG,
} from "../../application/config/runtimeConfig";
import { AgentGateway } from "../../infrastructure/agent/AgentGateway";
import { AgentRuntime } from "../../application/agent/AgentRuntime";
import { TriggerBus } from "../../application/triggers/bus";
import type { DungeonAgentLaunch, DungeonAgentStore } from "../../devtools/dungeon-agent/protocol";
import { FeedbackDirector } from "../../infrastructure/feedback/FeedbackDirector";
import { ArcadeAudio } from "../../infrastructure/audio/ArcadeAudio";
import { PresenceClient } from "../../infrastructure/presence/PresenceClient";
import { SqlEngine } from "../../infrastructure/sql/SqlEngine";
import type { StorageLike } from "../../contracts/storage/storageLike";
import type { DataStore } from "../../infrastructure/storage/browserDataStore";
import { BrowserDataStore } from "../../infrastructure/storage/browserDataStore";
import { OnboardingController } from "../../presentation/dom/OnboardingController";
import {
  LearningLedger,
  LearningProgressRecorder,
} from "../../infrastructure/storage/learningLedger";
import {
  startProgressPersistence,
  type ProgressPersistenceController,
} from "../../infrastructure/storage/progressPersistence";
import { GameSession } from "../game-session/GameSession";
import { AppShell } from "../app-shell/AppShell";
import { applyPageVisibilityRuntime } from "../../application/runtime/pageLifecycle";
import { loadBundledQuestionBank } from "../../application/runtime/questionBankLoader";
import type { BattleScene } from "../../presentation/phaser/BattleScene";
import type { createGame as createGameFunction } from "../../presentation/phaser/createGame";

type CreateGame = typeof createGameFunction;

/** DEV 入口向运行时提供的延迟模块；生产构建不会调用这些 loader。 */
export interface GameRuntimePlaytestLoaders {
  loadProtocol(): Promise<{
    parseDungeonAgentLaunch(
      url: URL,
      isDevelopment: boolean,
    ): DungeonAgentLaunch | null;
    createDungeonAgentStore(storage: StorageLike | null): DungeonAgentStore;
  }>;
  loadBridge(): Promise<{
    installDungeonAgentBridge: typeof import("../../devtools/dungeon-agent/bridge").installDungeonAgentBridge;
  }>;
}

export interface GameRuntimeStartOptions {
  /** 仅由 main.ts 在 DEV 构建提供；省略时不加载维护器桥。 */
  playtestLoaders?: GameRuntimePlaytestLoaders | null;
  /** 测试或宿主可替换 Phaser 装配；默认使用正式实现。 */
  createGame?: CreateGame;
}

interface ClosableDataStore extends DataStore {
  close?: () => void;
}

/** 运行时资源的窄清理端口；字段可选以覆盖部分初始化失败。 */
export interface GameRuntimeResources {
  data?: ClosableDataStore | null;
  audio?: Pick<ArcadeAudio, "dispose"> | null;
  agentRuntime?: Pick<AgentRuntime, "destroy"> | null;
  presenceClient?: Pick<PresenceClient, "destroy"> | null;
  learningRecorder?: Pick<LearningProgressRecorder, "destroy"> | null;
  persistence?: ProgressPersistenceController | null;
  disconnectTriggers?: (() => void) | null;
  unsubscribeAgentEvents?: (() => void) | null;
  removeDungeonAgentBridge?: (() => void) | null;
  app?: Pick<AppShell, "destroy"> | null;
  game?: Pick<Phaser.Game, "destroy"> | null;
}

interface RuntimeEventTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

interface RuntimeDocumentTarget extends RuntimeEventTarget {
  readonly visibilityState?: Document["visibilityState"];
}

function runtimeStorage(): StorageLike {
  try {
    // localStorage 是正式 Run/Profile 的持久化入口；这里不直接使用 Storage 类型，
    // 是为了让内存回退对象也能满足同一份最小契约。
    return window.localStorage;
  } catch {
    // 隐私模式、浏览器策略或存储配额异常时，游戏仍应能够进入试玩。
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
    // 禁用会话存储时仍可打开试玩页，但 checkpoint() 必须明确报告不可恢复。
    return null;
  }
}

export class GameRuntime {
  private destroyed = false;
  private lifecycleAttached = false;
  private pageHideHandler: (() => void) | null = null;
  private visibilityChangeHandler: (() => void) | null = null;
  private beforeUnloadHandler: (() => void) | null = null;
  private lifecycleWindow: RuntimeEventTarget | null = null;
  private lifecycleDocument: RuntimeDocumentTarget | null = null;

  constructor(private readonly resources: GameRuntimeResources) {}

  /**
   * 创建并启动完整浏览器运行时。所有已创建资源都会先登记到 resources，
   * 因而任一步失败都能复用同一套幂等清理逻辑。
   */
  static async start(
    root: HTMLElement,
    options: GameRuntimeStartOptions = {},
  ): Promise<GameRuntime> {
    root.innerHTML = `<div class="boot-screen"><span class="boot-cursor"></span>正在生成魔王城查询计划…</div>`;
    const resources: GameRuntimeResources = {};
    // 试玩 loader 是开发桥的安全边界；即使宿主误传，也不能在生产构建
    // 进入维护器存储或解析路径。
    const playtestLoaders = import.meta.env.DEV ? options.playtestLoaders : null;
    let dungeonAgentLaunch: DungeonAgentLaunch | null = null;
    let dungeonAgentStore: DungeonAgentStore | null = null;
    let checkpointStorage: StorageLike | null = null;

    try {
      if (playtestLoaders) {
        const protocol = await playtestLoaders.loadProtocol();
        dungeonAgentLaunch = protocol.parseDungeonAgentLaunch(
          new URL(window.location.href),
          import.meta.env.DEV,
        );
        if (dungeonAgentLaunch) {
          root.dataset.playtestMode = "agent";
          checkpointStorage = dungeonAgentCheckpointStorage();
          dungeonAgentStore = protocol.createDungeonAgentStore(checkpointStorage);
        }
      }

      // 试玩模式必须在读取存档前确定内存 DataStore，避免接触正式数据。
      const data = dungeonAgentStore ?? await BrowserDataStore.open(runtimeStorage());
      resources.data = data;
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

      const session = new GameSession(
        initialRun,
        profile,
        initialRun?.graph.seed ?? WORLD_RUNTIME_CONFIG.fixedWorldSeed,
        questionBank,
      );
      if (dungeonAgentLaunch) session.enableAgentPlaytestMode();

      // SQLite 和 Phaser 互不依赖，可以并行准备。
      const gameModulePromise = options.createGame
        ? Promise.resolve(null)
        : import("../../presentation/phaser/createGame");
      const [sql, gameModule] = await Promise.all([
        SqlEngine.create(session.snapshot().monsters),
        gameModulePromise,
      ]);
      const audio = new ArcadeAudio({ mode: "explore", volume: 0.55 });
      resources.audio = audio;
      const feedback = new FeedbackDirector(audio);
      const onboarding = new OnboardingController(data);
      const learningLedger = new LearningLedger(dungeonAgentLaunch ? null : undefined);
      const learningRecorder = new LearningProgressRecorder(session, learningLedger);
      resources.learningRecorder = learningRecorder;
      const agentRuntime = new AgentRuntime(new AgentGateway({
        ...AGENT_RUNTIME_CONFIG,
        endpoint: dungeonAgentLaunch ? null : AGENT_RUNTIME_CONFIG.endpoint,
      }));
      resources.agentRuntime = agentRuntime;
      const presenceClient = new PresenceClient(PRESENCE_RUNTIME_CONFIG.endpoint);
      resources.presenceClient = presenceClient;
      const triggerBus = new TriggerBus();
      const unsubscribeAgentEvents = triggerBus.subscribe((event) => agentRuntime.handle(event));
      resources.unsubscribeAgentEvents = unsubscribeAgentEvents;
      const disconnectTriggers = triggerBus.connect(session);
      resources.disconnectTriggers = disconnectTriggers;

      let game: Phaser.Game | null = null;
      const createGame = options.createGame ?? gameModule!.createGame;
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
        presenceClient,
      );
      resources.app = app;

      learningRecorder.start();
      app.mount();
      game = createGame(session, audio, feedback);
      resources.game = game;

      if (playtestLoaders && dungeonAgentLaunch) {
        const bridgeModule = await playtestLoaders.loadBridge();
        const removeBridge = bridgeModule.installDungeonAgentBridge({
          root,
          session,
          launch: dungeonAgentLaunch,
          checkpointStorage,
          checkpointRestored: dungeonAgentStore?.checkpointState === "restored",
          resetSql: (monsters) => sql.reset([...monsters]),
        });
        resources.removeDungeonAgentBridge = removeBridge;
      }

      const persistence = dungeonAgentLaunch
        ? { flush: () => undefined, destroy: () => undefined }
        : startProgressPersistence(session, data, JSON.stringify(profile));
      resources.persistence = persistence;

      const runtime = new GameRuntime(resources);
      runtime.attachLifecycle(window, document, root, audio, game);
      root.dataset.runtimeState = "active";
      return runtime;
    } catch (error) {
      // 用同一套反向清理处理题库、AppShell、Phaser 或 bridge 的中途失败。
      new GameRuntime(resources).destroy();
      throw error;
    }
  }

  /** 绑定页面隐藏、恢复和卸载事件；重复绑定不会产生第二套监听器。 */
  attachLifecycle(
    windowTarget: RuntimeEventTarget,
    documentTarget: RuntimeDocumentTarget,
    root: HTMLElement,
    audio: Pick<ArcadeAudio, "setPageHidden">,
    game: Pick<Phaser.Game, "loop"> | null,
  ): void {
    if (this.destroyed || this.lifecycleAttached) return;
    this.lifecycleAttached = true;
    this.lifecycleWindow = windowTarget;
    this.lifecycleDocument = documentTarget;
    this.pageHideHandler = () => {
      this.safe(() => this.resources.persistence?.flush());
    };
    this.visibilityChangeHandler = () => {
      const visibilityState = documentTarget.visibilityState
        ?? (typeof document !== "undefined" ? document.visibilityState : "visible");
      const hidden = visibilityState === "hidden";
      void applyPageVisibilityRuntime({
        hidden,
        root,
        loop: game?.loop ?? null,
        audio,
        flushProgress: () => this.resources.persistence?.flush(),
      }).catch((error: unknown) => {
        this.reportCleanupError(error, "页面可见性处理失败");
      });
    };
    this.beforeUnloadHandler = () => this.destroy();
    windowTarget.addEventListener("pagehide", this.pageHideHandler);
    documentTarget.addEventListener("visibilitychange", this.visibilityChangeHandler);
    windowTarget.addEventListener("beforeunload", this.beforeUnloadHandler);
  }

  /** 幂等反向销毁；即使单个资源清理抛错，也继续释放其余资源。 */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.lifecycleAttached && this.lifecycleWindow && this.lifecycleDocument) {
      this.removeLifecycleListeners(this.lifecycleWindow, this.lifecycleDocument);
    }

    this.safe(() => this.resources.persistence?.flush());
    this.safe(() => this.resources.persistence?.destroy());
    this.safe(() => this.resources.disconnectTriggers?.());
    this.safe(() => this.resources.unsubscribeAgentEvents?.());
    this.safe(() => this.resources.agentRuntime?.destroy());
    this.safe(() => this.resources.learningRecorder?.destroy());
    this.safe(() => this.resources.presenceClient?.destroy());
    this.safe(() => this.resources.removeDungeonAgentBridge?.());
    this.safe(() => this.resources.app?.destroy());
    this.safe(() => this.resources.game?.destroy(true));
    this.safe(() => this.resources.audio?.dispose());
    this.safe(() => this.resources.data?.close?.());
  }

  private removeLifecycleListeners(
    windowTarget: RuntimeEventTarget,
    documentTarget: RuntimeDocumentTarget,
  ): void {
    if (!this.lifecycleAttached) return;
    if (this.pageHideHandler) windowTarget.removeEventListener("pagehide", this.pageHideHandler);
    if (this.visibilityChangeHandler) {
      documentTarget.removeEventListener("visibilitychange", this.visibilityChangeHandler);
    }
    if (this.beforeUnloadHandler) windowTarget.removeEventListener("beforeunload", this.beforeUnloadHandler);
    this.pageHideHandler = null;
    this.visibilityChangeHandler = null;
    this.beforeUnloadHandler = null;
    this.lifecycleWindow = null;
    this.lifecycleDocument = null;
    this.lifecycleAttached = false;
  }

  private safe(action: () => unknown): void {
    try {
      const result = action();
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        void Promise.resolve(result).catch((error: unknown) => {
          this.reportCleanupError(error);
        });
      }
    } catch (error) {
      this.reportCleanupError(error);
    }
  }

  private reportCleanupError(error: unknown, message = "运行时资源清理失败"): void {
    console.error(message, error);
  }
}
