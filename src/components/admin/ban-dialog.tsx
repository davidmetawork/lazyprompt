"use client";

import { Ban } from "lucide-react";
import { setUserBanAction } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "./reason-dialog";
import { useAdminAction } from "./use-admin-action";

/** Ban button + confirmation dialog (reason required). The server rejects self-bans; its error is toasted. */
export function BanButton({
  userId, username, size = "sm",
}: { userId: string; username: string; size?: "xs" | "sm" }) {
  const { run, pending } = useAdminAction();
  return (
    <ReasonDialog
      trigger={<Button type="button" variant="destructive" size={size}><Ban /> Ban</Button>}
      title={`Ban @${username}?`}
      description="They are signed out immediately and cannot sign in again until unbanned. Their content stays as it is."
      confirmLabel="Ban user"
      reasonRequired
      reasonHelp="Recorded in the moderation log."
      busy={pending}
      onConfirm={(reason) =>
        run(() => setUserBanAction({ userId, banned: true, reason }), `Banned @${username}`)}
    />
  );
}

export function UnbanButton({ userId, username }: { userId: string; username: string }) {
  const { run, pending } = useAdminAction();
  return (
    <ReasonDialog
      trigger={<Button type="button" variant="outline" size="sm">Unban</Button>}
      title={`Unban @${username}?`}
      description="They will be able to sign in and post again."
      confirmLabel="Unban"
      destructive={false}
      busy={pending}
      onConfirm={(reason) =>
        run(() => setUserBanAction({ userId, banned: false, reason }), `Unbanned @${username}`)}
    />
  );
}
