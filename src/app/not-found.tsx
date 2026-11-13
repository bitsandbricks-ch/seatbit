import Link from "next/link";
import { btnPrimary } from "@/components/ui";
import { getT } from "@/i18n/server";

export default async function NotFound() {
  const t = await getT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-12 text-center">
      <p className="font-mono text-sm text-bit">404</p>
      <h1 className="mt-1 text-xl font-bold">{t("pages.notFound")}</h1>
      <p className="mt-2 text-sm text-muted">{t("pages.notFoundHint")}</p>
      <Link href="/" className={`${btnPrimary} mt-6`}>
        {t("pages.backToLans")}
      </Link>
    </div>
  );
}
