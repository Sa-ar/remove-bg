import Link from "next/link";

function apiUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(
    /\/$/,
    "",
  );
}

export default function DocsPage() {
  const base = apiUrl();
  const curl = `curl -X POST "${base}/v1/remove" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -F "file=@./photo.jpg" \\
  --max-time 120 \\
  -o removed.png`;

  const fetchExample = `const form = new FormData();
form.append("file", file); // File / Blob

const res = await fetch("${base}/v1/remove", {
  method: "POST",
  headers: { Authorization: "Bearer YOUR_API_KEY" },
  body: form,
  // Free tier cold start: allow at least 120s
  signal: AbortSignal.timeout(120_000),
});

if (!res.ok) {
  const err = await res.json();
  throw new Error(err.error + " — " + err.hint);
}

const png = await res.blob(); // image/png with alpha`;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="text-3xl font-semibold tracking-tight">API</h1>
      <p className="mt-2 text-muted">
        Same contract the UI uses. OpenAPI live docs:{" "}
        <a
          className="text-accent underline"
          href={`${base}/docs`}
          target="_blank"
          rel="noreferrer"
        >
          {base}/docs
        </a>
      </p>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-medium">Auth</h2>
        <p className="text-sm text-muted">
          Send <code className="text-foreground">Authorization: Bearer &lt;key&gt;</code>.
          Create project keys in the{" "}
          <Link href="/dashboard" className="text-accent underline">
            dashboard
          </Link>{" "}
          after signing in. Legacy env{" "}
          <code className="text-foreground">API_KEYS</code> still work.
          The signed-in website uses short-lived JWTs from{" "}
          <code className="text-foreground">POST /api/token</code> (session required).
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-medium">POST /v1/remove</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>
            multipart field <code className="text-foreground">file</code> —
            JPEG, PNG, WebP, or HEIC · max 15MB
          </li>
          <li>
            optional <code className="text-foreground">crop=true</code> — trim
            transparent bounds
          </li>
          <li>
            success: <code className="text-foreground">image/png</code> with
            alpha
          </li>
          <li>
            errors: JSON{" "}
            <code className="text-foreground">
              {"{ error, code, hint }"}
            </code>
          </li>
        </ul>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-medium">Restarts and first inference</h2>
        <p className="text-sm text-muted">
          The Oracle VM stays on. After a service restart the model loads into
          RAM; <code className="text-foreground">GET /v1/health</code> returns{" "}
          <code className="text-foreground">503</code> with{" "}
          <code className="text-foreground">code=waking</code> until ready.
          Set client timeouts to at least{" "}
          <strong className="text-foreground">120 seconds</strong>. Warm CPU
          inference is typically a few seconds (
          <code className="text-foreground">isnet-general-use</code>).
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-medium">curl</h2>
        <pre className="overflow-x-auto rounded-xl border border-border bg-panel p-4 text-sm">
          <code>{curl}</code>
        </pre>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-xl font-medium">fetch</h2>
        <pre className="overflow-x-auto rounded-xl border border-border bg-panel p-4 text-sm">
          <code>{fetchExample}</code>
        </pre>
      </section>

      <p className="mt-12 text-sm text-muted">
        <Link href="/" className="text-accent underline">
          ← Back to the tool
        </Link>
      </p>
    </div>
  );
}
