// @ts-nocheck
import { jest } from '@jest/globals';

// Set test timeout
jest.setTimeout(30000);

// Mock firecrawl-js so tests don't make real network calls.
// The type exports (SearchResponse, FirecrawlDocument, etc.) were removed in
// newer SDK versions — mock the constructor and key methods generically.
jest.mock('@mendable/firecrawl-js', () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    apiKey: 'test-api-key',
    apiUrl: 'test-api-url',
    scrapeUrl: jest.fn().mockResolvedValue({ success: true, markdown: '# Test' }),
    search: jest.fn().mockResolvedValue({ success: true, data: [] }),
    crawlUrl: jest.fn().mockResolvedValue({ success: true, id: 'test-crawl-id' }),
    asyncBatchScrapeUrls: jest.fn().mockResolvedValue({ success: true, id: 'test-batch-id' }),
    checkBatchScrapeStatus: jest.fn().mockResolvedValue({
      success: true,
      status: 'completed',
      completed: 1,
      total: 1,
      data: [],
    }),
  })),
}));
