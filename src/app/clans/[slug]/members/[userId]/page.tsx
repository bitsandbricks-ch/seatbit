import { MemberProfile } from "./member-profile";

export default async function MemberProfilePage({ params }: PageProps<"/clans/[slug]/members/[userId]">) {
  const { slug, userId } = await params;
  return <MemberProfile slug={slug} userId={userId} variant="page" />;
}
