import { describe, it, expect } from "vitest";
import { buildUsageQuery } from "../usageQuery";

describe("buildUsageQuery", () => {
  it("scopes to the owner and a project when given", () => {
    const q = buildUsageQuery({
      ownerId: "user-1",
      projectId: "p1",
      days: 30,
    });
    expect(q.text).toContain("date_trunc('day', u.created_at)");
    expect(q.text).toContain("p.owner_id = $1");
    expect(q.text).toContain("u.project_id = $2");
    expect(q.params).toEqual(["user-1", "p1", 30]);
  });
  it("scopes to the owner when no project is given", () => {
    const q = buildUsageQuery({ ownerId: "user-1", days: 7 });
    expect(q.text).toContain("p.owner_id = $1");
    expect(q.text).not.toContain("u.project_id =");
    expect(q.params).toEqual(["user-1", 7]);
  });
});
