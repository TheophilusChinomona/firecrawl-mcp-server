// src/custom-tools/brand-audit.ts
// Custom tool: firecrawl_brand_audit
// Scrapes rawHtml + screenshot → extracts colours, fonts, logos → structured JSON.
import { z } from 'zod';
import { createClient } from './client.js';
function normaliseHex(hex) {
    // Expand #RGB to #RRGGBB
    if (hex.length === 4) {
        return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex.toUpperCase();
}
function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}
function extractColours(html) {
    const counts = new Map();
    // Match hex colours
    const hexPattern = /#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})\b/g;
    for (const match of html.matchAll(hexPattern)) {
        const hex = normaliseHex(match[0]);
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    // Match rgb/rgba colours
    const rgbPattern = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;
    for (const match of html.matchAll(rgbPattern)) {
        const hex = rgbToHex(Number(match[1]), Number(match[2]), Number(match[3]));
        counts.set(hex, (counts.get(hex) ?? 0) + 1);
    }
    const rawCount = [...counts.values()].reduce((a, b) => a + b, 0);
    // Sort by frequency, exclude near-white (#FFFFFF, #FEFEFE etc) and near-black (#000000, #111111)
    const filtered = [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([hex]) => hex)
        .filter(hex => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const brightness = (r + g + b) / 3;
        return brightness > 20 && brightness < 235; // exclude pure black and near-white
    })
        .slice(0, 20); // top 20 colours
    return { colours: filtered, rawCount };
}
function extractFontFamilies(html) {
    const seen = new Set();
    const pattern = /font-family\s*:\s*([^;}"']+)/gi;
    for (const match of html.matchAll(pattern)) {
        const raw = match[1].trim();
        // Split on comma, clean up each family name
        for (const part of raw.split(',')) {
            const name = part.trim().replace(/^['"]|['"]$/g, '');
            if (name && !name.toLowerCase().includes('inherit') && !name.toLowerCase().includes('initial')) {
                seen.add(name);
            }
        }
    }
    return [...seen].slice(0, 10);
}
function extractLogos(html, baseUrl) {
    const logos = [];
    const imgPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    for (const match of html.matchAll(imgPattern)) {
        const src = match[0];
        const url = match[1];
        // Heuristic: logo in filename, svg, or small dimensions mentioned, or alt contains logo
        const isLikelyLogo = /logo|brand|icon/i.test(url) ||
            url.endsWith('.svg') ||
            /alt=["'][^"']*logo[^"']*["']/i.test(src);
        if (isLikelyLogo) {
            logos.push(url.startsWith('http') ? url : new URL(url, baseUrl).href);
        }
    }
    return [...new Set(logos)].slice(0, 10);
}
function extractFavicons(html, baseUrl) {
    const favicons = [];
    const pattern = /<link[^>]+rel=["'][^"']*(?:icon|apple-touch-icon)[^"']*["'][^>]*href=["']([^"']+)["']/gi;
    for (const match of html.matchAll(pattern)) {
        const href = match[1];
        favicons.push(href.startsWith('http') ? href : new URL(href, baseUrl).href);
    }
    return [...new Set(favicons)];
}
function extractOgImage(html) {
    const match = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
        ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    return match?.[1] ?? null;
}
export function register(server) {
    server.addTool({
        name: 'firecrawl_brand_audit',
        description: `
Extract branding elements from any website — colours, typography, logos, and visual identity signals.

**How it works:** Scrapes the page's raw HTML and screenshot, then extracts hex colour palette, font families, logo URLs, favicon URLs, and OG image — returning structured JSON for design intelligence.

**Best for:** Brand research, design brief generation, competitor visual analysis.
**Not for:** Full-site crawls (use firecrawl_crawl). SEO analysis (use firecrawl_seo_audit).

**Usage Example:**
\`\`\`json
{
  "name": "firecrawl_brand_audit",
  "arguments": {
    "url": "https://stripe.com"
  }
}
\`\`\`

**Returns:** Structured JSON — colour palette (hex, frequency-sorted), font families, logo URLs, favicon URLs, og:image, and a screenshot URL for visual review.
`,
        parameters: z.object({
            url: z.string().url().describe('URL of the page to audit for branding elements'),
        }),
        execute: async (args, context) => {
            const { session } = context;
            const { url } = args;
            const client = createClient(session);
            const notes = [];
            let rawHtml = '';
            let screenshotUrl = null;
            try {
                // Try with screenshot first; fall back to rawHtml-only if it fails
                let raw;
                try {
                    raw = await client.scrape(url, { formats: ['rawHtml', 'screenshot'] });
                }
                catch {
                    raw = await client.scrape(url, { formats: ['rawHtml'] });
                    notes.push('Screenshot unavailable — falling back to HTML-only extraction.');
                }
                const doc = raw;
                rawHtml = doc.rawHtml ?? '';
                screenshotUrl = doc.screenshot ?? null;
                if (!rawHtml) {
                    notes.push('rawHtml was empty — colour and font extraction skipped.');
                }
                if (!screenshotUrl && !notes.some(n => n.includes('Screenshot unavailable'))) {
                    notes.push('Screenshot not available for this URL.');
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const result = {
                    url,
                    screenshot_url: null,
                    colours: [],
                    typography: { font_families: [] },
                    logos: [],
                    favicons: [],
                    og_image: null,
                    raw_colour_count: 0,
                    extraction_notes: [`Scrape failed — ${message}`],
                };
                return JSON.stringify(result, null, 2);
            }
            const { colours, rawCount } = extractColours(rawHtml);
            const fontFamilies = extractFontFamilies(rawHtml);
            const logos = extractLogos(rawHtml, url);
            const favicons = extractFavicons(rawHtml, url);
            const ogImage = extractOgImage(rawHtml);
            if (colours.length === 0)
                notes.push('No colour values extracted — page may use CSS variables or external stylesheets.');
            if (fontFamilies.length === 0)
                notes.push('No font-family declarations found in inline/embedded CSS.');
            const result = {
                url,
                screenshot_url: screenshotUrl,
                colours,
                typography: { font_families: fontFamilies },
                logos,
                favicons,
                og_image: ogImage,
                raw_colour_count: rawCount,
                extraction_notes: notes,
            };
            return JSON.stringify(result, null, 2);
        },
    });
}
