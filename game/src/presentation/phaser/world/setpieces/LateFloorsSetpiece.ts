import Phaser from "phaser";
import {
  floorExperience,
  hasFloorExperience,
  type FloorLandmarkKind,
} from "../../../../content/world/floorExperience";
import type { GameSnapshot } from "../../../../contracts/game/snapshots";
import type {
  FloorEightWorldState,
  FloorFiveWorldState,
  FloorSevenWorldState,
  FloorSixWorldState,
} from "../../../../domain/progression/floorWorldState";
import {
  WORLD_VISUAL_LANGUAGE,
  landmarkInteractionLabel,
} from "../../worldVisualLanguage";
import {
  FloorSetpieceModule,
  type FloorWorldState,
  type PixelPoint,
} from "../shared/FloorSetpieceModule";

interface LateSetpieceView {
  container: Phaser.GameObjects.Container;
  stateDot: Phaser.GameObjects.Ellipse;
  stateText: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  interactionRing: Phaser.GameObjects.Ellipse;
  interactionKey: Phaser.GameObjects.Text;
  point: PixelPoint;
  title: string;
  kind: FloorLandmarkKind;
  interaction: string | null;
}

const LATE_FLOOR_PALETTES = {
  5: { dark: 0x24272e, mid: 0x54525a, light: 0xd7b565, accent: 0x9f3f3f },
  6: { dark: 0x22272c, mid: 0x465f69, light: 0x8ed9d0, accent: 0xd46b42 },
  7: { dark: 0x29253a, mid: 0x59607a, light: 0xe2c56f, accent: 0x78cfd0 },
  8: { dark: 0x171820, mid: 0x4c3c54, light: 0xe4c878, accent: 0xb35a63 },
} as const;

export class LateFloorsSetpiece extends FloorSetpieceModule {
  private lateSetpieces = new Map<string, LateSetpieceView>();

  protected buildFloor(snapshot: GameSnapshot): void {
    this.buildLateFloor(snapshot);
  }

  protected syncFloor(world: FloorWorldState, snapshot: GameSnapshot): void {
    if (
      world.floor === 5 ||
      world.floor === 6 ||
      world.floor === 7 ||
      world.floor === 8
    ) {
      this.syncLateFloor(world);
      this.syncLateSetpieceLabels(snapshot);
    }
  }

  protected resetFloorState(): void {
    this.lateSetpieces.clear();
  }

  private buildLateFloor(snapshot: GameSnapshot): void {
    if (snapshot.floor < 5 || snapshot.floor > 8) return;
    const floor = snapshot.floor as 5 | 6 | 7 | 8;
    const palette = LATE_FLOOR_PALETTES[floor];
    this.createZoneSkin(snapshot, [palette.dark, palette.mid, palette.accent]);

    const definitions = floor === 5
      ? [
          ["f5-muster-board", "分区轮值表", "board"],
          ["f5-rank-standards", "并列双旗", "flags"],
          ["f5-patrol-chain", "前后岗灯", "chain"],
          ["f5-alert-wall", "累计警戒墙", "bars"],
          ["f5-command-clock", "黑铁军钟", "clock"],
          ["f5-ascent", "上行吊桥", "bridge"],
        ] as const
      : floor === 6
        ? [
            ["f6-sandbox-incubator", "一次性孵化副本", "incubator"],
            ["f6-cleanup-sluice", "鳞片清理槽", "sluice"],
            ["f6-constraint-door", "龙晶约束门", "door"],
            ["f6-state-bridge", "原始／候选双轨", "bridge"],
            ["f6-savepoint-altar", "保存点祭台", "altar"],
            ["f6-dragon-throne", "事务提交巢", "throne"],
            ["f6-ascent", "王室升降台", "lift"],
          ] as const
        : floor === 7
          ? [
              ["f7-scan-road", "完整扫描长路", "road"],
              ["f7-index-road", "索引晶枝短路", "branch"],
              ["f7-covering-lake", "覆盖镜湖", "lake"],
              ["f7-broken-root", "函数缠绕根门", "root"],
              ["f7-plan-tree", "执行计划巨树", "tree"],
              ["f7-index-throne", "路径审计树心", "throne"],
              ["f7-ascent", "金色长阶", "stairs"],
            ] as const
          : [
              ["f8-version-gallery", "可见版本长廊", "gallery"],
              ["f8-deadlock-gate", "双骑等待门", "deadlock"],
              ["f8-incident-wings", "事故证据翼", "wings"],
              ["f8-migration-dais", "七步迁移台", "steps"],
              ["f8-archivist-throne", "最终迁移王座", "throne"],
              ["f8-sunset-vista", "最后一道残晖", "vista"],
            ] as const;

    definitions.forEach(([id, title, shape]) => {
      this.createLateSetpiece(snapshot, id, title, shape, palette);
    });
    this.createLateHiddenArea(snapshot, palette);
    this.createUniqueScribe(snapshot, `npc-scribe-f${floor}`);
  }

