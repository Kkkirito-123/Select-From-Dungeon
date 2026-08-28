import type { FloorLandmarkMessageInput } from "../shared/landmarks";

/** 第三层墓原地标文案，把 JOIN 关系映射为可观察的骨桥和遗物线索。 */
export function floorLandmarkMessage({
  landmarkId,
  completedLessons,
  openedGateIds,
  monsters,
}: FloorLandmarkMessageInput): string | null {
  void openedGateIds;
  void monsters;
  let message: string | null = null;
  if (landmarkId === "npc-scribe-f3") {
    message = !completedLessons.has("f3-inner")
      ? "抄写员：先走到断裂骨桥。给 monsters 和 rooms 各取一个短别名，再用 ON 明确连接两端。"
      : !completedLessons.has("f3-left")
        ? "抄写员：匹配成功的记录已经接上。现在保留没有装备记录的怪物，别让缺失的右表吞掉左表。"
        : !completedLessons.has("f3-self")
          ? "抄写员：同一张 monsters 表里同时有死者和主人。给它两种身份，再沿 master_id 找过去。"
          : !completedLessons.has("f3-chain")
            ? "抄写员：两端还不够。把怪物、墓室与遗物串成三段证据链。"
            : !completedLessons.has("f3-union")
              ? "抄写员：两片墓园都留下了证词。用 UNION 保留双方，而不是替它们选一个胜者。"
              : "抄写员：关系已经完整。去审计死灵王所谓的唯一继承人，然后点燃葬火井。";
  } else if (landmarkId === "f3-relation-bridge") {
    message = completedLessons.has("f3-inner")
      ? "骨桥已按 monsters.room_id = rooms.id 接合。桥能成立，是因为关系明确写出了两端。"
      : "断桥两端分别刻着 monsters.room_id 与 rooms.id。完成 INNER JOIN / ON，桥骨才会找到对应的墓室。";
  } else if (landmarkId === "f3-master-steles") {
    message = completedLessons.has("f3-self")
      ? "双名墓碑已分别标为 child 与 master：同一张表可以在一次查询中承担不同身份。"
      : "两块墓碑来自同一张 monsters 表。若不给它们不同别名，无法分清谁是死者、谁是主人。";
  } else if (landmarkId === "f3-relic-chain") {
    message = completedLessons.has("f3-chain")
      ? "三段遗物链已经闭合：怪物记录连到墓室，墓室旁的装备记录再提供遗物力量。"
      : "断链横跨 monsters、rooms 与 monster_gear。只有三张表都写出别名与连接条件，证据才完整。";
  } else if (landmarkId === "f3-reliquary") {
    message = "无主遗物室：current_owner 已确认是 NULL。它没有现在的主人，不代表它从未属于任何人。";
  }
  return message;
}
