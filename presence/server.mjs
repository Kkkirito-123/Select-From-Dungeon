import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 8788;
const HEARTBEAT_INTERVAL_MS = 15_000;

function presenceEvent(count) {
  return `event: presence\ndata: ${JSON.stringify({ count })}\n\n`;
}

export class PresenceHub {
  #clients = new Map();
  #nextClientId = 0;

  get size() {
    return this.#clients.size;
  }

  connect(send) {
    this.#nextClientId += 1;
    const clientId = this.#nextClientId;
    this.#clients.set(clientId, send);
    this.broadcast();

    return () => {
      if (!this.#clients.delete(clientId)) return;
      this.broadcast();
    };
  }

  broadcast() {
    const event = presenceEvent(this.size);
    for (const send of this.#clients.values()) send(event);
  }

  heartbeat() {
    for (const send of this.#clients.values()) send(": keep-alive\n\n");
  }
}

export function createPresenceServer() {
  const hub = new PresenceHub();
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method !== "GET" || url.pathname !== "/presence") {
      response.writeHead(404, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();

    const disconnect = hub.connect((event) => response.write(event));
    response.once("close", disconnect);
  });

  const heartbeat = setInterval(() => hub.heartbeat(), HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();
  server.once("close", () => clearInterval(heartbeat));

  return { server, hub };
}

function parsePort(rawPort) {
  if (!rawPort) return DEFAULT_PORT;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PRESENCE_PORT must be an integer between 1 and 65535.");
  }
  return port;
}

export function startPresenceServer({
  host = process.env.PRESENCE_HOST?.trim() || DEFAULT_HOST,
  port = parsePort(process.env.PRESENCE_PORT),
} = {}) {
  const { server, hub } = createPresenceServer();
  server.listen(port, host, () => {
    console.log(`Presence service listening on http://${host}:${port}/presence`);
  });

  const shutdown = () => {
    server.close();
    server.closeAllConnections();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  return { server, hub };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) startPresenceServer();
