import { afterEach, describe, expect, it, vi } from "vitest";
import { PresenceClient, type PresenceState } from "../src/infrastructure/presence/PresenceClient";

class FakeEventSource {
  readonly listeners = new Map<string, Array<(event: Event) => void>>();
  readonly close = vi.fn();

  addEventListener(type: string, listener: (event: Event) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string, event: Event): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

describe("PresenceClient", () => {
  afterEach(() => vi.useRealTimers());

  it("连接成功后发布可信人数并在断线时隐藏旧数字", () => {
    const source = new FakeEventSource();
    const states: PresenceState[] = [];
    const client = new PresenceClient("api/presence", () => source);

    client.subscribe((state) => states.push(state));
    source.emit("presence", { data: '{"count":12}' } as MessageEvent<string>);
    source.emit("error", new Event("error"));

    expect(states).toEqual([
      { status: "connecting", count: null },
      { status: "online", count: 12 },
      { status: "unavailable", count: null },
    ]);
    client.destroy();
  });

  it("忽略畸形或负数事件，销毁时关闭连接", () => {
    const source = new FakeEventSource();
    const states: PresenceState[] = [];
    const client = new PresenceClient("api/presence", () => source);

    client.subscribe((state) => states.push(state));
    source.emit("presence", { data: "not-json" } as MessageEvent<string>);
    source.emit("presence", { data: '{"count":-1}' } as MessageEvent<string>);
    client.destroy();

    expect(states).toEqual([{ status: "connecting", count: null }]);
    expect(source.close).toHaveBeenCalledOnce();
  });

  it("首次连接失败后主动重试并恢复在线人数", async () => {
    vi.useFakeTimers();
    const first = new FakeEventSource();
    const second = new FakeEventSource();
    const factory = vi.fn()
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second);
    const states: PresenceState[] = [];
    const client = new PresenceClient("api/presence", factory);

    client.subscribe((state) => states.push(state));
    first.emit("error", new Event("error"));
    await vi.advanceTimersByTimeAsync(3_000);
    second.emit("presence", { data: '{"count":4}' } as MessageEvent<string>);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({ status: "online", count: 4 });
    client.destroy();
  });
});
