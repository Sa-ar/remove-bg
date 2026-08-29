import { redirect } from "next/navigation";
import { neon } from "@neondatabase/serverless";
import { auth } from "@/lib/auth/server";
import { buildUsageQuery } from "@/lib/usageQuery";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function UsagePage() {
  let userId: string | undefined;
  try {
    const { data: session } = await auth.getSession();
    userId = session?.user?.id;
  } catch {
    userId = undefined;
  }
  if (!userId) redirect("/auth/sign-in");
  const { text, params } = buildUsageQuery({
    days: 30,
    ownerId: userId,
  });
  const client = neon(process.env.DATABASE_URL!);
  const rows = (await client.query(text, params)) as {
    day: string;
    requests: number;
  }[];
  const max = Math.max(1, ...rows.map((r) => r.requests));
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-medium">Usage (30 days)</h1>
      <p className="mt-1 text-sm text-muted">
        <Link href="/dashboard" className="text-accent underline">
          ← Keys
        </Link>
      </p>
      <div className="mt-6 space-y-1">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No usage yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.day} className="flex items-center gap-2 text-sm">
              <span className="w-24 text-muted">{String(r.day).slice(0, 10)}</span>
              <span
                className="h-4 rounded bg-foreground"
                style={{ width: `${(r.requests / max) * 100}%` }}
              />
              <span>{r.requests}</span>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
