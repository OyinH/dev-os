import { Page, expect } from '@playwright/test'

// Requires a seeded Supabase test project (.env.test) with these fixtures
// already loaded — see docs/specs/14-testing-spec.md §3. `nda-fixture-01`
// must be an already-`completed` contract owned by the test user so chat is
// enabled immediately without waiting on a live extraction run.
export const TEST_USER = {
  email: process.env.E2E_TEST_EMAIL ?? 'e2e-test@example.com',
  password: process.env.E2E_TEST_PASSWORD ?? 'test-password-please-change',
}

export async function signIn(page: Page) {
  await page.goto('/sign-in')
  await page.getByLabel('Email').fill(TEST_USER.email)
  await page.getByLabel('Password').fill(TEST_USER.password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}

export async function openChatForFixtureContract(page: Page, fixtureContractId: string) {
  await signIn(page)
  await page.goto(`/contracts/${fixtureContractId}`)
  await page.getByRole('button', { name: 'Open contract chat' }).click()
}
