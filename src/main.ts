import "./style.css";
import type Phaser from "phaser";
import { ArcadeAudio } from "./audio/ArcadeAudio";
import { GameSession } from "./domain/GameSession";
import { FeedbackDirector } from "./feedback/FeedbackDirector";
import type { BattleScene } from "./game/BattleScene";
import { applyPageVisibilityRuntime } from "./runtime/pageLifecycle";
import { SqlEngine } from "./sql/SqlEngine";
import {
  createRunSeed,
  loadProfile,
  loadRun,
  type StorageLike,
} from "./storage/localProgress";
import { startProgressPersistence } from "./storage/progressPersistence";
import { AppShell } from "./ui/AppShell";
import { OnboardingController } from "./ui/OnboardingController";

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

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("缺少应用根节点。 ");
  root.innerHTML = `<div class="boot-screen"><span class="boot-cursor"></span>正在生成魔王城查询计划…</div>`;

  const storage = runtimeStorage();
  const savedRun = loadRun(storage);
  const profile = loadProfile(storage);
  const session = new GameSession(savedRun, profile, savedRun?.graph.seed ?? createRunSeed());
  const [sql, { createGame }] = await Promise.all([
    SqlEngine.create(session.snapshot().monsters),
    import("./game/createGame"),
  ]);
  const audio = new ArcadeAudio({ mode: "explore", volume: 0.55 });
  const feedback = new FeedbackDirector(audio);
  const onboarding = new OnboardingController(storage);
  let game: Phaser.Game | null = null;
  const app = new AppShell(root, session, sql, audio, feedback, onboarding, () => {
    if (!game) return null;
    return game.scene.getScene("BattleScene") as BattleScene;
  });
  try {
    app.mount();
    game = createGame(session, audio, feedback);
    root.dataset.runtimeState = "active";
  } catch (error) {
    app.destroy();
    game?.destroy(true);
    throw error;
  }

  const persistence = startProgressPersistence(
    session,
    storage,
    JSON.stringify(profile),
  );

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
