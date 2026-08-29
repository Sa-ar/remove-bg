import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth/server";

const protect = auth.middleware({
  loginUrl: "/auth/sign-in",
});

export function proxy(request: NextRequest) {
  return protect(request);
}

export const config = {
  // Pages only. API routes return JSON 401 via requireUserId().
  matcher: ["/", "/dashboard", "/dashboard/usage"],
};
