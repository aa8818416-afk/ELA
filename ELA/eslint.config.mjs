import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Supabase's JS client returns untyped data; suppressing until full DB types are propagated
      "@typescript-eslint/no-explicit-any": "warn",
      // useCallback/useEffect patterns with stable server-fetching functions — not a runtime issue
      "react-hooks/exhaustive-deps": "warn",
      // Unused vars from catch clauses and prefixed with _ are intentional
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_", "caughtErrorsIgnorePattern": "^_" }],
    },
  },
];

export default eslintConfig;
