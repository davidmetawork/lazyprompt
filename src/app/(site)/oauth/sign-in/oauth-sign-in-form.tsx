"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { authClient } from "@/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sign-in form for the OAuth login redirect. `resumePath` is the authorize request to continue with after sign-in
 * (a same-origin path; the shared safeNext() limit of 512 chars is too small for an authorize query).
 * Social sign-ins resume through Better Auth itself (oauthProviderClient forwards the signed query);
 * the magic link resumes through `callbackURL`.
 */
export function OAuthSignInForm({
  resumePath, googleEnabled, githubEnabled,
}: { resumePath: string; googleEnabled: boolean; githubEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function social(provider: "google" | "github") {
    setError(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL: resumePath, errorCallbackURL: "/sign-in?error=oauth&from=oauth" });
    if (error) setError(error.message ?? "Could not start sign-in");
  }

  async function magic(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: resumePath, errorCallbackURL: "/sign-in?error=link&from=link" });
    setPending(false);
    if (error) {
      setError(error.message ?? "Could not send the sign-in link");
      return;
    }
    router.push(`/sign-in/check-email?email=${encodeURIComponent(email.trim())}`);
  }

  return (
    <div className="space-y-6">
      {googleEnabled || githubEnabled ? (
        <div className="space-y-2">
          {googleEnabled ? <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => social("google")}>Continue with Google</Button> : null}
          {githubEnabled ? <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => social("github")}>Continue with GitHub</Button> : null}
          <p className="py-1 text-center text-xs text-muted-foreground">or use email</p>
        </div>
      ) : null}
      <form onSubmit={magic} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com"
            value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending || email.trim() === ""}>
          {pending ? <Loader2 className="animate-spin" /> : <Mail />} Email me a sign-in link
        </Button>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </form>
    </div>
  );
}
