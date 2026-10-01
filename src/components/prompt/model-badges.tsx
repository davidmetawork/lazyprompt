import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AiModel } from "@/lib/types";
import { modelInitials, modelName } from "./labels";

/** Compact initials "icons" for cards; an empty list means the prompt works with any model. */
export function ModelIcons({ models, max = 3, className }: { models: AiModel[]; max?: number; className?: string }) {
  if (models.length === 0) return null;
  const shown = models.slice(0, max);
  const rest = models.length - shown.length;
  return (
    <span className={cn("inline-flex items-center -space-x-1", className)} role="img"
      aria-label={`Works with ${models.map(modelName).join(", ")}`}>
      {shown.map((m) => (
        <span key={m} title={modelName(m)} aria-hidden="true"
          className="grid size-5 place-items-center rounded-full border border-background bg-accent text-[10px] font-semibold text-accent-foreground">
          {modelInitials(m)}
        </span>
      ))}
      {rest > 0 ? (
        <span aria-hidden="true" className="grid size-5 place-items-center rounded-full border border-background bg-muted text-[10px] font-medium text-muted-foreground">
          +{rest}
        </span>
      ) : null}
    </span>
  );
}

/** Full-name model badges for the detail page. */
export function ModelBadges({ models }: { models: AiModel[] }) {
  if (models.length === 0) return <Badge variant="secondary">Works with any model</Badge>;
  return (
    <>
      {models.map((m) => <Badge key={m} variant="secondary">{modelName(m)}</Badge>)}
    </>
  );
}
