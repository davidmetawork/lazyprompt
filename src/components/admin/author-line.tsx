import { Badge } from "@/components/ui/badge";
import type { AuthorSummary, TrustLevel } from "@/lib/types";
import { formatAge, formatDateTime } from "./helpers";

function accountAge(iso: string): string {
  const age = formatAge(iso);
  return age === "just now" || age === "unknown" ? `account created ${age}` : `account ${age} old`;
}

export function AuthorLine({ author }: { author: AuthorSummary & { trustLevel?: TrustLevel; accountCreatedAt?: string } }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-sm">
      <span className="font-medium">@{author.username}</span>
      {author.trustLevel !== undefined ? <Badge variant="outline">Trust {author.trustLevel}</Badge> : null}
      {author.accountCreatedAt ? (
        <time dateTime={author.accountCreatedAt} title={`Account created ${formatDateTime(author.accountCreatedAt)}`} className="text-xs text-muted-foreground">
          {accountAge(author.accountCreatedAt)}
        </time>
      ) : null}
    </span>
  );
}
