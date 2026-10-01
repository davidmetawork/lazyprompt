"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail } from "lucide-react";
import { authClient } from "@/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trackEvent } from "@/lib/analytics";
import { safeNext } from "@/lib/validation";

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true" fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8H1.4v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.4 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.7 1.8l3.5-3.5A12 12 0 0 0 1.4 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
    </svg>
  );
}

export function SignInForm({
  next, googleEnabled, githubEnabled,
}: { next?: string; googleEnabled: boolean; githubEnabled: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbackURL = safeNext(next);
  const errorURL = (kind: "link" | "oauth") =>
    `/sign-in?error=${kind}&from=${kind}${callbackURL !== "/" ? `&next=${encodeURIComponent(callbackURL)}` : ""}`;

  async function social(provider: "google" | "github") {
    trackEvent("sign_in_start", { method: provider });
    setError(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL, errorCallbackURL: errorURL("oauth") });
    if (error) setError(error.message ?? "Could not start sign-in");
  }

  async function magic(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    trackEvent("sign_in_start", { method: "magic_link" });
    const { error } = await authClient.signIn.magicLink({ email: email.trim(), callbackURL, errorCallbackURL: errorURL("link") });
    setPending(false);
    if (error) {
      setError(error.message ?? "Could not send the sign-in link");
      return;
    }
    const nextParam = callbackURL !== "/" ? `&next=${encodeURIComponent(callbackURL)}` : "";
    router.push(`/sign-in/check-email?email=${encodeURIComponent(email.trim())}${nextParam}`);
  }

  return (
    <div className="space-y-6">
      {googleEnabled || githubEnabled ? (
        <div className="space-y-2">
          {googleEnabled ? (
            <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => social("google")}>
              <GoogleIcon /> Continue with Google
            </Button>
          ) : null}
          {githubEnabled ? (
            <Button type="button" variant="outline" size="lg" className="w-full" onClick={() => social("github")}>
              <GithubIcon /> Continue with GitHub
            </Button>
          ) : null}
          <div className="relative py-2 text-center text-xs text-muted-foreground">
            <span className="relative z-10 bg-background px-2">or use email</span>
            <span className="absolute inset-x-0 top-1/2 h-px bg-border" />
          </div>
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
