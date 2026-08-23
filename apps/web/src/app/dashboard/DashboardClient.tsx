"use client";

import { useCallback, useEffect, useState } from "react";

type Project = {
  id: string;
  name: string;
  created_at: string;
};

type ApiKey = {
  id: string;
  project_id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type RevealedKey = {
  projectId: string;
  name: string;
  key: string;
};

export default function DashboardClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newProjectName, setNewProjectName] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);

  const [newKeyProjectId, setNewKeyProjectId] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);

  const [revealedKey, setRevealedKey] = useState<RevealedKey | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [projectsRes, keysRes] = await Promise.all([
        fetch("/dashboard/api/projects", { cache: "no-store" }),
        fetch("/dashboard/api/keys", { cache: "no-store" }),
      ]);
      if (!projectsRes.ok) throw new Error("Failed to load projects");
      if (!keysRes.ok) throw new Error("Failed to load keys");
      const projectsData = (await projectsRes.json()) as Project[];
      const keysData = (await keysRes.json()) as ApiKey[];
      setError(null);
      setProjects(projectsData);
      setKeys(keysData);
      if (!newKeyProjectId && projectsData.length > 0) {
        setNewKeyProjectId(projectsData[0].id);
      }
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time data fetch on mount
    void load();
  }, [load]);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setCreatingProject(true);
    setError(null);
    try {
      const res = await fetch("/dashboard/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProjectName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create project");
      setNewProjectName("");
      await load();
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    } finally {
      setCreatingProject(false);
    }
  };

  const createKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyProjectId || !newKeyName.trim()) return;
    setCreatingKey(true);
    setError(null);
    try {
      const res = await fetch("/dashboard/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: newKeyProjectId, name: newKeyName.trim() }),
      });
      if (!res.ok) throw new Error("Failed to create key");
      const data = (await res.json()) as { key: string };
      setRevealedKey({ projectId: newKeyProjectId, name: newKeyName.trim(), key: data.key });
      setCopied(false);
      setNewKeyName("");
      await load();
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    } finally {
      setCreatingKey(false);
    }
  };

  const revokeKey = async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/dashboard/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke key");
      await load();
    } catch (err) {
      setError((err as Error).message || "Something went wrong");
    }
  };

  const copyRevealedKey = async () => {
    if (!revealedKey) return;
    try {
      await navigator.clipboard.writeText(revealedKey.key);
      setCopied(true);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-muted">
          Manage projects and API keys.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {revealedKey && (
        <div className="rounded-2xl border border-accent/40 bg-panel px-5 py-4">
          <p className="text-sm font-medium text-accent">
            New key created — copy it now, it won&apos;t be shown again.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <code className="flex-1 break-all rounded-lg border border-border bg-background px-3 py-2 text-sm">
              {revealedKey.key}
            </code>
            <button
              type="button"
              onClick={copyRevealedKey}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              type="button"
              onClick={() => setRevealedKey(null)}
              className="rounded-xl border border-border bg-panel px-4 py-2 text-sm font-medium hover:border-accent/50"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <section className="rounded-2xl border border-border bg-panel/60 p-5">
        <h2 className="text-lg font-medium">New project</h2>
        <form onSubmit={createProject} className="mt-3 flex flex-wrap gap-3">
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="Project name"
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
          <button
            type="submit"
            disabled={creatingProject || !newProjectName.trim()}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingProject ? "Creating…" : "Create project"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-panel/60 p-5">
        <h2 className="text-lg font-medium">New API key</h2>
        <form onSubmit={createKey} className="mt-3 flex flex-wrap gap-3">
          <select
            value={newKeyProjectId}
            onChange={(e) => setNewKeyProjectId(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent/60"
          >
            {projects.length === 0 && <option value="">No projects yet</option>}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder="Key name"
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent/60"
          />
          <button
            type="submit"
            disabled={creatingKey || !newKeyProjectId || !newKeyName.trim()}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-zinc-950 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {creatingKey ? "Creating…" : "Create key"}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-medium">Projects</h2>
        {loading ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-muted">No projects yet.</p>
        ) : (
          projects.map((project) => {
            const projectKeys = keys.filter((k) => k.project_id === project.id);
            return (
              <div
                key={project.id}
                className="rounded-2xl border border-border bg-panel/60 p-5"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-medium">{project.name}</h3>
                  <span className="text-xs text-muted">
                    created {new Date(project.created_at).toLocaleDateString()}
                  </span>
                </div>
                {projectKeys.length === 0 ? (
                  <p className="mt-3 text-sm text-muted">No keys yet.</p>
                ) : (
                  <ul className="mt-3 flex flex-col gap-2">
                    {projectKeys.map((key) => (
                      <li
                        key={key.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{key.name}</span>
                          <span className="text-xs text-muted">
                            {key.key_prefix}… ·{" "}
                            {key.revoked_at
                              ? `revoked ${new Date(key.revoked_at).toLocaleDateString()}`
                              : key.last_used_at
                                ? `last used ${new Date(key.last_used_at).toLocaleDateString()}`
                                : "never used"}
                          </span>
                        </div>
                        {key.revoked_at ? (
                          <span className="text-xs text-danger">Revoked</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void revokeKey(key.id)}
                            className="rounded-lg border border-danger/40 px-3 py-1 text-xs font-medium text-danger hover:bg-danger/10"
                          >
                            Revoke
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}
