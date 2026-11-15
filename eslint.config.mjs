import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // The app asks in its own dialog (src/components/dialog.tsx), never the browser's.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/dialog.tsx"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use ask() from src/components/dialog.tsx." },
        { name: "alert", message: "Use toast from src/components/toast.tsx." },
        { name: "prompt", message: "Use a form or ask() from src/components/dialog.tsx." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "confirm", message: "Use ask() from src/components/dialog.tsx." },
        { object: "window", property: "alert", message: "Use toast from src/components/toast.tsx." },
        { object: "window", property: "prompt", message: "Use a form or ask() from src/components/dialog.tsx." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // MkDocs output.
    "site/**",
  ]),
]);

export default eslintConfig;
