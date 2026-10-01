/* eslint-disable @typescript-eslint/no-unused-vars */
// STUB owned by data-write (ensureProfile is real, owned by the foundation in src/db/profiles.ts).
import "server-only";
import { notImplemented } from "@/lib/errors";
import type { ProfileInput } from "@/lib/validation";
import type { ProfilePage, TrustLevel, Viewer } from "@/lib/types";

export { ensureProfile } from "@/db/profiles";

export async function getProfileByUsername(username: string): Promise<ProfilePage | null> {
  return notImplemented("getProfileByUsername");
}
export async function updateProfile(actor: Viewer, input: ProfileInput): Promise<ProfilePage> {
  return notImplemented("updateProfile");
}
export async function recomputeTrustLevel(userId: string): Promise<TrustLevel> {
  return notImplemented("recomputeTrustLevel");
}
/** Users with activity in the last N days (default 2); returns the number whose trust level changed. */
export async function recomputeActiveTrustLevels(sinceDays?: number): Promise<number> {
  return notImplemented("recomputeActiveTrustLevels");
}
