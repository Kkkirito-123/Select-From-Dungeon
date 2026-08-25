import type { FloorLandmarkMessageInput } from "../shared/landmarks";

export function floorLandmarkMessage({
  landmarkId,
  completedLessons,
  openedGateIds,
  monsters,
}: FloorLandmarkMessageInput): string | null {
  let message: string | null = null;
  if (landmarkId === "npc-scribe-f8") {
    message = !completedLessons.has("f8-mvcc")
      ? "抄写员：先看两个事务如何读取同一份历史。MVCC 让读者看到一致快照。"
      : !completedLessons.has("f8-lock")
        ? "抄写员：快照保护了读，却没有消除写冲突。把等待关系画成环，找出死锁。"
        : !completedLessons.has("f8-isolation")
          ? "抄写员：选择隔离级别，就是选择哪些并发现象可以被接受。"
          : !completedLessons.has("f8-modeling")
            ? "抄写员：高堂要求重新划分实体、关系与约束。模型决定未来查询能否被清楚表达。"
            : !completedLessons.has("f8-replication")
              ? "抄写员：复制带来可用性，也带来延迟。先声明读到旧数据时系统如何回应。"
              : !completedLessons.has("f8-sharding")
                ? "抄写员：分片键会决定数据聚在一起还是永远跨区奔波。"
                : "抄写员：最后审计最小权限与迁移顺序。我们不是来覆盖旧库，而是让它第一次承认自己改过什么。";
  } else if (landmarkId === "f8-version-gallery") {
    message = completedLessons.has("f8-mvcc")
      ? "版本长廊已经冻结为一致快照；较新的版本仍存在，只是不属于当前读视图。"
      : "多条版本在长廊中互相覆盖。先确定 MVCC 快照边界，让当前事务只读取应当可见的版本。";
  } else if (landmarkId === "f8-deadlock-gate") {
    message = completedLessons.has("f8-lock")
      ? "等待图中的环已经暴露，牺牲者被明确选择，门锁随之解除。"
      : "两扇黑金门互相等待。读取锁持有者与等待者，找出闭合环。";
  } else if (landmarkId === "f8-incident-wings") {
    const completed = ["f8-isolation", "f8-modeling", "f8-replication", "f8-sharding"]
      .filter((lessonId) => completedLessons.has(lessonId)).length;
    message = `四座事故侧翼已修复 ${completed}/4：隔离、建模、复制、分片。每修复一翼，中央迁移台就多获得一份可验证输入。`;
  } else if (landmarkId === "f8-migration-dais") {
    message = completedLessons.has("f8-sharding")
      ? "迁移台已收齐四份事故修复记录。最终步骤必须包含校验、最小权限与可回滚边界。"
      : "迁移台仍在等待四座事故侧翼。先完成隔离、建模、复制与分片，再提交最后方案。";
  } else if (landmarkId === "f8-zero-row-chapel") {
    message = openedGateIds.has("gate:floor-8-treasure")
      ? "零行礼拜堂证明：结果为空不等于查询失败。王室甲已经从旧展示柜移交给你。"
      : "礼拜堂只为能区分空结果、错误结果与权限拒绝的人开启。先完成前四座事故侧翼。";
  } else if (landmarkId === "f8-sunset-vista") {
    const finished = monsters.some((monster) => monster.id === 84 && monster.hp <= 0)
      || completedLessons.has("f8-security");
    message = finished
      ? "落日之后出现了新的晨线。旧库没有被删除；它带着迁移记录成为可被追溯的历史。"
      : "高堂尽头仍只有正在褪色的落日。完成最终审计后，这里才会显示新的天光。";
  }
  return message;
}