  private createLateSetpiece(
    snapshot: GameSnapshot,
    landmarkId: string,
    title: string,
    shape: string,
    palette: { dark: number; mid: number; light: number; accent: number },
  ): void {
    const point = this.anchorPoint(snapshot, landmarkId);
    if (!point) return;
    const landmark = floorExperience(snapshot.floor).landmarks.find(
      (entry) => entry.id === landmarkId,
    );
    if (!landmark) return;
    const container = this.scene.add.container(point.x, point.y);
    const shadow = this.scene.add.ellipse(0, 31, 68, 22, 0x070809, 0.46);
    const interactionRing = this.scene.add.ellipse(
      0,
      31,
      56,
      18,
      WORLD_VISUAL_LANGUAGE.interactionInk,
      0.2,
    ).setStrokeStyle(
      2,
      WORLD_VISUAL_LANGUAGE.interactionGold,
      landmark.interaction
        ? WORLD_VISUAL_LANGUAGE.interactionIdleAlpha
        : 0,
    );
    const interactionKey = this.scene.add.text(31, 28, "E", {
      color: "#f0d58a",
      fontFamily: "monospace",
      fontSize: "7px",
      fontStyle: "bold",
      backgroundColor: "#15130fee",
      padding: { x: 3, y: 2 },
    }).setOrigin(0.5).setVisible(landmark.interaction !== null);
    container.add([shadow, interactionRing]);
    const panel = () => this.scene.add.rectangle(0, 4, 82, 54, palette.dark, 0.94)
      .setStrokeStyle(2, palette.light, 0.54);

    if (shape === "board" || shape === "gallery") {
      container.add(panel());
      [-25, 0, 25].forEach((x) => {
        container.add(this.scene.add.rectangle(x, 1, 18, 35, palette.mid, 0.7)
          .setStrokeStyle(1, palette.light, 0.62));
      });
    } else if (shape === "flags") {
      [-22, 22].forEach((x, index) => {
        container.add([
          this.scene.add.rectangle(x, 4, 4, 54, palette.light, 0.76),
          this.scene.add.triangle(x + (index === 0 ? 10 : -10), -14, -15, -9, 15, -9, 0, 11, palette.accent, 0.9),
        ]);
      });
    } else if (shape === "chain" || shape === "deadlock") {
      const nodes = shape === "deadlock"
        ? [{ x: -28, y: -10 }, { x: 28, y: -10 }, { x: 0, y: 23 }]
        : [-36, -12, 12, 36].map((x, index) => ({ x, y: index % 2 === 0 ? -5 : 8 }));
      nodes.forEach((node, index) => {
        const next = nodes[(index + 1) % nodes.length];
        if (shape === "deadlock" || index < nodes.length - 1) {
          container.add(this.scene.add.line(
            0,
            0,
            node.x,
            node.y,
            next.x,
            next.y,
            palette.accent,
            0.66,
          ).setLineWidth(2));
        }
        container.add(this.scene.add.ellipse(node.x, node.y, 15, 15, palette.mid, 0.94)
          .setStrokeStyle(2, palette.light, 0.72));
      });
    } else if (shape === "bars") {
      container.add(panel());
      [-30, -18, -6, 6, 18, 30].forEach((x, index) => {
        container.add(this.scene.add.rectangle(x, 11 - index * 4, 7, 15 + index * 8, palette.accent, 0.74));
      });
    } else if (shape === "clock") {
      container.add(this.scene.add.ellipse(0, 1, 78, 78, palette.dark, 0.96)
        .setStrokeStyle(5, palette.light, 0.8));
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI / 4;
        container.add(this.scene.add.ellipse(
          Math.cos(angle) * 29,
          Math.sin(angle) * 29,
          5,
          5,
          palette.light,
          0.82,
        ));
      }
      container.add([
        this.scene.add.line(0, 0, 0, 0, 0, -24, palette.accent, 0.96).setLineWidth(3),
        this.scene.add.line(0, 0, 0, 0, 19, 8, palette.light, 0.92).setLineWidth(2),
      ]);
    } else if (shape === "incubator") {
      container.add(panel());
      [-24, 0, 24].forEach((x, index) => {
        container.add(this.scene.add.ellipse(x, 7, 18, 27, index === 1 ? palette.accent : palette.mid, 0.84)
          .setStrokeStyle(2, palette.light, 0.7));
      });
    } else if (shape === "sluice") {
      container.add([
        this.scene.add.rectangle(0, 10, 88, 30, palette.mid, 0.84)
          .setStrokeStyle(3, palette.light, 0.62),
        this.scene.add.triangle(0, -13, -43, -9, 43, -9, 0, 15, palette.dark, 0.96),
      ]);
      [-25, -8, 9, 26].forEach((x) => {
        container.add(this.scene.add.polygon(x, 9, [-6, -5, 6, -5, 9, 3, 0, 8, -9, 3], palette.accent, 0.74));
      });
    } else if (shape === "door" || shape === "root") {
      container.add(this.scene.add.rectangle(0, 5, 58, 72, palette.dark, 0.96)
        .setStrokeStyle(4, palette.light, 0.74));
      [-16, 0, 16].forEach((x, index) => {
        container.add(this.scene.add.line(0, 0, x, -27, -x / 2, 31, shape === "root" ? palette.accent : palette.mid, 0.84)
          .setLineWidth(index === 1 ? 4 : 2));
      });
    } else if (shape === "bridge" || shape === "road" || shape === "stairs") {
      const count = shape === "stairs" ? 6 : 5;
      for (let index = 0; index < count; index += 1) {
        const y = (index - (count - 1) / 2) * 10;
        const width = shape === "stairs" ? 35 + index * 10 : 88;
        container.add(this.scene.add.rectangle(0, y, width, 7, index % 2 === 0 ? palette.mid : palette.dark, 0.9)
          .setStrokeStyle(1, palette.light, 0.54));
      }
    } else if (shape === "altar" || shape === "steps") {
      const count = shape === "steps" ? 7 : 3;
      for (let index = 0; index < count; index += 1) {
        container.add(this.scene.add.rectangle(
          0,
          25 - index * 8,
          90 - index * 9,
          7,
          index === count - 1 ? palette.accent : palette.mid,
          0.88,
        ).setStrokeStyle(1, palette.light, 0.5));
      }
    } else if (shape === "branch" || shape === "tree") {
      container.add(this.scene.add.rectangle(0, 17, 9, 62, palette.dark, 0.96)
        .setStrokeStyle(2, palette.light, 0.58));
      const branches = shape === "tree" ? 6 : 3;
      for (let index = 0; index < branches; index += 1) {
        const side = index % 2 === 0 ? -1 : 1;
        container.add(this.scene.add.line(
          0,
          0,
          0,
          8 - index * 8,
          side * (24 + index * 3),
          -4 - index * 8,
          palette.accent,
          0.82,
        ).setLineWidth(3));
      }
    } else if (shape === "lake") {
      container.add([
        this.scene.add.ellipse(0, 8, 104, 48, palette.mid, 0.54)
          .setStrokeStyle(3, palette.light, 0.72),
        this.scene.add.ellipse(0, 5, 58, 20, palette.accent, 0.24)
          .setStrokeStyle(2, palette.light, 0.46),
      ]);
    } else if (shape === "wings") {
      container.add(panel());
      [-36, -12, 12, 36].forEach((x) => {
        container.add(this.scene.add.triangle(x, 1, -10, 19, 0, -20, 10, 19, palette.mid, 0.7)
          .setStrokeStyle(1, palette.light, 0.56));
      });
    } else if (shape === "vista") {
      container.add([
        this.scene.add.rectangle(0, 0, 74, 68, palette.dark, 0.9)
          .setStrokeStyle(4, palette.light, 0.78),
        this.scene.add.rectangle(0, 4, 58, 48, palette.accent, 0.4),
        this.scene.add.ellipse(18, 0, 25, 25, palette.light, 0.84),
      ]);
    } else {
      container.add([
        this.scene.add.rectangle(0, 11, 72, 49, palette.dark, 0.96)
          .setStrokeStyle(3, palette.light, 0.72),
        this.scene.add.rectangle(0, -18, 49, 23, palette.mid, 0.9)
          .setStrokeStyle(2, palette.accent, 0.7),
      ]);
    }

