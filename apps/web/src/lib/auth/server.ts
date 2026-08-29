import { createNeonAuth } from "@neondatabase/auth/next/server";

const DEV_COOKIE_SECRET = "dev-only-placeholder-secret-32chars";

function cookieSecret(): string {
  const secret = process.env.NEON_AUTH_COOKIE_SECRET;
  if (secret && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEON_AUTH_COOKIE_SECRET must be set to a 32+ character value",
    );
  }
  return DEV_COOKIE_SECRET;
}

export const auth = createNeonAuth({
  baseUrl:
    process.env.NEON_AUTH_BASE_URL || "https://auth.invalid/neondb/auth",
  cookies: {
    secret: cookieSecret(),
  },
});
