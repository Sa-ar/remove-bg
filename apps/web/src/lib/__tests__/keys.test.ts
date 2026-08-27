import { describe, it, expect } from "vitest";
import { generateKey, hashKey } from "../keys";

describe("keys", () => {
  it("generateKey has rmbg_ prefix and entropy", () => {
    const k = generateKey();
    expect(k.startsWith("rmbg_")).toBe(true);
    expect(k.length).toBeGreaterThan(24);
  });
  it("hashKey matches Python's hashlib sha-256 for the same input", async () => {
    // python: hashlib.sha256(b"rmbg_abc").hexdigest()
    expect(await hashKey("rmbg_abc")).toBe(
      "f9aba3f56e4168d7aaf2d293d297a6e378a076de0ce7108de343054ccd0e8b60");
  });
});
