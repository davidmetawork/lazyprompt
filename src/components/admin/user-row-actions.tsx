"use client";

import { useId } from "react";
import { setTrustLevelAction } from "@/actions/admin";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TrustLevel } from "@/lib/types";
import { BanButton, UnbanButton } from "./ban-dialog";
import { useAdminAction } from "./use-admin-action";

const TRUST_OPTIONS: { value: 0 | 1 | 2; label: string }[] = [
  { value: 0, label: "0 - New" },
  { value: 1, label: "1 - Member" },
  { value: 2, label: "2 - Trusted" },
];

export function TrustSelect({ userId, username, level }: { userId: string; username: string; level: TrustLevel }) {
  const { run, pending } = useAdminAction();
  const labelId = useId();
  // Level 3 is staff/system and is not assignable here; show it read-only.
  if (level === 3) return <span className="text-sm">3 - Staff</span>;
  return (
    <>
      <span id={labelId} className="sr-only">Trust level for @{username}</span>
      <Select
        value={String(level)}
        disabled={pending}
        onValueChange={(v) => {
          const next = Number(v);
          if (next === 0 || next === 1 || next === 2) {
            void run(() => setTrustLevelAction({ userId, level: next }), `Trust level set to ${next}`);
          }
        }}
      >
        <SelectTrigger size="sm" aria-labelledby={labelId} className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TRUST_OPTIONS.map((o) => <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </>
  );
}

/** Ban/unban control. Not rendered on the admin's own row (the server also rejects self-bans). */
export function UserBanControl({
  userId, username, banned, isSelf,
}: { userId: string; username: string; banned: boolean; isSelf: boolean }) {
  if (isSelf) return <span className="text-xs text-muted-foreground">You</span>;
  return banned ? <UnbanButton userId={userId} username={username} /> : <BanButton userId={userId} username={username} />;
}
