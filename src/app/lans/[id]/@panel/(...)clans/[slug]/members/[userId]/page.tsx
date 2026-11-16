import { MemberProfile } from "@/app/clans/[slug]/members/[userId]/member-profile";

/** A member opened from the event (attendees, leads): the profile in the side panel, the event stays. */
export default async function EventMemberPanel({ params }: PageProps<"/clans/[slug]/members/[userId]">) {
  const { slug, userId } = await params;
  return <MemberProfile slug={slug} userId={userId} variant="panel" />;
}
