import { redirect } from "next/navigation";

/** Stats moved into the clan page's tabs; old links land there. */
export default async function ClanStatsPage({ params }: PageProps<"/clans/[slug]/stats">) {
  const { slug } = await params;
  redirect(`/clans/${slug}?tab=stats`);
}
