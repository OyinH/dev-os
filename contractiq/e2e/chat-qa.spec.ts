import { test, expect } from '@playwright/test'
import { openChatForFixtureContract } from './helpers'

const FIXTURE_CONTRACT_ID = process.env.FIXTURE_CONTRACT_ID ?? 'nda-fixture-01'

test('chat answers a question grounded in the fixture contract with a page citation', async ({ page }) => {
  await openChatForFixtureContract(page, FIXTURE_CONTRACT_ID)

  await page.getByLabel('Message').fill('Does this contract auto-renew?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText(/Based on the document/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: /^Page \d+$/ })).toBeVisible()
})
