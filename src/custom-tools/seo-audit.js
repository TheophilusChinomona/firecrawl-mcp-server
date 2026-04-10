// src/custom-tools/seo-audit.ts
// Custom tool: firecrawl_seo_audit
// Scrapes page with rawHtml + markdown + links → extracts SEO signals → structured JSON audit.
import { z } from 'zod';
import { createClient } from './client.js';
function extractMeta(rawHtml, firecrawlMeta) {
    const getMetaContent = (pattern) => {
        const match = rawHtml.match(pattern);
        return match?.[1] ?? null;
    };
    const title = firecrawlMeta['title'] ?? getMetaContent(/<title[^>]*>([^<]+)<\/title>/i);
    const description = firecrawlMeta['description'] ??
        getMetaContent(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
        getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    const ogTitle = firecrawlMeta['ogTitle'] ??
        getMetaContent(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const ogDescription = firecrawlMeta['ogDescription'] ??
        getMetaContent(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const ogImage = firecrawlMeta['ogImage'] ??
        getMetaContent(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    const canonical = getMetaContent(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
    const robots = getMetaContent(/<meta[^>]+name=["']robots["'][^>]+content=["']([^"']+)["']/i) ??
        getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']robots["']/i);
    const twitterCard = getMetaContent(/<meta[^>]+name=["']twitter:card["'][^>]+content=["']([^"']+)["']/i) ??
        getMetaContent(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:card["']/i);
    return {
        title: title ?? null,
        title_length: title?.length ?? 0,
        description: description ?? null,
        description_length: description?.length ?? 0,
        og_title: ogTitle ?? null,
        og_description: ogDescription ?? null,
        og_image: ogImage ?? null,
        canonical: canonical ?? null,
        robots: robots ?? null,
        twitter_card: twitterCard ?? null,
    };
}
function extractHeaders(markdown) {
    const h1 = [];
    const h2 = [];
    const h3 = [];
    for (const line of markdown.split('\n')) {
        const h1Match = line.match(/^# (.+)$/);
        const h2Match = line.match(/^## (.+)$/);
        const h3Match = line.match(/^### (.+)$/);
        if (h1Match)
            h1.push(h1Match[1].trim());
        else if (h2Match)
            h2.push(h2Match[1].trim());
        else if (h3Match)
            h3.push(h3Match[1].trim());
    }
    return {
        h1: h1.slice(0, 20),
        h2: h2.slice(0, 20),
        h3: h3.slice(0, 20),
        h1_count: h1.length,
        h2_count: h2.length,
        h3_count: h3.length,
    };
}
function partitionLinks(links, pageHostname) {
    const internal = [];
    const external = [];
    for (const link of links) {
        try {
            const linkHost = new URL(link.url).hostname;
            if (linkHost === pageHostname || linkHost.endsWith('.' + pageHostname)) {
                internal.push(link.url);
            }
            else {
                external.push(link.url);
            }
        }
        catch {
            // Invalid URL — skip
        }
    }
    return { internal, external };
}
function detectIssues(result) {
    const issues = [];
    if (!result.meta.title)
        issues.push('Missing <title> tag');
    else if (result.meta.title_length < 30)
        issues.push(`Title too short (${result.meta.title_length} chars, recommend 30–60)`);
    else if (result.meta.title_length > 60)
        issues.push(`Title too long (${result.meta.title_length} chars, recommend 30–60)`);
    if (!result.meta.description)
        issues.push('Missing meta description');
    else if (result.meta.description_length < 70)
        issues.push(`Meta description too short (${result.meta.description_length} chars, recommend 70–160)`);
    else if (result.meta.description_length > 160)
        issues.push(`Meta description too long (${result.meta.description_length} chars, recommend 70–160)`);
    if (result.headers.h1_count === 0)
        issues.push('No H1 heading found');
    if (result.headers.h1_count > 1)
        issues.push(`Multiple H1 headings (${result.headers.h1_count}) — should have exactly one`);
    if (!result.meta.og_title)
        issues.push('Missing og:title (Open Graph)');
    if (!result.meta.og_description)
        issues.push('Missing og:description (Open Graph)');
    if (!result.meta.og_image)
        issues.push('Missing og:image (Open Graph)');
    if (!result.meta.canonical)
        issues.push('Missing canonical URL');
    if (result.content.word_count < 300)
        issues.push(`Low word count (${result.content.word_count} words — recommend 300+ for SEO value)`);
    return issues;
}
export function register(server) {
    server.addTool({
        name: 'firecrawl_seo_audit',
        description: `
Extract SEO signals from any webpage — meta tags, header hierarchy, link counts, content structure, and detected issues.

**How it works:** Scrapes the page using rawHtml + markdown + links formats, then extracts meta tags (title, description, OG, Twitter), header hierarchy (H1/H2/H3), internal/external link counts, word count, and structured data presence. Optionally maps the full site for page count.

**Best for:** SEO audits, competitor analysis, pre-launch checklists.
**Not for:** Full-site crawls (use firecrawl_crawl). Brand extraction (use firecrawl_brand_audit).

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_seo_audit",
  "arguments": {
    "url": "https://example.com",
    "includeMap": false
  }
}
\`\`\`

**Returns:** Structured JSON — meta tags with lengths, header hierarchy (H1/H2/H3 text and counts), link partition (internal vs external), word count, structured data flag, detected SEO issues list, and optionally site map page count.
`,
        parameters: z.object({
            url: z.string().url().describe('URL of the page to audit'),
            includeMap: z
                .boolean()
                .optional()
                .describe('Whether to map the full site for page count (default: false, slower for large sites)'),
        }),
        execute: async (args, context) => {
            const { session } = context;
            const { url, includeMap } = args;
            const client = createClient(session);
            // Step 1: Scrape page
            let rawHtml = '';
            let markdown = '';
            let links = [];
            let firecrawlMeta = {};
            try {
                const raw = await client.scrape(url, {
                    formats: ['rawHtml', 'markdown', 'links'],
                    onlyMainContent: false, // Need full HTML for meta tags in <head>
                });
                const doc = raw;
                rawHtml = doc.rawHtml ?? '';
                markdown = doc.markdown ?? '';
                links = doc.links ?? [];
                firecrawlMeta = doc.metadata ?? {};
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                return JSON.stringify({
                    url,
                    error: `Scrape failed — ${message}`,
                    meta: null,
                    headers: null,
                    links: null,
                    content: null,
                    issues: [`Scrape failed — cannot perform SEO audit`],
                }, null, 2);
            }
            // Step 2: Extract signals
            const pageHostname = new URL(url).hostname;
            const meta = extractMeta(rawHtml, firecrawlMeta);
            const headers = extractHeaders(markdown);
            const { internal, external } = partitionLinks(links, pageHostname);
            const wordCount = markdown.split(/\s+/).filter(Boolean).length;
            const hasStructuredData = /application\/ld\+json|schema\.org/i.test(rawHtml);
            const partial = {
                url,
                meta,
                headers,
                links: {
                    internal_count: internal.length,
                    external_count: external.length,
                    internal_sample: internal.slice(0, 10),
                    external_sample: external.slice(0, 10),
                },
                content: { word_count: wordCount, has_structured_data: hasStructuredData },
            };
            const issues = detectIssues(partial);
            const result = { ...partial, issues };
            // Step 3: Optional site map
            if (includeMap) {
                try {
                    const mapData = await client.map(url, { limit: 500 });
                    const urls = Array.isArray(mapData) ? mapData : mapData.links ?? [];
                    result.site_map = {
                        total_pages: urls.length,
                        sample_urls: urls.slice(0, 20),
                    };
                }
                catch {
                    // Map failed — non-fatal, omit site_map from result
                }
            }
            return JSON.stringify(result, null, 2);
        },
    });
}
