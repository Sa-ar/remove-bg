import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateKey, hashKey } from "@/lib/keys";
import { requireUserId } from "@/lib/auth/session";
import { isReservedProjectId } from "@/lib/access";
import { userOwnsProject } from "@/lib/projects";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const session = await requireUserId();
  if (session.error) return session.error;

  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  if (projectId) {
    if (!(await userOwnsProject(session.userId, projectId))) {
      return NextResponse.json(
        { error: "Project not found", code: "forbidden" },
        { status: 404 },
      );
    }
    const rows = await sql`
      select id, project_id, name, key_prefix, created_at, last_used_at, revoked_at
      from api_keys
      where project_id = ${projectId}
      order by created_at`;
    return NextResponse.json(rows);
  }

  const rows = await sql`
    select k.id, k.project_id, k.name, k.key_prefix, k.created_at, k.last_used_at, k.revoked_at
    from api_keys k
    join projects p on p.id = k.project_id
    where p.owner_id = ${session.userId}
    order by k.created_at`;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await requireUserId();
  if (session.error) return session.error;

  const { projectId, name } = await req.json();
  if (!projectId || !name) {
    return NextResponse.json(
      { error: "projectId and name required" },
      { status: 400 },
    );
  }
  if (isReservedProjectId(projectId) || !(await userOwnsProject(session.userId, projectId))) {
    return NextResponse.json(
      { error: "Cannot create a key for that project", code: "forbidden" },
      { status: 403 },
    );
  }
  const raw = generateKey();
  const prefix = raw.slice(0, 12);
  const hash = await hashKey(raw);
  const rows = await sql`
    insert into api_keys (project_id, name, key_prefix, key_hash)
    values (${projectId}, ${name}, ${prefix}, ${hash})
    returning id, key_prefix, created_at`;
  return NextResponse.json({ ...rows[0], key: raw }, { status: 201 });
}
