async function getUsage(days: number) {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const res = await fetch(`${base}/dashboard/api/usage?days=${days}`, { cache: "no-store" });
  return res.json() as Promise<{ day: string; requests: number }[]>;
}
export const dynamic = "force-dynamic";
export default async function UsagePage() {
  const rows = await getUsage(30);
  const max = Math.max(1, ...rows.map((r) => r.requests));
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-xl font-medium">Usage (30 days)</h1>
      <div className="mt-6 space-y-1">
        {rows.map((r) => (
          <div key={r.day} className="flex items-center gap-2 text-sm">
            <span className="w-24 text-muted">{r.day.slice(0, 10)}</span>
            <span className="h-4 rounded bg-foreground" style={{ width: `${(r.requests / max) * 100}%` }} />
            <span>{r.requests}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
