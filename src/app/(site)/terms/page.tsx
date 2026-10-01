import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/seo/policy-page";
import { buildMetadata } from "@/lib/seo/metadata";

const SUPPORT_EMAIL = "hello@lazyprompt.ai"; // TODO-owner-confirm

export const metadata: Metadata = buildMetadata({
  title: "Terms of use",
  description: "The rules for using LazyPrompt: how content is licensed, acceptable use, takedowns, termination and warranties.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <PolicyPage
      title="Terms of use"
      intro="By using LazyPrompt you agree to these terms. They are written to be read."
      supportEmail={SUPPORT_EMAIL}
    >
      <PolicySection id="use" title="Using the site">
        <p>
          LazyPrompt is provided free, as is. You may browse, copy and use prompts for any purpose, subject to each prompt&apos;s license.
          You are responsible for how you use a prompt and for the output of any AI tool you paste it into. Check important output before relying on it.
        </p>
      </PolicySection>
      <PolicySection id="license" title="Your content and the license you grant">
        <p>You own what you post. When you publish a prompt you license it to everyone under the license you select: <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">CC BY 4.0</a> (default) or <a href="https://creativecommons.org/publicdomain/zero/1.0/" rel="noopener noreferrer">CC0</a>.</p>
        <p>You also give LazyPrompt a worldwide, non-exclusive, royalty-free license to host, display, reproduce, adapt for formatting, and distribute your content (including through our feed, search results and the ChatGPT and Claude app) for as long as it is on the site.</p>
        <p>Only post content you have the right to share. You confirm it is yours or you have permission, and that it follows the <Link href="/guidelines">content guidelines</Link>.</p>
      </PolicySection>
      <PolicySection id="acceptable" title="Acceptable use">
        <ul>
          <li>Do not break the law or break the content guidelines.</li>
          <li>Do not attack, overload or probe the service, or try to get around rate limits or security.</li>
          <li>Do not scrape at a rate that harms the site. Be considerate; our feed and sitemap are there for you.</li>
          <li>Do not impersonate others or create accounts to evade a suspension.</li>
        </ul>
      </PolicySection>
      <PolicySection id="takedown" title="Copyright and takedown requests">
        <p>
          If you believe content on LazyPrompt infringes your copyright, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with: the URL of the content,
          a description of your work, your contact details, a statement that you believe in good faith the use is not authorized, and a statement that your notice is accurate.
          We will review it and may remove the content and tell the person who posted it.
        </p>
      </PolicySection>
      <PolicySection id="termination" title="Moderation and termination">
        <p>We may hide or remove content, limit features, or suspend accounts that break these terms or the guidelines. You can stop using LazyPrompt at any time and ask us to delete your account (see <Link href="/privacy">privacy</Link>).</p>
      </PolicySection>
      <PolicySection id="warranty" title="No warranty">
        <p>
          LazyPrompt and everything on it is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind. Prompts are written by community members; we do not
          guarantee they are accurate, safe or suitable for your purpose. To the extent the law allows, we are not liable for losses arising from your use of the site or its content.
        </p>
      </PolicySection>
      <PolicySection id="changes" title="Changes and contact">
        <p>We may update these terms and will change the date above when we do. Continuing to use the site means you accept the update. Questions: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </PolicySection>
    </PolicyPage>
  );
}
