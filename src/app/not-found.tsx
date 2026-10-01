import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="mt-2 text-muted-foreground">That page does not exist, or it is no longer public.</p>
      <div className="mt-6 flex gap-3">
        <Link href="/" className={buttonVariants()}>Go home</Link>
        <Link href="/prompts" className={buttonVariants({ variant: "outline" })}>Browse prompts</Link>
      </div>
    </div>
  );
}
