export type PresenceState =
  | { status: "connecting"; count: null }
  | { status: "online"; count: number }
  | { status: "unavailable"; count: null };

type PresenceListener = (state: PresenceState) => void;
type PresenceEventListener = (event: Event | MessageEvent<string>) => void;
interface PresenceEventSource {
  addEventListener(type: "presence" | "error", listener: PresenceEventListener): void;
  close(): void;
}
type EventSourceFactory = (endpoint: string) => PresenceEventSource;
const RETRY_DELAY_MS = 3_000;

function validCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export class PresenceClient {
  private readonly listeners = new Set<PresenceListener>();
  private source: PresenceEventSource | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private state: PresenceState = { status: "connecting", count: null };

  constructor(
    private readonly endpoint: string,
    private readonly createEventSource: EventSourceFactory = (url) => {
      const source = new EventSource(url);
      return {
        addEventListener: (type, listener) => source.addEventListener(
          type,
          listener as EventListener,
        ),
        close: () => source.close(),
      };
    },
  ) {}

  subscribe(listener: PresenceListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    if (!this.source && this.retryTimer === null) this.connect();
    return () => this.listeners.delete(listener);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.source?.close();
    this.source = null;
    this.listeners.clear();
  }

  private connect(): void {
    try {
      const source = this.createEventSource(this.endpoint);
      this.source = source;
      source.addEventListener("presence", (event) => {
        if (this.source !== source) return;
        const message = event as MessageEvent<string>;
        try {
          const payload: unknown = JSON.parse(message.data);
          if (!payload || typeof payload !== "object" || !("count" in payload)) return;
          const count = (payload as { count: unknown }).count;
          if (validCount(count)) this.setState({ status: "online", count });
        } catch {
          // Ignore malformed events and retain the last trustworthy state.
        }
      });
      source.addEventListener("error", () => {
        if (this.source !== source) return;
        source.close();
        this.source = null;
        this.setState({ status: "unavailable", count: null });
        this.scheduleRetry();
      });
    } catch {
      this.setState({ status: "unavailable", count: null });
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (this.destroyed || this.retryTimer !== null) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, RETRY_DELAY_MS);
  }

  private setState(state: PresenceState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
