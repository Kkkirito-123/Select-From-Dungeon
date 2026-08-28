import type { FloorLandmarkMessageInput } from "../shared/landmarks";

/** 第五层黑铁外城地标文案，解释窗口函数和轮值顺序的世界反馈。 */
export function floorLandmarkMessage({
  landmarkId,
  completedLessons,
  openedGateIds,
  monsters,
}: FloorLandmarkMessageInput): string | null {
  void monsters;
  let message: string | null = null;
  if (landmarkId === "npc-scribe-f5") {
    message = !completedLessons.has("f5-over")
      ? "抄写员：先别急着排名。用 OVER 指定窗口，让每一名守卫仍保留自己的明细。"
      : !completedLessons.has("f5-row-number")
        ? "抄写员：分区已经可见。现在用 ROW_NUMBER 给同一分区建立稳定岗次。"
        : !completedLessons.has("f5-rank")
          ? "抄写员：相同分数不该被假装成不同。比较 RANK 与 DENSE_RANK，看看空档落在哪里。"
          : !completedLessons.has("f5-lag-lead")
            ? "抄写员：排名只能告诉你位置。用 LAG 与 LEAD 读取前后岗，找出巡逻断点。"
            : !completedLessons.has("f5-frame")
              ? "抄写员：警戒值正在逐行累积。把窗口范围写清楚，不要让未来行泄露进当前判断。"
              : "抄写员：最后只保留每个分区的前几名。可我开始怀疑，决定公开顺序的人才是这座城真正的主人。";
  } else if (landmarkId === "f5-muster-board") {
    message = completedLessons.has("f5-row-number")
      ? "轮值表已按 sector 分区，并为每名守卫保留稳定 row_number。没有一行因为聚合而消失。"
      : completedLessons.has("f5-over")
        ? "轮值表已经按分区展开，但同分守卫的先后仍不稳定。下一步补上确定排序。"
        : "整座外城只显示一条总计。用 OVER (PARTITION BY ...) 保留明细，再观察每个分区内部的结果。";
  } else if (landmarkId === "f5-rank-standards") {
    message = completedLessons.has("f5-rank")
      ? "两面旗已经同时升起：RANK 为并列名次留下空档，DENSE_RANK 则紧密衔接。"
      : "两面标准旗把同分守卫强行排成不同名次。完成排名题，让并列关系真正显形。";
  } else if (landmarkId === "f5-patrol-chain") {
    message = completedLessons.has("f5-lag-lead")
      ? "岗灯已连接前后记录；链条断开的地方就是巡逻空档。"
      : "每盏岗灯只知道自己。用 LAG / LEAD 让当前行看到同一分区中的前一岗与后一岗。";
  } else if (landmarkId === "f5-alert-wall") {
    message = completedLessons.has("f5-frame")
      ? "警戒墙只累计到当前岗，未来记录不再提前污染判断。"
      : "警戒墙把整个分区一次性照亮。为窗口指定从首行到当前行的范围，恢复真实累计过程。";
  } else if (landmarkId === "f5-silent-roster") {
    message = openedGateIds.has("gate:floor-5-treasure")
      ? "静默名册室保存着从未公开的居民顺序。黑铁甲放在中央，穿上后角色会换成重甲轮廓。"
      : "无编号铁门只接受完整窗口推理：OVER、ROW_NUMBER 与 RANK 都成立后，名册才会开口。";
  }
  return message;
}
