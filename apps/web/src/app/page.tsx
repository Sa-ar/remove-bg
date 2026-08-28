import { redirect } from "next/navigation";
import { Remover } from "@/components/Remover";
import { auth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let userId: string | undefined;
  try {
    const { data: session } = await auth.getSession();
    userId = session?.user?.id;
  } catch {
    userId = undefined;
  }
  if (!userId) redirect("/auth/sign-in");
  return <Remover />;
}
