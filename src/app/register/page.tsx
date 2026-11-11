import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { enabledProviders, signupOpen } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const raw = (await searchParams).next;
  // Only allow same-site paths.
  const next = typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  if (await getCurrentUser()) redirect(next);
  const providers = enabledProviders();
  // Without email sign-up, Discord's button both signs in and creates accounts: one page is enough.
  if (!providers.email) redirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
  if (!signupOpen()) {
    return (
      <div className="mx-auto max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6 text-sm">
        <h1 className="text-xl font-bold">Sign-ups are closed</h1>
        <p className="text-muted">New accounts can&apos;t be created right now. Ask a Seatbit admin to open sign-ups.</p>
        <Link href="/login" className="text-bit hover:underline">
          Sign in with an existing account
        </Link>
      </div>
    );
  }
  return <AuthForm mode="register" providers={providers} next={next} />;
}
