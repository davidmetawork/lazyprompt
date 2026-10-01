import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function PromptNotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">We couldn&apos;t find that prompt</h1>
      <p className="mt-2 text-muted-foreground">
        It may have been removed, renamed, or is still waiting for review. Try searching for something similar.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/prompts" className={buttonVariants()}>Browse prompts</Link>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>Go home</Link>
      </div>
    </div>
  );
}
