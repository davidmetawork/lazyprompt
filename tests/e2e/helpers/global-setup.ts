// Playwright globalSetup (runs AFTER the webServer is up): migrate (no-op if current), reset, seed fixtures.
// The reset keeps `jwks` and `oauth_resource`: the running server seeds them once at startup.
import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { loadTestEnv } from "../../../scripts/lib/env-files";
import { E2E_DATABASE_URL, E2E_MAGIC_LINK_SINK } from "./constants";

export default async function globalSetup() {
  loadTestEnv();
  process.env.DATABASE_URL = E2E_DATABASE_URL;          // must be set before src/db is first used
  const { prepareDatabase } = await import("../../../scripts/lib/db-admin");
  const { resetDb } = await import("../../helpers/db");
  const { seedFixtures } = await import("../../../scripts/seed");
  const { closeDb } = await import("../../../src/db");

  await prepareDatabase(E2E_DATABASE_URL);
  await resetDb({ keep: ["jwks", "oauth_resource"] });
  const counts = await seedFixtures();
  console.log(`e2e db ready (fixtures: ${counts.inserted} inserted)`);
  rmSync(resolve(process.cwd(), E2E_MAGIC_LINK_SINK), { force: true });
  await closeDb();
}
