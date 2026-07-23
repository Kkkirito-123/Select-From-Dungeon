import { describe, expect, it } from "vitest";
import { GameSession } from "../src/domain/GameSession";

describe("GameSession guided shortcut flow", () => {
  it("必须先到中后段拾取保证钥匙，之后 E 开门并双向穿行", () => {
    const source = new GameSession(null, null, "guided-session-flow");
    const initial = source.snapshot();
    const shortcut = initial.guidedMap.shortcuts[0];
    const saved = source.toSavedRun();
    saved.completedLessons = [...shortcut.requires];
    saved.player = {
      ...saved.player,
      ...shortcut.keyPosition,
    };
    saved.discoveredCells = [
      ...new Set([
        ...saved.discoveredCells,
        `${shortcut.keyPosition.x}:${shortcut.keyPosition.y}`,
      ]),
    ];
    saved.currentRoomId = shortcut.keyRoomNodeId;
    saved.visitedRoomIds = [
      ...new Set([...saved.visitedRoomIds, shortcut.keyRoomNodeId]),
    ];

    const session = new GameSession(saved);
    const picked = session.interact();
    expect(picked).toMatchObject({ ok: true, kind: "shortcut" });
    expect(session.snapshot().keyItems).toContain(shortcut.keyId);

    expect(session.setPlayerPosition(shortcut.entry.x, shortcut.entry.y)).toBe(true);
    const opened = session.interact();
    expect(opened).toMatchObject({ ok: true, kind: "shortcut" });
    expect(session.snapshot().openedGateIds).toContain(shortcut.id);

    const traversed = session.interact();
    expect(traversed).toMatchObject({ ok: true, kind: "shortcut" });
    expect(session.snapshot().player).toMatchObject(shortcut.exit);

    const restored = new GameSession(session.toSavedRun());
    expect(restored.snapshot().openedGateIds).toContain(shortcut.id);
    expect(restored.interact()).toMatchObject({ ok: true, kind: "shortcut" });
    expect(restored.snapshot().player).toMatchObject(shortcut.entry);
  });

  it("没有钥匙时只给明确提示，不会打开或穿过捷径", () => {
    const source = new GameSession(null, null, "guided-session-locked");
    const shortcut = source.snapshot().guidedMap.shortcuts[0];
    expect(source.setPlayerPosition(shortcut.entry.x, shortcut.entry.y)).toBe(true);

    const result = source.interact();
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toContain("捷径钥匙");
    expect(source.snapshot().openedGateIds).not.toContain(shortcut.id);
    expect(source.snapshot().player).toMatchObject(shortcut.entry);
  });
});
