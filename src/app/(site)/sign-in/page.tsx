import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { canSendMagicLink } from "@/auth/email";
import { getViewer } from "@/auth/viewer";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Container } from "@/components/layout/container";
import { safeNext } from "@/lib/validation";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false } };

export default async function SignInPage(props: PageProps<"/sign-in">) {
  const sp = await props.searchParams;
  const nextRaw = typeof sp.next === "string" ? sp.next : undefined;
  const viewer = await getViewer();
  // OAuth continuation (MCP clients) arrives as a signed query (`sig`, `client_id`, ...). Never strip or rewrite the
  // URL for those requests: the client plugin forwards window.location.search to Better Auth with each sign-in call.
  const isOAuthContinuation = typeof sp.sig === "string";
  if (viewer && !isOAuthContinuation) redirect(safeNext(nextRaw));

  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const githubEnabled = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  const emailEnabled = canSendMagicLink();
  const anyMethod = googleEnabled || githubEnabled || emailEnabled;

  // Better Auth overwrites ?error= with its own code (INVALID_TOKEN, access_denied, ...), so `from` carries which flow failed.
  const from = typeof sp.from === "string" ? sp.from : sp.error;
  const errorMessage = from === "oauth"
    ? "Sign-in with that provider did not complete. Try again."
    : from === "link" ? "That sign-in link expired or was already used. Request a new one."
    : sp.error ? "Sign-in did not complete. Try again." : null;

  return (
    <Container className="max-w-md py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to LazyPrompt</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Browsing and copying prompts never needs an account. Sign in to submit, rate, comment and save.
      </p>
      {errorMessage ? (
        <p role="alert" className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{errorMessage}</p>
      ) : null}
      <div className="mt-8">
        {anyMethod ? (
          <SignInForm next={nextRaw} googleEnabled={googleEnabled} githubEnabled={githubEnabled} emailEnabled={emailEnabled} />
        ) : (
          <p role="status" className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Sign-in is temporarily unavailable while we finish setting up accounts. You can still browse, fill in and
            copy every prompt.
          </p>
        )}
      </div>
    </Container>
  );
}
