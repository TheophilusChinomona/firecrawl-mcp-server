#!/usr/bin/env node
/**
 * Postinstall patch: strip $schema (draft 2020-12) from firecrawl-fastmcp
 * tool schemas so AJV draft-07 clients (OpenClaw, VS Code, etc.) don't choke.
 *
 * See: https://github.com/firecrawl/firecrawl-mcp-server/issues/118
 *
 * What it does:
 *   Replaces the bare `import { toJsonSchema } from "xsschema"` in FastMCP.js
 *   with a wrapper that recursively deletes the `$schema` property from the
 *   JSON Schema output before it reaches MCP clients.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, '..', 'node_modules', 'firecrawl-fastmcp', 'dist', 'FastMCP.js');

const ORIGINAL = 'import { toJsonSchema } from "xsschema";';
const PATCHED = `import { toJsonSchema as _toJsonSchema } from "xsschema";

// Patch: strip $schema (draft 2020-12) from tool schemas so AJV draft-07 clients don't choke
// See: https://github.com/firecrawl/firecrawl-mcp-server/issues/118
function stripDollarSchema(obj) {
  if (obj == null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) { obj.forEach(stripDollarSchema); return obj; }
  delete obj["$schema"];
  for (const v of Object.values(obj)) stripDollarSchema(v);
  return obj;
}
const toJsonSchema = async (schema) => stripDollarSchema(await _toJsonSchema(schema));`;

let src;
try {
  src = readFileSync(target, 'utf8');
} catch {
  console.log('[patch-fastmcp] FastMCP.js not found — skipping (probably a fresh install).');
  process.exit(0);
}

if (src.includes('_toJsonSchema')) {
  console.log('[patch-fastmcp] Already patched — skipping.');
  process.exit(0);
}

if (!src.includes(ORIGINAL)) {
  console.warn('[patch-fastmcp] WARNING: Could not find expected import line. FastMCP may have been updated. Manual patching required.');
  process.exit(1);
}

writeFileSync(target, src.replace(ORIGINAL, PATCHED), 'utf8');
console.log('[patch-fastmcp] Patched FastMCP.js — $schema will be stripped from tool schemas.');
