import type { FloorLandmarkMessageInput } from "../shared/landmarks";

export function floorLandmarkMessage({
  landmarkId,
  completedLessons,
  openedGateIds,
  monsters,
}: FloorLandmarkMessageInput): string | null {
  void monsters;
  let message: string | null = null;
  if (landmarkId === "npc-scribe-f6") {
    message = !completedLessons.has("f6-insert")
      ? "抄写员：所有写操作都只发生在一次性副本。先明确列名和值，再插入一条修复记录。"
      : !completedLessons.has("f6-update")
        ? "抄写员：新记录已经存在。用 WHERE 只更新目标鳞片，别让整张表一起改变。"
        : !completedLessons.has("f6-delete")
          ? "抄写员：重复记录可以删除，但必须先用条件证明你锁定的是哪一行。"
          : !completedLessons.has("f6-constraint")
            ? "抄写员：让约束替我们拒绝不可能的候选状态。失败也应当留下可读原因。"
            : !completedLessons.has("f6-transaction")
              ? "抄写员：现在同时看原始状态和候选状态。BEGIN 后修改，再用 ROLLBACK 安全返回。"
              : "抄写员：最后用 SAVEPOINT 只撤销错误的一段。安全不是永远不改，而是让每次改变都能被验证。";
  } else if (landmarkId === "f6-sandbox-incubator") {
    message = completedLessons.has("f6-update")
      ? "孵化副本显示原始与候选两列；只有被 WHERE 锁定的记录发生了改变。"
      : completedLessons.has("f6-insert")
        ? "新鳞片已经写入隔离副本。下一步只更新指定 id，不要省略 WHERE。"
        : "孵化台每次都会重置。写出明确列名的 INSERT，观察新记录怎样进入候选状态。";
  } else if (landmarkId === "f6-cleanup-sluice") {
    message = completedLessons.has("f6-delete")
      ? "清理槽只吞下了被 id 与状态共同锁定的重复鳞片，其余记录仍在。"
      : "槽内混有真鳞与重复鳞片。DELETE 前先写 WHERE；没有边界的删除不会被工坊接受。";
  } else if (landmarkId === "f6-constraint-door") {
    message = completedLessons.has("f6-constraint")
      ? "无效候选被 CHECK 约束挡在门外；原始数据没有受到污染。"
      : "龙晶门正在测试一条违反约束的候选记录。读懂失败原因，再处理合法值。";
  } else if (landmarkId === "f6-state-bridge") {
    message = completedLessons.has("f6-transaction")
      ? "双轨桥重新重合：候选修改已经回滚，原始状态保持完整。"
      : "左轨是事务开始前，右轨是修改后。完成 BEGIN / ROLLBACK，让损坏的候选回到原点。";
  } else if (landmarkId === "f6-savepoint-altar") {
    message = completedLessons.has("f6-savepoint")
      ? "祭台保留了已验证步骤，只撤销保存点之后的错误操作。"
      : "整次回滚会丢掉已经正确的修改。设置 SAVEPOINT，再局部退回。";
  } else if (landmarkId === "f6-uncommitted-rookery") {
    message = openedGateIds.has("gate:floor-6-treasure")
      ? "未提交育龙室保存着候选生命的审计痕迹。龙鳞甲已可领取并换装。"
      : "育龙室要求你先证明三件事：能明确写入、能定向更新、也能精确删除。";
  }
  return message;
}
