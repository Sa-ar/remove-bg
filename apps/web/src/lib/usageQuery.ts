import { sql } from "./db";

export type UsageRow = { day: string; requests: number };

export function buildUsageQuery(opts: {
  projectId?: string;
  days: number;
  ownerId: string;
}) {
  const select =
    "select date_trunc('day', u.created_at) as day, count(*)::int as requests " +
    "from usage_events u join projects p on p.id = u.project_id ";
  const tail = "group by day order by day";
  // JS numbers bind as int; `int || text` is not valid in Postgres.
  if (opts.projectId) {
    return {
      text:
        select +
        "where p.owner_id = $1 and u.project_id = $2 " +
        "and u.created_at > now() - ($3 * interval '1 day') " +
        tail,
      params: [opts.ownerId, opts.projectId, opts.days] as (string | number)[],
    };
  }
  return {
    text:
      select +
      "where p.owner_id = $1 " +
      "and u.created_at > now() - ($2 * interval '1 day') " +
      tail,
    params: [opts.ownerId, opts.days] as (string | number)[],
  };
}

export async function fetchUsage(opts: {
  projectId?: string;
  days: number;
  ownerId: string;
}): Promise<UsageRow[]> {
  const { text, params } = buildUsageQuery(opts);
  return (await sql.query(text, params)) as UsageRow[];
}
