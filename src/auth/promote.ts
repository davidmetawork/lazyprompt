// CLI safe (import-graph rule): imported by src/auth/server.ts.
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { adminEmails } from "../lib/env";

/** Promotes the user to admin iff their email is in ADMIN_EMAILS AND the address is verified. */
export async function promoteIfAdmin(userId: string, email: string, emailVerified: boolean): Promise<void> {
  if (!emailVerified) return;
  if (!adminEmails().has(email.toLowerCase())) return;
  await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, userId));
}
