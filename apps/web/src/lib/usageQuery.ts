export function buildUsageQuery(opts: { projectId?: string; days: number }) {
  const select =
    "select date_trunc('day', created_at) as day, count(*)::int as requests " +
    "from usage_events ";
  const tail = "group by day order by day";
  if (opts.projectId) {
    return {
      text:
        select +
        "where project_id = $1 " +
        "and created_at > now() - ($2 || ' days')::interval " +
        tail,
      params: [opts.projectId, opts.days] as (string | number)[],
    };
  }
  return {
    text:
      select +
      "where created_at > now() - ($1 || ' days')::interval " +
      tail,
    params: [opts.days] as (string | number)[],
  };
}
