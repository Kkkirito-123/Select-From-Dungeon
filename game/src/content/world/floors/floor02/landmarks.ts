import type { FloorLandmarkMessageInput } from "../shared/landmarks";

/** 第二层潮汐群岛地标文案，根据课程完成情况提示下一处航线。 */
export function floorLandmarkMessage({
  landmarkId,
  completedLessons,
  openedGateIds,
  monsters,
}: FloorLandmarkMessageInput): string | null {
  void openedGateIds;
  void monsters;
  let message: string | null = null;
  if (landmarkId === "npc-scribe-f2") {
    message = !completedLessons.has("order-by")
      ? "抄写员：先读取七盏浮标的强度，用 ORDER BY 排出第一条可走航线。"
      : !completedLessons.has("distinct")
        ? "抄写员：航线已经有顺序。接下来用 DISTINCT 判断哪些水纹重复、哪些仍来自不同岛屿。"
        : !completedLessons.has("inner-join")
          ? "抄写员：沉水村落已经露出。去双端根桥，用 INNER JOIN 说明怪物记录与房间记录如何相连。"
          : !completedLessons.has("left-join")
            ? "抄写员：根桥接通了两端。再用 LEFT JOIN 保留没有装备记录的怪物，别让缺失关系把整行吞掉。"
            : !completedLessons.has("join-boss")
              ? "抄写员：七个来源都已保留。前往月潮灯塔，用完整 JOIN 阻止守卫只留下出现最多的一页。"
              : "抄写员：灯塔已经同时照亮七个方向。北岸渡船会带我们去白霜墓原。";
  } else if (landmarkId === "f2-ranked-beacons") {
    message = !completedLessons.has("order-by")
      ? "七盏月潮浮标的信号强弱混在一起。完成 ORDER BY / LIMIT 后，最强信号会先点亮可走航线。"
      : "浮标已按强度排列，但顺序只决定先去哪里，不能证明七份记录是同一个人。";
  } else if (landmarkId === "f2-drowned-village") {
    message = !completedLessons.has("distinct")
      ? "水下门牌在重复波纹中重叠。先完成 DISTINCT，分清重复显示与真实存在的不同来源。"
      : !completedLessons.has("left-join")
        ? "七块门牌已经分开，其中一扇门没有装备记录。之后用 LEFT JOIN 保留它，再确认缺失的一侧。"
        : "沉水村落的无装备门牌仍被保留：右表没有匹配记录，不等于左表居民不存在。";
  } else if (landmarkId === "f2-root-bridge") {
    message = !completedLessons.has("inner-join")
      ? "古树根桥的两端分别刻着 monsters.room_id 与 rooms.id。完成 INNER JOIN 后，两端才会接合。"
      : "根桥已经按 monsters.room_id = rooms.id 接通。关系必须说明两端，不能只凭相似名字猜测。";
  } else if (landmarkId === "f2-wreck-ledger") {
    message = "沉船记录舱：七只防水匣来自七个港口，共享同一枚恢复印。构筑宝箱不会替你选出唯一真名；这间舱室只证明来源不能被粗暴去重。";
  }
  return message;
}
