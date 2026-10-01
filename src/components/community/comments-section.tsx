// PLACEHOLDER owned by community-ui. Async server component.
export interface CommentsSectionProps { promptId: string; slug: string; commentCount: number }

export async function CommentsSection({ commentCount }: CommentsSectionProps) {
  return <section aria-label="Comments" className="text-sm text-muted-foreground">Comments ({commentCount})</section>;
}
