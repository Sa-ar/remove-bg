import { auth } from "@/lib/auth/server";
import { NextResponse } from "next/server";

export async function requireUserId(): Promise<
  { userId: string; error?: undefined } | { userId?: undefined; error: NextResponse }
> {
  const { data: session } = await auth.getSession();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      error: NextResponse.json(
        { error: "Sign in required", code: "unauthorized" },
        { status: 401 },
      ),
    };
  }
  return { userId };
}
