import Link from "next/link";
import { Container } from "./container";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/guidelines", label: "Guidelines" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/apps", label: "ChatGPT & Claude" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t py-10 text-sm text-muted-foreground">
      <Container className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <p>LazyPrompt. Free, community-rated AI prompts.</p>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-foreground">{l.label}</Link>
          ))}
        </nav>
      </Container>
    </footer>
  );
}
