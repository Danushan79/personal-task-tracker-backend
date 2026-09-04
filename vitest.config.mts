import path from 'node:path';

import { defineConfig } from 'vitest/config';

const alias = { '@': path.resolve(process.cwd(), './src') };

export default defineConfig({
  test: {
    environment: 'node',
    projects: [
      {
        // Pure functions, no database — must stay fast (TESTING.md, Unit layer).
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        // HTTP/smoke tests against a real in-memory MongoDB. The mongod binary
        // is a one-time ~800MB download, hence the generous hook timeout.
        resolve: { alias },
        test: {
          name: 'integration',
          include: ['tests/**/*.test.ts'],
          setupFiles: ['./tests/setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 300_000,
        },
      },
    ],
  },
});
