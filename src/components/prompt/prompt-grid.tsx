// Working minimal grid; browse-ui owns this file afterwards.
import { PromptCard } from "./prompt-card";
import type { PromptCard as PromptCardData, PromptStatus } from "@/lib/types";

export function PromptGrid({
  prompts, showStatus,
}: {
  prompts: (PromptCardData & { status?: PromptStatus; moderationNote?: string | null })[];
  showStatus?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {prompts.map((p) => <PromptCard key={p.id} prompt={p} showStatus={showStatus} />)}
    </div>
  );
}
