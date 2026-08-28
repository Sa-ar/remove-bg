import { describe, it, expect } from "vitest";
import { isReservedProjectId, WEB_UI_PROJECT_ID } from "../access";

describe("isReservedProjectId", () => {
  it("blocks the seeded web-ui and legacy projects", () => {
    expect(isReservedProjectId(WEB_UI_PROJECT_ID)).toBe(true);
    expect(isReservedProjectId("00000000-0000-0000-0000-000000000002")).toBe(
      true,
    );
  });
  it("allows a normal project uuid", () => {
    expect(isReservedProjectId("11111111-1111-1111-1111-111111111111")).toBe(
      false,
    );
  });
});
