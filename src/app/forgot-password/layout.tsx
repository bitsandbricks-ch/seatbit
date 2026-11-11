import { redirect } from "next/navigation";
import { LOGIN_METHODS } from "@/lib/auth";

/** Password pages only exist while email login is switched on. */
export default function Layout({ children }: { children: React.ReactNode }) {
  if (!LOGIN_METHODS.email) redirect("/login");
  return children;
}
