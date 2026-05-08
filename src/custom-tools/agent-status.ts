// src/custom-tools/agent-status.ts
// Custom tool: firecrawl_agent_status
// Checks the status of an agent job and returns results when complete.

import { z } from 'zod';
import type { MCP, SessionData } from './types.js';

export function register(server: MCP): void {
  server.addTool({
    name: 'firecrawl_agent_status',
    description: `
Check the status of an agent job and get results when complete.

**How it works:** Polls the status of an agent job started with firecrawl_agent. Returns processing status or final results.

**Best for:** Checking completion of agent jobs and retrieving extracted information.

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_agent_status",
  "arguments": {
    "jobId": "018f1b5c-1234-5678-9abc-def012345678"
  }
}
\`\`\`

**Returns:** Job status and results if complete. If still processing, returns current status.
`,
    parameters: z.object({
      jobId: z.string().uuid().describe('Agent job ID from firecrawl_agent'),
    }),
    execute: async (args, context) => {
      const { session } = context as { session?: SessionData };
      const { jobId } = args as { jobId: string };

      const apiUrl = process.env.FIRECRAWL_API_URL;
      const apiKey = session?.firecrawlApiKey;

      if (!apiUrl) {
        throw new Error(
          'FIRECRAWL_API_URL environment variable is not set. ' +
          'Set it to your self-hosted Firecrawl instance URL.'
        );
      }

      try {
        const headers: Record<string, string> = {};

        if (apiKey) {
          headers['Authorization'] = `Bearer ${apiKey}`;
        }

        const response = await fetch(`${apiUrl}/v2/agent/${jobId}`, {
          method: 'GET',
          headers,
        });

        const result = await response.json();

        if (!result.success) {
          return `Failed to get agent status: ${result.error || 'Unknown error'}`;
        }

        if (result.status === 'processing') {
          return `🔄 Enhanced agent job ${jobId} is actively processing with local AI.

**Status:** Deep research in progress
**Mode:** Self-hosted with extended time limits
**Capabilities:** Multi-depth analysis, source synthesis, structured output

Please check again in a few minutes for comprehensive results.`;
        }

        if (result.status === 'completed') {
          const data = result.data;
          let output = `✅ Enhanced self-hosted agent job ${jobId} completed successfully!\n\n`;

          if (data?.finalAnalysis) {
            output += `## Deep Research Analysis\n${data.finalAnalysis}\n\n`;
          }

          if (data?.sources && Array.isArray(data.sources)) {
            output += `## Sources\n`;
            data.sources.forEach((source: any, i: number) => {
              output += `${i + 1}. [${source.title || source.url}](${source.url})\n`;
            });
            output += '\n';
          }

          if (data?.activities && Array.isArray(data.activities)) {
            output += `## Activities\n`;
            data.activities.forEach((activity: any, i: number) => {
              output += `${i + 1}. ${activity}\n`;
            });
            output += '\n';
          }

          if (data?.json) {
            output += `## Structured Extraction Results\n\`\`\`json\n${JSON.stringify(data.json, null, 2)}\n\`\`\`\n\n`;
          }

          output += `---\n*Processed with enhanced self-hosted AI capabilities - no API limits or costs*`;

          return output;
        }

        if (result.status === 'failed') {
          return `Agent job ${jobId} failed: ${result.error || 'Unknown error'}`;
        }

        return `Agent job ${jobId} status: ${result.status}`;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return `Failed to get agent status: ${message}`;
      }
    },
  });
}