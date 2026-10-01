import type { ReactNode } from "react";

export const POLICY_LAST_UPDATED = "2026-10-01";

/** Typeset wrapper shared by the static policy pages (server component, no client JS). */
export function PolicyPage({ title, intro, supportEmail, children }: {
  title: string; intro: string; supportEmail: string; children: ReactNode;
}) {
  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10 border-b pb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
        <p className="mt-4 text-lg text-muted-foreground text-pretty">{intro}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated <time dateTime={POLICY_LAST_UPDATED}>{POLICY_LAST_UPDATED}</time>
          <span aria-hidden> · </span>
          Contact <a className="underline underline-offset-4 hover:text-foreground" href={`mailto:${supportEmail}`}>{supportEmail}</a>
        </p>
      </header>
      <div className="space-y-10">{children}</div>
    </article>
  );
}

export function PolicySection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3 leading-7 text-foreground/90 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-foreground [&_li]:pl-1 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6">
      <h2 id={id} className="scroll-mt-24 text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      {children}
    </section>
  );
}
