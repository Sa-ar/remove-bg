import { NextResponse } from "next/server";
import { fetchUsage } from "@/lib/usageQuery";
import { requireUserId } from "@/lib/auth/session";
import { userOwnsProject } from "@/lib/projects";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireUserId();
  if (session.error) return session.error;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const days = Number(url.searchParams.get("days") ?? "30");
  if (projectId && !(await userOwnsProject(session.userId, projectId))) {
    return NextResponse.json(
      { error: "Project not found", code: "forbidden" },
      { status: 404 },
    );
  }
  const rows = await fetchUsage({
    projectId,
    days,
    ownerId: session.userId,
  });
  return NextResponse.json(rows);
}
