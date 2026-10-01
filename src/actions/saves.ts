"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireViewerForAction } from "@/auth/viewer";
import { isSafeSlug } from "@/components/community/helpers";
import { toActionResult } from "@/lib/errors";
import type { ActionResult } from "@/lib/types";
import { setSaved } from "@/server/saves";

export async function setSavedAction(
  input: { promptId: string; slug: string; saved: boolean },
): Promise<ActionResult<{ saved: boolean; saveCount: number }>> {
  const r = await toActionResult(async () => {
    const v = await requireViewerForAction();
    const promptId = z.uuid().parse(input.promptId);
    return setSaved(v, promptId, z.boolean().parse(input.saved));
  });
  if (r.ok) {
    if (isSafeSlug(input.slug)) revalidatePath(`/p/${input.slug}`);
    revalidatePath("/me/saved");
  }
  return r;
}
