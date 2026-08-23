import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { generateKey, hashKey } from "@/lib/keys";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const rows = projectId
    ? await sql`
        select id, project_id, name, key_prefix, created_at, last_used_at, revoked_at
        from api_keys
        where project_id = ${projectId}
        order by created_at`
    : await sql`
        select id, project_id, name, key_prefix, created_at, last_used_at, revoked_at
        from api_keys
        order by created_at`;
  return NextResponse.json(rows);
}
export async function POST(req: Request) {
  const { projectId, name } = await req.json();
  if (!projectId || !name)
    return NextResponse.json({ error: "projectId and name required" }, { status: 400 });
  const raw = generateKey();
  const prefix = raw.slice(0, 12);
  const hash = await hashKey(raw);
  const rows = await sql`
    insert into api_keys (project_id, name, key_prefix, key_hash)
    values (${projectId}, ${name}, ${prefix}, ${hash})
    returning id, key_prefix, created_at`;
  return NextResponse.json({ ...rows[0], key: raw }, { status: 201 }); // plaintext once
}
