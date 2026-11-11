import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { enabledProviders } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  return <AuthForm mode="register" providers={enabledProviders} />;
}
