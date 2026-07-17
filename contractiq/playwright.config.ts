import { defineConfig, devices } from '@playwright/test'

// Runs against a seeded Supabase test project (.env.test), per
// docs/specs/14-testing-spec.md §3. Requires `npx playwright install` and a
// running dev server (`npm run dev`) pointed at .env.test before use.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
