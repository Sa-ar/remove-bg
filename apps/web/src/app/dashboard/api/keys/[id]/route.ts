import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await sql`update api_keys set revoked_at = now() where id = ${id} and revoked_at is null`;
  return NextResponse.json({ ok: true });
}
