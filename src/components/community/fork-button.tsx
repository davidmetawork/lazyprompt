import Link from "next/link";
import { GitFork } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { signInHref } from "./helpers";

export interface ForkButtonProps { shortId: string; signedIn: boolean }

export function ForkButton({ shortId, signedIn }: ForkButtonProps) {
  const target = `/submit?fork=${encodeURIComponent(shortId)}`;
  return (
    <Link href={signedIn ? target : signInHref(target)} className={buttonVariants({ variant: "outline" })}>
      <GitFork /> Fork
    </Link>
  );
}
