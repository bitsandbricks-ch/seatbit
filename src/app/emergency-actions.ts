"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { saveEmergencyInfo } from "@/lib/emergency";

export type EmergencyState = { ok?: boolean };

/** Profile › Emergency: the member's own emergency contact and dietary needs. */
export async function updateEmergencyInfo(_: EmergencyState, formData: FormData): Promise<EmergencyState> {
  const me = await requireUser();
  const get = (k: string) => String(formData.get(k) ?? "");
  saveEmergencyInfo(me.id, { contactName: get("contactName"), contactPhone: get("contactPhone"), diet: get("diet") });
  revalidatePath("/profile");
  return { ok: true };
}
