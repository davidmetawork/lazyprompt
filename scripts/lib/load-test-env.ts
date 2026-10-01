// Side-effect module: loads .env.test.local > .env.local > .env into process.env (real env always wins).
// ESM hoists `import`s above any statement, so a config that calls loadTestEnv() in its body would read
// process.env (via other imports such as tests/e2e/helpers/constants.ts) BEFORE the files are loaded.
// Import this module FIRST (`import "./scripts/lib/load-test-env";`) wherever env must be ready at import time.
import { loadTestEnv } from "./env-files";

loadTestEnv();
