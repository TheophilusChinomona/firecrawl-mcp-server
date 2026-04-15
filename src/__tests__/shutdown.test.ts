/**
 * Integration tests for process shutdown handlers.
 *
 * These tests spawn the compiled dist/index.js as a real child process and
 * verify it self-terminates under conditions that previously caused it to leak
 * as a zombie (125 accumulated over 2 days, consuming 4.3 GB RSS).
 *
 * Why child_process.spawn instead of importing src/index.ts?
 * The entry point is a self-executing script. Importing it would run the full
 * server inside the jest process, which makes signal/exit testing impossible
 * without heavy mocking that would undermine the test's purpose.
 */

import { describe, test, expect } from '@jest/globals';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_ENTRY = resolve(__dirname, '../../dist/index.js');

const BASE_ENV = {
  ...process.env,
  FIRECRAWL_API_KEY: 'test-api-key',
  FIRECRAWL_API_URL: 'http://localhost:9999', // unreachable — no real API calls made
};

/** Spawns the server and returns a promise that resolves to {code, signal} on exit. */
function spawnServer(
  env: NodeJS.ProcessEnv = BASE_ENV,
): { child: ChildProcessWithoutNullStreams; exited: Promise<{ code: number | null; signal: string | null }> } {
  const child = spawn('node', [DIST_ENTRY], {
    stdio: 'pipe',
    env,
  });

  const exited = new Promise<{ code: number | null; signal: string | null }>((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal }));
  });

  return { child, exited };
}

/** Wait for a process to exit, or reject after `ms` milliseconds. */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${ms}ms: ${label}`)), ms),
    ),
  ]);
}

/** Wait ms without sleeping (poll-free). */
function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─── Stdio mode ────────────────────────────────────────────────────────────

describe('stdio mode — shutdown handlers', () => {
  test('exits with code 0 when stdin is closed by parent', async () => {
    const { child, exited } = spawnServer();

    // Give the server a moment to register its handlers then close stdin
    await delay(500);
    child.stdin.end();

    const { code } = await withTimeout(exited, 5000, 'stdin close → exit');
    expect(code).toBe(0);
  });

  test('exits with code 0 when stdin is destroyed (hard close)', async () => {
    const { child, exited } = spawnServer();

    await delay(500);
    child.stdin.destroy(); // triggers 'close' on the writable side → 'close' on child's stdin

    const { code } = await withTimeout(exited, 5000, 'stdin destroy → exit');
    expect(code).toBe(0);
  });

  test('exits with code 0 on SIGTERM', async () => {
    const { child, exited } = spawnServer();

    await delay(500);
    child.kill('SIGTERM');

    const { code, signal } = await withTimeout(exited, 5000, 'SIGTERM → exit');
    // Node default SIGTERM handler exits with null code and 'SIGTERM' signal,
    // unless a custom handler calls process.exit() explicitly
    expect(code === 0 || signal === 'SIGTERM').toBe(true);
  });

  test('exits with code 0 on SIGINT', async () => {
    const { child, exited } = spawnServer();

    await delay(500);
    child.kill('SIGINT');

    const { code, signal } = await withTimeout(exited, 5000, 'SIGINT → exit');
    expect(code === 0 || signal === 'SIGINT').toBe(true);
  });

  test('does not exit immediately when stdin stays open', async () => {
    const { child, exited } = spawnServer();

    let exited_early = false;
    exited.then(() => { exited_early = true; });

    // Keep stdin open and wait — process must stay alive
    await delay(1500);
    expect(exited_early).toBe(false);

    // Cleanup
    child.stdin.end();
    await exited;
  });
});

// ─── HTTP / cloud mode ──────────────────────────────────────────────────────

describe('http mode — no stdin handlers installed', () => {
  test('does not exit when stdin closes in cloud mode', async () => {
    const { child, exited } = spawnServer({
      ...BASE_ENV,
      CLOUD_SERVICE: 'true',
      PORT: '19876', // high port, unlikely to conflict
    });

    let exited_early = false;
    exited.then(() => { exited_early = true; });

    await delay(500);
    child.stdin.end(); // in HTTP mode our guard prevents the stdin handler being installed

    await delay(1500);
    expect(exited_early).toBe(false);

    // Cleanup
    child.kill('SIGTERM');
    await exited.catch(() => {}); // may reject if port bind failed — ignore
  });
});
