import Phaser from "phaser";
import { TILE_SIZE } from "../../../content/curriculum/mvpLevel";
import {
  floorMapBlueprint,
  floorTransitPresentation,
  regionPortalsEnabledForFloor,
} from "../../../content/world/floorMapBlueprints";
import {
  floorOneChestKind,
  isFloorOneChestItem,
} from "../../../domain/exploration/floorOneTreasure";
import type { GameSnapshot } from "../../../contracts/game/snapshots";
import type { GroundItem, Position } from "../../../domain/shared/types";
import { INTERACTION_LABEL_DISTANCE, isNearPlayer } from "../worldOverlay";
import { COLORS, colorsForFloor } from "./DungeonPalette";
import { WorldObjectRenderer } from "./WorldObjectRenderer";

interface ItemView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  position: Position;
  tween?: Phaser.Tweens.Tween;
}

function gridToPixels(position: Position): Position {
  return {
    x: position.x * TILE_SIZE + TILE_SIZE / 2,
    y: position.y * TILE_SIZE + TILE_SIZE / 2,
  };
}

/** Owns item and loot views while consuming snapshot data from the scene facade. */
export class WorldItemRenderer {
  private readonly views = new Map<string, ItemView>();

  clear(): void {
    this.views.forEach((view) => {
      view.tween?.destroy();
      view.container.destroy(true);
    });
    this.views.clear();
  }

