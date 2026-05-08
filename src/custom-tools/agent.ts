// src/custom-tools/agent.ts
// Custom tool: firecrawl_agent
// Starts an agent job that researches and extracts information from URLs.

import { z } from 'zod';
import type { MCP, SessionData } from './types.js';

export function register(server: MCP): void {
  server.addTool({
    name: 'firecrawl_agent',
    description: `
Start an enhanced self-hosted agent job with deep research capabilities.

**How it works:** Uses local AI processing to perform multi-depth research across URLs, analyzing findings, choosing next research topics, and providing comprehensive analysis with source citations.

**Enhanced Features:**
- Configurable research depth and time limits
- Multi-format output (markdown + structured JSON)
- Automatic source deduplication and prioritization
- Local processing with no API limits

**Best for:** Deep research, comprehensive analysis, and structured data extraction from web sources.

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_agent",
  "arguments": {
    "urls": ["https://example.com/docs", "https://example.com/api"],
    "prompt": "Analyze the API documentation and extract key endpoints with examples",
    "schema": {"type": "object", "properties": {"endpoints": {"type": "array"}}},
    "maxDepth": 7,
    "maxUrls": 15,
    "timeLimit": 900,
    "formats": ["markdown", "json"]
  }
}
\`\`\`

**Returns:** Job ID for tracking enhanced self-hosted processing.
`,
    parameters: z.object({
      urls: z.array(z.string().url()).min(1).describe('URLs to analyze'),
      prompt: z.string().min(1).describe('Instructions for what information to extract'),
      schema: z.record(z.any()).optional().describe('JSON schema for structured output'),
      maxDepth: z.number().min(1).max(10).optional().describe('Research depth (default: 5)'),
      maxUrls: z.number().min(1).max(50).optional().describe('Maximum URLs to process (default: 20)'),
      timeLimit: z.number().min(30).max(1800).optional().describe('Time limit in seconds (default: 600)'),
      formats: z.array(z.enum(["markdown", "json"])).optional().describe('Output formats (default: both)'),
    }),
    execute: async (args, context) => {
      const { session } = context as { session?: SessionData };
      const { urls, prompt, schema, maxDepth, maxUrls, timeLimit, formats } = args as {
        urls: string[];
        prompt: string;
        schema?: Record<string, any>;
        maxDepth?: number;
        maxUrls?: number;
        timeLimit?: number;
        formats?: string[];
      };

      const apiUrl = process.env.FIRECRAWL_API_URL;
      const apiKey = session?.firecrawlApiKey;

      if (!apiUrl) {
        throw new Error(
          'FIRECRAWL_API_URL environment variable is not set. ' +
          'Set it to your self-hosted Firecrawl instance URL.'
        );
      }

      try {
        const agentBody: any = {
          urls,
          prompt,
          maxDepth,
          maxUrls,
          timeLimit,
          formats,
        };

        if (schema) {
          agentBody.schema = schema;
          agentBody.strictSchema = true;
        }

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${apiUrl}/v2/agent`, {
          method: 'POST',
          headers,
          body: JSON.stringify(agentBody),
        });

        const result = await response.json();

        if (!result.success) {
          return `Enhanced agent job failed to start: ${result.error || 'Unknown error'}`;
        }

        return `🚀 Enhanced self-hosted agent job started with deep research capabilities.

**Job ID:** ${result.id}
**Processing Mode:** Local AI with configurable depth and time limits
**Capabilities:** Multi-source analysis, structured extraction, citation tracking

Use firecrawl_agent_status to monitor progress and retrieve comprehensive results.`;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return `Failed to start agent job: ${message}`;
      }
    },
  });
}