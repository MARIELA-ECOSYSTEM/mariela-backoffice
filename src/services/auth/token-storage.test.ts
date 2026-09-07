import { beforeEach, describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_STORAGE_KEY,
  createMemoryTokenStorage,
  createWebTokenStorage,
  REFRESH_TOKEN_STORAGE_KEY,
} from "./token-storage";

describe("createMemoryTokenStorage", () => {
  it("salva e recupera o access token", () => {
    const storage = createMemoryTokenStorage();
    expect(storage.getAccessToken()).toBeNull();
    storage.setAccessToken("access-123");
    expect(storage.getAccessToken()).toBe("access-123");
  });

  it("salva e recupera o refresh token de forma independente do access token", () => {
    const storage = createMemoryTokenStorage();
    storage.setAccessToken("access-123");
    storage.setRefreshToken("refresh-456");
    expect(storage.getAccessToken()).toBe("access-123");
    expect(storage.getRefreshToken()).toBe("refresh-456");
  });

  it("clear() limpa os dois tokens de uma vez", () => {
    const storage = createMemoryTokenStorage();
    storage.setAccessToken("access-123");
    storage.setRefreshToken("refresh-456");
    storage.clear();
    expect(storage.getAccessToken()).toBeNull();
    expect(storage.getRefreshToken()).toBeNull();
  });
});

describe("createWebTokenStorage (localStorage via happy-dom)", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persiste os tokens em chaves distintas do localStorage", () => {
    const storage = createWebTokenStorage();
    storage.setAccessToken("access-abc");
    storage.setRefreshToken("refresh-xyz");

    expect(window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBe("access-abc");
    expect(window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBe("refresh-xyz");
  });

  it("recupera os valores salvos", () => {
    const storage = createWebTokenStorage();
    storage.setAccessToken("access-abc");
    storage.setRefreshToken("refresh-xyz");

    const outraInstancia = createWebTokenStorage();
    expect(outraInstancia.getAccessToken()).toBe("access-abc");
    expect(outraInstancia.getRefreshToken()).toBe("refresh-xyz");
  });

  it("clear() remove os dois do localStorage", () => {
    const storage = createWebTokenStorage();
    storage.setAccessToken("access-abc");
    storage.setRefreshToken("refresh-xyz");
    storage.clear();

    expect(window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)).toBeNull();
    expect(window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY)).toBeNull();
  });
});
