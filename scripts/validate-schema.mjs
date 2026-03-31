#!/usr/bin/env node
// Usage: node scripts/validate-schema.mjs <json-string>
// Validates a superpower script descriptor against the full Zod schema.
// Prints "OK: <name>" on success, or an error message on failure.
// Exits 0 on success, 1 on failure.

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { ScriptDescriptorSchema, formatZodError } = require(
  resolve(__dirname, 'superpower-schema.cjs'),
);

const raw = process.argv[2];

if (!raw) {
  console.error('Usage: validate-schema.mjs <json-string>');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (e) {
  console.error('Invalid JSON: ' + e.message);
  process.exit(1);
}

const result = ScriptDescriptorSchema.safeParse(parsed);
if (!result.success) {
  console.error(formatZodError(result.error));
  process.exit(1);
}

console.log('OK: ' + result.data.name);
