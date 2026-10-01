import type { Metadata } from "next";
import Link from "next/link";
import { Container } from "@/components/layout/container";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getBaseUrl } from "@/lib/base-url";
import { env } from "@/lib/env";
import { buildMetadata } from "@/lib/seo/metadata";
import { CopyField } from "./copy-field";

export const metadata: Metadata = buildMetadata({
  title: "LazyPrompt for ChatGPT and Claude",
  description: "Search, fill in and use LazyPrompt's community-rated prompts from inside ChatGPT or Claude. Free, no account needed.",
  path: "/apps",
});

// Rendered per request so the connector URL always matches the deployment (branch URL on previews).
export const dynamic = "force-dynamic";

const READ_TOOLS = [
  { name: "search_prompts", text: "Find prompts by topic or task, with optional category and AI-model filters." },
  { name: "get_prompt", text: "Open one prompt: its template, variables, example output and rating." },
  { name: "render_prompt", text: "Fill a prompt's variables with your values and get the finished text, ready to use in the chat." },
  { name: "list_categories", text: "Browse the categories and see how many prompts each has." },
];
const WRITE_TOOLS = [
  { name: "rate_prompt", text: "Rate a prompt from 1 to 5 stars. Needs you to sign in to LazyPrompt." },
  { name: "save_prompt", text: "Save a prompt to your LazyPrompt list. Needs you to sign in to LazyPrompt." },
];

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span aria-hidden="true" className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{n}</span>
      <span className="min-w-0 text-sm">{children}</span>
    </li>
  );
}

export default function AppsPage() {
  const mcpUrl = `${getBaseUrl()}/mcp`;
  const claudeCommand = `claude mcp add --transport http lazyprompt ${mcpUrl}`;
  const writeEnabled = env.MCP_OAUTH_ENABLED;
  const tools = writeEnabled ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;

  return (
    <Container className="py-12">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">LazyPrompt in ChatGPT and Claude</h1>
        <p className="mt-3 text-muted-foreground">
          Ask your assistant to find a prompt, fill in the blanks and use it, without leaving the chat. It is free, and you
          do not need a LazyPrompt account to search and use prompts.
        </p>
      </header>

      <section aria-labelledby="url-title" className="mt-8 max-w-3xl">
        <h2 id="url-title" className="text-lg font-semibold tracking-tight">Connector URL</h2>
        <p className="mt-1 text-sm text-muted-foreground">Use this address when an app asks for the server or connector URL.</p>
        <div className="mt-3"><CopyField label="LazyPrompt connector URL" value={mcpUrl} /></div>
      </section>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>ChatGPT</CardTitle>
            <CardDescription>Add LazyPrompt as a custom app in developer mode.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              <Step n={1}>Open <strong>Settings</strong>, then <strong>Apps &amp; Connectors</strong>, then <strong>Advanced settings</strong>, and turn on <strong>Developer mode</strong>.</Step>
              <Step n={2}>Choose <strong>Create</strong> (or <strong>Create connector</strong>) and name it LazyPrompt.</Step>
              <Step n={3}>Paste the connector URL above as the server URL, then save.</Step>
              <Step n={4}>In a new chat, add LazyPrompt from the tools menu and ask, for example, &ldquo;find me a prompt for writing a cold email&rdquo;.</Step>
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">Developer mode may be turned off by your workspace admin.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Claude</CardTitle>
            <CardDescription>Add LazyPrompt as a custom connector.</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3">
              <Step n={1}>In Claude, open <strong>Settings</strong>, then <strong>Connectors</strong>, and choose <strong>Add custom connector</strong>.</Step>
              <Step n={2}>Name it LazyPrompt, paste the connector URL above, and add it.</Step>
              <Step n={3}>Turn the connector on in a chat and ask for a prompt.</Step>
            </ol>
            <p className="mt-4 text-sm">Using Claude Code? Run:</p>
            <div className="mt-2"><CopyField label="Claude Code command" value={claudeCommand} /></div>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="tools-title" className="mt-12 max-w-3xl">
        <h2 id="tools-title" className="text-xl font-semibold tracking-tight">What the connector can do</h2>
        <ul className="mt-4 divide-y rounded-lg border">
          {tools.map((t) => (
            <li key={t.name} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
              <code className="shrink-0 font-mono text-sm font-medium sm:w-44">{t.name}</code>
              <span className="text-sm text-muted-foreground">{t.text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">
          {writeEnabled
            ? <>Searching and filling in prompts never needs an account. Rating and saving ask you to <Badge variant="secondary">sign in to LazyPrompt</Badge> the first time you use them.</>
            : <>Rating and saving are not available through the connector yet; the buttons in the prompt card open the prompt on LazyPrompt instead.</>}
        </p>
      </section>

      <section aria-labelledby="privacy-title" className="mt-12 max-w-3xl">
        <h2 id="privacy-title" className="text-xl font-semibold tracking-tight">Privacy</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>LazyPrompt never runs a prompt. It only gives your assistant the text; the assistant does the rest.</li>
          <li>Searching and filling in prompts is anonymous. Filling in a prompt counts as one use in its public usage stats, tied to a hashed network address, not to you.</li>
          <li>The values you give to fill in a prompt are used only to build the text. They are not stored and not logged.</li>
          <li>We do not share your email address, or any tokens or timestamps, with the assistant.</li>
          <li>{writeEnabled ? "If you sign in, the connection can only rate and save prompts for you. You approve it first, and you can see what it asks for." : "No sign-in is needed or requested."}</li>
          <li>Please do not paste secrets into prompts. See our <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground">privacy policy</Link> for details.</li>
        </ul>
      </section>

      {writeEnabled ? (
        <section aria-labelledby="oauth-title" className="mt-12 max-w-3xl">
          <h2 id="oauth-title" className="text-xl font-semibold tracking-tight">For app developers</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign-in uses OAuth 2.1 with PKCE (S256), dynamic client registration and client ID metadata documents. Discovery documents are at
            {" "}<code className="font-mono text-xs">/.well-known/oauth-protected-resource</code> and
            {" "}<code className="font-mono text-xs">/.well-known/oauth-authorization-server</code>. Allowed redirect URIs are the ones a client registers; the usual ones are:
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>ChatGPT: <code className="font-mono text-xs">https://chatgpt.com/connector/oauth/&lt;callback id&gt;</code> and <code className="font-mono text-xs">https://chatgpt.com/connector_platform_oauth_redirect</code></li>
            <li>Claude: <code className="font-mono text-xs">https://claude.ai/api/mcp/auth_callback</code></li>
            <li>Claude Code: <code className="font-mono text-xs">http://localhost/callback</code> and <code className="font-mono text-xs">http://127.0.0.1/callback</code> (any port)</li>
          </ul>
        </section>
      ) : null}
    </Container>
  );
}
