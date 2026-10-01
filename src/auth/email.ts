// CLI safe (import-graph rule): imported by src/auth/server.ts which must load under tsx and the Better Auth CLI.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Resend } from "resend";

const DEFAULT_FROM = "LazyPrompt <login@lazyprompt.ai>";

/**
 * Whether a magic link can be delivered: Resend is configured, or this is not production (the link is logged).
 * A production build with a dev sink (the e2e server) is the only production-mode case allowed to skip email.
 */
export function canSendMagicLink(): boolean {
  if (process.env.RESEND_API_KEY) return true;
  const isProd = process.env.VERCEL_ENV === "production";
  const isProdBuild = isProd || process.env.NODE_ENV === "production";
  return !(isProd || (isProdBuild && !process.env.MAGIC_LINK_DEV_SINK));
}

/**
 * Sends the magic-link email. Uses Resend when RESEND_API_KEY is set; otherwise logs the URL to the console.
 * When MAGIC_LINK_DEV_SINK is set (and VERCEL_ENV !== production) a JSON line {email,url,ts} is appended to that file.
 * Never logs the URL in production. In production without RESEND_API_KEY it throws, so the form shows an error
 * instead of a false "check your email".
 */
export async function sendMagicLink({ email, url }: { email: string; url: string; token?: string }): Promise<void> {
  const isProd = process.env.VERCEL_ENV === "production";
  const sink = process.env.MAGIC_LINK_DEV_SINK;
  if (sink && !isProd) {
    // The sink path is dynamic by design (dev/test only); keep Turbopack from tracing the whole project for it.
    const file = resolve(/*turbopackIgnore: true*/ process.cwd(), sink);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify({ email, url, ts: Date.now() })}\n`);
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (!canSendMagicLink()) {
      console.error("[magic-link] RESEND_API_KEY is not set; sign-in email not delivered");
      throw new Error("Sign-in email is not configured");
    }
    console.info(`[magic-link] ${email} -> ${url}`);
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
