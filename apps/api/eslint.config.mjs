import js from "@eslint/js";
import babelParser from "@babel/eslint-parser";
import globals from "globals";

export default [
  { ignores: ["dist/**", "node_modules/**"] },
  {
    ...js.configs.recommended,
    files: ["tests/k6/**/*.js"],
    languageOptions: { globals: { __ENV: "readonly" } },
  },
  {
    files: ["**/*.ts"],
    ...js.configs.recommended,
    languageOptions: {
      parser: babelParser,
      globals: globals.node,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: { presets: ["@babel/preset-typescript"] },
      },
    },
    // TypeScript checks identifiers and unused declarations, including type-only names.
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "off",
      "no-unused-vars": "off",
    },
  },
];
