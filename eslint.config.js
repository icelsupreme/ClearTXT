const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  // Claude Code skill assets, not part of this project's own source -
  // linting them under app-specific rules (e.g. script.js's browser-only
  // globals) doesn't apply and isn't this repo's responsibility to enforce.
  { ignores: [".claude/**"] },
  js.configs.recommended,
  {
    files: ["eslint.config.js", "test/**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node
    }
  },
  {
    files: ["script.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      // Runs as a browser script, but feature-detects `module`/`require`
      // (UMD-style) so its pure logic can also be `require()`d from tests.
      globals: Object.assign({}, globals.browser, globals.node)
    },
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }]
    }
  }
];
