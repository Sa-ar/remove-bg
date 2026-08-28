export function buildUsageQuery(opts: {
  projectId?: string;
  days: number;
  ownerId: string;
}) {
  const select =
    "select date_trunc('day', u.created_at) as day, count(*)::int as requests " +
    "from usage_events u join projects p on p.id = u.project_id ";
  const tail = "group by day order by day";
  if (opts.projectId) {
    return {
      text:
        select +
        "where p.owner_id = $1 and u.project_id = $2 " +
        "and u.created_at > now() - ($3 || ' days')::interval " +
        tail,
      params: [opts.ownerId, opts.projectId, opts.days] as (string | number)[],
    };
  }
  return {
    text:
      select +
      "where p.owner_id = $1 " +
      "and u.created_at > now() - ($2 || ' days')::interval " +
      tail,
    params: [opts.ownerId, opts.days] as (string | number)[],
  };
}
