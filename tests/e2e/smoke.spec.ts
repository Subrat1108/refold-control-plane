import { test, expect, type Page } from '@playwright/test'
import crypto from 'node:crypto'

// Headless UI smoke test (Cleanup 2, equal-admins Parts 3-4 session).
// Signs in as the fictional super admin through the REAL login UI and the
// REAL MFA challenge screen — not a bypass. seed.sql seeds a pre-verified
// TOTP factor for this user with the fixed secret below (local-only fixture
// data, same category as every other fictional seed row; the secret is
// plain text in the local Postgres instance, confirmed by direct inspection
// — nothing about production auth is weakened by a test knowing it).
const TOTP_SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP'

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const char of input.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0')
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

function computeTotp(secret: string): string {
  const counter = Buffer.alloc(8)
  counter.writeBigInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)))
  const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3]
  return (code % 1_000_000).toString().padStart(6, '0')
}

// Collects console errors + uncaught page errors so each step can assert
// none happened, without re-wiring listeners per step.
function trackErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', (err) => errors.push(err.message))
  return errors
}

async function expectNoErrors(page: Page, errors: string[]) {
  await expect(page.getByText('An unexpected error occurred')).not.toBeVisible()
  expect(errors, `console/page errors: ${JSON.stringify(errors)}`).toEqual([])
}

