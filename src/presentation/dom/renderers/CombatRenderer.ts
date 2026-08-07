/**
 * 战斗和 SQL 任务的 DOM 渲染器。
 *
 * Renderer 只读取 GameSnapshot/查询结果并更新展示节点，不执行 SQL、不扣血、
 * 不推进课程。课程语义已经由领域层生成，Renderer 只按任务简报显示它们。
 */
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { Monster } from "../../../domain/shared/types";
import {
  monsterIdentityPresentation,
  monsterIntentName,
} from "../../../domain/progression/monsterIdentity";
import { HudRenderer } from "./HudRenderer";

function requiredElement<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少战斗渲染节点：${selector}`);
  return element;
}

export class CombatRenderer {
  constructor(
    private readonly root: HTMLElement,
    private readonly hud: HudRenderer,
  ) {}

  renderTarget(target: Monster | undefined, snapshot: GameSnapshot): void {
    const identity = target
      ? monsterIdentityPresentation(target, snapshot.profile.discoveredMonsterIds)
      : null;
    const intentName = target
      ? monsterIntentName(target, snapshot.profile.discoveredMonsterIds)
      : null;
    requiredElement(this.root, "#target-name").textContent =
      identity?.nameLabel ?? "当前房间没有怪物";
    requiredElement(this.root, "#target-id").textContent = identity?.idLabel ?? "ID —";
    requiredElement(this.root, "#target-species").textContent =
      identity?.speciesLabel ?? snapshot.currentRoomTitle;
    this.hud.renderProgress(
      "#target-hp-progress",
      "#target-hp-bar",
      target?.hp ?? 0,
      target?.maxHp ?? 1,
      target ? `${target.hp} / ${target.maxHp}` : "当前没有怪物",
    );
    requiredElement(this.root, "#target-hp-value").textContent = target
      ? `${target.hp} / ${target.maxHp}`
      : "— / —";
    requiredElement(this.root, "#target-intent").textContent = snapshot.combat
      ? `${intentName ?? "攻击正在蓄力"} · 最高 ${snapshot.combat.intent.damage} 伤害`
      : target?.hp === 0
        ? "记录已清除"
        : target
          ? `${intentName} · 最高 ${target.damage} 伤害`
          : snapshot.claimableReward?.name ?? "探索 / 领取";
  }

  renderLocks(snapshot: GameSnapshot): void {
    const root = requiredElement(this.root, "#lock-list");
    root.replaceChildren();
    snapshot.locks.forEach((lock) => {
      const chip = document.createElement("span");
      chip.textContent = lock;
      root.append(chip);
    });
  }

  renderTaskBrief(snapshot: GameSnapshot): void {
    const root = requiredElement(this.root, "#terminal-task-brief");
    root.replaceChildren();
    const brief = snapshot.taskBrief;
    if (!brief) {
      const fallback = document.createElement("p");
      fallback.className = "task-brief__fallback";
      fallback.textContent = snapshot.missionBody;
      root.append(fallback);
      return;
    }

    const heading = document.createElement("div");
    heading.className = `task-brief__tier task-brief__tier--${brief.tier}`;
    heading.textContent = brief.tierLabel;
    root.append(heading);

    const appendSection = (
      label: string,
      values: readonly string[],
      className = "",
    ): void => {
      if (values.length === 0) return;
      const section = document.createElement("section");
      section.className = `task-brief__section ${className}`.trim();
      const title = document.createElement("strong");
      title.textContent = label;
      section.append(title);
      values.forEach((value) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = value;
        section.append(paragraph);
      });
      root.append(section);
    };

    appendSection("当前局面", [brief.situation], "task-brief__section--situation");
    appendSection("这次要做", [brief.queryGoal], "task-brief__section--goal");
    appendSection("必须返回", brief.outputColumns);
    appendSection(
      "字段说明",
      brief.fieldGuide.map((field) => `${field.expression} → ${field.meaning}`),
      "task-brief__section--fields",
    );
    appendSection("连接关系", brief.relations, "task-brief__section--relation");
    appendSection("查询条件", brief.constraints);
    appendSection("成功后", [brief.successEffect], "task-brief__section--effect");
  }
}
