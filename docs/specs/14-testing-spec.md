# Spec 14 — Testing Strategy

**Source:** `engineering-doc.md` §13
**Frameworks:** Vitest, React Testing Library, Playwright, pgTAP

---

## 1. Unit — Vitest

**Target:** ≥80% coverage on `lib/`, `hooks/`, `stores/`.

Priority targets (highest-risk logic, not just highest line count):

| Module | What to test |
|---|---|
| `normalizeConfidence` (Spec 03) | `0.0→0`, `1.0→100`, `0.876→87.6`, out-of-range values clamp to `[0,100]` |
| `classifyQuery` (Spec 06) | Each keyword bucket, no-keyword default (`'contract'`), mixed history+contract signal → `'both'` |
| `callOpenAIWithRetry` (Spec 11) | Retries exactly 3× on 429/5xx, no retry on 4xx, exponential delay sequence, success on 2nd attempt short-circuits remaining retries |
| `validateCustomTerm` (Spec 04) | Empty/whitespace, >100 chars, case-insensitive duplicate vs. standard and custom terms |
| `confidenceColor` (Spec 13) | Boundary values exactly at 50 and 80 |

Example test structure:

```ts
// lib/__tests__/normalize-confidence.test.ts
import { describe, it, expect } from 'vitest'
import { normalizeConfidence } from '../normalize-confidence'

describe('normalizeConfidence', () => {
  it('scales 0.0-1.0 to 0-100', () => {
    expect(normalizeConfidence(0.876)).toBe(87.6)
  })
  it('clamps values above 1.0', () => {
    expect(normalizeConfidence(1.4)).toBe(100)
  })
  it('clamps negative values to 0', () => {
    expect(normalizeConfidence(-0.2)).toBe(0)
  })
})
```

## 2. Component — React Testing Library + Vitest

**Target:** key interactive components.

| Component | Assertions |
|---|---|
| `KeyTermCard` | Confidence colour-coding renders the correct Tailwind class per bucket; `LowConfidenceWarning` tooltip is present and **not dismissible** (no close button, no click-outside handler that hides it) when `confidence_score < 50` |
| `ChatComposer` | Submit disabled on empty/whitespace input; disabled while a mutation is in flight; re-enabled on mutation settle (success or error) |
| `UploadWizard` | Step transitions only advance on valid state (e.g. cannot reach `preview` without `contractType` set) |
| `TermValueEditable` | Clicking value enters edit mode; blur triggers save; failed save reverts to previous displayed value |

## 3. E2E — Playwright

**Target:** core flows, run against a seeded Supabase test project (separate from production, `.env.test`).

| Flow | Steps asserted |
|---|---|
| Signup → dashboard | Sign up → verify (test project has email confirmation disabled or auto-confirmed) → land on `/dashboard` with empty state |
| Upload → extract → results | Upload a fixture NDA PDF → term preview renders → click "Process Contract" → results page shows ≥1 term with a page number and confidence score |
| Inline edit | Click a term value → edit → blur → "Edited" badge appears → reload page → edited value persists |
| Chat Q&A | Open chat → ask a question answerable from the fixture contract → response arrives within 15s with a `[Page X]` citation chip |

## 4. Hallucination regression — Playwright + fixture contract

**Required per PRD Internal Risks table.** Automated, not manual.

```ts
// e2e/hallucination-regression.spec.ts
test('chat refuses to answer from outside the document', async ({ page }) => {
  await openChatForFixtureContract(page, 'nda-fixture-01')
  await page.getByRole('textbox', { name: 'Message' }).fill('What is the capital of France?')
  await page.getByRole('button', { name: 'Send' }).click()

  await expect(page.getByText(/I cannot find this in the document/i)).toBeVisible({ timeout: 15_000 })
})
```

## 5. RLS / security — SQL test suite (pgTAP)

**Required pre-launch per PRD Internal Risks table.** Attempts cross-user reads/writes on every table, asserts denial.

```sql
-- supabase/tests/rls_cross_user.sql (pgTAP)
begin;
select plan(7);

-- Seed two users and one contract owned by user A
select tests.create_supabase_user('user_a@test.com');
select tests.create_supabase_user('user_b@test.com');

-- ... insert a contract as user_a ...

-- As user_b, attempt to select user_a's contract
select tests.authenticate_as('user_b@test.com');
select is_empty(
  $$ select * from contracts where user_id = tests.get_supabase_uid('user_a@test.com') $$,
  'user_b cannot read user_a''s contracts'
);

-- As user_b, attempt to update user_a's key_terms via the joined-table policy
select throws_ok(
  $$ update key_terms set value = 'hacked' where contract_id = '<user_a_contract_id>' $$,
  'user_b cannot update key_terms belonging to user_a''s contract'
);

-- Repeat the pattern for custom_key_terms, chat_sessions, chat_messages, user_feedback, term_corrections (select-only)

select * from finish();
rollback;
```

Every table in `docs/specs/supabase-schema.sql` must have at least one cross-user denial test before launch — this is a hard gate, not a nice-to-have, per the PRD.

## 6. Extraction accuracy (offline eval, not part of CI)

**Target:** ≥88% F1 (NDA), ≥85% F1 (MSA). Run every release, not on every CI push (uses real OpenAI calls against a labelled test set — cost and latency make it unsuitable for per-commit CI).

- Test set: 30 NDA + 20 MSA contracts, CUAD-derived, with ground-truth term/value/page labels
- Script: `scripts/eval-extraction.ts` — calls the same `buildNdaSystemPrompt`/`buildMsaSystemPrompt` functions used in production (Spec 03), scores each extracted term against ground truth (exact match on `value`, tolerant match on `page_number` ±0)
- Output: per-term-name F1, aggregate F1 by contract type, logged to a dated file under `eval-results/` for trend tracking across releases

## 7. CI wiring

| Job | Runs on | Blocks merge |
|---|---|---|
| Vitest unit + component | Every push | Yes |
| Playwright E2E (core flows + hallucination regression) | Every push to `main`, every PR | Yes |
| pgTAP RLS suite | Every push touching `docs/specs/supabase-schema.sql` or `supabase/migrations/**` | Yes |
| Offline extraction eval | Manual trigger / release branches only | No (informational, tracked over time) |

## 8. Acceptance Criteria

- [ ] `lib/`, `hooks/`, `stores/` unit coverage ≥80%
- [ ] Hallucination regression test passes on every CI run touching chat code
- [ ] Every table in the schema has a passing cross-user RLS denial test
- [ ] Extraction eval F1 meets the PRD targets before each release is tagged
