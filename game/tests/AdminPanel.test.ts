import { describe, expect, it, vi } from "vitest";
import type { GameSnapshot } from "../src/contracts/game/snapshots";
import { AdminPanel } from "../src/presentation/dom/panels/AdminPanel";

function fakeElement(children: Map<string, HTMLElement> = new Map()): HTMLElement {
  const classes = new Set<string>();
  return {
    hidden: true,
    inert: true,
    textContent: "",
    classList: {
      add: (...tokens: string[]) => tokens.forEach((token) => classes.add(token)),
      remove: (...tokens: string[]) => tokens.forEach((token) => classes.delete(token)),
      contains: (token: string) => classes.has(token),
      toggle: (token: string, force?: boolean) => {
        const enabled = force ?? !classes.has(token);
        if (enabled) classes.add(token);
        else classes.delete(token);
        return enabled;
      },
    },
    querySelector: <T extends Element>(selector: string): T | null => (
      children.get(selector) as T | undefined ?? null
    ),
    addEventListener: vi.fn(),
    setAttribute: vi.fn(),
    focus: vi.fn(),
  } as unknown as HTMLElement;
}

function invokeClick(element: HTMLElement): void {
  const call = vi.mocked(element.addEventListener).mock.calls.find(([type]) => type === "click");
  const listener = call?.[1];
  if (typeof listener === "function") listener({} as Event);
}

describe("AdminPanel", () => {
  it("独立管理命令绑定、开关焦点和楼层摘要", () => {
    const closeButton = fakeElement() as HTMLButtonElement;
    const nextButton = fakeElement() as HTMLButtonElement;
    const summary = fakeElement();
    const openButton = fakeElement() as HTMLButtonElement;
    const menu = fakeElement(new Map([
      ["#close-admin", closeButton],
      ["#admin-next-floor", nextButton],
      ["#admin-summary", summary],
    ]));
    const root = fakeElement(new Map([["#open-admin", openButton]]));
    const actions = { open: vi.fn(), close: vi.fn(), nextFloor: vi.fn() };
    const panel = new AdminPanel(root, menu, actions);

    panel.bind({});
    invokeClick(openButton);
    invokeClick(closeButton);
    invokeClick(nextButton);
    expect(actions.open).toHaveBeenCalledOnce();
    expect(actions.close).toHaveBeenCalledOnce();
    expect(actions.nextFloor).toHaveBeenCalledOnce();

    panel.renderToggle(true);
    panel.open({
      floor: 7,
      mazeFloor: { width: 24, height: 17 },
      monsters: [
        { hp: 4, isBoss: false },
        { hp: 0, isBoss: true },
        { hp: 9, isBoss: true },
      ],
    } as unknown as GameSnapshot);

    expect(openButton.textContent).toBe("⌘ 管理员 · ON");
    expect(openButton.classList.contains("is-active")).toBe(true);
    expect(summary.textContent).toBe("FLOOR 7 · 24×17 · 存活怪物 2 · 首领 1");
    expect(nextButton.textContent).toBe("进入第 8 层初始位置");
    expect(nextButton.disabled).toBe(false);
    expect(panel.isOpen()).toBe(true);
    expect(closeButton.focus).toHaveBeenCalledWith({ preventScroll: true });

    panel.close();
    expect(panel.isOpen()).toBe(false);
    expect(menu.hidden).toBe(true);
    expect(openButton.focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("第八层禁用继续前进", () => {
    const nextButton = fakeElement() as HTMLButtonElement;
    const menu = fakeElement(new Map([
      ["#close-admin", fakeElement()],
      ["#admin-next-floor", nextButton],
      ["#admin-summary", fakeElement()],
    ]));
    const panel = new AdminPanel(
      fakeElement(new Map([["#open-admin", fakeElement()]])),
      menu,
      { open: vi.fn(), close: vi.fn(), nextFloor: vi.fn() },
    );

    panel.render({
      floor: 8,
      mazeFloor: { width: 30, height: 20 },
      monsters: [],
    } as unknown as GameSnapshot);

    expect(nextButton.disabled).toBe(true);
    expect(nextButton.textContent).toBe("已在第八层");
  });
});
