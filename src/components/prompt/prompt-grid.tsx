// Owned by browse-ui; props are frozen (section 22) because community-ui imports this.
import { PromptCard } from "./prompt-card";
import type { PromptCard as PromptCardData, PromptStatus } from "@/lib/types";

export function PromptGrid({
  prompts, showStatus,
}: {
  prompts: (PromptCardData & { status?: PromptStatus; moderationNote?: string | null })[];
  showStatus?: boolean;
}) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {prompts.map((p) => (
        <li key={p.id} className="min-w-0">
          <PromptCard prompt={p} showStatus={showStatus} />
        </li>
      ))}
    </ul>
  );
}
