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

  const firstAccountLink = page.locator('table a[href^="/accounts/"]').first()
  await expect(firstAccountLink).toBeVisible()
  const accountName = (await firstAccountLink.textContent())?.trim()
  await firstAccountLink.click()
  if (accountName) await expect(page.getByRole('heading', { name: accountName })).toBeVisible()
  await expectNoErrors(page, errors)

  for (const tabName of ['Overview', 'Projects', 'Escalations', 'Tickets', 'Engagements', 'Action items', 'Metrics']) {
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

  // ── Account match needed (7.5-pre2 Session 2): resolve each of the 4 ways ──
  // Fixtures (seed_account_resolutions.sql) render oldest-first: map_existing,
  // map_tenant, create_account, ignore — resolving the first repeatedly walks
  // through all four in that fixed order as each row disappears in turn.
  await expect(page.getByRole('heading', { name: 'Account match needed (4)' })).toBeVisible()

  // 1. map_existing
  await page.getByRole('button', { name: 'Resolve' }).first().click()
  await page.getByRole('dialog').getByRole('combobox').first().selectOption({ label: 'Prism Analytics' })
  await page.getByRole('button', { name: 'Resolve', exact: true }).last().click()
  await expect(page.getByText('Account match needed (3)')).toBeVisible()
  await expectNoErrors(page, errors)

  // 2. map_tenant
  await page.getByRole('button', { name: 'Resolve' }).first().click()
  await page.getByRole('button', { name: 'Map as tenant of…' }).click()
  await page.getByRole('dialog').getByRole('combobox').first().selectOption({ label: 'Meridian Laboratories' })
  await page.getByPlaceholder('smoke-map-tenant').fill('Smoke Test Tenant')
  await page.getByRole('button', { name: 'Resolve', exact: true }).last().click()
  await expect(page.getByText('Account match needed (2)')).toBeVisible()
  await expectNoErrors(page, errors)

  // 3. create_account
  await page.getByRole('button', { name: 'Resolve' }).first().click()
  await page.getByRole('button', { name: 'Create new account' }).click()
  await page.getByRole('button', { name: 'Resolve', exact: true }).last().click()
  await expect(page.getByText('Account match needed (1)')).toBeVisible()
  await expectNoErrors(page, errors)

  // 4. ignore
  await page.getByRole('button', { name: 'Resolve' }).first().click()
  await page.getByRole('button', { name: 'Ignore — not a customer' }).click()
  await page.getByRole('button', { name: 'Resolve', exact: true }).last().click()
  await expect(page.getByText('Account match needed')).not.toBeVisible()
  await expectNoErrors(page, errors)

  // ── Audit log (inside the collapsed-by-default "Admin" disclosure) ──
  await page.getByRole('button', { name: 'Admin' }).click()
  await page.getByRole('link', { name: 'Audit Log' }).click()
  await expect(page.getByRole('heading', { name: 'Audit Log' })).toBeVisible()
  await expectNoErrors(page, errors)

  // ── Ingest tokens (7.4): create one, see the plaintext once, revoke it ──
  await page.getByRole('link', { name: 'Ingest Tokens' }).click()
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
  // produced at least one sync_runs row. The "Admin" disclosure is a
  // toggle, not idempotent — it's already open from the Audit Log step
  // earlier and stays open (Sidebar persists across navigation), so it
  // must NOT be clicked again here or it would close.
  await page.getByRole('link', { name: 'Sync Status' }).click()
  await expect(page.getByRole('heading', { name: 'Sync status' })).toBeVisible()
  await expect(page.getByText('No sync runs yet')).not.toBeVisible()
  await expectNoErrors(page, errors)

  // One sync button (the sweep-only trigger was removed — a full sync
  // already includes the sweep). Stub mode, so it never reaches Refold or
  // OpenRouter. Draining every queued unit takes a little while even with
  // stubs, hence the generous timeout.
  await expect(page.getByLabel('Look back (days)')).toHaveValue('7')
  await page.getByRole('button', { name: 'Run sync now' }).click()
  await expect(page.getByRole('button', { name: 'Syncing…' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run sync now' })).toBeVisible({ timeout: 120_000 })
  await expectNoErrors(page, errors)
})
