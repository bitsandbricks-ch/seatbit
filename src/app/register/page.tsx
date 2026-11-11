import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { enabledProviders, signupOpen } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/");
  if (!signupOpen()) {
    return (
      <div className="mx-auto max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6 text-sm">
        <h1 className="text-xl font-bold">Sign-ups are closed</h1>
        <p className="text-zinc-400">New accounts can&apos;t be created right now. Ask an admin of your group to open sign-ups.</p>
        <Link href="/login" className="text-bit hover:underline">
          Sign in with an existing account
        </Link>
      </div>
    );
  }
  return <AuthForm mode="register" providers={enabledProviders()} />;
}
