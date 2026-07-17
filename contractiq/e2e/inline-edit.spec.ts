import { test, expect } from '@playwright/test'
import { signIn } from './helpers'

// Requires FIXTURE_CONTRACT_ID env var pointing at an already-`completed`
// seeded contract in the test project — docs/specs/14-testing-spec.md §3.
test('inline edit persists across reload with an Edited badge', async ({ page }) => {
  const contractId = process.env.FIXTURE_CONTRACT_ID
  test.skip(!contractId, 'FIXTURE_CONTRACT_ID not set')

  await signIn(page)
  await page.goto(`/contracts/${contractId}`)

  await page.getByTestId('term-value').first().click()

  const input = page.locator('input[type="text"]').first()
  await input.fill('5 years from the Effective Date')
  await input.blur()

  await expect(page.getByText('Edited')).toBeVisible({ timeout: 5_000 })

  await page.reload()
  await expect(page.getByText('5 years from the Effective Date')).toBeVisible()
  await expect(page.getByText('Edited')).toBeVisible()
})
