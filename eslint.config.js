import config from "@echristian/eslint-config"

export default [
  ...config({
    prettier: {
      plugins: ["prettier-plugin-packagejson"],
    },
  }),
  {
    files: ["tests/**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "unicorn/consistent-function-scoping": "off",
      "unicorn/prefer-single-call": "off",
      "max-lines-per-function": "off",
      complexity: "off",
    },
  },
]