test('super admin smoke: Home, Portfolio, Account 360, Approvals, Audit log, Standups, People', async ({ page }) => {
  const errors = trackErrors(page)

  // ── Login (real form) + MFA challenge (real screen, seeded factor) ──────
  await page.goto('/login')
  await page.fill('#email', 'super@refold.internal')
  await page.fill('#password', 'demo-super-2026')
  await page.click('button[type="submit"]')

  await expect(page.getByText('Two-factor authentication')).toBeVisible()
  await page.getByPlaceholder('123456').fill(computeTotp(TOTP_SECRET))
  await page.click('button[type="submit"]')

  // ── Home ─────────────────────────────────────────────────────────────
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible()
  await expectNoErrors(page, errors)

  // ── Portfolio → open an Account 360 → click each tab ────────────────
  await page.getByRole('link', { name: 'Portfolio' }).click()
  await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible()
  await expectNoErrors(page, errors)

  // Stage 2b: an account with tenants expands in place on the board, so the
  // hierarchy is visible without leaving it. Cloud accounts have none and
  // show no chevron — one table, not two designs.
  // Asserted, not guarded: seed fixtures give two accounts tenants, so a
  // conditional here could pass while the feature was broken — which is
  // precisely how the tenant-parent bug reached the owner.
  const expander = page.getByRole('button', { name: 'Expand' }).first()
  await expect(expander).toBeVisible()
  await expander.click()
  await expect(page.getByText(/tenant[s]? — one per signup/).first()).toBeVisible()
  const tenantLink = page.locator('a[href*="/tenants/"]').first()
  await expect(tenantLink).toBeVisible()
  await tenantLink.click()
  await expect(page.getByRole('heading', { name: 'Where it runs' })).toBeVisible()
  await expectNoErrors(page, errors)
  await page.goBack()
  await expectNoErrors(page, errors)

  const firstAccountLink = page.locator('table a[href^="/accounts/"]').first()
  await expect(firstAccountLink).toBeVisible()
  const accountName = (await firstAccountLink.textContent())?.trim()
  const accountId = ((await firstAccountLink.getAttribute('href')) ?? '').replace('/accounts/', '')
  await firstAccountLink.click()
  if (accountName) await expect(page.getByRole('heading', { name: accountName })).toBeVisible()
  await expectNoErrors(page, errors)

  for (const tabName of ['Overview', 'Deployment', 'Projects', 'Escalations', 'Tickets', 'Engagements', 'Action items', 'Metrics']) {
    await page.getByRole('tab', { name: tabName }).click()
    await expectNoErrors(page, errors)
  }

  // ── Sync runner (7.5-pre2 Session 5): click Refresh on Tickets, confirm
  // the runner actually ran end to end (stub mode — supabase/.env sets
  // CS_SYNC_STUB_MODE=true locally, so this never calls real Refold/
  // Anthropic) by checking "Last synced: never" becomes a real timestamp,
  // not by guessing the exact outcome wording. ──
  await page.getByRole('tab', { name: 'Tickets' }).click()
  await expect(page.getByText('Last synced: never')).toBeVisible()
  // Two "Refresh" buttons are visible on this tab (the header's refresh-
  // everything button plus this tab's own) — scope to the row carrying
  // "Last synced" so this clicks the Tickets-specific one, not the header's.
  const ticketsRefreshRow = page.locator('div').filter({ has: page.getByText('Last synced: never') }).last()
  await ticketsRefreshRow.getByRole('button', { name: 'Refresh' }).click()
  await expect(page.getByText('Last synced: never')).not.toBeVisible({ timeout: 20_000 })
  await expectNoErrors(page, errors)

  // ── Tenants & sources (7.5-pre2 Session 1): add a tenant, confirm it shows ──
  await page.getByRole('tab', { name: 'Overview' }).click()
  await page.getByRole('button', { name: 'Add tenant' }).click()
  await page.getByPlaceholder('Northwind Program').fill('Smoke test tenant')
  await page.getByRole('button', { name: 'Add tenant' }).last().click()
  await expect(page.getByText('Smoke test tenant')).toBeVisible()
  await expectNoErrors(page, errors)

  // one write: add a milestone on the first project, if one exists
  const addProjectButton = page.getByRole('button', { name: 'Add project' })
  await page.getByRole('tab', { name: 'Projects' }).click()
  if (await addProjectButton.isVisible()) {
    await addProjectButton.click()
    await page.getByRole('dialog').locator('input').first().fill('Smoke test project')
    await page.getByRole('button', { name: 'Add project' }).last().click()
    await expect(page.getByText('Smoke test project').first()).toBeVisible()
  }
  await expectNoErrors(page, errors)

  // ── Approvals → approve one pending proposal ────────────────────────
  await page.getByRole('link', { name: 'Approvals' }).click()
  await expect(page.getByRole('heading', { name: 'Approvals' })).toBeVisible()
  await expectNoErrors(page, errors)

  const approveButton = page.getByRole('button', { name: 'Approve', exact: true }).first()
  if (await approveButton.isVisible()) {
    await approveButton.click()
    await page.waitForTimeout(500) // let the mutation + refetch settle
  }
  await expectNoErrors(page, errors)

  // ── Stage 2a: the deployment picture lives on the account page now ──
  await page.goto('/accounts/' + accountId)
  await page.getByRole('tab', { name: 'Deployment' }).click()
  await expect(page.getByRole('heading', { name: 'Deployment', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Platform metrics' })).toBeVisible()
  await expectNoErrors(page, errors)

  // Stage 2b: an account's own details are editable — they used to be
  // write-once, which is untenable when half are created mid-approval from
  // a name the agent guessed.
  await page.getByRole('button', { name: 'Edit' }).first().click()
  await expect(page.getByRole('dialog', { name: 'Edit account' })).toBeVisible()
  await expect(page.getByLabel('Account name')).toBeVisible()
  await expect(page.getByLabel('Lifecycle stage')).toBeVisible()
  await expect(page.getByLabel('Deployment model')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expectNoErrors(page, errors)

  // An old customer-detail link folds into it rather than showing half the
  // picture.
  await page.goto('/cloud-customers/' + accountId)
  await expect(page).toHaveURL(new RegExp('/accounts/' + accountId))
  await expectNoErrors(page, errors)

  await page.getByRole('link', { name: 'Approvals' }).click()

  // ── Approvals as ONE list, one card design ──
  // A record with no account is not a different species from one that has
  // an account: same frame, same evidence, same actions — it just carries
  // the control that supplies the missing answer.
  await expect(page.getByText('No account yet').first()).toBeVisible()
  await expect(page.getByText('smoke test escalation (map existing)').first()).toBeVisible()

  await page.getByRole('button', { name: 'Set account' }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // Creating an account inline uses the real Add-account form, not a bare
  // name field — a account made here is a complete one.
  await page.getByLabel('Account', { exact: true }).selectOption('__new_account__')
  await expect(page.getByLabel('Deployment type')).toBeVisible()
  await expect(page.getByLabel('Deployment model')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel' }).first().click()

  // Creating a TENANT must work too, and its parent list must contain every
  // account — gating it on deployment_model left exactly one selectable,
  // because accounts created from an approval have no model set.
  await page.getByLabel('Account', { exact: true }).selectOption('__new_tenant__')
  await expect(page.getByText('New tenant')).toBeVisible()
  const parent = page.getByLabel('Which account does it sit under?')
  await expect(parent).toBeVisible()
  await expect(parent.getByRole('option', { name: /Prism Analytics/ })).toBeAttached()
  await expect(parent.getByRole('option', { name: /Meridian Laboratories/ })).toBeAttached()
  // ...and an account can be created from right here.
  await expect(parent.getByRole('option', { name: '+ Create a new account…' })).toBeAttached()
  await parent.selectOption({ label: 'Prism Analytics' })
  await page.getByLabel('Tenant name').fill('E2E Tenant')
  await page.getByRole('button', { name: 'Create tenant' }).click()
  // Creating it selects it, shown as a tenant under its account.
  await expect(page.getByRole('option', { name: /E2E Tenant \(tenant\)/ })).toBeAttached({ timeout: 15_000 })
  await expectNoErrors(page, errors)

  // Then file it against an existing account.
  await page.getByLabel('Account', { exact: true }).selectOption({ label: 'Prism Analytics' })
  await page.getByRole('button', { name: /^File \d+ record|^File it$/ }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 30_000 })
  await expectNoErrors(page, errors)

  // ── Stage 2c: Add details is reachable and real ──
  await page.getByRole('link', { name: 'Portfolio' }).click()
  await page.getByRole('tab', { name: 'Add details' }).click()
  await expect(page.getByRole('heading', { name: 'Add details' })).toBeVisible()
  await expectNoErrors(page, errors)

  // ── Stage 3: the nav is Home · Portfolio · Approvals · Standups ·
  // Audit Log · Settings. No collapsed Admin group — configuration lives
  // in Settings, where an admin looks for it.
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible()
  for (const section of ['Users & roles', 'People', 'Feature flags', 'Ingest tokens', 'Sync status']) {
    await expect(page.getByRole('link', { name: section })).toBeVisible()
  }
  await expectNoErrors(page, errors)

  // ── Stage 2d: the fixture-backed pages are gone from the internal app ──
  // Old links redirect rather than 404, and global search now finds real
  // accounts instead of fictional ones.
  await page.goto('/overview')
  await expect(page).toHaveURL(/\/portfolio/)
  await page.goto('/cloud-customers')
  await expect(page).toHaveURL(/\/portfolio/)
  await expectNoErrors(page, errors)

  if (accountName) {
    await page.getByRole('combobox').first().fill(accountName.slice(0, 5))
    await expect(page.getByRole('listbox')).toBeVisible()
    await expect(page.getByRole('listbox').getByText(accountName, { exact: false }).first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expectNoErrors(page, errors)
  }

  // ── Audit log (top-level in the nav since Stage 3) ──
  await page.getByRole('link', { name: 'Audit Log' }).click()
  await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible()
  await expectNoErrors(page, errors)

  // ── Ingest tokens (7.4): create one, see the plaintext once, revoke it ──
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Ingest tokens' }).click()
  // exact: true — on a truly fresh DB (no tokens yet) the EmptyState's "No
  // ingest tokens" heading substring-matches "Ingest tokens" too, a latent
  // ambiguity this session's genuinely-empty-first-run exposed.
  await expect(page.getByRole('heading', { name: 'Ingest tokens', exact: true })).toBeVisible()
  await expectNoErrors(page, errors)

  await page.getByRole('button', { name: 'Create token' }).click()
  await page.getByPlaceholder('CS Sync Skill — daily job').fill('Smoke test token')
  await page.getByRole('button', { name: 'Create token' }).last().click()

  await expect(page.getByRole('heading', { name: 'Token created' })).toBeVisible()
  const tokenValue = (await page.locator('code').textContent())?.trim()
  expect(tokenValue).toMatch(/^cshub_/)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Smoke test token')).toBeVisible()
  await expectNoErrors(page, errors)

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('row', { name: /Smoke test token/ }).getByRole('button', { name: 'Revoke token' }).click()
  await expect(page.getByRole('row', { name: /Smoke test token/ }).getByText('Revoked')).toBeVisible()
  await expectNoErrors(page, errors)

  // ── Standups: start one, edit own entry, open live mode ─────────────
  await page.getByRole('link', { name: 'Standups' }).click()
  // exact: true — a genuinely empty standups list renders an EmptyState
  // whose "No standups yet" heading substring-matches "Standups" too.
  await expect(page.getByRole('heading', { name: 'Standups', exact: true })).toBeVisible()
  await expectNoErrors(page, errors)

  await page.getByRole('button', { name: 'Start a standup' }).click()
  await page.getByRole('combobox').first().selectOption({ index: 1 }) // "Add a person…"
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Start standup' }).click()

  await expect(page.getByRole('heading', { name: /Standup —/ })).toBeVisible()
  await expectNoErrors(page, errors)

  const todayField = page.locator('textarea').nth(1) // Yesterday/Today/Blockers order, first card
  await todayField.fill('Smoke test today entry')
  await page.getByRole('button', { name: 'Save' }).first().click()
  await page.waitForTimeout(500)
  await expectNoErrors(page, errors)

  await page.getByRole('button', { name: 'Live mode' }).click()
  await expect(page.getByText(/Participant 1 of/)).toBeVisible()
  await expectNoErrors(page, errors)

  // ── People: open a person's detail slide-over ───────────────────────
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'People' }).click()
  // exact: true — PeoplePage's EmptyState "No people yet" heading would
  // otherwise substring-match "People" too.
  await expect(page.getByRole('heading', { name: 'People', exact: true })).toBeVisible()
  await expectNoErrors(page, errors)

  await page.getByRole('button', { name: 'Manage roles' }).first().click()
  await expect(page.getByText('Recent activity')).toBeVisible()
  await expectNoErrors(page, errors)
  // The slide-over (a Radix Sheet) marks the rest of the page aria-hidden
  // while open — leaving it open made the sidebar's nav links unreachable
  // for the next step. Close it before navigating anywhere else.
  await page.keyboard.press('Escape')
  await expect(page.getByText('Recent activity')).not.toBeVisible()

  // ── Sync Status (7.5-pre2 Session 5): the scoped Refresh above already
  // produced at least one sync_runs row. Sync status lives under
  // Settings since Stage 3.
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Sync status' }).click()
  await expect(page.getByRole('heading', { name: 'Sync status' })).toBeVisible()
  await expect(page.getByText('No sync runs yet')).not.toBeVisible()
  await expectNoErrors(page, errors)

  // One sync button (the sweep-only trigger was removed — a full sync
  // already includes the sweep). Stub mode, so it never reaches Refold or
  // OpenRouter. Draining every queued unit takes a little while even with
  // stubs, hence the generous timeout.
  await expect(page.getByLabel('Look back (days)')).toHaveValue('7')

  // 7.5-pre2 Session 7 — the probe budget and the empty-account table. The
  // stub fixture always returns a record, so every account finds something
  // and the table stays in its "nothing to report" state; what matters here
  // is that both render and the page stays error-free.
  await expect(page.getByLabel('Probe tokens / unit')).toHaveValue('25000')
  await expect(page.getByRole('heading', { name: 'Accounts not producing data' })).toBeVisible()

  await page.getByRole('button', { name: 'Run sync now' }).click()
  await expect(page.getByRole('button', { name: 'Syncing…' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run sync now' })).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('Every account has found something on its most recent scan.')).toBeVisible()
  await expectNoErrors(page, errors)
})
