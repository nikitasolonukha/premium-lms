import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
// Validated private image derivatives are served by signed URLs, outside the
// shared Next image optimizer. Native images are intentional here.
export default defineConfig([...nextVitals, ...nextTs, {rules:{'@next/next/no-img-element':'off'}}, globalIgnores(['.next/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'docs/qa/**', '.local/**', 'src/lib/database.types.ts'])]);