  sync(
    scene: Phaser.Scene,
    entityLayer: Phaser.GameObjects.Container,
    snapshot: GameSnapshot,
    reducedMotion: boolean,
    visibility: WorldObjectRenderer,
  ): void {
    const discovered = new Set(snapshot.discoveredCells);
    const routeTransit = floorMapBlueprint(snapshot.floor).routeTransit;
    const transitPresentation = floorTransitPresentation(routeTransit);
    const regionTransitLabel =
      transitPresentation.regionLabel ?? transitPresentation.label;
    const portalItems: GroundItem[] = (
      regionPortalsEnabledForFloor(snapshot.floor)
        ? snapshot.biomePlan.portals
        : []
    ).flatMap(
      (portal) => [
        {
          id: `${portal.id}:entry`,
          sourceRoomId: portal.fromRegionId,
          ...portal.entry,
          name: regionTransitLabel,
          description: `${regionTransitLabel} · ${portal.name}`,
          kind: "event" as const,
          collection: "interact" as const,
          rewardId: null,
        },
        {
          id: `${portal.id}:exit`,
          sourceRoomId: portal.toRegionId,
          ...portal.exit,
          name: regionTransitLabel,
          description: `${regionTransitLabel} · ${portal.name}`,
          kind: "event" as const,
          collection: "interact" as const,
          rewardId: null,
        },
      ],
    );
    const guidedItems: GroundItem[] = [
      ...snapshot.guidedMap.shortcuts
        .filter((shortcut) => !snapshot.keyItems.includes(shortcut.keyId))
        .map((shortcut) => ({
          id: shortcut.keyId,
          sourceRoomId: shortcut.keyRoomNodeId,
          ...shortcut.keyPosition,
          name: "捷径钥匙",
          description: `保证开启${shortcut.name}，不依赖随机掉落。`,
          kind: "key" as const,
          collection: "interact" as const,
          rewardId: null,
        })),
      ...snapshot.guidedMap.deadEndCaches
        .filter((cache) => !snapshot.openedGateIds.includes(cache.id))
        .map((cache) => ({
          id: cache.id,
          sourceRoomId: cache.sourceRoomId,
          x: cache.x,
          y: cache.y,
          name: "死路补给",
          description: "空支路改为可选探索收益。",
          kind: "event" as const,
          collection: "interact" as const,
          rewardId: cache.rewardId,
        })),
    ];
    const currentIds = new Set([
      ...snapshot.groundItems.map((item) => item.id),
      ...guidedItems.map((item) => item.id),
      ...portalItems.map((item) => item.id),
      ...snapshot.lootBundles.map((bundle) => `loot-bundle:${bundle.id}`),
    ]);
    this.views.forEach((view, id) => {
      if (currentIds.has(id)) return;
      view.tween?.destroy();
      view.container.destroy(true);
      this.views.delete(id);
    });
    [...snapshot.groundItems, ...guidedItems, ...portalItems].forEach((item) => {
      let view = this.views.get(item.id);
      if (!view) {
        const pixel = gridToPixels(item);
        const container = scene.add.container(pixel.x, pixel.y).setDepth(24);
        const sourceRoom = snapshot.roomGraph.nodes.find(
          (room) => room.id === item.sourceRoomId,
        );
        const floorOneChest = isFloorOneChestItem(item) ? floorOneChestKind(item.id) : null;
        const isChest = item.collection === "interact" && (
          floorOneChest !== null ||
          item.id.startsWith("lesson-drop:") ||
          (item.id.startsWith("room-reward:") && Boolean(sourceRoom?.lessonId)) ||
          item.id.startsWith("guided-cache:") ||
          sourceRoom?.type === "treasure"
        );
        const isPortal = item.id.startsWith("biome-portal:");
        const parts: Phaser.GameObjects.GameObject[] = [];
        if (isPortal) {
          parts.push(...visibility.createTransitParts(scene, routeTransit, true));
        } else if (isChest) {
          if (floorOneChest === "mimic") {
            parts.push(
              scene.add.rectangle(0, 3, 26, 15, 0x5f463c)
                .setStrokeStyle(2, COLORS.plum),
              scene.add.rectangle(0, -6, 26, 8, 0x9a694c)
                .setStrokeStyle(2, COLORS.paper),
              scene.add.rectangle(-6, -1, 3, 3, COLORS.paper),
              scene.add.rectangle(6, -1, 3, 3, COLORS.paper),
              scene.add.triangle(0, 7, -7, 0, 7, 0, 0, 7, COLORS.ember),
            );
          } else if (floorOneChest === "warp") {
            parts.push(
              scene.add.ellipse(0, 8, 30, 10, 0x2d6070, 0.64)
                .setStrokeStyle(2, COLORS.query),
              scene.add.rectangle(0, 2, 24, 12, 0x7d5b43)
                .setStrokeStyle(2, COLORS.gold),
              scene.add.rectangle(0, -6, 24, 7, 0xb88745)
                .setStrokeStyle(2, COLORS.paper),
              scene.add.rectangle(0, 1, 5, 6, COLORS.query)
                .setStrokeStyle(1, COLORS.paper),
            );
          } else {
            parts.push(
              scene.add.rectangle(0, 3, 24, 14, 0x8f6338)
                .setStrokeStyle(2, COLORS.gold),
              scene.add.rectangle(0, -6, 24, 8, 0xb88745)
                .setStrokeStyle(2, COLORS.paper),
              scene.add.rectangle(0, 1, 5, 7, COLORS.gold)
                .setStrokeStyle(1, COLORS.paper),
            );
          }
        } else {
          const color = item.kind === "weapon"
            ? COLORS.gold
            : item.kind === "heal"
              ? COLORS.query
              : item.kind === "key"
                ? COLORS.ember
                : COLORS.plum;
          parts.push(
            scene.add.rectangle(0, 0, 13, 13, color, 0.95)
              .setAngle(45)
              .setStrokeStyle(2, COLORS.paper),
            scene.add.rectangle(0, 0, 5, 5, COLORS.paper),
          );
        }
        const label = scene.add.text(
          0,
          -24,
          isPortal
            ? `E · ${regionTransitLabel}`
            : isChest
              ? `E · ${item.name}`
              : item.name,
          {
            color: "#f1d28b",
            fontFamily: "monospace",
            fontSize: "7px",
            backgroundColor: "#08090cdd",
            padding: { x: 3, y: 2 },
            wordWrap: { width: 82, useAdvancedWrap: true },
            align: "center",
          },
        ).setOrigin(0.5);
        parts.push(label);
        container.add(parts);
        entityLayer.add(container);
        const tween = reducedMotion
          ? undefined
          : scene.tweens.add({
              targets: container,
              y: pixel.y - 4,
              yoyo: true,
              repeat: -1,
              duration: 620,
              ease: "Sine.inOut",
            });
        view = {
          container,
          label,
          position: { x: item.x, y: item.y },
          tween,
        };
        this.views.set(item.id, view);
      }
      const visible = visibility.isDiscovered(discovered, item);
      view.container.setVisible(visible);
      view.label.setVisible(
        visible &&
        isNearPlayer(
          snapshot.player,
          view.position,
          INTERACTION_LABEL_DISTANCE,
        ),
      );
    });
    snapshot.lootBundles.forEach((bundle) => {
      const viewId = `loot-bundle:${bundle.id}`;
      let view = this.views.get(viewId);
      if (!view) {
        const pixel = gridToPixels(bundle);
        const container = scene.add.container(pixel.x, pixel.y).setDepth(24);
        const colors = colorsForFloor(snapshot.floor);
        const label = scene.add.text(0, -27, `E · 战利品 ×${bundle.items.length}`, {
          color: "#ffe09a",
          fontFamily: "monospace",
          fontSize: "7px",
          fontStyle: "bold",
          backgroundColor: "#08090cdd",
          padding: { x: 4, y: 2 },
        }).setOrigin(0.5);
        const parts: Phaser.GameObjects.GameObject[] = [
          scene.add.rectangle(0, 3, 28, 16, 0x8f6338)
            .setStrokeStyle(2, colors.gold),
          scene.add.rectangle(0, -7, 28, 9, 0xb88745)
            .setStrokeStyle(2, colors.paper),
          scene.add.rectangle(0, 1, 6, 8, colors.gold)
            .setStrokeStyle(1, colors.paper),
          label,
        ];
        container.add(parts);
        entityLayer.add(container);
        const tween = reducedMotion
          ? undefined
          : scene.tweens.add({
              targets: container,
              y: pixel.y - 3,
              yoyo: true,
              repeat: -1,
              duration: 720,
              ease: "Sine.inOut",
            });
        view = {
          container,
          label,
          position: { x: bundle.x, y: bundle.y },
          tween,
        };
        this.views.set(viewId, view);
      }
      const visible = visibility.isDiscovered(discovered, bundle);
      view.container.setVisible(visible);
      view.label.setVisible(
        visible &&
        isNearPlayer(
          snapshot.player,
          view.position,
          INTERACTION_LABEL_DISTANCE,
        ),
      );
    });
  }
}
