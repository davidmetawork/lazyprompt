import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**", "out/**", "build/**", "next-env.d.ts", "node_modules/**",
    "coverage/**", "playwright-report/**", "test-results/**", "drizzle/**", "widget/dist/**",
    "src/mcp/widget-html.generated.ts", ".data/**",
  ]),
  {
    // `useCase` is a pgEnum (spec section 3), not a React hook.
    files: ["src/db/schema/**"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
    },
  },
]);
