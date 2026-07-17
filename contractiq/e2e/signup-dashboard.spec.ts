import { test, expect } from '@playwright/test'

// Requires .env.test to point at a Supabase test project with email
// confirmation disabled or auto-confirmed (docs/specs/14-testing-spec.md §3).
test('signup lands on dashboard with empty state', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`

  await page.goto('/sign-up')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-secure-password-123')
  await page.getByRole('button', { name: 'Sign up' }).click()

  // On a test project with auto-confirm, sign-up redirects straight through
  // to sign-in/dashboard rather than showing the "check your email" state.
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('a-secure-password-123')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByText('No contracts reviewed yet')).toBeVisible()
})
