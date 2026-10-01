import type { Metadata } from "next";
import { requireViewer } from "@/auth/viewer";
import { SettingsForm } from "@/components/community/settings-form";
import { Container } from "@/components/layout/container";
import { getProfileByUsername } from "@/server/users";

export const metadata: Metadata = { title: "Settings", robots: { index: false, follow: false } };

export default async function SettingsPage() {
  const viewer = await requireViewer("/settings");
  const profile = await getProfileByUsername(viewer.username);
  return (
    <Container className="max-w-xl py-10">
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-2 text-muted-foreground">Signed in as {viewer.email}. Only your username, bio and website are public.</p>
      <div className="mt-8">
        <SettingsForm username={viewer.username} bio={profile?.bio ?? ""} website={profile?.website ?? ""} />
      </div>
    </Container>
  );
}
