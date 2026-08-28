"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signInWithEmail } from "./actions";

export default function SignInPage() {
  const [state, formAction, isPending] = useActionState(signInWithEmail, null);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-1 text-sm text-muted">
        The tool and dashboard require an account.
      </p>
      <form action={formAction} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          Email
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-xl border border-border bg-background px-3 py-2 outline-none focus:border-accent/60"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          Password
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="current-password"
            className="rounded-xl border border-border bg-background px-3 py-2 outline-none focus:border-accent/60"
          />
        </label>
        {state?.error && (
          <p className="rounded-xl border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:brightness-110 disabled:opacity-50"
        >
          {isPending ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        No account?{" "}
        <Link href="/auth/sign-up" className="text-accent underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
