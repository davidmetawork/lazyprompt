// NO "server-only": imported by src/auth/server.ts which must load under tsx and the Better Auth CLI.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Resend } from "resend";

const DEFAULT_FROM = "LazyPrompt <login@lazyprompt.ai>";

/**
 * Sends the magic-link email. Uses Resend when RESEND_API_KEY is set; otherwise logs the URL to the console.
 * When MAGIC_LINK_DEV_SINK is set (and VERCEL_ENV !== production) a JSON line {email,url,ts} is appended to that file.
 * Never logs the URL in production.
 */
export async function sendMagicLink({ email, url }: { email: string; url: string; token?: string }): Promise<void> {
  const isProd = process.env.VERCEL_ENV === "production";
  const sink = process.env.MAGIC_LINK_DEV_SINK;
  if (sink && !isProd) {
    const file = resolve(process.cwd(), sink);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ email, url, ts: Date.now() })}\n`);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!isProd) console.info(`[magic-link] ${email} -> ${url}`);
    else console.warn("[magic-link] RESEND_API_KEY is not set; magic link not delivered");
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? DEFAULT_FROM,
    to: email,
    subject: "Your LazyPrompt sign-in link",
    text: `Sign in to LazyPrompt:\n\n${url}\n\nThis link expires in 10 minutes. If you did not request it, you can ignore this email.`,
    html: `<p>Sign in to LazyPrompt:</p><p><a href="${url}">Sign in</a></p><p style="color:#666">This link expires in 10 minutes. If you did not request it, you can ignore this email.</p>`,
  });
  if (error) {
    console.error("[magic-link] Resend error", error.message);
    throw new Error("Could not send the sign-in email");
  }
}
