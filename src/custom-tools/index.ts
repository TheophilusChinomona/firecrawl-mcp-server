// src/custom-tools/index.ts
// Custom tool barrel — registers all custom tools onto the FastMCP server.
//
// To add a new custom tool (stories 2.2–2.6):
//   1. Create src/custom-tools/<tool-name>.ts (copy example.ts as template)
//   2. Add:  import { register as register<ToolName> } from './<tool-name>.js';
//   3. Call: register<ToolName>(server); inside registerCustomTools()
//
// Do NOT modify src/index.ts for new tools — only this barrel needs updating.

import type { MCP } from './types.js';

import { register as registerResearch } from './research.js';
import { register as registerEnrich } from './enrich.js';
import { register as registerMonitor } from './monitor.js';
import { register as registerBrandAudit } from './brand-audit.js';
import { register as registerSeoAudit } from './seo-audit.js';

/**
 * Registers all custom Firecrawl MCP tools onto the server.
 * Called once from src/index.ts after all stock tools are registered.
 */
export function registerCustomTools(server: MCP): void {
  registerResearch(server);
  registerEnrich(server);
  registerMonitor(server);
  registerBrandAudit(server);
  registerSeoAudit(server);
}
