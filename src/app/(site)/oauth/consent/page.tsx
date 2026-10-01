import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/auth/server";
import { requireViewer } from "@/auth/viewer";
import { Container } from "@/components/layout/container";
import { describeScope } from "@/mcp/oauth-metadata";
import { redirectHost, splitScopes, toUrlSearchParams } from "@/mcp/oauth-continue";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Connect an app", robots: { index: false, follow: false } };

interface PublicClient { client_name?: string; client_uri?: string }
type PublicClientApi = { getOAuthClientPublic(a: { query: { client_id: string }; headers: Headers }): Promise<PublicClient> };

async function loadClient(clientId: string): Promise<PublicClient | null> {
  try {
    // The plugin list is typed loosely (src/auth/mcp-plugins.ts), so the endpoint is not in auth.api's inferred type.
    return await (auth.api as unknown as PublicClientApi).getOAuthClientPublic({ query: { client_id: clientId }, headers: await headers() });
  } catch {
    return null;
  }
}

const KNOWN_CLIENT_HOSTS = ["chatgpt.com", "openai.com", "claude.ai", "anthropic.com"];

/** True when the client's self-declared client_uri is on (or under) an allowlisted host. The name itself is never verified. */
function isKnownClient(clientUri: string | undefined): boolean {
  if (!clientUri) return false;
  try {
    const u = new URL(clientUri);
    if (u.protocol !== "https:") return false;
    return KNOWN_CLIENT_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export default async function ConsentPage(props: PageProps<"/oauth/consent">) {
  const viewer = await requireViewer("/oauth/consent");
  const q = toUrlSearchParams(await props.searchParams);
  const clientId = q.get("client_id");
  const client = clientId ? await loadClient(clientId) : null;
  const scopes = splitScopes(q.get("scope") ?? undefined);
  const host = redirectHost(q.get("redirect_uri") ?? undefined);

  if (!clientId || !client) {
    return (
      <Container className="max-w-md py-16">
        <h1 className="text-2xl font-semibold tracking-tight">This connection request is not valid</h1>
        <p className="mt-2 text-sm text-muted-foreground">Go back to the app and try connecting again.</p>
      </Container>
    );
  }

  const name = client.client_name?.trim() || "An AI app";
  const verified = isKnownClient(client.client_uri);
  return (
    <Container className="max-w-md py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        Connect {name}{host ? <> ({host})</> : null} to LazyPrompt?
      </h1>
      {!verified ? (
        <p className="mt-2 text-sm text-muted-foreground">LazyPrompt has not verified this app&apos;s name.</p>
      ) : null}
      <p className="mt-2 text-sm text-muted-foreground">
        You are signed in as <span className="font-medium text-foreground">@{viewer.username}</span>.
        {host ? <> After you answer, you will be sent back to <span className="font-medium text-foreground">{host}</span>.</> : null}
      </p>
      <section aria-labelledby="scopes-title" className="mt-6 rounded-lg border p-4">
        <h2 id="scopes-title" className="text-sm font-medium">{name} will be able to:</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {scopes.length === 0 ? <li>{describeScope("prompts:read")}</li> : scopes.map((s) => <li key={s}>{describeScope(s)}</li>)}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">It will not be able to post prompts or comments, or change your account. You can disconnect it from the app at any time.</p>
      </section>
      <ConsentForm scopes={scopes} />
    </Container>
  );
}
