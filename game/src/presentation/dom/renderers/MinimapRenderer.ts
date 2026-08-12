/**
 * 小地图渲染器。
 *
 * 该模块只把 GameSnapshot 中已经计算好的探索信息绘制为 SVG，不负责移动、
 * 迷宫规则、存档或 Agent 调用。小地图是发现证据，不提供传送或修改状态的能力。
 */
import { regionPortalsEnabledForFloor } from "../../../content/world/floorMapBlueprints";
import { floorCurrentSightCellKeys } from "../../../domain/exploration/floorLabyrinth";
import type { GameSnapshot } from "../../../contracts/game/snapshots";

const SVG_NS = "http://www.w3.org/2000/svg";

export class MinimapRenderer {
  constructor(private readonly root: HTMLElement) {}

  /** 根据只读快照重建小地图，并同步已探索格数。 */
  render(snapshot: GameSnapshot): void {
    const root = this.requiredElement<HTMLElement>("#castle-map");
    root.replaceChildren();
    const floor = snapshot.mazeFloor;
    const discovered = new Set(snapshot.discoveredCells);
    const currentSight = this.currentSight(snapshot);
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${floor.width} ${floor.height}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("focusable", "false");
    svg.setAttribute(
      "aria-label",
      `${floor.width} × ${floor.height} 迷宫小地图，已探索 ${discovered.size} 格；未知区域隐藏。`,
    );
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

    const title = document.createElementNS(SVG_NS, "title");
    title.textContent = "发现式迷宫小地图：移动探索后才会显示地面、门、怪物和道具。";
    svg.append(title);

    const floorCommands: string[] = [];
    discovered.forEach((cell) => {
      const [x, y] = cell.split(":").map(Number);
      if (
        Number.isInteger(x) &&
        Number.isInteger(y) &&
        floor.tiles[y]?.[x] === "."
      ) {
        floorCommands.push(`M${x} ${y}h1v1h-1z`);
      }
    });
    if (floorCommands.length > 0) {
      const paths = document.createElementNS(SVG_NS, "path");
      paths.classList.add("minimap-floor");
      paths.setAttribute("d", floorCommands.join(""));
      svg.append(paths);
    }
    if (snapshot.navigationGuidance.route.length > 0) {
      const guidancePath = document.createElementNS(SVG_NS, "path");
      guidancePath.classList.add("minimap-guidance-route");
      guidancePath.setAttribute("d", snapshot.navigationGuidance.route
        .map((position) => `M${position.x} ${position.y}h1v1h-1z`)
        .join(""));
      svg.append(guidancePath);
    }
    const revealedMarkers = snapshot.guidedMap.routeMarkers.filter(
      (marker) => discovered.has(`${marker.x}:${marker.y}`),
    ).length;
    this.requiredElement<HTMLElement>("#map-explored").textContent =
      `${floorCommands.length} 格 · ${revealedMarkers} 信标${
        snapshot.navigationGuidance.level > 0
          ? ` · 指路 L${snapshot.navigationGuidance.level}`
          : ""
      }`;

    floor.gates.forEach((gate) => {
      if (!discovered.has(`${gate.x}:${gate.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-gate");
      const locked = !snapshot.availableRoomIds.includes(gate.roomNodeId);
      marker.classList.add(locked ? "is-locked" : "is-open");
      marker.setAttribute("x", String(gate.x + 0.15));
      marker.setAttribute("y", String(gate.y + 0.05));
      marker.setAttribute("width", "0.7");
      marker.setAttribute("height", "0.9");
      svg.append(marker);
    });

    snapshot.guidedMap.routeMarkers.forEach((routeMarker) => {
      if (!discovered.has(`${routeMarker.x}:${routeMarker.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "circle");
      marker.classList.add("minimap-route", `is-${routeMarker.phase}`);
      marker.setAttribute("cx", String(routeMarker.x + 0.5));
      marker.setAttribute("cy", String(routeMarker.y + 0.5));
      marker.setAttribute("r", "0.26");
      svg.append(marker);
    });
    snapshot.guidedMap.shortcuts.forEach((shortcut) => {
      const open = snapshot.openedGateIds.includes(shortcut.id);
      [shortcut.entry, shortcut.exit].forEach((position) => {
        if (!discovered.has(`${position.x}:${position.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "rect");
        marker.classList.add("minimap-shortcut", open ? "is-open" : "is-locked");
        marker.setAttribute("x", String(position.x + 0.14));
        marker.setAttribute("y", String(position.y + 0.14));
        marker.setAttribute("width", "0.72");
        marker.setAttribute("height", "0.72");
        svg.append(marker);
      });
    });
    const regionPortals = regionPortalsEnabledForFloor(snapshot.floor)
      ? snapshot.biomePlan.portals
      : [];
    regionPortals.forEach((portal) => {
      [portal.entry, portal.exit].forEach((position) => {
        if (!discovered.has(`${position.x}:${position.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "circle");
        marker.classList.add("minimap-region-portal");
        marker.setAttribute("cx", String(position.x + 0.5));
        marker.setAttribute("cy", String(position.y + 0.5));
        marker.setAttribute("r", "0.42");
        svg.append(marker);
      });
    });

    snapshot.campfires.forEach((campfire) => {
      if (!discovered.has(`${campfire.x}:${campfire.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "circle");
      marker.classList.add("minimap-campfire");
      if (snapshot.respawnCampfireId === campfire.id) {
        marker.classList.add("is-checkpoint");
      }
      marker.setAttribute("cx", String(campfire.x + 0.5));
      marker.setAttribute("cy", String(campfire.y + 0.5));
      marker.setAttribute("r", "0.48");
      svg.append(marker);
    });

    snapshot.worldActors.forEach((actor) => {
      const monster = snapshot.monsters.find((entry) => entry.id === actor.monsterId);
      if (!monster || monster.hp <= 0) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-monster");
      if (monster.isBoss) marker.classList.add("is-boss");
      marker.dataset.monsterId = String(monster.id);
      marker.setAttribute("x", String(actor.x + 0.12));
      marker.setAttribute("y", String(actor.y + 0.12));
      marker.setAttribute("width", "0.76");
      marker.setAttribute("height", "0.76");
      marker.setAttribute(
        "visibility",
        currentSight.has(`${actor.x}:${actor.y}`) ? "visible" : "hidden",
      );
      svg.append(marker);
    });

    snapshot.groundItems.forEach((item) => {
      if (!discovered.has(`${item.x}:${item.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-item", `is-${item.kind}`);
      marker.setAttribute("x", String(item.x + 0.22));
      marker.setAttribute("y", String(item.y + 0.22));
      marker.setAttribute("width", "0.56");
      marker.setAttribute("height", "0.56");
      marker.setAttribute("transform", `rotate(45 ${item.x + 0.5} ${item.y + 0.5})`);
      svg.append(marker);
    });
    snapshot.guidedMap.shortcuts
      .filter((shortcut) => !snapshot.keyItems.includes(shortcut.keyId))
      .forEach((shortcut) => {
        if (!discovered.has(`${shortcut.keyPosition.x}:${shortcut.keyPosition.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "rect");
        marker.classList.add("minimap-item", "is-key");
        marker.setAttribute("x", String(shortcut.keyPosition.x + 0.22));
        marker.setAttribute("y", String(shortcut.keyPosition.y + 0.22));
        marker.setAttribute("width", "0.56");
        marker.setAttribute("height", "0.56");
        marker.setAttribute(
          "transform",
          `rotate(45 ${shortcut.keyPosition.x + 0.5} ${shortcut.keyPosition.y + 0.5})`,
        );
        svg.append(marker);
      });
    snapshot.guidedMap.deadEndCaches
      .filter((cache) => !snapshot.openedGateIds.includes(cache.id))
      .forEach((cache) => {
        if (!discovered.has(`${cache.x}:${cache.y}`)) return;
        const marker = document.createElementNS(SVG_NS, "rect");
        marker.classList.add("minimap-item", "is-guided-cache");
        marker.setAttribute("x", String(cache.x + 0.18));
        marker.setAttribute("y", String(cache.y + 0.22));
        marker.setAttribute("width", "0.64");
        marker.setAttribute("height", "0.56");
        svg.append(marker);
      });
    snapshot.lootBundles.forEach((bundle) => {
      if (!discovered.has(`${bundle.x}:${bundle.y}`)) return;
      const marker = document.createElementNS(SVG_NS, "rect");
      marker.classList.add("minimap-item", "is-loot-bundle");
      marker.setAttribute("x", String(bundle.x + 0.15));
      marker.setAttribute("y", String(bundle.y + 0.2));
      marker.setAttribute("width", "0.7");
      marker.setAttribute("height", "0.6");
      svg.append(marker);
    });

    const player = document.createElementNS(SVG_NS, "circle");
    player.classList.add("minimap-player");
    player.setAttribute("cx", String(snapshot.player.x + 0.5));
    player.setAttribute("cy", String(snapshot.player.y + 0.5));
    player.setAttribute("r", "0.62");
    svg.append(player);
    root.append(svg);
  }

  /** 返回当前视野，供巡逻动画只更新已存在的怪物标记。 */
  currentSight(snapshot: GameSnapshot): Set<string> {
    return snapshot.adminMode
      ? new Set(snapshot.discoveredCells)
      : floorCurrentSightCellKeys(
          snapshot.floor,
          snapshot.mazeFloor,
          snapshot.campfires,
          snapshot.player,
        );
  }

  private requiredElement<T extends HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`缺少小地图节点：${selector}`);
    return element;
  }
}
