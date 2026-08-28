import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";
import { ensurePersonalProject } from "@/lib/projects";

export const runtime = "nodejs";

export async function GET() {
  const session = await requireUserId();
  if (session.error) return session.error;
  const rows = await ensurePersonalProject(session.userId);
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await requireUserId();
  if (session.error) return session.error;
  const { name } = await req.json();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const rows = await sql`
    insert into projects (name, owner_id)
    values (${name}, ${session.userId})
    returning id, name, created_at`;
  return NextResponse.json(rows[0], { status: 201 });
}
