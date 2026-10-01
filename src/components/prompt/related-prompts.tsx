import { getRelatedPrompts } from "@/server/prompts/queries";
import { PromptGrid } from "./prompt-grid";
import { safely } from "./safe";

/** Related prompts; renders nothing when the read is unavailable or empty. */
export async function RelatedPrompts({ promptId }: { promptId: string }) {
  const related = await safely(() => getRelatedPrompts(promptId, 6));
  if (!related || related.length === 0) return null;
  return (
    <section aria-labelledby="related-heading" className="mt-12">
      <h2 id="related-heading" className="mb-4 text-xl font-semibold tracking-tight">Related prompts</h2>
      <PromptGrid prompts={related} />
    </section>
  );
}
