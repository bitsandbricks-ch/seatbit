import { Skeleton } from "@/components/ui";
import { getT } from "@/i18n/server";

/** Shown while a page's server data loads (navigations on slow phone connections). */
export default async function Loading() {
  const t = await getT();
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t("pages.loading")}</span>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-52" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 rounded-card border border-line bg-surface p-5">
            <Skeleton className="h-5 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
