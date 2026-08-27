import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
export const runtime = "nodejs";
export async function GET() {
  const rows = await sql`select id, name, created_at from projects order by created_at`;
  return NextResponse.json(rows);
}
export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const rows = await sql`insert into projects (name) values (${name}) returning id, name, created_at`;
  return NextResponse.json(rows[0], { status: 201 });
}
