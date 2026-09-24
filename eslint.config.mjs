import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: [".next/**", "src/generated/**", "data/**", "docs/**", ".next-e2e/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
];
export default config;
