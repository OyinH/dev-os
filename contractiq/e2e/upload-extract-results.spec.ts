import { test, expect } from '@playwright/test'
import path from 'path'
import { signIn } from './helpers'

// Requires e2e/fixtures/nda-fixture-01.pdf (a small sample NDA) and a
// Supabase test project — docs/specs/14-testing-spec.md §3.
test('upload → extract → results shows at least one term with page and confidence', async ({ page }) => {
  await signIn(page)

  await page.goto('/upload')
  await page.getByRole('radio', { name: /NDA/i }).click()
  await page.getByRole('button', { name: 'Continue' }).click()

  await page.setInputFiles('input[type="file"]', path.join(__dirname, 'fixtures', 'nda-fixture-01.pdf'))
  await page.getByRole('button', { name: 'Upload contract' }).click()

  // Preview step (Spec 04) — proceed without adding a custom term.
  await expect(page.getByText("Terms we'll extract:")).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Process Contract' }).click()

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 })
  await page.getByRole('row').first().click()

  await expect(page.getByText(/Page \d+/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/%$/).first()).toBeVisible()
})
