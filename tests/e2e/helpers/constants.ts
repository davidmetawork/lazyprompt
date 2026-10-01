import { DEFAULT_E2E_DATABASE_URL, DEFAULT_E2E_PORT } from "../../../scripts/lib/env-files";

export const E2E_PORT = Number(process.env.E2E_PORT ?? DEFAULT_E2E_PORT);
export const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;
export const E2E_DATABASE_URL = process.env.TEST_DATABASE_URL_E2E ?? DEFAULT_E2E_DATABASE_URL;
/** Relative to the repo root (the server's cwd). Kept per worktree because .data/ is gitignored. */
export const E2E_MAGIC_LINK_SINK = process.env.E2E_MAGIC_LINK_SINK ?? `.data/e2e-magic-links-${E2E_PORT}.jsonl`;
export const E2E_ADMIN_EMAIL = "admin@e2e.test";
