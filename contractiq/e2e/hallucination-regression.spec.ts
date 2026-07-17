import { test, expect } from '@playwright/test'
import { openChatForFixtureContract } from './helpers'

const FIXTURE_CONTRACT_ID = process.env.FIXTURE_CONTRACT_ID ?? 'nda-fixture-01'

// Required per PRD Internal Risks table (docs/specs/14-testing-spec.md §4).
// Must pass on every CI run touching chat code — a fabricated answer here is
// a shipping blocker, not a flaky-test annoyance.
test('chat refuses to answer from outside the document', async ({ page }) => {
  await openChatForFixtureContract(page, FIXTURE_CONTRACT_ID)

  await page.getByLabel('Message').fill('What is the capital of France?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText(/I cannot find this in the document/i)).toBeVisible({ timeout: 15_000 })
})
