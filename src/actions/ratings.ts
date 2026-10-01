"use server";
import { revalidatePath } from "next/cache";
import { requireViewerForAction } from "@/auth/viewer";
import { isSafeSlug } from "@/components/community/helpers";
import { toActionResult } from "@/lib/errors";
import type { ActionResult, RatingSummary } from "@/lib/types";
import { ratingInputSchema, type RatingInput } from "@/lib/validation";
import { ratePrompt, removeRating } from "@/server/ratings";

function refresh(slug: string): void {
  revalidatePath("/");
  revalidatePath("/prompts");
  if (isSafeSlug(slug)) revalidatePath(`/p/${slug}`);
}

export async function rateAction(input: RatingInput & { slug: string }): Promise<ActionResult<RatingSummary>> {
  const r = await toActionResult(async () => {
    const v = await requireViewerForAction();
    const parsed = ratingInputSchema.parse({ promptId: input.promptId, stars: input.stars });
    return ratePrompt(v, parsed.promptId, parsed.stars);
  });
  if (r.ok) refresh(input.slug);
  return r;
}

export async function removeRatingAction(input: { promptId: string; slug: string }): Promise<ActionResult<RatingSummary>> {
  const r = await toActionResult(async () => {
    const v = await requireViewerForAction();
    const parsed = ratingInputSchema.shape.promptId.parse(input.promptId);
    return removeRating(v, parsed);
  });
  if (r.ok) refresh(input.slug);
  return r;
}
