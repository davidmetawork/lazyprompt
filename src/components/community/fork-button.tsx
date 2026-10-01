// PLACEHOLDER owned by community-ui.
import Link from "next/link";

export interface ForkButtonProps { shortId: string; signedIn: boolean }

export function ForkButton({ shortId, signedIn }: ForkButtonProps) {
  const href = signedIn ? `/submit?fork=${shortId}` : `/sign-in?next=${encodeURIComponent(`/submit?fork=${shortId}`)}`;
  return <Link href={href} className="text-sm text-primary underline-offset-4 hover:underline">Fork</Link>;
}
