"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type WorkerStatus = "unknown" | "waking" | "ready" | "down";
type UiPhase =
  | "empty"
  | "uploading"
  | "waking"
  | "processing"
  | "done"
  | "error";

const MAX_BYTES = 15 * 1024 * 1024;
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];

function apiBase(): string {
  return (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(
    /\/$/,
    "",
  );
}

async function waitForWorker(
  signal: AbortSignal,
  onWaking: () => void,
): Promise<boolean> {
  const base = apiBase();
  const started = Date.now();
  let announced = false;
  while (Date.now() - started < 120_000) {
    if (signal.aborted) return false;
    try {
      const res = await fetch(`${base}/v1/health`, {
        signal,
        cache: "no-store",
      });
      if (res.ok) return true;
      if (!announced) {
        announced = true;
        onWaking();
      }
    } catch {
      if (!announced) {
        announced = true;
        onWaking();
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

export function Remover() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<UiPhase>("empty");
  const [error, setError] = useState<string | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("removed.png");
  const [worker, setWorker] = useState<WorkerStatus>("unknown");
  const [slider, setSlider] = useState(50);
  const [dragOver, setDragOver] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      setWorker("waking");
      const ok = await waitForWorker(ac.signal, () => setWorker("waking"));
      if (!ac.signal.aborted) setWorker(ok ? "ready" : "down");
    })();
    return () => ac.abort();
  }, []);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [originalUrl, resultUrl]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setOriginalUrl(null);
    setResultUrl(null);
    setError(null);
    setPhase("empty");
    setSlider(50);
  }, [originalUrl, resultUrl]);

  const processFile = useCallback(
    async (file: File) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      setResultUrl(null);
      setError(null);

      if (file.size > MAX_BYTES) {
        setPhase("error");
        setError("File too large. Max size is 15MB.");
        return;
      }
      const typeOk =
        ALLOWED.includes(file.type) ||
        /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
      if (!typeOk) {
        setPhase("error");
        setError("Unsupported type. Use JPEG, PNG, WebP, or HEIC.");
        return;
      }

      const localUrl = URL.createObjectURL(file);
      setOriginalUrl(localUrl);
      setFileName(file.name.replace(/\.[^.]+$/, "") + "-nobg.png");
      setPhase("uploading");

      try {
        const ready = await waitForWorker(ac.signal, () => {
          setPhase("waking");
          setWorker("waking");
        });
        if (!ready) {
          setPhase("error");
          setWorker("down");
          setError(
            "Worker did not become ready in time. First load after idle can take a minute. Retry.",
          );
          return;
        }
        setWorker("ready");
        setPhase("processing");

        const tokenRes = await fetch("/api/token", {
          method: "POST",
          signal: ac.signal,
        });
        if (!tokenRes.ok) {
          throw new Error("Could not mint upload token");
        }
        const { token } = (await tokenRes.json()) as { token: string };

        const form = new FormData();
        form.append("file", file);
        form.append("crop", "false");

        const removeRes = await fetch(`${apiBase()}/v1/remove`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: form,
          signal: ac.signal,
        });

        if (!removeRes.ok) {
          let message = `Request failed (${removeRes.status})`;
          try {
            const body = (await removeRes.json()) as {
              error?: string;
              hint?: string;
            };
            message = [body.error, body.hint].filter(Boolean).join(" — ");
          } catch {
            /* binary or empty */
          }
          throw new Error(message);
        }

        const blob = await removeRes.blob();
        const outUrl = URL.createObjectURL(blob);
        setResultUrl(outUrl);
        setPhase("done");
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setPhase("error");
        setError((err as Error).message || "Something went wrong");
      }
    },
    [originalUrl, resultUrl],
  );

  const onFiles = (files: FileList | null) => {
    const file = files?.[0];
    if (file) void processFile(file);
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Remove background
          </h1>
          <p className="mt-1 text-sm text-muted">
            Drop an image. BiRefNet cuts it out as a transparent PNG.
          </p>
        </div>
        <WorkerBadge status={worker} />
      </div>

      {phase === "empty" || phase === "error" ? (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            onFiles(e.dataTransfer.files);
          }}
          className={`flex min-h-[420px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 text-center transition ${
            dragOver
              ? "border-accent bg-panel"
              : "border-border bg-panel/60 hover:border-accent/60"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
          <span className="text-lg font-medium">Drop an image here</span>
          <span className="mt-2 text-sm text-muted">
            or click to browse · JPEG / PNG / WebP / HEIC · max 15MB
          </span>
          {worker === "waking" && (
            <span className="mt-4 text-sm text-accent">
              Worker is loading the model… first request after a restart can take about a minute.
            </span>
          )}
          {phase === "error" && error && (
            <div className="mt-6 max-w-md rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
              <p>{error}</p>
              <button
                type="button"
                className="mt-3 underline"
                onClick={(e) => {
                  e.preventDefault();
                  reset();
                }}
              >
                Try again
              </button>
            </div>
          )}
        </label>
      ) : null}

      {(phase === "uploading" ||
        phase === "waking" ||
        phase === "processing") && (
        <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-panel px-6 text-center">
          <Spinner />
          <p className="text-lg font-medium">
            {phase === "waking"
              ? "Waking worker…"
              : phase === "uploading"
                ? "Preparing upload…"
                : "Removing background…"}
          </p>
          <p className="max-w-md text-sm text-muted">
            {phase === "waking"
              ? "The API is loading the model after a restart. This can take about a minute."
              : "CPU inference is typically a few seconds when the worker is warm."}
          </p>
          {originalUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={originalUrl}
              alt="Original"
              className="mt-2 max-h-40 rounded-lg opacity-70"
            />
          )}
        </div>
      )}

      {phase === "done" && originalUrl && resultUrl && (
        <div className="flex flex-col gap-4">
          <div className="relative min-h-[420px] overflow-hidden rounded-2xl border border-border">
            <div className="checkerboard absolute inset-0" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resultUrl}
              alt="Result"
              className="absolute inset-0 h-full w-full object-contain"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={originalUrl}
              alt="Original"
              className="absolute inset-0 h-full w-full object-contain"
              style={{ clipPath: `inset(0 ${100 - slider}% 0 0)` }}
            />
            <div
              className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent shadow"
              style={{ left: `${slider}%` }}
            />
            <input
              type="range"
              min={0}
              max={100}
              value={slider}
              onChange={(e) => setSlider(Number(e.target.value))}
              className="absolute inset-x-4 bottom-4 z-10"
              aria-label="Before after slider"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={resultUrl}
              download={fileName}
              className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:brightness-110"
            >
              Download PNG
            </a>
            <button
              type="button"
              onClick={reset}
              className="rounded-xl border border-border bg-panel px-5 py-2.5 text-sm font-medium hover:border-accent/50"
            >
              Replace image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkerBadge({ status }: { status: WorkerStatus }) {
  const label =
    status === "ready"
      ? "Worker ready"
      : status === "waking"
        ? "Waking worker…"
        : status === "down"
          ? "Worker down"
          : "Checking worker…";
  const color =
    status === "ready"
      ? "bg-emerald-500"
      : status === "down"
        ? "bg-danger"
        : "bg-amber-400";
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-border bg-panel px-3 py-1.5 text-xs text-muted">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </div>
  );
}

function Spinner() {
  return (
    <div
      className="h-10 w-10 animate-spin rounded-full border-2 border-border border-t-accent"
      aria-hidden
    />
  );
}
