import { redirect } from "next/navigation";
import { safeNext } from "@/lib/safe-url";
import { AuthForm } from "@/components/auth-form";
import { enabledProviders } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { getT } from "@/i18n/server";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const raw = sp.next;
  // Only allow same-site paths.
  const next = safeNext(raw);
  if (await getCurrentUser()) redirect(next);
  return <AuthForm mode="login" providers={enabledProviders()} next={next} notice={sp.deleted ? (await getT())("auth.deleted") : undefined} />;
}