    const stateDot = this.scene.add.ellipse(-35, 34, 8, 8, palette.mid, 0.72)
      .setStrokeStyle(1, palette.light, 0.72);
    const stateText = this.scene.add.text(-27, 34, "未响应", {
      color: "#aeb5be",
      fontFamily: "monospace",
      fontSize: "7px",
      fontStyle: "bold",
    }).setOrigin(0, 0.5);
    container.add([stateDot, stateText, interactionKey]);
    this.root?.add(container);
    const label = this.addLabel(
      point,
      title,
      `#${palette.light.toString(16).padStart(6, "0")}`,
      -48,
    );
    this.lateSetpieces.set(landmarkId, {
      container,
      stateDot,
      stateText,
      label,
      interactionRing,
      interactionKey,
      point,
      title,
      kind: landmark.kind,
      interaction: landmark.interaction,
    });
  }

  private createLateHiddenArea(
    snapshot: GameSnapshot,
    palette: { dark: number; mid: number; light: number; accent: number },
  ): void {
    if (!hasFloorExperience(snapshot.floor)) return;
    const area = floorExperience(snapshot.floor).hiddenAreas[0];
    if (!area) return;
    const point = this.anchorPoint(snapshot, area.landmarkId);
    if (!point) return;
    const backdrop = this.createHiddenRoomBackdrop(
      snapshot,
      area.roomNodeId,
      palette.dark,
      palette.light,
      snapshot.floor % 2 === 0,
    );
    const interior = this.scene.add.container(point.x, point.y);
    const room = this.scene.add.rectangle(0, 6, 98, 68, palette.dark, 0.96)
      .setStrokeStyle(3, palette.light, 0.76);
    const armor = this.scene.add.polygon(
      0,
      2,
      [-18, -19, -7, -27, 0, -19, 7, -27, 18, -19, 13, 25, -13, 25],
      palette.accent,
      0.9,
    ).setStrokeStyle(2, palette.light, 0.9);
    const evidence = this.scene.add.text(0, 32, `REWARD · ${area.rewardArmorId ?? "ARCHIVE"}`, {
      color: `#${palette.light.toString(16).padStart(6, "0")}`,
      fontFamily: "monospace",
      fontSize: "7px",
      fontStyle: "bold",
    }).setOrigin(0.5);
    interior.add([room, armor, evidence]);
    this.root?.add(interior);
    const label = this.addLabel(point, `${area.title} · 专属换装`, "#f0d88b", -49);
    this.createHiddenAreaEntrance(
      snapshot,
      backdrop,
      interior,
      label,
      "未解暗门",
      area.title,
      palette.dark,
      palette.light,
    );
  }

  private setLateState(
    id: string,
    active: boolean,
    text: string,
    ratio = active ? 1 : 0,
  ): void {
    const view = this.lateSetpieces.get(id);
    if (!view) return;
    view.container.setAlpha(active ? 1 : 0.46);
    view.stateDot.setFillStyle(active ? 0x78d5c4 : 0x6a6570, active ? 0.96 : 0.64);
    view.stateDot.setScale(0.78 + Math.max(0, Math.min(1, ratio)) * 0.35);
    view.stateText.setText(text);
    view.stateText.setColor(active ? "#8ce0cf" : "#aeb5be");
  }

  private syncLateSetpieceLabels(snapshot: GameSnapshot): void {
    this.lateSetpieces.forEach((view) => {
      const nearby = this.isPlayerNear(snapshot, view.point, 3);
      view.label.setVisible(nearby);
      view.label.setText(landmarkInteractionLabel({
        name: view.title,
        kind: view.kind,
        interaction: view.interaction,
        nearby,
      }));
      view.stateDot.setVisible(nearby);
      view.stateText.setVisible(nearby);
      view.interactionRing.setStrokeStyle(
        2,
        WORLD_VISUAL_LANGUAGE.interactionGold,
        view.interaction === null
          ? 0
          : nearby
            ? WORLD_VISUAL_LANGUAGE.interactionNearAlpha
            : WORLD_VISUAL_LANGUAGE.interactionIdleAlpha,
      );
      view.interactionKey.setAlpha(nearby ? 1 : 0.68);
    });
  }

  private syncLateFloor(
    world: FloorFiveWorldState | FloorSixWorldState | FloorSevenWorldState | FloorEightWorldState,
  ): void {
    if (world.floor === 5) {
      this.setLateState(
        "f5-muster-board",
        world.roster !== "folded",
        world.roster === "partitioned" ? "分区展开" : "岗次待排",
      );
      this.setLateState(
        "f5-rank-standards",
        world.standards === "ties-visible",
        world.standards === "ties-visible" ? "并列已保留" : "名次未明",
      );
      this.setLateState(
        "f5-patrol-chain",
        world.patrol === "linked",
        world.patrol === "linked" ? "前后岗接通" : "巡逻断链",
      );
      this.setLateState(
        "f5-alert-wall",
        world.alert === "framed",
        world.alert === "framed" ? "当前行范围" : "全城警戒",
      );
      this.setLateState(
        "f5-command-clock",
        world.clock === "reordered",
        world.clock === "reordered" ? "唯一名次停止" : "指针乱转",
      );
      this.setLateState(
        "f5-ascent",
        world.ascent === "lowered",
        world.ascent === "lowered" ? "吊桥落下" : "吊桥高悬",
      );
      return;
    }
    if (world.floor === 6) {
      this.setLateState(
        "f6-sandbox-incubator",
        world.sandbox !== "pristine",
        world.sandbox === "updated"
          ? "记录已定向更新"
          : world.sandbox === "written"
            ? "新记录孵化"
            : "副本洁净",
      );
      this.setLateState(
        "f6-cleanup-sluice",
        world.cleanup === "targeted",
        world.cleanup === "targeted" ? "指定项已清理" : "鳞片淤积",
      );
      this.setLateState(
        "f6-constraint-door",
        world.constraint === "protected",
        world.constraint === "protected" ? "约束保护" : "冲突未验",
      );
      this.setLateState(
        "f6-state-bridge",
        world.bridge === "rolled-back",
        world.bridge === "rolled-back" ? "状态已回滚" : "候选态悬空",
      );
      this.setLateState(
        "f6-savepoint-altar",
        world.savepoint === "validated",
        world.savepoint === "validated" ? "局部撤销通过" : "保存点未立",
      );
      this.setLateState(
        "f6-dragon-throne",
        world.throne === "validated",
        world.throne === "validated" ? "龙巢已验证" : "事务未决",
      );
      this.setLateState(
        "f6-ascent",
        world.ascent === "active",
        world.ascent === "active" ? "升降台开启" : "升降台停机",
      );
      return;
    }
    if (world.floor === 7) {
      this.setLateState(
        "f7-index-road",
        world.indexPath !== "dark",
        world.indexPath === "composite"
          ? "复合短路"
          : world.indexPath === "point-search"
            ? "主键点查"
            : "索引未亮",
      );
      this.setLateState(
        "f7-covering-lake",
        world.lake === "covering",
        world.lake === "covering" ? "覆盖索引" : "仍需回表",
      );
      this.setLateState(
        "f7-broken-root",
        world.rootGate === "range-open",
        world.rootGate === "range-open" ? "范围门恢复" : "根门断裂",
      );
      this.setLateState(
        "f7-plan-tree",
        world.planTree === "explained",
        world.planTree === "explained" ? "计划已展开" : "执行路未明",
      );
      this.setLateState(
        "f7-index-throne",
        world.throne === "paths-compared",
        world.throne === "paths-compared" ? "路径已比较" : "代价待估",
      );
      this.setLateState(
        "f7-ascent",
        world.ascent === "sunlit",
        world.ascent === "sunlit" ? "金阶点亮" : "残照未至",
      );
      this.setLateState("f7-scan-road", true, "慢路始终保留");
      return;
    }
    this.setLateState(
      "f8-version-gallery",
      world.gallery === "snapshot",
      world.gallery === "snapshot" ? "快照稳定" : "版本重叠",
    );
    this.setLateState(
      "f8-deadlock-gate",
      world.deadlock === "cycle-exposed",
      world.deadlock === "cycle-exposed" ? "等待环已显" : "双骑对峙",
    );
    this.setLateState(
      "f8-incident-wings",
      world.wings > 0,
      `${world.wings}/4 证据翼`,
      world.wings / 4,
    );
    this.setLateState(
      "f8-migration-dais",
      world.migration === "ready",
      world.migration === "ready" ? "迁移台就绪" : "七步未齐",
    );
    this.setLateState(
      "f8-archivist-throne",
      world.throne !== "waiting",
      world.throne === "committed" ? "记录已提交" : "等待审计",
    );
    this.setLateState(
      "f8-sunset-vista",
      world.vista === "new-dawn",
      world.vista === "new-dawn" ? "新晨线" : "最后残晖",
    );
  }
}
