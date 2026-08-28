import { SignJWT } from "jose";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST() {
  const session = await requireUserId();
  if (session.error) return session.error;

  const secret = process.env.UI_TOKEN_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        error: "UI_TOKEN_SECRET is not configured",
        code: "misconfigured",
        hint: "Set UI_TOKEN_SECRET in the web app env (same value as the API).",
      },
      { status: 500 },
    );
  }

  const token = await new SignJWT({
    purpose: "ui-upload",
    sub: session.userId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secret));

  return NextResponse.json({ token, expiresIn: 300 });
}
