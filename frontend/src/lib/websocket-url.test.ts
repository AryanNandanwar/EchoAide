/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import { resolveWebSocketUrl } from "./websocket-url.ts";

test("resolveWebSocketUrl prefers explicit configured URL", () => {
  assert.equal(
    resolveWebSocketUrl({
      configuredUrl: " wss://stream.example.com ",
      isDev: true,
      apiBaseUrl: "http://localhost:3000",
      windowOrigin: "https://app.example.com",
    }),
    "wss://stream.example.com",
  );
});

test("resolveWebSocketUrl uses API base in dev when no websocket URL is set", () => {
  assert.equal(
    resolveWebSocketUrl({
      isDev: true,
      apiBaseUrl: "http://localhost:3000",
    }),
    "http://localhost:3000",
  );
});

test("resolveWebSocketUrl uses same-origin in dev when API base is unset", () => {
  assert.equal(
    resolveWebSocketUrl({
      isDev: true,
      windowOrigin: "http://127.0.0.1:5173",
    }),
    "http://127.0.0.1:5173",
  );
});

test("resolveWebSocketUrl falls back to localhost in dev without API base or window", () => {
  assert.equal(resolveWebSocketUrl({ isDev: true }), "http://localhost:3000");
});

test("resolveWebSocketUrl uses same-origin in production", () => {
  assert.equal(
    resolveWebSocketUrl({
      isDev: false,
      windowOrigin: "https://app.echoaide.in",
    }),
    "https://app.echoaide.in",
  );
});

test("resolveWebSocketUrl falls back to localhost outside the browser", () => {
  assert.equal(resolveWebSocketUrl({ isDev: false }), "http://localhost:3000");
});
