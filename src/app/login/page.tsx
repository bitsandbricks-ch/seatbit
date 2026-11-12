import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { enabledProviders } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const raw = sp.next;
  // Only allow same-site paths.
  const next = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  if (await getCurrentUser()) redirect(next);
  return <AuthForm mode="login" providers={enabledProviders()} next={next} notice={sp.deleted ? "Your account and your data were deleted. Thanks for using Seatbit." : undefined} />;
}
