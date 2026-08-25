import type { FloorLandmarkMessageInput } from "../shared/landmarks";

export function floorLandmarkMessage({
  landmarkId,
  completedLessons,
  openedGateIds,
  monsters,
}: FloorLandmarkMessageInput): string | null {
  void monsters;
  let message: string | null = null;
  if (landmarkId === "npc-scribe-f7") {
    message = !completedLessons.has("f7-btree")
      ? "抄写员：先沿 B-Tree 找到单点路径。索引不是答案，只是缩短抵达答案的路。"
      : !completedLessons.has("f7-composite")
        ? "抄写员：复合索引有顺序。先使用最左列，再观察后续列是否还能收窄范围。"
        : !completedLessons.has("f7-covering")
          ? "抄写员：若索引已经包含所需字段，就不必每次回到主表湖底。"
          : !completedLessons.has("f7-invalid")
            ? "抄写员：函数、隐式转换和范围条件可能让好索引失效。先解释为什么，再修查询。"
            : !completedLessons.has("f7-plan")
              ? "抄写员：读取执行计划，不要只凭查询看起来短就宣布它更快。"
              : "抄写员：最后比较候选路径的代价。最快的路不是唯一的路，也不一定是永远正确的路。";
  } else if (landmarkId === "f7-scan-road" || landmarkId === "f7-index-road") {
    message = completedLessons.has("f7-composite")
      ? "索引石径已形成复合路径：最左前缀先定位，再由后续列继续缩小候选范围。"
      : completedLessons.has("f7-btree")
        ? "第一段 B-Tree 石径已经点亮。继续检查复合索引的列顺序。"
        : "石径仍暗。先让等值条件沿 B-Tree 从根节点走到目标叶节点。";
  } else if (landmarkId === "f7-covering-lake") {
    message = completedLessons.has("f7-covering")
      ? "索引已经覆盖本次读取字段，湖面直接映出结果，不再潜回主表。"
      : "每次查询都从索引岸边潜回主表湖底。尝试让索引包含本次真正需要的字段。";
  } else if (landmarkId === "f7-broken-root") {
    message = completedLessons.has("f7-invalid")
      ? "缠根条件已经改写，范围门重新使用可索引列打开。"
      : "函数包裹和隐式转换缠住了索引根。找出失效原因，再恢复可搜索条件。";
  } else if (landmarkId === "f7-plan-tree") {
    message = completedLessons.has("f7-plan")
      ? "执行计划树已展开：访问方式、估算行数与额外排序都可逐节点读取。"
      : "计划树只显示一个黑箱。使用 EXPLAIN，比较实际访问路径而不是猜测。";
  } else if (landmarkId === "f7-blind-garden") {
    message = openedGateIds.has("gate:floor-7-treasure")
      ? "盲索引花园没有路标，却保留所有候选路径。晶甲会让角色换成折光轮廓。"
      : "花园拒绝只背结论的人。完成 B-Tree、复合索引和覆盖索引，暗门才会显形。";
  }
  return message;
}
