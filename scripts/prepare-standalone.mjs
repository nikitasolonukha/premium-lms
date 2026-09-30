import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import ts from 'typescript';
// Compile the SAME schema for a plain Node entrypoint; no second validation schema.
const { outputText } = ts.transpileModule(readFileSync('src/lib/config.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
writeFileSync('.next/standalone/runtime-config.mjs', outputText);
copyFileSync('scripts/runtime-entrypoint.mjs', '.next/standalone/runtime-entrypoint.mjs');
console.log('Standalone runtime validation prepared without embedding environment values.');
