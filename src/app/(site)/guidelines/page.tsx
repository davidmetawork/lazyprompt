import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/seo/policy-page";
import { buildMetadata } from "@/lib/seo/metadata";

const SUPPORT_EMAIL = "hello@lazyprompt.ai"; // TODO-owner-confirm

export const metadata: Metadata = buildMetadata({
  title: "Content guidelines",
  description: "What you can and cannot post on LazyPrompt: no jailbreaks, NSFW, personal data, malware, harassment or spam.",
  path: "/guidelines",
});

export default function GuidelinesPage() {
  return (
    <PolicyPage
      title="Content guidelines"
      intro="LazyPrompt works because the prompts are useful, original and safe to use. These are the rules for what you share here."
      supportEmail={SUPPORT_EMAIL}
    >
      <PolicySection id="welcome" title="What we welcome">
        <p>Practical, reusable prompts with clear variables, a sensible description and, ideally, an example of the output. Tell people which models you tested it on and why it works.</p>
      </PolicySection>
      <PolicySection id="not-allowed" title="What is not allowed">
        <ul>
          <li><strong>Jailbreaks.</strong> No prompts built to bypass an AI model&apos;s safety rules or to extract hidden system prompts.</li>
          <li><strong>NSFW content.</strong> No sexually explicit material, and nothing that sexualizes minors, ever.</li>
          <li><strong>Personal data.</strong> No real people&apos;s private information: emails, phone numbers, addresses, IDs, credentials or API keys, including your own.</li>
          <li><strong>Malware and harm.</strong> No prompts that aim to produce malware, scams, phishing or content that helps people get hurt.</li>
          <li><strong>Harassment and hate.</strong> No targeting, doxxing, threats or demeaning people for who they are.</li>
          <li><strong>Spam.</strong> No ads, affiliate or referral links, link farms, keyword stuffing, or the same prompt posted repeatedly.</li>
        </ul>
      </PolicySection>
      <PolicySection id="originality" title="Originality">
        <p>Post your own work. Do not copy prompts, text or examples you do not have the right to share. If you build on someone else&apos;s prompt, use Fork so they are credited.</p>
      </PolicySection>
      <PolicySection id="licensing" title="Licensing">
        <p>
          Prompts you publish are licensed to everyone under <a href="https://creativecommons.org/licenses/by/4.0/" rel="noopener noreferrer">CC BY 4.0</a> by default
          (reuse with credit), or <a href="https://creativecommons.org/publicdomain/zero/1.0/" rel="noopener noreferrer">CC0</a> if you choose to dedicate it to the public domain.
          You pick when you submit. See the <Link href="/terms">terms</Link> for details.
        </p>
      </PolicySection>
      <PolicySection id="moderation" title="How moderation works">
        <p>New prompts and comments may be checked automatically and, for newer accounts, reviewed by a person before they appear. Content that breaks these rules can be hidden or removed.</p>
        <ol>
          <li><strong>Strike one:</strong> the content is removed and you get a warning.</li>
          <li><strong>Strike two:</strong> the content is removed and your posting is limited for a while.</li>
          <li><strong>Strike three:</strong> your account is suspended.</li>
        </ol>
        <p>Severe violations, such as sexual content involving minors, malware or targeted harassment, can lead to an immediate ban.</p>
      </PolicySection>
      <PolicySection id="reports" title="Reporting a problem">
        <p>
          Use the Report button on any prompt or comment and choose a reason. Reports go to our moderators, who review them and either act or dismiss them.
          For copyright concerns, see the takedown section of the <Link href="/terms">terms</Link>. You can also email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </PolicySection>
    </PolicyPage>
  );
}
