import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck } from "lucide-react";
import { safeNext } from "@/lib/validation";
import { Container } from "@/components/layout/container";

export const metadata: Metadata = { title: "Check your email", robots: { index: false, follow: false } };

export default async function CheckEmailPage(props: PageProps<"/sign-in/check-email">) {
  const sp = await props.searchParams;
  const email = typeof sp.email === "string" ? sp.email : null;
  const next = safeNext(typeof sp.next === "string" ? sp.next : undefined);
  const signInHref = next === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`;
  return (
    <Container className="max-w-md py-20 text-center">
      <MailCheck className="mx-auto size-10 text-primary" />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">Check your email</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {email ? <>We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>. </> : "We sent you a sign-in link. "}
        It expires in 10 minutes.
      </p>
      <p className="mt-6 text-sm">
        <Link href={signInHref} className="text-primary underline underline-offset-4">Use a different email</Link>
      </p>
    </Container>
  );
}
