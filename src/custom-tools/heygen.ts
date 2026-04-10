
import { z } from 'zod';
import type { MCP } from './types.js';
import axios from 'axios';

export function register(server: MCP): void {
  server.addTool({
    name: 'firecrawl_heygen',
    description: 'Generate a video from a text prompt using the Heygen API.',
    parameters: z.object({
      prompt: z.string().describe('The text prompt to generate the video from.'),
      apiKey: z.string().describe('Your Heygen API key.'),
    }),
    execute: async (args) => {
      const { prompt, apiKey } = args as { prompt: string; apiKey: string };
      try {
        const response = await axios.post(
          'https://api.heygen.com/v1/video_agent/generate',
          { prompt },
          {
            headers: {
              'X-API-KEY': apiKey,
              'Content-Type': 'application/json',
            },
          }
        );
        return JSON.stringify(response.data, null, 2);
      } catch (error) {
        return JSON.stringify({ success: false, error: (error as Error).message }, null, 2);
      }
    },
  });
}
