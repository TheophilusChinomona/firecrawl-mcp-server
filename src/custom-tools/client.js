// src/custom-tools/client.ts
// Shared FirecrawlApp factory for custom tools.
// Mirrors the self-hosted getClient() logic from src/index.ts.
// Do NOT import from src/index.ts — circular dependency.
import FirecrawlApp from '@mendable/firecrawl-js';
/**
 * Creates a FirecrawlApp client configured for the self-hosted instance.
 * For self-hosted: FIRECRAWL_API_URL from env, API key optional.
 * Used by all custom tools (stories 2.2–2.6).
 */
export function createClient(session) {
    const config = {};
    if (process.env.FIRECRAWL_API_URL) {
        config['apiUrl'] = process.env.FIRECRAWL_API_URL;
    }
    if (session?.firecrawlApiKey) {
        config['apiKey'] = session.firecrawlApiKey;
    }
    return new FirecrawlApp(config);
}
