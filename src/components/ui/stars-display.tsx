import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Read-only stars plus count. `rating` is the raw average (null = no ratings yet). */
export function StarsDisplay({
  rating, count, className, size = 14,
}: { rating: number | null; count: number; className?: string; size?: number }) {
  if (count === 0 || rating === null) {
    return <span className={cn("text-xs text-muted-foreground", className)}>No ratings yet</span>;
  }
  const rounded = Math.round(rating * 2) / 2;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", className)}
      aria-label={`${rating.toFixed(1)} out of 5 stars from ${count} ratings`}>
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} width={size} height={size}
            className={n <= rounded ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"} />
        ))}
      </span>
      <span className="font-medium tabular-nums">{rating.toFixed(1)}</span>
      <span className="text-muted-foreground tabular-nums">({count})</span>
    </span>
  );
}
