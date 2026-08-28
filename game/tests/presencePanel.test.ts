import { describe, expect, it, vi } from "vitest";
import { PresencePanel } from "../src/presentation/dom/panels/PresencePanel";

function fakeElement() {
  return {
    dataset: {} as Record<string, string>,
    textContent: "",
    setAttribute: vi.fn(),
  } as unknown as HTMLElement;
}

describe("PresencePanel", () => {
  it("只在收到可信人数后显示数字，断线时改为不可用", () => {
    const indicator = fakeElement();
    const count = fakeElement() as unknown as HTMLOutputElement;
    const label = fakeElement();
    const panel = new PresencePanel({
      presenceIndicator: indicator,
      presenceCount: count,
      presenceLabel: label,
    });

    panel.render({ status: "connecting", count: null });
    expect(count.textContent).toBe("—");
    panel.render({ status: "online", count: 8 });
    expect(count.textContent).toBe("8");
    expect(indicator.dataset.state).toBe("online");
    expect(indicator.setAttribute).toHaveBeenLastCalledWith("aria-label", "当前在线 8 人");

    panel.render({ status: "unavailable", count: null });
    expect(count.textContent).toBe("—");
    expect(label.textContent).toBe("在线人数暂不可用");
  });
});
