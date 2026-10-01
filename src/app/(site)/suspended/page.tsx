import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "Account suspended", robots: { index: false, follow: false } };

export default function SuspendedPage() {
  return (
    <Container className="max-w-lg py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Your account has been suspended</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You can still browse and copy prompts, but you cannot post, rate, comment or save while the suspension is active.
      </p>
      <SignOutButton />
    </Container>
  );
}
