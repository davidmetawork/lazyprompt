"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";

export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Container className="max-w-lg py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {error.message === "Your account has been suspended" ? error.message : "An unexpected error occurred. Please try again."}
      </p>
      <Button className="mt-6" onClick={reset}>Try again</Button>
    </Container>
  );
}
