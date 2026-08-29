/**
 * 浏览器启动入口。
 *
 * 这里仅加载全局样式、提供开发桥的延迟 loader，并把真正的服务装配和
 * 生命周期交给 GameRuntime；规则、存储和 DOM 工作流不在入口实现。
 */
import "../presentation/style.css";
import {
  GameRuntime,
  type GameRuntimePlaytestLoaders,
} from "../features/game-runtime/GameRuntime";

async function bootstrap(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) throw new Error("缺少应用根节点。 ");

  let playtestLoaders: GameRuntimePlaytestLoaders | null = null;
  if (import.meta.env.DEV) {
    // 动态导入放在 DEV 常量分支内，生产构建会裁掉整条试玩路径和全局桥协议。
    playtestLoaders = {
      loadProtocol: async () => await import("../devtools/dungeon-agent/protocol"),
      loadBridge: async () => await import("../devtools/dungeon-agent/bridge"),
    };
  }
  await GameRuntime.start(root, { playtestLoaders });
}

bootstrap().catch((error: unknown) => {
  const root = document.querySelector<HTMLElement>("#app");
  if (!root) return;
  root.textContent = error instanceof Error
    ? `魔王城启动失败：${error.message}`
    : "魔王城启动失败。";
  root.className = "fatal-error";
});
