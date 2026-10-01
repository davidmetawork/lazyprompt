"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/auth/client";
import { Button } from "@/components/ui/button";

type ConsentResponse = { redirect_uri?: string; url?: string };

/**
 * Approve / Deny through Better Auth's consent endpoint. oauthProviderClient() attaches the signed authorize query
 * (from this page's URL) to the request, so the server knows which authorization the answer belongs to.
 */
export function ConsentForm({ scopes }: { scopes: string[] }) {
  const [busy, setBusy] = useState<"accept" | "deny" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function answer(accept: boolean) {
    setBusy(accept ? "accept" : "deny");
    setError(null);
    const { data, error: err } = await authClient.$fetch<ConsentResponse>("/oauth2/consent", {
      method: "POST",
      body: accept ? { accept: true, scope: scopes.join(" ") } : { accept: false },
    });
    const target = data?.redirect_uri ?? data?.url;
    if (err || !target) {
      setBusy(null);
      setError(err?.message ?? "Something went wrong. Go back to the app and try connecting again.");
      return;
    }
    window.location.assign(target);
  }

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" size="lg" className="sm:flex-1" disabled={busy !== null} onClick={() => answer(true)}>
          {busy === "accept" ? <Loader2 className="animate-spin" /> : null} Approve
        </Button>
        <Button type="button" size="lg" variant="outline" className="sm:flex-1" disabled={busy !== null} onClick={() => answer(false)}>
          {busy === "deny" ? <Loader2 className="animate-spin" /> : null} Deny
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
