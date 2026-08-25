/**
 * 开发桥的页面内低敏语义 Trace。
 *
 * 本文件只记录 look/go/use/inputSql/query/checkpoint 等高层动作的顺序和有限结果摘要，采用
 * 固定容量环形缓冲；不记录鼠标轨迹、渲染帧、SQL、答案、完整地图、存档或身份。
 * Trace 仅存在于当前页面内存，刷新或关闭临时 Chromium Context 后自然消失。
 */

import type { DungeonAgentEvent } from "./protocol";

const SQL_TEXT_PATTERN = /\b(?:SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|PRAGMA|ATTACH)\b/iu;
const MAX_SUMMARY_LENGTH = 240;

function safeSummary(value: string): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (SQL_TEXT_PATTERN.test(normalized)) return "[查询正文未记录]";
  return normalized.slice(0, MAX_SUMMARY_LENGTH);
}

/**
 * 单页面、单调序号的有限语义事件缓冲。
 *
 * 容量满后只淘汰最旧事件，序号不会回绕或复用，因此维护器可用 `afterSequence`
 * 增量读取并准确判断 Trace 截取边界。
 */
export class DungeonAgentTrace {
  private readonly entries: DungeonAgentEvent[] = [];
  private nextSequence = 1;

  /**
   * @param capacity 最多保留的事件数，必须是正整数。
   * @throws 容量非法时抛出错误，防止调用方误以为 Trace 已启用。
   */
  constructor(private readonly capacity = 500) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("Dungeon Agent Trace 容量必须是正整数");
    }
  }

  /**
   * 追加一条低敏语义事件。
   *
   * @param type 由桥内部定义的稳定动作或状态类型。
   * @param summary 不得包含 SQL、答案、地图或存档的有限摘要。
   * @returns 新事件的只读副本。
   */
  record(type: string, summary: string): DungeonAgentEvent {
    const event: DungeonAgentEvent = {
      sequence: this.nextSequence,
      type,
      summary: safeSummary(summary),
    };
    this.nextSequence += 1;
    this.entries.push(event);
    if (this.entries.length > this.capacity) this.entries.shift();
    return { ...event };
  }

  /**
   * 增量读取指定序号之后仍在缓冲中的事件。
   *
   * @param afterSequence 调用方最后已消费的语义事件序号。
   * @returns 按序号升序排列的副本；不会暴露内部可变数组。
   */
  eventsAfter(afterSequence: number): readonly DungeonAgentEvent[] {
    const boundary = Number.isFinite(afterSequence)
      ? Math.max(0, Math.floor(afterSequence))
      : 0;
    return this.entries
      .filter((event) => event.sequence > boundary)
      .map((event) => ({ ...event }));
  }
}
