import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,ts}"], plugins: { js }, extends: ["js/recommended"] },
  { files: ["**/*.{js,mjs,cjs,ts}"], languageOptions: { globals: globals.node } },
  tseslint.configs.recommended,
  eslintConfigPrettier,
  [
    {
      rules: {
        "no-param-reassign": ["error"],
        "@typescript-eslint/consistent-type-imports": "error",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            argsIgnorePattern: "^_",
            ignoreRestSiblings: true,
            varsIgnorePattern: "^_",
          },
        ],
      },
    },
  ],
]);
