// src/custom-tools/monitor.ts
// Custom tool: firecrawl_monitor
// First call: scrape URL and store as baseline.
// Subsequent calls: scrape again, diff against baseline, update baseline, return diff.

import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { MCP, SessionData } from './types.js';
import { createClient } from './client.js';

interface Baseline {
  url: string;
  label?: string;
  capturedAt: string;
  content: string;
}

interface DiffResult {
  status: 'baseline_established' | 'changed' | 'unchanged' | 'error';
  url: string;
  label?: string;
  baseline_captured_at?: string;
  current_captured_at?: string;
  diff?: {
    added: string[];
    removed: string[];
    summary: string;
  };
  error?: string;
}

function getDataDir(): string {
  return process.env.MONITOR_DATA_DIR ?? path.join(process.cwd(), '.monitor-baselines');
}

function urlToFilename(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex') + '.json';
}

function getBaselinePath(url: string): string {
  return path.join(getDataDir(), urlToFilename(url));
}

function loadBaseline(url: string): Baseline | null {
  const filePath = getBaselinePath(url);
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as Baseline;
  } catch {
    return null;
  }
}

function saveBaseline(baseline: Baseline): void {
  const dir = getDataDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getBaselinePath(baseline.url), JSON.stringify(baseline, null, 2), 'utf-8');
}

function diffContent(oldContent: string, newContent: string): { added: string[]; removed: string[]; summary: string } {
  const oldLines = new Set(oldContent.split('\n').map(l => l.trim()).filter(Boolean));
  const newLines = new Set(newContent.split('\n').map(l => l.trim()).filter(Boolean));

  const added = [...newLines].filter(l => !oldLines.has(l));
  const removed = [...oldLines].filter(l => !newLines.has(l));

  const summary = added.length === 0 && removed.length === 0
    ? 'No textual changes detected.'
    : `${added.length} line(s) added, ${removed.length} line(s) removed.`;

  return { added: added.slice(0, 50), removed: removed.slice(0, 50), summary };
}

export function register(server: MCP): void {
  server.addTool({
    name: 'firecrawl_monitor',
    description: `
Monitor a URL for content changes by comparing against a stored baseline.

**How it works:** First call scrapes the page and stores it as a baseline. Every subsequent call scrapes the current content, diffs it against the baseline, updates the baseline, and returns the diff.

**Best for:** Detecting when a page has changed since you last checked it (pricing pages, news pages, competitor sites).
**Not for:** Full-site crawls (use firecrawl_crawl). Real-time monitoring (this tool is called on-demand).

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_monitor",
  "arguments": {
    "url": "https://example.com/pricing",
    "label": "Example Pricing Page"
  }
}
\`\`\`

**Returns:** On first call — baseline_established status. On subsequent calls — changed or unchanged status with added/removed lines diff.

**Baselines stored at:** \`MONITOR_DATA_DIR\` env var or \`.monitor-baselines/\` in server working directory.
`,
    parameters: z.object({
      url: z.string().url().describe('URL to monitor'),
      label: z.string().optional().describe('Human-readable label for this monitored URL (optional)'),
    }),
    execute: async (args, context) => {
      const { session } = context as { session?: SessionData };
      const { url, label } = args as { url: string; label?: string };
      const client = createClient(session);
      const now = new Date().toISOString();

      // Scrape current content
      let currentContent: string;
      try {
        const raw = await client.scrape(url, {
          formats: ['markdown'],
          onlyMainContent: true,
        } as any);
        const doc = raw as { markdown?: string };
        currentContent = doc.markdown ?? '';
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const existing = loadBaseline(url);
        const result: DiffResult = {
          status: 'error',
          url,
          label,
          baseline_captured_at: existing?.capturedAt,
          error: `Scrape failed — ${message}. Baseline preserved (not overwritten).`,
        };
        return JSON.stringify(result, null, 2);
      }

      const existing = loadBaseline(url);

      if (!existing) {
        // First call — establish baseline
        saveBaseline({ url, label, capturedAt: now, content: currentContent });
        const result: DiffResult = {
          status: 'baseline_established',
          url,
          label,
          baseline_captured_at: now,
        };
        return JSON.stringify(result, null, 2);
      }

      // Subsequent call — diff and update
      const diff = diffContent(existing.content, currentContent);
      saveBaseline({ url, label: label ?? existing.label, capturedAt: now, content: currentContent });

      const hasChanges = diff.added.length > 0 || diff.removed.length > 0;
      const result: DiffResult = {
        status: hasChanges ? 'changed' : 'unchanged',
        url,
        label: label ?? existing.label,
        baseline_captured_at: existing.capturedAt,
        current_captured_at: now,
        diff,
      };
      return JSON.stringify(result, null, 2);
    },
  });
}
