/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";
import {
  clearAuth,
  getStoredRefreshToken,
  getStoredToken,
  getStoredUser,
  hasValidSession,
  isTokenExpired,
  saveAuthSession,
} from "./auth.ts";

class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

function makeJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `${header}.${payload}.signature`;
}

function installBrowserGlobals(): void {
  const local = new MemoryStorage();
  const session = new MemoryStorage();

  (globalThis as typeof globalThis & { localStorage: Storage }).localStorage = local;
  (globalThis as typeof globalThis & { sessionStorage: Storage }).sessionStorage = session;
  (globalThis as typeof globalThis & { atob: (value: string) => string }).atob = (value) =>
    Buffer.from(value, "base64").toString("binary");
}

test("saveAuthSession stores tokens in localStorage when remember is true", () => {
  installBrowserGlobals();
  clearAuth();

  saveAuthSession({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    user: { id: "doctor-1", role: "doctor" },
    remember: true,
  });

  assert.equal(getStoredToken(), "access-token");
  assert.equal(getStoredRefreshToken(), "refresh-token");
  assert.deepEqual(getStoredUser(), { id: "doctor-1", role: "doctor" });
  assert.equal(sessionStorage.getItem("ds_token"), null);
});

test("saveAuthSession stores tokens in sessionStorage when remember is false", () => {
  installBrowserGlobals();
  clearAuth();

  saveAuthSession({
    accessToken: "access-token",
    refreshToken: "refresh-token",
    user: { id: "doctor-1", role: "doctor" },
    remember: false,
  });

  assert.equal(sessionStorage.getItem("ds_token"), "access-token");
  assert.equal(localStorage.getItem("ds_token"), null);
});

test("isTokenExpired detects expired JWTs", () => {
  installBrowserGlobals();

  const expired = makeJwt(Math.floor(Date.now() / 1000) - 60);
  const valid = makeJwt(Math.floor(Date.now() / 1000) + 3600);

  assert.equal(isTokenExpired(expired), true);
  assert.equal(isTokenExpired(valid), false);
  assert.equal(isTokenExpired("not-a-jwt"), true);
});

test("hasValidSession enforces optional role checks", () => {
  installBrowserGlobals();
  clearAuth();

  saveAuthSession({
    accessToken: makeJwt(Math.floor(Date.now() / 1000) + 3600),
    refreshToken: "refresh-token",
    user: { id: "doctor-1", role: "doctor" },
    remember: true,
  });

  assert.equal(hasValidSession(), true);
  assert.equal(hasValidSession("doctor"), true);
  assert.equal(hasValidSession("receptionist"), false);
});

test("clearAuth removes tokens from both storages", () => {
  installBrowserGlobals();

  localStorage.setItem("ds_token", "local");
  sessionStorage.setItem("ds_token", "session");
  clearAuth();

  assert.equal(getStoredToken(), null);
  assert.equal(getStoredRefreshToken(), null);
  assert.equal(getStoredUser(), null);
});
