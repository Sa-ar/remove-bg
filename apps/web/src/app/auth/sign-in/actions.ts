"use server";

import { auth } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export async function signInWithEmail(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const { error } = await auth.signIn.email({
    email: String(formData.get("email") || ""),
    password: String(formData.get("password") || ""),
  });

  if (error) {
    return { error: error.message || "Failed to sign in. Try again." };
  }

  redirect("/");
}
