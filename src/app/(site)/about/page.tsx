import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/seo/policy-page";
import { buildMetadata } from "@/lib/seo/metadata";

const SUPPORT_EMAIL = "hello@lazyprompt.ai"; // TODO-owner-confirm

export const metadata: Metadata = buildMetadata({
  title: "About",
  description: "LazyPrompt is a free community library of AI prompts you can fill in, copy and use in the AI tool you already have.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <PolicyPage
      title="About LazyPrompt"
      intro="A free, community-built library of AI prompts. Find one that works, fill in the blanks, copy it, done."
      supportEmail={SUPPORT_EMAIL}
    >
      <PolicySection id="what" title="What it is">
        <p>
          Good prompts take time to write. LazyPrompt collects the ones that work so you do not start from a blank page.
          Every prompt is a template with clearly marked variables. Fill them in, then copy the result or open it prefilled
          in ChatGPT, Claude, Grok or Perplexity.
        </p>
        <p>LazyPrompt never runs an AI model itself. It only helps you find and prepare the prompt. Your conversation stays in the tool you choose.</p>
      </PolicySection>
      <PolicySection id="free" title="Free, with no account to browse">
        <p>
          Browsing, searching, filling in and copying prompts is free and needs no account. Signing in (with Google, GitHub
          or an emailed link) lets you submit prompts, rate and comment on them, save favorites and fork a prompt to make your own version.
        </p>
      </PolicySection>
      <PolicySection id="community" title="Community powered">
        <p>
          Anyone with an account can share a prompt. Prompts are published under an open license (CC BY 4.0 by default, or CC0
          if the author prefers), so others can reuse and improve them. The <Link href="/guidelines">content guidelines</Link> explain what belongs here.
        </p>
      </PolicySection>
      <PolicySection id="ranking" title="How ranking works">
        <ul>
          <li><strong>Top</strong> favors prompts people rate highly. A few ratings are not enough to rank a prompt high, so a prompt needs real feedback to climb.</li>
          <li><strong>Trending</strong> favors prompts that are being copied, opened and rated right now, and fades as the buzz fades.</li>
          <li><strong>New</strong> shows the most recently published prompts.</li>
          <li>On prompts where you can tell us whether it worked, that feedback counts too.</li>
        </ul>
        <p>Rankings are automatic. Nobody can pay to move a prompt up.</p>
      </PolicySection>
      <PolicySection id="apps" title="Use it inside ChatGPT and Claude">
        <p>LazyPrompt also works as an app in ChatGPT and Claude. <Link href="/apps">See how to connect it</Link>.</p>
      </PolicySection>
      <PolicySection id="contact" title="Get in touch">
        <p>Questions, ideas or problems: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </PolicySection>
    </PolicyPage>
  );
}
