import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // --- deliberately relaxed -------------------------------------------
    // The engine is a hand-written, performance-sensitive canvas renderer;
    // these rules fight that style without catching real defects.
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "off",
    "react/no-unescaped-entities": "off",
    "@next/next/no-img-element": "off",
    "no-console": "off",
    "no-empty": "off",
    "no-case-declarations": "off",

    // --- actually enforced ----------------------------------------------
    // Everything below used to be silenced wholesale. These are the rules
    // that catch real bugs (stale closures, dead bindings, unreachable code),
    // so they are back on.
    "@typescript-eslint/no-unused-vars": ["warn", {
      args: "none",
      varsIgnorePattern: "^_",
      caughtErrors: "none",
      ignoreRestSiblings: true,
    }],
    "react-hooks/exhaustive-deps": "warn",
    "prefer-const": "warn",
    "no-unreachable": "error",
    "no-redeclare": "error",
    "no-fallthrough": "error",
    "no-useless-escape": "warn",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills"]
}];

export default eslintConfig;
