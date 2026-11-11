import { redirect } from "next/navigation";

export default async function OldManagePage({ params }: PageProps<"/admin/lans/[id]">) {
  redirect(`/lans/${(await params).id}/manage`);
}
