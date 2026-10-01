import type { Metadata } from "next";
import { redirect } from "next/navigation";
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

  return (
    <Container className="max-w-md py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to LazyPrompt</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Browsing and copying prompts never needs an account. Sign in to submit, rate, comment and save.
      </p>
      <div className="mt-8">
        <SignInForm next={nextRaw} googleEnabled={googleEnabled} githubEnabled={githubEnabled} />
      </div>
    </Container>
  );
}
