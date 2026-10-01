"use server";
import { revalidatePath } from "next/cache";
import { requireViewerForAction } from "@/auth/viewer";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import { profileInputSchema } from "@/lib/validation";
import { updateProfile } from "@/server/users";

export type ProfileActionState = ActionResult<{ username: string }> | null;

export async function updateProfileAction(_prev: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  let previous = "";
  const r = await toActionResult(async () => {
    const v = await requireViewerForAction();
    previous = v.username;
    const field = (name: string) => {
      const raw = formData.get(name);
      return typeof raw === "string" ? raw.trim() : "";
    };
    const input = profileInputSchema.parse({
      username: field("username").toLowerCase(),
      bio: field("bio") || undefined,
      website: field("website") || undefined,
    });
    const updated = await updateProfile(v, input);
    return { username: updated.username };
  });
  if (r.ok) {
    // The header's user menu shows the username, so refresh the whole layout.
    revalidatePath("/", "layout");
    revalidatePath(`/u/${previous}`);
    revalidatePath(`/u/${r.data.username}`);
  }
  return r;
}
