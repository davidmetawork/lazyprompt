import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/auth/viewer";
import { Container } from "@/components/layout/container";
import { authorizePathFromQuery, toUrlSearchParams } from "@/mcp/oauth-continue";
import { OAuthSignInForm } from "./oauth-sign-in-form";

export const metadata: Metadata = { title: "Sign in to connect", robots: { index: false, follow: false } };

// loginPage for the MCP OAuth provider. The authorize request arrives as a signed query; after sign-in we resume it.
export default async function OAuthSignInPage(props: PageProps<"/oauth/sign-in">) {
  const sp = await props.searchParams;
  const resumePath = authorizePathFromQuery(sp);
  if (!resumePath) redirect("/sign-in");

  const viewer = await getViewer();
  const forceLogin = toUrlSearchParams(sp).get("prompt")?.split(/\s+/).includes("login");
  if (viewer && !forceLogin) redirect(resumePath);

  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const githubEnabled = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
  return (
    <Container className="max-w-md py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to LazyPrompt</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        An AI app wants to connect to your LazyPrompt account so it can rate and save prompts for you. Sign in to continue. You will be asked to approve the connection next.
      </p>
      <div className="mt-8">
        <OAuthSignInForm resumePath={resumePath} googleEnabled={googleEnabled} githubEnabled={githubEnabled} />
      </div>
    </Container>
  );
}
