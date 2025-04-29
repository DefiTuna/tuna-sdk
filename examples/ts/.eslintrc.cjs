/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  ignorePatterns: [".eslintrc.js"],
  extends: ["@defituna/eslint-config/index.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
};
