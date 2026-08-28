import { sql } from "@/lib/db";
import { isReservedProjectId } from "@/lib/access";

export type ProjectRow = {
  id: string;
  name: string;
  created_at: string;
};

export async function listOwnedProjects(userId: string): Promise<ProjectRow[]> {
  const rows = await sql`
    select id, name, created_at
    from projects
    where owner_id = ${userId}
    order by created_at
  `;
  return rows as unknown as ProjectRow[];
}

/** Create a personal project the first time a user opens the dashboard. */
export async function ensurePersonalProject(
  userId: string,
): Promise<ProjectRow[]> {
  const existing = await listOwnedProjects(userId);
  if (existing.length > 0) return existing;
  const created = await sql`
    insert into projects (name, owner_id)
    values ('My project', ${userId})
    returning id, name, created_at
  `;
  return created as unknown as ProjectRow[];
}

export async function userOwnsProject(
  userId: string,
  projectId: string,
): Promise<boolean> {
  if (isReservedProjectId(projectId)) return false;
  const rows = await sql`
    select 1 from projects
    where id = ${projectId} and owner_id = ${userId}
    limit 1
  `;
  return rows.length > 0;
}
