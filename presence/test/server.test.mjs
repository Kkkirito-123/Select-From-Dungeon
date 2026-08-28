import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import { PresenceHub, createPresenceServer } from "../server.mjs";

function eventCount(event) {
  const match = event.match(/data: (.+)\n\n$/);
  if (!match) throw new Error(`Invalid presence event: ${event}`);
  return JSON.parse(match[1]).count;
}

async function waitFor(check, timeoutMs = 500) {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for presence state.");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test("PresenceHub broadcasts connect and disconnect counts", () => {
  const firstEvents = [];
  const secondEvents = [];
  const disconnectFirst = new PresenceHub();

  const stopFirst = disconnectFirst.connect((event) => firstEvents.push(event));
  const stopSecond = disconnectFirst.connect((event) => secondEvents.push(event));

  assert.deepEqual(firstEvents.map(eventCount), [1, 2]);
  assert.deepEqual(secondEvents.map(eventCount), [2]);

  stopFirst();
  stopFirst();
  assert.deepEqual(firstEvents.map(eventCount), [1, 2]);
  assert.deepEqual(secondEvents.map(eventCount), [2, 1]);

  stopSecond();
  assert.equal(disconnectFirst.size, 0);
});

test("PresenceHub sends SSE heartbeats without changing the count", () => {
  const events = [];
  const hub = new PresenceHub();
  const disconnect = hub.connect((event) => events.push(event));

  hub.heartbeat();

  assert.equal(events.at(-1), ": keep-alive\n\n");
  assert.equal(hub.size, 1);
  disconnect();
});

test("presence endpoint stays counted until the event stream closes", async (context) => {
  const { server, hub } = createPresenceServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  context.after(() => {
    server.close();
    server.closeAllConnections();
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address.");
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${address.port}/presence`, {
    signal: controller.signal,
  });

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/event-stream/);
  assert.equal(response.headers.get("x-accel-buffering"), "no");

  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing event stream body.");
  const firstChunk = await reader.read();
  assert.equal(eventCount(new TextDecoder().decode(firstChunk.value)), 1);
  assert.equal(hub.size, 1);
  controller.abort();
  await waitFor(() => hub.size === 0);
  assert.equal(hub.size, 0);
});
