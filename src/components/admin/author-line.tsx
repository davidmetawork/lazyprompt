import { Badge } from "@/components/ui/badge";
import type { AuthorSummary, TrustLevel } from "@/lib/types";

export function AuthorLine({ author }: { author: AuthorSummary & { trustLevel?: TrustLevel } }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      <span className="font-medium">@{author.username}</span>
      {author.trustLevel !== undefined ? <Badge variant="outline">Trust {author.trustLevel}</Badge> : null}
    </span>
  );
}
