import { describe, it, expect } from "vitest";
import { buildUsageQuery } from "../usageQuery";

describe("buildUsageQuery", () => {
  it("filters by project when given", () => {
    const q = buildUsageQuery({ projectId: "p1", days: 30 });
    expect(q.text).toContain("date_trunc('day', created_at)");
    expect(q.text).toContain("project_id = $1");
    expect(q.params).toEqual(["p1", 30]);
  });
  it("omits project filter when absent", () => {
    const q = buildUsageQuery({ days: 7 });
    expect(q.text).not.toContain("project_id =");
    expect(q.params).toEqual([7]);
  });
});
