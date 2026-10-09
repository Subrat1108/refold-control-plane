import { defineConfig, devices } from '@playwright/test'

// Headless UI smoke test (CLAUDE.md's shipping protocol: run before pushing
// UI changes). Assumes a fresh `supabase db reset` has already been run — the
// test depends on the seeded, pre-verified TOTP factor (see seed.sql) and the
// fictional fixtures it signs in as.
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
    navigationTimeout: 60_000,
    actionTimeout: 30_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})
