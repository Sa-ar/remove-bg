import Link from "next/link";
import { auth } from "@/lib/auth/server";
import { SignOutButton } from "@/components/SignOutButton";

export async function Header() {
  let user: { id?: string; email?: string | null; name?: string | null } | undefined;
  try {
    const { data: session } = await auth.getSession();
    user = session?.user;
  } catch {
    user = undefined;
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-4">
      <Link href={user ? "/" : "/auth/sign-in"} className="text-lg font-semibold tracking-tight">
        Remove BG
      </Link>
      <nav className="flex flex-wrap items-center gap-4 text-sm text-muted">
        {user ? (
          <>
            <Link href="/" className="hover:text-foreground">
              Tool
            </Link>
            <Link href="/dashboard" className="hover:text-foreground">
              Dashboard
            </Link>
          </>
        ) : (
          <Link href="/auth/sign-in" className="hover:text-foreground">
            Sign in
          </Link>
        )}
        <Link href="/docs" className="hover:text-foreground">
          API docs
        </Link>
        {user ? (
          <span className="flex items-center gap-3">
            <span className="hidden max-w-[12rem] truncate sm:inline">
              {user.email || user.name}
            </span>
            <SignOutButton />
          </span>
        ) : null}
      </nav>
    </header>
  );
}
