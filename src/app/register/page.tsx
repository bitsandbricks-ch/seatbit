import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { enabledProviders } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const raw = (await searchParams).next;
  // Only allow same-site paths.
  const next = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  if (await getCurrentUser()) redirect(next);
  return <AuthForm mode="register" providers={enabledProviders} next={next} />;
}
