import Link from "next/link";
import { Sparkles } from "lucide-react";
import { getViewer } from "@/auth/viewer";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "./container";
import { SearchBox } from "./search-box";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { cn } from "@/lib/utils";

export async function SiteHeader() {
  const viewer = await getViewer();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
      <Container className="flex h-16 items-center gap-3 sm:gap-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <span className="hidden sm:inline">LazyPrompt</span>
        </Link>
        <SearchBox className="min-w-0 flex-1 sm:max-w-md" />
        <nav className="ml-auto flex items-center gap-1">
          <Link href="/prompts" className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}>Browse</Link>
          <Link href="/submit" className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}>Submit</Link>
          <ThemeToggle />
          {viewer ? (
            <UserMenu user={{ name: viewer.name, username: viewer.username, image: viewer.image, role: viewer.role }} />
          ) : (
            <Link href="/sign-in" className={buttonVariants({ variant: "default" })}>Sign in</Link>
          )}
        </nav>
      </Container>
    </header>
  );
}
