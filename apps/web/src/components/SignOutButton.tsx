"use client";

import { signOutAction } from "@/app/auth/sign-out/actions";

export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className="text-sm text-muted hover:text-foreground"
      >
        Sign out
      </button>
    </form>
  );
}
