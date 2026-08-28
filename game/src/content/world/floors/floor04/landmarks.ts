import type { FloorLandmarkMessageInput } from "../shared/landmarks";

/** 第四层元素升炉地标文案；三种元素区域共享同一套进度查询。 */
export function floorLandmarkMessage({
  landmarkId,
  completedLessons,
  openedGateIds,
  monsters,
}: FloorLandmarkMessageInput): string | null {
  let message: string | null = null;
  if (landmarkId === "npc-scribe-f4") {
    message = !completedLessons.has("f4-scalar")
      ? "抄写员：不要同时追三条管线。先让内层查询返回一个 id，再由外层读取对应记录。"
      : !completedLessons.has("f4-in")
        ? "抄写员：一个结果已经找到。冰库需要一组房间 id，用 IN 判断怪物是否属于这组结果。"
        : !completedLessons.has("f4-exists")
          ? "抄写员：雷晶只关心记录是否存在。用 EXISTS，让内层回答有或没有。"
          : !completedLessons.has("f4-correlated")
            ? "抄写员：下一步让内层查询引用当前外层记录，逐行核对各自的装备力量。"
            : !completedLessons.has("f4-cte")
              ? "抄写员：依赖链太长了。先用 WITH 给中间结果命名，再从这个结果继续查询。"
              : "抄写员：最后沿 master_id 递归追到源头。三场事故会回到同一个仍为 OPEN 的命令。";
  } else if (landmarkId === "f4-source-core") {
    message = completedLessons.has("f4-scalar")
      ? "命令源炉已经显示内层得到的单一 id；外层只负责读取这个 id 对应的记录。"
      : "源炉外层没有目标。先在括号内查询一个确定 id，再把它交给外层条件。";
  } else if (landmarkId === "f4-frost-array") {
    message = completedLessons.has("f4-in")
      ? "属于第四层 frost 区域的冰槽已被同时选中。IN 接受的是一组结果，不必把每个 id 写死。"
      : "冻结阵列需要 rooms 表返回一组 id，再由 monsters.room_id 判断成员关系。";
  } else if (landmarkId === "f4-forge-lord") {
    const defeated = monsters.some((monster) => monster.id === 44 && monster.hp <= 0);
    message = defeated
      ? "霜炉主已经倒下。它身后的回燃门开始显形，保存着第一层登记厅的一段残响。"
      : "中层首领 ID #044 截断了火炉与雷晶核心之间的依赖链。击败它，才能让回燃门出现。";
  } else if (landmarkId === "f4-dependency-spine") {
    message = completedLessons.has("f4-recursive")
      ? "完整递归链已经落在 ROYAL-UPDATE-01；事务状态是 OPEN，而不是失败或已撤销。"
      : completedLessons.has("f4-cte")
        ? "公共表表达式已有名字。继续用递归项沿 master_id 逐层追溯，直到没有上级记录。"
        : "三种元素管线都连到同一根脊柱。用 WITH 命名中间结果，避免反复重写同一段子查询。";
  } else if (landmarkId === "f4-echo-gate") {
    message = openedGateIds.has("gate:floor-4-treasure")
      ? "回燃残响：这里复制了第一层的墙与火，却没有复制当时的你。房间深处留着一件可换装的回燃衣。"
      : "回燃门仍封闭。完成前三种子查询并击败中层首领 ID #044，余烬轮廓才会成为入口。";
  } else if (landmarkId === "f4-echo-registry") {
    message = "残响登记台：水轮只是一次保存下来的调用轮廓。旧页上的姓名仍被裁去，只有“恢复许可有效”这一枚印记在四层之后继续返回真值。";
  } else if (landmarkId === "f4-echo-ember") {
    message = "无温余烬：它记得你曾被火送回，却不提供新的休息与复活点。当前复活点仍由第四层真正点燃的篝火决定。";
  } else if (landmarkId === "f4-echo-null-bed") {
    message = "NULL 床位残影：床位记录仍在，只是姓名关联缺失。四层过去，这条区别依然成立——NULL 不是空字符串，也不是整行不存在。";
  } else if (landmarkId === "f4-echo-return") {
    message = "依赖返回门：沿原路离开即可回到三相升炉。残响不会重置第四层怪物、篝火、迷雾，也不会改写第一层的真实进度。";
  }
  return message;
}
