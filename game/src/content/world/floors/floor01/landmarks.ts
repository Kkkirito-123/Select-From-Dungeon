import type { FloorLandmarkMessageInput } from "../shared/landmarks";

export function floorLandmarkMessage({
  landmarkId,
  completedLessons,
  openedGateIds,
  monsters,
}: FloorLandmarkMessageInput): string | null {
  void openedGateIds;
  void monsters;
  let message: string | null = null;
  if (landmarkId === "npc-scribe-f1") {
    message = !completedLessons.has("select")
      ? "抄写员：先去档案水轮。找出 ID #001 的记录，学会用 SELECT 读取字段、用 FROM 指定表。"
      : !completedLessons.has("where")
        ? "抄写员：水轮已经醒了。下一步用 WHERE 只留下目标记录，让积水退去。"
        : !completedLessons.has("is-null")
          ? "抄写员：宿舍床牌露出来了。NULL 不是空字符串；去确认那条真正缺失关联值的记录。"
          : !completedLessons.has("group-by")
            ? "抄写员：名字散在多条信号里。用 COUNT 与 GROUP BY 把同类记录聚成一组。"
            : !completedLessons.has("having")
              ? "抄写员：分组已经完成。最后用 HAVING 筛选聚合后的结果，打开登记大厅。"
              : "抄写员：这一层的记录已经完整。前往回燃登记大厅，击败守门者后乘升降机上行。";
  } else if (landmarkId === "f1-water-wheel") {
    message = !completedLessons.has("select")
      ? "档案水轮停在 ID #001 卡住的控制记录上。击败它并完成 SELECT / FROM，水轮会自动启动。"
      : !completedLessons.has("where")
        ? "档案水轮正在转动，但排水记录仍未筛准。继续完成 WHERE，让水位降到宿舍门槛以下。"
        : "档案水轮稳定运转，排水渠已降到低水位；它是 SQL 结果驱动的世界机关，不需要再次启动。";
  } else if (landmarkId === "f1-nameless-beds") {
    message = !completedLessons.has("where")
      ? "无名宿舍仍被高水遮住。先完成 SELECT / FROM 与 WHERE，让水位下降。"
      : !completedLessons.has("is-null")
        ? "床牌已经露出，但仍显示 ???。击败 ID #003，并用 IS NULL 确认缺失的 master_id。"
        : "床牌已经显示 NULL：这条记录真实存在，只是名字关联值缺失。";
  } else if (landmarkId === "f1-sealed-vault") {
    message = "封存旧库：旧页右下角都有同一枚恢复印，姓名栏却被裁去。宝箱只提供本轮构筑奖励；真正留下的是‘被移出当前表仍可能存在’这条证据。";
  }
  return message;
}
