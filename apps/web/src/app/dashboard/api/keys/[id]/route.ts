import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireUserId } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireUserId();
  if (session.error) return session.error;

  const { id } = await params;
  const rows = await sql`
    update api_keys k
    set revoked_at = now()
    from projects p
    where k.id = ${id}
      and k.revoked_at is null
      and k.project_id = p.id
      and p.owner_id = ${session.userId}
    returning k.id`;
  if (!rows[0]) {
    return NextResponse.json(
      { error: "Key not found", code: "forbidden" },
      { status: 404 },
    );
  }
  return NextResponse.json({ ok: true });
}
