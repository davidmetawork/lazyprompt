import type { Metadata } from "next";
import Link from "next/link";
import { PolicyPage, PolicySection } from "@/components/seo/policy-page";
import { buildMetadata } from "@/lib/seo/metadata";

const SUPPORT_EMAIL = "hello@lazyprompt.ai"; // TODO-owner-confirm

export const metadata: Metadata = buildMetadata({
  title: "Privacy",
  description: "What LazyPrompt collects, why, who processes it, how long it is kept, and the controls you have.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <PolicyPage
      title="Privacy"
      intro="We collect as little as we need to run LazyPrompt. Here is exactly what, and why, in plain language."
      supportEmail={SUPPORT_EMAIL}
    >
      <PolicySection id="collect" title="What we collect">
        <ul>
          <li><strong>Account details.</strong> If you sign in, your name, email address and avatar from Google or GitHub, or just your email address if you use an emailed sign-in link.</li>
          <li><strong>Your content.</strong> Prompts, ratings, comments, saves, reports and profile details (username, bio, website) you choose to add. Prompts, comments and your public profile are visible to everyone.</li>
          <li><strong>Usage counts.</strong> When someone copies, opens or rates a prompt we record the event together with a hashed form of the IP address and the browser user agent, so we can count unique use and limit abuse. We do not store raw IP addresses.</li>
          <li><strong>Site analytics.</strong> Vercel Analytics, which is cookieless and does not track you across sites.</li>
        </ul>
        <p>Browsing, searching and copying prompts without an account does not require giving us any personal details.</p>
      </PolicySection>
      <PolicySection id="why" title="Why we use it">
        <ul>
          <li>To run the service: sign you in, show your content, and send sign-in emails.</li>
          <li>To rank prompts and show popularity (copies, ratings).</li>
          <li>To keep the community safe: rate limiting, spam detection and moderation.</li>
          <li>To understand which pages work so we can improve them.</li>
        </ul>
        <p>We do not sell your data and we do not show ads.</p>
      </PolicySection>
      <PolicySection id="processors" title="Who processes data for us">
        <ul>
          <li><strong>Vercel</strong>: hosting and cookieless analytics.</li>
          <li><strong>Neon</strong>: our database.</li>
          <li><strong>Resend</strong>: delivering sign-in emails.</li>
          <li><strong>Google and GitHub</strong>: sign-in, if you choose those options.</li>
          <li><strong>OpenAI moderation</strong>: if enabled, submitted prompt and comment text may be sent to OpenAI&apos;s moderation service to check for policy violations.</li>
        </ul>
      </PolicySection>
      <PolicySection id="retention" title="How long we keep it">
        <ul>
          <li>Usage events (copy, open and similar) are deleted after 90 days.</li>
          <li>Account details and your content are kept while your account exists. When you delete content or your account, we remove it, apart from limited records we need for safety or to meet legal duties.</li>
        </ul>
      </PolicySection>
      <PolicySection id="controls" title="Your controls">
        <ul>
          <li>Edit or delete your own prompts and comments at any time.</li>
          <li>Update your username, bio and website in <Link href="/settings">settings</Link>.</li>
          <li>To delete your account, or to ask for a copy of your data, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the address on the account.</li>
        </ul>
      </PolicySection>
      <PolicySection id="apps" title="The ChatGPT and Claude app">
        <p>
          When you use LazyPrompt inside ChatGPT or Claude, the tool inputs the assistant sends us, such as the values you filled in for a prompt&apos;s variables, are processed to
          render the prompt and are not stored. Signing in through the app uses the same account as the website. What ChatGPT or Claude does with your conversation is covered by their own privacy policies.
        </p>
      </PolicySection>
      <PolicySection id="age" title="Age">
        <p>LazyPrompt is for people aged 13 and over. If you believe a child under 13 has an account, email us and we will remove it.</p>
      </PolicySection>
      <PolicySection id="changes" title="Changes and contact">
        <p>If this policy changes we will update the date above. Questions or requests: <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.</p>
      </PolicySection>
    </PolicyPage>
  );
}
