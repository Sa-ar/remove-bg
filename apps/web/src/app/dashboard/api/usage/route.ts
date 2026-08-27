import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { buildUsageQuery } from "@/lib/usageQuery";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const days = Number(url.searchParams.get("days") ?? "30");
  const { text, params } = buildUsageQuery({ projectId, days });
  const client = neon(process.env.DATABASE_URL!);
  const rows = await client.query(text, params);
  return NextResponse.json(rows);
}
