import Link from "next/link";
import { btnPrimary } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center">
      <p className="font-mono text-sm text-bit">404</p>
      <h1 className="mt-1 text-xl font-bold">This seat is empty</h1>
      <p className="mt-2 text-sm text-muted">
        The page doesn&apos;t exist, or it belongs to a clan you&apos;re not in. Ask an orga for an invite link if you
        think you should see it.
      </p>
      <Link href="/" className={`${btnPrimary} mt-6`}>
        Back to LANs
      </Link>
    </div>
  );
}
