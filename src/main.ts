import "./style.css";
import Phaser from "phaser";
import { ArcadeAudio } from "./audio/ArcadeAudio";
import { GameSession } from "./domain/GameSession";
import { FeedbackDirector } from "./feedback/FeedbackDirector";
import { BattleScene } from "./game/BattleScene";
import { createGame } from "./game/createGame";
import { SqlEngine } from "./sql/SqlEngine";
import {
  createRunSeed,
  loadProfile,
  loadRun,
  persistProfileIfChanged,
  saveRun,
  type StorageLike,
} from "./storage/localProgress";
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
  const sql = await SqlEngine.create(session.snapshot().monsters);
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
  } catch (error) {
    app.destroy();
    game?.destroy(true);
    throw error;
  }

  let saveTimer: number | null = null;
  let lastProfileJson = JSON.stringify(profile);
  let previousPersistenceState: {
    mode: string;
    queryCount: number;
    itemIds: string;
    inventoryState: string;
    topologyHash: number;
  } | null = null;
  const flushProgress = (): void => {
    if (saveTimer !== null) {
      window.clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveRun(storage, session.toSavedRun());
    lastProfileJson = persistProfileIfChanged(
      storage,
      session.toProfile(),
      lastProfileJson,
    );
  };
  const scheduleProgressSave = (): void => {
    if (saveTimer !== null) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flushProgress, 350);
  };
  const unsubscribePersistence = session.subscribe((snapshot) => {
    const current = {
      mode: snapshot.mode,
      queryCount: snapshot.queryCount,
      itemIds: [
        ...snapshot.groundItems.map((item) => item.id),
        ...snapshot.lootBundles.map((bundle) => (
          `${bundle.id}:${bundle.items.map((item) => item.dropId).join(",")}`
        )),
      ].sort().join("|"),
      inventoryState: JSON.stringify({
        weapon: snapshot.player.weapon.id,
        armor: snapshot.player.armor?.id ?? null,
        armorHp: snapshot.player.armorHp,
        equipment: snapshot.equipmentInventory.map((item) => item.instanceId),
        consumables: snapshot.consumables.map((stack) => [
          stack.item.id,
          stack.quantity,
        ]),
      }),
      topologyHash: snapshot.mazeFloor.topologyHash,
    };
    const critical = previousPersistenceState === null ||
      current.mode !== previousPersistenceState.mode ||
      current.queryCount !== previousPersistenceState.queryCount ||
      current.itemIds !== previousPersistenceState.itemIds ||
      current.inventoryState !== previousPersistenceState.inventoryState ||
      current.topologyHash !== previousPersistenceState.topologyHash;
    previousPersistenceState = current;
    if (critical) flushProgress();
    else scheduleProgressSave();
  });

  const pageHideHandler = (): void => flushProgress();
  const visibilityChangeHandler = (): void => {
    if (document.visibilityState === "hidden") flushProgress();
  };
  window.addEventListener("pagehide", pageHideHandler);
  document.addEventListener("visibilitychange", visibilityChangeHandler);

  const beforeUnloadHandler = (): void => {
    flushProgress();
    unsubscribePersistence();
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
