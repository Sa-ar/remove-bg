import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { buildUsageQuery } from "@/lib/usageQuery";
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
  const { text, params } = buildUsageQuery({
    projectId,
    days,
    ownerId: session.userId,
  });
  const client = neon(process.env.DATABASE_URL!);
  const rows = await client.query(text, params);
  return NextResponse.json(rows);
}
