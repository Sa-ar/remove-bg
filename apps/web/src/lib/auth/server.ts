import { createNeonAuth } from "@neondatabase/auth/next/server";

const placeholderSecret = "dev-only-placeholder-secret-32chars";

export const auth = createNeonAuth({
  baseUrl:
    process.env.NEON_AUTH_BASE_URL || "https://auth.invalid/neondb/auth",
  cookies: {
    secret: process.env.NEON_AUTH_COOKIE_SECRET || placeholderSecret,
  },
});
