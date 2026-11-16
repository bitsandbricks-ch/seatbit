import { MemberProfile } from "../../../members/[userId]/member-profile";

/** A member opened from a list on the clan pages: the profile in the side panel, the list stays. */
export default async function MemberPanel({ params }: PageProps<"/clans/[slug]/members/[userId]">) {
  const { slug, userId } = await params;
  return <MemberProfile slug={slug} userId={userId} variant="panel" />;
}
