import { afterEach, describe, expect, it, vi } from "vitest";

describe("lazy sql wrapper", () => {
  const original = process.env.DATABASE_URL;

  afterEach(() => {
    vi.resetModules();
    if (original === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = original;
  });

  it("exposes query without requiring DATABASE_URL at import time", async () => {
    delete process.env.DATABASE_URL;
    vi.resetModules();
    const { sql } = await import("../db");
    expect(typeof sql.query).toBe("function");
    // getSql() throws before returning a Promise
    expect(() => {
      void sql.query("select 1", []);
    }).toThrow("DATABASE_URL is not set");
  });
});
